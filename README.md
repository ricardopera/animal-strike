# 🦊 AnimalStrike

A fast, skill-based **browser FPS** in the spirit of [Krunker.io](https://krunker.io/) — single-player free-for-all deathmatch against AI bots. Built with **Vite + Three.js (vanilla JS)**.

Pick an animal-headed gunner, pick a weapon, and frag your way to 25 kills before the bots do.

![AnimalStrike](https://img.shields.io/badge/three.js-r0.185-black) ![tests](https://img.shields.io/badge/tests-48%20passing-brightgreen) ![status](https://img.shields.io/badge/status-playable-success)

---

## ✨ Features

- **Movement with a skill ceiling** — walk, sprint, jump, plus full parkour:
  - 🐰 **Bunny-hop** — chain jumps to build speed; air-strafe to exceed sprint
  - 🛷 **Slide** — crouch while sprinting for a low-friction boost
  - 🧗 **Wall-run** — leap at a wall, run along it, jump off
- **Hitscan combat — 5 weapons**, each with damage falloff, recoil, bullet tracers, muzzle flash, and hit sparks:
  - 🔫 **Assault Rifle** — full-auto, balanced all-rounder
  - 🎯 **Sniper** — semi-auto, high damage, long range
  - 🔫 **SMG** — fast-fire, low recoil, short range
  - 🔫 **Shotgun** — multi-pellet spread, devastating up close
  - 🔫 **Pistol** — reliable sidearm
  - Plus a **first-person viewmodel** with per-weapon models, idle sway, recoil kick, and reload animation
- **7 animal skins** — Fox, Wolf, Panda, Tiger, Bear, Bunny, Owl — each with speed/HP multipliers and a procedurally-built low-poly head, now with **procedural fur textures**
- **5 AI bots** — finite-state-machine brains (patrol → chase → engage → retreat), waypoint navigation, line-of-sight target selection, accuracy/reaction-time aim model
- **Full deathmatch loop** — 5-minute timer, 25-frag target, 2.5s respawns at the spawn farthest from enemies, killfeed, Tab scoreboard, VICTORY/DEFEATED end screen, play-again
- **Polish** — synthesized WebAudio SFX **+ real generated music & voice** (MiniMax; synth fallback), dynamic crosshair, HP/ammo HUD with **bars, weapon icons, reload ring, hitmarker, killstreak counter**, sprint FOV kick, low-HP red vignette, and a settings panel (sensitivity / FOV / invert-Y / quality / music / voice) persisted to `localStorage`
- **Richer arena** — ~50 buildings with twin towers, a central structure, cover clusters, sniper perches, and **procedural textures** (concrete / metal / wood) applied throughout

---

## 🚀 Quick start

```bash
npm install
npm run dev      # start the dev server
```

Open the printed URL (default `http://localhost:5173`), click the canvas to lock the pointer, pick an animal + weapon, and hit **PLAY**.

### Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint |
| `Space` | Jump (tap again just before landing to **bhop**) |
| `Ctrl` / `C` (while sprinting) | **Slide** |
| Mouse | Look |
| Left-click (hold) | Fire |
| `R` | Reload |
| `Tab` | Scoreboard |

> Tip: to wall-run, jump toward a wall and hold a movement key along it — then press `Space` to leap off.

---

## 🧱 Project structure

```
src/
├── core/        # Game loop, fixed-timestep, input, entities, math helpers
├── config/      # Tuning data: Weapons, Animals, Movement, Match
├── world/       # Arena geometry, AABB collider store, spawn points
├── player/      # Player entity, movement physics, weapon controller, character view
├── ai/          # Bot brain: FSM controller, navigation, aim model, combat
├── fx/          # Pooled effects: tracers, muzzle flash, sparks, damage numbers
├── ui/          # DOM overlay: HUD, crosshair, scoreboard, menus, settings
├── audio/       # Synthesized WebAudio one-shots + music/voice players
├── textures/    # Procedural TextureFactory (concrete/metal/wood, fur)
└── tests/       # Vitest unit tests (48)
```

The simulation runs on a **fixed 60 Hz timestep** decoupled from rendering via an accumulator, so movement and AI are deterministic regardless of frame rate. Bots reuse the *same* player/movement/weapon code as the human — the `AIController` just writes to the bot's intent instead of reading a mouse/keyboard.

---

## 🧪 Tests

```bash
npm test          # run once
npm run test:watch
```

48 unit tests cover the pure/tricky logic: math helpers, the fixed-timestep accumulator (including its spiral-of-death guard), weapon fire-rate/ammo/reload (all 5 weapons), the bot aim model, damage falloff, spawn-point selection, and all three parkour mechanics (bhop, slide, wall-run).

---

## 🏗️ Build

```bash
npm run build      # production build to dist/
npm run preview    # preview the production build
```

---

## 🛣️ Roadmap (documented in `docs/`)

The architecture deliberately leaves hooks open for later expansion:
- **Character classes** — promote the animal stat multipliers into active abilities
- **More maps** — each arena is its own `ArenaBuilder` + waypoint graph
- **Team deathmatch** — team fields on entities + team-aware targeting
- **Gun-game** — per-player weapon progression on each kill
- **Server-authoritative netcode** — the entity/AI split is structured so a network layer can drop in

Design spec: `docs/superpowers/specs/2026-07-02-animal-strike-design.md`
v2 expansion spec: `docs/superpowers/specs/2026-07-03-animal-strike-v2-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-02-animal-strike.md`

---

## 🛠️ Tech

- [three.js](https://threejs.org/) r0.185 — WebGL rendering
- [Vite](https://vitejs.dev/) 8 — dev server + bundler
- [Vitest](https://vitest.dev/) 4 — unit tests
- Vanilla ES modules throughout — no framework

## License

MIT
