// Live scoreboard shown while holding Tab. Reads each player's animalId for the name.
export class Scoreboard {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
      background:rgba(10,14,20,.92);padding:20px 28px;border-radius:12px;color:#fff;
      font-family:system-ui,sans-serif;display:none;min-width:380px;`;
    root.appendChild(this.el);
  }
  attach() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') { e.preventDefault(); this.el.style.display = 'block'; }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.el.style.display = 'none';
    });
  }
  update(players) {
    const ranked = [...players].sort((a, b) => b.score - a.score);
    this.el.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-weight:700;border-bottom:1px solid #444;padding-bottom:6px;margin-bottom:8px;min-width:320px;">
        <span>Player</span><span>K</span><span>D</span><span>K/D</span>
      </div>
      ${ranked.map(p => {
        const animal = p.animalId || 'FOX';
        const kd = p.deaths === 0 ? p.score.toFixed(1) : (p.score / p.deaths).toFixed(1);
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;${p.isLocal ? 'color:#ffb84d;font-weight:700' : ''}">
          <span>${animal}${p.isLocal ? ' (You)' : ''}</span>
          <span>${p.score}</span><span>${p.deaths}</span><span>${kd}</span>
        </div>`;
      }).join('')}`;
  }
}
