import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Sim } from '../sim/Sim.js';

describe('Sim (headless authoritative world)', () => {
  it('imports without touching document/window (headless-safe)', () => {
    // If Sim transitively imports anything that calls document.createElement,
    // Node fails to load this module. This test existing + passing enforces that.
    expect(typeof Sim).toBe('function');
  });

  it('startMatch builds colliders from colliderBoxes and fills to 6 players', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    expect(sim.colliders.boxes.length).toBeGreaterThan(10);
    expect(sim.players.length).toBe(6);
    expect(sim.bots.length).toBe(6);  // 0 humans -> backfilled to 6 bots
    expect(sim.humans.size).toBe(0);
  });

  it('setPlayerIntent + tick moves the player forward (-Z at yaw=0)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    const me = sim.addHuman('Me', 'FOX', 'AR');
    const startZ = me.position.z;  // spawn (e.g. +30)
    sim.setPlayerIntent(me.id, { forward: 1, strafe: 0, jump: false, sprint: true, crouch: false, firing: false, reloadRequested: false, yaw: 0, pitch: 0 });
    for (let i = 0; i < 60; i++) sim.tick(1 / 60);  // 1 second
    // forward at yaw=0 = -Z, so the player must have moved toward -Z
    expect(me.position.z).toBeLessThan(startZ);
    expect(me.velocity.z).toBeLessThan(0);
  });

  it('snapshot() returns plain-object world state matching the protocol shape', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    const snap = sim.snapshot();
    expect(snap).toHaveProperty('tick');
    expect(snap).toHaveProperty('players');
    expect(Array.isArray(snap.players)).toBe(true);
    const p = snap.players[0];
    for (const k of ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'hp', 'wpn', 'ammo', 'score', 'alive', 'animal', 'name', 'isBot']) {
      expect(p).toHaveProperty(k);
    }
    expect(snap).toHaveProperty('events');
  });

  it('a shot that hits another player damages them (host-authoritative hit detection)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    const shooter = sim.addHuman('Shooter', 'FOX', 'AR');
    const victim = sim.addHuman('Victim', 'WOLF', 'AR');
    // place victim directly in front of shooter (-Z), both on the ground
    victim.position.set(0, 0, -5);
    shooter.position.set(0, 0, 0);
    shooter.yaw = 0; shooter.pitch = 0;
    victim.yaw = 0; victim.pitch = 0;
    const hpBefore = victim.health;
    sim.setPlayerIntent(shooter.id, { forward: 0, strafe: 0, jump: false, sprint: false, crouch: false, firing: true, reloadRequested: false, yaw: 0, pitch: 0 });
    for (let i = 0; i < 60; i++) sim.tick(1 / 60);  // ~1s, AR fires multiple times
    expect(victim.health).toBeLessThan(hpBefore);
  });

  it('match timer counts down over ticks', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    for (let i = 0; i < 600; i++) sim.tick(1 / 60);  // 10 seconds
    expect(sim.match.timeLeft).toBeLessThan(300);
  });

  it('snapshot drains events (each event seen once)', () => {
    const sim = new Sim();
    sim.startMatch('plaza', 25, 300);
    sim.events.push({ k: 'test' });
    const snap = sim.snapshot();
    expect(snap.events).toContainEqual({ k: 'test' });
    // after snapshot, events are drained
    expect(sim.events.length).toBe(0);
  });
});
