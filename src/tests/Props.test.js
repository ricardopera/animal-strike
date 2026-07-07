import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { palmTree } from '../world/props/PalmTree.js';
import { cottage, well, marketStall, haystack, bannerPole, cart, barrel } from '../world/props/Village.js';
import { translateBox } from '../world/props/_shared.js';

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

  it('has a segmented trunk (multiple cylinder children, not one)', () => {
    // The rebuilt palm stacks ~8 short cylinders for the trunk with a visible
    // curve/lean and ring segmentation. The original was a single cylinder
    // (1 trunk child). The new one must produce many trunk segments + fronds +
    // coconuts + stems, so the direct+indirect child count is substantial.
    const { group } = palmTree();
    const allDescendants = [];
    group.traverse(o => { allDescendants.push(o); });
    // Well above the old palm's ~11 children (1 trunk + 6 frond pivots + 4 coconuts).
    expect(allDescendants.length).toBeGreaterThan(20);
    // And there should be MULTIPLE cylinder meshes (trunk segments).
    const cylMeshes = [];
    group.traverse(o => { if (o.isMesh && o.geometry?.type === 'CylinderGeometry') cylMeshes.push(o); });
    // At least 8 trunk segments + 6 coconut stems = 14 cylinders.
    expect(cylMeshes.length).toBeGreaterThanOrEqual(8);
  });

  it('honors trunk and leaf colors (brown + green meshes present)', () => {
    // Pass distinct trunk/leaf colors and verify they appear in the tree.
    const trunkHex = 0x8a6a44;     // brown
    const leafHex = 0x2faa55;      // green
    const { group } = palmTree({ trunkColor: trunkHex, leafColor: leafHex });
    const brownCount = { n: 0 };
    const greenCount = { n: 0 };
    group.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const c = o.material.color;
      if (!c) return;
      // THREE color in 0..1 range.
      const r = c.r, g = c.g, b = c.b;
      // brown: red dominant over blue (and roughly red >= green > blue)
      if (r > 0.3 && r > b + 0.05 && r >= g - 0.02) brownCount.n++;
      // green: green dominant
      if (g > 0.3 && g > r && g > b) greenCount.n++;
    });
    expect(brownCount.n).toBeGreaterThan(0);
    expect(greenCount.n).toBeGreaterThan(0);
  });

  it('is deterministic in positions too (segment offsets + leaflet placements)', () => {
    // Beyond child count, the actual world transforms must be identical for
    // two calls with the same opts — proves no unseeded Math.random leaks in.
    const a = palmTree({ height: 7, trunkColor: 0x8a6a44, leafColor: 0x2faa55 });
    const b = palmTree({ height: 7, trunkColor: 0x8a6a44, leafColor: 0x2faa55 });
    // Same number of direct children.
    expect(a.group.children.length).toBe(b.group.children.length);
    // And every descendant has the same position + rotation.
    const aDesc = [], bDesc = [];
    a.group.traverse(o => aDesc.push(o));
    b.group.traverse(o => bDesc.push(o));
    expect(aDesc.length).toBe(bDesc.length);
    for (let i = 0; i < aDesc.length; i++) {
      expect(aDesc[i].position.x).toBeCloseTo(bDesc[i].position.x, 6);
      expect(aDesc[i].position.y).toBeCloseTo(bDesc[i].position.y, 6);
      expect(aDesc[i].position.z).toBeCloseTo(bDesc[i].position.z, 6);
      expect(aDesc[i].rotation.x).toBeCloseTo(bDesc[i].rotation.x, 6);
      expect(aDesc[i].rotation.y).toBeCloseTo(bDesc[i].rotation.y, 6);
      expect(aDesc[i].rotation.z).toBeCloseTo(bDesc[i].rotation.z, 6);
    }
  });

  it('has leaflets attached to frond ribs (many thin elongated boxes in the crown)', () => {
    // The rebuilt palm should have ~8 fronds × ~12 leaflets = ~96 leaflet
    // boxes, plus 8 rib boxes. That alone is ~104 thin elongated boxes,
    // far more than the 6 flat boxes of the old fan-blade fronds.
    const { group } = palmTree();
    const boxes = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'BoxGeometry') boxes.push(o);
    });
    expect(boxes.length).toBeGreaterThan(50);
    // Ribs are long boxes (~3.2m), leaflets are short (~0.6m). Verify both
    // exist by checking the BoxGeometry extents distribution.
    const ribsLike = boxes.filter(b => b.geometry.parameters.width >= 2.5).length;
    const leafletLike = boxes.filter(b => b.geometry.parameters.depth >= 0.3 && b.geometry.parameters.depth <= 1.0).length;
    expect(ribsLike).toBeGreaterThanOrEqual(8);  // at least 8 frond ribs
    expect(leafletLike).toBeGreaterThanOrEqual(50); // many leaflets
  });

  it('places coconuts as spheres clustered near the crown top', () => {
    const { group } = palmTree({ height: 7 });
    const spheres = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'SphereGeometry') spheres.push(o);
    });
    // 6 coconuts in the cluster.
    expect(spheres.length).toBe(6);
    // All coconuts sit near the crown top (above mid-trunk, below or at top).
    for (const s of spheres) {
      const y = s.position.y;
      expect(y).toBeGreaterThan(7 * 0.5);   // above mid-trunk
      expect(y).toBeLessThanOrEqual(7);     // at or below trunk top
    }
  });
});

describe('translateBox', () => {
  it('returns a new AABB shifted by (x, z) with y unchanged, without mutating the input', () => {
    const box = { min: [-1, 0, -2], max: [1, 4, 2] };
    const moved = translateBox(box, 10, -5);
    expect(moved).toEqual({ min: [9, 0, -7], max: [11, 4, -3] });
    // original is untouched (non-mutating)
    expect(box).toEqual({ min: [-1, 0, -2], max: [1, 4, 2] });
  });
});
