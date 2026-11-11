/* ============================================================
   altverse/render/map-view.js — the world as something you see.

   A static plate is drawn once per world: shaded relief from the
   heightfield, coastline and contour hairlines by marching squares,
   ice, rivers from the drainage, routes, settlements and names.
   Our world's coastline for the same seed runs under it as a dashed
   ghost, and every cell whose land, sea or ice differs from ours is
   stippled gold: gold is what the divergence changed.

   Alive at rest: the day-night line sweeps at the world's own day
   length (sped up) with its shape set by the world's tilt, and
   light travels the routes. A world with no ground draws the chart
   of nuclei that still hold together instead.
   ============================================================ */

import { contours, TERRAIN_GRID, cellLat, cellLon } from '../terrain.js';
import { TIMING } from '../config.js';

const { W: GW, H: GH } = TERRAIN_GRID;
const INK = { text: '197,204,216', bright: '234,240,251', horizon: '159,179,214', dim: '86,93,114', gold: '212,162,76', goldSoft: '240,198,116', faint: '66,75,87' };
const rgba = (c, a) => `rgba(${c},${a})`;

function landRaster(ter, mode) {
  const img = new ImageData(GW, GH);
  const d = img.data;
  const sea = ter.sea;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x, o = i * 4;
    const e = ter.elev[i];
    let r, g, b;
    if (ter.water[i]) {
      const depth = Math.max(0, sea - e);
      const k = Math.max(0, 1 - depth / 4500);
      r = 5 + 7 * k; g = 7 + 9 * k; b = 11 + 14 * k;
      if (ter.ice[i]) { r = 22; g = 27; b = 36; }
    } else if (ter.saltFlat[i]) {
      const n = ((x * 7 + y * 13) % 5) * 2; r = 40 + n; g = 40 + n; b = 44 + n;
    } else {
      const xl = (x - 1 + GW) % GW, yu = Math.max(0, y - 1);
      const shade = Math.max(-1, Math.min(1, (ter.elev[yu * GW + xl] - e) / 380));
      const h = Math.max(0, e - Math.max(0, sea)) / 6000;
      const base = mode === 'isotherm' ? 14 : 18 + 26 * Math.sqrt(h);
      const s = mode === 'isotherm' ? 0 : -shade * 22;
      r = base + s; g = base + 4 + s; b = base + 12 + s;
      if (ter.ice[i]) { r = 44 + s * 0.6 + 14 * Math.sqrt(h); g = 50 + s * 0.6 + 14 * Math.sqrt(h); b = 62 + s * 0.6 + 14 * Math.sqrt(h); }
    }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  return img;
}

function coastField(ter) {
  const f = new Float32Array(GW * GH);
  for (let i = 0; i < f.length; i++) f[i] = ter.water[i] ? Math.min(-1, ter.elev[i] - ter.sea) : Math.max(1, ter.elev[i] - ter.sea);
  return f;
}
function maskField(mask, test) {
  const f = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; if (yy < 0 || yy >= GH) continue; s += test(mask[yy * GW + ((x + dx + GW) % GW)]) ? 1 : 0; n++; }
    f[y * GW + x] = s / n;
  }
  return f;
}

/* geometry cache per world (contours are the slow part) */
const geomCache = new WeakMap();
function geometry(ter, base) {
  let g = geomCache.get(ter);
  if (g) return g;
  const land = new Float32Array(GW * GH);
  for (let i = 0; i < land.length; i++) land[i] = ter.water[i] ? -1 : ter.elev[i] - Math.max(0, ter.sea);
  g = {
    coast: contours(coastField(ter), 0),
    c1: contours(land, 1000), c2: contours(land, 2500), c3: contours(land, 4500),
    deep: contours(ter.elev, ter.sea - 1000),
    ice: contours(maskField(ter.ice, (v) => v > 0), 0.5),
    ghost: base ? contours(coastField(base), 0) : [],
    changed: [], changedEdge: [],
  };
  if (base && base !== ter) {
    for (let i = 0; i < GW * GH; i++) {
      const a = ter.water[i] ? (ter.ice[i] ? 3 : 2) : ter.ice[i] ? 1 : 0;
      const b = base.water[i] ? (base.ice[i] ? 3 : 2) : base.ice[i] ? 1 : 0;
      if (a !== b) g.changed.push(i);
    }
    if (g.changed.length) {
      const m = new Uint8Array(GW * GH); g.changed.forEach((i) => { m[i] = 1; });
      g.changedEdge = contours(maskField(m, (v) => v > 0), 0.5);
    }
  }
  geomCache.set(ter, g);
  return g;
}

