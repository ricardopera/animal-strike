import * as THREE from 'three';

const POOL_SIZE = 8;
const LIFE = 0.04;

export class MuzzleFlashPool {
  constructor(scene) {
    this.pool = [];
    const tex = makeFlashTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.6, 0.6, 0.6);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, life: 0 });
    }
    this.next = 0;
  }
  spawn(pos) {
    const item = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    item.sprite.position.copy(pos);
    item.sprite.material.opacity = 1;
    item.sprite.material.rotation = Math.random() * Math.PI;
    item.sprite.visible = true;
    item.life = LIFE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        item.sprite.material.opacity = Math.max(0, item.life / LIFE);
        if (item.life <= 0) item.sprite.visible = false;
      }
    }
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.4, 'rgba(255,200,80,0.7)');
  g.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
