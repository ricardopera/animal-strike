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