function strokeLines(ctx, lines, sx, sy) {
  ctx.beginPath();
  for (const l of lines) {
    let prevX = null;
    l.forEach(([x, y], k) => {
      const px = (x + 0.5) * sx, py = (y + 0.5) * sy;
      if (k === 0 || (prevX != null && Math.abs(px - prevX) > sx * 40)) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      prevX = px;
    });
  }
  ctx.stroke();
}

function isotherms(ctx, ter, sx, sy) {
  const levels = [-20, -10, 0, 10, 20, 30];
  levels.forEach((lv) => {
    const lines = contours(ter.T, lv);
    ctx.strokeStyle = lv === 0 ? rgba(INK.bright, 0.75) : rgba(INK.horizon, lv < 0 ? 0.35 : 0.5);
    ctx.lineWidth = lv === 0 ? 1.2 : 0.8;
    ctx.setLineDash(lv < 0 ? [3, 3] : []);
    strokeLines(ctx, lines, sx, sy);
    ctx.setLineDash([]);
    const long = lines.filter((l) => l.length > 40).slice(0, 3);
    ctx.fillStyle = rgba(INK.bright, 0.8); ctx.font = '9px "IBM Plex Mono", monospace';
    long.forEach((l) => { const p = l[Math.floor(l.length * 0.37)]; ctx.fillText(`${lv} C`, (p[0] + 0.5) * sx + 3, (p[1] + 0.5) * sy - 3); });
  });
}

