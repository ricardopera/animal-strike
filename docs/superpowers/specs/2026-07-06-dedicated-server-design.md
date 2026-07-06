# Multiplayer — Dedicated Server — Design Spec

**Date:** 2026-07-06
**Status:** Approved (single-room dedicated Node server; clients connect by IP:port; open auth; token reconnect; always-full bot backfill; player-selectable map + any-player start; docs-only NAT guidance)
**Supersedes:** `2026-07-04-multiplayer-design.md` (peer-hosted). The peer-hosted model is removed; this replaces it.

## Goal

Replace the existing peer-hosted multiplayer with a **dedicated server**: a standalone, always-on Node process that owns the authoritative game simulation. Clients never host games — they connect to the dedicated server's IP address on a configurable port. The server is authoritative for all game state, validates client inputs to prevent cheating, supports mid-match reconnection within a grace window, keeps matches full with bots, and broadcasts state updates to all connected clients.

This is **not** internet matchmaking and **not** multi-room. One process hosts one room (one lobby + match at a time). Two concurrent groups run two processes on two ports (documented in the deploy guide).

## Decisions (locked during brainstorming)

- **Auth:** open. No accounts, no login UI, no database. Connection validation only (handshake timeout, name sanitization/dedup, per-IP rate limiting, per-IP connection cap).
- **Reconnection:** token-based, 60-second grace. A dropped player's entity immediately becomes bot-controlled (so the match is never short), but a registry remembers `{playerId → token → entityId}` for 60s; if that player reconnects in time, the same entity flips back to human control with its score intact.
- **Scope:** full replace. The "Host" menu mode is removed. The menu becomes Single Player / Connect.
- **NAT/firewall:** docs-only. The deploy guide covers bind address, firewall rules, port-forwarding (home-hosted), and the cloud/VPS path. No STUN/TURN/UPnP code.
- **Map & start:** any connected player can change the map and start the match. The "first client is host" concept is gone.

## Non-goals (explicitly out of scope)

- Internet matchmaking / public room discovery / room browser.
- Multi-room hosting per process (scale-out = run more processes; documented).
- Accounts, login UI, persistent stats, database.
- Per-player secrets, real password auth, sessions/JWT.
- Voice/text chat, spectating, late-join beyond bot-replacement.
- Lag compensation / favor-the-shooter rewind.
- STUN/TURN/UPnP NAT-traversal code.
- Client-side input-replay prediction (naive prediction remains, as today; replay is the documented upgrade path).

## Architecture

A standalone Node process runs `server/index.js`. It binds to a configurable `HOST:PORT`, owns exactly one `Room` (one authoritative `Sim` + lobby/match lifecycle), and runs forever. Every client is a joiner; no client starts a server or has host privileges.

```
┌────────────────────────────────────────────────────────────┐
│  server/index.js  (Node, standalone process on a box)      │
│   load config (file + env + CLI) → Config                  │
│   WebSocketServer on HOST:PORT                             │
│   Room { Sim, clients, lobby state, reconnect registry,    │
│           rate limiters, validation }                      │
│   60Hz fixed loop: inputs → Sim.tick(dt) → 20Hz snapshots  │
│   stdin operator commands: start, map, status, stop        │
└──────────────────────┬─────────────────────────────────────┘
                       │  WebSocket (JSON), one room
       ┌───────────────┼───────────────────────┐
       ▼               ▼                       ▼
  Client (you)     Client 2      ...      Client N (≤ maxPlayers)
  send inputs      send inputs            send inputs
  recv snapshots   recv snapshots         recv snapshots
```

### Reuse vs. change from the existing peer-hosted code

**Reused (headless, authoritative — unchanged in spirit, lightly extended):**
- `src/sim/Sim.js` — the pure simulation. Owns players + bots, runs the fixed tick, does hit detection, snapshots state. Already headless and server-safe.
- `src/sim/protocol.js` — shared `msg()`/`parse()` helpers. Extended with the new message types.
- `src/world/ColliderStore.js` + each map's `colliderBoxes` — server-side collision without meshes.
- `src/net/NetClient.js` — browser WebSocket transport. Extended for `auth`/`reconnect`/`selectMap`.
- `src/net/RemoteView.js` — snapshot interpolation for remote players. Unchanged.

