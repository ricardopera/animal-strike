import { PLAZA } from './maps/Plaza.js';
import { FOUNDRY } from './maps/Foundry.js';
import { DUSTBOWL } from './maps/Dustbowl.js';

// The map roster. Order = menu/rotation order; MAPS[0] is the default.
export const MAPS = [PLAZA, FOUNDRY, DUSTBOWL];

// Look up a map by id. Falls back to the default (Plaza) for undefined/null,
// returns undefined for an unknown (but non-null) id so callers can detect typos.
export function getMapById(id) {
  if (id === undefined || id === null) return MAPS[0];
  return MAPS.find(m => m.id === id);
}
