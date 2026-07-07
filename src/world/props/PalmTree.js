import * as THREE from 'three';
import { cylMesh, boxMesh, sphereMesh, shadeHex, boxAABB } from './_shared.js';

// A tropical palm tree prop (for the Tropic map). Composed from low-poly THREE
// primitives: a slightly tapered trunk, a crown of angled fronds, and a few
// coconuts. Deterministic — no Math.random (a fixed frond layout is used so the
// collider and the visual always agree).
//
// Returns { group, trunkBox }:
//   group     — THREE.Group containing the whole tree (trunk + fronds + coconuts)
//   trunkBox  — an AABB {min,max} describing the trunk collider at the LOCAL
//               origin. The fronds/coconuts are NON-collidable. The caller
//               translates both `group` and `trunkBox` by the same (x,z) offset.
export function palmTree({
  trunkColor = 0x8a6a44,
  leafColor = 0x2faa55,
  height = 7,
} = {}) {
  const group = new THREE.Group();
  group.name = 'palmTree';

  // --- Trunk: slightly tapered cylinder, low-poly (7 radial segments). ---
  const trunk = cylMesh(0.35, 0.5, height, trunkColor, 0, height / 2, 0, 7);
  group.add(trunk);

  // --- Crown: 6 fronds angled outward+downward in a palm silhouette. ---
  // Deterministic layout: 6 evenly-spaced azimuths, each frond is a flattened
  // box rotated to droop. `halfH` is the trunk's top Y.
  const halfH = height;
  const frondCount = 6;
  const frondLen = 3.2;
  const leafLight = shadeHex(leafColor, 0.12);
  for (let i = 0; i < frondCount; i++) {
    const az = (i / frondCount) * Math.PI * 2;
    // Each frond: a thin flat box, pivoted at the crown center, pointing outward.
    const frond = boxMesh(frondLen, 0.12, 0.7, i % 2 === 0 ? leafColor : leafLight);
    // Position the frond's pivot at the trunk top, then rotate so it extends
    // outward and tilts downward (palm droop). We parent the frond to a small
    // pivot group so rotation happens about the crown center, not the box center.
    const pivot = new THREE.Group();
    pivot.position.set(0, halfH, 0);
    pivot.rotation.y = az;
    // tilt down ~35° around the local X (now rotated by az) so the frond droops.
    pivot.rotation.x = -Math.PI / 180 * 35;
    // shift the frond out along its length so it sits at the pivot's edge
    frond.position.set(frondLen / 2, 0, 0);
    pivot.add(frond);
    group.add(pivot);
  }

  // --- Coconuts: a few small dark spheres tucked just under the crown. ---
  const coconutColor = shadeHex(trunkColor, -0.45);
  const coconutCount = 4;
  for (let i = 0; i < coconutCount; i++) {
    const az = (i / coconutCount) * Math.PI * 2 + Math.PI / 6;
    const r = 0.35;
    const coco = sphereMesh(0.18, coconutColor, Math.cos(az) * r, halfH - 0.15, Math.sin(az) * r, 6);
    group.add(coco);
  }

  // --- Trunk collider: a box approximating the cylinder footprint, full height. ---
  // Width/depth ~1.0 (wider than the trunk radius so players can't clip through).
  const trunkBox = boxAABB(1.0, height, 1.0);

  return { group, trunkBox };
}
