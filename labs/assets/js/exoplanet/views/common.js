/* ============================================================
   views/common.js — what every 2D view shares: the design tokens
   read from CSS, a DPR-aware canvas that redraws on resize, log
   scales, and number formatting with units.
   ============================================================ */

let TOK = null;
export function tokens() {
  if (TOK) return TOK;
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => (cs.getPropertyValue(n).trim() || d);
  TOK = {
    void: v('--void', '#06080D'), line: v('--line', '#1C232F'), lineBright: v('--line-bright', '#2C3744'),
    text: v('--text', '#C5CCD8'), dim: v('--text-dim', '#79828F'), faint: v('--text-faint', '#424B57'),
    bright: v('--text-bright', '#EAF0FB'), gold: v('--accretion', '#D4A24C'), goldSoft: v('--accretion-soft', '#F0C674'),
    goldDim: v('--accretion-dim', '#97681F'), horizon: v('--horizon', '#9FB3D6'), horizonDim: v('--horizon-dim', '#565D72'),
    font: '500 10px "IBM Plex Mono", ui-monospace, Consolas, monospace',
    fontSm: '400 9px "IBM Plex Mono", ui-monospace, Consolas, monospace',
  };
  return TOK;
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

/* Significant-figure formatting that never prints a false precision. */
export function fmt(v, sig = 3) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5) return Math.round(v).toLocaleString('en-US');
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return v.toFixed(Math.min(d, 4));
}
export const fmtInt = (v) => (isNum(v) ? Math.round(v).toLocaleString('en-US') : '—');

export function decadeLabel(v) {
  if (v >= 1000) return (v / 1000) + 'k';
  if (v >= 1) return String(v);
  return String(v);
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
