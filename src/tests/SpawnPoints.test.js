import { describe, it, expect } from 'vitest';
import { getRandomSpawn, SPAWN_POINTS } from '../world/SpawnPoints.js';

// Use plain objects with x/y/z to stand in for THREE.Vector3 (distanceToSquared
// is the only method used; SPAWN_POINTS are real Vector3 so they provide it).
// For occupied inputs we pass Vector3-like objects; the function calls
// sp.distanceToSquared(o) where sp is a real Vector3, so o just needs x/y/z.
function likeVec(x, y, z) { return { x, y, z }; }

describe('getRandomSpawn', () => {
  it('returns a clone of one of the defined spawn points', () => {
    const sp = getRandomSpawn([]);
    expect(SPAWN_POINTS.some(p => p.equals(sp))).toBe(true);
  });
  it('returns a fresh vector (not a shared reference)', () => {
    const a = getRandomSpawn([]);
    const b = getRandomSpawn([]);
    expect(a).not.toBe(b);
  });
  it('with no occupied players, returns the first spawn (all tie at nearest=Infinity)', () => {
    // When nearest stays Infinity for every point, the first point wins (bestDist starts -1).
    const sp = getRandomSpawn([]);
    expect(sp.equals(SPAWN_POINTS[0])).toBe(true);
  });
  it('picks the spawn farthest from a single occupied player', () => {
    // Occupy a point near SPAWN_POINTS[1] (0,1,-30); the farthest should be the +Z one (0,1,30).
    const occupied = [likeVec(0, 1, -29)];
    const sp = getRandomSpawn(occupied);
    expect(sp.equals(new (SPAWN_POINTS[0].constructor)(0, 1, 30))).toBe(true);
  });
  it('maximizes the distance to the NEAREST occupied player', () => {
    // Two occupied players bracketing the arena; the chosen spawn should not be adjacent to either.
    const occupied = [likeVec(28, 1, 28), likeVec(-28, 1, -28)];
    const sp = getRandomSpawn(occupied);
    // The chosen point's nearest-occupied distance should be >= every other point's.
    let chosenNearest = Infinity;
    for (const o of occupied) {
      const d = sp.distanceToSquared(o);
      if (d < chosenNearest) chosenNearest = d;
    }
    for (const candidate of SPAWN_POINTS) {
      let candNearest = Infinity;
      for (const o of occupied) {
        const d = candidate.distanceToSquared(o);
        if (d < candNearest) candNearest = d;
      }
      expect(chosenNearest).toBeGreaterThanOrEqual(candNearest - 1e-6);
    }
  });
});
