import * as THREE from 'three';

// Browser-only lazy texture loader. Caches results by path so repeated lookups
// are free. Never imported by the sim/server (those don't render).
const _loader = new THREE.TextureLoader();
const _cache = new Map();          // path -> { tex, loaded }
const _pending = new Map();        // path -> Promise

// Returns a cached texture immediately if loaded, else null.
export function getCached(path) {
  const e = _cache.get(path);
  return e && e.loaded ? e.tex : null;
}

// load(path) → Promise<THREE.Texture|null>. Resolves null on error or when there's
// no usable DOM (e.g. node test/server env) — never rejects, so callers treat null
// as "use fallback".
export function load(path) {
  if (_pending.has(path)) return _pending.get(path);
  // No real DOM image loading (node/server/test) → can't load images; use fallback.
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
    return Promise.resolve(null);
  }
  const prom = new Promise((resolve) => {
    _loader.load(
      path,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        _cache.set(path, { tex, loaded: true });
        _pending.delete(path);
        resolve(tex);
      },
      undefined,
      () => { _pending.delete(path); resolve(null); }   // missing asset → null (use fallback)
    );
  });
  _pending.set(path, prom);
  return prom;
}

// loadOrFallback(path, material): apply the texture to material.map when it
// arrives (and set material.needsUpdate). Until then material keeps its current
// flat look. Safe to call every build — the load is cached.
export function loadOrFallback(path, material) {
  const cached = getCached(path);
  if (cached) { material.map = cached; material.needsUpdate = true; return; }
  load(path).then((tex) => {
    if (tex && material) { material.map = tex; material.needsUpdate = true; }
  });
}
