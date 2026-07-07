import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';
import { makeBuildHelper } from '../MapBuildHelper.js';
import { palmTree } from '../props/PalmTree.js';
import { WaterPlane } from '../../fx/WaterPlane.js';
import { Clouds } from '../../fx/Clouds.js';

// Tropic — a sunny tropical beach lagoon. A bright cyan sky over pale sand,
// a turquoise lagoon at the island's heart ringed by dense palms, tiki huts,
// rocks, a beached rowboat and beach umbrellas. A bright noon tropical palette.
//
// EVERY collidable element is a place()/placePair() box in authorGeometry (so it
// appears in BOTH the client render AND colliderBoxes — the server's Sim.js
// builds its colliders solely from colliderBoxes, headlessly). In build() we
// then layer the richer decorative props (palmTree fronds/coconuts, thatched
// tiki roofs, umbrella canopies, boat hull) at the SAME world positions; those
// props' own .boxes are deliberately ignored — the place() footprint box is the
// single source of collision.
//
// `authorGeometry` is authored ONCE and called in two modes:
//   - client build():  place/placePair allocate textured THREE.Meshes
//   - colliderBoxes:   place/placePair record world AABBs (server, headless)
// 180°-rotational symmetry via placePair (no-op mirror when x===0 && z===0).
//
// Headless-safe: authorGeometry + the module-load collider pass touch NO
// document and build NO meshes/props. palmTree()/WaterPlane/Clouds are invoked
// ONLY inside build().

const COLORS = {
  sand: 0xe8d9a8,        // bright pale beach sand
  sandShade: 0xd4be88,   // damp shore sand
  cliff: 0x8a8a7a,       // rocky/leafy perimeter foliage wall
  trunk: 0x8a6a44,       // palm trunk
  leaf: 0x2faa55,        // palm fronds
  rock: 0x7a7a6a,        // tropical rock (gray-green)
  hutPost: 0x6a4a2a,     // tiki hut timber
  hutWall: 0xc8a86a,     // woven palm wall
  hutRoof: 0x9a7a3a,     // thatched roof
  boatHull: 0x9a5a3a,    // rowboat wood
  boatBench: 0x6a4226,   // bench wood
  umbPole: 0x7a5a3a,     // umbrella pole
  umbA: 0xd83a3a,        // umbrella stripe A (red)
  umbB: 0xf0e8d0,        // umbrella stripe B (cream)
};

// ---------------------------------------------------------------------------
// PALM SITES — the authoritative palm roster.
//
// This is the HALF-set: every entry has x != 0 AND z != 0, so each site yields
// exactly TWO palms under 180°-rotational mirroring (site + its (-x,-z) twin).
// TOTAL PALMS = PALM_SITES.length * 2. The map authoring loops below read this
// array in BOTH authorGeometry (collidable trunk boxes) and build() (visual
// palmTree()), so the count is a single declarative source of truth.
//
// Coordinates are chosen to avoid spawn points, waypoints, the central lagoon,
// and the other cover pieces. Perimeter ring + corner clusters + scattered
// beach palms, all within the [-40,40] arena.
const PALM_SITES = [
  // --- Perimeter ring palms (8 sites -> 16 palms) lining the beach edge. ---
  // Each site is off-axis (x≠0 && z≠0) and no two sites are 180° rotational
  // twins of each other, so every site yields exactly 2 DISTINCT palms.
  { x: -34, z: -10 },   // west edge
  { x: -34, z: 16 },    // west edge
  { x: 36, z: 24 },     // east edge
  { x: -10, z: -34 },   // north edge
  { x: 16, z: -34 },    // north edge
  { x: -34, z: 34 },    // NW corner
  { x: 34, z: 34 },     // NE corner (mirror -> SW corner)
  { x: 20, z: 28 },     // toward NE interior

  // --- Corner / cluster palms (4 sites -> 8 palms) tightening the corners. ---
  { x: -30, z: 26 },    // NW cluster
  { x: 26, z: 30 },     // NE cluster
  { x: 36, z: -20 },    // SE edge (mirror -> west edge)
  { x: -22, z: -36 },   // SW edge (mirror -> NE edge)

  // --- Scattered beach palms (4 sites -> 8 palms) in open beach areas. ---
  { x: -20, z: 8 },     // west-mid beach
  { x: 22, z: -8 },     // east-mid beach
  { x: 8, z: 22 },      // toward lagoon south shore
  { x: 14, z: 36 },     // north shore (mirror -> south shore)
];

