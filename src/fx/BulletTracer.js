import * as THREE from 'three';

const POOL_SIZE = 32;
const FADE = 0.06; // seconds

export class BulletTracerPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, life: 0 });
    }
    this.next = 0;
  }
  spawn(from, to) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    item.mesh.position.copy(mid);
    item.mesh.scale.set(1, 1, len);
    item.mesh.lookAt(to);
    item.mesh.material.opacity = 0.9;
    item.mesh.visible = true;
    item.life = FADE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.mesh.material.opacity = Math.max(0, item.life / FADE) * 0.9;
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
