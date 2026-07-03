import * as THREE from 'three';
import { MOVEMENT } from '../config/Movement.js';

// Player entity. pos.y is FEET position (bottom of capsule).
export function createPlayer({ id, isLocal = false, position = new THREE.Vector3(0, 0, 0), yaw = 0, pitch = 0 } = {}) {
  return {
    id,
    isLocal,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    yaw,            // rotation around Y
    pitch,          // rotation around X (look up/down)
    health: 100,
    maxHealth: 100,
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
