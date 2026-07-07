# Canopy — high-altitude treehouse arena (design)

**Date:** 2026-07-07
**Status:** Design approved, pending user spec review
**Scope:** Add a 6th map (`Canopy`) to the AnimalStrike roster, plus the small engine prerequisite it requires (an optional fall-death plane).

## Goal

A high-altitude treehouse canopy arena built on towering ancient trees with multiple platforms and treehouses per trunk, connected by varied suspended walkways (rope bridges, wooden planks, metal catwalks). Traversal is parkour-friendly: narrow ledges, stair-stepped "ladder" platforms, skill gaps, and drop-downs that reward movement mastery. **Falling off any structure is instant death.** The trees are so tall that **players cannot see the ground** — the arena is platforms floating in mist, and the fog-occluded void below is the death mechanism.

Combat is balanced across layered sightlines: open aerial areas for medium/long range, tight treehouse interiors for close quarters, plus alternate stealth catwalks and vertical chokepoints.

## Decisions locked during brainstorming

| Question | Decision |
|---|---|
| Parkour scope | **Geometry-only.** No new movement modes. Ladders are stair-stepped platforms; ziplines are absent or decorative. Narrow ledges / skill gaps / multi-level platforms / drop-downs all use existing run/jump/bhop/slide/wallrun. |
| Layout | **Hub-and-spoke.** One central tallest "king" tree + 4 satellite trees. Safe main walkways into center, risky shortcuts between satellites. |
| Time of day | **Misty dawn.** Pale blue/teal sky, dense fog selling altitude + culling far draws, warm low sun, glowing lanterns as route cues. |
| Trees / ground | **Trees very tall, no ground.** No ground slab. Fog fully occludes everything below ~y20. Void below = death. |

## Engine prerequisite — optional `killY` fall plane

**Problem.** "Falling = instant death" has no mechanic today. `MovementController` integrates gravity and `ColliderStore.resolveCapsule` resolves collisions, but nothing checks a death plane — without this change a player who walks off a platform falls forever (or, on a no-ground map, infinitely). This is the single engine change that makes the canopy map possible.

**Design — opt-in, backward-compatible:**

1. `MapDefinition` gains an optional `killY` (number, world units). Validated in the constructor the same way `palette.hemisphere`/`sunColor` are: only type/shape-checked **when present**; when absent the map behaves exactly as today. No existing map passes it.
2. A shared, side-effect-free helper checks fall death:

   ```
   checkFallDeath(player, map) -> boolean
     true when map.killY != null && player.alive && player.position.y < map.killY
   ```

   Lives in a new tiny module `src/world/FallDeath.js` (no THREE import — pure math, headless-safe for the server).

3. Called at the **single chokepoint** in both player-tick loops, immediately after each player's `tickMovement(...)`:
   - `Game.js` fixed tick: for the local player and each bot.
   - `Sim.tick` (dedicated server): for each player in its movement pass.
4. On fall death:
   - `player.alive = false; player.health = 0; player.deaths += 1;`
   - **No frag awarded** (environmental death — there is no shooter).
   - HUD killfeed: `"<player> fell into the void"` (local victim reads `"You fell into the void"`).
   - Voice: the victim's animal death line.
   - The existing `respawnTimers.set(id, RESPAWN_DELAY)` + `respawnPlayer`/`_respawn` path handles respawn — **no new respawn machinery.**
5. Backward-compatibility guard: a test asserting every one of the 5 existing maps (`plaza`, `foundry`, `dustbowl`, `haven`, `tropic`) has `killY === undefined`, locking the guarantee that the feature changes nothing for them.

## Layout (180°-rotationally symmetric)

