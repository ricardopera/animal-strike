import * as THREE from 'three';

// Waypoint navigation over a given waypoint graph (the active map's waypoints).
// Each node is a position; edges are implied by "go to nearest node toward goal"
// (greedy, no full A* for MVP). The waypoint set is passed in by the caller
// (Game.js), sourced from the active MapDefinition — NOT a module global.
export class BotNavigation {
  constructor(waypoints) {
    this.waypoints = waypoints && waypoints.length ? waypoints : [new THREE.Vector3(0, 0, 0)];
    this.target = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.pickRandomPatrolPoint();
  }
  pickRandomPatrolPoint() {
    this.target = this.waypoints[Math.floor(Math.random() * this.waypoints.length)].clone();
  }
  setChaseTarget(point) {
    this.target = point.clone();
  }
  // Returns a wishdir (normalized) toward current target. Falls back to a random
  // waypoint if reached. Jumps if stuck.
  computeWishdir(bot, dt) {
    if (!this.target || bot.position.distanceTo(this.target) < 1.5) {
      this.pickRandomPatrolPoint();
    }
    const dir = new THREE.Vector3().subVectors(this.target, bot.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) return { x: 0, z: 0, jump: false };
    dir.normalize();
    // stuck detection
    const moved = bot.position.distanceTo(this.lastPos);
    this.lastPos.copy(bot.position);
    if (moved < 0.02) this.stuckTimer += dt; else this.stuckTimer = 0;
    const jump = this.stuckTimer > 0.4;
    if (jump) this.stuckTimer = 0;
    return { x: dir.x, z: dir.z, jump };
  }
}
