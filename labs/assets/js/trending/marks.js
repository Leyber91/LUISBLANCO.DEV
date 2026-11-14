/* ============================================================
   trending/marks.js — the one mark set. Field, board, legend and
   detail draw every glyph, change marker and sparkline from here, so
   a source looks the same everywhere (rules in trending.css header).
   ============================================================ */

import { SOURCES } from './constants.js';

export const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/* Path data for a source glyph centred on 0,0 with radius r. */
export function glyphPath(kind, r) {
  const f = (x) => x.toFixed(2);
  switch (kind) {
    case 'circle':
    case 'ring':
      return `M${f(-r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
    case 'triangle': {
      const h = r * 1.15;
      return `M0 ${f(-h)}L${f(h * 0.94)} ${f(h * 0.62)}L${f(-h * 0.94)} ${f(h * 0.62)}Z`;
    }
    case 'square': { const s = r * 0.9; return `M${f(-s)} ${f(-s)}H${f(s)}V${f(s)}H${f(-s)}Z`; }
    case 'diamond': { const s = r * 1.2; return `M0 ${f(-s)}L${f(s)} 0L0 ${f(s)}L${f(-s)} 0Z`; }
    case 'hex': {
      let d = '';
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; d += `${i ? 'L' : 'M'}${f(Math.cos(a) * r * 1.05)} ${f(Math.sin(a) * r * 1.05)}`; }
      return d + 'Z';
    }
    default: return glyphPath('circle', r);
  }
}
const KIND = { circle: 'circle', ring: 'ring', triangle: 'triangle', square: 'square', diamond: 'diamond', cross: 'hex' };
export const glyphOf = (src) => KIND[SOURCES[src]?.glyph] || 'circle';

/* A <g> holding the source glyph (ring adds a centre dot). */
export function glyph(src, r, parent, cls = 'glyph') {
  const g = svgEl('g', {}, parent);
  const k = glyphOf(src);
  svgEl('path', { d: glyphPath(k, r), class: cls }, g);
  if (k === 'ring') svgEl('circle', { r: Math.max(1, r * 0.28), class: cls }, g);
  return g;
}

/* A small standalone SVG icon of a source glyph, for chips, rows and the legend. */
export function glyphIcon(src, size = 14) {
  const s = svgEl('svg', { viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, 'aria-hidden': 'true', focusable: 'false' });
  glyph(src, size * 0.36, s);
  return s;
}

/* Change markers: up, down, new, held. 8px, 1px strokes. */
const CHG = { up: 'M1 6L4 2L7 6', down: 'M1 2L4 6L7 2', new: 'M4 1V7M1 4H7', held: 'M1 3H7M1 5.5H7' };
export function changeIcon(kind) {
  const s = svgEl('svg', { viewBox: '0 0 8 8', 'aria-hidden': 'true', focusable: 'false' });
  svgEl('path', { d: CHG[kind] || CHG.held }, s);
  return s;
}

/* Sparkline of observations [{ t, c, kind }]: observed points filled, backfilled hollow. */
export function sparkline(points, { w = 80, h = 26, cls = 'spark', labels = true } = {}) {
  const s = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: cls, role: 'img' });
  if (points.length < 2) return s;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const cs = points.map((p) => p.c);
  const lo = Math.min(...cs), hi = Math.max(...cs);
  const pad = labels ? 9 : 2;
  const x = (t) => 2 + ((t - t0) / Math.max(1, t1 - t0)) * (w - 4);
  const y = (c) => h - 2 - ((c - lo) / Math.max(1e-9, hi - lo)) * (h - pad - 2);
  svgEl('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join('') }, s);
  for (const p of points) {
    const backfill = p.kind === 'backfill';
    if (backfill && points.length > 12) continue;
    svgEl('circle', { cx: x(p.t).toFixed(1), cy: y(p.c).toFixed(1), r: backfill ? 1.4 : 1.6, class: backfill ? 'bf' : 'obs' }, s);
  }
  if (points.length > 12) svgEl('circle', { cx: x(t1).toFixed(1), cy: y(points[points.length - 1].c).toFixed(1), r: 1.8, class: 'obs' }, s);
  return s;
}
