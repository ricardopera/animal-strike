import { describe, it, expect } from 'vitest';
import { sanitizeName, dedupeName, clampInput, validateMessage } from '../../server/validation.js';

describe('sanitizeName', () => {
  it('trims whitespace', () => {
    expect(sanitizeName('  Rico  ')).toBe('Rico');
  });
  it('strips control characters', () => {
    expect(sanitizeName('Ri\u0000co')).toBe('Rico');
  });
  it('limits to 16 chars', () => {
    expect(sanitizeName('A'.repeat(30))).toHaveLength(16);
  });
  it('returns empty string for blank/garbage', () => {
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('')).toBe('');
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName(12345)).toBe('');
  });
});

describe('dedupeName', () => {
  it('returns the name unchanged if not taken', () => {
    expect(dedupeName('Rico', ['Alice', 'Bob'])).toBe('Rico');
  });
  it('adds a numeric suffix when taken', () => {
    expect(dedupeName('Rico', ['Rico', 'Alice'])).toBe('Rico(2)');
  });
  it('increments suffix until free', () => {
    expect(dedupeName('Rico', ['Rico', 'Rico(2)', 'Rico(3)'])).toBe('Rico(4)');
  });
});

describe('clampInput', () => {
  it('clamps forward/strafe to [-1, 1]', () => {
    expect(clampInput({ f: 5, s: -3 })).toMatchObject({ f: 1, s: -1 });
    expect(clampInput({ f: 0.5, s: 0 })).toMatchObject({ f: 0.5, s: 0 });
  });
  it('clamps yaw to [-PI, PI]', () => {
    expect(clampInput({ yaw: 10 }).yaw).toBeCloseTo(Math.PI);
    expect(clampInput({ yaw: -10 }).yaw).toBeCloseTo(-Math.PI);
    expect(clampInput({ yaw: 0.5 }).yaw).toBeCloseTo(0.5);
  });
  it('clamps pitch to the valid look range', () => {
    const c = clampInput({ pitch: 5 });
    expect(c.pitch).toBeLessThan(Math.PI / 2);
    expect(c.pitch).toBeGreaterThan(-Math.PI / 2);
  });
  it('coerces booleans', () => {
    expect(clampInput({ j: 1, sp: 0, c: 'yes', fire: undefined, reload: null }))
      .toMatchObject({ j: true, sp: false, c: true, fire: false, reload: false });
  });
  it('forces seq to a non-negative integer (default 0)', () => {
    expect(clampInput({ seq: -5 }).seq).toBe(0);
    expect(clampInput({ seq: 12.7 }).seq).toBe(12);
    expect(clampInput({ seq: 'abc' }).seq).toBe(0);
  });
  it('handles missing fields gracefully', () => {
    const c = clampInput({});
    expect(c.f).toBe(0);
    expect(c.s).toBe(0);
    expect(c.fire).toBe(false);
    expect(c.yaw).toBe(0);
  });
});

describe('validateMessage', () => {
  it('accepts a valid auth message', () => {
    const r = validateMessage({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' });
    expect(r.ok).toBe(true);
  });
  it('accepts a valid input message', () => {
    const r = validateMessage({ t: 'input', seq: 1, f: 1, s: 0, j: false, sp: false, c: false, fire: true, reload: false, yaw: 0, pitch: 0 });
    expect(r.ok).toBe(true);
  });
  it('accepts selectMap with a known map id', () => {
    expect(validateMessage({ t: 'selectMap', map: 'plaza' }).ok).toBe(true);
  });
  it('rejects selectMap with an unknown map', () => {
    expect(validateMessage({ t: 'selectMap', map: 'mars' }).ok).toBe(false);
  });
  it('rejects unknown message types', () => {
    expect(validateMessage({ t: 'teleport', x: 999 }).ok).toBe(false);
  });
  it('rejects non-object messages', () => {
    expect(validateMessage(null).ok).toBe(false);
    expect(validateMessage('hello').ok).toBe(false);
  });
  it('accepts start with a known map', () => {
    expect(validateMessage({ t: 'start', map: 'foundry' }).ok).toBe(true);
    expect(validateMessage({ t: 'start' }).ok).toBe(true); // map optional (lobby default)
  });
});
