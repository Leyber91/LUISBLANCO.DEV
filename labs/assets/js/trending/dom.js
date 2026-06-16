/* ============================================================
   trending/dom.js — shared DOM, formatting and network helpers.

   el() sets textContent (never innerHTML) on purpose: every signal
   rendered here comes from the open web, so live strings are placed
   as text nodes only — the XSS-safe contract this page promises.
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

export const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const prefersReduced = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- number / time formatting (verbatim behaviour) ---- */
export const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
  return String(n);
};
export const humanAge = (h) =>
  h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${Math.round(h / 24)}d`;
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d, sep = '/') =>
  `${d.getUTCFullYear()}${sep}${pad(d.getUTCMonth() + 1)}${sep}${pad(d.getUTCDate())}`;
export const daysAgoUTC = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
export const shorten = (s) => (s.length > 48 ? s.slice(0, 46) + '…' : s);
export const clockNow = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* ---- fetch with a hard timeout, cooperating with an outer signal ---- */
export async function fetchWithTimeout(url, signal, ms, headers) {
  const to = new AbortController();
  const timer = setTimeout(() => to.abort(), ms);
  const onAbort = () => to.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { signal: to.signal, headers, cache: 'no-store', referrerPolicy: 'no-referrer' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
