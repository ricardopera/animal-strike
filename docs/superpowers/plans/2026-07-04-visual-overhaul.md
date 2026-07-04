# Heavy Visual Overhaul (Weapons + Skins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all 5 weapons from rounded primitives (no more all-box guns), add generated PBR weapon-skin textures, give each of the 7 animals a distinct generated skin texture, and polish character head detail — a heavy visual upgrade with zero gameplay changes.

**Architecture:** A shared `WeaponParts` factory of rounded primitives (cylinders, capsules, toruses, beveled bodies) used by both the FP viewmodel and the TP bot gun. An `AssetLoader` lazily applies generated PNG skin textures (from creative-minimax) over procedural fallbacks. Per-animal skin textures replace the shared procedural fur.

**Tech Stack:** three.js r0.185 (CylinderGeometry/CapsuleGeometry/TorusGeometry/LatheGeometry), Vite (serves `public/textures/`), creative-minimax subagent (generates skin PNGs), Vitest (smoke tests).

**Design spec:** `docs/superpowers/specs/2026-07-04-visual-overhaul-design.md`

---

## File Structure

```
public/textures/                 NEW — generated PNG assets
├── weapons/                     gunmetal.png, tactical_camo.png, worn_steel.png, wood_stock.png
└── skins/                       fox.png, wolf.png, panda.png, tiger.png, bear.png, bunny.png, owl.png
src/textures/
└── AssetLoader.js               NEW — TextureLoader cache + non-blocking loadOrFallback
src/player/
├── WeaponParts.js               NEW — shared rounded-part factory + material library
├── FirstPersonView.js           REWRITE builders — compose WeaponParts, drop makeBody/box-only
├── CharacterView.js             MODIFY — per-animal skins via AssetLoader, head polish, rich TP gun
└── (Animals.js via CharacterView — skin id lookup)
src/tests/
└── WeaponParts.test.js          NEW — smoke test: factory exports + parts are non-box geometries
```

---

## Task 1: AssetLoader (non-blocking texture loader)

A thin `TextureLoader` cache. Browser-only (uses `Image`); never imported by sim/server.

**Files:** Create `src/textures/AssetLoader.js`

- [ ] **Step 1: Create AssetLoader.js**

```js
import * as THREE from 'three';

// Browser-only lazy texture loader. Caches results by path so repeated lookups
// are free. Never imported by the sim/server (those don't render).
const _loader = new THREE.TextureLoader();
const _cache = new Map();          // path -> { tex, prom }
const _pending = new Map();        // path -> Promise

// Returns a cached texture immediately if loaded, else null. Triggers a load
// in the background (use loadOrFallback to auto-apply when ready).
export function getCached(path) {
  const e = _cache.get(path);
  return e && e.loaded ? e.tex : null;
}

// load(path) → Promise<THREE.Texture|null>. Resolves null on error (never rejects),
// so callers can treat a missing asset as "use fallback".
export function load(path) {
  if (_pending.has(path)) return _pending.get(path);
  const prom = new Promise((resolve) => {
    _loader.load(
      path,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        _cache.set(path, { tex, loaded: true });
        _pending.delete(path);
        resolve(tex);
      },
      undefined,
      () => { _pending.delete(path); resolve(null); }   // missing asset → null (use fallback)
    );
  });
  _pending.set(path, prom);
  return prom;
}

// loadOrFallback(path, material, fallbackColor): apply the texture to material.map
// when it arrives (and set material.needsUpdate). Until then material keeps its
// current flat look. Safe to call every build — the load is cached.
export function loadOrFallback(path, material) {
  const cached = getCached(path);
  if (cached) { material.map = cached; material.needsUpdate = true; return; }
  load(path).then((tex) => {
    if (tex && material) { material.map = tex; material.needsUpdate = true; }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/textures/AssetLoader.js
git commit -m "feat(textures): AssetLoader — non-blocking TextureLoader cache with fallback"
```

---

## Task 2: WeaponParts — shared rounded-part factory + material library

