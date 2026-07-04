# Multi-Map + Rotation — Design Spec

**Date:** 2026-07-04
**Status:** Approved (Approach A: MapDefinition + registry)
**Author:** design brainstorm → spec
**Roadmap item:** "More maps — each arena is its own ArenaBuilder + waypoint graph"

## Goal

Promote the single hardcoded arena into a **3-map roster** with a map selector in the menu and automatic rotation between matches. Each map is a self-contained `MapDefinition` (geometry + spawns + waypoints + look), so adding a 4th map later is one new module + one registry line.

**Maps:**
1. **Plaza** (existing) — green concrete ground, wood crates, twin corner towers, open central structure. Balanced, the current experience, preserved as-is.
2. **Foundry** (new) — industrial: dark steel/metal surfaces, raised catwalks, forge pits (lowered floor pits used as cover), tight verticality. Encourages close-quarters + vertical fights.
3. **Dustbowl** (new) — desert: sandy concrete, broad mesas (flat-topped rock blocks) for long sightlines, scattered rock formations, sparse cover. A sniper's map.

All three reuse the existing procedural textures (`concrete`, `metal`, `wood`) recolored per-map palette — **no new texture code**.

## Architecture: the MapDefinition contract

A single source of truth per map. Today these concerns are scattered across `ArenaBuilder.js`, `SpawnPoints.js` (`SPAWN_POINTS`), and `BotNavigation.js` (`WAYPOINTS`), imported directly by `Game.js`. This refactor unifies them.

### The contract (new: `src/world/MapDefinition.js`)

```js
// A MapDefinition bundles everything Game.js needs to run a match on a map.
// Each map module (Plaza, Foundry, Dustbowl) exports one of these.
export class MapDefinition {
  constructor(cfg) {
    this.id      = cfg.id;        // 'plaza' | 'foundry' | 'dustbowl'
    this.name    = cfg.name;      // display: 'Plaza'
    this.desc    = cfg.desc;      // one-line tagline for the selector
    this.palette = cfg.palette;   // look + mood (see Palette shape below)
    this.build   = cfg.build;     // (scene, colliderStore, helper) -> THREE.Group
    this.spawnPoints = cfg.spawnPoints;   // THREE.Vector3[]
    this.waypoints    = cfg.waypoints;    // THREE.Vector3[]
  }
}
```

`build(scene, colliders, helper)` receives a small **shared `helper`** object exposing the proven primitives currently inlined in `ArenaBuilder`:
- `helper.box(w,h,d,color,x,y,z,texName,texOpts)` → `THREE.Mesh` — textured PBR box that casts/receives shadows (verbatim from current `ArenaBuilder.box`).
- `helper.placePair(place, w,h,d,color,x,y,z,texName,texOpts)` — given a `place(mesh)` callback, emits the box at `(x,y,z)` **and** its 180°-rotational partner at `(-x,y,-z)` (skipping the mirror when `x===0 && z===0`). The `place` callback is what adds the mesh to both the render group and the collider store; the map's `build` owns `place` so it controls its own group. This is the exact signature of the current `placePair`, just relocated — symmetry is enforced here, not by hand-mirroring.
- `helper.shadeHex(h, amt)` — color shading.

These move into a shared `MapBuildHelper` so every map authors geometry the same way. **The symmetry rule is enforced by `placePair`** — a map only ever describes half the arena (plus any origin-symmetric pieces).

### The registry (new: `src/world/Maps.js`)

```js
export const MAPS = [ PLAZA, FOUNDRY, DUSTBOWL ];
export function getMapById(id) { ... }
```

`MAPS[0]` is the default (Plaza). Order = menu/rotation order.

### Palette shape

The current sky is a 4-stop vertical canvas gradient (`makeSkyTexture` in Game.js: zenith → mid → haze → warm horizon), and fog is a `FogExp2(color, density)`. So a map's `palette` is not a single color — it specifies the full look:

```js
palette: {
  sky:   ['#5a8fcf', '#9cc4e8', '#d8ecf7', '#f0e8d8'], // [zenith, mid, haze, horizon] gradient stops
  fog:   0xbfe3f5,     // FogExp2 color
  fogDensity: 0.006,   // FogExp2 density
  sun:   0xfff2d8,     // directional key-light color (optional; defaults to current warm white)
}
```

