export class WeaponController {
  constructor(weaponDef) {
    this.def = weaponDef;
    this.ammo = weaponDef.mag;
    this.nextFireTime = 0;
    this.reloadEndTime = 0;
    this.reloading = false;
    this.triggerHeldPrev = false; // for semi-auto
    this.fireCallback = null;     // set by owner: (shot) => {...}
  }

  get interval() {
    return 60 / this.def.rpm;
  }

  // update(dt, firing, reloadRequested) -> calls fireCallback({}) per shot
  update(dt, firing, reloadRequested) {
    this.nextFireTime -= dt;
    if (reloadRequested && !this.reloading && this.ammo < this.def.mag) {
      this.reloading = true;
      this.reloadEndTime = this.def.reloadTime;
    }
    if (this.reloading) {
      this.reloadEndTime -= dt;
      if (this.reloadEndTime <= 0) {
        this.reloading = false;
        this.ammo = this.def.mag;
      }
      // can't fire while reloading
      this.triggerHeldPrev = firing;
      return;
    }
    const canTrigger = this.def.auto ? firing : (firing && !this.triggerHeldPrev);
    this.triggerHeldPrev = firing;
    if (canTrigger && this.ammo > 0 && this.nextFireTime <= 0) {
      this.ammo -= 1;
      this.nextFireTime = this.interval;
      if (this.fireCallback) this.fireCallback({});
    }
  }

  reload() {
    if (!this.reloading && this.ammo < this.def.mag) {
      this.reloading = true;
      this.reloadEndTime = this.def.reloadTime;
    }
  }
}
