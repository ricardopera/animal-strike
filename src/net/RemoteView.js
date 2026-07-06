import * as THREE from 'three';
import { CharacterView } from '../player/CharacterView.js';

// Renders remote players by interpolating between the two latest snapshots
// (~100ms behind real time) for smooth motion. Owns CharacterView instances keyed
// by player id. NEVER simulates — pure interpolation of received authoritative state.
export class RemoteView {
  constructor(scene) {
    this.scene = scene;
    this.views = new Map();    // id -> CharacterView
    this.snapshots = [];       // ring of recent snapshots { t, players, events }
    this.renderDelay = 0.1;    // render 100ms behind to smooth jitter
    // Interpolated state of the LOCAL player, read by Game's camera/HUD each
    // frame. Under pure interpolation, the local player has no local entity —
    // its position/yaw/hp come from the snapshot buffer via this object.
    this.localState = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, alive: true, ammo: 30 };
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
  }

  // Push a received snapshot. Also reconciles the view roster (create/prune).
  pushSnapshot(snap) {
    this.snapshots.push({ t: performance.now() / 1000, players: snap.players, events: snap.events });
    if (this.snapshots.length > 6) this.snapshots.shift();
    this._syncRoster(snap.players);
  }

  // Ensure a CharacterView exists for each remote player; prune gone ones.
  // `localId` is skipped (Game renders the local player itself).
  _syncRoster(players) {
    const seen = new Set(players.map(p => p.id));
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.dispose(); this.views.delete(id); }
    }
    for (const p of players) {
      if (this.views.has(p.id)) continue;
      const v = new CharacterView(this.scene);
      v.setAnimal(p.animal);
      v.setWeapon(p.wpn);
      this.views.set(p.id, v);
    }
  }

  // Call each render frame: lerp each view between the two snapshots bracketing
  // (now - renderDelay). Under pure snapshot interpolation the LOCAL player is
  // interpolated too (no client-side prediction) — the camera follows the
  // interpolated position via localState. localId is still passed so the local
  // player's CharacterView can be hidden (first-person camera).
  update(localId, realDt) {
    if (this.snapshots.length < 2) return;
    const now = performance.now() / 1000;
    const target = now - this.renderDelay;
    let a = null, b = null;
    for (let i = this.snapshots.length - 1; i > 0; i--) {
      if (this.snapshots[i - 1].t <= target) { a = this.snapshots[i - 1]; b = this.snapshots[i]; break; }
    }
    if (!a) {
      a = this.snapshots[this.snapshots.length - 2];
      b = this.snapshots[this.snapshots.length - 1];
    }
    const span = Math.max(0.001, b.t - a.t);
    const alpha = Math.max(0, Math.min(1, (target - a.t) / span));
    for (const p of b.players) {
      // Interpolate ALL players including local. The local player's CharacterView
      // is hidden (first-person) but its position/yaw drive the camera.
      const pa = a.players.find(q => q.id === p.id);
      this._tmpA.set(pa ? pa.x : p.x, pa ? pa.y : p.y, pa ? pa.z : p.z);
      this._tmpB.set(p.x, p.y, p.z);
      this._tmpA.lerp(this._tmpB, alpha);

      // Track the local player's interpolated state for the camera/HUD.
      if (p.id === localId) {
        this.localState.x = this._tmpA.x;
        this.localState.y = this._tmpA.y;
        this.localState.z = this._tmpA.z;
        this.localState.vx = p.vx; this.localState.vy = p.vy; this.localState.vz = p.vz;
        this.localState.yaw = pa ? this._lerpAngle(pa.yaw, p.yaw, alpha) : p.yaw;
        this.localState.pitch = pa ? this._lerpAngle(pa.pitch, p.pitch, alpha) : p.pitch;
        this.localState.hp = p.hp;
        this.localState.alive = p.alive;
        this.localState.ammo = p.ammo;
        // Don't render a CharacterView for the local player (first-person).
        continue;
      }

      const v = this.views.get(p.id);
      if (!v) continue;
      v.setPosition(this._tmpA.x, this._tmpA.y, this._tmpA.z);
      const speed = Math.hypot(p.vx, p.vz);
      v.update(realDt, speed, pa ? this._lerpAngle(pa.yaw, p.yaw, alpha) : p.yaw, pa ? this._lerpAngle(pa.pitch, p.pitch, alpha) : p.pitch);
      v.setVisible(p.alive);
    }
  }

  // Drain + return events from all buffered snapshots not yet consumed (caller
  // processes FX from them). Returns [] once drained.
  drainEvents() {
    const out = [];
    for (const s of this.snapshots) { if (s.events && s.events.length) out.push(...s.events); s.events = []; }
    return out;
  }

  _lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  dispose() { for (const v of this.views.values()) v.dispose(); this.views.clear(); this.snapshots.length = 0; }
}
