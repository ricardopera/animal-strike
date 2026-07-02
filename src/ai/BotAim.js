import * as THREE from 'three';
// Pure function: target = {pos:[x,y,z]}, opts = {accuracy, reactionProgress, errorRadius, rand}
// accuracy: 0..1 (1 = perfect). reactionProgress: 0..1 (how locked-on the bot is).
export function computeAimPoint(target, opts) {
  const { accuracy = 0.8, reactionProgress = 1, errorRadius = 2, rand = Math.random } = opts;
  const [x, y, z] = target.pos;
  // effective error: accuracy caps the peak error (1 -> always perfect, 0 -> always full),
  // and reactionProgress shrinks it as the bot tunes in (0 -> peak, 1 -> reduced).
  const eff = errorRadius * (1 - accuracy) * (1 - accuracy * reactionProgress);
  return [
    x + (rand() - 0.5) * 2 * eff,
    y + (rand() - 0.5) * 2 * eff,
    z + (rand() - 0.5) * 2 * eff,
  ];
}

// Select nearest visible (LOS clear) enemy. Returns {player, dist} or null.
export function selectTarget(bot, enemies, colliderStore) {
  const from = bot.position.clone(); from.y += 1.5;
  let best = null;
  for (const e of enemies) {
    const to = e.position.clone(); to.y += 1.5;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist > 60) continue;
    dir.normalize();
    const wall = colliderStore.raycast(from, dir, dist);
    if (wall && wall.dist < dist - 0.5) continue; // occluded
    if (!best || dist < best.dist) best = { player: e, dist };
  }
  return best;
}

// Smoothly turn current yaw/pitch toward a world-space aim point.
// current = {yaw, pitch}, aimWorldPoint = [x,y,z], fromPoint = [x,y,z].
export function turnToward(current, aimWorldPoint, fromPoint, turnSpeed, dt) {
  const dx = aimWorldPoint[0] - fromPoint[0];
  const dz = aimWorldPoint[2] - fromPoint[2];
  const dy = aimWorldPoint[1] - fromPoint[1];
  const horiz = Math.hypot(dx, dz);
  const desiredYaw = Math.atan2(dx, -dz) + Math.PI; // align with player.yaw convention (-sin/-cos)
  const desiredPitch = -Math.atan2(dy, horiz);
  return {
    yaw: approachAngle(current.yaw, desiredYaw, turnSpeed * dt),
    pitch: approachAngle(current.pitch, desiredPitch, turnSpeed * dt * 0.6),
  };
}

function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
