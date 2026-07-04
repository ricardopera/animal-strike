import * as THREE from 'three';
import { loadOrFallback } from '../textures/AssetLoader.js';

// Shared factory of rounded weapon primitives + a material library. Used by both
// the first-person viewmodel and the third-person bot gun so weapons have one
// recognizable silhouette. Convention: parts build in local space with the weapon
// facing +Z (muzzle at +Z tip); the FP group rotates by PI to face camera-forward (-Z).

// ---- Material library (shared across all weapons) ----
const TEX = {
  gunmetal: '/textures/weapons/gunmetal.png',
  steel:    '/textures/weapons/worn_steel.png',
  wood:     '/textures/weapons/wood_stock.png',
};

export const mats = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x4a4f58, metalness: 0.6, roughness: 0.45 }),
  polymer:  new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.0,  roughness: 0.78 }),
  steel:    new THREE.MeshStandardMaterial({ color: 0x6a6e76, metalness: 0.7, roughness: 0.3 }),
  accent:   new THREE.MeshStandardMaterial({ color: 0xffb84d, metalness: 0.2, roughness: 0.4, emissive: 0xff8800, emissiveIntensity: 0.4 }),
  wood:     new THREE.MeshStandardMaterial({ color: 0x6b4226, metalness: 0.0, roughness: 0.8 }),
  glass:    new THREE.MeshStandardMaterial({ color: 0x113355, metalness: 0.6, roughness: 0.15 }),
};
// Apply generated skin textures when they load (non-blocking; flat color until then).
loadOrFallback(TEX.gunmetal, mats.gunmetal);
loadOrFallback(TEX.steel,    mats.steel);
loadOrFallback(TEX.wood,     mats.wood);

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Round barrel along Z (CylinderGeometry is along Y → rotate to Z).
export function barrel(radius, length, segments = 12, material = mats.steel) {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  m.rotation.x = Math.PI / 2;
  return m;
}

// Beveled receiver: a box with thin inset side rails to fake a beveled look.
export function beveledBody(w, h, d, material = mats.gunmetal) {
  const g = new THREE.Group();
  const main = mesh(new THREE.BoxGeometry(w * 0.86, h, d), material);
  g.add(main);
  const railL = mesh(new THREE.BoxGeometry(w * 0.07, h * 0.7, d * 0.98), material, -w * 0.46, 0, 0);
  const railR = mesh(new THREE.BoxGeometry(w * 0.07, h * 0.7, d * 0.98), material, w * 0.46, 0, 0);
  g.add(railL, railR);
  return g;
}

// Curved pistol grip: a capsule tilted downward/backward.
export function curvedGrip(w, h, d, curve = 0.25, material = mats.polymer) {
  const g = new THREE.Group();
  const cap = mesh(new THREE.CapsuleGeometry(w * 0.5, h, 4, 8), material);
  cap.rotation.x = -curve;
  cap.position.set(0, -h * 0.5, -d * 0.5);
  g.add(cap);
  return g;
}

export function scopeTube(r, length, material = mats.polymer) {
  const m = mesh(new THREE.CylinderGeometry(r, r, length, 14), material);
  m.rotation.x = Math.PI / 2;
  return m;
}
export function scopeRing(r, tube = r * 0.18, material = mats.polymer) {
  return mesh(new THREE.TorusGeometry(r, tube, 8, 16), material);
}
export function scopeLens(r, material = mats.glass) {
  const m = mesh(new THREE.CylinderGeometry(r, r, 0.005, 14), material);
  m.rotation.x = Math.PI / 2;
  return m;
}

// Slightly curved magazine.
export function magCurve(w, h, d, curve = 0.12, material = mats.polymer) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(w, h, d), material);
  body.rotation.x = curve;
  body.position.set(0, -h * 0.5, 0);
  g.add(body);
  return g;
}

