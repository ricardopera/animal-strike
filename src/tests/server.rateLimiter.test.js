import { describe, it, expect } from 'vitest';
import { RateLimiter, ConnectionCap } from '../../server/rateLimiter.js';

describe('RateLimiter (token bucket per IP)', () => {
  it('allows up to perWindow in a burst then refills over time', () => {
    const lim = new RateLimiter({ perWindow: 3, windowMs: 1000 });
    const ip = '1.2.3.4';
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(false); // bucket empty
  });

  it('refills after the window elapses', () => {
    const lim = new RateLimiter({ perWindow: 2, windowMs: 1000 });
    const ip = '9.9.9.9';
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(false);
    expect(lim.try(ip, 1001)).toBe(true); // refilled
  });

  it('tracks IPs independently', () => {
    const lim = new RateLimiter({ perWindow: 1, windowMs: 1000 });
    expect(lim.try('a', 0)).toBe(true);
    expect(lim.try('b', 0)).toBe(true);
    expect(lim.try('a', 0)).toBe(false);
    expect(lim.try('b', 0)).toBe(false);
  });

  it('forgets idle IPs to avoid unbounded growth', () => {
    const lim = new RateLimiter({ perWindow: 1, windowMs: 1000 });
    lim.try('old', 0);
    lim.sweep(5000); // well past window
    // 'old' should have been dropped; a fresh attempt starts a new bucket
    expect(lim.try('old', 5000)).toBe(true);
  });
});

describe('ConnectionCap (per-IP concurrent connections)', () => {
  it('allows up to the cap per IP, rejects excess', () => {
    const cap = new ConnectionCap(3);
    expect(cap.canAcquire('1.1.1.1')).toBe(true);
    cap.acquire('1.1.1.1');
    cap.acquire('1.1.1.1');
    cap.acquire('1.1.1.1');
    expect(cap.canAcquire('1.1.1.1')).toBe(false); // 4th rejected
    expect(cap.canAcquire('2.2.2.2')).toBe(true);  // different IP unaffected
  });
  it('release frees a slot', () => {
    const cap = new ConnectionCap(2);
    cap.acquire('x'); cap.acquire('x');
    expect(cap.canAcquire('x')).toBe(false);
    cap.release('x');
    expect(cap.canAcquire('x')).toBe(true);
  });
  it('release is idempotent and ignores unknown IPs', () => {
    const cap = new ConnectionCap(2);
    cap.release('never'); // no throw
    cap.release('never');
    expect(cap.canAcquire('never')).toBe(true);
  });
});
