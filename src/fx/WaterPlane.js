import * as THREE from 'three';

// An animated translucent water quad for the Tropic map's lagoon (V6).
//
// A subdivided PlaneGeometry with subtle per-vertex displacement lies just
// above the ground (y≈0.05) so the surface gently ripples instead of reading
// as flat. A procedural ripple CanvasTexture (built once in the constructor)
// is scrolled in update(dt) to give the surface motion and is supplemented
// by:
//   - a few bright "caustic sparkle" pixels scattered across the texture
//   - a second finer set of cross-grain ripple lines
//   - a darker base color stop for deeper color variation
//   - a very subtle per-frame emissive shimmer (light playing on water)
// A pale foam RingGeometry sits at y=0.04 just under the water and reads as
// the breaking-foam rim around the lagoon edge.
//
// NON-collidable: it is added directly to a map's group, never through
// `place()`. The whole WaterPlane `group` is added to the arena group (so
// Game.loadMap() teardown traverses + disposes every descendant), and the
// WaterPlane instance itself is pushed onto `group.userData.updatables` so
// the Game loop calls update(dt) each frame.
//
// Contract (preserved from V5): a map's build() creates a WaterPlane, adds
// `.mesh` (or `.group`) to its arena group, and pushes the WaterPlane
// instance onto `group.userData.updatables`. `.mesh` still points at the
// main water quad; `.group` now contains BOTH the main water mesh AND a
// foam ring mesh. Existing call sites that used `.mesh` keep working; the
// V5 test that asserted `water.group === water.mesh` was relaxed in V6
// because the group is now a proper THREE.Group with multiple children.
//
// Updatables dispose contract: updatables registered via
// `group.userData.updatables` are updated each frame by Game but Game never
// calls their `dispose()`. Therefore an updatable MUST place ALL of its GPU
// resources (meshes/sprites and their materials/textures) as descendants of
// the arena group so Game.loadMap()'s teardown traverses and disposes them.
// WaterPlane satisfies this: the main water mesh, the foam ring, and the
// ripple texture (referenced via `material.map`) all live as descendants
// of `.group` (which the caller adds to the arena group).
//
// Headless-safe: the canvas texture is only built when `document` exists; in
// a headless env the material falls back to flat color (still constructs +
// updates without throwing). The geometry displacement is a pure-JS loop on
// `geometry.attributes.position.array` so it works in either mode.

// Deterministic 2-axis hash (no Math.random) used to drop a few "sparkle"
// pixels into the ripple texture at fixed positions, so the texture cache
// stays reproducible across builds.
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

