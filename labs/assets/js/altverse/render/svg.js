/* altverse/render/svg.js — tiny helpers for building SVG and HTML. */
export const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
export function text(parent, x, y, s, attrs = {}) { const t = svg('text', { x, y, ...attrs }, parent); t.textContent = s; return t; }
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
export const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '.' : s; };
