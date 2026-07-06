# AnimalStrike — Dedicated Server

A standalone Node WebSocket server that runs the **authoritative game simulation**. It is an always-on process: clients connect to it by `IP:port` and never host games themselves. Empty slots fill with bots so every match is full; when a human joins mid-match they take over a bot's slot.

This is **not** peer-hosted and **not** internet matchmaking. Players connect directly to this server on a LAN or over the internet.

## Run the server

From the project root:

```bash
npm install          # installs client + server deps (incl. ws) at the project root
npm run server       # starts the WebSocket server on :8080
```

The server listens on `ws://0.0.0.0:8080` by default. Configure it via env vars, CLI flags, or a `server/config.json` file (see `server/config.example.json`).

```bash
# env vars
AS_PORT=9000 AS_MAX_PLAYERS=8 npm run server

# CLI flags
npm run server -- --port 9000 --max-players 8

# config file (precedence: CLI > env > file > defaults)
cp server/config.example.json server/config.json
$EDITOR server/config.json
npm run server
```

On startup it prints the address to share:

```
AnimalStrike dedicated server listening on ws://0.0.0.0:8080
Players connect to: ws://<your-ip>:8080
Config: maxPlayers=6 map=plaza fragTarget=25 matchSeconds=300 autoStart=false
```

## Operator commands (stdin)

While the server runs, you can type into its terminal:

| Command | Effect |
|---|---|
| `start [map]` | Start a match now (optional map id) |
| `map <id>` | Set the lobby's selected map |
| `status` | Print match/human/lobby state |
| `stop` | Stop the server |

You can also set `autoStart: true` (or `AS_AUTO_START=true` / `--auto-start`) to auto-start a match once `minPlayers` humans have connected.

## Configuration reference

| Setting | Env | CLI | Default | Notes |
|---|---|---|---|---|
| Bind host | `AS_HOST` | `--host` | `0.0.0.0` | |
| Bind port | `AS_PORT` | `--port` | `8080` | 1–65535 |
| Max players | `AS_MAX_PLAYERS` | `--max-players` | `6` | 2–16 |
| Min players (auto-start) | `AS_MIN_PLAYERS` | `--min-players` | `2` | |
| Match map | `AS_MAP` | — | `plaza` | must be a known map id |
| Frag target | `AS_FRAG_TARGET` | — | `25` | |
| Match seconds | `AS_MATCH_SECONDS` | — | `300` | |
| Auto-start | `AS_AUTO_START` | `--auto-start` | `false` | |
| Max connections per IP | `AS_MAX_PER_IP` | — | `4` | anti-spam |

## How it works

- The server owns one authoritative `Sim` (see `src/sim/Sim.js`) — it runs movement, collision, hit detection, and scoring headlessly.
- Clients send only their **inputs** (movement + aim) and **render** the snapshots the server broadcasts at ~20Hz.
- The match is always full: humans fill slots first, bots backfill the rest. A late-joining human takes over a bot; a leaving human's slot becomes a bot.
- Any connected player can change the map and start the match from the lobby.
- If a player drops, they have 60 seconds to reconnect and reclaim their slot (score retained); after that the bot keeps the slot.
- The server validates inputs (movement clamped to valid ranges, fire-rate enforced server-side) so a client cannot cheat movement or fire faster than the weapon allows.

## Connecting

Open the game in a browser, pick **Connect**, enter the server's `ip:port` (e.g. `192.168.1.5:8080`), and press **CONNECT**. Wait in the lobby — anyone can pick the map and press **Enter** (or the Start control) to begin.

## Over the internet / NAT

See `docs/multiplayer-deployment.md` for LAN, port-forwarding, firewall, and cloud/VPS setup.
