# Visual Round 2 — Maps, Music & Polish — Design Spec

**Date:** 2026-07-07
**Status:** Draft (awaiting approval)
**Branch:** `visual-round-2` (git worktree at `.worktrees/visual-round-2`)

## Goal

Three workstreams, all rendering/UI/world-layer only (no sim, netcode, or gameplay-balance changes):

1. **10+ concrete visual improvements** beyond the prior 2026-07-04 overhaul (which already did: ACES tone mapping, bloom, sky gradients, fog, weapon-geometry rebuild, weapon/animal skin textures).
2. **Wire the 12 unused tracks** in `public/audio/music_extras/` into the game with mood-aware selection.
3. **Two new maps**: a medieval village and a tropical beach — following the existing `MapDefinition` + 180°-symmetric `authorGeometry(place, placePair)` pattern on the 80×80 arena.

## Scope constraints (from the codebase)

- Maps are AABB-only collision on an 80×80 footprint (ground slab + perimeter walls). Geometry is authored once via `authorGeometry(place, placePair)`; the same authoring produces both client meshes and headless collider AABBs. New maps must follow this exactly.
- Tests lock the map roster: `src/tests/Maps.test.js` asserts exactly `['plaza','foundry','dustbowl']`. Adding 2 maps requires updating that test. The shared `MapDefinition.test.js` / `MapColliderBoxes.test.js` iterate `MAPS` automatically, so new maps get full structural coverage for free.
- `MusicPlayer` hardcodes `{ menu, combat }`. Game.js calls `music.play('menu'|'combat')` at 6 call sites. I'll extend the track registry + selection, keeping the existing `'menu'`/`'combat'` ids working (backward compatible).
- The prior overhaul's design is in `docs/superpowers/specs/2026-07-04-visual-overhaul-design.md` — I will NOT redo those items.

---

## Workstream 1 — Visual improvements (10 points)

Each is scoped, low-risk, and additive. Ranked by impact.

| # | Improvement | What changes | Files |
|---|-------------|--------------|-------|
| V1 | **Animated sun & time-of-day drift** | The directional "sun" slowly orbits (azimuth) over a long period; sun + key-light color shift subtly. Gives scenes life without a full day/night cycle. | `Game.js` (sun-follow block) |
| V2 | **Soft contact shadows under crates/cover** | Small dark radial-decal quads (or a second very-low-res blob shadow pass) under boxes so they don't float visually on the flat ground. | `MapBuildHelper.js` (optional `contactShadow()` helper) |
| V3 | **Procedural ground decals/street markings** | New texture types in `TextureFactory` (cobble, sand, turf, wood-plank-floor) so each map's ground reads as a material, not "green concrete everywhere". Maps opt in via a ground `texName`. | `TextureFactory.js`, each map's ground `place()` |
| V4 | **Map-specific ambient/fog palette per biome** | Tropical = warm turquoise haze + bright hemi; Village = warm golden-hour; reuse existing palette pipeline but also tint the HemisphereLight per map. | `MapDefinition` (palette gains `hemisphere`/`sunColor`), `Game.js loadMap()` |
| V5 | **Water plane for Tropical map** | A semi-transparent, animated (scrolling normal via UV offset) water quad for the lagoon. Non-collidable (visual only, flat). | new `src/fx/WaterPlane.js`, Tropical map |
| V6 | **Foliage: palm trees & market props** | Reusable prop builders (palm, well, market stall, haystack, banner) composed from primitives + `placePair`. These carry the theme. | new `src/world/props/` modules, both new maps |
| V7 | **Clouds / sky detail** | A few large flat billboard cloud sprites drifting across the sky (additive, slow). Cheap depth to the sky dome. | new `src/fx/Clouds.js`, `Game.js` |
| V8 | **HUD polish: animated health/ammo bars & damage flash** | Bars get a subtle shimmer/gradient + edge highlight; low-HP pulse; ammo bar color already flashes — add a numeric pop animation on damage taken. | `Hud.js` |
| V9 | **Crosshair recoil/expansion feedback** | Crosshair already supports `setSpread`; wire it to actual weapon spread/firing so the crosshair visibly blooms on fire and recovers. | `Crosshair.js` (already has it), `Game.js` (call site) |
| V10 | **End-screen podium flair** | Winner row gets a trophy/crown glyph + confetti-style accent; color tiers for 1st/2nd/3rd. | `EndScreen.js` |
| V11 *(bonus)* | **Muzzle-smoke / impact dust linger** | Extend `MuzzleFlash` with a short-lived smoke sprite; impact sparks already exist — add a faint dust puff on wall hits. | `MuzzleFlash.js`, `HitSpark` |

That's 11 (10 required + 1 bonus). V9 may already be partially wired — I'll verify and complete or substitute.

## Workstream 2 — Music

`public/audio/music_extras/` has 12 tracks. I'll register them as named moods and select contextually:

- **menu**: `menu_loop.mp3` (existing) + `menu_theme_vocal.mp3`, `menu_loop_2.mp3` (rotation)
- **combat**: `combat_loop.mp3` (existing) + `combat_loop_2.mp3`, `combat_loop_3.mp3`, `tension_suspense.mp3`, `hunt_theme_vocal.mp3`
- **victory**: `victory_anthem.mp3`, `victory_song_vocal.mp3`
- **defeat**: `defeat_theme.mp3`, `defeat_song_vocal.mp3`
- **clutch**: `last_stand_vocal.mp3`, `combat_anthem_vocal.mp3` (low-time / milestone)

