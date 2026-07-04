import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';
import { MAPS } from '../world/Maps.js';
import { WEAPON_SKINS, DEFAULT_SKIN } from '../config/WeaponSkins.js';

const MODES = [
  { id: 'single', label: 'Single Player', desc: 'vs bots, local' },
  { id: 'host',   label: 'Host',          desc: 'run a server + play' },
  { id: 'join',   label: 'Join',          desc: 'connect to a host' },
];

export class MainMenu {
  constructor(root, { onStart, onToggleSettings } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onToggleSettings = onToggleSettings;
    this.selectedAnimal = localStorage.getItem('as_animal') || 'FOX';
    this.selectedWeapon = localStorage.getItem('as_weapon') || 'AR';
    this.selectedMap = localStorage.getItem('as_map') || MAPS[0].id;
    this.rotateMaps = localStorage.getItem('as_rotate') !== 'false'; // default true
    this.selectedMode = localStorage.getItem('as_mode') || 'single';
    this.joinAddress = localStorage.getItem('as_join_addr') || 'localhost:8080';
    this.selectedSkin = localStorage.getItem('as_skin') || DEFAULT_SKIN;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(10,14,20,.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;overflow:auto;padding:20px;`;
    this.render();
    root.appendChild(this.el);
  }
  render() {
    const isHost = this.selectedMode === 'host';
    const isJoin = this.selectedMode === 'join';
    const isMulti = isHost || isJoin;
    const playLabel = isHost ? 'START SERVER + PLAY' : (isJoin ? 'CONNECT' : 'PLAY');
    this.el.innerHTML = `
      <h1 style="font-size:44px;margin:0 0 8px;letter-spacing:2px;">ANIMAL<span style="color:#ffb84d">STRIKE</span></h1>
      <p style="opacity:.7;margin:0 0 18px;">Pick your animal and weapon</p>

      <div style="display:flex;gap:10px;margin-bottom:18px;">
        ${MODES.map(m => `<button data-mode="${m.id}" style="
          background:${this.selectedMode===m.id?'#ffb84d':'#222'};color:#fff;border:none;
          padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;">
          ${m.label}<br><small style="opacity:.6">${m.desc}</small>
        </button>`).join('')}
      </div>

      <div style="display:flex;gap:24px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;max-width:820px;">
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
      <div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;">
        ${Object.keys(WEAPONS).map(id => `
          <button data-weapon="${id}" style="
            background:${this.selectedWeapon===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 18px;border-radius:8px;cursor:pointer;">
            ${WEAPONS[id].name}<br><small style="opacity:.6">hs ×${WEAPONS[id].headshotMul.toFixed(1)}</small>
          </button>`).join('')}
      </div>
      <div style="margin-bottom:18px;">
        <div style="opacity:.6;font-size:12px;margin-bottom:6px;text-align:center;">WEAPON SKIN</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:760px;">
          ${WEAPON_SKINS.map(s => {
            const swatch = '#' + s.color.toString(16).padStart(6, '0');
            return `<button data-skin="${s.id}" style="
              background:${this.selectedSkin===s.id?'#ffb84d':'#222'};color:#fff;border:none;
              padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${swatch};border:1px solid #555;"></span>${s.name}
            </button>`;
          }).join('')}
        </div>
      </div>

      ${isJoin ? `
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <label style="opacity:.7;font-size:14px;">Host address:</label>
          <input id="join-addr" value="${this.joinAddress}" placeholder="ip:port"
            style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:8px 12px;font-size:14px;width:220px;">
        </div>` : ''}

      ${!isMulti ? `
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;justify-content:center;max-width:820px;">
          ${MAPS.map(m => `
            <button data-map="${m.id}" style="
              background:${this.selectedMap===m.id?'#ffb84d':'#222'};color:#fff;border:none;
              padding:10px 16px;border-radius:8px;cursor:pointer;text-align:left;max-width:200px;">
              ${m.name}<br><small style="opacity:.6">${m.desc}</small>
            </button>`).join('')}
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:20px;color:#fff;font-size:14px;cursor:pointer;">
          <input type="checkbox" id="rotate-maps" ${this.rotateMaps?'checked':''} style="width:18px;height:18px;">
          <span>🔄 Rotate maps after each match</span>
        </label>` : `
        <div style="margin-bottom:16px;opacity:.7;font-size:13px;max-width:560px;text-align:center;">
          ${isHost
            ? 'Host mode: run <code style="background:#222;padding:2px 6px;border-radius:4px;">npm run host</code> in the project folder, then press START. Share your IP:8080 with friends.'
            : 'Join mode: enter the host\'s address (e.g. 192.168.1.5:8080). The host picks the map.'}
        </div>`}

      <button id="play-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 48px;
        border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">${playLabel}</button>
      <button id="settings-btn" style="margin-top:12px;background:#444;color:#fff;border:none;padding:8px 24px;
        border-radius:8px;cursor:pointer;">SETTINGS</button>`;

    this.el.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => { this.selectedMode = b.dataset.mode; localStorage.setItem('as_mode', this.selectedMode); this.render(); };
    });
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; localStorage.setItem('as_animal', this.selectedAnimal); this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; localStorage.setItem('as_weapon', this.selectedWeapon); this.render(); };
    });
    this.el.querySelectorAll('[data-skin]').forEach(b => {
      b.onclick = () => { this.selectedSkin = b.dataset.skin; localStorage.setItem('as_skin', this.selectedSkin); this.render(); };
    });
    this.el.querySelectorAll('[data-map]').forEach(b => {
      b.onclick = () => { this.selectedMap = b.dataset.map; localStorage.setItem('as_map', this.selectedMap); this.render(); };
    });
    const rotateCb = this.el.querySelector('#rotate-maps');
    if (rotateCb) rotateCb.onchange = () => { this.rotateMaps = rotateCb.checked; localStorage.setItem('as_rotate', this.rotateMaps); };
    const joinInput = this.el.querySelector('#join-addr');
    if (joinInput) joinInput.oninput = () => { this.joinAddress = joinInput.value; localStorage.setItem('as_join_addr', this.joinAddress); };
    this.el.querySelector('#play-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onStart) this.onStart({
        mode: this.selectedMode,
        animal: this.selectedAnimal,
        weapon: this.selectedWeapon,
        skin: this.selectedSkin,
        map: this.selectedMap,
        rotate: this.rotateMaps,
        address: this.joinAddress,
      });
    };
    const settingsBtn = this.el.querySelector('#settings-btn');
    if (settingsBtn) settingsBtn.onclick = () => { if (this.onToggleSettings) this.onToggleSettings(); };
  }
  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
  // Called by Game.returnToMenu to advance the rotation: highlights the next map.
  setSelectedMap(id) {
    if (MAPS.some(m => m.id === id)) {
      this.selectedMap = id;
      localStorage.setItem('as_map', id);
    }
  }
}
