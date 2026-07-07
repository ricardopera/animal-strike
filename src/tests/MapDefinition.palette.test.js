import { describe, it, expect } from 'vitest';
import { MapDefinition } from '../world/MapDefinition.js';

// Minimal valid base config (required fields only) copied from the contract test
// pattern. Each case clones this and mutates the optional palette field under test.
function baseConfig() {
  return {
    id: 'palette-test',
    name: 'Palette Test',
    desc: 'a test map for palette validation',
    palette: {
      sky: ['#000', '#111', '#222', '#333'],
      fog: 0xaaaaaa,
      fogDensity: 0.005,
    },
    build: () => {},
    spawnPoints: [{ x: 1 }],
    waypoints: [{ x: 1 }],
    colliderBoxes: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
  };
}

describe('MapDefinition optional palette fields', () => {
  it('does NOT throw when hemisphere/sunColor/sunIntensity are all valid', () => {
    const cfg = baseConfig();
    cfg.palette.hemisphere = [0xbfd8ff, 0x4a4030];
    cfg.palette.sunColor = 0xfff2d6;
    cfg.palette.sunIntensity = 2.2;
    expect(() => new MapDefinition(cfg)).not.toThrow();
  });

  it('throws when hemisphere is not a [sky,ground] length-2 array of hex ints', () => {
    const cfg = baseConfig();
    cfg.palette.hemisphere = [0xbfd8ff, '#4a4030']; // second element is a string, not a hex int
    expect(() => new MapDefinition(cfg)).toThrow();
  });

  it('throws when sunColor is present but not a number', () => {
    const cfg = baseConfig();
    cfg.palette.sunColor = '#fff2d6'; // a string, not a hex int
    expect(() => new MapDefinition(cfg)).toThrow();
  });

  it('throws when sunIntensity is present but negative', () => {
    const cfg = baseConfig();
    cfg.palette.sunIntensity = -1;
    expect(() => new MapDefinition(cfg)).toThrow();
  });
});
