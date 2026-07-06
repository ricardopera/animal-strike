import * as THREE from 'three';
import { ColliderStore } from '../world/ColliderStore.js';
import { getMapById } from '../world/Maps.js';
import { createPlayer } from '../player/Player.js';
import { tickMovement } from '../player/MovementController.js';
import { WEAPONS } from '../config/Weapons.js';
import { WeaponController } from '../player/WeaponController.js';
import { AIController } from '../ai/AIController.js';
import { getRandomSpawn } from '../world/SpawnPoints.js';
import { ANIMAL_IDS } from '../config/Animals.js';
import { MOVEMENT as M } from '../config/Movement.js';

// Headless authoritative world simulation. Extracted from Game.js's fixed-update
// + fireOneShot/fireOnePellet logic, minus ALL rendering/FX/DOM. Runs on the Node
// server (authoritative) and in single-player (local authoritative). Imports ONLY
// pure math + game-logic modules — never TextureFactory/scene/document.

const MAX_PLAYERS = 6;
const RESPAWN_DELAY = 2.5;

// scratch objects reused across ticks (avoid per-tick allocation)
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pelletDir = new THREE.Vector3();
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _box = new THREE.Box3();
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

export class Sim {
  constructor(options) {
    this.maxPlayers = (options && options.maxPlayers) || MAX_PLAYERS;
    this._nextHumanId = 1;       // monotonic; guarantees unique ids across reconnect cycles
    this.colliders = new ColliderStore();
    this.players = [];          // humans + bots (the entity store)
    this.bots = [];             // refs into players[] that are bot-controlled
    this.humans = new Map();    // id -> player, for input routing
    this.activeMap = null;
    this.match = { active: false, timeLeft: 0, fragTarget: 25, over: false };
    this.respawnTimers = new Map();
    this._intents = new Map();  // playerId -> latest intent
    this.tickCount = 0;
    this.events = [];           // collected during tick, drained by snapshot()
  }

  addHuman(name, animalId, weaponId, position) {
    const id = 'H' + (this._nextHumanId++);
    // Before a match starts there's no active map/spawn set; default to origin.
    const startPos = position || (this.activeMap ? this._freeSpawn() : new THREE.Vector3(0, 1, 0));
    const p = createPlayer({ id, isLocal: false, position: startPos, animalId });
    p.name = name;
    p.loadout.primary = weaponId;
    p.weapon = new WeaponController(WEAPONS[weaponId]);
    p.pendingShots = [];
    p.weapon.fireCallback = () => p.pendingShots.push({});
    this.players.push(p);
    this.humans.set(id, p);
    return p;
  }

  startMatch(mapId, fragTarget = 25, seconds = 300) {
    const map = getMapById(mapId);
    this.activeMap = map;
    // Build colliders from colliderBoxes (headless — no meshes).
    this.colliders.clear();
    for (const b of map.colliderBoxes) {
      this.colliders.addBox(
        new THREE.Vector3(b.min[0], b.min[1], b.min[2]),
        new THREE.Vector3(b.max[0], b.max[1], b.max[2])
      );
    }
    // Reset + (re)spawn existing humans; backfill bots to MAX_PLAYERS.
    const occupied = [];
    for (const p of this.players) {
      if (this.humans.has(p.id)) {
        const sp = this._freeSpawn(occupied); occupied.push(sp);
        p.position.copy(sp); p.velocity.set(0, 0, 0);
        p.health = p.maxHealth; p.alive = true; p.score = 0; p.deaths = 0;
        p.yaw = 0; p.pitch = 0; p.onGround = false;
        p.moveState = { sliding: false, slideTimer: 0, wallrunning: false, wallrunTimer: 0, wallNormal: null };
      }
    }
    // Drop old bots, keep humans.
    this.players = this.players.filter(p => this.humans.has(p.id));
    this.bots = [];
    const botWeapons = Object.keys(WEAPONS);
    while (this.players.length < this.maxPlayers) {
      const sp = this._freeSpawn(occupied); occupied.push(sp);
      const i = this.bots.length;
      const animal = ANIMAL_IDS[i % ANIMAL_IDS.length];
      const weaponId = botWeapons[i % botWeapons.length];
      const bot = createPlayer({ id: 'B' + (i + 1), isLocal: false, position: sp, animalId: animal });
      bot.name = 'Bot ' + (i + 1);
      bot.loadout.primary = weaponId;
      bot.weapon = new WeaponController(WEAPONS[weaponId]);
      bot.pendingShots = [];
      bot.weapon.fireCallback = () => bot.pendingShots.push({});
      const diff = { reactionTime: 0.35, accuracy: 0.65, turnSpeed: 6, aggression: 0.6, detectRange: 50, preferredRange: 16, retreatHp: 20, loseTargetTime: 4 };
      bot.brain = new AIController(bot, diff, map.waypoints);
      this.players.push(bot); this.bots.push(bot);
    }
    this.match = { active: true, timeLeft: seconds, fragTarget, over: false };
    this.respawnTimers.clear();
    this.tickCount = 0;
    this.events.length = 0;
  }

