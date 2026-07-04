import { describe, it, expect } from 'vitest';
import { MAPS } from '../world/Maps.js';

// Structural invariants every map must satisfy. These guard authoring slips
// (a spawn inside a wall, a waypoint off the map) that are hard to see visually.
describe('every registered map satisfies contract invariants', () => {
  for (const map of MAPS) {
    describe(`map "${map.id}"`, () => {
      it('has >= 8 spawn points', () => {
        expect(map.spawnPoints.length).toBeGreaterThanOrEqual(8);
      });

      it('has >= 10 waypoints', () => {
        expect(map.waypoints.length).toBeGreaterThanOrEqual(10);
      });

      it('all spawns lie within the 80x80 arena bounds [-40,40]', () => {
        for (const sp of map.spawnPoints) {
          expect(Math.abs(sp.x)).toBeLessThanOrEqual(40);
          expect(Math.abs(sp.z)).toBeLessThanOrEqual(40);
        }
      });

      it('all waypoints lie within the 80x80 arena bounds [-40,40]', () => {
        for (const wp of map.waypoints) {
          expect(Math.abs(wp.x)).toBeLessThanOrEqual(40);
          expect(Math.abs(wp.z)).toBeLessThanOrEqual(40);
        }
      });

      it('no two spawn points are within 3m of each other', () => {
        for (let i = 0; i < map.spawnPoints.length; i++) {
          for (let j = i + 1; j < map.spawnPoints.length; j++) {
            const d = map.spawnPoints[i].distanceTo(map.spawnPoints[j]);
            expect(d).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it('has a 4-stop sky gradient palette', () => {
        expect(map.palette.sky).toHaveLength(4);
      });
    });
  }
});