// Authoritative palm count, exported so a test can assert the ">= 30 palms"
// requirement directly: every half-site mirrors to exactly 2 palms.
// PALM_SITES is exported so the test can also verify that every half-site is
// off-axis and that no two half-sites are 180° rotational twins (which would
// stack two palms on the same spot — the count would look right but the trees
// wouldn't be visually distinct).
export const PALM_SITES_RO = PALM_SITES;
export const PALM_HALF_COUNT = PALM_SITES.length;
export const PALM_TOTAL_COUNT = PALM_SITES.length * 2;

// Variant heights/leaf tints per site index (purely visual; collider trunks are
// a uniform ~7m tall box, slightly generous so players can't clip through).
const PALM_HEIGHTS = [7, 7.5, 8, 6.5, 7.5, 8, 7, 6.5, 8, 7.5, 6.5, 7, 8, 7, 6.5, 7.5];
const PALM_LEAVES = [
  COLORS.leaf, 0x36b85f, 0x2a9a4f, 0x3cc066, 0x2faa55,
  0x289248, 0x3cb860, 0x33a85a, 0x2a9a50, 0x3ec068,
  0x2faa55, 0x36b060, 0x289a50, 0x33a85a, 0x2fae57, 0x36b060,
];

const SPAWN_POINTS = [
  // Cardinal beach ends (just inside the perimeter).
  new THREE.Vector3(0, 1, 34), new THREE.Vector3(0, 1, -34),
  new THREE.Vector3(34, 1, 0), new THREE.Vector3(-34, 1, 0),
  // Diagonal corners of the open beach.
  new THREE.Vector3(26, 1, 14), new THREE.Vector3(-26, 1, -14),
  new THREE.Vector3(26, 1, -14), new THREE.Vector3(-26, 1, 14),
  // Mid-beach points away from the central lagoon.
  new THREE.Vector3(14, 1, 0), new THREE.Vector3(-14, 1, 0),
  new THREE.Vector3(0, 1, 14), new THREE.Vector3(0, 1, -14),
];

const WAYPOINTS = [
  // Perimeter beach ring (near the cardinal gates).
  new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, -30),
  new THREE.Vector3(30, 0, 0), new THREE.Vector3(-30, 0, 0),
  // Diagonal lanes around the lagoon.
  new THREE.Vector3(20, 0, 20), new THREE.Vector3(-20, 0, -20),
  new THREE.Vector3(20, 0, -20), new THREE.Vector3(-20, 0, 20),
  // Tiki hut approaches / cover nodes.
  new THREE.Vector3(12, 0, 24), new THREE.Vector3(-12, 0, -24),
  new THREE.Vector3(24, 0, 12), new THREE.Vector3(-24, 0, -12),
  // Inner ring just outside the lagoon shore.
  new THREE.Vector3(16, 0, 0), new THREE.Vector3(-16, 0, 0),
];