  setPlayerIntent(playerId, intent) { this._intents.set(playerId, intent); }

  handleDisconnect(playerId) {
    // Convert the disconnected human's slot to a bot.
    const p = this.humans.get(playerId);
    if (!p) return;
    this.humans.delete(playerId);
    if (!this.bots.includes(p)) {
      const map = this.activeMap;
      const diff = { reactionTime: 0.35, accuracy: 0.65, turnSpeed: 6, aggression: 0.6, detectRange: 50, preferredRange: 16, retreatHp: 20, loseTargetTime: 4 };
      p.brain = new AIController(p, diff, map ? map.waypoints : []);
      p.name = p.name + ' (bot)';
      this.bots.push(p);
    }
    this.events.push({ k: 'roster' });
  }

  // Number of bot slots available for a late-joining human (maxPlayers minus humans).
  freeSlots() { return this.maxPlayers - this.humans.size; }

  // A late-joining human takes over an existing bot's entity: position, health,
  // score, alive-state, and loadout stay; only control flips to human. Returns
  // the (now-human) entity, or null if there is no bot to take over.
  takeOverBot(name, animalId, weaponId) {
    const bot = this.bots.shift();
    if (!bot) return null;
    bot.name = name;
    if (animalId) bot.animalId = animalId;
    if (weaponId) {
      bot.loadout.primary = weaponId;
      bot.weapon = new WeaponController(WEAPONS[weaponId]);
      bot.weapon.fireCallback = () => bot.pendingShots.push({});
    }
    this.humans.set(bot.id, bot);
    return bot;
  }

