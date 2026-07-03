import { describe, it, expect } from 'vitest';
import { turnToward } from '../ai/BotAim.js';

// Regression test: a bot turned toward a target must produce a forward direction
// (using the same yaw/pitch convention as Game.fireOneShot) that points AT the
// target. This catches sign errors in turnToward's yaw/pitch math — a previous
// bug had bots aiming ~180° away from their target.

// Forward direction derived from yaw/pitch, matching Game.fireOneShot:
//   dir = (-sin(yaw)*cos(pitch), sin(pitch), -cos(yaw)*cos(pitch))
function forwardFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

describe('turnToward aims at the target (regression: sign correctness)', () => {
  it('points forward (-Z) at a target straight ahead', () => {
    // bot at origin facing target at (0, eye, -10) -> pure -Z
    const turned = turnToward({ yaw: 0, pitch: 0 }, [0, 1.5, -10], [0, 1.5, 0], 100, 1);
    const dir = forwardFromYawPitch(turned.yaw, turned.pitch);
    // forward should be ~ (0, 0, -1)
    expect(dir[0]).toBeCloseTo(0, 5);
    expect(dir[1]).toBeCloseTo(0, 5);
    expect(dir[2]).toBeLessThan(-0.99);
  });

  it('points up at a target directly above', () => {
    const turned = turnToward({ yaw: 0, pitch: 0 }, [0, 11.5, 0], [0, 1.5, 0], 100, 1);
    const dir = forwardFromYawPitch(turned.yaw, turned.pitch);
    expect(dir[1]).toBeGreaterThan(0.99); // positive Y = up
  });

  it('points down at a target below', () => {
    const turned = turnToward({ yaw: 0, pitch: 0 }, [0, -8.5, 0], [0, 1.5, 0], 100, 1);
    const dir = forwardFromYawPitch(turned.yaw, turned.pitch);
    expect(dir[1]).toBeLessThan(-0.99); // negative Y = down
  });

  it('the shot direction has positive dot product with the direction to the target (general case)', () => {
    // target up-and-to-the-front-right
    const target = [5, 4, -6];
    const from = [0, 1.5, 0];
    const turned = turnToward({ yaw: 0, pitch: 0 }, target, from, 100, 1);
    const dir = forwardFromYawPitch(turned.yaw, turned.pitch);
    // vector from bot to target, normalized
    const to = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
    const tlen = Math.hypot(to[0], to[1], to[2]);
    const dot = (dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2]) / tlen;
    expect(dot).toBeGreaterThan(0.99); // within ~8° of the target
  });
});
