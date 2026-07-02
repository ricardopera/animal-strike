import { describe, it, expect } from 'vitest';
import { clamp } from '../core/math.js';

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
