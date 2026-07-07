import { describe, it, expect } from 'vitest';
import { MapDefinition } from '../world/MapDefinition.js';

function baseConfig() {
  return {
    id: 'killY-test',
    name: 'KillY Test',
    desc: 'a test map for killY validation',
    palette: { sky: ['#000', '#111', '#222', '#333'], fog: 0xaaaaaa, fogDensity: 0.005 },
    build: () => {},
    spawnPoints: [{ x: 1 }],
    waypoints: [{ x: 1 }],
    colliderBoxes: [{ min: [-1, -1, -1], max: [1, 1, 1] }],
  };
}

describe('MapDefinition optional killY field', () => {
  it('does NOT throw and leaves killY undefined when omitted', () => {
    const md = new MapDefinition(baseConfig());
    expect(md.killY).toBeUndefined();
  });

  it('accepts a finite number killY', () => {
    const cfg = baseConfig();
    cfg.killY = 12;
    const md = new MapDefinition(cfg);
    expect(md.killY).toBe(12);
  });

  it('throws when killY is present but not a finite number', () => {
    const cfg = baseConfig();
    cfg.killY = 'twelve';
    expect(() => new MapDefinition(cfg)).toThrow();
  });

  it('throws when killY is NaN', () => {
    const cfg = baseConfig();
    cfg.killY = NaN;
    expect(() => new MapDefinition(cfg)).toThrow();
  });
});
