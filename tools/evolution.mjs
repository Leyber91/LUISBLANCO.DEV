// Evolution: a level is a state of the whole lab, not a list of features, and the axes grow by supporting each other.
//
// Luis, 2026-11-13: "we don't want evolution like, hey, I have this feature, level 2. No. Evolution itself." Each plan
// "has the time to stop at every level and see, okay, why I'm not at level 5? What will take me to a similar level 5?
// Analogy, orthogonal development."
//
// Three places carry it, and this tool checks all three:
//
//   1. labs/levels/atlas.json "evolution": what a lab IS at each level 1 to 10 (name, portrait, the shift in kind from
//      the level below, the checkpoint question), and the couplings between axes: which rung of one axis another
//      axis's rung stands on. Every rung 2 to 5 of every axis is supported by another axis or is a declared root.
//   2. A lab's plan.json "evolution" (private): its own portrait of levels 1 to 5, a checkpoint at each ("why not 5
//      yet, and what takes it up"), the analogy with Claude Prep per product axis (the same depth in an orthogonal
//      direction, and where the analogy breaks), its own couplings, and what makes its style unlike its siblings.
//   3. The tickets: for every coupling A.a -> B.b, each story that builds B.b depends, directly or through other
//      stories, on a story that builds A.a. `weave` adds those dependencies; `check` fails where they are missing.
//
// usage: node tools/evolution.mjs [check [<lab>] | weave <lab> | unique | selftest]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ATLAS = path.join(ROOT, 'labs', 'levels', 'atlas.json');
const PLANS = path.join(ROOT, '_reference', 'labs', 'plans');
const TARGET = 5;
const STYLE = ['geometry', 'texture', 'ornament', 'motion', 'ink'];
const MIN = { portrait: 200, shift: 80, checkpoint: 60, why: 40, labPortrait: 250, labShift: 100, labWhy: 60, axisLine: 40, analogy: 40, signature: 60, style: 20, differs: 60 };
const LIMIT = { minCross: 12, labCouplings: 12, labCross: 5, visitorCan: 3, portraitSimilarity: 0.12, notesSimilarity: 0.2 };

const text = (s) => (typeof s === 'string' ? s.trim() : '');
const long = (s, n) => text(s).length >= n;
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* ---------------- couplings ---------------- */
function parseNode(s) {
  const m = /^([a-z-]+)\.(\d{1,2})$/.exec(text(s));
  return m ? { axis: m[1], rung: Number(m[2]) } : null;
}

