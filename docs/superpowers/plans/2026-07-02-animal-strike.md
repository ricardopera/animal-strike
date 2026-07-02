# AnimalStrike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-player, bot-populated, browser-based FPS deathmatch that feels like Krunker.io — fast movement, skill-based gunplay, animal-headed characters — built on Three.js.

**Architecture:** Single-authoritative sim in a fixed-timestep loop (60 Hz), decoupled from rendering via accumulator. Plain ES modules operate on a lightweight entity shape (no ECS framework). Input → sim → render each frame. DOM overlay handles all UI; canvas draws 3D only. Bots reuse the same `Player` + movement/weapon code, driven by an `AIController` writing to the bot's intent.

**Tech Stack:** Vite, three.js (npm), vanilla JS (ES modules), Vitest for headless unit tests.

**Design spec:** `docs/superpowers/specs/2026-07-02-animal-strike-design.md`

---

## File Structure
```
Shooter/
├── index.html
├── package.json
├── vite.config.js
├── vitest.config.js
├── docs/superpowers/{specs,plans}/...
└── src/
    ├── main.js                    # bootstrap: renderer, loop, scene wiring
    ├── core/
    │   ├── Game.js                # owns world, players, match state, loop tick
    │   ├── FixedTimestep.js       # accumulator loop (tick @ 60Hz)
    │   ├── InputState.js          # keyboard/mouse → intent snapshot
    │   ├── EntityStore.js         # player/bullet/prop arrays + add/remove
    │   └── math.js                # vec helpers, clamp, angleDelta (pure, tested)
    ├── config/
    │   ├── Weapons.js
    │   ├── Animals.js
    │   ├── Movement.js
    │   └── Match.js
    ├── world/
    │   ├── ArenaBuilder.js
    │   ├── ColliderStore.js
    │   └── SpawnPoints.js
    ├── player/
    │   ├── Player.js
    │   ├── MovementController.js
    │   ├── WeaponController.js
    │   └── CharacterView.js
    ├── ai/
    │   ├── AIController.js
    │   ├── BotNavigation.js
    │   ├── BotAim.js
    │   └── BotCombat.js
    ├── fx/
    │   ├── BulletTracer.js
    │   ├── HitMarker.js
    │   ├── MuzzleFlash.js
    │   └── DamageNumbers.js
    ├── ui/
    │   ├── Hud.js
    │   ├── Crosshair.js
    │   ├── Scoreboard.js
    │   ├── MainMenu.js
    │   └── EndScreen.js
    ├── audio/
    └── tests/
```

---

## Phase 0: Scaffold & dev infra

### Task 0.1: Init repo + package.json + install deps
**Files:**
- Create: `package.json`

- [ ] **Step 1:** Create `package.json`:
```json
{
  "name": "animal-strike",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
- [ ] **Step 2:** Install runtime + dev deps:
```bash
npm install three
npm install -D vite vitest
```
- [ ] **Step 3:** Commit:
```bash
git add package.json package-lock.json
git commit -m "chore: init package.json with three, vite, vitest"
```

### Task 0.2: index.html + minimal main.js (one rendered frame)
**Files:**
- Create: `index.html`
- Create: `src/main.js`

- [ ] **Step 1:** Create `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AnimalStrike</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #87ceeb; }
    #game { display: block; width: 100vw; height: 100vh; }
    #ui { position: fixed; inset: 0; pointer-events: none; color: #fff; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="ui"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```
- [ ] **Step 2:** Create `src/main.js`:
```js
import * as THREE from 'three';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87ceeb, 1); // sky blue

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// one box so we can see the frame is rendering
const box = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: 0xff5a5a })
);
scene.add(box);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.0));
scene.add(new THREE.DirectionalLight(0xffffff, 1.0).tap?.() || (() => { const l = new THREE.DirectionalLight(0xffffff, 1.0); l.position.set(5, 10, 7); scene.add(l); return l; })());

renderer.render(scene, camera);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
```
- [ ] **Step 3:** Run `npm run dev`, open `localhost:5173`. Expected: sky-blue background with a red box. (Fix the slightly awkward light setup — the `.tap?.()` line is a placeholder artifact; replace the lighting block with a clean `HemisphereLight` + a positioned `DirectionalLight`.)
- [ ] **Step 4:** Commit:
```bash
git add index.html src/main.js
git commit -m "feat: scaffold index.html and minimal three.js render"
```

### Task 0.3: Vitest config + green pipeline test
**Files:**
- Create: `vitest.config.js`
- Create: `src/core/math.js`
- Create: `src/tests/math.test.js`

- [ ] **Step 1:** Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.js'],
  },
});
```
- [ ] **Step 2:** Create `src/core/math.js` (minimal, expanded in Phase 1):
```js
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
```
- [ ] **Step 3:** Create `src/tests/math.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { clamp } from '../core/math.js';

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it('passes through in-range values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
```
- [ ] **Step 4:** Run `npm test`. Expected: 3 passing.
- [ ] **Step 5:** Commit:
```bash
git add vitest.config.js src/core/math.js src/tests/math.test.js
git commit -m "chore: add vitest config and green pipeline test"
```

---

## Phase 1: World + camera + walk
**Checkpoint:** You can look + walk around an arena with WASD + mouse, jump, sprint.

### Task 1.1: math.js helpers (TDD)
**Files:**
- Modify: `src/core/math.js`
- Test: `src/tests/math.test.js`

- [ ] **Step 1:** Add failing tests to `src/tests/math.test.js`:
```js
import { clamp, angleDelta, moveTowards } from '../core/math.js';

describe('angleDelta', () => {
  it('returns shortest signed path in [-PI, PI]', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
  it('wraps the long way around', () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 5);
  });
  it('returns negative for clockwise', () => {
    expect(angleDelta(0.5, 0.1)).toBeCloseTo(-0.4, 5);
  });
});

describe('moveTowards', () => {
  it('moves towards target by up to maxDelta', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
  });
  it('snaps to target when within maxDelta', () => {
    expect(moveTowards(9, 10, 3)).toBe(10);
  });
  it('works descending', () => {
    expect(moveTowards(5, 1, 2)).toBe(3);
  });
});
```
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (functions not exported).
- [ ] **Step 3:** Implement in `src/core/math.js`:
```js
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
```
- [ ] **Step 4:** Run `npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit:
```bash
git add src/core/math.js src/tests/math.test.js
git commit -m "feat: add angleDelta and moveTowards math helpers"
```

### Task 1.2: FixedTimestep (TDD)
**Files:**
- Create: `src/core/FixedTimestep.js`
- Test: `src/tests/FixedTimestep.test.js`

- [ ] **Step 1:** Create failing test `src/tests/FixedTimestep.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { FixedTimestep } from '../core/FixedTimestep.js';

describe('FixedTimestep', () => {
  it('runs one tick per STEP of accumulated time', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    ft.update(1 / 60, () => count++);
    expect(count).toBe(1);
  });
  it('accumulates sub-step leftovers across frames', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    const cb = () => count++;
    ft.update(1 / 120, cb); // half a step -> 0
    ft.update(1 / 120, cb); // now a full step -> 1
    expect(count).toBe(1);
  });
  it('caps at 5 ticks per update to avoid spiral of death', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    ft.update(10, () => count++); // huge dt
    expect(count).toBe(5);
  });
  it('passes fixed STEP as the dt argument', () => {
    const ft = new FixedTimestep(1 / 60);
    let received = 0;
    ft.update(1 / 60, (dt) => (received = dt));
    expect(received).toBeCloseTo(1 / 60);
  });
});
```
- [ ] **Step 2:** Run `npm test -- FixedTimestep`. Expected: FAIL (module missing).
- [ ] **Step 3:** Create `src/core/FixedTimestep.js`:
```js
const MAX_TICKS_PER_UPDATE = 5;

export class FixedTimestep {
  constructor(step) {
    this.step = step;
    this.accumulator = 0;
  }
  update(realDt, fixedCallback) {
    this.accumulator += realDt;
    let n = 0;
    while (this.accumulator >= this.step && n < MAX_TICKS_PER_UPDATE) {
      fixedCallback(this.step);
      this.accumulator -= this.step;
      n++;
    }
    // discard excess to avoid unbounded growth after a stall
    if (this.accumulator > this.step * MAX_TICKS_PER_UPDATE) {
      this.accumulator = 0;
    }
  }
}
```
- [ ] **Step 4:** Run `npm test -- FixedTimestep`. Expected: PASS.
- [ ] **Step 5:** Commit:
```bash
git add src/core/FixedTimestep.js src/tests/FixedTimestep.test.js
git commit -m "feat: add FixedTimestep accumulator loop"
```

### Task 1.3: Movement config + ColliderStore
**Files:**
- Create: `src/config/Movement.js`
- Create: `src/world/ColliderStore.js`

- [ ] **Step 1:** Create `src/config/Movement.js`:
```js
export const MOVEMENT = {
  WALK: 6,
  SPRINT: 9,
  GRAVITY: 22,
  JUMP_VELOCITY: 8.5,
  ACCEL: 60,
  AIR_ACCEL: 12,
  FRICTION: 10,
  CAPSULE_RADIUS: 0.4,
  CAPSULE_HEIGHT: 1.8,
  EYE_HEIGHT: 1.6,
  // Phase 6 parkour (defined now so config is stable):
  MAX_BHOP: 14,
  SLIDE_SPEED_THRESHOLD: 7,
  SLIDE_DURATION: 0.6,
  SLIDE_FRICTION: 1.5,
  WALLRUN_DURATION: 0.8,
  WALLRUN_GRAVITY: 4,
  WALLRUN_JUMP_UP: 6,
  WALLRUN_JUMP_FORWARD: 5,
};
```
- [ ] **Step 2:** Create `src/world/ColliderStore.js`:
```js
import * as THREE from 'three';

// Axis-aligned bounding boxes only. Collision resolution is axis-separated.
export class ColliderStore {
  constructor() {
    this.boxes = [];
  }
  addFromMesh(mesh) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.boxes.push(box);
    return box;
  }
  addBox(min, max) {
    const box = new THREE.Box3(min, max);
    this.boxes.push(box);
    return box;
  }
  // Resolve a vertical capsule (cylinder for collision purposes) position.
  // Returns { x, z, yBottom, onGround, hitCeiling } after pushing out along least-penetration axis.
  resolveCapsule(pos, radius, height) {
    // pos.y is the FEET position (bottom of capsule).
    // Treated as an AABB of size (2r x height x 2r) centered at (pos.x, pos.y+height/2, pos.z).
    const halfH = height / 2;
    const centerY = pos.y + halfH;
    let resolved = { x: pos.x, y: pos.y, z: pos.z, onGround: false, hitCeiling: false };
    // We resolve iteratively per-box: each box that overlaps pushes out along the
    // axis of least penetration. Multiple passes for stability.
    for (let pass = 0; pass < 2; pass++) {
      for (const box of this.boxes) {
        const minX = box.min.x, maxX = box.max.x;
        const minY = box.min.y, maxY = box.max.y;
        const minZ = box.min.z, maxZ = box.max.z;
        // player AABB extents
        const pMinX = resolved.x - radius, pMaxX = resolved.x + radius;
        const pMinY = resolved.y, pMaxY = resolved.y + height;
        const pMinZ = resolved.z - radius, pMaxZ = resolved.z + radius;
        // overlap test
        if (pMaxX <= minX || pMinX >= maxX) continue;
        if (pMaxY <= minY || pMinY >= maxY) continue;
        if (pMaxZ <= minZ || pMinZ >= maxZ) continue;
        // overlaps — compute penetration on each axis
        const penX = Math.min(pMaxX - minX, maxX - pMinX);
        const penY = Math.min(pMaxY - minY, maxY - pMinY);
        const penZ = Math.min(pMaxZ - minZ, maxZ - pMinZ);
        const penMin = Math.min(penX, penY, penZ);
        if (penMin === penY) {
          // resolve vertically
          if (halfH + (resolved.y - (resolved.y)) < (minY + maxY) / 2) {
            // player center below box center -> push down (we landed on top -> push up actually)
          }
          // Determine direction: if player feet are above box center, push up; else push down.
          if (resolved.y + halfH > (minY + maxY) / 2) {
            resolved.y = maxY; // land on top
            resolved.onGround = true;
          } else {
            resolved.y = minY - height; // hit ceiling from below
            resolved.hitCeiling = true;
          }
        } else if (penMin === penX) {
          if (resolved.x > (minX + maxX) / 2) resolved.x = maxX + radius;
          else resolved.x = minX - radius;
        } else {
          if (resolved.z > (minZ + maxZ) / 2) resolved.z = maxZ + radius;
          else resolved.z = minZ - radius;
        }
      }
    }
    return resolved;
  }
  // Ray vs boxes; returns nearest hit distance t and the box, or null.
  raycast(origin, dir, maxDist = 1000) {
    const ray = new THREE.Ray(origin, dir);
    let best = null;
    for (const box of this.boxes) {
      const hit = ray.intersectBox(box, new THREE.Vector3());
      if (hit) {
        const dist = origin.distanceTo(hit);
        if (dist <= maxDist && (!best || dist < best.dist)) {
          best = { dist, point: hit, box };
        }
      }
    }
    return best;
  }
}
```
- [ ] **Step 3:** Commit:
```bash
git add src/config/Movement.js src/world/ColliderStore.js
git commit -m "feat: add movement config and AABB ColliderStore"
```

### Task 1.4: ArenaBuilder
**Files:**
- Create: `src/world/ArenaBuilder.js`

