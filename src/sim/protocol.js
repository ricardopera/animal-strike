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
