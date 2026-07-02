import * as THREE from 'three';

// Hand-placed waypoint graph over the arena. Each node is a position; edges are
// implied by "go to nearest node toward goal" (greedy, no full A* for MVP).
export const WAYPOINTS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(0, 0, -20),
  new THREE.Vector3(20, 0, 0),
  new THREE.Vector3(-20, 0, 0),
  new THREE.Vector3(14, 0, 14),
  new THREE.Vector3(-14, 0, -14),
  new THREE.Vector3(14, 0, -14),
  new THREE.Vector3(-14, 0, 14),
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(28, 3, -28),
  new THREE.Vector3(-28, 3, 28),
];

export class BotNavigation {
  constructor() {
    this.target = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
  }
  pickRandomPatrolPoint() {
    this.target = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)].clone();
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