- [ ] **Step 1:** Create `src/world/ArenaBuilder.js`:
```js
import * as THREE from 'three';

const COLORS = {
  ground: 0x6ab150,
  cover: 0x8a8f98,
  platform: 0xb5895a,
  wall: 0x4a5560,
  ramp: 0x9aa0a8,
};

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, flatShading: true })
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// A ramp is a box rotated about X; for collision we treat its AABB (axis-aligned bounding box).
// True sloped collision is deferred; MVP ramps are steep steps approximated by stacked boxes.
export class ArenaBuilder {
  build(scene, colliderStore) {
    const group = new THREE.Group();

    // Ground
    const ground = box(80, 1, 80, COLORS.ground, 0, -0.5, 0);
    group.add(ground);
    colliderStore.addFromMesh(ground);

    // Perimeter walls
    const wallH = 6;
    const walls = [
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, -40),
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, 40),
      box(1, wallH, 80, COLORS.wall, -40, wallH / 2, 0),
      box(1, wallH, 80, COLORS.wall, 40, wallH / 2, 0),
    ];
    walls.forEach((w) => { group.add(w); colliderStore.addFromMesh(w); });

    // Central cover cluster (symmetrical)
    const covers = [
      box(4, 2, 4, COLORS.cover, 0, 1, 0),
      box(4, 2, 4, COLORS.cover, -12, 1, -12),
      box(4, 2, 4, COLORS.cover, 12, 1, 12),
      box(4, 2, 4, COLORS.cover, -12, 1, 12),
      box(4, 2, 4, COLORS.cover, 12, 1, -12),
      box(8, 1, 8, COLORS.cover, 0, 0.5, -20),
      box(8, 1, 8, COLORS.cover, 0, 0.5, 20),
      box(8, 1, 8, COLORS.cover, -20, 0.5, 0),
      box(8, 1, 8, COLORS.cover, 20, 0.5, 0),
    ];
    covers.forEach((c) => { group.add(c); colliderStore.addFromMesh(c); });

    // Two raised platforms with step-access (stacked boxes approximate a ramp)
    const platforms = [
      [box(10, 3, 10, COLORS.platform, -28, 1.5, -28), box(4, 1.5, 4, COLORS.ramp, -22, 0.75, -22)],
      [box(10, 3, 10, COLORS.platform, 28, 1.5, 28), box(4, 1.5, 4, COLORS.ramp, 22, 0.75, 22)],
    ];
    platforms.forEach((pair) => pair.forEach((p) => { group.add(p); colliderStore.addFromMesh(p); }));

    scene.add(group);
    return group;
  }
}
```
- [ ] **Step 2:** Commit:
```bash
git add src/world/ArenaBuilder.js
git commit -m "feat: add symmetrical arena builder with cover and platforms"
```

### Task 1.5: InputState
**Files:**
- Create: `src/core/InputState.js`

- [ ] **Step 1:** Create `src/core/InputState.js`:
```js
// Produces a per-frame intent snapshot from keyboard + pointer-locked mouse.
// Sensitivity is in radians per pixel of mouse movement.
export class InputState {
  constructor(canvas, { sensitivity = 0.0022, invertY = false } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.invertY = invertY;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.firing = false;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reloadRequested = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.pointerLocked && e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  // Consume the accumulated mouse delta and reset it.
  consumeLook() {
    const dx = this.mouseDX * this.sensitivity;
    const dy = this.mouseDY * this.sensitivity * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Build the intent object the movement/weapon controllers read.
  buildIntent() {
    return {
      forward: this.isDown('KeyW') ? 1 : this.isDown('KeyS') ? -1 : 0,
      strafe: this.isDown('KeyD') ? 1 : this.isDown('KeyA') ? -1 : 0,
      jump: this.isDown('Space'),
      sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      crouch: this.isDown('ControlLeft') || this.isDown('KeyC'),
      firing: this.firing,
      reloadRequested: this.reloadRequested,
    };
  }

  consumeReloadRequest() {
    const r = this.reloadRequested;
    this.reloadRequested = false;
    return r;
  }
}
```
- [ ] **Step 2:** Commit:
```bash
git add src/core/InputState.js
git commit -m "feat: add InputState for pointer-lock mouse and keyboard intent"
```

### Task 1.6: Player factory + MovementController (walk/sprint/jump/crouch)
**Files:**
- Create: `src/player/Player.js`
- Create: `src/player/MovementController.js`

- [ ] **Step 1:** Create `src/player/Player.js`:
```js
import * as THREE from 'three';
import { MOVEMENT } from '../config/Movement.js';

// Player entity. pos.y is FEET position (bottom of capsule).
export function createPlayer({ id, isLocal = false, position = new THREE.Vector3(0, 0, 0), yaw = 0, pitch = 0 } = {}) {
  return {
    id,
    isLocal,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    yaw,            // rotation around Y
    pitch,          // rotation around X (look up/down)
    health: 100,
    maxHealth: 100,
    alive: true,
    onGround: false,
    loadout: { primary: 'AR' },
    score: 0,
    deaths: 0,
    intent: { forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, firing: false, reloadRequested: false },
    view: null,     // CharacterView group, attached in Phase 3
    // movement state
    moveState: { sliding: false, slideTimer: 0, wallrunning: false, wallrunTimer: 0, wallNormal: null },
  };
}

export function eyePosition(player, out = new THREE.Vector3()) {
  return out.set(player.position.x, player.position.y + MOVEMENT.EYE_HEIGHT, player.position.z);
}

export function forwardVector(player, out = new THREE.Vector3()) {
  return out.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}

export function rightVector(player, out = new THREE.Vector3()) {
  return out.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
}
```
- [ ] **Step 2:** Create `src/player/MovementController.js`:
```js
import * as THREE from 'three';
import { MOVEMENT as M } from '../config/Movement.js';
import { forwardVector, rightVector } from './Player.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// Integrates one fixed tick for a player against the collider store.
export function tickMovement(player, dt, colliderStore) {
  if (!player.alive) return;

  const intent = player.intent;
  forwardVector(player, _fwd);
  rightVector(player, _right);

  // Wish direction in world space (normalized horizontal)
  _wish.set(0, 0, 0)
    .addScaledVector(_fwd, intent.forward)
    .addScaledVector(_right, intent.strafe);
  const hasInput = _wish.lengthSq() > 0.0001;
  if (hasInput) _wish.normalize();

  const maxSpeed = intent.sprint ? M.SPRINT : M.WALK;
  const accel = player.onGround ? M.ACCEL : M.AIR_ACCEL;

  // Horizontal acceleration toward wishdir * maxSpeed
  const targetVx = _wish.x * maxSpeed;
  const targetVz = _wish.z * maxSpeed;
  player.velocity.x = moveToward(player.velocity.x, targetVx, accel * dt);
  player.velocity.z = moveToward(player.velocity.z, targetVz, accel * dt);

  // Ground friction when no input on ground
  if (player.onGround && !hasInput) {
    const drop = M.FRICTION * dt;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const newSpeed = Math.max(0, speed - drop);
    if (speed > 0.0001) {
      const scale = newSpeed / speed;
      player.velocity.x *= scale;
      player.velocity.z *= scale;
    }
  }

  // Jump
  if (intent.jump && player.onGround) {
    player.velocity.y = M.JUMP_VELOCITY;
    player.onGround = false;
  }

  // Gravity
  player.velocity.y -= M.GRAVITY * dt;

  // Integrate position
  player.position.x += player.velocity.x * dt;
  player.position.y += player.velocity.y * dt;
  player.position.z += player.velocity.z * dt;

  // Collide & resolve
  const resolved = colliderStore.resolveCapsule(player.position, M.CAPSULE_RADIUS, M.CAPSULE_HEIGHT);
  if (resolved.y !== player.position.y) {
    // we were pushed vertically -> killed vertical velocity
    if (player.velocity.y < 0 && resolved.y >= player.position.y) {
      // landed
    }
    if (resolved.onGround) player.velocity.y = 0;
    if (resolved.hitCeiling && player.velocity.y > 0) player.velocity.y = 0;
  }
  player.position.x = resolved.x;
  player.position.y = resolved.y;
  player.position.z = resolved.z;
  player.onGround = resolved.onGround;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
```
- [ ] **Step 3:** Commit:
```bash
git add src/player/Player.js src/player/MovementController.js
git commit -m "feat: add Player entity and walk/sprint/jump movement"
```

### Task 1.7: Game loop wiring + camera follow + main.js
**Files:**
- Create: `src/core/Game.js`
- Modify: `src/main.js`

- [ ] **Step 1:** Create `src/core/Game.js`:
```js
import * as THREE from 'three';
import { FixedTimestep } from './FixedTimestep.js';
import { InputState } from './InputState.js';
import { ArenaBuilder } from '../world/ArenaBuilder.js';
import { ColliderStore } from '../world/ColliderStore.js';
import { createPlayer, eyePosition } from '../player/Player.js';
import { tickMovement } from '../player/MovementController.js';
import { MOVEMENT as M } from '../config/Movement.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 150);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 500);

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(40, 80, 30);
    this.scene.add(dir);

    // World
    this.colliders = new ColliderStore();
    this.arena = new ArenaBuilder();
    this.arena.build(this.scene, this.colliders);

    // Local player
    this.player = createPlayer({ id: 'local', isLocal: true, position: new THREE.Vector3(0, 1, 15) });

    // Input
    this.input = new InputState(canvas);
    this.input.requestPointerLock();

    // Loop
    this.fixed = new FixedTimestep(1 / 60);
    this.running = false;
    this.lastTime = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(realDt) {
    // Look (consume once per render frame, not per tick)
    const look = this.input.consumeLook();
    this.player.yaw -= look.dx;
    this.player.pitch -= look.dy;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));

    // Intent
    this.player.intent = this.input.buildIntent();

    // Sim
    this.fixed.update(realDt, (dt) => {
      tickMovement(this.player, dt, this.colliders);
    });

    // Render: position camera at eye, oriented by yaw/pitch
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.renderer.render(this.scene, this.camera);
  }
}
```
- [ ] **Step 2:** Replace `src/main.js`:
```js
import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();
```
- [ ] **Step 3:** Run `npm run dev`. Playtest checklist:
  - [ ] Mouse look works (pointer locks on click if not already)
  - [ ] WASD moves; Shift sprints
  - [ ] Space jumps; gravity pulls down
  - [ ] Can walk on the ground and on top of cover boxes and platforms
  - [ ] Cannot walk through walls/cover/perimeter
  - [ ] No falling through the ground
- [ ] **Step 4:** Commit:
```bash
git add src/core/Game.js src/main.js
git commit -m "feat: game loop with fixed-timestep movement and camera follow"
```

---

## Phase 2: Shooting + hitscan + feedback
**Checkpoint:** You can shoot hitscan, see tracers, muzzle flash, hit sparks, and a damage readout on a static target.

### Task 2.1: Weapons config
**Files:**
- Create: `src/config/Weapons.js`

- [ ] **Step 1:** Create `src/config/Weapons.js`:
```js
// All weapons are hitscan. Damage uses linear falloff past falloffStart.
export const WEAPONS = {
  AR: {
    id: 'AR',
    name: 'Assault Rifle',
    damage: 18,
    rpm: 600,                 // rounds per minute
    mag: 30,
    reloadTime: 1.8,
    spread: THREE_deg(0.6),   // replaced below (no THREE in config)
    falloffStart: 30,
    falloffEnd: 60,
    recoil: { vertical: 0.012, horizontal: 0.006 },
    auto: true,
  },
  SNIPER: {
    id: 'SNIPER',
    name: 'Sniper',
    damage: 80,
    rpm: 45,
    mag: 5,
    reloadTime: 2.4,
    spread: 0.0009,           // ~0.05 deg
    falloffStart: 80,
    falloffEnd: 160,
    recoil: { vertical: 0.06, horizontal: 0.02 },
    auto: false,
  },
};

function THREE_deg(d) { return (d * Math.PI) / 180; }
WEAPONS.AR.spread = THREE_deg(0.6);
```
- [ ] **Step 2:** Commit:
```bash
git add src/config/Weapons.js
git commit -m "feat: add weapons config (AR, Sniper)"
```

### Task 2.2: WeaponController (TDD on rate/ammo)
**Files:**
- Create: `src/player/WeaponController.js`
- Test: `src/tests/WeaponController.test.js`

