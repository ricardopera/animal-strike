# AnimalStrike Multiplayer — Deployment Guide

The AnimalStrike multiplayer uses a **dedicated server**: a standalone Node process that owns the authoritative simulation. Clients connect to it by `IP:port`. This guide covers the common deployment scenarios and the NAT/firewall considerations for each.

The browser's WebSocket client cannot perform NAT traversal on its own, so the server must be reachable at a known address. Pick the scenario that matches where you're hosting.

---

## 1. Same machine (local testing)

Run the server and play on one machine:

```bash
npm install
npm run server          # terminal 1: server on :8080
npm run dev             # terminal 2: Vite dev server (the game)
```

Open the game, pick **Connect**, enter `localhost:8080`, **CONNECT**. Open a second browser tab and connect again to see two players + bots.

---

## 2. LAN (same network)

Best for a home/office LAN — no router configuration needed.

1. On the host machine, start the server: `npm run server`.
2. Find the host's LAN IP:
   - **Linux:** `ip addr` (look for `inet 192.168.x.x` under your interface)
   - **macOS:** `ifconfig` or System Settings → Network
   - **Windows:** `ipconfig` (look for `IPv4 Address`)
3. Make sure the local firewall allows inbound TCP on the port (the server uses TCP via WebSocket):
   - **Linux (ufw):** `sudo ufw allow 8080/tcp`
   - **Windows:** allow Node through Windows Defender Firewall when prompted, or add an inbound rule for TCP 8080.
4. On each player's machine, open the game, pick **Connect**, enter `<host-LAN-IP>:8080`, **CONNECT**.

---

## 3. Over the internet (home-hosted)

For friends outside your LAN. The host must expose the port to the public internet.

1. Start the server: `npm run server` (binds to `0.0.0.0` — all interfaces).
2. **Port-forward** the port (default `8080/tcp`) on your router to the host machine's LAN IP. Steps vary by router: look for "Port Forwarding" / "Virtual Server" in the router admin UI (usually at `http://192.168.1.1`). Forward **TCP** `8080` → host LAN IP `:8080`.
3. Open the port in the host firewall (see §2).
4. Find your **public** IP: visit `https://ifconfig.me` from the host, or run `curl ifconfig.me`.
5. Share `<public-ip>:8080` with your friends. They pick **Connect**, enter it, **CONNECT**.

**Notes:**
- Your public IP may change when your router reboots (most home ISPs use dynamic IPs). Consider a dynamic DNS service for a stable hostname.
- Some ISPs use Carrier-Grade NAT (CGNAT) which blocks inbound connections entirely. If port-forwarding doesn't work and you can't reach your server, CGNAT is the likely cause — use the cloud option (§4) instead.

---

## 4. Cloud / VPS (recommended for "always on")

The simplest path to a reliably-reachable server: rent a small Linux VM (any cloud provider) with a **public IP**. There's no NAT to traverse — clients connect to the VM's public IP directly.

### Setup

1. Spin up a small Linux VM (1 vCPU / 1 GB RAM is plenty). Note its public IP.
2. Install Node.js 20+ and git, clone the repo, install deps:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm git
   git clone <your-repo-url> animalstrike && cd animalstrike
   npm install
   ```
3. Open the firewall: `sudo ufw allow 8080/tcp`.
4. Run the server under a process manager so it restarts on crash/reboot.

### systemd unit (recommended)

Create `/etc/systemd/system/animalstrike.service`:
```ini
[Unit]
Description=AnimalStrike dedicated server
After=network.target

[Service]
Type=simple
User=animalstrike
WorkingDirectory=/home/animalstrike/animalstrike
ExecStart=/usr/bin/npm run server
Restart=on-failure
RestartSec=3
# Optional config via environment:
Environment=AS_PORT=8080
Environment=AS_MAX_PLAYERS=8

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now animalstrike
sudo journalctl -u animalstrike -f   # tail logs
```

### (Alternative) pm2

```bash
sudo npm install -g pm2
pm2 start "npm run server" --name animalstrike
pm2 save
pm2 startup        # follow the printed instruction to enable boot startup
```

### Optional: TLS via a reverse proxy

Browsers treat `ws://` (unencrypted) on a public IP as insecure. For a production-grade setup, front the server with nginx or Caddy to terminate TLS and proxy the WebSocket upgrade (`wss://`). This also lets you run on port 443 and put a hostname in front of it. Example nginx snippet:
```nginx
server {
    listen 443 ssl;
    server_name animalstrike.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```
Then clients connect to `wss://animalstrike.example.com`.

---

## Configuration summary

All settings can be set via env vars (`AS_*`), CLI flags, or `server/config.json`. See `server/README.md` for the full table. Key ones for deployment:

- `AS_HOST` / `--host` — bind address (`0.0.0.0` to listen on all interfaces; required for any non-local play).
- `AS_PORT` / `--port` — the port clients put after the IP.
- `AS_MAX_PLAYERS` — total slots (humans + bots); 2–16.
- `AS_AUTO_START` — auto-start a match once `AS_MIN_PLAYERS` humans are connected.

---

## Troubleshooting

- **"Could not connect"** — wrong IP/port, server not running, or firewall/router blocking the port. From the player's machine, try `curl http://<ip>:<port>` — a running server will accept the TCP connection.
- **Can connect on LAN but not over the internet** — port-forwarding missing/incorrect, or CGNAT on the host's ISP. Use the cloud option.
- **Intermittent disconnects** — likely network jitter; the server gives 60s to reconnect and reclaim your slot automatically.
