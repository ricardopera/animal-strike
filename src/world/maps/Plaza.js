import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';

// The original "Plaza" arena: green concrete ground, wood crates, twin corner
// towers, an open central multi-level structure, sniper perches. Geometry is
// the verbatim original ArenaBuilder body, refactored to the MapDefinition +
// MapBuildHelper contract. 180°-rotational symmetry is preserved via placePair.

const COLORS = {
  ground: 0x6ab150,
  wall: 0x4a5560,
  towerWall: 0x55606c,
  towerFloor: 0x6a7480,
  crate: 0x9c6b3f,
  crateDark: 0x7a5430,
  crateLight: 0xb5824f,
  metal: 0x8a8f98,
  metalLight: 0xb0b6bf,
  metalDark: 0x6a6f78,
  pillar: 0x5a6470,
  pad: 0x7a8088,
};

// Spawn points (moved here from SpawnPoints.js — authored for Plaza's geometry).
const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 30), new THREE.Vector3(0, 1, -30),
  new THREE.Vector3(30, 1, 0), new THREE.Vector3(-30, 1, 0),
  new THREE.Vector3(22, 1, 22), new THREE.Vector3(-22, 1, -22),
  new THREE.Vector3(22, 1, -22), new THREE.Vector3(-22, 1, 22),
  new THREE.Vector3(0, 4.5, 0),
  new THREE.Vector3(15, 1, 0), new THREE.Vector3(-15, 1, 0),
  new THREE.Vector3(0, 1, 15), new THREE.Vector3(0, 1, -15),
];

// Waypoints (moved here from BotNavigation.js — authored for Plaza's geometry).
const WAYPOINTS = [
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -20),
  new THREE.Vector3(20, 0, 0), new THREE.Vector3(-20, 0, 0),
  new THREE.Vector3(14, 0, 14), new THREE.Vector3(-14, 0, -14),
  new THREE.Vector3(14, 0, -14), new THREE.Vector3(-14, 0, 14),
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(28, 3, -28), new THREE.Vector3(-28, 3, 28),
];

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (mesh) => { group.add(mesh); colliders.addFromMesh(mesh); };
  const placePair = (w,h,d,color,x,y,z,texName,texOpts) =>
    helper.placePair(place, w,h,d,color,x,y,z,texName,texOpts);

  // GROUND
  place(helper.box(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete'));

  // PERIMETER WALLS (8m)
  const wallH = 8;
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, -40, 'concrete'));
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, 40, 'concrete'));
  place(helper.box(1, wallH, 80, COLORS.wall, -40, wallH/2, 0, 'concrete'));
  place(helper.box(1, wallH, 80, COLORS.wall, 40, wallH/2, 0, 'concrete'));

  // TWIN TOWERS
  buildTower(placePair, helper, -30, -30);

  // CENTRAL MULTI-LEVEL STRUCTURE
  place(helper.box(12, 1, 12, COLORS.metal, 0, 2, 0, 'metal'));
  placePair(1.5, 2.5, 1.5, COLORS.pillar, 5.5, 1.25, 5.5, 'concrete');
  placePair(1.5, 2.5, 1.5, COLORS.pillar, -5.5, 1.25, 5.5, 'concrete');
  placePair(1.6, 1.25, 4, COLORS.metalLight, 7.2, 0.625, 0, 'metal');
  placePair(1.6, 2.5, 4, COLORS.metalLight, 6.0, 1.25, 0, 'metal');

  // COVER CLUSTERS
  buildCrateCluster(placePair, -18, -10, COLORS.crate);
  buildCrateCluster(placePair, 10, 18, COLORS.crateDark);
  placePair(3.5, 3.5, 3.5, COLORS.crateLight, -22, 1.75, 6, 'wood');
  placePair(2.5, 2.5, 2.5, COLORS.crate, 6, 1.25, -22, 'wood');

  // SNIPER PERCHES
  buildPerch(placePair, 24, 16, COLORS.metal);
  buildPerch(placePair, -16, 24, COLORS.metalLight);

  // LONG SIGHTLINE BLOCKERS
  placePair(8, 5, 1.5, COLORS.wall, 22, 2.5, 8, 'concrete');
  placePair(1.5, 5, 8, COLORS.wall, 8, 2.5, 22, 'concrete');

  // LOW COVER PADS
  placePair(5, 0.8, 3, COLORS.pad, 12, 0.4, 6, 'metal');
  placePair(3, 0.8, 5, COLORS.pad, 6, 0.4, 12, 'metal');

  scene.add(group);
  return group;
}

function buildTower(placePair, helper, cx, cz) {
  const wallC = COLORS.towerWall, floorC = COLORS.towerFloor;
  const T = 0.6, S = 8, H = 7, half = S / 2, baseY = 0;
  placePair(S, H, T, wallC, cx, baseY + H/2, cz - half, 'concrete');
  placePair(S, H, T, wallC, cx, baseY + H/2, cz + half, 'concrete');
  placePair(T, H, S, wallC, cx - half, baseY + H/2, cz, 'concrete');
  placePair(T, H, S, wallC, cx + half, baseY + H/2, cz, 'concrete');
  placePair(S + T, T, S + T, floorC, cx, baseY + H + T/2, cz, 'concrete');
  placePair(S - 2.5, T, S - 2.5, floorC, cx, baseY + 4.0, cz, 'concrete');
  placePair(1.8, 1.0, 1.8, COLORS.crate, cx - 2.0, baseY + 0.5, cz - 2.0, 'wood');
  placePair(1.8, 2.0, 1.8, COLORS.crate, cx - 1.0, baseY + 1.0, cz - 2.0, 'wood');
}

function buildCrateCluster(placePair, cx, cz, baseColor) {
  placePair(3, 3, 3, baseColor, cx, 1.5, cz, 'wood');
  placePair(2, 2, 2, shadeHexLocal(baseColor, -0.14), cx + 2.8, 1, cz + 1.2, 'wood');
}

function buildPerch(placePair, cx, cz, metalColor) {
  const platY = 3.0, S = 5;
  placePair(S - 1, 1.5, S - 1, COLORS.pillar, cx, 0.75, cz, 'concrete');
  placePair(S, 0.4, S, metalColor, cx, platY, cz, 'metal');
}

// Local shadeHex so per-map color math at module-eval time doesn't depend on the
// runtime helper object (which is only available inside build()).
function shadeHexLocal(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

export const PLAZA = new MapDefinition({
  id: 'plaza',
  name: 'Plaza',
  desc: 'Open central yard with twin towers',
  palette: {
    sky: ['#5a8fcf', '#9cc4e8', '#d8ecf7', '#f0e8d8'],
    fog: 0xbfe3f5,
    fogDensity: 0.006,
  },
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
});
