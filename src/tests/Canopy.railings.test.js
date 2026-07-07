import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CANOPY } from '../world/maps/Canopy.js';
import { ColliderStore } from '../world/ColliderStore.js';

// Build the Canopy collider set into a real ColliderStore so we can probe
// resolveCapsule at specific world positions. This verifies the guardrails are
// collidable: a player whose capsule overlaps a deck edge is pushed back INWARD
// (away from the void) rather than being allowed to walk off.
//
// NOTE on onGround: a single resolveCapsule() call only marks onGround=true when
// it pushes the capsule UP. In the real game loop gravity first pulls the player
// into the deck and then resolution pushes up; here we probe positions at rest,
// so onGround is not a reliable fall-safety signal. The rail's job is a
// HORIZONTAL push back onto the deck — that is what these tests assert.
function buildColliders() {
  const cs = new ColliderStore();
  for (const b of CANOPY.colliderBoxes) {
    cs.addBox(
      new THREE.Vector3(b.min[0], b.min[1], b.min[2]),
      new THREE.Vector3(b.max[0], b.max[1], b.max[2]),
    );
  }
  return cs;
}

const RADIUS = 0.4;
const HEIGHT = 1.8;
// King LOW deck: 10x10 at y=30 (center), top at 30.3. Edges at x,z = ±5.
const DECK_TOP = 30.3;

describe('Canopy guardrails block edge falls on safe surfaces', () => {
  it('the map has substantially more collider boxes than the un-railed baseline (rails present)', () => {
    // Pre-rail Canopy had ~102 colliders; rails add many more.
    expect(CANOPY.colliderBoxes.length).toBeGreaterThan(140);
  });

  it('a capsule pushed against the king LOW +z edge is pushed back inward by the rail', () => {
    const cs = buildColliders();
    // Place the capsule past the deck edge, overlapping the +z rail (which sits
    // at z≈5). The rail must push it back to z ≈ 5 - RAIL_HALF - RADIUS.
    const pos = new THREE.Vector3(3, DECK_TOP, 5.0);
    const resolved = cs.resolveCapsule(pos, RADIUS, HEIGHT);
    // Pushed back inward (resolved.z < 5.0) and not allowed past the rail.
    expect(resolved.z).toBeLessThan(5.0);
    // It should settle just inside the rail: rail inner face ≈ 4.92, minus radius.
    expect(resolved.z).toBeLessThanOrEqual(4.92 + RADIUS + 0.01);
  });

  it('a capsule on the open deck (away from trunk and edges) is not pushed sideways', () => {
    const cs = buildColliders();
    // (3, 30.3, 2) is clear of the trunk (|x|,|z| <= 1.5) and clear of all edges.
    const pos = new THREE.Vector3(3, DECK_TOP, 2);
    const resolved = cs.resolveCapsule(pos, RADIUS, HEIGHT);
    expect(resolved.x).toBeCloseTo(3, 1);
    expect(resolved.z).toBeCloseTo(2, 1);
  });

  it('a capsule pushed against a spoke edge is pushed back inward by the edge rail', () => {
    const cs = buildColliders();
    // North spoke runs along z, 3 wide (x ∈ [-1.5,1.5]) at y≈30, top 30.25.
    // The +x edge rail sits at x≈1.5. Place the capsule past it.
    const pos = new THREE.Vector3(1.5, 30.25, 14);
    const resolved = cs.resolveCapsule(pos, RADIUS, HEIGHT);
    expect(resolved.x).toBeLessThan(1.5);
    expect(resolved.x).toBeLessThanOrEqual(1.42 + RADIUS + 0.01);
  });

  it('a catwalk (intentionally un-railed risky route) does NOT block edge falls', () => {
    // The stealth catwalks are deliberately rail-less. Confirm a capsule at the
    // catwalk edge is NOT pushed back — the danger is the point. Catwalks are
    // 1.2 wide (x ∈ [-0.6,0.6]) at y≈26; a capsule past x=0.6 should pass through.
    const cs = buildColliders();
    const pos = new THREE.Vector3(1.0, 26.15, 10);
    const resolved = cs.resolveCapsule(pos, RADIUS, HEIGHT);
    expect(resolved.x).toBe(1.0); // not pushed — no rail here
  });
});
