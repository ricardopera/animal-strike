# Dedicated Server Multiplayer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace peer-hosted multiplayer with a standalone authoritative dedicated server. Clients connect by `IP:port` (never host); open-auth connection validation; token reconnect (60s grace); always-full bot backfill (late-join replaces a bot, leave converts to bot); any-player map selection + start; configurable host/port/max-players; docs-only NAT/firewall guidance.

**Architecture:** One Node process (`server/index.js`) hosts one `Room` = one authoritative headless `Sim` + lobby/match lifecycle, bound to configurable `HOST:PORT`. Clients are pure joiners via `NetClient` (browser WebSocket). The server validates all inputs; the existing `Sim` already owns fire-rate/ammo/hit-detection (the real anti-cheat). Reused unchanged: `Sim`, `ColliderStore`+`colliderBoxes`, `RemoteView`. Added: config loader, validation, rate-limiter, reconnect registry. Removed: the "Host" menu mode and the "first client is host" concept.

**Tech Stack:** Node.js (ESM), `ws` (WebSocket), three.js math classes (headless), Vite (client), Vitest (node tests).

**Design spec:** `docs/superpowers/specs/2026-07-06-dedicated-server-design.md`

---

## File Structure

```
server/
├── index.js                 # REWRITE: dedicated Room (no host) + config + validation + reconnect + main()
├── config.js                # CREATE: load+validate config (file/env/CLI)
├── validation.js            # CREATE: name sanitize/dedupe + message schema + input clamp
├── rateLimiter.js           # CREATE: token-bucket per-IP limiter + per-IP connection cap
├── reconnect.js             # CREATE: token registry (mint/verify/expire, 60s grace)
├── config.example.json      # CREATE: documented default config
└── README.md                # REWRITE: dedicated deployment guide

src/
├── sim/protocol.js          # MODIFY: add selectMap/mapSelected/auth/reconnect/kick/error builders
├── net/NetClient.js         # MODIFY: auth/reconnect/selectMap + persist {id,token}; lobby callbacks
├── ui/MainMenu.js           # REWRITE: Single/Connect modes; live lobby map picker + Start
├── core/Game.js             # MODIFY: Connect-only bootstrap; map from mapSelected; reconnect id/token

docs/
└── multiplayer-deployment.md  # CREATE: LAN / port-forward / cloud-VPS / firewall

src/tests/
├── server.config.test.js        # CREATE
├── server.validation.test.js    # CREATE
├── server.rateLimiter.test.js   # CREATE
├── server.reconnect.test.js     # CREATE
├── server.integration.test.js   # REWRITE for new protocol
├── protocol.test.js             # EXTEND for new message builders
└── (existing Sim.test.js, MapColliderBoxes.test.js — unchanged)

package.json                     # MODIFY: rename "host" → "server" script
```

---

## Task 1: Config loader (`server/config.js`)

Load and validate server configuration from `config.json` (optional) overlaid by env vars (`AS_*`) overlaid by CLI flags. One source of truth for host/port/max-players/etc.

**Files:**
- Create: `server/config.js`
- Test: `src/tests/server.config.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/server.config.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../server/config.js';

describe('loadConfig', () => {
  it('returns defaults when nothing is provided', () => {
    const c = loadConfig({});
    expect(c.host).toBe('0.0.0.0');
    expect(c.port).toBe(8080);
    expect(c.maxPlayers).toBe(6);
    expect(c.minPlayers).toBe(2);
    expect(c.map).toBe('plaza');
    expect(c.fragTarget).toBe(25);
    expect(c.matchSeconds).toBe(300);
    expect(c.autoStart).toBe(false);
    expect(c.password).toBe('');
    expect(c.rateLimit).toEqual({ perWindow: 5, windowMs: 10000 });
    expect(c.maxPerIp).toBe(4);
  });

  it('env vars override defaults', () => {
    const c = loadConfig({ env: { AS_PORT: '9000', AS_MAX_PLAYERS: '8', AS_HOST: '127.0.0.1', AS_MAP: 'foundry', AS_FRAG_TARGET: '50', AS_MATCH_SECONDS: '600', AS_AUTO_START: 'true', AS_MIN_PLAYERS: '3', AS_PASSWORD: 'sekret', AS_MAX_PER_IP: '10' } });
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(9000);
    expect(c.maxPlayers).toBe(8);
    expect(c.map).toBe('foundry');
    expect(c.fragTarget).toBe(50);
    expect(c.matchSeconds).toBe(600);
    expect(c.autoStart).toBe(true);
    expect(c.minPlayers).toBe(3);
    expect(c.password).toBe('sekret');
    expect(c.maxPerIp).toBe(10);
  });

  it('CLI flags override env', () => {
    const c = loadConfig({ env: { AS_PORT: '9000' }, argv: ['--port', '12345'] });
    expect(c.port).toBe(12345);
  });

  it('CLI flags accept --host, --port, --max-players, --min-players, --auto-start', () => {
    const c = loadConfig({ argv: ['--host', '1.2.3.4', '--port', '7000', '--max-players', '12', '--min-players', '4', '--auto-start'] });
    expect(c.host).toBe('1.2.3.4');
    expect(c.port).toBe(7000);
    expect(c.maxPlayers).toBe(12);
    expect(c.minPlayers).toBe(4);
    expect(c.autoStart).toBe(true);
  });

  it('reads config.json when provided as a parsed object', () => {
    const c = loadConfig({ file: { port: 7777, maxPlayers: 10, map: 'dustbowl' } });
    expect(c.port).toBe(7777);
    expect(c.maxPlayers).toBe(10);
    expect(c.map).toBe('dustbowl');
  });

  it('precedence: CLI > env > file > defaults', () => {
    const c = loadConfig({ file: { port: 1111 }, env: { AS_PORT: '2222' }, argv: ['--port', '3333'] });
    expect(c.port).toBe(3333);
  });

  it('rejects port out of range', () => {
    expect(() => loadConfig({ argv: ['--port', '0'] })).toThrow(/port/i);
    expect(() => loadConfig({ argv: ['--port', '70000'] })).toThrow(/port/i);
  });

  it('rejects maxPlayers out of range', () => {
    expect(() => loadConfig({ argv: ['--max-players', '1'] })).toThrow(/maxPlayers/i);
    expect(() => loadConfig({ argv: ['--max-players', '99'] })).toThrow(/maxPlayers/i);
  });

  it('rejects unknown map id', () => {
    expect(() => loadConfig({ env: { AS_MAP: 'nonsense' } })).toThrow(/map/i);
  });

  it('rejects non-positive match seconds / frag target', () => {
    expect(() => loadConfig({ env: { AS_MATCH_SECONDS: '0' } })).toThrow(/seconds/i);
    expect(() => loadConfig({ env: { AS_FRAG_TARGET: '0' } })).toThrow(/frag/i);
  });

  it('coerces minPlayers to not exceed maxPlayers', () => {
    const c = loadConfig({ argv: ['--max-players', '4', '--min-players', '9'] });
    expect(c.minPlayers).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/server.config.test.js`
Expected: FAIL — `Cannot find module '../../server/config.js'`

- [ ] **Step 3: Implement `server/config.js`**

Create `server/config.js`:
```js
import { MAPS } from '../src/world/Maps.js';

const DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  maxPlayers: 6,
  minPlayers: 2,
  map: 'plaza',
  fragTarget: 25,
  matchSeconds: 300,
  autoStart: false,
  password: '',
  rateLimit: { perWindow: 5, windowMs: 10000 },
  maxPerIp: 4,
};

const MAP_IDS = new Set(MAPS.map(m => m.id));

// Parse a simple "--flag value" / "--flag" argv. Returns an object of overrides.
function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') out.host = argv[++i];
    else if (a === '--port') out.port = parseInt(argv[++i], 10);
    else if (a === '--max-players') out.maxPlayers = parseInt(argv[++i], 10);
    else if (a === '--min-players') out.minPlayers = parseInt(argv[++i], 10);
    else if (a === '--auto-start') out.autoStart = true;
  }
  return out;
}

function asBool(v) {
  return v === 'true' || v === '1';
}

// Load config from { file, env, argv } (any optional). Precedence: argv > env > file > defaults.
export function loadConfig({ file = null, env = process.env, argv = process.argv.slice(2) } = {}) {
  const envOverrides = {};
  if (env.AS_HOST !== undefined) envOverrides.host = env.AS_HOST;
  if (env.AS_PORT !== undefined) envOverrides.port = parseInt(env.AS_PORT, 10);
  if (env.AS_MAX_PLAYERS !== undefined) envOverrides.maxPlayers = parseInt(env.AS_MAX_PLAYERS, 10);
  if (env.AS_MIN_PLAYERS !== undefined) envOverrides.minPlayers = parseInt(env.AS_MIN_PLAYERS, 10);
  if (env.AS_MAP !== undefined) envOverrides.map = env.AS_MAP;
  if (env.AS_FRAG_TARGET !== undefined) envOverrides.fragTarget = parseInt(env.AS_FRAG_TARGET, 10);
  if (env.AS_MATCH_SECONDS !== undefined) envOverrides.matchSeconds = parseInt(env.AS_MATCH_SECONDS, 10);
  if (env.AS_AUTO_START !== undefined) envOverrides.autoStart = asBool(env.AS_AUTO_START);
  if (env.AS_PASSWORD !== undefined) envOverrides.password = env.AS_PASSWORD;
  if (env.AS_MAX_PER_IP !== undefined) envOverrides.maxPerIp = parseInt(env.AS_MAX_PER_IP, 10);

  const cli = parseArgv(argv);
  const merged = { ...DEFAULTS, ...(file || {}), ...envOverrides, ...cli };

  // minPlayers never exceeds maxPlayers.
  if (merged.minPlayers > merged.maxPlayers) merged.minPlayers = merged.maxPlayers;

  validate(merged);
  return merged;
}

function validate(c) {
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error(`Invalid port: ${c.port}`);
  if (!Number.isInteger(c.maxPlayers) || c.maxPlayers < 2 || c.maxPlayers > 16) throw new Error(`Invalid maxPlayers: ${c.maxPlayers} (must be 2-16)`);
  if (!Number.isInteger(c.minPlayers) || c.minPlayers < 1) throw new Error(`Invalid minPlayers: ${c.minPlayers}`);
  if (!MAP_IDS.has(c.map)) throw new Error(`Unknown map id: ${c.map}`);
  if (!Number.isInteger(c.fragTarget) || c.fragTarget < 1) throw new Error(`Invalid fragTarget: ${c.fragTarget}`);
  if (!Number.isInteger(c.matchSeconds) || c.matchSeconds < 1) throw new Error(`Invalid matchSeconds: ${c.matchSeconds}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/server.config.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Create an example config file**

