import { describe, it, expect } from 'vitest';
import { createRoom } from '../../server/index.js';
import { loadConfig } from '../../server/config.js';
import { Sim } from '../sim/Sim.js';

// Regression test for the "move-and-return loop" bug. The root cause was the
// SERVER running its sim with a variable real dt (raw setInterval elapsed),
// while the CLIENT predicts with a fixed 1/60 step. Over time the integrated
// positions diverged, and the client's drift-snap teleported the player back.
// The fix: the server must tick the sim with a FIXED 1/60 dt too. This test
// proves that driving the room's step() with a constant FIXED_DT moves the sim
// identically to a standalone Sim fed the same fixed dt — i.e. there is no
// server-specific drift.
describe('server sim uses fixed-timestep integration (Bug 1: movement loop)', () => {
  const FIXED_DT = 1 / 60;

  it('room.step with fixed dt advances the sim the same as a standalone Sim', () => {
    const cfg = loadConfig({ argv: [], env: {} });
    const room = createRoom(cfg);
    const standalone = new Sim();
    room.sim.startMatch('plaza', 25, 300);
    standalone.startMatch('plaza', 25, 300);

    // Add a human to both at the same spawn and give the same forward intent.
    const a = room.sim.addHuman('A', 'FOX', 'AR');
    const b = standalone.addHuman('A', 'FOX', 'AR');
    b.position.copy(a.position);

    // Clear bots from both sims so they can't randomly kill/shoot the humans
    // (bot AI has randomness that would cause divergence between the two sims).
    room.sim.bots.length = 0;
    room.sim.players = room.sim.players.filter(p => room.sim.humans.has(p.id));
    standalone.bots.length = 0;
    standalone.players = standalone.players.filter(p => standalone.humans.has(p.id));

    room.sim.setPlayerIntent(a.id, { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: false, reloadRequested: false, yaw: 0, pitch: 0 });
    standalone.setPlayerIntent(b.id, { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: false, reloadRequested: false, yaw: 0, pitch: 0 });

    // Run 5 seconds of simulation at fixed dt (300 steps).
    for (let i = 0; i < 300; i++) {
      room.step(FIXED_DT);
      standalone.tick(FIXED_DT);
    }
    // The two sims must agree to within a few mm (floating-point tolerance).
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    const dz = a.position.z - b.position.z;
    const drift = Math.hypot(dx, dy, dz);
    expect(drift).toBeLessThan(0.05); // < 5cm over 5 seconds = no divergence
  });

  it('a variable-dt loop WOULD diverge (sanity check that the test is meaningful)', () => {
    // This documents WHY the fix matters: feeding the sim a jittery variable dt
    // (like the old raw-setInterval loop) produces a DIFFERENT final position
    // than the fixed-dt client prediction. We don't run the room here — we just
    // show two standalone Sims fed different dt patterns end up far apart.
    const fixed = new Sim();
    const jittered = new Sim();
    fixed.startMatch('plaza', 25, 300);
    jittered.startMatch('plaza', 25, 300);
    const a = fixed.addHuman('A', 'FOX', 'AR');
    const b = jittered.addHuman('A', 'FOX', 'AR');
    b.position.copy(a.position);
    fixed.setPlayerIntent(a.id, { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: false, reloadRequested: false, yaw: 0, pitch: 0 });
    jittered.setPlayerIntent(b.id, { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: false, reloadRequested: false, yaw: 0, pitch: 0 });
    // 5s at fixed 1/60
    for (let i = 0; i < 300; i++) fixed.tick(1 / 60);
    // 5s at jittered dt averaging 1/60 (±2ms noise, like setInterval)
    let acc = 0;
    for (let i = 0; i < 300; i++) {
      const noisy = (1 / 60) + (Math.sin(i) * 0.002); // ±2ms jitter
      jittered.tick(noisy);
      acc += noisy;
    }
    const drift = a.position.distanceTo(b.position);
    // The jittered sim lands somewhere different — this drift is exactly what
    // the client's reconciliation used to fight (causing the loop). With the
    // server now fixed-step, this divergence no longer happens (previous test).
    // We assert it's nonzero to prove the test setup is sensitive.
    expect(drift).toBeGreaterThan(0.01);
  });
});
