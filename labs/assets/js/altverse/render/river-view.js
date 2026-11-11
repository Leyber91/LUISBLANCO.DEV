/* ============================================================
   altverse/render/river-view.js — the chronology as a river.

   Our record runs as a dim dashed channel; this world's runs bright
   and widens from the divergence on, as the two split. Time is
   piecewise: logarithmic over deep time, linear over the last
   twelve thousand years, so both the formation of the Earth and
   the twentieth century have room. A tether joins an invention's
   date in ours to its date here. Removed events are struck on our
   channel. Forks of this world leave as tributaries.
   Horizontal when wide, vertical when narrow. Arrow keys move the
   selection along the river.
   ============================================================ */

import { svg, text, trunc } from './svg.js';
import { CHRONO } from '../lexicon.js';
import { fmtYear } from '../classify.js';

const SEGS = [
  { b: -1e7, f1: 0.31, log: true },
  { b: -1.2e4, f1: 0.5, log: true },
  { b: 1500, f1: 0.75, log: false },
  { b: 2100, f1: 1, log: false },
];
const L = (y) => Math.log10(2101 - y);

function makeScale(ymin) {
  const segs = []; let a = ymin, f0 = 0;
  for (const s of SEGS) { if (s.b <= a) continue; segs.push({ a, b: s.b, f0, f1: s.f1, log: s.log }); a = s.b; f0 = s.f1; }
  return (y) => {
    y = Math.max(ymin, Math.min(2100, y));
    const s = segs.find((g) => y <= g.b) || segs[segs.length - 1];
    const u = s.log ? (L(s.a) - L(y)) / (L(s.a) - L(s.b)) : (y - s.a) / (s.b - s.a);
    return s.f0 + Math.max(0, Math.min(1, u)) * (s.f1 - s.f0);
  };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TICKS = [-1e10, -4e9, -1e9, -1e8, -1e7, -1e6, -1e5, -1e4, -3000, 0, 1000, 1500, 1800, 1900, 2000, 2100];
const tickLabel = (y) => y <= -1e9 ? `${-y / 1e9} Gyr ago` : y <= -1e6 ? `${-y / 1e6} Myr ago` : y <= -1e4 ? `${-y / 1e3} kyr ago` : y < 0 ? `${-y} BCE` : `${y}`;

export class RiverView {
  constructor(host, { onSelect, onOpen, reduced } = {}) {
    this.host = host; this.onSelect = onSelect; this.onOpen = onOpen; this.reduced = reduced;
    this.w = null; this.sel = null; this.children = [];
    this._ro = new ResizeObserver(() => { const wdt = this.host.clientWidth; if (Math.abs(wdt - (this._lastW || 0)) > 30) this.render(); });
    this._ro.observe(host);
  }

  setWorld(w, children = [], parent = null) {
    this.w = w; this.children = children; this.parent = parent;
    const ev = w.stages.history.events;
    this.sel = (ev.find((e) => e.kind === 'divergence' && e.year > -4.6e9) || ev.filter((e) => e.kind !== 'inherited' && e.kind !== 'kept').slice(-1)[0] || ev[ev.length - 1] || null);
    this.render();
    if (this.sel) this.onSelect && this.onSelect(this.sel, true);
  }

  select(e, focus = false) {
    this.sel = e; this.render();
    this.onSelect && this.onSelect(e);
    if (focus) { const n = this.host.querySelector('.rv-ev.sel'); if (n) n.focus(); }
  }

  render() {
    const w = this.w; if (!w) return;
    const host = this.host; host.innerHTML = '';
    const Wd = host.clientWidth || 1100; this._lastW = Wd;
    const V = Wd < 640;
    const ev = w.stages.history.events;
    const ymin = ev.some((e) => e.year < -4.7e9) ? -1.4e10 : -4.6e9;
    const T = makeScale(ymin);
    const divYear = w.specs[0].year;
    const len = V ? 1180 : Wd;
    const W = Wd, H = V ? len : 340;
    const pad = V ? 34 : 18;
    const span = (V ? H : W) - pad * 2;
    const at = (y) => pad + T(y) * span;
    const mid = V ? Math.min(150, W * 0.36) : 150;
    const splitAt = at(Math.max(divYear, ymin));
    const changed = ev.filter((e) => e.kind !== 'inherited' && e.kind !== 'kept').length;
    const gap = V ? -46 : -66;
    const theirsLat = (m) => mid + (this.reduced ? 0 : 0) + 3 * Math.sin(m / 41 + (w.seed % 7));
    const oursLat = (m) => mid + gap * smooth(splitAt, splitAt + 48, m);
    const P = (m, l) => (V ? [l, m] : [m, l]);

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': `River of time for ${w.name}` }, host);

    // eras
    (w.stages.history.eras || []).forEach((er, i) => {
      const a = at(Math.max(ymin, er.start)), b = at(Math.min(2100, er.end));
      if (b - a < 2) return;
      const [x, y] = P(a, 0);
      svg('rect', V ? { x: 0, y, width: W, height: b - a, class: `rv-era${i % 2 ? ' alt' : ''}` } : { x, y: 0, width: b - a, height: H - 22, class: `rv-era${i % 2 ? ' alt' : ''}` }, root);
      if (b - a > (V ? 30 : 64)) { const [tx, ty] = V ? [W - 6, a + 12] : [a + 5, 12]; text(root, tx, ty, er.name, { class: 'rv-era-t', 'text-anchor': V ? 'end' : 'start' }); }
    });

    // axis
    const [ax0, ay0] = P(pad, V ? 16 : H - 18), [ax1, ay1] = P(pad + span, V ? 16 : H - 18);
    svg('line', { x1: ax0, y1: ay0, x2: ax1, y2: ay1, class: 'rv-axis' }, root);
    let lastTick = -1e9;
    TICKS.filter((y) => y >= ymin).forEach((y) => {
      const m = at(y); if (m - lastTick < (V ? 34 : 56)) return; lastTick = m;
      const [tx, ty] = V ? [4, m + 3] : [m, H - 6];
      text(root, tx, ty, tickLabel(y), { class: 'rv-tick', 'text-anchor': V ? 'start' : 'middle' });
    });

    // channels
    const step = 4, pts = [], ours = [], upper = [], lower = [];
    for (let m = pad; m <= pad + span; m += step) {
      const grow = smooth(splitAt, splitAt + 70, m);
      const half = 1 + grow * (2.5 + Math.min(6, changed * 0.35));
      const l = theirsLat(m);
      pts.push(P(m, l)); ours.push(P(m, m < splitAt ? l : oursLat(m)));
      upper.push(P(m, l - half)); lower.push(P(m, l + half));
    }
    const line = (arr) => 'M' + arr.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L');
    svg('path', { d: line(ours.filter((p, i) => (V ? p[1] : p[0]) >= splitAt - 2 || true)), class: 'rv-ours' }, root);
    svg('path', { d: line(upper) + ' L' + lower.slice().reverse().map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L') + ' Z', class: 'rv-band' }, root);
    svg('path', { d: line(pts), class: 'rv-core' }, root);
    if (!this.reduced) svg('path', { d: line(pts.filter((p) => (V ? p[1] : p[0]) >= splitAt)), class: 'rv-flow' }, root);
    const [lx, ly] = V ? [mid + gap - 4, splitAt + 60] : [splitAt + 56, mid + gap - 8];
    text(root, lx, ly, 'ours', { class: 'rv-legend', 'text-anchor': V ? 'end' : 'start' });
    const [lx2, ly2] = V ? [mid + 8, pad + span - 4] : [pad + span - 2, mid - 12];
    text(root, lx2, ly2, w.name.toLowerCase(), { class: 'rv-legend', 'text-anchor': V ? 'start' : 'end' });

    // our removed events, struck on the ours channel
    const removed = w.stages.history.removed || [];
    const gone = svg('g', { class: 'rv-gone' }, root);
    removed.forEach((r) => {
      const m = at(r.year); const l = m < splitAt ? theirsLat(m) : oursLat(m);
      const [x, y] = P(m, l);
      const g = svg('g', {}, gone);
      svg('line', { x1: x - 3, y1: y - 3, x2: x + 3, y2: y + 3 }, g); svg('line', { x1: x - 3, y1: y + 3, x2: x + 3, y2: y - 3 }, g);
      const t = svg('title', {}, g); t.textContent = `${r.title} (${fmtYear(r.year)}, ours): does not happen here, ${r.why}`;
    });

    // tethers for shifted events
    const base = Object.fromEntries(CHRONO.map((c) => [c.id, c]));
    ev.filter((e) => e.kind === 'shifted' && e.base && base[e.base]).forEach((e) => {
      const mo = at(base[e.base].year), mt = at(e.year);
      const [x1, y1] = P(mo, mo < splitAt ? theirsLat(mo) : oursLat(mo)), [x2, y2] = P(mt, theirsLat(mt));
      svg('path', { d: `M${x1},${y1} C${V ? x1 + 20 : x1},${V ? y1 : (y1 + y2) / 2} ${V ? x2 - 20 : x2},${V ? y2 : (y1 + y2) / 2} ${x2},${y2}`, class: 'rv-tether' }, root);
    });

    // events
    const labelled = (e) => ['divergence', 'new', 'changed', 'shifted', 'model'].includes(e.kind) || e === this.sel;
    const rows = []; const rowGap = 13.5, rowBase = 22;
    const maxRows = 8;
    const order = ev.slice().sort((a, b) => a.year - b.year);
    const free = (row, a, b) => !(rows[row] || []).some(([x, y]) => a < y + 6 && b > x - 6);
    // the selected and the divergence label first, so they always find room
    const pri = order.filter(labelled).sort((a, b) => (b === this.sel) - (a === this.sel) || (b.kind === 'divergence') - (a.kind === 'divergence'));
    const placed = new Map();
    pri.forEach((e) => {
      const m = at(e.year);
      const label = trunc(e.title, V ? 40 : 30);
      const lw = label.length * 5.9;
      if (V) {
        let y = m; const taken = rows[0] || (rows[0] = []);
        while (taken.some(([a, b]) => y > a - 11 && y < b + 11)) y += 12;
        if (y - m > 60) return;
        taken.push([y, y]); placed.set(e, { label, row: 0, y, anchor: 'start' });
        return;
      }
      const anchor = m > W - 200 ? 'end' : 'start';
      const a = anchor === 'end' ? m - lw : m, b = anchor === 'end' ? m : m + lw;
      for (let row = 0; row < maxRows; row++) if (free(row, a, b)) { (rows[row] = rows[row] || []).push([a, b]); placed.set(e, { label, row, anchor }); return; }
    });
    order.forEach((e) => {
      const m = at(e.year), l = theirsLat(m);
      const [x, y] = P(m, l);
      const g = svg('g', { class: `rv-ev ${e.kind}${e === this.sel ? ' sel' : ''}`, tabindex: e === this.sel ? 0 : -1, role: 'button', 'aria-label': `${fmtYear(e.year)}: ${e.title}` }, root);
      svg('circle', { cx: x, cy: y, r: e.kind === 'divergence' ? 5 : labelled(e) ? 3.6 : 2.2 }, g);
      const pl = placed.get(e);
      if (pl) {
        if (V) {
          svg('line', { x1: x + 4, y1: y, x2: mid + 12, y2: pl.y - 3, class: 'rv-lead' }, g);
          text(g, mid + 14, pl.y, pl.label, { 'text-anchor': 'start' });
        } else {
          const off = rowBase + pl.row * rowGap;
          svg('line', { x1: x, y1: y + 4, x2: x, y2: mid + off + 1, class: 'rv-lead' }, g);
          text(g, m + (pl.anchor === 'end' ? 2 : -2), mid + off + 10, pl.label, { 'text-anchor': pl.anchor });
        }
      }
      const t = svg('title', {}, g); t.textContent = `${fmtYear(e.year)}: ${e.title}`;
      g.addEventListener('click', () => this.select(e, true));
      g.addEventListener('keydown', (k) => {
        const i = order.indexOf(e);
        if (k.key === 'ArrowRight' || k.key === 'ArrowDown') { k.preventDefault(); this.select(order[Math.min(order.length - 1, i + 1)], true); }
        if (k.key === 'ArrowLeft' || k.key === 'ArrowUp') { k.preventDefault(); this.select(order[Math.max(0, i - 1)], true); }
      });
    });

    // forks of this world, as tributaries
    this.children.forEach((c, i) => {
      const fe = ev.find((e) => e.id === c.path[c.path.length - 1].eventId);
      const m = at(fe ? fe.year : c.spec.year), l = theirsLat(m);
      const g = svg('g', { class: 'rv-fork', tabindex: 0, role: 'link', 'aria-label': `Open fork ${c.name}` }, root);
      const dl = V ? 0 : -(26 + i * 16);
      const [x1, y1] = P(m, l), [x2, y2] = V ? [mid + 70 + i * 4, m + 22 + i * 14] : [m + 26, l + dl - 20];
      svg('path', { d: `M${x1},${y1} C${V ? x1 + 30 : x1},${V ? y1 : y1 - 10} ${V ? x2 - 20 : x2 - 20},${y2} ${x2},${y2}` }, g);
      text(g, x2 + 4, y2 + 3, `fork: ${c.name}`);
      const open = () => this.onOpen && this.onOpen(c.id);
      g.addEventListener('click', open);
      g.addEventListener('keydown', (k) => { if (k.key === 'Enter') open(); });
    });
    if (this.parent) {
      const m = at(w.spec.year);
      const [x, y] = P(m, mid + gap - (V ? 0 : 18));
      const g = svg('g', { class: 'rv-fork', tabindex: 0, role: 'link', 'aria-label': `Open parent ${this.parent.name}` }, root);
      text(g, x + (V ? -4 : 6), y, `from ${this.parent.name}`, { 'text-anchor': V ? 'end' : 'start' });
      const open = () => this.onOpen && this.onOpen(this.parent.id);
      g.addEventListener('click', open); g.addEventListener('keydown', (k) => { if (k.key === 'Enter') open(); });
    }
  }
}
