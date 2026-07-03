import * as THREE from 'three';

const POOL_SIZE = 48;
const LIFE = 0.35;

// 3D sparks at impact point. Additive-blended + emissive so bloom turns them
// into glowing debris; they shrink + fade as they fall.
export class HitSparkPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd24a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
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
    item.mesh.material.opacity = 1;
    item.mesh.scale.setScalar(1);
    item.mesh.visible = true;
    item.life = LIFE;
    // random burst biased along normal
    item.vel.copy(normal).multiplyScalar(2.4).add(
      new THREE.Vector3((Math.random() - 0.5) * 3.5, Math.random() * 2.4, (Math.random() - 0.5) * 3.5)
    );
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.vel.y -= 9 * dt;
        item.mesh.position.addScaledVector(item.vel, dt);
        const k = Math.max(0, item.life / LIFE);
        item.mesh.material.opacity = k;
        item.mesh.scale.setScalar(0.4 + k * 0.6); // shrink as they fade
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
  }
}
