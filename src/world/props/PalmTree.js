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
  // FRONDS — each frond is ONE long leaf blade that arches downward, built
  // from a chain of short tapered segments. Each successive segment is
  // rotated a few more degrees downward, so the whole blade curves from the
  // crown out and then down (a coconut-palm silhouette), instead of a stiff
  // rib with perpendicular leaflets.
  //
  // Layout: 8 fronds on evenly-spaced azimuths. Each frond is parented to a
  // pivot Group anchored at the trunk top; the pivot sets the azimuth (Y) and
  // the initial outward tilt (X, the "takeoff" angle). Inside the pivot, a
  // nested chain of segment Groups composes the curve: each child segment is
  // positioned at the tip of the previous one and tilted down a bit more, so
  // the cumulative rotation grows toward the frond tip.
  // Per-frond tone variation: 3 variants (base, light, dark) cycled so the
  // crown reads as a mix of young and older fronds.
  const frondCount = 8;
  const segCount = 6;            // segments per frond (more = smoother curve)
  const segLen = 0.62;           // length of each segment along local +X
  // How much each segment droops relative to the previous one (radians). A
  // gentle, increasing curve: a bit at the base, more toward the tip.
  const segDroopStep = Math.PI / 180 * 11;
  // The blade's width (Z) tapers from base to tip; height (Y) stays slim.
  const bladeWBase = 0.42;
  const bladeWTip = 0.10;
  const bladeH = 0.05;
  // Mean takeoff angle (the pivot's X tilt) + per-frond jitter so the 8 fronds
  // don't all leave the crown at the identical angle. Negative = pointing
  // outward and slightly up before the curve pulls the tip down.
  const takeoffMean = -Math.PI / 180 * 18;
  const takeoffJitter = Math.PI / 180 * 8;
  // Three leaf tones: base / +12% lighter / -10% darker. Mixed across the
  // crown so the silhouette reads as a mix of young and old fronds.
  const leafLight = shadeHex(leafColor, 0.12);
  const leafDark = shadeHex(leafColor, -0.10);
  const leafTones = [leafColor, leafLight, leafColor, leafDark, leafColor, leafLight, leafColor, leafDark];
  for (let i = 0; i < frondCount; i++) {
    const az = (i / frondCount) * Math.PI * 2;
    // Per-frond takeoff jitter — irrational multiplier so the 8 fronds don't
    // sync up into a regular pattern.
    const takeoff = takeoffMean + Math.sin(i * 1.31) * takeoffJitter;
    const tone = leafTones[i % leafTones.length];

    // Pivot at the trunk top; rotation: first around Y (azimuth), then around
    // local X (takeoff tilt). Order matters in Euler — set z=0 explicitly so
    // the YXZ order applies cleanly.
    const pivot = new THREE.Group();
    pivot.position.set(0, halfH, 0);
    pivot.rotation.set(takeoff, az, 0, 'YXZ');

    // Build the curved blade as a chain: `link` is the current segment's
    // parent group; each iteration nests a new group at the previous tip and
    // tilts it down a bit more, then adds the blade box inside.
    let link = pivot;
    for (let j = 0; j < segCount; j++) {
      // Width tapers from base (j=0) to tip (j=segCount-1).
      const t = j / Math.max(1, segCount - 1);
      const w = bladeWBase + (bladeWTip - bladeWBase) * t;
      // The blade box for this segment: long in X, thin in Y, `w` wide in Z.
      const blade = boxMesh(segLen, bladeH, w, tone);
      blade.position.set(segLen / 2, 0, 0); // base at the link origin, extends +X
      link.add(blade);
      // Nested group for the next segment, positioned at THIS segment's tip
      // and tilted further downward so the curve accumulates.
      const next = new THREE.Group();
      next.position.set(segLen, 0, 0);
      // Each segment droops a little more than the one before it. A tiny
      // deterministic per-segment variation keeps the curve organic.
      next.rotation.x = -(segDroopStep + Math.sin(j * 1.7) * (Math.PI / 180 * 2));
      link.add(next);
      link = next;
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
