/* ============================================================
   altverse/store.js — this browser's memory of worlds.
   Keeps the recent divergences (to reopen) and what a model wrote
   for a world (so a reload does not lose it). Storage can be
   blocked; every call degrades to "nothing remembered".
   ============================================================ */

const K_RECENT = 'altverse:recent:v2';
const K_DELTA = (id) => 'altverse:delta:v2:' + id;

function read(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }

export function recent() { return read(K_RECENT, []); }

export function remember(w, hash) {
  const list = recent().filter((r) => r.hash !== hash);
  list.unshift({ hash, name: w.name, text: w.path[w.path.length - 1].text, depth: w.path.length - 1, at: Date.now() });
  write(K_RECENT, list.slice(0, 12));
}

export function saveDelta(id, delta) { if (delta) write(K_DELTA(id), delta); }
export function loadDelta(id) { return read(K_DELTA(id), null); }