`Game.loadMap` reads `palette.sky` to rebuild the gradient texture (generalizing the current hardcoded `makeSkyTexture`), sets `scene.fog` from `fog`/`fogDensity`, and tints the sun if `sun` is present. The ground tint is **not** in the palette — it's part of each map's `build` (the ground box color), since the ground is geometry, not atmosphere.

## Component changes

### 1. `ColliderStore` — add `clear()`
New method empties `this.boxes` so a map switch can rebuild without leaking the old arena's AABBs into the new map's collisions (would cause invisible-wall bugs and raycast false-positives). One-liner: `this.boxes.length = 0`.

### 2. `ArenaBuilder.js` → `src/world/maps/Plaza.js`
The existing `ArenaBuilder` class body becomes a `build(scene, colliders, helper)` function. Its private helpers (`_buildTower`, `_buildCrateCluster`, `_buildPerch`) move alongside it as local functions. The `COLORS` constant stays. The geometry is **byte-for-byte the same** — only its container changes. Exports `PLAZA = new MapDefinition({ id:'plaza', ... build, spawnPoints: SPAWN_POINTS, waypoints: WAYPOINTS, palette })`.

The existing `SPAWN_POINTS` (from `SpawnPoints.js`) and `WAYPOINTS` (from `BotNavigation.js`) move **into** the Plaza map module as its data. They were authored for Plaza's geometry, so they belong with it.

### 3. New maps: `src/world/maps/Foundry.js`, `src/world/maps/Dustbowl.js`
Each exports a `MapDefinition` with its own palette, geometry (built with the shared `helper`), spawn points, and waypoints. Each map:
- Keeps the **80×80 footprint, 8m perimeter walls** contract (so spawn logic, the fog density, and the sun shadow camera bounds all still work unchanged).
- Uses `placePair` for 180° rotational symmetry (fair FFA spawns).
- Provides **≥8 spawn points** (the current set has 13) spread far from the center, none embedded in geometry.
- Provides **≥10 waypoints** covering lanes + elevated positions, so bots can navigate sensibly.

**Foundry palette:** dark gunmetal metal ground (`0x3a3e44`), steel walls, warm-orange accent light (forge glow), overcast sky tint (`0x6a7080`), denser fog (`0.009`). Geometry: 2 raised catwalk rings at y≈4 connected by ramps, 4 forge pits (lowered boxes the player drops into — implemented as walls around a recessed area, since the collider is AABB-only and the ground is a single slab, pits are faked as **low-walled enclosures** rather than true holes), dense crate/machinery cover. Tighter lanes than Plaza.

**Dustbowl palette:** sandy concrete ground (`0xc9a878`), tan rock walls (`0xb89060`), pale sky (`0xd8e8f0`), light fog (`0.004`). Geometry: 3-4 broad mesas (flat-topped blocks 4-5m tall, reachable by stacked-rock stairs), long low walls as sightline blockers, sparse rock-cover. Open long lanes favor the Sniper.

> **Pit implementation note:** true floor holes require either a non-contiguous ground mesh or a custom collider. To respect the AABB-only contract and single-slab ground, Foundry's "forge pits" are **sunken courtyards**: a ring of low walls around a ground-level area reads as a pit and provides cover, without needing geometry holes. This is called out so the implementer doesn't attempt a real recess.

### 4. `SpawnPoints.js` and `BotNavigation.js` — become map-aware
- `getRandomSpawn(occupied, map)` takes the active map's `spawnPoints` instead of the module global. The module-global `SPAWN_POINTS` is removed (moved into Plaza).
- `BotNavigation` currently reads the module-global `WAYPOINTS`. Change: `BotNavigation` constructor takes a `waypoints` array; `pickRandomPatrolPoint` draws from it. The AIController already constructs `BotNavigation` via `new BotNavigation()` in its own constructor — so the waypoints must be passed **into** the AIController, which receives them from Game.js when building bots (Game knows the active map). Concretely: `new AIController(bot, diff, this.activeMap.waypoints)`.

This is the key decoupling: navigation data lives in the map, not in a global.

