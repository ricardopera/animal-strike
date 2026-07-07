// Inline-SVG weapon icons (simple silhouette per weapon id). Amber accent fill.
const WEAPON_ICONS = {
  AR: '<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="9" width="44" height="6" rx="1" fill="#ffb84d"/><rect x="46" y="7" width="6" height="10" rx="1" fill="#ffb84d"/><rect x="16" y="15" width="6" height="8" rx="1" fill="#ffb84d"/><path d="M24 15 l3 5 h6 v-5 z" fill="#ffb84d"/><rect x="34" y="15" width="4" height="6" fill="#ffb84d"/></svg>',
  SNIPER: '<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="10" width="60" height="4" rx="1" fill="#ffb84d"/><rect x="20" y="14" width="6" height="6" rx="1" fill="#ffb84d"/><rect x="44" y="6" width="10" height="4" rx="4" fill="#ffb84d"/><circle cx="34" cy="9" r="3" fill="none" stroke="#ffb84d" stroke-width="1.5"/><rect x="56" y="9" width="6" height="6" rx="1" fill="#ffb84d"/></svg>',
  SMG: '<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="8" width="34" height="6" rx="1" fill="#ffb84d"/><rect x="36" y="6" width="6" height="10" rx="1" fill="#ffb84d"/><rect x="14" y="14" width="5" height="9" rx="1" fill="#ffb84d"/><path d="M20 14 l2 5 h4 v-5 z" fill="#ffb84d"/><rect x="8" y="6" width="10" height="3" rx="1" fill="#ffb84d"/></svg>',
  SHOTGUN: '<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="9" width="40" height="5" rx="1" fill="#ffb84d"/><rect x="44" y="7" width="16" height="9" rx="1" fill="#ffb84d"/><rect x="18" y="14" width="5" height="8" rx="1" fill="#ffb84d"/><path d="M24 14 l3 6 h6 v-6 z" fill="#ffb84d"/></svg>',
  PISTOL: '<svg viewBox="0 0 64 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="9" width="24" height="6" rx="1" fill="#ffb84d"/><rect x="28" y="7" width="6" height="10" rx="1" fill="#ffb84d"/><path d="M10 15 h9 l-2 8 h-6 z" fill="#ffb84d"/></svg>',
};

