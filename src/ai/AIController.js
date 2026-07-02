import * as THREE from 'three';
import { BotNavigation } from './BotNavigation.js';
import { computeAimPoint, turnToward, selectTarget } from './BotAim.js';

const STATES = { PATROL: 'PATROL', CHASE: 'CHASE', ENGAGE: 'ENGAGE', RETREAT: 'RETREAT' };

export class AIController {
  constructor(bot, difficulty) {
    this.bot = bot;
    this.diff = difficulty;
    this.state = STATES.PATROL;
    this.nav = new BotNavigation();
    this.nav.pickRandomPatrolPoint();
    this.target = null;
    this.lastSeenTime = 0;
    this.reactionTimer = 0;
  }
  update(dt, enemies, colliderStore) {
    const bot = this.bot;
    const sensed = selectTarget(bot, enemies, colliderStore);
    const now = performance.now() / 1000;
    if (sensed) {
      this.target = sensed.player;
      this.lastSeenTime = now;
    }

    // FSM transitions
    const hasRecentSight = now - this.lastSeenTime < this.diff.loseTargetTime;
    switch (this.state) {
      case STATES.PATROL:
        if (sensed && sensed.dist < this.diff.detectRange) { this.state = STATES.CHASE; this.reactionTimer = this.diff.reactionTime; }
        break;
      case STATES.CHASE:
        if (!hasRecentSight) { this.state = STATES.PATROL; this.nav.pickRandomPatrolPoint(); }
        else if (sensed && sensed.dist < this.diff.preferredRange) { this.state = STATES.ENGAGE; this.reactionTimer = this.diff.reactionTime; }
        break;
      case STATES.ENGAGE:
        if (bot.health < this.diff.retreatHp) { this.state = STATES.RETREAT; this.nav.pickRandomPatrolPoint(); }
        else if (!sensed || sensed.dist > this.diff.preferredRange + 6) { this.state = STATES.CHASE; }
        break;
      case STATES.RETREAT:
        if (bot.health > this.diff.retreatHp + 25 && !sensed) { this.state = STATES.PATROL; }
        break;
    }

    // Reaction timer (tuning in)
    if (this.reactionTimer > 0) this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    const reactionProgress = 1 - (this.reactionTimer / Math.max(0.0001, this.diff.reactionTime));

    // Aim + intent
    let wish = { x: 0, z: 0, jump: false };
    let firing = false;
    if (this.target && this.target.alive && hasRecentSight) {
      const targetPos = [this.target.position.x, this.target.position.y + 1.4, this.target.position.z];
      const aimPoint = computeAimPoint({ pos: targetPos }, {
        accuracy: this.diff.accuracy,
        reactionProgress,
        errorRadius: 1.5,
      });
      const from = [bot.position.x, bot.position.y + 1.5, bot.position.z];
      const turned = turnToward({ yaw: bot.yaw, pitch: bot.pitch }, aimPoint, from, this.diff.turnSpeed, dt);
      bot.yaw = turned.yaw; bot.pitch = turned.pitch;

      if (this.state === STATES.ENGAGE && this.reactionTimer <= 0) {
        firing = true;
      }
      // movement: chase or strafe
      if (this.state === STATES.CHASE) {
        this.nav.setChaseTarget(this.target.position);
        wish = this.nav.computeWishdir(bot, dt);
      } else if (this.state === STATES.ENGAGE) {
        // strafe sideways
        const strafeDir = Math.sin(now * 2) > 0 ? 1 : -1;
        wish = { x: Math.cos(bot.yaw) * strafeDir, z: -Math.sin(bot.yaw) * strafeDir, jump: false };
      } else if (this.state === STATES.RETREAT) {
        // move away from target
        const away = new THREE.Vector3().subVectors(bot.position, this.target.position); away.y = 0; away.normalize();
        this.nav.setChaseTarget(bot.position.clone().add(away.multiplyScalar(10)));
        wish = this.nav.computeWishdir(bot, dt);
      }
    } else {
      // patrol
      wish = this.nav.computeWishdir(bot, dt);
      // look toward movement
      const desiredYaw = Math.atan2(wish.x, -wish.z) + Math.PI;
      bot.yaw = approachAngle(bot.yaw, desiredYaw, this.diff.turnSpeed * dt);
    }

    // Build intent for the movement + weapon systems
    // Convert world wishdir to body-space intent using yaw
    const sinY = Math.sin(bot.yaw), cosY = Math.cos(bot.yaw);
    // forward axis = (-sin, -cos), right axis = (cos, -sin)
    const fwdX = -sinY, fwdZ = -cosY;
    const rightX = cosY, rightZ = -sinY;
    const forwardAmt = wish.x * fwdX + wish.z * fwdZ;
    const strafeAmt = wish.x * rightX + wish.z * rightZ;

    bot.intent = {
      forward: clamp11(forwardAmt),
      strafe: clamp11(strafeAmt),
      jump: wish.jump,
      sprint: this.state === STATES.CHASE,
      crouch: false,
      firing,
      reloadRequested: false,
    };
  }
}

function clamp11(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
function approachAngle(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
