import * as THREE from 'three';
import { FixedTimestep } from './FixedTimestep.js';
import { InputState } from './InputState.js';
import { ArenaBuilder } from '../world/ArenaBuilder.js';
import { ColliderStore } from '../world/ColliderStore.js';
import { createPlayer, eyePosition } from '../player/Player.js';
import { tickMovement } from '../player/MovementController.js';
import { MOVEMENT as M } from '../config/Movement.js';

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

    // Sim
    this.fixed.update(realDt, (dt) => {
      tickMovement(this.player, dt, this.colliders);
    });

    // Render: position camera at eye, oriented by yaw/pitch
    const eye = eyePosition(this.player);
    this.camera.position.copy(eye);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.player.yaw;
    this.camera.rotation.x = this.player.pitch;

    this.renderer.render(this.scene, this.camera);
  }
}
