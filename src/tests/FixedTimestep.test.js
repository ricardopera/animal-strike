import { describe, it, expect } from 'vitest';
import { FixedTimestep } from '../core/FixedTimestep.js';

describe('FixedTimestep', () => {
  it('runs one tick per STEP of accumulated time', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    ft.update(1 / 60, () => count++);
    expect(count).toBe(1);
  });
  it('accumulates sub-step leftovers across frames', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    const cb = () => count++;
    ft.update(1 / 120, cb); // half a step -> 0
    ft.update(1 / 120, cb); // now a full step -> 1
    expect(count).toBe(1);
  });
  it('caps at 5 ticks per update to avoid spiral of death', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    ft.update(10, () => count++); // huge dt
    expect(count).toBe(5);
  });
  it('passes fixed STEP as the dt argument', () => {
    const ft = new FixedTimestep(1 / 60);
    let received = 0;
    ft.update(1 / 60, (dt) => (received = dt));
    expect(received).toBeCloseTo(1 / 60);
  });
  it('discards backlog after a large stall so the next frame is not another burst', () => {
    const ft = new FixedTimestep(1 / 60);
    let count = 0;
    ft.update(10, () => count++); // huge stall -> capped at 5, then discard fires
    expect(count).toBe(5);
    ft.update(1 / 60, () => count++); // normal frame
    expect(count).toBe(6); // only +1, NOT +5 — proves the backlog was discarded
  });
});
