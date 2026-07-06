// Token-bucket rate limiter, keyed by IP. `try(ip, nowMs)` consumes one token if
// available and returns true; returns false if the bucket is empty. Buckets
// refill to `perWindow` over each `windowMs`. Call `sweep(nowMs)` periodically
// to drop idle IPs (avoids unbounded memory growth from scanner traffic).
export class RateLimiter {
  constructor({ perWindow = 5, windowMs = 10000 } = {}) {
    this.perWindow = perWindow;
    this.windowMs = windowMs;
    this._buckets = new Map(); // ip -> { tokens, last }
  }
  try(ip, nowMs) {
    let b = this._buckets.get(ip);
    if (!b) { b = { tokens: this.perWindow, last: nowMs }; this._buckets.set(ip, b); }
    // refill proportional to elapsed time
    const elapsed = nowMs - b.last;
    if (elapsed > 0) {
      const refill = (elapsed / this.windowMs) * this.perWindow;
      b.tokens = Math.min(this.perWindow, b.tokens + refill);
      b.last = nowMs;
    }
    if (b.tokens >= 1) { b.tokens -= 1; return true; }
    return false;
  }
  sweep(nowMs) {
    for (const [ip, b] of this._buckets) {
      if (nowMs - b.last > this.windowMs * 2) this._buckets.delete(ip);
    }
  }
}

// Per-IP concurrent connection counter. acquire/release around socket lifecycle.
export class ConnectionCap {
  constructor(maxPerIp) {
    this.maxPerIp = maxPerIp;
    this._counts = new Map(); // ip -> count
  }
  canAcquire(ip) {
    return (this._counts.get(ip) || 0) < this.maxPerIp;
  }
  acquire(ip) {
    this._counts.set(ip, (this._counts.get(ip) || 0) + 1);
  }
  release(ip) {
    const c = (this._counts.get(ip) || 0) - 1;
    if (c <= 0) this._counts.delete(ip);
    else this._counts.set(ip, c);
  }
}