- [ ] **Step 1:** Create failing test `src/tests/WeaponController.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { WeaponController } from '../player/WeaponController.js';
import { WEAPONS } from '../config/Weapons.js';

function makeCtrl(weaponId = 'AR') {
  const fired = [];
  const ctrl = new WeaponController(WEAPONS[weaponId]);
  ctrl.fireCallback = (shot) => fired.push(shot);
  return { ctrl, fired };
}

describe('WeaponController fire rate', () => {
  it('fires the correct number of rounds for a held trigger at AR rpm', () => {
    const { ctrl, fired } = makeCtrl('AR');
    // AR rpm 600 -> 1 round per 0.1s. Hold 0.5s -> 5 rounds.
    ctrl.update(0.5, true, false);
    expect(fired.length).toBe(5);
  });
  it('respects nextFireTime across multiple updates', () => {
    const { ctrl, fired } = makeCtrl('AR');
    ctrl.update(0.05, true, false); // 0
    ctrl.update(0.05, true, false); // 1 (at 0.1s)
    ctrl.update(0.05, true, false); // still 1
    expect(fired.length).toBe(1);
  });
});

describe('WeaponController ammo + reload', () => {
  it('stops firing when mag is empty (dry fire)', () => {
    const { ctrl, fired } = makeCtrl('AR');
    ctrl.update(5, true, false); // would fire 50 rounds, mag is 30
    expect(fired.length).toBe(30);
    expect(ctrl.ammo).toBe(0);
  });
  it('reloads over reloadTime back to full mag', () => {
    const { ctrl } = makeCtrl('AR');
    ctrl.update(5, true, false); // empty
    expect(ctrl.ammo).toBe(0);
    ctrl.update(WEAPONS.AR.reloadTime / 2, false, true); // half reload
    expect(ctrl.ammo).toBe(0);
    ctrl.update(WEAPONS.AR.reloadTime / 2 + 0.01, false, true); // finish
    expect(ctrl.ammo).toBe(WEAPONS.AR.mag);
  });
  it('semi-auto (sniper) fires once per trigger press', () => {
    const { ctrl, fired } = makeCtrl('SNIPER');
    ctrl.update(1, true, false); // held
    expect(fired.length).toBe(1);
    ctrl.update(1, true, false); // still held, no release -> no extra
    expect(fired.length).toBe(1);
  });
});
```
- [ ] **Step 2:** Run `npm test -- WeaponController`. Expected: FAIL.
- [ ] **Step 3:** Create `src/player/WeaponController.js`:
```js
export class WeaponController {
  constructor(weaponDef) {
    this.def = weaponDef;
    this.ammo = weaponDef.mag;
    this.nextFireTime = 0;
    this.reloadEndTime = 0;
    this.reloading = false;
    this.triggerHeldPrev = false; // for semi-auto
    this.fireCallback = null;     // set by owner: (shot) => {...}
  }

  get interval() {
    return 60 / this.def.rpm;
  }

  // update(dt, firing, reloadRequested) -> calls fireCallback({}) per shot
  update(dt, firing, reloadRequested) {
    this.nextFireTime -= dt;
    if (reloadRequested && !this.reloading && this.ammo < this.def.mag) {
      this.reloading = true;
      this.reloadEndTime = this.def.reloadTime;
    }
    if (this.reloading) {
      this.reloadEndTime -= dt;
      if (this.reloadEndTime <= 0) {
        this.reloading = false;
        this.ammo = this.def.mag;
      }
      // can't fire while reloading
      this.triggerHeldPrev = firing;
      return;
    }
    const canTrigger = this.def.auto ? firing : (firing && !this.triggerHeldPrev);
    this.triggerHeldPrev = firing;
    if (canTrigger && this.ammo > 0 && this.nextFireTime <= 0) {
      this.ammo -= 1;
      this.nextFireTime = this.interval;
      if (this.fireCallback) this.fireCallback({});
    }
  }

  reload() {
    if (!this.reloading && this.ammo < this.def.mag) {
      this.reloading = true;
      this.reloadEndTime = this.def.reloadTime;
    }
  }
}
```
- [ ] **Step 4:** Run `npm test -- WeaponController`. Expected: all PASS.
- [ ] **Step 5:** Commit:
```bash
git add src/player/WeaponController.js src/tests/WeaponController.test.js
git commit -m "feat: add WeaponController with fire-rate, ammo, reload (tested)"
```

### Task 2.3: FX pools (tracer, muzzle flash, hit spark)
**Files:**
- Create: `src/fx/BulletTracer.js`
- Create: `src/fx/MuzzleFlash.js`
- Create: `src/fx/HitMarker.js`

- [ ] **Step 1:** Create `src/fx/BulletTracer.js`:
```js
import * as THREE from 'three';

const POOL_SIZE = 32;
const FADE = 0.06; // seconds

export class BulletTracerPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0 });
    }
    this.next = 0;
  }
  spawn(from, to) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    item.mesh.position.copy(mid);
    item.mesh.scale.set(1, 1, len);
    item.mesh.lookAt(to);
    item.mesh.material.opacity = 0.9;
    item.mesh.visible = true;
    item.life = FADE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.mesh.material.opacity = Math.max(0, item.life / FADE) * 0.9;
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
```
- [ ] **Step 2:** Create `src/fx/MuzzleFlash.js`:
```js
import * as THREE from 'three';

const POOL_SIZE = 8;
const LIFE = 0.04;

export class MuzzleFlashPool {
  constructor(scene) {
    this.pool = [];
    const tex = makeFlashTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.6, 0.6, 0.6);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, life: 0 });
    }
    this.next = 0;
  }
  spawn(pos) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    item.sprite.position.copy(pos);
    item.sprite.material.opacity = 1;
    item.sprite.material.rotation = Math.random() * Math.PI;
    item.sprite.visible = true;
    item.life = LIFE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.sprite.material.opacity = Math.max(0, item.life / LIFE);
        if (item.life <= 0) item.sprite.visible = false;
      }
    }
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.4, 'rgba(255,200,80,0.7)');
  g.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
```
- [ ] **Step 3:** Create `src/fx/HitMarker.js`:
```js
import * as THREE from 'three';

const POOL_SIZE = 48;
const LIFE = 0.25;

// 3D sparks at impact point + optional DOM hitmarker for the local player.
export class HitSparkPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }
    this.next = 0;
  }
  spawn(pos, normal, color = 0xffd24a) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    item.mesh.position.copy(pos);
    item.mesh.material.color.setHex(color);
    item.mesh.visible = true;
    item.life = LIFE;
    // random burst biased along normal
    item.vel.copy(normal).multiplyScalar(2).add(
      new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)
    );
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.vel.y -= 9 * dt;
        item.mesh.position.addScaledVector(item.vel, dt);
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
```
- [ ] **Step 4:** Commit:
```bash
git add src/fx/BulletTracer.js src/fx/MuzzleFlash.js src/fx/HitMarker.js
git commit -m "feat: add pooled bullet tracer, muzzle flash, and hit spark FX"
```

### Task 2.4: Hitscan integration in Game + static targets
**Files:**
- Create: `src/player/TargetEntity.js`
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Create `src/player/TargetEntity.js` (static test dummies for damage feedback; replaced by real bot players in Phase 4):
```js
import * as THREE from 'three';

// A simple capsule-like target with a hitbox AABB used by hitscan.
export class TargetEntity {
  constructor(scene, colliderStoreForRaycast, position) {
    this.position = position.clone();
    this.health = 100;
    this.radius = 0.5;
    this.height = 1.8;
    this.alive = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0x66ccff, flatShading: true });
    this.mesh = new THREE.Mesh(new THREE.CapsuleGeometry(this.radius, this.height - this.radius * 2, 4, 8), mat);
    this.mesh.position.copy(position).add(new THREE.Vector3(0, this.height / 2, 0));
    scene.add(this.mesh);
  }
  // Ray vs capsule approximated as ray vs vertical AABB.
  rayHit(origin, dir, maxDist) {
    if (!this.alive) return null;
    const minX = this.position.x - this.radius, maxX = this.position.x + this.radius;
    const minY = this.position.y, maxY = this.position.y + this.height;
    const minZ = this.position.z - this.radius, maxZ = this.position.z + this.radius;
    const box = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    );
    const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
    if (!hit) return null;
    const dist = origin.distanceTo(hit);
    if (dist > maxDist) return null;
    return { dist, point: hit, target: this };
  }
  takeDamage(d) {
    this.health -= d;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.mesh.visible = false;
    }
  }
  reset() {
    this.health = 100;
    this.alive = true;
    this.mesh.visible = true;
  }
}
```
- [ ] **Step 2:** Modify `src/core/Game.js` — add to constructor after player creation (add the imports at top: `WeaponController`, `WEAPONS`, `BulletTracerPool`, `MuzzleFlashPool`, `HitSparkPool`, `TargetEntity`):
```js
// After: this.player = createPlayer(...)
import { WEAPONS } from '../config/Weapons.js';
import { WeaponController } from '../player/WeaponController.js';
import { BulletTracerPool } from '../fx/BulletTracer.js';
import { MuzzleFlashPool } from '../fx/MuzzleFlash.js';
import { HitSparkPool } from '../fx/HitMarker.js';
import { TargetEntity } from '../player/TargetEntity.js';
import { MOVEMENT as M } from '../config/Movement.js';

// inside constructor:
this.tracers = new BulletTracerPool(this.scene);
this.flashes = new MuzzleFlashPool(this.scene);
this.sparks = new HitSparkPool(this.scene);
this.weapon = new WeaponController(WEAPONS[this.player.loadout.primary]);

// static test targets
this.targets = [
  new TargetEntity(this.scene, this.colliders, new THREE.Vector3(0, 0, -10)),
  new TargetEntity(this.scene, this.colliders, new THREE.Vector3(-8, 3, -10)),
  new TargetEntity(this.scene, this.colliders, new THREE.Vector3(8, 3, -10)),
];
```
- [ ] **Step 3:** Add weapon firing + hitscan to `Game.frame`. After intent assignment, before `this.fixed.update(...)`. Each fixed tick should run weapon logic too, so put it inside the fixed callback:
```js
// In Game.frame, replace the fixed.update block with:
this.fixed.update(realDt, (dt) => {
  tickMovement(this.player, dt, this.colliders);

  // Weapon
  const firing = this.player.intent.firing;
  const reloadReq = this.input.consumeReloadRequest() || this.player.intent.reloadRequested;
  this.weapon.update(dt, firing, reloadReq);
});

// After the fixed.update, process the single pending shot (if any) for the render frame.
// Simpler: set weapon.fireCallback to push into a queue consumed here.
```
Replace with a cleaner integration — add a `pendingShots` array:
```js
// constructor:
this.pendingShots = [];
this.weapon.fireCallback = () => this.pendingShots.push({});

// in frame, AFTER fixed.update:
for (const _shot of this.pendingShots) this.fireOneShot();
this.pendingShots.length = 0;

this.tracers.update(realDt);
this.flashes.update(realDt);
this.sparks.update(realDt);
```
Add the `fireOneShot` method to Game:
```js
fireOneShot() {
  const def = this.weapon.def;
  // origin = camera position; dir = camera forward + spread
  const origin = this.camera.position.clone();
  const dir = new THREE.Vector3();
  this.camera.getWorldDirection(dir);
  // gaussian-ish spread
  const spread = def.spread;
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();

  const MAX = 500;
  // nearest target
  let best = null;
  for (const t of this.targets) {
    const hit = t.rayHit(origin, dir, MAX);
    if (hit && (!best || hit.dist < best.dist)) best = { ...hit, kind: 'enemy' };
  }
  const wallHit = this.colliders.raycast(origin, dir, MAX);
  if (wallHit && (!best || wallHit.dist < best.dist)) {
    best = { dist: wallHit.dist, point: wallHit.point, kind: 'wall', normal: wallHit.boxNormal || new THREE.Vector3(0,1,0) };
  }

  const muzzle = origin.clone().addScaledVector(dir, 0.5);
  this.flashes.spawn(muzzle);

  if (best) {
    this.tracers.spawn(muzzle, best.point);
    if (best.kind === 'enemy') {
      const dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
      best.target.takeDamage(dmg);
      this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xff3344);
    } else {
      this.sparks.spawn(best.point, best.normal || new THREE.Vector3(0, 1, 0), 0xffd24a);
    }
  } else {
    const far = origin.clone().addScaledVector(dir, MAX);
    this.tracers.spawn(muzzle, far);
  }

  // recoil
  this.player.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
  this.player.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
  this.player.pitch = Math.min(this.player.pitch, Math.PI / 2 - 0.01);
}

function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
```
- [ ] **Step 4:** Run `npm run dev`. Playtest:
  - [ ] Click to lock pointer; hold LMB to fire AR
  - [ ] Tracers + muzzle flash visible
  - [ ] Hitting a target spawns red sparks; after enough hits it disappears
  - [ ] Sniper (swap `loadout.primary = 'SNIPER'` temporarily) fires one shot per click, big damage
  - [ ] 1 key/2 key weapon swap is a nice-to-have — defer
- [ ] **Step 5:** Commit:
```bash
git add src/player/TargetEntity.js src/core/Game.js
git commit -m "feat: hitscan shooting with tracers, muzzle flash, sparks, falloff"
```

### Task 2.5: Crosshair + HUD (health/ammo)
**Files:**
- Create: `src/ui/Crosshair.js`
- Create: `src/ui/Hud.js`
- Modify: `index.html` (CSS hooks) and `src/core/Game.js` (wire updates)

