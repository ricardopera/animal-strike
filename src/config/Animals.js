import * as THREE from 'three';

// Each animal defines a palette and stat multipliers + a headBuilder(group) that
// attaches an animal head at the top of the body. All animals share the body rig.
//
// stat fields:
//   speedMul  — multiplies walk/sprint max speed (movement skill)
//   hpMul     — multiplies base max health (100) -> durability
//   jumpMul   — multiplies jump velocity (vertical mobility)
//   sizeMul   — multiplies the body hitbox half-extents (bigger = easier to hit)
//   role      — short label shown in the menu for flavour
export const ANIMALS = {
  FOX: {
    id: 'FOX', name: 'Fox', role: 'Scout',
    palette: { primary: 0xe8742c, secondary: 0xf5efe6, accent: 0x2a1a0e, eye: 0x2a1a0e },
    speedMul: 1.15, hpMul: 0.85, jumpMul: 1.1, sizeMul: 0.92,
    skinTexture: 'fox',
    headBuilder: buildFoxHead,
  },
  WOLF: {
    id: 'WOLF', name: 'Wolf', role: 'Soldier',
    palette: { primary: 0x6f7682, secondary: 0xcfd3da, accent: 0x1a1d22, eye: 0xffdd55 },
    speedMul: 1.0, hpMul: 1.05, jumpMul: 1.0, sizeMul: 1.0,
    skinTexture: 'wolf',
    headBuilder: buildWolfHead,
  },
  PANDA: {
    id: 'PANDA', name: 'Panda', role: 'Tank',
    palette: { primary: 0xf2f2f2, secondary: 0x1c1c1c, accent: 0x2a2a2a, eye: 0x2a2a2a },
    speedMul: 0.9, hpMul: 1.3, jumpMul: 0.9, sizeMul: 1.12,
    skinTexture: 'panda',
    headBuilder: buildPandaHead,
  },
  TIGER: {
    id: 'TIGER', name: 'Tiger', role: 'Striker',
    palette: { primary: 0xf2a93b, secondary: 0x1c1c1c, accent: 0x3a2a14, eye: 0xffdd55 },
    speedMul: 1.08, hpMul: 1.0, jumpMul: 1.05, sizeMul: 1.02,
    skinTexture: 'tiger',
    headBuilder: buildTigerHead,
  },
  BEAR: {
    id: 'BEAR', name: 'Bear', role: 'Juggernaut',
    palette: { primary: 0x7a5230, secondary: 0xd8b48a, accent: 0x2a1a0e, eye: 0x2a1a0e },
    speedMul: 0.88, hpMul: 1.35, jumpMul: 0.85, sizeMul: 1.15,
    skinTexture: 'bear',
    headBuilder: buildBearHead,
  },
  BUNNY: {
    id: 'BUNNY', name: 'Bunny', role: 'Speedster',
    palette: { primary: 0xe8e1d6, secondary: 0xc9b8a3, accent: 0x3a2a1a, eye: 0xffaaaa },
    speedMul: 1.25, hpMul: 0.8, jumpMul: 1.35, sizeMul: 0.88,
    skinTexture: 'bunny',
    headBuilder: buildBunnyHead,
  },
  OWL: {
    id: 'OWL', name: 'Owl', role: 'Marksman',
    palette: { primary: 0xa6926b, secondary: 0xe8dcc4, accent: 0x2a1a0e, eye: 0xffcc33 },
    speedMul: 1.0, hpMul: 0.9, jumpMul: 1.05, sizeMul: 0.95,
    skinTexture: 'owl',
    headBuilder: buildOwlHead,
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);

// headBuilder returns a THREE.Group positioned so its origin is at the neck,
// oriented facing +Z (forward). Body attaches it at the top.
// The returned group carries head.userData.headshot = true so the hitscan
// resolver can apply a headshot multiplier to head hits.
function mat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true }); }

function sphere(r, color) { return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat(color)); }
function box(w,h,d,color){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color)); }
function cone(r,h,color){ return new THREE.Mesh(new THREE.ConeGeometry(r,h,10), mat(color)); }