// errors for a list of couplings; top is the highest rung allowed
export function checkCouplings(couplings, atlas, where, top, minWhy) {
  const errs = [];
  const kinds = new Map(atlas.axes.map((a) => [a.id, a.kind]));
  const seen = new Set();
  const edges = [];
  if (!Array.isArray(couplings)) return { errs: [`${where}: couplings must be a list`], edges };
  for (const c of couplings) {
    const f = parseNode(c && c.from), t = parseNode(c && c.to);
    const at = `${where}: coupling ${c && c.from} -> ${c && c.to}`;
    if (!f || !t) { errs.push(`${at}: each end is "<axis>.<rung>"`); continue; }
    if (!kinds.has(f.axis) || !kinds.has(t.axis)) { errs.push(`${at}: unknown axis`); continue; }
    if (f.rung < 1 || f.rung > top || t.rung < 1 || t.rung > top) { errs.push(`${at}: rungs run from 1 to ${top}`); continue; }
    if (f.axis === t.axis) { errs.push(`${at}: a coupling joins two different axes (an axis's own rungs are cumulative already)`); continue; }
    if (f.rung > t.rung) { errs.push(`${at}: a rung can only stand on rungs at or below its own number`); continue; }
    if (!long(c.why, minWhy)) errs.push(`${at}: says why in ${minWhy}+ characters`);
    const key = `${f.axis}.${f.rung}>${t.axis}.${t.rung}`;
    if (seen.has(key)) errs.push(`${at}: listed twice`);
    seen.add(key);
    edges.push({ from: f, to: t, cross: kinds.get(f.axis) !== kinds.get(t.axis) });
  }
  // cycles can only form among nodes of one rung
  const adj = new Map();
  for (const e of edges) if (e.from.rung === e.to.rung) {
    const k = `${e.from.axis}.${e.from.rung}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push(`${e.to.axis}.${e.to.rung}`);
  }
  const state = new Map();
  const visit = (n, trail) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) { errs.push(`${where}: couplings form a cycle: ${[...trail, n].join(' -> ')}`); return; }
    state.set(n, 1);
    for (const m of adj.get(n) || []) visit(m, [...trail, n]);
    state.set(n, 2);
  };
  for (const n of adj.keys()) visit(n, []);
  return { errs, edges };
}

/* ---------------- 1. the atlas ---------------- */
export function checkAtlasEvolution(atlas) {
  const ev = atlas.evolution;
  if (!ev) return ['atlas has no evolution block'];
  const errs = [];
  if (!long(ev.principle, 120)) errs.push('evolution.principle states the idea in 120+ characters');
  if (!long(ev.analogy_rule, 120)) errs.push('evolution.analogy_rule says how a lab maps Claude Prep orthogonally, in 120+ characters');
  const names = new Set();
  for (let l = 1; l <= 10; l++) {
    const L = ev.levels && ev.levels[String(l)];
    if (!L) { errs.push(`evolution.levels.${l} is missing`); continue; }
    if (!long(L.name, 3)) errs.push(`level ${l}: no name`);
    if (names.has(text(L.name).toLowerCase())) errs.push(`level ${l}: the name "${L.name}" is used twice`);
    names.add(text(L.name).toLowerCase());
    if (!long(L.portrait, MIN.portrait)) errs.push(`level ${l}: the portrait says what a lab is at this level in ${MIN.portrait}+ characters`);
    if (!long(L.shift, MIN.shift)) errs.push(`level ${l}: the shift says what changed in kind from the level below in ${MIN.shift}+ characters`);
    if (!long(L.checkpoint, MIN.checkpoint)) errs.push(`level ${l}: the checkpoint is the question a lab stops to answer here, in ${MIN.checkpoint}+ characters`);
  }
  const { errs: cErrs, edges } = checkCouplings(ev.couplings, atlas, 'atlas', 10, MIN.why);
  errs.push(...cErrs);
  const roots = ev.roots || {};
  for (const k of Object.keys(roots)) {
    if (!parseNode(k)) errs.push(`roots: "${k}" is not "<axis>.<rung>"`);
    if (!long(roots[k], MIN.why)) errs.push(`roots.${k}: says why this rung stands on no other axis, in ${MIN.why}+ characters`);
  }
  for (const a of atlas.axes) {
    for (let r = 2; r <= TARGET; r++) {
      const supported = edges.some((e) => e.to.axis === a.id && e.to.rung === r);
      if (!supported && !roots[`${a.id}.${r}`]) errs.push(`${a.id}.${r}: no other axis supports this rung, and it is not a declared root`);
    }
    const low = (e) => e.from.rung <= TARGET && e.to.rung <= TARGET;
    const gives = edges.filter((e) => low(e) && e.from.axis === a.id).length;
    const takes = edges.filter((e) => low(e) && e.to.axis === a.id).length;
    if (gives < 2) errs.push(`${a.id}: supports fewer than 2 rungs of other axes up to rung ${TARGET}; an axis that gives nothing is a feature list`);
    if (takes < 2) errs.push(`${a.id}: stands on fewer than 2 rungs of other axes up to rung ${TARGET}`);
  }
  const cross = edges.filter((e) => e.cross).length;
  if (cross < LIMIT.minCross) errs.push(`only ${cross} couplings join a subject axis and a product axis; at least ${LIMIT.minCross}, because a product half that does not stand on the subject is bolted on`);
  return errs;
}

/* ---------------- scope: the lab as a graph ---------------- */
// Luis, 2026-11-13: "Token EKG, if you see it, is one node. This is one graph. Look at the complexity. How did you
// determine that it was level 2 or 3? We have to go broader." The axes say whether what exists is right; scope says
// how much exists, as a graph: organs (working parts a visitor uses on their own), links (one organ reading what
// another wrote) and reach (the share of the subject's units an organ works on). A lab's level is the lowest of its
// product level, its subject level and its scope level.
export function checkAtlasScope(atlas) {
  const sc = atlas.scope;
  if (!sc) return ['atlas has no scope block'];
  const errs = [];
  for (const k of ['principle', 'organ', 'link', 'reach', 'rule']) if (!long(sc[k], 80)) errs.push(`scope.${k}: 80+ characters`);
  const cp = sc.claude_prep || {};
  if (!(Number.isInteger(cp.organs) && cp.organs > 0 && Number.isInteger(cp.links) && cp.links >= 0)) errs.push('scope.claude_prep states the anchor\'s measured organs and links');
  if (!long(cp.how_counted, 80)) errs.push('scope.claude_prep.how_counted says how the anchor was counted');
  let prev = null;
  for (let l = 1; l <= 10; l++) {
    const t = sc.thresholds && sc.thresholds[String(l)];
    if (!t) { errs.push(`scope.thresholds.${l} is missing`); continue; }
    if (!(Number.isInteger(t.organs) && t.organs >= 1)) errs.push(`scope level ${l}: organs must be a whole number of at least 1`);
    if (!(Number.isInteger(t.links) && t.links >= 0)) errs.push(`scope level ${l}: links must be a whole number`);
    if (!(typeof t.reach === 'number' && t.reach >= 0 && t.reach <= 1)) errs.push(`scope level ${l}: reach is a share from 0 to 1`);
    if (!long(t.says, 60)) errs.push(`scope level ${l}: says what the graph is at this level, in 60+ characters`);
    if (prev && Number.isInteger(t.organs) && (t.organs <= prev.organs || t.links < prev.links || t.reach < prev.reach)) errs.push(`scope level ${l}: the graph must be larger than at level ${l - 1} (more organs, and no fewer links or reach)`);
    prev = t;
  }
  const t5 = sc.thresholds && sc.thresholds['5'];
  if (t5 && Number.isInteger(cp.organs) && (t5.organs > cp.organs || t5.links > cp.links)) errs.push('scope level 5 asks for more than Claude Prep measurably has; level 5 is the anchor');
  return errs;
}

const graphMeets = (g, t) => g.organs >= t.organs && g.links >= t.links && g.reach + 1e-9 >= t.reach;

// today's graph of a lab, from plan.scope_today: {organs: [{name, does, units}], links: [{from, to, what}]}
export function scopeToday(plan) {
  const s = plan.scope_today || {};
  const organs = Array.isArray(s.organs) ? s.organs : [];
  const links = Array.isArray(s.links) ? s.links : [];
  const units = new Set((Array.isArray(plan.bindings && plan.bindings.units) ? plan.bindings.units : []).map((u) => u && u.id).filter(Boolean));
  const reached = new Set(organs.flatMap((o) => (Array.isArray(o.units) ? o.units : [])).filter((u) => units.has(u)));
  return { organs: organs.length, links: links.length, reach: units.size ? reached.size / units.size : 0 };
}
export function scopeLevel(graph, atlas) {
  const th = (atlas.scope && atlas.scope.thresholds) || {};
  let level = 0;
  for (let l = 1; l <= 10; l++) { if (th[String(l)] && graphMeets(graph, th[String(l)])) level = l; else break; }
  return level;
}

const halfLevel = (vals) => { if (!vals.length) return null; const s = [...vals].sort((a, b) => a - b); return Math.min(s[Math.floor((s.length - 1) / 2)], s[0] + 2); };
// product, subject, scope and the lab's level: the lowest of the three
export function threeLevels(plan, atlas) {
  const na = plan.na || {};
  const of = (kind) => atlas.axes.filter((a) => a.kind === kind && !na[a.id]).map((a) => { const g = plan.grade && plan.grade[a.id]; return g && Number.isInteger(g.level) ? g.level : 0; });
  const product = halfLevel(of('product')), subject = halfLevel(of('subject'));
  const graph = scopeToday(plan);
  const scope = atlas.scope ? scopeLevel(graph, atlas) : null;
  const parts = [product, subject, scope].filter((x) => x != null);
  return { product, subject, scope, graph, level: parts.length ? Math.min(...parts) : null };
}

function checkPlanScope(plan, atlas) {
  const errs = [];
  const lab = plan.lab;
  const sc = atlas.scope;
  if (!sc) return errs;
  const s = plan.scope_today;
  if (!s || !Array.isArray(s.organs) || !Array.isArray(s.links)) return [`${lab}: scope_today lists the organs and links the lab has now`];
  const unitIds = new Set((Array.isArray(plan.bindings && plan.bindings.units) ? plan.bindings.units : []).map((u) => u && u.id).filter(Boolean));
  const names = new Set();
  for (const o of s.organs) {
    if (!long(o && o.name, 3) || !long(o && o.does, 30)) errs.push(`${lab}: scope_today organ "${(o && o.name) || '?'}" needs a name and what it does (30+ characters)`);
    if (o && names.has(text(o.name))) errs.push(`${lab}: scope_today organ "${o.name}" is listed twice`);
    if (o) names.add(text(o.name));
    for (const u of (o && o.units) || []) if (!unitIds.has(u)) errs.push(`${lab}: scope_today organ "${o.name}" names unit ${u}, which is not in the bindings`);
  }
  for (const k of s.links) if (!(k && names.has(text(k.from)) && names.has(text(k.to)) && long(k.what, 20))) errs.push(`${lab}: scope_today link ${k && k.from} -> ${k && k.to} must join two listed organs and say what is read`);
  if (!long(s.evidence, 40)) errs.push(`${lab}: scope_today.evidence says where in the code the organs and links were counted`);
  // the story's graph at each level
  const ev = plan.evolution || {};
  let prev = null;
  for (let l = 1; l <= 10; l++) {
    const L = ev.levels && ev.levels[String(l)];
    const t = sc.thresholds && sc.thresholds[String(l)];
    if (!L || !t) continue;
    const g = L.graph;
    const at = `${lab}: level ${l}`;
    if (!g || !Array.isArray(g.organs) || !Array.isArray(g.links) || typeof g.reach !== 'number') { errs.push(`${at}: graph lists the organs, the links ("A -> B") and the reach the lab has at this level`); prev = null; continue; }
    const organs = new Set(g.organs.map(text));
    if (organs.size !== g.organs.length) errs.push(`${at}: an organ is listed twice`);
    for (const k of g.links) { const m = /^(.+?) -> (.+)$/.exec(text(k)); if (!m || !organs.has(m[1].trim()) || !organs.has(m[2].trim())) errs.push(`${at}: link "${k}" must join two organs of this level as "A -> B"`); }
    if (!graphMeets({ organs: organs.size, links: g.links.length, reach: g.reach }, t)) errs.push(`${at}: the graph (${organs.size} organs, ${g.links.length} links, reach ${g.reach}) is smaller than this level asks (${t.organs}, ${t.links}, ${t.reach})`);
    if (prev) {
      for (const o of prev.organs) if (!organs.has(o)) errs.push(`${at}: organ "${o}" of level ${l - 1} is gone; a level keeps what the level below built`);
      if (organs.size <= prev.organs.size && g.links.length <= prev.links) errs.push(`${at}: the graph did not grow from level ${l - 1}`);
    }
    prev = { organs, links: g.links.length };
  }
  return errs;
}

/* ---------------- 2. a lab's plan ---------------- */
export function checkPlanEvolution(plan, atlas, siblings = []) {
  const ev = plan.evolution;
  const lab = plan.lab;
  if (!ev) return [`${lab}: plan has no evolution block`];
  const errs = [];
  const na = plan.na || {};
  const axes = atlas.axes.filter((a) => !na[a.id]);
  const generic = new Set(Object.values((atlas.evolution && atlas.evolution.levels) || {}).map((L) => text(L.name).toLowerCase()));
  const names = new Set();
  // The story goes through every level, 1 to 10: what the lab is there and what that entails. Levels 1 to 5 are told
  // axis by axis, because the tickets build them; levels 6 to 10 say what they entail and what takes the lab up.
  for (let l = 1; l <= 10; l++) {
    const L = ev.levels && ev.levels[String(l)];
    const at = `${lab}: level ${l}`;
    if (!L) { errs.push(`${at} is missing; the story goes through every level`); continue; }
    const nm = text(L.name).toLowerCase();
    if (!nm) errs.push(`${at}: no name`);
    if (generic.has(nm)) errs.push(`${at}: "${L.name}" is the atlas's generic name; name the level in this lab's own terms`);
    if (names.has(nm)) errs.push(`${at}: the name "${L.name}" is used twice`);
    names.add(nm);
    if (!long(L.portrait, MIN.labPortrait)) errs.push(`${at}: the portrait says what this lab is at this level in ${MIN.labPortrait}+ characters`);
    if (!long(L.shift, MIN.labShift)) errs.push(`${at}: the shift says what changed in kind from the level below in ${MIN.labShift}+ characters`);
    if (!(Array.isArray(L.visitor_can) && L.visitor_can.filter((x) => long(x, 20)).length >= LIMIT.visitorCan)) errs.push(`${at}: visitor_can lists at least ${LIMIT.visitorCan} things a visitor can now do`);
    if (!(Array.isArray(L.entails) && L.entails.filter((x) => long(x, 20)).length >= 3)) errs.push(`${at}: entails lists at least 3 things that must exist for the lab to be at this level`);
    const cp = L.checkpoint || {};
    if (l <= TARGET) {
      for (const a of axes) if (!long(L.axes && L.axes[a.id], MIN.axisLine)) errs.push(`${at}: no line for axis ${a.id} (what it is here at this level, ${MIN.axisLine}+ characters)`);
    }
    if (l < TARGET && !long(cp.why_not_5, MIN.labShift)) errs.push(`${at}: the checkpoint says why this is not level 5 yet (why_not_5)`);
    if (l < 10 && !long(cp.takes_it_up, MIN.labShift)) errs.push(`${at}: the checkpoint says what takes it to level ${l + 1} (takes_it_up)`);
    if (l === 10 && !long(cp.keeps_it, MIN.labShift)) errs.push(`${at}: the checkpoint says what keeps it at level 10 (keeps_it)`);
  }
  // an axis line must change from level to level: growth, not a repeated sentence
  for (const a of axes) {
    const lines = [];
    for (let l = 1; l <= TARGET; l++) lines.push(text(ev.levels && ev.levels[String(l)] && ev.levels[String(l)].axes && ev.levels[String(l)].axes[a.id]));
    for (let i = 1; i < lines.length; i++) if (lines[i] && lines.slice(0, i).includes(lines[i])) errs.push(`${lab}: axis ${a.id} has the same line at two levels; say how it grew`);
  }
  for (const a of axes.filter((x) => x.kind === 'product')) {
    const g = ev.analogy && ev.analogy[a.id];
    if (!g) { errs.push(`${lab}: no analogy for product axis ${a.id}`); continue; }
    for (const k of ['claude_prep', 'here', 'holds_because', 'breaks_where']) if (!long(g[k], MIN.analogy)) errs.push(`${lab}: analogy.${a.id}.${k} is missing or under ${MIN.analogy} characters`);
  }
  const { errs: cErrs, edges } = checkCouplings(ev.couplings, atlas, lab, TARGET, MIN.labWhy);
  errs.push(...cErrs);
  for (const e of edges) if (na[e.from.axis] || na[e.to.axis]) errs.push(`${lab}: a coupling uses axis ${na[e.from.axis] ? e.from.axis : e.to.axis}, which this lab marks not applicable`);
  if (edges.length < LIMIT.labCouplings) errs.push(`${lab}: ${edges.length} couplings of its own; at least ${LIMIT.labCouplings}`);
  if (edges.filter((e) => e.cross).length < LIMIT.labCross) errs.push(`${lab}: fewer than ${LIMIT.labCross} couplings join its subject and its product half`);
  const id = ev.identity || {};
  if (!long(id.signature, MIN.signature)) errs.push(`${lab}: identity.signature is the one move that is this lab's alone, in ${MIN.signature}+ characters`);
  for (const k of STYLE) if (!long(id.style && id.style[k], MIN.style)) errs.push(`${lab}: identity.style.${k} is missing`);
  for (const s of siblings) if (!long(id.differs_from && id.differs_from[s], MIN.differs)) errs.push(`${lab}: identity.differs_from.${s} says how it is unlike that lab of its world, in ${MIN.differs}+ characters`);
  errs.push(...checkPlanScope(plan, atlas));
  return errs;
}

/* ---------------- 3. the tickets ---------------- */
function clauseIndex(atlas) {
  const idx = new Map();
  for (const a of atlas.axes) (a.rungs || []).forEach((r, rung) => { for (const c of (r && r.clauses) || []) idx.set(c.id, { axis: a.id, rung }); });
  return idx;
}
const nodeKey = (n) => `${n.axis}.${n.rung}`;

// every coupling that applies to this lab: the atlas's and its own
function couplingsFor(plan, atlas) {
  const all = [...((atlas.evolution && atlas.evolution.couplings) || []), ...((plan.evolution && plan.evolution.couplings) || [])];
  const na = plan.na || {};
  const out = new Map();
  for (const c of all) {
    const f = parseNode(c.from), t = parseNode(c.to);
    if (!f || !t || f.rung > TARGET || t.rung > TARGET || na[f.axis] || na[t.axis]) continue;
    out.set(`${nodeKey(f)}>${nodeKey(t)}`, { from: f, to: t });
  }
  return [...out.values()];
}

function buildersOf(stories, idx) {
  const by = new Map();
  for (const s of stories) for (const c of s.clauses || []) {
    const hit = idx.get(c);
    if (!hit) continue;
    const k = nodeKey(hit);
    if (!by.has(k)) by.set(k, new Map());
    by.get(k).set(s.id, (by.get(k).get(s.id) || 0) + 1);
  }
  return by;
}

function reaches(stories) {
  const dep = new Map(stories.map((s) => [s.id, (s.depends_on || []).filter((d) => stories.some((x) => x.id === d))]));
  const memo = new Map();
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id);
    const set = new Set();
    memo.set(id, set);
    for (const d of dep.get(id) || []) { set.add(d); for (const x of walk(d)) set.add(x); }
    return set;
  };
  return walk;
}

