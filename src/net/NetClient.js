import { msg, parse } from '../sim/protocol.js';
import { msgAuth, msgReconnect, msgSelectMap } from '../sim/protocol.js';

// Browser WebSocket client for the dedicated server. Connects, sends inputs,
// exposes received messages via callbacks. No THREE — pure transport.
// Persists {id, token} to localStorage for reconnect across reloads.
const LS_KEY = 'as_reconnect';

export class NetClient {
  constructor() {
    this.ws = null;
    this.you = null;
    this.token = null;
    this.connected = false;
    this.onWelcome = null;      // ({you, token, map, roster})
    this.onRoster = null;       // (roster)
    this.onMatchStart = null;   // ({map, fragTarget, seconds})
    this.onSnapshot = null;     // (snapshot)
    this.onMatchEnd = null;     // (ranked)
    this.onMapSelected = null;  // ({map})
    this.onKick = null;         // ({reason})
    this.onError = null;        // ({code, msg})
    this.onDisconnect = null;   // ()
    this._inputSeq = 0;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) { reject(e); return; }
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = (e) => { reject(e); };
      this.ws.onmessage = (ev) => this._handle(parse(ev.data));
      this.ws.onclose = () => { this.connected = false; if (this.onDisconnect) this.onDisconnect(); };
    });
  }

  // Join the server. If a prior {id,token} is stored and still valid, attempt a
  // reconnect first; the server replies with bad_reconnect if expired, and the
  // caller can fall back to a fresh auth.
  hello(name, animal, weapon) {
    const saved = this._loadSaved();
    if (saved && saved.id && saved.token) {
      this._send(msgReconnect(saved.id, saved.token));
      // stash the fallback so a bad_reconnect can re-auth
      this._pendingAuth = { name, animal, weapon };
    } else {
      this._send(msgAuth(name, animal, weapon));
    }
  }

  setLoadout(animal, weapon) { this._send(msg('loadout', { animal, weapon })); }
  selectMap(map) { this._send(msgSelectMap(map)); }
  start(map) { this._send(msg('start', { map })); }

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
    if (m.t === 'welcome') {
      this.you = m.you; this.token = m.token;
      this._saveSaved({ id: m.you, token: m.token });
      if (this._pendingAuth) this._pendingAuth = null; // reconnect succeeded
      if (this.onWelcome) this.onWelcome(m);
    } else if (m.t === 'roster' && this.onRoster) this.onRoster(m.roster);
    else if (m.t === 'mapSelected' && this.onMapSelected) this.onMapSelected(m);
    else if (m.t === 'matchStart' && this.onMatchStart) this.onMatchStart(m);
    else if (m.t === 'snapshot' && this.onSnapshot) this.onSnapshot(m);
    else if (m.t === 'matchEnd' && this.onMatchEnd) this.onMatchEnd(m.ranked);
    else if (m.t === 'kick') { if (this.onKick) this.onKick(m); this.close(); }
    else if (m.t === 'error') {
      if (m.code === 'bad_reconnect' && this._pendingAuth) {
        // fall back to a fresh auth
        const { name, animal, weapon } = this._pendingAuth;
        this._pendingAuth = null;
        this._send(msgAuth(name, animal, weapon));
        return;
      }
      if (this.onError) this.onError(m);
    }
  }

  _send(s) { if (this.ws && this.ws.readyState === 1) this.ws.send(s); }

  _loadSaved() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  _saveSaved(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {} }
  clearSaved() { try { localStorage.removeItem(LS_KEY); } catch {} }

  close() { if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } }
}
