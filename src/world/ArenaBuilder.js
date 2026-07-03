import * as THREE from 'three';
import { get as getTexture } from '../textures/TextureFactory.js';

const COLORS = {
  ground: 0x6ab150,
  cover: 0x8a8f98,
  platform: 0xb5895a,
  wall: 0x4a5560,
  ramp: 0x9aa0a8,
};

// Build a box mesh with an optional procedural texture. The texture is shared
// (cached by TextureFactory) and its repeat is set per-mesh to tile by surface size.
function box(w, h, d, color, x, y, z, texName, texOpts) {
  let material;
  if (texName) {
    const tex = getTexture(texName, { base: color, accent: shadeHex(color, -0.3), ...(texOpts || {}) });
    // clone the texture so this mesh can have its own repeat without affecting the cache
    const t = tex.clone();
    t.needsUpdate = true;
    // tile roughly once per 2 units of surface
    const rep = Math.max(1, Math.round(Math.max(w, h, d) / 2));
    t.repeat.set(rep, rep);
    material = new THREE.MeshStandardMaterial({ map: t, flatShading: true });
  } else {
    material = new THREE.MeshStandardMaterial({ color, flatShading: true });
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  const rr = Math.max(0, Math.min(255, Math.round(r * f + 255 * a)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f + 255 * a)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
  return (rr << 16) | (gg << 8) | bb;
}

// A ramp is a box rotated about X; for collision we treat its AABB (axis-aligned bounding box).
// True sloped collision is deferred; MVP ramps are steep steps approximated by stacked boxes.
export class ArenaBuilder {
  build(scene, colliderStore) {
    const group = new THREE.Group();

    // Ground — grass-green concrete (noise)
    const ground = box(80, 1, 80, COLORS.ground, 0, -0.5, 0, 'concrete');
    group.add(ground);
    colliderStore.addFromMesh(ground);

    // Perimeter walls — concrete
    const wallH = 6;
    const walls = [
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, -40, 'concrete'),
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, 40, 'concrete'),
      box(1, wallH, 80, COLORS.wall, -40, wallH / 2, 0, 'concrete'),
      box(1, wallH, 80, COLORS.wall, 40, wallH / 2, 0, 'concrete'),
    ];
    walls.forEach((w) => { group.add(w); colliderStore.addFromMesh(w); });

    // Central cover cluster — wooden crates (symmetrical)
    const covers = [
      box(4, 2, 4, 0x9c6b3f, 0, 1, 0, 'wood'),
      box(4, 2, 4, 0x9c6b3f, -12, 1, -12, 'wood'),
      box(4, 2, 4, 0x9c6b3f, 12, 1, 12, 'wood'),
      box(4, 2, 4, 0x9c6b3f, -12, 1, 12, 'wood'),
      box(4, 2, 4, 0x9c6b3f, 12, 1, -12, 'wood'),
      box(8, 1, 8, 0x9c6b3f, 0, 0.5, -20, 'wood'),
      box(8, 1, 8, 0x9c6b3f, 0, 0.5, 20, 'wood'),
      box(8, 1, 8, 0x9c6b3f, -20, 0.5, 0, 'wood'),
      box(8, 1, 8, 0x9c6b3f, 20, 0.5, 0, 'wood'),
    ];
    covers.forEach((c) => { group.add(c); colliderStore.addFromMesh(c); });

    // Two raised platforms (metal) with step-access (metal ramps)
    const platforms = [
      [box(10, 3, 10, 0x8a8f98, -28, 1.5, -28, 'metal'), box(4, 1.5, 4, 0x9aa0a8, -22, 0.75, -22, 'metal')],
      [box(10, 3, 10, 0x8a8f98, 28, 1.5, 28, 'metal'), box(4, 1.5, 4, 0x9aa0a8, 22, 0.75, 22, 'metal')],
    ];
    platforms.forEach((pair) => pair.forEach((p) => { group.add(p); colliderStore.addFromMesh(p); }));

    scene.add(group);
    return group;
  }
}
