// One-shot voice queue: plays generated announcer/grunt clips from /audio/voice/*,
// falls back to a synthesized WebAudio blip if a file is missing. Has per-line
// cooldowns + a global "don't talk over" guard so the soundscape stays readable.
import { resumeAudio } from './Audio.js';

let ctx = null;
function ensure() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Clip -> file. Each line below maps to a generated asset (see scripts/generate_assets.py).
const CLIPS = {
  matchStart: '/audio/voice/match_start.mp3',
  lowTime: '/audio/voice/low_time.mp3',
  victory: '/audio/voice/victory.mp3',
  defeat: '/audio/voice/defeat.mp3',
  fragMilestone: '/audio/voice/frag_milestone.mp3',
  gruntKill: '/audio/voice/grunt_kill.mp3',
  gruntHurt: '/audio/voice/grunt_hurt.mp3',
  gruntDeath: '/audio/voice/grunt_death.mp3',
  gruntSpawn: '/audio/voice/grunt_spawn.mp3',
};

// Per-line cooldown (seconds) so repeats don't stack up.
const COOLDOWNS = {
  matchStart: 60, lowTime: 25, victory: 60, defeat: 60,
  fragMilestone: 8, gruntKill: 1.2, gruntHurt: 0.8,
  gruntDeath: 2.0, gruntSpawn: 4.0,
};

// Grunts get pitch-shifted per-animal for variety (lean voice set, full later).
// speedMul from the animal config roughly maps to pitch (faster animal = higher voice).
export function pitchForAnimal(animalId, animalsConfig) {
  const a = animalsConfig && animalsConfig[animalId];
  if (!a) return 1.0;
  // Bunny(1.2) -> higher, Bear(0.9) -> lower, range ~0.85..1.25
  return Math.max(0.8, Math.min(1.3, 0.6 + a.speedMul * 0.5));
}

export class VoicePlayer {
  constructor() {
    this.buffers = {};        // clipKey -> AudioBuffer | null
    this.lastPlayed = {};     // clipKey -> ctx time
    this.muted = false;
    this.volume = 0.7;
    this.ready = false;
  }

  async preload() {
    await Promise.all(Object.entries(CLIPS).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        this.buffers[key] = await ensure().decodeAudioData(arr);
      } catch (e) {
        console.warn(`[VoicePlayer] could not load ${url}; synth fallback for "${key}":`, e.message);
        this.buffers[key] = null;
      }
    }));
    this.ready = true;
  }

  setMuted(m) { this.muted = m; }
  setVolume(v) { this.volume = v; }

  // Play a line if not on cooldown and not muted. pitchShift (1.0 = none) for per-animal grunts.
  play(key, pitchShift = 1.0) {
    if (this.muted || !this.ready) return;
    if (!(key in CLIPS)) return;
    const c = ensure();
    const now = c.currentTime;
    const last = this.lastPlayed[key] || -999;
    if (now - last < COOLDOWNS[key]) return; // on cooldown
    this.lastPlayed[key] = now;

    const buffer = this.buffers[key];
    if (buffer) {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.max(0.7, Math.min(1.4, pitchShift));
      const g = c.createGain();
      g.gain.value = this.volume;
      src.connect(g).connect(c.destination);
      src.start();
    } else {
      // synth fallback: a short tonal blip
      synthBlip(c, this.volume, pitchShift);
    }
  }
}

function synthBlip(ctx, vol, pitch) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = 440 * pitch;
  o.frequency.exponentialRampToValueAtTime(220 * pitch, ctx.currentTime + 0.15);
  g.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.2);
}
