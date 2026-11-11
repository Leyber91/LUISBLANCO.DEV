/* ============================================================
   heptapod/topo/hmr.js — the meaning graph the kernel draws: HMR, a
   subset of Uniform Meaning Representation (Van Gysel et al. 2021,
   KI - Kunstliche Intelligenz). This is the E1 inventory: enough
   classes, features and edge labels to exercise the topology kernel
   with realistic shapes (reentrancy, coreference, junctions, scope,
   names, two speakers). E4 owns the full v0.1 schema.

   A graph is plain JSON:
     { v: 'hmr-0.1', nodes: { id: { k, c?, f?, spell? } }, edges: [[head, label, dep, f]] }
   Edges run from head to dependent. Node ids carry no meaning: the
   kernel canonicalises before it draws, so renaming them changes
   nothing (the E1 test checks this byte for byte).
   ============================================================ */

import { pick, randInt } from './rng.js';

export const HMR_VERSION = 'hmr-0.1';

/* Radicals: a deliberately small pool here, so that many lobes share
   a label and lobe identity cannot be read from labels alone. */
export const RADICALS = ['PERSON', 'ANIMAL', 'THING', 'PLACE', 'MOVE', 'GIVE', 'SEE', 'KNOW'];

const TEMP = ['before', 'after', 'overlap', 'contains', 'within', 'timeless', 'unspec'];

export const NODE_CLASSES = {
  origo:    { concept: false, f: { speaker: ['visitor', 'far'] } },
  event:    { concept: true,  f: { aspect: ['state', 'habitual', 'activity', 'endeavor', 'performance', 'process'],
                                   strength: ['AFF', 'PARTAFF', 'NEUTAFF', 'NEUTNEG', 'PARTNEG', 'NEG'] } },
  entity:   { concept: true,  f: { person: ['1', '2', '3'], num: ['sg', 'pl', 'dual', 'paucal'],
                                   quant: ['indef', 'def', 'univ', 'neg', 'prop'] } },
  junction: { concept: false, f: { op: ['and', 'or', 'contrast'] } },
  scope:    { concept: false, f: { order: ['ordered', 'unresolved'] } },
  name:     { concept: false, f: {}, spell: true },
};

/* Edge classes in the plan's spanning-tree priority order (3.4.1). */
export const EDGE_CLASSES = ['participant', 'discourse', 'temporal', 'modal', 'coreference'];

/* Every edge label, its class and its features (each with an explicit
   value, defaults included). The order within a class is the role rank. */
export const EDGE_LABELS = {
  actor:         { cls: 'participant', f: { inv: ['direct', 'inverse'] } },
  undergoer:     { cls: 'participant', f: { inv: ['direct', 'inverse'] } },
  goal:          { cls: 'participant', f: { inv: ['direct', 'inverse'] } },
  content:       { cls: 'participant', f: { temp: TEMP } },
  space:         { cls: 'participant', f: { type: ['location', 'source', 'destination', 'path'] } },
  time:          { cls: 'participant', f: { type: ['point', 'duration', 'frequency'] } },
  means:         { cls: 'participant', f: { type: ['manner', 'instrument', 'accompanier'] } },
  contingency:   { cls: 'participant', f: { type: ['cause', 'purpose', 'condition', 'concession'] } },
  attribution:   { cls: 'participant', f: { type: ['mod', 'poss', 'part', 'topic'] } },
  quantity:      { cls: 'participant', f: { type: ['quant', 'unit', 'ord'] } },
  op:            { cls: 'participant', f: {} },
  name:          { cls: 'participant', f: {} },
  scope:         { cls: 'participant', f: {} },
  address:       { cls: 'discourse',   f: {} },
  disc:          { cls: 'discourse',   f: { rel: ['temporal', 'contingency', 'comparison', 'expansion'] } },
  anchor:        { cls: 'temporal',    f: { mode: ['decl', 'inter', 'imper', 'expr'], temp: TEMP,
                                            evid: ['visual', 'sensory', 'inference', 'assumption', 'hearsay', 'quotative'] } },
  trel:          { cls: 'temporal',    f: { temp: ['before', 'after', 'overlap', 'contains', 'within'] } },
  conceiver:     { cls: 'modal',       f: { strength: ['AFF', 'PARTAFF', 'NEUTAFF', 'NEUTNEG', 'PARTNEG', 'NEG'] } },
  'same-entity': { cls: 'coreference', f: {} },
  'same-event':  { cls: 'coreference', f: {} },
  'subset-of':   { cls: 'coreference', f: {} },
};