Create `server/config.example.json`:
```json
{
  "_comment": "Copy to config.json and edit. All fields optional; env vars (AS_*) and CLI flags override these.",
  "host": "0.0.0.0",
  "port": 8080,
  "maxPlayers": 6,
  "minPlayers": 2,
  "map": "plaza",
  "fragTarget": 25,
  "matchSeconds": 300,
  "autoStart": false,
  "password": "",
  "maxPerIp": 4
}
```

- [ ] **Step 6: Commit**

```bash
git add server/config.js server/config.example.json src/tests/server.config.test.js
git commit -m "feat(server): config loader (file+env+CLI) with validation"
```

---

## Task 2: Input validation module (`server/validation.js`)

Name sanitization + dedupe, message-shape allowlist, and input field clamping. Pure functions, no I/O — easy to unit test.

**Files:**
- Create: `server/validation.js`
- Test: `src/tests/server.validation.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/server.validation.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { sanitizeName, dedupeName, clampInput, validateMessage } from '../../server/validation.js';

describe('sanitizeName', () => {
  it('trims whitespace', () => {
    expect(sanitizeName('  Rico  ')).toBe('Rico');
  });
  it('strips control characters', () => {
    expect(sanitizeName('Ri\u0000co')).toBe('Rico');
  });
  it('limits to 16 chars', () => {
    expect(sanitizeName('A'.repeat(30))).toHaveLength(16);
  });
  it('returns empty string for blank/garbage', () => {
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('')).toBe('');
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName(12345)).toBe('');
  });
});

describe('dedupeName', () => {
  it('returns the name unchanged if not taken', () => {
    expect(dedupeName('Rico', ['Alice', 'Bob'])).toBe('Rico');
  });
  it('adds a numeric suffix when taken', () => {
    expect(dedupeName('Rico', ['Rico', 'Alice'])).toBe('Rico(2)');
  });
  it('increments suffix until free', () => {
    expect(dedupeName('Rico', ['Rico', 'Rico(2)', 'Rico(3)'])).toBe('Rico(4)');
  });
});

describe('clampInput', () => {
  it('clamps forward/strafe to [-1, 1]', () => {
    expect(clampInput({ f: 5, s: -3 })).toMatchObject({ f: 1, s: -1 });
    expect(clampInput({ f: 0.5, s: 0 })).toMatchObject({ f: 0.5, s: 0 });
  });
  it('clamps yaw to [-PI, PI]', () => {
    expect(clampInput({ yaw: 10 }).yaw).toBeCloseTo(Math.PI);
    expect(clampInput({ yaw: -10 }).yaw).toBeCloseTo(-Math.PI);
    expect(clampInput({ yaw: 0.5 }).yaw).toBeCloseTo(0.5);
  });
  it('clamps pitch to the valid look range', () => {
    const c = clampInput({ pitch: 5 });
    expect(c.pitch).toBeLessThan(Math.PI / 2);
    expect(c.pitch).toBeGreaterThan(-Math.PI / 2);
  });
  it('coerces booleans', () => {
    expect(clampInput({ j: 1, sp: 0, c: 'yes', fire: undefined, reload: null }))
      .toMatchObject({ j: true, sp: false, c: true, fire: false, reload: false });
  });
  it('forces seq to a non-negative integer (default 0)', () => {
    expect(clampInput({ seq: -5 }).seq).toBe(0);
    expect(clampInput({ seq: 12.7 }).seq).toBe(12);
    expect(clampInput({ seq: 'abc' }).seq).toBe(0);
  });
  it('handles missing fields gracefully', () => {
    const c = clampInput({});
    expect(c.f).toBe(0);
    expect(c.s).toBe(0);
    expect(c.fire).toBe(false);
    expect(c.yaw).toBe(0);
  });
});

describe('validateMessage', () => {
  it('accepts a valid auth message', () => {
    const r = validateMessage({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' });
    expect(r.ok).toBe(true);
  });
  it('accepts a valid input message', () => {
    const r = validateMessage({ t: 'input', seq: 1, f: 1, s: 0, j: false, sp: false, c: false, fire: true, reload: false, yaw: 0, pitch: 0 });
    expect(r.ok).toBe(true);
  });
  it('accepts selectMap with a known map id', () => {
    expect(validateMessage({ t: 'selectMap', map: 'plaza' }).ok).toBe(true);
  });
  it('rejects selectMap with an unknown map', () => {
    expect(validateMessage({ t: 'selectMap', map: 'mars' }).ok).toBe(false);
  });
  it('rejects unknown message types', () => {
    expect(validateMessage({ t: 'teleport', x: 999 }).ok).toBe(false);
  });
  it('rejects non-object messages', () => {
    expect(validateMessage(null).ok).toBe(false);
    expect(validateMessage('hello').ok).toBe(false);
  });
  it('accepts start with a known map', () => {
    expect(validateMessage({ t: 'start', map: 'foundry' }).ok).toBe(true);
    expect(validateMessage({ t: 'start' }).ok).toBe(true); // map optional (lobby default)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/server.validation.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/validation.js`**

Create `server/validation.js`:
```js
import { MAPS } from '../src/world/Maps.js';

const MAP_IDS = new Set(MAPS.map(m => m.id));

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
  auth: (m) => typeof m.name === 'string' || m.name === undefined,
  reconnect: (m) => typeof m.id === 'string' && typeof m.token === 'string',
  loadout: (m) => typeof m.animal === 'string' && typeof m.weapon === 'string',
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/server.validation.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/validation.js src/tests/server.validation.test.js
git commit -m "feat(server): name sanitize/dedupe + message allowlist + input clamp"
```

---

## Task 3: Rate limiter (`server/rateLimiter.js`)

Token-bucket per-IP limiter for connection/auth attempts + a per-IP concurrent connection counter.

**Files:**
- Create: `server/rateLimiter.js`
- Test: `src/tests/server.rateLimiter.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/server.rateLimiter.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { RateLimiter, ConnectionCap } from '../../server/rateLimiter.js';

describe('RateLimiter (token bucket per IP)', () => {
  it('allows up to perWindow in a burst then refills over time', () => {
    const lim = new RateLimiter({ perWindow: 3, windowMs: 1000 });
    const ip = '1.2.3.4';
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(false); // bucket empty
  });

  it('refills after the window elapses', () => {
    const lim = new RateLimiter({ perWindow: 2, windowMs: 1000 });
    const ip = '9.9.9.9';
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(true);
    expect(lim.try(ip, 0)).toBe(false);
    expect(lim.try(ip, 1001)).toBe(true); // refilled
  });

  it('tracks IPs independently', () => {
    const lim = new RateLimiter({ perWindow: 1, windowMs: 1000 });
    expect(lim.try('a', 0)).toBe(true);
    expect(lim.try('b', 0)).toBe(true);
    expect(lim.try('a', 0)).toBe(false);
    expect(lim.try('b', 0)).toBe(false);
  });

  it('forgets idle IPs to avoid unbounded growth', () => {
    const lim = new RateLimiter({ perWindow: 1, windowMs: 1000 });
    lim.try('old', 0);
    lim.sweep(5000); // well past window
    // 'old' should have been dropped; a fresh attempt starts a new bucket
    expect(lim.try('old', 5000)).toBe(true);
  });
});

describe('ConnectionCap (per-IP concurrent connections)', () => {
  it('allows up to the cap per IP, rejects excess', () => {
    const cap = new ConnectionCap(3);
    expect(cap.canAcquire('1.1.1.1')).toBe(true);
    cap.acquire('1.1.1.1');
    cap.acquire('1.1.1.1');
    cap.acquire('1.1.1.1');
    expect(cap.canAcquire('1.1.1.1')).toBe(false); // 4th rejected
    expect(cap.canAcquire('2.2.2.2')).toBe(true);  // different IP unaffected
  });
  it('release frees a slot', () => {
    const cap = new ConnectionCap(2);
    cap.acquire('x'); cap.acquire('x');
    expect(cap.canAcquire('x')).toBe(false);
    cap.release('x');
    expect(cap.canAcquire('x')).toBe(true);
  });
  it('release is idempotent and ignores unknown IPs', () => {
    const cap = new ConnectionCap(2);
    cap.release('never'); // no throw
    cap.release('never');
    expect(cap.canAcquire('never')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/server.rateLimiter.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/rateLimiter.js`**

Create `server/rateLimiter.js`:
```js
// Token-bucket rate limiter, keyed by IP. `try(ip, nowMs)` consumes one token if
// available and returns true; returns false if the bucket is empty. Buckets
// refill to `perWindow` over each `windowMs`. Call `sweep(nowMs)` periodically
// to drop idle IPs (avoids unbounded memory growth from scanner traffic).
export class RateLimiter {
  constructor({ perWindow = 5, windowMs = 10000 } = {}) {
    this.perWindow = perWindow;
    this.windowMs = windowMs;
    this._buckets = new Map(); // ip -> { tokens, last }
  }
  try(ip, nowMs) {
    let b = this._buckets.get(ip);
    if (!b) { b = { tokens: this.perWindow, last: nowMs }; this._buckets.set(ip, b); }
    // refill proportional to elapsed time
    const elapsed = nowMs - b.last;
    if (elapsed > 0) {
      const refill = (elapsed / this.windowMs) * this.perWindow;
      b.tokens = Math.min(this.perWindow, b.tokens + refill);
      b.last = nowMs;
    }
    if (b.tokens >= 1) { b.tokens -= 1; return true; }
    return false;
  }
  sweep(nowMs) {
    for (const [ip, b] of this._buckets) {
      if (nowMs - b.last > this.windowMs * 2) this._buckets.delete(ip);
    }
  }
}

// Per-IP concurrent connection counter. acquire/release around socket lifecycle.
export class ConnectionCap {
  constructor(maxPerIp) {
    this.maxPerIp = maxPerIp;
    this._counts = new Map(); // ip -> count
  }
  canAcquire(ip) {
    return (this._counts.get(ip) || 0) < this.maxPerIp;
  }
  acquire(ip) {
    this._counts.set(ip, (this._counts.get(ip) || 0) + 1);
  }
  release(ip) {
    const c = (this._counts.get(ip) || 0) - 1;
    if (c <= 0) this._counts.delete(ip);
    else this._counts.set(ip, c);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/server.rateLimiter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/rateLimiter.js src/tests/server.rateLimiter.test.js
git commit -m "feat(server): per-IP rate limiter + connection cap"
```

---

## Task 4: Reconnect registry (`server/reconnect.js`)

Mints opaque tokens on join, verifies them on reconnect, expires entries after a grace window. Pure data structure — the `Room` wires it to sockets.

