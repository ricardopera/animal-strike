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
  return { box, placePair, shadeHex };
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
