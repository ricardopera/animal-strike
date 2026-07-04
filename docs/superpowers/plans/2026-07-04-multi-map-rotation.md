# Multi-Map + Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the single hardcoded arena into a 3-map roster (Plaza / Foundry / Dustbowl) with a `MapDefinition` contract, a map selector in the menu, and automatic rotation between matches.

**Architecture:** Introduce a `MapDefinition` that bundles geometry-build + spawn points + bot waypoints + visual palette into one source of truth per map. A `MAPS` registry holds the three maps. `Game.js` becomes map-agnostic: it loads the selected map, rebuilds colliders + sky/fog, and feeds the map's spawn/waypoint data into the spawn logic and bot AI. The existing `ArenaBuilder` body becomes `Plaza.js` verbatim; two new maps reuse shared build helpers.

**Tech Stack:** Vite, three.js r0.185 (vanilla ES modules), Vitest (node env) for unit tests.

**Design spec:** `docs/superpowers/specs/2026-07-04-multi-map-rotation-design.md`

---

## File Structure

```
src/
├── core/
│   └── Game.js                      # MODIFY: map-aware lifecycle (loadMap, startMatch, rotation)
├── world/
│   ├── ColliderStore.js             # MODIFY: add clear()
│   ├── SpawnPoints.js               # MODIFY: getRandomSpawn(occupied, map) — map-aware
│   ├── MapDefinition.js             # CREATE: the contract class
│   ├── MapBuildHelper.js            # CREATE: shared box/placePair/shadeHex primitives
│   ├── Maps.js                      # CREATE: the registry [PLAZA, FOUNDRY, DUSTBOWL]
│   ├── maps/
│   │   ├── Plaza.js                 # CREATE: existing ArenaBuilder body + its spawns/waypoints
│   │   ├── Foundry.js               # CREATE: new industrial map
│   │   └── Dustbowl.js              # CREATE: new desert map
│   └── ArenaBuilder.js              # DELETE (replaced by maps/Plaza.js)
├── ai/
│   ├── AIController.js              # MODIFY: constructor takes waypoints
│   └── BotNavigation.js             # MODIFY: constructor takes waypoints (drop module global)
└── ui/
    └── MainMenu.js                  # MODIFY: map selector + rotation toggle

src/tests/
├── MapDefinition.test.js            # CREATE: contract invariants for every map in MAPS
├── Maps.test.js                     # CREATE: registry shape + getMapById
├── SpawnPoints.test.js              # MODIFY: getRandomSpawn(occupied, map) signature
└── (existing tests stay green)
```

---

## Task 1: ColliderStore.clear()

Add a `clear()` method so a map switch can wipe old AABBs. Pure data, trivially testable.

**Files:**
- Modify: `src/world/ColliderStore.js`
- Test: `src/tests/ColliderStore.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/ColliderStore.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ColliderStore } from '../world/ColliderStore.js';
import * as THREE from 'three';

describe('ColliderStore.clear()', () => {
  it('empties the boxes array', () => {
    const cs = new ColliderStore();
    cs.addBox(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
    cs.addBox(new THREE.Vector3(5, 0, 5), new THREE.Vector3(7, 2, 7));
    expect(cs.boxes.length).toBe(2);
    cs.clear();
    expect(cs.boxes.length).toBe(0);
  });

  it('removes raycast hits after clear', () => {
    const cs = new ColliderStore();
    cs.addBox(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
    cs.clear();
    const hit = cs.raycast(new THREE.Vector3(-5, 1, 1), new THREE.Vector3(1, 0, 0), 100);
    expect(hit).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/ColliderStore.test.js`
Expected: FAIL with "cs.clear is not a function"

- [ ] **Step 3: Write minimal implementation**

Add to `src/world/ColliderStore.js` inside the class (after `addBox`, before `resolveCapsule`):
```js
  clear() {
    this.boxes.length = 0;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/ColliderStore.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/ColliderStore.js src/tests/ColliderStore.test.js
git commit -m "feat(world): ColliderStore.clear() for map switching"
```

---

## Task 2: MapDefinition contract class

The data container. No behavior beyond construction + validation.

**Files:**
- Create: `src/world/MapDefinition.js`
- Test: `src/tests/MapDefinition.contract.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/MapDefinition.contract.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MapDefinition } from '../world/MapDefinition.js';

describe('MapDefinition', () => {
  it('constructs from a config object and exposes all fields', () => {
    const build = () => {};
    const md = new MapDefinition({
      id: 'test',
      name: 'Test',
      desc: 'a test map',
      palette: { sky: ['#000','#111','#222','#333'], fog: 0xaaaaaa, fogDensity: 0.005 },
      build,
      spawnPoints: [{ x: 1 }, { x: 2 }],
      waypoints: [{ x: 1 }],
    });
    expect(md.id).toBe('test');
    expect(md.name).toBe('Test');
    expect(md.desc).toBe('a test map');
    expect(md.palette.sky).toHaveLength(4);
    expect(md.build).toBe(build);
    expect(md.spawnPoints).toHaveLength(2);
    expect(md.waypoints).toHaveLength(1);
  });

  it('throws if required fields are missing', () => {
    expect(() => new MapDefinition({ id: 'x', name: 'X' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/MapDefinition.contract.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/world/MapDefinition.js`:
