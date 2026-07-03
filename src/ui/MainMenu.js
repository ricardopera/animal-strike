import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';

export class MainMenu {
  constructor(root, { onStart, onToggleSettings } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onToggleSettings = onToggleSettings;
    this.selectedAnimal = 'FOX';
    this.selectedWeapon = 'AR';
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(10,14,20,.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;`;
    this.render();
    root.appendChild(this.el);
  }
  render() {
    this.el.innerHTML = `
      <h1 style="font-size:48px;margin:0 0 8px;letter-spacing:2px;">ANIMAL<span style="color:#ffb84d">STRIKE</span></h1>
      <p style="opacity:.7;margin:0 0 24px;">Pick your animal and weapon</p>
      <div style="display:flex;gap:24px;margin-bottom:24px;flex-wrap:wrap;justify-content:center;max-width:820px;">
        ${ANIMAL_IDS.map(id => {
          const a = ANIMALS[id];
          return `<button data-animal="${id}" style="
            background:${this.selectedAnimal===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:12px 16px;border-radius:8px;cursor:pointer;font-size:14px;text-align:left;">
            ${a.name} <small style="opacity:.6">${a.role}</small><br>
            <small style="opacity:.75">spd ×${a.speedMul.toFixed(2)} hp ×${a.hpMul.toFixed(2)} jmp ×${a.jumpMul.toFixed(2)}</small>
          </button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-bottom:32px;flex-wrap:wrap;justify-content:center;">
        ${Object.keys(WEAPONS).map(id => `
          <button data-weapon="${id}" style="
            background:${this.selectedWeapon===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 18px;border-radius:8px;cursor:pointer;">
            ${WEAPONS[id].name}<br><small style="opacity:.6">hs ×${WEAPONS[id].headshotMul.toFixed(1)}</small>
          </button>`).join('')}
      </div>
      <button id="play-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 48px;
        border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">PLAY</button>
      <button id="settings-btn" style="margin-top:12px;background:#444;color:#fff;border:none;padding:8px 24px;
        border-radius:8px;cursor:pointer;">SETTINGS</button>`;
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; this.render(); };
    });
    this.el.querySelector('#play-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onStart) this.onStart({ animal: this.selectedAnimal, weapon: this.selectedWeapon });
    };
    const settingsBtn = this.el.querySelector('#settings-btn');
    if (settingsBtn) settingsBtn.onclick = () => { if (this.onToggleSettings) this.onToggleSettings(); };
  }
  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
}
