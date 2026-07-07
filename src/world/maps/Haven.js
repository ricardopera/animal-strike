import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';
import { makeBuildHelper } from '../MapBuildHelper.js';
import {
  cottage, well, marketStall, haystack, bannerPole, cart, barrel,
} from '../props/Village.js';
import { translateBox } from '../props/_shared.js';

// Haven — a cozy medieval village square. Cobblestone streets, thatched-roof
// cottages around a perimeter ring, a central stone well (the focal point),
// market stalls in the square, plus haystacks, carts, banner poles, barrels and
// a small chapel tower (sniper perch). Warm golden-hour palette.
//
// EVERY collidable element is a place()/placePair() box in authorGeometry (so it
// appears in BOTH the client render AND colliderBoxes — the server's Sim.js
// builds its colliders solely from colliderBoxes, headlessly). In build() we then
// layer the richer decorative Village.js props (roofs, awnings, cloth, thatch)
// at the SAME world positions; those props' own .boxes are deliberately ignored
// — the place() footprint box is the single source of collision.
//
// `authorGeometry` is authored ONCE and called in two modes:
//   - client build():  place/placePair allocate textured THREE.Meshes
//   - colliderBoxes:   place/placePair record world AABBs (server, headless)
// 180°-rotational symmetry via placePair (no-op mirror when x===0 && z===0).

const COLORS = {
  ground: 0xb8a878,      // warm beige cobblestone
  path: 0xc8b888,        // lighter worn path cobble
  wall: 0x9a8a72,        // warm stone perimeter
  cottageWall: 0xd8c39a, // plastered wattle-and-daub
  cottageRoof: 0x9a6b3f, // thatch / timber
  chapelWall: 0xb8a888,  // pale chapel stone
  chapelRoof: 0x6a4a3a,  // dark slate
  wellStone: 0x9a9488,
  stall: 0x7a5a3a,       // market frame / counter
  stallAwning: 0xc84a4a, // red striped awning
  hay: 0xd8b44a,
  pole: 0x6a4a2a,
  banner: 0x3a5a8a,
  cartWood: 0x8a6a44,
  cartWheel: 0x3a2a1a,
  barrelWood: 0x8a5a2a,
};

const SPAWN_POINTS = [
  // Cardinal street ends (just inside the perimeter gates).
  new THREE.Vector3(0, 1, 32), new THREE.Vector3(0, 1, -32),
  new THREE.Vector3(32, 1, 0), new THREE.Vector3(-32, 1, 0),
  // Diagonal corners of the square.
  new THREE.Vector3(24, 1, 24), new THREE.Vector3(-24, 1, -24),
  new THREE.Vector3(24, 1, -24), new THREE.Vector3(-24, 1, 24),
  // Mid-street points between the well and the walls.
  new THREE.Vector3(15, 1, 8), new THREE.Vector3(-15, 1, -8),
  new THREE.Vector3(8, 1, -15), new THREE.Vector3(-8, 1, 15),
];

const WAYPOINTS = [
  // Central well hub + the four street axes.
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 24), new THREE.Vector3(0, 0, -24),
  new THREE.Vector3(24, 0, 0), new THREE.Vector3(-24, 0, 0),
  // Diagonal lanes between cottages.
  new THREE.Vector3(15, 0, 15), new THREE.Vector3(-15, 0, -15),
  new THREE.Vector3(15, 0, -15), new THREE.Vector3(-15, 0, 15),
  // Perimeter ring (near the gates / cottage doorsteps).
  new THREE.Vector3(0, 0, 34), new THREE.Vector3(0, 0, -34),
  new THREE.Vector3(34, 0, 0), new THREE.Vector3(-34, 0, 0),
  // Chapel perches (elevated sniper vantage).
  new THREE.Vector3(0, 6.2, 26), new THREE.Vector3(0, 6.2, -26),
];

