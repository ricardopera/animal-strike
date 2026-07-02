import { describe, it, expect } from 'vitest';
import { clamp, angleDelta, moveTowards } from '../core/math.js';

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it('passes through in-range values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('angleDelta', () => {
  it('returns shortest signed path in [-PI, PI]', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
  it('wraps the long way around', () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 5);
  });
  it('returns negative for clockwise', () => {
    expect(angleDelta(0.5, 0.1)).toBeCloseTo(-0.4, 5);
  });
});

describe('moveTowards', () => {
  it('moves towards target by up to maxDelta', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
  });
  it('snaps to target when within maxDelta', () => {
    expect(moveTowards(9, 10, 3)).toBe(10);
  });
  it('works descending', () => {
    expect(moveTowards(5, 1, 2)).toBe(3);
  });
});
