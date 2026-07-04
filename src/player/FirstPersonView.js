import * as THREE from 'three';
import { buildWeapon } from './WeaponParts.js';

// First-person weapon viewmodel: a THREE.Group parented to the camera. Each
// weapon has a distinct silhouette built from low-poly primitives. Animates:
// idle sway (breathing + walk bob), per-shot recoil kick (spring back), reload
// (dip + rotate). Exposes `muzzleRef` (an Object3D at the gun's barrel tip)
// so muzzle flash + tracers originate from the real gun muzzle in world space.
//
// Materials use flat-shaded standard mats with darker gunmetal; textures can be
// layered later via TextureFactory without changing this structure.

export class FirstPersonView {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.model = null;        // current weapon group (child of this.group)
    this.muzzleRef = new THREE.Object3D(); // world-readable via getMuzzleWorldPosition
    this.currentWeaponId = null;

    // animation state
    this.swayPhase = 0;
    this.kick = 0;            // current recoil kick (position offset, springs back)
    this.kickVel = 0;
    this.reloadT = 0;         // 0..1 reload progress (1 = done/not reloading)
    this.reloading = false;
    this.bobAmount = 0;       // walk-bob intensity 0..1

    // base pose (the model's rest local transform within this.group)
    this.basePos = new THREE.Vector3(0.22, -0.22, -0.45);
    this.baseRot = new THREE.Euler(0, Math.PI, 0); // face -Z (camera forward)

    // Dedicated viewmodel lighting: a small rig of lights parented to this.group
    // (which syncs to the camera each frame) so the gun is ALWAYS lit from the
    // front regardless of where the scene's sun is pointing. Without this, the
    // gun goes dark whenever the player faces away from the sun — a common FPS
    // problem solved by giving the viewmodel its own lights.
    this.viewmodelLights = new THREE.Group();
    // Key light: warm, in front-right-above the gun (matches the gun's base pose).
    const key = new THREE.PointLight(0xfff0d0, 2.2, 3.0, 1.6);
    key.position.set(0.15, 0.35, -0.55);
    this.viewmodelLights.add(key);
    // Fill light: cool, opposite side, softer — kills harsh shadows on the gun.
    const fill = new THREE.PointLight(0xb0c8ff, 0.9, 3.0, 1.6);
    fill.position.set(-0.25, 0.10, -0.55);
    this.viewmodelLights.add(fill);
    // Rim light: from behind-above to edge-light the gun silhouette.
    const rim = new THREE.PointLight(0xffffff, 0.7, 3.0, 1.6);
    rim.position.set(0.0, 0.40, -0.20);
    this.viewmodelLights.add(rim);
    this.group.add(this.viewmodelLights);
  }

  // Attach to the scene (not the camera — keeping the camera out of the scene
  // graph avoids frustum-culling issues). update() syncs this.group's transform
  // to the camera each frame so the viewmodel follows the view.
  attach(scene) {
    scene.add(this.group);
  }

  detach(scene) {
    if (this.group.parent === scene) scene.remove(this.group);
  }

  // Sync the viewmodel group's world transform to the camera's world transform.
  // Call after the camera is positioned each frame.
  syncToCamera(camera) {
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    this.group.updateMatrixWorld(true);
  }

  setWeapon(weaponId) {
    if (this.currentWeaponId === weaponId && this.model) return;
    this.clear();
    const built = buildWeapon(weaponId);
    this.model = built.group;
    this.model.position.copy(this.basePos);
    this.model.rotation.copy(this.baseRot);
    // Viewmodel parts are always-on (never frustum-cull the gun — it's always in view)
    this.model.traverse(o => { o.frustumCulled = false; });
    this.group.add(this.model);
    // muzzleRef lives inside the model at the barrel tip
    this.model.add(this.muzzleRef);
    this.muzzleRef.position.copy(built.muzzleLocal);
    this.muzzleRef.rotation.set(0, 0, 0);
    this.currentWeaponId = weaponId;
  }

  clear() {
    if (this.model) {
      this.group.remove(this.model);
      this.model = null;
    }
    this.currentWeaponId = null;
  }

  setVisible(v) { this.group.visible = v; }

  // Recoil impulse on each shot.
  triggerKick(power = 1) {
    this.kickVel += 0.06 * power;
  }

  startReload(reloadTime) {
    this.reloading = true;
    this.reloadT = 0;
    this._reloadTime = reloadTime;
  }

  endReload() {
    this.reloading = false;
    this.reloadT = 1;
  }

  // dt: frame dt; speed: player horizontal speed; pitch/yaw unused (camera handles look)
  update(dt, speed) {
    if (!this.model) return;

    // idle sway + walk bob
    this.swayPhase += dt * (4 + speed * 0.6);
    const sway = Math.sin(this.swayPhase) * 0.004 * (1 + speed * 0.05);
    const swayY = Math.cos(this.swayPhase * 0.5) * 0.004 * (1 + speed * 0.05);
    this.bobAmount = Math.min(1, speed / 7);

    // recoil kick spring (damped)
    this.kick += this.kickVel;
    this.kickVel += -this.kick * 60 * dt; // spring
    this.kickVel *= Math.max(0, 1 - 12 * dt); // damp
    this.kick = Math.max(-0.15, Math.min(0.15, this.kick));

    // reload anim: dip down + rotate over the reload duration
    let reloadDip = 0;
    let reloadRot = 0;
    if (this.reloading) {
      this.reloadT += dt / Math.max(0.01, this._reloadTime || 1.0);
      if (this.reloadT >= 1) this.endReload();
      // bell curve: 0->1->0 over the reload
      const p = this.reloadT;
      const bell = Math.sin(Math.min(1, p) * Math.PI);
      reloadDip = -0.12 * bell;
      reloadRot = 0.5 * bell;
    }

    this.model.position.set(
      this.basePos.x + sway,
      this.basePos.y + swayY + reloadDip - this.kick * 0.3,
      this.basePos.z + this.kick
    );
    this.model.rotation.set(
      this.baseRot.x - reloadRot * 0.5 - this.kick * 0.8,
      this.baseRot.y + sway * 2,
      this.baseRot.z + reloadRot
    );
  }

  // Compute the muzzle position + forward direction in WORLD space (for FX).
  getMuzzleWorldPosition(outPos = new THREE.Vector3(), outDir = new THREE.Vector3()) {
    if (this.model) {
      this.muzzleRef.getWorldPosition(outPos);
    } else {
      outPos.set(0, 0, 0);
    }
    // The model is rotated 180° (baseRot.y = PI) so its local +Z axis points
    // down WORLD -Z = the camera's forward. getWorldDirection returns that
    // local +Z in world space, which is already the forward we want — so do
    // NOT negate it (negating was the bug: it flipped shots to fire backwards).
    this.muzzleRef.getWorldDirection(outDir);
    return { pos: outPos, dir: outDir };
  }
}

// Per-weapon geometry + muzzle positions now live in WeaponParts.js (shared with
// the third-person bot gun). Each WeaponParts.buildWeapon(id) returns
// { group, muzzleLocal } built from rounded primitives (cylinders, capsules,
// toruses) — replacing the old all-box construction.