// Tag the main head mesh as the headshot target. Returns the mesh for chaining.
function asHead(mesh) { mesh.userData.headshot = true; return mesh; }

// A glowing/pupil eye pair builder so every animal gets consistent, palette-driven eyes.
function addEyes(g, color, eyeR, sep, y, z) {
  const e1 = sphere(eyeR, color); e1.position.set(-sep, y, z); g.add(e1);
  const e2 = sphere(eyeR, color); e2.position.set(sep, y, z); g.add(e2);
  return g;
}

// Tiny bright catch-light spheres just in front of each eye — reads as wet/alive
// eye-shine. sep/y/z match the addEyes call for the same animal.
function addEyeShine(g, sep, y, z, r = 0.012) {
  const s1 = sphere(r, 0xffffff); s1.position.set(-sep, y, z + r * 1.5); g.add(s1);
  const s2 = sphere(r, 0xffffff); s2.position.set(sep, y, z + r * 1.5); g.add(s2);
  return g;
}

function buildFoxHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.32, p.primary)); head.position.y = 0; g.add(head);
  const snout = box(0.18, 0.16, 0.28, p.secondary); snout.position.set(0, -0.05, 0.32); g.add(snout);
  const nose = box(0.06,0.06,0.06, p.accent); nose.position.set(0,-0.02,0.46); g.add(nose);
  const ear1 = cone(0.08, 0.22, p.primary); ear1.position.set(-0.14, 0.32, -0.05); g.add(ear1);
  const ear2 = cone(0.08, 0.22, p.primary); ear2.position.set(0.14, 0.32, -0.05); g.add(ear2);
  // inner ear accents
  const ie1 = cone(0.04, 0.12, p.secondary); ie1.position.set(-0.14, 0.34, -0.03); g.add(ie1);
  const ie2 = cone(0.04, 0.12, p.secondary); ie2.position.set(0.14, 0.34, -0.03); g.add(ie2);
  addEyes(g, p.eye, 0.045, 0.1, 0.05, 0.28);
  addEyeShine(g, 0.1, 0.05, 0.28);
  return g;
}

function buildWolfHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.34, p.primary)); g.add(head);
  const snout = box(0.2,0.18,0.32, p.secondary); snout.position.set(0,-0.05,0.3); g.add(snout);
  const nose = sphere(0.05, p.accent); nose.position.set(0,-0.02,0.46); g.add(nose);
  const ear1 = box(0.08,0.18,0.06,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = box(0.08,0.18,0.06,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  const ie1 = box(0.04,0.1,0.03,p.secondary); ie1.position.set(-0.16,0.32,0.01); g.add(ie1);
  const ie2 = box(0.04,0.1,0.03,p.secondary); ie2.position.set(0.16,0.32,0.01); g.add(ie2);
  addEyes(g, p.eye, 0.05, 0.12, 0.06, 0.27);
  addEyeShine(g, 0.12, 0.06, 0.27);
  return g;
}

function buildPandaHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.36, p.primary)); g.add(head);
  const patch1 = sphere(0.1, p.secondary); patch1.position.set(-0.16,0.04,0.28); g.add(patch1);
  const patch2 = sphere(0.1, p.secondary); patch2.position.set(0.16,0.04,0.28); g.add(patch2);
  const eye1 = sphere(0.035, p.eye); eye1.position.set(-0.16,0.04,0.35); g.add(eye1);
  const eye2 = sphere(0.035, p.eye); eye2.position.set(0.16,0.04,0.35); g.add(eye2);
  const ear1 = sphere(0.12, p.secondary); ear1.position.set(-0.28,0.28,0); g.add(ear1);
  const ear2 = sphere(0.12, p.secondary); ear2.position.set(0.28,0.28,0); g.add(ear2);
  const snout = sphere(0.1, p.primary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.04, p.accent); nose.position.set(0,-0.04,0.4); g.add(nose);
  return g;
}

function buildTigerHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.34, p.primary)); g.add(head);
  // stripes — doubled density for a richer pattern
  for (let i = 0; i < 6; i++) {
    const stripe = box(0.035, 0.2, 0.04, p.secondary);
    stripe.position.set(-0.21 + i*0.085, 0.2, 0.04 + (i%2)*0.13);
    stripe.rotation.z = (i % 2 ? 1 : -1) * 0.15;
    g.add(stripe);
  }
  const snout = sphere(0.16, p.secondary); snout.position.set(0,-0.05,0.3); snout.scale.set(1,0.8,1.2); g.add(snout);
  const nose = sphere(0.045, p.accent); nose.position.set(0,-0.03,0.42); g.add(nose);
  const ear1 = cone(0.08,0.2,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = cone(0.08,0.2,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  addEyes(g, p.eye, 0.045, 0.1, 0.05, 0.3);
  addEyeShine(g, 0.1, 0.05, 0.3);
  return g;
}

function buildBearHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.38, p.primary)); g.add(head);
  const snout = box(0.2,0.18,0.3, p.secondary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.05, p.accent); nose.position.set(0,-0.02,0.44); g.add(nose);
  const ear1 = sphere(0.12, p.primary); ear1.position.set(-0.26,0.3,0); g.add(ear1);
  const ear2 = sphere(0.12, p.primary); ear2.position.set(0.26,0.3,0); g.add(ear2);
  const ie1 = sphere(0.06, p.secondary); ie1.position.set(-0.26,0.32,0.01); g.add(ie1);
  const ie2 = sphere(0.06, p.secondary); ie2.position.set(0.26,0.32,0.01); g.add(ie2);
  addEyes(g, p.eye, 0.04, 0.1, 0.05, 0.32);
  addEyeShine(g, 0.1, 0.05, 0.32);
  return g;
}

function buildBunnyHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.3, p.primary)); g.add(head);
  const ear1 = box(0.08,0.5,0.06,p.primary); ear1.position.set(-0.1,0.45,0); ear1.rotation.z = 0.1; g.add(ear1);
  const ear2 = box(0.08,0.5,0.06,p.primary); ear2.position.set(0.1,0.45,0); ear2.rotation.z = -0.1; g.add(ear2);
  // inner ear pink
  const ie1 = box(0.04,0.4,0.02,p.secondary); ie1.position.set(-0.1,0.46,0.03); ie1.rotation.z = 0.1; g.add(ie1);
  const ie2 = box(0.04,0.4,0.02,p.secondary); ie2.position.set(0.1,0.46,0.03); ie2.rotation.z = -0.1; g.add(ie2);
  const nose = sphere(0.04, p.eye); nose.position.set(0,-0.04,0.28); g.add(nose);
  addEyes(g, p.accent, 0.04, 0.1, 0.04, 0.26);
  addEyeShine(g, 0.1, 0.04, 0.26);
  return g;
}

function buildOwlHead(p) {
  const g = new THREE.Group();
  const head = asHead(sphere(0.36, p.primary)); g.add(head);
  const disc1 = sphere(0.12, p.secondary); disc1.position.set(-0.14,0.04,0.26); disc1.scale.set(1,1,0.4); g.add(disc1);
  const disc2 = sphere(0.12, p.secondary); disc2.position.set(0.14,0.04,0.26); disc2.scale.set(1,1,0.4); g.add(disc2);
  const eye1 = sphere(0.06, p.eye); eye1.position.set(-0.14,0.04,0.32); g.add(eye1);
  const eye2 = sphere(0.06, p.eye); eye2.position.set(0.14,0.04,0.32); g.add(eye2);
  // pupils
  const pup1 = sphere(0.025, p.accent); pup1.position.set(-0.14,0.04,0.37); g.add(pup1);
  const pup2 = sphere(0.025, p.accent); pup2.position.set(0.14,0.04,0.37); g.add(pup2);
  const beak = cone(0.05,0.14, p.accent); beak.position.set(0,-0.06,0.34); beak.rotation.x = Math.PI/2; g.add(beak);
  const tuft1 = cone(0.06,0.18,p.primary); tuft1.position.set(-0.2,0.34,0); g.add(tuft1);
  const tuft2 = cone(0.06,0.18,p.primary); tuft2.position.set(0.2,0.34,0); g.add(tuft2);
  return g;
}
