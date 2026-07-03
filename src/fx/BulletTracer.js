import * as THREE from 'three';

const POOL_SIZE = 32;
const FADE = 0.08; // seconds — slightly longer so the bloom trail reads

export class BulletTracerPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      // Additive-blended emissive material: the tracer itself is bright white-yellow,
      // and additive blending + bloom turns it into a glowing laser streak.
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff2a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      // Slightly thicker beam so the glow has body.
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), mat);
      mesh.rotation.x = Math.PI / 2; // align cylinder's Y axis to Z (forward)
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
    item.mesh.material.opacity = 1;
    item.mesh.visible = true;
    item.life = FADE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.mesh.material.opacity = Math.max(0, item.life / FADE);
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
