/* ============================================================
   dimensional_mania/dom.js — small shared helpers: element
   construction, number formatting, and the motion policy
   (?still / ?motion / the OS preference), decided once.
   ============================================================ */

export const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
};

export const fmt = (v) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString('en-US') : String(v));

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');

/** signed number with a real minus sign */
export const sgn = (v, d = 2) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);

export const degOf = (rad) => Math.round((rad * 180) / Math.PI);

export const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * ?still  -> frozen composed frame (screenshots), also tags <html>.still
 * ?motion -> full motion even when the OS asks to reduce it
 * else    -> follow prefers-reduced-motion
 */
export function resolveMotion() {
  const q = new URLSearchParams(location.search);
  const still = q.has('still');
  const force = q.has('motion');
  const reduced = still || (!force && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (still) document.documentElement.classList.add('still');
  return { still, reduced };
}
