const MAX_TICKS_PER_UPDATE = 5;

export class FixedTimestep {
  constructor(step) {
    this.step = step;
    this.accumulator = 0;
  }
  update(realDt, fixedCallback) {
    this.accumulator += realDt;
    let n = 0;
    while (this.accumulator >= this.step && n < MAX_TICKS_PER_UPDATE) {
      fixedCallback(this.step);
      this.accumulator -= this.step;
      n++;
    }
    // discard excess to avoid unbounded growth after a stall
    if (this.accumulator > this.step * MAX_TICKS_PER_UPDATE) {
      this.accumulator = 0;
    }
  }
}
