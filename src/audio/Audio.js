// Synthesized one-shots via WebAudio — no asset files needed.
let ctx = null;
function ensure() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; }

export function resumeAudio() { ensure().resume(); }

function blip({ freq = 220, type = 'square', dur = 0.08, gain = 0.15, sweep = 0 }) {
  const c = ensure();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const Sfx = {
  shootAR: () => blip({ freq: 320, type: 'square', dur: 0.06, gain: 0.12, sweep: -120 }),
  shootSniper: () => blip({ freq: 180, type: 'sawtooth', dur: 0.18, gain: 0.2, sweep: -100 }),
  hit: () => blip({ freq: 660, type: 'triangle', dur: 0.05, gain: 0.1 }),
  kill: () => blip({ freq: 880, type: 'triangle', dur: 0.15, gain: 0.15, sweep: 400 }),
  jump: () => blip({ freq: 300, type: 'sine', dur: 0.08, gain: 0.08, sweep: 200 }),
  hurt: () => blip({ freq: 160, type: 'sawtooth', dur: 0.12, gain: 0.15, sweep: -60 }),
};
