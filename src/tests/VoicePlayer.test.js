import { describe, it, expect } from 'vitest';
import { VoicePlayer, pitchForAnimal } from '../audio/VoicePlayer.js';

describe('VoicePlayer per-animal API', () => {
  it('exposes playAnimal and hasAnimal methods', () => {
    const v = new VoicePlayer();
    expect(typeof v.playAnimal).toBe('function');
    expect(typeof v.hasAnimal).toBe('function');
  });

  it('playAnimal is a no-op before preload (ready=false)', () => {
    const v = new VoicePlayer();
    expect(() => v.playAnimal('FOX', 'kill')).not.toThrow();
  });

  it('playAnimal respects the muted flag', () => {
    const v = new VoicePlayer();
    v.ready = true;
    v.muted = true;
    expect(() => v.playAnimal('FOX', 'kill')).not.toThrow(); // no-op, no throw
  });

  it('hasAnimal returns false for an unloaded clip', () => {
    const v = new VoicePlayer();
    expect(v.hasAnimal('FOX', 'kill')).toBe(false);
  });

  it('hasAnimal returns true once a buffer is registered', () => {
    const v = new VoicePlayer();
    v.buffers['FOX_kill'] = {}; // truthy stand-in for an AudioBuffer
    v.ready = true;
    expect(v.hasAnimal('FOX', 'kill')).toBe(true);
  });
});

describe('pitchForAnimal (synth fallback pitch)', () => {
  it('returns 1.0 for unknown/missing config', () => {
    expect(pitchForAnimal('NOPE')).toBe(1.0);
    expect(pitchForAnimal('NOPE', {})).toBe(1.0);
  });

  it('maps faster animals to higher pitch, clamped to [0.8, 1.3]', () => {
    // formula: 0.6 + speedMul * 0.5, clamped
    expect(pitchForAnimal('BUNNY', { BUNNY: { speedMul: 1.2 } })).toBeGreaterThan(1.0); // 1.2
    expect(pitchForAnimal('OWL', { OWL: { speedMul: 1.0 } })).toBeCloseTo(1.1, 5); // 1.1
    expect(pitchForAnimal('X', { X: { speedMul: 5 } })).toBeLessThanOrEqual(1.3);   // clamped high
    expect(pitchForAnimal('X', { X: { speedMul: 0 } })).toBeGreaterThanOrEqual(0.8); // clamped low
  });
});
