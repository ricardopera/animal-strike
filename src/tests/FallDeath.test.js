import { describe, it, expect } from 'vitest';
import { checkFallDeath } from '../world/FallDeath.js';

describe('checkFallDeath', () => {
  // A minimal stand-in for a player: only .alive and .position.y are read.
  const livePlayerAt = (y) => ({ alive: true, position: { y } });
  const deadPlayerAt = (y) => ({ alive: false, position: { y } });
  const map = (killY) => ({ killY });

  it('returns false when the map has no killY (flat-ground maps)', () => {
    expect(checkFallDeath(livePlayerAt(-100), map(undefined))).toBe(false);
    expect(checkFallDeath(livePlayerAt(-100), map(null))).toBe(false);
  });

  it('returns true when a live player is below killY', () => {
    expect(checkFallDeath(livePlayerAt(11), map(12))).toBe(true);
  });

  it('returns false when a live player is exactly at or above killY', () => {
    expect(checkFallDeath(livePlayerAt(12), map(12))).toBe(false);
    expect(checkFallDeath(livePlayerAt(13), map(12))).toBe(false);
  });

  it('returns false for an already-dead player even below killY', () => {
    expect(checkFallDeath(deadPlayerAt(5), map(12))).toBe(false);
  });
});