const LABEL_LIST = Object.keys(EDGE_LABELS);
export const edgeClassRank = (label) => EDGE_CLASSES.indexOf(EDGE_LABELS[label].cls);
export const edgeRoleRank = (label) => {
  const cls = EDGE_LABELS[label].cls;
  return LABEL_LIST.filter((l) => EDGE_LABELS[l].cls === cls).indexOf(label);
};

/* ---------------- tokens and keys ---------------- */
/* A lobe's own motifs (the rim code minus collars, checksum and fillers):
   its class determinant, its radicals, one motif per feature value, and
   for a name its letters in reading order. Symbol prefixes:
     D: determinant   R: radical   F: feature   L: letter
     M: collar marker I: collar inflection   X: echo index   S: checksum   Z: filler */
export function nodeTokens(node) {
  const t = ['D:' + node.k];
  if (node.c) for (const r of [...node.c].sort()) t.push('R:' + r);
  for (const k of Object.keys(node.f || {}).sort()) t.push('F:' + k + '=' + node.f[k]);
  if (node.spell) for (const ch of node.spell) t.push('L:' + ch);
  return t;
}

export function nodeKey(node) {
  const c = node.c ? [...node.c].sort().join('+') : '';
  const f = Object.keys(node.f || {}).sort().map((k) => k + '=' + node.f[k]).join(',');
  return node.k + '|' + c + '|' + f + '|' + (node.spell || '');
}

export function edgeKey(label, f) {
  return label + '(' + Object.keys(f || {}).sort().map((k) => k + '=' + f[k]).join(',') + ')';
}

/* One collar copy: the role marker, then its inflections in a fixed order. */
export function collarTokens(label, f) {
  return ['M:' + label, ...Object.keys(f || {}).sort().map((k) => 'I:' + k + '=' + f[k])];
}

/* ---------------- indexed form ---------------- */
export function indexed(g) {
  const ids = Object.keys(g.nodes);
  const at = new Map(ids.map((id, i) => [id, i]));
  const nodes = ids.map((id) => g.nodes[id]);
  const edges = g.edges.map(([h, label, d, f]) => ({ h: at.get(h), d: at.get(d), label, f: f || {}, key: edgeKey(label, f || {}) }));
  return { n: ids.length, ids, nodes, edges };
}

/* ---------------- validation ---------------- */
export function validateHMR(g) {
  const errors = [];
  if (!g || typeof g !== 'object' || !g.nodes || !Array.isArray(g.edges)) return { ok: false, errors: ['not an HMR graph'] };
  const ids = Object.keys(g.nodes);
  if (!ids.length) errors.push('no nodes');
  for (const id of ids) {
    const nd = g.nodes[id];
    const cls = NODE_CLASSES[nd && nd.k];
    if (!cls) { errors.push(`node ${id}: unknown class ${nd && nd.k}`); continue; }
    if (cls.concept) {
      if (!Array.isArray(nd.c) || nd.c.length < 1 || nd.c.length > 3 || nd.c.some((r) => !RADICALS.includes(r))) errors.push(`node ${id}: concept must be 1 to 3 known radicals`);
    } else if (nd.c) errors.push(`node ${id}: class ${nd.k} carries no concept`);
    const fk = Object.keys(cls.f);
    const have = Object.keys(nd.f || {});
    for (const k of fk) if (!nd.f || !cls.f[k].includes(nd.f[k])) errors.push(`node ${id}: feature ${k} missing or invalid (every value is explicit)`);
    for (const k of have) if (!fk.includes(k)) errors.push(`node ${id}: unknown feature ${k}`);
    if (cls.spell) { if (!/^[a-z]{1,12}$/.test(nd.spell || '')) errors.push(`node ${id}: a name is 1 to 12 letters a-z`); }
    else if (nd.spell) errors.push(`node ${id}: only a name is spelled`);
  }
  const seen = new Set();
  const deg = new Map(ids.map((id) => [id, 0]));
  for (const e of g.edges) {
    const [h, label, d, f] = e;
    const spec = EDGE_LABELS[label];
    if (!spec) { errors.push(`edge ${h}-${label}-${d}: unknown label`); continue; }
    if (!(h in g.nodes) || !(d in g.nodes)) { errors.push(`edge ${h}-${label}-${d}: unknown endpoint`); continue; }
    if (h === d) errors.push(`edge ${h}-${label}-${d}: self-loop`);
    const key = h + '\u0001' + label + '\u0001' + d;
    if (seen.has(key)) errors.push(`edge ${h}-${label}-${d}: duplicate`);
    seen.add(key);
    for (const k of Object.keys(spec.f)) if (!f || !spec.f[k].includes(f[k])) errors.push(`edge ${h}-${label}-${d}: feature ${k} missing or invalid`);
    for (const k of Object.keys(f || {})) if (!(k in spec.f)) errors.push(`edge ${h}-${label}-${d}: unknown feature ${k}`);
    deg.set(h, deg.get(h) + 1); deg.set(d, deg.get(d) + 1);
    if (label === 'name' && (g.nodes[h].k !== 'entity' || g.nodes[d].k !== 'name')) errors.push(`edge ${h}-name-${d}: a name hangs from an entity`);
    if (label === 'anchor' && (g.nodes[h].k !== 'origo' || g.nodes[d].k !== 'event')) errors.push(`edge ${h}-anchor-${d}: an anchor runs from an origo to an event`);
    if (label === 'address' && (g.nodes[h].k !== 'origo' || g.nodes[d].k !== 'origo')) errors.push(`edge ${h}-address-${d}: address links two origos`);
    if (label === 'op' && !['junction', 'scope'].includes(g.nodes[h].k)) errors.push(`edge ${h}-op-${d}: op hangs from a junction or a scope`);
  }
  for (const id of ids) if (g.nodes[id] && g.nodes[id].k === 'name') {
    const inc = g.edges.filter((e) => e[0] === id || e[2] === id);
    if (inc.length !== 1 || inc[0][1] !== 'name' || inc[0][2] !== id) errors.push(`node ${id}: a name has exactly one contact, its name edge`);
  }
  // connected
  if (ids.length) {
    const adj = new Map(ids.map((id) => [id, []]));
    for (const [h, , d] of g.edges) if (adj.has(h) && adj.has(d)) { adj.get(h).push(d); adj.get(d).push(h); }
    const seenN = new Set([ids[0]]); const st = [ids[0]];
    while (st.length) for (const w of adj.get(st.pop())) if (!seenN.has(w)) { seenN.add(w); st.push(w); }
    if (seenN.size !== ids.length) errors.push('graph is not connected: one text is one figure');
  }
  return { ok: errors.length === 0, errors };
}