// Injected once: keyframes for the low-HP pulse (subtle opacity/box-shadow
// oscillation). Kept gentle so it isn't seizure-inducing.
const HUD_STYLE_ID = 'hud-anim-style';
function ensureHudStyle() {
  if (document.getElementById(HUD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HUD_STYLE_ID;
  style.textContent = `
    @keyframes hud-lowhp-pulse {
      0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 0 0 rgba(255,40,40,0); opacity: 1; }
      50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 0 10px 1px rgba(255,40,40,.55); opacity: .82; }
    }
    .hud-lowhp { animation: hud-lowhp-pulse 1.1s ease-in-out infinite; }`;
  document.head ? document.head.appendChild(style) : document.documentElement.appendChild(style);
}

// Build a vertical depth gradient (light top -> base -> dark bottom) from an
// HSL triple, keeping the existing dynamic color logic intact.
function hslGradient(h, s, l) {
  const top = `hsl(${h}, ${s}%, ${Math.min(85, l + 13)}%)`;
  const mid = `hsl(${h}, ${s}%, ${l}%)`;
  const bot = `hsl(${h}, ${s}%, ${Math.max(8, l - 13)}%)`;
  return `linear-gradient(to bottom, ${top} 0%, ${mid} 50%, ${bot} 100%)`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.style.cssText = `position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;`;
    this.el.innerHTML = `
      <div id="hud-timer" style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:22px;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,.6);">5:00</div>
      <div id="hud-killfeed" style="position:absolute;right:24px;top:24px;font-size:14px;line-height:1.5;"></div>

      <!-- Health: bottom-left (text + bar) -->
      <div style="position:absolute;left:24px;bottom:24px;">
        <div id="hud-health" style="font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);margin-bottom:6px;">HP 100</div>
        <div style="width:220px;height:12px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);border-radius:2px;overflow:hidden;">
          <div id="hud-healthbar" style="width:100%;height:100%;background:linear-gradient(to bottom,#5fff6b 0%,#2ecc40 50%,#159a2c 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);transition:width .12s linear,background .12s linear;"></div>
        </div>
      </div>

      <!-- Ammo: bottom-right (text + bar), weapon name+icon above -->
      <div style="position:absolute;right:24px;bottom:24px;text-align:right;">
        <div id="hud-weaponrow" style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-bottom:6px;font-size:14px;opacity:.85;">
          <span id="hud-weaponicon" style="width:42px;height:16px;display:inline-flex;"></span>
          <span id="hud-weapon">--</span>
        </div>
        <div id="hud-ammo" style="font-size:22px;text-shadow:0 2px 4px rgba(0,0,0,.6);margin-bottom:6px;">--/--</div>
        <div style="width:220px;height:12px;margin-left:auto;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);border-radius:2px;overflow:hidden;">
          <div id="hud-ammobar" style="width:100%;height:100%;background:linear-gradient(to bottom,#ffd699 0%,#ffb84d 50%,#b87a1f 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);transition:width .1s linear,background .1s linear;"></div>
        </div>
      </div>

      <!-- Reload ring: centered on crosshair (larger radius than crosshair ticks) -->
      <div id="hud-reloadwrap" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:90px;height:90px;display:none;">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/>
          <circle id="hud-reloadarc" cx="50" cy="50" r="42" fill="none" stroke="#ffb84d" stroke-width="4" stroke-linecap="round" transform="rotate(-90 50 50)" stroke-dasharray="0 263.9" stroke-dashoffset="0"/>
        </svg>
      </div>

      <!-- Hitmarker: short 4-line X at center -->
      <div id="hud-hitmarker" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:28px;height:28px;opacity:0;">
        <span style="position:absolute;left:50%;top:6px;width:2px;height:6px;background:#fff;transform-origin:50% 0;transform:translateX(-50%) rotate(45deg);"></span>
        <span style="position:absolute;left:50%;top:6px;width:2px;height:6px;background:#fff;transform-origin:50% 0;transform:translateX(-50%) rotate(135deg);"></span>
        <span style="position:absolute;left:50%;bottom:6px;width:2px;height:6px;background:#fff;transform-origin:50% 100%;transform:translateX(-50%) rotate(45deg);"></span>
        <span style="position:absolute;left:50%;bottom:6px;width:2px;height:6px;background:#fff;transform-origin:50% 100%;transform:translateX(-50%) rotate(135deg);"></span>
      </div>

      <!-- Killstreak: bottom-center -->
      <div id="hud-killstreak" style="position:absolute;left:50%;bottom:30px;transform:translateX(-50%);font-size:18px;font-weight:700;color:#ffb84d;text-shadow:0 2px 4px rgba(0,0,0,.6);display:none;"></div>`;
    root.appendChild(this.el);
    this.healthEl = this.el.querySelector('#hud-health');
    this.healthBarEl = this.el.querySelector('#hud-healthbar');
    this.ammoEl = this.el.querySelector('#hud-ammo');
    this.ammoBarEl = this.el.querySelector('#hud-ammobar');
    this.weaponEl = this.el.querySelector('#hud-weapon');
    this.weaponIconEl = this.el.querySelector('#hud-weaponicon');
    this.killfeedEl = this.el.querySelector('#hud-killfeed');
    this.timerEl = this.el.querySelector('#hud-timer');
    this.reloadWrapEl = this.el.querySelector('#hud-reloadwrap');
    this.reloadArcEl = this.el.querySelector('#hud-reloadarc');
    this.hitmarkerEl = this.el.querySelector('#hud-hitmarker');
    this.killstreakEl = this.el.querySelector('#hud-killstreak');

    // Circumference of the reload ring circle (r=42) -> 2*pi*42 = 263.89
    this._ringCircumference = 2 * Math.PI * 42;
    this._hitmarkerTimer = null;
    this._maxAmmo = 1; // updated by setAmmo for bar scaling
    this._flashTimer = null; // damage-flash animation handle
    try { ensureHudStyle(); } catch (e) { /* headless/test env: ignore */ }
  }

  setHealth(hp) {
    const h = Math.max(0, Math.min(100, hp));
    this.healthEl.textContent = `HP ${Math.round(h)}`;
    const pct = h / 100;
    this.healthBarEl.style.width = `${pct * 100}%`;
    // green (100%) -> red (0%): hue 120 -> 0. Gradient gives depth + a bright
    // top edge via box-shadow; the underlying hue logic is unchanged.
    this.healthBarEl.style.background = hslGradient(Math.round(pct * 120), 80, 45);
    // Low-HP pulse: active only under 30%. Toggle the class so the animation
    // starts/stops cleanly.
    if (pct < 0.3) {
      if (!this.healthBarEl.classList.contains('hud-lowhp')) {
        this.healthBarEl.classList.add('hud-lowhp');
      }
    } else if (this.healthBarEl.classList.contains('hud-lowhp')) {
      this.healthBarEl.classList.remove('hud-lowhp');
    }
  }

  setAmmo(ammo, mag) {
    this.ammoEl.textContent = `${ammo}/${mag}`;
    this._maxAmmo = mag > 0 ? mag : 1;
    const pct = mag > 0 ? Math.max(0, Math.min(1, ammo / mag)) : 0;
    this.ammoBarEl.style.width = `${pct * 100}%`;
    // red/flashy gradient when ammo < 25%; otherwise amber gradient.
    if (pct < 0.25) {
      this.ammoBarEl.style.background = hslGradient(0, 100, 45);
    } else {
      this.ammoBarEl.style.background = hslGradient(35, 100, 62);
    }
  }

  // Brief "took damage" pop: tint the HP text/bar red and scale the HP text up
  // momentarily then back. Re-triggerable — calling mid-animation restarts it.
  flashDamage() {
    if (this._flashTimer) {
      clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }
    // Snap to the peak of the flash (scale up + red text-shadow).
    this.healthEl.style.transition = 'transform 60ms ease-out';
    this.healthEl.style.transform = 'scale(1.15)';
    this.healthEl.style.color = '#ff5555';
    this.healthEl.style.textShadow = '0 0 12px rgba(255,40,40,.9), 0 2px 4px rgba(0,0,0,.6)';
    this.healthBarEl.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.35), 0 0 14px 2px rgba(255,40,40,.6)';
    // Ease back to normal after a brief hold.
    this._flashTimer = setTimeout(() => {
      this.healthEl.style.transition = 'transform 90ms ease-in, color 90ms ease, text-shadow 90ms ease';
      this.healthEl.style.transform = 'scale(1)';
      this.healthEl.style.color = '#fff';
      this.healthEl.style.textShadow = '0 2px 4px rgba(0,0,0,.6)';
      this.healthBarEl.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.35)';
      this._flashTimer = setTimeout(() => { this._flashTimer = null; }, 100);
    }, 70);
  }

  setWeapon(name) { this.weaponEl.textContent = name; }

  setWeaponIcon(weaponId) {
    const svg = WEAPON_ICONS[weaponId];
    if (svg) this.weaponIconEl.innerHTML = svg;
  }

  setTime(seconds) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    this.timerEl.textContent = `${m}:${sec.toString().padStart(2, '0')}`;
  }

  addKill(text) {
    const line = document.createElement('div');
    line.textContent = text;
    line.style.opacity = '1';
    line.style.transition = 'opacity 0.5s ease 3s';
    this.killfeedEl.appendChild(line);
    setTimeout(() => (line.style.opacity = '0'), 100);
    setTimeout(() => line.remove(), 4000);
  }

  // p = 1 hides the ring; 0 < p < 1 shows a partial arc (0 -> empty, 1 -> full).
  setReloadProgress(p) {
    const progress = Math.max(0, Math.min(1, p));
    if (progress >= 1) {
      this.reloadWrapEl.style.display = 'none';
      return;
    }
    this.reloadWrapEl.style.display = 'block';
    const filled = progress * this._ringCircumference;
    this.reloadArcEl.setAttribute('stroke-dasharray', `${filled} ${this._ringCircumference}`);
  }

  setReloading(reloading) {
    if (!reloading) this.reloadWrapEl.style.display = 'none';
  }

  // kill=false -> white hit flash; kill=true -> gold/red flash.
  showHitmarker(kill = false) {
    const color = kill ? '#ffd24a' : '#ffffff';
    const spans = this.hitmarkerEl.querySelectorAll('span');
    for (const s of spans) s.style.background = color;
    this.hitmarkerEl.style.opacity = '1';
    this.hitmarkerEl.style.transition = 'opacity 0.12s ease';
    if (this._hitmarkerTimer) clearTimeout(this._hitmarkerTimer);
    this._hitmarkerTimer = setTimeout(() => {
      this.hitmarkerEl.style.opacity = '0';
    }, 120);
  }

  // n = current consecutive-kill streak. n <= 0 hides the counter.
  setKillstreak(n) {
    if (n > 1) {
      this.killstreakEl.style.display = 'block';
      this.killstreakEl.textContent = `x${n}`;
    } else {
      this.killstreakEl.style.display = 'none';
      this.killstreakEl.textContent = '';
    }
  }
}
