import * as THREE from 'three';

// An animated translucent water quad for the Tropic map's lagoon (V5).
//
// A flat PlaneGeometry lies just above the ground (y≈0.05) with a semi-transparent
// MeshStandardMaterial. A small procedural ripple CanvasTexture (built once in the
// constructor) is scrolled in update(dt) to give the surface gentle motion.
//
// NON-collidable: it is added directly to a map's group, never through `place()`.
//
// Contract: a map's build() creates a WaterPlane, adds `.mesh` to its arena
// group, and pushes the WaterPlane instance onto `group.userData.updatables`
// (an array the Game loop drains each frame via update(dt)).
//
// Headless-safe: the canvas texture is only built when `document` exists; in a
// headless env the material falls back to flat color (still constructs + updates
// without throwing).

// Build a soft ripple CanvasTexture: a blue gradient base with faint lighter
// ripple lines, tiled. Returns a THREE.CanvasTexture (or null if no document).
function buildRippleTexture(color) {
  if (typeof document === 'undefined') return null;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  // base gradient from a slightly lighter top to the given color
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`);
  grad.addColorStop(1, `rgb(${r},${g},${b})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // faint lighter ripple lines (concentric-ish arcs) for surface texture
  ctx.strokeStyle = `rgba(255,255,255,0.18)`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const y = (s / 5) * i + 12;
    for (let x = 0; x <= s; x += 8) {
      const yy = y + Math.sin((x / s) * Math.PI * 4 + i) * 3;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WaterPlane {
  /**
   * @param {number} width  quad width (X)
   * @param {number} depth  quad depth (Z)
   * @param {number} color  base water color (hex int)
   */
  constructor(width, depth, color = 0x2fb4c8) {
    const geo = new THREE.PlaneGeometry(width, depth);
    const tex = buildRippleTexture(color);
    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      metalness: 0.1,
      roughness: 0.25,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
      ...(tex ? { map: tex } : {}),
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2; // lay flat (XZ plane)
    mesh.position.y = 0.05;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // NON-collidable: a caller adds this mesh to a group directly, never via place().

    this.width = width;
    this.depth = depth;
    this.color = color;
    this.mesh = mesh;
    this.group = mesh; // alias: both expose the Object3D a map adds to its group
    this._tex = tex;
    this._speed = 0.04; // scroll speed (units of offset per second)
  }

  // Scroll the ripple texture offset for gentle surface motion. Safe to call
  // even when no texture was built (headless): it no-ops cleanly.
  update(dt) {
    if (!this._tex) return;
    this._tex.offset.x += dt * this._speed;
    this._tex.offset.y += dt * this._speed * 0.6;
  }

  dispose() {
    this.mesh.geometry.dispose();
    if (this.mesh.material) {
      if (this._tex) this._tex.dispose();
      this.mesh.material.dispose();
    }
  }
}
