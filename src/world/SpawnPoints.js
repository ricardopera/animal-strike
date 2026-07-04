import * as THREE from 'three';

// Returns the spawn point farthest from all live (occupied) positions.
// `points` is the active map's spawnPoints array (THREE.Vector3[]).
// `occupied` is an array of THREE.Vector3 (live player positions).
export function getRandomSpawn(occupied = [], points) {
  if (!points || points.length === 0) return new THREE.Vector3(0, 1, 0);
  let best = points[0];
  let bestDist = -1;
  for (const sp of points) {
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
