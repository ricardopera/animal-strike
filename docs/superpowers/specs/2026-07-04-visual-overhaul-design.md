# Heavy Visual Overhaul (Weapons + Skins) — Design Spec

**Date:** 2026-07-04
**Status:** Approved (user granted full autonomy: "take your decisions... stop when 110% done")
**Roadmap item:** visual polish — "weapons are too square"

## Problem

Every weapon is built exclusively from `THREE.BoxGeometry`. In `FirstPersonView.js` the AR/Sniper/SMG/Shotgun/Pistol builders call `makeBody()` (a box) for body, barrel, magazine, grip, sight, and stock alike — so barrels are rectangular prisms, grips are blocks, and the silhouette reads as a cluster of boxes rather than a gun. The third-person bot gun (`CharacterView.buildSimpleGun`) is even barer: 3 boxes + a sphere. Character skins use a single shared procedural fur canvas (`TextureFactory.get('fur', …)`) tinted per-animal — all 7 animals share the same fur micro-pattern, differing only in base color.

## Goal — "heavy visual improvement"

A focused visual overhaul of weapons and character skins, with no gameplay changes:

1. **Weapon geometry rebuild** — replace box-only construction with rounded/organic primitives so weapons read as real gun classes, not boxes.
2. **Generated weapon-skin textures** — detailed PBR-able skin maps (via the creative-minimax subagent) applied to weapon bodies for richness beyond flat colors.
3. **Per-animal skin textures** — 7 distinct generated fur/scale/feather maps replacing the shared procedural fur.
4. **Materials polish** — PBR metalness/roughness tuning on weapons; warmer character materials.

## Architecture

The overhaul is contained to the rendering layer; it touches no sim, netcode, or gameplay. Three files change plus one new loader utility + a generated-assets directory.

### Component map

```
public/textures/            NEW — generated image assets (PNG), served by Vite
├── weapons/                weapon skin maps (gunmetal, camo, worn-steel, …)
└── skins/                  per-animal skin maps (fox, wolf, panda, tiger, bear, bunny, owl)

src/textures/
└── AssetLoader.js          NEW — caches THREE.TextureLoader results; async-load with fallback to procedural

src/player/
├── FirstPersonView.js      REWRITE builders — rounded primitives + detail parts + skin textures
├── CharacterView.js        MODIFY — per-animal skin textures, head detail polish, richer third-person gun
└── WeaponParts.js          NEW — shared rounded-part factory (cylinder barrel, curved grip, torus scope, beveled body) used by both FP and TP guns

src/config/
└── Animals.js              MODIFY — each animal references a skin texture id + head-detail tweaks
```

### Weapon geometry rebuild — `src/player/WeaponParts.js`

A shared factory of rounded primitives so both the FP viewmodel and the TP bot gun author weapons identically (DRY). Key parts:

- **`barrel(radius, length, segments=12)`** → `CylinderGeometry` along Z (rotated) — round barrels, the single biggest "square" complaint fix.
- **`beveledBody(w,h,d, bevel=0.01)`** → a body built from a slightly inset box + thin side strips to fake a beveled rail receiver (reads less blocky than a raw box).
- **`curvedGrip(w,h,d, curve)`** → `CapsuleGeometry` or a short `LatheGeometry` angled like a pistol grip.
- **`scopeTube(r, length)`** + **`scopeRing(r)`** (`TorusGeometry`) — a real scope = tube + ring + lens, not a box.
- **`magCurve(w,h,d)`** → a slightly curved magazine (`BoxGeometry` with a subtle rotation + rounded cap).
- **`muzzleDevice(r, length)`** → a small cylinder with a recessed front face (muzzle brake / flash hider).
- **`stock(w,h,d, type)`** → tapered stock (Lathe or scaled capsule) instead of a block.
- **`triggerGuard()`** → a thin torus arc under the grip.
- **`rail(length)`** → a thin box with small stud bumps (Picatinny-style) for sight mounts.

All parts use a shared PBR material set (see below). Each weapon builder composes these into a distinct silhouette.

### Per-weapon silhouettes (FP + TP share authoring)

- **AR** — beveled receiver + cylindrical barrel + muzzle brake + curved mag + angled grip + rail with iron sight + tapered stock. Reads: modern assault rifle.
- **Sniper** — long thin barrel + full scope (tube+ring+lens, glossy blue lens) + bipod (two angled cylinders) + big tapered stock. Reads: precision rifle.
- **SMG** — short fat receiver + stubby barrel + long curved stick mag + folding stock (thin capsule). Reads: compact auto.
- **Shotgun** — double-barrel via two parallel cylinders + pump (ridged cylinder) + pistol grip + wood-toned stock. Reads: pump action.
- **Pistol** — compact beveled slide + short barrel + curved grip + trigger guard. Reads: sidearm.

