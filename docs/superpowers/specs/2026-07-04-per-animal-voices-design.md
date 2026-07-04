# AnimalStrike — Per-Animal Voices Expansion Spec

**Status:** Approved (2026-07-04)
**Builds on:** v2 (lean announcer + shared grunts). This promotes the voice system from "announcer + pitch-shifted shared grunts" to **each of the 7 animals speaking in its own distinct character voice**.

## Goal
Every animal character talks in its own voice. When a Fox frags someone, you hear the Fox's voice; when a Bear dies, you hear the Bear's death line. The animal choice now has an audio identity, not just stats + a skin. The existing announcer stays for neutral match events.

## Voice → Animal mapping (7 distinct MiniMax voices)
Chosen from the 45-voice English catalog to match each animal's class personality and maximize variety across gender/tone:

| Animal | Class | Voice | Why |
|---|---|---|---|
| **Fox** (Scout, fast/agile) | Scout | `English_PassionateWarrior` | Energetic, heroic, dramatic — the eager scout |
| **Wolf** (Soldier, balanced) | Soldier | `English_magnetic_voiced_man` | Steady, commanding, leaderly — the squad soldier |
| **Panda** (Tank, slow/tough) | Tank | `English_ManWithDeepVoice` | Deep, imposing — the heavy tank |
| **Tiger** (Striker, aggressive) | Striker | `English_AssertiveQueen` | Fierce, commanding — the aggressive striker |
| **Bear** (Juggernaut, biggest) | Juggernaut | `English_BossyLeader` | Bossy, dominant — the unstoppable juggernaut |
| **Bunny** (Speedster, tiny/fast) | Speedster | `English_Comedian` | Playful, funny — the cocky speedster |
| **Owl** (Marksman, precise) | Marksman | `English_WiseScholar` | Calm, wise, precise — the methodical marksman |

These reuse `English_PassionateWarrior` (already proven in the lean set as the announcer) for Fox — but Fox lines differ from the announcer's neutral match lines, so no collision in context.