// Author the geometry once. `place`/`placePair` come from the caller — either
// mesh-based (client build) or AABB-based (server colliderBoxes).
function authorGeometry(place, placePair) {
  const wallH = 8;

  // GROUND — pale sandy beach (sand texture tints via base color).
  place(80, 1, 80, COLORS.sand, 0, -0.5, 0, 'sand');

  // PERIMETER WALLS — a low tropical foliage / cliff wall (8m, rocky leafy).
  place(80, wallH, 1, COLORS.cliff, 0, wallH / 2, -40, 'concrete');
  place(80, wallH, 1, COLORS.cliff, 0, wallH / 2, 40, 'concrete');
  place(1, wallH, 80, COLORS.cliff, -40, wallH / 2, 0, 'concrete');
  place(1, wallH, 80, COLORS.cliff, 40, wallH / 2, 0, 'concrete');

  // PALM TRUNKS — each palm's collidable footprint is a ~1m trunk box at the
  // palm's (x,z). Stamped from PALM_SITES as a half-set: the site + its 180°
  // mirror (-x,-z). (place() is called directly twice instead of placePair so
  // the two trunks can share one site read; placePair would mirror identically.)
  for (const p of PALM_SITES) {
    place(1.0, 7, 1.0, COLORS.trunk, p.x, 3.5, p.z, 'wood');
    place(1.0, 7, 1.0, COLORS.trunk, -p.x, 3.5, -p.z, 'wood');
  }

  // TIKI HUTS — two pairs of huts (collidable post+walls footprint). Each hut is
  // a 4x3x3 woven volume; the thatched roof is decorative in build().
  buildTikiHut(placePair, -22, -22);
  buildTikiHut(placePair, 22, 18);

  // TROPICAL ROCKS — collidable rock cover (gray-green, concrete texture).
  placePair(3.0, 1.8, 2.4, COLORS.rock, 18, 0.9, -20, 'concrete');
  placePair(2.6, 1.4, 2.0, COLORS.rock, -28, 0.7, 10, 'concrete');
  placePair(3.2, 2.0, 2.6, COLORS.rock, 12, 1.0, 28, 'concrete');

  // BEACHED ROWBOAT — a collidable hull box on the shore (1 pair). The decorative
  // hull shape + benches are added in build().
  placePair(4.2, 1.2, 1.8, COLORS.boatHull, 28, 0.6, 24, 'wood');
}

// Tiki hut: a 4x3x3 woven-wall collidable volume. placePair stamps its 180° twin.
function buildTikiHut(placePair, cx, cz) {
  const w = 4, wallH = 3, d = 3;
  placePair(w, wallH, d, COLORS.hutWall, cx, wallH / 2, cz, 'planks');
}

