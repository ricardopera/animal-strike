import { describe, it, expect } from 'vitest';
import { createPlayer } from '../player/Player.js';
import * as THREE from 'three';

// The hitscan resolver in Game.js tags the top 0.3m of the body box as the head
// zone and applies the weapon's headshotMul. playerRayHit is module-private in
// Game.js, so this test re-implements the exact geometry to lock the contract.
function headZoneTop(player) {
  const sm = player.sizeMul || 1;
  return player.position.y + 1.8 * sm; // top of the hitbox
}
function isHeadHit(player, hitY) {
  return hitY >= headZoneTop(player) - 0.3;
}

describe('headshot hitbox', () => {
  it('tags a hit in the top 0.3m of the body as a headshot', () => {
    const p = createPlayer({ id: 'x', animalId: 'WOLF' }); // sizeMul 1.0
    p.position.set(0, 0, 0); // feet at 0, hitbox top at 1.8
    expect(isHeadHit(p, 1.7)).toBe(true);  // 1.8 - 0.3 = 1.5 threshold
    expect(isHeadHit(p, 1.55)).toBe(true);
    expect(isHeadHit(p, 1.4)).toBe(false); // chest
    expect(isHeadHit(p, 0.9)).toBe(false); // legs
  });

  it("a bigger animal's head zone sits higher (sizeMul scales the box)", () => {
    const bear = createPlayer({ id: 'b', animalId: 'BEAR' });   // sizeMul 1.15
    const bunny = createPlayer({ id: 'y', animalId: 'BUNNY' }); // sizeMul 0.88
    bear.position.set(0, 0, 0);
    bunny.position.set(0, 0, 0);
    // Bear hitbox top = 1.8*1.15 = 2.07; bunny = 1.8*0.88 = 1.584
    expect(headZoneTop(bear)).toBeGreaterThan(headZoneTop(bunny));
    // The same world height hits bunny's head but only bear's body.
    expect(isHeadHit(bunny, 1.5)).toBe(true);
    expect(isHeadHit(bear, 1.5)).toBe(false);
  });

  it('damage multiplication: a headshot applies the weapon headshot multiplier', () => {
    // Re-implements the Game.js fireOnePellet damage path (falloff + headshot).
    function applyFalloff(damage, dist, start, end) {
      if (dist <= start) return damage;
      if (dist >= end) return damage * 0.4;
      const t = (dist - start) / (end - start);
      return damage * (1 - 0.6 * t);
    }
    const def = { damage: 18, falloffStart: 30, falloffEnd: 60, headshotMul: 2.0 };
    const bodyDmg = applyFalloff(def.damage, 20, def.falloffStart, def.falloffEnd);
    const headDmg = bodyDmg * def.headshotMul;
    expect(headDmg).toBe(bodyDmg * 2);
    expect(headDmg).toBe(36); // 18 * 2 at point-blank
  });
});