**Changed/removed:**
- `server/index.js` — `Room` loses the "first client is host" concept. Match start is driven by any player (or operator/auto-start). Adds: config loading, validation, rate limiting, reconnect registry, bot-replacement-on-join.
- `src/ui/MainMenu.js` — "Host" mode deleted; menu becomes Single Player / Connect. The Connect flow shows the lobby roster + a live map picker + a Start button (any player).
- `src/core/Game.js` — multiplayer bootstrap connects a `NetClient` to `ws://<address>`; never to `ws://localhost` as a host. Map selection comes from the server's `mapSelected` broadcasts.
- `server/README.md` — rewritten for dedicated deployment. New `docs/multiplayer-deployment.md`.

### Slot model — always full

During a match the `Sim` always holds exactly `maxPlayers` (default 6) entities — humans fill slots first, bots backfill the rest.

- **Match start:** connected humans are spawned; the remaining slots up to `maxPlayers` are filled with bots (`Sim.startMatch` already does this).
- **Late-join (human joins mid-match):** if there is a bot slot, the human **takes over a bot's entity** — the bot's position, health, score, alive-state, and loadout transfer to the new human; the bot is removed from `sim.bots`; the human is registered in `sim.humans`. The match stays full and the new player drops in where the bot was. If there is no bot slot (room full), the client is refused with `{"t":"kick","reason":"Server full"}`.
- **Leave mid-match:** the instant a human's socket closes, their entity converts to bot control (existing `Sim.handleDisconnect` behavior) — the match is never short. A reconnect-registry entry is recorded keyed by the former player id.
- **Lobby (no match):** only connected humans are shown; bots materialize at match start.

## Wire protocol

JSON over WebSocket. Messages tagged with `t`. `src/sim/protocol.js` is the single source of truth shared by client and server.

**Client → Server:**
- `{"t":"auth","name":"Rico","animal":"FOX","weapon":"AR"}` — join handshake (replaces `hello`). Name is validated + sanitized server-side.
- `{"t":"reconnect","id":"H2","token":"<opaque>"}` — reclaim an existing slot after a drop (alternative to `auth`). `id` + `token` must match a live registry entry.
- `{"t":"selectMap","map":"plaza"}` — lobby only; any player may send. Server validates the map id and broadcasts `mapSelected`.
- `{"t":"loadout","animal":"FOX","weapon":"AR"}` — change kit in lobby.
- `{"t":"start","map":"plaza"}` — lobby only; any player may send. `fragTarget`/`seconds` come from server config (not the client). Server starts the `Sim`.
- `{"t":"input","seq":N,"f":..,"s":..,"j":bool,"sp":bool,"c":bool,"fire":bool,"reload":bool,"yaw":..,"pitch":..}` — per local tick. Validated + clamped server-side. `yaw`/`pitch` are absolute aim; `f`/`s` are forward/strafe in −1..1.

**Server → Client:**
- `{"t":"welcome","you":"H2","token":"<opaque>","map":"plaza","roster":[...]}` — assigns id + a reconnect token (random, per-session, stored server-side keyed by player id). `map` is the lobby's currently-selected map (initialized to the server config default, then updated by `selectMap`), so a freshly-connected client shows the right map immediately.
- `{"t":"roster","roster":[{id,name,animal,weapon,isBot},...]}` — any roster change (join/leave/loadout/bot-swap). `isBot` lets clients distinguish human vs. bot.
- `{"t":"mapSelected","map":"plaza"}` — lobby map selection changed by any player.
- `{"t":"matchStart","map":"plaza","fragTarget":25,"seconds":300}`.
- `{"t":"snapshot","tick":T,"players":[{id,x,y,z,vx,vy,vz,yaw,pitch,hp,wpn,ammo,score,alive},...],"events":[...],"timeLeft":N}` — ~20/sec. The core payload; shape unchanged from today.
- `{"t":"matchEnd","ranked":[{id,name,animal,score,deaths,isBot},...]}`.
- `{"t":"kick","reason":"..."}` — server-initiated close (handshake timeout, rate limit, invalid input, full). Connection closes after sending.
- `{"t":"error","code":"...","msg":"..."}` — non-fatal protocol error (unknown message type, bad shape). Connection stays open.

**Snapshot `events` (unchanged from today):**
- `{"k":"hit","shooter":N,"victim":N,"dmg":N,"hs":bool}`
- `{"k":"kill","shooter":N,"victim":N,"hs":bool}`
- `{"k":"shot","shooter":N,"ox":..,"oy":..,"oz":..,"dx":..,"dy":..,"dz":..}` — tracer FX
- `{"k":"reload","id":N}`

### Reconnect flow (60-second grace)

