import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';
import { makeBuildHelper } from '../MapBuildHelper.js';
import { canopyFoliage, treehouseInterior, lantern, ropeStrands, metalRivets } from '../props/Treehouse.js';
import { Clouds } from '../../fx/Clouds.js';

// Canopy — a high-altitude treehouse arena on towering ancient trees. Players
// fight across stacked platforms and varied suspended walkways (planks, rope,
// metal). Parkour-friendly: narrow ledges + skill gaps reward movement; falling
// off any structure is instant death (killY). The trees are so tall the ground
// never renders — the void below is fog-occluded and IS the death mechanic.
//
// 180°-rotational symmetry via placePair (no-op mirror when x===0 && z===0).
// authorGeometry is authored ONCE and run in two modes: client build() (meshes)
// and server colliderBoxes (AABBs). Headless-safe: no document/mesh touched
// at module load except the collider pass.

const COLORS = {
  bark:    0x4a3a26,   // mossy dark bark
  barkLit: 0x5a4a30,   // lighter bark highlight
  moss:    0x3a5a36,   // trunk moss accent
  plank:   0x7a5a38,   // weathered walkway planks (safe routes)
  plankDark: 0x5a4028, // older planks
  rope:    0xb89a5a,   // rope bridge strands
  metal:   0x6a6a72,   // catwalk metal
  leaf:    0x2a5a3a,   // canopy foliage
  leafLit: 0x3a7a4a,   // lighter foliage tier
  wall:    0x6a4a2a,   // treehouse walls
  lantern: 0xffcf6a,   // safe-route lantern glow
  rail:    0x4a3220,   // dark guardrail posts/trim (contrasts with the deck)
  railTop: 0x8a6a44,   // lighter rail cap (reads against sky)
};

// Satellite half-set: each site mirrors to (-x,-z) for 4 total (N/S/E/W).
const SAT_SITES = [
  { x:  0, z: 28 },   // north satellite (mirror -> south)
  { x: 28, z: 0 },    // east satellite (mirror -> west)
];

// Platform heights.
const Y = { LOW: 30, MID: 37, HIGH: 44, TOP: 51, SAT_UPPER: 40, CATWALK: 26, RING: 34 };

// Guardrail dimensions. Rails are low collidable walls (1.1m tall) along the
// edges of SAFE surfaces (decks + spokes) so a careless player can't walk off
// into the void. Deliberately short enough to hop or shoot over intentionally.
// Risky routes (catwalks, skill-gap ledges, ring bridges) stay UN-railed.
// RAIL_T is generous (0.25m) so the rail reads clearly as a visible wall, not a
// sub-pixel lip — on a fall-means-death map the safe-route cue must be obvious.
const RAIL_H = 1.1;
const RAIL_T = 0.25;
// Rail posts: a darker vertical pillar every few meters along the rail, giving
// the railing a clear "balustrade" silhouette against the sky.
const POST_H = 1.3;
const POST_T = 0.18;
const POST_SPACING = 2.5;

// Staggered-height spawns across platforms/walkways (anti-camp). None on the
// king's top deck (no free power-position spawns).
const SPAWN_POINTS = [
  // Satellite lowers (y≈30). x/z=22 sits on the spoke near the satellite.
  new THREE.Vector3(0, 31, 22), new THREE.Vector3(0, 31, -22),
  new THREE.Vector3(22, 31, 0), new THREE.Vector3(-22, 31, 0),
  // King MID/HIGH decks (10-wide, centered at 0 -> spans [-5,5]; top at
  // y+0.3). Spawn y is the deck top + ~0.7 so the player stands on it, not
  // drops onto the deck below.
  new THREE.Vector3(3, Y.MID + 0.7, 3),  new THREE.Vector3(-3, Y.MID + 0.7, -3),
  new THREE.Vector3(3, Y.HIGH + 0.7, -3), new THREE.Vector3(-3, Y.HIGH + 0.7, 3),
  // Satellite uppers (5-wide platform centered at 28 -> spans [25.5,30.5];
  // top at SAT_UPPER+0.3). x/z=28 centers the player on the platform.
  new THREE.Vector3(0, Y.SAT_UPPER + 0.7, 28), new THREE.Vector3(0, Y.SAT_UPPER + 0.7, -28),
  new THREE.Vector3(28, Y.SAT_UPPER + 0.7, 0), new THREE.Vector3(-28, Y.SAT_UPPER + 0.7, 0),
];

