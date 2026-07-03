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
import { Crosshair } from '../ui/Crosshair.js';
import { Hud } from '../ui/Hud.js';
import { MainMenu } from '../ui/MainMenu.js';
import { CharacterView } from '../player/CharacterView.js';
import { EntityStore } from './EntityStore.js';
import { AIController } from '../ai/AIController.js';
import { MATCH } from '../config/Match.js';
import { getRandomSpawn } from '../world/SpawnPoints.js';
import { ANIMAL_IDS } from '../config/Animals.js';

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

    // FX pools
    this.tracers = new BulletTracerPool(this.scene);
    this.flashes = new MuzzleFlashPool(this.scene);
    this.sparks = new HitSparkPool(this.scene);

    // Entity store (local player + bots). Built fresh per match in startMatch.
    this.entities = new EntityStore();
    this.bots = [];
    this.pendingShots = []; // local player's pending shots, drained each frame

    // Local player
    this.player = createPlayer({ id: 'You', isLocal: true, position: new THREE.Vector3(0, 1, 15) });
    this.player.animalId = 'FOX';
    this.player.view = new CharacterView(this.scene);
    this.player.view.setAnimal('FOX');
    this.player.view.setWeapon('AR');
    this.player.view.setVisible(false);
    this.weapon = new WeaponController(WEAPONS.AR);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.entities.add(this.player);

    // HUD + crosshair
    const uiRoot = document.getElementById('ui');
    this.hud = new Hud(uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.hud.setWeapon(this.weapon.def.name);

    // Input + main menu (pointer lock is requested on PLAY click)
    this.input = new InputState(canvas);
    this.menu = new MainMenu(document.getElementById('ui'), {
      onStart: ({ animal, weapon }) => this.startMatch(animal, weapon),
    });

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

  startMatch(animalId, weaponId) {
    // Reset local player
    this.player.loadout.primary = weaponId;
    this.player.animalId = animalId;
    this.player.view.setAnimal(animalId);
    this.player.view.setWeapon(weaponId);
    this.player.health = this.player.maxHealth;
    this.player.alive = true;
    this.player.view.setVisible(false);
    this.weapon = new WeaponController(WEAPONS[weaponId]);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.hud.setWeapon(this.weapon.def.name);

    // Clear old bots, then spawn fresh ones.
    for (const bot of this.bots) {
      if (bot.view) bot.view.dispose();
      this.entities.remove(bot);
    }
    this.bots = [];
    const occupied = [this.player.position];
    const diff = MATCH.botDifficulty.normal;
    for (let i = 0; i < MATCH.botCount; i++) {
      const sp = getRandomSpawn(occupied);
      occupied.push(sp);
      const animal = ANIMAL_IDS[i % ANIMAL_IDS.length];
      const bot = createPlayer({ id: 'Bot ' + (i + 1), isLocal: false, position: sp });
      bot.animalId = animal;
      bot.view = new CharacterView(this.scene);
      bot.view.setAnimal(animal);
      bot.view.setWeapon('AR');
      bot.weapon = new WeaponController(WEAPONS.AR);
      bot.pendingShots = [];
      bot.weapon.fireCallback = () => bot.pendingShots.push({});
      bot.brain = new AIController(bot, diff);
      this.entities.add(bot);
      this.bots.push(bot);
    }

    this.input.requestPointerLock();
  }

  frame(realDt) {
    // Look (consume once per render frame)
    const look = this.input.consumeLook();
    this.player.yaw -= look.dx;
    this.player.pitch -= look.dy;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));

    // Intent
    this.player.intent = this.input.buildIntent();

    // Sim: movement + weapon for every player, each fixed tick
    this.fixed.update(realDt, (dt) => {
      if (this.player.alive) tickMovement(this.player, dt, this.colliders);
      const firing = this.player.alive && this.player.intent.firing;
      const reloadReq = this.input.consumeReloadRequest();
      this.weapon.update(dt, firing, reloadReq);

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.brain.update(dt, this.entities.enemiesOf(bot), this.colliders);
        tickMovement(bot, dt, this.colliders);
        bot.weapon.update(dt, bot.intent.firing, bot.intent.reloadRequested);
      }
    });

    // Process all pending shots this frame (local player + bots)
    for (const _shot of this.pendingShots) this.fireOneShot(this.player, this.weapon);
    this.pendingShots.length = 0;
    for (const bot of this.bots) {
      for (const _shot of bot.pendingShots) this.fireOneShot(bot, bot.weapon);
      bot.pendingShots.length = 0;
    }

    // FX lifetime
    this.tracers.update(realDt);
    this.flashes.update(realDt);
    this.sparks.update(realDt);

    // Sync bot character views
    for (const bot of this.bots) {
      if (bot.view) {
        bot.view.setPosition(bot.position.x, bot.position.y, bot.position.z);
        const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
        bot.view.update(realDt, speed, bot.yaw, bot.pitch);
      }
    }

    // Render: camera at local player's eye, oriented by yaw/pitch
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.renderer.render(this.scene, this.camera);

    // HUD
    this.hud.setHealth(this.player.health);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.def.mag);
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.crosshair.setSpread(14 + speed * 2);
  }

  // Generalized hitscan: any shooter can fire at any other player.
  fireOneShot(shooter, weapon) {
    const def = weapon.def;
    const origin = new THREE.Vector3(shooter.position.x, shooter.position.y + M.EYE_HEIGHT, shooter.position.z);
    const dir = new THREE.Vector3(
      -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
       Math.sin(shooter.pitch),
      -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
    );
    dir.x += (Math.random() - 0.5) * def.spread;
    dir.y += (Math.random() - 0.5) * def.spread;
    dir.z += (Math.random() - 0.5) * def.spread;
    dir.normalize();

    const MAX = 500;
    // nearest enemy player hit
    let best = null;
    for (const other of this.entities.players) {
      if (other === shooter || !other.alive) continue;
      const hit = playerRayHit(other, origin, dir, MAX);
      if (hit && (!best || hit.dist < best.dist)) best = { dist: hit.dist, point: hit.point, target: other };
    }
    const wallHit = this.colliders.raycast(origin, dir, MAX);
    if (wallHit && (!best || wallHit.dist < best.dist)) {
      best = { dist: wallHit.dist, point: wallHit.point, target: null };
    }

    const muzzle = origin.clone().addScaledVector(dir, 0.6);
    this.flashes.spawn(muzzle);

    if (best) {
      this.tracers.spawn(muzzle, best.point);
      if (best.target) {
        const dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
        best.target.health -= dmg;
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xff3344);
        if (best.target.health <= 0) {
          best.target.health = 0;
          best.target.alive = false;
          best.target.deaths += 1;
          shooter.score += 1;
          if (best.target.view) best.target.view.setVisible(false);
          const victimName = best.target.isLocal ? 'You' : best.target.id;
          const shooterName = shooter.isLocal ? 'You' : shooter.id;
          this.hud.addKill(`${shooterName} fragged ${victimName}`);
        }
      } else {
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xffd24a);
      }
    } else {
      const far = origin.clone().addScaledVector(dir, MAX);
      this.tracers.spawn(muzzle, far);
    }

    // Recoil (local player only — bots already have aim error baked in)
    if (shooter.isLocal) {
      shooter.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
      shooter.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
      shooter.pitch = Math.min(shooter.pitch, Math.PI / 2 - 0.01);
    }
  }
}

// Ray vs a player's capsule approximated as an AABB.
function playerRayHit(player, origin, dir, maxDist) {
  const r = 0.5, h = 1.8;
  const box = new THREE.Box3(
    new THREE.Vector3(player.position.x - r, player.position.y, player.position.z - r),
    new THREE.Vector3(player.position.x + r, player.position.y + h, player.position.z + r)
  );
  const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
  if (!hit) return null;
  const dist = origin.distanceTo(hit);
  if (dist > maxDist) return null;
  return { dist, point: hit.clone() };
}

// Linear damage falloff: full up to start, drops to 40% at end, stays at 40% past end.
function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
