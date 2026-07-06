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
