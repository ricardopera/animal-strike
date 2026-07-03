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
};
