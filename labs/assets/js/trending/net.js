/* ============================================================
   trending/net.js — the one network helper the sources use.

   Every request has a hard timeout and cooperates with the scan's
   AbortSignal. The response body is read as text so the page can
   count the bytes it actually received (UTF-8 length of the body,
   which is what DevTools reports as resource size), and each request
   is logged into the scan's ledger: URL, status, bytes, time and the
   rate-limit headers a source sends. Runs in the browser and in Node.
   ============================================================ */

const enc = typeof TextEncoder === 'function' ? new TextEncoder() : null;
const byteLen = (s) => (enc ? enc.encode(s).length : s.length);

export class Ledger {
  constructor() { this.rows = []; }
  add(row) { this.rows.push(row); return row; }
  bySource(src) { return this.rows.filter((r) => r.src === src); }
  bytes(src) { return (src ? this.bySource(src) : this.rows).reduce((a, r) => a + (r.bytes || 0), 0); }
  count(src) { return (src ? this.bySource(src) : this.rows).length; }
}

export function abortError() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * GET a JSON document. Returns { status, ok, json, bytes, ms, headers }.
 * Throws AbortError when the outer signal aborts, and Error('timeout')
 * when the per-request budget runs out.
 */
export async function getJSON(url, { signal, timeoutMs = 12000, headers, ledger, src } = {}) {
  if (signal?.aborted) throw abortError();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const t0 = Date.now();
  const row = ledger?.add({ src, url, status: 0, bytes: 0, ms: 0, at: t0 });
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers, cache: 'no-store', referrerPolicy: 'no-referrer' });
    const text = await res.text();
    const out = {
      status: res.status, ok: res.ok, bytes: byteLen(text), ms: Date.now() - t0,
      headers: {
        remaining: res.headers.get('x-ratelimit-remaining'),
        limit: res.headers.get('x-ratelimit-limit'),
        reset: res.headers.get('x-ratelimit-reset'),
      },
      json: null,
    };
    if (row) Object.assign(row, { status: out.status, bytes: out.bytes, ms: out.ms });
    if (res.ok) {
      try { out.json = JSON.parse(text); } catch { out.ok = false; out.status = 'bad json'; }
    }
    return out;
  } catch (e) {
    if (row) Object.assign(row, { status: signal?.aborted ? 'aborted' : timedOut ? 'timeout' : 'network', ms: Date.now() - t0 });
    if (signal?.aborted) throw abortError();
    throw new Error(timedOut ? 'timeout' : (e.message || 'network error'));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* Run async tasks with at most n in flight; results keep input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return out;
}

/* ---- dates in UTC, the clock every source reports in ---- */
const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d, sep = '-') => `${d.getUTCFullYear()}${sep}${p2(d.getUTCMonth() + 1)}${sep}${p2(d.getUTCDate())}`;
export const daysBefore = (d, n) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() - n); return x; };
export const parseYmd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