The core of the overhaul. Exports both a set of part builders and a shared material library. Used by both FP and TP gun builders.

**Files:** Create `src/player/WeaponParts.js`; Test: `src/tests/WeaponParts.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/WeaponParts.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// WeaponParts imports TextureFactory transitively? No — it's pure geometry +
// MeshStandardMaterial (no canvas). So it loads cleanly in node. But it imports
// AssetLoader which uses THREE.TextureLoader (needs document/Image). Stub first.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = { createElement: () => ({ width:0, height:0, getContext: () => ({}) }) };
  }
  if (typeof globalThis.Image === 'undefined') globalThis.Image = class {};
});

const WP = await import('../player/WeaponParts.js');

describe('WeaponParts factory', () => {
  it('exports the expected part builders', () => {
    for (const fn of ['barrel', 'beveledBody', 'curvedGrip', 'scopeTube', 'scopeRing',
                      'magCurve', 'muzzleDevice', 'stock', 'triggerGuard', 'rail']) {
      expect(typeof WP[fn]).toBe('function');
    }
  });

  it('barrel() is a cylinder (round), not a box', () => {
    const b = WP.barrel(0.03, 0.2);
    expect(b.geometry.type).toBe('CylinderGeometry');
  });

  it('scopeRing() is a torus', () => {
    const r = WP.scopeRing(0.04);
    expect(r.geometry.type).toBe('TorusGeometry');
  });

  it('exports a shared material library', () => {
    expect(WP.mats.gunmetal).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(WP.mats.polymer).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(WP.mats.steel).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('buildWeapon(id) returns a group + muzzleLocal for every weapon id', () => {
    for (const id of ['AR','SNIPER','SMG','SHOTGUN','PISTOL']) {
      const { group, muzzleLocal } = WP.buildWeapon(id);
      expect(group).toBeInstanceOf(THREE.Group);
      expect(muzzleLocal).toBeInstanceOf(THREE.Vector3);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run src/tests/WeaponParts.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement WeaponParts.js**

Create `src/player/WeaponParts.js`. Convention: parts are built in local space with the weapon facing +Z (muzzle at +Z tip), matching the existing FirstPersonView convention (the FP group rotates by PI to face -Z = camera forward). Each builder returns a `THREE.Mesh` already positioned at the origin of its own sub-group; the weapon composer places it.

```js
import * as THREE from 'three';
import { loadOrFallback } from '../textures/AssetLoader.js';

// ---- Material library (shared across all weapons) ----
// PBR-tuned. Gunmetal/steel are metallic; polymer is matte. Accent is slightly
// emissive so tritium/iron sights catch the bloom pass.
const TEX = {
  gunmetal: '/textures/weapons/gunmetal.png',
  camo:     '/textures/weapons/tactical_camo.png',
  steel:    '/textures/weapons/worn_steel.png',
  wood:     '/textures/weapons/wood_stock.png',
};

export const mats = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.85, roughness: 0.38 }),
  polymer:  new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.0,  roughness: 0.78 }),
  steel:    new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.95, roughness: 0.25 }),
  accent:   new THREE.MeshStandardMaterial({ color: 0xffb84d, metalness: 0.2, roughness: 0.4, emissive: 0xff8800, emissiveIntensity: 0.4 }),
  wood:     new THREE.MeshStandardMaterial({ color: 0x6b4226, metalness: 0.0, roughness: 0.8 }),
  glass:    new THREE.MeshStandardMaterial({ color: 0x113355, metalness: 0.6, roughness: 0.15 }),
};
// Apply generated skin textures when they load (non-blocking; flat color until then).
loadOrFallback(TEX.gunmetal, mats.gunmetal);
loadOrFallback(TEX.steel,    mats.steel);
loadOrFallback(TEX.wood,     mats.wood);

