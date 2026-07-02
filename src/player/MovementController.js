import * as THREE from 'three';
import { MOVEMENT as M } from '../config/Movement.js';
import { forwardVector, rightVector } from './Player.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

// Integrates one fixed tick for a player against the collider store.
export function tickMovement(player, dt, colliderStore) {
  if (!player.alive) return;

  const intent = player.intent;
  forwardVector(player, _fwd);
  rightVector(player, _right);

  // Wish direction in world space (normalized horizontal)
  _wish.set(0, 0, 0)
    .addScaledVector(_fwd, intent.forward)
    .addScaledVector(_right, intent.strafe);
  const hasInput = _wish.lengthSq() > 0.0001;
  if (hasInput) _wish.normalize();

  const maxSpeed = intent.sprint ? M.SPRINT : M.WALK;
  const accel = player.onGround ? M.ACCEL : M.AIR_ACCEL;

  // Horizontal acceleration toward wishdir * maxSpeed
  const targetVx = _wish.x * maxSpeed;
  const targetVz = _wish.z * maxSpeed;
  player.velocity.x = moveToward(player.velocity.x, targetVx, accel * dt);
  player.velocity.z = moveToward(player.velocity.z, targetVz, accel * dt);

  // Ground friction when no input on ground
  if (player.onGround && !hasInput) {
    const drop = M.FRICTION * dt;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const newSpeed = Math.max(0, speed - drop);
    if (speed > 0.0001) {
      const scale = newSpeed / speed;
      player.velocity.x *= scale;
      player.velocity.z *= scale;
    }
  }

  // Jump
  if (intent.jump && player.onGround) {
    player.velocity.y = M.JUMP_VELOCITY;
    player.onGround = false;
  }

  // Gravity
  player.velocity.y -= M.GRAVITY * dt;

  // Integrate position
  player.position.x += player.velocity.x * dt;
  player.position.y += player.velocity.y * dt;
  player.position.z += player.velocity.z * dt;

  // Collide & resolve
  const resolved = colliderStore.resolveCapsule(player.position, M.CAPSULE_RADIUS, M.CAPSULE_HEIGHT);
  if (resolved.y !== player.position.y) {
    // we were pushed vertically -> killed vertical velocity
    if (player.velocity.y < 0 && resolved.y >= player.position.y) {
      // landed
    }
    if (resolved.onGround) player.velocity.y = 0;
    if (resolved.hitCeiling && player.velocity.y > 0) player.velocity.y = 0;
  }
  player.position.x = resolved.x;
  player.position.y = resolved.y;
  player.position.z = resolved.z;
  player.onGround = resolved.onGround;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
