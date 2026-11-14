/* ============================================================
   token-ekg/engine/traces.js — the trace shelf.

   Three kinds of trace share one shape:
     recording  shipped in data/traces.json, recorded on 2026-11-11
     saved      made in this browser (a live stream or a timed
                public reply), kept in localStorage
     imported   a JSON file the visitor loaded
   Stored chunks are compact [t, kind, text]; the page works on
   { t, kind, text } objects.
   ============================================================ */

import { SHELF } from '../config.js';
import { cleanTrace, validateTrace } from './schema.js';

const store = {
  get() { try { return JSON.parse(globalThis.localStorage?.getItem(SHELF.storeKey) || '[]'); } catch { return []; } },
  set(v) { try { globalThis.localStorage?.setItem(SHELF.storeKey, JSON.stringify(v)); return true; } catch { return false; } },
};

export function inflate(t, origin) {
  if (origin !== 'recording') t = cleanTrace(t);        // anything but the lab's own recordings is cleaned as it is read
  const chunks = (t.chunks || []).map((c) => (Array.isArray(c) ? { t: c[0], kind: c[1], text: c[2] } : c));
  return { ...t, origin: origin || t.origin || 'imported', kind: t.kind || 'stream', chunks };
}

export function deflate(t) {
  const { origin, ...rest } = t;
  return { ...rest, chunks: t.chunks.map((c) => [c.t, c.kind, c.text]) };
}

export async function loadRecordings(url) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error('recordings: http ' + r.status);
  const j = await r.json();
  return { about: j.about, traces: (j.traces || []).map((t) => inflate(t, 'recording')) };
}

export function loadSaved() {
  const all = store.get();
  // what is in storage may have been put there by something else: a record that is not a trace is left out
  return (Array.isArray(all) ? all : []).filter((t) => validateTrace(t).length === 0).map((t) => inflate(t, 'saved'));
}

/** Save a trace in this browser. Returns false when storage is unavailable or full. */
export function save(trace) {
  const all = store.get().filter((t) => t.id !== trace.id);
  const slim = deflate({ ...trace, chunks: trace.chunks.slice(0, SHELF.maxChunks) });
  all.unshift(slim);
  return store.set(all.slice(0, SHELF.maxSaved));
}

export function remove(id) {
  store.set(store.get().filter((t) => t.id !== id));
}

export function clearSaved() {
  store.set([]);
}

/** Validate and inflate an imported JSON document (one trace, a list, or a traces.json file). */
export function parseImport(text) {
  const j = JSON.parse(text);
  const list = Array.isArray(j) ? j : Array.isArray(j.traces) ? j.traces : [j];
  const out = [];
  for (const t of list) {
    if (!t || !Array.isArray(t.chunks)) continue;
    const ok = t.chunks.every((c) => (Array.isArray(c) ? Number.isFinite(c[0]) : Number.isFinite(c?.t)));
    if (!ok) continue;
    out.push(inflate({ ...t, id: String(t.id || 'import-' + Date.now()) + '-i', label: String(t.label || 'imported trace') }, 'imported'));
  }
  if (!out.length) throw new Error('no trace with a chunks array in that file');
  return out;
}

export function exportJSON(traces) {
  return JSON.stringify({
    about: 'Token EKG traces exported from luisblanco.dev/labs/token-ekg.html. t is milliseconds since the request was sent.',
    traces: traces.map(deflate),
  }, null, 0);
}

export function newId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
}
