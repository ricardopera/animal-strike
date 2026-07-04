import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getRandomSpawn } from '../world/SpawnPoints.js';

describe('getRandomSpawn', () => {
  const points = [
    new THREE.Vector3(0, 1, 30), new THREE.Vector3(0, 1, -30),
    new THREE.Vector3(30, 1, 0), new THREE.Vector3(-30, 1, 0),
  ];

  it('returns the point farthest from all occupied positions', () => {
    const occupied = [new THREE.Vector3(29, 1, 0)];  // near the (30,0) spawn
    const sp = getRandomSpawn(occupied, points);
    // farthest from (29,0) should be (-30,0)
    expect(sp.x).toBe(-30);
    expect(sp.z).toBe(0);
  });

  it('returns a clone, not a reference into the points array', () => {
    const sp = getRandomSpawn([], points);
    sp.x = 999;
    expect(points.some(p => p.x === 999)).toBe(false);
  });

  it('falls back to origin when points is empty', () => {
    const sp = getRandomSpawn([], []);
    expect(sp.x).toBe(0);
    expect(sp.z).toBe(0);
  });

  it('with no occupied players, returns the first spawn (all tie at nearest=Infinity)', () => {
    const sp = getRandomSpawn([], points);
    expect(sp.equals(points[0])).toBe(true);
  });
});