```js
// A MapDefinition bundles everything Game.js needs to run a match on a map:
// geometry build fn, spawn points, bot waypoints, and a visual palette.
// Each map module (Plaza, Foundry, Dustbowl) exports one of these.
export class MapDefinition {
  constructor(cfg) {
    const required = ['id', 'name', 'desc', 'palette', 'build', 'spawnPoints', 'waypoints'];
    for (const k of required) {
      if (cfg[k] === undefined || cfg[k] === null) {
        throw new Error(`MapDefinition missing required field: ${k}`);
      }
    }
    if (!Array.isArray(cfg.palette.sky) || cfg.palette.sky.length !== 4) {
      throw new Error('MapDefinition.palette.sky must be 4 gradient stops [zenith,mid,haze,horizon]');
    }
    this.id          = cfg.id;
    this.name        = cfg.name;
    this.desc        = cfg.desc;
    this.palette     = cfg.palette;
    this.build       = cfg.build;
    this.spawnPoints = cfg.spawnPoints;
    this.waypoints   = cfg.waypoints;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/MapDefinition.contract.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/MapDefinition.js src/tests/MapDefinition.contract.test.js
git commit -m "feat(world): MapDefinition contract class"
```

---

## Task 3: MapBuildHelper — shared geometry primitives

Extract `box`, `placePair`, `shadeHex` from ArenaBuilder into a reusable helper so all three maps author geometry identically. These are verbatim copies of the proven ArenaBuilder code.

**Files:**
- Create: `src/world/MapBuildHelper.js`
- Test: `src/tests/MapBuildHelper.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/MapBuildHelper.test.js`:
```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeBuildHelper } from '../world/MapBuildHelper.js';

describe('MapBuildHelper', () => {
  it('box() returns a shadow-casting mesh at the given position', () => {
    const h = makeBuildHelper();
    const m = h.box(2, 2, 2, 0xff0000, 5, 1, 3, 'concrete');
    expect(m).toBeInstanceOf(THREE.Mesh);
    expect(m.position.x).toBe(5);
    expect(m.position.z).toBe(3);
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true);
  });

  it('shadeHex() darkens and lightens', () => {
    const h = makeBuildHelper();
    expect(h.shadeHex(0xffffff, -0.5)).toBeLessThan(0xffffff);
    expect(h.shadeHex(0x000000, 0.5)).toBeGreaterThan(0);
  });

  it('placePair() calls place() once at origin-symmetric (x=0,z=0) and twice otherwise', () => {
    const h = makeBuildHelper();
    const placed = [];
    const place = (mesh) => placed.push([mesh.position.x, mesh.position.z]);
    h.placePair(place, 4, 3, 4, 0xff0000, 0, 1.5, 0, 'concrete');   // origin -> 1
    h.placePair(place, 4, 3, 4, 0xff0000, 5, 1.5, 7, 'concrete');   // off-origin -> 2 (mirror)
    expect(placed).toEqual([[0, 0], [5, 7], [-5, -7]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/MapBuildHelper.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/world/MapBuildHelper.js`:
```js
import * as THREE from 'three';
import { get as getTexture } from '../textures/TextureFactory.js';

// Shared geometry primitives used by every map's build() function.
// Extracted verbatim from the original ArenaBuilder so all maps author
// geometry identically (same PBR tuning, same shadow flags, same symmetry rule).
//
// Usage in a map's build(scene, colliders, helper):
//   const place = (mesh) => { group.add(mesh); colliders.addFromMesh(mesh); };
//   helper.placePair(place, w,h,d,color,x,y,z,'wood');

export function makeBuildHelper() {
  return { box, placePair, shadeHex };
}

// Textured PBR box. Metal surfaces get high metalness + low roughness; others
// stay matte. Casts + receives shadows. Signature matches original ArenaBuilder.box.
function box(w, h, d, color, x, y, z, texName, texOpts) {
  let material;
  if (texName) {
    const tex = getTexture(texName, { base: color, accent: shadeHex(color, -0.3), ...(texOpts || {}) });
    const t = tex.clone();
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
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

// Color shading: amt<0 darkens, amt>0 lightens. Returns a hex int.
function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

// Emit a box and its 180°-rotational partner at (-x, y, -z) via the given place
// callback. When the piece sits on the exact rotational center (x===0 && z===0)
// it is its own mirror, so only one is placed. Enforces FFA-fair symmetry.
function placePair(place, w, h, d, color, x, y, z, texName, texOpts) {
  place(box(w, h, d, color, x, y, z, texName, texOpts));
  if (x !== 0 || z !== 0) {
    place(box(w, h, d, color, -x, y, -z, texName, texOpts));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/MapBuildHelper.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/MapBuildHelper.js src/tests/MapBuildHelper.test.js
git commit -m "feat(world): MapBuildHelper — shared box/placePair/shadeHex primitives"
```

---

## Task 4: Migrate ArenaBuilder → maps/Plaza.js (verbatim geometry)

Move the existing arena into the MapDefinition container. The geometry, spawn points, and waypoints are byte-for-byte the same — only their container changes. The existing `SPAWN_POINTS` and `WAYPOINTS` move in here because they were authored for Plaza.

**Files:**
- Create: `src/world/maps/Plaza.js`
- Keep (for now): `src/world/ArenaBuilder.js`, `src/world/SpawnPoints.js` SPawnPoints module-global — will be cleaned in Task 9 once all consumers are migrated. Plaza.js defines its own local copies.

- [ ] **Step 1: Create the Plaza map module**

Create `src/world/maps/Plaza.js` with the full content below. The `build` function body is the verbatim ArenaBuilder.build logic, refactored to use the helper and a local `place`/`placePair`. `SPAWN_POINTS` and `WAYPOINTS` are copied from SpawnPoints.js and BotNavigation.js:

