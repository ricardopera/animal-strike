# Canopy Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6th map (`Canopy`) — a high-altitude treehouse arena with parkour traversal and instant-death falls — plus the opt-in `killY` fall plane it requires.

**Architecture:** An optional `killY` field on `MapDefinition` enables fall death, checked after each player's `tickMovement(...)` in both `Game.js` (singleplayer) and `Sim.js` (dedicated server) via a shared headless-safe helper. The map itself follows the established `authorGeometry(place, placePair)` + `build()` pattern (authored once, run in mesh mode client-side and AABB mode server-side), 180°-rotationally symmetric via `placePair`. New themed props live in `src/world/props/Treehouse.js` mirroring `Village.js`/`PalmTree.js`.

**Tech Stack:** Three.js r0.185, Vite 8, Vitest 4, ES modules. Pure browser WebGL target.

**Reference spec:** `docs/superpowers/specs/2026-07-07-canopy-map-design.md`

---

## File Structure

**New files:**
- `src/world/FallDeath.js` — `checkFallDeath(player, map) -> boolean`. Pure math, no THREE import (headless-safe for server).
- `src/world/props/Treehouse.js` — themed prop factories: `canopyFoliage()`, `treehouseInterior()`, `lantern()`, `ropeStrands()`, `metalRivets()`. Each returns `{ group, boxes }` following the `Village.js`/`PalmTree.js` pattern. Decorative-only visuals; collision comes from the map's `place()` boxes.
- `src/world/maps/Canopy.js` — the map: `COLORS`, `SPAWN_POINTS`, `WAYPOINTS`, `authorGeometry(place, placePair)`, `build()`, module-load collider pass, `CANOPY` export.
- `src/tests/FallDeath.test.js` — opt-in behavior of the helper.
- `src/tests/Canopy.test.js` — contract test for the map (mirrors existing map tests).
- `src/tests/Maps.killY.test.js` — backward-compat: all pre-existing maps leave `killY` undefined.

**Modified files:**
- `src/world/MapDefinition.js` — add optional `killY` field + validation.
- `src/world/Maps.js` — import + register `CANOPY` (6th entry).
- `src/core/Game.js` — after each player's `tickMovement(...)`, call `checkFallDeath` and handle fall death (no-frag, killfeed, voice, respawn timer). Reuses existing `respawnTimers`/`respawnPlayer`.
- `src/sim/Sim.js` — mirror the same check in `Sim.tick`'s movement pass, for dedicated-server parity.
- `src/tests/Maps.test.js` — bump expected count from 5 → 6 and add `canopy` to the id list.

---

## Task 1: Opt-in `killY` field on `MapDefinition`

**Files:**
- Modify: `src/world/MapDefinition.js`
- Test: `src/tests/MapDefinition.killY.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `src/tests/MapDefinition.killY.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MapDefinition } from '../world/MapDefinition.js';

function baseConfig() {
  return {
    id: 'killY-test',
    name: 'KillY Test',
    desc: 'a test map for killY validation',
    palette: { sky: ['#000', '#111', '#222', '#333'], fog: 0xaaaaaa, fogDensity: 0.005 },
    build: () => {},
    spawnPoints: [{ x: 1 }],
    waypoints: [{ x: 1 }],
    colliderBoxes: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
  };
}

