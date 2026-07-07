import * as THREE from 'three';

// Procedural canvas textures — drawn at runtime, cached, no asset files.
// Each `get(name, opts)` returns a THREE.CanvasTexture. Repeated calls with the
// same name/opts return the cached texture to avoid duplicate canvas draws.

const _cache = new Map();

function key(name, opts) {
  return name + ':' + JSON.stringify(opts || {});
}

/**
 * Get a cached procedural texture.
 * @param {string} name - one of: camo, wood, metal, concrete, fur, stripes,
 *   grid, cobble, sand, turf, planks, rock
 * @param {object} [opts] - { size=128, base=hex, accent=hex, seed }
 * @returns {THREE.CanvasTexture}
 */
export function get(name, opts = {}) {
  const k = key(name, opts);
  if (_cache.has(k)) return _cache.get(k);
  const tex = makeTexture(name, opts);
  _cache.set(k, tex);
  return tex;
}

export function clearCache() {
  _cache.clear();
}

function hexToRgb(h) {
  return { r: (h >> 16) & 255, g: (h >> 8) & 255, b: h & 255 };
}
function rgb(c, a = 1) {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
// Deterministic pseudo-random from a seed for repeatable textures.
function seededRand(seed) {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function makeTexture(name, opts) {
  const size = opts.size || 128;
  const base = hexToRgb(opts.base != null ? opts.base : 0x808080);
  const accent = hexToRgb(opts.accent != null ? opts.accent : 0x404040);
  const rand = seededRand(opts.seed != null ? opts.seed : 12345);

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // fill base
  ctx.fillStyle = rgb(base);
  ctx.fillRect(0, 0, size, size);

  switch (name) {
    case 'camo': drawCamo(ctx, size, base, accent, rand); break;
    case 'wood': drawWood(ctx, size, base, accent, rand); break;
    case 'metal': drawMetal(ctx, size, base, accent, rand); break;
    case 'concrete': drawConcrete(ctx, size, base, accent, rand); break;
    case 'fur': drawFur(ctx, size, base, accent, rand); break;
    case 'stripes': drawStripes(ctx, size, base, accent); break;
    case 'grid': drawGrid(ctx, size, base, accent); break;
    case 'cobble': drawCobble(ctx, size, base, accent, rand); break;
    case 'sand': drawSand(ctx, size, base, accent, rand); break;
    case 'turf': drawTurf(ctx, size, base, accent, rand); break;
    case 'planks': drawPlanks(ctx, size, base, accent, rand); break;
    case 'rock': drawRock(ctx, size, base, accent, rand); break;
    default: /* just base */ break;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter; // crisp low-poly look
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function shade(c, amt) {
  // amt in [-1,1]; negative darkens, positive lightens
  const f = amt < 0 ? (1 + amt) : 1;
  const a = amt < 0 ? 0 : amt;
  return {
    r: Math.max(0, Math.min(255, Math.round(c.r * f + 255 * a))),
    g: Math.max(0, Math.min(255, Math.round(c.g * f + 255 * a))),
    b: Math.max(0, Math.min(255, Math.round(c.b * f + 255 * a))),
  };
}

function drawCamo(ctx, size, base, accent, rand) {
  const colors = [base, accent, shade(base, -0.25), shade(accent, 0.2)];
  for (let i = 0; i < 18; i++) {
    const col = colors[Math.floor(rand() * colors.length)];
    ctx.fillStyle = rgb(col);
    const x = rand() * size, y = rand() * size;
    const rx = size * (0.12 + rand() * 0.18), ry = size * (0.12 + rand() * 0.18);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWood(ctx, size, base, accent, rand) {
  // base already wood-ish; add vertical grain streaks
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const w = 1 + rand() * 3;
    const dark = shade(base, -0.15 - rand() * 0.2);
    ctx.fillStyle = rgb(dark, 0.5 + rand() * 0.4);
    ctx.fillRect(x, 0, w, size);
  }
  // a few knots
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = rgb(shade(base, -0.4), 0.8);
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, 4 + rand() * 4, 3 + rand() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMetal(ctx, size, base, accent, rand) {
  // brushed metal: horizontal anisotropic streaks
  for (let y = 0; y < size; y += 1) {
    const v = (rand() - 0.5) * 0.25;
    ctx.fillStyle = rgb(shade(base, v), 0.5);
    ctx.fillRect(0, y, size, 1);
  }
  // a couple of panel seams
  ctx.strokeStyle = rgb(accent, 0.6);
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i); ctx.lineTo(size, (size / 4) * i);
    ctx.stroke();
  }
}

function drawConcrete(ctx, size, base, accent, rand) {
  // fine noise + a few cracks
  for (let i = 0; i < size * size * 0.15; i++) {
    const x = rand() * size, y = rand() * size;
    const v = (rand() - 0.5) * 0.3;
    ctx.fillStyle = rgb(shade(base, v), 0.4);
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.strokeStyle = rgb(accent, 0.5);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = rand() * size, y = rand() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rand() - 0.5) * 20; y += (rand() - 0.5) * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawFur(ctx, size, base, accent, rand) {
  // directional short strokes to suggest fur
  for (let i = 0; i < size * 6; i++) {
    const x = rand() * size, y = rand() * size;
    const len = 2 + rand() * 4;
    const dark = rand() > 0.5 ? shade(base, -0.2) : shade(base, 0.12);
    ctx.strokeStyle = rgb(dark, 0.4 + rand() * 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y + len); // mostly downward fur direction
    ctx.stroke();
  }
}

function drawStripes(ctx, size, base, accent) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      ctx.fillStyle = rgb(accent);
      ctx.fillRect(0, (size / n) * i, size, size / n);
    }
  }
}

function drawGrid(ctx, size, base, accent) {
  ctx.strokeStyle = rgb(accent, 0.5);
  ctx.lineWidth = 1;
  const step = size / 8;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
}

// Warm cobblestone pavers: irregular rounded stones separated by dark mortar
// grout. base = stone tone, accent = grout/shadow tone.
function drawCobble(ctx, size, base, accent, rand) {
  // mortar background
  ctx.fillStyle = rgb(shade(accent, -0.25));
  ctx.fillRect(0, 0, size, size);
  // irregular rounded stones packed in a loose grid
  const cells = 5;
  const step = size / cells;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = gx * step + step / 2 + (rand() - 0.5) * step * 0.3;
      const cy = gy * step + step / 2 + (rand() - 0.5) * step * 0.3;
      const rx = step * (0.32 + rand() * 0.12);
      const ry = step * (0.32 + rand() * 0.12);
      // per-stone tone variation
      const tone = shade(base, (rand() - 0.5) * 0.22);
      ctx.fillStyle = rgb(tone);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // inner highlight + lower shadow for a beveled look
      ctx.fillStyle = rgb(shade(tone, 0.18), 0.5);
      ctx.beginPath();
      ctx.ellipse(cx - rx * 0.2, cy - ry * 0.25, rx * 0.7, ry * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(shade(tone, -0.28), 0.45);
      ctx.beginPath();
      ctx.ellipse(cx + rx * 0.15, cy + ry * 0.3, rx * 0.85, ry * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Fine-grain beach sand: speckled warm grains with subtle wind ripples.
function drawSand(ctx, size, base, accent, rand) {
  // soft diagonal ripple bands
  ctx.strokeStyle = rgb(shade(base, -0.08), 0.25);
  ctx.lineWidth = 1;
  for (let y = -size; y < size * 2; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.2 + y * 0.07) * 2);
    }
    ctx.stroke();
  }
  // fine grains: dense speckle of light + dark dots
  const grains = Math.floor(size * size * 0.35);
  for (let i = 0; i < grains; i++) {
    const x = rand() * size, y = rand() * size;
    const dark = rand() > 0.5;
    ctx.fillStyle = dark ? rgb(shade(accent, 0.15), 0.5) : rgb(shade(base, 0.12), 0.5);
    ctx.fillRect(x, y, 1, 1);
  }
}

// Grass turf with a dirt underlay: mottled green blades over patchy earth.
// base reads as grass green, accent as dirt brown.
function drawTurf(ctx, size, base, accent, rand) {
  // patchy dirt blotches first (the earth showing through)
  for (let i = 0; i < 10; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.08 + rand() * 0.16);
    ctx.fillStyle = rgb(shade(accent, (rand() - 0.5) * 0.2), 0.6);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // short upward grass blades in a couple of green shades
  const blades = Math.floor(size * size * 0.5);
  for (let i = 0; i < blades; i++) {
    const x = rand() * size, y = rand() * size;
    const len = 2 + rand() * 3;
    const col = rand() > 0.5 ? shade(base, 0.12) : shade(base, -0.18);
    ctx.strokeStyle = rgb(col, 0.5 + rand() * 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 1.5, y - len);
    ctx.stroke();
  }
}

// Wooden floor planks: horizontal boards separated by dark seams, with grain
// running along each plank and a few knots. base = plank wood tone.
function drawPlanks(ctx, size, base, accent, rand) {
  const n = 5;
  const step = size / n;
  for (let i = 0; i < n; i++) {
    const y0 = i * step;
    // alternate plank tones for variety
    const tone = shade(base, (i % 2 === 0 ? -1 : 1) * (0.04 + rand() * 0.06));
    ctx.fillStyle = rgb(tone);
    ctx.fillRect(0, y0, size, step);
    // grain streaks along the plank
    for (let g = 0; g < 18; g++) {
      ctx.fillStyle = rgb(shade(tone, -0.12 - rand() * 0.12), 0.4);
      const gx = rand() * size;
      ctx.fillRect(gx, y0 + 1, 1 + rand() * 2, step - 2);
    }
    // occasional knot
    if (rand() > 0.5) {
      ctx.fillStyle = rgb(shade(tone, -0.35), 0.8);
      ctx.beginPath();
      ctx.ellipse(rand() * size, y0 + step / 2, 2 + rand() * 2, 1.5 + rand() * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // dark seam between planks
    ctx.fillStyle = rgb(shade(accent, -0.3), 0.7);
    ctx.fillRect(0, y0, size, 1);
  }
}

// Angular tropical stone: irregular polygonal rocks with darker cracks, a
// few mossy-green patches, and a hint of warmth. base = stone gray-green,
// accent = crack/shadow tone. Reads as a low-poly rocky outcrop when tiled.
function drawRock(ctx, size, base, accent, rand) {
  // Sparse moss blotches (warm-tinted green) — gives the stone tropical character.
  for (let i = 0; i < 6; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.05 + rand() * 0.10);
    const moss = { r: 90 + Math.floor(rand() * 30), g: 120 + Math.floor(rand() * 30), b: 50 + Math.floor(rand() * 25) };
    ctx.fillStyle = rgb(moss, 0.45);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Angular rock facets: medium-tone polygons that suggest a chipped stone.
  for (let i = 0; i < 14; i++) {
    const cx = rand() * size, cy = rand() * size;
    const tone = shade(base, (rand() - 0.5) * 0.30);
    ctx.fillStyle = rgb(tone, 0.85);
    const pts = 4 + Math.floor(rand() * 3);
    const r = size * (0.06 + rand() * 0.10);
    ctx.beginPath();
    for (let p = 0; p < pts; p++) {
      const a = (p / pts) * Math.PI * 2 + rand() * 0.4;
      const rr = r * (0.7 + rand() * 0.5);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Dark angular cracks (3 short segmented strokes).
  ctx.strokeStyle = rgb(shade(accent, -0.35), 0.55);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    let x = rand() * size, y = rand() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4 + Math.floor(rand() * 3); s++) {
      x += (rand() - 0.5) * 18;
      y += (rand() - 0.5) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Fine speckle grain — adds surface noise like real weathered stone.
  for (let i = 0; i < size * size * 0.18; i++) {
    const x = rand() * size, y = rand() * size;
    const v = (rand() - 0.5) * 0.4;
    ctx.fillStyle = rgb(shade(base, v), 0.35);
    ctx.fillRect(x, y, 1, 1);
  }
}
