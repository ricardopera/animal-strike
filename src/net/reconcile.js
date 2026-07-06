// Pure client-side prediction reconciliation for the local player in
// multiplayer. Extracted from Game.js's onSnapshot callback so it can be
// unit-tested directly. Operates on plain objects — no THREE dependency.
//
// Design (naive prediction, no input-replay buffer):
// - The local sim runs the SAME movement code as the server, so for a healthy
//   connection the predicted position is ~1 round-trip AHEAD of the server's
//   snapshot. That forward-lead is EXPECTED and must NOT be "corrected" — any
//   continuous nudge toward the stale server position creates a
//   move-forward-get-pulled-back loop ("can't move / rubber-band").
// - The only safe POSITION correction is a HARD SNAP when the gap exceeds a
//   generous threshold (a real desync: spawn, teleport, wall-clipped, big
//   packet loss). No gentle nudging, ever.
// - AMMO: the local weapon is authoritative; the server's value is ~1 round-
//   trip stale, so resyncing mid-fight makes the counter bounce. Only correct
//   on a discontinuity (respawn) or a large positive gap while not firing.
// - RESPAWN: when the server's `alive` flips to true while we were dead, fully
//   adopt the server's position/velocity/yaw/pitch/ammo and reset the local
//   intent so the prediction resumes cleanly (otherwise stale velocity/intent
//   from before death carry into the respawn → "moves without command").

export const DRIFT_SNAP_THRESHOLD = 3.0; // meters before a hard position snap
export const AMMO_RESYNC_GAP = 3;        // server-has-more gap that triggers ammo resync

// Mutates `state` (the local predicted player + weapon) according to one
// received snapshot entry `me` (the local player's authoritative server state).
//
//   state = { position:{x,y,z}, velocity:{x,y,z}, yaw, pitch, alive, health, intent:{firing}, weapon:{ammo,reloading} }
//   me    = { x, y, z, vx, vy, vz, yaw, pitch, alive, hp, ammo, ... }
//
// Returns a description of what was applied: { respawned, snapped, ammoResync }.
export function reconcileSnapshot(state, me) {
  const out = { respawned: false, snapped: false, ammoResync: false };
  if (!me) return out;

  const wasDead = !state.alive;
  // 1. Respawn discontinuity — adopt server state fully, reset local prediction.
  if (wasDead && me.alive) {
    state.position.x = me.x; state.position.y = me.y; state.position.z = me.z;
    state.velocity.x = me.vx || 0; state.velocity.y = me.vy || 0; state.velocity.z = me.vz || 0;
    state.yaw = me.yaw;
    state.pitch = me.pitch;
    if (state.intent) {
      state.intent.forward = 0; state.intent.strafe = 0;
      state.intent.jump = false; state.intent.sprint = false; state.intent.crouch = false;
      state.intent.firing = false; state.intent.reloadRequested = false;
    }
    if (state.weapon) { state.weapon.ammo = me.ammo; state.weapon.reloading = false; }
    out.respawned = true;
  }

  state.health = me.hp;
  state.alive = me.alive;

  // 2. Ammo — local weapon authoritative; only resync on a clear discontinuity.
  if (state.alive && state.weapon) {
    const ammoGap = me.ammo - state.weapon.ammo;
    const firing = !!(state.intent && state.intent.firing);
    // Only correct when the server has MORE ammo by a meaningful margin AND the
    // player isn't mid-trigger (a reload/refill, not a firing round-trip).
    if (ammoGap > AMMO_RESYNC_GAP && !firing) {
      state.weapon.ammo = me.ammo;
      out.ammoResync = true;
    }
  }

  // 3. Position — hard snap on large drift only. No continuous nudging.
  if (!out.respawned) {
    const dx = me.x - state.position.x;
    const dy = me.y - state.position.y;
    const dz = me.z - state.position.z;
    const drift = Math.hypot(dx, dy, dz);
    if (drift > DRIFT_SNAP_THRESHOLD) {
      state.position.x = me.x; state.position.y = me.y; state.position.z = me.z;
      // Re-derive velocity from the server so the next predicted tick is stable.
      if (typeof me.vx === 'number') {
        state.velocity.x = me.vx; state.velocity.y = me.vy; state.velocity.z = me.vz;
      }
      out.snapped = true;
    }
    // drift <= threshold: prediction is within expected forward-lead — leave it.
  }

  return out;
}
