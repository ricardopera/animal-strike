import * as THREE from 'three';

const _rayHit = new THREE.Vector3();

// Axis-aligned bounding boxes only. Collision resolution is axis-separated.
export class ColliderStore {
  constructor() {
    this.boxes = [];
  }
  addFromMesh(mesh) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.boxes.push(box);
    return box;
  }
  addBox(min, max) {
    const box = new THREE.Box3(min, max);
    this.boxes.push(box);
    return box;
  }
  // Resolve a vertical capsule (cylinder for collision purposes) position.
  // Returns { x, z, yBottom, onGround, hitCeiling } after pushing out along least-penetration axis.
  resolveCapsule(pos, radius, height) {
    // pos.y is the FEET position (bottom of capsule).
    // Treated as an AABB of size (2r x height x 2r) centered at (pos.x, pos.y+height/2, pos.z).
    const halfH = height / 2;
    const centerY = pos.y + halfH;
    let resolved = { x: pos.x, y: pos.y, z: pos.z, onGround: false, hitCeiling: false };
    // We resolve iteratively per-box: each box that overlaps pushes out along the
    // axis of least penetration. Multiple passes for stability.
    for (let pass = 0; pass < 2; pass++) {
      for (const box of this.boxes) {
        const minX = box.min.x, maxX = box.max.x;
        const minY = box.min.y, maxY = box.max.y;
        const minZ = box.min.z, maxZ = box.max.z;
        // player AABB extents
        const pMinX = resolved.x - radius, pMaxX = resolved.x + radius;
        const pMinY = resolved.y, pMaxY = resolved.y + height;
        const pMinZ = resolved.z - radius, pMaxZ = resolved.z + radius;
        // overlap test
        if (pMaxX <= minX || pMinX >= maxX) continue;
        if (pMaxY <= minY || pMinY >= maxY) continue;
        if (pMaxZ <= minZ || pMinZ >= maxZ) continue;
        // overlaps — compute penetration on each axis
        const penX = Math.min(pMaxX - minX, maxX - pMinX);
        const penY = Math.min(pMaxY - minY, maxY - pMinY);
        const penZ = Math.min(pMaxZ - minZ, maxZ - pMinZ);
        const penMin = Math.min(penX, penY, penZ);
        if (penMin === penY) {
          // resolve vertically
          if (halfH + (resolved.y - (resolved.y)) < (minY + maxY) / 2) {
            // player center below box center -> push down (we landed on top -> push up actually)
          }
          // Determine direction: if player center is above box center, push up; else push down.
          if (resolved.y + halfH > (minY + maxY) / 2) {
            resolved.y = maxY; // land on top
            resolved.onGround = true;
          } else {
            resolved.y = minY - height; // hit ceiling from below
            resolved.hitCeiling = true;
          }
        } else if (penMin === penX) {
          if (resolved.x > (minX + maxX) / 2) resolved.x = maxX + radius;
          else resolved.x = minX - radius;
        } else {
          if (resolved.z > (minZ + maxZ) / 2) resolved.z = maxZ + radius;
          else resolved.z = minZ - radius;
        }
      }
    }
    return resolved;
  }
  /**
   * Ray vs axis-aligned boxes. Returns the nearest hit within maxDist, or null.
   * NOTE: `dir` MUST be a normalized (unit) vector — the returned `dist` and the
   * maxDist comparison are only meaningful in world units when dir is unit-length.
   */
  raycast(origin, dir, maxDist = 1000) {
    const ray = new THREE.Ray(origin, dir);
    let best = null;
    for (const box of this.boxes) {
      const hit = ray.intersectBox(box, _rayHit);
      if (hit) {
        const dist = origin.distanceTo(hit);
        if (dist <= maxDist && (!best || dist < best.dist)) {
          best = { dist, point: hit.clone(), box };
        }
      }
    }
    return best;
  }
}