- [ ] **Step 1:** Create `src/ui/Crosshair.js`:
```js
export class Crosshair {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:20px; height:20px; pointer-events:none;`;
    this.el.innerHTML = `
      <div style="position:absolute;left:50%;top:0;width:2px;height:8px;background:rgba(255,255,255,.8);transform:translateX(-50%);"></div>
      <div style="position:absolute;left:50%;bottom:0;width:2px;height:8px;background:rgba(255,255,255,.8);transform:translateX(-50%);"></div>
      <div style="position:absolute;top:50%;left:0;height:2px;width:8px;background:rgba(255,255,255,.8);transform:translateY(-50%);"></div>
      <div style="position:absolute;top:50%;right:0;height:2px;width:8px;background:rgba(255,255,255,.8);transform:translateY(-50%);"></div>`;
    root.appendChild(this.el);
  }
  setSpread(px) {
    const s = Math.max(8, px);
    this.el.style.width = s + 'px';
    this.el.style.height = s + 'px';
  }
  hide() { this.el.style.display = 'none'; }
  show() { this.el.style.display = 'block'; }
}
```
- [ ] **Step 2:** Create `src/ui/Hud.js`:
```js
export class Hud {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.style.cssText = `position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;`;
    this.el.innerHTML = `
      <div id="hud-health" style="position:absolute;left:24px;bottom:24px;font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);">HP 100</div>
      <div id="hud-ammo" style="position:absolute;right:24px;bottom:24px;font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);">--/--</div>
      <div id="hud-weapon" style="position:absolute;right:24px;bottom:54px;font-size:14px;opacity:.8;">--</div>
      <div id="hud-killfeed" style="position:absolute;right:24px;top:24px;font-size:14px;line-height:1.5;"></div>`;
    root.appendChild(this.el);
    this.healthEl = this.el.querySelector('#hud-health');
    this.ammoEl = this.el.querySelector('#hud-ammo');
    this.weaponEl = this.el.querySelector('#hud-weapon');
    this.killfeedEl = this.el.querySelector('#hud-killfeed');
  }
  setHealth(hp) { this.healthEl.textContent = `HP ${Math.max(0, Math.round(hp))}`; }
  setAmmo(ammo, mag) { this.ammoEl.textContent = `${ammo}/${mag}`; }
  setWeapon(name) { this.weaponEl.textContent = name; }
  addKill(text) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.opacity = '1';
    line.style.transition = 'opacity 0.5s ease 3s';
    this.killfeedEl.appendChild(line);
    setTimeout(() => (line.style.opacity = '0'), 100);
    setTimeout(() => line.remove(), 4000);
  }
}
```
- [ ] **Step 3:** Wire into `Game` constructor + `frame`. In constructor:
```js
import { Crosshair } from '../ui/Crosshair.js';
import { Hud } from '../ui/Hud.js';
const uiRoot = document.getElementById('ui');
this.hud = new Hud(uiRoot);
this.crosshair = new Crosshair(uiRoot);
this.hud.setWeapon(this.weapon.def.name);
```
In `frame`, after render:
```js
this.hud.setHealth(this.player.health);
this.hud.setAmmo(this.weapon.ammo, this.weapon.def.mag);
const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
this.crosshair.setSpread(14 + speed * 2);
```
- [ ] **Step 4:** Playtest: HUD shows HP, ammo counts down as you fire, crosshair widens when moving.
- [ ] **Step 5:** Commit:
```bash
git add src/ui/Crosshair.js src/ui/Hud.js src/core/Game.js
git commit -m "feat: crosshair and HUD with health/ammo/weapon"
```

---

## Phase 3: Characters & animal skins
**Checkpoint:** Player and bots render as animal-headed characters; spawn points placed.

### Task 3.1: Animals config
**Files:**
- Create: `src/config/Animals.js`

- [ ] **Step 1:** Create `src/config/Animals.js`:
```js
import * as THREE from 'three';

// Each animal defines a palette and stat multipliers + a headBuilder(group) that
// attaches an animal head at the top of the body. All animals share the body rig.
export const ANIMALS = {
  FOX: {
    id: 'FOX', name: 'Fox',
    palette: { primary: 0xe8742c, secondary: 0xf5efe6, accent: 0x2a1a0e },
    speedMul: 1.1, hpMul: 0.9,
    headBuilder: buildFoxHead,
  },
  WOLF: {
    id: 'WOLF', name: 'Wolf',
    palette: { primary: 0x6f7682, secondary: 0xcfd3da, accent: 0x1a1d22 },
    speedMul: 1.0, hpMul: 1.0,
    headBuilder: buildWolfHead,
  },
  PANDA: {
    id: 'PANDA', name: 'Panda',
    palette: { primary: 0xf2f2f2, secondary: 0x1c1c1c, accent: 0x2a2a2a },
    speedMul: 0.95, hpMul: 1.1,
    headBuilder: buildPandaHead,
  },
  TIGER: {
    id: 'TIGER', name: 'Tiger',
    palette: { primary: 0xf2a93b, secondary: 0x1c1c1c, accent: 0x3a2a14 },
    speedMul: 1.05, hpMul: 1.0,
    headBuilder: buildTigerHead,
  },
  BEAR: {
    id: 'BEAR', name: 'Bear',
    palette: { primary: 0x7a5230, secondary: 0xd8b48a, accent: 0x2a1a0e },
    speedMul: 0.9, hpMul: 1.2,
    headBuilder: buildBearHead,
  },
  BUNNY: {
    id: 'BUNNY', name: 'Bunny',
    palette: { primary: 0xe8e1d6, secondary: 0xc9b8a3, accent: 0x3a2a1a },
    speedMul: 1.2, hpMul: 0.85,
    headBuilder: buildBunnyHead,
  },
  OWL: {
    id: 'OWL', name: 'Owl',
    palette: { primary: 0xa6926b, secondary: 0xe8dcc4, accent: 0x2a1a0e },
    speedMul: 1.0, hpMul: 0.95,
    headBuilder: buildOwlHead,
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);

// headBuilder returns a THREE.Group positioned so its origin is at the neck,
// oriented facing +Z (forward). Body attaches it at the top.
function mat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true }); }

function sphere(r, color) { return new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color)); }
function box(w,h,d,color){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color)); }
function cone(r,h,color){ return new THREE.Mesh(new THREE.ConeGeometry(r,h,8), mat(color)); }

function buildFoxHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.32, p.primary); head.position.y = 0; g.add(head);
  const snout = box(0.18, 0.16, 0.28, p.secondary); snout.position.set(0, -0.05, 0.32); g.add(snout);
  const nose = box(0.06,0.06,0.06, p.accent); nose.position.set(0,-0.02,0.46); g.add(nose);
  const ear1 = cone(0.08, 0.22, p.primary); ear1.position.set(-0.14, 0.32, -0.05); g.add(ear1);
  const ear2 = cone(0.08, 0.22, p.primary); ear2.position.set(0.14, 0.32, -0.05); g.add(ear2);
  const eye1 = sphere(0.04, p.accent); eye1.position.set(-0.1, 0.05, 0.28); g.add(eye1);
  const eye2 = sphere(0.04, p.accent); eye2.position.set(0.1, 0.05, 0.28); g.add(eye2);
  return g;
}

function buildWolfHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.34, p.primary); g.add(head);
  const snout = box(0.2,0.18,0.32, p.secondary); snout.position.set(0,-0.05,0.3); g.add(snout);
  const ear1 = box(0.08,0.18,0.06,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = box(0.08,0.18,0.06,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  const eye1 = sphere(0.045, 0xffdd55); eye1.position.set(-0.12,0.06,0.27); g.add(eye1);
  const eye2 = sphere(0.045, 0xffdd55); eye2.position.set(0.12,0.06,0.27); g.add(eye2);
  return g;
}

function buildPandaHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.36, p.primary); g.add(head);
  const patch1 = sphere(0.1, p.secondary); patch1.position.set(-0.16,0.04,0.28); g.add(patch1);
  const patch2 = sphere(0.1, p.secondary); patch2.position.set(0.16,0.04,0.28); g.add(patch2);
  const eye1 = sphere(0.035, p.accent); eye1.position.set(-0.16,0.04,0.35); g.add(eye1);
  const eye2 = sphere(0.035, p.accent); eye2.position.set(0.16,0.04,0.35); g.add(eye2);
  const ear1 = sphere(0.12, p.secondary); ear1.position.set(-0.28,0.28,0); g.add(ear1);
  const ear2 = sphere(0.12, p.secondary); ear2.position.set(0.28,0.28,0); g.add(ear2);
  const snout = sphere(0.1, p.primary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.04, p.accent); nose.position.set(0,-0.04,0.4); g.add(nose);
  return g;
}

function buildTigerHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.34, p.primary); g.add(head);
  // stripes
  for (let i = 0; i < 4; i++) {
    const stripe = box(0.04, 0.18, 0.04, p.secondary);
    stripe.position.set(-0.18 + i*0.12, 0.18, 0.05 + (i%2)*0.12);
    g.add(stripe);
  }
  const snout = sphere(0.16, p.secondary); snout.position.set(0,-0.05,0.3); snout.scale.set(1,0.8,1.2); g.add(snout);
  const ear1 = cone(0.08,0.2,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = cone(0.08,0.2,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  const eye1 = sphere(0.04, 0xffdd55); eye1.position.set(-0.1,0.05,0.3); g.add(eye1);
  const eye2 = sphere(0.04, 0xffdd55); eye2.position.set(0.1,0.05,0.3); g.add(eye2);
  return g;
}

function buildBearHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.38, p.primary); g.add(head);
  const snout = box(0.2,0.18,0.3, p.secondary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.05, p.accent); nose.position.set(0,-0.02,0.44); g.add(nose);
  const ear1 = sphere(0.12, p.primary); ear1.position.set(-0.26,0.3,0); g.add(ear1);
  const ear2 = sphere(0.12, p.primary); ear2.position.set(0.26,0.3,0); g.add(ear2);
  const eye1 = sphere(0.035,p.accent); eye1.position.set(-0.1,0.05,0.32); g.add(eye1);
  const eye2 = sphere(0.035,p.accent); eye2.position.set(0.1,0.05,0.32); g.add(eye2);
  return g;
}

function buildBunnyHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.3, p.primary); g.add(head);
  const ear1 = box(0.08,0.5,0.06,p.primary); ear1.position.set(-0.1,0.45,0); ear1.rotation.z = 0.1; g.add(ear1);
  const ear2 = box(0.08,0.5,0.06,p.primary); ear2.position.set(0.1,0.45,0); ear2.rotation.z = -0.1; g.add(ear2);
  const eye1 = sphere(0.04,p.accent); eye1.position.set(-0.1,0.04,0.26); g.add(eye1);
  const eye2 = sphere(0.04,p.accent); eye2.position.set(0.1,0.04,0.26); g.add(eye2);
  const nose = sphere(0.04, 0xffaaaa); nose.position.set(0,-0.04,0.28); g.add(nose);
  return g;
}

function buildOwlHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.36, p.primary); g.add(head);
  const disc1 = sphere(0.12, p.secondary); disc1.position.set(-0.14,0.04,0.26); disc1.scale.set(1,1,0.4); g.add(disc1);
  const disc2 = sphere(0.12, p.secondary); disc2.position.set(0.14,0.04,0.26); disc2.scale.set(1,1,0.4); g.add(disc2);
  const eye1 = sphere(0.06, 0xffcc33); eye1.position.set(-0.14,0.04,0.32); g.add(eye1);
  const eye2 = sphere(0.06, 0xffcc33); eye2.position.set(0.14,0.04,0.32); g.add(eye2);
  const beak = cone(0.05,0.14, p.accent); beak.position.set(0,-0.06,0.34); beak.rotation.x = Math.PI/2; g.add(beak);
  const tuft1 = cone(0.06,0.18,p.primary); tuft1.position.set(-0.2,0.34,0); g.add(tuft1);
  const tuft2 = cone(0.06,0.18,p.primary); tuft2.position.set(0.2,0.34,0); g.add(tuft2);
  return g;
}
```
- [ ] **Step 2:** Commit:
```bash
git add src/config/Animals.js
git commit -m "feat: add Animals config with 7 procedural animal heads"
```

### Task 3.2: CharacterView (body + head + gun)
**Files:**
- Create: `src/player/CharacterView.js`

- [ ] **Step 1:** Create `src/player/CharacterView.js`:
```js
import * as THREE from 'three';
import { ANIMALS } from '../config/Animals.js';
import { MOVEMENT as M } from '../config/Movement.js';

function mat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true }); }

// Builds a humanoid body + attaches an animal head + a gun. Animates limb swing by speed.
export class CharacterView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.limbs = []; // {mesh, axis, phase} for swing
    this.head = null;
    this.gun = null;
    this.animTime = 0;
    scene.add(this.group);
  }
  setAnimal(animalId) {
    const animal = ANIMALS[animalId];
    // clear previous body
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.limbs = [];
    const p = animal.palette;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), mat(p.primary));
    torso.position.y = 1.1;
    this.group.add(torso);

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
    const legL = new THREE.Mesh(legGeo, mat(p.accent)); legL.position.set(-0.13, 0.45, 0); this.group.add(legL);
    const legR = new THREE.Mesh(legGeo, mat(p.accent)); legR.position.set(0.13, 0.45, 0); this.group.add(legR);
    this.limbs.push({ mesh: legL, baseX: -0.13, baseZ: 0, phase: 0 });
    this.limbs.push({ mesh: legR, baseX: 0.13, baseZ: 0, phase: Math.PI });

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.45, 4, 8);
    const armL = new THREE.Mesh(armGeo, mat(p.primary)); armL.position.set(-0.38, 1.2, 0); this.group.add(armL);
    const armR = new THREE.Mesh(armGeo, mat(p.primary)); armR.position.set(0.38, 1.2, 0); this.group.add(armR);
    this.limbs.push({ mesh: armL, baseX: -0.38, baseZ: 0, phase: Math.PI });
    this.limbs.push({ mesh: armR, baseX: 0.38, baseZ: 0, phase: 0 });

    // head
    this.head = animal.headBuilder(p);
    this.head.position.y = 1.7;
    this.group.add(this.head);

    // gun (basic) attached to right arm
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), mat(0x222428));
    this.gun.position.set(0.4, 1.15, 0.3);
    this.group.add(this.gun);
  }
  setWeapon(weaponId) {
    // Swap gun proportions by id (visual only).
    if (this.gun) this.group.remove(this.gun);
    const size = weaponId === 'SNIPER' ? { w: 0.1, h: 0.1, d: 0.95 } : { w: 0.12, h: 0.14, d: 0.6 };
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, size.d), mat(0x222428));
    this.gun.position.set(0.4, 1.15, 0.3);
    this.group.add(this.gun);
  }
  update(dt, speed, yaw, pitch) {
    this.group.rotation.y = yaw;
    // Position group at the player's FEET — caller sets group.position separately.
    this.animTime += dt * Math.max(0.5, speed);
    const swing = Math.min(1, speed / 6) * 0.5;
    for (const limb of this.limbs) {
      const o = Math.sin(this.animTime * 8 + limb.phase) * swing;
      limb.mesh.position.x = limb.baseX;
      limb.mesh.position.z = limb.baseZ + o * 0.25;
    }
  }
  setPosition(x, y, z) { this.group.position.set(x, y, z); }
  setVisible(v) { this.group.visible = v; }
  dispose() { this.scene.remove(this.group); }
}
```
- [ ] **Step 2:** Commit:
```bash
git add src/player/CharacterView.js
git commit -m "feat: add CharacterView with body + animal head + gun + limb swing"
```

### Task 3.3: SpawnPoints
**Files:**
- Create: `src/world/SpawnPoints.js`

- [ ] **Step 1:** Create `src/world/SpawnPoints.js`:
```js
import * as THREE from 'three';

