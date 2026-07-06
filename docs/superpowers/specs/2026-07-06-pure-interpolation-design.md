# Pure Snapshot Interpolation for Local Player — Design Spec

**Date:** 2026-07-06
**Status:** Approved (replace client-side prediction with pure snapshot interpolation for the local player)
**Supersedes:** the naive prediction + reconciliation approach in `src/net/reconcile.js`

## Goal

Eliminate the persistent "movement loop / rubber-banding" bug by replacing the fragile client-side movement prediction with pure snapshot interpolation. The local player's position/velocity will be driven entirely by interpolated server snapshots — the same technique `RemoteView` already uses successfully for remote players. No local movement simulation, no reconciliation, no drift, no snapping.

## Why prediction failed

The previous architecture used naive client-side prediction: the client ran the full movement simulation locally (`tickMovement`), then tried to reconcile with the server. This is fundamentally fragile without an **input-replay buffer** (the technique described by [Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) and [Glenn Fiedler](https://gafferongames.com/post/snapshot_interpolation/)). Without input replay, ANY tiny divergence — a 1-tick input phase offset, floating-point drift, collider sync mismatch between client (mesh-based AABBs) and server (pre-computed colliderBoxes) — accumulates until it crosses the snap threshold, causing the "move forward, teleport back" loop. Multiple rounds of threshold tuning (3m → 20m) and server fixed-timestep fixes couldn't eliminate it.

## Architecture: pure snapshot interpolation

The local player renders from interpolated server snapshots, exactly like remote players do today (which render smoothly). The client sends inputs to the server; the server's authoritative position drives the view via the existing `RemoteView` interpolation buffer.

```
Client (browser)                          Server (Node)
┌─────────────────────────────┐          ┌─────────────────────┐
│  Mouse → yaw/pitch (instant)│          │  60Hz fixed sim      │
│  WASD → send input          │ ────────▶│  apply input → tick  │
│                             │          │  snapshot @ 20Hz     │
│  Snapshot buffer (ring)     │          │  (pos, vel, yaw...)  │
│  Interpolate local player   │◀──────── │                      │
│  position @ 100ms behind    │          │                      │
│  Camera follows interp pos  │          │                      │
│  Weapon ticks locally (FX)  │          │                      │
└─────────────────────────────┘          └─────────────────────┘
```

### What changes (mostly deletion)

1. **Remove the prediction block** in `frameMultiplayer`: delete the `this.fixed.update(...tickMovement...)` loop. The local player no longer runs movement locally.

2. **Remove the reconciliation logic** in `onSnapshot`: delete the `reconcileSnapshot(...)` call and all the drift/ammo/respawn correction. There's no prediction to reconcile.

3. **Render the local player from snapshots.** The local player's position/velocity/yaw come from the interpolated snapshot buffer — the same `RemoteView.update()` that handles remote players. The key change: `RemoteView.update(localId)` no longer skips the local player; it interpolates ALL players including the local one.

4. **Camera follows the interpolated local position**, not the predicted entity. `frameMultiplayer` reads the local player's interpolated position from `RemoteView` and sets the camera there.

5. **Keep local weapon ticking** for instant firing feedback — just decouple it from the removed prediction block so it ticks every frame.

6. **Keep `fireOneShotLocalFx`** for instant muzzle/tracer/recoil feedback on click.

### What stays the same
- Mouse look (yaw/pitch → camera) — instant, no change
- Shooting, reload, viewmodel animation — instant (local weapon ticks)
- Remote player rendering — unchanged (already interpolates)
- Server architecture, protocol, bot backfill, reconnect — unchanged
- `NetClient`, `MainMenu`, server `Room` — unchanged

### The local player entity

Today the client creates a full `createPlayer(...)` entity for prediction and reconciliation. Under pure interpolation, the local player doesn't need a local physics entity at all — `RemoteView` manages its `CharacterView` and position from snapshots. But the camera and weapon still need "the local player's current state" (position for camera, yaw/pitch for aim, hp/alive/ammo for HUD). This state is read directly from the latest snapshot's `me` entry each frame.

### The tradeoff
- **~50–100ms movement input latency**: you press W, movement starts ~50ms later (one snapshot interval + render-delay). On localhost/LAN this is barely perceptible. This is the standard tradeoff for snapshot interpolation.
- **Zero rubber-banding, zero loops, zero drift** — the client never runs movement, so it can never diverge from the server.

## Files to change

```
src/core/Game.js          # MODIFY: frameMultiplayer — remove prediction, read local pos from RemoteView
src/net/RemoteView.js     # MODIFY: update() — interpolate ALL players (don't skip localId)
src/net/reconcile.js      # DELETE (no longer needed)
src/tests/reconcile.test.js # DELETE (tests for removed code)
```

## Testing

1. **Unit test**: `RemoteView.update()` now interpolates the local player too (don't skip `localId`). Extend `RemoteView.test.js` with a test verifying the local player's view is positioned from the snapshot buffer.
2. **Integration test**: the existing `server.integration.test.js` suite (240 tests) stays green — the server side is unchanged.
3. **Runtime**: two-browser-window smoke test confirming smooth movement, no loops, mutual visibility, shooting.
