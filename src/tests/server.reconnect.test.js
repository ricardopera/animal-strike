import { describe, it, expect } from 'vitest';
import { ReconnectRegistry } from '../../server/reconnect.js';

describe('ReconnectRegistry', () => {
  it('mint returns a token; verify accepts it within grace', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H1', 'entity-7', 1000);
    expect(token).toBeTruthy();
    expect(r.verify('H1', token, 5000)).toEqual({ ok: true, entityId: 'entity-7' });
  });

  it('rejects a wrong token', () => {
    const r = new ReconnectRegistry(60000);
    r.mint('H1', 'e1', 0);
    expect(r.verify('H1', 'wrong', 100)).toEqual({ ok: false });
  });

  it('rejects an unknown id', () => {
    const r = new ReconnectRegistry(60000);
    expect(r.verify('ghost', 'any', 0)).toEqual({ ok: false });
  });

  it('expires entries after the grace window', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H2', 'e2', 0);
    expect(r.verify('H2', token, 59999).ok).toBe(true);
    expect(r.verify('H2', token, 70000).ok).toBe(false);
  });

  it('dropping an id removes its token', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H3', 'e3', 0);
    r.drop('H3');
    expect(r.verify('H3', token, 100).ok).toBe(false);
  });

  it('sweep removes expired entries', () => {
    const r = new ReconnectRegistry(1000);
    r.mint('a', 'ea', 0);
    r.mint('b', 'eb', 0);
    r.sweep(2000); // both expired
    expect(r.verify('a', 'anything', 2000).ok).toBe(false);
    expect(r.size).toBe(0);
  });

  it('re-minting an id replaces its token', () => {
    const r = new ReconnectRegistry(60000);
    const a = r.mint('H4', 'e4', 0).token;
    const b = r.mint('H4', 'e4', 10).token;
    expect(a).not.toBe(b);
    expect(r.verify('H4', a, 20).ok).toBe(false); // old token invalid
    expect(r.verify('H4', b, 20).ok).toBe(true);
  });
});