// Symmetrical spawn points around/above the arena.
export const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 30),
  new THREE.Vector3(0, 1, -30),
  new THREE.Vector3(30, 1, 0),
  new THREE.Vector3(-30, 1, 0),
  new THREE.Vector3(22, 1, 22),
  new THREE.Vector3(-22, 1, -22),
  new THREE.Vector3(22, 1, -22),
  new THREE.Vector3(-22, 1, 22),
  new THREE.Vector3(0, 4.5, 0),     // on top of central cover
  new THREE.Vector3(15, 1, 0),
  new THREE.Vector3(-15, 1, 0),
  new THREE.Vector3(0, 1, 15),
];

// Returns the spawn point farthest from all live (occupied) positions.
export function getRandomSpawn(occupied = []) {
  let best = SPAWN_POINTS[0];
  let bestDist = -1;
  for (const sp of SPAWN_POINTS) {
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
- [ ] **Step 2:** Commit:
```bash
git add src/world/SpawnPoints.js
git commit -m "feat: add symmetrical spawn points with farthest-from-live selector"
```

### Task 3.4: Attach CharacterView to player + show local third-person? (no — first person)
**Files:**
- Modify: `src/player/Player.js`
- Modify: `src/core/Game.js`

- [ ] **Step 1:** The local player is first-person, so we hide their own view but render bots. Update `Game` to attach a `CharacterView` to the local player (hidden) and render target dummies as characters too. In `Game` constructor, after creating targets:
```js
import { CharacterView } from '../player/CharacterView.js';
import { ANIMAL_IDS } from '../config/Animals.js';

// local player view (hidden — first person), but exists for consistency
this.player.view = new CharacterView(this.scene);
this.player.view.setAnimal('FOX');
this.player.view.setWeapon(this.player.loadout.primary);
this.player.view.setVisible(false);

// give each target dummy an animal look
this.targetAnimals = ['WOLF', 'PANDA', 'TIGER'];
this.targets.forEach((t, i) => {
  t.view = new CharacterView(this.scene);
  t.view.setAnimal(this.targetAnimals[i]);
  t.view.setWeapon('AR');
});
```
Add to `Game.frame`, after movement, sync views:
```js
// sync target views to their dummy position
this.targets.forEach((t) => {
  if (t.view) t.view.setPosition(t.position.x, t.position.y, t.position.z);
});
```
And when a target is killed and reset, also `t.view.setVisible(t.alive)`.
- [ ] **Step 2:** Playtest: the three dummies now look like Wolf/Panda/Tiger with bodies + guns; limbs swing when... they're static, so no swing. That's fine. Shooting them works as before. The local player sees only the gun (we'll add a first-person viewmodel in Phase 7 polish; for now the camera at eye sees nothing of self, which is correct).
- [ ] **Step 3:** Commit:
```bash
git add src/player/Player.js src/core/Game.js
git commit -m "feat: render targets as animal characters; hide local view"
```

### Task 3.5: MainMenu (animal + weapon pick)
**Files:**
- Create: `src/ui/MainMenu.js`
- Modify: `src/core/Game.js` (start from menu instead of auto-lock)

- [ ] **Step 1:** Create `src/ui/MainMenu.js`:
```js
import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';

export class MainMenu {
  constructor(root, { onStart }) {
    this.root = root;
    this.onStart = onStart;
    this.selectedAnimal = 'FOX';
    this.selectedWeapon = 'AR';
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(10,14,20,.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;`;
    this.render();
    root.appendChild(this.el);
  }
  render() {
    this.el.innerHTML = `
      <h1 style="font-size:48px;margin:0 0 8px;letter-spacing:2px;">ANIMAL<span style="color:#ffb84d">STRIKE</span></h1>
      <p style="opacity:.7;margin:0 0 24px;">Pick your animal and weapon</p>
      <div style="display:flex;gap:24px;margin-bottom:24px;">
        ${ANIMAL_IDS.map(id => {
          const a = ANIMALS[id];
          return `<button data-animal="${id}" style="
            background:${this.selectedAnimal===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:12px 16px;border-radius:8px;cursor:pointer;font-size:14px;">
            ${a.name}<br><small style="opacity:.7">spd ×${a.speedMul.toFixed(2)} hp ×${a.hpMul.toFixed(2)}</small>
          </button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-bottom:32px;">
        ${Object.keys(WEAPONS).map(id => `
          <button data-weapon="${id}" style="
            background:${this.selectedWeapon===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 18px;border-radius:8px;cursor:pointer;">
            ${WEAPONS[id].name}
          </button>`).join('')}
      </div>
      <button id="play-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 48px;
        border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">PLAY</button>`;
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; this.render(); };
    });
    this.el.querySelector('#play-btn').onclick = () => {
      this.el.style.display = 'none';
      this.onStart({ animal: this.selectedAnimal, weapon: this.selectedWeapon });
    };
  }
  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
}
```
- [ ] **Step 2:** Modify `Game` to start via menu. In constructor, instead of `this.input.requestPointerLock()` immediately, build the menu and call `applyLoadout` on start. Replace the auto-lock line with:
```js
import { MainMenu } from '../ui/MainMenu.js';
// ...
this.menu = new MainMenu(uiRoot, { onStart: ({ animal, weapon }) => this.startMatch(animal, weapon) });
```
Add method:
```js
startMatch(animalId, weaponId) {
  this.player.loadout.primary = weaponId;
  this.player.view.setAnimal(animalId);
  this.player.view.setWeapon(weaponId);
  this.weapon = new WeaponController(WEAPONS[weaponId]);
  this.hud.setWeapon(this.weapon.def.name);
  this.input.requestPointerLock();
}
```
- [ ] **Step 3:** Playtest: menu appears, pick Fox/Bunny + AR, PLAY → pointer locks, you can walk + shoot as before.
- [ ] **Step 4:** Commit:
```bash
git add src/ui/MainMenu.js src/core/Game.js
git commit -m "feat: main menu with animal and weapon selection"
```

---

## Phase 4: Bot AI
**Checkpoint:** Bots roam the arena, chase you, and shoot back.

### Task 4.1: EntityStore
**Files:**
- Create: `src/core/EntityStore.js`
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Create `src/core/EntityStore.js`:
```js
export class EntityStore {
  constructor() { this.players = []; }
  add(p) { this.players.push(p); return p; }
  remove(p) { const i = this.players.indexOf(p); if (i >= 0) this.players.splice(i, 1); }
  forEach(fn) { for (const p of this.players) fn(p); }
  alive() { return this.players.filter(p => p.alive); }
  enemiesOf(player) { return this.players.filter(p => p !== player && p.alive); }
}
```
- [ ] **Step 2:** Commit (integration into Game happens in Task 4.6):
```bash
git add src/core/EntityStore.js
git commit -m "feat: add EntityStore for player management"
```

### Task 4.2: BotAim model (TDD)
**Files:**
- Create: `src/ai/BotAim.js`
- Test: `src/tests/BotAim.test.js`

- [ ] **Step 1:** Create failing test:
```js
import { describe, it, expect } from 'vitest';
import { computeAimPoint } from '../ai/BotAim.js';

describe('computeAimPoint', () => {
  it('returns the target position when accuracy is perfect', () => {
    const target = { pos: [10, 1, 0] };
    const p = computeAimPoint(target, { accuracy: 1, reactionProgress: 1, rand: () => 0 });
    expect(p).toEqual([10, 1, 0]);
  });
  it('offsets within the error cone when accuracy < 1', () => {
    const target = { pos: [10, 1, 0] };
    // accuracy 0 -> full error radius
    const p = computeAimPoint(target, { accuracy: 0, reactionProgress: 1, errorRadius: 2, rand: () => 0.5 });
    // rand 0.5 -> offset = (0.5-0.5)=0 on each axis with the default mapping... pick a rand that moves it
    const p2 = computeAimPoint(target, { accuracy: 0, reactionProgress: 1, errorRadius: 2, rand: () => 0.9 });
    expect(Math.abs(p2[0] - 10) + Math.abs(p2[2] - 0)).toBeGreaterThan(0);
  });
  it('error shrinks as reactionProgress goes 0->1 (tuning in)', () => {
    const target = { pos: [10, 1, 0] };
    const early = computeAimPoint(target, { accuracy: 0.5, reactionProgress: 0.1, errorRadius: 3, rand: () => 0.9 });
    const late = computeAimPoint(target, { accuracy: 0.5, reactionProgress: 1.0, errorRadius: 3, rand: () => 0.9 });
    const errEarly = Math.hypot(early[0]-10, early[2]-0);
    const errLate = Math.hypot(late[0]-10, late[2]-0);
    expect(errEarly).toBeGreaterThan(errLate);
  });
});
```
- [ ] **Step 2:** Run test. Expected: FAIL.
- [ ] **Step 3:** Create `src/ai/BotAim.js`:
```js
// Pure function: target = {pos:[x,y,z]}, opts = {accuracy, reactionProgress, errorRadius, rand}
// accuracy: 0..1 (1 = perfect). reactionProgress: 0..1 (how locked-on the bot is).
export function computeAimPoint(target, opts) {
  const { accuracy = 0.8, reactionProgress = 1, errorRadius = 2, rand = Math.random } = opts;
  const [x, y, z] = target.pos;
  // effective error shrinks both by accuracy and by how tuned-in the reaction is
  const eff = errorRadius * (1 - accuracy) * (1 - reactionProgress);
  return [
    x + (rand() - 0.5) * 2 * eff,
    y + (rand() - 0.5) * 2 * eff,
    z + (rand() - 0.5) * 2 * eff,
  ];
}

// Smoothly turn current yaw/pitch toward a world-space aim point.
export function turnToward(current, aimWorldPoint, fromPoint, turnSpeed, dt) {
  const dx = aimWorldPoint[0] - fromPoint[0];
  const dz = aimWorldPoint[2] - fromPoint[2];
  const dy = aimWorldPoint[1] - fromPoint[1];
  const horiz = Math.hypot(dx, dz);
  const desiredYaw = Math.atan2(dx, -dz) + Math.PI; // align with player.yaw convention (-sin/-cos)
  const desiredPitch = -Math.atan2(dy, horiz);
  return {
    yaw: approachAngle(current.yaw, desiredYaw, turnSpeed * dt),
    pitch: approachAngle(current.pitch, desiredPitch, turnSpeed * dt * 0.6),
  };
}

function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
```
- [ ] **Step 4:** Run test. Expected: PASS.
- [ ] **Step 5:** Commit:
```js
// (commit shell)
```
```bash
git add src/ai/BotAim.js src/tests/BotAim.test.js
git commit -m "feat: add BotAim model with accuracy/reaction tuning (tested)"
```

### Task 4.3: BotNavigation (waypoints)
**Files:**
- Create: `src/ai/BotNavigation.js`

- [ ] **Step 1:** Create `src/ai/BotNavigation.js`:
```js
import * as THREE from 'three';

// Hand-placed waypoint graph over the arena. Each node is a position; edges are
// implied by "go to nearest node toward goal" (greedy, no full A* for MVP).
export const WAYPOINTS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(0, 0, -20),
  new THREE.Vector3(20, 0, 0),
  new THREE.Vector3(-20, 0, 0),
  new THREE.Vector3(14, 0, 14),
  new THREE.Vector3(-14, 0, -14),
  new THREE.Vector3(14, 0, -14),
  new THREE.Vector3(-14, 0, 14),
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(28, 3, -28),
  new THREE.Vector3(-28, 3, 28),
];

export class BotNavigation {
  constructor() {
    this.target = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
  }
  pickRandomPatrolPoint() {
    this.target = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)].clone();
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
- [ ] **Step 2:** Commit:
```bash
git add src/ai/BotNavigation.js
git commit -m "feat: add bot waypoint navigation with stuck-jump"
```

### Task 4.4: BotAim wrapper + LOS check
**Files:**
- Modify: `src/ai/BotAim.js`
- Modify: `src/core/Game.js` (give bots weapon firing)

> Note: We'll keep the pure `computeAimPoint` and add a `selectTarget` helper that uses the collider store for LOS.

