import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { palmTree } from '../world/props/PalmTree.js';
import { cottage, well, marketStall, haystack, bannerPole, cart, barrel } from '../world/props/Village.js';

// Smoke/contract tests for the V6 themed prop factories. These factories use
// THREE primitives only (no document), so they're headless-safe without a DOM
// stub. Each builder must return { group, boxes } (or { group, trunkBox } for
// palm); the group must be a real THREE.Object3D and boxes must be AABBs.

describe('prop factories return valid { group, boxes } contracts', () => {
  const villageBuilders = [
    ['cottage', cottage],
    ['well', well],
    ['marketStall', marketStall],
    ['haystack', haystack],
    ['bannerPole', bannerPole],
    ['cart', cart],
    ['barrel', barrel],
  ];

  for (const [name, builder] of villageBuilders) {
    it(`${name}() returns a group (THREE.Object3D) + boxes array`, () => {
      const { group, boxes } = builder();
      expect(group).toBeInstanceOf(THREE.Object3D);
      expect(Array.isArray(boxes)).toBe(true);
      // Solid props carry at least one collider box; each box is a well-formed AABB.
      for (const b of boxes) {
        expect(Array.isArray(b.min)).toBe(true);
        expect(Array.isArray(b.max)).toBe(true);
        expect(b.min).toHaveLength(3);
        expect(b.max).toHaveLength(3);
        expect(b.min[0]).toBeLessThanOrEqual(b.max[0]);
        expect(b.min[1]).toBeLessThanOrEqual(b.max[1]);
        expect(b.min[2]).toBeLessThanOrEqual(b.max[2]);
      }
    });
  }

  it('cottage contains child meshes (walls + roof parts)', () => {
    const { group } = cottage();
    const meshes = [];
    group.traverse(o => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('palmTree', () => {
  it('returns { group, trunkBox } with a valid AABB for the trunk', () => {
    const { group, trunkBox } = palmTree();
    expect(group).toBeInstanceOf(THREE.Object3D);
    expect(Array.isArray(trunkBox.min)).toBe(true);
    expect(Array.isArray(trunkBox.max)).toBe(true);
    expect(trunkBox.min).toHaveLength(3);
    expect(trunkBox.max).toHaveLength(3);
    // trunk box spans the full height at the local origin footprint
    expect(trunkBox.min[1]).toBe(0);
    expect(trunkBox.max[1]).toBeGreaterThan(0);
    expect(trunkBox.min[0]).toBeLessThan(trunkBox.max[0]);
    expect(trunkBox.min[2]).toBeLessThan(trunkBox.max[2]);
  });

  it('is deterministic: same opts produce identical geometry', () => {
    const a = palmTree({ height: 7 });
    const b = palmTree({ height: 7 });
    // trunk box must match exactly
    expect(a.trunkBox).toEqual(b.trunkBox);
    // same number of children (trunk + 6 frond pivots + 4 coconuts)
    expect(a.group.children.length).toBe(b.group.children.length);
  });

  it('respects the height option in both visual and collider', () => {
    const tall = palmTree({ height: 10 });
    expect(tall.trunkBox.max[1]).toBe(10);
    const short = palmTree({ height: 4 });
    expect(short.trunkBox.max[1]).toBe(4);
  });
});
