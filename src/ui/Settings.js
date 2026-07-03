const KEY = 'animalstrike_settings';
const DEFAULTS = { sensitivity: 0.0022, fov: 80, invertY: false, quality: 'high' };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

export class SettingsPanel {
  constructor(root, { onChange } = {}) {
    this.onChange = onChange;
    this.s = loadSettings();
    this.el = document.createElement('div');
    this.el.style.cssText = `position:absolute;right:24px;top:24px;background:rgba(10,14,20,.9);color:#fff;
      padding:16px;border-radius:10px;font-family:system-ui,sans-serif;pointer-events:auto;display:none;`;
    root.appendChild(this.el);
    this.render();
  }
  render() {
    this.el.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Settings</div>
      <label>Sensitivity <input type="range" id="sens" min="0.0005" max="0.006" step="0.0001" value="${this.s.sensitivity}"></label><br>
      <label>FOV <input type="range" id="fov" min="70" max="100" step="1" value="${this.s.fov}"></label><br>
      <label>Invert Y <input type="checkbox" id="iny" ${this.s.invertY ? 'checked' : ''}></label><br>
      <label>Quality
        <select id="q">
          <option value="high" ${this.s.quality === 'high' ? 'selected' : ''}>High</option>
          <option value="low" ${this.s.quality === 'low' ? 'selected' : ''}>Low</option>
        </select>
      </label>`;
    const bind = (id, key, parse = (v) => v) => {
      this.el.querySelector(id).oninput = (e) => { this.s[key] = parse(e.target.value); saveSettings(this.s); this.onChange(this.s); };
    };
    bind('#sens', 'sensitivity', parseFloat);
    bind('#fov', 'fov', parseFloat);
    this.el.querySelector('#iny').onchange = (e) => { this.s.invertY = e.target.checked; saveSettings(this.s); this.onChange(this.s); };
    this.el.querySelector('#q').onchange = (e) => { this.s.quality = e.target.value; saveSettings(this.s); this.onChange(this.s); };
  }
  toggle() { this.el.style.display = this.el.style.display === 'none' ? 'block' : 'none'; }
  get settings() { return this.s; }
}
