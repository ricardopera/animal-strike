import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';

// TextureFactory calls document.createElement('canvas') at draw time. The node
// test env has no DOM, so stub a minimal document (matching the ctx methods the
// procedural drawers use) before the import resolves. This mirrors the approach
// in MapBuildHelper.test.js.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    const noop = () => {};
    const grad = { addColorStop: noop };
    const ctx = {
      fillRect: noop, strokeRect: noop, beginPath: noop, ellipse: noop,
      lineTo: noop, moveTo: noop, stroke: noop, fill: noop,
      createLinearGradient: () => grad, createRadialGradient: () => grad,
    };
    globalThis.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    };
  }
});

const { get } = await import('../textures/TextureFactory.js');

// V3: the four new procedural ground textures must be recognized by get() and
// return a real THREE.CanvasTexture (not a base-only fallback). We can't assert
// pixel content headlessly, but resolving through the switch case (no throw) +
// returning a CanvasTexture proves the drawers are wired into makeTexture().
describe('TextureFactory procedural ground textures', () => {
  for (const name of ['cobble', 'sand', 'turf', 'planks']) {
    it(`get('${name}') returns a THREE.CanvasTexture`, () => {
      const tex = get(name, { base: 0x808080, accent: 0x404040, seed: 1 });
      expect(tex).toBeInstanceOf(THREE.CanvasTexture);
      expect(tex.isCanvasTexture).toBe(true);
    });
  }

  it('caches repeated get() calls with the same name/opts', () => {
    const a = get('cobble', { base: 0x808080, seed: 2 });
    const b = get('cobble', { base: 0x808080, seed: 2 });
    expect(a).toBe(b);
  });
});