// Muzzle device: cylinder + top port slot.
export function muzzleDevice(r, length, material = mats.steel) {
  const g = new THREE.Group();
  const outer = mesh(new THREE.CylinderGeometry(r, r * 0.95, length, 12), material);
  outer.rotation.x = Math.PI / 2;
  g.add(outer);
  const slot = mesh(new THREE.BoxGeometry(r * 0.4, r * 0.15, length * 0.5), mats.polymer, 0, r * 0.85, 0);
  g.add(slot);
  return g;
}

// Tapered stock (scaled capsule = rounded, not blocky).
export function stock(w, h, d, material = mats.polymer) {
  const m = mesh(new THREE.CapsuleGeometry(w * 0.5, d, 4, 8), material);
  m.scale.set(1, h / w, 1);
  m.rotation.x = Math.PI / 2;
  return m;
}

// Trigger guard: a thin torus arc under the grip.
export function triggerGuard(r = 0.04, material = mats.polymer) {
  const m = mesh(new THREE.TorusGeometry(r, r * 0.18, 6, 12, Math.PI), material);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// Picatinny-style rail with stud bumps.
export function rail(length, material = mats.gunmetal) {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(0.025, 0.012, length), material);
  g.add(base);
  for (let i = 0; i < Math.max(2, Math.floor(length / 0.03)); i++) {
    const stud = mesh(new THREE.BoxGeometry(0.026, 0.006, 0.008), material, 0, 0.009, -length / 2 + 0.02 + i * 0.03);
    g.add(stud);
  }
  return g;
}

// Iron sight post + tritium dot.
export function ironSight(material = mats.polymer) {
  const g = new THREE.Group();
  const post = mesh(new THREE.BoxGeometry(0.008, 0.025, 0.012), material);
  g.add(post);
  const dot = mesh(new THREE.SphereGeometry(0.005, 8, 6), mats.accent, 0, 0.02, 0);
  g.add(dot);
  return g;
}

// ---- Per-weapon composers (return { group, muzzleLocal }) ----
function buildAR() {
  const g = new THREE.Group();
  g.add(beveledBody(0.07, 0.09, 0.30));
  const bar = barrel(0.018, 0.20); bar.position.set(0, 0.02, 0.24); g.add(bar);
  const md = muzzleDevice(0.022, 0.05); md.position.set(0, 0.02, 0.35); g.add(md);
  const mg = magCurve(0.05, 0.13, 0.06, 0.18); mg.position.set(0, -0.10, -0.02); g.add(mg);
  const grip = curvedGrip(0.05, 0.10, 0.05, 0.25); grip.position.set(0, -0.085, -0.12); g.add(grip);
  const r = rail(0.16); r.position.set(0, 0.055, 0.04); g.add(r);
  const sight = ironSight(); sight.position.set(0, 0.075, 0.10); g.add(sight);
  const st = stock(0.05, 0.10, 0.10); st.position.set(0, -0.01, -0.20); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.08); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.38) };
}

function buildSniper() {
  const g = new THREE.Group();
  g.add(beveledBody(0.06, 0.08, 0.38));
  const bar = barrel(0.014, 0.32); bar.position.set(0, 0.01, 0.32); g.add(bar);
  const md = muzzleDevice(0.018, 0.04); md.position.set(0, 0.01, 0.50); g.add(md);
  const tube = scopeTube(0.022, 0.16); tube.position.set(0, 0.085, 0.02); g.add(tube);
  const ringA = scopeRing(0.024); ringA.position.set(0, 0.085, -0.04); g.add(ringA);
  const ringB = scopeRing(0.024); ringB.position.set(0, 0.085, 0.08); g.add(ringB);
  const lens = scopeLens(0.020); lens.position.set(0, 0.085, 0.105); g.add(lens);
  const mg = magCurve(0.04, 0.09, 0.06, 0.08); mg.position.set(0, -0.085, -0.04); g.add(mg);
  const grip = curvedGrip(0.045, 0.10, 0.045, 0.25); grip.position.set(0, -0.075, -0.14); g.add(grip);
  const st = stock(0.06, 0.12, 0.16); st.position.set(0, -0.02, -0.24); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.10); g.add(tg);
  const bipodL = barrel(0.006, 0.09, 6, mats.polymer); bipodL.position.set(-0.04, -0.05, 0.34); bipodL.rotation.z = 0.35; g.add(bipodL);
  const bipodR = barrel(0.006, 0.09, 6, mats.polymer); bipodR.position.set(0.04, -0.05, 0.34); bipodR.rotation.z = -0.35; g.add(bipodR);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.54) };
}

