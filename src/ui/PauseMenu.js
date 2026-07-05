// In-match pause overlay. Resume / Settings / Leave. Wired up by the game loop.
export class PauseMenu {
  constructor(root, { onResume, onToggleSettings, onLeave } = {}) {
    this.root = root;
    this.onResume = onResume;
    this.onToggleSettings = onToggleSettings;
    this.onLeave = onLeave;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(6,10,16,.9);
      display:none;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;z-index:50;`;
    root.appendChild(this.el);
    this.render();
  }
  render() {
    this.el.innerHTML = `
      <h1 style="font-size:36px;margin:0 0 32px;">PAUSED</h1>
      <div style="display:flex;flex-direction:column;gap:16px;align-items:center;">
        <button id="resume-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">Resume</button>
        <button id="settings-btn" style="background:#444;color:#fff;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">Settings</button>
        <button id="leave-btn" style="background:#444;color:#fff;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">Leave Match</button>
      </div>`;
    this.el.querySelector('#resume-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onResume) this.onResume();
    };
    this.el.querySelector('#settings-btn').onclick = () => {
      if (this.onToggleSettings) this.onToggleSettings();
    };
    this.el.querySelector('#leave-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onLeave) this.onLeave();
    };
  }
  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
}
