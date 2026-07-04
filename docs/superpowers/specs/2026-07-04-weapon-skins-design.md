# Weapon Darkness Fix + Selectable Skins — Design Spec

**Date:** 2026-07-04
**Status:** Approved (user chose menu skin selector applying to all weapons)
**Fixes:** "guns are too dark, like there is no light on it" + adds selectable weapon skins/patterns

## Problem (bug)

After the visual overhaul, weapons render too dark. Root cause (investigated, not guessed):
- All weapon materials are `MeshStandardMaterial` with **high metalness (0.85–0.95)**.
- The scene has **no environment map** (`scene.environment` is never set). High-metalness PBR materials derive almost all their appearance from specular reflection of an environment; with no env map, only direct lights contribute.
- The viewmodel sits at the lower-right of the view, often angled away from the sun direction → little direct specular reaches the camera → the gun reads as near-black.
- Compounded by very dark base colors (`0x2b2f36`, `0x14161a`) and dark generated textures multiplying them.

The pre-overhaul box weapons didn't show this because they used metalness 0 (default) with flat shading — full diffuse response to scene lights.

## Goal

1. **Fix the darkness** — make metallic weapons respond to light properly.
2. **Selectable weapon skins** — a menu "Weapon Skin" selector with a roster of named skins; the chosen skin applies to all weapons and persists to localStorage.

## Fix — environment map + material rebalance

### `Game.js`: PMREM environment from the sky

`MeshStandardMaterial` metals need an environment to reflect. Add a `PMREMGenerator` that processes the active map's sky gradient texture into a cubemap environment, assigned to `scene.environment`. Rebuilt on each `loadMap` (each map's sky differs). This lights every metallic surface in the scene (weapons, metal arena parts) with image-based lighting derived from the sky itself.

