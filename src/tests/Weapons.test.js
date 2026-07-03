import { describe, it, expect } from 'vitest';
import { WEAPONS } from '../config/Weapons.js';

describe('Weapons roster', () => {
  it('defines all 5 weapons', () => {
    expect(Object.keys(WEAPONS).sort()).toEqual(['AR', 'PISTOL', 'SHOTGUN', 'SMG', 'SNIPER']);
  });

  it('every weapon has the required fields with sane values', () => {
    for (const id of Object.keys(WEAPONS)) {
      const w = WEAPONS[id];
      expect(w.id).toBe(id);
      expect(typeof w.name).toBe('string');
      expect(w.damage).toBeGreaterThan(0);
      expect(w.rpm).toBeGreaterThan(0);
      expect(w.mag).toBeGreaterThanOrEqual(1);
      expect(w.reloadTime).toBeGreaterThan(0);
      expect(w.spread).toBeGreaterThanOrEqual(0);
      expect(w.falloffStart).toBeLessThanOrEqual(w.falloffEnd);
      expect(w.recoil.vertical).toBeGreaterThan(0);
      expect(typeof w.auto).toBe('boolean');
    }
  });

  it('shotgun fires multiple pellets; the others fire a single ray', () => {
    expect(WEAPONS.SHOTGUN.pellets).toBeGreaterThan(1);
    for (const id of ['AR', 'SNIPER', 'SMG', 'PISTOL']) {
      expect(WEAPONS[id].pellets || 1).toBe(1);
    }
  });

  it('shotgun has the widest spread and shortest falloff range (close-range)', () => {
    expect(WEAPONS.SHOTGUN.spread).toBeGreaterThan(WEAPONS.AR.spread);
    expect(WEAPONS.SHOTGUN.falloffEnd).toBeLessThan(WEAPONS.AR.falloffEnd);
  });

  it('sniper has the tightest spread and longest range', () => {
    expect(WEAPONS.SNIPER.spread).toBeLessThan(WEAPONS.AR.spread);
    expect(WEAPONS.SNIPER.falloffEnd).toBeGreaterThan(WEAPONS.AR.falloffEnd);
  });

  it('SMG fires fastest, pistol is the precision sidearm (semi-auto)', () => {
    expect(WEAPONS.SMG.rpm).toBeGreaterThan(WEAPONS.AR.rpm);
    expect(WEAPONS.SMG.auto).toBe(true);
    expect(WEAPONS.PISTOL.auto).toBe(false);
    expect(WEAPONS.PISTOL.reloadTime).toBeLessThan(WEAPONS.AR.reloadTime); // fast reload
  });
});
