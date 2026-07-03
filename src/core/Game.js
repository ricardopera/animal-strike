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
import { Scoreboard } from '../ui/Scoreboard.js';
import { EndScreen } from '../ui/EndScreen.js';
import { CharacterView } from '../player/CharacterView.js';
import { FirstPersonView } from '../player/FirstPersonView.js';
import { EntityStore } from './EntityStore.js';
import { AIController } from '../ai/AIController.js';
import { MATCH } from '../config/Match.js';
import { getRandomSpawn } from '../world/SpawnPoints.js';
import { ANIMAL_IDS } from '../config/Animals.js';
import { Sfx, resumeAudio } from '../audio/Audio.js';
import { SettingsPanel } from '../ui/Settings.js';
import { DamageNumbers } from '../fx/DamageNumbers.js';

// Module-level scratch vectors reused across hitscan to avoid per-shot GC churn.
const _shotOrigin = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _shotMuzzle = new THREE.Vector3();
const _pelletDir = new THREE.Vector3();
const _shotMuzzle2 = new THREE.Vector3();
const _shotFar = new THREE.Vector3();
const _rayBox = new THREE.Box3();
const _rayBoxMin = new THREE.Vector3();
const _rayBoxMax = new THREE.Vector3();
const _rayHit = new THREE.Vector3();
const _ray = new THREE.Ray();

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

    // Entities + bots
    this.entities = new EntityStore();
    this.bots = [];
    this.pendingShots = [];

    // Local player
    this.player = createPlayer({ id: 'You', isLocal: true, position: new THREE.Vector3(0, 1, 15) });
    this.player.animalId = 'FOX';
    this.player.view = new CharacterView(this.scene);
    this.player.view.setAnimal('FOX');
    this.player.view.setWeapon('AR');
    this.player.view.setVisible(false);
    this.weapon = new WeaponController(WEAPONS.AR);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.weapon.onReloadStart = () => this.firstPersonView.startReload(this.weapon.def.reloadTime);
    this.entities.add(this.player);

    // First-person weapon viewmodel (synced to camera each frame, hidden until match)
    this.firstPersonView = new FirstPersonView();
    this.firstPersonView.attach(this.scene);
    this.firstPersonView.setWeapon('AR');

    // Match state (inactive until startMatch)
    this.match = { active: false, timeLeft: MATCH.matchSeconds, fragTarget: MATCH.fragTarget, over: false };
    this.respawnTimers = new Map();

    // UI
    const uiRoot = document.getElementById('ui');
    this.hud = new Hud(uiRoot);
    this.crosshair = new Crosshair(uiRoot);
    this.damageNumbers = new DamageNumbers(uiRoot, this.camera);
    this.vignetteEl = document.getElementById('vignette');
    this.baseFov = this.camera.fov;
    this.scoreboard = new Scoreboard(uiRoot);
    this.scoreboard.attach();
    this.endScreen = new EndScreen(uiRoot, { onPlayAgain: () => this.returnToMenu() });
    this.hud.setWeapon(this.weapon.def.name);
    this.hud.setTime(this.match.timeLeft);

    // Input + main menu
    this.input = new InputState(canvas);
    this.settings = new SettingsPanel(uiRoot, { onChange: (s) => this.applySettings(s) });
    this.menu = new MainMenu(uiRoot, {
      onStart: ({ animal, weapon }) => this.startMatch(animal, weapon),
      onToggleSettings: () => this.settings.toggle(),
    });
    this.applySettings(this.settings.settings);

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
    this.respawnPlayer(this.player);

    this.weapon = new WeaponController(WEAPONS[weaponId]);
    this.weapon.fireCallback = () => this.pendingShots.push({});
    this.weapon.onReloadStart = () => this.firstPersonView.startReload(this.weapon.def.reloadTime);
    this.firstPersonView.setWeapon(weaponId);
    this.firstPersonView.endReload();
    this.hud.setWeapon(this.weapon.def.name);

    // Clear old bots, spawn fresh ones.
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
      bot.score = 0;
      bot.deaths = 0;
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

    // Reset match state
    this.match = { active: true, timeLeft: MATCH.matchSeconds, fragTarget: MATCH.fragTarget, over: false };
    this.respawnTimers.clear();
    this.player.score = 0;
    this.player.deaths = 0;
    this.endScreen.hide();
    resumeAudio();
    this.input.requestPointerLock();
  }

  applySettings(s) {
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.baseFov = s.fov;
    // camera.fov is eased toward baseFov each frame in frame(), so just set baseFov here
    if (s.quality === 'low') {
      this.renderer.setPixelRatio(1);
    } else {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  returnToMenu() {
    this.match.active = false;
    this.match.over = true;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const bot of this.bots) {
      if (bot.view) bot.view.dispose();
      this.entities.remove(bot);
    }
    this.bots = [];
    this.menu.show();
  }

  endMatch() {
    if (this.match.over) return;
    this.match.over = true;
    this.match.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const ranked = [...this.entities.players].sort((a, b) => b.score - a.score);
    this.endScreen.show(ranked);
  }

  respawnPlayer(player) {
    const others = this.entities.alive().filter(p => p !== player).map(p => p.position);
    const sp = getRandomSpawn(others);
    player.position.copy(sp);
    player.velocity.set(0, 0, 0);
    player.health = player.maxHealth;
    player.alive = true;
    player.yaw = 0;
    player.pitch = 0;
    if (player.weapon) {
      player.weapon.ammo = player.weapon.def.mag;
      player.weapon.reloading = false;
      player.weapon.nextFireTime = 0;
    } else if (player === this.player) {
      // local player's current weapon lives on `this.weapon`, not player.weapon
      this.weapon.ammo = this.weapon.def.mag;
      this.weapon.reloading = false;
      this.weapon.nextFireTime = 0;
    }
    if (player.view) player.view.setVisible(!player.isLocal); // local view stays hidden (first person)
  }

  frame(realDt) {
    // Look (local player only, only while match active)
    if (this.match.active) {
      const look = this.input.consumeLook();
      this.player.yaw -= look.dx;
      this.player.pitch -= look.dy;
      this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
    }
    this.player.intent = this.input.buildIntent();

    // Sim
    this.fixed.update(realDt, (dt) => {
      if (this.match.active) {
        // Match timer
        this.match.timeLeft -= dt;
        if (this.match.timeLeft <= 0) {
          this.match.timeLeft = 0;
          this.endMatch();
        }
        // Respawns
        for (const id of [...this.respawnTimers.keys()]) {
          const left = this.respawnTimers.get(id) - dt;
          if (left <= 0) {
            this.respawnTimers.delete(id);
            const p = this.entities.players.find(p => p.id === id);
            if (p) this.respawnPlayer(p);
          } else {
            this.respawnTimers.set(id, left);
          }
        }
      }

      if (this.match.active && this.player.alive) tickMovement(this.player, dt, this.colliders);
      const firing = this.match.active && this.player.alive && this.player.intent.firing;
      const reloadReq = this.input.consumeReloadRequest();
      this.weapon.update(dt, firing, reloadReq);

      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.brain.update(dt, this.entities.enemiesOf(bot), this.colliders);
        tickMovement(bot, dt, this.colliders);
        bot.weapon.update(dt, bot.intent.firing, bot.intent.reloadRequested);
      }
    });

    // Resolve pending shots (only while match active)
    if (this.match.active) {
      for (const _shot of this.pendingShots) this.fireOneShot(this.player, this.weapon);
      this.pendingShots.length = 0;
      for (const bot of this.bots) {
        for (const _shot of bot.pendingShots) this.fireOneShot(bot, bot.weapon);
        bot.pendingShots.length = 0;
      }
    } else {
      this.pendingShots.length = 0;
      for (const bot of this.bots) bot.pendingShots.length = 0;
    }

    // FX
    this.tracers.update(realDt);
    this.flashes.update(realDt);
    this.sparks.update(realDt);
    this.damageNumbers.update(realDt);

    // Bot views
    for (const bot of this.bots) {
      if (bot.view) {
        bot.view.setPosition(bot.position.x, bot.position.y, bot.position.z);
        const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
        bot.view.update(realDt, speed, bot.yaw, bot.pitch);
      }
    }

    // Camera
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;
    this.camera.updateMatrixWorld();
    // First-person viewmodel: visible only while playing + alive
    const showFP = this.match.active && this.player.alive;
    this.firstPersonView.setVisible(showFP);
    if (showFP) {
      this.firstPersonView.syncToCamera(this.camera);
      this.firstPersonView.update(realDt, Math.hypot(this.player.velocity.x, this.player.velocity.z));
    }
    this.renderer.render(this.scene, this.camera);

    // HUD + scoreboard
    this.hud.setHealth(this.player.health);
    this.hud.setAmmo(this.weapon.ammo, this.weapon.def.mag);
    this.hud.setTime(this.match.timeLeft);
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.crosshair.setSpread(14 + speed * 2);
    // Sprint FOV kick: widen FOV when sprinting/fast, ease back otherwise
    const targetFov = this.baseFov + (this.player.intent.sprint && this.player.velocity.lengthSq() > 4 ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, realDt * 10);
      this.camera.updateProjectionMatrix();
    }
    // Low-HP vignette: intensify red inset when health is low
    if (this.vignetteEl) {
      const intensity = this.player.alive && this.player.health < 30 ? (30 - this.player.health) / 30 : 0;
      this.vignetteEl.style.boxShadow = `inset 0 0 200px 60px rgba(180,0,0,${(intensity * 0.6).toFixed(3)})`;
    }
    this.scoreboard.update(this.entities.players);
  }

  fireOneShot(shooter, weapon) {
    const def = weapon.def;
    // Origin/aim: local player uses the real gun-muzzle world position; bots use eye-derived.
    let origin, baseDir;
    if (shooter.isLocal && this.firstPersonView.group.visible) {
      const m = this.firstPersonView.getMuzzleWorldPosition(_shotOrigin, _shotDir);
      origin = _shotOrigin.copy(m.pos);
      baseDir = _shotDir.copy(m.dir);
      this.firstPersonView.triggerKick(1);
    } else {
      origin = _shotOrigin.set(shooter.position.x, shooter.position.y + M.EYE_HEIGHT, shooter.position.z);
      baseDir = _shotDir.set(
        -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
         Math.sin(shooter.pitch),
        -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
      );
    }

    // Per-shot FX (once): muzzle flash + weapon sound, at the muzzle.
    _shotMuzzle.copy(origin).addScaledVector(baseDir, 0.6);
    this.flashes.spawn(_shotMuzzle);
    this.playShootSfx(def.id);

    // Fire N pellets (shotgun) or 1 (everything else). Each pellet gets its own spread + ray.
    const pellets = def.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      // scratch per-pellet direction (don't clobber baseDir for the next pellet)
      _pelletDir.copy(baseDir);
      _pelletDir.x += (Math.random() - 0.5) * def.spread;
      _pelletDir.y += (Math.random() - 0.5) * def.spread;
      _pelletDir.z += (Math.random() - 0.5) * def.spread;
      _pelletDir.normalize();
      this.fireOnePellet(shooter, def, origin, _pelletDir);
    }

    // Recoil (local player only)
    if (shooter.isLocal) {
      shooter.pitch += def.recoil.vertical * (Math.random() * 0.5 + 0.5);
      shooter.yaw += (Math.random() - 0.5) * def.recoil.horizontal;
      shooter.pitch = Math.min(shooter.pitch, Math.PI / 2 - 0.01);
    }
  }

  playShootSfx(weaponId) {
    switch (weaponId) {
      case 'SNIPER': Sfx.shootSniper(); break;
      case 'SHOTGUN': Sfx.shootShotgun(); break;
      case 'PISTOL': Sfx.shootPistol(); break;
      case 'SMG': Sfx.shootSMG(); break;
      default: Sfx.shootAR();
    }
  }

  // Resolve a single pellet ray: nearest of {players, walls}, apply damage/FX.
  fireOnePellet(shooter, def, origin, dir) {
    const MAX = 500;
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
    _shotMuzzle2.copy(origin).addScaledVector(dir, 0.6);

    if (best) {
      this.tracers.spawn(_shotMuzzle2, best.point);
      if (best.target) {
        const dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
        best.target.health -= dmg;
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xff3344);
        Sfx.hit();
        this.damageNumbers.spawn(best.point, dmg);
        if (best.target.isLocal) Sfx.hurt();
        if (best.target.health <= 0) {
          best.target.health = 0;
          best.target.alive = false;
          best.target.deaths += 1;
          shooter.score += 1;
          if (best.target.view) best.target.view.setVisible(false);
          const victimName = best.target.isLocal ? 'You' : best.target.id;
          const shooterName = shooter.isLocal ? 'You' : shooter.id;
          this.hud.addKill(`${shooterName} fragged ${victimName}`);
          Sfx.kill();
          this.respawnTimers.set(best.target.id, MATCH.respawnDelay);
          if (shooter.score >= this.match.fragTarget) this.endMatch();
        }
      } else {
        this.sparks.spawn(best.point, new THREE.Vector3(0, 1, 0), 0xffd24a);
      }
    } else {
      _shotFar.copy(origin).addScaledVector(dir, MAX);
      this.tracers.spawn(_shotMuzzle2, _shotFar);
    }
  }
}

function playerRayHit(player, origin, dir, maxDist) {
  const r = 0.5, h = 1.8;
  _rayBoxMin.set(player.position.x - r, player.position.y, player.position.z - r);
  _rayBoxMax.set(player.position.x + r, player.position.y + h, player.position.z + r);
  _rayBox.set(_rayBoxMin, _rayBoxMax);
  _ray.set(origin, dir);
  const hit = _ray.intersectBox(_rayBox, _rayHit);
  if (!hit) return null;
  const dist = origin.distanceTo(hit);
  if (dist > maxDist) return null;
  return { dist, point: hit.clone() };
}

function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
