import * as THREE from 'three';
import { ANIMALS } from '../config/Animals.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { get as getTexture } from '../textures/TextureFactory.js';

function mat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true }); }

// Fur-textured material tinted by a palette color (cached per color via TextureFactory).
function furMat(color) {
  const tex = getTexture('fur', { base: color, accent: shadeHex(color, -0.25), seed: color }).clone();
  tex.needsUpdate = true;
  tex.repeat.set(2, 2);
  return new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, flatShading: true });
}

function shadeHex(h, amt) {
  const r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  const f = amt < 0 ? (1 + amt) : 1, a = amt < 0 ? 0 : amt;
  return Math.max(0, Math.min(255, Math.round(r * f + 255 * a))) << 16
       | Math.max(0, Math.min(255, Math.round(g * f + 255 * a))) << 8
       | Math.max(0, Math.min(255, Math.round(b * f + 255 * a)));
}

// Builds a humanoid body + attaches an animal head + a gun. Animates limb swing by speed.
export class CharacterView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.limbs = []; // {mesh, axis, phase} for swing
    this.head = null;
    this.gun = null;
    this.animTime = 0;
    scene.add(this.group);
  }
  setAnimal(animalId) {
    const animal = ANIMALS[animalId];
    // clear previous body
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.limbs = [];
    const p = animal.palette;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), furMat(p.primary));
    torso.position.y = 1.1;
    this.group.add(torso);

    // legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
    const legL = new THREE.Mesh(legGeo, mat(p.accent)); legL.position.set(-0.13, 0.45, 0); this.group.add(legL);
    const legR = new THREE.Mesh(legGeo, mat(p.accent)); legR.position.set(0.13, 0.45, 0); this.group.add(legR);
    this.limbs.push({ mesh: legL, baseX: -0.13, baseZ: 0, phase: 0 });
    this.limbs.push({ mesh: legR, baseX: 0.13, baseZ: 0, phase: Math.PI });

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.45, 4, 8);
    const armL = new THREE.Mesh(armGeo, mat(p.primary)); armL.position.set(-0.38, 1.2, 0); this.group.add(armL);
    const armR = new THREE.Mesh(armGeo, mat(p.primary)); armR.position.set(0.38, 1.2, 0); this.group.add(armR);
    this.limbs.push({ mesh: armL, baseX: -0.38, baseZ: 0, phase: Math.PI });
    this.limbs.push({ mesh: armR, baseX: 0.38, baseZ: 0, phase: 0 });

    // head
    this.head = animal.headBuilder(p);
    this.head.position.y = 1.7;
    this.group.add(this.head);

    // gun (basic) attached to right arm
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), mat(0x222428));
    this.gun.position.set(0.4, 1.15, 0.3);
    this.group.add(this.gun);
  }
  setWeapon(weaponId) {
    // Swap gun proportions by id (visual only, third-person on bots).
    if (this.gun) this.group.remove(this.gun);
    const SIZES = {
      AR:      { w: 0.12, h: 0.14, d: 0.60 },
      SNIPER:  { w: 0.10, h: 0.10, d: 0.95 },
      SMG:     { w: 0.10, h: 0.12, d: 0.42 },
      SHOTGUN: { w: 0.13, h: 0.15, d: 0.62 },
      PISTOL:  { w: 0.08, h: 0.10, d: 0.26 },
    };
    const size = SIZES[weaponId] || SIZES.AR;
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, size.d), mat(0x222428));
    this.gun.position.set(0.4, 1.15, 0.3);
    this.group.add(this.gun);
  }
  update(dt, speed, yaw, pitch) {
    this.group.rotation.y = yaw;
    // Position group at the player's FEET — caller sets group.position separately.
    this.animTime += dt * Math.max(0.5, speed);
    const swing = Math.min(1, speed / 6) * 0.5;
    for (const limb of this.limbs) {
      const o = Math.sin(this.animTime * 8 + limb.phase) * swing;
      limb.mesh.position.x = limb.baseX;
      limb.mesh.position.z = limb.baseZ + o * 0.25;
    }
  }
  setPosition(x, y, z) { this.group.position.set(x, y, z); }
  setVisible(v) { this.group.visible = v; }
  dispose() { this.scene.remove(this.group); }
}
