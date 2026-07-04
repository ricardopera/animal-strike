# Multiplayer (Peer-Hosted, Server-Authoritative) — Design Spec

**Date:** 2026-07-04
**Status:** Approved (host-authoritative Node sim + WebSocket transport, snapshot/interpolation, 6 players with bot backfill)
**Roadmap item:** "Server-authoritative netcode — the entity/AI split is structured so a network layer can drop in"

## Goal

Add real human-vs-human multiplayer to AnimalStrike. One player runs a small Node server on their machine (the host); up to 5 others join via the host's `ip:port`. The server owns the authoritative simulation; all clients (host included) send inputs and render snapshots. Empty slots backfill with bots so every match feels full (6 total).

This is **not** internet matchmaking — players connect directly to the host on LAN or over the internet (host port-forwards). No cloud deployment, no scaling, no matchmaking service.

## Non-goals (explicitly out of scope for this project)

- Internet matchmaking / public room discovery / dedicated cloud servers
- LAN-only broadcast discovery (players type the host address)
- Client-side input-replay prediction (we use naive prediction — see §Client Feel; the upgrade path is noted)
- Lag compensation / favor-the-shooter rewinds
- Spectating, late-join mid-match, host migration
- Voice chat, text chat, accounts, authentication
- Anti-cheat beyond host-authority + server-trust-on-the-host-machine

## Architecture

A browser cannot accept inbound connections, so "host-authoritative" means a **Node process on the host machine** runs the sim, not the host's browser. The host *player* is just another client (with host privileges in the lobby). Single-hop latency; closing the host's browser tab does NOT kill the match (only stopping the Node server does).

The central design move: **extract the pure simulation logic from `Game.js` into a headless, renderer-free `Sim` module** that both the Node server and the single-player client reuse. The server runs `Sim` headlessly and authoritative; the client runs `Sim` locally only in single-player mode (and, for the local player only, as a naive predictor in multiplayer — see §Client Feel).

### Component map

```
┌─────────────────────────────────────────────────────────────────┐
│  server/index.js  (Node, host machine)                          │
│   WebSocketServer (ws) ──┐                                      │
│   Room { clients[], Sim }│                                      │
│   per fixed tick (60Hz): │                                      │
│     apply client inputs → Sim.tick(dt) → on every 3rd tick:    │
│       broadcast Sim.snapshot() to all clients                   │
└──────────────────────────┼──────────────────────────────────────┘
                           │  WebSocket (JSON)
       ┌───────────────────┼───────────────────────┐
       ▼                   ▼                       ▼
┌─────────────┐   ┌─────────────┐         ┌─────────────┐
│ Client (you)│   │ Client 2    │  ...    │ Client N    │
│ send inputs │   │ send inputs │         │ send inputs │
│ recv snap   │   │ recv snap   │         │ recv snap   │
│ interp+rend │   │ interp+rend │         │ interp+rend │
└─────────────┘   └─────────────┘         └─────────────┘
```

### The shared sim core: `src/sim/Sim.js`

Today `Game.js` (726 lines) mixes renderer, scene, input, sim, bots, UI, audio. We extract the **pure sim** so it runs headless on the server. `Sim` is a plain class with no THREE scene, no DOM, no `window`/`document`.

