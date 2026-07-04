import { describe, it, expect } from 'vitest';
import { MapDefinition } from '../world/MapDefinition.js';

describe('MapDefinition', () => {
  it('constructs from a config object and exposes all fields', () => {
    const build = () => {};
    const md = new MapDefinition({
      id: 'test',
      name: 'Test',
      desc: 'a test map',
      palette: { sky: ['#000','#111','#222','#333'], fog: 0xaaaaaa, fogDensity: 0.005 },
      build,
      spawnPoints: [{ x: 1 }, { x: 2 }],
      waypoints: [{ x: 1 }],
    });
    expect(md.id).toBe('test');
    expect(md.name).toBe('Test');
    expect(md.desc).toBe('a test map');
    expect(md.palette.sky).toHaveLength(4);
    expect(md.build).toBe(build);
    expect(md.spawnPoints).toHaveLength(2);
    expect(md.waypoints).toHaveLength(1);
  });

  it('throws if required fields are missing', () => {
    expect(() => new MapDefinition({ id: 'x', name: 'X' })).toThrow();
  });
});
