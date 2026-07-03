import * as THREE from 'three';

// First-person weapon viewmodel: a THREE.Group parented to the camera. Each
// weapon has a distinct silhouette built from low-poly primitives. Animates:
// idle sway (breathing + walk bob), per-shot recoil kick (spring back), reload
// (dip + rotate). Exposes `muzzleRef` (an Object3D at the gun's barrel tip)
// so muzzle flash + tracers originate from the real gun muzzle in world space.
//
// Materials use flat-shaded standard mats with darker gunmetal; textures can be
// layered later via TextureFactory without changing this structure.

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, ...opts });
}

const GUNMETAL = 0x2b2f36;
const POLYMER = 0x14161a;
const ACCENT = 0xffb84d;

// Per-weapon builder: returns { group, muzzleRef } where muzzleRef is an Object3D
// at the barrel tip (local space, +Z forward). All weapons face -Z (camera forward).
const BUILDERS = {
  AR: buildAR,
  SNIPER: buildSniper,
  SMG: buildSMG,
  SHOTGUN: buildShotgun,
  PISTOL: buildPistol,
};

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
    const builder = BUILDERS[weaponId] || BUILDERS.AR;
    const built = builder();
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
    // forward = -Z of the muzzle in world space
    this.muzzleRef.getWorldDirection(outDir);
    // getWorldDirection returns +Z direction; our forward is -Z, so negate.
    outDir.negate();
    return { pos: outPos, dir: outDir };
  }
}

/* ---------------- per-weapon builders ---------------- */
// Convention: build the gun facing +Z in its own local space (so when rotated
// by baseRot.y=PI it faces -Z = camera forward). Muzzle at +Z tip.
// Each returns { group, muzzleLocal: Vector3 }.

function makeBody(w, h, d, color = GUNMETAL) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  return m;
}

function buildAR() {
  const g = new THREE.Group();
  const body = makeBody(0.07, 0.09, 0.32); body.position.set(0, 0, 0); g.add(body);
  const barrel = makeBody(0.03, 0.03, 0.18, POLYMER); barrel.position.set(0, 0.015, 0.24); g.add(barrel);
  const mag = makeBody(0.05, 0.12, 0.06, POLYMER); mag.position.set(0, -0.1, -0.02); mag.rotation.x = 0.15; g.add(mag);
  const grip = makeBody(0.05, 0.1, 0.05, POLYMER); grip.position.set(0, -0.085, -0.12); grip.rotation.x = -0.25; g.add(grip);
  const sight = makeBody(0.015, 0.03, 0.05, ACCENT); sight.position.set(0, 0.06, 0.05); g.add(sight);
  const stock = makeBody(0.05, 0.07, 0.1, POLYMER); stock.position.set(0, -0.01, -0.2); g.add(stock);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.015, 0.33) };
}

function buildSniper() {
  const g = new THREE.Group();
  const body = makeBody(0.06, 0.08, 0.4); body.position.set(0, 0, 0); g.add(body);
  const barrel = makeBody(0.025, 0.025, 0.3, POLYMER); barrel.position.set(0, 0.01, 0.32); g.add(barrel);
  const scope = makeBody(0.04, 0.04, 0.14, POLYMER); scope.position.set(0, 0.08, 0.02); g.add(scope);
  const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 12), mat(0x113355, { metalness: 0.6, roughness: 0.2 }));
  scopeLens.rotation.x = Math.PI / 2; scopeLens.position.set(0, 0.08, 0.09); g.add(scopeLens);
  const mag = makeBody(0.04, 0.08, 0.06, POLYMER); mag.position.set(0, -0.08, -0.04); g.add(mag);
  const grip = makeBody(0.04, 0.09, 0.04, POLYMER); grip.position.set(0, -0.075, -0.14); grip.rotation.x = -0.25; g.add(grip);
  const stock = makeBody(0.05, 0.09, 0.14, POLYMER); stock.position.set(0, -0.02, -0.24); g.add(stock);
  const bipodL = makeBody(0.01, 0.06, 0.01, POLYMER); bipodL.position.set(-0.03, -0.06, 0.3); bipodL.rotation.x = 0.4; g.add(bipodL);
  const bipodR = makeBody(0.01, 0.06, 0.01, POLYMER); bipodR.position.set(0.03, -0.06, 0.3); bipodR.rotation.x = 0.4; g.add(bipodR);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.47) };
}

function buildSMG() {
  const g = new THREE.Group();
  const body = makeBody(0.06, 0.08, 0.2); body.position.set(0, 0, 0); g.add(body);
  const barrel = makeBody(0.025, 0.025, 0.08, POLYMER); barrel.position.set(0, 0.01, 0.13); g.add(barrel);
  const mag = makeBody(0.04, 0.14, 0.05, POLYMER); mag.position.set(0, -0.11, 0.0); mag.rotation.x = 0.05; g.add(mag);
  const grip = makeBody(0.04, 0.08, 0.04, POLYMER); grip.position.set(0, -0.07, -0.08); grip.rotation.x = -0.25; g.add(grip);
  const sight = makeBody(0.01, 0.025, 0.04, ACCENT); sight.position.set(0, 0.055, 0.02); g.add(sight);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.18) };
}

function buildShotgun() {
  const g = new THREE.Group();
  const body = makeBody(0.08, 0.09, 0.28); body.position.set(0, 0, 0); g.add(body);
  const barrel = makeBody(0.05, 0.05, 0.22, POLYMER); barrel.position.set(0, 0.02, 0.24); g.add(barrel);
  // double barrel hint
  const tube = makeBody(0.045, 0.045, 0.2, GUNMETAL); tube.position.set(0, 0.02, 0.22); g.add(tube);
  const pump = makeBody(0.06, 0.05, 0.08, POLYMER); pump.position.set(0, -0.05, 0.12); g.add(pump);
  const grip = makeBody(0.05, 0.1, 0.05, POLYMER); grip.position.set(0, -0.09, -0.1); grip.rotation.x = -0.3; g.add(grip);
  const stock = makeBody(0.06, 0.1, 0.14, POLYMER); stock.position.set(0, -0.03, -0.2); g.add(stock);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.36) };
}

function buildPistol() {
  const g = new THREE.Group();
  const body = makeBody(0.05, 0.07, 0.16); body.position.set(0, 0.02, 0); g.add(body);
  const barrel = makeBody(0.03, 0.03, 0.06, POLYMER); barrel.position.set(0, 0.03, 0.1); g.add(barrel);
  const grip = makeBody(0.045, 0.12, 0.05, POLYMER); grip.position.set(0, -0.07, -0.05); grip.rotation.x = -0.2; g.add(grip);
  const sight = makeBody(0.008, 0.02, 0.03, ACCENT); sight.position.set(0, 0.06, 0.04); g.add(sight);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.03, 0.14) };
}
