import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../server/config.js';

describe('loadConfig', () => {
  it('returns defaults when nothing is provided', () => {
    const c = loadConfig({});
    expect(c.host).toBe('0.0.0.0');
    expect(c.port).toBe(8080);
    expect(c.maxPlayers).toBe(6);
    expect(c.minPlayers).toBe(2);
    expect(c.map).toBe('plaza');
    expect(c.fragTarget).toBe(25);
    expect(c.matchSeconds).toBe(300);
    expect(c.autoStart).toBe(false);
    expect(c.password).toBe('');
    expect(c.rateLimit).toEqual({ perWindow: 5, windowMs: 10000 });
    expect(c.maxPerIp).toBe(4);
  });

  it('env vars override defaults', () => {
    const c = loadConfig({ env: { AS_PORT: '9000', AS_MAX_PLAYERS: '8', AS_HOST: '127.0.0.1', AS_MAP: 'foundry', AS_FRAG_TARGET: '50', AS_MATCH_SECONDS: '600', AS_AUTO_START: 'true', AS_MIN_PLAYERS: '3', AS_PASSWORD: 'sekret', AS_MAX_PER_IP: '10' } });
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(9000);
    expect(c.maxPlayers).toBe(8);
    expect(c.map).toBe('foundry');
    expect(c.fragTarget).toBe(50);
    expect(c.matchSeconds).toBe(600);
    expect(c.autoStart).toBe(true);
    expect(c.minPlayers).toBe(3);
    expect(c.password).toBe('sekret');
    expect(c.maxPerIp).toBe(10);
  });

  it('CLI flags override env', () => {
    const c = loadConfig({ env: { AS_PORT: '9000' }, argv: ['--port', '12345'] });
    expect(c.port).toBe(12345);
  });

  it('CLI flags accept --host, --port, --max-players, --min-players, --auto-start', () => {
    const c = loadConfig({ argv: ['--host', '1.2.3.4', '--port', '7000', '--max-players', '12', '--min-players', '4', '--auto-start'] });
    expect(c.host).toBe('1.2.3.4');
    expect(c.port).toBe(7000);
    expect(c.maxPlayers).toBe(12);
    expect(c.minPlayers).toBe(4);
    expect(c.autoStart).toBe(true);
  });

  it('reads config.json when provided as a parsed object', () => {
    const c = loadConfig({ file: { port: 7777, maxPlayers: 10, map: 'dustbowl' } });
    expect(c.port).toBe(7777);
    expect(c.maxPlayers).toBe(10);
    expect(c.map).toBe('dustbowl');
  });

  it('precedence: CLI > env > file > defaults', () => {
    const c = loadConfig({ file: { port: 1111 }, env: { AS_PORT: '2222' }, argv: ['--port', '3333'] });
    expect(c.port).toBe(3333);
  });

  it('rejects port out of range', () => {
    expect(() => loadConfig({ argv: ['--port', '0'] })).toThrow(/port/i);
    expect(() => loadConfig({ argv: ['--port', '70000'] })).toThrow(/port/i);
  });

  it('rejects maxPlayers out of range', () => {
    expect(() => loadConfig({ argv: ['--max-players', '1'] })).toThrow(/maxPlayers/i);
    expect(() => loadConfig({ argv: ['--max-players', '99'] })).toThrow(/maxPlayers/i);
  });

  it('rejects unknown map id', () => {
    expect(() => loadConfig({ env: { AS_MAP: 'nonsense' } })).toThrow(/map/i);
  });

  it('rejects non-positive match seconds / frag target', () => {
    expect(() => loadConfig({ env: { AS_MATCH_SECONDS: '0' } })).toThrow(/seconds/i);
    expect(() => loadConfig({ env: { AS_FRAG_TARGET: '0' } })).toThrow(/frag/i);
  });

  it('coerces minPlayers to not exceed maxPlayers', () => {
    const c = loadConfig({ argv: ['--max-players', '4', '--min-players', '9'] });
    expect(c.minPlayers).toBe(4);
  });

  it('does not share the rateLimit object across loads (no mutation poisoning)', () => {
    const a = loadConfig({});
    const b = loadConfig({});
    a.rateLimit.perWindow = 999;
    expect(b.rateLimit.perWindow).toBe(5); // unchanged — not the shared default
  });

  it('rejects maxPerIp below 1', () => {
    expect(() => loadConfig({ env: { AS_MAX_PER_IP: '0' } })).toThrow(/maxPerIp/i);
  });

  it('merges a file object with unknown extra keys without breaking', () => {
    const c = loadConfig({ file: { port: 7777, _comment: 'hi', extra: true } });
    expect(c.port).toBe(7777);
  });
});
