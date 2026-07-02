export class EntityStore {
  constructor() { this.players = []; }
  add(p) { this.players.push(p); return p; }
  remove(p) { const i = this.players.indexOf(p); if (i >= 0) this.players.splice(i, 1); }
  forEach(fn) { for (const p of this.players) fn(p); }
  alive() { return this.players.filter(p => p.alive); }
  enemiesOf(player) { return this.players.filter(p => p !== player && p.alive); }
}
