// Wraps a WeaponController for a bot. The bot writes intent.firing; this syncs
// the WeaponController update and forwards shots to a callback (Game fires them).
export class BotCombat {
  constructor(weaponDef, fireCallback) {
    this.weapon = null; // assigned externally as a WeaponController instance
    this.fireCallback = fireCallback;
    this.weaponDef = weaponDef;
  }
  attachWeapon(weaponController) { this.weapon = weaponController; this.weapon.fireCallback = this.fireCallback; }
  update(dt, wantFire, reloadRequested) {
    if (this.weapon) this.weapon.update(dt, wantFire, reloadRequested);
  }
}
