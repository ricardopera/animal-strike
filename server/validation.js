import { MAPS } from '../src/world/Maps.js';
import { ANIMAL_IDS } from '../src/config/Animals.js';
import { WEAPONS } from '../src/config/Weapons.js';

const MAP_IDS = new Set(MAPS.map(m => m.id));
const ANIMAL_ID_SET = new Set(ANIMAL_IDS);
const WEAPON_ID_SET = new Set(Object.keys(WEAPONS));

const PITCH_MAX = Math.PI / 2 - 0.01;

// Trim + strip control chars + cap length. Returns '' for invalid/empty input.
export function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  // strip control chars (C0 + C1 ranges), then trim
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
  return cleaned.slice(0, 16);
}

// Return a name not already in `taken`. Appends (2), (3), ... as needed.
export function dedupeName(name, taken) {
  const takenSet = new Set(taken);
  if (!takenSet.has(name)) return name;
  let n = 2;
  while (takenSet.has(`${name}(${n})`)) n++;
  return `${name}(${n})`;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function asBool(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes'; }
function asInt(v, fallback) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

// Clamp an inbound input payload to safe ranges. Always returns a full object.
export function clampInput(m) {
  return {
    seq: Math.max(0, asInt(m.seq, 0)),
    f: clamp(Number(m.f) || 0, -1, 1),
    s: clamp(Number(m.s) || 0, -1, 1),
    j: !!asBool(m.j),
    sp: !!asBool(m.sp),
    c: !!asBool(m.c),
    fire: !!asBool(m.fire),
    reload: !!asBool(m.reload),
    yaw: clamp(Number(m.yaw) || 0, -Math.PI, Math.PI),
    pitch: clamp(Number(m.pitch) || 0, -PITCH_MAX, PITCH_MAX),
  };
}

// Allowlist of inbound message types + their validators.
// Returns { ok: true } or { ok: false, code }.
const VALIDATORS = {
  auth: (m) => (typeof m.name === 'string' || m.name === undefined)
            && (m.animal === undefined || ANIMAL_ID_SET.has(m.animal))
            && (m.weapon === undefined || WEAPON_ID_SET.has(m.weapon)),
  reconnect: (m) => typeof m.id === 'string' && typeof m.token === 'string',
  loadout: (m) => (m.animal === undefined || ANIMAL_ID_SET.has(m.animal))
            && (m.weapon === undefined || WEAPON_ID_SET.has(m.weapon)),
  selectMap: (m) => typeof m.map === 'string' && MAP_IDS.has(m.map),
  start: (m) => m.map === undefined || (typeof m.map === 'string' && MAP_IDS.has(m.map)),
  input: (m) => true, // clamped separately; any shape is accepted (junk becomes zeros)
};

export function validateMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, code: 'bad_shape' };
  const v = VALIDATORS[m.t];
  if (!v) return { ok: false, code: 'unknown_type' };
  return v(m) ? { ok: true } : { ok: false, code: 'bad_' + m.t };
}
