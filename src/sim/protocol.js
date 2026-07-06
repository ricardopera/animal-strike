// Shared wire-protocol helpers. Client and server import the same module so the
// message shapes can't drift.
export function msg(type, fields = {}) {
  return JSON.stringify({ t: type, ...fields });
}
export function parse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}
export function parseSnapshot(raw) {
  const m = parse(raw);
  return m && m.t === 'snapshot' ? m : null;
}

// Typed builders for the new dedicated-server messages. Thin wrappers over msg()
// so client and server can't drift on field names.
export const msgAuth       = (name, animal, weapon) => msg('auth', { name, animal, weapon });
export const msgReconnect  = (id, token) => msg('reconnect', { id, token });
export const msgSelectMap  = (map) => msg('selectMap', { map });
export const msgWelcome    = (you, token, map, roster) => msg('welcome', { you, token, map, roster });
export const msgMapSelected = (map) => msg('mapSelected', { map });
export const msgKick       = (reason) => msg('kick', { reason });
export const msgError      = (code, msgText) => msg('error', { code, msg: msgText });
