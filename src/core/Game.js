import * as THREE from 'three';
import { FixedTimestep } from './FixedTimestep.js';
import { InputState } from './InputState.js';
import { ArenaBuilder } from '../world/ArenaBuilder.js';
import { ColliderStore } from '../world/ColliderStore.js';
import { createPlayer, eyePosition } from '../player/Player.js';
import { tickMovement } from '../player/MovementController.js';
import { MOVEMENT as M } from '../config/Movement.js';
import { WEAPONS } from '../config/Weapons.js';
import { WeaponController } from '../player/WeaponController.js';
import { BulletTracerPool } from '../fx/BulletTracer.js';
import { MuzzleFlashPool } from '../fx/MuzzleFlash.js';
import { HitSparkPool } from '../fx/HitMarker.js';
import { TargetEntity } from '../player/TargetEntity.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 150);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 500);

    // Lighting
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(40, 80, 30);
    this.scene.add(dir);

    // World
    this.colliders = new ColliderStore();
    this.arena = new ArenaBuilder();
    this.arena.build(this.scene, this.colliders);

    // Local player
    this.player = createPlayer({ id: 'local', isLocal: true, position: new THREE.Vector3(0, 1, 15) });

    // FX pools
    this.tracers = new BulletTracerPool(this.scene);
    this.flashes = new MuzzleFlashPool(this.scene);
    this.sparks = new HitSparkPool(this.scene);

    // Weapon (local player's primary)
    this.weapon = new WeaponController(WEAPONS[this.player.loadout.primary]);
    this.pendingShots = [];
    this.weapon.fireCallback = () => this.pendingShots.push({});

    // Static test targets (Phase 4 replaces these with bots)
    this.targets = [
      new TargetEntity(this.scene, this.colliders, new THREE.Vector3(0, 0, -10)),
      new TargetEntity(this.scene, this.colliders, new THREE.Vector3(-8, 3, -10)),
      new TargetEntity(this.scene, this.colliders, new THREE.Vector3(8, 3, -10)),
    ];

    // Input
    this.input = new InputState(canvas);
    this.input.requestPointerLock();

    // Loop
    this.fixed = new FixedTimestep(1 / 60);
    this.running = false;
    this.lastTime = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(realDt) {
    // Look (consume once per render frame, not per tick)
    const look = this.input.consumeLook();
    this.player.yaw -= look.dx;
    this.player.pitch -= look.dy;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));

    // Intent
    this.player.intent = this.input.buildIntent();

    // Sim: movement + weapon state each fixed tick
    this.fixed.update(realDt, (dt) => {
      tickMovement(this.player, dt, this.colliders);
      const firing = this.player.intent.firing;
      const reloadReq = this.input.consumeReloadRequest();
      this.weapon.update(dt, firing, reloadReq);
    });

    // Process one shot per pending event this render frame.
    // (The fixed loop may arm several; we resolve them against the current camera each.)
    for (const _shot of this.pendingShots) this.fireOneShot();
    this.pendingShots.length = 0;

    // FX lifetime
    this.tracers.update(realDt);
    this.flashes.update(realDt);
    this.sparks.update(realDt);

    // Render: position camera at eye, oriented by yaw/pitch
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.renderer.render(this.scene, this.camera);
  }

  fireOneShot() {
    const def = this.weapon.def;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // gaussian-ish spread
    dir.x += (Math.random() - 0.5) * def.spread;
    dir.y += (Math.random() - 0.5) * def.spread;
    dir.z += (Math.random() - 0.5) * def.spread;
    dir.normalize();

    const MAX = 500;
    // nearest enemy target hit
    let best = null;
    for (const t of this.targets) {
      const hit = t.rayHit(origin, dir, MAX);
      if (hit && (!best || hit.dist < best.dist)) best = { ...hit, kind: 'enemy' };
    }
    const wallHit = this.colliders.raycast(origin, dir, MAX);
    if (wallHit && (!best || wallHit.dist < best.dist)) {
      best = { dist: wallHit.dist, point: wallHit.point, kind: 'wall' };
    }

    const muzzle = origin.clone().addScaledVector(dir, 0.6);
    this.flashes.spawn(muzzle);

    if (best) {
      this.tracers.spawn(muzzle, best.point);
      if (best.kind === 'enemy') {
        const dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
        best.target.takeDamage(dmg);
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xff3344);
      } else {
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xffd24a);
      }
    } else {
      const far = origin.clone().addScaledVector(dir, MAX);
      this.tracers.spawn(muzzle, far);
    }

    // Recoil (local player only)
    this.player.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
    this.player.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
    this.player.pitch = Math.min(this.player.pitch, Math.PI / 2 - 0.01);
  }
}

// Linear damage falloff: full up to start, drops to 40% at end, stays at 40% past end.
function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
