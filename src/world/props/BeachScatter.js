import * as THREE from 'three';
import { cylMesh, sphereMesh, boxMesh, shadeHex } from './_shared.js';

// Beach scatter props for the Tropic map — small NON-collidable decorative
// pieces (beach grass tufts, driftwood logs, small rock accents, starfish,
// shells). Each builder returns { group } only — NO collider boxes. The
// caller adds the group directly to its render group; the colliders list is
// intentionally untouched (so scatter pieces never block player movement).
//
// All builders are deterministic: no Math.random. Variation comes from fixed
// per-index sin/cos multipliers so two calls produce identical structures.

// A small cluster of 3–4 thin pointed beach grass blades emerging from the
// sand. Bright yellow-green blades read as tropical beach grass tufts.
export function beachGrassTuft({
  bladeColor = 0xb8c84a,
  seed = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'beachGrassTuft';
  const blades = 4;
  for (let i = 0; i < blades; i++) {
    // Deterministic per-blade offsets and angles (no Math.random).
    const a = (i / blades) * Math.PI * 2 + Math.sin(seed + i * 1.7) * 0.4;
    const r = 0.10 + Math.sin(seed + i * 2.3) * 0.04;
    const h = 0.45 + Math.sin(seed + i * 0.9) * 0.10;
    const lean = Math.sin(seed + i * 1.3) * 0.22; // gentle outward lean (rad)
    // Thin pointed cone (3 radial segments) — base at y=0, tip at y=h.
    const blade = cylMesh(0.005, 0.025, h, bladeColor, Math.cos(a) * r, h / 2, Math.sin(a) * r, 3);
    blade.rotation.z = Math.cos(a) * lean;
    blade.rotation.x = -Math.sin(a) * lean;
    group.add(blade);
  }
  return { group };
}

// A short weathered driftwood log lying horizontally on the sand. A long
// thin cylinder + 2 slightly darker end stubs reads as a piece of sun-bleached
// driftwood. Deterministic orientation per `seed`.
export function driftwoodLog({
  woodColor = 0xa89072,
  seed = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'driftwoodLog';
  const len = 1.4 + Math.sin(seed) * 0.20;
  const r = 0.13;
  // Main log: cylinder lying on its side (rotated 90° around Z).
  const log = cylMesh(r, r * 1.05, len, woodColor, 0, r, 0, 8);
  log.rotation.z = Math.PI / 2;
  log.position.x = 0;
  group.add(log);
  // Two darker rings at the ends — reads as bark banding on the log.
  const ringColor = shadeHex(woodColor, -0.35);
  for (const sx of [-len / 2 + 0.06, len / 2 - 0.06]) {
    const ring = cylMesh(r * 1.08, r * 1.08, 0.04, ringColor, sx, r, 0, 8);
    ring.rotation.z = Math.PI / 2;
    group.add(ring);
  }
  // A tiny knob branch sticking up (deterministic placement from seed).
  const branchAngle = Math.sin(seed + 1.0) * 0.6;
  const branch = cylMesh(r * 0.35, r * 0.45, r * 1.6, shadeHex(woodColor, -0.15), 0, r + r * 0.8, 0, 6);
  branch.rotation.z = Math.PI / 2 - branchAngle;
  branch.position.set(Math.cos(seed) * r * 0.4, r, Math.sin(seed) * r * 0.4);
  group.add(branch);
  return { group };
}

// A small non-collidable beach rock accent: a cluster of 2–3 low-poly
// spheres/boxes in a rock tone, sized as a low scattered decoration. The
// Tropic map stamps several of these along the shoreline.
export function smallRock({
  rockColor = 0x7a7a6a,
  seed = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'smallRock';
  // 2–3 rock chunks in a tight cluster, alternating sphere/box shapes.
  const chunks = 2 + Math.floor((Math.sin(seed) + 1) * 1.0); // 2 or 3
  for (let i = 0; i < chunks; i++) {
    const a = (i / chunks) * Math.PI * 2 + seed * 0.7;
    const r = 0.18 + Math.sin(seed + i * 1.1) * 0.08;
    const radius = 0.22 + Math.sin(seed + i * 0.7) * 0.06;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = radius * 0.55;
    const tone = shadeHex(rockColor, Math.sin(seed + i * 2.0) * 0.10);
    // Alternate box (chunky) and sphere (rounded) rocks for variety.
    const mesh = (i % 2 === 0)
      ? boxMesh(radius * 1.8, radius * 1.2, radius * 1.5, tone, cx, cy, cz)
      : sphereMesh(radius, tone, cx, cy, cz, 7);
    group.add(mesh);
  }
  return { group };
}

// A tiny starfish: a flat 5-armed radial shape made of 5 thin elongated
// boxes. Decorative-only scatter prop.
export function starfish({
  color = 0xe8a890,
  seed = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'starfish';
  const armCount = 5;
  const armLen = 0.18;
  const armW = 0.05;
  const armH = 0.04;
  for (let i = 0; i < armCount; i++) {
    const a = (i / armCount) * Math.PI * 2 + Math.sin(seed + i * 0.7) * 0.05;
    const arm = boxMesh(armLen, armH, armW, color, Math.cos(a) * armLen / 2, armH / 2, Math.sin(a) * armLen / 2);
    arm.rotation.y = -a;
    group.add(arm);
  }
  // Small center disc.
  const center = boxMesh(armW * 1.2, armH, armW * 1.2, shadeHex(color, -0.18), 0, armH / 2, 0);
  group.add(center);
  return { group };
}