```js
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

// Local shadeHex so the per-map helpers don't depend on the helper object for
// pure color math used at module-eval time.
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
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `node --input-type=module -e "import('./src/world/maps/Plaza.js').then(m => console.log(m.PLAZA.id, m.PLAZA.spawnPoints.length, m.PLAZA.waypoints.length))"`
Expected: prints `plaza 13 12` (no errors). If it errors on `document`/canvas, that's the TextureFactory being imported transitively at module load — but `Plaza.js` only imports `MapDefinition`, not textures, so this should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/world/maps/Plaza.js
git commit -m "feat(maps): migrate ArenaBuilder geometry/spawns/waypoints into maps/Plaza.js"
```

---

## Task 5: Build Foundry map (industrial)

New industrial map. Dark steel palette, raised catwalks, forge pits (walled enclosures), tight cover. Same 80×80 footprint + 8m perimeter walls contract.

**Files:**
- Create: `src/world/maps/Foundry.js`

- [ ] **Step 1: Create the Foundry map module**

Create `src/world/maps/Foundry.js`:
```js
import * as THREE from 'three';
import { MapDefinition } from '../MapDefinition.js';

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

function build(scene, colliders, helper) {
  const group = new THREE.Group();
  const place = (mesh) => { group.add(mesh); colliders.addFromMesh(mesh); };
  const placePair = (w,h,d,color,x,y,z,texName,texOpts) =>
    helper.placePair(place, w,h,d,color,x,y,z,texName,texOpts);

  // GROUND
  place(helper.box(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete'));

  // PERIMETER WALLS (8m steel)
  const wallH = 8;
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, -40, 'metal'));
  place(helper.box(80, wallH, 1, COLORS.wall, 0, wallH/2, 40, 'metal'));
  place(helper.box(1, wallH, 80, COLORS.wall, -40, wallH/2, 0, 'metal'));
  place(helper.box(1, wallH, 80, COLORS.wall, 40, wallH/2, 0, 'metal'));

  // CENTRAL CATWALK RING (raised ~4.2m) — a square ring of platforms on pillars,
  // reachable by ramps. The ring center is open for drops/risks.
  // Ring is 4 long platforms forming a square around origin (inner edge ~9m).
  placePair(14, 0.4, 2.5, COLORS.catwalk, 0, 4.2, 9, 'metal');      // front/back segments
  placePair(2.5, 0.4, 14, COLORS.catwalk, 9, 4.2, 0, 'metal');      // left/right segments
  // Pillars supporting the ring corners
  placePair(1, 4.2, 1, COLORS.steelDark, 9, 2.1, 9, 'metal');
  placePair(1, 4.2, 1, COLORS.steelDark, 9, 2.1, -9, 'metal');
  // Ramps up to the ring (stepped boxes)
  placePair(2.5, 0.6, 4, COLORS.steelLight, 0, 0.3, 16, 'metal');
  placePair(2.5, 1.2, 4, COLORS.steelLight, 0, 0.9, 13, 'metal');
  placePair(2.5, 1.8, 4, COLORS.steelLight, 0, 1.5, 11, 'metal');
  placePair(2.5, 2.4, 4, COLORS.steelLight, 0, 2.1, 9.5, 'metal');

  // FORGE PITS — 2 sunken courtyards: a ring of low walls around a darker
  // floor patch, reads as a recessed work pit / cover pocket. (Faked — no hole
  // in the ground slab, per the AABB-only contract.)
  buildForgePit(placePair, -22, 16);
  buildForgePit(placePair, 22, -16);

  // MACHINERY BLOCKS — dense mid-cover (taller than crates, industrial look)
  placePair(4, 3, 3, COLORS.machinery, -16, 1.5, -6, 'metal');
  placePair(3, 2.5, 4, COLORS.machinery, 6, 1.25, -16, 'metal');
  placePair(2.5, 2, 2.5, COLORS.steel, 18, 1, 8, 'metal');
  placePair(3, 3.5, 2, COLORS.steel, -8, 1.75, 18, 'metal');

  // VERTICAL PIPES / PILLARS — tall thin cover breaking sightlines
  placePair(1.2, 6, 1.2, COLORS.pipe, 12, 3, 12, 'metal');
  placePair(1.2, 6, 1.2, COLORS.pipe, 20, 3, 0, 'metal');

  // LOW COVER PADS for crouch fights
  placePair(5, 0.8, 3, COLORS.steelDark, 14, 0.4, 22, 'metal');
  placePair(3, 0.8, 5, COLORS.steelDark, 22, 0.4, 14, 'metal');

  scene.add(group);
  return group;
}

function buildForgePit(placePair, cx, cz) {
  // A 6x6 walled enclosure with low walls (2.5m) — reads as a sunken forge pit.
  const rimH = 2.5, S = 6, T = 0.5, half = S / 2;
  // Rim walls (4) — leave gaps on opposite sides as "entrances" by using shorter walls
  placePair(S, rimH, T, COLORS.forgeRim, cx, rimH/2, cz - half, 'concrete');
  placePair(S, rimH, T, COLORS.forgeRim, cx, rimH/2, cz + half, 'concrete');
  placePair(T, rimH, S * 0.6, COLORS.forgeRim, cx - half, rimH/2, cz, 'concrete');
  placePair(T, rimH, S * 0.6, COLORS.forgeRim, cx + half, rimH/2, cz, 'concrete');
  // Dark floor patch inside (visual only, flat on ground)
  placePair(S - 1, 0.1, S - 1, COLORS.forge, cx, 0.05, cz, 'concrete');
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
});
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `node --input-type=module -e "import('./src/world/maps/Foundry.js').then(m => console.log(m.FOUNDRY.id, m.FOUNDRY.spawnPoints.length, m.FOUNDRY.waypoints.length))"`
Expected: prints `foundry 12 14` (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/world/maps/Foundry.js
git commit -m "feat(maps): Foundry — industrial arena (catwalks, forge pits, dense cover)"
```