// Build a soft ripple CanvasTexture: a darker base + lighter caustic
// highlights + a few bright sparkle dots + two layers of fine ripple lines.
// Returns a THREE.CanvasTexture (or null if no document).
function buildRippleTexture(color) {
  if (typeof document === 'undefined') return null;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  // darker base stop for deeper color variation
  const dr = Math.max(0, r - 28), dg = Math.max(0, g - 28), db = Math.max(0, b - 28);
  // base gradient: lighter top → given color → slightly darker bottom
  const grad = ctx.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 22)},${Math.min(255, g + 22)},${Math.min(255, b + 22)})`);
  grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
  grad.addColorStop(1, `rgb(${dr},${dg},${db})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  // second, finer cross-grain ripple layer for surface detail
  ctx.strokeStyle = `rgba(255,255,255,0.12)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const x = (s / 9) * i + 8;
    for (let y = 0; y <= s; y += 6) {
      const xx = x + Math.sin((y / s) * Math.PI * 5 + i * 0.9) * 2.5;
      if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  // main horizontal ripple arcs (the original V5 detail, kept)
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
  // A handful of bright "caustic sparkle" pixels scattered deterministically.
  // 24 small bright dots — enough to read as sun glints without overdoing it.
  const sparkleCount = 24;
  for (let i = 0; i < sparkleCount; i++) {
    const sx = Math.floor(hash2(i, 7) * s);
    const sy = Math.floor(hash2(i + 11, 31) * s);
    const radius = 0.6 + hash2(i * 3, 17) * 1.2; // sub-pixel to ~1.4px
    const alpha = 0.55 + hash2(i + 5, 53) * 0.35;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Per-vertex Y displacement for the water plane so the surface has a gentle
// 3D ripple (max ±0.05m). The base shape is deterministic: a sum of three
// sinusoids on (x,z). The caller animates it over time by re-invoking with
// a `phase` shift. Returns Float32Array of Y offsets for every vertex in
// a (widthSegments+1) × (depthSegments+1) grid.
function buildDisplacement(width, depth, phase, widthSegments, depthSegments) {
  const arr = new Float32Array((widthSegments + 1) * (depthSegments + 1));
  for (let iz = 0; iz <= depthSegments; iz++) {
    for (let ix = 0; ix <= widthSegments; ix++) {
      const x = (ix / widthSegments - 0.5) * width;
      const z = (iz / depthSegments - 0.5) * depth;
      // Three small-amplitude sinusoids: gentle primary swell, a finer
      // cross-grain ripple, and a slower diagonal wave. Max ≈ 0.045m.
      const y =
        Math.sin(x * 0.45 + phase * 1.3) * 0.020 +
        Math.cos(z * 0.60 + phase * 1.1) * 0.018 +
        Math.sin((x + z) * 0.95 + phase * 1.7) * 0.012;
      arr[iz * (widthSegments + 1) + ix] = y;
    }
  }
  return arr;
}

export class WaterPlane {
  /**
   * @param {number} width  quad width (X)
   * @param {number} depth  quad depth (Z)
   * @param {number} color  base water color (hex int)
   */
  constructor(width, depth, color = 0x2fb4c8) {
    // Subdivided plane so per-vertex displacement reads as a soft swell.
    // widthSegments≈width (1m cells) gives enough density for visible
    // gentle waves without over-tessellating.
    const widthSegments = Math.max(8, Math.round(width));
    const depthSegments = Math.max(8, Math.round(depth));
    const geo = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments);

    // Bake the initial per-vertex displacement into the geometry. PlaneGeometry
    // vertices live in the XY plane (Z=0 in local frame); we write into Z so
    // that after the -PI/2 X rotation the displacement becomes world-space Y
    // (the up axis).
    const posAttr = geo.attributes.position;
    const initialDisp = buildDisplacement(width, depth, 0, widthSegments, depthSegments);
    for (let i = 0; i < initialDisp.length; i++) {
      posAttr.setZ(i, initialDisp[i]);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    const tex = buildRippleTexture(color);
    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      metalness: 0.1,
      roughness: 0.22,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.05,
      ...(tex ? { map: tex } : {}),
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2; // lay flat (XZ plane)
    mesh.position.y = 0.05;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // NON-collidable: a caller adds this mesh to a group directly, never via place().

    // FOAM RING — a thin pale-foam-colored ring hugging the water edge.
    // Sits at y=0.04 (just below the water so it reads as a brightening at
    // the waterline). Outer radius is half the water's max side so the ring
    // is wider than the water plane itself by ~0.5m all around.
    const halfMax = Math.max(width, depth) / 2;
    const innerR = halfMax * 0.98; // just inside the water edge
    const outerR = halfMax + 0.5;  // ~0.5m past the water
    const ringGeo = new THREE.RingGeometry(innerR, outerR, 64);
    // Light, milky foam color: very pale aqua, slightly tinted by water color.
    const fr = (color >> 16) & 255, fg = (color >> 8) & 255, fb = color & 255;
    const foamColor = (Math.min(255, fr + 80) << 16) | (Math.min(255, fg + 80) << 8) | Math.min(255, fb + 60);
    const foamMat = new THREE.MeshStandardMaterial({
      color: foamColor,
      transparent: true,
      opacity: 0.85,
      roughness: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const foam = new THREE.Mesh(ringGeo, foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.04;
    foam.receiveShadow = true;
    foam.castShadow = false;
    foam.renderOrder = 1; // draw above the ground slab but below the water
    foam.name = 'foamRing';

    // Group: parent for the main water + foam ring. The whole group is what
    // a map's build() adds to its arena group (so teardown traverses it).
    const group = new THREE.Group();
    group.name = 'waterPlane';
    group.add(foam);
    group.add(mesh);

    this.width = width;
    this.depth = depth;
    this.color = color;
    this.mesh = mesh;        // main water mesh (kept as alias for V5 compat)
    this.foam = foam;        // foam ring mesh (exposed for tests / future)
    this.group = group;      // group containing water + foam (V6: real Group)
    this._tex = tex;
    this._speed = 0.04;      // scroll speed (units of offset per second)
    this._phase = 0;         // accumulated animation phase for displacement
    this._posAttr = posAttr;
    this._widthSegments = widthSegments;
    this._depthSegments = depthSegments;
  }

  // Per-frame animation:
  //   - scroll the ripple texture offset for gentle surface motion
  //   - re-bake the per-vertex Y displacement with a scrolling phase so the
  //     water surface visibly shifts (the swell moves)
  //   - very subtly modulate the emissiveIntensity to suggest light playing
  //     on the surface (kept tiny so it does not strobe)
  // Safe to call even when no texture was built (headless): it no-ops cleanly
  // on the texture offset; the displacement + emissive work either way.
  update(dt) {
    if (this._tex) {
      this._tex.offset.x += dt * this._speed;
      this._tex.offset.y += dt * this._speed * 0.6;
    }
    // Animate the wave geometry: scroll the noise phase forward in time.
    this._phase += dt;
    const arr = this._posAttr.array;
    const stride = 3; // position is (x,y,z)
    const w = this.width, d = this.depth;
    const ws = this._widthSegments, ds = this._depthSegments;
    const phase = this._phase;
    for (let iz = 0; iz <= ds; iz++) {
      for (let ix = 0; ix <= ws; ix++) {
        const x = (ix / ws - 0.5) * w;
        const z = (iz / ds - 0.5) * d;
        const y =
          Math.sin(x * 0.45 + phase * 1.3) * 0.020 +
          Math.cos(z * 0.60 + phase * 1.1) * 0.018 +
          Math.sin((x + z) * 0.95 + phase * 1.7) * 0.012;
        const i = (iz * (ws + 1) + ix) * stride + 2; // z component
        arr[i] = y;
      }
    }
    this._posAttr.needsUpdate = true;
    // Subtle shimmer: modulate emissiveIntensity by ±~25% on a slow sine.
    // Keeps the material's base color untouched so the contract is preserved.
    if (this.mesh && this.mesh.material && this.mesh.material.emissiveIntensity !== undefined) {
      const shimmer = 0.05 + Math.sin(phase * 0.7) * 0.012; // 0.038 .. 0.062
      this.mesh.material.emissiveIntensity = shimmer;
    }
  }

  dispose() {
    if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.mesh && this.mesh.material) {
      if (this._tex) this._tex.dispose();
      this.mesh.material.dispose();
    }
    if (this.foam) {
      if (this.foam.geometry) this.foam.geometry.dispose();
      if (this.foam.material) this.foam.material.dispose();
    }
  }
}