// couplings whose tickets do not carry them
export function missingLinks(plan, stories, atlas) {
  const idx = clauseIndex(atlas);
  const by = buildersOf(stories, idx);
  const walk = reaches(stories);
  const out = [];
  for (const c of couplingsFor(plan, atlas)) {
    const A = by.get(nodeKey(c.from)), B = by.get(nodeKey(c.to));
    if (!A || !B) continue;   // one end is already met: nothing to order
    for (const sb of B.keys()) {
      if (A.has(sb)) continue;   // one story builds both ends
      const up = walk(sb);
      if (![...A.keys()].some((sa) => up.has(sa))) out.push({ story: sb, needs: nodeKey(c.from), for: nodeKey(c.to), candidates: [...A.entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0]) });
    }
  }
  return out;
}

// add the missing dependencies; a link that would close a cycle is left out and reported
export function weave(plan, stories, atlas) {
  const out = stories.map((s) => ({ ...s, depends_on: [...(s.depends_on || [])] }));
  const skipped = [];
  let added = 0;
  for (let pass = 0; pass < 50; pass++) {
    const miss = missingLinks(plan, out, atlas);
    if (!miss.length) break;
    let progress = false;
    for (const m of miss) {
      const s = out.find((x) => x.id === m.story);
      const walk = reaches(out);
      if (m.candidates.some((c) => walk(s.id).has(c))) continue;   // an earlier link in this pass covered it
      const pick = m.candidates.find((c) => !walk(c).has(s.id));
      if (!pick) { if (!skipped.some((k) => k.story === m.story && k.needs === m.needs)) skipped.push(m); continue; }
      s.depends_on.push(pick); added++; progress = true;
    }
    if (!progress) break;
  }
  return { stories: out, added, skipped };
}