### 5. `Game.js` — map-aware lifecycle
- Constructor: instead of `this.arena = new ArenaBuilder(); this.arena.build(...)`, store `this.activeMap = MAPS[0]` (Plaza) and call `this.loadMap(this.activeMap)`.
- New `loadMap(map)`: clears `this.colliders` + removes the old arena `Group` from the scene, sets `this.scene.background`/`fog` from `map.palette`, calls `map.build(scene, colliders, helper)`, retains the returned group for later removal.
- `startMatch(animalId, weaponId, mapId?)`: if `mapId` differs from `this.activeMap.id`, call `loadMap`. Bots are constructed with `this.activeMap.waypoints`. Player + bot spawns use `getRandomSpawn(occupied, this.activeMap)`.
- **Rotation:** `returnToMenu()` advances `this.rotationIndex` and sets the menu's selected map to `MAPS[rotationIndex % MAPS.length]` when rotation is on. The menu reflects this; the user can still override. `endMatch` → play-again → `returnToMenu` carries the rotation forward.
- A `helper` object is constructed once (it's stateless: just the `box`/`placePair`/`shadeHex` functions) and passed to each `map.build`.

### 6. `MainMenu.js` — map selector + rotation toggle
Add a third selector row (after animal + weapon) showing the 3 maps as buttons (name + tagline), plus a **"🔄 Rotate maps"** checkbox (on by default). `onStart` callback now also passes `{ map: selectedMapId, rotate }`. The menu persists the choice to `localStorage` (matching the settings panel pattern). When rotation is on, `returnToMenu` sets the highlighted map to the next in rotation before showing.

## Data flow

```
MainMenu (user picks map) ──onStart({animal,weapon,mapId,rotate})──▶ Game.startMatch
   │                                                                       │
   │                                                              loadMap(activeMap)
   │                                                  clears colliders, builds geometry,
   │                                                  sets sky/fog from palette
   │                                                                       │
   └──── rotation state ◀── returnToMenu bumps index ───── spawns use activeMap.spawnPoints
                                                       bots get activeMap.waypoints
```

## Testing

Three layers, all node-environment Vitest (existing pattern):

1. **MapDefinition contract test** (`MapDefinition.test.js`) — every map in `MAPS` satisfies invariants: has `id/name/desc/palette/build/spawnPoints/waypoints`; `spawnPoints.length >= 8`; `waypoints.length >= 10`; all spawn points and waypoints lie within the `[-40,40]` arena bounds; no two spawn points are within 3m of each other (spawn-safety). This catches authoring slips (a spawn inside a wall, a waypoint off the map).

2. **Maps registry test** (`Maps.test.js`) — `MAPS` has exactly 3 entries, ids are unique, `getMapById` round-trips, `MAPS[0].id === 'plaza'` (default).

3. **Spawn distribution test** (extend existing `SpawnPoints.test.js`) — `getRandomSpawn(occupied, map)` returns the point farthest from occupied, works with an arbitrary map's spawn list.

Geometry building itself is **not** unit-tested (it needs WebGL/canvas and is visual); the contract tests guard the data invariants, and a runtime screenshot verifies the look. The `CharacterView.facing.test.js` and `BotAim.direction.test.js` regression tests remain green — navigation/spawn changes don't touch aim or model orientation.

## Out of scope (YAGNI)

- Map-vote screen between matches (deferred — a simple rotation + manual override is enough).
- A 4th+ map (the contract supports it, but we build exactly 3).
- Per-map custom textures or new texture types (recoloring existing ones suffices).
- True floor holes / non-AABB geometry (pits are faked as walled enclosures).
- Per-map bot waypoint pathfinding upgrades (greedy nearest-node stays; each map just ships a tuned waypoint set).
- Map-specific lighting rigs (the existing sun + fill + bloom stays; only sky/fog color + ground tint change per palette).

## Risk / rollback

The Plaza refactor is the riskiest step (moving the working arena into the new container). Mitigation: the geometry-build code is moved verbatim; a runtime screenshot of Plaza after refactor must look identical to before. If a map's geometry causes bot navigation problems, the contract test's waypoint-coverage check + a live bot-LOS spot-check (the same technique that caught the bot-facing bug) will surface it before commit. All changes are on `master` behind individual commits, so any single map can be reverted independently.
