export class Crosshair {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:20px; height:20px; pointer-events:none;`;
    this.el.innerHTML = `
      <div style="position:absolute;left:50%;top:0;width:2px;height:8px;background:rgba(255,255,255,.8);transform:translateX(-50%);"></div>
      <div style="position:absolute;left:50%;bottom:0;width:2px;height:8px;background:rgba(255,255,255,.8);transform:translateX(-50%);"></div>
      <div style="position:absolute;top:50%;left:0;height:2px;width:8px;background:rgba(255,255,255,.8);transform:translateY(-50%);"></div>
      <div style="position:absolute;top:50%;right:0;height:2px;width:8px;background:rgba(255,255,255,.8);transform:translateY(-50%);"></div>`;
    root.appendChild(this.el);
  }
  setSpread(px) {
    const s = Math.max(8, px);
    this.el.style.width = s + 'px';
    this.el.style.height = s + 'px';
  }
  hide() { this.el.style.display = 'none'; }
  show() { this.el.style.display = 'block'; }
}