// ---------------------------------------------------------------------------
// build() — client render: meshes from authorGeometry + all NON-collidable
// decorative visuals (lagoon water, clouds, palmTree fronds, tiki roofs, boat
// hull, beach umbrellas, contact shadows).
function build(scene, colliders, helper) {
  const group = new THREE.Group();
  // place(w,h,d,color,x,y,z,texName?,texOpts?) makes the mesh + registers AABB.
  const place = (w, h, d, color, x, y, z, texName, texOpts) => {
    const m = helper.box(w, h, d, color, x, y, z, texName, texOpts);
    group.add(m); colliders.addFromMesh(m);
  };
  // placePair mirrors a box to (-x,y,-z) using raw-arg place (so the same
  // authorGeometry works in both mesh and collider modes).
  const placePair = (w, h, d, color, x, y, z, texName, texOpts) => {
    place(w, h, d, color, x, y, z, texName, texOpts);
    if (x !== 0 || z !== 0) place(w, h, d, color, -x, y, -z, texName, texOpts);
  };
  authorGeometry(place, placePair);

  // LAGOON — a turquoise water plane as the visual focal point at the island's
  // center. NON-collidable (added directly to the group, never via place()).
  // Wired for animation: pushed onto group.userData.updatables so Game.js's frame
  // loop calls water.update(dt) each tick. Kept flat at y≈0.05, away from spawns.
  const lagoon = new WaterPlane(24, 16, 0x2fb4c8);
  group.add(lagoon.mesh);
  if (!group.userData.updatables) group.userData.updatables = [];
  group.userData.updatables.push(lagoon);

  // DAMP SHORELINE — a flat decorative ring around the lagoon reading as wet
  // sand. PURELY VISUAL: added straight to the group, never through place().
  const shoreMat = new THREE.MeshStandardMaterial({
    color: COLORS.sandShade, flatShading: true, roughness: 0.95,
  });
  const shore = new THREE.Mesh(new THREE.RingGeometry(8.4, 11, 48), shoreMat);
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, 0.04, 0);
  shore.receiveShadow = true; shore.castShadow = false;
  group.add(shore);

  // PALMS — decorative palmTree() visuals at the SAME (x,z) as the collidable
  // trunk boxes above. Each site is mirrored to (-x,-z) to match authorGeometry.
  // The palm's own trunkBox is deliberately NOT registered (the place() box is
  // the collider). We only translate the visual group.position.
  for (let i = 0; i < PALM_SITES.length; i++) {
    const p = PALM_SITES[i];
    const height = PALM_HEIGHTS[i % PALM_HEIGHTS.length];
    const leaf = PALM_LEAVES[i % PALM_LEAVES.length];
    const addPalmAt = (x, z) => {
      const { group: pg } = palmTree({ trunkColor: COLORS.trunk, leafColor: leaf, height });
      pg.position.set(x, 0, z);
      group.add(pg);
    };
    addPalmAt(p.x, p.z);
    addPalmAt(-p.x, -p.z);
  }

  // TIKI HUT DECORATION — thatched hip roof + 4 corner posts over each hut's
  // collidable woven volume. Must mirror the authorGeometry hut positions.
  const tikiSpecs = [{ x: -22, z: -22 }, { x: 22, z: 18 }];
  for (const t of tikiSpecs) {
    addTikiRoof(group, t.x, t.z);
    if (t.x !== 0 || t.z !== 0) addTikiRoof(group, -t.x, -t.z);
  }

  // BEACHED ROWBOAT DECORATION — hull shell + 2 benches over the collidable
  // boat box. Mirror matches authorGeometry.
  const boatSpecs = [{ x: 28, z: 24 }];
  for (const b of boatSpecs) {
    addRowboat(group, b.x, b.z);
    if (b.x !== 0 || b.z !== 0) addRowboat(group, -b.x, -b.z);
  }

  // BEACH UMBRELLAS — NON-collidable decorative (pole + striped canopy). Added
  // straight to the group in symmetric pairs.
  const umbSpecs = [{ x: 8, z: -28 }, { x: -8, z: 28 }];
  for (const u of umbSpecs) {
    addUmbrella(group, u.x, u.z);
    if (u.x !== 0 || u.z !== 0) addUmbrella(group, -u.x, -u.z);
  }

  // CLOUDS — drifting cloud billboards for sky depth. NON-collidable; Clouds
  // adds its sprites to this group and registers itself on updatables.
  new Clouds(group, { count: 8, area: 160, height: 55, color: 0xffffff, opacity: 0.9 });

  // Soft contact-shadow decals under prominent pieces so they don't float.
  helper.contactShadow(group, 0, 0, 26, 18);   // lagoon / shore
  helper.contactShadow(group, -22, -22, 6, 5); // tiki hut + mirror
  helper.contactShadow(group, 22, 18, 6, 5);   // tiki hut + mirror
  helper.contactShadow(group, 18, -20, 4, 3);  // rocks + mirror
  helper.contactShadow(group, -28, 10, 4, 3);  // rocks + mirror
  helper.contactShadow(group, 12, 28, 4, 3);   // rocks + mirror
  helper.contactShadow(group, 28, 24, 5, 3);   // boat + mirror

  scene.add(group);
  return group;
}

