// A 4-tick crosshair with a dark outline + center dot so it stays readable
// against both bright sky and dark interiors. The outline is achieved with a
// text-shadow-like halo on each tick.
export class Crosshair {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:20px; height:20px; pointer-events:none;`;
    // Halo via drop-shadow filter on the whole group gives every tick an edge.
    this.el.innerHTML = `
      <div style="position:absolute;inset:0;filter:drop-shadow(0 0 1px rgba(0,0,0,.9)) drop-shadow(0 0 1px rgba(0,0,0,.9));">
        <div style="position:absolute;left:50%;top:0;width:2px;height:7px;background:rgba(255,235,180,.95);transform:translateX(-50%);"></div>
        <div style="position:absolute;left:50%;bottom:0;width:2px;height:7px;background:rgba(255,235,180,.95);transform:translateX(-50%);"></div>
        <div style="position:absolute;top:50%;left:0;height:2px;width:7px;background:rgba(255,235,180,.95);transform:translateY(-50%);"></div>
        <div style="position:absolute;top:50%;right:0;height:2px;width:7px;background:rgba(255,235,180,.95);transform:translateY(-50%);"></div>
        <div style="position:absolute;left:50%;top:50%;width:2px;height:2px;background:rgba(255,235,180,.95);transform:translate(-50%,-50%);border-radius:50%;"></div>
      </div>`;
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
