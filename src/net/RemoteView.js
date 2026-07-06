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

  // Call each render frame: lerp each remote view between the two snapshots
  // bracketing (now - renderDelay). The local player is skipped.
  update(localId, realDt) {
    if (this.snapshots.length < 2) return;
    const now = performance.now() / 1000;
    const target = now - this.renderDelay;
    // Find the pair of snapshots that bracket the render-delay target time.
    // Snapshots are pushed in order, so walk from newest backward. `a` is the
    // snapshot at-or-before `target`, `b` is the one after it; we then lerp
    // a->b by the fractional position of `target` between them. This is what
    // makes remote players move SMOOTHLY instead of snapping each snapshot.
    let a = null, b = null;
    for (let i = this.snapshots.length - 1; i > 0; i--) {
      if (this.snapshots[i - 1].t <= target) { a = this.snapshots[i - 1]; b = this.snapshots[i]; break; }
    }
    if (!a) {
      // Target is older than our oldest buffered snapshot (big lag spike / stall):
      // fall back to the two newest and clamp to the start so we don't extrapolate.
      a = this.snapshots[this.snapshots.length - 2];
      b = this.snapshots[this.snapshots.length - 1];
    }
    const span = Math.max(0.001, b.t - a.t);
    const alpha = Math.max(0, Math.min(1, (target - a.t) / span));
    for (const p of b.players) {
      if (p.id === localId) continue;
      const v = this.views.get(p.id);
      if (!v) continue;
      const pa = a.players.find(q => q.id === p.id);
      if (!pa) { // no prior — snap
        v.setPosition(p.x, p.y, p.z);
        v.update(realDt, Math.hypot(p.vx, p.vz), p.yaw, p.pitch);
      } else {
        this._tmpA.set(pa.x, pa.y, pa.z); this._tmpB.set(p.x, p.y, p.z);
        this._tmpA.lerp(this._tmpB, alpha);
        v.setPosition(this._tmpA.x, this._tmpA.y, this._tmpA.z);
        const speed = Math.hypot(p.vx, p.vz);
        v.update(realDt, speed, this._lerpAngle(pa.yaw, p.yaw, alpha), this._lerpAngle(pa.pitch, p.pitch, alpha));
      }
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
