#!/usr/bin/env python3
"""
Per-animal voice generator for AnimalStrike — drives the MiniMax API via the
minimax_mcp server's FastMCP tool registry. Produces 42 voice clips (7 animals
× 6 situations) into public/audio/voice/{ANIMAL}_{situation}.mp3.

Idempotent: skips files already present (>1KB). Reads the API key from
~/.zcode/cli/config.json if MINIMAX_API_KEY isn't in the env.

Usage:  uvx --with minimax-mcp python scripts/generate_animal_voices.py
"""
import asyncio
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "audio" / "voice"
OUT.mkdir(parents=True, exist_ok=True)


def setup_env():
    if not os.environ.get("MINIMAX_API_KEY"):
        cfg = Path.home() / ".zcode" / "cli" / "config.json"
        data = json.loads(cfg.read_text())
        env = data["mcp"]["servers"]["minimax-mcp"]["env"]
        os.environ["MINIMAX_API_KEY"] = env["MINIMAX_API_KEY"]
        os.environ["MINIMAX_API_HOST"] = env.get("MINIMAX_API_HOST", "https://api.minimax.io")


async def call_tool(name, args):
    import minimax_mcp.server as s
    result = await s.mcp.call_tool(name, args)
    parts = []
    if hasattr(result, "content") and result.content:
        for c in result.content:
            parts.append(getattr(c, "text", str(c)))
    return "\n".join(parts)


def extract_url(text):
    m = re.search(r"https?://[^\s\"')]+", text)
    return m.group(0) if m else None


def download(url, dest):
    urllib.request.urlretrieve(url, dest)


# Voice -> Animal mapping (from the design spec). Each animal a distinct character.
ANIMAL_VOICES = {
    "FOX":   "English_PassionateWarrior",   # eager scout
    "WOLF":  "English_magnetic_voiced_man",  # steady soldier
    "PANDA": "English_ManWithDeepVoice",     # deep tank
    "TIGER": "English_AssertiveQueen",       # fierce striker
    "BEAR":  "English_BossyLeader",          # bossy juggernaut
    "BUNNY": "English_Comedian",             # cocky speedster
    "OWL":   "English_WiseScholar",          # calm marksman
}

# Fallback voices if a primary fails (distinct alternatives from the catalog).
FALLBACK_VOICES = {
    "FOX":   ["English_Strong-WilledBoy", "English_FriendlyPerson"],
    "WOLF":  ["English_Trustworth_Man", "English_Diligent_Man"],
    "PANDA": ["English_Deep-VoicedGentleman", "English_Steadymentor"],
    "TIGER": ["English_ImposingManner", "English_ConfidentWoman"],
    "BEAR":  ["English_BossyLeader", "English_ManWithDeepVoice"],
    "BUNNY": ["English_PlayfulGirl", "English_WhimsicalGirl"],
    "OWL":   ["English_WiseScholar", "English_CalmWoman"],
}

# 7 animals × 6 situations = 42 clips. (animal, situation, line, emotion)
SCRIPT = [
    # FOX — eager scout
    ("FOX", "kill",    "Too slow!",            "happy"),
    ("FOX", "hurt",    "Ow, come on!",         "sad"),
    ("FOX", "death",   "Not... like this...",  "sad"),
    ("FOX", "spawn",   "Back in the fight!",   "happy"),
    ("FOX", "victory", "Swift and deadly!",    "happy"),
    ("FOX", "taunt",   "Catch me if you can!", "happy"),
    # WOLF — steady soldier
    ("WOLF", "kill",    "Target down.",          "happy"),
    ("WOLF", "hurt",    "Taking fire!",          "sad"),
    ("WOLF", "death",   "Squad... avenge me...", "sad"),
    ("WOLF", "spawn",   "Repositioning.",        "neutral"),
    ("WOLF", "victory", "Mission accomplished.", "happy"),
    ("WOLF", "taunt",   "Hold the line.",        "neutral"),
    # PANDA — deep tank
    ("PANDA", "kill",    "Crushed.",        "happy"),
    ("PANDA", "hurt",    "That... tickles.", "sad"),
    ("PANDA", "death",   "I... fall...",     "sad"),
    ("PANDA", "spawn",   "I return.",        "neutral"),
    ("PANDA", "victory", "Unstoppable.",     "happy"),
    ("PANDA", "taunt",   "Bring it.",        "neutral"),
    # TIGER — fierce striker
    ("TIGER", "kill",    "Torn apart!",        "happy"),
    ("TIGER", "hurt",    "You dare?!",         "angry"),
    ("TIGER", "death",   "No... I had them...", "sad"),
    ("TIGER", "spawn",   "The hunt resumes!",  "happy"),
    ("TIGER", "victory", "Top of the chain!",  "happy"),
    ("TIGER", "taunt",   "Show me your claws!", "angry"),
    # BEAR — bossy juggernaut
    ("BEAR", "kill",    "Pathetic.",        "neutral"),
    ("BEAR", "hurt",    "Is that all?",     "neutral"),
    ("BEAR", "death",   "Impossible...",    "sad"),
    ("BEAR", "spawn",   "Out of my way.",   "neutral"),
    ("BEAR", "victory", "I told you.",      "happy"),
    ("BEAR", "taunt",   "You bore me.",     "neutral"),
    # BUNNY — cocky speedster
    ("BUNNY", "kill",    "Zoom and boom!",    "happy"),
    ("BUNNY", "hurt",    "Hey, rude!",        "sad"),
    ("BUNNY", "death",   "Wascally... wabbit...", "sad"),
    ("BUNNY", "spawn",   "Let's bounce!",     "happy"),
    ("BUNNY", "victory", "Too fast for you!", "happy"),
    ("BUNNY", "taunt",   "Beep beep!",        "happy"),
    # OWL — calm marksman
    ("OWL", "kill",    "Calculated.",          "neutral"),
    ("OWL", "hurt",    "Imprecise hit.",       "sad"),
    ("OWL", "death",   "My calculations... flawed...", "sad"),
    ("OWL", "spawn",   "Observation resumes.", "neutral"),
    ("OWL", "victory", "Precision prevails.",  "happy"),
    ("OWL", "taunt",   "I see everything.",    "neutral"),
]


def gen_clip(animal, situation, line, emotion):
    fn = f"{animal}_{situation}.mp3"
    dest = OUT / fn
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  skip (exists): {fn}")
        return True
    # Try primary voice, then fallbacks
    voices = [ANIMAL_VOICES[animal]] + FALLBACK_VOICES.get(animal, [])
    for i, vid in enumerate(voices):
        tag = "" if i == 0 else f" (fallback {i})"
        print(f"  {fn}  [{vid}]{tag}  {line!r}")
        args = {"text": line, "voice_id": vid, "format": "mp3", "emotion": emotion, "speed": 1.0}
        try:
            txt = asyncio.run(call_tool("text_to_audio", args))
            url = extract_url(txt)
            if url:
                download(url, dest)
                print(f"    -> {dest.name} ({dest.stat().st_size} bytes)")
                return True
            print(f"    !! no URL: {txt[:120]}")
        except Exception as e:
            print(f"    !! {vid} failed: {e}")
    return False


def main():
    setup_env()
    print(f"=== Generating 42 per-animal voice clips into {OUT} ===")
    ok = bad = 0
    for animal, situation, line, emotion in SCRIPT:
        if gen_clip(animal, situation, line, emotion):
            ok += 1
        else:
            bad += 1
    print(f"=== DONE: {ok} ok / {bad} failed ===")
    for p in sorted(OUT.glob("*.mp3")):
        print(f"  {p.name}  ({p.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