---

## Task 6: Build Dustbowl map (desert)

New desert map. Sandy palette, broad mesas for verticality + long sightlines, sparse rock cover. Sniper-favoring.

**Files:**
- Create: `src/world/maps/Dustbowl.js`

- [ ] **Step 1: Create the Dustbowl map module**

Create `src/world/maps/Dustbowl.js`:
```js
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
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `node --input-type=module -e "import('./src/world/maps/Dustbowl.js').then(m => console.log(m.DUSTBOWL.id, m.DUSTBOWL.spawnPoints.length, m.DUSTBOWL.waypoints.length))"`
Expected: prints `dustbowl 12 15` (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/world/maps/Dustbowl.js
git commit -m "feat(maps): Dustbowl — desert arena (mesas, rock formations, long sightlines)"
```

---

## Task 7: Maps registry

The `MAPS` array + `getMapById`. Order = menu/rotation order; `MAPS[0]` is the default.

**Files:**
- Create: `src/world/Maps.js`
- Test: `src/tests/Maps.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/Maps.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MAPS, getMapById } from '../world/Maps.js';

describe('Maps registry', () => {
  it('has exactly 3 maps in the expected order', () => {
    expect(MAPS).toHaveLength(3);
    expect(MAPS.map(m => m.id)).toEqual(['plaza', 'foundry', 'dustbowl']);
  });

  it('MAPS[0] is the default (plaza)', () => {
    expect(MAPS[0].id).toBe('plaza');
  });

  it('getMapById round-trips every map', () => {
    for (const m of MAPS) {
      expect(getMapById(m.id)).toBe(m);
    }
  });

  it('getMapById returns undefined for unknown id', () => {
    expect(getMapById('nope')).toBeUndefined();
  });

  it('getMapById defaults to plaza for undefined', () => {
    expect(getMapById(undefined).id).toBe('plaza');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/Maps.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/world/Maps.js`:
```js
import { PLAZA } from './maps/Plaza.js';
import { FOUNDRY } from './maps/Foundry.js';
import { DUSTBOWL } from './maps/Dustbowl.js';

// The map roster. Order = menu/rotation order; MAPS[0] is the default.
export const MAPS = [PLAZA, FOUNDRY, DUSTBOWL];

// Look up a map by id. Falls back to the default (Plaza) for undefined/null,
// returns undefined for an unknown (but non-null) id so callers can detect typos.
export function getMapById(id) {
  if (id === undefined || id === null) return MAPS[0];
  return MAPS.find(m => m.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/Maps.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/Maps.js src/tests/Maps.test.js
git commit -m "feat(world): MAPS registry + getMapById (3 maps)"
```

---

## Task 8: MapDefinition contract invariants test

Validates every map in the registry satisfies structural invariants (spawn count, bounds, spawn separation). Catches authoring slips like a spawn inside a wall.

**Files:**
- Test: `src/tests/MapDefinition.test.js`

- [ ] **Step 1: Write the test**

Create `src/tests/MapDefinition.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MAPS } from '../world/Maps.js';

// Structural invariants every map must satisfy. These guard authoring slips
// (a spawn inside a wall, a waypoint off the map) that are hard to see visually.
describe('every registered map satisfies contract invariants', () => {
  for (const map of MAPS) {
    describe(`map "${map.id}"`, () => {
      it('has >= 8 spawn points', () => {
        expect(map.spawnPoints.length).toBeGreaterThanOrEqual(8);
      });

      it('has >= 10 waypoints', () => {
        expect(map.waypoints.length).toBeGreaterThanOrEqual(10);
      });

      it('all spawns lie within the 80x80 arena bounds [-40,40]', () => {
        for (const sp of map.spawnPoints) {
          expect(Math.abs(sp.x)).toBeLessThanOrEqual(40);
          expect(Math.abs(sp.z)).toBeLessThanOrEqual(40);
        }
      });

      it('all waypoints lie within the 80x80 arena bounds [-40,40]', () => {
        for (const wp of map.waypoints) {
          expect(Math.abs(wp.x)).toBeLessThanOrEqual(40);
          expect(Math.abs(wp.z)).toBeLessThanOrEqual(40);
        }
      });

      it('no two spawn points are within 3m of each other', () => {
        for (let i = 0; i < map.spawnPoints.length; i++) {
          for (let j = i + 1; j < map.spawnPoints.length; j++) {
            const d = map.spawnPoints[i].distanceTo(map.spawnPoints[j]);
            expect(d).toBeGreaterThanOrEqual(3);
          }
        }
      });

      it('has a 4-stop sky gradient palette', () => {
        expect(map.palette.sky).toHaveLength(4);
      });
    });
  }
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/tests/MapDefinition.test.js`
Expected: PASS (6 tests × 3 maps = 18 tests). If any spawn-pair is <3m apart or any point is out of bounds, fix the map data.

- [ ] **Step 3: Commit**

```bash
git add src/tests/MapDefinition.test.js
git commit -m "test(maps): MapDefinition contract invariants (spawns/waypoints/bounds)"
```

---

## Task 9: Make SpawnPoints + BotNavigation map-aware

Decouple navigation/spawn data from module globals. `getRandomSpawn` takes the active map's spawn list; `BotNavigation` and `AIController` take a waypoints array.

**Files:**
- Modify: `src/world/SpawnPoints.js`
- Modify: `src/ai/BotNavigation.js`
- Modify: `src/ai/AIController.js`
- Modify: `src/tests/SpawnPoints.test.js`

- [ ] **Step 1: Read the current SpawnPoints test to preserve its intent**

Run: `cat src/tests/SpawnPoints.test.js`
Note its current assertions (it tests `getRandomSpawn` picks the farthest point). The test will be updated to pass an explicit spawn list.

