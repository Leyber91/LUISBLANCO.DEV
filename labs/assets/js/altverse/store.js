/* ============================================================
   altverse/store.js — this browser's memory of worlds.
   Keeps the recent divergences (to reopen) and what a model wrote
   for a world (so a reload does not lose it). Storage can be
   blocked; every call degrades to "nothing remembered".

   What is saved is what is listed: the store keeps RECENT_MAX
   worlds and the shelf shows every one of them, including a world
   whose text is an example's. The same text on another seed, or
   with forks, is another world; the example chip only reweaves the
   default seed, so hiding such a world made it unreachable.
   ============================================================ */

import { decodeHash } from './tree.js';

const K_RECENT = 'altverse:recent:v2';
const K_DELTA = (id) => 'altverse:delta:v2:' + id;
export const RECENT_MAX = 6;

function read(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }

/* every saved world that can be reopened, newest first */
export function recent() {
  const list = read(K_RECENT, []);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.hash === 'string' && decodeHash(r.hash)).slice(0, RECENT_MAX) : [];
}

export function remember(w, hash) {
  const list = recent().filter((r) => r.hash !== hash);
  list.unshift({ hash, name: w.name, text: w.path[w.path.length - 1].text, depth: w.path.length - 1, at: Date.now() });
  write(K_RECENT, list.slice(0, RECENT_MAX));
}

/* The shelf of chips: the examples, then every saved world, nothing filtered out.
   A saved chip carries the hash that reopens it and the seed it was woven on. */
export function shelf(presets, saved, { activeText = '', currentHash = '', defaultSeed = null } = {}) {
  const chips = presets.map((p) => ({ kind: 'preset', text: p.text, group: p.group, short: p.short, hint: p.hint, pressed: p.text === activeText }));
  for (const r of saved) {
    const h = r && typeof r.hash === 'string' ? decodeHash(r.hash) : null;
    if (!h) continue;
    const seedNote = defaultSeed != null && h.seed === defaultSeed ? '' : `seed ${h.seed}`;
    chips.push({
      kind: 'saved', hash: r.hash, name: String(r.name || 'world'), seed: h.seed, seedNote, forks: h.forks.length,
      text: h.forks.length ? `${h.root} Then: ${h.forks.map((f) => f.text).join(' Then: ')}` : h.root,
      pressed: r.hash === currentHash,
    });
  }
  return chips;
}

export function saveDelta(id, delta) { if (delta) write(K_DELTA(id), delta); }
export function loadDelta(id) { return read(K_DELTA(id), null); }