// Tiki hut decoration: 4 timber corner posts + a thatched pyramid roof over the
// collidable woven volume. NON-collidable (the place() wall box is the collider).
function addTikiRoof(group, x, z) {
  const wallTop = 3.0;      // top of the collidable 3m wall volume
  const postH = 3.0;
  // 4 corner posts (thin timber cylinders) framing the hut.
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, postH, 6);
  const postMat = new THREE.MeshStandardMaterial({ color: COLORS.hutPost, flatShading: true, roughness: 0.9 });
  const halfW = 1.8, halfD = 1.3;
  for (const [px, pz] of [[halfW, halfD], [-halfW, halfD], [halfW, -halfD], [-halfW, -halfD]]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x + px, postH / 2, z + pz);
    post.castShadow = true; post.receiveShadow = true;
    group.add(post);
  }
  // Thatched hip roof: a 4-sided cone (pyramid) capping the posts.
  const span = 2.6, rise = 1.4;
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.hutRoof, flatShading: true, roughness: 0.95 });
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(span, rise * 2, 4),
    roofMat,
  );
  cap.position.set(x, wallTop + rise, z);
  cap.rotation.y = Math.PI / 4; // align pyramid edges with the post square
  cap.castShadow = true; cap.receiveShadow = true;
  group.add(cap);
}

// Beached rowboat decoration: a long hollowed hull + two bench seats over the
// collidable boat box. NON-collidable.
function addRowboat(group, x, z) {
  const hullMat = new THREE.MeshStandardMaterial({ color: COLORS.boatHull, flatShading: true, roughness: 0.85 });
  const benchMat = new THREE.MeshStandardMaterial({ color: COLORS.boatBench, flatShading: true, roughness: 0.9 });
  // Hull: a long box with tapered ends suggested by a second smaller box.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.5, 1.5), hullMat);
  hull.position.set(x, 0.55, z);
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);
  // Gunwale rim (slightly wider, thin) to read as a boat edge.
  const rim = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.18, 1.6), hullMat);
  rim.position.set(x, 0.82, z);
  rim.castShadow = true; rim.receiveShadow = true;
  group.add(rim);
  // Two bench seats.
  for (const bx of [-1.0, 1.0]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.3), benchMat);
    bench.position.set(x + bx, 0.95, z);
    bench.castShadow = true; bench.receiveShadow = true;
    group.add(bench);
  }
}

// Beach umbrella decoration: a striped canopy on a pole. NON-collidable.
function addUmbrella(group, x, z) {
  const poleMat = new THREE.MeshStandardMaterial({ color: COLORS.umbPole, flatShading: true, roughness: 0.9 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), poleMat);
  pole.position.set(x, 1.2, z);
  pole.castShadow = true; pole.receiveShadow = true;
  group.add(pole);
  // Canopy: an 8-segment cone alternating two colors = striped parasol.
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const c = i % 2 === 0 ? COLORS.umbA : COLORS.umbB;
    const mat = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
    // Build a thin wedge of a cone by clipping a full cone's thetaLength.
    const wedge = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 0.5, segs, 1, false, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs),
      mat,
    );
    wedge.position.set(x, 2.35, z);
    wedge.castShadow = true; wedge.receiveShadow = false;
    group.add(wedge);
  }
}

// Compute colliderBoxes at module load via the collider-only pass (no meshes).
const _colliderBoxes = [];
{
  const h = makeBuildHelper();
  const { place, placePair } = h.colliderPass(_colliderBoxes);
  authorGeometry(place, placePair);
}

export const TROPIC = new MapDefinition({
  id: 'tropic',
  name: 'Tropic',
  desc: 'Sunny tropical beach lagoon',
  palette: {
    sky: ['#3a9ad8', '#7cc4e8', '#c8ecf2', '#f0f0e0'], // bright tropical noon
    fog: 0xbce8e0,
    fogDensity: 0.0035,
    hemisphere: [0xbfe8ff, 0x8a7a5a], // bright sky / warm sand bounce
    sunColor: 0xfff4d8,
    sunIntensity: 2.6,
  },
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
  colliderBoxes: _colliderBoxes,
});