Design:
- Extend `MusicPlayer` so each mood maps to a **list** of tracks; `play(mood)` picks one (round-robin or random, seeded), enabling variety across matches.
- Add `play('victory'|'defeat')` calls at the end-screen, and `play('clutch')` when the timer hits the low-time threshold or on a frag milestone.
- Keep backward compat: existing `'menu'`/`'combat'` ids still work; if only one track for a mood, behaves as today.
- Loading is already resilient (synth fallback on failure); extending the registry keeps that.

## Workstream 3 — Two new maps

Both follow the Plaza/Foundry/Dustbowl pattern exactly: `authorGeometry(place, placePair)` on an 80×80 arena, 180°-rotational symmetry via `placePair`, ≥8 spawns, ≥10 waypoints, a 4-stop sky palette, and a non-empty `colliderBoxes` array computed by the collider-only pass.

### Map A — "Haven" (Medieval Village)
- **Theme:** cozy wattle-and-daub cottages with peaked thatch roofs, a central well, market stalls with striped awnings, haystacks, cobbled streets (cross paths), a small chapel/tower, wooden carts, banner poles.
- **Palette:** golden-hour warm sky, warm hemi light, beige/tan ground (cobble texture, V3).
- **Layout:** village square center (well + market), cottages around the perimeter ringed by the existing perimeter walls (re-skinned as stone), lanes between buildings.
- **Props (V6):** `cottage()`, `well()`, `marketStall()`, `haystack()`, `bannerPole()`, `cart()`.
- **id:** `haven`.

### Map B — "Tropic" (Tropical beach)
- **Theme:** sandy beach, a turquoise lagoon (V5 water plane), **≥30 palm trees** (V6 prop, placed as clusters and along the shoreline via a loop, each added both to meshes and to collider AABBs for trunks), tiki huts, rocks, beached rowboat, beach umbrellas.
- **Palette:** bright cyan sky, turquoise fog, very bright hemi (tropical noon), sandy ground (sand texture, V3).
- **Layout:** palms ring the perimeter and cluster in corners; central open beach with tiki huts as cover; lagoon patch as a visual focal point (non-collidable).
- **Props (V6):** `palmTree()` (placed 30+ times), `tikiHut()`, `beachUmbrella()`, `rowBoat()`, `tropicalRock()`.
- **id:** `tropic`.

**Palm count requirement (≥30):** I'll place palms procedurally — e.g. ~8 perimeter pairs via `placePair` (16), plus corner clusters (3–4 each × 4 corners = ~14), totaling ≥30. Each palm's trunk gets a collider AABB. A test asserts the count.

### Map registry + tests
- `Maps.js`: `export const MAPS = [PLAZA, FOUNDRY, DUSTBOWL, HAVEN, TROPIC];`
- Update `src/tests/Maps.test.js` to expect 5 maps and the new ids (preserve the default = plaza assertion).
- Add `src/tests/PalmCount.test.js` to assert ≥30 palms in Tropic (via a dedicated exported counter or by counting colliderBoxes of a tagged prop — I'll expose a small `TROPIC.palmCount` or count via the prop registry).

## Testing & verification

- **Unit:** update `Maps.test.js`; shared `MapDefinition.test.js` + `MapColliderBoxes.test.js` auto-cover the new maps (spawns ≥8, waypoints ≥10, in-bounds, no-spawn-overlap, valid AABBs). Add the palm-count test. All 231 existing tests must stay green.
- **Runtime/visual:** build + run the dev server, screenshot each new map and each visual improvement in the browser (Playwright screenshots), confirm no console errors, confirm new music tracks load and play per mood. This is the primary acceptance for visual changes.
- **Headless-safe:** new map modules import `three` and use `makeBuildHelper().colliderPass()` at module load (same as existing maps) — no `document`, so server/tests stay headless. The `WaterPlane`/`Clouds`/prop visual builders are only invoked inside client `build()`, never in the collider pass.

## Out of scope (YAGNI)

- New weapons/animals or gameplay/balance changes.
- GLB/GLTF asset import (stay procedural primitives + procedural canvas textures).
- A full dynamic day/night cycle (V1 is a subtle drift, not a cycle).
- Networked map selection UI changes beyond the existing map buttons (which already enumerate `MAPS`).

## Risk / rollback

Everything is additive at the rendering/world layer. The one structural change is `MAPS` roster growth + the one locked test update. Each visual improvement and each map is independent and can be reverted in isolation. Music changes are backward-compatible (existing ids keep working). Work is on branch `visual-round-2`, merged only after review + green tests + visual sign-off.

## Execution plan (subagent-driven)

I'll execute via subagent-driven-development (fresh implementer subagent per task, spec + code-quality review after each). Task breakdown:

1. **Visual improvements V1–V4** (sun drift, contact shadows, ground textures, per-map hemi) — touches `Game.js`, `MapBuildHelper.js`, `TextureFactory.js`, `MapDefinition`.
2. **Sky/foliage V5–V7** (water plane, prop factory, clouds) — new `src/fx/` + `src/world/props/` modules.
3. **HUD/crosshair/end-screen V8–V10** — `Hud.js`, `Crosshair.js` wiring, `EndScreen.js`.
4. **Music expansion** — `MusicPlayer.js` + call sites.
5. **Map: Haven (medieval village)** — new map module + register.
6. **Map: Tropic (tropical)** — new map module + register + palm-count test.
7. **Test updates + final visual audit** — `Maps.test.js`, new tests, screenshots, green suite.

Each task ends with spec + code-quality review and a commit on the branch.
