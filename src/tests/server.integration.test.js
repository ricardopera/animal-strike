import { describe, it, expect } from 'vitest';
import { createRoom } from '../../server/index.js';

describe('server room (loopback integration)', () => {
  it('createRoom() builds a room with a sim and client handlers', () => {
    const room = createRoom();
    expect(room.sim).toBeDefined();
    expect(typeof room.addClient).toBe('function');
    expect(typeof room.handleMessage).toBe('function');
    expect(typeof room.step).toBe('function');
  });

  it('a hello message adds a human to the sim and welcomes them', () => {
    const room = createRoom();
    const sent = [];
    const fakeClient = { send: (m) => sent.push(JSON.parse(m)) };
    room.addClient(fakeClient);
    room.handleMessage(fakeClient, JSON.stringify({ t: 'hello', name: 'Rico', animal: 'FOX', weapon: 'AR' }));
    const welcome = sent.find(m => m.t === 'welcome');
    expect(welcome).toBeDefined();
    expect(welcome.you).toBeDefined();
    expect(welcome.isHost).toBe(true);  // first client is the host
    expect(room.sim.humans.size).toBe(1);
  });

  it('host start triggers matchStart and the sim runs + broadcasts snapshots', () => {
    const room = createRoom();
    const sent = [];
    const host = { send: (m) => sent.push(JSON.parse(m)) };
    room.addClient(host);
    room.handleMessage(host, JSON.stringify({ t: 'hello', name: 'Host', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(host, JSON.stringify({ t: 'start', map: 'plaza', fragTarget: 25, seconds: 300 }));
    expect(sent.find(m => m.t === 'matchStart')).toBeDefined();
    expect(room.sim.match.active).toBe(true);
    // run 3 ticks — a snapshot should broadcast on the 3rd
    room.step(1 / 60); room.step(1 / 60); room.step(1 / 60);
    expect(sent.find(m => m.t === 'snapshot')).toBeDefined();
  });

  it('an input message sets the player intent in the sim', () => {
    const room = createRoom();
    const sent = [];
    const client = { send: (m) => sent.push(JSON.parse(m)) };
    room.addClient(client);
    room.handleMessage(client, JSON.stringify({ t: 'hello', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const playerId = sent[0].you;
    room.handleMessage(client, JSON.stringify({ t: 'start', map: 'plaza', fragTarget: 25, seconds: 300 }));
    room.handleMessage(client, JSON.stringify({ t: 'input', seq: 1, f: 1, s: 0, j: false, sp: true, c: false, fire: false, reload: false, yaw: 0, pitch: 0 }));
    const intent = room.sim._intents.get(playerId);
    expect(intent).toBeDefined();
    expect(intent.forward).toBe(1);
  });

  it('disconnect converts the human slot to a bot', () => {
    const room = createRoom();
    const sent = [];
    const client = { send: (m) => sent.push(JSON.parse(m)) };
    room.addClient(client);
    room.handleMessage(client, JSON.stringify({ t: 'hello', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const playerId = sent[0].you;
    expect(room.sim.humans.size).toBe(1);
    room.handleDisconnect(client);
    expect(room.sim.humans.size).toBe(0);
    expect(room.sim.bots.some(b => b.id === playerId)).toBe(true);
  });
});
