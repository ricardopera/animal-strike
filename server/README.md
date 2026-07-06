# AnimalStrike — Multiplayer Host Server

A small Node WebSocket server that runs the **authoritative game simulation** for a multiplayer match. One player (the **host**) runs this; up to 5 others join via the host's address. Empty slots backfill with bots (6 players total).

This is **peer-hosted**, not internet matchmaking — players connect directly to the host on a LAN or over the internet (host port-forwards).

## Run the host

From the project root:

```bash
npm install      # installs both client + server deps (incl. ws) at the project root
npm run host     # starts the WebSocket server on :8080
```

> `ws` is a dependency of the root `package.json`, so a single `npm install` at the
> project root installs everything. There is no separate `server/package.json`.

The server listens on `ws://0.0.0.0:8080` by default. Override the port with `PORT`:

```bash
PORT=9000 npm run host
```

On startup it prints the address to share:

```
AnimalStrike host server listening on ws://0.0.0.0:8080
Share this address with players: ws://<your-ip>:8080
```

## Play

1. **Host:** start the server (`npm run host`), then open the game in your browser, pick **Host** mode, choose your animal + weapon, and press **START SERVER + PLAY**. (The host's browser connects to its own local server.)
2. **Joiners:** open the game, pick **Join** mode, enter the host's `ip:port` (e.g. `192.168.1.5:8080`), and press **CONNECT**. Wait for the host to start the match.

## Over the internet

For friends outside your LAN, the host must **port-forward** 8080 (or your `PORT`) to their machine, then share their public IP. Find your LAN IP with `ip addr` (Linux) / `ipconfig` (Windows); your public IP via a site like `ifconfig.me`.

## How it works

- The server owns one authoritative `Sim` (see `src/sim/Sim.js`) — it runs movement, collision, hit detection, and scoring headlessly.
- Clients (host included) send only their **inputs** (movement + aim) and **render** the snapshots the server broadcasts at ~20Hz.
- Remote players are interpolated between snapshots (~100ms behind) for smooth motion; your own movement uses naive local prediction for responsiveness.
- If a player disconnects, their slot converts to a bot.
- Closing the host's **browser tab** does not end the match — only stopping the Node server does.