**Files:**
- Create: `server/reconnect.js`
- Test: `src/tests/server.reconnect.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/server.reconnect.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ReconnectRegistry } from '../../server/reconnect.js';

describe('ReconnectRegistry', () => {
  it('mint returns a token; verify accepts it within grace', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H1', 'entity-7', 1000);
    expect(token).toBeTruthy();
    expect(r.verify('H1', token, 5000)).toEqual({ ok: true, entityId: 'entity-7' });
  });

  it('rejects a wrong token', () => {
    const r = new ReconnectRegistry(60000);
    r.mint('H1', 'e1', 0);
    expect(r.verify('H1', 'wrong', 100)).toEqual({ ok: false });
  });

  it('rejects an unknown id', () => {
    const r = new ReconnectRegistry(60000);
    expect(r.verify('ghost', 'any', 0)).toEqual({ ok: false });
  });

  it('expires entries after the grace window', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H2', 'e2', 0);
    expect(r.verify('H2', token, 59999).ok).toBe(true);
    expect(r.verify('H2', token, 70000).ok).toBe(false);
  });

  it('dropping an id removes its token', () => {
    const r = new ReconnectRegistry(60000);
    const { token } = r.mint('H3', 'e3', 0);
    r.drop('H3');
    expect(r.verify('H3', token, 100).ok).toBe(false);
  });

  it('sweep removes expired entries', () => {
    const r = new ReconnectRegistry(1000);
    r.mint('a', 'ea', 0);
    r.mint('b', 'eb', 0);
    r.sweep(2000); // both expired
    expect(r.verify('a', 'anything', 2000).ok).toBe(false);
    expect(r.size).toBe(0);
  });

  it('re-minting an id replaces its token', () => {
    const r = new ReconnectRegistry(60000);
    const a = r.mint('H4', 'e4', 0).token;
    const b = r.mint('H4', 'e4', 10).token;
    expect(a).not.toBe(b);
    expect(r.verify('H4', a, 20).ok).toBe(false); // old token invalid
    expect(r.verify('H4', b, 20).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/server.reconnect.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `server/reconnect.js`**

Create `server/reconnect.js`:
```js
import { randomBytes } from 'node:crypto';

// Stores { playerId -> { token, entityId, expiresAt } } so a player who drops
// can reclaim their (now bot-controlled) entity within a grace window. Tokens
// are opaque random bytes. Call sweep(nowMs) periodically to drop expired entries.
export class ReconnectRegistry {
  constructor(graceMs = 60000) {
    this.graceMs = graceMs;
    this._entries = new Map();
  }
  get size() { return this._entries.size; }

  mint(playerId, entityId, nowMs) {
    const token = randomBytes(24).toString('hex');
    this._entries.set(playerId, { token, entityId, expiresAt: nowMs + this.graceMs });
    return { token };
  }

  // Returns { ok: true, entityId } on a live match, or { ok: false }.
  verify(playerId, token, nowMs) {
    const e = this._entries.get(playerId);
    if (!e) return { ok: false };
    if (nowMs > e.expiresAt) { this._entries.delete(playerId); return { ok: false }; }
    if (e.token !== token) return { ok: false };
    return { ok: true, entityId: e.entityId };
  }

  // Explicitly drop an entry (e.g. after a successful reconnect consumes it).
  drop(playerId) { this._entries.delete(playerId); }