  tick(dt) {
    if (!this.match.active) return;
    this.tickCount++;
    // Match timer
    this.match.timeLeft -= dt;
    if (this.match.timeLeft <= 0) { this.match.timeLeft = 0; this._endMatch(); return; }
    // Respawns
    for (const id of [...this.respawnTimers.keys()]) {
      const left = this.respawnTimers.get(id) - dt;
      if (left <= 0) { this.respawnTimers.delete(id); const p = this.players.find(p => p.id === id); if (p) this._respawn(p); }
      else this.respawnTimers.set(id, left);
    }
    // Apply human intents (bots set their own intent in brain.update below).
    for (const p of this.players) {
      if (!p.alive) continue;
      if (this._intents.has(p.id)) {
        const it = this._intents.get(p.id);
        p.intent.forward = it.forward || 0; p.intent.strafe = it.strafe || 0;
        p.intent.jump = !!it.jump; p.intent.sprint = !!it.sprint; p.intent.crouch = !!it.crouch;
        p.intent.firing = !!it.firing; p.intent.reloadRequested = !!it.reloadRequested;
        if (typeof it.yaw === 'number') p.yaw = it.yaw;
        if (typeof it.pitch === 'number') p.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, it.pitch));
      }
    }
    // Movement (humans + bots share tickMovement)
    for (const p of this.players) {
      if (!p.alive) continue;
      tickMovement(p, dt, this.colliders);
    }
    // Bot AI
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const enemies = this.players.filter(p => p !== bot && p.alive);
      bot.brain.update(dt, enemies, this.colliders);
    }
    // Weapons
    for (const p of this.players) {
      if (!p.alive) continue;
      p.weapon.update(dt, p.intent.firing, p.intent.reloadRequested);
    }
    // Resolve pending shots (host-authoritative hit detection)
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const _s of p.pendingShots) this._fireOneShot(p, p.weapon);
      p.pendingShots.length = 0;
    }
  }

  // --- Verbatim hit detection from Game.fireOneShot/fireOnePellet, minus FX ---

  _fireOneShot(shooter, weapon) {
    const def = weapon.def;
    _origin.set(shooter.position.x, shooter.position.y + M.EYE_HEIGHT, shooter.position.z);
    _dir.set(
      -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
       Math.sin(shooter.pitch),
      -Math.cos(shooter.yaw) * Math.cos(shooter.pitch)
    );
    const hSpeed = Math.hypot(shooter.velocity.x, shooter.velocity.z);
    const airborne = !shooter.onGround;
    let spread = def.spread;
    if (def.moveSpreadPenalty) { spread += hSpeed * def.moveSpreadPenalty; if (airborne) spread += def.moveSpreadPenalty * 8; }
    const pellets = def.pellets || 1;
    for (let pi = 0; pi < pellets; pi++) {
      _pelletDir.copy(_dir);
      _pelletDir.x += (Math.random() - 0.5) * spread;
      _pelletDir.y += (Math.random() - 0.5) * spread;
      _pelletDir.z += (Math.random() - 0.5) * spread;
      _pelletDir.normalize();
      this._fireOnePellet(shooter, def, _origin, _pelletDir);
    }
    this.events.push({ k: 'shot', shooter: shooter.id, ox: _origin.x, oy: _origin.y, oz: _origin.z, dx: _dir.x, dy: _dir.y, dz: _dir.z });
  }

  _fireOnePellet(shooter, def, origin, dir) {
    const MAX = 500;
    let best = null;
    for (const other of this.players) {
      if (other === shooter || !other.alive) continue;
      const hit = this._playerRayHit(other, origin, dir, MAX);
      if (hit && (!best || hit.dist < best.dist)) best = { ...hit, target: other };
    }
    const wallHit = this.colliders.raycast(origin, dir, MAX);
    if (wallHit && (!best || wallHit.dist < best.dist)) best = null; // wall blocks — no player hit
    if (!best || !best.target) return;
    let dmg = applyFalloff(def.damage, best.dist, def.falloffStart, def.falloffEnd);
    const headshot = best.head && def.headshotMul && def.headshotMul > 1;
    if (headshot) dmg *= def.headshotMul;
    best.target.health -= dmg;
    this.events.push({ k: 'hit', shooter: shooter.id, victim: best.target.id, dmg: Math.round(dmg), hs: headshot });
    if (best.target.health <= 0) {
      best.target.health = 0; best.target.alive = false; best.target.deaths += 1; shooter.score += 1;
      this.events.push({ k: 'kill', shooter: shooter.id, victim: best.target.id, hs: headshot });
      this.respawnTimers.set(best.target.id, RESPAWN_DELAY);
      if (shooter.score >= this.match.fragTarget) { this._endMatch(); return; }
    }
  }

  // Verbatim playerRayHit from Game.js (capsule-as-AABB slab raycast + head zone).
  _playerRayHit(player, origin, dir, maxDist) {
    const sm = player.sizeMul || 1;
    const r = 0.5 * sm, h = 1.8 * sm;
    _boxMin.set(player.position.x - r, player.position.y, player.position.z - r);
    _boxMax.set(player.position.x + r, player.position.y + h, player.position.z + r);
    _box.set(_boxMin, _boxMax);
    _ray.set(origin, dir);
    const hit = _ray.intersectBox(_box, _hit);
    if (!hit) return null;
    const dist = origin.distanceTo(hit);
    if (dist > maxDist) return null;
    const head = hit.y >= player.position.y + h - 0.3;
    return { dist, head };
  }

  snapshot() {
    const players = this.players.map(p => ({
      id: p.id, x: p.position.x, y: p.position.y, z: p.position.z,
      vx: p.velocity.x, vy: p.velocity.y, vz: p.velocity.z,
      yaw: p.yaw, pitch: p.pitch, hp: Math.round(p.health),
      wpn: p.loadout.primary, ammo: p.weapon.ammo, score: p.score, alive: p.alive,
      animal: p.animalId, name: p.name || p.id, isBot: !this.humans.has(p.id),
    }));
    const events = this.events; this.events = [];
    return { tick: this.tickCount, players, events, timeLeft: this.match.timeLeft };
  }

  ranked() {
    return [...this.players].sort((a, b) => b.score - a.score)
      .map(p => ({ id: p.id, name: p.name, animal: p.animalId, score: p.score, deaths: p.deaths, isBot: !this.humans.has(p.id) }));
  }

  _respawn(player) {
    const others = this.players.filter(p => p !== player && p.alive).map(p => p.position);
    const sp = getRandomSpawn(others, this.activeMap.spawnPoints);
    player.position.copy(sp); player.velocity.set(0, 0, 0);
    player.health = player.maxHealth; player.alive = true;
  }
  _freeSpawn(occupied = []) { return getRandomSpawn(occupied, this.activeMap.spawnPoints); }
  _endMatch() { this.match.active = false; this.match.over = true; this.events.push({ k: 'matchEnd' }); }
}

function applyFalloff(damage, dist, start, end) {
  if (dist <= start) return damage;
  if (dist >= end) return damage * 0.4;
  const t = (dist - start) / (end - start);
  return damage * (1 - 0.6 * t);
}
