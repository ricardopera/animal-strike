import { describe, it, expect } from 'vitest';
import { MAPS } from '../world/Maps.js';

describe('every map exposes colliderBoxes matching its geometry', () => {
  for (const map of MAPS) {
    describe(`map "${map.id}"`, () => {
      it('has a non-empty colliderBoxes array', () => {
        expect(Array.isArray(map.colliderBoxes)).toBe(true);
        expect(map.colliderBoxes.length).toBeGreaterThan(0);
      });

      it('every colliderBox is a valid AABB (min < max on all axes)', () => {
        for (const b of map.colliderBoxes) {
          expect(b.min.length).toBe(3);
          expect(b.max.length).toBe(3);
          for (let i = 0; i < 3; i++) expect(b.min[i]).toBeLessThan(b.max[i]);
        }
      });

      it('colliderBoxes count is substantial (>10, indicating real geometry)', () => {
        expect(map.colliderBoxes.length).toBeGreaterThan(10);
      });
    });
  }
});
