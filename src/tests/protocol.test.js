import { describe, it, expect } from 'vitest';
import { msg, parse, parseSnapshot } from '../sim/protocol.js';

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
