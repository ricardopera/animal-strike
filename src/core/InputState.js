// Produces a per-frame intent snapshot from keyboard + pointer-locked mouse.
// Sensitivity is in radians per pixel of mouse movement.
export class InputState {
  constructor(canvas, { sensitivity = 0.0022, invertY = false } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.invertY = invertY;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.firing = false;
    this.reloadRequested = false;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reloadRequested = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.pointerLocked && e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  // Consume the accumulated mouse delta and reset it.
  consumeLook() {
    const dx = this.mouseDX * this.sensitivity;
    const dy = this.mouseDY * this.sensitivity * (this.invertY ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Build the intent object the movement/weapon controllers read.
  buildIntent() {
    return {
      forward: this.isDown('KeyW') ? 1 : this.isDown('KeyS') ? -1 : 0,
      strafe: this.isDown('KeyD') ? 1 : this.isDown('KeyA') ? -1 : 0,
      jump: this.isDown('Space'),
      sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      crouch: this.isDown('ControlLeft') || this.isDown('KeyC'),
      firing: this.firing,
      reloadRequested: this.reloadRequested,
    };
  }

  consumeReloadRequest() {
    const r = this.reloadRequested;
    this.reloadRequested = false;
    return r;
  }
}
