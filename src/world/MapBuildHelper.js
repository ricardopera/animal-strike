import * as THREE from 'three';
import { get as getTexture } from '../textures/TextureFactory.js';

// Shared geometry primitives used by every map's build() function.
// Extracted verbatim from the original ArenaBuilder so all maps author
// geometry identically (same PBR tuning, same shadow flags, same symmetry rule).
//
// Usage in a map's build(scene, colliders, helper):
//   const place = (mesh) => { group.add(mesh); colliders.addFromMesh(mesh); };
//   helper.placePair(place, w,h,d,color,x,y,z,'wood');

export function makeBuildHelper() {
  return { box, placePair, shadeHex, contactShadow, colliderPass };
}

// A collider-only build mode: same box()/placePair() geometry authoring, but
// records each box's world AABB into the `out` array instead of allocating
// THREE meshes/textures. The server uses this to build a ColliderStore headlessly.
// Returns { place, placePair } bound to the out array.
function colliderPass(out) {
  const cbox = (w, h, d, color, x, y, z) => {
    out.push({ min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2] });
  };
  const placePairC = (w, h, d, color, x, y, z) => {
    cbox(w, h, d, color, x, y, z);
    if (x !== 0 || z !== 0) cbox(w, h, d, color, -x, y, -z);
  };
  return { place: cbox, placePair: placePairC };
}

// Textured PBR box. Metal surfaces get high metalness + low roughness; others
// stay matte. Casts + receives shadows. Signature matches original ArenaBuilder.box.
function box(w, h, d, color, x, y, z, texName, texOpts) {
  let material;
  if (texName) {
    const tex = getTexture(texName, { base: color, accent: shadeHex(color, -0.3), ...(texOpts || {}) });
    const t = tex.clone();
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    const rep = Math.max(1, Math.round(Math.max(w, h, d) / 2));
    t.repeat.set(rep, rep);
    const isMetal = texName === 'metal';
    material = new THREE.MeshStandardMaterial({
      map: t, flatShading: true,
      metalness: isMetal ? 0.75 : 0.05,
      roughness: isMetal ? 0.35 : 0.9,
    });
  } else {
    material = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Color shading: amt<0 darkens, amt>0 lightens. Returns a hex int.
function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

// Emit a box and its 180°-rotational partner at (-x, y, -z) via the given place
// callback. When the piece sits on the exact rotational center (x===0 && z===0)
// it is its own mirror, so only one is placed. Enforces FFA-fair symmetry.
function placePair(place, w, h, d, color, x, y, z, texName, texOpts) {
  place(box(w, h, d, color, x, y, z, texName, texOpts));
  if (x !== 0 || z !== 0) {
    place(box(w, h, d, color, -x, y, -z, texName, texOpts));
  }
}

// A cached radial-gradient "blob" texture for soft contact shadows. Drawn once
// and reused by every contactShadow() call (it's resolution-independent).
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _blobTex = tex;
  return tex;
}

// A flat dark radial-gradient quad laid just above the ground (y≈0.02) under a
// box/cover piece so it does not appear to float on the flat ground slab.
// PURELY VISUAL: returns a mesh the caller adds to its group; it is NON-collidal
// (do NOT route it through the `place()` callback, which would register an AABB).
// `group` = the map's THREE.Group; (x,z) = world center; w,d = footprint size.
function contactShadow(group, x, z, w, d) {
  const tex = blobTexture().clone();
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2; // lay flat
  mesh.position.set(x, 0.02, z);
  mesh.renderOrder = 1;            // draw above the ground slab
  // No shadows: it IS the fake shadow; casting/receiving would double-darken.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}