/* ---------------- uniqueness ---------------- */
const STOP = new Set('the a an of to in on and or is are was be it its this that for with as at by from which each every one two not no can than then so their they what when where how'.split(' '));
function shingles(s, n = 3) {
  const w = text(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x && !STOP.has(x));
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}
export function similarity(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}
function portraitText(plan) {
  const ev = plan.evolution || {};
  const parts = [];
  for (let l = 1; l <= 10; l++) { const L = (ev.levels || {})[String(l)] || {}; parts.push(L.portrait, L.shift, ...(L.visitor_can || []), ...(L.entails || []), ...Object.values(L.axes || {})); }
  parts.push((ev.identity || {}).signature, ...Object.values((ev.identity || {}).style || {}));
  return parts.filter(Boolean).join(' ');
}
const notesText = (plan) => Object.values(plan.binding_notes || {}).map((n) => n && n.on_this_lab).filter(Boolean).join(' ');

export function tooAlike(plans) {
  const out = [];
  for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
    const p = similarity(portraitText(plans[i]), portraitText(plans[j]));
    const n = similarity(notesText(plans[i]), notesText(plans[j]));
    out.push({ a: plans[i].lab, b: plans[j].lab, portraits: p, notes: n });
  }
  return out;
}

/* ---------------- commands ---------------- */
function loadPlans() {
  if (!fs.existsSync(PLANS)) return null;
  return fs.readdirSync(PLANS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name).filter((n) => fs.existsSync(path.join(PLANS, n, 'plan.json')))
    .map((n) => ({ dir: n, plan: readJSON(path.join(PLANS, n, 'plan.json')), stories: fs.existsSync(path.join(PLANS, n, 'stories.json')) ? readJSON(path.join(PLANS, n, 'stories.json')) : [] }));
}

