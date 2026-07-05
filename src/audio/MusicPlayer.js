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

const TRACKS = {
  menu: asset('/audio/music/menu_loop.mp3'),
  combat: asset('/audio/music/combat_loop.mp3'),
};

export class MusicPlayer {
  constructor() {
    this.buffers = {};      // trackId -> AudioBuffer (or null if unloaded/failed)
    this.currentSource = null;
    this.currentGain = null;
    this.currentId = null;
    this.targetVolume = 0.35;
    this.muted = false;
    this.started = false;
  }

  async preload() {
    await Promise.all(Object.entries(TRACKS).map(async ([id, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        this.buffers[id] = await ensure().decodeAudioData(arr);
      } catch (e) {
        console.warn(`[MusicPlayer] could not load ${url}; using synth fallback for "${id}":`, e.message);
        this.buffers[id] = null; // marker -> synth fallback
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

  // Switch to a track (crossfade ~0.8s). No-op if already on it.
  play(trackId) {
    if (this.currentId === trackId && this.started) return;
    resumeAudio();
    const c = ensure();
    this._stop(c.currentTime + 0.8);
    this._start(trackId, c.currentTime + 0.8);
    this.currentId = trackId;
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    const c = ensure();
    this._stop(c.currentTime + 0.8);
    this.currentId = null;
    this.started = false;
  }

  _start(trackId, when) {
    const c = ensure();
    const buffer = this.buffers[trackId];
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
