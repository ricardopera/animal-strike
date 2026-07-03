import { describe, it, expect } from 'vitest';
import { ANIMALS, ANIMAL_IDS } from '../config/Animals.js';
import { createPlayer } from '../player/Player.js';

describe('Animals roster', () => {
  it('defines all 7 animals', () => {
    expect(ANIMAL_IDS.sort()).toEqual(['BEAR', 'BUNNY', 'FOX', 'OWL', 'PANDA', 'TIGER', 'WOLF']);
  });

  it('every animal has the required stat fields with sane values', () => {
    for (const id of ANIMAL_IDS) {
      const a = ANIMALS[id];
      expect(a.id).toBe(id);
      expect(typeof a.name).toBe('string');
      expect(typeof a.role).toBe('string');
      expect(a.speedMul).toBeGreaterThan(0);
      expect(a.hpMul).toBeGreaterThan(0);
      expect(a.jumpMul).toBeGreaterThan(0);
      expect(a.sizeMul).toBeGreaterThan(0);
      expect(a.palette.primary).toBeGreaterThan(0);
      expect(a.palette.secondary).toBeGreaterThan(0);
      expect(a.palette.accent).toBeGreaterThan(0);
      expect(a.palette.eye).toBeGreaterThan(0); // palette-driven eyes
      expect(typeof a.headBuilder).toBe('function');
    }
  });

  it("stats are differentiated — bear is tanky/slow, bunny is fast/squishy", () => {
    // The two extremes should be clearly distinct (not all-1.0 like before the fix).
    expect(ANIMALS.BEAR.hpMul).toBeGreaterThan(ANIMALS.BUNNY.hpMul);
    expect(ANIMALS.BUNNY.speedMul).toBeGreaterThan(ANIMALS.BEAR.speedMul);
    expect(ANIMALS.BUNNY.jumpMul).toBeGreaterThan(ANIMALS.BEAR.jumpMul);
    expect(ANIMALS.BEAR.sizeMul).toBeGreaterThan(ANIMALS.BUNNY.sizeMul);
  });
});

describe('createPlayer applies animal stats', () => {
  it("a bear player has more HP than a bunny player", () => {
    const bear = createPlayer({ id: 'b', animalId: 'BEAR' });
    const bunny = createPlayer({ id: 'y', animalId: 'BUNNY' });
    expect(bear.maxHealth).toBeGreaterThan(bunny.maxHealth);
    expect(bear.health).toBe(bear.maxHealth);
    expect(bear.speedMul).toBe(ANIMALS.BEAR.speedMul);
    expect(bear.jumpMul).toBe(ANIMALS.BEAR.jumpMul);
    expect(bear.sizeMul).toBe(ANIMALS.BEAR.sizeMul);
  });

  it('a player with no animal gets default 100 HP and 1.0 multipliers', () => {
    const p = createPlayer({ id: 'x' });
    expect(p.maxHealth).toBe(100);
    expect(p.health).toBe(100);
    expect(p.speedMul).toBe(1);
    expect(p.jumpMul).toBe(1);
    expect(p.sizeMul).toBe(1);
  });

  it('rounds HP multiplier to a whole number', () => {
    // Panda 1.3 -> 130, Fox 0.85 -> 85
    const panda = createPlayer({ id: 'p', animalId: 'PANDA' });
    expect(panda.maxHealth).toBe(130);
    const fox = createPlayer({ id: 'f', animalId: 'FOX' });
    expect(fox.maxHealth).toBe(85);
  });
});
