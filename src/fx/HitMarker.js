import * as THREE from 'three';

const POOL_SIZE = 48;
const LIFE = 0.25;

// 3D sparks at impact point + optional DOM hitmarker for the local player.
export class HitSparkPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0 });
    }
    this.next = 0;
  }
  spawn(pos, normal, color = 0xffd24a) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    item.mesh.position.copy(pos);
    item.mesh.material.color.setHex(color);
    item.mesh.visible = true;
    item.life = LIFE;
    // random burst biased along normal
    item.vel.copy(normal).multiplyScalar(2).add(
      new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)
    );
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.vel.y -= 9 * dt;
        item.mesh.position.addScaledVector(item.vel, dt);
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
