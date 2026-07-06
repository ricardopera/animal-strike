import { describe, it, expect } from 'vitest';
import { reconcileSnapshot } from '../net/reconcile.js';

function makeState(overrides = {}) {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, alive: true, health: 100,
    intent: { forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, firing: false, reloadRequested: false },
    weapon: { ammo: 30, reloading: false },
    ...overrides,
  };
}

describe('reconcileSnapshot — movement loop (Bug 1)', () => {
  it('does NOT nudge on mild forward-lead drift (the move-and-return loop)', () => {
    // Simulate continuous forward motion: the client predicts ~0.7m ahead of
    // the (stale-by-RTT) server snapshot. The OLD code nudged the client back
    // toward the server every snapshot → "move forward, get pulled back."
    const state = makeState({ position: { x: 10, y: 0, z: 0 } });
    const me = { x: 9.3, y: 0, z: 0, vx: 5, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 30 };
    const r = reconcileSnapshot(state, me);
    expect(r.snapped).toBe(false);
    // Position must be UNTOUCHED — no backward nudge.
    expect(state.position.x).toBe(10);
  });

  it('hard-snaps on large drift (real desync: teleport/wall-clip/packet loss)', () => {
    const state = makeState({ position: { x: 0, y: 0, z: 0 } });
    const me = { x: 10, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 30 };
    const r = reconcileSnapshot(state, me);
    expect(r.snapped).toBe(true);
    expect(state.position.x).toBe(10);
    // Velocity re-derived from server post-snap so prediction is stable.
    expect(state.velocity.x).toBe(0);
  });

  it('never applies a continuous lerp — drift just under threshold leaves position alone', () => {
    const state = makeState({ position: { x: 0, y: 0, z: 0 } });
    const me = { x: 2.9, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 30 };
    reconcileSnapshot(state, me);
    // drift 2.9 < 3.0 threshold → no change (would've been nudged under the old code)
    expect(state.position.x).toBe(0);
  });
});

describe('reconcileSnapshot — ammo bounce (Bug 2)', () => {
  it('does NOT reduce predicted ammo when server shows a stale (higher) count mid-firing', () => {
    // Player fired 2 shots: local ammo 28, server (1 RTT stale) still says 30.
    // Gap is 2 (< AMMO_RESYNC_GAP), and the OLD code with gap>3 wouldn't catch
    // this, but a naive "always resync" would bounce it back to 30. Verify the
    // small gap is ignored.
    const state = makeState({ weapon: { ammo: 28, reloading: false } });
    const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 30 };
    reconcileSnapshot(state, me);
    expect(state.weapon.ammo).toBe(28); // local stays authoritative
  });

  it('does NOT bounce ammo even on a larger gap WHILE firing (the rapid-fire bounce)', () => {
    // Rapid fire: local ammo 24, a snapshot from mid-burst says 29 (gap 5).
    // The player is mid-trigger. Resyncing here makes the counter jump back up
    // then drop again as local firing continues → flicker. Must be suppressed
    // while firing.
    const state = makeState({ weapon: { ammo: 24, reloading: false }, intent: { firing: true } });
    const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 29 };
    const r = reconcileSnapshot(state, me);
    expect(r.ammoResync).toBe(false);
    expect(state.weapon.ammo).toBe(24);
  });

  it('resyncs ammo on a large positive gap while NOT firing (legit reload/refill)', () => {
    const state = makeState({ weapon: { ammo: 5, reloading: false } });
    const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 30 };
    const r = reconcileSnapshot(state, me);
    expect(r.ammoResync).toBe(true);
    expect(state.weapon.ammo).toBe(30);
  });

  it('never lets the server reduce predicted ammo (anti-bounce invariant)', () => {
    // Server says 20, local says 25 (e.g. local fired but server hasn't seen it).
    // Gap is negative — never resync downward.
    const state = makeState({ weapon: { ammo: 25, reloading: false } });
    const me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, ammo: 20 };
    reconcileSnapshot(state, me);
    expect(state.weapon.ammo).toBe(25);
  });
});

describe('reconcileSnapshot — ghost movement on respawn (Bug 3)', () => {
  it('on respawn, fully adopts server state and resets stale intent/velocity', () => {
    // Dead player has stale velocity + a held-forward intent from before death.
    const state = makeState({
      alive: false,
      position: { x: 5, y: 0, z: 5 },
      velocity: { x: 6, y: 0, z: -6 }, // stale from before death
      intent: { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: true, reloadRequested: false },
      weapon: { ammo: 3, reloading: true },
    });
    // Snapshot says: respawned at spawn point (0,1,15), zero velocity, full mag.
    const me = { x: 0, y: 1, z: 15, vx: 0, vy: 0, vz: 0, yaw: 1.5, pitch: -0.2, alive: true, hp: 100, ammo: 30 };
    const r = reconcileSnapshot(state, me);
    expect(r.respawned).toBe(true);
    // Position/velocity fully adopted from server
    expect(state.position).toEqual({ x: 0, y: 1, z: 15 });
    expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.yaw).toBe(1.5);
    expect(state.pitch).toBe(-0.2);
    // Intent cleared — no ghost movement on the first post-respawn tick
    expect(state.intent.forward).toBe(0);
    expect(state.intent.sprint).toBe(false);
    expect(state.intent.firing).toBe(false);
    // Weapon reset to full, reload cancelled
    expect(state.weapon.ammo).toBe(30);
    expect(state.weapon.reloading).toBe(false);
    expect(state.alive).toBe(true);
  });

  it('does NOT treat staying-alive as a respawn', () => {
    const state = makeState({ alive: true, position: { x: 5, y: 0, z: 5 } });
    const me = { x: 5.4, y: 0, z: 5.4, vx: 1, vy: 0, vz: 1, yaw: 0, pitch: 0, alive: true, hp: 90, ammo: 25 };
    const r = reconcileSnapshot(state, me);
    expect(r.respawned).toBe(false);
    // Mild forward-lead drift, not snapped
    expect(state.position).toEqual({ x: 5, y: 0, z: 5 });
  });
});