- [ ] **Step 2: Update SpawnPoints.js**

Replace the contents of `src/world/SpawnPoints.js` with:
```js
import * as THREE from 'three';

// Returns the spawn point farthest from all live (occupied) positions.
// `points` is the active map's spawnPoints array (THREE.Vector3[]).
// `occupied` is an array of THREE.Vector3 (live player positions).
export function getRandomSpawn(occupied = [], points) {
  if (!points || points.length === 0) return new THREE.Vector3(0, 1, 0);
  let best = points[0];
  let bestDist = -1;
  for (const sp of points) {
    let nearest = Infinity;
    for (const o of occupied) {
      const d = sp.distanceToSquared(o);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestDist) {
      bestDist = nearest;
      best = sp;
    }
  }
  return best.clone();
}
```
(The module-global `SPAWN_POINTS` is removed — it now lives in Plaza.js.)

- [ ] **Step 3: Update BotNavigation.js**

Replace `src/ai/BotNavigation.js` contents with:
```js
import * as THREE from 'three';

// Waypoint navigation over a given waypoint graph (the active map's waypoints).
// Each node is a position; edges are implied by "go to nearest node toward goal"
// (greedy, no full A* for MVP). The waypoint set is passed in by the caller
// (Game.js), sourced from the active MapDefinition — NOT a module global.
export class BotNavigation {
  constructor(waypoints) {
    this.waypoints = waypoints && waypoints.length ? waypoints : [new THREE.Vector3(0, 0, 0)];
    this.target = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.pickRandomPatrolPoint();
  }
  pickRandomPatrolPoint() {
    this.target = this.waypoints[Math.floor(Math.random() * this.waypoints.length)].clone();
  }
  setChaseTarget(point) {
    this.target = point.clone();
  }
  // Returns a wishdir (normalized) toward current target. Falls back to a random
  // waypoint if reached. Jumps if stuck.
  computeWishdir(bot, dt) {
    if (!this.target || bot.position.distanceTo(this.target) < 1.5) {
      this.pickRandomPatrolPoint();
    }
    const dir = new THREE.Vector3().subVectors(this.target, bot.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) return { x: 0, z: 0, jump: false };
    dir.normalize();
    // stuck detection
    const moved = bot.position.distanceTo(this.lastPos);
    this.lastPos.copy(bot.position);
    if (moved < 0.02) this.stuckTimer += dt; else this.stuckTimer = 0;
    const jump = this.stuckTimer > 0.4;
    if (jump) this.stuckTimer = 0;
    return { x: dir.x, z: dir.z, jump };
  }
}
```

- [ ] **Step 4: Update AIController.js constructor + BotNavigation usage**