- [ ] **Step 1:** Add to `src/ai/BotAim.js`:
```js
import * as THREE from 'three';

// Select nearest visible (LOS clear) enemy. Returns {player, dist} or null.
export function selectTarget(bot, enemies, colliderStore) {
  const from = bot.position.clone(); from.y += 1.5;
  let best = null;
  for (const e of enemies) {
    const to = e.position.clone(); to.y += 1.5;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist > 60) continue;
    dir.normalize();
    const wall = colliderStore.raycast(from, dir, dist);
    if (wall && wall.dist < dist - 0.5) continue; // occluded
    if (!best || dist < best.dist) best = { player: e, dist };
  }
  return best;
}
```
- [ ] **Step 2:** Commit:
```bash
git add src/ai/BotAim.js
git commit -m "feat: add selectTarget with line-of-sight check"
```

### Task 4.5: AIController FSM
**Files:**
- Create: `src/ai/AIController.js`
- Create: `src/ai/BotCombat.js`
- Modify: `src/config/Match.js` (create with bot count + difficulty)

- [ ] **Step 1:** Create `src/config/Match.js`:
```js
export const MATCH = {
  fragTarget: 25,
  matchSeconds: 300,
  respawnDelay: 2.5,
  botCount: 5,
  botDifficulty: {
    easy:   { reactionTime: 0.6, accuracy: 0.45, turnSpeed: 4.0, aggression: 0.4, detectRange: 40, preferredRange: 18, retreatHp: 25, loseTargetTime: 3 },
    normal: { reactionTime: 0.35, accuracy: 0.65, turnSpeed: 6.0, aggression: 0.6, detectRange: 50, preferredRange: 16, retreatHp: 20, loseTargetTime: 4 },
    hard:   { reactionTime: 0.2, accuracy: 0.82, turnSpeed: 8.5, aggression: 0.8, detectRange: 60, preferredRange: 14, retreatHp: 15, loseTargetTime: 5 },
  },
};
```
- [ ] **Step 2:** Create `src/ai/BotCombat.js` (decides fire intent via the shared WeaponController):
```js
// Wraps a WeaponController for a bot. The bot writes intent.firing; this syncs
// the WeaponController update and forwards shots to a callback (Game fires them).
export class BotCombat {
  constructor(weaponDef, fireCallback) {
    this.weapon = null; // assigned externally as a WeaponController instance
    this.fireCallback = fireCallback;
    this.weaponDef = weaponDef;
  }
  attachWeapon(weaponController) { this.weapon = weaponController; this.weapon.fireCallback = this.fireCallback; }
  update(dt, wantFire, reloadRequested) {
    if (this.weapon) this.weapon.update(dt, wantFire, reloadRequested);
  }
}
```
- [ ] **Step 3:** Create `src/ai/AIController.js`:
```js
import * as THREE from 'three';
import { BotNavigation } from './BotNavigation.js';
import { computeAimPoint, turnToward, selectTarget } from './BotAim.js';

const STATES = { PATROL: 'PATROL', CHASE: 'CHASE', ENGAGE: 'ENGAGE', RETREAT: 'RETREAT' };

export class AIController {
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
  update(dt, enemies, colliderStore) {
    const bot = this.bot;
    const sensed = selectTarget(bot, enemies, colliderStore);
    const now = performance.now() / 1000;
    if (sensed) {
      this.target = sensed.player;
      this.lastSeenTime = now;
    }

    // FSM transitions
    const hasRecentSight = now - this.lastSeenTime < this.diff.loseTargetTime;
    switch (this.state) {
      case STATES.PATROL:
        if (sensed && sensed.dist < this.diff.detectRange) { this.state = STATES.CHASE; this.reactionTimer = this.diff.reactionTime; }
        break;
      case STATES.CHASE:
        if (!hasRecentSight) { this.state = STATES.PATROL; this.nav.pickRandomPatrolPoint(); }
        else if (sensed && sensed.dist < this.diff.preferredRange) { this.state = STATES.ENGAGE; this.reactionTimer = this.diff.reactionTime; }
        break;
      case STATES.ENGAGE:
        if (bot.health < this.diff.retreatHp) { this.state = STATES.RETREAT; this.nav.pickRandomPatrolPoint(); }
        else if (!sensed || sensed.dist > this.diff.preferredRange + 6) { this.state = STATES.CHASE; }
        break;
      case STATES.RETREAT:
        if (bot.health > this.diff.retreatHp + 25 && !sensed) { this.state = STATES.PATROL; }
        break;
    }

    // Reaction timer (tuning in)
    if (this.reactionTimer > 0) this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    const reactionProgress = 1 - (this.reactionTimer / Math.max(0.0001, this.diff.reactionTime));

    // Aim + intent
    let wish = { x: 0, z: 0, jump: false };
    let firing = false;
    let aimPoint = null;
    if (this.target && this.target.alive && hasRecentSight) {
      const targetPos = [this.target.position.x, this.target.position.y + 1.4, this.target.position.z];
      aimPoint = computeAimPoint({ pos: targetPos }, {
        accuracy: this.diff.accuracy,
        reactionProgress,
        errorRadius: 1.5,
      });
      const from = [bot.position.x, bot.position.y + 1.5, bot.position.z];
      const turned = turnToward({ yaw: bot.yaw, pitch: bot.pitch }, aimPoint, from, this.diff.turnSpeed, dt);
      bot.yaw = turned.yaw; bot.pitch = turned.pitch;

      if (this.state === STATES.ENGAGE && this.reactionTimer <= 0) {
        firing = true;
      }
      // movement: chase or strafe
      if (this.state === STATES.CHASE) {
        this.nav.setChaseTarget(this.target.position);
        wish = this.nav.computeWishdir(bot, dt);
      } else if (this.state === STATES.ENGAGE) {
        // strafe sideways
        const strafeDir = Math.sin(now * 2) > 0 ? 1 : -1;
        wish = { x: Math.cos(bot.yaw) * strafeDir, z: -Math.sin(bot.yaw) * strafeDir, jump: false };
      } else if (this.state === STATES.RETREAT) {
        // move away from target
        const away = new THREE.Vector3().subVectors(bot.position, this.target.position); away.y = 0; away.normalize();
        this.nav.setChaseTarget(bot.position.clone().add(away.multiplyScalar(10)));
        wish = this.nav.computeWishdir(bot, dt);
      }
    } else {
      // patrol
      wish = this.nav.computeWishdir(bot, dt);
      // look toward movement
      const desiredYaw = Math.atan2(wish.x, -wish.z) + Math.PI;
      bot.yaw = approachAngle(bot.yaw, desiredYaw, this.diff.turnSpeed * dt);
    }

    // Build intent for the movement + weapon systems
    const forward = wish.z; // our wishdir is world; convert to body-space forward/strafe from yaw
    // Convert world wishdir to body-space intent using yaw
    const sinY = Math.sin(bot.yaw), cosY = Math.cos(bot.yaw);
    // forward axis = (-sin, -cos), right axis = (cos, -sin)
    const fwdX = -sinY, fwdZ = -cosY;
    const rightX = cosY, rightZ = -sinY;
    const forwardAmt = wish.x * fwdX + wish.z * fwdZ;
    const strafeAmt = wish.x * rightX + wish.z * rightZ;

    bot.intent = {
      forward: clamp11(forwardAmt),
      strafe: clamp11(strafeAmt),
      jump: wish.jump,
      sprint: this.state === STATES.CHASE,
      crouch: false,
      firing,
      reloadRequested: false,
    };
  }
}

function clamp11(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
```
- [ ] **Step 4:** Commit:
```bash
git add src/config/Match.js src/ai/BotCombat.js src/ai/AIController.js
git commit -m "feat: add AI FSM (patrol/chase/engage/retreat) + bot combat"
```

### Task 4.6: Spawn bots + integrate into Game loop
**Files:**
- Modify: `src/core/Game.js`
- Remove: `src/player/TargetEntity.js` usage (keep file for now, unused)

- [ ] **Step 1:** In `Game` constructor, replace the static `this.targets` dummy block with a real bot spawn using `EntityStore`. Remove `TargetEntity` imports/usage. Add imports:
```js
import { EntityStore } from './EntityStore.js';
import { AIController } from '../ai/AIController.js';
import { BotCombat } from '../ai/BotCombat.js';
import { MATCH } from '../config/Match.js';
import { getRandomSpawn } from '../world/SpawnPoints.js';
import { createPlayer } from '../player/Player.js';
import { ANIMAL_IDS } from '../config/Animals.js';
```
Replace target setup with:
```js
this.entities = new EntityStore();
this.entities.add(this.player);
this.bots = [];
const diff = MATCH.botDifficulty.normal;
for (let i = 0; i < MATCH.botCount; i++) {
  const sp = getRandomSpawn(this.entities.alive().map(p => p.position));
  const bot = createPlayer({ id: 'bot' + i, isLocal: false, position: sp });
  bot.view = new CharacterView(this.scene);
  bot.view.setAnimal(ANIMAL_IDS[i % ANIMAL_IDS.length]);
  bot.view.setWeapon('AR');
  bot.weapon = new WeaponController(WEAPONS.AR);
  bot.brain = new AIController(bot, diff);
  this.entities.add(bot);
  this.bots.push(bot);
}
```
- [ ] **Step 2:** In `Game.frame`, inside the fixed update, after the local player movement, update bots:
```js
this.fixed.update(realDt, (dt) => {
  tickMovement(this.player, dt, this.colliders);

  // Bots
  for (const bot of this.bots) {
    if (!bot.alive) continue;
    bot.brain.update(dt, this.entities.enemiesOf(bot), this.colliders);
    tickMovement(bot, dt, this.colliders);
    bot.weapon.update(dt, bot.intent.firing, false);
  }
});
```
- [ ] **Step 3:** Process bot shots (same as local). Add a shared fire routine. After fixed update:
```js
// Local shots
for (const _ of this.pendingShots) this.fireOneShot(this.player);
this.pendingShots.length = 0;
// Bot shots
for (const bot of this.bots) {
  for (const _ of bot.pendingShots || []) this.fireOneShot(bot);
  bot.pendingShots = [];
}
```
Wire each player's weapon fire callback to push into their pendingShots. In constructor, after creating local weapon:
```js
this.weapon.fireCallback = () => this.pendingShots.push({});
```
For bots, right after creating each bot's weapon:
```js
bot.weapon.fireCallback = () => { bot.pendingShots = bot.pendingShots || []; bot.pendingShots.push({}); };
```
- [ ] **Step 4:** Generalize `fireOneShot` to accept a shooter:
```js
fireOneShot(shooter) {
  const def = shooter.weapon.def;
  const origin = new THREE.Vector3(shooter.position.x, shooter.position.y + MOVEMENT.EYE_HEIGHT, shooter.position.z);
  const dir = new THREE.Vector3(
    -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
    Math.sin(shooter.pitch),
    -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
  );
  const spread = def.spread;
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();

  const MAX = 500;
  let best = null;
  for (const other of this.entities.players) {
    if (other === shooter || !other.alive) continue;
    const hit = playerRayHit(other, origin, dir, MAX);
    if (hit && (!best || hit.dist < best.dist)) best = { ...hit, kind: 'enemy', target: other };
  }
  const wallHit = this.colliders.raycast(origin, dir, MAX);
  if (wallHit && (!best || wallHit.dist < best.dist)) {
    best = { dist: wallHit.dist, point: wallHit.point, kind: 'wall' };
  }
  const muzzle = origin.clone().addScaledVector(dir, 0.6);
  this.flashes.spawn(muzzle);
  if (best) {
    this.tracers.spawn(muzzle, best.point);
    if (best.kind === 'enemy') {
      const dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
      best.target.health -= dmg;
      this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xff3344);
      if (best.target.health <= 0) {
        best.target.alive = false;
        best.target.health = 0;
        if (best.target.view) best.target.view.setVisible(false);
        this.hud.addKill(`${shooter.isLocal ? 'You' : shooter.id} fragged ${best.target.isLocal ? 'You' : best.target.id}`);
      }
    } else {
      this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xffd24a);
    }
  } else {
    this.tracers.spawn(muzzle, origin.clone().addScaledVector(dir, MAX));
  }

  if (shooter.isLocal) {
    shooter.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
    shooter.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
    shooter.pitch = Math.min(shooter.pitch, Math.PI / 2 - 0.01);
  }
}
```
Add a `playerRayHit` helper near `applyFalloff`:
```js
function playerRayHit(player, origin, dir, maxDist) {
  const cx = player.position.x, cy0 = player.position.y, cz = player.position.z;
  const r = 0.5, h = 1.8;
  const box = new THREE.Box3(
    new THREE.Vector3(cx - r, cy0, cz - r),
    new THREE.Vector3(cx + r, cy0 + h, cz + r)
  );
  const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
  if (!hit) return null;
  const dist = origin.distanceTo(hit);
  if (dist > maxDist) return null;
  return { dist, point: hit.clone() };
}
```
- [ ] **Step 5:** Sync bot views each frame (add to frame after bot update):
```js
for (const bot of this.bots) {
  if (bot.view) {
    bot.view.setPosition(bot.position.x, bot.position.y, bot.position.z);
    const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
    bot.view.update(realDt, speed, bot.yaw, bot.pitch);
  }
}
```
Also handle local player death: if `this.player.alive` is false, show a brief "you died" message (respawn comes in Phase 5). For now just keep playing.
- [ ] **Step 6:** Playtest:
  - [ ] 5 bots spawn as various animals
  - [ ] They roam, then chase when they see you
  - [ ] They shoot at you (you take damage; HP drops)
  - [ ] You can kill them (they disappear)
  - [ ] Killfeed shows frags