1. On a successful `auth`, the server mints a random opaque token, sends it in `welcome`, and stores `{playerId → {token, entityId, expiresAt = now+60s}}` in the reconnect registry. The client persists `{id, token}` to `localStorage`.
2. On socket close, the server does **not** immediately forget the player. It converts the entity to bot control (match stays full) and keeps the registry entry alive for 60s.
3. If the same client reconnects within 60s (`{"t":"reconnect","id","token"}`), the server verifies token + id, finds the entity (currently bot-controlled), flips it back to human control (removes from `sim.bots`, registers in `sim.humans`, re-binds the new socket), and re-sends `welcome` + current `roster` + (if a match is running) the current `matchStart`. Score/position are whatever the bot accrued — that's fine and keeps it simple.
4. If 60s elapses with no reconnect, the registry entry is dropped; the entity stays a bot for the rest of the match.
5. A `reconnect` with an unknown/expired id or wrong token gets `{"t":"error","code":"bad_reconnect"}`; the client falls back to a fresh `auth`.

There is never an empty slot and never a frozen player.

## Match lifecycle & operator control

- **Map selection:** any connected player sends `selectMap` in the lobby; server validates + broadcasts `mapSelected`. The menu map picker is live for every Connect player. `selectMap` sent while a match is running is rejected with `error "match in progress"`.
- **Start:** any connected player sends `start` from the lobby. Server validates the map (or uses the lobby-selected one if `start` omits it), starts the `Sim` with server-configured `fragTarget` + `seconds`, broadcasts `matchStart`. `start` sent while a match is running is rejected with `error "match in progress"`.
- **Operator fallback:** the server process reads stdin for commands: `start [map] [fragTarget] [seconds]`, `map <id>`, `status`, `stop`. Also a `--auto-start` flag / `AS_AUTO_START` env waits until `minPlayers` humans are connected, then auto-starts.
- No client has privileged control. The old "first client is host" concept is gone.

### Config surface

`server/config.js` loads `server/config.json` (optional), overlays env vars, then CLI flags (flags win). Validated once at boot.

| Setting | Env | CLI | Default | Notes |
|---|---|---|---|---|
| Bind host | `AS_HOST` | `--host` | `0.0.0.0` | |
| Bind port | `AS_PORT` | `--port` | `8080` | 1–65535 |
| Max players | `AS_MAX_PLAYERS` | `--max-players` | `6` | 2–16 |
| Min players (auto-start) | `AS_MIN_PLAYERS` | `--min-players` | `2` | ≤ maxPlayers |
| Match map | `AS_MAP` | — | `plaza` | must be a known map id |
| Frag target | `AS_FRAG_TARGET` | — | `25` | > 0 |
| Match seconds | `AS_MATCH_SECONDS` | — | `300` | > 0 |
| Auto-start | `AS_AUTO_START` | `--auto-start` | `false` | starts when minPlayers connect |
| Password (open auth) | `AS_PASSWORD` | — | `""` (empty=open) | reserved for future; empty = open |
| Rate limit (conn/auth per IP) | `AS_RATE_LIMIT` | — | `5/10s` | |
| Max connections per IP | `AS_MAX_PER_IP` | — | `4` | |

Validation rejects bad port range, max-players outside 2–16, unknown map id, non-positive seconds/frag-target.

## Connection validation (open auth)

No accounts. The server still gatekeeps connections:

- **Handshake timeout:** a newly connected socket must send `auth` (or `reconnect`) within 5s or it is closed with `kick "handshake timeout"`.
- **Name validation:** trim, strip control characters, 1–16 chars; empty/invalid falls back to `Player`; duplicate active names get a numeric suffix (`Rico`, `Rico(2)`).
- **Per-IP rate limit:** token bucket on new connections + `auth` attempts per IP (default 5 per 10s). Excess → `kick "rate limit"`.
- **Per-IP connection cap:** at most `AS_MAX_PER_IP` (default 4) concurrent sockets per IP. Excess → `kick "too many connections"`.

## Input validation & anti-cheat

The server is authoritative, so a client cannot move other players or forge damage. Inputs are still sanity-checked so a malformed or hostile client can't destabilize the sim:

- **Message allowlist + shape check:** every inbound message is parsed and validated against an expected schema for its type. Unknown types → `error`; malformed shapes → drop (and count toward the rate limit).
- **Field clamping:** `f`/`s` clamped to `[−1, 1]`; `yaw` clamped to `[−π, π]`; `pitch` clamped to `[−π/2+ε, π/2−ε]`; booleans coerced; `seq` must be a non-negative integer. Out-of-range values are clamped, not rejected, so the game keeps flowing.
- **Input rate limit:** `input` messages capped at ~70/sec (server ticks at 60Hz). Excess dropped. Blocks a firehose-of-inputs DoS.
- **Fire-rate / ammo authority:** the server owns weapon state (`WeaponController`) and hit detection — a client can send `fire:true` but cannot exceed server-side `nextFireTime`/`mag`. This is the core anti-cheat and already exists; this spec documents and tests it.
- **No client-trusted state:** position, health, score, alive, ammo are all server-derived. The client's `sendInput` is the *only* way a client affects the world. This is the anti-cheat invariant, with a test.

