import { describe, it, expect } from 'vitest';
import { MAPS } from '../world/Maps.js';

// The killY fall-death plane is opt-in. Every pre-Canopy map must leave it
// undefined so the feature changes nothing for them. This test locks that
// guarantee: if someone later adds killY to an existing flat-ground map by
// accident, this fails loudly.
describe('pre-Canopy maps leave killY unset (backward compat)', () => {
  const preCanopy = MAPS.filter(m => m.id !== 'canopy');

  it('every map except canopy has killY === undefined', () => {
    expect(preCanopy.length).toBeGreaterThan(0);
    for (const m of preCanopy) {
      expect(m.killY, `map "${m.id}" must not set killY`).toBeUndefined();
    }
  });
});
