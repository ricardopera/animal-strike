import { msg, parse } from '../sim/protocol.js';

// Browser WebSocket client. Connects to the host server, sends local inputs,
// and exposes received snapshots/messages via callbacks. No THREE — pure transport.
export class NetClient {
  constructor() {
    this.ws = null;
    this.you = null;
    this.isHost = false;
    this.connected = false;
    this.onWelcome = null;     // ({you, isHost, roster})
    this.onRoster = null;      // (roster)
    this.onMatchStart = null;  // ({map, fragTarget, seconds})
    this.onSnapshot = null;    // (snapshot)
    this.onMatchEnd = null;    // (ranked)
    this.onDisconnect = null;  // ()
    this.onError = null;       // (event)
    this._inputSeq = 0;
  }
  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) { reject(e); return; }
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = (e) => { if (this.onError) this.onError(e); reject(e); };
      this.ws.onmessage = (ev) => this._handle(parse(ev.data));
      this.ws.onclose = () => { this.connected = false; if (this.onDisconnect) this.onDisconnect(); };
    });
  }
  hello(name, animal, weapon) { this._send(msg('hello', { name, animal, weapon })); }
  setLoadout(animal, weapon) { this._send(msg('loadout', { animal, weapon })); }
  start(map, fragTarget, seconds) { this._send(msg('start', { map, fragTarget, seconds })); }
  sendInput(intent) {
    this._inputSeq++;
    this._send(msg('input', {
      seq: this._inputSeq, f: intent.forward, s: intent.strafe, j: intent.jump,
      sp: intent.sprint, c: intent.crouch, fire: intent.firing,
      reload: intent.reloadRequested, yaw: intent.yaw, pitch: intent.pitch,
    }));
  }
  _handle(m) {
    if (!m) return;
    if (m.t === 'welcome') { this.you = m.you; this.isHost = m.isHost; if (this.onWelcome) this.onWelcome(m); }
    else if (m.t === 'roster' && this.onRoster) this.onRoster(m.roster);
    else if (m.t === 'matchStart' && this.onMatchStart) this.onMatchStart(m);
    else if (m.t === 'snapshot' && this.onSnapshot) this.onSnapshot(m);
    else if (m.t === 'matchEnd' && this.onMatchEnd) this.onMatchEnd(m.ranked);
  }
  _send(s) { if (this.ws && this.ws.readyState === 1) this.ws.send(s); }
  close() { if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } }
}
