// Shared fall-death check. Pure math — NO THREE import — so the dedicated
// server (Sim.js) can call it headlessly exactly as the client (Game.js) does.
//
// A player dies from a fall when the map defines a kill plane (killY) and the
// player's FEET (position.y) drop strictly below it. Maps that omit killY
// (all flat-ground maps) never trigger fall death — behavior is unchanged.
//
// Callers handle the actual death bookkeeping (alive/health/respawn) — this
// helper only answers the yes/no question so both loops share one rule.
export function checkFallDeath(player, map) {
  if (!map || map.killY === undefined || map.killY === null) return false;
  if (!player.alive) return false;
  return player.position.y < map.killY;
}