// Waypoints ONLY on safe walkable surfaces (spokes + ring + king hub). Bots
// stay on lit routes; risky shortcuts are player-only. Every waypoint MUST sit
// on an actual collidable surface at the right height — otherwise bots pathing
// to it walk off into the void (see the ring-bridge span below).
const WAYPOINTS = [
  // King hub at each level.
  new THREE.Vector3(0, Y.LOW, 0), new THREE.Vector3(0, Y.MID, 0),
  // Spoke midpoints (king<->satellite). Spokes are 3-wide, length 28, centered
  // at 14 — so x/z=14 is the spoke midpoint.
  new THREE.Vector3(0, Y.LOW, 14), new THREE.Vector3(0, Y.LOW, -14),
  new THREE.Vector3(14, Y.LOW, 0), new THREE.Vector3(-14, Y.LOW, 0),
  // Satellite lowers (6-wide platform centered at 28).
  new THREE.Vector3(0, Y.LOW, 28), new THREE.Vector3(0, Y.LOW, -28),
  new THREE.Vector3(28, Y.LOW, 0), new THREE.Vector3(-28, Y.LOW, 0),
  // Ring-bridge midpoints. Each ring half-bridge is a 10-long box centered at
  // (ax/2, az/2) = (±10, ±10), so the midpoint (±10, ±10) sits ON the bridge.
  new THREE.Vector3(10, Y.RING, 10), new THREE.Vector3(-10, Y.RING, -10),
  new THREE.Vector3(10, Y.RING, -10), new THREE.Vector3(-10, Y.RING, 10),
];

// Author the geometry once. `place`/`placePair` come from the caller — either
// mesh-based (client build) or AABB-based (server colliderBoxes).
function authorGeometry(place, placePair) {
  // --- KING TREE (center, own mirror) ---
  // Trunk: a tall thin box from deep in the fog up past the top platform.
  place(3, 56, 3, COLORS.bark, 0, 28, 0, 'wood');
  // 4 stacked platform decks.
  for (const y of [Y.LOW, Y.MID, Y.HIGH, Y.TOP]) {
    place(10, 0.6, 10, COLORS.plank, 0, y, 0, 'planks');
    // Guardrails around the deck edge — a safe-route surface shouldn't drop a
    // careless player into the void. The king deck is centered (its own 180°
    // mirror) so buildDeckRailing uses place() for its 4 edges.
    buildDeckRailing(place, placePair, 0, y, 10);
  }
  // Internal stair-steps connecting king levels (1m rise each — hop-up ladder).
  // A diagonal run of small boxes from LOW -> MID -> HIGH -> TOP. placePair
  // stamps the 180° twin so the ascent is reachable from BOTH halves of the
  // king deck (FFA fairness — otherwise only the +z face could climb).
  for (let lvl = 0; lvl < 3; lvl++) {
    const baseY = [Y.LOW, Y.MID, Y.HIGH][lvl];
    const nextY = [Y.MID, Y.HIGH, Y.TOP][lvl];
    const steps = Math.round((nextY - baseY) / 1);
    for (let s = 1; s <= steps; s++) {
      const yy = baseY + s * 1;
      const xx = -3.5 + s * (3 / steps);
      placePair(1.4, 0.3, 1.4, COLORS.plankDark, xx, yy, 3, 'planks');
    }
  }

  // --- SATELLITE TREES (4 via half-set) ---
  for (const s of SAT_SITES) {
    buildSatellite(place, placePair, s.x, s.z);
  }

  // --- SPOKES: safe wide planks king<->satellite at y=LOW (lantern-lit in build) ---
  buildSpoke(placePair, 0, 28);   // north/south
  buildSpoke(placePair, 28, 0);   // east/west

  // --- RING: medium rope bridges satellite<->satellite at y≈34 ---
  buildRingBridge(placePair, 20, 20);   // NE/SW
  buildRingBridge(placePair, 20, -20);  // SE/NW

  // --- STEALTH CATWALKS: under-ring metal grates at y=CATWALK ---
  buildCatwalk(placePair, 20, 20);
  buildCatwalk(placePair, 20, -20);

  // --- SKILL-GAP SHORTCUTS: narrow unlit ledges cutting diagonals at y=MID ---
  buildShortcut(placePair, 10, 10);
  buildShortcut(placePair, 10, -10);
}