function mesh(geo, material, x=0,y=0,z=0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Round barrel along Z. CylinderGeometry is along Y by default → rotate to Z.
export function barrel(radius, length, segments=12, material=mats.steel) {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  m.rotation.x = Math.PI / 2;   // Y-axis cylinder → Z-axis
  return m;
}

// Beveled receiver: a box with thin inset side strips to fake a beveled rail.
export function beveledBody(w, h, d, material=mats.gunmetal) {
  const g = new THREE.Group();
  const main = mesh(new THREE.BoxGeometry(w*0.86, h, d), material);
  g.add(main);
  // side rails (thin strips) give a beveled read
  const railL = mesh(new THREE.BoxGeometry(w*0.07, h*0.7, d*0.98), material, -w*0.46, 0, 0);
  const railR = mesh(new THREE.BoxGeometry(w*0.07, h*0.7, d*0.98), material,  w*0.46, 0, 0);
  g.add(railL, railR);
  return g;
}

// Curved pistol grip: a capsule angled downward/backward.
export function curvedGrip(w, h, d, curve=0.25, material=mats.polymer) {
  const g = new THREE.Group();
  const cap = mesh(new THREE.CapsuleGeometry(w*0.5, h, 4, 8), material);
  cap.rotation.x = -curve;        // tilt grip
  cap.position.set(0, -h*0.5, -d*0.5);
  g.add(cap);
  return g;
}

// Scope main tube (cylinder) + optional position.
export function scopeTube(r, length, material=mats.polymer) {
  const m = mesh(new THREE.CylinderGeometry(r, r, length, 14), material);
  m.rotation.x = Math.PI / 2;
  return m;
}
// Scope mounting ring (torus).
export function scopeRing(r, tube=r*0.18, material=mats.polymer) {
  return mesh(new THREE.TorusGeometry(r, tube, 8, 16), material);
}
// Glossy scope lens (thin cylinder, glass material).
export function scopeLens(r, material=mats.glass) {
  const m = mesh(new THREE.CylinderGeometry(r, r, 0.005, 14), material);
  m.rotation.x = Math.PI / 2;
  return m;
}

// Slightly curved magazine: box + rounded front cap.
export function magCurve(w, h, d, curve=0.12, material=mats.polymer) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(w, h, d), material);
  body.rotation.x = curve;
  body.position.set(0, -h*0.5, 0);
  g.add(body);
  return g;
}

// Muzzle device: short cylinder with a recessed-face read (smaller front cap).
export function muzzleDevice(r, length, material=mats.steel) {
  const g = new THREE.Group();
  const outer = mesh(new THREE.CylinderGeometry(r, r*0.95, length, 12), material);
  outer.rotation.x = Math.PI / 2;
  g.add(outer);
  // top slot (fake port) — thin box across the top
  const slot = mesh(new THREE.BoxGeometry(r*0.4, r*0.15, length*0.5), mats.polymer, 0, r*0.85, 0);
  g.add(slot);
  return g;
}

// Tapered stock (scaled capsule = rounded, not blocky).
export function stock(w, h, d, material=mats.polymer) {
  const m = mesh(new THREE.CapsuleGeometry(w*0.5, d, 4, 8), material);
  m.scale.set(1, h/(w), 1);
  m.rotation.x = Math.PI / 2;
  return m;
}

// Trigger guard: a thin torus arc under the grip.
export function triggerGuard(r=0.04, material=mats.polymer) {
  const m = mesh(new THREE.TorusGeometry(r, r*0.18, 6, 12, Math.PI), material);
  m.rotation.x = -Math.PI/2;   // arc opens downward
  return m;
}

// Picatinny-style rail: thin box with small stud bumps for sight mounts.
export function rail(length, material=mats.gunmetal) {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(0.025, 0.012, length), material);
  g.add(base);
  for (let i = 0; i < Math.max(2, Math.floor(length/0.03)); i++) {
    const stud = mesh(new THREE.BoxGeometry(0.026, 0.006, 0.008), material, 0, 0.009, -length/2 + 0.02 + i*0.03);
    g.add(stud);
  }
  return g;
}

// Iron sight post + tritium dot.
export function ironSight(material=mats.polymer) {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.008, 0.025, 0.012), material);
  g.add(post);
  const dot = mesh(new THREE.SphereGeometry(0.005, 8, 6), mats.accent, 0, 0.02, 0);
  g.add(dot);
  return g;
}