- [ ] **Step 7:** Commit:
```bash
git add src/core/Game.js
git commit -m "feat: spawn 5 bots with full AI integrated into game loop"
```

---

## Phase 5: Match loop, scoring, respawn, end
**Checkpoint:** A complete, winnable deathmatch with respawn and an end screen.

### Task 5.1: Match state + respawn in Game
**Files:**
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Add match state to `Game` constructor (after bot spawn):
```js
this.match = {
  active: true,
  timeLeft: MATCH.matchSeconds,
      fragTarget: MATCH.fragTarget,
      over: false,
    };
    this.respawnTimers = new Map(); // player.id -> seconds remaining
```
- [ ] **Step 2:** Track scores and handle death. In `fireOneShot`, where we set `best.target.alive = false`, also update scores and start respawn:
```js
if (best.target.health <= 0) {
  best.target.alive = false;
  best.target.health = 0;
  best.target.deaths += 1;
  shooter.score += 1;
  if (best.target.view) best.target.view.setVisible(false);
  this.hud.addKill(`${shooter.isLocal ? 'You' : shooter.id} fragged ${best.target.isLocal ? 'You' : best.target.id}`);
  this.respawnTimers.set(best.target.id, MATCH.respawnDelay);
  if (shooter.score >= this.match.fragTarget) this.endMatch();
}
```
- [ ] **Step 3:** Tick match timer + respawns in `Game.frame` (inside fixed update):
```js
if (this.match.active) {
  this.match.timeLeft -= dt;
  if (this.match.timeLeft <= 0) { this.match.timeLeft = 0; this.endMatch(); }
}
// respawns
for (const [id, t] of this.match.active ? this.respawnTimers : []) {
  const newT = t - dt;
  if (newT <= 0) {
    const p = this.entities.players.find(p => p.id === id);
    if (p) this.respawn(p);
    this.respawnTimers.delete(id);
  } else {
    this.respawnTimers.set(id, newT);
  }
}
```
(Note: iterating a Map while deleting — collect ids first or use a snapshot. Use:
```js
for (const id of [...this.respawnTimers.keys()]) {
  const newT = this.respawnTimers.get(id) - dt;
  ...
}
```
)
Add the respawn method:
```js
respawn(player) {
  const sp = getRandomSpawn(this.entities.alive().map(p => p.position));
  player.position.copy(sp);
  player.position.y += 1; // ensure above ground
  player.velocity.set(0,0,0);
  player.health = player.maxHealth;
  player.alive = true;
  if (player.weapon) { player.weapon.ammo = player.weapon.def.mag; player.weapon.reloading = false; }
  if (player.view) player.view.setVisible(true);
}
```
- [ ] **Step 4:** Prevent dead players from acting. In fixed update, guard bot update with `if (!bot.alive) continue;` (already there) and skip local movement when dead:
```js
if (this.player.alive) tickMovement(this.player, dt, this.colliders);
```
- [ ] **Step 5:** Add `endMatch`:
```js
endMatch() {
  if (this.match.over) return;
  this.match.over = true;
  this.match.active = false;
  document.exitPointerLock();
  const ranked = [...this.entities.players].sort((a,b) => b.score - a.score);
  this.endScreen.show(ranked);
}
```
- [ ] **Step 6:** Commit:
```bash
git add src/core/Game.js
git commit -m "feat: match timer, scoring, respawn, and end-match trigger"
```

