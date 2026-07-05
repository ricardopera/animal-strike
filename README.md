# 🦊 AnimalStrike

A fast, skill-based **browser FPS** in the spirit of [Krunker.io](https://krunker.io/) — single-player free-for-all deathmatch against AI bots. Built with **Vite + Three.js (vanilla JS)**.

Pick an animal-headed gunner, pick a weapon, and frag your way to 25 kills before the bots do.

### ▶️ Play now

**👉 [https://ricardopera.github.io/animal-strike/](https://ricardopera.github.io/animal-strike/)** — hosted on GitHub Pages. Click the canvas, pick your loadout, hit PLAY. (Multiplayer Host/Join requires running the Node server locally — see [Host a match](#-host-a-match-multiplayer).)

![AnimalStrike](https://img.shields.io/badge/three.js-r0.185-black) ![tests](https://img.shields.io/badge/tests-148%20passing-brightgreen) ![status](https://img.shields.io/badge/status-playable-success) ![deploy](https://img.shields.io/badge/play-github%20pages-success)

---

## ✨ Features

- **Movement with a skill ceiling** — walk, sprint, jump, plus full parkour:
  - 🐰 **Bunny-hop** — chain jumps to build speed; air-strafe to exceed sprint
  - 🛷 **Slide** — crouch while sprinting for a low-friction boost
  - 🧗 **Wall-run** — leap at a wall, run along it, jump off
- **Hitscan combat — 5 weapons**, each with damage falloff, recoil, bullet tracers, muzzle flash, and hit sparks:
  - 🔫 **Assault Rifle** — full-auto, balanced all-rounder (hs ×2.0)
  - 🎯 **Sniper** — semi-auto, high damage, long range, **most punishing on the move & most rewarding for headshots** (hs ×2.5)
  - 🔫 **SMG** — fast-fire, run-and-gun friendly, short range (hs ×1.7)
  - 🔫 **Shotgun** — multi-pellet spread, devastating up close (hs ×1.5)
  - 🔫 **Pistol** — reliable precision sidearm (hs ×2.2)
  - Plus a **first-person viewmodel** with per-weapon models, idle sway, recoil kick, and reload animation
  - **Headshots** — the top of each hitbox is a head zone; landing it multiplies damage (per-weapon, up to ×2.5). Headshot kills get a distinct killfeed verb and a brighter damage number.
  - **Movement-based spread** — firing while sprinting or airborne widens your cone; stand still (or counter-strafe) for full accuracy. Each weapon's penalty differs — the SMG barely cares, the Sniper severely punishes movement.
- **7 character classes** — Fox (Scout), Wolf (Soldier), Panda (Tank), Tiger (Striker), Bear (Juggernaut), Bunny (Speedster), Owl (Marksman) — each with distinct **speed / HP / jump / size** multipliers that now *actually* affect gameplay (a Bear has 135 HP and a big frame; a Bunny has 80 HP, jumps 1.35×, and is a tiny target). All heads and bodies wear **procedural fur textures** tinted to the palette.
- **5 AI bots** — finite-state-machine brains (patrol → chase → engage → retreat), waypoint navigation, line-of-sight target selection, accuracy/reaction-time aim model — now each bot spawns with a **different weapon** (rotating loadouts) instead of all-AR.
- **Full deathmatch loop** — 5-minute timer, 25-frag target, 2.5s respawns at the spawn farthest from enemies, killfeed (with headshot callouts), Tab scoreboard, VICTORY/DEFEATED end screen, play-again
- **Per-animal character voices** — every animal speaks in its **own distinct voice** (Fox = eager scout, Wolf = steady soldier, Panda = deep tank, Tiger = fierce striker, Bear = bossy juggernaut, Bunny = cocky speedster, Owl = calm marksman). 42 generated voice clips via MiniMax text-to-audio: the killer taunts their kill, the victim cries out on hurt/death, the winner declares victory, respawns announce a return, and bots toss occasional taunts for ambience — all with synth fallback if files are missing. Plus a generated **music** loop (menu + combat) that crossfades on match phase.
- **Polish** — synthesized WebAudio SFX, dynamic crosshair, HP/ammo HUD with **bars, weapon icons, reload ring, hitmarker, killstreak counter**, sprint FOV kick, low-HP red vignette, and a settings panel (sensitivity / FOV / invert-Y / quality / music / voice) persisted to `localStorage`
- **Richer arena** — ~50 buildings with twin towers, a central structure, cover clusters, sniper perches, and **procedural textures** (concrete / metal / wood) applied throughout
- **3 maps + rotation** — fight across **Plaza** (open central yard + twin towers), **Foundry** (industrial catwalks + forge pits), and **Dustbowl** (desert mesas + long sightlines). Pick a map in the menu or let **🔄 rotation** cycle them between matches. Each map is a self-contained `MapDefinition` (geometry + spawns + waypoints + palette), so the sky, fog, and mood shift per arena.
- **Modern render pipeline** — **ACES filmic tone mapping** + sRGB output for cinematic color, **soft shadow maps** with a sun that follows the player, a **gradient sky** (zenith → warm horizon), **selective bloom** post-processing (FX glow: tracers, muzzle flash, sparks), additive-blended **glowing tracers** and **muzzle flash + dynamic point-light kick** per shot, PBR-tuned materials (metal surfaces are reflective, wood/concrete matte), and a warm/cool three-point light rig. Quality settings gate shadow/bloom tiers for performance.
- **Multiplayer (peer-hosted)** — one player runs a small Node WebSocket server (`npm run host`) that owns the authoritative simulation; up to 5 friends join via the host's `ip:port`. Empty slots backfill with bots (6 total). Clients send inputs and render interpolated snapshots; the host's browser is just another client. See [Host a match](#-host-a-match-multiplayer).
- **Rebuilt weapons + skins** — all 5 weapons reconstructed from **rounded primitives** (cylindrical barrels, scope tubes + rings, curved capsule grips, torus trigger guards, muzzle brakes, bipods) instead of boxes, sharing one `WeaponParts` factory between the first-person viewmodel and the third-person bot gun. **8 selectable weapon skins** (Gunmetal, Tactical Camo, Worn Steel, Gold, Snake Skin, Neon, Ice, Wood) pickable from the menu and applied to your whole loadout; metals are lit by a **PMREM environment map** generated from the sky so guns read as properly-lit metal, not flat dark. Each of the 7 animals has its **own distinct generated fur/feather texture** plus eye-shine catch-lights.

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

## 🌐 Host a match (multiplayer)

Peer-hosted: one player runs the authoritative server; up to 5 others join. Empty slots backfill with bots.

**Host:**
```bash
npm install      # first time
npm run host     # starts the WebSocket server on :8080 (override with PORT=...)
```
Then open the game, pick **Host** mode, choose your animal + weapon, press **START SERVER + PLAY**. Share your `ip:8080` with friends. (For internet play, port-forward 8080 to your machine.)

**Join:** open the game, pick **Join**, enter the host's `ip:port`, press **CONNECT**, and wait for the host to start.

Closing the host's **browser tab** doesn't end the match — only stopping the Node server does. See [`server/README.md`](server/README.md) for details.

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
└── tests/       # Vitest unit tests (62)
```

The simulation runs on a **fixed 60 Hz timestep** decoupled from rendering via an accumulator, so movement and AI are deterministic regardless of frame rate. Bots reuse the *same* player/movement/weapon code as the human — the `AIController` just writes to the bot's intent instead of reading a mouse/keyboard.

---

## 🧪 Tests

```bash
npm test          # run once
npm run test:watch
```

62 unit tests cover the pure/tricky logic: math helpers, the fixed-timestep accumulator (including its spiral-of-death guard), weapon fire-rate/ammo/reload (all 5 weapons) + extended v2 fields (headshot & movement-spread multipliers), the bot aim model, damage falloff, spawn-point selection, animal stat application (HP/speed/jump/size multipliers), headshot hitbox zoning, and all three parkour mechanics (bhop, slide, wall-run).

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
- ~~**More maps** — done (Plaza / Foundry / Dustbowl + rotation)~~
- **Team deathmatch** — team fields on entities + team-aware targeting
- **Gun-game** — per-player weapon progression on each kill
- ~~**Server-authoritative netcode** — done (peer-hosted: Node WebSocket server + authoritative `Sim` + snapshot/interpolation)~~

Design spec: `docs/superpowers/specs/2026-07-02-animal-strike-design.md`
v2 expansion spec: `docs/superpowers/specs/2026-07-03-animal-strike-v2-design.md`
Per-animal voices spec: `docs/superpowers/specs/2026-07-04-per-animal-voices-design.md`
Multi-map + rotation spec: `docs/superpowers/specs/2026-07-04-multi-map-rotation-design.md`
Multiplayer spec: `docs/superpowers/specs/2026-07-04-multiplayer-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-02-animal-strike.md`

---

## 🛠️ Tech

- [three.js](https://threejs.org/) r0.185 — WebGL rendering (incl. `EffectComposer` / `UnrealBloomPass` post-processing addons)
- [Vite](https://vitejs.dev/) 8 — dev server + bundler
- [Vitest](https://vitest.dev/) 4 — unit tests
- [MiniMax](https://www.minimaxi.com/) — generated music & voice assets (`scripts/generate_assets.py` for music + announcer; `scripts/generate_animal_voices.py` for per-animal voices)
- Vanilla ES modules throughout — no framework

## License

MIT
