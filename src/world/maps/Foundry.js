import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';
import { makeBuildHelper } from '../MapBuildHelper.js';

// Foundry — industrial arena: dark gunmetal surfaces, raised catwalk rings,
// forge-pit courtyards (low-walled enclosures faking recessed areas, since the
// ground is a single slab and collision is AABB-only), dense machinery cover.
// Tighter lanes than Plaza; rewards close-quarters + vertical play.

const COLORS = {
  ground: 0x2f3238,      // dark poured concrete
  wall: 0x3a3e44,        // steel perimeter
  steel: 0x5a606a,
  steelLight: 0x8a909a,
  steelDark: 0x3e434c,
  catwalk: 0x6a707a,
  forge: 0x4a2a18,        // warm-dark pit floor tint
  forgeRim: 0x6a3a20,
  machinery: 0x4a4e56,
  pipe: 0x55606c,
};

const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 32), new THREE.Vector3(0, 1, -32),
  new THREE.Vector3(32, 1, 0), new THREE.Vector3(-32, 1, 0),
  new THREE.Vector3(24, 1, 24), new THREE.Vector3(-24, 1, -24),
  new THREE.Vector3(24, 1, -24), new THREE.Vector3(-24, 1, 24),
  new THREE.Vector3(14, 1, 0), new THREE.Vector3(-14, 1, 0),
  new THREE.Vector3(0, 1, 14), new THREE.Vector3(0, 1, -14),
];

const WAYPOINTS = [
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 18), new THREE.Vector3(0, 0, -18),
  new THREE.Vector3(18, 0, 0), new THREE.Vector3(-18, 0, 0),
  new THREE.Vector3(12, 0, 12), new THREE.Vector3(-12, 0, -12),
  new THREE.Vector3(12, 0, -12), new THREE.Vector3(-12, 0, 12),
  new THREE.Vector3(0, 4.2, 0),
  new THREE.Vector3(20, 4.2, 0), new THREE.Vector3(-20, 4.2, 0),
  new THREE.Vector3(26, 4.2, -26), new THREE.Vector3(-26, 4.2, 26),
];

// Author the geometry once. `place`/`placePair` come from the caller —
// mesh-based (client build) or AABB-based (server colliderBoxes).
function authorGeometry(place, placePair) {
  const wallH = 8;

  // GROUND
  place(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete');

  // PERIMETER WALLS (8m steel)
  place(80, wallH, 1, COLORS.wall, 0, wallH/2, -40, 'metal');
  place(80, wallH, 1, COLORS.wall, 0, wallH/2, 40, 'metal');
  place(1, wallH, 80, COLORS.wall, -40, wallH/2, 0, 'metal');
  place(1, wallH, 80, COLORS.wall, 40, wallH/2, 0, 'metal');

  // CENTRAL CATWALK RING (raised ~4.2m)
  placePair(14, 0.4, 2.5, COLORS.catwalk, 0, 4.2, 9, 'metal');
  placePair(2.5, 0.4, 14, COLORS.catwalk, 9, 4.2, 0, 'metal');
  placePair(1, 4.2, 1, COLORS.steelDark, 9, 2.1, 9, 'metal');
  placePair(1, 4.2, 1, COLORS.steelDark, 9, 2.1, -9, 'metal');
  placePair(2.5, 0.6, 4, COLORS.steelLight, 0, 0.3, 16, 'metal');
  placePair(2.5, 1.2, 4, COLORS.steelLight, 0, 0.9, 13, 'metal');
  placePair(2.5, 1.8, 4, COLORS.steelLight, 0, 1.5, 11, 'metal');
  placePair(2.5, 2.4, 4, COLORS.steelLight, 0, 2.1, 9.5, 'metal');

  // FORGE PITS
  buildForgePit(placePair, -22, 16);
  buildForgePit(placePair, 22, -16);

  // MACHINERY BLOCKS
  placePair(4, 3, 3, COLORS.machinery, -16, 1.5, -6, 'metal');
  placePair(3, 2.5, 4, COLORS.machinery, 6, 1.25, -16, 'metal');
  placePair(2.5, 2, 2.5, COLORS.steel, 18, 1, 8, 'metal');
  placePair(3, 3.5, 2, COLORS.steel, -8, 1.75, 18, 'metal');

  // VERTICAL PIPES / PILLARS
  placePair(1.2, 6, 1.2, COLORS.pipe, 12, 3, 12, 'metal');
  placePair(1.2, 6, 1.2, COLORS.pipe, 20, 3, 0, 'metal');

  // LOW COVER PADS
  placePair(5, 0.8, 3, COLORS.steelDark, 14, 0.4, 22, 'metal');
  placePair(3, 0.8, 5, COLORS.steelDark, 22, 0.4, 14, 'metal');
}

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (w,h,d,color,x,y,z,texName,texOpts) => {
    const m = helper.box(w,h,d,color,x,y,z,texName,texOpts);
    group.add(m); colliders.addFromMesh(m);
  };
  const placePair = (w,h,d,color,x,y,z,texName,texOpts) =>
    helper.placePair(place, w,h,d,color,x,y,z,texName,texOpts);
  authorGeometry(place, placePair);
  scene.add(group);
  return group;
}

function buildForgePit(placePair, cx, cz) {
  // A 6x6 walled enclosure with low walls (2.5m) — reads as a sunken forge pit.
  const rimH = 2.5, S = 6, T = 0.5, half = S / 2;
  // Rim walls (4) — side walls slightly shorter to leave entrance gaps
  placePair(S, rimH, T, COLORS.forgeRim, cx, rimH/2, cz - half, 'concrete');
  placePair(S, rimH, T, COLORS.forgeRim, cx, rimH/2, cz + half, 'concrete');
  placePair(T, rimH, S * 0.6, COLORS.forgeRim, cx - half, rimH/2, cz, 'concrete');
  placePair(T, rimH, S * 0.6, COLORS.forgeRim, cx + half, rimH/2, cz, 'concrete');
  // Dark floor patch inside (visual only, flat on ground)
  placePair(S - 1, 0.1, S - 1, COLORS.forge, cx, 0.05, cz, 'concrete');
}

// Compute colliderBoxes at module load via the collider-only pass (no meshes).
const _colliderBoxes = [];
{
  const h = makeBuildHelper();
  const { place, placePair } = h.colliderPass(_colliderBoxes);
  authorGeometry(place, placePair);
}

export const FOUNDRY = new MapDefinition({
  id: 'foundry',
  name: 'Foundry',
  desc: 'Industrial catwalks and forge pits',
  palette: {
    sky: ['#3a4048', '#5a606a', '#7a8088', '#9a7a5a'],  // smoggy overcast + warm haze
    fog: 0x6a7078,
    fogDensity: 0.009,
  },
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
  colliderBoxes: _colliderBoxes,
});