// One satellite tree: trunk + lower platform + upper treehouse platform.
// placePair stamps the 180° twin at (-x,-z).
function buildSatellite(place, placePair, cx, cz) {
  // Trunk.
  placePair(2.4, 48, 2.4, COLORS.bark, cx, 24, cz, 'wood');
  // Lower platform (matches spoke height).
  placePair(6, 0.6, 6, COLORS.plank, cx, Y.LOW, cz, 'planks');
  buildDeckRailing(place, placePair, cx, Y.LOW, 6, cz);
  // Upper platform (treehouse sits here in build()).
  placePair(5, 0.6, 5, COLORS.plank, cx, Y.SAT_UPPER, cz, 'planks');
  buildDeckRailing(place, placePair, cx, Y.SAT_UPPER, 5, cz);
  // Stair-steps up the trunk from LOW -> SAT_UPPER.
  const steps = Math.round((Y.SAT_UPPER - Y.LOW) / 1);
  for (let s = 1; s <= steps; s++) {
    const yy = Y.LOW + s * 1;
    const off = -2 + s * (1.5 / steps);
    placePair(1.2, 0.3, 1.2, COLORS.plankDark, cx + off, yy, cz, 'planks');
  }
}

// Spoke: wide safe plank king(0,0)<->satellite(cx,cz) at y=LOW.
function buildSpoke(placePair, cx, cz) {
  // Length = distance from origin to (cx,cz). Author as a box centered at midpoint.
  const len = Math.hypot(cx, cz);
  const mx = cx / 2, mz = cz / 2;
  // Orient: place a thin long box. For axis-aligned spokes (cardinal), w=len d=3.
  // cx or cz is 0 for our cardinals, so this simplifies to axis-aligned.
  if (cz === 0) {
    placePair(len, 0.5, 3, COLORS.plank, mx, Y.LOW, 0, 'planks');
    // Rails along both long edges (the z=±1.5 edges) — a safe route shouldn't
    // drop players; rails make strafing across a spoke survivable.
    buildEdgeRails(placePair, mx, Y.LOW + 0.25, 0, len, 'x');
  } else {
    placePair(3, 0.5, len, COLORS.plank, 0, Y.LOW, mz, 'planks');
    buildEdgeRails(placePair, 0, Y.LOW + 0.25, mz, len, 'z');
  }
}

// Guardrails around a square deck's 4 edges. `cx`,`cz` = deck center, `baseY` =
// deck CENTER y (the deck is authored as place(size, 0.6, size, ..., cx, baseY, cz),
// so its top is at baseY+0.3). `size` = full deck side length. For a centered
// deck (cx===0 && cz===0, the king) each edge is its own 180° partner so we use
// place(); for off-center satellite decks we use placePair() to also stamp the
// twin. Each edge = a long rail cap + evenly-spaced darker posts (a balustrade).
function buildDeckRailing(place, placePair, cx, baseY, size, cz = 0) {
  const usePair = (cx !== 0 || cz !== 0);
  // No texture name: rails render as solid colored boxes so their distinct
  // railTop/rail colors actually show against the textured deck (a textured box
  // would inherit the deck's wood map and the rail would vanish into the deck).
  const stamp = (w, h, d, color, x, y, z) =>
    usePair ? placePair(w, h, d, color, x, y, z) : place(w, h, d, color, x, y, z);
  const half = size / 2;
  const topY = baseY + 0.3;          // deck slab top (0.6-tall deck, baseY is its center)
  const capY = topY + RAIL_H / 2;    // rail cap centered above the deck top
  const postY = topY + POST_H / 2;   // posts rise slightly above the cap
  const ext = size + RAIL_T;         // rails span the full edge + a hair of overhang
  // Long rail caps along each edge (the visible top rail, lighter color).
  stamp(ext, RAIL_H, RAIL_T, COLORS.railTop, cx, capY, cz + half);
  stamp(ext, RAIL_H, RAIL_T, COLORS.railTop, cx, capY, cz - half);
  stamp(RAIL_T, RAIL_H, ext, COLORS.railTop, cx + half, capY, cz);
  stamp(RAIL_T, RAIL_H, ext, COLORS.railTop, cx - half, capY, cz);
  // Darker posts spaced along each edge for a clear balustrade silhouette.
  for (let p = -half + POST_SPACING / 2; p < half; p += POST_SPACING) {
    stamp(POST_T, POST_H, POST_T, COLORS.rail, cx + p, postY, cz + half);
    stamp(POST_T, POST_H, POST_T, COLORS.rail, cx + p, postY, cz - half);
    stamp(POST_T, POST_H, POST_T, COLORS.rail, cx + half, postY, cz + p);
    stamp(POST_T, POST_H, POST_T, COLORS.rail, cx - half, postY, cz + p);
  }
}

