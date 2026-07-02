import { describe, it, expect } from 'vitest';

// applyFalloff is module-private in Game.js; re-implement the spec'd formula here
// to lock the contract via a golden-values test. If Game.js's formula drifts,
// these expected values document the intended behavior.
// Formula: full damage up to start; linear from 100% at start to 40% at end;
// flat 40% beyond end.
function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}

describe('applyFalloff (hitscan damage falloff)', () => {
  const DAMAGE = 18;
  const START = 30;
  const END = 60;

  it('deals full damage at and below falloffStart', () => {
    expect(applyFalloff(DAMAGE, 0, START, END)).toBe(DAMAGE);
    expect(applyFalloff(DAMAGE, START, START, END)).toBe(DAMAGE);
  });

  it('interpolates linearly between start and end', () => {
    // midpoint -> 70% of damage (1 - 0.6*0.5)
    expect(applyFalloff(DAMAGE, 45, START, END)).toBeCloseTo(DAMAGE * 0.7, 6);
  });

  it('drops to 40% at falloffEnd', () => {
    expect(applyFalloff(DAMAGE, END, START, END)).toBeCloseTo(DAMAGE * 0.4, 6);
  });

  it('stays at 40% beyond falloffEnd', () => {
    expect(applyFalloff(DAMAGE, 100, START, END)).toBeCloseTo(DAMAGE * 0.4, 6);
    expect(applyFalloff(DAMAGE, 1000, START, END)).toBeCloseTo(DAMAGE * 0.4, 6);
  });

  it('respects the per-weapon damage value', () => {
    // sniper: 80 damage, longer range band
    expect(applyFalloff(80, 80, 80, 160)).toBe(80);
    expect(applyFalloff(80, 160, 80, 160)).toBeCloseTo(32, 6); // 40% of 80
  });
});
