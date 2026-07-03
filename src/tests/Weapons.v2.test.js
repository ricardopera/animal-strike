import { describe, it, expect } from 'vitest';
import { WEAPONS } from '../config/Weapons.js';

describe('Weapons v2 extended fields', () => {
  const IDS = Object.keys(WEAPONS);

  it('every weapon has a headshot multiplier > 1 (rewards aim)', () => {
    for (const id of IDS) {
      expect(WEAPONS[id].headshotMul).toBeGreaterThan(1);
    }
  });

  it('every weapon has a movement-spread penalty (rewards standing still)', () => {
    for (const id of IDS) {
      expect(WEAPONS[id].moveSpreadPenalty).toBeGreaterThan(0);
    }
  });

  it('sniper is the most punishing to fire on the move; SMG is the most forgiving', () => {
    // Highest per-speed penalty = sniper; lowest = SMG (run-and-gun archetype).
    const sniper = WEAPONS.SNIPER.moveSpreadPenalty;
    const smg = WEAPONS.SMG.moveSpreadPenalty;
    expect(sniper).toBeGreaterThan(smg);
    // And sniper should be the max across the roster.
    const max = Math.max(...IDS.map(id => WEAPONS[id].moveSpreadPenalty));
    expect(sniper).toBe(max);
  });

  it('sniper rewards headshots the most (highest headshot multiplier)', () => {
    const max = Math.max(...IDS.map(id => WEAPONS[id].headshotMul));
    expect(WEAPONS.SNIPER.headshotMul).toBe(max);
    expect(WEAPONS.SNIPER.headshotMul).toBeGreaterThan(WEAPONS.SHOTGUN.headshotMul);
  });

  it('every weapon defines a tracer speed for FX', () => {
    for (const id of IDS) {
      expect(WEAPONS[id].tracerSpeed).toBeGreaterThan(0);
    }
  });
});
