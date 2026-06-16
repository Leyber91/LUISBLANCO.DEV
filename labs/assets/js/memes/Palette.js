/* ============================================================
   memes/Palette.js — the canvas colour layer. Reads the locked
   theme tokens from CSS once (canvas can't read CSS vars cheaply),
   resolved against the fallbacks in constants. Plus the small hex
   helpers (alpha, mix) the painter leans on.
   ============================================================ */

import { PALETTE_TOKENS } from './constants.js';

/** resolve the {key: hex} palette from :root, falling back to constants */
export function readPalette() {
  const css = getComputedStyle(document.documentElement);
  const out = {};
  for (const [key, [prop, fallback]] of Object.entries(PALETTE_TOKENS)) {
    out[key] = css.getPropertyValue(prop).trim() || fallback;
  }
  return out;
}

/** "#rgb"/"#rrggbb" -> "rgba(r,g,b,a)" */
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** linear blend of two hex colours -> "rgb(r,g,b)" */
export function mix(h1, h2, t) {
  const p = (h) => { const x = h.replace('#', ''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; };
  const a = p(h1), b = p(h2);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
