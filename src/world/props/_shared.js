import * as THREE from 'three';

// Small shared helpers for the themed prop factories (V6). Kept independent of
// MapBuildHelper so the prop modules are pure THREE factories — they don't pull
// in the texture cache or any map-specific coupling.

// A textured-or-flat PBR box at a local position. `flatShading` is on by default
// to match the low-poly look of the rest of the game. Casts shadows.
export function boxMesh(w, h, d, color, x = 0, y = 0, z = 0, { flatShading = true, roughness = 0.9 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, flatShading, roughness });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A PBR cylinder mesh (used for trunks, barrels, wells, wheels).
export function cylMesh(rTop, rBot, h, color, x = 0, y = 0, z = 0, segments = 12, { flatShading = true, roughness = 0.9 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, flatShading, roughness });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A PBR sphere mesh (used for coconuts, haystacks).
export function sphereMesh(r, color, x = 0, y = 0, z = 0, segments = 12, { flatShading = true, roughness = 0.9 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, flatShading, roughness });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, segments, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A PBR cone mesh (used for tree canopies, lantern caps).
export function coneMesh(r, h, color, x = 0, y = 0, z = 0, segments = 8, { flatShading = true, roughness = 0.9 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, flatShading, roughness });
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Color shading: amt<0 darkens, amt>0 lightens. Returns a hex int. (Local copy
// so props don't depend on MapBuildHelper.)
export function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

// Build a centered AABB box {min:[x,y,z], max:[x,y,z]} for a w×h×d volume sitting
// at the local origin (base on y=0, centered on x/z). Callers translate it.
export function boxAABB(w, h, d) {
  return {
    min: [-w / 2, 0, -d / 2],
    max: [w / 2, h, d / 2],
  };
}

// Return a NEW {min,max} AABB equal to `box` translated by (x, z); y is unchanged.
// Non-mutating: `box` is left untouched. Lets maps do
// `palm.boxes.map(b => translateBox(b, x, z))` cleanly when stamping colliders at
// world positions, without hand-rolling sign-prone index math per call site.
export function translateBox(box, x, z) {
  return {
    min: [box.min[0] + x, box.min[1], box.min[2] + z],
    max: [box.max[0] + x, box.max[1], box.max[2] + z],
  };
}
