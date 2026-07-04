import { describe, it, expect } from 'vitest';
import { ColliderStore } from '../world/ColliderStore.js';
import * as THREE from 'three';

describe('ColliderStore.clear()', () => {
  it('empties the boxes array', () => {
    const cs = new ColliderStore();
    cs.addBox(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
    cs.addBox(new THREE.Vector3(5, 0, 5), new THREE.Vector3(7, 2, 7));
    expect(cs.boxes.length).toBe(2);
    cs.clear();
    expect(cs.boxes.length).toBe(0);
  });

  it('removes raycast hits after clear', () => {
    const cs = new ColliderStore();
    cs.addBox(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
    cs.clear();
    const hit = cs.raycast(new THREE.Vector3(-5, 1, 1), new THREE.Vector3(1, 0, 0), 100);
    expect(hit).toBeNull();
  });
});