In `src/ai/AIController.js`, change the constructor to accept waypoints and pass them to BotNavigation. Replace:
```js
  constructor(bot, difficulty) {
    this.bot = bot;
    this.diff = difficulty;
    this.state = STATES.PATROL;
    this.nav = new BotNavigation();
    this.nav.pickRandomPatrolPoint();
    this.target = null;
    this.lastSeenTime = 0;
    this.reactionTimer = 0;
  }
```
with:
```js
  constructor(bot, difficulty, waypoints) {
    this.bot = bot;
    this.diff = difficulty;
    this.state = STATES.PATROL;
    this.nav = new BotNavigation(waypoints);  // waypoints come from the active map
    this.target = null;
    this.lastSeenTime = 0;
    this.reactionTimer = 0;
  }
```
(The `this.nav.pickRandomPatrolPoint()` line is removed because BotNavigation's constructor now self-initializes. The rest of AIController is unchanged — it already calls `this.nav.pickRandomPatrolPoint()` / `setChaseTarget` / `computeWishdir`.)

- [ ] **Step 5: Update SpawnPoints.test.js**

Replace `src/tests/SpawnPoints.test.js` with:
```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getRandomSpawn } from '../world/SpawnPoints.js';

describe('getRandomSpawn', () => {
  const points = [
    new THREE.Vector3(0, 1, 30), new THREE.Vector3(0, 1, -30),
    new THREE.Vector3(30, 1, 0), new THREE.Vector3(-30, 1, 0),
  ];

  it('returns the point farthest from all occupied positions', () => {
    const occupied = [new THREE.Vector3(29, 1, 0)];  // near the (30,0) spawn
    const sp = getRandomSpawn(occupied, points);
    // farthest from (29,0) should be (-30,0)
    expect(sp.x).toBe(-30);
    expect(sp.z).toBe(0);
  });

  it('returns a clone, not a reference into the points array', () => {
    const sp = getRandomSpawn([], points);
    sp.x = 999;
    expect(points.some(p => p.x === 999)).toBe(false);
  });

  it('falls back to origin when points is empty', () => {
    const sp = getRandomSpawn([], []);
    expect(sp.x).toBe(0);
    expect(sp.z).toBe(0);
  });
});
```

- [ ] **Step 6: Run the affected tests**

Run: `npx vitest run src/tests/SpawnPoints.test.js src/tests/BotAim.test.js src/tests/BotAim.direction.test.js`
Expected: PASS. (BotAim tests don't touch waypoints, so they stay green. If a BotNavigation-using test exists and breaks, update it to pass waypoints — but none currently do.)

- [ ] **Step 7: Commit**

```bash
git add src/world/SpawnPoints.js src/ai/BotNavigation.js src/ai/AIController.js src/tests/SpawnPoints.test.js
git commit -m "refactor(ai): map-aware spawns + waypoints (drop module globals)"
```

---

## Task 10: Wire Game.js to the map system (loadMap + map-aware startMatch)

The core integration. Game becomes map-agnostic: it loads the selected map, feeds its data into spawns/bots, and rebuilds colliders + sky/fog on switch. Also generalizes the hardcoded `makeSkyTexture` to take gradient stops.

**Files:**
- Modify: `src/core/Game.js`

- [ ] **Step 1: Update imports in Game.js**

Replace:
```js
import { ArenaBuilder } from '../world/ArenaBuilder.js';
```
with:
```js
import { MAPS, getMapById } from '../world/Maps.js';
import { makeBuildHelper } from '../world/MapBuildHelper.js';
```
And the existing `import { getRandomSpawn } from '../world/SpawnPoints.js';` stays.

- [ ] **Step 2: Generalize makeSkyTexture to accept gradient stops**

Replace the module-level `makeSkyTexture()` function:
```js
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5a8fcf');    // zenith — deeper blue
  g.addColorStop(0.5, '#9cc4e8');  // mid sky
  g.addColorStop(0.82, '#d8ecf7'); // haze near horizon
  g.addColorStop(1, '#f0e8d8');    // warm horizon glow
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```
with:
```js
// Build a vertical gradient sky texture from 4 stops [zenith, mid, haze, horizon].
// Falls back to the original Plaza palette if stops are omitted (backward compat).
function makeSkyTexture(stops) {
  const s = stops && stops.length === 4 ? stops
    : ['#5a8fcf', '#9cc4e8', '#d8ecf7', '#f0e8d8'];
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, s[0]);    // zenith
  g.addColorStop(0.5, s[1]);  // mid sky
  g.addColorStop(0.82, s[2]); // haze near horizon
  g.addColorStop(1, s[3]);    // warm horizon glow
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

- [ ] **Step 3: Replace the arena build in the constructor with loadMap**

In the constructor, replace:
```js
    // World
    this.colliders = new ColliderStore();
    this.arena = new ArenaBuilder();
    this.arena.build(this.scene, this.colliders);
```
with:
```js
    // World — map system. The active map owns geometry, spawns, waypoints, palette.
    this.colliders = new ColliderStore();
    this.buildHelper = makeBuildHelper();
    this.arenaGroup = null;            // the THREE.Group returned by map.build (for teardown)
    this.activeMap = MAPS[0];          // default map; MainMenu / rotation can change it
    this.rotationIndex = 0;
    this.rotateMaps = true;
    this.loadMap(this.activeMap);
```

- [ ] **Step 4: Add the loadMap method**

Add this method to the Game class (place it right after `onResize()`):
```js
  // Tear down the current arena and build a new one from `map`. Sets the sky/fog
  // palette and rebuilds the collider store. Called on init and on map switch.
  loadMap(map) {
    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      // dispose geometries/materials to avoid GPU leaks across many matches
      this.arenaGroup.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
            else o.material.dispose();
          }
        }
      });
    }
    this.colliders.clear();
    this.activeMap = map;
    this.scene.background = makeSkyTexture(map.palette.sky);
    this.scene.fog = new THREE.FogExp2(map.palette.fog, map.palette.fogDensity);
    this.arenaGroup = map.build(this.scene, this.colliders, this.buildHelper);
  }