/* the full static plate of a world, at the canvas pixel size */
export function drawPlate(ctx, w, PW, PH, { mode = 'terrain', small = false, ps = 1 } = {}) {
  ctx.save();
  ctx.fillStyle = '#05070B'; ctx.fillRect(0, 0, PW, PH);
  const ter = mode === 'ours' ? w.ctx.base.ter : w.ctx.ter;
  if (!ter) { drawNuclides(ctx, w, PW, PH, small); ctx.restore(); return; }
  const base = mode === 'ours' ? null : (w.ctx.base.ter !== ter ? w.ctx.base.ter : null);
  const sx = PW / GW, sy = PH / GH;
  const g = geometry(ter, base);

  const off = document.createElement('canvas'); off.width = GW; off.height = GH;
  off.getContext('2d').putImageData(landRaster(ter, mode), 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, PW, PH);

  // graticule, with this world's tropics and polar circles
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(INK.horizon, 0.06);
  ctx.beginPath();
  for (let lon = -150; lon <= 150; lon += 30) { const x = ((lon + 180) / 360) * PW; ctx.moveTo(x, 0); ctx.lineTo(x, PH); }
  for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * PH; ctx.moveTo(0, y); ctx.lineTo(PW, y); }
  ctx.stroke();
  const tilt = w.knobs.tiltDeg;
  ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(INK.horizon, 0.18);
  ctx.beginPath();
  [tilt, -tilt, 90 - tilt, -(90 - tilt)].forEach((lat) => { if (Math.abs(lat) < 89.5 && Math.abs(lat) > 0.5) { const y = ((90 - lat) / 180) * PH; ctx.moveTo(0, y); ctx.lineTo(PW, y); } });
  ctx.stroke(); ctx.setLineDash([]);

  if (mode === 'isotherm') isotherms(ctx, ter, sx, sy);
  else {
    ctx.strokeStyle = rgba(INK.horizon, 0.07); ctx.lineWidth = 0.8; strokeLines(ctx, g.deep, sx, sy);
    ctx.strokeStyle = rgba(INK.horizon, 0.16); strokeLines(ctx, g.c1, sx, sy);
    ctx.strokeStyle = rgba(INK.horizon, 0.24); strokeLines(ctx, g.c2, sx, sy);
    ctx.strokeStyle = rgba(INK.bright, 0.3); strokeLines(ctx, g.c3, sx, sy);
  }

  // ice edge
  ctx.strokeStyle = rgba(INK.bright, 0.42); ctx.lineWidth = 0.9; strokeLines(ctx, g.ice, sx, sy);

  // the divergence footprint: cells whose land, sea or ice state differs from ours
  if (g.changed.length && !small) {
    ctx.fillStyle = rgba(INK.gold, 0.42);
    const dot = Math.max(1, sx * 0.5);
    for (const i of g.changed) { const x = i % GW, y = (i / GW) | 0; if (x % 3 === 0 && y % 3 === (x / 3) % 3) ctx.fillRect((x + 0.5) * sx - dot / 2, (y + 0.5) * sy - dot / 2, dot, dot); }
    ctx.strokeStyle = rgba(INK.gold, 0.55); ctx.lineWidth = 0.8; ctx.setLineDash([1, 2]);
    strokeLines(ctx, g.changedEdge, sx, sy); ctx.setLineDash([]);
  }
  // our coastline, dashed
  if (g.ghost.length) { ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(INK.dim, 0.9); ctx.lineWidth = 0.8; strokeLines(ctx, g.ghost, sx, sy); ctx.setLineDash([]); }

  // rivers
  ctx.strokeStyle = rgba(INK.horizon, 0.5);
  for (let i = 0; i < GW * GH; i++) {
    const a = ter.acc[i];
    if (a < 45 || ter.water[i] || ter.ice[i]) continue;
    const d = ter.down[i]; if (d < 0) continue;
    const x0 = i % GW, y0 = (i / GW) | 0, x1 = d % GW, y1 = (d / GW) | 0;
    if (Math.abs(x1 - x0) > 2) continue;
    ctx.lineWidth = Math.min(2, 0.5 + Math.log(a / 45) * 0.32);
    ctx.beginPath(); ctx.moveTo((x0 + 0.5) * sx, (y0 + 0.5) * sy); ctx.lineTo((x1 + 0.5) * sx, (y1 + 0.5) * sy); ctx.stroke();
  }

  // coastline
  ctx.strokeStyle = rgba(INK.text, 0.9); ctx.lineWidth = small ? 0.8 : 1;
  ctx.shadowColor = rgba(INK.horizon, 0.45); ctx.shadowBlur = small ? 0 : 5;
  strokeLines(ctx, g.coast, sx, sy);
  ctx.shadowBlur = 0;

  // routes and settlements (not on our-physics view)
  const geo = mode === 'ours' ? null : w.ctx.geo;
  if (geo) {
    for (const r of geo.routes) {
      ctx.setLineDash(r.sea ? [1.5, 4] : [4, 3]);
      ctx.strokeStyle = rgba(INK.horizon, r.sea ? 0.32 : 0.48); ctx.lineWidth = 0.9;
      ctx.beginPath();
      r.pts.forEach(([x, y], k) => { const px = (x + 0.5) * sx, py = (y + 0.5) * sy; if (k === 0) ctx.moveTo(px, py); else { const [qx] = r.pts[k - 1]; if (Math.abs(x - qx) > GW / 2) ctx.moveTo(px, py); else ctx.lineTo(px, py); } });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const font = (small ? 7 : 9.5) * ps;
    const labelN = PW / ps < 620 ? 5 : 10;
    const boxes = [];
    ctx.font = `${font}px "IBM Plex Mono", monospace`;
    for (const s of geo.settlements) {
      const px = (s.x + 0.5) * sx, py = (s.y + 0.5) * sy;
      const rad = small ? 1.6 : s.rank < 3 ? 4 : s.rank < 10 ? 3 : 2.2;
      ctx.strokeStyle = rgba(INK.bright, 0.95); ctx.lineWidth = 1;
      ctx.fillStyle = '#05070B';
      ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!small && s.rank < 3) { ctx.beginPath(); [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => { ctx.moveTo(px + dx * (rad + 2), py + dy * (rad + 2)); ctx.lineTo(px + dx * (rad + 5), py + dy * (rad + 5)); }); ctx.stroke(); }
      if (!small && s.rank < labelN) {
        // skip a label that would collide with one already placed
        const wdt = ctx.measureText(s.name).width, right = px > PW - 90;
        const bx = right ? px - 7 * ps - wdt : px + 7 * ps, by = py - font + 3;
        if (!boxes.some((b) => bx < b[0] + b[2] + 4 && bx + wdt + 4 > b[0] && by < b[1] + b[3] && by + font + 2 > b[1])) {
          boxes.push([bx, by, wdt, font + 2]);
          ctx.fillStyle = rgba(INK.text, 0.85);
          ctx.fillText(s.name, bx, py + 3);
        }
      }
    }
    if (!small) {
      ctx.font = `600 ${9 * ps}px "IBM Plex Mono", monospace`; ctx.fillStyle = rgba(INK.faint, 1);
      for (const r of geo.regions) {
        const px = ((r.lon + 180) / 360) * PW, py = ((90 - r.lat) / 180) * PH;
        const label = r.name.toUpperCase().split('').join(' ');
        ctx.textAlign = 'center'; ctx.fillStyle = rgba(INK.horizon, 0.42); ctx.fillText(label, px, py + 18 * ps); ctx.textAlign = 'left';
      }
    }
  }

  // frame ticks
  if (!small) {
    ctx.fillStyle = rgba(INK.faint, 1); ctx.font = `${8.5 * ps}px "IBM Plex Mono", monospace`;
    for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * PH; ctx.fillText(lat === 0 ? '0' : `${Math.abs(lat)}${lat > 0 ? 'N' : 'S'}`, 4, y - 3); }
    for (let lon = -120; lon <= 120; lon += 60) { const x = ((lon + 180) / 360) * PW; ctx.fillText(lon === 0 ? '0' : `${Math.abs(lon)}${lon > 0 ? 'E' : 'W'}`, x + 3, PH - 5); }
  }
  ctx.restore();
}

