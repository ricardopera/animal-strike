import * as THREE from 'three';

// Each animal defines a palette and stat multipliers + a headBuilder(group) that
// attaches an animal head at the top of the body. All animals share the body rig.
export const ANIMALS = {
  FOX: {
    id: 'FOX', name: 'Fox',
    palette: { primary: 0xe8742c, secondary: 0xf5efe6, accent: 0x2a1a0e },
    speedMul: 1.1, hpMul: 0.9,
    headBuilder: buildFoxHead,
  },
  WOLF: {
    id: 'WOLF', name: 'Wolf',
    palette: { primary: 0x6f7682, secondary: 0xcfd3da, accent: 0x1a1d22 },
    speedMul: 1.0, hpMul: 1.0,
    headBuilder: buildWolfHead,
  },
  PANDA: {
    id: 'PANDA', name: 'Panda',
    palette: { primary: 0xf2f2f2, secondary: 0x1c1c1c, accent: 0x2a2a2a },
    speedMul: 0.95, hpMul: 1.1,
    headBuilder: buildPandaHead,
  },
  TIGER: {
    id: 'TIGER', name: 'Tiger',
    palette: { primary: 0xf2a93b, secondary: 0x1c1c1c, accent: 0x3a2a14 },
    speedMul: 1.05, hpMul: 1.0,
    headBuilder: buildTigerHead,
  },
  BEAR: {
    id: 'BEAR', name: 'Bear',
    palette: { primary: 0x7a5230, secondary: 0xd8b48a, accent: 0x2a1a0e },
    speedMul: 0.9, hpMul: 1.2,
    headBuilder: buildBearHead,
  },
  BUNNY: {
    id: 'BUNNY', name: 'Bunny',
    palette: { primary: 0xe8e1d6, secondary: 0xc9b8a3, accent: 0x3a2a1a },
    speedMul: 1.2, hpMul: 0.85,
    headBuilder: buildBunnyHead,
  },
  OWL: {
    id: 'OWL', name: 'Owl',
    palette: { primary: 0xa6926b, secondary: 0xe8dcc4, accent: 0x2a1a0e },
    speedMul: 1.0, hpMul: 0.95,
    headBuilder: buildOwlHead,
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);

// headBuilder returns a THREE.Group positioned so its origin is at the neck,
// oriented facing +Z (forward). Body attaches it at the top.
function mat(color) { return new THREE.MeshStandardMaterial({ color, flatShading: true }); }

function sphere(r, color) { return new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color)); }
function box(w,h,d,color){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color)); }
function cone(r,h,color){ return new THREE.Mesh(new THREE.ConeGeometry(r,h,8), mat(color)); }

function buildFoxHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.32, p.primary); head.position.y = 0; g.add(head);
  const snout = box(0.18, 0.16, 0.28, p.secondary); snout.position.set(0, -0.05, 0.32); g.add(snout);
  const nose = box(0.06,0.06,0.06, p.accent); nose.position.set(0,-0.02,0.46); g.add(nose);
  const ear1 = cone(0.08, 0.22, p.primary); ear1.position.set(-0.14, 0.32, -0.05); g.add(ear1);
  const ear2 = cone(0.08, 0.22, p.primary); ear2.position.set(0.14, 0.32, -0.05); g.add(ear2);
  const eye1 = sphere(0.04, p.accent); eye1.position.set(-0.1, 0.05, 0.28); g.add(eye1);
  const eye2 = sphere(0.04, p.accent); eye2.position.set(0.1, 0.05, 0.28); g.add(eye2);
  return g;
}

function buildWolfHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.34, p.primary); g.add(head);
  const snout = box(0.2,0.18,0.32, p.secondary); snout.position.set(0,-0.05,0.3); g.add(snout);
  const ear1 = box(0.08,0.18,0.06,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = box(0.08,0.18,0.06,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  const eye1 = sphere(0.045, 0xffdd55); eye1.position.set(-0.12,0.06,0.27); g.add(eye1);
  const eye2 = sphere(0.045, 0xffdd55); eye2.position.set(0.12,0.06,0.27); g.add(eye2);
  return g;
}

function buildPandaHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.36, p.primary); g.add(head);
  const patch1 = sphere(0.1, p.secondary); patch1.position.set(-0.16,0.04,0.28); g.add(patch1);
  const patch2 = sphere(0.1, p.secondary); patch2.position.set(0.16,0.04,0.28); g.add(patch2);
  const eye1 = sphere(0.035, p.accent); eye1.position.set(-0.16,0.04,0.35); g.add(eye1);
  const eye2 = sphere(0.035, p.accent); eye2.position.set(0.16,0.04,0.35); g.add(eye2);
  const ear1 = sphere(0.12, p.secondary); ear1.position.set(-0.28,0.28,0); g.add(ear1);
  const ear2 = sphere(0.12, p.secondary); ear2.position.set(0.28,0.28,0); g.add(ear2);
  const snout = sphere(0.1, p.primary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.04, p.accent); nose.position.set(0,-0.04,0.4); g.add(nose);
  return g;
}

function buildTigerHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.34, p.primary); g.add(head);
  // stripes
  for (let i = 0; i < 4; i++) {
    const stripe = box(0.04, 0.18, 0.04, p.secondary);
    stripe.position.set(-0.18 + i*0.12, 0.18, 0.05 + (i%2)*0.12);
    g.add(stripe);
  }
  const snout = sphere(0.16, p.secondary); snout.position.set(0,-0.05,0.3); snout.scale.set(1,0.8,1.2); g.add(snout);
  const ear1 = cone(0.08,0.2,p.primary); ear1.position.set(-0.16,0.3,0); g.add(ear1);
  const ear2 = cone(0.08,0.2,p.primary); ear2.position.set(0.16,0.3,0); g.add(ear2);
  const eye1 = sphere(0.04, 0xffdd55); eye1.position.set(-0.1,0.05,0.3); g.add(eye1);
  const eye2 = sphere(0.04, 0xffdd55); eye2.position.set(0.1,0.05,0.3); g.add(eye2);
  return g;
}

function buildBearHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.38, p.primary); g.add(head);
  const snout = box(0.2,0.18,0.3, p.secondary); snout.position.set(0,-0.06,0.3); g.add(snout);
  const nose = sphere(0.05, p.accent); nose.position.set(0,-0.02,0.44); g.add(nose);
  const ear1 = sphere(0.12, p.primary); ear1.position.set(-0.26,0.3,0); g.add(ear1);
  const ear2 = sphere(0.12, p.primary); ear2.position.set(0.26,0.3,0); g.add(ear2);
  const eye1 = sphere(0.035,p.accent); eye1.position.set(-0.1,0.05,0.32); g.add(eye1);
  const eye2 = sphere(0.035,p.accent); eye2.position.set(0.1,0.05,0.32); g.add(eye2);
  return g;
}

function buildBunnyHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.3, p.primary); g.add(head);
  const ear1 = box(0.08,0.5,0.06,p.primary); ear1.position.set(-0.1,0.45,0); ear1.rotation.z = 0.1; g.add(ear1);
  const ear2 = box(0.08,0.5,0.06,p.primary); ear2.position.set(0.1,0.45,0); ear2.rotation.z = -0.1; g.add(ear2);
  const eye1 = sphere(0.04,p.accent); eye1.position.set(-0.1,0.04,0.26); g.add(eye1);
  const eye2 = sphere(0.04,p.accent); eye2.position.set(0.1,0.04,0.26); g.add(eye2);
  const nose = sphere(0.04, 0xffaaaa); nose.position.set(0,-0.04,0.28); g.add(nose);
  return g;
}

function buildOwlHead(p) {
  const g = new THREE.Group();
  const head = sphere(0.36, p.primary); g.add(head);
  const disc1 = sphere(0.12, p.secondary); disc1.position.set(-0.14,0.04,0.26); disc1.scale.set(1,1,0.4); g.add(disc1);
  const disc2 = sphere(0.12, p.secondary); disc2.position.set(0.14,0.04,0.26); disc2.scale.set(1,1,0.4); g.add(disc2);
  const eye1 = sphere(0.06, 0xffcc33); eye1.position.set(-0.14,0.04,0.32); g.add(eye1);
  const eye2 = sphere(0.06, 0xffcc33); eye2.position.set(0.14,0.04,0.32); g.add(eye2);
  const beak = cone(0.05,0.14, p.accent); beak.position.set(0,-0.06,0.34); beak.rotation.x = Math.PI/2; g.add(beak);
  const tuft1 = cone(0.06,0.18,p.primary); tuft1.position.set(-0.2,0.34,0); g.add(tuft1);
  const tuft2 = cone(0.06,0.18,p.primary); tuft2.position.set(0.2,0.34,0); g.add(tuft2);
  return g;
}
