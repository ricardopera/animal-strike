import * as THREE from 'three';
import { get as getTexture } from '../textures/TextureFactory.js';

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

// Build a box mesh with an optional procedural texture. The texture is shared
// (cached by TextureFactory) and its repeat is set per-mesh to tile by surface size.
// Signature: box(w, h, d, color, x, y, z, texName, texOpts)
//
// PBR tuning by texture type: metal surfaces get high metalness + low roughness
// (so they pick up specular highlights and feel reflective); wood/concrete stay
// rough and matte. Everything casts + receives shadows.
function box(w, h, d, color, x, y, z, texName, texOpts) {
  let material;
  if (texName) {
    const tex = getTexture(texName, { base: color, accent: shadeHex(color, -0.3), ...(texOpts || {}) });
    // clone the texture so this mesh can have its own repeat without affecting the cache
    const t = tex.clone();
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    // tile roughly once per 2 units of surface
    const rep = Math.max(1, Math.round(Math.max(w, h, d) / 2));
    t.repeat.set(rep, rep);
    const isMetal = texName === 'metal';
    material = new THREE.MeshStandardMaterial({
      map: t, flatShading: true,
      metalness: isMetal ? 0.75 : 0.05,
      roughness: isMetal ? 0.35 : 0.9,
    });
  } else {
    material = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

// Builds a richer, 180°-rotation-symmetric arena entirely from axis-aligned
// boxes (no rotated meshes), preserving the AABB collision contract. The same
// `build(scene, colliderStore)` signature the Game uses is kept unchanged.
//
// Symmetry rule: a box at (x, y, z) always has a partner at (-x, y, -z). Only
// the exact origin (0, ·, 0) is self-symmetric; everything else — including
// boxes lying on an axis but off-origin — is emitted through `placePair`.
export class ArenaBuilder {
  build(scene, colliderStore) {
    const group = new THREE.Group();
    let count = 0;

    // Place a single mesh into BOTH the render group and the collider store.
    // The ColliderStore freezes AABBs at insertion, which is fine because
    // nothing in the arena animates.
    const place = (mesh) => { group.add(mesh); colliderStore.addFromMesh(mesh); count++; };

    // Place a box and its 180°-rotational partner at (-x, y, -z). When the piece
    // sits on the exact rotational center (x===0 && z===0) it is its own mirror,
    // so only one is placed.
    const placePair = (w, h, d, color, x, y, z, texName, texOpts) => {
      place(box(w, h, d, color, x, y, z, texName, texOpts));
      if (x !== 0 || z !== 0) {
        place(box(w, h, d, color, -x, y, -z, texName, texOpts));
      }
    };

    // ---------------------------------------------------------------------
    // GROUND (1) — grass-green textured concrete slab. Ground top at y=0.
    // ---------------------------------------------------------------------
    place(box(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete'));

    // ---------------------------------------------------------------------
    // PERIMETER WALLS (4) — taller (8m) concrete walls so players cannot see
    // over or fall out. Each wall lies on an axis and is centered at the
    // origin along that axis, so it is self-symmetric (place once).
    // ---------------------------------------------------------------------
    const wallH = 8;
    place(box(80, wallH, 1, COLORS.wall, 0, wallH / 2, -40, 'concrete')); // north (runs along X, z=-40)
    place(box(80, wallH, 1, COLORS.wall, 0, wallH / 2, 40, 'concrete'));  // south (z=+40)
    place(box(1, wallH, 80, COLORS.wall, -40, wallH / 2, 0, 'concrete')); // west  (runs along Z, x=-40)
    place(box(1, wallH, 80, COLORS.wall, 40, wallH / 2, 0, 'concrete'));  // east  (x=+40)

    // ---------------------------------------------------------------------
    // TWIN TOWERS (16) — hollow towers at opposite corners (-30,·,-30) and
    // (30,·,30). 4 walls + roof + 1 interior floor slab + 2 stair boxes = 8
    // pieces, emitted via placePair so the global mirror tower is produced
    // automatically (8 -> 16).
    // ---------------------------------------------------------------------
    this._buildTower(placePair, -30, -30);

    // ---------------------------------------------------------------------
    // CENTRAL MULTI-LEVEL STRUCTURE (9, all self/origin-symmetric).
    // Raised platform at y~2 (self-sym at origin), four pillars (2 placePairs
    // => 4), and two ramp steps on the east/west sides (2 placePairs => 4).
    //   1 + 4 + 4 = 9
    // ---------------------------------------------------------------------
    place(box(12, 1, 12, COLORS.metal, 0, 2, 0, 'metal'));                 // platform (self-sym)
    placePair(1.5, 2.5, 1.5, COLORS.pillar, 5.5, 1.25, 5.5, 'concrete');   // 2 corner pillars (+mirror)
    placePair(1.5, 2.5, 1.5, COLORS.pillar, -5.5, 1.25, 5.5, 'concrete');  // 2 more pillars
    placePair(1.6, 1.25, 4, COLORS.metalLight, 7.2, 0.625, 0, 'metal');    // lower step (east/west)
    placePair(1.6, 2.5, 4, COLORS.metalLight, 6.0, 1.25, 0, 'metal');      // upper step

    // ---------------------------------------------------------------------
    // COVER CLUSTERS (12) — groups of 1-2 wooden crates of varying sizes,
    // placed in symmetric pairs:
    //   - 2 double-crate clusters (2 crates each): 2 × 4 = 8
    //   - 2 single-crate clusters: 2 × 2 = 4
    // ---------------------------------------------------------------------
    // double-crate clusters (2 crates each => 4 boxes w/ mirror)
    this._buildCrateCluster(placePair, -18, -10, COLORS.crate);
    this._buildCrateCluster(placePair, 10, 18, COLORS.crateDark);
    // single-crate clusters (varied sizes/colors) — 1 crate => 2 boxes w/ mirror
    placePair(3.5, 3.5, 3.5, COLORS.crateLight, -22, 1.75, 6, 'wood');
    placePair(2.5, 2.5, 2.5, COLORS.crate, 6, 1.25, -22, 'wood');

    // ---------------------------------------------------------------------
    // SNIPER PERCHES (8) — 2 elevated platforms on a base pedestal + step,
    // each emitted via placePair -> 4 boxes per perch call. 2 perches -> 8.
    // ---------------------------------------------------------------------
    this._buildPerch(placePair, 24, 16, COLORS.metal);
    this._buildPerch(placePair, -16, 24, COLORS.metalLight);

    // ---------------------------------------------------------------------
    // LONG SIGHTLINE BLOCKERS (4) — taller thin walls breaking up long lanes.
    // Placed off the cardinal spawn axes (spawns sit at (±15,0)/(0,±15) and
    // (±22,±22)) so no spawn point is embedded. 2 placements × placePair -> 4.
    // ---------------------------------------------------------------------
    placePair(8, 5, 1.5, COLORS.wall, 22, 2.5, 8, 'concrete');  // diagonal mid-lane
    placePair(1.5, 5, 8, COLORS.wall, 8, 2.5, 22, 'concrete');  // diagonal mid-lane (rotated pair)

    // ---------------------------------------------------------------------
    // LOW COVER PADS (4) — flat low boxes for crouch fights. 2 placePair.
    // ---------------------------------------------------------------------
    placePair(5, 0.8, 3, COLORS.pad, 12, 0.4, 6, 'metal');
    placePair(3, 0.8, 5, COLORS.pad, 6, 0.4, 12, 'metal');

    // TOTAL: 1 + 4 + 16 + 9 + 12 + 8 + 4 + 4 = 58 solid meshes (incl. ground).
    scene.add(group);
    return group;
  }

  // -----------------------------------------------------------------------
  // Tower at corner (cx, cz): hollow 8x8 tower ~7m tall with roof + one
  // interior floor slab + a 2-box stacked-crate stair. Every piece is emitted
  // via placePair, so the global 180° mirror tower is generated automatically.
  // Pieces per call: 4 walls + 1 roof + 1 slab + 2 stair boxes = 8 (-> 16).
  // -----------------------------------------------------------------------
  _buildTower(placePair, cx, cz) {
    const wallC = COLORS.towerWall;
    const floorC = COLORS.towerFloor;
    const T = 0.6;     // wall thickness
    const S = 8;       // outer side length
    const H = 7;       // total height
    const half = S / 2;
    const baseY = 0;   // sit on ground (ground top at 0)

    // Four walls.
    placePair(S, H, T, wallC, cx, baseY + H / 2, cz - half, 'concrete'); // north
    placePair(S, H, T, wallC, cx, baseY + H / 2, cz + half, 'concrete'); // south
    placePair(T, H, S, wallC, cx - half, baseY + H / 2, cz, 'concrete'); // west
    placePair(T, H, S, wallC, cx + half, baseY + H / 2, cz, 'concrete'); // east

    // Roof slab (slightly oversized to cap the walls).
    placePair(S + T, T, S + T, floorC, cx, baseY + H + T / 2, cz, 'concrete');

    // One interior floor slab (upper perch), smaller than the footprint so an
    // open shaft remains for shots / climbing up from below.
    placePair(S - 2.5, T, S - 2.5, floorC, cx, baseY + 4.0, cz, 'concrete');

    // Stacked-crate stair toward one interior corner (2-step stack to y~2,
    // then a jump to the slab at y=4).
    placePair(1.8, 1.0, 1.8, COLORS.crate, cx - 2.0, baseY + 0.5, cz - 2.0, 'wood');
    placePair(1.8, 2.0, 1.8, COLORS.crate, cx - 1.0, baseY + 1.0, cz - 2.0, 'wood');
  }

  // -----------------------------------------------------------------------
  // A cover cluster near (cx, cz): 2 wooden crates of varying sizes. Emitted
  // via placePair so a mirror cluster appears too. 2 pieces -> 4 w/ mirror.
  // -----------------------------------------------------------------------
  _buildCrateCluster(placePair, cx, cz, baseColor) {
    placePair(3, 3, 3, baseColor, cx, 1.5, cz, 'wood');                            // big crate
    placePair(2, 2, 2, shadeHex(baseColor, -0.14), cx + 2.8, 1, cz + 1.2, 'wood'); // medium beside
  }

  // -----------------------------------------------------------------------
  // A sniper perch near (cx, cz): a small metal platform on a wide concrete
  // pedestal + a stacked metal step. 2 placePair calls -> 4 boxes per call.
  // -----------------------------------------------------------------------
  _buildPerch(placePair, cx, cz, metalColor) {
    const platY = 3.0; // platform top
    const S = 5;       // platform side
    // wide pedestal (support + climb shelter)
    placePair(S - 1, 1.5, S - 1, COLORS.pillar, cx, 0.75, cz, 'concrete');
    // platform on top of the pedestal
    placePair(S, 0.4, S, metalColor, cx, platY, cz, 'metal');
  }
}
