import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MusicPlayer, MOODS } from '../audio/MusicPlayer.js';

// The source uses `window.AudioContext`; in the node test env there is no
// `window`, so alias it to globalThis once for the whole file.
const _hadWindow = 'window' in globalThis;
beforeEach(() => { if (!_hadWindow) globalThis.window = globalThis; });
afterEach(() => { if (!_hadWindow) delete globalThis.window; });

// The 12 tracks shipped under public/audio/music_extras/ that this task wires in.
const MUSIC_EXTRAS_FILES = [
  'combat_anthem_vocal.mp3',
  'combat_loop_2.mp3',
  'combat_loop_3.mp3',
  'defeat_song_vocal.mp3',
  'defeat_theme.mp3',
  'hunt_theme_vocal.mp3',
  'last_stand_vocal.mp3',
  'menu_loop_2.mp3',
  'menu_theme_vocal.mp3',
  'tension_suspense.mp3',
  'victory_anthem.mp3',
  'victory_song_vocal.mp3',
];

describe('MusicPlayer mood registry', () => {
  it('exposes the 5 required moods', () => {
    expect(Object.keys(MOODS).sort()).toEqual(
      ['clutch', 'combat', 'defeat', 'menu', 'victory'],
    );
  });

  it('maps each mood to a non-empty list of track URLs', () => {
    for (const [mood, urls] of Object.entries(MOODS)) {
      expect(Array.isArray(urls)).toBe(true);
      expect(urls.length).toBeGreaterThan(0);
      for (const u of urls) expect(typeof u).toBe('string');
    }
  });

  it('combat has >=3 tracks and menu has >=2', () => {
    expect(MOODS.combat.length).toBeGreaterThanOrEqual(3);
    expect(MOODS.menu.length).toBeGreaterThanOrEqual(2);
  });

  it('references all 12 music_extras files somewhere in the registry', () => {
    // Build the set of basenames across every mood's URLs.
    const basenames = new Set();
    for (const urls of Object.values(MOODS)) {
      for (const u of urls) {
        basenames.add(u.slice(u.lastIndexOf('/') + 1));
      }
    }
    for (const f of MUSIC_EXTRAS_FILES) {
      expect(basenames.has(f), `missing ${f} from registry`).toBe(true);
    }
  });

  it('combat_anthem_vocal.mp3 is shared between combat and clutch', () => {
    const combatAnthem = MOODS.combat.find((u) => u.endsWith('combat_anthem_vocal.mp3'));
    const clutchAnthem = MOODS.clutch.find((u) => u.endsWith('combat_anthem_vocal.mp3'));
    expect(combatAnthem).toBeTruthy();
    expect(clutchAnthem).toBeTruthy();
    expect(combatAnthem).toBe(clutchAnthem); // exact same resolved URL
  });
});

// --- preload dedup test: requires a stubbed AudioContext + fetch ---
function makeStubAudioContext() {
  return {
    currentTime: 0,
    destination: {},
    resume: () => {},
    decodeAudioData: async () => ({ __buffer: true }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => {},
    }),
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      connect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createOscillator: () => ({
      type: '',
      frequency: { value: 0 },
      detune: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBiquadFilter: () => ({
      type: '',
      frequency: { value: 0 },
      connect: () => {},
    }),
  };
}

describe('MusicPlayer preload dedup & resilience', () => {
  let origAudioContext;
  let origFetch;

  beforeEach(() => {
    origAudioContext = globalThis.AudioContext;
    origFetch = globalThis.fetch;
    globalThis.AudioContext = function () { return makeStubAudioContext(); };
  });

  afterEach(() => {
    globalThis.AudioContext = origAudioContext;
    globalThis.fetch = origFetch;
  });

  it('fetches combat_anthem_vocal.mp3 exactly once (dedup across combat+clutch)', async () => {
    const fetchCalls = [];
    globalThis.fetch = vi.fn(async (url) => {
      fetchCalls.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });

    const m = new MusicPlayer();
    await m.preload();

    const anthemCalls = fetchCalls.filter((u) => u.endsWith('combat_anthem_vocal.mp3'));
    expect(anthemCalls.length).toBe(1);
    // And no URL is fetched more than once overall.
    const dupes = fetchCalls.filter((u, i) => fetchCalls.indexOf(u) !== i);
    expect(dupes.length).toBe(0);
  });

  it('falls back gracefully (null buffer) when a track fails to load', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));

    const m = new MusicPlayer();
    await expect(m.preload()).resolves.toBeUndefined();
    // Every distinct URL should be present as a null (synth-fallback marker).
    const urls = Object.values(MOODS).flat();
    const unique = [...new Set(urls)];
    for (const u of unique) expect(m.buffers[u]).toBeNull();
  });
});

// --- play() smoke/contract tests ---
describe('MusicPlayer play() contract', () => {
  let origAudioContext;
  let origFetch;

  beforeEach(() => {
    origAudioContext = globalThis.AudioContext;
    origFetch = globalThis.fetch;
    globalThis.AudioContext = function () { return makeStubAudioContext(); };
  });

  afterEach(() => {
    globalThis.AudioContext = origAudioContext;
    globalThis.fetch = origFetch;
  });

  it("play('victory') does not throw (smoke test with stubbed AudioContext)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const m = new MusicPlayer();
    await m.preload();
    expect(() => m.play('victory')).not.toThrow();
    expect(m.currentId).toBe('victory');
    expect(m.started).toBe(true);
  });

  it('repeated play() of the same mood rotates tracks (round-robin)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const m = new MusicPlayer();
    await m.preload();

    // victory has 2 tracks; play() + stop() + play() should pick the other one.
    m.play('victory');
    const first = m.currentUrl;
    m.stop();
    m.play('victory');
    const second = m.currentUrl;
    expect(first).not.toBe(second);
    expect(MOODS.victory).toContain(first);
    expect(MOODS.victory).toContain(second);
  });

  it('play(sameMood) while active is a no-op', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const m = new MusicPlayer();
    await m.preload();
    m.play('menu');
    const firstUrl = m.currentUrl;
    m.play('menu'); // should not switch
    expect(m.currentUrl).toBe(firstUrl);
  });

  it('play(menu) and play(combat) remain supported (backward compat)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const m = new MusicPlayer();
    await m.preload();
    expect(() => m.play('menu')).not.toThrow();
    expect(m.currentId).toBe('menu');
    expect(() => m.play('combat')).not.toThrow();
    expect(m.currentId).toBe('combat');
  });
});
