import { describe, it, expect } from 'vitest';
import { msg, parse, parseSnapshot, msgAuth, msgReconnect, msgSelectMap, msgWelcome, msgMapSelected, msgKick, msgError } from '../sim/protocol.js';

describe('protocol', () => {
  it('msg() builds a tagged JSON message', () => {
    expect(JSON.parse(msg('hello', { name: 'R' }))).toEqual({ t: 'hello', name: 'R' });
  });
  it('parse() parses valid JSON, returns null on garbage', () => {
    expect(parse('{"t":"x"}')).toEqual({ t: 'x' });
    expect(parse('not json')).toBeNull();
  });
  it('parseSnapshot() returns the snapshot object, null otherwise', () => {
    const snap = { tick: 5, players: [], events: [] };
    expect(parseSnapshot(JSON.stringify({ t: 'snapshot', ...snap }))).toMatchObject(snap);
    expect(parseSnapshot(JSON.stringify({ t: 'welcome' }))).toBeNull();
  });
});

describe('protocol new message builders', () => {
  it('msgAuth builds a join handshake', () => {
    expect(JSON.parse(msgAuth('Rico', 'FOX', 'AR'))).toEqual({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' });
  });
  it('msgReconnect builds a reclaim message', () => {
    expect(JSON.parse(msgReconnect('H2', 'tok'))).toEqual({ t: 'reconnect', id: 'H2', token: 'tok' });
  });
  it('msgSelectMap builds a map-select message', () => {
    expect(JSON.parse(msgSelectMap('plaza'))).toEqual({ t: 'selectMap', map: 'plaza' });
  });
  it('msgWelcome includes id, token, map, roster', () => {
    const m = JSON.parse(msgWelcome('H2', 'tok', 'plaza', [{ id: 'H2', name: 'Rico' }]));
    expect(m).toMatchObject({ t: 'welcome', you: 'H2', token: 'tok', map: 'plaza' });
    expect(m.roster).toHaveLength(1);
  });
  it('msgMapSelected broadcasts the lobby map', () => {
    expect(JSON.parse(msgMapSelected('foundry'))).toEqual({ t: 'mapSelected', map: 'foundry' });
  });
  it('msgKick + msgError build the right shapes', () => {
    expect(JSON.parse(msgKick('Server full'))).toEqual({ t: 'kick', reason: 'Server full' });
    expect(JSON.parse(msgError('bad_shape', 'malformed'))).toEqual({ t: 'error', code: 'bad_shape', msg: 'malformed' });
  });
});