/* ---------------- random graphs (test support) ---------------- */
const randFeats = (rnd, spec) => {
  const f = {};
  for (const k of Object.keys(spec)) f[k] = pick(rnd, spec[k]);
  return f;
};
const randConcept = (rnd) => {
  const n = rnd() < 0.55 ? 1 : rnd() < 0.85 ? 2 : 3;
  return Array.from({ length: n }, () => pick(rnd, RADICALS));
};
const NAMES = ['ada', 'abel', 'ana', 'ian', 'louise', 'kip'];
const PART_ROLES = ['actor', 'undergoer', 'goal'];
const CIRC_ROLES = ['space', 'time', 'means', 'contingency', 'quantity'];

/* Size mix: half sentence-scale, the rest paragraph-scale up to 40 lobes
   (the research check 3 used trees of 2 to 39 nodes). */
export function sampleSize(rnd) {
  const u = rnd();
  return u < 0.5 ? randInt(rnd, 2, 10) : u < 0.8 ? randInt(rnd, 11, 20) : randInt(rnd, 21, 40);
}

export function randomHMR(rnd, opts = {}) {
  const target = opts.n || sampleSize(rnd);
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const add = (nd) => { nodes.push(nd); return nodes.length - 1; };
  const link = (h, label, d, f) => {
    if (h === d) return false;
    const key = h + '|' + label + '|' + d;
    if (seen.has(key)) return false;
    seen.add(key);
    edges.push([h, label, d, f || randFeats(rnd, EDGE_LABELS[label].f)]);
    return true;
  };
  const events = [];
  const entities = [];
  const named = new Set();
  /* a new lobe sometimes copies its sibling's label exactly ("the man saw a man") */
  let lastEntity = null;
  let lastEvent = null;
  const newEvent = (aspect) => {
    const nd = lastEvent && rnd() < 0.2 ? { k: 'event', c: [...lastEvent.c], f: { ...lastEvent.f } }
      : { k: 'event', c: randConcept(rnd), f: randFeats(rnd, NODE_CLASSES.event.f) };
    if (aspect) nd.f.aspect = aspect;
    lastEvent = nd;
    const i = add(nd); events.push(i); return i;
  };
  const newEntity = () => {
    const nd = lastEntity && rnd() < 0.3 ? { k: 'entity', c: [...lastEntity.c], f: { ...lastEntity.f } }
      : { k: 'entity', c: randConcept(rnd), f: randFeats(rnd, NODE_CLASSES.entity.f) };
    lastEntity = nd;
    const i = add(nd); entities.push(i); return i;
  };

  const origos = [add({ k: 'origo', f: { speaker: 'visitor' } })];
  if (target >= 4 && rnd() < 0.15) {
    const o2 = add({ k: 'origo', f: { speaker: 'far' } });
    link(origos[0], 'address', o2, {});
    origos.push(o2);
  }
  for (const o of origos) if (nodes.length < Math.max(target, origos.length + 1)) link(o, 'anchor', newEvent());

  let guard = 0;
  while (nodes.length < target && guard++ < 500) {
    const r = rnd();
    const room = target - nodes.length;
    if (r < 0.36) {
      link(pick(rnd, events), pick(rnd, PART_ROLES), newEntity());
    } else if (r < 0.48) {
      link(pick(rnd, events), 'content', newEvent());
    } else if (r < 0.56 && room >= 3) {
      const j = add({ k: 'junction', f: randFeats(rnd, NODE_CLASSES.junction.f) });
      link(pick(rnd, events), pick(rnd, PART_ROLES), j);
      const kind = rnd() < 0.6 ? 'entity' : 'event';
      const a = kind === 'entity' ? newEntity() : newEvent();
      const b = kind === 'entity' ? newEntity() : newEvent();
      link(j, 'op', a, {}); link(j, 'op', b, {});
    } else if (r < 0.64 && entities.some((x) => !named.has(x))) {
      const x = pick(rnd, entities.filter((y) => !named.has(y)));
      named.add(x);
      link(x, 'name', add({ k: 'name', f: {}, spell: pick(rnd, NAMES) }), {});
    } else if (r < 0.71 && entities.length) {
      link(pick(rnd, entities), 'attribution', newEvent('state'));
    } else if (r < 0.75 && entities.length >= 2) {
      const e = pick(rnd, events);
      const s = add({ k: 'scope', f: randFeats(rnd, NODE_CLASSES.scope.f) });
      link(e, 'scope', s, {});
      const x1 = pick(rnd, entities);
      let x2 = pick(rnd, entities);
      if (x2 === x1) x2 = entities[(entities.indexOf(x1) + 1) % entities.length];
      link(s, 'op', x1, {}); link(s, 'op', x2, {});
    } else if (r < 0.84 && events.length) {
      const prev = pick(rnd, events);
      const e2 = newEvent();
      link(pick(rnd, origos), 'anchor', e2);
      link(prev, 'disc', e2);
    } else {
      link(pick(rnd, events), pick(rnd, CIRC_ROLES), newEntity());
    }
  }

  /* reentrancy and coreference: the non-tree edges */
  const extra = Math.floor(rnd() * (1.5 + nodes.length / 7));
  for (let t = 0; t < extra; t++) {
    const r = rnd();
    if (r < 0.45 && events.length && entities.length) link(pick(rnd, events), pick(rnd, [...PART_ROLES, ...CIRC_ROLES]), pick(rnd, entities));
    else if (r < 0.65 && entities.length >= 2) link(pick(rnd, entities), pick(rnd, ['same-entity', 'subset-of']), pick(rnd, entities), {});
    else if (r < 0.8 && events.length >= 2) link(pick(rnd, events), pick(rnd, ['same-event', 'trel']), pick(rnd, events));
    else if (events.length && entities.length) link(pick(rnd, entities), 'conceiver', pick(rnd, events));
  }

  const g = { v: HMR_VERSION, nodes: {}, edges: [] };
  nodes.forEach((nd, i) => { g.nodes['n' + i] = nd; });
  for (const [h, label, d, f] of edges) g.edges.push(['n' + h, label, 'n' + d, f]);
  return g;
}

/* An isomorphic copy: fresh ids, shuffled node and edge order. */
export function permuteGraph(g, rnd) {
  const ids = Object.keys(g.nodes);
  const fresh = new Map();
  const used = new Set();
  for (const id of ids) {
    let nid;
    do nid = 'v' + Math.floor(rnd() * 1e9).toString(36); while (used.has(nid));
    used.add(nid); fresh.set(id, nid);
  }
  const order = ids.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const out = { v: g.v, nodes: {}, edges: [] };
  for (const id of order) out.nodes[fresh.get(id)] = JSON.parse(JSON.stringify(g.nodes[id]));
  const es = g.edges.map(([h, l, d, f]) => [fresh.get(h), l, fresh.get(d), { ...(f || {}) }]);
  for (let i = es.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [es[i], es[j]] = [es[j], es[i]]; }
  out.edges = es;
  return out;
}