`Sim` owns:
- `players` (the existing entity array, plain data — reused verbatim)
- `bots` (AI controllers + their waypoint set — bot backfill lives here)
- `colliders` (a `ColliderStore` — built from the map's `colliderBoxes`, NOT from meshes)
- `match` state (timer, frag target, active, over)
- the active `MapDefinition` (for spawns + waypoints + identity only — never calls `.build()`)
- pending shot queue + recent events buffer

`Sim` methods (mirror what `Game.frame`'s fixed-update does today, minus rendering):
- `setPlayerIntent(playerId, intent)` — store a client's input
- `tick(dt)` — advance one fixed step: apply intents → `tickMovement` for each alive player → weapon updates → bot AI → hit resolution (`fireOneShot`/`fireOnePellet` logic) → respawns → match timer → events collected
- `snapshot()` → plain-object world state (see §Protocol)
- `startMatch(mapId, fragTarget, seconds)` — reset + build colliders from `colliderBoxes` + spawn players + backfill bots
- `handleDisconnect(playerId)` — convert that slot to a bot

`Game.js` is refactored to **own a `Sim`** and become a renderer/input/audio shell: each frame it reads local input → `sim.setPlayerIntent(local, intent)` → `sim.tick(dt)` (single-player authoritative) → reads `sim.snapshot()` → updates the THREE scene (CharacterView positions, viewmodel, FX, HUD). All logic moves into `Sim`; `Game.js` keeps only visuals/input/audio.

**Headless safety.** Movement, hit detection, and `ColliderStore` use `THREE.Vector3`/`Box3`/`Ray` — these are pure math and work in Node (three is already a dependency; they don't require WebGL). The one landmine is `TextureFactory` (calls `document.createElement('canvas')`) and the sky canvas in `Game.js` — neither is reachable from `Sim`, because the sim never builds meshes or textures. So `Sim` and its imports must not transitively import `TextureFactory` or anything touching `document`. A unit test imports `Sim` in the node test env to enforce this.

### Map contract addition: `colliderBoxes`

The server needs collider AABBs without meshes. Add a field to the `MapDefinition` config (and the class stores it):
- `colliderBoxes` — `[{min:[x,y,z], max:[x,y,z]}, ...]`, the AABBs of every solid in the map. Computed at module-load by the map's collider-only pass (below), so it's part of the `PLAZA`/`FOUNDRY`/`DUSTBOWL` instances, not a separate export.

The server builds its `ColliderStore` from this array (`colliders.addBox(min,max)`). The client keeps using `build()` exactly as today (it needs meshes; `addFromMesh` registers the same AABBs).

**One source of truth, two projections.** Rather than hand-maintaining `colliderBoxes` separately, each map module computes it via a **collider-only pass** over the same geometry authoring: `MapBuildHelper` gains a `colliderPass()` mode where the same `box()`/`placePair()` calls record each box's world AABB (`computeBoundingBox`-style from w/h/d + position) into an array instead of allocating THREE meshes. Each map's `build()` (client, meshes) and `colliderBoxes` (server, AABBs) are generated from the identical coordinate description. A test asserts each map's `colliderBoxes.length` equals the mesh count `build()` produces, so they cannot drift. The `MapDefinition` constructor grows `colliderBoxes` as a required field (validated non-empty array).

The three existing maps (Plaza/Foundry/Dustbowl) get a `colliderBoxes` field added to their `MapDefinition` config (computed from their existing geometry via the collider pass). The contract invariants test (§Testing) gains a `colliderBoxes.length > 0` check per map.

## Wire protocol

JSON over WebSocket. Messages tagged with `t`.

**Client → Server:**
- `{"t":"hello","name":"Rico","animal":"FOX","weapon":"AR"}` — connect + kit
- `{"t":"loadout","animal":"FOX","weapon":"AR"}` — change kit in lobby
- `{"t":"input","seq":N,"f":..,"s":..,"j":bool,"sp":bool,"c":bool,"fire":bool,"reload":bool,"yaw":..,"pitch":..}` — per local tick. `yaw`/`pitch` are **absolute** aim (server must know where you look); `f`/`s` are forward/strafe in −1..1; rest booleans; `seq` for ordering.
- `{"t":"start","map":"plaza","fragTarget":25,"seconds":300}` — host only
- `{"t":"kick","id":N}` — host only

**Server → Client:**
- `{"t":"welcome","you":N,"isHost":bool,"roster":[{id,name,animal,weapon,isBot},...]}` — assign client id + role
- `{"t":"roster","roster":[...]}` — roster change (join/leave/loadout/backfill)
- `{"t":"matchStart","map":"plaza","fragTarget":25,"seconds":300}`
- `{"t":"snapshot","tick":T,"players":[{id,x,y,z,vx,vy,vz,yaw,pitch,hp,wpn,ammo,score,alive},...],"events":[...]}` — ~20/sec. The core payload.
- `{"t":"matchEnd","ranked":[{id,name,animal,score,deaths},...]}`
- Event objects inside `snapshot.events`:
  - `{"k":"hit","shooter":N,"victim":N,"dmg":N,"hs":bool}`
  - `{"k":"kill","shooter":N,"victim":N,"hs":bool}`
  - `{"k":"shot","shooter":N,"ox":..,"oy":..,"oz":..,"dx":..,"dy":..,"dz":..}` — for tracer FX
  - `{"k":"reload","id":N}`

Server runs the sim at fixed 60Hz; broadcasts snapshots every 3rd tick (~20Hz). Inputs are applied to the tick they arrive for; the server keeps a 1-tick input buffer so a slightly-late packet still lands in the right step. A client's latest input is reused if no new one arrives (prevents a stalled client from freezing).

## Client feel

**Local player (the one whose input you control):**
- *Naive prediction:* run `tickMovement` on your own entity locally each render frame so movement responds instantly (no waiting for the round trip).
- *Reconciliation:* when a snapshot arrives, lerp your authoritative position toward the server's value over ~80ms. No input-replay buffer in v1 (deliberate simplification — replay buffers are the upgrade path; for LAN/decent-internet latency the visual lerp is imperceptible).
- *Your own shots:* send the fire intent to the server; locally raycast and draw the hitmarker immediately for feedback, then accept the server's authoritative damage result (if the server says you missed, the marker just doesn't "stick" — minor visual, acceptable).

**Remote players (everyone else, including bots):**
- *Never simulated locally.* Render purely by **interpolating** between the two latest snapshots, ~100ms behind real time, for smooth motion. Position via `Vector3.lerp`; yaw/pitch via shortest-arc angle interpolation (handle the ±π wrap).
- Health/weapon/ammo/score are snap-updated from the latest snapshot (no interpolation — they're discrete).
- Hit/death/shot/reload events drive FX (tracers, sparks, killfeed) when first seen (track seen-event ids).

**Disconnect / host tab close:** if the server stops responding for >5s, the client shows "Disconnected from host" and returns to the menu. The host's *browser* tab closing does NOT affect the match (only the Node server matters); the host player's entity just stops sending inputs and the server keeps it idling or converts it to a bot after a grace period.

## Lobby & menu

The main menu gains a **mode picker**: Single Player / **Host** / **Join** (replacing the single PLAY flow; single-player becomes one of three modes).

- **Single Player** — exactly today's experience (local authoritative `Sim`, no server).
- **Host** — shows the command to run (`node server/index.js`), the detected local IP + port (the "join code"), a 6-slot roster preview, a map picker (reuses the existing map selector), frag target + match length selectors, and a START button (host only). Roster fills with bots up to 6. On START, the client connects to its own server at `ws://localhost:8080` as a normal client.
- **Join** — a single text field for `host:port`, a connect button, then shows the lobby roster + waits for the host to start.

Existing animal/weapon/map selectors are reused in both Host and Join flows. The lobby is a lightweight DOM overlay (matches the existing menu styling).

## Server: `server/index.js`

A single Node entrypoint using the `ws` package:
- Creates a `WebSocketServer` on port 8080 (configurable via `PORT` env).
- Owns one `Room`: a `Sim` instance + the connected clients + lobby state.
- Lobby phase: accept `hello`/`loadout`, broadcast `roster` on changes. The room caps at `MAX_PLAYERS=6` total; humans take slots first, bots backfill the remaining slots up to 6 only when the host starts (during lobby, bots are placeholder slots shown in the roster).
- On host `start`: `sim.startMatch(map, fragTarget, seconds)`, broadcast `matchStart`.
- Match phase: fixed 60Hz loop (`setInterval`-driven accumulator or `setTimeout` chain) → for each client, `sim.setPlayerIntent(id, latestInput)` → `sim.tick(1/60)` → every 3rd tick broadcast `sim.snapshot()`. Collect events inside `Sim.tick` and embed in the snapshot.
- On frag target reached or timer zero: `matchEnd` broadcast, return to lobby.
- On client disconnect: `sim.handleDisconnect(id)` → that slot becomes bot-controlled; broadcast `roster`.
- On `kick` (host): close that client's socket, convert slot to bot.

`server/package.json` declares `ws` + imports `Sim` (and transitively `three`, `ColliderStore`, map modules) from `../src`. Vite/esbuild bundles the server if needed, or Node runs the ESM directly (the codebase is already ESM). A `server/README.md` documents running it.

## Testing

Three layers, all Vitest in node env (existing pattern):

1. **Sim-core unit tests** (`Sim.test.js`) — `Sim` runs headless in node (enforces no-`document` safety). Tests: `tick(dt)` moves a player given an intent; hit detection damages the right victim; headshots apply the multiplier; respawn uses the farthest spawn; match timer counts down; `startMatch` rebuilds colliders; `snapshot()` shape matches the protocol; determinism (two `Sim`s fed identical inputs produce identical snapshots).

2. **Protocol round-trip + map colliderBoxes** (`maps/` contract + a protocol test) — every map exposes `colliderBoxes` whose count matches `build()`'s mesh count; `colliderBoxes` are valid AABBs (min < max); `Sim` built from `colliderBoxes` resolves collisions the same as one built from meshes for a known position.

3. **Loopback integration test** (`server/integration.test.js`) — spin up the real `WebSocketServer` on an ephemeral port in-process, connect a real `WebSocket` client, send `hello` + `input`, and assert a `snapshot` arrives with the client's player moved. This is the end-to-end proof that server + sim + transport wire together. Skipped if `ws` import fails (graceful).

Existing tests (110) stay green. The sim extraction is the riskiest step; mitigation: `Game.js` behavior in single-player is unchanged (it delegates to `Sim`), and a runtime single-player playtest screenshot must look identical to before.

## Out of scope (YAGNI) — explicit

- Internet matchmaking, public room discovery, dedicated cloud servers.
- LAN auto-discovery (type the host address).
- Client-side input-replay prediction (naive prediction now; replay is the documented upgrade path).
- Lag compensation / favor-the-shooter rewind.
- Spectating, late-join mid-match, host migration, reconnect.
- Voice/text chat, accounts, auth, persistent stats.
- Anti-cheat beyond host-authority.

## Risk / rollback

The sim-core extraction is the dominant risk (it restructures `Game.js`). Mitigations:
- The extraction is mechanical: the body of `Game.frame`'s fixed-update callback moves into `Sim.tick` verbatim; `Game.js` calls into it. Single-player behavior must be visually identical (verified by screenshot).
- The server is additive — it does not touch the single-player path. If multiplayer has issues, single-player is unaffected.
- Each phase commits independently on a feature branch (`dev-multiplayer`), so any layer can be reverted.
- The `colliderBoxes` contract addition is backward-compatible (client ignores it; server uses it).

## Build/run additions

- `server/package.json` (new): `{ "type":"module", "dependencies": { "ws": "^8" } }`.
- New npm scripts in the root: `"host": "node server/index.js"`.
- No change to the client build (Vite) — the multiplayer client code is normal ES modules bundled as usual.
- The server imports shared modules from `src/` (Sim, ColliderStore, maps) — no duplication.