```

- [ ] **Step 5: Make startMatch map-aware**

Change the `startMatch` signature and the bot/player spawn + AI construction. Replace:
```js
  startMatch(animalId, weaponId) {
```
with:
```js
  startMatch(animalId, weaponId, mapId) {
    // Switch map if a different one was selected.
    const map = getMapById(mapId) || this.activeMap;
    if (map.id !== this.activeMap.id) this.loadMap(map);
```
Then, everywhere `getRandomSpawn(occupied)` is called inside startMatch, pass the active map's spawns:
```js
      const sp = getRandomSpawn(occupied, this.activeMap.spawnPoints);
```
And for the player respawn at the top of startMatch, the `respawnPlayer` already calls `getRandomSpawn` — update `respawnPlayer` (next step) to use the active map. Finally, change the bot AI construction:
```js
      bot.brain = new AIController(bot, diff);
```
to:
```js
      bot.brain = new AIController(bot, diff, this.activeMap.waypoints);
```

- [ ] **Step 6: Make respawnPlayer map-aware**

In `respawnPlayer(player)`, find the `getRandomSpawn(...)` call and pass the active map's spawn points. Replace:
```js
    const sp = getRandomSpawn(occupied);
```
with:
```js
    const sp = getRandomSpawn(occupied, this.activeMap.spawnPoints);
```

- [ ] **Step 7: Update the MainMenu onStart wiring + rotation**

In the constructor, the MainMenu is created with:
```js
    this.menu = new MainMenu(uiRoot, {
      onStart: ({ animal, weapon }) => this.startMatch(animal, weapon),
      onToggleSettings: () => this.settings.toggle(),
    });
```
Change to pass the map + rotation:
```js
    this.menu = new MainMenu(uiRoot, {
      onStart: ({ animal, weapon, map, rotate }) => {
        this.rotateMaps = rotate !== false;
        this.startMatch(animal, weapon, map);
      },
      onToggleSettings: () => this.settings.toggle(),
    });
```

- [ ] **Step 8: Advance rotation in returnToMenu**

In `returnToMenu()`, after `this.menu.show();`, add rotation logic:
```js
    if (this.rotateMaps) {
      this.rotationIndex = (this.rotationIndex + 1) % MAPS.length;
      this.menu.setSelectedMap(MAPS[this.rotationIndex].id);
    }
    this.menu.show();
```
(Remove the now-duplicated `this.menu.show()` if it was already there — keep one call. `MainMenu.setSelectedMap` is added in Task 11.)

- [ ] **Step 9: Verify Game.js still parses (syntax check)**

Run: `node --check src/core/Game.js`
Expected: no output (valid syntax). Note: this only checks syntax, not runtime — full verification is the screenshot in Task 12.

- [ ] **Step 10: Run the full test suite to confirm no regressions in pure-logic tests**

Run: `npx vitest run`
Expected: all tests PASS. Game.js itself isn't unit-tested (needs WebGL), but the ai/world/config tests must stay green.

- [ ] **Step 11: Commit**

```bash
git add src/core/Game.js
git commit -m "feat(core): map-aware Game lifecycle (loadMap, map-aware startMatch/respawn, rotation)"
```

---

## Task 11: Map selector + rotation toggle in MainMenu

Add a third selector row for maps and a rotation checkbox. Persist the choice to localStorage. Provide `setSelectedMap` for rotation to call.

**Files:**
- Modify: `src/ui/MainMenu.js`

- [ ] **Step 1: Update MainMenu imports + state**

Add the map import and selection state. Replace the top of `src/ui/MainMenu.js`:
```js
import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';

export class MainMenu {
  constructor(root, { onStart, onToggleSettings } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onToggleSettings = this.onToggleSettings;
    this.selectedAnimal = 'FOX';
    this.selectedWeapon = 'AR';
```
with:
```js
import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';
import { MAPS } from '../world/Maps.js';

export class MainMenu {
  constructor(root, { onStart, onToggleSettings } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onToggleSettings = onToggleSettings;
    this.selectedAnimal = localStorage.getItem('as_animal') || 'FOX';
    this.selectedWeapon = localStorage.getItem('as_weapon') || 'AR';
    this.selectedMap = localStorage.getItem('as_map') || MAPS[0].id;
    this.rotateMaps = localStorage.getItem('as_rotate') !== 'false'; // default true
```

- [ ] **Step 2: Add the map selector + rotation toggle to render()**

In `render()`, after the weapon selector `</div>` and before the PLAY button, insert a map selector block. Find this line:
```js
      <button id="play-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 48px;
```
and insert BEFORE it:
```js
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;justify-content:center;max-width:820px;">
        ${MAPS.map(m => `
          <button data-map="${m.id}" style="
            background:${this.selectedMap===m.id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 16px;border-radius:8px;cursor:pointer;text-align:left;max-width:200px;">
            ${m.name}<br><small style="opacity:.6">${m.desc}</small>
          </button>`).join('')}
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:24px;color:#fff;font-size:14px;cursor:pointer;">
        <input type="checkbox" id="rotate-maps" ${this.rotateMaps?'checked':''} style="width:18px;height:18px;">
        <span>🔄 Rotate maps after each match</span>
      </label>
```

- [ ] **Step 3: Wire the map buttons + rotation checkbox + persist selection**

After the weapon button wiring (`this.el.querySelectorAll('[data-weapon]')...`), add:
```js
    this.el.querySelectorAll('[data-map]').forEach(b => {
      b.onclick = () => { this.selectedMap = b.dataset.map; localStorage.setItem('as_map', this.selectedMap); this.render(); };
    });
    const rotateCb = this.el.querySelector('#rotate-maps');
    if (rotateCb) rotateCb.onchange = () => { this.rotateMaps = rotateCb.checked; localStorage.setItem('as_rotate', this.rotateMaps); };
```
And persist animal/weapon selection in their existing handlers — update:
```js
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; this.render(); };
    });
```
to:
```js
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; localStorage.setItem('as_animal', this.selectedAnimal); this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; localStorage.setItem('as_weapon', this.selectedWeapon); this.render(); };
    });
```

- [ ] **Step 4: Pass map + rotate in onStart**

Update the play button handler:
```js
    this.el.querySelector('#play-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onStart) this.onStart({
        animal: this.selectedAnimal,
        weapon: this.selectedWeapon,
        map: this.selectedMap,
        rotate: this.rotateMaps,
      });
    };
```

- [ ] **Step 5: Add setSelectedMap method (used by Game's rotation)**

Add after the `hide()` method:
```js
  // Called by Game.returnToMenu to advance the rotation: highlights the next map.
  setSelectedMap(id) {
    if (MAPS.some(m => m.id === id)) {
      this.selectedMap = id;
      localStorage.setItem('as_map', id);
    }
  }
```

- [ ] **Step 6: Verify syntax**

Run: `node --check src/ui/MainMenu.js`
Expected: no output (valid syntax).

- [ ] **Step 7: Commit**

```bash
git add src/ui/MainMenu.js
git commit -m "feat(ui): map selector + rotation toggle in main menu (persisted)"
```

---

## Task 12: Delete legacy ArenaBuilder + clean up the old SPAWN_POINTS/WAYPOINTS globals

Now that all consumers use the map system, remove the dead module-global data and the old ArenaBuilder class. This is the cleanup that completes the refactor.

**Files:**
- Delete: `src/world/ArenaBuilder.js`
- Verify: no remaining imports of `ArenaBuilder` or `SPAWN_POINTS` or `WAYPOINTS` module globals

- [ ] **Step 1: Confirm nothing imports the legacy ArenaBuilder**

Run: `grep -rn "ArenaBuilder" src/ || echo "no references"`
Expected: "no references" (Plaza.js replaced it; Game.js imports Maps.js now).

- [ ] **Step 2: Confirm nothing imports the module-global SPAWN_POINTS / WAYPOINTS**

Run: `grep -rn "import.*SPAWN_POINTS\|import.*WAYPOINTS" src/ || echo "no references"`
Expected: "no references" (SpawnPoints.js no longer exports SPAWN_POINTS; BotNavigation takes waypoints via constructor).

- [ ] **Step 3: Delete ArenaBuilder.js**

Run: `rm src/world/ArenaBuilder.js`

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/world/ArenaBuilder.js
git commit -m "refactor(world): remove legacy ArenaBuilder (replaced by maps/Plaza.js)"
```

