import { describe, it, expect } from 'vitest';
import { WeaponController } from '../player/WeaponController.js';
import { WEAPONS } from '../config/Weapons.js';

function makeCtrl(weaponId = 'AR') {
  const fired = [];
  const ctrl = new WeaponController(WEAPONS[weaponId]);
  ctrl.fireCallback = (shot) => fired.push(shot);
  return { ctrl, fired };
}

describe('WeaponController fire rate', () => {
  it('fires immediately on first trigger (instant first shot) and respects the fire interval', () => {
    const { ctrl, fired } = makeCtrl('AR');
    // first shot fires immediately (nextFireTime starts at 0)
    ctrl.update(0.01, true, false);
    expect(fired.length).toBe(1);
    // still within the interval (0.1s) -> no additional shot
    ctrl.update(0.05, true, false);
    expect(fired.length).toBe(1);
    // now past the interval -> second shot
    ctrl.update(0.06, true, false);
    expect(fired.length).toBe(2);
  });
});

describe('WeaponController ammo + reload', () => {
  it('stops firing when mag is empty (dry fire)', () => {
    const { ctrl, fired } = makeCtrl('AR');
    // each update allows at most one shot; well past the interval every call.
    // 60 calls would allow 60 shots but the mag caps it at 30.
    for (let i = 0; i < 60; i++) ctrl.update(0.2, true, false);
    expect(fired.length).toBe(30);
    expect(ctrl.ammo).toBe(0);
  });
  it('reloads over reloadTime back to full mag, and cannot fire while reloading', () => {
    const { ctrl, fired } = makeCtrl('AR');
    for (let i = 0; i < 60; i++) ctrl.update(0.2, true, false); // empty the mag
    expect(ctrl.ammo).toBe(0);
    const shotsBefore = fired.length;
    // start reload, run half way with firing held -> still empty, no shot fired
    ctrl.update(WEAPONS.AR.reloadTime / 2, true, true);
    expect(ctrl.ammo).toBe(0);
    expect(ctrl.reloading).toBe(true);
    expect(fired.length).toBe(shotsBefore);
    // finish reload -> mag refilled, reload cleared
    ctrl.update(WEAPONS.AR.reloadTime / 2 + 0.01, true, true);
    expect(ctrl.reloading).toBe(false);
    expect(ctrl.ammo).toBe(WEAPONS.AR.mag);
  });
  it('semi-auto (sniper) fires once per trigger press, then again only after release', () => {
    const { ctrl, fired } = makeCtrl('SNIPER');
    // press and hold -> exactly 1 shot
    ctrl.update(0.2, true, false);
    expect(fired.length).toBe(1);
    // still held, well past the interval -> no extra shot
    ctrl.update(1.0, true, false);
    expect(fired.length).toBe(1);
    // release -> nothing
    ctrl.update(0.2, false, false);
    expect(fired.length).toBe(1);
    // press again -> second shot (rising edge)
    ctrl.update(0.2, true, false);
    expect(fired.length).toBe(2);
  });
});
