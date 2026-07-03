// All weapons are hitscan. Damage uses linear falloff past falloffStart.
// Spread values are in radians.
function deg(r) {
  return (r * Math.PI) / 180;
}

export const WEAPONS = {
  AR: {
    id: 'AR',
    name: 'Assault Rifle',
    damage: 18,
    rpm: 600,                 // rounds per minute
    mag: 30,
    reloadTime: 1.8,
    spread: deg(0.6),
    falloffStart: 30,
    falloffEnd: 60,
    recoil: { vertical: 0.012, horizontal: 0.006 },
    auto: true,
  },
  SNIPER: {
    id: 'SNIPER',
    name: 'Sniper',
    damage: 80,
    rpm: 45,
    mag: 5,
    reloadTime: 2.4,
    spread: deg(0.05),
    falloffStart: 80,
    falloffEnd: 160,
    recoil: { vertical: 0.06, horizontal: 0.02 },
    auto: false,
  },
  SMG: {
    id: 'SMG',
    name: 'SMG',
    damage: 12,
    rpm: 900,                 // very fast spray
    mag: 35,
    reloadTime: 1.6,
    spread: deg(1.4),         // blooms fast; high spread climb
    falloffStart: 18,
    falloffEnd: 40,           // short range
    recoil: { vertical: 0.009, horizontal: 0.008 },
    auto: true,
  },
  SHOTGUN: {
    id: 'SHOTGUN',
    name: 'Shotgun',
    damage: 11,               // PER PELLET (8 pellets)
    pellets: 8,
    rpm: 75,                  // pump action
    mag: 6,
    reloadTime: 2.6,
    spread: deg(4.0),         // wide cone
    falloffStart: 8,
    falloffEnd: 22,           // very short range, heavy falloff
    recoil: { vertical: 0.05, horizontal: 0.02 },
    auto: false,
  },
  PISTOL: {
    id: 'PISTOL',
    name: 'Pistol',
    damage: 24,
    rpm: 300,                 // precise sidearm
    mag: 12,
    reloadTime: 1.1,
    spread: deg(0.4),
    falloffStart: 25,
    falloffEnd: 55,
    recoil: { vertical: 0.01, horizontal: 0.004 },
    auto: false,
  },
};