  sweep(nowMs) {
    for (const [id, e] of this._entries) {
      if (nowMs > e.expiresAt) this._entries.delete(id);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/server.reconnect.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/reconnect.js src/tests/server.reconnect.test.js
git commit -m "feat(server): reconnect token registry (60s grace)"
```

---

## Task 5: Protocol builders for new messages (`src/sim/protocol.js`)

The shared helpers already exist (`msg`/`parse`/`parseSnapshot`). Add small typed builders so client and server construct the new message shapes consistently. These are thin wrappers — the `msg()` base handles the JSON.

**Files:**
- Modify: `src/sim/protocol.js`
- Test: `src/tests/protocol.test.js` (extend)

- [ ] **Step 1: Extend the protocol test**

Add to `src/tests/protocol.test.js` (inside the existing `describe('protocol', ...)` block, before the closing `});`):
```js
import { msgAuth, msgReconnect, msgSelectMap, msgWelcome, msgMapSelected, msgKick, msgError, parse } from '../sim/protocol.js';

describe('protocol new message builders', () => {
  it('msgAuth builds a join handshake', () => {
    expect(JSON.parse(msgAuth('Rico', 'FOX', 'AR'))).toEqual({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' });
  });
  it('msgReconnect builds a reclaim message', () => {
    expect(JSON.parse(msgReconnect('H2', 'tok'))).toEqual({ t: 'reconnect', id: 'H2', token: 'tok' });
  });
  it('msgSelectMap builds a map-select message', () => {
    expect(JSON.parse(msgSelectMap('plaza'))).toEqual({ t: 'selectMap', map: 'plaza' });
  });
  it('msgWelcome includes id, token, map, roster', () => {
    const m = JSON.parse(msgWelcome('H2', 'tok', 'plaza', [{ id: 'H2', name: 'Rico' }]));
    expect(m).toMatchObject({ t: 'welcome', you: 'H2', token: 'tok', map: 'plaza' });
    expect(m.roster).toHaveLength(1);
  });
  it('msgMapSelected broadcasts the lobby map', () => {
    expect(JSON.parse(msgMapSelected('foundry'))).toEqual({ t: 'mapSelected', map: 'foundry' });
  });
  it('msgKick + msgError build the right shapes', () => {
    expect(JSON.parse(msgKick('Server full'))).toEqual({ t: 'kick', reason: 'Server full' });
    expect(JSON.parse(msgError('bad_shape', 'malformed'))).toEqual({ t: 'error', code: 'bad_shape', msg: 'malformed' });
  });
});
```
Also add `msgAuth, msgReconnect, msgSelectMap, msgWelcome, msgMapSelected, msgKick, msgError` to the existing import line at the top of the file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/protocol.test.js`
Expected: FAIL — the new builders are not exported

- [ ] **Step 3: Add the builders to `src/sim/protocol.js`**

Append to `src/sim/protocol.js`:
```js
// Typed builders for the new dedicated-server messages. Thin wrappers over msg()
// so client and server can't drift on field names.
export const msgAuth       = (name, animal, weapon) => msg('auth', { name, animal, weapon });
export const msgReconnect  = (id, token) => msg('reconnect', { id, token });
export const msgSelectMap  = (map) => msg('selectMap', { map });
export const msgWelcome    = (you, token, map, roster) => msg('welcome', { you, token, map, roster });
export const msgMapSelected = (map) => msg('mapSelected', { map });
export const msgKick       = (reason) => msg('kick', { reason });
export const msgError      = (code, msgText) => msg('error', { code, msg: msgText });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/protocol.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/protocol.js src/tests/protocol.test.js
git commit -m "feat(protocol): dedicated-server message builders"
```

---

## Task 6: Sim — late-join bot takeover + always-full invariants (`src/sim/Sim.js`)

Add two methods to `Sim`: `takeOverBot(humanEntry)` (a late joiner assumes a bot's entity) and tighten `handleDisconnect` so a leave always keeps the match full (it already converts to a bot — just document/confirm). Add an `isBot`/human distinction helper. Also expose `freeSlots()` so the server knows whether to admit a late joiner.

**Files:**
- Modify: `src/sim/Sim.js`
- Test: `src/tests/Sim.test.js` (extend)

- [ ] **Step 1: Add failing tests to `src/tests/Sim.test.js`**

Add inside the existing top-level `describe` (or as a new `describe` block at the bottom of the file):
```js
describe('Sim always-full + late-join bot takeover', () => {
  it('startMatch fills to maxPlayers (humans + bots)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    expect(sim.players.length).toBe(6); // MAX_PLAYERS
    expect(sim.bots.length).toBe(6);    // no humans
  });

  it('freeSlots() reports bot slots available for late join', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    expect(sim.freeSlots()).toBe(6); // all slots are bots, no humans
    // Simulate a late join via takeOverBot (the path the server uses mid-match):
    sim.takeOverBot('Alice', 'FOX', 'AR');
    expect(sim.freeSlots()).toBe(5); // one human now occupies a former bot slot
  });

  it('takeOverBot converts a bot slot to human control (match stays full)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    const botCountBefore = sim.bots.length;
    const playerCountBefore = sim.players.length;
    const bot = sim.bots[0];
    const botScore = 3;
    bot.score = botScore;
    const human = sim.takeOverBot('Alice', 'FOX', 'AR');
    expect(human).toBe(bot);                    // same entity object
    expect(sim.humans.has(human.id)).toBe(true);
    expect(sim.bots.includes(human)).toBe(false);
    expect(sim.bots.length).toBe(botCountBefore - 1);
    expect(sim.players.length).toBe(playerCountBefore); // still full
    expect(human.score).toBe(botScore);               // score retained
    expect(human.name).toBe('Alice');                  // name updated
  });

  it('handleDisconnect immediately converts a human to a bot (match never short)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    const human = sim.takeOverBot('Bob', 'WOLF', 'AR');
    const countBefore = sim.players.length;
    expect(sim.humans.has(human.id)).toBe(true);
    sim.handleDisconnect(human.id);
    expect(sim.humans.has(human.id)).toBe(false);
    expect(sim.bots.includes(human)).toBe(true);       // back to bot
    expect(sim.players.length).toBe(countBefore);      // still full
  });

  it('freeSlots() is 0 when all slots are human', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    // Take over every bot
    while (sim.bots.length > 0) sim.takeOverBot('P' + sim.bots.length, 'FOX', 'AR');
    expect(sim.freeSlots()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/Sim.test.js`
Expected: FAIL — `sim.takeOverBot is not a function` and `sim.freeSlots is not a function`

- [ ] **Step 3: Add `takeOverBot` + `freeSlots` to `Sim`**

In `src/sim/Sim.js`, add these methods to the `Sim` class (e.g. right after `handleDisconnect`):
```js
  // Number of bot slots available for a late-joining human (maxPlayers minus humans).
  freeSlots() { return MAX_PLAYERS - this.humans.size; }

  // A late-joining human takes over an existing bot's entity: position, health,
  // score, alive-state, and loadout stay; only control flips to human. Returns
  // the (now-human) entity, or null if there is no bot to take over.
  takeOverBot(name, animalId, weaponId) {
    const bot = this.bots.shift();
    if (!bot) return null;
    bot.name = name;
    if (animalId) bot.animalId = animalId;
    if (weaponId) {
      bot.loadout.primary = weaponId;
      bot.weapon = new WeaponController(WEAPONS[weaponId]);
      bot.weapon.fireCallback = () => bot.pendingShots.push({});
    }
    this.humans.set(bot.id, bot);
    return bot;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/Sim.test.js`
Expected: PASS (the new block + the existing 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sim/Sim.js src/tests/Sim.test.js
git commit -m "feat(sim): takeOverBot + freeSlots — always-full late-join"
```

---

## Task 7: Dedicated server Room + main (`server/index.js`)

The core rewrite. `Room` no longer has a host concept; it wires together the `Sim`, config, validation, rate-limiter, connection-cap, and reconnect registry. Match start is driven by any player (or operator/auto-start). This task is large but self-contained.

**Files:**
- Rewrite: `server/index.js`
- Test: `src/tests/server.integration.test.js` (rewrite — Task 8)

- [ ] **Step 1: Rewrite `server/index.js`**

Replace the entire contents of `server/index.js` with:
```js
import { WebSocketServer } from 'ws';
import { Sim } from '../src/sim/Sim.js';
import { msg, parse } from '../src/sim/protocol.js';
import {
  msgWelcome, msgMapSelected, msgKick, msgError,
} from '../src/sim/protocol.js';
import { loadConfig } from './config.js';
import { sanitizeName, dedupeName, clampInput, validateMessage } from './validation.js';
import { RateLimiter, ConnectionCap } from './rateLimiter.js';
import { ReconnectRegistry } from './reconnect.js';

const HANDSHAKE_TIMEOUT_MS = 5000;
const INPUT_RATE_LIMIT_PER_SEC = 70;
const TICK_HZ = 60;

// Create a Room bound to a parsed config. Exposed for in-process testing; main()
// runs the real WebSocketServer when executed directly.
export function createRoom(config) {
  const cfg = config || loadConfig({});
  const sim = new Sim();
  const clients = new Map();      // ws -> { entry, ip, lastInputMs, inputCount }
  const reconnect = new ReconnectRegistry(60000);
  const connLimit = new ConnectionCap(cfg.maxPerIp);
  const authLimit = new RateLimiter(cfg.rateLimit);
  let lobbyMap = cfg.map;
  let tickCount = 0;

  function nowMs() { return Date.now(); }
  function ipOf(ws) { return (ws._socket && ws._socket.remoteAddress) || 'unknown'; }

  function broadcast(messageStr) { for (const c of clients.keys()) { try { c.send(messageStr); } catch {} } }

  function activeNames() {
    const names = [];
    for (const e of clients.values()) if (e.entry && e.entry.player) names.push(e.entry.player.name);
    // include bot names so dedupe avoids "Bot 1" collisions too
    for (const b of sim.bots) names.push(b.name);
    return names;
  }

  function roster() {
    const humans = [];
    for (const e of clients.values()) {
      if (e.entry && e.entry.player) {
        humans.push({
          id: e.entry.player.id, name: e.entry.player.name,
          animal: e.entry.player.animalId, weapon: e.entry.player.loadout.primary,
          isBot: false,
        });
      }
    }
    const bots = sim.bots.map(b => ({
      id: b.id, name: b.name, animal: b.animalId, weapon: b.loadout.primary, isBot: true,
    }));
    return [...humans, ...bots];
  }

  // --- connection lifecycle ---

  function addClient(ws) {
    const ip = ipOf(ws);
    if (!connLimit.canAcquire(ip)) {
      ws.send(msgKick('too many connections'));
      ws.close();
      return false;
    }
    connLimit.acquire(ip);
    clients.set(ws, { entry: null, ip, lastInputMs: 0, inputCount: 0, handshakeTimer: null });
    // Force a handshake within the grace window.
    const rec = clients.get(ws);
    rec.handshakeTimer = setTimeout(() => {
      if (!rec.entry) { try { ws.send(msgKick('handshake timeout')); } catch {} ws.close(); }
    }, HANDSHAKE_TIMEOUT_MS);
    return true;
  }

  function welcomeClient(ws, entry) {
    const { token } = reconnect.mint(entry.player.id, entry.player.id, nowMs());
    ws.send(msgWelcome(entry.player.id, token, lobbyMap, roster()));
    entry.token = token;
  }

  function doAuth(ws, m) {
    const rec = clients.get(ws);
    if (!rec) return;
    const ip = rec.ip;
    if (!authLimit.try(ip, nowMs())) { ws.send(msgKick('rate limit')); ws.close(); return; }
    if (rec.entry) return; // already authed
    // Match running + no free slots? Reject (match is full of humans + bots at maxPlayers).
    if (sim.match.active && sim.freeSlots() <= 0) {
      ws.send(msgKick('Server full')); ws.close(); return;
    }
    const rawName = sanitizeName(m.name) || 'Player';
    const name = dedupeName(rawName, activeNames());
    const animal = m.animal || 'FOX';
    const weapon = m.weapon || 'AR';
    let player;
    if (sim.match.active) {
      // Late join: take over a bot slot.
      player = sim.takeOverBot(name, animal, weapon);
    } else {
      player = sim.addHuman(name, animal, weapon);
    }
    const entry = { player, token: null };
    rec.entry = entry;
    if (rec.handshakeTimer) { clearTimeout(rec.handshakeTimer); rec.handshakeTimer = null; }
    welcomeClient(ws, entry);
    broadcast(msg('roster', { roster: roster() }));
  }

  function doReconnect(ws, m) {
    const rec = clients.get(ws);
    if (!rec || rec.entry) return;
    const res = reconnect.verify(m.id, m.token, nowMs());
    if (!res.ok) { ws.send(msgError('bad_reconnect', 'invalid or expired')); return; }
    const entity = sim.players.find(p => p.id === res.entityId);
    if (!entity) { ws.send(msgError('bad_reconnect', 'entity gone')); return; }
    // Flip the entity (currently bot-controlled) back to human.
    sim.bots = sim.bots.filter(b => b !== entity);
    sim.humans.set(entity.id, entity);
    rec.entry = { player: entity, token: m.token };
    if (rec.handshakeTimer) { clearTimeout(rec.handshakeTimer); rec.handshakeTimer = null; }
    ws.send(msgWelcome(entity.id, m.token, lobbyMap, roster()));
    broadcast(msg('roster', { roster: roster() }));
    if (sim.match.active) {
      ws.send(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    }
    reconnect.drop(m.id); // consume the one-time token
  }

  function handleMessage(ws, raw) {
    const rec = clients.get(ws); if (!rec) return;
    const m = parse(raw);
    const v = validateMessage(m);
    if (!v.ok) { ws.send(msgError(v.code, 'malformed message')); return; }

    // Pre-auth: only auth/reconnect allowed.
    if (!rec.entry) {
      if (m.t === 'auth') return doAuth(ws, m);
      if (m.t === 'reconnect') return doReconnect(ws, m);
      return; // ignore everything else until authed
    }
    const player = rec.entry.player;

    if (m.t === 'loadout') {
      player.animalId = m.animal; player.loadout.primary = m.weapon;
      broadcast(msg('roster', { roster: roster() }));
    } else if (m.t === 'selectMap') {
      if (sim.match.active) { ws.send(msgError('match_in_progress', 'cannot change map now')); return; }
      lobbyMap = m.map;
      broadcast(msgMapSelected(lobbyMap));
    } else if (m.t === 'start') {
      if (sim.match.active) { ws.send(msgError('match_in_progress', 'match already running')); return; }
      const mapId = (m.map && validateMessage(m).ok) ? m.map : lobbyMap;
      sim.startMatch(mapId, cfg.fragTarget, cfg.matchSeconds);
      broadcast(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    } else if (m.t === 'input') {
      if (!sim.match.active) return;
      // Rate-limit inputs (~70/s ceiling over a 1s sliding window).
      const t = nowMs();
      rec.inputCount = (t - rec.lastInputMs < 1000) ? rec.inputCount + 1 : 1;
      rec.lastInputMs = t;
      if (rec.inputCount > INPUT_RATE_LIMIT_PER_SEC) return; // drop flood
      const c = clampInput(m);
      sim.setPlayerIntent(player.id, {
        forward: c.f, strafe: c.s, jump: c.j, sprint: c.sp, crouch: c.c,
        firing: c.fire, reloadRequested: c.reload, yaw: c.yaw, pitch: c.pitch,
      });
    }
  }

  function handleDisconnect(ws) {
    const rec = clients.get(ws); if (!rec) return;
    const ip = rec.ip;
    connLimit.release(ip);
    if (rec.handshakeTimer) clearTimeout(rec.handshakeTimer);
    if (rec.entry && rec.entry.player) {
      const pid = rec.entry.player.id;
      reconnect.mint(pid, pid, nowMs()); // remember for 60s; entity becomes bot below
      sim.handleDisconnect(pid);         // immediately convert to bot (match stays full)
      broadcast(msg('roster', { roster: roster() }));
    }
    clients.delete(ws);
  }

  // operator: start a match from stdin/auto-start
  function operatorStart(mapId) {
    if (sim.match.active) return false;
    const id = mapId || lobbyMap;
    sim.startMatch(id, cfg.fragTarget, cfg.matchSeconds);
    broadcast(msg('matchStart', { map: sim.activeMap.id, fragTarget: sim.match.fragTarget, seconds: sim.match.timeLeft }));
    return true;
  }
  function humanCount() {
    let n = 0; for (const e of clients.values()) if (e.entry && e.entry.player) n++; return n;
  }
  function setLobbyMap(id) { lobbyMap = id; broadcast(msgMapSelected(lobbyMap)); }

  // Advance the sim one tick; broadcast a snapshot every 3rd tick (~20Hz).
  function step(dt) {
    if (!sim.match.active) return;
    sim.tick(dt);
    tickCount++;
    if (tickCount % 3 === 0) broadcast(msg('snapshot', sim.snapshot()));
    if (sim.match.over && !sim.match.active) {
      broadcast(msg('matchEnd', { ranked: sim.ranked() }));
      sim.match.over = false;
      lobbyMap = cfg.map; // reset lobby map to default after a match
    }
  }

  return {
    sim, cfg, reconnect,
    addClient, handleMessage, handleDisconnect, step,
    operatorStart, humanCount, setLobbyMap,
    roster, get lobbyMap() { return lobbyMap; },
  };
}

export function main() {
  const config = loadConfig();
  const wss = new WebSocketServer({ host: config.host, port: config.port });
  const room = createRoom(config);
  let last = Date.now();
  const tickMs = 1000 / TICK_HZ;
  const tickInterval = setInterval(() => {
    const t = Date.now();
    let dt = (t - last) / 1000; last = t;
    if (dt > 0.1) dt = 0.1;
    room.step(dt);
    // auto-start once enough humans are connected
    if (config.autoStart && !room.sim.match.active && room.humanCount() >= config.minPlayers) {
      room.operatorStart();
    }
  }, tickMs);

  // Periodic GC of expired reconnect tokens + rate-limit buckets.
  setInterval(() => {
    room.reconnect.sweep(Date.now());
  }, 30000);

  // Operator stdin commands.
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    const line = chunk.trim();
    if (!line) return;
    const [cmd, ...rest] = line.split(/\s+/);
    if (cmd === 'start') {
      const ok = room.operatorStart(rest[0]);
      console.log(ok ? `match started` : `match already running`);
    } else if (cmd === 'map') {
      room.setLobbyMap(rest[0]);
      console.log(`lobby map set to ${rest[0]}`);
    } else if (cmd === 'status') {
      console.log(`match.active=${room.sim.match.active} humans=${room.humanCount()} lobby=${room.lobbyMap}`);
    } else if (cmd === 'stop') {
      clearInterval(tickInterval); wss.close(); process.exit(0);
    } else {
      console.log(`commands: start [map] | map <id> | status | stop`);
    }
  });

  wss.on('connection', (ws) => {
    if (!room.addClient(ws)) return;
    ws.on('message', (data) => room.handleMessage(ws, data.toString()));
    ws.on('close', () => room.handleDisconnect(ws));
    ws.on('error', () => room.handleDisconnect(ws));
  });

  const display = config.host === '0.0.0.0' ? '<this-machine-ip>' : config.host;
  console.log(`AnimalStrike dedicated server listening on ws://${config.host}:${config.port}`);
  console.log(`Players connect to: ws://<your-ip>:${config.port}  (LAN/public: ${display})`);
  console.log(`Config: maxPlayers=${config.maxPlayers} map=${config.map} fragTarget=${config.fragTarget} matchSeconds=${config.matchSeconds} autoStart=${config.autoStart}`);
}

// Run main only when executed directly (`node server/index.js`), not when imported.
const isDirect = process.argv[1] && process.argv[1].endsWith('server/index.js');
if (isDirect) main();
```

- [ ] **Step 2: Syntax check**

Run: `node --check server/index.js`
Expected: no output (success)

- [ ] **Step 3: Commit (tests come in Task 8)**

```bash
git add server/index.js
git commit -m "feat(server): dedicated Room (no host) + config/validation/reconnect wiring + main()"
```

---

## Task 8: Integration test rewrite (`src/tests/server.integration.test.js`)

The existing test used the old `hello`/host protocol. Rewrite it for `auth`/any-player-start, and add bot-replacement + reconnect + late-join + anti-cheat cases.

**Files:**
- Rewrite: `src/tests/server.integration.test.js`

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `src/tests/server.integration.test.js` with:
```js
import { describe, it, expect } from 'vitest';
import { createRoom } from '../../server/index.js';
import { loadConfig } from '../../server/config.js';

// A fake socket that records sent messages and supports .close().
function fakeSocket(ip = '1.1.1.1') {
  const sent = [];
  const ws = {
    _socket: { remoteAddress: ip },
    send: (m) => sent.push(JSON.parse(m)),
    close: () => { ws._closed = true; },
    _closed: false,
  };
  ws._sent = sent;
  return ws;
}

const cfg = () => loadConfig({ argv: [], env: {} });

describe('dedicated server room (integration)', () => {
  it('createRoom() builds a room wired to a sim', () => {
    const room = createRoom(cfg());
    expect(room.sim).toBeDefined();
    expect(typeof room.addClient).toBe('function');
    expect(typeof room.handleMessage).toBe('function');
    expect(typeof room.step).toBe('function');
    expect(room.lobbyMap).toBe('plaza');
  });

  it('auth adds a human, sends welcome with token+map+roster, broadcasts roster', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'Rico', animal: 'FOX', weapon: 'AR' }));
    const welcome = ws._sent.find(m => m.t === 'welcome');
    expect(welcome).toBeDefined();
    expect(welcome.you).toBeDefined();
    expect(welcome.token).toBeTruthy();
    expect(welcome.map).toBe('plaza');
    expect(welcome.roster.some(r => r.name === 'Rico' && !r.isBot)).toBe(true);
    expect(room.sim.humans.size).toBe(1);
  });

  it('any player can start the match (no host concept); matchStart broadcasts', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start', map: 'plaza' }));
    expect(ws._sent.some(m => m.t === 'matchStart')).toBe(true);
    expect(room.sim.match.active).toBe(true);
    room.step(1 / 60); room.step(1 / 60); room.step(1 / 60);
    expect(ws._sent.some(m => m.t === 'snapshot')).toBe(true);
  });

  it('input message is clamped and sets the player intent', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const playerId = ws._sent[0].you;
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    // forward=999 should be clamped to 1
    room.handleMessage(ws, JSON.stringify({ t: 'input', seq: 1, f: 999, s: 0, j: false, sp: false, c: false, fire: false, reload: false, yaw: 0, pitch: 0 }));
    const intent = room.sim._intents.get(playerId);
    expect(intent).toBeDefined();
    expect(intent.forward).toBe(1);
  });

