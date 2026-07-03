#!/usr/bin/env python3
"""
Asset generator for AnimalStrike — drives the MiniMax API via the minimax_mcp
server's FastMCP tool registry. Produces voice clips + music into
public/audio/{voice,music}/ so the Vite-served game can fetch them.

Idempotent: skips files already present (>1KB). Reads the API key from
~/.zcode/cli/config.json if MINIMAX_API_KEY isn't in the env.

Usage:  uvx --with minimax-mcp python scripts/generate_assets.py
"""
import asyncio
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "audio"
(OUT / "voice").mkdir(parents=True, exist_ok=True)
(OUT / "music").mkdir(parents=True, exist_ok=True)


def setup_env():
    if not os.environ.get("MINIMAX_API_KEY"):
        cfg = Path.home() / ".zcode" / "cli" / "config.json"
        data = json.loads(cfg.read_text())
        env = data["mcp"]["servers"]["minimax-mcp"]["env"]
        os.environ["MINIMAX_API_KEY"] = env["MINIMAX_API_KEY"]
        os.environ["MINIMAX_API_HOST"] = env.get("MINIMAX_API_HOST", "https://api.minimax.io")


async def call_tool(name, args):
    """Invoke a registered minimax-mcp tool and return its concatenated text."""
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


def gen_voice(text, voice_id, filename, emotion="auto", speed=1.0):
    dest = OUT / "voice" / filename
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  skip (exists): voice/{filename}")
        return True
    print(f"  voice: voice/{filename}  [{voice_id}]  {text!r}")
    args = {"text": text, "voice_id": voice_id, "format": "mp3",
            "emotion": emotion, "speed": speed}
    try:
        txt = asyncio.run(call_tool("text_to_audio", args))
        url = extract_url(txt)
        if url:
            download(url, dest)
            print(f"    -> {dest.name} ({dest.stat().st_size} bytes)")
            return True
        print(f"    !! no URL: {txt[:200]}")
    except Exception as e:
        print(f"    !! {filename} failed: {e}")
    return False


def gen_music(prompt, lyrics, filename):
    dest = OUT / "music" / filename
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  skip (exists): music/{filename}")
        return True
    print(f"  music: music/{filename}  {prompt[:50]}...")
    args = {"prompt": prompt, "lyrics": lyrics, "format": "mp3",
            "sample_rate": 32000, "bitrate": 128000}
    try:
        txt = asyncio.run(call_tool("music_generation", args))
        url = extract_url(txt)
        if url:
            download(url, dest)
            print(f"    -> {dest.name} ({dest.stat().st_size} bytes)")
            return True
        print(f"    !! no URL: {txt[:200]}")
    except Exception as e:
        print(f"    !! {filename} failed: {e}")
    return False


# --- Lean voice set: announcer + shared grunts (pitch-shifted per-animal in code) ---
ANNOUNCER = "English_PassionateWarrior"   # proven in pilot
GRUNT = "English_FriendlyGuy"             # neutral shared voice

VOICE_SCRIPT = [
    # (text, voice_id, filename, emotion)
    ("Animal Strike. Fight!",       ANNOUNCER, "match_start.mp3",    "happy"),
    ("Thirty seconds left.",        ANNOUNCER, "low_time.mp3",       "sad"),
    ("Victory!",                    ANNOUNCER, "victory.mp3",        "happy"),
    ("Defeated.",                   ANNOUNCER, "defeat.mp3",         "sad"),
    ("Five frags.",                 ANNOUNCER, "frag_milestone.mp3", "happy"),
    ("Hah!",                        GRUNT,     "grunt_kill.mp3",     "happy"),
    ("Oof.",                        GRUNT,     "grunt_hurt.mp3",     "sad"),
    ("Agh.",                        GRUNT,     "grunt_death.mp3",    "sad"),
    ("Ready.",                      GRUNT,     "grunt_spawn.mp3",    "neutral"),
]

MUSIC_SCRIPT = [
    # (prompt, lyrics, filename)
    ("High-energy electronic rock loop for a competitive arena shooter main menu, "
     "driving beat, heroic, loopable, instrumental gap",
     "[Intro]\nAnimal Strike\n[Loop]\n(instrumental)", "menu_loop.mp3"),
    ("Intense fast-paced electronic combat loop for an arena shooter deathmatch, "
     "urgent percussion, aggressive synths, loopable, instrumental",
     "[Loop]\n(instrumental)", "combat_loop.mp3"),
]


def main():
    setup_env()
    print("=== Generating VOICE clips ===")
    vok = vbad = 0
    for text, vid, fn, emo in VOICE_SCRIPT:
        if gen_voice(text, vid, fn, emotion=emo):
            vok += 1
        else:
            vbad += 1
    print(f"=== Generating MUSIC tracks ===")
    mok = mbad = 0
    for prompt, lyrics, fn in MUSIC_SCRIPT:
        if gen_music(prompt, lyrics, fn):
            mok += 1
        else:
            mbad += 1
    print(f"=== DONE: {vok} voice ok / {vbad} failed, {mok} music ok / {mbad} failed ===")
    print(f"Output: {OUT}")
    for p in sorted(OUT.rglob("*.mp3")):
        print(f"  {p.relative_to(OUT)}  ({p.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