// Author the geometry once. `place`/`placePair` come from the caller — either
// mesh-based (client build) or AABB-based (server colliderBoxes).
function authorGeometry(place, placePair) {
  const wallH = 8;

  // GROUND — cobblestone square (warm beige; cobble texture tints via base color).
  place(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'cobble');

  // PERIMETER WALLS (8m warm stone, cobble-clad).
  place(80, wallH, 1, COLORS.wall, 0, wallH / 2, -40, 'cobble');
  place(80, wallH, 1, COLORS.wall, 0, wallH / 2, 40, 'cobble');
  place(1, wallH, 80, COLORS.wall, -40, wallH / 2, 0, 'cobble');
  place(1, wallH, 80, COLORS.wall, 40, wallH / 2, 0, 'cobble');

  // CENTRAL WELL — collidable stone rim at the village center (its own mirror at 0,0).
  place(2.6, 1.2, 2.6, COLORS.wellStone, 0, 0.6, 0, 'cobble');

  // COTTAGES — a perimeter ring of thatched-roof houses (4 symmetric pairs).
  // Each cottage's collidable wall volume is a placePair box; the peaked roof,
  // door and windows are decorative (Village.js cottage() in build()).
  buildCottage(placePair, -28, -16);
  buildCottage(placePair, -16, -28);
  buildCottage(placePair, 28, 12);
  buildCottage(placePair, 12, 28);

  // MARKET STALLS — two pairs of stalls in the open square.
  buildMarketStall(placePair, -10, -10);
  buildMarketStall(placePair, 10, 10);

  // HAYSTACKS — low cover near the square edges.
  placePair(2.4, 0.9, 2.4, COLORS.hay, -18, 0.45, -4, 'turf');
  placePair(2.4, 0.9, 2.4, COLORS.hay, 4, 0.45, -18, 'turf');

  // CARTS — wooden cart cover in the side lanes.
  placePair(3.0, 1.9, 1.6, COLORS.cartWood, 20, 0.95, -10, 'wood');
  placePair(3.0, 1.9, 1.6, COLORS.cartWood, -10, 0.95, 20, 'wood');

  // BANNER POLES — tall thin collidable poles flanking the cardinal gates.
  placePair(0.3, 6, 0.3, COLORS.pole, -5, 3, -34, 'wood');
  placePair(0.3, 6, 0.3, COLORS.pole, -34, 3, -5, 'wood');

  // BARRELS — small clutter cover near the market and cottages.
  placePair(1.2, 1.1, 1.2, COLORS.barrelWood, -6, 0.55, -6, 'wood');
  placePair(1.2, 1.1, 1.2, COLORS.barrelWood, 6, 0.55, 6, 'wood');

  // CHAPEL TOWER — a tall stone landmark (sniper perch) on the +z/-z axis.
  // Collidable walls + a raised gallery floor; roof is decorative in build().
  buildChapel(placePair, 0, 26);
}

// Cottage: a single 6x5x3 wall-volume box at (cx,cz). placePair stamps its
// 180°-rotational twin. The cottage()'s own box is ignored in build().
function buildCottage(placePair, cx, cz) {
  const w = 6, d = 5, wallH = 3;
  placePair(w, wallH, d, COLORS.cottageWall, cx, wallH / 2, cz, 'planks');
}

// Market stall: the counter body is the collidable footprint.
function buildMarketStall(placePair, cx, cz) {
  const stallW = 4, tableH = 1.0, stallD = 2.4;
  placePair(stallW, tableH, stallD, COLORS.stall, cx, tableH / 2, cz, 'wood');
}

