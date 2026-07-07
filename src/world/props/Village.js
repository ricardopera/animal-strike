import * as THREE from 'three';
import { boxMesh, cylMesh, sphereMesh, shadeHex, boxAABB } from './_shared.js';
import { loadOrFallback } from '../../textures/AssetLoader.js';

// Medieval/village themed prop factories (for the Haven map). Each returns
// { group, boxes } where:
//   group — THREE.Group containing the prop's meshes
//   boxes — array of AABB {min,max} (LOCAL origin, base on y=0, centered x/z)
//           describing the collidable parts. Non-collidable decorative bits are
//           in `group` only. Callers translate both group and each box by (x,z).
//
// All builders are deterministic (no Math.random without a seed). Roofs are
// non-collidable by design — collision uses one simple footprint box per prop.

// A cozy cottage: 4 walls + a peaked gable roof + door + windows.
// Optional `wallTexture` / `roofTexture` (asset paths) are applied to the wall
// and roof materials via loadOrFallback (flat color is the fallback while the
// image loads, or in headless/test environments).
export function cottage({
  w = 6,
  d = 5,
  wallColor = 0xd8c39a,
  roofColor = 0x9a6b3f,
  wallTexture = null,
  roofTexture = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'cottage';
  const wallH = 3;
  const wallDark = shadeHex(wallColor, -0.12);

  // Walls: one solid box reads as the wall mass (cheap, and gives a clean collider).
  const walls = boxMesh(w, wallH, d, wallColor, 0, wallH / 2, 0);
  if (wallTexture) loadOrFallback(wallTexture, walls.material);
  group.add(walls);

  // Peaked gable roof: two angled boxes meeting at a central ridge (an upward
  // "^"). The roof sits on top of the walls; its peak runs along the Z axis.
  const roofThick = 0.3;
  const roofOverhang = 0.6;
  const roofSpan = w / 2 + roofOverhang; // half-width of the roof slope
  const roofPitch = wallH * 0.6;         // how tall the peak rises above the walls
  const roofLen = d + roofOverhang * 2;  // along the ridge (Z)
  // slope length (hypotenuse) of one roof half
  const slopeLen = Math.sqrt(roofSpan * roofSpan + roofPitch * roofPitch);
  const slopeAngle = Math.atan2(roofPitch, roofSpan);
  const roofY = wallH; // base of roof = top of walls
  // Left slope (x<0): rotate by -slopeAngle so it rises from the left eave UP
  // toward the central ridge. (Positive slopeAngle here would make it dip
  // toward the center — a valley/butterfly roof.)
  const left = boxMesh(roofThick, slopeLen, roofLen, roofColor);
  left.rotation.z = -slopeAngle;
  left.position.set(-roofSpan / 2, roofY + roofPitch / 2, 0);
  if (roofTexture) loadOrFallback(roofTexture, left.material);
  group.add(left);
  // Right slope (x>0): rotate by +slopeAngle so it rises from the right eave
  // UP toward the central ridge.
  const right = boxMesh(roofThick, slopeLen, roofLen, roofColor);
  right.rotation.z = slopeAngle;
  right.position.set(roofSpan / 2, roofY + roofPitch / 2, 0);
  if (roofTexture) loadOrFallback(roofTexture, right.material);
  group.add(right);

  // Door: a dark box on the +Z face.
  const door = boxMesh(1.1, 2.0, 0.1, shadeHex(wallColor, -0.55), 0, 1.0, d / 2 + 0.05);
  group.add(door);

  // Two windows: slightly inset lighter boxes flanking the door.
  const winColor = shadeHex(wallColor, 0.18);
  const winL = boxMesh(0.9, 0.9, 0.1, winColor, -1.8, 1.7, d / 2 + 0.05);
  const winR = boxMesh(0.9, 0.9, 0.1, winColor, 1.8, 1.7, d / 2 + 0.05);
  group.add(winL, winR);

  // Collider: ONE box = the full wall footprint (w×d×wallH). Roof is non-collidable.
  const boxes = [boxAABB(w, wallH, d)];
  return { group, boxes };
}

// A circular stone well: rim cylinder + inner water disc + two posts + pitched roof.
export function well({
  stoneColor = 0x9a9488,
  waterColor = 0x2a5a6a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'well';
  const rimH = 1.2;
  const rimR = 1.2;

  // Stone rim.
  const rim = cylMesh(rimR, rimR, rimH, stoneColor, 0, rimH / 2, 0, 16);
  group.add(rim);

  // Inner water disc (slightly below the rim top).
  const water = cylMesh(rimR - 0.15, rimR - 0.15, 0.1, waterColor, 0, rimH - 0.15, 0, 16);
  group.add(water);

  // Two posts on opposite sides of the rim.
  const postH = 1.6;
  const postColor = shadeHex(stoneColor, -0.3);
  const postL = cylMesh(0.1, 0.1, postH, postColor, -rimR + 0.15, rimH + postH / 2, 0, 6);
  const postR = cylMesh(0.1, 0.1, postH, postColor, rimR - 0.15, rimH + postH / 2, 0, 6);
  group.add(postL, postR);

  // Pitched roof over the posts: two angled boxes meeting at a central ridge
  // (an upward "^") running along Z. Rotation signs chosen so each slope rises
  // from its outer eave UP toward the center (positive slopeAngle on the right,
  // negative on the left) — the opposite signs would form a valley roof.
  const roofSpan = rimR + 0.3;
  const roofPitch = 0.9;
  const slopeLen = Math.sqrt(roofSpan * roofSpan + roofPitch * roofPitch);
  const slopeAngle = Math.atan2(roofPitch, roofSpan);
  const roofBaseY = rimH + postH;
  const left = boxMesh(0.2, slopeLen, rimR * 2 + 0.4, shadeHex(stoneColor, -0.1));
  left.rotation.z = -slopeAngle;
  left.position.set(-roofSpan / 2, roofBaseY + roofPitch / 2, 0);
  group.add(left);
  const right = boxMesh(0.2, slopeLen, rimR * 2 + 0.4, shadeHex(stoneColor, -0.1));
  right.rotation.z = slopeAngle;
  right.position.set(roofSpan / 2, roofBaseY + roofPitch / 2, 0);
  group.add(right);

  // Collider: one box approximating the rim footprint (~2.6×2.6×1.2).
  const boxes = [boxAABB(rimR * 2 + 0.2, rimH, rimR * 2 + 0.2)];
  return { group, boxes };
}

// A market stall: wooden frame (posts + crossbeams) + striped awning + counter table.
// Optional `awningTexture` is applied to the awning material (flat color otherwise).
export function marketStall({
  frameColor = 0x7a5a3a,
  awningColor = 0xc84a4a,
  awningTexture = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'marketStall';
  const stallW = 4;   // along X
  const stallD = 2.4; // along Z
  const postH = 2.6;
  const frameDark = shadeHex(frameColor, -0.2);

  // 4 posts at the corners.
  const halfW = stallW / 2, halfD = stallD / 2;
  const posts = [
    [-halfW, halfD], [halfW, halfD], [-halfW, -halfD], [halfW, -halfD],
  ];
  for (const [px, pz] of posts) {
    group.add(boxMesh(0.18, postH, 0.18, frameDark, px, postH / 2, pz));
  }
  // Crossbeams along the front and back tops.
  group.add(boxMesh(stallW, 0.18, 0.18, frameDark, 0, postH, halfD));
  group.add(boxMesh(stallW, 0.18, 0.18, frameDark, 0, postH, -halfD));

  // Striped awning: a thin angled box pitched toward the front (+Z).
  const awningPitch = 0.5;
  const awningLen = Math.sqrt(stallD * stallD + awningPitch * awningPitch);
  const awningAngle = Math.atan2(awningPitch, stallD);
  const awning = boxMesh(stallW + 0.4, 0.12, awningLen, awningColor, 0, postH + awningPitch / 2, 0);
  awning.rotation.x = awningAngle;
  if (awningTexture) loadOrFallback(awningTexture, awning.material);
  group.add(awning);
  // Stripe accents: two lighter bands across the awning (flat boxes on top).
  const stripeColor = shadeHex(awningColor, 0.55);
  for (const sx of [-1.1, 1.1]) {
    const stripe = boxMesh(0.4, 0.14, awningLen, stripeColor, sx, postH + awningPitch / 2 + 0.01, 0);
    stripe.rotation.x = awningAngle;
    group.add(stripe);
  }

  // Counter table.
  const tableH = 1.0;
  const table = boxMesh(stallW, tableH, stallD, frameColor, 0, tableH / 2, 0);
  group.add(table);

  // Collider: one box for the counter footprint.
  const boxes = [boxAABB(stallW, tableH, stallD)];
  return { group, boxes };
}

// A haystack: a flattened rounded shape in warm hay color.
export function haystack({
  color = 0xd8b44a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'haystack';

  // Flattened low-segment sphere reads as a rounded hay mound.
  const mound = sphereMesh(1.4, color, 0, 0.7, 0, 12);
  mound.scale.set(1.0, 0.6, 1.0); // squash vertically
  group.add(mound);

  // Collider: one short box footprint.
  const boxes = [boxAABB(2.4, 0.9, 2.4)];
  return { group, boxes };
}

// A tall banner pole: decorative landmark/height marker.
export function bannerPole({
  poleColor = 0x6a4a2a,
  bannerColor = 0x3a5a8a,
  bannerTexture = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'bannerPole';
  const poleH = 6;

  // Pole.
  const pole = cylMesh(0.12, 0.14, poleH, poleColor, 0, poleH / 2, 0, 8);
  group.add(pole);

  // Crossbar near the top.
  const cross = cylMesh(0.06, 0.06, 1.6, poleColor, 0, poleH - 0.5, 0, 6);
  cross.rotation.z = Math.PI / 2;
  group.add(cross);

  // Hanging banner (thin box) under the crossbar.
  const banner = boxMesh(1.4, 1.8, 0.06, bannerColor, 0, poleH - 0.5 - 1.8 / 2 - 0.05, 0);
  if (bannerTexture) loadOrFallback(bannerTexture, banner.material);
  group.add(banner);

  // Collider: one thin box for the pole (players can stand behind it).
  const boxes = [boxAABB(0.3, poleH, 0.3)];
  return { group, boxes };
}

// A wooden cart: box body + wheels. Decorative cover piece.
export function cart({
  woodColor = 0x8a6a44,
  wheelColor = 0x3a2a1a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'cart';
  const bodyW = 3.0, bodyH = 0.8, bodyD = 1.6;
  const wheelR = 0.55;
  const woodDark = shadeHex(woodColor, -0.2);

  // Cart body (raised on small wheels).
  const bodyY = wheelR + bodyH / 2;
  const body = boxMesh(bodyW, bodyH, bodyD, woodColor, 0, bodyY, 0);
  group.add(body);

  // 4 wheels (cylinders rotated to roll along Z) at the corners.
  const halfW = bodyW / 2 - 0.4, halfD = bodyD / 2 + 0.05;
  for (const [wx, wz] of [[-halfW, halfD], [halfW, halfD], [-halfW, -halfD], [halfW, -halfD]]) {
    const wheel = cylMesh(wheelR, wheelR, 0.12, wheelColor, wx, wheelR, wz, 12);
    wheel.rotation.x = Math.PI / 2; // axle along Z
    group.add(wheel);
  }
  // Side rails (a couple of thin dark slats on the body for detail).
  group.add(boxMesh(bodyW, 0.1, 0.1, woodDark, 0, bodyY + bodyH / 2, bodyD / 2));
  group.add(boxMesh(bodyW, 0.1, 0.1, woodDark, 0, bodyY + bodyH / 2, -bodyD / 2));

  // Collider: one box for the body footprint.
  const boxes = [boxAABB(bodyW, wheelR * 2 + bodyH, bodyD)];
  return { group, boxes };
}

// A wooden barrel: cylinder barrel. Scattered clutter.
export function barrel({
  color = 0x8a5a2a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'barrel';
  const r = 0.6, h = 1.1;

  // Slightly bulged barrel via a tapered cylinder (wider in the middle would need
  // a custom geometry; a straight cylinder reads fine at this scale).
  const body = cylMesh(r, r, h, color, 0, h / 2, 0, 14);
  group.add(body);

  // Two dark hoops for detail.
  const hoopColor = shadeHex(color, -0.45);
  const hoopTop = cylMesh(r + 0.02, r + 0.02, 0.08, hoopColor, 0, h - 0.12, 0, 14);
  const hoopBot = cylMesh(r + 0.02, r + 0.02, 0.08, hoopColor, 0, 0.12, 0, 14);
  group.add(hoopTop, hoopBot);

  // Collider: one box footprint.
  const boxes = [boxAABB(r * 2, h, r * 2)];
  return { group, boxes };
}