function check(only) {
  if (!fs.existsSync(ATLAS)) { console.log('NOT_CHECKED: labs/levels/atlas.json does not exist'); return; }
  const atlas = readJSON(ATLAS);
  if (!atlas.evolution) { console.log('NOT_CHECKED: the atlas has no evolution block yet'); return; }
  const errs = [...checkAtlasEvolution(atlas), ...checkAtlasScope(atlas)];
  const all = loadPlans();
  let labs = 0, woven = 0;
  if (!all) console.log('NOT_CHECKED: the lab plans are private and absent here');
  else {
    for (const p of all.filter((x) => !only || x.dir === only)) {
      if (!p.plan.evolution) { errs.push(`${p.dir}: plan has no evolution block`); continue; }
      labs++;
      const siblings = all.filter((x) => x.dir !== p.dir && x.plan.world === p.plan.world).map((x) => x.dir);
      errs.push(...checkPlanEvolution(p.plan, atlas, siblings));
      const miss = missingLinks(p.plan, p.stories, atlas);
      if (miss.length) errs.push(`${p.dir}: ${miss.length} stor${miss.length === 1 ? 'y builds' : 'ies build'} a rung without depending on the stories for the rung it stands on (run: node tools/evolution.mjs weave ${p.dir}); first: ${miss.slice(0, 3).map((m) => `${m.story} builds ${m.for}, needs ${m.needs}`).join('; ')}`);
      else woven++;
    }
    if (!only) {
      const withEv = all.filter((x) => x.plan.evolution).map((x) => x.plan);
      for (const t of tooAlike(withEv)) {
        if (t.portraits > LIMIT.portraitSimilarity) errs.push(`${t.a} and ${t.b}: their level portraits share ${(t.portraits * 100).toFixed(0)}% of their phrases (limit ${LIMIT.portraitSimilarity * 100}%); two labs are not one lab with the nouns changed`);
        if (t.notes > LIMIT.notesSimilarity) errs.push(`${t.a} and ${t.b}: their binding notes share ${(t.notes * 100).toFixed(0)}% of their phrases (limit ${LIMIT.notesSimilarity * 100}%)`);
      }
    }
  }
  if (errs.length) { console.log(`evolution: ${errs.length} problem(s)`); for (const e of errs.slice(0, 150)) console.log('  ' + e); process.exit(1); }
  console.log(`evolution: the atlas names 10 levels and ${atlas.evolution.couplings.length} couplings${all ? `; ${labs} plan(s) describe their own levels, analogy and couplings, and ${woven} carry them in their tickets` : ''}`);
}

function weaveCmd(lab) {
  if (!lab) { console.log('weave needs a lab'); process.exit(2); }
  const atlas = readJSON(ATLAS);
  const dir = path.join(PLANS, lab);
  const plan = readJSON(path.join(dir, 'plan.json'));
  const sf = path.join(dir, 'stories.json');
  const r = weave(plan, readJSON(sf), atlas);
  fs.writeFileSync(sf, JSON.stringify(r.stories, null, 1) + '\n');
  console.log(`${lab}: ${r.added} dependencies added${r.skipped.length ? `; ${r.skipped.length} left out because they would close a cycle: ${r.skipped.slice(0, 5).map((m) => `${m.story} needs ${m.needs}`).join('; ')}` : ''}`);
  process.exit(r.skipped.length ? 1 : 0);
}

