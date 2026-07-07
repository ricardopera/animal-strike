import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// Stub a minimal document so the V5/V7 procedural canvas textures can build
// (mirrors the MapBuildHelper.test.js approach). WaterPlane and Clouds guard on
// `typeof document` and fall back to flat colors when absent, so these modules
// are headless-safe either way; this stub exercises the real texture path.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({
          fillRect: () => {}, clearRect: () => {}, beginPath: () => {},
          ellipse: () => {}, lineTo: () => {}, moveTo: () => {}, stroke: () => {},
          fill: () => {},
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
        }),
      }),
    };
  }
});

const { WaterPlane } = await import('../fx/WaterPlane.js');
const { Clouds } = await import('../fx/Clouds.js');

describe('WaterPlane (V5)', () => {
  it('constructs a flat translucent mesh and exposes group/mesh', () => {
    const water = new WaterPlane(40, 30);
    expect(water.mesh).toBeInstanceOf(THREE.Mesh);
    expect(water.group).toBe(water.mesh);
    // laid flat: rotation.x = -PI/2
    expect(water.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    // just above ground
    expect(water.mesh.position.y).toBeCloseTo(0.05);
    // semi-transparent standard material
    expect(water.mesh.material.transparent).toBe(true);
    expect(water.mesh.material.opacity).toBeGreaterThan(0);
    expect(water.mesh.material.opacity).toBeLessThan(1);
  });

  it('update(dt) animates without throwing and scrolls the texture offset', () => {
    const water = new WaterPlane(20, 20);
    const beforeX = water._tex ? water._tex.offset.x : 0;
    expect(() => water.update(0.016)).not.toThrow();
    if (water._tex) {
      expect(water._tex.offset.x).toBeGreaterThan(beforeX);
    }
  });

  it('dispose() releases geometry and material', () => {
    const water = new WaterPlane(10, 10);
    expect(() => water.dispose()).not.toThrow();
  });
});

describe('Clouds (V7)', () => {
  it('constructs sprites on the given group and registers on userData.updatables', () => {
    const group = new THREE.Group();
    const clouds = new Clouds(group, { count: 5, area: 100, height: 40 });
    expect(Array.isArray(group.userData.updatables)).toBe(true);
    expect(group.userData.updatables).toContain(clouds);
    // sprites added to the group at sky height
    const sprites = group.children.filter(c => c.isSprite);
    expect(sprites.length).toBe(5);
    for (const s of sprites) expect(s.position.y).toBe(40);
  });

  it('update(dt) drifts clouds in +X and wraps around the area edge', () => {
    const group = new THREE.Group();
    const clouds = new Clouds(group, { count: 1, area: 100, height: 50, speed: 10 });
    const sprite = group.children[0];
    const startX = sprite.position.x;
    // move it to the edge
    sprite.position.x = 60; // > area/2 (50)
    clouds.update(0); // a zero-dt update still runs the wrap check
    // passing the edge by 10 wrapped it: 60 -> 60 - 100 = -40
    expect(sprite.position.x).toBeCloseTo(-40);
    // a positive-dt update advances +X from the wrapped position
    const after = sprite.position.x;
    clouds.update(1);
    expect(sprite.position.x).toBeGreaterThan(after);
  });

  it('is deterministic: same seed places clouds identically', () => {
    const a = new Clouds(new THREE.Group(), { count: 3, seed: 7 });
    const b = new Clouds(new THREE.Group(), { count: 3, seed: 7 });
    const pa = a._sprites.map(s => [s.position.x, s.position.z]);
    const pb = b._sprites.map(s => [s.position.x, s.position.z]);
    expect(pa).toEqual(pb);
  });

  it('dispose() clears sprites', () => {
    const group = new THREE.Group();
    const clouds = new Clouds(group, { count: 2 });
    expect(() => clouds.dispose()).not.toThrow();
    expect(clouds._sprites).toHaveLength(0);
  });
});
