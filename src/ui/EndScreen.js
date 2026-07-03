// Shown when the match ends (frag target reached or timer hits 0). Podium + PLAY AGAIN.
export class EndScreen {
  constructor(root, { onPlayAgain } = {}) {
    this.root = root;
    this.onPlayAgain = onPlayAgain;
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;background:rgba(6,10,16,.92);
      display:none;flex-direction:column;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;pointer-events:auto;`;
    root.appendChild(this.el);
  }
  show(rankedPlayers) {
    const winner = rankedPlayers[0];
    const wAnimal = winner.animalId || 'Player';
    const rows = rankedPlayers.map((p, i) => {
      const a = p.animalId || '?';
      const kd = p.deaths === 0 ? p.score.toFixed(1) : (p.score / p.deaths).toFixed(1);
      return `<div style="display:flex;gap:24px;padding:6px 0;${i === 0 ? 'color:#ffb84d;font-weight:700' : ''}">
        <span style="width:30px;">${i + 1}.</span>
        <span style="width:140px;">${a}${p.isLocal ? ' (You)' : ''}</span>
        <span style="width:80px;">${p.score} kills</span>
        <span style="width:80px;">K/D ${kd}</span>
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <h1 style="font-size:36px;margin:0 0 8px;">${winner.isLocal ? 'VICTORY' : 'DEFEATED'}</h1>
      <p style="opacity:.8;margin:0 0 24px;">Winner: ${wAnimal}${winner.isLocal ? ' (You)' : ''} — ${winner.score} frags</p>
      <div style="background:rgba(255,255,255,.06);padding:16px 28px;border-radius:10px;margin-bottom:32px;">${rows}</div>
      <button id="again-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">PLAY AGAIN</button>`;
    this.el.style.display = 'flex';
    this.el.querySelector('#again-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onPlayAgain) this.onPlayAgain();
    };
  }
  hide() { this.el.style.display = 'none'; }
}
