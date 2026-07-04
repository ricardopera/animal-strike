import { describe, it, expect } from 'vitest';
import { WEAPON_SKINS, DEFAULT_SKIN, WEAPON_SKIN_IDS, getSkin } from '../config/WeaponSkins.js';

describe('WeaponSkins registry', () => {
  it('has 8 skins', () => {
    expect(WEAPON_SKINS).toHaveLength(8);
  });

  it('every skin has the required fields', () => {
    for (const s of WEAPON_SKINS) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.color).toBe('number');
      expect(typeof s.metalness).toBe('number');
      expect(typeof s.roughness).toBe('number');
      expect(typeof s.map).toBe('string');
    }
  });

  it('ids are unique', () => {
    expect(new Set(WEAPON_SKIN_IDS).size).toBe(WEAPON_SKIN_IDS.length);
  });

  it('DEFAULT_SKIN is the first skin (gunmetal)', () => {
    expect(DEFAULT_SKIN).toBe('gunmetal');
    expect(WEAPON_SKINS[0].id).toBe(DEFAULT_SKIN);
  });

  it('getSkin round-trips every id', () => {
    for (const s of WEAPON_SKINS) expect(getSkin(s.id)).toBe(s);
  });

  it('getSkin falls back to the first skin for unknown id', () => {
    expect(getSkin('does-not-exist').id).toBe(DEFAULT_SKIN);
  });

  it('the neon skin is the only one with an emissive glow', () => {
    const neon = getSkin('neon');
    expect(neon.emissive).toBeDefined();
    expect(neon.emissiveIntensity).toBeGreaterThan(0);
    // all others have no emissive
    for (const s of WEAPON_SKINS) {
      if (s.id !== 'neon') expect(s.emissive).toBeUndefined();
    }
  });
});
