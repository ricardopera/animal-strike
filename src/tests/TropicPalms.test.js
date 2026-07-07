import { describe, it, expect } from 'vitest';
import {
  TROPIC,
  PALM_SITES_RO,
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

  it('every half-site is off-axis (x!=0 && z!=0) so each yields 2 distinct palms', () => {
    for (const s of PALM_SITES_RO) {
      expect(s.x).not.toBe(0);
      expect(s.z).not.toBe(0);
    }
  });

  it('no two half-sites are 180° rotational twins (would stack palms on the same spot)', () => {
    // A twin pair (i,j) satisfies site[i] == -site[j]; under that, both sites
    // stamp the SAME two physical positions, so the palms aren't distinct.
    const sites = PALM_SITES_RO;
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const twin = sites[i].x === -sites[j].x && sites[i].z === -sites[j].z;
        expect(twin).toBe(false);
      }
    }
  });

  it('has at least 30 DISTINCT palm positions (sites x2, all unique)', () => {
    const positions = new Set();
    for (const s of PALM_SITES_RO) {
      positions.add(`${s.x},${s.z}`);
      positions.add(`${-s.x},${-s.z}`);
    }
    expect(positions.size).toBeGreaterThanOrEqual(30);
    // And the distinct count must equal the claimed total (no stacking).
    expect(positions.size).toBe(PALM_TOTAL_COUNT);
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
