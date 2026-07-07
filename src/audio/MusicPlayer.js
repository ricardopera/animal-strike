// Looping music with crossfade. Loads generated tracks from /audio/music/* via
// AudioBuffer; falls back to a synthesized WebAudio pad loop if a file is missing
// or fails to load, so the game is never silent (resilience per design spec).
import { resumeAudio } from './Audio.js';
import { asset } from '../config/paths.js';

let ctx = null;
function ensure() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Mood -> list of track URLs. Each mood maps to one or more tracks; on play()
// a single track is chosen (round-robin per mood) so consecutive calls to the
// same mood vary the music. URLs are shared across moods where intentional
// (e.g. combat_anthem_vocal.mp3 appears in both `combat` and `clutch`); preload()
// dedupes by URL so the buffer is fetched/decoded only once and shared.
// Exported for tests/inspection (the mood->URLs registry).
export const MOODS = {
  menu: [
    asset('/audio/music/menu_loop.mp3'),
    asset('/audio/music/music_extras/menu_loop_2.mp3'),
    asset('/audio/music/music_extras/menu_theme_vocal.mp3'),
  ],
  combat: [
    asset('/audio/music/combat_loop.mp3'),
    asset('/audio/music/music_extras/combat_loop_2.mp3'),
    asset('/audio/music/music_extras/combat_loop_3.mp3'),
    asset('/audio/music/music_extras/tension_suspense.mp3'),
    asset('/audio/music/music_extras/hunt_theme_vocal.mp3'),
    asset('/audio/music/music_extras/combat_anthem_vocal.mp3'),
  ],
  victory: [
    asset('/audio/music/music_extras/victory_anthem.mp3'),
    asset('/audio/music/music_extras/victory_song_vocal.mp3'),
  ],
  defeat: [
    asset('/audio/music/music_extras/defeat_theme.mp3'),
    asset('/audio/music/music_extras/defeat_song_vocal.mp3'),
  ],
  clutch: [
    asset('/audio/music/music_extras/last_stand_vocal.mp3'),
    asset('/audio/music/music_extras/combat_anthem_vocal.mp3'),
  ],
};

// Flatten every URL across all moods, de-duplicated (preserves first-seen order).
function allTrackUrls() {
  const seen = new Set();
  const out = [];
  for (const urls of Object.values(MOODS)) {
    for (const u of urls) {
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
  }
  return out;
}

export class MusicPlayer {
  constructor() {
    this.buffers = {};      // url -> AudioBuffer (or null if unloaded/failed -> synth fallback)
    this.currentSource = null;
    this.currentGain = null;
    this.currentId = null;  // the active MOOD id (so play(sameMood) is a no-op)
    this.currentUrl = null; // the URL of the track currently playing
    this.targetVolume = 0.35;
    this.muted = false;
    this.started = false;
    this._moodIndex = {};   // mood id -> round-robin cursor
  }

  async preload() {
    // Load every distinct URL exactly once (dedup), cache by URL.
    await Promise.all(allTrackUrls().map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        this.buffers[url] = await ensure().decodeAudioData(arr);
      } catch (e) {
        console.warn(`[MusicPlayer] could not load ${url}; using synth fallback:`, e.message);
        this.buffers[url] = null; // marker -> synth fallback
      }
    }));
  }

  setMuted(m) {
    this.muted = m;
    if (this.currentGain && this.currentId) {
      const c = ensure();
      this.currentGain.gain.setTargetAtTime(m ? 0 : this.targetVolume, c.currentTime, 0.3);
    }
  }

  setVolume(v) {
    this.targetVolume = v;
    if (this.currentGain && !this.muted) {
      const c = ensure();
      this.currentGain.gain.setTargetAtTime(v, c.currentTime, 0.3);
    }
  }

  // Resolve a mood id to one of its tracks via per-mood round-robin.
  _pickTrack(moodId) {
    const list = MOODS[moodId];
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    const idx = this._moodIndex[moodId] || 0;
    const url = list[idx % list.length];
    this._moodIndex[moodId] = (idx + 1) % list.length;
    return url;
  }

  // Switch to a mood (crossfade ~0.8s). No-op if already on this mood. Picks
  // one track from the mood's list (round-robin) so repeated calls vary.
  play(moodId) {
    if (this.currentId === moodId && this.started) return;
    const url = this._pickTrack(moodId);
    if (!url) return; // unknown/empty mood -> nothing to play
    resumeAudio();
    const c = ensure();
    this._stop(c.currentTime + 0.8);
    this._start(url, c.currentTime + 0.8);
    this.currentId = moodId;
    this.currentUrl = url;
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    const c = ensure();
    this._stop(c.currentTime + 0.8);
    this.currentId = null;
    this.currentUrl = null;
    this.started = false;
  }

  _start(url, when) {
    const c = ensure();
    const buffer = this.buffers[url];
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(this.muted ? 0 : this.targetVolume, when + 0.8);
    gain.connect(c.destination);
    this.currentGain = gain;

    if (buffer) {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start(when);
      this.currentSource = src;
    } else {
      // Synth fallback: a slow detuned chord pad loop. Best-effort; never throws.
      this.currentSource = startSynthPad(c, gain, when);
    }
  }

  _stop(when) {
    if (this.currentGain) {
      const c = ensure();
      this.currentGain.gain.cancelScheduledValues(c.currentTime);
      this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, c.currentTime);
      this.currentGain.gain.linearRampToValueAtTime(0, when);
    }
    const src = this.currentSource;
    if (src) {
      try { src.stop(when + 0.05); } catch (_) { /* already stopped */ }
    }
    this.currentSource = null;
    this.currentGain = null;
  }
}

// Best-effort synthesized chord pad (used only if a music file fails to load).
function startSynthPad(ctx, dest, when) {
  const freqs = [110, 138.59, 164.81]; // A minor-ish
  const oscs = freqs.map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 6;
    return o;
  });
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  oscs.forEach(o => o.connect(filter));
  filter.connect(dest);
  oscs.forEach(o => o.start(when));
  // fake "loop" handle: stop() will end it
  return { stop: (t) => oscs.forEach(o => { try { o.stop(t); } catch (_) {} }) };
}
