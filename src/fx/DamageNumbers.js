import * as THREE from 'three';

// DOM-based floating damage numbers, projected from world to screen.
export class DamageNumbers {
  constructor(root, camera) {
    this.root = root;
    this.camera = camera;
    this.items = [];
  }
  spawn(worldPoint, amount, color = '#ffe08a') {
    const el = document.createElement('div');
    el.textContent = Math.round(amount);
    el.style.cssText = `position:absolute;color:${color};font-weight:700;font-size:18px;
      text-shadow:0 2px 3px rgba(0,0,0,.7);pointer-events:none;transition:transform .6s,opacity .6s;`;
    this.root.appendChild(el);
    this.items.push({ el, world: worldPoint.clone(), life: 0.6 });
  }
  update(dt) {
    const v = new THREE.Vector3();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.world.y += dt * 1.2;
      v.copy(it.world).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      it.el.style.left = x + 'px';
      it.el.style.top = y + 'px';
      it.el.style.opacity = Math.max(0, it.life / 0.6);
      if (it.life <= 0) { it.el.remove(); this.items.splice(i, 1); }
    }
  }
}
