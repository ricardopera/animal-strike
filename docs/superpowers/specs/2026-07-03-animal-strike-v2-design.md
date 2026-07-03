# AnimalStrike v2 — Expansion Design Spec

**Status:** Approved (2026-07-03, autonomous execution authorized)
**Builds on:** v1 (single-player FFA deathmatch, 2 weapons, 7 animals, 5 bots, flat-shaded arena)

## One-line Summary
Turn the playable MVP into a content-rich, juicy FPS: visible first-person weapons with custom designs and shoot/reload animations, more guns, redesigned complex characters, music and character voices with situational banter, improved procedural + generated textures, a richer map with many more buildings, and an expanded HUD/UI.

## Confirmed Decisions
- **Voices:** real generated audio via creative-minimax (MiniMax T2A). Lean now → full later: announcer + shared combat grunts (~12 clips) first; per-animal voices documented as follow-up.
- **Music:** real generated tracks via creative-minimax (music-generation).
- **Textures:** procedural canvas textures everywhere; creative-minimax images for a few hero assets (skybox, key facades, fur maps) where adequate.
- **Map collision:** keep AABB axis-aligned buildings (no collision rewrite). More buildings = more boxes + variety + textures.
- **Weapons:** 5 total — existing AR + Sniper + new SMG, Shotgun, Pistol.
- **MCP:** pilot first — one voice + one music + one image. If the pipeline works, scale; if not, synthesized WebAudio + procedural-only textures with zero wasted effort.

## Non-goals (this version)
- Per-animal unique voices (documented follow-up, not built)
- Team deathmatch / classes / gun-game / netcode (still Phase-8 future hooks)
- Projectile (non-hitscan) weapons — Shotgun is multi-pellet HITSCAN, not projectiles
- Real collision-system rewrite (OBBs) — buildings stay axis-aligned

## New Components

### `src/player/FirstPersonView.js`
A `THREE.Group` parented to the camera. Per-weapon build fn producing a recognizable gun silhouette (body, barrel, magazine, grip, stock) from low-poly primitives + procedural metal/polymer textures. Animates: idle sway (sin of time × walk-speed), per-shot recoil kick (translate back + tilt up, spring back), reload animation (dip down + rotate, ~0.4s). Exposes a `muzzleRef` Object3D so the muzzle flash + tracer originate from the real gun muzzle in world space. `setWeapon(id)` swaps the model. Hideable for menus/death.

### `src/fx/ViewmodelFx.js`
Drives the viewmodel's shoot-kick (impulse + spring-damper return) and exposes the muzzle world position. Replaces the eye-derived muzzle origin in `fireOneShot`.

### `src/textures/TextureFactory.js`
Module-level cache of canvas-drawn `THREE.CanvasTexture`s: camo (multi-blob), wood (grain stripes), brushed metal (anisotropic streaks), concrete (noise + cracks), animal fur (directional noise), grid/warn stripes. `get(name, opts)` returns a cached texture. Applied to arena, guns, characters.

### `src/world/ArenaBuilderV2.js`
~40–60 axis-aligned buildings: twin hollow towers (stacked walls + floor slabs), sniper perches, ramped structures, crate clusters, a central multi-level structure. Preserves 180° rotational symmetry. Every solid mesh added to both scene + ColliderStore (AABB, unchanged). Updated `BotNavigation` waypoints + `SpawnPoints` to match.

### `src/audio/MusicPlayer.js`
A looping music bus (gain node → destination) with menu + combat tracks, crossfade, mute via settings. Loads generated `.mp3`/`.wav` from `/audio/music/*` via `AudioBuffer` + `BufferSourceNode` loop; if the file is missing, falls back to a synthesized WebAudio chord-pad loop so the game is never silent.

### `src/audio/VoicePlayer.js`
One-shot voice queue. Loads generated clips from `/audio/voice/*`; falls back to synthesized WebAudio grunts. Event hooks: match-start (announcer), frag-milestone, low-time, victory, defeat, + shared spawn/kill/hurt/death grunts pitch-shifted per animal. Cooldown + don't-talk-over logic.

### HUD expansions (`src/ui/*`)
- Weapon icon (canvas/SVG per id) beside the name.
- Reload ring around the crosshair during reload.
- Low-ammo (<25%) flashing warning.
- DOM hitmarker (4-line X on hit; distinct color on kill).
- Killstreak counter.
- Health + ammo BARS (not just text).
- Minimap (top-down canvas with blips).

### `WeaponController` extension
Emit reload-phase signal: `onReloadStart` callback + a `reloadProgress` (0→1) so the viewmodel + HUD reload ring animate. Shotgun fires N pellet rays (multi-pellet hitscan) in `fireOneShot`.

## Data Flow (additions to the frame loop)
- Each frame after camera positioning: `firstPersonView.update(dt, speed, recoil, reloadProgress, pitch/yaw)` → animates the viewmodel (sway/kick/reload). The viewmodel is a child of the camera, so it inherits camera transforms automatically.
- On shot fired: `viewmodelFx.kick()` adds an impulse; muzzle world pos computed from `muzzleRef` for the flash/tracer.
- On reload start: `weaponController.onReloadStart` fires → viewmodel begins reload anim + HUD reload ring shows; progress drives both.
- Voice/music events fire from Game lifecycle hooks (startMatch/endMatch/kill/hurt/respawn) into VoicePlayer/MusicPlayer.

## Testing Strategy
- Vitest TDD for pure logic: muzzle world-position projection, reload-progress curve, shotgun pellet spread distribution, texture caching (same-name returns same instance), voice/music cooldown gating.
- `npm run build` + `npm test` green at every commit (regression guard).
- Per-phase Playwright live checks for visual/runtime: viewmodel visible + kicks on fire, new guns switchable, voices fire on kill, music loops, new map renders, HUD elements present.
- Subagent implementer + spec + quality review per task, frequent commits.

## Performance
- ~50 building boxes + textures + viewmodel: target 60fps. Frustum culling automatic; cap pixel ratio (already). Texture cache prevents duplicate canvas draws. Pilot generates compressed assets.

## Risks & Mitigations
- MiniMax MCP unreachable from subagents → pilot proves it; synthesized WebAudio + procedural-only fallback for the entire plan so no hard dependency.
- Viewmodel clipping/blocking view → small model, low-right position, near-clip 0.1 (set); Playwright-verified.
- Shotgun balance → pellet count + falloff in config, playtested.
- Bigger map perf → ~50 boxes, profile in Phase I.
- Scope → lean voice set now (full per-animal documented as follow-up); each phase ships a working game.

## Future Expansion (documented, not built this version)
- Per-animal unique voices (the "full later" of voice scope)
- Projectile/rocket weapons (would extend the weapon system past hitscan)
- More maps (each its own ArenaBuilder)
- Team deathmatch, classes, gun-game
- Netcode (entity/AI split already structured for it)
