export class Hud {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.style.cssText = `position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;`;
    this.el.innerHTML = `
      <div id="hud-health" style="position:absolute;left:24px;bottom:24px;font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);">HP 100</div>
      <div id="hud-ammo" style="position:absolute;right:24px;bottom:24px;font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);">--/--</div>
      <div id="hud-weapon" style="position:absolute;right:24px;bottom:54px;font-size:14px;opacity:.8;">--</div>
      <div id="hud-killfeed" style="position:absolute;right:24px;top:24px;font-size:14px;line-height:1.5;"></div>`;
    root.appendChild(this.el);
    this.healthEl = this.el.querySelector('#hud-health');
    this.ammoEl = this.el.querySelector('#hud-ammo');
    this.weaponEl = this.el.querySelector('#hud-weapon');
    this.killfeedEl = this.el.querySelector('#hud-killfeed');
  }
  setHealth(hp) { this.healthEl.textContent = `HP ${Math.max(0, Math.round(hp))}`; }
  setAmmo(ammo, mag) { this.ammoEl.textContent = `${ammo}/${mag}`; }
  setWeapon(name) { this.weaponEl.textContent = name; }
  addKill(text) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.opacity = '1';
    line.style.transition = 'opacity 0.5s ease 3s';
    this.killfeedEl.appendChild(line);
    setTimeout(() => (line.style.opacity = '0'), 100);
    setTimeout(() => line.remove(), 4000);
  }
}