// ---- Per-weapon composers ----
// Each returns { group, muzzleLocal }. Convention: +Z forward in local space.
function buildAR() {
  const g = new THREE.Group();
  const body = beveledBody(0.07, 0.09, 0.30); g.add(body);
  const bar = barrel(0.018, 0.20); bar.position.set(0, 0.02, 0.24); g.add(bar);
  const md = muzzleDevice(0.022, 0.05); md.position.set(0, 0.02, 0.35); g.add(md);
  const mg = magCurve(0.05, 0.13, 0.06, 0.18); mg.position.set(0, -0.10, -0.02); g.add(mg);
  const grip = curvedGrip(0.05, 0.10, 0.05, 0.25); grip.position.set(0, -0.085, -0.12); g.add(grip);
  const r = rail(0.16); r.position.set(0, 0.055, 0.04); g.add(r);
  const sight = ironSight(); sight.position.set(0, 0.075, 0.10); g.add(sight);
  const st = stock(0.05, 0.10, 0.10); st.position.set(0, -0.01, -0.20); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.08); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.38) };
}

function buildSniper() {
  const g = new THREE.Group();
  const body = beveledBody(0.06, 0.08, 0.38); g.add(body);
  const bar = barrel(0.014, 0.32); bar.position.set(0, 0.01, 0.32); g.add(bar);
  const md = muzzleDevice(0.018, 0.04); md.position.set(0, 0.01, 0.50); g.add(md);
  // scope: tube + 2 rings + lens
  const tube = scopeTube(0.022, 0.16); tube.position.set(0, 0.085, 0.02); g.add(tube);
  const ringA = scopeRing(0.024); ringA.position.set(0, 0.085, -0.04); g.add(ringA);
  const ringB = scopeRing(0.024); ringB.position.set(0, 0.085, 0.08); g.add(ringB);
  const lens = scopeLens(0.020); lens.position.set(0, 0.085, 0.105); g.add(lens);
  const mg = magCurve(0.04, 0.09, 0.06, 0.08); mg.position.set(0, -0.085, -0.04); g.add(mg);
  const grip = curvedGrip(0.045, 0.10, 0.045, 0.25); grip.position.set(0, -0.075, -0.14); g.add(grip);
  const st = stock(0.06, 0.12, 0.16); st.position.set(0, -0.02, -0.24); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.10); g.add(tg);
  // bipod: two angled thin cylinders near the muzzle
  const bipodL = barrel(0.006, 0.09, 6, mats.polymer); bipodL.position.set(-0.04, -0.05, 0.34); bipodL.rotation.z = 0.35; g.add(bipodL);
  const bipodR = barrel(0.006, 0.09, 6, mats.polymer); bipodR.position.set( 0.04, -0.05, 0.34); bipodR.rotation.z = -0.35; g.add(bipodR);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.54) };
}

function buildSMG() {
  const g = new THREE.Group();
  const body = beveledBody(0.06, 0.08, 0.18); g.add(body);
  const bar = barrel(0.014, 0.06); bar.position.set(0, 0.01, 0.12); g.add(bar);
  const md = muzzleDevice(0.018, 0.03); md.position.set(0, 0.01, 0.16); g.add(md);
  const mg = magCurve(0.04, 0.16, 0.05, 0.22); mg.position.set(0, -0.12, 0.0); g.add(mg);
  const grip = curvedGrip(0.045, 0.09, 0.045, 0.25); grip.position.set(0, -0.07, -0.07); g.add(grip);
  const r = rail(0.10); r.position.set(0, 0.055, 0.0); g.add(r);
  const sight = ironSight(); sight.position.set(0, 0.075, 0.04); g.add(sight);
  // folding stock: thin capsule laid back
  const st = stock(0.03, 0.05, 0.12); st.position.set(0, 0.0, -0.16); g.add(st);
  const tg = triggerGuard(0.032); tg.position.set(0, -0.06, -0.04); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.18) };
}

