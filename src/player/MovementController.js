import * as THREE from 'three';
import { MOVEMENT as M } from '../config/Movement.js';
import { forwardVector, rightVector } from './Player.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _wallProbeDir = new THREE.Vector3();

export function tryStartWallrun(player, colliderStore, intent) {
  if (player.onGround) return false;
  if (player.moveState.wallrunsThisJump >= 1) return false;
  // only attempt if there's directional input
  if (!(intent.forward !== 0 || intent.strafe !== 0)) return false;
  // probe in the player's body-space movement direction (forward/strafe from yaw)
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  _wallProbeDir.set(
    -sinY * intent.forward + cosY * intent.strafe,
    0,
    -cosY * intent.forward - sinY * intent.strafe
  ).normalize();
  const origin = new THREE.Vector3(player.position.x, player.position.y + 0.9, player.position.z);
  const hit = colliderStore.raycast(origin, _wallProbeDir, 0.8);
  if (!hit) return false;
  player.moveState.wallrunning = true;
  player.moveState.wallrunTimer = M.WALLRUN_DURATION;
  player.moveState.wallrunsThisJump = (player.moveState.wallrunsThisJump || 0) + 1;
  return true;
}

// Integrates one fixed tick for a player against the collider store.
export function tickMovement(player, dt, colliderStore) {
  if (!player.alive) return;

  const wasOnGround = player.onGround;
  const intent = player.intent;
  tryStartSlide(player, intent);
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

  if (player.onGround) {
    // Ground: accelerate toward wishdir * maxSpeed
    const targetVx = _wish.x * maxSpeed;
    const targetVz = _wish.z * maxSpeed;
    player.velocity.x = moveToward(player.velocity.x, targetVx, accel * dt);
    player.velocity.z = moveToward(player.velocity.z, targetVz, accel * dt);
  } else if (hasInput) {
    // Air (Quake-style air-strafe): add only the missing component along wishdir,
    // so speed along wishdir never decreases and skilled strafing builds speed.
    const currentSpeed = player.velocity.x * _wish.x + player.velocity.z * _wish.z;
    const addSpeed = Math.min(maxSpeed * accel * dt * 0.1, Math.max(0, maxSpeed - currentSpeed));
    player.velocity.x += _wish.x * addSpeed;
    player.velocity.z += _wish.z * addSpeed;
  }

  // Ground friction (or slide physics while sliding)
  if (player.onGround) {
    if (player.moveState.sliding) {
      // low friction during slide; count down; exit when timer expires or speed drops low
      const friction = M.SLIDE_FRICTION;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const newSpeed = Math.max(0, speed - friction * dt);
      if (speed > 0.0001) {
        const scale = newSpeed / speed;
        player.velocity.x *= scale;
        player.velocity.z *= scale;
      }
      player.moveState.slideTimer -= dt;
      if (player.moveState.slideTimer <= 0 || newSpeed < M.WALK * 0.8) {
        player.moveState.sliding = false;
      }
    } else if (!hasInput) {
      const drop = M.FRICTION * dt;
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const newSpeed = Math.max(0, speed - drop);
      if (speed > 0.0001) {
        const scale = newSpeed / speed;
        player.velocity.x *= scale;
        player.velocity.z *= scale;
      }
    }
  }

  // Jump (and buffer for bhop chaining if pressed in the air just before landing)
  if (intent.jump) {
    if (player.onGround) {
      player.velocity.y = M.JUMP_VELOCITY;
      player.onGround = false;
    } else {
      // in the air — buffer the jump so a press just before landing chains into a bhop
      player.moveState.bhopBuffer = 0.12;
    }
  }
  // decay the buffer each tick
  if (player.moveState.bhopBuffer > 0) {
    player.moveState.bhopBuffer -= dt;
    if (player.moveState.bhopBuffer < 0) player.moveState.bhopBuffer = 0;
  }

  // Wall-run attach (before gravity, so we can override it)
  if (!player.moveState.wallrunning) {
    tryStartWallrun(player, colliderStore, intent);
  }

  // Gravity (reduced while wall-running)
  if (player.moveState.wallrunning) {
    player.moveState.wallrunTimer -= dt;
    if (player.moveState.wallrunTimer <= 0) {
      player.moveState.wallrunning = false;
    } else if (intent.jump) {
      // jump off the wall: forward + up boost
      player.velocity.y = M.WALLRUN_JUMP_UP;
      // small forward boost along current facing
      const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
      player.velocity.x += -sinY * M.WALLRUN_JUMP_FORWARD;
      player.velocity.z += -cosY * M.WALLRUN_JUMP_FORWARD;
      player.moveState.wallrunning = false;
    } else {
      player.velocity.y -= M.WALLRUN_GRAVITY * dt; // much reduced gravity while wall-running
    }
  } else {
    player.velocity.y -= M.GRAVITY * dt;
  }

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

  if (player.onGround && !wasOnGround) {
    applyBhopOnLand(player);
    player.moveState.wallrunning = false;
    player.moveState.wallrunsThisJump = 0;
  }
}

export function applyBhopOnLand(player) {
  if (player.moveState.bhopBuffer > 0) {
    // chain the bhop: keep speed, re-jump, cap at MAX_BHOP
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed > M.MAX_BHOP) {
      const s = M.MAX_BHOP / speed;
      player.velocity.x *= s;
      player.velocity.z *= s;
    }
    player.velocity.y = M.JUMP_VELOCITY;
    player.onGround = false;
  } else {
    // landed without jump -> clamp to sprint (friction will continue next ticks)
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed > M.SPRINT) {
      const s = M.SPRINT / speed;
      player.velocity.x *= s;
      player.velocity.z *= s;
    }
  }
  player.moveState.bhopBuffer = 0;
}

export function tryStartSlide(player, intent) {
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  if (intent.crouch && intent.sprint && player.onGround && speed > M.SLIDE_SPEED_THRESHOLD && !player.moveState.sliding) {
    player.moveState.sliding = true;
    player.moveState.slideTimer = M.SLIDE_DURATION;
    // small forward boost
    const s = speed > 0 ? 1.1 : 1;
    player.velocity.x *= s;
    player.velocity.z *= s;
    return true;
  }
  return false;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