// every lab's three levels and its graph today
function levelsCmd() {
  const atlas = readJSON(ATLAS);
  const all = loadPlans() || [];
  const order = ['cosmos', 'contact', 'machine', 'claims', 'self', 'signals', 'workshop', 'hub'];
  const rows = all.map((x) => ({ lab: x.dir, world: x.plan.world, ...threeLevels(x.plan, atlas) }))
    .sort((a, b) => order.indexOf(a.world) - order.indexOf(b.world) || (b.level ?? -1) - (a.level ?? -1) || a.lab.localeCompare(b.lab));
  let w = '';
  for (const r of rows) {
    if (r.world !== w) { w = r.world; console.log(`\n${String(w).toUpperCase()}`); }
    const g = r.graph;
    console.log(`  ${r.lab.padEnd(17)} level ${r.level ?? '-'}   product ${r.product}  subject ${r.subject}  scope ${r.scope ?? '-'}   graph: ${g.organs} organs, ${g.links} links, reach ${(g.reach * 100).toFixed(0)}%`);
  }
  const by = {};
  for (const r of rows) by[r.level] = (by[r.level] || 0) + 1;
  console.log(`\nlabs by level: ${JSON.stringify(by)}`);
}

function uniqueCmd() {
  const all = (loadPlans() || []).map((x) => x.plan);
  const rows = tooAlike(all);
  const top = (k) => rows.slice().sort((x, y) => y[k] - x[k]).slice(0, 12);
  console.log('most alike by binding notes:'); for (const t of top('notes')) console.log(`  ${(t.notes * 100).toFixed(1).padStart(5)}%  ${t.a} / ${t.b}`);
  console.log('most alike by level portraits:'); for (const t of top('portraits')) console.log(`  ${(t.portraits * 100).toFixed(1).padStart(5)}%  ${t.a} / ${t.b}`);
}

