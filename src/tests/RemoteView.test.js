import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RemoteView imports THREE (which is fine in node — pure math), but its
// constructor takes a scene and creates CharacterViews. We stub CharacterView
// to avoid pulling in any rendering surface, and give the view a fake scene.
vi.mock('../player/CharacterView.js', () => ({
  CharacterView: class {
    constructor() {}
    setAnimal() {}
    setWeapon() {}
    setPosition(x, y, z) { this._x = x; this._y = y; this._z = z; }
    update() {}
    setVisible() {}
    dispose() {}
  },
}));

import { RemoteView } from '../net/RemoteView.js';

// Helper: build a snapshot for one remote player at a given time/position.
function snap(id, x, y, z, extra = {}) {
  return {
    tick: 0,
    timeLeft: 300,
    events: [],
    players: [{ id, x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, wpn: 'AR', ammo: 30, score: 0, alive: true, animal: 'FOX', name: id, isBot: false, ...extra }],
  };
}

describe('RemoteView interpolation', () => {
  let perfSpy;
  beforeEach(() => { perfSpy = vi.spyOn(performance, 'now'); });
  afterEach(() => { perfSpy.mockRestore(); });

  it('interpolates position between the snapshots bracketing the render-delay target, not the two newest', () => {
    const rv = new RemoteView({});
    const id = 'B1';
    // Push snapshots at simulated times t=10.0, 10.05, 10.10 (50ms apart, ~20Hz).
    // Positions: x = 0, 5, 10 (moving +X at 100 units/s).
    perfSpy.mockReturnValue(10.0 * 1000); rv.pushSnapshot(snap(id, 0, 0, 0));
    perfSpy.mockReturnValue(10.05 * 1000); rv.pushSnapshot(snap(id, 5, 0, 0));
    perfSpy.mockReturnValue(10.10 * 1000); rv.pushSnapshot(snap(id, 10, 0, 0));
    // Now render at t=10.10. renderDelay=0.1 → target = 10.00.
    // The bracketing pair is snapshot[0]@10.0 and snapshot[1]@10.05, NOT the
    // newest two. At target=10.00, alpha=0 → position should be ~0 (snapshot[0]).
    perfSpy.mockReturnValue(10.10 * 1000);
    rv.update('LOCAL', 0.016);
    const v = rv.views.get(id);
    expect(v._x).toBeCloseTo(0, 1); // interpolated back to the oldest, alpha=0

    // Render at t=10.125 → target=10.025, between snapshot[0]@10.0 and [1]@10.05,
    // alpha=0.5 → x ≈ 2.5. (The OLD broken code would have used newest two and
    // clamped alpha to ~0, giving x≈5 — frozen at the 2nd-newest.)
    perfSpy.mockReturnValue(10.125 * 1000);
    rv.update('LOCAL', 0.016);
    expect(rv.views.get(id)._x).toBeCloseTo(2.5, 1);
  });

  it('clamps to the newest snapshot when the target is ahead of the buffer (no extrapolation)', () => {
    const rv = new RemoteView({});
    const id = 'B2';
    perfSpy.mockReturnValue(20.0 * 1000); rv.pushSnapshot(snap(id, 0, 0, 0));
    perfSpy.mockReturnValue(20.05 * 1000); rv.pushSnapshot(snap(id, 5, 0, 0));
    // render well after the buffer; target (21.0 - 0.1 = 20.9) is ahead of both
    // snapshots. alpha clamps to 1 → the newest position (x=5), never beyond it.
    perfSpy.mockReturnValue(21.0 * 1000);
    rv.update('LOCAL', 0.016);
    expect(rv.views.get(id)._x).toBeCloseTo(5, 1); // clamped to newest, not extrapolated past it
  });

  it('prunes views for players no longer in snapshots', () => {
    const rv = new RemoteView({});
    perfSpy.mockReturnValue(0);
    rv.pushSnapshot(snap('GONE', 0, 0, 0));
    expect(rv.views.has('GONE')).toBe(true);
    rv.pushSnapshot(snap('OTHER', 1, 0, 0)); // GONE no longer present
    expect(rv.views.has('GONE')).toBe(false);
    expect(rv.views.has('OTHER')).toBe(true);
  });

  it('drains events from buffered snapshots exactly once', () => {
    const rv = new RemoteView({});
    perfSpy.mockReturnValue(0);
    rv.pushSnapshot({ players: [], events: [{ k: 'shot', shooter: 'B1' }, { k: 'hit', shooter: 'B1' }] });
    const first = rv.drainEvents();
    expect(first).toHaveLength(2);
    const second = rv.drainEvents();
    expect(second).toHaveLength(0); // drained — not re-emitted
  });
});
