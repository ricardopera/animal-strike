import { describe, it, expect } from 'vitest';
import {
  TROPIC,
  PALM_HALF_COUNT,
  PALM_TOTAL_COUNT,
} from '../world/maps/Tropic.js';

// The Tropic map's headline requirement: AT LEAST 30 palm trees. Palms are
// placed declaratively from PALM_SITES (a half-set), each site mirrored to its
// 180°-rotational twin (-x,-z) so every half-site yields exactly 2 palms. This
// makes the count a single, verifiable source of truth.
describe('Tropic palm count (>= 30 palms requirement)', () => {
  it('exports PALM_HALF_COUNT (the half-set) and PALM_TOTAL_COUNT', () => {
    expect(typeof PALM_HALF_COUNT).toBe('number');
    expect(PALM_HALF_COUNT).toBeGreaterThan(0);
    expect(PALM_TOTAL_COUNT).toBe(PALM_HALF_COUNT * 2);
  });

  it('has at least 30 palms total (half-set x2 >= 30)', () => {
    expect(PALM_HALF_COUNT * 2).toBeGreaterThanOrEqual(30);
    expect(PALM_TOTAL_COUNT).toBeGreaterThanOrEqual(30);
  });

  it('TROPIC is registered and its colliderBoxes include the palm trunks', () => {
    expect(TROPIC.id).toBe('tropic');
    // Each palm contributes a collidable trunk box in authorGeometry, so the
    // colliderBoxes array must be non-empty and substantial (palms + walls +
    // huts + rocks + boat).
    expect(Array.isArray(TROPIC.colliderBoxes)).toBe(true);
    expect(TROPIC.colliderBoxes.length).toBeGreaterThan(PALM_TOTAL_COUNT);
  });
});