function selftest() {
  const rung = (axis, r, n) => ({ text: 't', clauses: Array.from({ length: n }, (_, i) => ({ id: `${axis}.${r}.${i + 1}`, text: 'c' })) });
  const mk = (id, kind) => ({ id, kind, rungs: Array.from({ length: 11 }, (_, r) => rung(id, r, 1)) });
  const atlasAxes = [mk('records', 'product'), mk('evidence', 'product'), mk('fidelity', 'subject')];
  const W = 'because the second cannot be computed until the first exists on the page';
  const P = 'p'.repeat(260), S = 's'.repeat(110);
  const levels = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { name: `Stage ${i + 1}`, portrait: P, shift: S, checkpoint: S }]));
  const full = [];
  const ids = atlasAxes.map((a) => a.id);
  for (let r = 1; r <= 5; r++) for (let i = 0; i < ids.length; i++) full.push({ from: `${ids[i]}.${r}`, to: `${ids[(i + 1) % ids.length]}.${Math.min(5, r + 1)}`, why: W });
  const dedup = [...new Map(full.map((c) => [`${c.from}>${c.to}`, c])).values()].filter((c) => !(c.from.endsWith('.5') && c.to.endsWith('.5')));
  const extra = [];
  for (let r = 1; r <= 5; r++) { extra.push({ from: `fidelity.${r}`, to: `records.${r === 5 ? 5 : r + 1}`, why: W }); }
  const couplings = [...new Map([...dedup, ...extra].map((c) => [`${c.from}>${c.to}`, c])).values()].filter((c) => c.from.split('.')[0] !== c.to.split('.')[0] && !(c.from.endsWith('.5') && c.to.endsWith('.5')));
  const ev = { principle: 'x'.repeat(130), analogy_rule: 'y'.repeat(130), levels, couplings, roots: {} };
  const atlas = { axes: atlasAxes, evolution: ev };
  const aErrs = checkAtlasEvolution(atlas);
  const onlyCross = aErrs.every((e) => e.includes('join a subject axis'));
  const labLevels = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => [String(l), {
    name: `The plate at ${l}`, portrait: P, shift: S, visitor_can: ['open one catalogued world and read it', 'ask their own question of it', 'keep what they found today'],
    entails: ['a computed value shown with its source', 'a record of what the visitor did here', 'a view that answers the visitor question'],
    ...(l <= 5 ? { axes: Object.fromEntries(ids.map((a) => [a, `at level ${l} the ${a} of this lab is a different thing than before it`])) } : {}),
    checkpoint: l < 5 ? { why_not_5: S, takes_it_up: S } : l < 10 ? { takes_it_up: S } : { keeps_it: S },
  }]));
  const LW = 'because on this lab the second is computed from the first and cannot exist before it does';
  const labCouplings = [];
  for (let r = 1; r <= 4; r++) { labCouplings.push({ from: `fidelity.${r}`, to: `evidence.${r + 1}`, why: LW }, { from: `records.${r}`, to: `fidelity.${r + 1}`, why: LW }, { from: `evidence.${r}`, to: `records.${r + 1}`, why: LW }); }
  const an = { claude_prep: 'a'.repeat(45), here: 'b'.repeat(45), holds_because: 'c'.repeat(45), breaks_where: 'd'.repeat(45) };
  const plan = { lab: 'x', world: 'cosmos', evolution: { levels: labLevels, analogy: { records: an, evidence: an }, couplings: labCouplings,
    identity: { signature: 'g'.repeat(70), style: Object.fromEntries(STYLE.map((k) => [k, 'a drawn line that means one thing'])), differs_from: { y: 'h'.repeat(70) } } } };
  const story = (id, clauses, deps = []) => ({ id, clauses, depends_on: deps });
  const st = [story('a', ['records.2.1']), story('b', ['fidelity.3.1']), story('c', ['evidence.4.1'])];
  const mini = { axes: atlasAxes, evolution: { couplings: [{ from: 'records.2', to: 'fidelity.3', why: W }, { from: 'fidelity.3', to: 'evidence.4', why: W }] } };
  const bare = { lab: 'x', evolution: { couplings: [] } };
  const w = weave(bare, st, mini);
  const cyc = weave(bare, [story('a', ['records.2.1'], ['b']), story('b', ['fidelity.3.1'])], mini);
  const pe = (patch) => checkPlanEvolution({ ...plan, evolution: { ...plan.evolution, ...patch } }, atlas, ['y']);
  // scope fixtures
  const D = 'd'.repeat(90);
  const thresholds = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { organs: i + 1, links: i, reach: Math.min(1, (i + 1) / 5), says: 'the graph at this level has this many working parts and links between them' }]));
  const scope = { principle: D, organ: D, link: D, reach: D, rule: D, claude_prep: { organs: 28, links: 60, how_counted: D }, thresholds };
  const atlasS = { ...atlas, scope };
  const organNames = Array.from({ length: 10 }, (_, i) => `organ ${i + 1}`);
  const graphAt = (l) => ({ organs: organNames.slice(0, l), links: Array.from({ length: l - 1 }, (_, i) => `organ ${i + 1} -> organ ${i + 2}`), reach: Math.min(1, l / 5) });
  const levelsG = Object.fromEntries(Object.entries(labLevels).map(([k, v]) => [k, { ...v, graph: graphAt(Number(k)) }]));
  const units = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }, { id: 'u5' }];
  const today = { organs: [{ name: 'bench', does: 'measures the arrival time of every token of a reply', units: ['u1'] }], links: [], evidence: 'counted from the three plates of the page and main.js' };
  const planS = { ...plan, bindings: { units }, scope_today: today, grade: { records: { level: 1 }, evidence: { level: 1 }, fidelity: { level: 3 } }, evolution: { ...plan.evolution, levels: levelsG } };
  const ps = (patch) => checkPlanEvolution({ ...planS, ...patch }, atlasS, ['y']);
  const lv = (l, g) => ({ evolution: { ...planS.evolution, levels: { ...levelsG, [l]: { ...levelsG[l], graph: g } } } });
  const cases = [
    ['an atlas evolution block with levels and couplings passes all but the cross count', aErrs.length === 0 || onlyCross],
    ['a missing level fails', checkAtlasEvolution({ ...atlas, evolution: { ...ev, levels: { ...levels, 7: undefined } } }).some((e) => e.includes('levels.7'))],
    ['a level name used twice fails', checkAtlasEvolution({ ...atlas, evolution: { ...ev, levels: { ...levels, 2: { ...levels[2], name: 'Stage 1' } } } }).some((e) => e.includes('used twice'))],
    ['a short shift fails', checkAtlasEvolution({ ...atlas, evolution: { ...ev, levels: { ...levels, 3: { ...levels[3], shift: 'more features' } } } }).some((e) => e.includes('level 3') && e.includes('shift'))],
    ['a rung no other axis supports fails unless it is a root', checkAtlasEvolution({ ...atlas, evolution: { ...ev, couplings: couplings.filter((c) => c.to !== 'evidence.3') } }).some((e) => e.startsWith('evidence.3'))],
    ['a declared root passes', !checkAtlasEvolution({ ...atlas, evolution: { ...ev, couplings: couplings.filter((c) => c.to !== 'evidence.3'), roots: { 'evidence.3': 'this rung only restates what the axis already holds at rung two' } } }).some((e) => e.startsWith('evidence.3'))],
    ['a coupling inside one axis fails', checkCouplings([{ from: 'records.2', to: 'records.3', why: W }], atlas, 't', 10, 40).errs.some((e) => e.includes('two different axes'))],
    ['a rung standing on a higher rung fails', checkCouplings([{ from: 'records.4', to: 'evidence.2', why: W }], atlas, 't', 10, 40).errs.some((e) => e.includes('at or below'))],
    ['a coupling without a reason fails', checkCouplings([{ from: 'records.2', to: 'evidence.2', why: 'yes' }], atlas, 't', 10, 40).errs.some((e) => e.includes('says why'))],
    ['a cycle among one rung fails', checkCouplings([{ from: 'records.2', to: 'evidence.2', why: W }, { from: 'evidence.2', to: 'records.2', why: W }], atlas, 't', 10, 40).errs.some((e) => e.includes('cycle'))],
    ['an unknown axis fails', checkCouplings([{ from: 'nope.2', to: 'evidence.2', why: W }], atlas, 't', 10, 40).errs.some((e) => e.includes('unknown axis'))],
    ['a complete plan evolution passes', checkPlanEvolution(plan, atlas, ['y']).length === 0],
    ['a plan without the block fails', checkPlanEvolution({ lab: 'x' }, atlas).length === 1],
    ['a level named with the atlas generic name fails', pe({ levels: { ...labLevels, 2: { ...labLevels[2], name: 'Stage 2' } } }).some((e) => e.includes('generic name'))],
    ['a level without a checkpoint fails', pe({ levels: { ...labLevels, 3: { ...labLevels[3], checkpoint: {} } } }).some((e) => e.includes('why_not_5'))],
    ['level 5 says what takes it to 6', pe({ levels: { ...labLevels, 5: { ...labLevels[5], checkpoint: { why_not_5: S } } } }).some((e) => e.includes('level 5') && e.includes('takes_it_up'))],
    ['the story goes through every level: a missing level 8 fails', pe({ levels: { ...labLevels, 8: undefined } }).some((e) => e.includes('level 8 is missing'))],
    ['a level without what it entails fails', pe({ levels: { ...labLevels, 7: { ...labLevels[7], entails: ['more'] } } }).some((e) => e.includes('level 7') && e.includes('entails'))],
    ['level 10 says what keeps it there', pe({ levels: { ...labLevels, 10: { ...labLevels[10], checkpoint: {} } } }).some((e) => e.includes('keeps_it'))],
    ['levels 6 to 10 need no axis lines', pe({}).every((e) => !/level (6|7|8|9|10): no line/.test(e))],
    ['an axis line repeated at two levels fails', pe({ levels: { ...labLevels, 4: { ...labLevels[4], axes: { ...labLevels[4].axes, records: labLevels[3].axes.records } } } }).some((e) => e.includes('same line'))],
    ['a missing axis line fails', pe({ levels: { ...labLevels, 2: { ...labLevels[2], axes: { records: labLevels[2].axes.records } } } }).some((e) => e.includes('no line for axis'))],
    ['too few things a visitor can do fails', pe({ levels: { ...labLevels, 1: { ...labLevels[1], visitor_can: ['look'] } } }).some((e) => e.includes('visitor_can'))],
    ['an analogy without where it breaks fails', pe({ analogy: { records: { ...an, breaks_where: '' }, evidence: an } }).some((e) => e.includes('breaks_where'))],
    ['too few couplings of its own fail', pe({ couplings: labCouplings.slice(0, 4) }).some((e) => e.includes('couplings of its own'))],
    ['an identity that does not say how it differs from a sibling fails', pe({ identity: { ...plan.evolution.identity, differs_from: {} } }).some((e) => e.includes('differs_from.y'))],
    ['a missing style axis fails', pe({ identity: { ...plan.evolution.identity, style: { geometry: 'rings drawn as exact arcs here' } } }).some((e) => e.includes('style.texture'))],
    ['a not-applicable axis needs no line and no analogy', checkPlanEvolution({ ...plan, na: { evidence: 'this lab asks no question that has a right answer' }, evolution: { ...plan.evolution, couplings: [] } }, atlas, ['y']).every((e) => !e.includes('axis evidence') && !e.includes('analogy.evidence'))],
    ['tickets that ignore a coupling are found', missingLinks(bare, st, mini).length === 2],
    ['weave adds the dependencies', w.added === 2 && w.stories.find((s) => s.id === 'b').depends_on.includes('a') && w.stories.find((s) => s.id === 'c').depends_on.includes('b') && missingLinks(bare, w.stories, mini).length === 0],
    ['a dependency through another story counts', missingLinks(bare, [story('a', ['records.2.1']), story('m', ['records.9.1'], ['a']), story('b', ['fidelity.3.1'], ['m'])], { axes: atlasAxes, evolution: { couplings: [{ from: 'records.2', to: 'fidelity.3', why: W }] } }).length === 0],
    ['a story that builds both ends needs no link', missingLinks(bare, [story('a', ['records.2.1', 'fidelity.3.1'])], { axes: atlasAxes, evolution: { couplings: [{ from: 'records.2', to: 'fidelity.3', why: W }] } }).length === 0],
    ['an end already met needs no link', missingLinks(bare, [story('b', ['fidelity.3.1'])], mini).length === 0],
    ['weave never closes a cycle', cyc.skipped.length === 1 && !cyc.stories.find((s) => s.id === 'b').depends_on.includes('a')],
    ['a not-applicable axis drops its couplings from the tickets', missingLinks({ lab: 'x', na: { records: 'this lab keeps nothing between visits by design' }, evolution: { couplings: [] } }, st, mini).length === 1],
    ['the same text is fully alike', similarity('the visitor places a probe on the innermost stable orbit and reads its period', 'the visitor places a probe on the innermost stable orbit and reads its period') === 1],
    ['different texts are not alike', similarity('the visitor places a probe on the innermost stable orbit and reads its period', 'a claim is struck through in pencil and its weakest part is marked in the margin') === 0],
    ['a complete scope block passes', checkAtlasScope(atlasS).length === 0],
    ['an atlas without scope fails', checkAtlasScope(atlas).length === 1],
    ['a scope level that does not grow fails', checkAtlasScope({ ...atlas, scope: { ...scope, thresholds: { ...thresholds, 4: { ...thresholds[4], organs: 3 } } } }).some((e) => e.includes('level 4') && e.includes('larger'))],
    ['a level 5 above the anchor fails', checkAtlasScope({ ...atlas, scope: { ...scope, claude_prep: { ...scope.claude_prep, organs: 4 } } }).some((e) => e.includes('more than Claude Prep'))],
    ['one organ on one unit is scope level 1', scopeLevel(scopeToday(planS), atlasS) === 1],
    ['three linked organs on three of five units are scope level 3', scopeLevel({ organs: 3, links: 2, reach: 0.6 }, atlasS) === 3],
    ['many organs with no links stay low: breadth needs connection', scopeLevel({ organs: 9, links: 0, reach: 1 }, atlasS) === 1],
    ['the lab level is the lowest of product, subject and scope', (() => { const r = threeLevels({ ...planS, grade: { records: { level: 4 }, evidence: { level: 4 }, fidelity: { level: 3 } } }, atlasS); return r.product === 4 && r.subject === 3 && r.scope === 1 && r.level === 1; })()],
    ['a plan with its graph at every level passes', ps({}).length === 0],
    ['a plan without today\'s graph fails', ps({ scope_today: undefined }).some((e) => e.includes('scope_today'))],
    ['an organ naming an unknown unit fails', ps({ scope_today: { ...today, organs: [{ ...today.organs[0], units: ['u9'] }] } }).some((e) => e.includes('u9'))],
    ['a link between organs that are not listed fails', ps({ scope_today: { ...today, links: [{ from: 'bench', to: 'ghost', what: 'reads the last run it saved' }] } }).some((e) => e.includes('ghost'))],
    ['a level whose graph is smaller than the level asks fails', ps(lv(4, graphAt(2))).some((e) => e.includes('level 4') && e.includes('smaller'))],
    ['a level that drops an organ of the level below fails', ps(lv(3, { organs: ['organ 1', 'organ 2', 'other part'], links: ['organ 1 -> organ 2', 'organ 2 -> other part'], reach: 0.6 })).some((e) => e.includes('level 4') && e.includes('is gone'))],
    ['a level with no graph fails', ps(lv(6, undefined)).some((e) => e.includes('level 6') && e.includes('graph'))],
    ['a link written without two organs of the level fails', ps(lv(2, { organs: ['organ 1', 'organ 2'], links: ['organ 1 -> nowhere'], reach: 0.4 })).some((e) => e.includes('level 2') && e.includes('must join'))],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`evolution selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const [cmd = 'check', arg] = process.argv.slice(2);
if (cmd === 'check') check(arg);
else if (cmd === 'weave') weaveCmd(arg);
else if (cmd === 'unique') uniqueCmd();
else if (cmd === 'levels') levelsCmd();
else if (cmd === 'selftest') selftest();
else { console.log('usage: node tools/evolution.mjs [check [<lab>] | weave <lab> | unique | levels | selftest]'); process.exit(2); }
