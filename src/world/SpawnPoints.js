import * as THREE from 'three';

// Symmetrical spawn points around/above the arena.
export const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 30),
  new THREE.Vector3(0, 1, -30),
  new THREE.Vector3(30, 1, 0),
  new THREE.Vector3(-30, 1, 0),
  new THREE.Vector3(22, 1, 22),
  new THREE.Vector3(-22, 1, -22),
  new THREE.Vector3(22, 1, -22),
  new THREE.Vector3(-22, 1, 22),
  new THREE.Vector3(0, 4.5, 0),     // on top of central cover
  new THREE.Vector3(15, 1, 0),
  new THREE.Vector3(-15, 1, 0),
  new THREE.Vector3(0, 1, 15),
];

// Returns the spawn point farthest from all live (occupied) positions.
export function getRandomSpawn(occupied = []) {
  let best = SPAWN_POINTS[0];
  let bestDist = -1;
  for (const sp of SPAWN_POINTS) {
    let nearest = Infinity;
    for (const o of occupied) {
      const d = sp.distanceToSquared(o);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestDist) {
      bestDist = nearest;
      best = sp;
    }
  }
  return best.clone();
}
