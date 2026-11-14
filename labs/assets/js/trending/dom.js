/* ============================================================
   trending/dom.js — DOM helpers. el() sets textContent, never
   innerHTML: every title on this page comes from the open web, so
   live strings are placed as text nodes only.
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
}

export function clear(n) { while (n && n.firstChild) n.firstChild.remove(); return n; }

export const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const pad2 = (n) => String(n).padStart(2, '0');
export const utc = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'n/a');
export const clock = (ms) => { const d = new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
export const kb = (bytes) => `${(bytes / 1024).toFixed(bytes > 10240 ? 0 : 1)} KB`;
export const since = (ms, now = Date.now()) => {
  const m = Math.round((now - ms) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${(m / 60).toFixed(1)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/* Save a text file from the page (export). */
export function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = el('a', null, null, { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
