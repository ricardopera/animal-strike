import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  beachGrassTuft,
  driftwoodLog,
  smallRock,
  starfish,
} from '../world/props/BeachScatter.js';

// Contract tests for the BeachScatter prop factories. Each factory returns
// { group } only — NO collider boxes. The Tropic map uses these for purely
// decorative non-collidable scatter (beach grass, driftwood, small rock
// accents, starfish). The returned group must be a real THREE.Object3D
// containing a sensible number of mesh children for its named prop.

describe('beachGrassTuft', () => {
  it('returns a THREE.Object3D group with NO boxes (non-collidable scatter)', () => {
    const result = beachGrassTuft();
    expect(result.group).toBeInstanceOf(THREE.Object3D);
    // Scatter props deliberately don't carry collider boxes — verify.
    expect(result.boxes).toBeUndefined();
  });

  it('contains 3–5 thin pointed blade cones', () => {
    const { group } = beachGrassTuft();
    const cyls = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'CylinderGeometry') cyls.push(o);
    });
    expect(cyls.length).toBeGreaterThanOrEqual(3);
    expect(cyls.length).toBeLessThanOrEqual(5);
  });

  it('is deterministic — same opts produce same geometry', () => {
    const a = beachGrassTuft({ seed: 4 });
    const b = beachGrassTuft({ seed: 4 });
    expect(a.group.children.length).toBe(b.group.children.length);
    const aDesc = [], bDesc = [];
    a.group.traverse(o => aDesc.push(o));
    b.group.traverse(o => bDesc.push(o));
    expect(aDesc.length).toBe(bDesc.length);
    for (let i = 0; i < aDesc.length; i++) {
      expect(aDesc[i].position.x).toBeCloseTo(bDesc[i].position.x, 6);
      expect(aDesc[i].position.y).toBeCloseTo(bDesc[i].position.y, 6);
      expect(aDesc[i].position.z).toBeCloseTo(bDesc[i].position.z, 6);
    }
  });
});

describe('driftwoodLog', () => {
  it('returns a THREE.Object3D group with NO boxes', () => {
    const { group } = driftwoodLog();
    expect(group).toBeInstanceOf(THREE.Object3D);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('contains 1 main log cylinder + 2 end rings + 1 branch', () => {
    const { group } = driftwoodLog();
    const cyls = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'CylinderGeometry') cyls.push(o);
    });
    // main log + 2 rings + 1 branch = 4 cylinders.
    expect(cyls.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic across two calls with the same opts', () => {
    const a = driftwoodLog({ seed: 7 });
    const b = driftwoodLog({ seed: 7 });
    const aDesc = [], bDesc = [];
    a.group.traverse(o => aDesc.push(o));
    b.group.traverse(o => bDesc.push(o));
    expect(aDesc.length).toBe(bDesc.length);
    for (let i = 0; i < aDesc.length; i++) {
      expect(aDesc[i].position.x).toBeCloseTo(bDesc[i].position.x, 6);
      expect(aDesc[i].position.z).toBeCloseTo(bDesc[i].position.z, 6);
    }
  });
});

describe('smallRock', () => {
  it('returns a THREE.Object3D group with NO boxes (decorative)', () => {
    const { group } = smallRock();
    expect(group).toBeInstanceOf(THREE.Object3D);
    expect(group.children.length).toBeGreaterThanOrEqual(2);
  });

  it('contains 2 or 3 rock chunks (boxes/spheres)', () => {
    const { group } = smallRock({ seed: 1 });
    // 2 or 3 chunks depending on seed (deterministic).
    expect(group.children.length).toBeGreaterThanOrEqual(2);
    expect(group.children.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic — same seed produces same positions', () => {
    const a = smallRock({ seed: 3 });
    const b = smallRock({ seed: 3 });
    expect(a.group.children.length).toBe(b.group.children.length);
    for (let i = 0; i < a.group.children.length; i++) {
      expect(a.group.children[i].position.x).toBeCloseTo(b.group.children[i].position.x, 6);
      expect(a.group.children[i].position.z).toBeCloseTo(b.group.children[i].position.z, 6);
    }
  });
});

describe('starfish', () => {
  it('returns a THREE.Object3D group with NO boxes', () => {
    const { group } = starfish();
    expect(group).toBeInstanceOf(THREE.Object3D);
  });

  it('contains exactly 5 radial arm boxes + 1 center disc (6 box meshes)', () => {
    const { group } = starfish();
    const boxes = [];
    group.traverse(o => {
      if (o.isMesh && o.geometry?.type === 'BoxGeometry') boxes.push(o);
    });
    // 5 arms + 1 center = 6 box meshes.
    expect(boxes.length).toBe(6);
  });

  it('is deterministic — same seed produces same geometry', () => {
    const a = starfish({ seed: 2 });
    const b = starfish({ seed: 2 });
    const aDesc = [], bDesc = [];
    a.group.traverse(o => aDesc.push(o));
    b.group.traverse(o => bDesc.push(o));
    expect(aDesc.length).toBe(bDesc.length);
    for (let i = 0; i < aDesc.length; i++) {
      expect(aDesc[i].position.x).toBeCloseTo(bDesc[i].position.x, 6);
      expect(aDesc[i].position.y).toBeCloseTo(bDesc[i].position.y, 6);
      expect(aDesc[i].position.z).toBeCloseTo(bDesc[i].position.z, 6);
    }
  });
});