// Chapel: an 8x8x7 stone tower with a raised gallery floor (sniper perch).
function buildChapel(placePair, cx, cz) {
  const wallC = COLORS.chapelWall, floorC = COLORS.chapelRoof;
  const T = 0.6, S = 8, H = 7, half = S / 2, baseY = 0;
  // Four walls (collidable).
  placePair(S, H, T, wallC, cx, baseY + H / 2, cz - half, 'cobble');
  placePair(S, H, T, wallC, cx, baseY + H / 2, cz + half, 'cobble');
  placePair(T, H, S, wallC, cx - half, baseY + H / 2, cz, 'cobble');
  placePair(T, H, S, wallC, cx + half, baseY + H / 2, cz, 'cobble');
  // Roof slab (collidable cap).
  placePair(S + T, T, S + T, floorC, cx, baseY + H + T / 2, cz, 'cobble');
  // Raised interior gallery floor — a perch players can stand on (collidable).
  placePair(S - 2.5, T, S - 2.5, floorC, cx, baseY + 5.2, cz, 'cobble');
}

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  // place(w,h,d,color,x,y,z,texName?,texOpts?) makes the mesh + registers its AABB.
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

  // COBBLESTED STREETS — thin flat decorative quads laid just above the ground
  // to read as worn cross-streets. PURELY VISUAL: added straight to the group,
  // never through place() (which would register an AABB).
  const streetMat = new THREE.MeshStandardMaterial({
    color: COLORS.path, flatShading: true, roughness: 0.95,
  });
  const addStreet = (w, d, x, z) => {
    const q = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), streetMat);
    q.position.set(x, 0.045, z);
    q.receiveShadow = true; q.castShadow = false;
    group.add(q);
  };
  // A plus/cross of lighter path cobble along the cardinal axes.
  addStreet(8, 76, 0, 0);   // north–south street
  addStreet(76, 8, 0, 0);   // east–west street
  // A ring road around the central square.
  addStreet(8, 8, 24, 0); addStreet(8, 8, -24, 0);
  addStreet(8, 8, 0, 24); addStreet(8, 8, 0, -24);

  // DECORATIVE VILLAGE PROPS — added at the SAME world positions as the
  // collidable footprint boxes above, for visual richness (roofs, awnings,
  // thatch, cloth). Each prop's own .boxes are deliberately NOT registered: the
  // place() footprint box is the single source of collision, so the prop mesh
  // must sit exactly on the footprint. translateBox is unused for colliders
  // here — we only translate the visual group.position.
  const addProp = (factory, x, z, opts) => {
    const { group: g } = factory(opts);
    g.position.set(x, 0, z);
    group.add(g);
    return g;
  };

  // Central well (decorative posts + pitched roof over the rim).
  addProp(well, 0, 0, { stoneColor: COLORS.wellStone, waterColor: 0x2a5a6a });

  // Cottages — must mirror the authorGeometry positions exactly.
  const cottageSpecs = [
    { x: -28, z: -16 }, { x: -16, z: -28 },
    { x: 28, z: 12 }, { x: 12, z: 28 },
  ];
  for (const c of cottageSpecs) {
    addProp(cottage, c.x, c.z, {
      w: 6, d: 5, wallColor: COLORS.cottageWall, roofColor: COLORS.cottageRoof,
    });
    if (c.x !== 0 || c.z !== 0) {
      addProp(cottage, -c.x, -c.z, {
        w: 6, d: 5, wallColor: COLORS.cottageWall, roofColor: COLORS.cottageRoof,
      });
    }
  }

  // Market stalls — decorative frame + striped awning over the counter.
  const stallSpecs = [{ x: -10, z: -10 }, { x: 10, z: 10 }];
  for (const s of stallSpecs) {
    addProp(marketStall, s.x, s.z, {
      frameColor: COLORS.stall, awningColor: COLORS.stallAwning,
    });
    if (s.x !== 0 || s.z !== 0) {
      addProp(marketStall, -s.x, -s.z, {
        frameColor: COLORS.stall, awningColor: COLORS.stallAwning,
      });
    }
  }

  // Haystacks (low rounded cover).
  const haySpecs = [{ x: -18, z: -4 }, { x: 4, z: -18 }];
  for (const h of haySpecs) {
    addProp(haystack, h.x, h.z, { color: COLORS.hay });
    if (h.x !== 0 || h.z !== 0) addProp(haystack, -h.x, -h.z, { color: COLORS.hay });
  }

  // Carts (wooden body + wheels cover).
  const cartSpecs = [{ x: 20, z: -10 }, { x: -10, z: 20 }];
  for (const c of cartSpecs) {
    addProp(cart, c.x, c.z, { woodColor: COLORS.cartWood, wheelColor: COLORS.cartWheel });
    if (c.x !== 0 || c.z !== 0) {
      addProp(cart, -c.x, -c.z, { woodColor: COLORS.cartWood, wheelColor: COLORS.cartWheel });
    }
  }

  // Banner poles (tall decorative banners over the collidable poles).
  const poleSpecs = [{ x: -5, z: -34 }, { x: -34, z: -5 }];
  for (const p of poleSpecs) {
    addProp(bannerPole, p.x, p.z, { poleColor: COLORS.pole, bannerColor: COLORS.banner });
    if (p.x !== 0 || p.z !== 0) {
      addProp(bannerPole, -p.x, -p.z, { poleColor: COLORS.pole, bannerColor: COLORS.banner });
    }
  }

  // Barrels (clutter cover).
  const barrelSpecs = [{ x: -6, z: -6 }, { x: 6, z: 6 }];
  for (const b of barrelSpecs) {
    addProp(barrel, b.x, b.z, { color: COLORS.barrelWood });
    if (b.x !== 0 || b.z !== 0) addProp(barrel, -b.x, -b.z, { color: COLORS.barrelWood });
  }

  // Chapel decorative detail — a peaked slate roof capping the tower.
  const chapelRoofColor = COLORS.chapelRoof;
  for (const cz of [26, -26]) {
    const roof = helper.box(9.4, 1.6, 9.4, chapelRoofColor, 0, 7.6 + 0.8, cz, 'cobble');
    group.add(roof); // NON-collidable: a chapel roof slab is already capped in authorGeometry.
  }

  // Soft contact-shadow decals under prominent pieces so they don't float.
  helper.contactShadow(group, 0, 0, 4, 4);                 // central well
  helper.contactShadow(group, -28, -16, 7, 6);             // cottage + mirror
  helper.contactShadow(group, -16, -28, 7, 6);             // cottage + mirror
  helper.contactShadow(group, 28, 12, 7, 6);               // cottage + mirror
  helper.contactShadow(group, 12, 28, 7, 6);               // cottage + mirror
  helper.contactShadow(group, -10, -10, 5, 4);             // market stall + mirror
  helper.contactShadow(group, 10, 10, 5, 4);               // market stall + mirror
  helper.contactShadow(group, 0, 26, 9, 9);                // chapel + mirror

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

export const HAVEN = new MapDefinition({
  id: 'haven',
  name: 'Haven',
  desc: 'Cozy medieval village square',
  palette: {
    sky: ['#5a7fb8', '#a8c4dc', '#f0d8a8', '#e8b878'], // warm golden-hour
    fog: 0xd8c8a0,
    fogDensity: 0.005,
    hemisphere: [0xf0d8a8, 0x6a5030], // warm sky / warm ground bounce
    sunColor: 0xffd8a0,
    sunIntensity: 2.4,
  },
  build,
  spawnPoints: SPAWN_POINTS,
  waypoints: WAYPOINTS,
  colliderBoxes: _colliderBoxes,
});
