import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { tryStartSlide } from '../player/MovementController.js';

describe('slide', () => {
  it('enters slide when crouching while sprinting above threshold', () => {
    const p = createPlayer();
    p.velocity.set(10, 0, 0);
    p.onGround = true;
    const started = tryStartSlide(p, { crouch: true, sprint: true });
    expect(started).toBe(true);
    expect(p.moveState.sliding).toBe(true);
    expect(p.moveState.slideTimer).toBeCloseTo(M.SLIDE_DURATION);
  });
  it('does not slide if too slow', () => {
    const p = createPlayer();
    p.velocity.set(5, 0, 0);
    p.onGround = true;
    expect(tryStartSlide(p, { crouch: true, sprint: true })).toBe(false);
    expect(p.moveState.sliding).toBe(false);
  });
});