## File structure

```
server/
├── index.js                 # MODIFY: Room (no host concept) + bootstrap main()
├── config.js                # CREATE: load + validate config (file/env/CLI)
├── validation.js            # CREATE: name sanitize/dedupe, message schema, input clamp
├── rateLimiter.js           # CREATE: token-bucket per-IP limiter + per-IP connection cap
├── reconnect.js             # CREATE: token registry, mint/verify/expire (60s grace)
├── config.json              # CREATE (example): documented default config
├── README.md                # REWRITE: dedicated deployment guide
└── (server tests colocated under src/tests/, per the existing pattern)

src/
├── sim/
│   ├── Sim.js               # MODIFY: late-join bot-takeover + always-full invariants
│   └── protocol.js          # MODIFY: add auth/reconnect/selectMap/mapSelected/kick/error builders + schemas
├── net/
│   ├── NetClient.js         # MODIFY: auth/reconnect/selectMap messages; persist {id,token}
│   └── RemoteView.js        # unchanged
├── ui/
│   └── MainMenu.js          # MODIFY: drop "Host"; Single/Connect; live lobby map picker + Start
└── core/
    └── Game.js              # MODIFY: Connect-only multiplayer bootstrap; map from mapSelected

docs/
└── multiplayer-deployment.md  # CREATE: LAN / port-forward / cloud-VPS / firewall guide

src/tests/
├── server.config.test.js          # CREATE
├── server.validation.test.js      # CREATE
├── server.rateLimiter.test.js     # CREATE
├── server.reconnect.test.js       # CREATE
├── server.integration.test.js     # REWRITE for new protocol (auth, no host)
└── (existing Sim.test.js, MapColliderBoxes.test.js, protocol.test.js — unchanged/ext.)

package.json                     # MODIFY: rename "host" → "server" script
```

## Testing

Vitest in node env (existing pattern; 148 tests today, all stay green).

1. **Config** (`server.config.test.js`) — env/CLI/file overlay precedence; defaults; validation rejects bad port / max-players out of range / unknown map / non-positive seconds.
2. **Validation** (`server.validation.test.js`) — name trim/strip/fallback; dedupe suffixing; input clamp on f/s/yaw/pitch; message-shape allowlist accepts known + rejects unknown; boolean coercion.
3. **Rate limiter** (`server.rateLimiter.test.js`) — token bucket allows burst then refills; per-IP cap rejects excess.
4. **Reconnect** (`server.reconnect.test.js`, via `createRoom`) — token minted on `auth`; `reconnect` within 60s restores the slot (entity flips bot→human, score retained); `reconnect` after expiry → entity is a bot + `bad_reconnect`; wrong token → `bad_reconnect`; on leave the entity immediately becomes a bot (match never short).
5. **Bot replacement** (extend `server.integration.test.js`) — mid-match join takes over a bot slot (`Sim.players.length` stays `maxPlayers`, `sim.bots` shrinks, `sim.humans` grows); mid-match leave converts to bot immediately (`Sim.players.length` unchanged, `sim.bots` grows).
6. **Loopback end-to-end** (extend `server.integration.test.js`) — spin up real `WebSocketServer` on an ephemeral port, connect a real `ws` client, do `auth` → `welcome` → `selectMap` → `mapSelected` → `start` → `matchStart` → send `input` → receive `snapshot` with the player moved; an over-rate-limit client → `kick`.
7. **Anti-cheat invariant** — a client sending `fire:true` faster than the weapon's fire rate produces no extra shot events server-side (assert `sim.events` shot count over a fixed window). A client sending `f:999` is clamped to `1` and moves at normal speed (no teleport).

## Risk / rollback

- The `Sim` is already headless and authoritative; the highest-risk change is the late-join bot-takeover + reconnect entity rebinding. Mitigation: targeted unit tests (items 4–5 above) + the loopback integration test, all on a feature branch `dev-dedicated-server`, committing per task so any layer can be reverted.
- Single-player is untouched (it still owns a local `Sim`); a multiplayer regression cannot break single-player.
- The peer-hosted code being removed is additive-only in `MainMenu.js`/`Game.js`; removal is mechanical.
