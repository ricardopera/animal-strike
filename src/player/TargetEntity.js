import * as THREE from 'three';

// A simple capsule-like target with a hitbox AABB used by hitscan.
export class TargetEntity {
  constructor(scene, colliderStoreForRaycast, position) {
    this.position = position.clone();
    this.health = 100;
    this.radius = 0.5;
    this.height = 1.8;
    this.alive = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0x66ccff, flatShading: true });
    this.mesh = new THREE.Mesh(new THREE.CapsuleGeometry(this.radius, this.height - this.radius * 2, 4, 8), mat);
    this.mesh.position.copy(position).add(new THREE.Vector3(0, this.height / 2, 0));
    scene.add(this.mesh);
  }
  // Ray vs capsule approximated as ray vs vertical AABB.
  rayHit(origin, dir, maxDist) {
    if (!this.alive) return null;
    const minX = this.position.x - this.radius, maxX = this.position.x + this.radius;
    const minY = this.position.y, maxY = this.position.y + this.height;
    const minZ = this.position.z - this.radius, maxZ = this.position.z + this.radius;
    const box = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ)
    );
    const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
    if (!hit) return null;
    const dist = origin.distanceTo(hit);
    if (dist > maxDist) return null;
    return { dist, point: hit, target: this };
  }
  takeDamage(d) {
    this.health -= d;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.mesh.visible = false;
    }
  }
  reset() {
    this.health = 100;
    this.alive = true;
    this.mesh.visible = true;
  }
}
