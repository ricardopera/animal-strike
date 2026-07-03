import * as THREE from 'three';
import { MOVEMENT } from '../config/Movement.js';
import { ANIMALS } from '../config/Animals.js';

// Player entity. pos.y is FEET position (bottom of capsule).
// animalId selects the stat block (speed/HP/jump/size multipliers) applied at creation.
export function createPlayer({ id, isLocal = false, position = new THREE.Vector3(0, 0, 0), yaw = 0, pitch = 0, animalId = null } = {}) {
  const animal = animalId ? ANIMALS[animalId] : null;
  const speedMul = animal ? animal.speedMul : 1;
  const hpMul = animal ? animal.hpMul : 1;
  const jumpMul = animal ? animal.jumpMul : 1;
  const sizeMul = animal ? animal.sizeMul : 1;
  const maxHealth = Math.round(100 * hpMul);
  return {
    id,
    isLocal,
    animalId,
    // stat multipliers (snapshot at creation so re-skinning mid-game doesn't recompute)
    speedMul,
    jumpMul,
    sizeMul,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    yaw,            // rotation around Y
    pitch,          // rotation around X (look up/down)
    health: maxHealth,
    maxHealth,
    alive: true,
    onGround: false,
    loadout: { primary: 'AR' },
    score: 0,
    deaths: 0,
    intent: { forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, firing: false, reloadRequested: false },
    view: null,     // CharacterView group, attached in Phase 3
    // movement state
    moveState: { sliding: false, slideTimer: 0, wallrunning: false, wallrunTimer: 0, wallNormal: null },
  };
}

export function eyePosition(player, out = new THREE.Vector3()) {
  return out.set(player.position.x, player.position.y + MOVEMENT.EYE_HEIGHT, player.position.z);
}

export function forwardVector(player, out = new THREE.Vector3()) {
  return out.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
}

export function rightVector(player, out = new THREE.Vector3()) {
  return out.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
}
