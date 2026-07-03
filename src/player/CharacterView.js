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

// A small multi-part gun group for third-person bots: body + barrel + magazine.
// Proportions vary by weaponId so a bot's loadout is recognizable at a glance.
function buildSimpleGun(weaponId = 'AR') {
  const GUN = 0x222428, STEEL = 0x3a3e44, ACCENT = 0xffb84d;
  const g = new THREE.Group();
  const SIZES = {
    AR:      { w: 0.12, h: 0.14, d: 0.60, barrel: 0.30, mag: 0.16 },
    SNIPER:  { w: 0.10, h: 0.10, d: 0.95, barrel: 0.55, mag: 0.10 },
    SMG:     { w: 0.10, h: 0.12, d: 0.42, barrel: 0.16, mag: 0.20 },
    SHOTGUN: { w: 0.13, h: 0.15, d: 0.62, barrel: 0.30, mag: 0.0 },
    PISTOL:  { w: 0.08, h: 0.10, d: 0.26, barrel: 0.08, mag: 0.12 },
  };
  const sz = SIZES[weaponId] || SIZES.AR;
  // body
  const body = new THREE.Mesh(new THREE.BoxGeometry(sz.w, sz.h, sz.d), mat(GUN));
  g.add(body);
  // barrel
  if (sz.barrel > 0) {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(sz.w * 0.5, sz.h * 0.5, sz.barrel), mat(STEEL));
    barrel.position.set(0, sz.h * 0.1, sz.d * 0.5 + sz.barrel * 0.5);
    g.add(barrel);
  }
  // magazine
  if (sz.mag > 0) {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(sz.w * 0.7, sz.mag, sz.h * 0.6), mat(STEEL));
    mag.position.set(0, -sz.h * 0.5 - sz.mag * 0.5, -sz.d * 0.1);
    g.add(mag);
  }
  // accent sight dot
  const sight = new THREE.Mesh(new THREE.SphereGeometry(sz.w * 0.18, 8, 6), mat(ACCENT));
  sight.position.set(0, sz.h * 0.6, sz.d * 0.1);
  g.add(sight);
  return g;
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

    // sizeMul scales the whole rig so bigger animals read as bigger targets.
    const s = animal.sizeMul || 1;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s, 0.7 * s, 6, 12), furMat(p.primary));
    torso.position.y = 1.1 * s;
    this.group.add(torso);

    // legs (fur-textured for consistency with the torso)
    const legGeo = new THREE.CapsuleGeometry(0.12 * s, 0.5 * s, 4, 8);
    const legL = new THREE.Mesh(legGeo, furMat(p.primary)); legL.position.set(-0.13 * s, 0.45 * s, 0); this.group.add(legL);
    const legR = new THREE.Mesh(legGeo, furMat(p.primary)); legR.position.set(0.13 * s, 0.45 * s, 0); this.group.add(legR);
    this.limbs.push({ mesh: legL, baseX: -0.13 * s, baseZ: 0, phase: 0 });
    this.limbs.push({ mesh: legR, baseX: 0.13 * s, baseZ: 0, phase: Math.PI });

    // arms
    const armGeo = new THREE.CapsuleGeometry(0.1 * s, 0.45 * s, 4, 8);
    const armL = new THREE.Mesh(armGeo, furMat(p.primary)); armL.position.set(-0.38 * s, 1.2 * s, 0); this.group.add(armL);
    const armR = new THREE.Mesh(armGeo, furMat(p.primary)); armR.position.set(0.38 * s, 1.2 * s, 0); this.group.add(armR);
    this.limbs.push({ mesh: armL, baseX: -0.38 * s, baseZ: 0, phase: Math.PI });
    this.limbs.push({ mesh: armR, baseX: 0.38 * s, baseZ: 0, phase: 0 });

    // head — apply fur to the headshot-tagged head sphere for a cohesive look.
    this.head = animal.headBuilder(p);
    this.head.position.y = 1.7 * s;
    this.head.traverse(o => {
      if (o.isMesh && o.userData.headshot && o.material) {
        // swap the flat head material for a fur-textured one tinted to primary
        o.material = furMat(p.primary);
      }
    });
    this.group.add(this.head);

    // gun (basic) attached to right arm
    this.gun = buildSimpleGun();
    this.gun.position.set(0.4 * s, 1.15 * s, 0.3 * s);
    this.group.add(this.gun);
    this._sizeMul = s;
  }
  setWeapon(weaponId) {
    // Swap gun proportions by id (visual only, third-person on bots).
    if (this.gun) this.group.remove(this.gun);
    const s = this._sizeMul || 1;
    this.gun = buildSimpleGun(weaponId);
    this.gun.position.set(0.4 * s, 1.15 * s, 0.3 * s);
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
