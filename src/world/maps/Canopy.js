import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';
import { makeBuildHelper } from '../MapBuildHelper.js';

// Canopy — high-altitude treehouse arena (STUB: full geometry in Task 8).
// Tall ancient trees, multi-level platforms, varied walkways; falling = death.
const SPAWN_POINTS = [new THREE.Vector3(0, 30, 0)];
const WAYPOINTS = [new THREE.Vector3(0, 30, 0)];

function authorGeometry(place) {
  // Temporary single platform so the map is valid; replaced in Task 8.
  place(8, 1, 8, 0x6a4a2a, 0, 30, 0, 'planks');
}

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (w, h, d, color, x, y, z, texName, texOpts) => {
    const m = helper.box(w, h, d, color, x, y, z, texName, texOpts);
    group.add(m); colliders.addFromMesh(m);
  };
  authorGeometry(place);
  scene.add(group);
  return group;
}

const _colliderBoxes = [];
{
  const h = makeBuildHelper();
  const { place } = h.colliderPass(_colliderBoxes);
  authorGeometry(place);
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