function buildShotgun() {
  const g = new THREE.Group();
  const body = beveledBody(0.08, 0.09, 0.26); g.add(body);
  // double barrel: two parallel cylinders
  const bar1 = barrel(0.022, 0.22, 12, mats.steel); bar1.position.set(-0.022, 0.02, 0.22); g.add(bar1);
  const bar2 = barrel(0.022, 0.22, 12, mats.steel); bar2.position.set( 0.022, 0.02, 0.22); g.add(bar2);
  // pump: ridged cylinder under the barrels
  const pump = barrel(0.03, 0.10, 10, mats.polymer); pump.position.set(0, -0.04, 0.18); g.add(pump);
  const grip = curvedGrip(0.05, 0.11, 0.05, 0.30); grip.position.set(0, -0.09, -0.10); g.add(grip);
  const st = stock(0.06, 0.11, 0.14, mats.wood); st.position.set(0, -0.03, -0.20); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.06); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.34) };
}

function buildPistol() {
  const g = new THREE.Group();
  const slide = beveledBody(0.05, 0.06, 0.16); slide.position.set(0, 0.02, 0); g.add(slide);
  const bar = barrel(0.012, 0.05, 10, mats.steel); bar.position.set(0, 0.02, 0.10); g.add(bar);
  const grip = curvedGrip(0.045, 0.12, 0.05, 0.20); grip.position.set(0, -0.07, -0.05); g.add(grip);
  const sight = ironSight(); sight.position.set(0, 0.06, 0.04); g.add(sight);
  const tg = triggerGuard(0.03); tg.position.set(0, -0.04, 0.0); g.add(tg);
  const mg = magCurve(0.04, 0.05, 0.05, 0.05); mg.position.set(0, -0.11, -0.04); g.add(mg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.14) };
}

const COMPOSERS = { AR: buildAR, SNIPER: buildSniper, SMG: buildSMG, SHOTGUN: buildShotgun, PISTOL: buildPistol };

