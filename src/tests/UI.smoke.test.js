// Smoke tests for the DOM/CSS UI overlays (Hud, Crosshair, EndScreen).
//
// The vitest environment is `node` (no jsdom). These classes are thin DOM
// wrappers, so we provide a minimal fake DOM that supports exactly the surface
// they touch: createElement, appendChild, getElementById, querySelector(All),
// classList, style, textContent, and innerHTML (with id-attribute parsing so
// querySelector('#id') resolves the elements injected via HTML strings).
import { describe, it, expect } from 'vitest';
import { Hud } from '../ui/Hud.js';
import { Crosshair } from '../ui/Crosshair.js';
import { EndScreen } from '../ui/EndScreen.js';

// Minimal fake DOM element.
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.style = {};
    this.classList = makeClassList();
    this._attrs = {};
    this.textContent = '';
    this.innerHTML = '';
    this.onclick = null;
    this.parentNode = null;
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  // Resolve '#id' (and 'span') against elements created from innerHTML ids +
  // appended children. Used by the UI classes' querySelector('#hud-health') etc.
  querySelector(sel) {
    return this._queryAll(sel)[0] ?? null;
  }
  querySelectorAll(sel) { return this._queryAll(sel); }
  _queryAll(sel) {
    const out = [];
    sel = sel.trim();
    const isTag = /^[a-z]+$/i.test(sel);
    for (const c of this.children) {
      _walk(c, (n) => {
        if (sel.startsWith('#')) { if (n._attrs.id === sel.slice(1)) out.push(n); }
        else if (isTag) { if (n.tagName === sel.toUpperCase()) out.push(n); }
      });
    }
    // Also consider self for tag matches of direct lookups (not needed here).
    return out;
  }
}

// DOMTokenList-like: supports contains/add/remove and a has() alias for tests.
function makeClassList() {
  const set = new Set();
  const tl = (cls) => set.add(cls);
  tl.contains = (cls) => set.has(cls);
  tl.has = (cls) => set.has(cls);
  tl.add = (cls) => { set.add(cls); };
  tl.remove = (cls) => { set.delete(cls); };
  tl.toggle = (cls, force) => {
    if (force === true) { set.add(cls); return true; }
    if (force === false) { set.delete(cls); return false; }
    if (set.has(cls)) { set.delete(cls); return false; }
    set.add(cls); return true;
  };
  return tl;
}

function _walk(node, fn) {
  fn(node);
  for (const c of node.children) _walk(c, fn);
}

