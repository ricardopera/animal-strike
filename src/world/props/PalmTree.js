import * as THREE from 'three';
import { cylMesh, boxMesh, sphereMesh, shadeHex, boxAABB } from './_shared.js';

// A tropical palm tree prop (for the Tropic map). Composed from low-poly THREE
// primitives:
//   - Segmented curved trunk (8 short cylinder segments stacked with a small
//     deterministic lean and twist, alternating trunk-color shades to read as
//     old leaf-base scarring).
//   - Crown of 8 palm fronds, each a thin central rib with ~12 leaflets
//     alternating left/right (a feather / fish-skeleton silhouette) drooping
//     downward ~42° with per-frond variation. Two leaflet-tone variants per
//     frond for visual depth.
//   - A cluster of 6 coconuts hanging in two rows just under the crown, each
//     with a tiny stem connecting to the crown center.
//
// Deterministic — no Math.random. A fixed frond layout + per-index trig
// functions drive every offset/twist, so the same opts always produce the same
// tree (verifiable in Props.test.js).
//
// Returns { group, trunkBox }:
//   group     — THREE.Group containing the whole tree (trunk + fronds + coconuts)
//   trunkBox  — an AABB {min,max} describing the trunk collider at the LOCAL
//               origin. The fronds/coconuts are NON-collidable. The Tropic map
//               deliberately registers its own collidable place() box at the
//               same (x,z) and ignores `trunkBox`, so the visual is free to
//               curve without breaking collision.
export function palmTree({
  trunkColor = 0x8a6a44,
  leafColor = 0x2faa55,
  height = 7,
} = {}) {
  const group = new THREE.Group();
  group.name = 'palmTree';

  // -----------------------------------------------------------------------
  // TRUNK — segmented, gently curved, with a small deterministic lean.
  //
  // Stack `trunkSegments` short cylinders. Each segment:
  //   - sits at y = (i+0.5) * segH, centered on x/z = (0,0) at the LOCAL origin
  //   - has its radius taper slightly from base→top (rBase → rTop)
  //   - is offset laterally by a tiny cumulative amount in a FIXED direction
  //     so the trunk leans as a whole (deterministic; not random)
  //   - is rotated around its Y axis by a small per-segment twist
  //   - uses an alternating shade (base / slightly lighter / slightly darker)
  //     so adjacent rings read as old leaf scars
  // The trunk's TOP edge is at y = height; the crown pivot sits exactly there.
  const trunkSegments = 8;
  const segH = height / trunkSegments;
  const rBase = 0.48;
  const rTop = 0.38;
  // Lean direction (deterministic — fixed XZ unit vector). Tiny per-segment
  // offsets accumulate to a ~4° lean over the trunk's height
  // (atan(0.48 / height) for height=7).
  const leanLen = 0.06; // lateral offset per segment in the lean direction
  const leanDx = 1.0;
  const leanDz = 0.35;
  const leanMag = Math.hypot(leanDx, leanDz);
  const leanUx = leanDx / leanMag;
  const leanUz = leanDz / leanMag;
  // Pre-compute alternating scar shades (base / lighter / darker).
  const trunkScarA = shadeHex(trunkColor, 0.10);   // sun-bleached ring
  const trunkScarB = shadeHex(trunkColor, -0.10);  // shadowed ring
  for (let i = 0; i < trunkSegments; i++) {
    const t = i / Math.max(1, trunkSegments - 1); // 0 at base, 1 at top
    // Slight taper (radius shrinks base→top), with a tiny ripple to suggest
    // growth bulges (irrational sin multiplier so adjacent segments don't
    // sync up — chosen for visual variety, not for any particular property).
    const radius = (rBase + (rTop - rBase) * t) + Math.sin(i * 1.7) * 0.025;
    // Cumulative lateral offset in the lean direction.
    const offset = (i + 1) * leanLen;
    const sx = leanUx * offset;
    const sz = leanUz * offset;
    // Small per-segment twist (radians) for an organic feel. Irrational
    // multiplier so adjacent segments don't sync up.
    const twist = Math.sin(i * 0.9) * 0.10;
    // Scar color cycles through 3 shades.
    const scarColor =
      i % 3 === 0 ? trunkColor : (i % 3 === 1 ? trunkScarA : trunkScarB);
    const seg = cylMesh(radius, radius, segH, scarColor, sx, (i + 0.5) * segH, sz, 8);
    seg.rotation.y = twist;
    group.add(seg);
  }
  // The crown pivot Y sits at the top of the trunk (halfH).
  const halfH = height;

  // -----------------------------------------------------------------------
  // FRONDS — 8 fronds, each a thin rib with ~12 leaflets.
  //
  // Layout: 8 evenly-spaced azimuths, each frond parented to a pivot Group
  // anchored at the trunk top. The pivot rotates around Y (azimuth) then tilts
  // down around its local X (~42° droop). Inside the pivot:
  //   - A central rib (thin elongated box) extends along +X from the pivot.
  //   - 12 leaflets (BoxGeometry 0.05 × 0.05 × leafLen) alternate left/right
  //     along the rib, sized like a feather (peak length mid-rib, taper at
  //     both ends). Each leaflet is tilted UP at the tip ~22° to suggest
  //     recurved droop.
  // Per-frond tone variation: 3 variants (base, light, dark) cycled so the
  // crown reads as a mix of young and older fronds.
  const frondCount = 8;
  const frondLen = 3.2;
  const ribW = 0.10;
  const ribH = 0.07;
  const leafletCount = 12;
  const maxLeafletLen = 0.62;
  // Mean droop angle + per-frond offset for variation.
  const droopMean = -Math.PI / 180 * 42;
  const droopJitter = Math.PI / 180 * 5;
  // Leaflet tip-up tilt (recurved droop).
  const leafletTipUp = Math.PI / 180 * 22;
  // Three leaf tones: base / +12% lighter / -10% darker. Mixed across the
  // crown so the silhouette reads as a mix of young and old fronds.
  const leafLight = shadeHex(leafColor, 0.12);
  const leafDark = shadeHex(leafColor, -0.10);
  const leafTones = [leafColor, leafLight, leafColor, leafDark, leafColor, leafLight, leafColor, leafDark];
  for (let i = 0; i < frondCount; i++) {
    const az = (i / frondCount) * Math.PI * 2;
    // Per-frond droop jitter — irrational multiplier so the 8 fronds don't
    // sync up into a regular pattern.
    const droop = droopMean + Math.sin(i * 1.31) * droopJitter;
    const tone = leafTones[i % leafTones.length];

    // Pivot at the trunk top; rotation: first around Y (azimuth), then around
    // local X (droop). Order matters in Euler — set z=0 explicitly so the
    // default XYZ order applies cleanly.
    const pivot = new THREE.Group();
    pivot.position.set(0, halfH, 0);
    pivot.rotation.set(droop, az, 0, 'YXZ');

    // Central rib: thin elongated box along +X, shifted so its BASE sits at
    // the pivot and it extends outward.
    const rib = boxMesh(frondLen, ribH, ribW, tone);
    rib.position.set(frondLen / 2, 0, 0);
    pivot.add(rib);

    // Leaflets: alternate ±Z along the rib, with feather-tapered lengths.
    for (let j = 0; j < leafletCount; j++) {
      const t = (j + 1) / (leafletCount + 1); // 0..1 along rib, skipping ends
      const xPos = t * frondLen;
      // Feather profile: leaflet length peaks mid-rib, tapers to both ends.
      const leafLen = maxLeafletLen * Math.sin(t * Math.PI);
      // Side: +1 = right, -1 = left. Slight darker tip tint as j → ends.
      const side = j % 2 === 0 ? 1 : -1;
      // Leaflet box: thin in X (depth along rib), thin in Y (height), long in
      // Z (length sticking out perpendicular to rib).
      const leaflet = boxMesh(0.05, 0.05, leafLen, tone);
      // Position the leaflet's center outward from the rib by ~leafLen/2 +
      // a small gap so it visibly emerges from the rib.
      const offsetZ = side * (leafLen / 2 + 0.04);
      leaflet.position.set(xPos, 0.01, offsetZ);
      // Tip-up rotation: rotate around the rib's local X axis. In Three.js's
      // right-handed frame, positive X rotation tilts +Z downward, so we use
      // −angle for side=+1 (and +angle for side=−1) to lift both tips skyward
      // — a recurved-droop silhouette.
      leaflet.rotation.x = -side * leafletTipUp;
      pivot.add(leaflet);
    }

    group.add(pivot);
  }

  // -----------------------------------------------------------------------
  // COCONUTS — a tight cluster of 6 hanging in two natural rows just under
  // the crown. Each coconut has a short stem (thin cylinder) connecting to
  // the crown center. Radius slightly larger than the old palm (0.22 vs
  // 0.18) so they're clearly visible at gameplay distance.
  const coconutColor = shadeHex(trunkColor, -0.45);
  const coconutR = 0.22;
  const stemR = 0.04;
  // Deterministic positions in a cluster (XZ offsets from crown center, with
  // two Y rows — the back row slightly lower).
  // Front row (3 coconuts, slightly forward), back row (3 coconuts, slightly
  // lower and offset).
  const coconutLayout = [
    // Front row at Y = halfH - 0.35
    { x:  0.18, y: halfH - 0.35, z:  0.32 },
    { x: -0.22, y: halfH - 0.40, z:  0.20 },
    { x:  0.04, y: halfH - 0.30, z: -0.20 },
    // Back row at Y = halfH - 0.55 (slightly lower, behind)
    { x:  0.10, y: halfH - 0.55, z:  0.05 },
    { x: -0.16, y: halfH - 0.50, z: -0.18 },
    { x:  0.24, y: halfH - 0.60, z: -0.04 },
  ];
  for (const c of coconutLayout) {
    // Short stem stub sitting on top of the coconut (a tiny visible nub that
    // reads as where the coconut attaches to the frond).
    const stemH = 0.18;
    const stem = cylMesh(stemR, stemR, stemH, coconutColor, c.x, c.y + coconutR + stemH / 2, c.z, 5);
    group.add(stem);
    // Coconut: sphere at the layout position.
    const coco = sphereMesh(coconutR, coconutColor, c.x, c.y, c.z, 7);
    group.add(coco);
  }

  // --- Trunk collider: a box approximating the cylinder footprint, full height. ---
  // Width/depth ~1.0 (wider than the trunk radius so players can't clip through).
  const trunkBox = boxAABB(1.0, height, 1.0);

  return { group, trunkBox };
}
