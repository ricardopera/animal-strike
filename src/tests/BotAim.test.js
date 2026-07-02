import { describe, it, expect } from 'vitest';
import { computeAimPoint } from '../ai/BotAim.js';

describe('computeAimPoint', () => {
  it('returns the target position when accuracy is perfect', () => {
    const target = { pos: [10, 1, 0] };
    const p = computeAimPoint(target, { accuracy: 1, reactionProgress: 1, rand: () => 0 });
    expect(p).toEqual([10, 1, 0]);
  });
  it('offsets within the error cone when accuracy < 1', () => {
    const target = { pos: [10, 1, 0] };
    // accuracy 0 -> full error radius; rand 0.9 pushes offsets to positive side
    const p = computeAimPoint(target, { accuracy: 0, reactionProgress: 1, errorRadius: 2, rand: () => 0.9 });
    expect(p[0]).toBeGreaterThan(10);
    expect(p[2]).toBeGreaterThan(0);
  });
  it('error shrinks as reactionProgress goes 0->1 (tuning in)', () => {
    const target = { pos: [10, 1, 0] };
    const early = computeAimPoint(target, { accuracy: 0.5, reactionProgress: 0.1, errorRadius: 3, rand: () => 0.9 });
    const late = computeAimPoint(target, { accuracy: 0.5, reactionProgress: 1.0, errorRadius: 3, rand: () => 0.9 });
    const errEarly = Math.hypot(early[0] - 10, early[2] - 0);
    const errLate = Math.hypot(late[0] - 10, late[2] - 0);
    expect(errEarly).toBeGreaterThan(errLate);
  });
});
