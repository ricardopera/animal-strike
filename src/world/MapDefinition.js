// A MapDefinition bundles everything Game.js needs to run a match on a map:
// geometry build fn, spawn points, bot waypoints, and a visual palette.
// Each map module (Plaza, Foundry, Dustbowl) exports one of these.
export class MapDefinition {
  constructor(cfg) {
    const required = ['id', 'name', 'desc', 'palette', 'build', 'spawnPoints', 'waypoints'];
    for (const k of required) {
      if (cfg[k] === undefined || cfg[k] === null) {
        throw new Error(`MapDefinition missing required field: ${k}`);
      }
    }
    if (!Array.isArray(cfg.palette.sky) || cfg.palette.sky.length !== 4) {
      throw new Error('MapDefinition.palette.sky must be 4 gradient stops [zenith,mid,haze,horizon]');
    }
    this.id          = cfg.id;
    this.name        = cfg.name;
    this.desc        = cfg.desc;
    this.palette     = cfg.palette;
    this.build       = cfg.build;
    this.spawnPoints = cfg.spawnPoints;
    this.waypoints   = cfg.waypoints;
  }
}
