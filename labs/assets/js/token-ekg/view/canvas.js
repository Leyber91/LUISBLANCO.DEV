/* ============================================================
   token-ekg/view/canvas.js — shared canvas plumbing and the palette
   read from tokens.css, so no colour is hard-coded in the views.
   ============================================================ */

let palette = null;

export function colors() {
  if (palette) return palette;
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => (cs.getPropertyValue(name).trim() || fb);
  palette = {
    void: v('--void', '#06080D'),
    line: v('--line', '#1C232F'),
    lineBright: v('--line-bright', '#2C3744'),
    text: v('--text', '#C5CCD8'),
    dim: v('--text-dim', '#79828F'),
    faint: v('--text-faint', '#424B57'),
    bright: v('--text-bright', '#EAF0FB'),
    gold: v('--accretion', '#D4A24C'),
    goldSoft: v('--accretion-soft', '#F0C674'),
    goldDim: v('--accretion-dim', '#97681F'),
    goldGlow: v('--accretion-glow', 'rgba(212,162,76,.45)'),
    horizon: v('--horizon', '#9FB3D6'),
    horizonDim: v('--horizon-dim', '#565D72'),
    font: v('--font-mono', 'monospace'),
  };
  return palette;
}

/** rgba() from a #rrggbb token and an alpha. */
export function alpha(hex, a) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two #rrggbb colours, k = 0 gives a, 1 gives b. */
export function mix(a, b, k) {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Size a canvas to its CSS box at a device-pixel ratio; returns the 2D context in CSS pixels. */
export function fit(canvas, dprCap = 2) {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, dprCap);
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

export function fmtAxis(ms) {
  if (Math.abs(ms) < 1e-9) return '0';
  if (ms >= 1000) return (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : ms % 100 === 0 ? 1 : 2) + ' s';
  if (ms >= 1) return Math.round(ms) + ' ms';
  return ms.toFixed(1) + ' ms';
}
