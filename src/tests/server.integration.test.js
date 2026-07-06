import { describe, it, expect } from 'vitest';
import { createRoom } from '../../server/index.js';
import { loadConfig } from '../../server/config.js';

// A fake socket that records sent messages and supports .close().
function fakeSocket(ip = '1.1.1.1') {
  const sent = [];
  const ws = {
    _socket: { remoteAddress: ip },
    send: (m) => sent.push(JSON.parse(m)),
    close: () => { ws._closed = true; },
    _closed: false,
  };
  ws._sent = sent;
  return ws;
}

const cfg = () => loadConfig({ argv: [], env: {} });

describe('dedicated server room (integration)', () => {
  it('createRoom() builds a room wired to a sim', () => {
    const room = createRoom(cfg());
    expect(room.sim).toBeDefined();
    expect(typeof room.addClient).toBe('function');
    expect(typeof room.handleMessage).toBe('function');
    expect(typeof room.step).toBe('function');
    expect(room.lobbyMap).toBe('plaza');
  });

  it('auth adds a human, sends welcome with token+map+roster, broadcasts roster', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' }));
    const welcome = ws._sent.find(m => m.t === 'welcome');
    expect(welcome).toBeDefined();
    expect(welcome.you).toBeDefined();
    expect(welcome.token).toBeTruthy();
    expect(welcome.map).toBe('plaza');
    expect(welcome.roster.some(r => r.name === 'Rico' && !r.isBot)).toBe(true);
    expect(room.sim.humans.size).toBe(1);
  });

  it('any player can start the match (no host concept); matchStart broadcasts', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start', map: 'plaza' }));
    expect(ws._sent.some(m => m.t === 'matchStart')).toBe(true);
    expect(room.sim.match.active).toBe(true);
    room.step(1 / 60); room.step(1 / 60); room.step(1 / 60);
    expect(ws._sent.some(m => m.t === 'snapshot')).toBe(true);
  });

  it('input message is clamped and sets the player intent', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const playerId = ws._sent[0].you;
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    // forward=999 should be clamped to 1
    room.handleMessage(ws, JSON.stringify({ t: 'input', seq: 1, f: 999, s: 0, j: false, sp: false, c: false, fire: false, reload: false, yaw: 0, pitch: 0 }));
    const intent = room.sim._intents.get(playerId);
    expect(intent).toBeDefined();
    expect(intent.forward).toBe(1);
  });

  it('selectMap in the lobby changes the lobby map and broadcasts mapSelected', () => {
    const room = createRoom(cfg());
    const a = fakeSocket(); const b = fakeSocket('2.2.2.2');
    room.addClient(a); room.addClient(b);
    room.handleMessage(a, JSON.stringify({ t: 'auth', name: 'A', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(b, JSON.stringify({ t: 'auth', name: 'B', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(a, JSON.stringify({ t: 'selectMap', map: 'foundry' }));
    expect(room.lobbyMap).toBe('foundry');
    expect(b._sent.some(m => m.t === 'mapSelected' && m.map === 'foundry')).toBe(true);
  });

  it('selectMap during a match is rejected with an error', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    room.handleMessage(ws, JSON.stringify({ t: 'selectMap', map: 'dustbowl' }));
    expect(ws._sent.some(m => m.t === 'error' && m.code === 'match_in_progress')).toBe(true);
    expect(room.lobbyMap).toBe('plaza');
  });

  it('a late-joining human takes over a bot slot (match stays full)', () => {
    const room = createRoom(cfg());
    const host = fakeSocket();
    room.addClient(host);
    room.handleMessage(host, JSON.stringify({ t: 'auth', name: 'Host', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(host, JSON.stringify({ t: 'start' }));
    const playersBefore = room.sim.players.length;
    const botsBefore = room.sim.bots.length;
    const humansBefore = room.sim.humans.size;
    // a second client joins mid-match
    const joiner = fakeSocket('3.3.3.3');
    room.addClient(joiner);
    room.handleMessage(joiner, JSON.stringify({ t: 'auth', name: 'Late', animal: 'WOLF', weapon: 'AR' }));
    expect(room.sim.players.length).toBe(playersBefore);  // still full
    expect(room.sim.bots.length).toBe(botsBefore - 1);    // one bot replaced
    expect(room.sim.humans.size).toBe(humansBefore + 1);
  });

  it('a full match rejects a further late join with kick "Server full"', () => {
    const room = createRoom(cfg());
    // Fill every slot with humans.
    const ips = ['1.1.1.1','2.2.2.2','3.3.3.3','4.4.4.4','5.5.5.5','6.6.6.6'];
    const clients = ips.map(ip => { const ws = fakeSocket(ip); room.addClient(ws); return ws; });
    for (const ws of clients) room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(clients[0], JSON.stringify({ t: 'start' }));
    // 7th client (different IP) should be kicked — all 6 slots are human.
    const extra = fakeSocket('7.7.7.7');
    room.addClient(extra);
    room.handleMessage(extra, JSON.stringify({ t: 'auth', name: 'Extra', animal: 'FOX', weapon: 'AR' }));
    expect(extra._sent.some(m => m.t === 'kick' && /full/i.test(m.reason))).toBe(true);
  });

  it('disconnect immediately converts the human to a bot (match never short)', () => {
    const room = createRoom(cfg());
    const a = fakeSocket(); const b = fakeSocket('9.9.9.9');
    room.addClient(a); room.addClient(b);
    room.handleMessage(a, JSON.stringify({ t: 'auth', name: 'A', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(b, JSON.stringify({ t: 'auth', name: 'B', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(a, JSON.stringify({ t: 'start' }));
    const playersBefore = room.sim.players.length;
    const aId = a._sent[0].you;
    room.handleDisconnect(a);
    expect(room.sim.humans.has(aId)).toBe(false);
    expect(room.sim.players.length).toBe(playersBefore); // still full (a became a bot)
  });

  it('reconnect within grace flips the bot back to human (score retained)', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    const welcome = ws._sent.find(m => m.t === 'welcome');
    const id = welcome.you, token = welcome.token;
    const entity = room.sim.humans.get(id);
    entity.score = 7;
    // disconnect -> becomes a bot
    room.handleDisconnect(ws);
    expect(room.sim.bots.includes(entity)).toBe(true);
    expect(room.sim.humans.has(id)).toBe(false);
    // reconnect within grace
    const ws2 = fakeSocket('1.1.1.1');
    room.addClient(ws2);
    room.handleMessage(ws2, JSON.stringify({ t: 'reconnect', id, token }));
    expect(room.sim.humans.has(id)).toBe(true);
    expect(room.sim.bots.includes(entity)).toBe(false);
    expect(entity.score).toBe(7); // retained
  });

  it('reconnect with a bad token is rejected with bad_reconnect', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const id = ws._sent[0].you;
    room.handleDisconnect(ws);
    const ws2 = fakeSocket('1.1.1.1');
    room.addClient(ws2);
    room.handleMessage(ws2, JSON.stringify({ t: 'reconnect', id, token: 'bogus' }));
    expect(ws2._sent.some(m => m.t === 'error' && m.code === 'bad_reconnect')).toBe(true);
  });

  it('anti-cheat: fire=true faster than fire rate produces no extra shots', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    // Send 200 fire=true inputs in the same tick window; the server's weapon
    // (WeaponController) enforces nextFireTime so only a handful actually fire.
    let shots = 0;
    for (let i = 0; i < 200; i++) {
      room.handleMessage(ws, JSON.stringify({ t: 'input', seq: i, f: 0, s: 0, j: false, sp: false, c: false, fire: true, reload: false, yaw: 0, pitch: 0 }));
    }
    const before = room.sim.events.filter(e => e.k === 'shot').length;
    room.step(1 / 60);
    const after = room.sim.events.filter(e => e.k === 'shot').length;
    expect(after - before).toBeLessThan(20); // not 200 — server rate-limits firing
  });

  it('unknown message type is rejected with error and connection stays open', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'teleport', x: 999 }));
    expect(ws._sent.some(m => m.t === 'error' && m.code === 'unknown_type')).toBe(true);
    // still authed — connection survived
    expect(room.sim.humans.size).toBe(1);
  });

  it('rejects a lobby join when maxPlayers humans are already connected (pre-match cap)', () => {
    const room = createRoom(loadConfig({ argv: ['--max-players', '2'], env: {} }));
    const a = fakeSocket('1.1.1.1'); const b = fakeSocket('2.2.2.2'); const c = fakeSocket('3.3.3.3');
    room.addClient(a); room.addClient(b); room.addClient(c);
    room.handleMessage(a, JSON.stringify({ t: 'auth', name: 'A', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(b, JSON.stringify({ t: 'auth', name: 'B', animal: 'FOX', weapon: 'AR' }));
    // lobby now has 2 humans (== maxPlayers); third should be kicked
    room.handleMessage(c, JSON.stringify({ t: 'auth', name: 'C', animal: 'FOX', weapon: 'AR' }));
    expect(c._sent.some(m => m.t === 'kick' && /full/i.test(m.reason))).toBe(true);
  });

  it('auth with an invalid weapon id is rejected with an error (no welcome)', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'X', animal: 'FOX', weapon: 'NUKE' }));
    expect(ws._sent.some(m => m.t === 'error')).toBe(true);
    expect(ws._sent.some(m => m.t === 'welcome')).toBe(false);
  });
});