The third-person `buildSimpleGun` is replaced by a scaled-down call into the same `WeaponParts` factory so bots carry the same recognizable weapons (just lower-poly / fewer detail parts for distance).

### Materials upgrade

A small material library in `WeaponParts.js`:
- **`gunmetalMat`** — dark metal: `MeshStandardMaterial({ metalness: 0.85, roughness: 0.35, map: <gunmetal texture> })`.
- **`polymerMat`** — matte black polymer: `metalness: 0.0, roughness: 0.75`.
- **`steelMat`** — bright steel (barrels): `metalness: 0.95, roughness: 0.25`.
- **`accentMat`** — emissive amber for sights/tritium dots: slight `emissive` so they glow under bloom.
- **`woodMat`** — for shotgun stock: roughness 0.8, wood-texture map.

When a generated skin texture isn't loaded yet (or fails), fall back to a flat color — the geometry improvement alone already removes the "square" problem.

### Generated textures via creative-minimax

The `creative-minimax` subagent generates these images (PNG, tileable where relevant), saved to `public/textures/`:

**Weapons (`public/textures/weapons/`):**
- `gunmetal.png` — dark brushed gunmetal, tileable, with subtle scratches.
- `tactical_camo.png` — black/grey tactical camo, tileable.
- `worn_steel.png` — worn blued steel with patina, tileable.
- `wood_stock.png` — warm wood grain for the shotgun stock.

**Skins (`public/textures/skins/`):** per-animal, seamless:
- `fox.png`, `wolf.png`, `panda.png`, `tiger.png`, `bear.png`, `bunny.png`, `owl.png` — each the animal's fur/feather/scale micro-texture in its palette.

These are loaded via `AssetLoader` (a thin `TextureLoader` cache) and applied as material maps. `AssetLoader.load(path, fallbackColor)` returns a Promise; weapons/characters build immediately with the fallback and swap the texture in when it arrives. No blocking on load.

### `src/textures/AssetLoader.js`

```js
import * as THREE from 'three';
const _loader = new THREE.TextureLoader();
const _cache = new Map();
// load(path) → Promise<Texture>; caches results; resolves null on error.
export function load(path) { … }
// loadOrFallback(path, fallbackMat) → applies the texture to fallbackMat.map when ready, else leaves fallback.
export function loadOrFallback(path, mat) { … }
```

Headless-safe: `TextureLoader` requires `document` (it uses `Image`), so it's only imported by the browser-side view code — never by the sim or server (those don't render). No new test imports it.

### Character skins

- `Animals.js`: each animal gains a `skinTexture: 'fox'` field (its texture id).
- `CharacterView.setAnimal`: load the animal's skin texture via `AssetLoader` and apply it to the torso/limb material (replacing the shared procedural fur). The procedural fur remains the fallback.
- Head detail polish: add eye-shine (small bright sphere in front of each eye), refine snout/ear proportions per animal where the current builder is crude. Keep the existing head builder structure; targeted tweaks only.

## Testing

This is a visual change, so verification is primarily runtime (screenshots before/after) rather than unit tests. The existing 135 tests must stay green (no gameplay/sim logic touched). Add:
- One smoke test that `WeaponParts` exports the expected factory functions (cheap import check; guards against rename drift).
- A runtime screenshot comparison: weapons + characters render with no console errors, and the FP viewmodel clearly shows round barrels (cylinders) not boxes.

## Out of scope (YAGNI)

- New weapons or animals; gameplay/balance changes.
- GLB/GLTF model import (stay procedural geometry + image textures — consistent with the codebase, no asset pipeline complexity).
- Animation-system rework (the existing sway/recoil/reload anims stay; the new geometry just rides them).
- Per-skin material authoring tools.

## Risk / rollback

Geometry + textures are additive/replace-only at the rendering layer; no sim or netcode path is touched, so multiplayer and single-player logic are unaffected. Each weapon builder is independent, so a broken one can be reverted without affecting the others. Generated-texture loading is non-blocking with procedural fallback, so a missing/failed image never breaks the game. The `WeaponParts` extraction is the one structural change — its smoke test + a screenshot confirm it before commit.
