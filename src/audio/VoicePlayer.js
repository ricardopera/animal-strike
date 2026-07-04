// One-shot voice queue: plays generated clips from /audio/voice/*, falls back to
// a synthesized WebAudio blip if a file is missing. Has per-clip cooldowns.
// Supports both shared announcer clips AND per-animal character voices.
import { resumeAudio } from './Audio.js';

let ctx = null;
function ensure() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Shared announcer/match clips (keep from v2).
const CLIPS = {
  matchStart: '/audio/voice/match_start.mp3',
  lowTime: '/audio/voice/low_time.mp3',
  victory: '/audio/voice/victory.mp3',
  defeat: '/audio/voice/defeat.mp3',
  fragMilestone: '/audio/voice/frag_milestone.mp3',
  // Legacy shared grunts (still used as a last-resort fallback identifier)
  gruntKill: '/audio/voice/grunt_kill.mp3',
  gruntHurt: '/audio/voice/grunt_hurt.mp3',
  gruntDeath: '/audio/voice/grunt_death.mp3',
  gruntSpawn: '/audio/voice/grunt_spawn.mp3',
};

const ANIMAL_IDS = ['FOX', 'WOLF', 'PANDA', 'TIGER', 'BEAR', 'BUNNY', 'OWL'];
const SITUATIONS = ['kill', 'hurt', 'death', 'spawn', 'victory', 'taunt'];

// Build per-animal clip map: key "FOX_kill" -> "/audio/voice/FOX_kill.mp3"
const ANIMAL_CLIPS = {};
for (const a of ANIMAL_IDS) for (const s of SITUATIONS) {
  ANIMAL_CLIPS[`${a}_${s}`] = `/audio/voice/${a}_${s}.mp3`;
}

// Per-line cooldown (seconds). Per-animal keys fall back to the situation default.
const ANNOUNCER_COOLDOWNS = {
  matchStart: 60, lowTime: 25, victory: 60, defeat: 60, fragMilestone: 8,
  gruntKill: 1.2, gruntHurt: 0.8, gruntDeath: 2.0, gruntSpawn: 4.0,
};
const SITUATION_COOLDOWNS = {
  kill: 1.2, hurt: 0.8, death: 2.0, spawn: 4.0, victory: 60, taunt: 8.0,
};

function cooldownFor(key) {
  if (key in ANNOUNCER_COOLDOWNS) return ANNOUNCER_COOLDOWNS[key];
  // per-animal key like "FOX_kill"
  const sit = key.split('_')[1];
  return SITUATION_COOLDOWNS[sit] != null ? SITUATION_COOLDOWNS[sit] : 2.0;
}

// Kept for backward compatibility (synth fallback pitch). Real per-animal voices
// need no pitch shift; this only affects the synth blip fallback.
export function pitchForAnimal(animalId, animalsConfig) {
  const a = animalsConfig && animalsConfig[animalId];
  if (!a) return 1.0;
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
    const all = { ...CLIPS, ...ANIMAL_CLIPS };
    await Promise.all(Object.entries(all).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        this.buffers[key] = await ensure().decodeAudioData(arr);
      } catch (e) {
        // Per-animal clip missing -> synth fallback (don't warn-spam for 42 clips)
        this.buffers[key] = null;
      }
    }));
    this.ready = true;
  }

  setMuted(m) { this.muted = m; }
  setVolume(v) { this.volume = v; }

  // Play a shared announcer clip if not on cooldown.
  play(key, pitchShift = 1.0) {
    if (this.muted || !this.ready) return;
    if (!(key in CLIPS)) return;
    this._playKey(key, pitchShift);
  }

  // Play a per-animal character voice. animalId e.g. 'FOX', situation e.g. 'kill'.
  playAnimal(animalId, situation, pitchShift = 1.0) {
    if (this.muted || !this.ready) return;
    const key = `${animalId}_${situation}`;
    if (!(key in ANIMAL_CLIPS)) return;
    this._playKey(key, pitchShift);
  }

  // Does a per-animal clip exist (loaded)? Used to decide fallback to announcer.
  hasAnimal(animalId, situation) {
    return !!this.buffers[`${animalId}_${situation}`];
  }

  _playKey(key, pitchShift) {
    const c = ensure();
    const now = c.currentTime;
    const cd = cooldownFor(key);
    const last = this.lastPlayed[key] != null ? this.lastPlayed[key] : -999;
    if (now - last < cd) return; // on cooldown
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