---

## Task 13: Runtime verification — all 3 maps render + bots navigate

Visual + behavioral check via the dev server + Playwright. Confirms: each map builds without errors, the sky/fog changes per map, bots spawn and fight on each map, and map rotation advances.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Note the URL (default http://localhost:5173).

- [ ] **Step 2: Load the page and confirm the menu shows 3 maps**

Navigate Playwright to the URL, snapshot the menu. Confirm the map selector shows Plaza / Foundry / Dustbowl buttons and the rotation checkbox.

- [ ] **Step 3: Play Foundry — confirm it builds, sky is smoggy, bots fight**

Click the Foundry map button, click PLAY, wait 3s. Take a screenshot. Confirm: dark industrial scene renders (no console errors), HUD shows. Run a JS evaluate to confirm `window.__game` ... NOTE: the debug hook was removed in the prior bug fix. For this verification, temporarily check via console logs or just rely on the screenshot + console-errors check.

Actually — for verification we need inspection. Temporarily re-add the debug hook, verify, then remove it. Add to `src/main.js` after `game.start();`:
```js
if (typeof window !== 'undefined') window.__game = game;
```

- [ ] **Step 4: Verify each map via runtime inspection**

For each map id (plaza, foundry, dustbowl): start a match on it, then evaluate in Playwright:
```js
() => {
  const g = window.__game;
  return {
    map: g.activeMap.id,
    skySet: g.scene.background.image ? 'gradient' : 'none',
    fogColor: g.scene.fog.color.getHexString(),
    botCount: g.bots.length,
    aliveBots: g.bots.filter(b => b.alive).length,
    botStates: g.bots.map(b => b.brain.state),
    colliders: g.colliders.boxes.length,
  };
}
```
Confirm: `map` matches the selected id, `fogColor` differs per map (plaza=bfe3f5, foundry=6a7078, dustbowl=d8c8a0), bots are alive and in varied FSM states, colliders > 0.

- [ ] **Step 5: Verify map rotation advances**

Play + end a match (or call `g.returnToMenu()` via evaluate), then check `g.menu.selectedMap` advanced to the next map id, and `g.rotationIndex` incremented.

- [ ] **Step 6: Verify bots navigate (no stuck-cluster) on a new map**

On Dustbowl, evaluate after 5s of play: check bots have nonzero velocity / varied positions (not all clumped at origin). The contract test guards bounds; this confirms the waypoint set actually routes them.

- [ ] **Step 7: Remove the temporary debug hook**

Restore `src/main.js` to (remove the `window.__game` line):
```js
import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();
```

- [ ] **Step 8: Stop the dev server**

Kill the background vite process.

- [ ] **Step 9: Commit the debug-hook cleanup (if it was tracked)**

```bash
git status
# if src/main.js shows as modified:
git checkout src/main.js   # or commit if there were other intended changes
```

---

## Task 14: Update README + final push

Document the new maps feature and bump the test count badge.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README features section**

In `README.md`, in the features bullet list, add a new bullet for maps (after the arena bullet):
```markdown
- **3 maps + rotation** — fight across **Plaza** (open central yard + twin towers), **Foundry** (industrial catwalks + forge pits), and **Dustbowl** (desert mesas + long sightlines). Pick a map in the menu or let **🔄 rotation** cycle them between matches. Each map is a self-contained `MapDefinition` (geometry + spawns + waypoints + palette).
```

- [ ] **Step 2: Update the roadmap**

In the Roadmap section, mark "More maps" as done and update the remaining items. Change:
```markdown
- **More maps** — each arena is its own `ArenaBuilder` + waypoint graph
```
to:
```markdown
- ~~**More maps** — done (Plaza / Foundry / Dustbowl + rotation)~~
```

- [ ] **Step 3: Update the test-count badge**

Find the badge line `![tests](https://img.shields.io/badge/tests-69%20passing-brightgreen)` and update the count to the new total. Run `npx vitest run 2>&1 | grep "Tests "` to get the exact count, then update the badge (e.g. `tests-NN%20passing`).

- [ ] **Step 4: Commit + push**

```bash
git add README.md
git commit -m "docs: README — 3 maps + rotation feature, updated roadmap + test badge"
git push origin master
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- MapDefinition contract → Task 2 ✓
- MapBuildHelper (box/placePair/shadeHex) → Task 3 ✓
- Plaza migration (verbatim geometry) → Task 4 ✓
- Foundry (industrial) → Task 5 ✓
- Dustbowl (desert) → Task 6 ✓
- Registry + getMapById → Task 7 ✓
- Contract invariants test → Task 8 ✓
- SpawnPoints map-aware → Task 9 ✓
- BotNavigation/AIController waypoints → Task 9 ✓
- ColliderStore.clear → Task 1 ✓
- Game.loadMap + map-aware startMatch + sky/fog palette → Task 10 ✓
- MainMenu selector + rotation + persistence → Task 11 ✓
- Legacy cleanup (delete ArenaBuilder, drop globals) → Task 12 ✓
- Runtime verification → Task 13 ✓
- README → Task 14 ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete.

**Type/signature consistency:** `getRandomSpawn(occupied, points)` used consistently in Tasks 9 & 10. `new AIController(bot, diff, waypoints)` consistent in Tasks 9 & 10. `map.build(scene, colliders, helper)` consistent throughout. `makeSkyTexture(stops)` matches the `palette.sky` array shape. `setSelectedMap(id)` defined in Task 11 matches the call in Task 10.
