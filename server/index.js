import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { Sim } from '../src/sim/Sim.js';
import { msg, parse } from '../src/sim/protocol.js';
import {
  msgWelcome, msgMapSelected, msgKick, msgError,
} from '../src/sim/protocol.js';
import { loadConfig } from './config.js';
import { sanitizeName, dedupeName, clampInput, validateMessage } from './validation.js';
import { RateLimiter, ConnectionCap } from './rateLimiter.js';
import { ReconnectRegistry } from './reconnect.js';
import { MAPS } from '../src/world/Maps.js';

const MAP_IDS = new Set(MAPS.map(m => m.id));

const HANDSHAKE_TIMEOUT_MS = 5000;
const INPUT_RATE_LIMIT_PER_SEC = 70;
const TICK_HZ = 60;

// Create a Room bound to a parsed config. Exposed for in-process testing; main()
// runs the real WebSocketServer when executed directly.
export function createRoom(config) {
  const cfg = config || loadConfig({});
  const sim = new Sim({ maxPlayers: cfg.maxPlayers });
  const clients = new Map();      // ws -> { entry, ip, lastInputMs, inputCount }
  const reconnect = new ReconnectRegistry(60000);
  const connLimit = new ConnectionCap(cfg.maxPerIp);
  const authLimit = new RateLimiter(cfg.rateLimit);
  let lobbyMap = cfg.map;
  let tickCount = 0;

  function nowMs() { return Date.now(); }
  function ipOf(ws) { return (ws._socket && ws._socket.remoteAddress) || 'unknown'; }

  function broadcast(messageStr) { for (const c of clients.keys()) { try { c.send(messageStr); } catch {} } }

  function activeNames() {
    const names = [];
    for (const e of clients.values()) if (e.entry && e.entry.player) names.push(e.entry.player.name);
    // include bot names so dedupe avoids "Bot 1" collisions too
    for (const b of sim.bots) names.push(b.name);
    return names;
  }

  function roster() {
    const humans = [];
    for (const e of clients.values()) {
      if (e.entry && e.entry.player) {
        humans.push({
          id: e.entry.player.id, name: e.entry.player.name,
          animal: e.entry.player.animalId, weapon: e.entry.player.loadout.primary,
          isBot: false,
        });
      }
    }
    const bots = sim.bots.map(b => ({
      id: b.id, name: b.name, animal: b.animalId, weapon: b.loadout.primary, isBot: true,
    }));
    return [...humans, ...bots];
  }

  // --- connection lifecycle ---

  function addClient(ws) {
    const ip = ipOf(ws);
    if (!connLimit.canAcquire(ip)) {
      ws.send(msgKick('too many connections'));
      ws.close();
      return false;
    }
    connLimit.acquire(ip);
    clients.set(ws, { entry: null, ip, lastInputMs: 0, inputCount: 0, handshakeTimer: null });
    // Force a handshake within the grace window.
    const rec = clients.get(ws);
    rec.handshakeTimer = setTimeout(() => {
      if (!rec.entry) { try { ws.send(msgKick('handshake timeout')); } catch {} ws.close(); }
    }, HANDSHAKE_TIMEOUT_MS);
    return true;
  }

  function welcomeClient(ws, entry) {
    const { token } = reconnect.mint(entry.player.id, entry.player.id, nowMs());
    ws.send(msgWelcome(entry.player.id, token, lobbyMap, roster()));
    entry.token = token;
  }

  function doAuth(ws, m) {
    const rec = clients.get(ws);
    if (!rec) return;
    const ip = rec.ip;
    if (!authLimit.try(ip, nowMs())) { ws.send(msgKick('rate limit')); ws.close(); return; }
    if (rec.entry) return; // already authed
    // Full check: mid-match uses free slots (humans + bots at maxPlayers);
    // pre-match caps humans at maxPlayers so the lobby can't overfill.
    const full = sim.match.active
      ? sim.freeSlots() <= 0
      : sim.humans.size >= cfg.maxPlayers;
    if (full) { ws.send(msgKick('Server full')); ws.close(); return; }
    const rawName = sanitizeName(m.name) || 'Player';
    const name = dedupeName(rawName, activeNames());
    const animal = m.animal || 'FOX';
    const weapon = m.weapon || 'AR';
    let player;
    if (sim.match.active) {
      // Late join: take over a bot slot.
      player = sim.takeOverBot(name, animal, weapon);
    } else {
      player = sim.addHuman(name, animal, weapon);
    }
    const entry = { player, token: null };
    rec.entry = entry;
    if (rec.handshakeTimer) { clearTimeout(rec.handshakeTimer); rec.handshakeTimer = null; }
    welcomeClient(ws, entry);
    broadcast(msg('roster', { roster: roster() }));
  }

  function doReconnect(ws, m) {
    const rec = clients.get(ws);
    if (!rec || rec.entry) return;
    const res = reconnect.verify(m.id, m.token, nowMs());
    if (!res.ok) { ws.send(msgError('bad_reconnect', 'invalid or expired')); return; }
    const entity = sim.players.find(p => p.id === res.entityId);
    if (!entity) { ws.send(msgError('bad_reconnect', 'entity gone')); return; }
    // Flip the entity (currently bot-controlled) back to human.
    sim.bots = sim.bots.filter(b => b !== entity);
    sim.humans.set(entity.id, entity);
    rec.entry = { player: entity, token: m.token };
    if (rec.handshakeTimer) { clearTimeout(rec.handshakeTimer); rec.handshakeTimer = null; }
    ws.send(msgWelcome(entity.id, m.token, lobbyMap, roster()));
    broadcast(msg('roster', { roster: roster() }));
    if (sim.match.active) {
      ws.send(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    }
    reconnect.drop(m.id); // consume the one-time token
  }

  function handleMessage(ws, raw) {
    const rec = clients.get(ws); if (!rec) return;
    const m = parse(raw);
    const v = validateMessage(m);
    if (!v.ok) { ws.send(msgError(v.code, 'malformed message')); return; }

    // Pre-auth: only auth/reconnect allowed.
    if (!rec.entry) {
      if (m.t === 'auth') return doAuth(ws, m);
      if (m.t === 'reconnect') return doReconnect(ws, m);
      return; // ignore everything else until authed
    }
    const player = rec.entry.player;

    if (m.t === 'loadout') {
      player.animalId = m.animal; player.loadout.primary = m.weapon;
      broadcast(msg('roster', { roster: roster() }));
    } else if (m.t === 'selectMap') {
      if (sim.match.active) { ws.send(msgError('match_in_progress', 'cannot change map now')); return; }
      lobbyMap = m.map;
      broadcast(msgMapSelected(lobbyMap));
    } else if (m.t === 'start') {
      if (sim.match.active) { ws.send(msgError('match_in_progress', 'match already running')); return; }
      const mapId = m.map || lobbyMap;
      sim.startMatch(mapId, cfg.fragTarget, cfg.matchSeconds);
      broadcast(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    } else if (m.t === 'input') {
      if (!sim.match.active) return;
      // Rate-limit inputs (~70/s ceiling over a 1s sliding window).
      const t = nowMs();
      rec.inputCount = (t - rec.lastInputMs < 1000) ? rec.inputCount + 1 : 1;
      rec.lastInputMs = t;
      if (rec.inputCount > INPUT_RATE_LIMIT_PER_SEC) return; // drop flood
      const c = clampInput(m);
      sim.setPlayerIntent(player.id, {
        forward: c.f, strafe: c.s, jump: c.j, sprint: c.sp, crouch: c.c,
        firing: c.fire, reloadRequested: c.reload, yaw: c.yaw, pitch: c.pitch,
      });
    }
  }

  function handleDisconnect(ws) {
    const rec = clients.get(ws); if (!rec) return;
    const ip = rec.ip;
    connLimit.release(ip);
    if (rec.handshakeTimer) clearTimeout(rec.handshakeTimer);
    if (rec.entry && rec.entry.player) {
      const pid = rec.entry.player.id;
      reconnect.refresh(pid, pid, nowMs()); // extend grace from disconnect; keep the welcome token
      sim.handleDisconnect(pid);         // immediately convert to bot (match stays full)
      broadcast(msg('roster', { roster: roster() }));
    }
    clients.delete(ws);
  }

  // operator: start a match from stdin/auto-start
  function operatorStart(mapId) {
    if (sim.match.active) return false;
    const id = mapId || lobbyMap;
    if (!MAP_IDS.has(id)) return false;
    sim.startMatch(id, cfg.fragTarget, cfg.matchSeconds);
    broadcast(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    return true;
  }
  function humanCount() {
    let n = 0; for (const e of clients.values()) if (e.entry && e.entry.player) n++; return n;
  }
  function setLobbyMap(id) { if (!MAP_IDS.has(id)) return false; lobbyMap = id; broadcast(msgMapSelected(lobbyMap)); return true; }

  // Advance the sim one tick; broadcast a snapshot every 3rd tick (~20Hz).
  function step(dt) {
    if (!sim.match.active) return;
    sim.tick(dt);
    tickCount++;
    if (tickCount % 3 === 0) broadcast(msg('snapshot', sim.snapshot()));
    if (sim.match.over && !sim.match.active) {
      broadcast(msg('matchEnd', { ranked: sim.ranked() }));
      sim.match.over = false;
      lobbyMap = cfg.map; // reset lobby map to default after a match
    }
  }

  return {
    sim, cfg, reconnect,
    addClient, handleMessage, handleDisconnect, step,
    operatorStart, humanCount, setLobbyMap,
    roster, get lobbyMap() { return lobbyMap; },
  };
}

export function main() {
  // Read server/config.json from disk if it exists (resolved relative to this
  // module via import.meta.url so cwd doesn't matter). Documented in README.
  let fileConfig = null;
  try {
    fileConfig = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('Could not parse server/config.json:', e.message);
  }
  const config = loadConfig({ file: fileConfig });
  const wss = new WebSocketServer({ host: config.host, port: config.port });
  // Handle bind failures (port in use / permission denied) with a clear message
  // instead of an unhandled 'error' event + stack trace.
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Stop the other process, or choose a different port (AS_PORT / --port).`);
    } else if (err.code === 'EACCES') {
      console.error(`Permission denied binding ${config.host}:${config.port}. Ports <1024 need root; try a higher port (AS_PORT / --port).`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });
  const room = createRoom(config);
  let last = Date.now();
  const tickMs = 1000 / TICK_HZ;
  const tickInterval = setInterval(() => {
    const t = Date.now();
    let dt = (t - last) / 1000; last = t;
    if (dt > 0.1) dt = 0.1;
    room.step(dt);
    // auto-start once enough humans are connected
    if (config.autoStart && !room.sim.match.active && room.humanCount() >= config.minPlayers) {
      room.operatorStart();
    }
  }, tickMs);

  // Periodic GC of expired reconnect tokens + rate-limit buckets.
  setInterval(() => {
    room.reconnect.sweep(Date.now());
  }, 30000);

  // Operator stdin commands.
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    const line = chunk.trim();
    if (!line) return;
    const [cmd, ...rest] = line.split(/\s+/);
    if (cmd === 'start') {
      const ok = room.operatorStart(rest[0]);
      console.log(ok ? `match started` : (rest[0] && !MAP_IDS.has(rest[0]) ? `unknown map: ${rest[0]}` : `match already running`));
    } else if (cmd === 'map') {
      const ok = room.setLobbyMap(rest[0]);
      console.log(ok ? `lobby map set to ${rest[0]}` : `unknown map: ${rest[0]}`);
    } else if (cmd === 'status') {
      console.log(`match.active=${room.sim.match.active} humans=${room.humanCount()} lobby=${room.lobbyMap}`);
    } else if (cmd === 'stop') {
      clearInterval(tickInterval); wss.close(); process.exit(0);
    } else {
      console.log(`commands: start [map] | map <id> | status | stop`);
    }
  });

  wss.on('connection', (ws) => {
    if (!room.addClient(ws)) return;
    ws.on('message', (data) => room.handleMessage(ws, data.toString()));
    ws.on('close', () => room.handleDisconnect(ws));
    ws.on('error', () => room.handleDisconnect(ws));
  });

  const display = config.host === '0.0.0.0' ? '<this-machine-ip>' : config.host;
  console.log(`AnimalStrike dedicated server listening on ws://${config.host}:${config.port}`);
  console.log(`Players connect to: ws://<your-ip>:${config.port}  (LAN/public: ${display})`);
  console.log(`Config: maxPlayers=${config.maxPlayers} map=${config.map} fragTarget=${config.fragTarget} matchSeconds=${config.matchSeconds} autoStart=${config.autoStart}`);
}

// Run main only when executed directly (`node server/index.js`), not when imported.
const isDirect = process.argv[1] && process.argv[1].endsWith('server/index.js');
if (isDirect) main();
