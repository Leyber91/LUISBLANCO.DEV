/* ============================================================
   ai-health/dom.js — small DOM and SVG helpers shared by the views.
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

export const fmtPct = (p, d) => (p == null || Number.isNaN(p) ? '–' : (100 * p).toFixed(d ?? (p < 0.1 ? 1 : 0)) + '%');
export const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : (+x).toFixed(d));
export const signed = (x, d = 2) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);
export const clock = (startHour, t) => String(startHour + t).padStart(2, '0') + ':00';

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Linear scale. */
export function scale(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.inv = (p) => d0 + (p - r0) / k;
  return f;
}

/* The width an SVG should draw at so its text stays at true size. */
export const fitWidth = (host, lo = 280, hi = 640) => Math.max(lo, Math.min(hi, Math.round(host.clientWidth || lo)));

/* Swap a container's content for new nodes. */
export function fill(node, ...kids) {
  node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  return node;
}

/* A one-shot debounce on animation frames. */
export function rafOnce(fn) {
  let q = false;
  return (...a) => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...a); }); };
}
