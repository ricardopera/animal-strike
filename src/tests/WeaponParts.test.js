import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// WeaponParts imports AssetLoader which uses THREE.TextureLoader (needs Image).
// Stub the browser globals before import so the module loads in node.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
  }
  if (typeof globalThis.Image === 'undefined') globalThis.Image = class {};
});

const WP = await import('../player/WeaponParts.js');

describe('WeaponParts factory', () => {
  it('exports the expected part builders', () => {
    for (const fn of ['barrel', 'beveledBody', 'curvedGrip', 'scopeTube', 'scopeRing',
                      'magCurve', 'muzzleDevice', 'stock', 'triggerGuard', 'rail']) {
      expect(typeof WP[fn]).toBe('function');
    }
  });

  it('barrel() is a cylinder (round), not a box', () => {
    const b = WP.barrel(0.03, 0.2);
    expect(b.geometry.type).toBe('CylinderGeometry');
  });

  it('scopeRing() is a torus', () => {
    const r = WP.scopeRing(0.04);
    expect(r.geometry.type).toBe('TorusGeometry');
  });

  it('exports a shared material library', () => {
    expect(WP.mats.gunmetal).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(WP.mats.polymer).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(WP.mats.steel).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('buildWeapon(id) returns a group + muzzleLocal for every weapon id', () => {
    for (const id of ['AR', 'SNIPER', 'SMG', 'SHOTGUN', 'PISTOL']) {
      const { group, muzzleLocal } = WP.buildWeapon(id);
      expect(group).toBeInstanceOf(THREE.Group);
      expect(muzzleLocal).toBeInstanceOf(THREE.Vector3);
    }
  });

  it('setActiveSkin(id) updates the gunmetal + steel material properties', () => {
    const beforeColor = WP.mats.gunmetal.color.getHex();
    const beforeMetal = WP.mats.gunmetal.metalness;
    WP.setActiveSkin('gold');   // gold: color 0xd4a040, metalness 0.9
    expect(WP.mats.gunmetal.color.getHex()).toBe(0xd4a040);
    expect(WP.mats.gunmetal.metalness).toBeCloseTo(0.9, 5);
    expect(WP.getActiveSkin()).toBe('gold');
    // restore to avoid affecting other tests
    WP.setActiveSkin('gunmetal');
    expect(WP.mats.gunmetal.color.getHex()).toBe(beforeColor);
    expect(WP.mats.gunmetal.metalness).toBeCloseTo(beforeMetal, 5);
  });
});
