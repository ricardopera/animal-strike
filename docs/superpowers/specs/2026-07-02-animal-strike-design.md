# AnimalStrike — Design Spec

**Status:** Approved (2026-07-02)
**Author:** Brainstorming session (user + ZCode)

## One-line Summary
A single-player, bot-populated, browser-based FPS deathmatch that *feels* like Krunker.io — fast movement, skill-based gunplay, animal-headed characters — built on Three.js.

## Confirmed Design Decisions
- **Visual:** stylized low-poly smooth shading (flat-shaded cartoon look)
- **Skins:** animal head on a humanoid gunner body (swap head + palette per animal)
- **Scope:** MVP core match loop first; full architecture planned for later expansion
- **Stack:** Vite + vanilla JS + Three.js (UI = HTML/DOM overlay)
- **Movement:** full parkour — bhop, slide, wall-run
- **Map:** 1 hand-crafted symmetrical arena
- **Weapons:** Assault Rifle + Sniper (hitscan)
- **Mode:** Free-for-all deathmatch (frag target / timer)

## Non-goals (MVP)
- No multiplayer / netcode (bots only)
- No external 3D model assets (everything procedural primitives)
- No persistent accounts / backend
- No advanced gamemodes (gun-game, team DM, classes) — documented as future hooks only

## Architecture
Game is a single-authoritative sim running in a fixed-timestep loop (60 Hz), decoupled from rendering via an accumulator. Systems are plain ES modules operating on a lightweight entity data shape (no heavy ECS framework). Each frame: **input → simulation → render**. The DOM overlay handles all menus/HUD; the canvas only draws the 3D world. Bots reuse the *same* `Player` entity + movement/weapon code as the human; an `AIController` writes to the bot's intent instead of raw input.

## Components & Responsibilities

### `core/`
- **Game.js** — owns the renderer, scene, camera, world, all players, match state, and the main loop tick. Top-level orchestrator.
- **FixedTimestep.js** — accumulator loop. `update(realDt, fixedCb)` runs `fixedCb(STEP)` N times at 1/60s, capped at 5 ticks/frame to avoid spiral-of-death.
- **InputState.js** — pointer-lock mouse → yaw/pitch deltas; WASD/Space/Shift/R/Tab key booleans. Produces a per-frame intent snapshot.
- **EntityStore.js** — arrays of all players (local + bots) with `add/remove/forEach`. Bots are full `Player` entities.
- **math.js** — pure helpers: `clamp`, `angleDelta`, `moveTowards`, vec ops. Fully unit-tested.

### `config/`
- **Weapons.js** — per-weapon id: damage, rpm, mag size, reload time, spread, damage falloff, recoil pattern, auto/semi flag.
- **Animals.js** — per-animal id: head builder fn, palette, stat multipliers (speedMul, hpMul). Roster: Fox, Wolf, Panda, Tiger, Bear, Bunny, Owl.
- **Movement.js** — speeds, gravity, friction, jump force, all parkour tuning constants.
- **Match.js** — frag target, match length, respawn delay, spawn-point rules.

### `world/`
- **ArenaBuilder.js** — builds the one symmetrical arena from primitive geometry: ground plane, 12–16 cover boxes, ramps, 2 raised platforms, perimeter walls.
- **ColliderStore.js** — holds `THREE.Box3` AABBs. `addFromMesh(mesh)`, `collidesCapsule(x,y,z,radius,height)`, `raycast(origin,dir)` for LOS/hitscan.
- **SpawnPoints.js** — 8–12 symmetrical markers; `getRandomSpawn(occupied)` returns the one farthest from live players.

### `player/`
- **Player.js** — factory: `{id, isLocal, position, velocity, yaw, pitch, health, loadout, score, deaths, ...}` + attaches a `CharacterView` group to the scene.
- **MovementController.js** — kinematics for a capsule (radius 0.4, height 1.8). Walk, sprint, jump, crouch (Phase 1); bhop, slide, wall-run (Phase 6). Axis-separated AABB collision resolution.
- **WeaponController.js** — `fire(dt, camera)`: hitscan raycast, fire-rate gating, ammo/reload, recoil application + recovery, damage falloff.
- **CharacterView.js** — `THREE.Group`: recolored humanoid body + animal head (from `Animals.headBuilder`) + gun mesh. `setAnimal(id)`, `setWeapon(id)`, speed-driven limb swing.

