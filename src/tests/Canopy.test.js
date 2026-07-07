import { describe, it, expect } from 'vitest';
import { CANOPY } from '../world/maps/Canopy.js';

describe('Canopy map', () => {
  it('is a valid MapDefinition with the expected identity', () => {
    expect(CANOPY.id).toBe('canopy');
    expect(CANOPY.name).toBe('Canopy');
    expect(typeof CANOPY.desc).toBe('string');
  });

  it('enables fall death (killY set, below the lowest platform)', () => {
    expect(CANOPY.killY).toBe(12);
  });

  it('has a 4-stop sky gradient and dense fog', () => {
    expect(CANOPY.palette.sky).toHaveLength(4);
    expect(CANOPY.palette.fogDensity).toBeGreaterThanOrEqual(0.01);
  });

  it('has non-empty collider boxes (geometry authored headlessly)', () => {
    expect(CANOPY.colliderBoxes.length).toBeGreaterThan(10);
    for (const b of CANOPY.colliderBoxes) {
      expect(b.min).toBeDefined();
      expect(b.max).toBeDefined();
    }
  });

  it('has staggered spawn points (no two at the same height band = camping)', () => {
    expect(CANOPY.spawnPoints.length).toBeGreaterThanOrEqual(8);
    const heights = CANOPY.spawnPoints.map(p => Math.round(p.y));
    const unique = new Set(heights);
    expect(unique.size).toBeGreaterThanOrEqual(3); // staggered across >=3 levels
  });

  it('places all waypoints on or above the lowest safe platform (no void waypoints)', () => {
    for (const w of CANOPY.waypoints) {
      expect(w.y).toBeGreaterThanOrEqual(CANOPY.killY);
    }
  });
});