## Situations (6 per animal = 42 clips)
Each animal speaks in these 6 combat situations (the killer or victim speaks from their animal's voice):

1. **kill** — after fragging an enemy. Tone: triumphant per personality.
2. **hurt** — when taking damage. Tone: pained/annoyed per personality.
3. **death** — when killed. Tone: dramatic demise per personality.
4. **spawn** — on respawn. Tone: re-entering the fight, cocky/determined.
5. **victory** — when winning the match (only the local player's animal plays; others are silent). Tone: ultimate win.
6. **taunt** — occasional idle taunt (random chance when the bot is in ENGAGE state, ~every 8-15s, gated by cooldown so it's not spammy). Adds personality/ambience.

That's 7 animals × 6 = **42 clips**. Filenames: `public/audio/voice/{animalId}_{situation}.mp3` (e.g. `FOX_kill.mp3`, `BUNNY_taunt.mp3`).

## Line script (per animal)
Lines are short (1-4 words) for snappy combat callouts. Each reflects the animal's personality.

### Fox (Scout) — eager, fast, heroic
- kill: "Too slow!"
- hurt: "Ow, come on!"
- death: "Not... like this..."
- spawn: "Back in the fight!"
- victory: "Swift and deadly!"
- taunt: "Catch me if you can!"

### Wolf (Soldier) — steady, professional, leader
- kill: "Target down."
- hurt: "Taking fire!"
- death: "Squad... avenge me..."
- spawn: "Repositioning."
- victory: "Mission accomplished."
- taunt: "Hold the line."

### Panda (Tank) — deep, slow, heavy
- kill: "Crushed."
- hurt: "That... tickles."
- death: "I... fall..."
- spawn: "I return."
- victory: "Unstoppable."
- taunt: "Bring it."

### Tiger (Striker) — fierce, aggressive, commanding
- kill: "Torn apart!"
- hurt: "You dare?!"
- death: "No... I had them..."
- spawn: "The hunt resumes!"
- victory: "Top of the chain!"
- taunt: "Show me your claws!"

### Bear (Juggernaut) — bossy, dominant
- kill: "Pathetic."
- hurt: "Is that all?"
- death: "Impossible..."
- spawn: "Out of my way."
- victory: "I told you."
- taunt: "You bore me."

### Bunny (Speedster) — cocky, playful, funny
- kill: "Zoom and boom!"
- hurt: "Hey, rude!"
- death: "Wascally... wabbit..."
- spawn: "Let's bounce!"
- victory: "Too fast for you!"
- taunt: "Beep beep!"

### Owl (Marksman) — calm, wise, precise
- kill: "Calculated."
- hurt: "Imprecise hit."
- death: "My calculations... flawed..."
- spawn: "Observation resumes."
- victory: "Precision prevails."
- taunt: "I see everything."

## Architecture changes

### `VoicePlayer` extension
- Load per-animal clips: `preload()` now fetches 42 files `{animalId}_{situation}.mp3` plus keeps the existing 9 announcer/grunt clips. Missing per-animal clips fall back to the existing synth blip (so the game works if generation partially fails).
- New method `playAnimal(animalId, situation)` — plays `{animalId}_{situation}` with the situation's cooldown. No pitch-shifting needed (the real voices are already distinct); keep `pitchForAnimal` as a no-op fallback for the synth path only.
- Per-(animal,situation) cooldown map so a Bunny doesn't spam taunts.
- The existing `play(key)` for announcer clips (matchStart/lowTime/fragMilestone) stays unchanged.

### Game hooks
Currently the Game plays shared grunts gated on `shooter.isLocal` / `best.target.isLocal`. Change to:
- **kill**: `voice.playAnimal(shooter.animalId, 'kill')` — the KILLER's animal speaks. (Was: shared gruntKill only for local.)
- **hurt**: `voice.playAnimal(best.target.animalId, 'hurt')` — the VICTIM's animal speaks. (Was: shared grunt only for local.)
- **death**: `voice.playAnimal(best.target.animalId, 'death')` — the VICTIM's animal speaks.
- **spawn** (in respawnPlayer): `voice.playAnimal(player.animalId, 'spawn')`.
- **victory** (in endMatch): `voice.playAnimal(winnerAnimalId, 'victory')` — only the winner.
- **taunt** (in AIController or bot loop): when a bot is ENGAGE and a per-bot taunt cooldown elapses (~10s + jitter), `voice.playAnimal(bot.animalId, 'taunt')`. Player taunt could be on a key press (e.g. `T`) but keep optional — focus on bots for ambience.

Important: voices now play for ALL players (bots included), not just the local player — that's the point (you hear Bear taunting, Bunny yipping, etc.). Spatial-ish volume by distance would be ideal but is out of scope; play at a moderate fixed volume with the existing cooldown gating to avoid cacophony.

### Settings
The existing "Voice/SFX" mute toggle covers these. No new UI.

## Testing
- Vitest: a test that `playAnimal('FOX','kill')` resolves to the right clip key and respects cooldowns; a test that a missing clip falls back to synth without throwing.
- Playtest: confirm distinct voices fire on kill/death/taunt in a live match.

## Non-goals
- Spatial/3D positional audio (distance-based volume) — deferred; all voices at flat moderate volume.
- Player-triggered taunt key — focus on automatic bot taunts for ambience.
- Per-animal voice for the *announcer* match events (matchStart/lowTime) — those stay the single PassionateWarrior announcer.

## Generation
Reuse `scripts/generate_assets.py` pattern: extend the VOICE_SCRIPT to include all 42 per-animal clips (id, voice_id, filename, emotion). Run via the MiniMax pipeline. Idempotent (skip existing). Fall back voices for any that fail (e.g. pick a different voice per the catalog if one errors).