```js
// in constructor, after renderer setup:
this.pmrem = new THREE.PMREMGenerator(this.renderer);
// in loadMap(map), after scene.background = makeSkyTexture(...):
this._applyEnvironment(map.palette.sky);

_applyEnvironment(stops) {
  const skyTex = makeSkyTexture(stops);   // the gradient canvas texture
  const env = this.pmrem.fromEquirectangular(skyTex).texture;
  if (this._envTex) this._envTex.dispose();
  this.scene.environment = env;
  this._envTex = env;
}
```
(`PMREMGenerator.fromEquirectangular` accepts the 2×256 gradient as a vertical-equirect; it's coarse but sufficient for IBL ambient color.)

### `WeaponParts.js`: material rebalance

Lower metalness so the materials aren't 100% reliant on the env map, and lighten base colors so the diffuse contribution is visible:
- gunmetal: metalness 0.6 (was 0.85), roughness 0.45 (was 0.38), color 0x4a4f58 (was 0x2b2f36)
- polymer: unchanged (already metalness 0, fine)
- steel: metalness 0.7 (was 0.95), roughness 0.3 (was 0.25), color 0x6a6e76 (was 0x3a3e44)

With both the env map AND the rebalanced materials, the guns will read as properly-lit metal in all view positions.

## Feature — selectable weapon skins

### `WEAPON_SKINS` registry (`src/config/WeaponSkins.js` — new)

8 named skins. Each defines the PBR parameters + texture map for the "primary" weapon surface (the gunmetal/steel parts). Polymer/grip parts stay dark regardless (they're furniture).

```js
export const WEAPON_SKINS = [
  { id:'gunmetal', name:'Gunmetal',  map:'/textures/weapons/gunmetal.png',     color:0x4a4f58, metalness:0.6, roughness:0.45 },
  { id:'camo',     name:'Tactical Camo', map:'/textures/weapons/tactical_camo.png', color:0x3a4038, metalness:0.3, roughness:0.6 },
  { id:'steel',    name:'Worn Steel',  map:'/textures/weapons/worn_steel.png',  color:0x6a6e76, metalness:0.7, roughness:0.3 },
  { id:'gold',     name:'Gold',        map:'/textures/weapons/gold.png',        color:0xd4a040, metalness:0.9, roughness:0.25 },
  { id:'snake',    name:'Snake Skin',  map:'/textures/weapons/snake.png',       color:0x4a5a3a, metalness:0.2, roughness:0.55 },
  { id:'neon',     name:'Neon',        map:'/textures/weapons/neon.png',        color:0x1a1a2a, metalness:0.4, roughness:0.35, emissive:0x00ffcc, emissiveIntensity:0.25 },
  { id:'ice',      name:'Ice',         map:'/textures/weapons/ice.png',         color:0x9fc4d8, metalness:0.5, roughness:0.2 },
  { id:'wood',     name:'Wood',        map:'/textures/weapons/wood_stock.png',  color:0x6b4226, metalness:0.0, roughness:0.8 },
];
export const DEFAULT_SKIN = WEAPON_SKINS[0].id;
export function getSkin(id) { return WEAPON_SKINS.find(s => s.id === id) || WEAPON_SKINS[0]; }
```

### `WeaponParts` — apply the active skin

The shared `mats.gunmetal` and `mats.steel` become **skin-driven**: `setActiveSkin(skinId)` rewrites their `map`, `color`, `metalness`, `roughness`, `emissive`, `emissiveIntensity` from the skin config, sets `needsUpdate`, and (re)loads the skin's texture via `AssetLoader.loadOrFallback`. Because the mats are shared references across all weapon parts (FP + TP), one call updates every weapon in the scene instantly.

```js
export function setActiveSkin(skinId) {
  const s = getSkin(skinId);
  applySkinToMat(mats.gunmetal, s);
  applySkinToMat(mats.steel, s);   // steel shares the skin for a cohesive look
}
function applySkinToMat(m, s) {
  m.map = null; m.color.setHex(s.color); m.metalness = s.metalness; m.roughness = s.roughness;
  m.emissive.setHex(s.emissive || 0); m.emissiveIntensity = s.emissiveIntensity || 0;
  m.needsUpdate = true;
  if (s.map) loadOrFallback(s.map, m);
}
```

### `MainMenu` — skin selector

A 4th selector row "Weapon Skin" (after the weapon picker), showing the 8 skins as buttons (name + a color swatch via CSS background). `selectedSkin` persisted to `localStorage` (`as_skin`). Passed in `onStart({ ..., skin })`.

### Wiring

`Game`'s `onStart` handler reads `skin` and calls `WeaponParts.setActiveSkin(skin)` before `startMatch`. Also applied at construction (default skin) so the menu/initial state isn't dark. Single-player + host + join all pass it through (the skin is purely client-side visual — it does NOT affect the authoritative sim, so no netcode concern).

## New textures (creative-minimax)

Generate 4 new weapon-skin textures (512×512, tileable) into `public/textures/weapons/`:
- `gold.png` — polished gold with subtle scratches.
- `snake.png` — green/brown snake-skin scale pattern.
- `neon.png` — dark with glowing cyan circuit/grid lines (pairs with emissive).
- `ice.png` — pale crystalline ice/frost pattern.

(The existing `gunmetal`, `tactical_camo`, `worn_steel`, `wood_stock` are reused.)

## Testing

- The `WeaponParts` smoke test gains a check that `setActiveSkin` + `getSkin` exist and update material props.
- A small `WeaponSkins.test.js` checks the registry shape (8 entries, unique ids, required fields, `getSkin` round-trips, default).
- Darkness fix is verified visually (screenshot before/after: gun clearly lit, not black).

## Out of scope (YAGNI)

- Per-weapon skin choices (one selector for all weapons, per the chosen design).
- Skin unlocks / progression / shop (all skins available immediately).
- Skinning non-metal parts (grip/polymer stays dark — it's furniture).
- Netcode-synced skins (purely client-side visual).
- A 3D skin preview in the menu (color-swatch buttons suffice).

## Risk / rollback

The env map + material rebalance are the riskiest (lighting is global). Mitigation: the env map is additive (`scene.environment` only adds reflection; it can't darken), and the material rebalance only lightens. A screenshot before/after confirms. Skins are an additive selector; default skin preserves the current look (post-fix). All behind individual commits on a feature branch.