// Two parallel guardrails along a walkway's long edges. `cx`,`cz` = walkway
// center, `y` = rail center y, `len` = walkway length, `axis` = 'x' or 'z' (the
// direction the length runs). Rails sit at ±1.5 (half the 3-wide walkway) on the
// cross axis. placePair stamps the 180° twin. Each edge = a long cap + posts.
// No texture: solid colors render the rail distinctly against the wood deck.
function buildEdgeRails(placePair, cx, y, cz, len, axis) {
  const half = 1.5; // walkway half-width (spokes are 3 wide)
  const postY = y + (POST_H - RAIL_H) / 2; // posts rise above the cap
  if (axis === 'x') {
    // length runs along X; rails long-along-X, thin along Z, at z = cz ± half
    placePair(len, RAIL_H, RAIL_T, COLORS.railTop, cx, y, cz + half);
    placePair(len, RAIL_H, RAIL_T, COLORS.railTop, cx, y, cz - half);
    for (let p = -len / 2 + POST_SPACING / 2; p < len / 2; p += POST_SPACING) {
      placePair(POST_T, POST_H, POST_T, COLORS.rail, cx + p, postY, cz + half);
      placePair(POST_T, POST_H, POST_T, COLORS.rail, cx + p, postY, cz - half);
    }
  } else {
    // length runs along Z; rails long-along-Z, thin along X, at x = cx ± half
    placePair(RAIL_T, RAIL_H, len, COLORS.railTop, cx + half, y, cz);
    placePair(RAIL_T, RAIL_H, len, COLORS.railTop, cx - half, y, cz);
    for (let p = -len / 2 + POST_SPACING / 2; p < len / 2; p += POST_SPACING) {
      placePair(POST_T, POST_H, POST_T, COLORS.rail, cx + half, postY, cz + p);
      placePair(POST_T, POST_H, POST_T, COLORS.rail, cx - half, postY, cz + p);
    }
  }
}

// Ring bridge: medium rope bridge between two satellites at y≈34.
// (ax,az)-(bx,bz) is the diagonal; here authored as a box spanning the diagonal
// midpoint with approximate axis-aligned extents (good enough for collision).
function buildRingBridge(placePair, ax, az) {
  // One half-bridge from the (ax,az) satellite toward the center, at ring
  // height. placePair stamps its 180° twin toward the (-ax,-az) satellite, so
  // the two halves meet at the origin and players cross at Y.RING.
  placePair(10, 0.4, 2, COLORS.plankDark, ax / 2, Y.RING, az / 2, 'planks');
}

// Stealth catwalk: thin metal grate under the ring at y=CATWALK.
function buildCatwalk(placePair, ax, az) {
  placePair(9, 0.3, 1.2, COLORS.metal, ax / 2, Y.CATWALK, az / 2, 'metal');
}

// Skill-gap shortcut: a series of narrow unlit ledges with ~1.3m gaps.
function buildShortcut(placePair, ax, az) {
  // 3 tiny perches along the diagonal toward center, each a 1m ledge.
  for (const f of [0.75, 0.55, 0.35]) {
    placePair(1.0, 0.3, 1.0, COLORS.plankDark, ax * f, Y.MID, az * f, 'planks');
  }
}

