import { describe, it, expect } from 'vitest';
import { MAPS, getMapById } from '../world/Maps.js';

describe('Maps registry', () => {
  it('has exactly 3 maps in the expected order', () => {
    expect(MAPS).toHaveLength(3);
    expect(MAPS.map(m => m.id)).toEqual(['plaza', 'foundry', 'dustbowl']);
  });

  it('MAPS[0] is the default (plaza)', () => {
    expect(MAPS[0].id).toBe('plaza');
  });

  it('getMapById round-trips every map', () => {
    for (const m of MAPS) {
      expect(getMapById(m.id)).toBe(m);
    }
  });

  it('getMapById returns undefined for unknown id', () => {
    expect(getMapById('nope')).toBeUndefined();
  });

  it('getMapById defaults to plaza for undefined', () => {
    expect(getMapById(undefined).id).toBe('plaza');
  });
});