### `ai/`
- **AIController.js** — per-bot finite state machine: PATROL → CHASE → ENGAGE → RETREAT. Reads sensors, writes intent.
- **BotNavigation.js** — hand-placed waypoint graph (10–14 nodes) + A*/nearest-neighbor chase; wishdir output; LOS-based wall avoidance; jump-if-stuck.
- **BotAim.js** — target selection (nearest visible enemy), aim-point computation with accuracy cone + reaction-time "tuning in", smooth yaw/pitch rotation.
- **BotCombat.js** — fire/reload decisions via the shared `WeaponController`.

### `fx/`
- **BulletTracer.js**, **HitMarker.js**, **MuzzleFlash.js**, **DamageNumbers.js** — all pooled. Tracers fade 60ms; sparks/hitmarks at impact; floating damage numbers.

### `ui/` (all DOM)
- **Hud.js** — health bar, weapon name, ammo/mag, match timer, frag-target progress, killfeed.
- **Crosshair.js** — dynamic crosshair expanding with movement/firing.
- **Scoreboard.js** — Tab overlay: players sorted by score with K/D.
- **MainMenu.js** — animal grid (swatches + preview), weapon pick (AR/Sniper), settings, PLAY button → pointer lock + match start.
- **EndScreen.js** — podium, final scores, PLAY AGAIN.

## Data Flow (per frame)
1. `InputState` (or `AIController` for bots) produces an **intent** snapshot.
2. `Game.loop(realDt)` calls `FixedTimestep.update(realDt, tick)`.
3. Each `tick(STEP)`: `MovementController` integrates intent → updates player position/velocity (collision-resolved). `WeaponController` processes fire intent → emits hit events. Bots run their FSM.
4. After ticks: render pass — update camera to local player's eye, update `CharacterView` transforms, update pooled FX, `renderer.render()`.
5. HUD reads player/match state and writes to the DOM overlay.

## Error / Edge-case Handling
- **Collision seams:** axis-aligned boxes + simple ramps only in MVP; Phase 6 hardens wall probes for wall-run.
- **Falling out of world:** perimeter walls prevent; respawn safety net in Phase 5.
- **Spawn-killing:** `SpawnPoints.getRandomSpawn` picks farthest point from live players; brief spawn invulnerability (future polish).
- **Bot stuck states:** navigation jump-if-stuck heuristic + FSM timeout (lose target after N seconds).
- **Tab visibility / pointer-lock loss:** pause sim, show menu.

## Testing Strategy
- **Unit (Vitest, headless, no three.js):** `math.js`, `FixedTimestep`, `WeaponController` rate/ammo/reload, `BotAim` model, and movement behaviors (bhop/slide/wall-run) — these operate on plain data shapes.
- **Manual playtest checklist per phase:** movement feel, no clipping, bots fight back, match ends correctly.
- No browser/E2E automation in MVP — rendering verified by eye each phase.

## Performance Budget
- Target 60fps on mid-range hardware. Low-poly primitives, flat shading, capped pixel ratio, pooled FX, optional shadow map on arena only. Frustum culling is automatic in three.js.

## Key Algorithms (pinned for unambiguous implementation)
- **Fixed-timestep:** `acc += realDt; n=0; while(acc>=STEP && n<5){ cb(STEP); acc-=STEP; n++; }`
- **Capsule-vs-AABB collision:** resolve Y first (ground/ceiling, set onGround), then X, then Z by least penetration.
- **Hitscan:** ray from eye along `forward ± gaussian(spread)`; nearest of (AABBs ∪ enemy capsules); linear damage falloff `falloffStart→falloffEnd→0`.
- **Bhop air-strafe:** add only the *missing* velocity component along wishdir (Quake-style), capped at MAX_BHOP.
- **Bot FSM transitions:** PATROL↔CHASE on detectRange/LOS; CHASE↔ENGAGE on preferredRange; ENGAGE→RETREAT on low hp; RETREAT→PATROL on LOS-lost timeout.

## Risks & Mitigations
- **Movement feel is the whole game** → walk first, iterate; parkour only after core loop is fun.
- **Collision edge cases** → axis-aligned + simple ramps; harden in Phase 6.
- **Bot difficulty** → all knobs in `config`; start easy, tune by playtest.
- **Performance** → low-poly + pooling + capped pixel ratio from day one.

## Future Expansion (Phase 8, documented not built)
- Character classes (Animals stat multipliers → active abilities)
- Gun-game weapon progression
- Additional maps (each arena = its own `ArenaBuilder`)
- Team deathmatch (team fields + team spawns + friendly-fire flag)
- Cosmetic loadout persistence
- Server-authoritative netcode (entity/AI split is structured so a network layer can drop in)
