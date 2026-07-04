import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// TextureFactory (imported transitively by MapBuildHelper) calls
// document.createElement('canvas') at module load. The node test env has no DOM,
// so stub a minimal document before the import resolves.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({
          fillRect: () => {}, strokeRect: () => {}, beginPath: () => {},
          ellipse: () => {}, lineTo: () => {}, moveTo: () => {}, stroke: () => {},
          fill: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
        }),
      }),
    };
  }
});

const { makeBuildHelper } = await import('../world/MapBuildHelper.js');

describe('MapBuildHelper', () => {
  it('box() returns a shadow-casting mesh at the given position', () => {
    const h = makeBuildHelper();
    const m = h.box(2, 2, 2, 0xff0000, 5, 1, 3, 'concrete');
    expect(m).toBeInstanceOf(THREE.Mesh);
    expect(m.position.x).toBe(5);
    expect(m.position.z).toBe(3);
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true);
  });

  it('shadeHex() darkens and lightens', () => {
    const h = makeBuildHelper();
    expect(h.shadeHex(0xffffff, -0.5)).toBeLessThan(0xffffff);
    expect(h.shadeHex(0x000000, 0.5)).toBeGreaterThan(0);
  });

  it('placePair() calls place() once at origin-symmetric (x=0,z=0) and twice otherwise', () => {
    const h = makeBuildHelper();
    const placed = [];
    const place = (mesh) => placed.push([mesh.position.x, mesh.position.z]);
    h.placePair(place, 4, 3, 4, 0xff0000, 0, 1.5, 0, 'concrete');   // origin -> 1
    h.placePair(place, 4, 3, 4, 0xff0000, 5, 1.5, 7, 'concrete');   // off-origin -> 2 (mirror)
    expect(placed).toEqual([[0, 0], [5, 7], [-5, -7]]);
  });
});
