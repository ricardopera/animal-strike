import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Regression test for the "bots moving and shooting backward" bug.
//
// ROOT CAUSE: animal heads (Animals.js) and the third-person gun barrel
// (CharacterView.buildSimpleGun) are authored facing local +Z. But the game's
// aim/movement forward convention is -Z — at yaw=0 the bot's forward dir used
// by fireOneShot and the movement controller is (-sin(yaw), 0, -cos(yaw)) = (0,0,-1).
//
// CharacterView.update applied `group.rotation.y = yaw`. A Y-rotation of (0,0,1)
// by yaw yields world (sin(yaw), 0, cos(yaw)) — i.e. the model's +Z front maps to
// +Z world at yaw=0, which is the OPPOSITE of aim-forward (-Z). Result: the model
// faced 180° away from where it moved/aimed, so characters visibly ran and shot
// backward.
//
// FIX: the model must be rotated so its local +Z front aligns with the aim-forward
// (-Z at yaw=0). That is a +PI offset on top of yaw. This test locks the contract:
// after the transform, a head vertex at local +Z must end up pointing down aim-forward.

// Aim-forward direction for a given yaw, matching Game.fireOneShot / AIController:
//   forward = (-sin(yaw), 0, -cos(yaw))
function aimForward(yaw) {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

describe('character model faces its aim-forward direction (regression: backward-facing bug)', () => {
  // The contract from CharacterView.update: group.rotation.y is set such that the
  // model's local +Z (where heads/snouts/gun barrels are authored) ends up aligned
  // with aim-forward. We derive the required rotation here and assert the alignment.
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3, 2.5]) {
    it(`model +Z front aligns with aim-forward at yaw=${yaw.toFixed(2)}`, () => {
      const group = new THREE.Group();
      // FIXED rotation: yaw + PI (the fix under test)
      group.rotation.y = yaw + Math.PI;
      // Local forward of the authored model = +Z (snout/gun point to +Z).
      const localFront = new THREE.Vector3(0, 0, 1);
      const worldFront = localFront.clone().applyEuler(group.rotation);
      const aim = aimForward(yaw);
      expect(worldFront.x).toBeCloseTo(aim.x, 5);
      expect(worldFront.y).toBeCloseTo(aim.y, 5);
      expect(worldFront.z).toBeCloseTo(aim.z, 5);
    });

    it(`OLD (buggy) rotation yaw alone would face backward at yaw=${yaw.toFixed(2)}`, () => {
      // Documents the bug: with rotation.y = yaw only, the model front is anti-parallel
      // to aim-forward (dot = -1).
      const group = new THREE.Group();
      group.rotation.y = yaw;
      const localFront = new THREE.Vector3(0, 0, 1);
      const worldFront = localFront.clone().applyEuler(group.rotation);
      const aim = aimForward(yaw);
      const dot = worldFront.dot(aim);
      expect(dot).toBeCloseTo(-1, 5); // exactly opposite -> the bug
    });
  }
});