  it('selectMap in the lobby changes the lobby map and broadcasts mapSelected', () => {
    const room = createRoom(cfg());
    const a = fakeSocket(); const b = fakeSocket('2.2.2.2');
    room.addClient(a); room.addClient(b);
    room.handleMessage(a, JSON.stringify({ t: 'auth', name: 'A', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(b, JSON.stringify({ t: 'auth', name: 'B', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(a, JSON.stringify({ t: 'selectMap', map: 'foundry' }));
    expect(room.lobbyMap).toBe('foundry');
    expect(b._sent.some(m => m.t === 'mapSelected' && m.map === 'foundry')).toBe(true);
  });

  it('selectMap during a match is rejected with an error', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    room.handleMessage(ws, JSON.stringify({ t: 'selectMap', map: 'dustbowl' }));
    expect(ws._sent.some(m => m.t === 'error' && m.code === 'match_in_progress')).toBe(true);
    expect(room.lobbyMap).toBe('plaza');
  });

  it('a late-joining human takes over a bot slot (match stays full)', () => {
    const room = createRoom(cfg());
    const host = fakeSocket();
    room.addClient(host);
    room.handleMessage(host, JSON.stringify({ t: 'auth', name: 'Host', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(host, JSON.stringify({ t: 'start' }));
    const playersBefore = room.sim.players.length;
    const botsBefore = room.sim.bots.length;
    const humansBefore = room.sim.humans.size;
    // a second client joins mid-match
    const joiner = fakeSocket('3.3.3.3');
    room.addClient(joiner);
    room.handleMessage(joiner, JSON.stringify({ t: 'auth', name: 'Late', animal: 'WOLF', weapon: 'AR' }));
    expect(room.sim.players.length).toBe(playersBefore);  // still full
    expect(room.sim.bots.length).toBe(botsBefore - 1);    // one bot replaced
    expect(room.sim.humans.size).toBe(humansBefore + 1);
  });

  it('a full match rejects a further late join with kick "Server full"', () => {
    const room = createRoom(cfg());
    // Fill every slot with humans.
    const ips = ['1.1.1.1','2.2.2.2','3.3.3.3','4.4.4.4','5.5.5.5','6.6.6.6'];
    const clients = ips.map(ip => { const ws = fakeSocket(ip); room.addClient(ws); return ws; });
    for (const ws of clients) room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(clients[0], JSON.stringify({ t: 'start' }));
    // 7th client (different IP) should be kicked — all 6 slots are human.
    const extra = fakeSocket('7.7.7.7');
    room.addClient(extra);
    room.handleMessage(extra, JSON.stringify({ t: 'auth', name: 'Extra', animal: 'FOX', weapon: 'AR' }));
    expect(extra._sent.some(m => m.t === 'kick' && /full/i.test(m.reason))).toBe(true);
  });

  it('disconnect immediately converts the human to a bot (match never short)', () => {
    const room = createRoom(cfg());
    const a = fakeSocket(); const b = fakeSocket('9.9.9.9');
    room.addClient(a); room.addClient(b);
    room.handleMessage(a, JSON.stringify({ t: 'auth', name: 'A', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(b, JSON.stringify({ t: 'auth', name: 'B', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(a, JSON.stringify({ t: 'start' }));
    const playersBefore = room.sim.players.length;
    const aId = a._sent[0].you;
    room.handleDisconnect(a);
    expect(room.sim.humans.has(aId)).toBe(false);
    expect(room.sim.players.length).toBe(playersBefore); // still full (a became a bot)
  });

  it('reconnect within grace flips the bot back to human (score retained)', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    const welcome = ws._sent.find(m => m.t === 'welcome');
    const id = welcome.you, token = welcome.token;
    const entity = room.sim.humans.get(id);
    entity.score = 7;
    // disconnect -> becomes a bot
    room.handleDisconnect(ws);
    expect(room.sim.bots.includes(entity)).toBe(true);
    expect(room.sim.humans.has(id)).toBe(false);
    // reconnect within grace
    const ws2 = fakeSocket('1.1.1.1');
    room.addClient(ws2);
    room.handleMessage(ws2, JSON.stringify({ t: 'reconnect', id, token }));
    expect(room.sim.humans.has(id)).toBe(true);
    expect(room.sim.bots.includes(entity)).toBe(false);
    expect(entity.score).toBe(7); // retained
  });

  it('reconnect with a bad token is rejected with bad_reconnect', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    const id = ws._sent[0].you;
    room.handleDisconnect(ws);
    const ws2 = fakeSocket('1.1.1.1');
    room.addClient(ws2);
    room.handleMessage(ws2, JSON.stringify({ t: 'reconnect', id, token: 'bogus' }));
    expect(ws2._sent.some(m => m.t === 'error' && m.code === 'bad_reconnect')).toBe(true);
  });

  it('anti-cheat: fire=true faster than fire rate produces no extra shots', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'start' }));
    // Send 200 fire=true inputs in the same tick window; the server's weapon
    // (WeaponController) enforces nextFireTime so only a handful actually fire.
    let shots = 0;
    for (let i = 0; i < 200; i++) {
      room.handleMessage(ws, JSON.stringify({ t: 'input', seq: i, f: 0, s: 0, j: false, sp: false, c: false, fire: true, reload: false, yaw: 0, pitch: 0 }));
    }
    const before = room.sim.events.filter(e => e.k === 'shot').length;
    room.step(1 / 60);
    const after = room.sim.events.filter(e => e.k === 'shot').length;
    expect(after - before).toBeLessThan(20); // not 200 — server rate-limits firing
  });

  it('unknown message type is rejected with error and connection stays open', () => {
    const room = createRoom(cfg());
    const ws = fakeSocket();
    room.addClient(ws);
    room.handleMessage(ws, JSON.stringify({ t: 'auth', name: 'P', animal: 'FOX', weapon: 'AR' }));
    room.handleMessage(ws, JSON.stringify({ t: 'teleport', x: 999 }));
    expect(ws._sent.some(m => m.t === 'error' && m.code === 'unknown_type')).toBe(true);
    // still authed — connection survived
    expect(room.sim.humans.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run src/tests/server.integration.test.js`
Expected: PASS (all new cases)

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add src/tests/server.integration.test.js
git commit -m "test(server): dedicated-server integration (auth/start/late-join/reconnect/anti-cheat)"
```

---

## Task 9: NetClient — new messages + reconnect persistence (`src/net/NetClient.js`)

Extend the browser client to send `auth`/`reconnect`/`selectMap`, persist `{id, token}` to `localStorage`, and expose the new server→client callbacks (`onMapSelected`, `onKick`, `onError`).

**Files:**
- Modify: `src/net/NetClient.js`

- [ ] **Step 1: Rewrite `src/net/NetClient.js`**

Replace the entire contents of `src/net/NetClient.js` with:
```js
import { msg, parse } from '../sim/protocol.js';
import {
  msgAuth, msgReconnect, msgSelectMap, msgKick as _mk, msgError as _me,
} from '../sim/protocol.js';

// Browser WebSocket client for the dedicated server. Connects, sends inputs,
// exposes received messages via callbacks. No THREE — pure transport.
// Persists {id, token} to localStorage for reconnect across reloads.
const LS_KEY = 'as_reconnect';

export class NetClient {
  constructor() {
    this.ws = null;
    this.you = null;
    this.token = null;
    this.connected = false;
    this.onWelcome = null;      // ({you, token, map, roster})
    this.onRoster = null;       // (roster)
    this.onMatchStart = null;   // ({map, fragTarget, seconds})
    this.onSnapshot = null;     // (snapshot)
    this.onMatchEnd = null;     // (ranked)
    this.onMapSelected = null;  // ({map})
    this.onKick = null;         // ({reason})
    this.onError = null;        // ({code, msg})
    this.onDisconnect = null;   // ()
    this._inputSeq = 0;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) { reject(e); return; }
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = (e) => { reject(e); };
      this.ws.onmessage = (ev) => this._handle(parse(ev.data));
      this.ws.onclose = () => { this.connected = false; if (this.onDisconnect) this.onDisconnect(); };
    });
  }

  // Join the server. If a prior {id,token} is stored and still valid, attempt a
  // reconnect first; the server replies with bad_reconnect if expired, and the
  // caller can fall back to a fresh auth.
  hello(name, animal, weapon) {
    const saved = this._loadSaved();
    if (saved && saved.id && saved.token) {
      this._send(msgReconnect(saved.id, saved.token));
      // stash the fallback so a bad_reconnect can re-auth
      this._pendingAuth = { name, animal, weapon };
    } else {
      this._send(msgAuth(name, animal, weapon));
    }
  }

  setLoadout(animal, weapon) { this._send(msg('loadout', { animal, weapon })); }
  selectMap(map) { this._send(msgSelectMap(map)); }
  start(map) { this._send(msg('start', { map })); }

  sendInput(intent) {
    this._inputSeq++;
    this._send(msg('input', {
      seq: this._inputSeq, f: intent.forward, s: intent.strafe, j: intent.jump,
      sp: intent.sprint, c: intent.crouch, fire: intent.firing,
      reload: intent.reloadRequested, yaw: intent.yaw, pitch: intent.pitch,
    }));
  }

  _handle(m) {
    if (!m) return;
    if (m.t === 'welcome') {
      this.you = m.you; this.token = m.token;
      this._saveSaved({ id: m.you, token: m.token });
      if (this._pendingAuth) this._pendingAuth = null; // reconnect succeeded
      if (this.onWelcome) this.onWelcome(m);
    } else if (m.t === 'roster' && this.onRoster) this.onRoster(m.roster);
    else if (m.t === 'mapSelected' && this.onMapSelected) this.onMapSelected(m);
    else if (m.t === 'matchStart' && this.onMatchStart) this.onMatchStart(m);
    else if (m.t === 'snapshot' && this.onSnapshot) this.onSnapshot(m);
    else if (m.t === 'matchEnd' && this.onMatchEnd) this.onMatchEnd(m.ranked);
    else if (m.t === 'kick') { if (this.onKick) this.onKick(m); this.close(); }
    else if (m.t === 'error') {
      if (m.code === 'bad_reconnect' && this._pendingAuth) {
        // fall back to a fresh auth
        const { name, animal, weapon } = this._pendingAuth;
        this._pendingAuth = null;
        this._send(msgAuth(name, animal, weapon));
        return;
      }
      if (this.onError) this.onError(m);
    }
  }

  _send(s) { if (this.ws && this.ws.readyState === 1) this.ws.send(s); }

  _loadSaved() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  _saveSaved(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {} }
  clearSaved() { try { localStorage.removeItem(LS_KEY); } catch {} }

  close() { if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/net/NetClient.js`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add src/net/NetClient.js
git commit -m "feat(net): NetClient — auth/reconnect/selectMap + token persistence"
```

---

## Task 10: MainMenu — Single / Connect + live lobby map picker (`src/ui/MainMenu.js`)

Drop the "Host" mode. Modes become Single Player / Connect. In Connect mode, show the server address field + a live map picker (any player can change the map). The Play button label adapts.

**Files:**
- Rewrite: `src/ui/MainMenu.js`

- [ ] **Step 1: Rewrite `src/ui/MainMenu.js`**

Replace the entire contents of `src/ui/MainMenu.js` with:
```js
import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { WEAPONS } from '../config/Weapons.js';
import { MAPS } from '../world/Maps.js';
import { WEAPON_SKINS, DEFAULT_SKIN } from '../config/WeaponSkins.js';

const MODES = [
  { id: 'single', label: 'Single Player', desc: 'vs bots, local' },
  { id: 'connect', label: 'Connect',      desc: 'join a server' },
];

export class MainMenu {
  constructor(root, { onStart, onToggleSettings } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onToggleSettings = onToggleSettings;
    this.selectedAnimal = localStorage.getItem('as_animal') || 'FOX';
    this.selectedWeapon = localStorage.getItem('as_weapon') || 'AR';
    this.selectedMap = localStorage.getItem('as_map') || MAPS[0].id;
    this.rotateMaps = localStorage.getItem('as_rotate') !== 'false'; // default true
    // Migrate any old 'host' selection to 'single' (host mode is removed).
    const savedMode = localStorage.getItem('as_mode');
    this.selectedMode = (savedMode === 'connect') ? 'connect' : 'single';
    this.joinAddress = localStorage.getItem('as_join_addr') || 'localhost:8080';
    this.selectedSkin = localStorage.getItem('as_skin') || DEFAULT_SKIN;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(10,14,20,.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;overflow:auto;padding:20px;`;
    this.render();
    root.appendChild(this.el);
  }

  render() {
    const isConnect = this.selectedMode === 'connect';
    const playLabel = isConnect ? 'CONNECT' : 'PLAY';
    this.el.innerHTML = `
      <h1 style="font-size:44px;margin:0 0 8px;letter-spacing:2px;">ANIMAL<span style="color:#ffb84d">STRIKE</span></h1>
      <p style="opacity:.7;margin:0 0 18px;">Pick your animal and weapon</p>

      <div style="display:flex;gap:10px;margin-bottom:18px;">
        ${MODES.map(m => `<button data-mode="${m.id}" style="
          background:${this.selectedMode===m.id?'#ffb84d':'#222'};color:#fff;border:none;
          padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;">
          ${m.label}<br><small style="opacity:.6">${m.desc}</small>
        </button>`).join('')}
      </div>

      <div style="display:flex;gap:24px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;max-width:820px;">
        ${ANIMAL_IDS.map(id => {
          const a = ANIMALS[id];
          return `<button data-animal="${id}" style="
            background:${this.selectedAnimal===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:12px 16px;border-radius:8px;cursor:pointer;font-size:14px;text-align:left;">
            ${a.name} <small style="opacity:.6">${a.role}</small><br>
            <small style="opacity:.75">spd ×${a.speedMul.toFixed(2)} hp ×${a.hpMul.toFixed(2)} jmp ×${a.jumpMul.toFixed(2)}</small>
          </button>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;justify-content:center;">
        ${Object.keys(WEAPONS).map(id => `
          <button data-weapon="${id}" style="
            background:${this.selectedWeapon===id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 18px;border-radius:8px;cursor:pointer;">
            ${WEAPONS[id].name}<br><small style="opacity:.6">hs ×${WEAPONS[id].headshotMul.toFixed(1)}</small>
          </button>`).join('')}
      </div>
      <div style="margin-bottom:18px;">
        <div style="opacity:.6;font-size:12px;margin-bottom:6px;text-align:center;">WEAPON SKIN</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:760px;">
          ${WEAPON_SKINS.map(s => {
            const swatch = '#' + s.color.toString(16).padStart(6, '0');
            return `<button data-skin="${s.id}" style="
              background:${this.selectedSkin===s.id?'#ffb84d':'#222'};color:#fff;border:none;
              padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${swatch};border:1px solid #555;"></span>${s.name}
            </button>`;
          }).join('')}
        </div>
      </div>

      ${isConnect ? `
        <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <label style="opacity:.7;font-size:14px;">Server address:</label>
          <input id="join-addr" value="${this.joinAddress}" placeholder="ip:port"
            style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:8px 12px;font-size:14px;width:220px;">
        </div>` : ''}

      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;justify-content:center;max-width:820px;">
        ${MAPS.map(m => `
          <button data-map="${m.id}" style="
            background:${this.selectedMap===m.id?'#ffb84d':'#222'};color:#fff;border:none;
            padding:10px 16px;border-radius:8px;cursor:pointer;text-align:left;max-width:200px;">
            ${m.name}<br><small style="opacity:.6">${m.desc}</small>
          </button>`).join('')}
      </div>

      ${!isConnect ? `
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:20px;color:#fff;font-size:14px;cursor:pointer;">
          <input type="checkbox" id="rotate-maps" ${this.rotateMaps?'checked':''} style="width:18px;height:18px;">
          <span>🔄 Rotate maps after each match</span>
        </label>` : `
        <div style="margin-bottom:16px;opacity:.7;font-size:13px;max-width:560px;text-align:center;">
          Connect mode: enter the server's address (e.g. 192.168.1.5:8080). Anyone in the lobby can pick the map and start the match.
        </div>`}

      <button id="play-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 48px;
        border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">${playLabel}</button>
      <button id="settings-btn" style="margin-top:12px;background:#444;color:#fff;border:none;padding:8px 24px;
        border-radius:8px;cursor:pointer;">SETTINGS</button>`;

    this.el.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => { this.selectedMode = b.dataset.mode; localStorage.setItem('as_mode', this.selectedMode); this.render(); };
    });
    this.el.querySelectorAll('[data-animal]').forEach(b => {
      b.onclick = () => { this.selectedAnimal = b.dataset.animal; localStorage.setItem('as_animal', this.selectedAnimal); this.render(); };
    });
    this.el.querySelectorAll('[data-weapon]').forEach(b => {
      b.onclick = () => { this.selectedWeapon = b.dataset.weapon; localStorage.setItem('as_weapon', this.selectedWeapon); this.render(); };
    });
    this.el.querySelectorAll('[data-skin]').forEach(b => {
      b.onclick = () => { this.selectedSkin = b.dataset.skin; localStorage.setItem('as_skin', this.selectedSkin); this.render(); };
    });
    this.el.querySelectorAll('[data-map]').forEach(b => {
      b.onclick = () => { this.selectedMap = b.dataset.map; localStorage.setItem('as_map', this.selectedMap); this.render(); };
    });
    const rotateCb = this.el.querySelector('#rotate-maps');
    if (rotateCb) rotateCb.onchange = () => { this.rotateMaps = rotateCb.checked; localStorage.setItem('as_rotate', this.rotateMaps); };
    const joinInput = this.el.querySelector('#join-addr');
    if (joinInput) joinInput.oninput = () => { this.joinAddress = joinInput.value; localStorage.setItem('as_join_addr', this.joinAddress); };
    this.el.querySelector('#play-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onStart) this.onStart({
        mode: this.selectedMode,
        animal: this.selectedAnimal,
        weapon: this.selectedWeapon,
        skin: this.selectedSkin,
        map: this.selectedMap,
        rotate: this.rotateMaps,
        address: this.joinAddress,
      });
    };
    const settingsBtn = this.el.querySelector('#settings-btn');
    if (settingsBtn) settingsBtn.onclick = () => { if (this.onToggleSettings) this.onToggleSettings(); };
  }
  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
  // Called by Game.returnToMenu to advance the rotation: highlights the next map.
  setSelectedMap(id) {
    if (MAPS.some(m => m.id === id)) {
      this.selectedMap = id;
      localStorage.setItem('as_map', id);
    }
  }
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check src/ui/MainMenu.js`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add src/ui/MainMenu.js
git commit -m "feat(ui): Single/Connect modes + live lobby map picker (Host removed)"
```

---

## Task 11: Game.js — Connect-only multiplayer bootstrap (`src/core/Game.js`)

Update the multiplayer bootstrap to: connect to `ws://<address>` (never `ws://localhost` as host), drive map selection from `mapSelected` broadcasts, send `selectMap` when the local player changes the map, and wire the new NetClient callbacks (`onMapSelected`, `onKick`, `onError`).

**Files:**
- Modify: `src/core/Game.js` (the `startMultiplayer`/`frameMultiplayer`/`cleanupMultiplayer` area, around lines 455–680)

- [ ] **Step 1: Update the multiplayer bootstrap**

In `src/core/Game.js`, find the `startMultiplayer(mode, animalId, weaponId, mapId, address)` method (around line 458). Replace the URL construction and the callback wiring so that:
- The URL is always `ws://${address}` (the `'host'` branch that used `ws://localhost:8080` is removed — `startMultiplayer` is now only called for `mode === 'connect'`).
- `netClient.onWelcome` keeps the same body but no longer calls `netClient.start(...)` (no host concept — the lobby waits for a player START).
- Add `netClient.onMapSelected = (m) => { ... }` that updates `this.menu.setSelectedMap(m.map)` and stores the selected map so `matchStart` uses it.
- Add `netClient.onKick = (m) => { this.hud.addKill('Kicked: ' + m.reason); this.returnToMenu(); }`.
- Add `netClient.onError = (m) => { this.hud.addKill('Server error: ' + m.msg); }`.

Concretely, replace the block starting `const url = mode === 'host'` ... through the end of `this.netClient.onDisconnect = ...` with:
```js
    // Connect-only: every multiplayer client joins the dedicated server by address.
    const url = `ws://${address}`;
    this.netClient = new NetClient();
    this.netClient.onWelcome = (m) => {
      this.mpLocalId = m.you;
      this.menu.setSelectedMap(m.map);
      this.mpMap = m.map;
      this.hud.setWeapon(WEAPONS[weaponId].name);
      this.hud.setWeaponIcon(weaponId);
      this.firstPersonView.setWeapon(weaponId);
    };
    this.netClient.onMapSelected = (m) => {
      this.mpMap = m.map;
      this.menu.setSelectedMap(m.map);
    };
    this.netClient.onMatchStart = (m) => {
      const map = getMapById(m.map) || this.activeMap;
      if (map.id !== this.activeMap.id) this.loadMap(map);
      this.match = { active: true, timeLeft: m.seconds, fragTarget: m.fragTarget, over: false };
      resumeAudio();
      this.music.play('combat');
      this.firstPersonView.endReload();
      this.player = createPlayer({ id: this.mpLocalId, isLocal: true, position: new THREE.Vector3(0, 1, 15), animalId });
      this.applyAnimalStats(this.player, animalId);
      this.player.view = new CharacterView(this.scene);
      this.player.view.setAnimal(animalId);
      this.player.view.setWeapon(weaponId);
      this.player.view.setVisible(false);
      this.weapon = new WeaponController(WEAPONS[weaponId]);
      this.input.requestPointerLock();
      this.remoteView = new RemoteView(this.scene);
      this.mpActive = true;
    };
    this.netClient.onSnapshot = (snap) => {
      if (this.remoteView) this.remoteView.pushSnapshot(snap);
      const me = snap.players.find(p => p.id === this.mpLocalId);
      if (me && this.player) {
        this.player.health = me.hp;
        this.player.position.x += (me.x - this.player.position.x) * 0.15;
        this.player.position.y += (me.y - this.player.position.y) * 0.15;
        this.player.position.z += (me.z - this.player.position.z) * 0.15;
        this.player.alive = me.alive;
        this.hud.setAmmo(me.ammo, this.weapon.def.mag);
      }
      this.match.timeLeft = snap.timeLeft;
    };
    this.netClient.onMatchEnd = (ranked) => {
      this.pauseMenu.hide();
      this.paused = false;
      this.match.active = false; this.match.over = true;
      if (document.pointerLockElement) document.exitPointerLock();
      this.music.play('menu');
      this.endScreen.show(ranked.map(r => ({ ...r, isLocal: r.id === this.mpLocalId })));
    };
    this.netClient.onKick = (m) => {
      this.hud.addKill('Kicked: ' + (m.reason || ''));
      this.returnToMenu();
    };
    this.netClient.onError = (m) => {
      this.hud.addKill('Server error: ' + (m.msg || m.code || ''));
    };
    this.netClient.onDisconnect = () => {
      this.hud.addKill('Disconnected from server.');
      this.returnToMenu();
    };
    this.menu.hide();
    try {
      await this.netClient.connect(url);
      this.netClient.hello('You', animalId, weaponId);
    } catch (e) {
      this.hud.addKill('Could not connect to ' + url);
      this.menu.show();
    }
```

- [ ] **Step 2: Guard `startMultiplayer` to Connect-only**

Find the `onStart` handler that calls `startMultiplayer`. Change its guard so that only `mode === 'connect'` enters multiplayer; any other value (including a leftover `'host'` from old localStorage) falls through to single-player. Concretely, the dispatch should look like:
```js
    if (mode === 'connect') {
      this.startMultiplayer(mode, animal, weapon, map, address);
    } else {
      this.startMatch(animal, weapon, map);  // single player (existing path)
    }
```
(The exact surrounding code may vary; the intent is: `'host'` is no longer a recognized mode — old saved selections are silently treated as single-player.)

- [ ] **Step 3: Send `selectMap` when the local player changes the map in Connect mode**

The menu's map buttons already fire on click. In Connect mode, when the player picks a map *before* connecting or while in the lobby, send it to the server. Add to the `startMultiplayer` body, after `onWelcome` is set up, a one-time hook: since the menu is hidden once connected, map changes happen pre-connect via the menu's `selectedMap`. The simplest wiring is to send the current `mapId` right after `hello`:
```js
      this.netClient.hello('You', animalId, weaponId);
      this.netClient.selectMap(mapId);
```
(If the server rejects it because a match is already running, the client just ignores the `error` — harmless.)

- [ ] **Step 4: Provide a START control in the lobby**

The lobby needs a way for any player to start the match. The simplest: in `onWelcome`, if no match is active yet, show a brief HUD prompt and bind a key (e.g. **Enter**) to send `start`. Add to the `onWelcome` handler:
```js
      this.mpStartListener = (e) => {
        if (e.key === 'Enter' && this.netClient && !this.match.active) {
          this.netClient.start(this.mpMap);
        }
      };
      window.addEventListener('keydown', this.mpStartListener);
```
And in `cleanupMultiplayer`, remove it:
```js
    if (this.mpStartListener) { window.removeEventListener('keydown', this.mpStartListener); this.mpStartListener = null; }
```
Also in `onMatchStart` and `onDisconnect`/`onKick`/`returnToMenu`, the listener is cleared via `cleanupMultiplayer()` (already called by `returnToMenu`).

- [ ] **Step 5: Syntax check**

Run: `node --check src/core/Game.js`
Expected: no output (success)

- [ ] **Step 6: Commit**

```bash
git add src/core/Game.js
git commit -m "feat(core): Connect-only multiplayer bootstrap + map/start wiring"
```

---

## Task 12: Rename `host` script → `server`; update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Rename the npm script**

In `package.json`, change:
```json
    "host": "node server/index.js"
```
to:
```json
    "server": "node server/index.js"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: rename npm script host → server"
```

---

## Task 13: Deployment guide (`docs/multiplayer-deployment.md` + `server/README.md`)

Docs-only NAT/firewall guidance + a simple local/LAN/cloud deployment walkthrough.

**Files:**
- Rewrite: `server/README.md`
- Create: `docs/multiplayer-deployment.md`

- [ ] **Step 1: Rewrite `server/README.md`**

Replace the entire contents of `server/README.md` with:
```markdown
# AnimalStrike — Dedicated Server

A standalone Node WebSocket server that runs the **authoritative game simulation**. It is an always-on process: clients connect to it by `IP:port` and never host games themselves. Empty slots fill with bots so every match is full; when a human joins mid-match they take over a bot's slot.

This is **not** peer-hosted and **not** internet matchmaking. Players connect directly to this server on a LAN or over the internet.

## Run the server

From the project root:

```bash
npm install          # installs client + server deps (incl. ws) at the project root
npm run server       # starts the WebSocket server on :8080
```

The server listens on `ws://0.0.0.0:8080` by default. Configure it via env vars, CLI flags, or a `server/config.json` file (see `server/config.example.json`).

```bash
# env vars
AS_PORT=9000 AS_MAX_PLAYERS=8 npm run server

# CLI flags
npm run server -- --port 9000 --max-players 8

# config file (precedence: CLI > env > file > defaults)
cp server/config.example.json server/config.json
$EDITOR server/config.json
npm run server
```

On startup it prints the address to share:

```
AnimalStrike dedicated server listening on ws://0.0.0.0:8080
Players connect to: ws://<your-ip>:8080
Config: maxPlayers=6 map=plaza fragTarget=25 matchSeconds=300 autoStart=false
```

## Operator commands (stdin)

While the server runs, you can type into its terminal:

| Command | Effect |
|---|---|
| `start [map]` | Start a match now (optional map id) |
| `map <id>` | Set the lobby's selected map |
| `status` | Print match/human/lobby state |
| `stop` | Stop the server |

You can also set `autoStart: true` (or `AS_AUTO_START=true` / `--auto-start`) to auto-start a match once `minPlayers` humans have connected.

## Configuration reference

| Setting | Env | CLI | Default | Notes |
|---|---|---|---|---|
| Bind host | `AS_HOST` | `--host` | `0.0.0.0` | |
| Bind port | `AS_PORT` | `--port` | `8080` | 1–65535 |
| Max players | `AS_MAX_PLAYERS` | `--max-players` | `6` | 2–16 |
| Min players (auto-start) | `AS_MIN_PLAYERS` | `--min-players` | `2` | |
| Match map | `AS_MAP` | — | `plaza` | must be a known map id |
| Frag target | `AS_FRAG_TARGET` | — | `25` | |
| Match seconds | `AS_MATCH_SECONDS` | — | `300` | |
| Auto-start | `AS_AUTO_START` | `--auto-start` | `false` | |
| Max connections per IP | `AS_MAX_PER_IP` | — | `4` | anti-spam |

## How it works

- The server owns one authoritative `Sim` (see `src/sim/Sim.js`) — it runs movement, collision, hit detection, and scoring headlessly.
- Clients send only their **inputs** (movement + aim) and **render** the snapshots the server broadcasts at ~20Hz.
- The match is always full: humans fill slots first, bots backfill the rest. A late-joining human takes over a bot; a leaving human's slot becomes a bot.
- Any connected player can change the map and start the match from the lobby.
- If a player drops, they have 60 seconds to reconnect and reclaim their slot (score retained); after that the bot keeps the slot.
- The server validates inputs (movement clamped to valid ranges, fire-rate enforced server-side) so a client cannot cheat movement or fire faster than the weapon allows.

## Connecting

Open the game in a browser, pick **Connect**, enter the server's `ip:port` (e.g. `192.168.1.5:8080`), and press **CONNECT**. Wait in the lobby — anyone can pick the map and press **Enter** (or the Start control) to begin.

## Over the internet / NAT

See `docs/multiplayer-deployment.md` for LAN, port-forwarding, firewall, and cloud/VPS setup.
```

- [ ] **Step 2: Create `docs/multiplayer-deployment.md`**

Create `docs/multiplayer-deployment.md`:
```markdown
# AnimalStrike Multiplayer — Deployment Guide

The AnimalStrike multiplayer uses a **dedicated server**: a standalone Node process that owns the authoritative simulation. Clients connect to it by `IP:port`. This guide covers the common deployment scenarios and the NAT/firewall considerations for each.

The browser's WebSocket client cannot perform NAT traversal on its own, so the server must be reachable at a known address. Pick the scenario that matches where you're hosting.

---

## 1. Same machine (local testing)

Run the server and play on one machine:

```bash
npm install
npm run server          # terminal 1: server on :8080
npm run dev             # terminal 2: Vite dev server (the game)
```

Open the game, pick **Connect**, enter `localhost:8080`, **CONNECT**. Open a second browser tab and connect again to see two players + bots.

---

## 2. LAN (same network)

Best for a home/office LAN — no router configuration needed.

1. On the host machine, start the server: `npm run server`.
2. Find the host's LAN IP:
   - **Linux:** `ip addr` (look for `inet 192.168.x.x` under your interface)
   - **macOS:** `ifconfig` or System Settings → Network
   - **Windows:** `ipconfig` (look for `IPv4 Address`)
3. Make sure the local firewall allows inbound TCP on the port (the server uses TCP via WebSocket):
   - **Linux (ufw):** `sudo ufw allow 8080/tcp`
   - **Windows:** allow Node through Windows Defender Firewall when prompted, or add an inbound rule for TCP 8080.
4. On each player's machine, open the game, pick **Connect**, enter `<host-LAN-IP>:8080`, **CONNECT**.

---

## 3. Over the internet (home-hosted)

For friends outside your LAN. The host must expose the port to the public internet.

1. Start the server: `npm run server` (binds to `0.0.0.0` — all interfaces).
2. **Port-forward** the port (default `8080/tcp`) on your router to the host machine's LAN IP. Steps vary by router: look for "Port Forwarding" / "Virtual Server" in the router admin UI (usually at `http://192.168.1.1`). Forward **TCP** `8080` → host LAN IP `:8080`.
3. Open the port in the host firewall (see §2).
4. Find your **public** IP: visit `https://ifconfig.me` from the host, or run `curl ifconfig.me`.
5. Share `<public-ip>:8080` with your friends. They pick **Connect**, enter it, **CONNECT**.

**Notes:**
- Your public IP may change when your router reboots (most home ISPs use dynamic IPs). Consider a dynamic DNS service for a stable hostname.
- Some ISPs use Carrier-Grade NAT (CGNAT) which blocks inbound connections entirely. If port-forwarding doesn't work and you can't reach your server, CGNAT is the likely cause — use the cloud option (§4) instead.

---

## 4. Cloud / VPS (recommended for "always on")

The simplest path to a reliably-reachable server: rent a small Linux VM (any cloud provider) with a **public IP**. There's no NAT to traverse — clients connect to the VM's public IP directly.

### Setup

1. Spin up a small Linux VM (1 vCPU / 1 GB RAM is plenty). Note its public IP.
2. Install Node.js 20+ and git, clone the repo, install deps:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm git
   git clone <your-repo-url> animalstrike && cd animalstrike
   npm install
   ```
3. Open the firewall: `sudo ufw allow 8080/tcp`.
4. Run the server under a process manager so it restarts on crash/reboot.

### systemd unit (recommended)

Create `/etc/systemd/system/animalstrike.service`:
```ini
[Unit]
Description=AnimalStrike dedicated server
After=network.target

[Service]
Type=simple
User=animalstrike
WorkingDirectory=/home/animalstrike/animalstrike
ExecStart=/usr/bin/npm run server
Restart=on-failure
RestartSec=3
# Optional config via environment:
Environment=AS_PORT=8080
Environment=AS_MAX_PLAYERS=8

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now animalstrike
sudo journalctl -u animalstrike -f   # tail logs
```

### (Alternative) pm2

```bash
sudo npm install -g pm2
pm2 start "npm run server" --name animalstrike
pm2 save
pm2 startup        # follow the printed instruction to enable boot startup
```

### Optional: TLS via a reverse proxy

Browsers treat `ws://` (unencrypted) on a public IP as insecure. For a production-grade setup, front the server with nginx or Caddy to terminate TLS and proxy the WebSocket upgrade (`wss://`). This also lets you run on port 443 and put a hostname in front of it. Example nginx snippet:
```nginx
server {
    listen 443 ssl;
    server_name animalstrike.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```
Then clients connect to `wss://animalstrike.example.com`.

---

## Configuration summary

All settings can be set via env vars (`AS_*`), CLI flags, or `server/config.json`. See `server/README.md` for the full table. Key ones for deployment:

- `AS_HOST` / `--host` — bind address (`0.0.0.0` to listen on all interfaces; required for any non-local play).
- `AS_PORT` / `--port` — the port clients put after the IP.
- `AS_MAX_PLAYERS` — total slots (humans + bots); 2–16.
- `AS_AUTO_START` — auto-start a match once `AS_MIN_PLAYERS` humans are connected.

---

## Troubleshooting

- **"Could not connect"** — wrong IP/port, server not running, or firewall/router blocking the port. From the player's machine, try `curl http://<ip>:<port>` — a running server will accept the TCP connection.
- **Can connect on LAN but not over the internet** — port-forwarding missing/incorrect, or CGNAT on the host's ISP. Use the cloud option.
- **Intermittent disconnects** — likely network jitter; the server gives 60s to reconnect and reclaim your slot automatically.
```

- [ ] **Step 3: Commit**

```bash
git add server/README.md docs/multiplayer-deployment.md
git commit -m "docs: dedicated server deployment guide (LAN/port-forward/cloud) + README rewrite"
```

---

## Task 14: Full suite + runtime smoke test

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all pass (the new server tests + existing 148 stay green). If anything fails, fix before proceeding.

- [ ] **Step 2: Runtime loopback smoke test**

In one terminal: `npm run server`.
In another: `npm run dev`, open the browser, pick **Connect**, enter `localhost:8080`, **CONNECT**. Confirm:
- The lobby shows your player.
- Picking a map updates the selection.
- Pressing **Enter** starts the match; bots spawn and fight.
- Your movement + shooting work; remote (bot) players interpolate smoothly.
- Open a second browser tab, Connect again — the second player appears in the first tab's view and vice versa.
- Close one tab — its slot immediately becomes a bot (match stays full); the player count in the roster updates.

- [ ] **Step 3: Single-player regression**

In the browser, pick **Single Player**, **PLAY**. Confirm gameplay is identical to before: movement, shooting, killfeed, HUD, match timer, respawns, end screen.

- [ ] **Step 4: Commit any test/doc fixes from the smoke test**

```bash
git add -A
git commit -m "test: full suite green + runtime smoke of dedicated server" --allow-empty
```

---

## Task 15: Merge to master

- [ ] **Step 1: Verify on the feature branch**

Run: `npx vitest run` — all pass.

- [ ] **Step 2: Merge**

```bash
git checkout master
git merge dev-dedicated-server --no-ff -m "Merge 'dev-dedicated-server': standalone dedicated multiplayer server"
npx vitest run   # verify on merged master
```

- [ ] **Step 3: (Optional) update the main README's feature bullet**

If the root `README.md` mentions multiplayer, update it to describe the dedicated-server model and link to `server/README.md` + `docs/multiplayer-deployment.md`.

```bash
git add README.md
git commit -m "docs: README — dedicated server multiplayer"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** dedicated server process (Task 7), clients connect by IP:port (7, 11), authoritative game state (Sim — reused, 6), client validation/auth-handling (1, 2, 3, 7), reconnect (4, 7, 8, 9), input validation/anti-cheat (2, 7, 8), broadcast state updates (7), config IP/port/max-players (1), NAT/firewall guidance (13), unit/integration tests (1, 2, 3, 4, 8), local deployment guide (13). All spec sections covered.

**Placeholder scan:** No TBD/TODO. Two implementation notes flagged inline as concrete instructions, not placeholders: Task 11 Step 2 ("the exact surrounding code may vary; the intent is...") and Task 11 Step 1's anchoring on approximate line numbers — both are accompanied by the full replacement code, so they are unambiguous.

**Type/signature consistency:** `loadConfig({file,env,argv})` consistent across Tasks 1/7/8. `createRoom(config)` consistent across 7/8. `Sim.takeOverBot(name, animal, weapon)` / `Sim.freeSlots()` consistent across 6/7/8. `ReconnectRegistry.mint/verify/drop/sweep` consistent across 4/7. `RateLimiter`/`ConnectionCap` consistent across 3/7. `msgAuth/msgReconnect/msgSelectMap/msgWelcome/msgMapSelected/msgKick/msgError` consistent across 5/9. `NetClient.hello/selectMap/start/sendInput` consistent across 9/11. The `welcome` message shape `{you, token, map, roster}` is consistent across 5/7/8/9/11.

**Risk note:** Task 7 (server rewrite) + Task 11 (Game.js bootstrap) are the highest-touch tasks. Task 7 is fully test-covered by Task 8 before any client change. Task 11 is runtime-verified in Task 14. Single-player is untouched throughout (it never touches `startMultiplayer`), so a multiplayer regression cannot break single-player.