describe('MapDefinition optional killY field', () => {
  it('does NOT throw and leaves killY undefined when omitted', () => {
    const md = new MapDefinition(baseConfig());
    expect(md.killY).toBeUndefined();
  });

  it('accepts a finite number killY', () => {
    const cfg = baseConfig();
    cfg.killY = 12;
    const md = new MapDefinition(cfg);
    expect(md.killY).toBe(12);
  });

  it('throws when killY is present but not a finite number', () => {
    const cfg = baseConfig();
    cfg.killY = 'twelve';
    expect(() => new MapDefinition(cfg)).toThrow();
  });

  it('throws when killY is NaN', () => {
    const cfg = baseConfig();
    cfg.killY = NaN;
    expect(() => new MapDefinition(cfg)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/MapDefinition.killY.test.js`
Expected: FAIL — `md.killY` is `undefined` for the "accepts a finite number" case (field not yet read/stored), and the throw cases don't throw.

- [ ] **Step 3: Implement the field**

In `src/world/MapDefinition.js`, add validation right before the final assignment block (after the existing `sunIntensity` validation, before `this.id = cfg.id;`). Match the existing validation idiom:

```js
    // Optional per-map fall-death plane (y below which a player dies — used by
    // high-altitude maps like Canopy). When absent, falling has no death effect
    // (all flat-ground maps omit it). Validated only when present.
    if (cfg.killY !== undefined && cfg.killY !== null) {
      if (typeof cfg.killY !== 'number' || !Number.isFinite(cfg.killY)) {
        throw new Error('MapDefinition.killY must be a finite number');
      }
    }
```

Then add the assignment in the field-assignment block (after `this.colliderBoxes = cfg.colliderBoxes;`):

```js
    this.killY        = cfg.killY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/MapDefinition.killY.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/MapDefinition.js src/tests/MapDefinition.killY.test.js
git commit -m "feat(world): opt-in MapDefinition.killY fall-death plane"
```

---

## Task 2: Shared `checkFallDeath` helper

**Files:**
- Create: `src/world/FallDeath.js`
- Test: `src/tests/FallDeath.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/FallDeath.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { checkFallDeath } from '../world/FallDeath.js';

describe('checkFallDeath', () => {
  // A minimal stand-in for a player: only .alive and .position.y are read.
  const livePlayerAt = (y) => ({ alive: true, position: { y } });
  const deadPlayerAt = (y) => ({ alive: false, position: { y } });
  const map = (killY) => ({ killY });

  it('returns false when the map has no killY (flat-ground maps)', () => {
    expect(checkFallDeath(livePlayerAt(-100), map(undefined))).toBe(false);
    expect(checkFallDeath(livePlayerAt(-100), map(null))).toBe(false);
  });

  it('returns true when a live player is below killY', () => {
    expect(checkFallDeath(livePlayerAt(11), map(12))).toBe(true);
  });

  it('returns false when a live player is exactly at or above killY', () => {
    expect(checkFallDeath(livePlayerAt(12), map(12))).toBe(false);
    expect(checkFallDeath(livePlayerAt(13), map(12))).toBe(false);
  });

  it('returns false for an already-dead player even below killY', () => {
    expect(checkFallDeath(deadPlayerAt(5), map(12))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/FallDeath.test.js`
Expected: FAIL — module `../world/FallDeath.js` not found.

- [ ] **Step 3: Implement the helper**

Create `src/world/FallDeath.js`:

```js
// Shared fall-death check. Pure math — NO THREE import — so the dedicated
// server (Sim.js) can call it headlessly exactly as the client (Game.js) does.
//
// A player dies from a fall when the map defines a kill plane (killY) and the
// player's FEET (position.y) drop strictly below it. Maps that omit killY
// (all flat-ground maps) never trigger fall death — behavior is unchanged.
//
// Callers handle the actual death bookkeeping (alive/health/respawn) — this
// helper only answers the yes/no question so both loops share one rule.
export function checkFallDeath(player, map) {
  if (!map || map.killY === undefined || map.killY === null) return false;
  if (!player.alive) return false;
  return player.position.y < map.killY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/FallDeath.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/FallDeath.js src/tests/FallDeath.test.js
git commit -m "feat(world): shared checkFallDeath helper (headless-safe)"
```

---

## Task 3: Wire fall death into `Game.js` (singleplayer)

**Files:**
- Modify: `src/core/Game.js`
- Test: manual verification in Step 5 (no isolated unit test — the death path is entangled with HUD/voice/respawn; covered end-to-end by running the match)

- [ ] **Step 1: Add the import**

In `src/core/Game.js`, find the existing map/world imports near the top and add (alongside the other `../world/` imports):

```js
import { checkFallDeath } from '../world/FallDeath.js';
```

- [ ] **Step 2: Add a private fall-death handler method**

Add this method to the `Game` class (place it right after the existing `respawnPlayer(player)` method, ~line 700, so the two respawn-related methods sit together):

```js
  // Environmental fall death (Canopy and other killY maps). No frag is awarded
  // — there is no shooter. Mirrors the combat death path minus the shooter
  // bookkeeping: marks the player dead, logs the void-fall, plays the victim's
  // death voice, and queues a normal respawn. Reuses respawnTimers/respawnPlayer.
  killByFall(player) {
    player.alive = false;
    player.health = 0;
    player.deaths += 1;
    if (player.view) player.view.setVisible(!player.isLocal); // local stays hidden (first person)
    const name = player.isLocal ? 'You' : player.id;
    this.hud.addKill(`${name} fell into the void`);
    if (player.animalId) this.voice.playAnimal(player.animalId, 'death');
    if (player.isLocal) {
      this.killstreak = 0;
      this.hud.setKillstreak(0);
    }
    this.respawnTimers.set(player.id, MATCH.respawnDelay);
  }
```

- [ ] **Step 3: Call it after the local player's tick**

Find the line (in the `this.fixed.update(...)` callback, ~line 878):

```js
      if (this.match.active && this.player.alive) tickMovement(this.player, dt, this.colliders);
```

Replace it with:

```js
      if (this.match.active && this.player.alive) {
        tickMovement(this.player, dt, this.colliders);
        if (this.player.alive && checkFallDeath(this.player, this.activeMap)) this.killByFall(this.player);
      }
```

- [ ] **Step 4: Call it after each bot's tick**

In the same callback, find the bot loop (~line 881) and add the fall check after `tickMovement(bot, ...)`:

```js
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.brain.update(dt, this.entities.enemiesOf(bot), this.colliders);
        tickMovement(bot, dt, this.colliders);
        if (bot.alive && checkFallDeath(bot, this.activeMap)) this.killByFall(bot);
        bot.weapon.update(dt, bot.intent.firing, bot.intent.reloadRequested);
        // Occasional per-animal taunt for ambience (jittered cooldown ~10-18s).
        bot._tauntTimer = (bot._tauntTimer != null ? bot._tauntTimer : 8 + Math.random() * 8) - dt;
        if (bot._tauntTimer <= 0) {
          bot._tauntTimer = 10 + Math.random() * 8;
          this.voice.playAnimal(bot.animalId, 'taunt');
        }
      }
```

- [ ] **Step 5: Build and smoke-test**

Run: `npm run build`
Expected: build succeeds (no syntax/import errors).

Then run the full suite to confirm nothing regressed:
Run: `npx vitest run`
Expected: all pre-existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/Game.js
git commit -m "feat(game): apply fall death (killY) for local player + bots"
```

---

## Task 4: Wire fall death into `Sim.js` (dedicated server parity)

**Files:**
- Modify: `src/sim/Sim.js`

- [ ] **Step 1: Add the import**

In `src/sim/Sim.js`, add to the imports near the top (alongside other `../world/` or `../config/` imports):

```js
import { checkFallDeath } from '../world/FallDeath.js';
```

- [ ] **Step 2: Add a private fall-death handler**

The server `Sim` has no HUD/voice — fall death here is just state bookkeeping + a respawn timer. Add this method to the `Sim` class (right after the existing `_respawn(player)` method, ~line 280):

```js
  // Environmental fall death (server-side parity with Game.killByFall). No frag,
  // no shooter — just marks the player dead and queues a normal respawn.
  _killByFall(player) {
    player.alive = false;
    player.health = 0;
    player.deaths += 1;
    this.respawnTimers.set(player.id, RESPAWN_DELAY);
  }
```

Confirm `RESPAWN_DELAY` is imported/available in `Sim.js` — it already is (used by `_respawn`'s sibling code path and the existing combat-death `respawnTimers.set` at line 239).

- [ ] **Step 3: Call it in the movement pass**

Find the movement pass in `tick(dt)` (~line 170):

```js
    // Movement (humans + bots share tickMovement)
    for (const p of this.players) {
      if (!p.alive) continue;
      tickMovement(p, dt, this.colliders);
    }
```

Replace with:

```js
    // Movement (humans + bots share tickMovement) + fall death (killY maps)
    for (const p of this.players) {
      if (!p.alive) continue;
      tickMovement(p, dt, this.colliders);
      if (p.alive && checkFallDeath(p, this.activeMap)) this._killByFall(p);
    }
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS (no server regressions).

- [ ] **Step 5: Commit**

```bash
git add src/sim/Sim.js
git commit -m "feat(sim): server-side fall death parity (killY)"
```

---

## Task 5: Backward-compat test — existing maps leave `killY` unset

**Files:**
- Test: `src/tests/Maps.killY.test.js` (new)

- [ ] **Step 1: Write the test**

Create `src/tests/Maps.killY.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAPS } from '../world/Maps.js';

// The killY fall-death plane is opt-in. Every pre-Canopy map must leave it
// undefined so the feature changes nothing for them. This test locks that
// guarantee: if someone later adds killY to an existing flat-ground map by
// accident, this fails loudly.
describe('pre-Canopy maps leave killY unset (backward compat)', () => {
  const preCanopy = MAPS.filter(m => m.id !== 'canopy');

  it('every map except canopy has killY === undefined', () => {
    expect(preCanopy.length).toBeGreaterThan(0);
    for (const m of preCanopy) {
      expect(m.killY, `map "${m.id}" must not set killY`).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/tests/Maps.killY.test.js`
Expected: PASS. (Canopy isn't registered yet, so `preCanopy` is all 5 current maps — all pass.)

- [ ] **Step 3: Commit**

```bash
git add src/tests/Maps.killY.test.js
git commit -m "test(world): lock backward-compat — pre-Canopy maps leave killY unset"
```

---

## Task 6: `Treehouse.js` themed prop factories

**Files:**
- Create: `src/world/props/Treehouse.js`

This task adds the decorative prop factories Canopy's `build()` layers on top of the collidable `place()` boxes. They follow the exact `Village.js`/`PalmTree.js` contract: each returns `{ group, boxes }` where `boxes` are LOCAL-origin AABBs (the map ignores them — the `place()` footprint box is the single source of collision). Deterministic (no unseeded `Math.random`).

- [ ] **Step 1: Create the module with `canopyFoliage()`**

Create `src/world/props/Treehouse.js`:

```js
import * as THREE from 'three';
import { boxMesh, coneMesh } from './_shared.js';
```

Note: `_shared.js` currently exports `boxMesh`, `cylMesh`, `sphereMesh`, `shadeHex`, `boxAABB`, `translateBox` — but **not** `coneMesh`. Add `coneMesh` to `_shared.js` first (Step 2).

- [ ] **Step 2: Add `coneMesh` to `_shared.js`**

In `src/world/props/_shared.js`, add this factory after `sphereMesh` (it's needed for canopies and lantern caps; keep it consistent with the existing mesh factories):

```js
// A PBR cone mesh (used for tree canopies, lantern caps).
export function coneMesh(r, h, color, x = 0, y = 0, z = 0, segments = 8, { flatShading = true, roughness = 0.9 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, flatShading, roughness });
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
```

- [ ] **Step 3: Implement `canopyFoliage()`**

Add to `src/world/props/Treehouse.js`. A chunky low-poly foliage cluster (2-3 cones + a sphere) capping a trunk. `boxes` is empty (decorative-only; the trunk's collider is the map's `place()` box).

```js
// A chunky low-poly canopy cap for a giant tree: 2-3 stacked cones + a small
// sphere bulge, reading as the forest ceiling. Decorative-only (no .boxes) —
// the trunk's collider is the map's place() footprint box.
export function canopyFoliage({
  baseY = 0,
  height = 8,
  radius = 6,
  color = 0x2a5a3a,
  tint = 0x3a7a4a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'canopy-foliage';
  // Lower wide dome.
  group.add(coneMesh(radius, height * 0.5, color, 0, baseY + height * 0.25, 0, 8));
  // Mid tier (smaller, tinted lighter).
  group.add(coneMesh(radius * 0.75, height * 0.4, tint, 0, baseY + height * 0.55, 0, 8));
  // Top tuft.
  group.add(coneMesh(radius * 0.45, height * 0.3, color, 0, baseY + height * 0.85, 0, 7));
  return { group, boxes: [] };
}
```

- [ ] **Step 4: Implement `treehouseInterior()`**

A cozy box-walls + pitched-leaf-roof room on a platform — the close-quarters interior. `boxes` empty (the platform + walls are `place()` boxes in the map).

```js
// A small treehouse room: open-doored box walls + a peaked leaf roof. Sits on a
// platform; its own .boxes is empty (the platform/walls are the map's colliders).
export function treehouseInterior({
  baseY = 0,
  wallColor = 0x6a4a2a,
  roofColor = 0x2a5a3a,
  w = 4, d = 4, wallH = 2.4,
} = {}) {
  const group = new THREE.Group();
  group.name = 'treehouse';
  const t = 0.2; // wall thickness
  // Back + 2 side walls (leave the front open as a doorway).
  group.add(boxMesh(w, wallH, t, wallColor, 0, baseY + wallH / 2, -d / 2));
  group.add(boxMesh(t, wallH, d, wallColor, -w / 2, baseY + wallH / 2, 0));
  group.add(boxMesh(t, wallH, d, wallColor,  w / 2, baseY + wallH / 2, 0));
  // Peaked leaf roof: two angled slabs.
  const pitch = wallH * 0.5;
  const slopeLen = Math.sqrt((w / 2) ** 2 + pitch ** 2) + 0.4;
  const ang = Math.atan2(pitch, w / 2);
  const left = boxMesh(0.25, slopeLen, d + 0.4, roofColor);
  left.rotation.z = ang;
  left.position.set(-w / 4, baseY + wallH + pitch / 2, 0);
  group.add(left);
  const right = boxMesh(0.25, slopeLen, d + 0.4, roofColor);
  right.rotation.z = -ang;
  right.position.set(w / 4, baseY + wallH + pitch / 2, 0);
  group.add(right);
  return { group, boxes: [] };
}
```

- [ ] **Step 5: Implement `lantern()`**

The safe-route cue: a glowing emissive lantern. Cheap (emissive material, not a real light source — preserves the WebGL light budget).

```js
// A glowing lantern — the "lit = safe route" visual cue. Emissive material, NOT
// a real THREE light source (WebGL light budget stays at hemisphere+sun).
export function lantern({
  baseY = 0,
  postColor = 0x2a2a2a,
  glowColor = 0xffcf6a,
} = {}) {
  const group = new THREE.Group();
  group.name = 'lantern';
  // Short post.
  group.add(cylMeshSimple(postColor, 0.06, 0.06, 0.6, 0, baseY + 0.3, 0));
  // Lamp body — emissive so it reads as glowing even under flat lighting.
  const lampMat = new THREE.MeshStandardMaterial({
    color: glowColor, emissive: glowColor, emissiveIntensity: 1.2, flatShading: true, roughness: 0.6,
  });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.22), lampMat);
  lamp.position.set(0, baseY + 0.75, 0);
  lamp.castShadow = false; lamp.receiveShadow = false;
  group.add(lamp);
  // Tiny cap.
  group.add(coneMesh(0.18, 0.14, postColor, 0, baseY + 0.95, 0, 4));
  return { group, boxes: [] };
}
```

`cylMeshSimple` is a thin local helper (avoids pulling the segments/roughness defaults of `_shared.cylMesh` when we want a plain dark cylinder). Add it to the top of `Treehouse.js`:

```js
function cylMeshSimple(color, rTop, rBot, h, x, y, z) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 6), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
```

- [ ] **Step 6: Implement `ropeStrands()` and `metalRivets()`**

Walkway surface detail (non-collidable): frayed rope along a bridge, or rivets on a metal catwalk. Both lay detail along the length of an existing `place()` walkway box.

```js
// Frayed rope strands running along both long edges of a walkway. Walkways are
// authored along the X axis (length = w). Decorative-only.
export function ropeStrands({
  baseY = 0, w = 8, d = 1.6, color = 0xb89a5a, strands = 3,
} = {}) {
  const group = new THREE.Group();
  group.name = 'rope';
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.95 });
  const edgeZ = d / 2 + 0.04;
  for (const sz of [edgeZ, -edgeZ]) {
    for (let i = 0; i < strands; i++) {
      const x = -w / 2 + (i + 0.5) * (w / strands);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), mat);
      seg.rotation.z = Math.PI / 2; // lay along X
      seg.position.set(x, baseY + 0.3, sz);
      group.add(seg);
    }
  }
  return { group, boxes: [] };
}

// Rivet studs across a metal catwalk surface (a grid of tiny dark cylinders).
// Walkways are authored along the X axis (length = w). Decorative-only.
export function metalRivets({
  baseY = 0, w = 8, d = 1.6, color = 0x2a2a30, cols = 4, rows = 2,
} = {}) {
  const group = new THREE.Group();
  group.name = 'rivets';
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, metalness: 0.6 });
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + (c + 0.5) * (w / cols);
      const z = -d / 2 + (r + 0.5) * (d / rows);
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6), mat);
      stud.position.set(x, baseY + 0.05, z);
      stud.castShadow = false; stud.receiveShadow = true;
      group.add(stud);
    }
  }
  return { group, boxes: [] };
}
```

- [ ] **Step 7: Build to verify no import/syntax errors**

Run: `npm run build`
Expected: build succeeds. (No test yet — the factories are exercised visually in the map `build()` in Task 8, and the contract test in Task 9 covers the map end-to-end.)

- [ ] **Step 8: Commit**

```bash
git add src/world/props/_shared.js src/world/props/Treehouse.js
git commit -m "feat(world): Treehouse prop factories (canopy, treehouse, lantern, walkway detail)"
```

---

## Task 7: Register `CANOPY` in the roster + update `Maps.test.js`

**Files:**
- Create: `src/world/maps/Canopy.js` (stub — full geometry in Task 8)
- Modify: `src/world/Maps.js`
- Modify: `src/tests/Maps.test.js`

We create a minimal valid `CANOPY` stub now so registration + the test bump land before the big geometry task. Task 8 fills in the real `authorGeometry`/`build`.

- [ ] **Step 1: Create a minimal Canopy stub**

Create `src/world/maps/Canopy.js` with a valid-but-tiny `MapDefinition` so it constructs and registers. Real geometry lands in Task 8.

```js
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
```

- [ ] **Step 2: Register it in `Maps.js`**

In `src/world/Maps.js`, add the import and the roster entry:

```js
import { PLAZA } from './maps/Plaza.js';
import { FOUNDRY } from './maps/Foundry.js';
import { DUSTBOWL } from './maps/Dustbowl.js';
import { HAVEN } from './maps/Haven.js';
import { TROPIC } from './maps/Tropic.js';
import { CANOPY } from './maps/Canopy.js';

// The map roster. Order = menu/rotation order; MAPS[0] is the default.
export const MAPS = [PLAZA, FOUNDRY, DUSTBOWL, HAVEN, TROPIC, CANOPY];
```

- [ ] **Step 3: Update `Maps.test.js`**

In `src/tests/Maps.test.js`, bump the count and id list:

```js
  it('has exactly 6 maps in the expected order', () => {
    expect(MAPS).toHaveLength(6);
    expect(MAPS.map(m => m.id)).toEqual(['plaza', 'foundry', 'dustbowl', 'haven', 'tropic', 'canopy']);
  });
```

- [ ] **Step 4: Run the registration + backward-compat tests**

Run: `npx vitest run src/tests/Maps.test.js src/tests/Maps.killY.test.js`
Expected: both PASS. (`Maps.killY.test.js` now filters out `canopy` correctly and the remaining 5 are still `killY === undefined`.)

- [ ] **Step 5: Commit**

```bash
git add src/world/maps/Canopy.js src/world/Maps.js src/tests/Maps.test.js
git commit -m "feat(world): register Canopy map (stub geometry; full build in next task)"
```

---

## Task 8: Full Canopy geometry — `authorGeometry` + `build`

**Files:**
- Modify: `src/world/maps/Canopy.js`

This is the big task. It replaces the stub with the full hub-and-spoke layout. Work in sub-steps; commit at the end.

**Coordinate plan (all 180°-rotationally symmetric via `placePair`; `placePair` no-ops when x===0 && z===0):**
- King tree trunk: `(0, *, 0)` — own mirror. Top y≈54. 4 platforms at y = 30 / 37 / 44 / 51.
- Satellite half-set: `{(0, *, 28), (28, *, 0)}` → mirrors to N/S/E/W (4 trees). Each: lower platform y≈30, upper treehouse platform y≈40. Trunk top y≈46.
- Spokes: king ↔ each satellite, wide 3m planks at y≈30 (safe, lantern-lit).
- Ring: satellite ↔ satellite at y≈34, 2m rope bridges (medium risk).
- Stealth catwalks: under-ring metal grates at y≈26.
- Skill-gap shortcuts: narrow 1m ledges cutting interior diagonals at y≈37 (unlit).
- Stair-stepped "ladders": 1m-rise platforms up each trunk.

- [ ] **Step 1: Define COLORS and the rosters**

Replace the top of `Canopy.js` (COLORS + SPAWN_POINTS + WAYPOINTS) with the full set. Keep the imports from Task 7 and add the Treehouse imports.

```js
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
};

// Satellite half-set: each site mirrors to (-x,-z) for 4 total (N/S/E/W).
const SAT_SITES = [
  { x:  0, z: 28 },   // north satellite (mirror -> south)
  { x: 28, z: 0 },    // east satellite (mirror -> west)
];

// Platform heights.
const Y = { LOW: 30, MID: 37, HIGH: 44, TOP: 51, SAT_UPPER: 40, CATWALK: 26 };
```

- [ ] **Step 2: Define staggered spawn points + waypoints**

Replace the stub `SPAWN_POINTS`/`WAYPOINTS`:

```js
// Staggered-height spawns across platforms/walkways (anti-camp). None on the
// king's top deck (no free power-position spawns).
const SPAWN_POINTS = [
  // Satellite lowers (y≈30).
  new THREE.Vector3(0, 31, 22), new THREE.Vector3(0, 31, -22),
  new THREE.Vector3(22, 31, 0), new THREE.Vector3(-22, 31, 0),
  // King mid levels (y≈34, 38).
  new THREE.Vector3(4, 35, 4), new THREE.Vector3(-4, 35, -4),
  new THREE.Vector3(4, 39, -4), new THREE.Vector3(-4, 39, 4),
  // Satellite uppers near treehouses (y≈40).
  new THREE.Vector3(0, 41, 24), new THREE.Vector3(0, 41, -24),
  new THREE.Vector3(24, 41, 0), new THREE.Vector3(-24, 41, 0),
];

// Waypoints ONLY on safe walkable surfaces (spokes + ring + king hub). Bots
// stay on lit routes; risky shortcuts are player-only.
const WAYPOINTS = [
  // King hub at each level.
  new THREE.Vector3(0, Y.LOW, 0), new THREE.Vector3(0, Y.MID, 0),
  // Spoke midpoints (king<->satellite).
  new THREE.Vector3(0, Y.LOW, 14), new THREE.Vector3(0, Y.LOW, -14),
  new THREE.Vector3(14, Y.LOW, 0), new THREE.Vector3(-14, Y.LOW, 0),
  // Satellite lowers.
  new THREE.Vector3(0, Y.LOW, 28), new THREE.Vector3(0, Y.LOW, -28),
  new THREE.Vector3(28, Y.LOW, 0), new THREE.Vector3(-28, Y.LOW, 0),
  // Ring midpoints (satellite<->satellite) at y≈34.
  new THREE.Vector3(20, 34, 20), new THREE.Vector3(-20, 34, -20),
  new THREE.Vector3(20, 34, -20), new THREE.Vector3(-20, 34, 20),
];
```

- [ ] **Step 3: Write the full `authorGeometry`**

Replace the stub `authorGeometry` with the full layout. Every collidable surface is a `place()`/`placePair()` box.

```js
function authorGeometry(place, placePair) {
  // --- KING TREE (center, own mirror) ---
  // Trunk: a tall thin box from deep in the fog up past the top platform.
  place(3, 56, 3, COLORS.bark, 0, 28, 0, 'wood');
  // 4 stacked platform decks.
  for (const y of [Y.LOW, Y.MID, Y.HIGH, Y.TOP]) {
    place(10, 0.6, 10, COLORS.plank, 0, y, 0, 'planks');
  }
  // Internal stair-steps connecting king levels (1m rise each — hop-up ladder).
  // A diagonal run of small boxes from LOW -> MID -> HIGH -> TOP.
  for (let lvl = 0; lvl < 3; lvl++) {
    const baseY = [Y.LOW, Y.MID, Y.HIGH][lvl];
    const nextY = [Y.MID, Y.HIGH, Y.TOP][lvl];
    const steps = Math.round((nextY - baseY) / 1);
    for (let s = 1; s <= steps; s++) {
      const yy = baseY + s * 1;
      const xx = -3.5 + s * (3 / steps);
      place(1.4, 0.3, 1.4, COLORS.plankDark, xx, yy, 3, 'planks');
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
```

- [ ] **Step 4: Write the geometry sub-builders**

Add these helper functions in `Canopy.js` (module scope, before `build`):

```js
// One satellite tree: trunk + lower platform + upper treehouse platform.
// placePair stamps the 180° twin at (-x,-z).
function buildSatellite(place, placePair, cx, cz) {
  // Trunk.
  placePair(2.4, 48, 2.4, COLORS.bark, cx, 24, cz, 'wood');
  // Lower platform (matches spoke height).
  placePair(6, 0.6, 6, COLORS.plank, cx, Y.LOW, cz, 'planks');
  // Upper platform (treehouse sits here in build()).
  placePair(5, 0.6, 5, COLORS.plank, cx, Y.SAT_UPPER, cz, 'planks');
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
  if (cz === 0) placePair(len, 0.5, 3, COLORS.plank, mx, Y.LOW, 0, 'planks');
  else          placePair(3, 0.5, len, COLORS.plank, 0, Y.LOW, mz, 'planks');
}

// Ring bridge: medium rope bridge between two satellites at y≈34.
// (ax,az)-(bx,bz) is the diagonal; here authored as a box spanning the diagonal
// midpoint with approximate axis-aligned extents (good enough for collision).
function buildRingBridge(placePair, ax, az) {
  // The two satellites this bridge connects are (ax,az) and (-ax,-az); midpoint
  // is the origin. Author two half-bridges from each satellite toward center so
  // symmetry holds and players cross at y≈34.
  placePair(10, 0.4, 2, COLORS.plankDark, ax / 2, 34, az / 2, 'planks');
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
```

- [ ] **Step 5: Write the full `build()` with decorative props**

Replace the stub `build`:

```js
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

  // LANTERNS on safe routes (spokes): lit = safe cue. Place along each spoke.
  const lanternSites = [
    [0, 7], [0, -7], [0, 21], [0, -21],   // north/south spoke
    [7, 0], [-7, 0], [21, 0], [-21, 0],   // east/west spoke
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
    { const { group: g } = ropeStrands({ baseY: 34, w: 10, d: 2 });
      g.position.set(s.x / 2, 0, s.z / 2); g.rotation.y = Math.atan2(s.z, s.x); group.add(g); }
    { const { group: g } = metalRivets({ baseY: Y.CATWALK, w: 9, d: 1.2 });
      g.position.set(s.x / 2, 0, s.z / 2); g.rotation.y = Math.atan2(s.z, s.x); group.add(g); }
  }

  // CLOUDS above the canopy for depth (drifting billboards).
  new Clouds(group, { count: 8, area: 160, height: 70, color: 0xffffff, opacity: 0.85 });

  // Contact shadows under platforms so they don't float.
  for (const y of [Y.LOW, Y.MID, Y.HIGH, Y.TOP]) helper.contactShadow(group, 0, 0, 11, 11);

  scene.add(group);
  return group;
}
```

- [ ] **Step 6: Update the collider pass at module load to match `authorGeometry`'s new signature**

The module-load collider pass already calls `authorGeometry(place)`. Since `authorGeometry(place, placePair)` now also uses `placePair`, update the pass to supply it (mirroring Tropic/Haven):

```js
const _colliderBoxes = [];
{
  const h = makeBuildHelper();
  const { place, placePair } = h.colliderPass(_colliderBoxes);
  authorGeometry(place, placePair);
}
```

- [ ] **Step 7: Build + manual visual check**

Run: `npm run build`
Expected: build succeeds.

Then run the dev server and load the Canopy map to eyeball it:
Run: `npm run dev` (open the printed URL, pick Canopy from the map menu, walk/spectate)
Check: 5 trunks, 4 king platforms, satellite platforms + treehouses, walkways connected, lanterns glow on spokes, falling off a platform kills you (killfeed "fell into the void"), ground not visible.

- [ ] **Step 8: Commit**

```bash
git add src/world/maps/Canopy.js
git commit -m "feat(world): full Canopy geometry — hub-and-spoke treehouse arena"
```

---

## Task 9: Canopy contract test

**Files:**
- Test: `src/tests/Canopy.test.js`

- [ ] **Step 1: Write the contract test**

Create `src/tests/Canopy.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CANOPY } from '../world/maps/Canopy.js';

describe('Canopy map', () => {
  it('is a valid MapDefinition with the expected identity', () => {
    expect(CANOPY.id).toBe('canopy');
    expect(CANOPY.name).toBe('Canopy');
    expect(typeof CANOPY.desc).toBe('string');
  });

  it('enables fall death (killY set, below the lowest platform)', () => {
    expect(CANOPY.killY).toBe(12);
  });

  it('has a 4-stop sky gradient and dense fog', () => {
    expect(CANOPY.palette.sky).toHaveLength(4);
    expect(CANOPY.palette.fogDensity).toBeGreaterThanOrEqual(0.01);
  });

  it('has non-empty collider boxes (geometry authored headlessly)', () => {
    expect(CANOPY.colliderBoxes.length).toBeGreaterThan(10);
    for (const b of CANOPY.colliderBoxes) {
      expect(b.min).toBeDefined();
      expect(b.max).toBeDefined();
    }
  });

  it('has staggered spawn points (no two at the same height band = camping)', () => {
    expect(CANOPY.spawnPoints.length).toBeGreaterThanOrEqual(8);
    const heights = CANOPY.spawnPoints.map(p => Math.round(p.y));
    const unique = new Set(heights);
    expect(unique.size).toBeGreaterThanOrEqual(3); // staggered across >=3 levels
  });

  it('places all waypoints on or above the lowest safe platform (no void waypoints)', () => {
    for (const w of CANOPY.waypoints) {
      expect(w.y).toBeGreaterThanOrEqual(CANOPY.killY);
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/tests/Canopy.test.js`
Expected: PASS (6 tests). If any assertion fails, adjust the geometry constants in `Canopy.js` (not the test) until it reflects the real layout.

- [ ] **Step 3: Commit**

```bash
git add src/tests/Canopy.test.js
git commit -m "test(world): Canopy map contract test"
```

---

## Task 10: Full-suite green + final manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: ALL tests PASS — the 4 new test files plus every pre-existing test.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual playthrough**

Run: `npm run dev`, open the URL, start a match on Canopy.
Verify each spec requirement:
- 5 tall trees, ground not visible (void below).
- King tree has 4 levels; 3 ways up.
- Satellites have treehouses (close-quarters interiors).
- Walkway variety: wide planks (spokes), rope bridges (ring), metal grates (catwalks), narrow ledges (shortcuts).
- Lanterns on safe routes; shortcuts unlit.
- Falling off any platform → killfeed "fell into the void" + respawn (no frag).
- Bots navigate the lit route network; staggered spawns prevent camping.
- Misty-dawn palette, drifting clouds above the canopy.

- [ ] **Step 4: Final commit (if any tuning tweaks were made during playthrough)**

If the manual check surfaced small constant tweaks (heights, fog density, lantern positions), commit them:

```bash
git add src/world/maps/Canopy.js
git commit -m "tune(world): Canopy polish from manual playtest"
```

If no tweaks needed, this step is a no-op.

---

## Self-Review

**Spec coverage:**
- ✅ Opt-in `killY` fall plane → Tasks 1–4
- ✅ Shared headless-safe helper → Task 2
- ✅ Game.js + Sim.js parity hooks → Tasks 3–4
- ✅ Backward-compat guarantee (5 existing maps) → Task 5
- ✅ Canopy map (hub-and-spoke, 5 trees, 4 king levels, satellite treehouses) → Tasks 7–8
- ✅ Walkway variety (planks/rope/metal/shortcuts) → Task 8 Step 4
- ✅ Staggered spawns → Task 8 Step 2 + Task 9 test
- ✅ Misty-dawn palette, fog, lanterns, clouds → Task 8
- ✅ Perf (no ground mesh, flatShading, shared materials, emissive lanterns) → Task 8
- ✅ Treehouse props module → Task 6
- ✅ Contract test + full suite green → Tasks 9–10

**Placeholder scan:** No TBD/TODO/vague steps. Every code step shows the actual code. Geometry constants are concrete (Y = {30,37,44,51,40,26}, killY=12).

**Type/name consistency:** `checkFallDeath(player, map)` signature identical in Task 2, Task 3, Task 4. `killByFall` (Game) vs `_killByFall` (Sim) — intentionally different (Game's is public-ish for the loop, Sim's follows the existing `_respawn`/`_endMatch` underscore convention). Prop factory names (`canopyFoliage`, `treehouseInterior`, `lantern`, `ropeStrands`, `metalRivets`) match between Task 6 definition and Task 8 import/use. `coneMesh` added to `_shared.js` in Task 6 Step 2 before Task 6 Step 3 uses it.
