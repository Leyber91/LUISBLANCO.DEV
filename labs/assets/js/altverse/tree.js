/* ============================================================
   altverse/tree.js — the tree of worlds, its URL and its export.

   A world is fully determined by (seed, root divergence, fork
   path), so a URL carries exactly that and replays the engine's
   world byte for byte. A model's prose cannot be replayed from a
   seed; it travels in the JSON export instead, and the page keeps
   it in this browser's storage so a reload does not lose it.
   ============================================================ */

import { STAGE_ORDER } from './config.js';

export class WorldTree {
  constructor() { this.nodes = new Map(); this.rootId = null; this.currentId = null; }
  add(w) {
    this.nodes.set(w.id, w);
    if (!w.parentId) this.rootId = w.id;
    return w;
  }
  get(id) { return this.nodes.get(id); }
  get current() { return this.nodes.get(this.currentId); }
  children(id) { return [...this.nodes.values()].filter((n) => n.parentId === id); }
  lineage(id) { const out = []; let n = this.get(id); while (n) { out.unshift(n); n = n.parentId ? this.get(n.parentId) : null; } return out; }
  clear() { this.nodes.clear(); this.rootId = null; this.currentId = null; }
  all() { return [...this.nodes.values()]; }
  depth(id) { return this.lineage(id).length - 1; }
}

/* ---- URL: #s=<seed>&d=<root text>&f=<eventId>~<text>|... ---- */
export function encodeHash(w) {
  const p = new URLSearchParams();
  p.set('s', (w.seed >>> 0).toString(36));
  p.set('d', w.path[0].text);
  if (w.path.length > 1) p.set('f', w.path.slice(1).map((x) => `${x.eventId}~${x.text.replace(/[|~]/g, ' ')}`).join('|'));
  return '#' + p.toString();
}

export function decodeHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const d = p.get('d');
  if (!d) return null;
  const seed = parseInt(p.get('s') || '0', 36) >>> 0;
  const forks = (p.get('f') || '').split('|').filter(Boolean).map((x) => { const i = x.indexOf('~'); return { eventId: x.slice(0, i), text: x.slice(i + 1) }; });
  return { seed, root: d.slice(0, 240), forks: forks.slice(0, 8) };
}

export function shareURL(w) { return location.href.split('#')[0] + encodeHash(w); }

/* ---- a lean copy of a world, without the computed fields ---- */
export function leanWorld(w) {
  const stages = {};
  for (const s of STAGE_ORDER) {
    const st = w.stages[s]; if (!st) continue;
    const { ...copy } = st;
    if (s === 'history') { copy.events = st.events; delete copy.tech; }
    stages[s] = copy;
  }
  return {
    id: w.id, parentId: w.parentId, name: w.name, motto: w.motto, seed: w.seed, path: w.path,
    divergence: { text: w.spec.text, label: w.spec.label, family: w.spec.family, year: w.spec.year, knobs: w.spec.knobs },
    knobs: w.knobs, stages, trace: w.trace, model: w.model || null, ledger: w.ledger, rejected: w.rejected, repaired: w.repaired,
  };
}

export function exportTree(tree) {
  return {
    format: 'altverse-world-tree/1',
    exported: new Date().toISOString(),
    source: 'luisblanco.dev/labs/altverse.html',
    note: 'Engine worlds replay from seed and path; items with origin "model" were written by the route named in each world\'s model field and checked by the validator.',
    root: tree.rootId,
    worlds: tree.all().map(leanWorld),
  };
}

/* ---- what a model added, so a reload can put it back on the replayed engine world ---- */
export function modelDelta(w) {
  if (!w.model || !w.model.done) return null;
  return deltaOf(w);
}

/* what an exported (lean) world carries beyond the engine */
export function deltaFromLean(lean) {
  if (!lean || !lean.model || !lean.model.done) return null;
  return deltaOf(lean);
}

function deltaOf(w) {
  const st = {};
  for (const s of STAGE_ORDER) {
    const x = w.stages[s]; if (!x) continue;
    const items = (x.items || []).filter((i) => i.origin === 'model');
    const events = (x.events || []).filter((e) => e.origin === 'model');
    const names = {};
    (x.regions || x.peoples || []).forEach((r) => { if (r.origin === 'model') names[r.id] = { name: r.name, text: r.note || '' }; });
    if (items.length || events.length || x.summaryOrigin === 'model' || Object.keys(names).length) st[s] = { items, events, names, summary: x.summaryOrigin === 'model' ? x.summary : null };
  }
  return { model: w.model, stages: st, name: w.name, motto: w.motto, rejected: w.rejected, repaired: w.repaired, trace: w.trace };
}

export function applyDelta(w, d) {
  if (!d) return w;
  for (const [s, v] of Object.entries(d.stages || {})) {
    const st = w.stages[s]; if (!st || st.pruned) continue;
    if (v.summary) { st.engineSummary = st.summary; st.summary = v.summary; st.summaryOrigin = 'model'; }
    st.items = [...(st.items || []), ...(v.items || [])];
    if (v.events && v.events.length) st.events = [...st.events, ...v.events].sort((a, b) => a.year - b.year);
    for (const [id, n] of Object.entries(v.names || {})) { const list = st.regions || st.peoples || []; const r = list.find((x) => x.id === id); if (r) { r.engineName = r.name; r.name = n.name; r.note = n.text; r.origin = 'model'; } }
  }
  w.model = d.model; w.name = d.name || w.name; w.motto = d.motto || w.motto;
  w.rejected = d.rejected || []; w.repaired = d.repaired || []; w.trace = d.trace || w.trace;
  return w;
}
