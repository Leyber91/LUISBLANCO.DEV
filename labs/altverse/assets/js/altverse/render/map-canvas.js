/* ============================================================
   altverse/render/map-canvas.js — STAGE A mapamundi.
   Equirectangular grid; each region.bbox drawn as a soft duotone
   PLATE (biome -> warm/cold from the palette), one centroid label,
   a thin horizon border. No noise, no coastlines (that is Stage B,
   phase-gated). This proves the data->render contract and anchors
   regionId for hover/dossier coordination. Tagged PLAUSIBLE in UI.
   bbox convention: [lonMin, latMin, lonMax, latMax].
   ============================================================ */

const COL = {
  void: '#070b12', ocean: '#0a1019', grid: 'rgba(91,176,214,0.10)',
  warm: [242, 169, 59], cold: [91, 176, 214], text: '#C5CCD8', dim: '#79828F',
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (t) => `rgb(${lerp(COL.cold[0], COL.warm[0], t)},${lerp(COL.cold[1], COL.warm[1], t)},${lerp(COL.cold[2], COL.warm[2], t)})`;

// climate/biome -> temperature 0 (cold) .. 1 (warm)
function tempOf(region) {
  const s = (region.climate + ' ' + region.dominantBiome).toLowerCase();
  if (/frozen|ice|arctic|polar|cold|cool/.test(s)) return 0.12;
  if (/hot|arid|desert|warm|tropic|volcan|steppe/.test(s)) return 0.88;
  if (/temperate|maritime|mixed|continental/.test(s)) return 0.5;
  return 0.5;
}

export class AltMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.world = null;
    this.hover = null;
    this.style = { accent: [91, 176, 214], gridStep: 30, plateRadius: 6 };
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize, { passive: true });
  }

  setWorld(world) { this.world = world; this._resize(); }

  setStyle({ accent, gridStep, plateRadius } = {}) {
    if (accent) { const n = parseInt(String(accent).slice(1), 16); this.style.accent = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    if (gridStep) this.style.gridStep = gridStep;
    if (plateRadius) this.style.plateRadius = plateRadius;
    this.draw();
  }

  _resize() {
    const w = this.canvas.clientWidth || 640;
    const h = Math.round(w / 2);                 // equirectangular 2:1
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this.draw();
  }

  _xy(lon, lat) { return [((lon + 180) / 360) * this.w, ((90 - lat) / 180) * this.h]; }

  draw() {
    const ctx = this.ctx; if (!ctx || !this.world) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { w, h } = this;

    // ocean base
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COL.void); g.addColorStop(1, COL.ocean);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // graticule (accent-tinted, per-world density)
    const acc = this.style.accent, step = this.style.gridStep;
    ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.10)`; ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += step) { const [x] = this._xy(lon, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let lat = -60; lat <= 60; lat += step) { const [, y] = this._xy(0, lat); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const [, eqy] = this._xy(0, 0);
    ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.24)`; ctx.beginPath(); ctx.moveTo(0, eqy); ctx.lineTo(w, eqy); ctx.stroke();

    // region plates
    for (const r of this.world.map.regions) {
      const [lo, la, lo2, la2] = r.bbox;
      const [x0, y1] = this._xy(lo, la2);     // top-left (latMax)
      const [x1, y0] = this._xy(lo2, la);     // bottom-right (latMin)
      const x = Math.min(x0, x1), y = Math.min(y0, y1);
      const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
      const t = tempOf(r);
      const col = mix(t);
      const active = this.hover === r.id;

      ctx.save();
      this._roundRect(x, y, rw, rh, this.style.plateRadius);
      const fill = ctx.createLinearGradient(x, y, x, y + rh);
      fill.addColorStop(0, this._alpha(col, active ? 0.42 : 0.26));
      fill.addColorStop(1, this._alpha(col, active ? 0.20 : 0.10));
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeStyle = this._alpha(col, active ? 0.95 : 0.55);
      ctx.stroke();
      ctx.restore();

      // centroid label
      const cx = x + rw / 2, cy = y + rh / 2;
      ctx.fillStyle = active ? '#EDF1F7' : COL.text;
      ctx.font = `600 ${Math.max(10, Math.min(13, rw / 9))}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(r.name, cx, cy);
      ctx.fillStyle = COL.dim;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(r.dominantBiome, cx, cy + 15);
    }

    // PLAUSIBLE stamp
    ctx.fillStyle = COL.dim;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('PROJECTION: EQUIRECTANGULAR · STYLIZED / PLAUSIBLE', 8, h - 6);
  }

  setHover(id) { if (this.hover !== id) { this.hover = id; this.draw(); } }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx; r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  _alpha(rgb, a) { return rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`); }
  destroy() { window.removeEventListener('resize', this._resize); }
}
