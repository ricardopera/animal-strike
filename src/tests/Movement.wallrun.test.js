import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPlayer } from '../player/Player.js';
import { tryStartWallrun } from '../player/MovementController.js';

describe('wall-run', () => {
  it('attaches to a wall when airborne and moving toward it', () => {
    const p = createPlayer();
    p.velocity.set(0, -2, 8); // moving forward, falling
    p.onGround = false;
    p.moveState.wallrunsThisJump = 0;
    // fake collider store: raycast hits a wall at 0.6m (within attach range)
    const fakeColliders = { raycast: () => ({ dist: 0.6, point: new THREE.Vector3(), box: {} }) };
    const started = tryStartWallrun(p, fakeColliders, { forward: 1, strafe: 0 });
    expect(started).toBe(true);
    expect(p.moveState.wallrunning).toBe(true);
  });
  it('does not attach if already used a wall-run this jump', () => {
    const p = createPlayer();
    p.onGround = false;
    p.moveState.wallrunsThisJump = 1;
    const fakeColliders = { raycast: () => ({ dist: 0.6 }) };
    expect(tryStartWallrun(p, fakeColliders, { forward: 1, strafe: 0 })).toBe(false);
  });
});
