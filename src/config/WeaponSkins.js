// Weapon skin registry. Each skin defines the PBR parameters + texture map for
// the primary weapon surface (gunmetal/steel parts). The chosen skin applies to
// ALL weapons a player holds (one selection styles the whole loadout). Polymer/
// grip furniture stays dark regardless. Pure client-side visual — does NOT
// affect the authoritative sim, so no netcode concern.
export const WEAPON_SKINS = [
  { id: 'gunmetal', name: 'Gunmetal',     map: '/textures/weapons/gunmetal.png',     color: 0x4a4f58, metalness: 0.6,  roughness: 0.45 },
  { id: 'camo',     name: 'Tactical Camo', map: '/textures/weapons/tactical_camo.png', color: 0x3a4038, metalness: 0.3,  roughness: 0.6 },
  { id: 'steel',    name: 'Worn Steel',   map: '/textures/weapons/worn_steel.png',   color: 0x6a6e76, metalness: 0.7,  roughness: 0.3 },
  { id: 'gold',     name: 'Gold',         map: '/textures/weapons/gold.png',         color: 0xd4a040, metalness: 0.9,  roughness: 0.25 },
  { id: 'snake',    name: 'Snake Skin',   map: '/textures/weapons/snake.png',        color: 0x4a5a3a, metalness: 0.2,  roughness: 0.55 },
  { id: 'neon',     name: 'Neon',         map: '/textures/weapons/neon.png',         color: 0x1a1a2a, metalness: 0.4,  roughness: 0.35, emissive: 0x00ffcc, emissiveIntensity: 0.25 },
  { id: 'ice',      name: 'Ice',          map: '/textures/weapons/ice.png',          color: 0x9fc4d8, metalness: 0.5,  roughness: 0.2 },
  { id: 'wood',     name: 'Wood',         map: '/textures/weapons/wood_stock.png',   color: 0x6b4226, metalness: 0.0,  roughness: 0.8 },
];

export const DEFAULT_SKIN = WEAPON_SKINS[0].id;
export const WEAPON_SKIN_IDS = WEAPON_SKINS.map(s => s.id);

export function getSkin(id) {
  return WEAPON_SKINS.find(s => s.id === id) || WEAPON_SKINS[0];
}
