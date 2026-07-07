import * as THREE from 'three';
import { boxMesh, coneMesh, cylMesh } from './_shared.js';

// Treehouse/Canopy themed prop factories (for the Canopy map). Each returns
// { group, boxes } following the same contract as Village.js/PalmTree.js, but
// for these Canopy props `boxes` is ALWAYS empty: they are decorative-only and
// layer on top of the collidable place() footprint boxes the map's build()
// authors separately (e.g. the trunk's collider is the map's place() box).
//
// All builders are deterministic (no Math.random without a seed).

// A chunky low-poly canopy cap for a giant tree: 3 stacked cones reading as the
// forest ceiling. Decorative-only (no .boxes) — the trunk's collider is the
// map's place() footprint box.
export function canopyFoliage({
  baseY = 0,
  height = 8,
  radius = 6,
  color = 0x2a5a3a,
  tint = 0x3a7a4a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'canopyFoliage';
  // Lower wide dome.
  group.add(coneMesh(radius, height * 0.5, color, 0, baseY + height * 0.25, 0, 8));
  // Mid tier (smaller, tinted lighter).
  group.add(coneMesh(radius * 0.75, height * 0.4, tint, 0, baseY + height * 0.55, 0, 8));
  // Top tuft.
  group.add(coneMesh(radius * 0.45, height * 0.3, color, 0, baseY + height * 0.85, 0, 7));
  return { group, boxes: [] };
}

// A small treehouse room: open-doored box walls + a peaked leaf roof. Sits on a
// platform; its own .boxes is empty (the platform/walls are the map's colliders).
export function treehouseInterior({
  baseY = 0,
  wallColor = 0x6a4a2a,
  roofColor = 0x2a5a3a,
  w = 4, d = 4, wallH = 2.4,
} = {}) {
  const group = new THREE.Group();
  group.name = 'treehouse';
  const t = 0.2; // wall thickness
  // Back + 2 side walls (leave the front open as a doorway).
  group.add(boxMesh(w, wallH, t, wallColor, 0, baseY + wallH / 2, -d / 2));
  group.add(boxMesh(t, wallH, d, wallColor, -w / 2, baseY + wallH / 2, 0));
  group.add(boxMesh(t, wallH, d, wallColor,  w / 2, baseY + wallH / 2, 0));
  // Peaked leaf roof: two angled slabs.
  const pitch = wallH * 0.5;
  const slopeLen = Math.sqrt((w / 2) ** 2 + pitch ** 2) + 0.4;
  const ang = Math.atan2(pitch, w / 2);
  const left = boxMesh(0.25, slopeLen, d + 0.4, roofColor);
  left.rotation.z = ang;
  left.position.set(-w / 4, baseY + wallH + pitch / 2, 0);
  group.add(left);
  const right = boxMesh(0.25, slopeLen, d + 0.4, roofColor);
  right.rotation.z = -ang;
  right.position.set(w / 4, baseY + wallH + pitch / 2, 0);
  group.add(right);
  return { group, boxes: [] };
}

// A glowing lantern — the "lit = safe route" visual cue. Emissive material, NOT
// a real THREE light source (WebGL light budget stays at hemisphere+sun).
export function lantern({
  baseY = 0,
  postColor = 0x2a2a2a,
  glowColor = 0xffcf6a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'lantern';
  // Short post (6-segment flat-shaded cylinder via the shared helper).
  group.add(cylMesh(0.06, 0.06, 0.6, postColor, 0, baseY + 0.3, 0, 6));
  // Lamp body — emissive so it reads as glowing even under flat lighting.
  const lampMat = new THREE.MeshStandardMaterial({
    color: glowColor, emissive: glowColor, emissiveIntensity: 1.2, flatShading: true, roughness: 0.6,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.22), lampMat);
  lamp.position.set(0, baseY + 0.75, 0);
  lamp.castShadow = false; lamp.receiveShadow = false;
  group.add(lamp);
  // Tiny cap.
  group.add(coneMesh(0.18, 0.14, postColor, 0, baseY + 0.95, 0, 4));
  return { group, boxes: [] };
}

// Frayed rope strands running along both long edges of a walkway. Walkways are
// authored along the X axis (length = w). Decorative-only.
export function ropeStrands({
  baseY = 0, w = 8, d = 1.6, color = 0xb89a5a, strands = 3,
} = {}) {
  const group = new THREE.Group();
  group.name = 'rope';
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });
  const edgeZ = d / 2 + 0.04;
  for (const sz of [edgeZ, -edgeZ]) {
    for (let i = 0; i < strands; i++) {
      const x = -w / 2 + (i + 0.5) * (w / strands);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), mat);
      seg.rotation.z = Math.PI / 2; // lay along X
      seg.position.set(x, baseY + 0.3, sz);
      group.add(seg);
    }
  }
  return { group, boxes: [] };
}

// Rivet studs across a metal catwalk surface (a grid of tiny dark cylinders).
// Walkways are authored along the X axis (length = w). Decorative-only.
export function metalRivets({
  baseY = 0, w = 8, d = 1.6, color = 0x2a2a30, cols = 4, rows = 2,
} = {}) {
  const group = new THREE.Group();
  group.name = 'rivets';
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.6 });
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const z = -d / 2 + (r + 0.5) * (d / rows);
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6), mat);
      stud.position.set(x, baseY + 0.05, z);
      stud.castShadow = false; stud.receiveShadow = true;
      group.add(stud);
    }
  }
  return { group, boxes: [] };
}