FFA fairness requires 180°-rotational symmetry (the project's rule, enforced via `placePair`). The hub-and-spoke is laid out symmetrically.

### Vertical band

- Play surfaces live in **y ≈ 30–52.**
- `killY = 12` (well below the lowest platform → only a genuine fall off a structure triggers death).
- Fog is tuned so anything below **y ≈ 20** is fully occluded. From any platform the player sees only mist below and the canopy above — the ground never renders.

### Trees (5 total)

**King tree** at `(0,0)` — its own rotational mirror (sits on the center).
- Trunk box from `y ≈ 2` (lost in fog) up to `y ≈ 54`.
- **4 stacked platform levels** at `y ≈ 30 / 37 / 44 / 51`, joined by internal stair-steps.
- This is the **vertical chokepoint** and power position; top deck has long sightlines across the whole canopy.
- **Three distinct ascent routes** so the top cannot be hard-camped: (a) a wide internal ramp, (b) a narrow external spiral ledge, (c) a wallrun-friendly trunk face.

**4 satellite trees** — a half-set `{(0,28), (28,0)}` mirrored to N/S/E/W.
- Each: trunk + **2 platforms** — lower `y ≈ 30`, upper `y ≈ 40` with a **treehouse interior** for close-quarters combat.

### Walkways (all collidable `place()`/`placePair()` boxes; variety = the parkour)

| Type | Width | Risk | Role |
|---|---|---|---|
| Spokes (satellite ↔ king) | 3m wooden planks | safe | main routes; lit by lanterns |
| Ring (satellite ↔ satellite) | 2m rope bridges | medium | open aerial sightlines for mid/long-range duels |
| Shortcuts | 1–1.2m narrow ledges + ~1.3m skill-gap jumps | high | cut interior diagonals; unlit (danger cue); bhopping clears them easily, walking is a gamble |
| Stealth catwalks | thin metal grates at `y ≈ 26` | high | run *under* the main ring, connecting satellite lowers; foliage-overhung for partial concealment; close-quarters |
| "Ladders" | stair-stepped 1m-rise platforms up each trunk | low | within the ~1.6m jump cap (JUMP_VELOCITY 8.5 / GRAVITY 22), so the player hops up rung by rung |

### Spawn points — staggered heights (anti-camp)

12 spawn points spread across `y = 30 / 34 / 38 / 42` on different platforms and walkways. `getRandomSpawn` already picks the farthest-from-enemies point; staggering Y means no single level is safe to hold. No spawn is on the king's top deck (avoids free power-position spawns).

### Waypoints — bots stay on walkable surfaces

Waypoints are placed **only on walkable surfaces at correct heights** along the safe spoke + ring network, fully connected through the king hub. The greedy nav then beelines along walkable geometry. Bots will preferentially use safe lit routes; occasional bot falls are possible and accepted as a thematic tradeoff (respawn handles it). No waypoints on the unlit skill-gap shortcuts (those are player-only rewards for movement mastery).

## Visuals & palette — misty dawn

- **Sky gradient** (4 stops, zenith→horizon): `['#3a6a9a', '#7a9ec0', '#c0d8e0', '#e8e8d8']` — pale blue/teal dawn.
- **Fog:** cool blue-grey, **density tuned to occlude the void** (denser than Haven's 0.005; value finalized during tuning, target hides everything below y≈20 from a y≈40 viewpoint).
- **Hemisphere light:** `[skyCool, groundWarmBounce]` — cool sky bounce + warm low ground bounce.
- **Sun:** warm `sunColor`, raking low angle, moderate intensity (~2.0–2.4).
- **Materials:** mossy bark trunks (`wood` tex, dark green-brown), weathered planks (`planks`), frayed rope bridges (woven torus/box strands), riveted metal catwalks (`metal`, high metalness/low roughness per MapBuildHelper).
- **Canopy foliage:** a few flat-shaded low-poly cone/sphere clusters atop each trunk. They read as the forest ceiling AND block vertical sightlines (cover from the top deck).
- **Route cues (the "clear visual cues for risky routes"):** warm glowing **lanterns** line safe routes (spokes + king ascents); risky shortcuts are deliberately unlit. Players learn: *lit = safe, dark = death.* Lanterns are emissive boxes (cheap, no real light source).
- **Atmosphere:** drifting clouds (reuse `Clouds` fx, placed *above* the canopy at y≈70 for depth, not below), and a distant foliage-silhouette ring at the play-area radius to frame the arena without a hard wall.

## Performance / LOD (WebGL budget)

- **No ground slab** — biggest single saving vs. other maps (Tropic/Haven have an 80×80 ground box).
- `flatShading` throughout (project standard).
- Materials reused across like-pieces (the Tropic `capMat = roofMat` pattern; shared `MeshStandardMaterial` instances per color/texture combo).
- Mesh budget ≈ Tropic's: ~5 trees × ~10 meshes + ~20 walkway boxes + ~30 prop/foliage/lantern meshes ≈ **~130–150 meshes**. Fog lets us skip far-detail entirely.
- Canopies are low-poly (8-segment cones) — chunky silhouettes, cheap.
- All geometry is boxes/cylinders/cones/planes — no heavy particles, no animated water on this map.
- Lantern glow is emissive material, not real lights (WebGL light budget stays at the existing hemisphere+sun).

## Files touched

**New:**
- `src/world/maps/Canopy.js` — the map (mirrors `Tropic.js`/`Haven.js` structure: `COLORS`, `SPAWN_POINTS`, `WAYPOINTS`, `authorGeometry(place, placePair)`, `build()`, module-load collider pass, `CANOPY` export).
- `src/world/props/Treehouse.js` — themed prop factories (mirrors `Village.js`/`PalmTree.js`): `canopyFoliage()`, `treehouse()`, `lantern()`, `walkwayDetail()` (rope strands, metal rivets). Each returns `{ group, boxes }`.
- `src/world/FallDeath.js` — the shared `checkFallDeath(player, map)` helper (pure, no THREE import).

**Edited:**
- `src/world/MapDefinition.js` — add optional `killY` field + validation.
- `src/world/Maps.js` — import + register `CANOPY` in the `MAPS` roster (6th entry).
- `src/core/Game.js` — after each player's `tickMovement(...)` in the fixed tick, call `checkFallDeath` and handle the death (no-frag, killfeed line, voice, respawn timer). Reuses existing `respawnTimers`/`respawnPlayer`.
- `src/sim/Sim.js` — mirror the same check in `Sim.tick`'s per-player movement pass, for dedicated-server parity.

**New tests:**
- `src/tests/Canopy.test.js` — contract test mirroring existing map tests (valid `MapDefinition`, non-empty `colliderBoxes`, `killY` set, spawn/waypoint counts, 180°-rotational symmetry of `placePair`-authored geometry).
- `src/tests/FallDeath.test.js` — opt-in behavior: returns false when `killY` unset; true when below `killY`; false for already-dead players.
- Extend `src/tests/Maps.test.js` (or a focused new test) — assert all 5 existing maps leave `killY === undefined` (backward-compat guarantee).

## Out of scope (YAGNI)

- Real ladder movement mode (geometry-only ladders instead).
- Zipline movement (absent on this map; may be decorative if cheap).
- Real point lights for lanterns (emissive materials only — perf).
- Bot parkour AI for the risky shortcuts (bots use safe routes only).
- Volumetric god-rays / particles (flat-shaded low-poly aesthetic only).
- Ground mesh / visible terrain below the canopy.