// ---------------------------------------------------------------------------
// build() — client render: meshes from authorGeometry + all NON-collidable
// decorative visuals (canopy foliage, treehouse interiors, lanterns, rope
// strands, rivets, clouds, contact shadows).
function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (w, h, d, color, x, y, z, texName, texOpts) => {
    const m = helper.box(w, h, d, color, x, y, z, texName, texOpts);
    group.add(m); colliders.addFromMesh(m);
  };
  const placePair = (w, h, d, color, x, y, z, texName, texOpts) => {
    place(w, h, d, color, x, y, z, texName, texOpts);
    if (x !== 0 || z !== 0) place(w, h, d, color, -x, y, -z, texName, texOpts);
  };
  authorGeometry(place, placePair);

  // KING CANOPY — foliage cap atop the king trunk (decorative).
  { const { group: g } = canopyFoliage({ baseY: 52, height: 10, radius: 7, color: COLORS.leaf, tint: COLORS.leafLit });
    group.add(g); }

  // SATELLITE CANOPIES + TREEHOUSE INTERIORS.
  for (const s of SAT_SITES) {
    for (const [sx, sz] of [[s.x, s.z], [-s.x, -s.z]]) {
      { const { group: g } = canopyFoliage({ baseY: 44, height: 7, radius: 5, color: COLORS.leaf, tint: COLORS.leafLit });
        g.position.set(sx, 0, sz); group.add(g); }
      { const { group: g } = treehouseInterior({ baseY: Y.SAT_UPPER + 0.6, wallColor: COLORS.wall, roofColor: COLORS.leaf });
        g.position.set(sx, 0, sz); group.add(g); }
    }
  }

  // LANTERNS on safe routes (spokes): lit = safe cue. Half-set — each off-axis
  // site is mirrored to (-lx,-lz) by the loop; on-axis sites ([0,7]/[7,0]) are
  // their own 180° partners so they stamp only once.
  const lanternSites = [
    [0, 7], [0, 21],   // +Z half of the north/south spoke (-> mirrors to -Z)
    [7, 0], [21, 0],   // +X half of the east/west spoke (-> mirrors to -X)
  ];
  for (const [lx, lz] of lanternSites) {
    const { group: g } = lantern({ baseY: Y.LOW + 0.5, glowColor: COLORS.lantern });
    g.position.set(lx, 0, lz); group.add(g);
    if (lx !== 0 || lz !== 0) {
      const { group: gm } = lantern({ baseY: Y.LOW + 0.5, glowColor: COLORS.lantern });
      gm.position.set(-lx, 0, -lz); group.add(gm);
    }
  }

  // WALKWAY DETAIL — rope strands on ring bridges, rivets on catwalks.
  for (const s of SAT_SITES) {
    { const { group: g } = ropeStrands({ baseY: Y.RING, w: 10, d: 2 });
      g.position.set(s.x / 2, 0, s.z / 2); g.rotation.y = Math.atan2(s.z, s.x); group.add(g); }
    { const { group: g } = metalRivets({ baseY: Y.CATWALK, w: 9, d: 1.2 });
      g.position.set(s.x / 2, 0, s.z / 2); g.rotation.y = Math.atan2(s.z, s.x); group.add(g); }
  }

  // CLOUDS above the canopy for depth (drifting billboards).
  new Clouds(group, { count: 8, area: 160, height: 70, color: 0xffffff, opacity: 0.85 });

  // NOTE: no contactShadow() decals here. They are authored for flat-ground
  // maps (the decal is pinned to y=0.02, just above a ground slab). Canopy has
  // no ground — platforms float at y=30-51 above a fog void — so a ground-pinned
  // decal would sit 30m below the action, beneath the kill plane, invisible.

  scene.add(group);
  return group;
}

// Compute colliderBoxes at module load via the collider-only pass (no meshes).
const _colliderBoxes = [];
{
  const h = makeBuildHelper();
  const { place, placePair } = h.colliderPass(_colliderBoxes);
  authorGeometry(place, placePair);
}

export const CANOPY = new MapDefinition({
  id: 'canopy',
  name: 'Canopy',
  desc: 'High-altitude treehouse arena',
  palette: {
    sky: ['#3a6a9a', '#7a9ec0', '#c0d8e0', '#e8e8d8'],
    fog: 0xb8c8d8,
    fogDensity: 0.012,
    hemisphere: [0xb8d0e8, 0x4a3a2a],
    sunColor: 0xffe0b0,
    sunIntensity: 2.2,
  },
  killY: 12,
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
  colliderBoxes: _colliderBoxes,
});
