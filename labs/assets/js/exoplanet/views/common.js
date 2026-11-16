import { num, int } from '../../kit/format.js';

/* ============================================================
   views/common.js — what every 2D view shares: the design tokens
   read from CSS, a DPR-aware canvas that redraws on resize, log
   scales, and number formatting with units.
   ============================================================ */

let TOK = null;
/* The site's tokens (tokens.css), read once from the page. Every colour a view draws is one of these: the views carry
   no colour of their own. The two Cosmos tints are tokens too: the deep blue of a sky and the blue of what is cold. */
export function tokens() {
  if (TOK) return TOK;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  TOK = {
    void: v('--void'), surface: v('--surface'), line: v('--line'), lineBright: v('--line-bright'),
    text: v('--text'), dim: v('--text-dim'), faint: v('--text-faint'), bright: v('--text-bright'),
    gold: v('--accretion'), goldSoft: v('--accretion-soft'), goldDim: v('--accretion-dim'),
    horizon: v('--horizon'), horizonDim: v('--horizon-dim'), sky: v('--cosmos-sky'), ice: v('--cosmos-ice'),
    font: '500 10px "IBM Plex Mono", ui-monospace, Consolas, monospace',
    fontSm: '400 9.5px "IBM Plex Mono", ui-monospace, Consolas, monospace',
    serif: '400 11px Fraunces, Georgia, serif',
  };
  return TOK;
}

/* A colour between two tokens: t = 0 gives a, t = 1 gives b. */
export function mix(a, b, t, alphaV = 1) {
  const p = (h) => { const x = h.replace('#', ''); const n = parseInt(x.length === 3 ? x.split('').map((c) => c + c).join('') : x, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const A = p(a), B = p(b), k = Math.max(0, Math.min(1, t));
  return `rgba(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',')},${alphaV})`;
}

/* rgba() from a #rrggbb token */
export function alpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* A canvas that tracks its CSS size and device pixel ratio. draw(ctx, w, h) in CSS px. */
export function surface(canvas, draw) {
  const ctx = canvas.getContext('2d');
  const s = { canvas, ctx, w: 0, h: 0, dpr: 1 };
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === s.w && h === s.h && dpr === s.dpr) return false;
    s.w = w; s.h = h; s.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    return true;
  };
  s.redraw = () => { fit(); ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); ctx.clearRect(0, 0, s.w, s.h); draw(ctx, s.w, s.h); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (fit()) s.redraw(); }).observe(canvas);
  else window.addEventListener('resize', () => { if (fit()) s.redraw(); });
  fit();
  return s;
}

export function logScale(d0, d1, r0, r1) {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = (v) => r0 + (Math.log10(v) - l0) / (l1 - l0) * (r1 - r0);
  f.inv = (px) => Math.pow(10, l0 + (px - r0) / (r1 - r0) * (l1 - l0));
  f.domain = [d0, d1];
  return f;
}
export function linScale(d0, d1, r0, r1) {
  const f = (v) => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  f.inv = (px) => d0 + (px - r0) / (r1 - r0) * (d1 - d0);
  return f;
}

export const isNum = (v) => typeof v === 'number' && isFinite(v);

/* The numbers of this lab are written by the kit's one convention (kit/format.js): significant figures, grouped by
   thousands. A value that is not there is a dash in the drawings and tables that used it. */
export const fmt = (v, sig = 3) => num(v, sig, '—');
export const fmtInt = (v) => int(v, '—');

export function decadeLabel(v) {
  if (v >= 1000) return (v / 1000) + 'k';
  if (v >= 1) return String(v);
  return String(v);
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
