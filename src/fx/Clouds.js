import * as THREE from 'three';

// Drifting cloud billboards for sky depth (V7).
//
// `count` large flat THREE.Sprite puffs with a procedural soft-alpha CanvasTexture
// (NormalBlending, transparent — so they read as clouds against the sky, not as
// additive glows). Spread deterministically (seeded) across `area`×`area` at the
// given sky `height`. update(dt) drifts each cloud slowly in +X (wind) and wraps
// around the area edge.
//
// NON-collidable. Contract (same as WaterPlane): constructed inside a map's
// build() with the arena `group`; Clouds adds its sprites to that group (so they
// are disposed on map teardown — no cross-map leaks) and pushes `this` onto
// `group.userData.updatables` so the Game loop updates it.
//
// Headless-safe: the canvas texture is only built when `document` exists; sprites
// still construct with a flat color when headless (no throw).

// Deterministic PRNG so cloud placement is repeatable (matches collider determinism).
function seededRand(seed) {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// Build a soft-puff CanvasTexture: radial gradient white→transparent with a few
// overlapping blobs for a natural cloud silhouette. Cached statically (built once).
let _puffTex = null;
function puffTexture(color, opacity) {
  if (typeof document === 'undefined') return null;
  if (_puffTex) return _puffTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const rgba = (a) => `rgba(${r},${g},${b},${a})`;
  ctx.clearRect(0, 0, s, s);
  // several overlapping radial-gradient blobs form a fluffy cluster
  const blobs = 6;
  const rand = seededRand(99);
  for (let i = 0; i < blobs; i++) {
    const bx = s * (0.25 + rand() * 0.5);
    const by = s * (0.35 + rand() * 0.3);
    const rad = s * (0.22 + rand() * 0.16);
    const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
    g2.addColorStop(0, rgba(opacity * 0.9));
    g2.addColorStop(0.6, rgba(opacity * 0.45));
    g2.addColorStop(1, rgba(0));
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(bx, by, rad, rad * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _puffTex = tex;
  return tex;
}

export class Clouds {
  /**
   * @param {THREE.Object3D} group  the arena group: sprites are added here + `this`
   *                                is pushed onto group.userData.updatables
   * @param {object} [opts]
   *   count   — number of cloud sprites (default 8)
   *   area    — world spread across X/Z (default 160)
   *   height  — sky Y (default 55)
   *   color   — cloud color hex (default 0xffffff)
   *   opacity — per-puff alpha (default 0.85)
   *   seed    — PRNG seed for deterministic placement (default 12345)
   *   speed   — wind drift speed, units/sec (default 3)
   */
  constructor(group, {
    count = 8,
    area = 160,
    height = 55,
    color = 0xffffff,
    opacity = 0.85,
    seed = 12345,
    speed = 3,
  } = {}) {
    this.group = group;
    this.area = area;
    this.height = height;
    this.speed = speed;

    // Ensure the updatables array exists on the group, then register self.
    if (!group.userData) group.userData = {};
    if (!Array.isArray(group.userData.updatables)) group.userData.updatables = [];
    group.userData.updatables.push(this);

    const tex = puffTexture(color, opacity);
    const rand = seededRand(seed);
    const half = area / 2;

    this._sprites = [];
    this._disposed = false;
    for (let i = 0; i < count; i++) {
      let mat;
      if (tex) {
        mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
      } else {
        mat = new THREE.SpriteMaterial({ color, transparent: true, opacity, depthWrite: false });
      }
      const sprite = new THREE.Sprite(mat);
      const scale = 30 + rand() * 30; // 30–60 units
      sprite.scale.set(scale, scale * 0.6, 1);
      sprite.position.set(
        -half + rand() * area,
        height,
        -half + rand() * area,
      );
      group.add(sprite);
      this._sprites.push(sprite);
    }
  }

  // Drift each cloud slowly in +X and wrap around when it passes the area edge.
  update(dt) {
    const half = this.area / 2;
    for (const s of this._sprites) {
      s.position.x += dt * this.speed;
      if (s.position.x > half) s.position.x -= this.area;
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    // Sprites share a single cached puff texture — don't dispose it per-instance.
    for (const s of this._sprites) {
      if (s.material) s.material.dispose();
    }
    this._sprites = [];
  }
}