function buildSMG() {
  const g = new THREE.Group();
  g.add(beveledBody(0.06, 0.08, 0.18));
  const bar = barrel(0.014, 0.06); bar.position.set(0, 0.01, 0.12); g.add(bar);
  const md = muzzleDevice(0.018, 0.03); md.position.set(0, 0.01, 0.16); g.add(md);
  const mg = magCurve(0.04, 0.16, 0.05, 0.22); mg.position.set(0, -0.12, 0.0); g.add(mg);
  const grip = curvedGrip(0.045, 0.09, 0.045, 0.25); grip.position.set(0, -0.07, -0.07); g.add(grip);
  const r = rail(0.10); r.position.set(0, 0.055, 0.0); g.add(r);
  const sight = ironSight(); sight.position.set(0, 0.075, 0.04); g.add(sight);
  const st = stock(0.03, 0.05, 0.12); st.position.set(0, 0.0, -0.16); g.add(st);
  const tg = triggerGuard(0.032); tg.position.set(0, -0.06, -0.04); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.01, 0.18) };
}

function buildShotgun() {
  const g = new THREE.Group();
  g.add(beveledBody(0.08, 0.09, 0.26));
  const bar1 = barrel(0.022, 0.22, 12, mats.steel); bar1.position.set(-0.022, 0.02, 0.22); g.add(bar1);
  const bar2 = barrel(0.022, 0.22, 12, mats.steel); bar2.position.set(0.022, 0.02, 0.22); g.add(bar2);
  const pump = barrel(0.03, 0.10, 10, mats.polymer); pump.position.set(0, -0.04, 0.18); g.add(pump);
  const grip = curvedGrip(0.05, 0.11, 0.05, 0.30); grip.position.set(0, -0.09, -0.10); g.add(grip);
  const st = stock(0.06, 0.11, 0.14, mats.wood); st.position.set(0, -0.03, -0.20); g.add(st);
  const tg = triggerGuard(0.035); tg.position.set(0, -0.07, -0.06); g.add(tg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.34) };
}

function buildPistol() {
  const g = new THREE.Group();
  const slide = beveledBody(0.05, 0.06, 0.16); slide.position.set(0, 0.02, 0); g.add(slide);
  const bar = barrel(0.012, 0.05, 10, mats.steel); bar.position.set(0, 0.02, 0.10); g.add(bar);
  const grip = curvedGrip(0.045, 0.12, 0.05, 0.20); grip.position.set(0, -0.07, -0.05); g.add(grip);
  const sight = ironSight(); sight.position.set(0, 0.06, 0.04); g.add(sight);
  const tg = triggerGuard(0.03); tg.position.set(0, -0.04, 0.0); g.add(tg);
  const mg = magCurve(0.04, 0.05, 0.05, 0.05); mg.position.set(0, -0.11, -0.04); g.add(mg);
  return { group: g, muzzleLocal: new THREE.Vector3(0, 0.02, 0.14) };
}

const COMPOSERS = { AR: buildAR, SNIPER: buildSniper, SMG: buildSMG, SHOTGUN: buildShotgun, PISTOL: buildPistol };

// Build a weapon group by id. Returns { group, muzzleLocal }.
export function buildWeapon(id) {
  const composer = COMPOSERS[id] || COMPOSERS.AR;
  return composer();
}
