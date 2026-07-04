import * as THREE from 'three';
import { ANIMALS } from '../config/Animals.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { get as getTexture } from '../textures/TextureFactory.js';
import { loadOrFallback } from '../textures/AssetLoader.js';
import { buildWeapon } from './WeaponParts.js';

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

// Third-person bot gun: reuse the WeaponParts composer (same silhouette as the
// first-person viewmodel) scaled to third-person proportions, so a bot's loadout
// is recognizable at a glance. The shared factory means TP + FP guns never drift.
function buildSimpleGun(weaponId = 'AR') {
  const { group } = buildWeapon(weaponId);
  group.scale.setScalar(0.85);
  return group;
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
    // Heads/snouts/gun barrels are authored facing local +Z, but the game's
    // aim/movement forward is -Z (at yaw=0, forward = (-sin0,0,-cos0) = (0,0,-1)).
    // Rotating +Z by `yaw` alone would make the model face +Z world = opposite of
    // aim-forward, so characters visibly ran/shot backward. Add PI so the model's
    // local +Z front aligns with aim-forward. (See CharacterView.facing.test.js)
    this.group.rotation.y = yaw + Math.PI;
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
