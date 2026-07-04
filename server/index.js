import { WebSocketServer } from 'ws';
import * as THREE from 'three';
import { Sim } from '../src/sim/Sim.js';
import { msg, parse } from '../src/sim/protocol.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const MAX_PLAYERS = 6;

// A room owns one authoritative Sim + the connected clients. The first client
// to join becomes the host (can start the match). `createRoom` is exported for
// in-process testing; `main()` runs the real WebSocketServer when executed directly.
export function createRoom() {
  const sim = new Sim();
  const clients = new Map();   // client obj -> { player, isHost, pendingKit }
  let tickCount = 0;

  function broadcast(messageStr) { for (const c of clients.keys()) c.send(messageStr); }

  function roster() {
    return [...clients.values()]
      .filter(e => e.player)
      .map(e => ({
        id: e.player.id, name: e.player.name, animal: e.player.animalId,
        weapon: e.player.loadout.primary, isHost: e.isHost,
      }));
  }

  function addClient(client) {
    clients.set(client, { player: null, isHost: clients.size === 0, pendingKit: null });
  }

  function handleMessage(client, raw) {
    const m = parse(raw); if (!m) return;
    const entry = clients.get(client); if (!entry) return;

    if (m.t === 'hello') {
      entry.pendingKit = { name: m.name || 'Player', animal: m.animal || 'FOX', weapon: m.weapon || 'AR' };
      // Don't add to the sim yet — assign on match start so startMatch spawns them.
      // But we need an id to welcome them, so add now if a match isn't running.
      if (!entry.player) {
        entry.player = sim.addHuman(entry.pendingKit.name, entry.pendingKit.animal, entry.pendingKit.weapon);
      }
      client.send(msg('welcome', { you: entry.player.id, isHost: entry.isHost, roster: roster() }));
      broadcast(msg('roster', { roster: roster() }));
    } else if (m.t === 'loadout' && entry.player) {
      entry.player.animalId = m.animal; entry.player.loadout.primary = m.weapon;
      broadcast(msg('roster', { roster: roster() }));
    } else if (m.t === 'input' && entry.player && sim.match.active) {
      sim.setPlayerIntent(entry.player.id, {
        forward: m.f, strafe: m.s, jump: m.j, sprint: m.sp, crouch: m.c,
        firing: m.fire, reloadRequested: m.reload, yaw: m.yaw, pitch: m.pitch,
      });
    } else if (m.t === 'start' && entry.isHost) {
      sim.startMatch(m.map || 'plaza', m.fragTarget || 25, m.seconds || 300);
      broadcast(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    }
  }

  function handleDisconnect(client) {
    const entry = clients.get(client); if (!entry) return;
    if (entry.player) sim.handleDisconnect(entry.player.id);
    clients.delete(client);
    // If the host left, promote the next client.
    if (entry.isHost) {
      const next = [...clients.values()][0];
      if (next) { next.isHost = true; broadcast(msg('roster', { roster: roster() })); }
    } else {
      broadcast(msg('roster', { roster: roster() }));
    }
  }

  // Advance the sim one tick; broadcast a snapshot every 3rd tick (~20Hz).
  function step(dt) {
    if (!sim.match.active) return;
    sim.tick(dt);
    tickCount++;
    if (tickCount % 3 === 0) {
      const snap = sim.snapshot();
      broadcast(msg('snapshot', snap));
    }
    // match ended during this tick?
    if (sim.match.over && !sim.match.active) {
      broadcast(msg('matchEnd', { ranked: sim.ranked() }));
      sim.match.over = false;  // reset flag so we don't rebroadcast
    }
  }

  return { sim, addClient, handleMessage, handleDisconnect, step, roster };
}

export function main() {
  const wss = new WebSocketServer({ port: PORT });
  const room = createRoom();
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    room.step(dt);
  }, 1000 / 60);
  wss.on('connection', (ws) => {
    room.addClient(ws);
    ws.on('message', (data) => room.handleMessage(ws, data.toString()));
    ws.on('close', () => room.handleDisconnect(ws));
  });
  console.log(`AnimalStrike host server listening on ws://0.0.0.0:${PORT}`);
  console.log(`Share this address with players: ws://<your-ip>:${PORT}`);
}

// Run main only when executed directly (`node server/index.js`), not when imported.
const isDirect = process.argv[1] && process.argv[1].endsWith('server/index.js');
if (isDirect) main();