/* a world with no ground: the chart of nuclei */
function drawNuclides(ctx, w, PW, PH, small) {
  const list = w.stages.physics.nuclides || [];
  const pad = small ? 14 : 46;
  const maxN = 150, maxZ = 95;
  const X = (n) => pad + (Math.log1p(n) / Math.log1p(maxN)) * (PW - pad * 2);
  const Y = (z) => PH - pad - (Math.log1p(z) / Math.log1p(maxZ)) * (PH - pad * 2);
  ctx.strokeStyle = rgba(INK.horizon, 0.12); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(maxN), Y(maxN * 0.62)); ctx.stroke();
  ctx.fillStyle = rgba(INK.dim, 1); ctx.font = `${small ? 7 : 9}px "IBM Plex Mono", monospace`;
  if (!small) {
    ctx.fillText('NEUTRONS (log) →', PW - pad - 120, PH - pad + 26);
    ctx.save(); ctx.translate(pad - 30, pad + 120); ctx.rotate(-Math.PI / 2); ctx.fillText('PROTONS (log) →', 0, 0); ctx.restore();
    ctx.fillStyle = rgba(INK.text, 0.9); ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.fillText('NO GROUND TO MAP. THE NUCLEI THAT STILL HOLD TOGETHER:', pad, 26);
    ctx.fillStyle = rgba(INK.dim, 1); ctx.font = '9.5px "IBM Plex Mono", monospace';
    ctx.fillText('bright: bound here   gold: bound in ours, unbound here   dashed: unbound in both', pad, 42);
  }
  const s = small ? 4 : 9;
  for (const n of list) {
    const x = X(n.N), y = Y(n.Z);
    const oursBound = !(n.sym === 'Be' && n.A === 8);
    if (n.bound) { ctx.fillStyle = rgba(INK.bright, 0.9); ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    else if (oursBound) { ctx.strokeStyle = rgba(INK.gold, 0.95); ctx.lineWidth = 1; ctx.strokeRect(x - s / 2, y - s / 2, s, s); ctx.beginPath(); ctx.moveTo(x - s / 2, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.stroke(); }
    else { ctx.setLineDash([2, 2]); ctx.strokeStyle = rgba(INK.dim, 1); ctx.strokeRect(x - s / 2, y - s / 2, s, s); ctx.setLineDash([]); }
    if (!small && (n.A <= 4 || ['C', 'O', 'Fe', 'Au', 'U', 'Si', 'Ca'].includes(n.sym))) {
      ctx.fillStyle = n.bound ? rgba(INK.bright, 0.9) : rgba(INK.goldSoft, 0.85); ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillText(`${n.sym}-${n.A}`, x + s, y - s / 2);
    }
  }
}

/* ---------------- the live view ---------------- */
export class MapView {
  constructor(canvas, { tip, cap, reduced = false, lowTier = false } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.tip = tip; this.cap = cap; this.reduced = reduced; this.lowTier = lowTier;
    this.mode = 'terrain'; this.w = null; this.plate = null; this.t0 = performance.now();
    this.ignite = 0; this.cursor = -1;
    this.night = document.createElement('canvas'); this.night.width = 120; this.night.height = 60;
    this.nctx = this.night.getContext('2d');
    this.nimg = this.nctx.createImageData(120, 60);
    this._raf = null; this._last = 0;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    canvas.addEventListener('pointermove', (e) => this.hover(e));
    canvas.addEventListener('pointerleave', () => { if (this.tip) this.tip.hidden = true; });
    canvas.addEventListener('keydown', (e) => this.key(e));
    canvas.addEventListener('blur', () => { if (this.tip) this.tip.hidden = true; });
  }

  setWorld(w, { ignite = true } = {}) {
    this.w = w; this.cursor = -1;
    this.ignite = ignite && !this.reduced ? performance.now() : 0;
    this.resize();
    this.caption();
    this.canvas.setAttribute('aria-label', this.describe());
  }

  setMode(m) { this.mode = m; this.renderPlate(); this.caption(); this.frame(performance.now()); }

  resize() {
    const cssW = this.canvas.clientWidth || 900;
    const dpr = Math.min(this.lowTier ? 1 : 1.5, window.devicePixelRatio || 1);
    this.PW = Math.round(cssW * dpr); this.PH = Math.round(this.PW / 2);
    this.canvas.width = this.PW; this.canvas.height = this.PH;
    this.dpr = dpr;
    this.renderPlate();
    this.frame(performance.now());
  }

  renderPlate() {
    if (!this.w) return;
    this.plate = document.createElement('canvas'); this.plate.width = this.PW; this.plate.height = this.PH;
    const c = this.plate.getContext('2d');
    c.scale(1, 1);
    drawPlate(c, this.w, this.PW, this.PH, { mode: this.mode, ps: this.dpr || 1 });
  }

  caption() {
    if (!this.cap || !this.w) return;
    const w = this.w;
    if (!w.ctx.ter) { this.cap.innerHTML = '<span class="k">The map stage is pruned: with alpha this large no carbon or oxygen exists to build a planet. Squares are the 35 nuclides the engine tests. [REAL binding energies, ILLUSTRATIVE first-order shift]</span>'; return; }
    const parts = [
      '<span class="k"><span class="sw"></span>coast</span>',
      this.mode !== 'ours' && w.ctx.base.ter !== w.ctx.ter ? '<span class="k"><span class="sw ghost"></span>our coast, same seed</span>' : '',
      this.mode !== 'ours' ? '<span class="k"><span class="sw gold"></span>changed by the divergence</span>' : '',
      '<span class="k"><span class="sw ice"></span>ice</span>',
      w.ctx.geo && w.ctx.geo.settlements.length && this.mode !== 'ours' ? '<span class="k"><span class="dot"></span>settlement</span><span class="k"><span class="sw route"></span>route</span>' : '',
      `<span class="k">dashed latitudes: this world's tropics and polar circles (${w.knobs.tiltDeg.toFixed(1)} deg tilt)</span>`,
      this.reduced ? '' : `<span class="k">night sweeps once per world day, ${w.knobs.dayHours.toFixed(0)} h in ${TIMING.worldDaySec} s</span>`,
      `<span class="k">rules: relief x 1/g (here x ${(1 / w.knobs.gFactor).toFixed(2)}); land ice where the mean is below -10 C; ${w.knobs.iceDensity > 1 ? 'sea ice where winter water falls below -1.9 C, kept because it sinks' : 'sea ice where the mean is below about -9 C'}; sea level ${w.ctx.ter ? Math.round(w.ctx.ter.sea) : 0} m from ours; lapse ${(6.5 * w.knobs.gFactor).toFixed(1)} K/km</span>`,
      '<span class="k">Earth-analog terrain, seeded [ILLUSTRATIVE]; sea, ice, heights and temperatures computed [REAL formulas]</span>',
    ];
    this.cap.innerHTML = parts.filter(Boolean).join('');
  }

  describe() {
    const w = this.w; if (!w) return 'map';
    if (!w.ctx.ter) return 'Chart of nuclei: only hydrogen and helium isotopes stay bound.';
    const s = w.ctx.ter.stats;
    return `Map of ${w.name}: land ${Math.round(s.landFrac * 100)} percent, ice ${Math.round(s.iceFrac * 100)} percent, ${w.ctx.geo ? w.ctx.geo.settlements.length : 0} settlements. Use arrow keys to step through settlements.`;
  }

  start() {
    if (this.reduced) { this.frame(performance.now()); return; }
    // draw only while the map is on screen; 20 frames a second is enough for a terminator and route lights
    if (!this._io && 'IntersectionObserver' in window) {
      this.visible = true;
      this._io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }, { threshold: 0 });
      this._io.observe(this.canvas);
    }
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const minDt = this.lowTier ? 100 : 50;
      if (t - this._last < minDt) return;
      this._last = t;
      if (document.hidden || this.visible === false) return;
      const t0 = performance.now();
      this.frame(t);
      this.cost = (this.cost || 0) * 0.9 + (performance.now() - t0) * 0.1;
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(loop);
  }

  frame(t) {
    const ctx = this.ctx; if (!ctx || !this.plate) return;
    const PW = this.PW, PH = this.PH;
    ctx.clearRect(0, 0, PW, PH);
    let reveal = 1;
    if (this.ignite) { reveal = Math.min(1, (t - this.ignite) / TIMING.ignition); if (reveal >= 1) this.ignite = 0; }
    const cx = PW * 0.5, cy = PH * 0.45, maxR = Math.hypot(PW, PH) * 0.6;
    const ease = 1 - Math.pow(1 - reveal, 3);
    if (reveal < 1) {
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, ease * maxR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(this.plate, 0, 0); ctx.restore();
      ctx.strokeStyle = rgba(INK.gold, 0.7 * (1 - reveal)); ctx.lineWidth = 1.5 * this.dpr;
      ctx.beginPath(); ctx.arc(cx, cy, ease * maxR, 0, Math.PI * 2); ctx.stroke();
    } else ctx.drawImage(this.plate, 0, 0);
    if (!this.w || !this.w.ctx.ter || this.mode === 'isotherm') { this.drawCursor(); return; }

    // day-night line: one world day per TIMING.worldDaySec; seasons advance one twelfth of a year per day
    const k = this.w.knobs;
    const day = this.reduced ? 0.62 : ((t - this.t0) / 1000) / TIMING.worldDaySec;
    const subLon = 180 - ((day % 1) * 360);
    const decl = k.tiltDeg * Math.sin(2 * Math.PI * (day / 12 + 0.12));
    const d = this.nimg.data, sd = Math.sin(decl * Math.PI / 180), cd = Math.cos(decl * Math.PI / 180);
    for (let y = 0; y < 60; y++) {
      const lat = (90 - (y + 0.5) * 3) * Math.PI / 180, sl = Math.sin(lat), cl = Math.cos(lat);
      for (let x = 0; x < 120; x++) {
        const lon = -180 + (x + 0.5) * 3;
        const cz = sl * sd + cl * cd * Math.cos((lon - subLon) * Math.PI / 180);
        const a = cz > 0.08 ? 0 : cz < -0.12 ? 0.58 : (0.08 - cz) / 0.2 * 0.58;
        const o = (y * 120 + x) * 4; d[o] = 2; d[o + 1] = 3; d[o + 2] = 6; d[o + 3] = a * 255;
      }
    }
    this.nctx.putImageData(this.nimg, 0, 0);
    ctx.save(); if (reveal < 1) { ctx.beginPath(); ctx.arc(cx, cy, ease * maxR, 0, Math.PI * 2); ctx.clip(); }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.night, 0, 0, PW, PH);
    const sx = ((subLon + 180) / 360) * PW, sy = ((90 - decl) / 180) * PH;
    ctx.strokeStyle = rgba(INK.bright, 0.35); ctx.lineWidth = this.dpr;
    ctx.beginPath(); ctx.arc(sx, sy, 6 * this.dpr, 0, Math.PI * 2); ctx.moveTo(sx - 11 * this.dpr, sy); ctx.lineTo(sx + 11 * this.dpr, sy); ctx.moveTo(sx, sy - 11 * this.dpr); ctx.lineTo(sx, sy + 11 * this.dpr); ctx.stroke();

    // light travelling the routes
    const geo = this.w.ctx.geo;
    if (geo && !this.reduced && this.mode !== 'ours' && !this.lowTier) {
      const gx = PW / GW, gy = PH / GH;
      ctx.fillStyle = rgba(INK.bright, 0.85);
      geo.routes.forEach((r, i) => {
        const n = r.pts.length; if (n < 2) return;
        const speed = r.sea ? 0.05 : 0.08;
        const f = ((t / 1000) * speed + i * 0.137) % 1;
        const p = f * (n - 1), k0 = Math.floor(p), u = p - k0;
        const [x0, y0] = r.pts[k0], [x1, y1] = r.pts[Math.min(n - 1, k0 + 1)];
        if (Math.abs(x1 - x0) > GW / 2) return;
        const px = (x0 + (x1 - x0) * u + 0.5) * gx, py = (y0 + (y1 - y0) * u + 0.5) * gy;
        ctx.globalAlpha = Math.sin(f * Math.PI);
        ctx.beginPath(); ctx.arc(px, py, 1.3 * this.dpr, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawCursor();
  }

  drawCursor() {
    const geo = this.w && this.w.ctx.geo;
    if (this.cursor < 0 || !geo || !geo.settlements[this.cursor]) return;
    const s = geo.settlements[this.cursor];
    const px = (s.x + 0.5) * this.PW / GW, py = (s.y + 0.5) * this.PH / GH;
    const ctx = this.ctx; ctx.strokeStyle = rgba(INK.gold, 1); ctx.lineWidth = 1.5 * this.dpr;
    ctx.beginPath(); ctx.arc(px, py, 9 * this.dpr, 0, Math.PI * 2); ctx.stroke();
  }

  cellInfo(gx, gy) {
    const w = this.w, ter = this.mode === 'ours' ? w.ctx.base.ter : w.ctx.ter;
    const i = gy * GW + gx;
    const lat = cellLat(gy), lon = cellLon(gx);
    const kind = ter.ice[i] ? (ter.water[i] ? 'frozen sea' : 'ice') : ter.saltFlat[i] ? 'salt basin' : ter.ocean[i] ? 'ocean' : ter.lake[i] ? 'lake' : 'land';
    const elev = Math.round(ter.elev[i] - ter.sea);
    return `<b>${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}</b> &middot; ${kind}<br>${elev >= 0 ? 'height' : 'depth'} ${Math.abs(elev).toLocaleString('en-US')} m &middot; mean ${ter.T[i].toFixed(1)} C &middot; winter ${ter.Tw[i].toFixed(1)} C`;
  }

  hover(e) {
    if (!this.w || !this.tip) return;
    const r = this.canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    if (!this.w.ctx.ter) {
      this.tip.hidden = true; return;
    }
    const gx = Math.max(0, Math.min(GW - 1, Math.floor(fx * GW))), gy = Math.max(0, Math.min(GH - 1, Math.floor(fy * GH)));
    let html = this.cellInfo(gx, gy);
    const geo = this.mode === 'ours' ? null : this.w.ctx.geo;
    if (geo) {
      const near = geo.settlements.map((s) => ({ s, d: Math.hypot(s.x - gx, s.y - gy) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 5) html = `<b>${near.s.name}</b>, founded ${near.s.founded < 0 ? -near.s.founded + ' BCE' : near.s.founded + ' CE'}${near.s.hot ? ', by ' + near.s.hot : ''}<br>` + html;
    }
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const wrap = this.canvas.parentElement.getBoundingClientRect();
    const x = e.clientX - wrap.left, y = e.clientY - wrap.top;
    this.tip.style.left = Math.min(wrap.width - 260, x + 14) + 'px';
    this.tip.style.top = Math.max(4, y - 50) + 'px';
  }

  key(e) {
    const geo = this.w && this.w.ctx.geo;
    if (!geo || !geo.settlements.length) return;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') { this.cursor = -1; this.tip.hidden = true; this.frame(performance.now()); return; }
    const n = geo.settlements.length;
    this.cursor = ((this.cursor < 0 ? -1 : this.cursor) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    const s = geo.settlements[this.cursor];
    this.tip.innerHTML = `<b>${s.name}</b> (${this.cursor + 1} of ${n})<br>` + this.cellInfo(s.x, s.y);
    this.tip.hidden = false;
    this.tip.style.left = Math.min(this.canvas.clientWidth - 260, (s.x / GW) * this.canvas.clientWidth + 14) + 'px';
    this.tip.style.top = Math.max(4, (s.y / GH) * this.canvas.clientHeight - 50) + 'px';
    this.frame(performance.now());
  }

  toPNG(cb) { if (this.plate) this.plate.toBlob(cb, 'image/png'); }
}
