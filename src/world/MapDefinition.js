// A MapDefinition bundles everything Game.js needs to run a match on a map:
// geometry build fn, spawn points, bot waypoints, and a visual palette.
// Each map module (Plaza, Foundry, Dustbowl) exports one of these.
export class MapDefinition {
  constructor(cfg) {
    const required = ['id', 'name', 'desc', 'palette', 'build', 'spawnPoints', 'waypoints', 'colliderBoxes'];
    for (const k of required) {
      if (cfg[k] === undefined || cfg[k] === null) {
        throw new Error(`MapDefinition missing required field: ${k}`);
      }
    }
    if (!Array.isArray(cfg.palette.sky) || cfg.palette.sky.length !== 4) {
      throw new Error('MapDefinition.palette.sky must be 4 gradient stops [zenith,mid,haze,horizon]');
    }
    if (!Array.isArray(cfg.colliderBoxes) || cfg.colliderBoxes.length === 0) {
      throw new Error('MapDefinition.colliderBoxes must be a non-empty array of {min,max} AABBs');
    }
    // Optional per-map lighting overrides. When present they must be well-formed;
    // when absent Game.js falls back to its default hemisphere/sun constants so
    // existing maps (which never set these) render identically.
    if (cfg.palette.hemisphere !== undefined && cfg.palette.hemisphere !== null) {
      const h = cfg.palette.hemisphere;
      if (!Array.isArray(h) || h.length !== 2 || !Number.isInteger(h[0]) || !Number.isInteger(h[1])) {
        throw new Error('MapDefinition.palette.hemisphere must be a [sky,ground] pair of hex ints');
      }
    }
    if (cfg.palette.sunColor !== undefined && cfg.palette.sunColor !== null) {
      if (!Number.isInteger(cfg.palette.sunColor)) {
        throw new Error('MapDefinition.palette.sunColor must be a hex int');
      }
    }
    if (cfg.palette.sunIntensity !== undefined && cfg.palette.sunIntensity !== null) {
      if (typeof cfg.palette.sunIntensity !== 'number' || cfg.palette.sunIntensity < 0) {
        throw new Error('MapDefinition.palette.sunIntensity must be a non-negative number');
      }
    }
    // Optional per-map fall-death plane (y below which a player dies — used by
    // high-altitude maps like Canopy). When absent, falling has no death effect
    // (all flat-ground maps omit it). Validated only when present.
    if (cfg.killY !== undefined && cfg.killY !== null) {
      if (typeof cfg.killY !== 'number' || !Number.isFinite(cfg.killY)) {
        throw new Error('MapDefinition.killY must be a finite number');
      }
    }
    this.id           = cfg.id;
    this.name         = cfg.name;
    this.desc         = cfg.desc;
    this.palette      = cfg.palette;
    this.build        = cfg.build;
    this.spawnPoints  = cfg.spawnPoints;
    this.waypoints    = cfg.waypoints;
    this.colliderBoxes = cfg.colliderBoxes;
    this.killY        = cfg.killY;
  }
}
