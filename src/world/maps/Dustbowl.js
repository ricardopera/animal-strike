import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';

// Dustbowl — desert arena: sandy concrete, broad flat-topped mesas reachable
// by stacked-rock stairs (vertical sniper perches), long low sightline-blocker
// walls, sparse rock cover. Open long lanes favor the Sniper.

const COLORS = {
  ground: 0xc9a878,      // sandy
  wall: 0xb89060,        // tan rock perimeter
  rock: 0xa88858,
  rockLight: 0xc8a878,
  rockDark: 0x886848,
  mesa: 0xb89060,
  mesaTop: 0xcab088,
  sandbag: 0xb09870,
};

const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 32), new THREE.Vector3(0, 1, -32),
  new THREE.Vector3(32, 1, 0), new THREE.Vector3(-32, 1, 0),
  new THREE.Vector3(26, 1, 26), new THREE.Vector3(-26, 1, -26),
  new THREE.Vector3(26, 1, -26), new THREE.Vector3(-26, 1, 26),
  new THREE.Vector3(15, 1, 0), new THREE.Vector3(-15, 1, 0),
  new THREE.Vector3(0, 1, 15), new THREE.Vector3(0, 1, -15),
];

const WAYPOINTS = [
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -20),
  new THREE.Vector3(20, 0, 0), new THREE.Vector3(-20, 0, 0),
  new THREE.Vector3(14, 0, 14), new THREE.Vector3(-14, 0, -14),
  new THREE.Vector3(14, 0, -14), new THREE.Vector3(-14, 0, 14),
  new THREE.Vector3(20, 4.2, 0), new THREE.Vector3(-20, 4.2, 0),
  new THREE.Vector3(0, 4.2, 20), new THREE.Vector3(0, 4.2, -20),
  new THREE.Vector3(28, 4.2, -28), new THREE.Vector3(-28, 4.2, 28),
];

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (mesh) => { group.add(mesh); colliders.addFromMesh(mesh); };
  const placePair = (w,h,d,color,x,y,z,texName,texOpts) =>
    helper.placePair(place, w,h,d,color,x,y,z,texName,texOpts);

  // GROUND
  place(helper.box(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete'));

  // PERIMETER WALLS (8m rock)
  const wallH = 8;
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, -40, 'concrete'));
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, 40, 'concrete'));
  place(helper.box(1, wallH, 80, COLORS.wall, -40, wallH/2, 0, 'concrete'));
  place(helper.box(1, wallH, 80, COLORS.wall, 40, wallH/2, 0, 'concrete'));

  // MESAS — 2 broad flat-topped rock blocks (5m tall) with stacked-rock stairs.
  // Sniper perches with commanding sightlines; the climb is the cost.
  buildMesa(placePair, 24, 0);
  buildMesa(placePair, 0, 24);

  // LONG LOW SIGHTLINE BLOCKERS — break up the open desert into lanes
  placePair(10, 3, 1.5, COLORS.rock, 16, 1.5, 14, 'concrete');
  placePair(1.5, 3, 10, COLORS.rock, 14, 1.5, 16, 'concrete');
  placePair(8, 2.5, 1.5, COLORS.rockLight, 20, 1.25, -18, 'concrete');

  // ROCK FORMATIONS — sparse, varied-size cover (mid-height)
  placePair(3.5, 3.5, 3.5, COLORS.rock, -18, 1.75, -8, 'concrete');
  placePair(2.5, 2.5, 2.5, COLORS.rockDark, -8, 1.25, -18, 'concrete');
  placePair(4, 2, 3, COLORS.rock, 8, 1, 22, 'concrete');
  placePair(2, 3, 2, COLORS.rockLight, -22, 1.5, 8, 'concrete');

  // SANDBAG LOW COVER — crouch-height pads
  placePair(5, 0.9, 3, COLORS.sandbag, 12, 0.45, 0, 'concrete');
  placePair(3, 0.9, 5, COLORS.sandbag, 0, 0.45, 12, 'concrete');

  // LONE CENTRAL ROCK — small central cover to contest
  place(helper.box(3, 2.5, 3, COLORS.rockDark, 0, 1.25, 0, 'concrete'));

  scene.add(group);
  return group;
}

function buildMesa(placePair, cx, cz) {
  // A 7x7 flat-topped rock block, 5m tall, with a 3-step stacked-rock stair.
  const top = 5, S = 7;
  placePair(S, top, S, COLORS.mesa, cx, top/2, cz, 'concrete');
  // Cap (lighter top — sun-bleached)
  placePair(S, 0.4, S, COLORS.mesaTop, cx, top + 0.2, cz, 'concrete');
  // Stacked-rock stairs (3 steps) toward one corner
  placePair(2.5, 1.2, 2.5, COLORS.rockLight, cx + (S/2) + 1.5, 0.6, cz + (S/2) + 1.5, 'concrete');
  placePair(2.5, 2.4, 2.5, COLORS.rockLight, cx + (S/2) + 3.5, 1.2, cz + (S/2) + 3.5, 'concrete');
  placePair(2.5, 3.6, 2.5, COLORS.rockLight, cx + (S/2) + 5.5, 1.8, cz + (S/2) + 5.5, 'concrete');
}

export const DUSTBOWL = new MapDefinition({
  id: 'dustbowl',
  name: 'Dustbowl',
  desc: 'Desert mesas and long open sightlines',
  palette: {
    sky: ['#7ab0d8', '#bcd8ec', '#e8e0c8', '#f0d8a8'],  // pale desert sky + warm sand haze
    fog: 0xd8c8a0,
    fogDensity: 0.004,
  },
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
});
