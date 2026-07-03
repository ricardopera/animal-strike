import * as THREE from 'three';

const COLORS = {
  ground: 0x6ab150,
  cover: 0x8a8f98,
  platform: 0xb5895a,
  wall: 0x4a5560,
  ramp: 0x9aa0a8,
};

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, flatShading: true })
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// A ramp is a box rotated about X; for collision we treat its AABB (axis-aligned bounding box).
// True sloped collision is deferred; MVP ramps are steep steps approximated by stacked boxes.
export class ArenaBuilder {
  build(scene, colliderStore) {
    const group = new THREE.Group();

    // Ground
    const ground = box(80, 1, 80, COLORS.ground, 0, -0.5, 0);
    group.add(ground);
    colliderStore.addFromMesh(ground);

    // Perimeter walls
    const wallH = 6;
    const walls = [
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, -40),
      box(80, wallH, 1, COLORS.wall, 0, wallH / 2, 40),
      box(1, wallH, 80, COLORS.wall, -40, wallH / 2, 0),
      box(1, wallH, 80, COLORS.wall, 40, wallH / 2, 0),
    ];
    walls.forEach((w) => { group.add(w); colliderStore.addFromMesh(w); });

    // Central cover cluster (symmetrical)
    const covers = [
      box(4, 2, 4, COLORS.cover, 0, 1, 0),
      box(4, 2, 4, COLORS.cover, -12, 1, -12),
      box(4, 2, 4, COLORS.cover, 12, 1, 12),
      box(4, 2, 4, COLORS.cover, -12, 1, 12),
      box(4, 2, 4, COLORS.cover, 12, 1, -12),
      box(8, 1, 8, COLORS.cover, 0, 0.5, -20),
      box(8, 1, 8, COLORS.cover, 0, 0.5, 20),
      box(8, 1, 8, COLORS.cover, -20, 0.5, 0),
      box(8, 1, 8, COLORS.cover, 20, 0.5, 0),
    ];
    covers.forEach((c) => { group.add(c); colliderStore.addFromMesh(c); });

    // Two raised platforms with step-access (stacked boxes approximate a ramp)
    const platforms = [
      [box(10, 3, 10, COLORS.platform, -28, 1.5, -28), box(4, 1.5, 4, COLORS.ramp, -22, 0.75, -22)],
      [box(10, 3, 10, COLORS.platform, 28, 1.5, 28), box(4, 1.5, 4, COLORS.ramp, 22, 0.75, 22)],
    ];
    platforms.forEach((pair) => pair.forEach((p) => { group.add(p); colliderStore.addFromMesh(p); }));

    scene.add(group);
    return group;
  }
}
