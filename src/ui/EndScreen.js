// Shown when the match ends (frag target reached or timer hits 0). Podium + PLAY AGAIN.
// 1st/2nd/3rd get medal glyphs + gold/silver/bronze styling; the winner (1st)
// gets a glow and (on a local-player win) a celebratory accent under the title.
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

    // Placement tiers: gold/silver/bronze color + medal glyph for 1st/2nd/3rd.
    const TIERS = [
      { color: '#ffb84d', glyph: '👑' }, // 1st — gold + crown
      { color: '#c0c8d4', glyph: '🥈' }, // 2nd — silver
      { color: '#cd7f32', glyph: '🥉' }, // 3rd — bronze
    ];

    const rows = rankedPlayers.map((p, i) => {
      const a = p.animalId || '?';
      const kd = p.deaths === 0 ? p.score.toFixed(1) : (p.score / p.deaths).toFixed(1);
      const tier = TIERS[i];
      const isFirst = i === 0;
      const rankStr = tier ? `${tier.glyph} ${i + 1}.` : `${i + 1}.`;
      const colorStyle = tier
        ? `color:${tier.color};font-weight:700;${isFirst ? 'font-size:19px;text-shadow:0 0 12px ' + tier.color + '88;' : ''}`
        : 'color:#cfd6e0;';
      return `<div style="display:flex;gap:18px;align-items:center;padding:${isFirst ? '9px' : '6px'} 0;">
        <span style="width:46px;${colorStyle}">${rankStr}</span>
        <span style="width:140px;${colorStyle}">${a}${p.isLocal ? ' (You)' : ''}</span>
        <span style="width:80px;${colorStyle}">${p.score} kills</span>
        <span style="width:80px;${colorStyle}">K/D ${kd}</span>
      </div>`;
    }).join('');

    // Celebratory accent: sparkles + gradient underline, only on a local win.
    const accent = winner.isLocal
      ? `<div style="margin:2px 0 14px;font-size:18px;letter-spacing:8px;color:#ffd24a;text-shadow:0 0 10px rgba(255,210,74,.7);">✦ ✦ ✦</div>
         <div style="width:300px;height:3px;margin-bottom:22px;border-radius:2px;background:linear-gradient(90deg,transparent,#ffb84d 50%,transparent);"></div>`
      : '<div style="height:18px;"></div>';

    this.el.innerHTML = `
      <h1 style="font-size:40px;margin:0 0 6px;color:${winner.isLocal ? '#ffd24a' : '#fff'};text-shadow:${winner.isLocal ? '0 0 22px rgba(255,210,74,.55)' : '0 2px 6px rgba(0,0,0,.6)'};font-weight:800;">${winner.isLocal ? 'VICTORY' : 'DEFEATED'}</h1>
      <p style="opacity:.85;margin:0 0 14px;">Winner: ${wAnimal}${winner.isLocal ? ' (You)' : ''} — ${winner.score} frags</p>
      ${accent}
      <div style="background:rgba(255,255,255,.06);padding:14px 28px;border-radius:10px;margin-bottom:30px;${winner.isLocal ? 'box-shadow:0 0 26px rgba(255,184,77,.18);' : ''}">${rows}</div>
      <button id="again-btn" style="background:#4dffb8;color:#102020;border:none;padding:14px 44px;border-radius:10px;font-size:18px;font-weight:700;cursor:pointer;">PLAY AGAIN</button>`;
    this.el.style.display = 'flex';
    this.el.querySelector('#again-btn').onclick = () => {
      this.el.style.display = 'none';
      if (this.onPlayAgain) this.onPlayAgain();
    };
  }
  hide() { this.el.style.display = 'none'; }
}
