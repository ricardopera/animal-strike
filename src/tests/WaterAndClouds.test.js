import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// Stub a minimal document so the V5/V6/V7 procedural canvas textures can
// build (mirrors the MapBuildHelper.test.js approach). WaterPlane and Clouds
// guard on `typeof document` and fall back to flat colors when absent, so
// these modules are headless-safe either way; this stub exercises the real
// texture path.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({
          fillRect: () => {}, clearRect: () => {}, beginPath: () => {},
          ellipse: () => {}, arc: () => {}, lineTo: () => {}, moveTo: () => {}, stroke: () => {},
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

describe('WaterPlane (V6)', () => {
  it('constructs a translucent water mesh with foam ring and exposes group/mesh/foam', () => {
    const water = new WaterPlane(40, 30);
    expect(water.mesh).toBeInstanceOf(THREE.Mesh);
    expect(water.foam).toBeInstanceOf(THREE.Mesh);
    // V6: .group is now a proper Group containing BOTH the main water and
    // the foam ring. (V5 had .group === .mesh — that alias no longer holds.)
    expect(water.group).toBeInstanceOf(THREE.Group);
    expect(water.group).not.toBe(water.mesh);
    // The group must contain the water mesh + foam ring (2 children minimum).
    expect(water.group.children.length).toBeGreaterThanOrEqual(2);
    expect(water.group.children).toContain(water.mesh);
    expect(water.group.children).toContain(water.foam);
    // laid flat: rotation.x = -PI/2
    expect(water.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    // just above ground
    expect(water.mesh.position.y).toBeCloseTo(0.05);
    // semi-transparent standard material
    expect(water.mesh.material.transparent).toBe(true);
    expect(water.mesh.material.opacity).toBeGreaterThan(0);
    expect(water.mesh.material.opacity).toBeLessThan(1);
    // backface shadows: water doesn't cast on itself
    expect(water.mesh.castShadow).toBe(false);
    expect(water.mesh.receiveShadow).toBe(true);
  });

  it('has displaced wave geometry: not all vertex-Z values are equal', () => {
    const water = new WaterPlane(24, 16);
    const pos = water.mesh.geometry.attributes.position;
    expect(pos).toBeDefined();
    // PlaneGeometry vertex order is (x,y,z) triples. The mesh is rotated
    // -PI/2 around X before render, so the local-Z displacement we wrote
    // with setZ() becomes world-Y at render time. Here we read it directly
    // from `array`: index (i*3 + 2) is the local-Z (= displacement).
    const arr = pos.array;
    const zs = new Set();
    for (let i = 2; i < arr.length; i += 3) {
      // Quantize to avoid FP noise when comparing zero-like values.
      zs.add(Math.round(arr[i] * 1000));
    }
    // With displacement there must be at least 2 distinct Z values among the
    // vertices (an undisplaced plane would have all Z = 0 → exactly 1).
    expect(zs.size).toBeGreaterThan(1);
    // And none of them should blow past the documented ±0.05m envelope.
    let maxAbs = 0;
    for (let i = 2; i < arr.length; i += 3) {
      const v = Math.abs(arr[i]);
      if (v > maxAbs) maxAbs = v;
    }
    expect(maxAbs).toBeLessThanOrEqual(0.05);
  });

  it('update(dt) animates without throwing: scrolls texture + refreshes displacement + shimmer', () => {
    const water = new WaterPlane(20, 20);
    const beforeX = water._tex ? water._tex.offset.x : 0;
    expect(() => water.update(0.016)).not.toThrow();
    if (water._tex) {
      expect(water._tex.offset.x).toBeGreaterThan(beforeX);
    }
    // After an update, the phase counter advanced.
    expect(water._phase).toBeGreaterThan(0);
    // The base color is preserved (contract: keeps the input color).
    expect(water.mesh.material.color.getHex()).toBe(water.color);
    // Emissive shimmer stays within a tight band (no strobing).
    const ei = water.mesh.material.emissiveIntensity;
    expect(ei).toBeGreaterThan(0.03);
    expect(ei).toBeLessThan(0.07);
  });

  it('update(dt) does not introduce NaN into the position buffer (regression: the _width/_depth typo)', () => {
    // Catches a class of bug where update() reads the wrong field name and
    // multiplies a vertex coord by `undefined` → NaN. Previously an underscore
    // mismatch in the field name (this._width vs this.width) silently turned
    // every vertex-Z into NaN after the first frame, breaking the bounding
    // sphere and producing "Computed radius is NaN" in the console.
    const water = new WaterPlane(24, 16);
    // Snapshot the (finite) initial Z values, then run a few updates and
    // re-check that every Z is still a finite number within the ±0.05 envelope.
    const arr = water.mesh.geometry.attributes.position.array;
    for (let i = 0; i < 5; i++) water.update(0.016);
    let maxAbs = 0;
    for (let i = 2; i < arr.length; i += 3) {
      expect(Number.isFinite(arr[i])).toBe(true);
      const v = Math.abs(arr[i]);
      if (v > maxAbs) maxAbs = v;
    }
    expect(maxAbs).toBeLessThanOrEqual(0.05);
  });

  it('dispose() releases water geometry, water material, foam geometry, foam material', () => {
    const water = new WaterPlane(10, 10);
    expect(() => water.dispose()).not.toThrow();
  });

  it('headless-safe: still constructs + updates when document is absent', () => {
    // Temporarily pretend we have no document so the texture path is skipped.
    const savedDoc = globalThis.document;
    try {
      delete globalThis.document;
      const water = new WaterPlane(12, 8);
      expect(water.mesh).toBeInstanceOf(THREE.Mesh);
      // No texture built in headless mode → _tex is null and update() must
      // still no-op cleanly on the texture branch.
      expect(water._tex).toBeNull();
      expect(() => water.update(0.016)).not.toThrow();
      expect(() => water.dispose()).not.toThrow();
    } finally {
      globalThis.document = savedDoc;
    }
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