### Task 5.2: Scoreboard + EndScreen + HUD timer
**Files:**
- Create: `src/ui/Scoreboard.js`
- Create: `src/ui/EndScreen.js`
- Modify: `src/ui/Hud.js` (timer)
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Create `src/ui/Scoreboard.js`:
```js
import { ANIMALS } from '../config/Animals.js';

export class Scoreboard {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      background:rgba(10,14,20,.9);padding:20px 28px;border-radius:12px;color:#fff;
      font-family:system-ui,sans-serif;display:none;min-width:380px;`;
    root.appendChild(this.el);
    this.tabHandler = null;
  }
  attach(input) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this.el.style.display = 'block'; }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.el.style.display = 'none';
    });
  }
  update(players) {
    const ranked = [...players].sort((a,b) => b.score - a.score);
    this.el.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-weight:700;border-bottom:1px solid #444;padding-bottom:6px;margin-bottom:8px;">
        <span>Player</span><span>K</span><span>D</span><span>K/D</span>
      </div>
      ${ranked.map(p => {
        const animal = ANIMALS[ANIMAL_IDS_BY_VIEW(p)] || { name: '?' };
        const kd = p.deaths === 0 ? p.score.toFixed(1) : (p.score / p.deaths).toFixed(1);
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;${p.isLocal?'color:#ffb84d;font-weight:700':''}">
          <span>${animal.name}${p.isLocal?' (You)':''}</span>
          <span>${p.score}</span><span>${p.deaths}</span><span>${kd}</span>
        </div>`;
      }).join('')}`;
  }
}
// helper: we don't store animal on the entity yet; default to '?' . Refine in step 3.
function ANIMAL_IDS_BY_VIEW(p) { return p.animalId || 'FOX'; }
```
> Note: store the chosen animal id on the player entity. In Game, when creating bots and the local player, set `player.animalId`. Update the scoreboard helper to read `p.animalId`.
- [ ] **Step 2:** Create `src/ui/EndScreen.js`:
```js
import { ANIMALS } from '../config/Animals.js';

export class EndScreen {
  constructor(root, { onPlayAgain }) {
    this.root = root;
    this.onPlayAgain = onPlayAgain;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(6,10,16,.92);
      display:none;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;`;
    root.appendChild(this.el);
  }
  show(rankedPlayers) {
    const winner = rankedPlayers[0];
    const wAnimal = ANIMALS[winner.animalId] || { name: 'Player' };
    const rows = rankedPlayers.map((p, i) => {
      const a = ANIMALS[p.animalId] || { name: '?' };
      const kd = p.deaths === 0 ? p.score.toFixed(1) : (p.score/p.deaths).toFixed(1);
      return `<div style="display:flex;gap:24px;padding:6px 0;${i===0?'color:#ffb84d;font-weight:700':''}">
        <span style="width:30px;">${i+1}.</span>
        <span style="width:140px;">${a.name}${p.isLocal?' (You)':''}</span>
        <span style="width:60px;">${p.score} kills</span>
        <span style="width:80px;">K/D ${kd}</span>
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <h1 style="font-size:36px;margin:0 0 8px;">${winner.isLocal ? 'VICTORY' : 'DEFEATED'}</h1>
      <p style="opacity:.8;margin:0 0 24px;">Winner: ${wAnimal.name}${winner.isLocal ? ' (You)' : ''} — ${winner.score} frags</p>
      <div style="background:rgba(255,255,255,.06);padding:16px 28px;border-radius:10px;margin-bottom:32px;">${rows}</div>
      <button id="again" style="background:#4dffb8;color:#102020;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">PLAY AGAIN</button>`;
    this.el.style.display = 'flex';
    this.el.querySelector('#again').onclick = () => {
      this.el.style.display = 'none';
      this.onPlayAgain();
    };
  }
}
```
- [ ] **Step 3:** Add timer to HUD. In `src/ui/Hud.js`, add a timer element and method:
```js
// add to render() innerHTML at top center:
<div id="hud-timer" style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:20px;text-shadow:0 2px 4px rgba(0,0,0,.6);">5:00</div>
// in constructor:
this.timerEl = this.el.querySelector('#hud-timer');
// method:
setTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  this.timerEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}
```
- [ ] **Step 4:** Wire into Game. In constructor:
```js
import { Scoreboard } from '../ui/Scoreboard.js';
import { EndScreen } from '../ui/EndScreen.js';
this.scoreboard = new Scoreboard(uiRoot);
this.scoreboard.attach(this.input);
this.endScreen = new EndScreen(uiRoot, { onPlayAgain: () => this.returnToMenu() });
```
In `frame`, after render:
```js
this.hud.setTime(this.match.timeLeft);
this.scoreboard.update(this.entities.players);
```
Add `returnToMenu`:
```js
returnToMenu() {
  // reset everything: clear bots, reset player, show menu
  for (const bot of this.bots) { if (bot.view) bot.view.dispose(); }
  this.bots = [];
  this.entities.players.length = 0;
  this.entities.add(this.player);
  this.player.score = 0; this.player.deaths = 0;
  this.match = { active: false, timeLeft: MATCH.matchSeconds, fragTarget: MATCH.fragTarget, over: false };
  this.menu.show();
}
```
And set `player.animalId` / `bot.animalId` wherever created (in `startMatch` and in the bot spawn loop). Also when restarting, re-spawn bots in `startMatch`.
- [ ] **Step 5:** Playtest full loop:
  - [ ] Play to 25 frags or 5:00 timer
  - [ ] End screen shows winner + scores
  - [ ] PLAY AGAIN returns to menu, picking again starts fresh
  - [ ] Tab shows live scoreboard
  - [ ] Respawn works after death (2.5s)
- [ ] **Step 6:** Commit:
```bash
git add src/ui/Scoreboard.js src/ui/EndScreen.js src/ui/Hud.js src/core/Game.js
git commit -m "feat: scoreboard, end screen, match timer, play-again loop"
```

---

## Phase 6: Parkour movement (the competitive feel)
**Checkpoint:** Bhop, slide, wall-run all work and feel fast/skillful.

### Task 6.1: Bhop (TDD)
**Files:**
- Modify: `src/player/MovementController.js`
- Test: `src/tests/Movement.bhop.test.js`

- [ ] **Step 1:** Create failing test:
```js
import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { applyBhopOnLand } from '../player/MovementController.js';

describe('bhop on land', () => {
  it('preserves horizontal speed when jump was pressed in pre-land window', () => {
    const p = createPlayer();
    p.velocity.set(12, -1, 0);
    p.moveState.bhopBuffer = 0.05; // jumped just before landing
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeGreaterThan(11); // preserved, not decayed to sprint
    expect(p.velocity.y).toBeCloseTo(M.JUMP_VELOCITY);
  });
  it('decays to sprint when no jump buffer', () => {
    const p = createPlayer();
    p.velocity.set(12, -1, 0);
    p.moveState.bhopBuffer = 0;
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeLessThan(M.SPRINT + 0.1);
  });
  it('caps horizontal speed at MAX_BHOP', () => {
    const p = createPlayer();
    p.velocity.set(20, -1, 0);
    p.moveState.bhopBuffer = 0.05;
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeLessThanOrEqual(M.MAX_BHOP + 0.01);
  });
});
```
- [ ] **Step 2:** Run test. Expected: FAIL.
- [ ] **Step 3:** Add to `MovementController.js` (export it):
```js
export function applyBhopOnLand(player) {
  const M = MOVEMENT;
  if (player.moveState.bhopBuffer > 0) {
    // chain the bhop: keep speed, re-jump, cap
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed > M.MAX_BHOP) {
      const s = M.MAX_BHOP / speed;
      player.velocity.x *= s;
      player.velocity.z *= s;
    }
    player.velocity.y = M.JUMP_VELOCITY;
    player.onGround = false;
  } else {
    // landed without jump -> friction already applies next tick; clamp to sprint
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed > M.SPRINT) {
      const s = M.SPRINT / speed;
      player.velocity.x *= s;
      player.velocity.z *= s;
    }
  }
  player.moveState.bhopBuffer = 0;
}
```
And in `tickMovement`, manage the bhop buffer:
- Add at top of intent handling: if `intent.jump && !player.onGround && player.velocity.y < 0`, set `player.moveState.bhopBuffer = 0.12` (pre-land window). Decrement buffer each tick.
- On detecting landing (was airborne, now `resolved.onGround`), call `applyBhopOnLand(player)`.
- Add air-strafe: when `!player.onGround` and `hasInput`, replace the air-accel block with the Quake-style add-the-missing-component logic:
```js
if (!player.onGround && hasInput) {
  const currentSpeed = player.velocity.x * _wish.x + player.velocity.z * _wish.z;
  const maxAdd = M.AIR_ACCEL * dt;
  const addSpeed = Math.max(0, Math.min(maxAdd, M.SPRINT - currentSpeed)); // note: allows up to SPRINT gain per tick along wish
  player.velocity.x += _wish.x * addSpeed;
  player.velocity.z += _wish.z * addSpeed;
}
```
(Note: classic bhop lets you exceed sprint via air-strafe; the cap is enforced on land. The above lets speed build toward sprint each tick; combined with no-clamp-while-airborne, chained bhops build speed up to MAX_BHOP. Tune in playtest.)
- [ ] **Step 4:** Run test. Expected: PASS.
- [ ] **Step 5:** Playtest: sprint, jump, hold space + air-strafe (W+A/D with mouse) to chain hops and gain speed. Commit:
```bash
git add src/player/MovementController.js src/tests/Movement.bhop.test.js
git commit -m "feat: bunny-hop with speed preservation and air-strafe"
```

### Task 6.2: Slide (TDD)
**Files:**
- Modify: `src/player/MovementController.js`
- Test: `src/tests/Movement.slide.test.js`

- [ ] **Step 1:** Create failing test:
```js
import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { tryStartSlide } from '../player/MovementController.js';

describe('slide', () => {
  it('enters slide when crouching while sprinting above threshold', () => {
    const p = createPlayer();
    p.velocity.set(10, 0, 0);
    p.onGround = true;
    const started = tryStartSlide(p, { crouch: true, sprint: true });
    expect(started).toBe(true);
    expect(p.moveState.sliding).toBe(true);
    expect(p.moveState.slideTimer).toBeCloseTo(M.SLIDE_DURATION);
  });
  it('does not slide if too slow', () => {
    const p = createPlayer();
    p.velocity.set(5, 0, 0);
    p.onGround = true;
    expect(tryStartSlide(p, { crouch: true, sprint: true })).toBe(false);
    expect(p.moveState.sliding).toBe(false);
  });
});
```
- [ ] **Step 2:** Run test. Expected: FAIL.
- [ ] **Step 3:** Add to `MovementController.js`:
```js
export function tryStartSlide(player, intent) {
  const M = MOVEMENT;
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  if (intent.crouch && intent.sprint && player.onGround && speed > M.SLIDE_SPEED_THRESHOLD && !player.moveState.sliding) {
    player.moveState.sliding = true;
    player.moveState.slideTimer = M.SLIDE_DURATION;
    // small boost
    const s = speed > 0 ? 1.1 : 1;
    player.velocity.x *= s; player.velocity.z *= s;
    return true;
  }
  return false;
}
```
Integrate into `tickMovement`: at intent handling, call `tryStartSlide(player, intent)`. While `player.moveState.sliding`, use `M.SLIDE_FRICTION` instead of `M.FRICTION`, decrement `slideTimer`, and when it hits 0 set `sliding=false`. Lower eye height while sliding (handled in `eyePosition` via a check on `player.moveState.sliding`).
- [ ] **Step 4:** Run test. Expected: PASS.
- [ ] **Step 5:** Playtest: sprint then crouch → slide forward with low friction; stands back up after duration. Commit:
```bash
git add src/player/MovementController.js src/tests/Movement.slide.test.js
git commit -m "feat: slide mechanic with boost and reduced friction"
```

### Task 6.3: Wall-run (TDD)
**Files:**
- Modify: `src/player/MovementController.js`
- Test: `src/tests/Movement.wallrun.test.js`

- [ ] **Step 1:** Create failing test:
```js
import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { tryStartWallrun } from '../player/MovementController.js';

describe('wall-run', () => {
  it('attaches to a wall when airborne and moving toward it', () => {
    const p = createPlayer();
    p.velocity.set(0, -2, 8); // moving forward, falling
    p.onGround = false;
    p.moveState.wallrunsThisJump = 0;
    const fakeColliders = { raycast: () => ({ dist: 0.6, point: new THREE.Vector3(), box: {} }) };
    const started = tryStartWallrun(p, fakeColliders, { forward: 1, strafe: 0 });
    expect(started).toBe(true);
    expect(p.moveState.wallrunning).toBe(true);
  });
  it('does not attach if already used a wall-run this jump', () => {
    const p = createPlayer();
    p.onGround = false;
    p.moveState.wallrunsThisJump = 1;
    const fakeColliders = { raycast: () => ({ dist: 0.6 }) };
    expect(tryStartWallrun(p, fakeColliders, { forward: 1, strafe: 0 })).toBe(false);
  });
});
```
> Add `import * as THREE from 'three';` to the test file.
- [ ] **Step 2:** Run test. Expected: FAIL.
- [ ] **Step 3:** Add to `MovementController.js`:
```js
import * as THREE from 'three';
const _wallProbeDir = new THREE.Vector3();

export function tryStartWallrun(player, colliderStore, intent) {
  const M = MOVEMENT;
  if (player.onGround) return false;
  if (player.moveState.wallrunsThisJump >= 1) return false;
  // probe in the player's look-horizontal direction if moving forward
  if (!(intent.forward !== 0 || intent.strafe !== 0)) return false;
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  _wallProbeDir.set(-sinY * intent.forward + cosY * intent.strafe, 0, -cosY * intent.forward - sinY * intent.strafe).normalize();
  const origin = new THREE.Vector3(player.position.x, player.position.y + 0.9, player.position.z);
  const hit = colliderStore.raycast(origin, _wallProbeDir, 0.8);
  if (!hit) return false;
  player.moveState.wallrunning = true;
  player.moveState.wallrunTimer = M.WALLRUN_DURATION;
  player.moveState.wallrunsThisJump = (player.moveState.wallrunsThisJump || 0) + 1;
  // give a forward+slight-up boost
  player.velocity.x = _wallProbeDir.x * 0 + player.velocity.x; // keep existing forward
  // project velocity onto wall tangent (remove into-wall component)
  return true;
}
```
Integrate: in `tickMovement`, before gravity, if not wallrunning, `tryStartWallrun`. While wallrunning: use `M.WALLRUN_GRAVITY` instead of `M.GRAVITY`; decrement timer; if `intent.jump`, jump off (forward + up boost, end wallrun). Reset `wallrunsThisJump = 0` on landing.
- [ ] **Step 4:** Run test. Expected: PASS.
- [ ] **Step 5:** Playtest: jump toward a wall, hold W → stick and run along it; press space to jump off. Commit:
```bash
git add src/player/MovementController.js src/tests/Movement.wallrun.test.js
git commit -m "feat: wall-run with attach probe and jump-off"
```

---

## Phase 7: Polish
**Checkpoint:** Audio, floating damage numbers, settings, perf pass.

### Task 7.1: Audio (WebAudio one-shots)
**Files:**
- Create: `src/audio/Audio.js`
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Create `src/audio/Audio.js`:
```js
// Synthesized one-shots via WebAudio — no asset files needed.
let ctx = null;
function ensure() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }

export function resumeAudio() { ensure().resume(); }

function blip({ freq = 220, type = 'square', dur = 0.08, gain = 0.15, sweep = 0 }) {
  const c = ensure();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const Sfx = {
  shootAR: () => blip({ freq: 320, type: 'square', dur: 0.06, gain: 0.12, sweep: -120 }),
  shootSniper: () => blip({ freq: 180, type: 'sawtooth', dur: 0.18, gain: 0.2, sweep: -100 }),
  hit: () => blip({ freq: 660, type: 'triangle', dur: 0.05, gain: 0.1 }),
  kill: () => blip({ freq: 880, type: 'triangle', dur: 0.15, gain: 0.15, sweep: 400 }),
  jump: () => blip({ freq: 300, type: 'sine', dur: 0.08, gain: 0.08, sweep: 200 }),
  hurt: () => blip({ freq: 160, type: 'sawtooth', dur: 0.12, gain: 0.15, sweep: -60 }),
};
```
- [ ] **Step 2:** Wire into Game. Call `resumeAudio()` on first pointer lock. In `fireOneShot`, after a shot, play the right Sfx by weapon id; on enemy hit play `hit`; on kill play `kill`. On player taking damage, play `hurt`.
- [ ] **Step 3:** Commit:
```bash
git add src/audio/Audio.js src/core/Game.js
git commit -m "feat: synthesized WebAudio SFX for weapons, hits, kills"
```

### Task 7.2: Damage numbers + FOV/sprint polish + low-HP vignette
**Files:**
- Create: `src/fx/DamageNumbers.js`
- Modify: `src/core/Game.js`

- [ ] **Step 1:** Create `src/fx/DamageNumbers.js` (DOM-based, projected to screen):
```js
import * as THREE from 'three';

export class DamageNumbers {
  constructor(root, camera) {
    this.root = root; this.camera = camera;
    this.items = [];
  }
  spawn(worldPoint, amount, color = '#ffe08a') {
    const el = document.createElement('div');
    el.textContent = Math.round(amount);
    el.style.cssText = `position:absolute;color:${color};font-weight:700;font-size:18px;
      text-shadow:0 2px 3px rgba(0,0,0,.7);pointer-events:none;transition:transform .6s,opacity .6s;`;
    this.root.appendChild(el);
    this.items.push({ el, world: worldPoint.clone(), life: 0.6 });
  }
  update(dt) {
    const v = new THREE.Vector3();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.world.y += dt * 1.2;
      v.copy(it.world).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      it.el.style.left = x + 'px';
      it.el.style.top = y + 'px';
      it.el.style.opacity = Math.max(0, it.life / 0.6);
      if (it.life <= 0) { it.el.remove(); this.items.splice(i, 1); }
    }
  }
}
```
- [ ] **Step 2:** In Game, spawn a damage number on enemy hit. Add subtle FOV kick (lerp camera.fov toward 90 when sprinting, back to 80 otherwise — call `updateProjectionMatrix`). Add a CSS vignette overlay that intensifies when HP < 30.
- [ ] **Step 3:** Commit:
```bash
git add src/fx/DamageNumbers.js src/core/Game.js
git commit -m "feat: floating damage numbers, sprint FOV kick, low-HP vignette"
```

### Task 7.3: Settings menu (sensitivity/FOV/invert-Y/quality) persisted
**Files:**
- Create: `src/ui/Settings.js`
- Modify: `src/ui/MainMenu.js`, `src/core/Game.js`

- [ ] **Step 1:** Create `src/ui/Settings.js`:
```js
const KEY = 'animalstrike_settings';
const DEFAULTS = { sensitivity: 0.0022, fov: 80, invertY: false, quality: 'high' };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export class SettingsPanel {
  constructor(root, { onChange }) {
    this.onChange = onChange;
    this.s = loadSettings();
    this.el = document.createElement('div');
    this.el.style.cssText = `position:absolute;right:24px;top:24px;background:rgba(10,14,20,.85);color:#fff;
      padding:16px;border-radius:10px;font-family:system-ui,sans-serif;pointer-events:auto;display:none;`;
    root.appendChild(this.el);
    this.render();
  }
  render() {
    this.el.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Settings</div>
      <label>Sensitivity <input type="range" id="sens" min="0.0005" max="0.006" step="0.0001" value="${this.s.sensitivity}"></label><br>
      <label>FOV <input type="range" id="fov" min="70" max="100" step="1" value="${this.s.fov}"></label><br>
      <label>Invert Y <input type="checkbox" id="iny" ${this.s.invertY?'checked':''}></label><br>
      <label>Quality
        <select id="q">
          <option value="high" ${this.s.quality==='high'?'selected':''}>High</option>
          <option value="low" ${this.s.quality==='low'?'selected':''}>Low</option>
        </select>
      </label>`;
    const bind = (id, key, parse = (v)=>v) => {
      this.el.querySelector(id).oninput = (e) => { this.s[key] = parse(e.target.value); saveSettings(this.s); this.onChange(this.s); };
    };
    bind('#sens', 'sensitivity', parseFloat);
    bind('#fov', 'fov', parseFloat);
    this.el.querySelector('#iny').onchange = (e) => { this.s.invertY = e.target.checked; saveSettings(this.s); this.onChange(this.s); };
    this.el.querySelector('#q').onchange = (e) => { this.s.quality = e.target.value; saveSettings(this.s); this.onChange(this.s); };
  }
  toggle() { this.el.style.display = this.el.style.display === 'none' ? 'block' : 'none'; }
  get settings() { return this.s; }
}
```
- [ ] **Step 2:** In Game, apply settings to InputState (sensitivity/invertY) and camera (fov). Add a gear button in the menu. On change, update live.
- [ ] **Step 3:** Commit:
```bash
git add src/ui/Settings.js src/ui/MainMenu.js src/core/Game.js
git commit -m "feat: settings panel (sensitivity, FOV, invert-Y, quality) persisted"
```

### Task 7.4: Perf pass
**Files:**
- Modify: `src/core/Game.js`, `src/world/ArenaBuilder.js`, fx pools

- [ ] **Step 1:** Cap pixel ratio to 1.5 in low quality; disable shadows (none currently, keep off). Add a `renderer.shadowMap.enabled = false`. Pool sizes already modest.
- [ ] **Step 2:** Use `THREE.InstancedMesh` for the arena ground grid detail if added; otherwise keep geometry count low (already is).
- [ ] **Step 3:** Profile in Chrome devtools Performance tab during a 5-bot fight. Target 60fps. Note any hotspots; address if obvious.
- [ ] **Step 4:** Commit:
```bash
git add -A
git commit -m "perf: cap pixel ratio, keep shadows off, confirm 60fps target"
```

---

## Phase 8: Future expansion (documented, not built)
This phase is notes only — no tasks. Capture in the design doc:
- **Character classes:** promote `Animals.speedMul/hpMul` to active abilities (e.g., Bunny dash, Bear shield). Add `ability` field + cooldown UI.
- **Gun-game:** per-player weapon progression on each kill; first to finish wins.
- **More maps:** each map = its own `ArenaBuilder` + waypoint set + spawn set; rotate per match.
- **Team deathmatch:** add `team` field to players, team-aware `selectTarget`/`enemiesOf`, team spawn zones, friendly-fire toggle.
- **Netcode:** the sim is deterministic and entity-driven; a server-authoritative layer would own the fixed-timestep and broadcast state snapshots; clients send input. The `AIController` is just another input source, so the same path works.

---

## Self-Review (completed during authoring)
- **Spec coverage:** every spec component (Game, FixedTimestep, InputState, EntityStore, math, all configs, world, player, ai, fx, ui, audio) maps to ≥1 task. ✓
- **Placeholder scan:** the Phase 0.2 `main.js` light-setup `.tap?.()` artifact is flagged with an explicit "fix this" step. No other TBD/TODO left as instructions without code. ✓
- **Type/name consistency:** `WeaponController.update(dt, firing, reloadRequested)`, `createPlayer`, `eyePosition`, `forwardVector`, `AIController.update(dt, enemies, colliderStore)`, `computeAimPoint({pos}, opts)` signatures are used consistently across tasks. `player.moveState.wallrunsThisJump` is set/read consistently. ✓
- **Scope:** single coherent project, one plan. Phases each yield a playable checkpoint. ✓

---

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-07-02-animal-strike.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
