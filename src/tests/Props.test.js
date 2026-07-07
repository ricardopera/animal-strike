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

  it('is deterministic in positions too (trunk segments + frond blade chains)', () => {
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

  it('has curved-blade fronds (each frond a chain of tapered blade segments)', () => {
    // Each frond is ONE long leaf that arches down, built from a chain of
    // short tapered segments (~6 per frond). With 8 fronds that is ~48 blade
    // boxes — far more than the 6 flat boxes of the original fan-blade fronds,
    // and each blade is a tapered leaf segment (width shrinks base→tip), not a
    // feather-skeleton rib+leaflet.
    const { group } = palmTree();
    const boxes = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'BoxGeometry') boxes.push(o);
    });
    // ~8 fronds × ~6 segments = ~48 blade boxes (+ a few trunk/coconut bits
    // use other geometry types). Crown blade boxes dominate the box count.
    expect(boxes.length).toBeGreaterThanOrEqual(40);
    // Blade segments: short in X (~0.62m), thin in Y (~0.05m), and a Z width
    // that tapers across the frond (between ~0.10 tip and ~0.42 base). Count
    // boxes whose X (width) is short and whose Z (depth) is in the blade range.
    const blades = boxes.filter(b => {
      const p = b.geometry.parameters;
      return p.width > 0.4 && p.width < 0.8    // segLen ~0.62
        && p.height < 0.1                       // thin blade
        && p.depth >= 0.08 && p.depth <= 0.5;   // tapered blade width
    });
    expect(blades.length).toBeGreaterThanOrEqual(40); // ~8 fronds × ~6 segs
    // Confirm the taper exists: at least two distinct blade widths are present
    // (base segments are wider than tip segments).
    const widths = new Set(blades.map(b => Math.round(b.geometry.parameters.depth * 100)));
    expect(widths.size).toBeGreaterThanOrEqual(2);
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