// Document stub: createElement builds an El; when innerHTML is assigned, we parse
// id="..." attributes and attach synthetic child El nodes so querySelector finds
// them by id. Style/classList/textContent are live on those children so tests
// can assert state set by the UI classes. Exposed on globalThis so the UI classes
// (which reference the global `document`) resolve to this stub.
const doc = {
  head: new El('head'),
  documentElement: new El('html'),
  _byId: new Map(),
  createElement(tag) {
    const el = new El(tag);
    const nativeEl = el;
    // Make innerHTML assignment materialize id-tagged children with live style.
    Object.defineProperty(nativeEl, 'innerHTML', {
      get() { return nativeEl._htmlStr ?? ''; },
      set(html) {
        nativeEl._htmlStr = html;
        nativeEl.children = [];
        // Extract <tag ... id="x" ...> occurrences.
        const re = /<([a-z1-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
          const child = new El(m[1]);
          child._attrs.id = m[2];
          child.parentNode = nativeEl;
          nativeEl.children.push(child);
        }
        // Also materialize bare <span> children for querySelectorAll('span').
        const spanRe = /<span\b[^>]*>/gi;
        let sm;
        while ((sm = spanRe.exec(html)) !== null) {
          if (!nativeEl.children.some(c => c.tagName === 'SPAN' && !c._attrs.id)) {
            const span = new El('span');
            span.parentNode = nativeEl;
            nativeEl.children.push(span);
          }
        }
      },
      configurable: true,
    });
    return el;
  },
  getElementById(id) { return this._byId.get(id) ?? null; },
};
globalThis.document = doc;

function fakeRoot() {
  const root = doc.createElement('div');
  return root;
}

describe('Hud (DOM overlay) smoke', () => {
  it('constructs and sets gradient health/ammo bars', () => {
    const hud = new Hud(fakeRoot());
    hud.setHealth(100);
    expect(hud.healthBarEl.style.width).toBe('100%');
    // setHealth applies a vertical depth gradient (light->base->dark) on top of
    // the computed hue, rather than a flat color.
    expect(hud.healthBarEl.style.background).toContain('linear-gradient');
    expect(hud.healthBarEl.style.background).toContain('hsl(');
    hud.setAmmo(10, 30);
    expect(hud.ammoBarEl.style.background).toContain('linear-gradient');
  });

  it('toggles the low-HP pulse class below 30% and removes it above', () => {
    const hud = new Hud(fakeRoot());
    hud.setHealth(20);
    expect(hud.healthBarEl.classList.has('hud-lowhp')).toBe(true);
    hud.setHealth(80);
    expect(hud.healthBarEl.classList.has('hud-lowhp')).toBe(false);
  });

  it('flashDamage applies a red tint/scale and is re-triggerable without throwing', () => {
    const hud = new Hud(fakeRoot());
    expect(() => { hud.flashDamage(); hud.flashDamage(); }).not.toThrow();
    // Immediately after calling, the HP text is scaled up + tinted red.
    expect(hud.healthEl.style.transform).toContain('scale(1.15)');
    expect(hud.healthEl.style.color).toBe('#ff5555');
  });
});

describe('Crosshair (DOM overlay) smoke', () => {
  it('constructs and exposes setSpread + bloom; bloom is non-destructive', () => {
    const c = new Crosshair(fakeRoot());
    expect(typeof c.setSpread).toBe('function');
    expect(typeof c.bloom).toBe('function');
    c.setSpread(20);
    // base spread recorded; visible size at least 20.
    const w0 = parseInt(c.el.style.width, 10);
    expect(w0).toBeGreaterThanOrEqual(20);
    c.bloom(10);
    // Bloom should not shrink the crosshair below its post-setSpread size.
    const w1 = parseInt(c.el.style.width, 10);
    expect(w1).toBeGreaterThanOrEqual(w0);
  });
});

describe('EndScreen (DOM overlay) smoke', () => {
  it('renders placement tiers + winner styling and keeps PLAY AGAIN', () => {
    let again = 0;
    const end = new EndScreen(fakeRoot(), { onPlayAgain: () => { again++; } });
    const ranked = [
      { animalId: 'FOX', score: 12, deaths: 3, isLocal: true },
      { animalId: 'WOLF', score: 8, deaths: 4, isLocal: false },
      { animalId: 'BEAR', score: 5, deaths: 5, isLocal: false },
      { animalId: 'CAT', score: 2, deaths: 6, isLocal: false },
    ];
    expect(() => end.show(ranked)).not.toThrow();
    expect(end.el.style.display).toBe('flex');
    const html = end.el.innerHTML;
    // 1st crown glyph + gold color present.
    expect(html).toContain('👑');
    expect(html).toContain('#ffb84d');
    // 2nd/3rd medal glyphs + silver/bronze colors present.
    expect(html).toContain('🥈');
    expect(html).toContain('#c0c8d4');
    expect(html).toContain('🥉');
    expect(html).toContain('#cd7f32');
    // Celebratory accent (sparkles) shown because the local player won.
    expect(html).toContain('✦ ✦ ✦');
    // PLAY AGAIN button retained and wired.
    expect(html).toContain('PLAY AGAIN');
    const btn = end.el.querySelector('#again-btn');
    expect(btn).not.toBeNull();
    btn.onclick();
    expect(again).toBe(1);
    expect(end.el.style.display).toBe('none');
  });

  it('omits the celebratory accent when the local player did NOT win', () => {
    const end = new EndScreen(fakeRoot(), {});
    end.show([
      { animalId: 'WOLF', score: 12, deaths: 3, isLocal: false },
      { animalId: 'FOX', score: 8, deaths: 4, isLocal: true },
    ]);
    expect(end.el.innerHTML).not.toContain('✦ ✦ ✦');
    expect(end.el.innerHTML).toContain('DEFEATED');
  });
});