// Build a weapon group by id. detailLevel: 'fp' (full) or 'tp' (lower-poly for distant bots).
// For 'tp' we reuse the same composer but the caller scales the group down.
export function buildWeapon(id, detailLevel='fp') {
  const composer = COMPOSERS[id] || COMPOSERS.AR;
  return composer();
}
```

- [ ] **Step 4: Run test, commit**

```bash
npx vitest run src/tests/WeaponParts.test.js   # PASS (5 tests)
git add src/player/WeaponParts.js src/tests/WeaponParts.test.js
git commit -m "feat(weapons): WeaponParts — shared rounded-primitive factory + material library"
```

---

## Task 3: Rewrite FirstPersonView builders to use WeaponParts

Replace all 5 box-only builders with composition from WeaponParts. The animation/sync/recoil/reload logic stays untouched — only the builders change.

**Files:** Modify `src/player/FirstPersonView.js`

- [ ] **Step 1: Replace the per-weapon builders + makeBody**

In `src/player/FirstPersonView.js`:
1. Add `import { buildWeapon } from './WeaponParts.js';` at the top.
2. Delete `makeBody`, `buildAR`, `buildSniper`, `buildSMG`, `buildShotgun`, `buildPistol`, and the `BUILDERS` map.
3. Replace the `setWeapon` body's builder call. Find:
   ```js
   const builder = BUILDERS[weaponId] || BUILDERS.AR;
   const built = builder();
   ```
   Replace with:
   ```js
   const built = buildWeapon(weaponId, 'fp');
   ```
4. Remove now-unused constants `GUNMETAL`, `POLYMER`, `ACCENT`, and `mat()` if no longer referenced (keep `mat` only if still used elsewhere in the file — it isn't after the builders are gone; remove it).

The rest of the file (the `FirstPersonView` class with sway/kick/reload/muzzle logic) is unchanged.

- [ ] **Step 2: Syntax check + run full test suite**

```bash
node --check src/player/FirstPersonView.js
npx vitest run   # all 140 pass (5 new WeaponParts + existing 135)
```

- [ ] **Step 3: Commit**

```bash
git add src/player/FirstPersonView.js
git commit -m "feat(weapons): FP viewmodels rebuilt from rounded primitives via WeaponParts"
```

---

## Task 4: Rebuild the third-person bot gun via WeaponParts

Replace `CharacterView.buildSimpleGun` (3 boxes + sphere) with a scaled-down `buildWeapon` call so bots carry the same recognizable weapons.

**Files:** Modify `src/player/CharacterView.js`

- [ ] **Step 1: Replace buildSimpleGun**

Add `import { buildWeapon } from './WeaponParts.js';` and replace the `buildSimpleGun` function with:
```js
// Third-person bot gun: reuse the FP weapon composer, scaled down + simplified
// for distance. Same silhouette so a bot's loadout is recognizable at a glance.
function buildSimpleGun(weaponId = 'AR') {
  const { group } = buildWeapon(weaponId, 'tp');
  group.scale.setScalar(0.85);
  return group;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/player/CharacterView.js
git commit -m "feat(weapons): third-person bot gun shares WeaponParts silhouette"
```

---

## Task 5: Per-animal skin textures + CharacterView skin application

Each animal gets its own generated skin texture, loaded via AssetLoader and applied to the torso/limb material (replacing the shared procedural fur, which remains the fallback). `Animals.js` gains a `skinTexture` id per animal.

**Files:** Modify `src/config/Animals.js`, `src/player/CharacterView.js`

- [ ] **Step 1: Add skinTexture id to each animal in Animals.js**

For each animal in `src/config/Animals.js`, add a `skinTexture: '<id>'` field (the texture filename without extension):
- FOX → `fox`, WOLF → `wolf`, PANDA → `panda`, TIGER → `tiger`, BEAR → `bear`, BUNNY → `bunny`, OWL → `owl`.
Add the field inside each animal object literal (e.g. after `sizeMul`).

- [ ] **Step 2: Apply the skin texture in CharacterView.furMat**

In `src/player/CharacterView.js`, modify `furMat(color)` to accept an optional `skinId` and load the per-animal texture:
```js
import { loadOrFallback } from '../textures/AssetLoader.js';
import { ANIMALS } from '../config/Animals.js';

// Fur/skin material tinted by palette color. If the animal has a generated
// skin texture, load it (non-blocking) over the procedural fur fallback.
function furMat(color, skinId) {
  const tex = getTexture('fur', { base: color, accent: shadeHex(color, -0.25), seed: color }).clone();
  tex.needsUpdate = true;
  tex.repeat.set(2, 2);
  const m = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, flatShading: true });
  if (skinId) loadOrFallback(`/textures/skins/${skinId}.png`, m);
  return m;
}
```
Then update every `furMat(p.primary)` call in `setAnimal` to pass the animal's skin id: `furMat(p.primary, animal.skinTexture)`. The torso, legs, arms, and head-fur swap each get a `furMat(color, skinId)` call. (There are ~5 such calls in setAnimal + the head traverse.)

- [ ] **Step 3: Commit**

```bash
git add src/config/Animals.js src/player/CharacterView.js
git commit -m "feat(skins): per-animal generated skin textures (7 distinct) over procedural fur fallback"
```

---

## Task 6: Character head detail polish (eye-shine + proportional tweaks)

Targeted polish to the existing head builders — add eye-shine (small bright sphere in front of each eye) and refine a few crude proportions. No structural change to the builder pattern.

**Files:** Modify `src/config/Animals.js` (head builders)

- [ ] **Step 1: Add an eye-shine helper + apply to each builder**

Add a helper at the top of the head-builders section in `src/config/Animals.js`:
```js
// Small bright sphere in front of an eye for a wet/alive eye-shine catch-light.
function addEyeShine(g, sep, y, z, r=0.012) {
  const s1 = sphere(r, 0xffffff); s1.position.set(-sep, y, z + r*1.5); g.add(s1);
  const s2 = sphere(r, 0xffffff); s2.position.set( sep, y, z + r*1.5); g.add(s2);
  return g;
}
```
Then in each `buildXHead(p)`, after the `addEyes(...)` call, add `addEyeShine(g, <sep>, <y>, <z>)` using the same sep/y/z as the eyes for that animal (these values are visible in each builder). This adds two tiny white spheres just in front of each pupil, reading as specular eye-shine. Apply to all 7 builders (fox, wolf, panda, tiger, bear, bunny, owl).

- [ ] **Step 2: Commit**

```bash
git add src/config/Animals.js
git commit -m "feat(skins): eye-shine catch-lights on all animal heads"
```

---

## Task 7: Generate weapon + skin textures via creative-minimax

Dispatch the creative-minimax subagent to generate the PNG textures. This is independent of the geometry work and can run in parallel; placed here so the geometry + AssetLoader wiring is already in place to receive them.

**Files:** Create `public/textures/weapons/*.png`, `public/textures/skins/*.png`

- [ ] **Step 1: Generate weapon textures**

Dispatch a creative-minimax subagent (one dispatch, multiple images) to generate these tileable weapon-skin textures into `public/textures/weapons/`:
- `gunmetal.png` — dark brushed gunmetal, subtle horizontal scratches, tileable, 512×512.
- `tactical_camo.png` — black/dark-grey tactical camo pattern, tileable, 512×512.
- `worn_steel.png` — worn blued steel with faint patina and scratches, tileable, 512×512.
- `wood_stock.png` — warm reddish wood grain (for shotgun stock), tileable, 512×512.

- [ ] **Step 2: Generate per-animal skin textures**

Dispatch a creative-minimax subagent to generate seamless animal skin textures into `public/textures/skins/` (256×256 each, seamless/tileable, top-down "pelt" view):
- `fox.png` — orange-red fur with cream underbelly, black guard hairs.
- `wolf.png` — grey-brown coarse fur with lighter guard hairs.
- `panda.png` — white fur with black patches.
- `tiger.png` — orange fur with bold black stripes.
- `bear.png` — dark brown shaggy fur.
- `bunny.png` — soft cream/grey rabbit fur.
- `owl.png` — barred brown/cream feathers.

- [ ] **Step 3: Commit**

```bash
git add public/textures/
git commit -m "feat(assets): generated weapon + per-animal skin textures (creative-minimax)"
```

---

## Task 8: Runtime verification + README + merge

- [ ] **Step 1: Full test suite**

`npx vitest run` → all pass (140).

- [ ] **Step 2: Runtime screenshot comparison**

Start dev server, play a single-player match. Confirm: 0 console errors; FP viewmodel clearly shows round barrels (cylinders) and detailed parts (scope ring, muzzle device, trigger guard) — not boxes; bots carry the same recognizable weapons; character bodies show distinct per-animal skin textures; animal eyes have catch-light shine. Take before/after screenshots.

- [ ] **Step 3: Update README**

Add a feature bullet noting the rebuilt weapons + per-animal skins. Bump test badge to 140.

- [ ] **Step 4: Merge + push**

```bash
git checkout master && git merge dev-visual-overhaul --no-ff -m "Merge 'dev-visual-overhaul': heavy weapon + skin visual upgrade"
npx vitest run
git push origin master
git branch -d dev-visual-overhaul
```

---

## Self-Review (completed during authoring)

**Spec coverage:** WeaponParts (Task 2), FP rebuild (3), TP rebuild (4), per-animal skins (5), head polish (6), generated textures (7), AssetLoader (1), verify+merge (8). All spec sections covered.

**Placeholder scan:** No TBD/TODO; all code blocks complete.

**Type consistency:** `buildWeapon(id, detailLevel)` signature consistent across Tasks 2/3/4. `furMat(color, skinId)` consistent between Task 5's definition and call sites. `mats.gunmetal/polymer/steel/accent/wood/glass` field names consistent. `loadOrFallback(path, material)` consistent between AssetLoader (Task 1) and all consumers.
