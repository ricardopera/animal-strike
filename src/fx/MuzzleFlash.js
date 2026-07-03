import * as THREE from 'three';

const POOL_SIZE = 8;
const LIFE = 0.06;

// Muzzle flash: an additive-blended sprite (so bloom makes it pop) plus a
// short-lived PointLight for a real dynamic light kick on each shot.
export class MuzzleFlashPool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const tex = makeFlashTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.1, 1.1, 1.1);
      sprite.visible = false;
      scene.add(sprite);
      // One reusable point light per pool slot — tinted warm, fades with the flash.
      const light = new THREE.PointLight(0xffd080, 0, 12, 2);
      light.visible = false;
      scene.add(light);
      this.pool.push({ sprite, light, life: 0 });
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
    item.light.position.copy(pos);
    item.light.intensity = 6;
    item.light.visible = true;
    item.life = LIFE;
  }
  update(dt) {
    for (const item of this.pool) {
      if (item.life > 0) {
        item.life -= dt;
        const k = Math.max(0, item.life / LIFE);
        item.sprite.material.opacity = k;
        item.light.intensity = 6 * k;
        if (item.life <= 0) {
          item.sprite.visible = false;
          item.light.visible = false;
        }
      }
    }
  }
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,220,1)');
  g.addColorStop(0.25, 'rgba(255,220,120,0.9)');
  g.addColorStop(0.6, 'rgba(255,170,50,0.4)');
  g.addColorStop(1, 'rgba(255,140,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // a few radial streaks for a "star" flash shape
  ctx.strokeStyle = 'rgba(255,230,160,0.5)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(64, 64);
    ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
