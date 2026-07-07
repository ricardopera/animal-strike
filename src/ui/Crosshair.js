// A 4-tick crosshair with a dark outline + center dot so it stays readable
// against both bright sky and dark interiors. The outline is achieved with a
// text-shadow-like halo on each tick.
//
// Spread model: `setSpread(px)` sets the MOVEMENT/weapon base size. `bloom(px)`
// adds a transient fire-recoil expansion on top of the base that decays back to
// 0 over a short recovery window. The visible size each frame = base + bloom.
export class Crosshair {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:20px; height:20px; pointer-events:none;`;
    // Halo via drop-shadow filter on the whole group gives every tick an edge.
    this.el.innerHTML = `
      <div style="position:absolute;inset:0;filter:drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 0 1px rgba(0,0,0,.9));">
        <div style="position:absolute;left:50%;top:0;width:2px;height:7px;background:rgba(255,235,180,.95);transform:translateX(-50%);"></div>
        <div style="position:absolute;left:50%;bottom:0;width:2px;height:7px;background:rgba(255,235,180,.95);transform:translateX(-50%);"></div>
        <div style="position:absolute;top:50%;left:0;height:2px;width:7px;background:rgba(255,235,180,.95);transform:translateY(-50%);"></div>
        <div style="position:absolute;top:50%;right:0;height:2px;width:7px;background:rgba(255,235,180,.95);transform:translateY(-50%);"></div>
        <div style="position:absolute;left:50%;top:50%;width:2px;height:2px;background:rgba(255,235,180,.95);transform:translate(-50%,-50%);border-radius:50%;"></div>
      </div>`;
    root.appendChild(this.el);

    this._baseSpread = 20; // px set by setSpread (movement/weapon base)
    this._bloom = 0;       // transient fire-recoil expansion (decays to 0)
    this._bloomRaf = null; // active rAF loop id (null when idle)
    this._bloomStart = 0;  // peak bloom the decay loop is easing from
    this._bloomT0 = 0;     // decay loop start timestamp (reset on each re-trigger)
  }

  // Apply the current visible size = base + bloom.
  _apply() {
    const s = Math.max(8, this._baseSpread + this._bloom);
    this.el.style.width = s + 'px';
    this.el.style.height = s + 'px';
  }

  setSpread(px) {
    this._baseSpread = Math.max(8, px);
    this._apply();
  }

  // Instantly expand the crosshair by extraPx, then decay back to the base
  // spread over recoverMs. Re-triggerable: each call resets the decay clock
  // against the CURRENT bloom (so rapid fire keeps it open). Self-contained —
  // the rAF loop cancels itself once bloom reaches ~0.
  bloom(extraPx, recoverMs = 120) {
    const add = Math.max(0, +extraPx || 0);
    if (add <= 0) return;
    this._bloom = Math.max(this._bloom, add);
    if (this._bloom <= 0) return;
    // Reset the decay clock against the CURRENT peak each call so rapid fire
    // holds the crosshair open instead of collapsing mid-burst.
    this._bloomStart = this._bloom;
    this._bloomT0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._bloomDur = Math.max(16, recoverMs);
    this._apply();
    if (this._bloomRaf != null) return; // decay loop already running; it reads the refreshed fields above

    const tick = () => {
      if (this._bloom <= 0) {
        this._bloom = 0;
        this._bloomRaf = null;
        this._apply();
        return;
      }
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const k = 1 - Math.min(1, (now - this._bloomT0) / this._bloomDur); // 1 -> 0 over the window
      this._bloom = this._bloomStart * Math.max(0, k);
      if (this._bloom < 0.4) this._bloom = 0;
      this._apply();
      if (this._bloom <= 0) {
        this._bloomRaf = null;
        return;
      }
      this._bloomRaf = _raf(tick);
    };
    this._bloomRaf = _raf(tick);
  }

  hide() { this.el.style.display = 'none'; }
  show() { this.el.style.display = 'block'; }
}

// requestAnimationFrame wrapper that no-ops when unavailable (e.g. jsdom/node
// tests) so bloom() never throws and simply holds the expanded size statically.
function _raf(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return null;
}
