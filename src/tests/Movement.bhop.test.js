import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { applyBhopOnLand } from '../player/MovementController.js';

describe('bhop on land', () => {
  it('preserves horizontal speed when jump was pressed in pre-land window', () => {
    const p = createPlayer();
    p.velocity.set(12, -1, 0);
    p.moveState.bhopBuffer = 0.05; // jumped just before landing
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeGreaterThan(11); // preserved, not decayed to sprint
    expect(p.velocity.y).toBeCloseTo(M.JUMP_VELOCITY);
  });
  it('decays to sprint when no jump buffer', () => {
    const p = createPlayer();
    p.velocity.set(12, -1, 0);
    p.moveState.bhopBuffer = 0;
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeLessThan(M.SPRINT + 0.1);
  });
  it('caps horizontal speed at MAX_BHOP', () => {
    const p = createPlayer();
    p.velocity.set(20, -1, 0);
    p.moveState.bhopBuffer = 0.05;
    applyBhopOnLand(p);
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    expect(speed).toBeLessThanOrEqual(M.MAX_BHOP + 0.01);
  });
});
