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
// usage: node tools/evolution.mjs [check [<lab>] | weave <lab> | unique | levels | selftest]
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
  // Luis, 2026-11-13: "things pop up as you go up the levels. That's the key."
  if (!long(ev.emergence, 200)) errs.push('evolution.emergence says what makes a level: something appears that the level below made possible and did not contain (200+ characters)');
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
    // how the graph holds together: steering links, a loop of them, organs per unit, readers of the instrument
    for (const k of ['joined', 'cycle']) if (t[k] != null && typeof t[k] !== 'boolean') errs.push(`scope level ${l}: ${k} is true or false`);
    if (t.steering != null && !(Number.isInteger(t.steering) && t.steering >= 0 && t.steering <= t.links)) errs.push(`scope level ${l}: steering is a whole number no larger than links`);
    if (t.organs_per_unit != null && !(Number.isInteger(t.organs_per_unit) && t.organs_per_unit >= 1 && t.organs_per_unit <= t.organs)) errs.push(`scope level ${l}: organs_per_unit is a whole number from 1 to the level's organs`);
    if (t.instrument_read_by != null && !(Number.isInteger(t.instrument_read_by) && t.instrument_read_by >= 0 && t.instrument_read_by < t.organs)) errs.push(`scope level ${l}: instrument_read_by is a whole number below the level's organs`);
    // The numbers below are the ones scope.rule and scope.reach state in words. The counting reads only the
    // thresholds, so a threshold that drops a clause would make the text and the count disagree in silence.
    if ((t.joined === true) !== (l >= 3)) errs.push(`scope level ${l}: scope.rule counts every organ at levels 1 and 2 and only the largest connected part from level 3, so joined is ${l >= 3}`);
    if (l >= 4 ? !(t.cycle === true && t.steering >= 2) : (t.cycle === true || t.steering > 0)) errs.push(`scope level ${l}: scope.rule asks for steering links and a directed loop of them from level 4, and for neither below it`);
    const readers = l >= 5 ? 2 : l === 4 ? 1 : 0;
    if (l < 4 ? (t.instrument_read_by || 0) !== 0 : (t.instrument_read_by || 0) < readers) errs.push(`scope level ${l}: scope.rule has no organ read the instrument below level 4, at least one at level 4 and at least two from level 5`);
    const per = l <= 2 ? 1 : l === 3 ? 2 : 3;
    if ((t.organs_per_unit || 1) !== per) errs.push(`scope level ${l}: scope.reach counts a unit when ${per} organ(s) work on it at this level, so organs_per_unit is ${per}`);
    if (prev) for (const k of ['steering', 'instrument_read_by']) if ((t[k] || 0) < (prev[k] || 0)) errs.push(`scope level ${l}: ${k} cannot fall below level ${l - 1}`);
    prev = t;
  }
  const t5 = sc.thresholds && sc.thresholds['5'];
  const joined = Number.isInteger(cp.joined) ? cp.joined : cp.organs;
  if (t5 && Number.isInteger(cp.organs) && (t5.organs > joined || t5.links > cp.links || (Number.isInteger(cp.steering) && (t5.steering || 0) > cp.steering))) errs.push('scope level 5 asks for more than Claude Prep measurably has; level 5 is the anchor');
  // the anchor's own graph, counted by the rule every lab is counted by
  const cg = cp.graph;
  if (!cg || !Array.isArray(cg.organs) || !Array.isArray(cg.links)) errs.push('scope.claude_prep.graph lists the anchor\'s organs and links, so its counts can be checked');
  else {
    if (cg.organs.some((o) => !text(o))) errs.push('scope.claude_prep.graph: an organ has no name');
    const listed = cg.organs.map(text).filter(Boolean);
    const names = new Set(listed);
    if (names.size !== listed.length) errs.push('scope.claude_prep.graph: an organ is listed twice');
    for (const k of cg.links) if (!(k && names.has(text(k.from)) && names.has(text(k.to)) && text(k.from) !== text(k.to))) errs.push(`scope.claude_prep.graph: link ${k && k.from} -> ${k && k.to} must join two different listed organs`);
    if (!names.has(text(cg.instrument))) errs.push('scope.claude_prep.graph.instrument names one of its organs');
    const g = graphOf(listed, cg.links, cg.instrument, cg.reach);
    const all = measure(g, {});
    const m5 = t5 ? measure(g, t5) : null;
    if (all.organs !== cp.organs || cg.organs.length !== cp.organs) errs.push(`scope.claude_prep: organs says ${cp.organs} and the graph lists ${cg.organs.length}`);
    if (all.links !== cp.links || cg.links.length !== cp.links) errs.push(`scope.claude_prep: links says ${cp.links} and the graph holds ${all.links} distinct links in ${cg.links.length} entries`);
    if (Number.isInteger(cp.steering) && all.steering !== cp.steering) errs.push(`scope.claude_prep: steering says ${cp.steering} and the graph holds ${all.steering}`);
    if (m5 && Number.isInteger(cp.joined) && m5.organs !== cp.joined) errs.push(`scope.claude_prep: joined says ${cp.joined} and the largest connected part holds ${m5.organs}`);
    const lvl = scopeLevel(g, atlas);
    if (lvl < 5) errs.push(`scope.claude_prep: by these thresholds the anchor's graph stands at scope level ${lvl}; level 5 is the anchor and must ask for no more than it has`);
    if (lvl > 5) errs.push(`scope.claude_prep: by these thresholds the anchor's graph stands at scope level ${lvl}; level 5 is the anchor, so level 6 must ask for more than it has`);
    // organ_of: which of the anchor's joined organs each product axis carries, each organ under one axis
    const kinds = new Map((atlas.axes || []).map((a) => [a.id, a.kind]));
    const owner = new Map();
    for (const [axis, organs] of Object.entries(sc.organ_of || {})) {
      if (kinds.get(axis) !== 'product') errs.push(`scope.organ_of.${axis}: only a product axis can be marked not applicable, so only a product axis carries organs here`);
      if (!Array.isArray(organs)) { errs.push(`scope.organ_of.${axis} is a list of the anchor's organs`); continue; }
      for (const o of organs.map(text)) {
        if (!names.has(o)) errs.push(`scope.organ_of.${axis}: "${o}" is not an organ of the anchor's graph`);
        else if (m5 && !m5.kept.has(o)) errs.push(`scope.organ_of.${axis}: "${o}" is outside the anchor's joined graph, so the level 5 floor never counted it`);
        if (owner.has(o)) errs.push(`scope.organ_of.${axis}: "${o}" is already carried by ${owner.get(o)}; an organ is subtracted once`);
        owner.set(o, axis);
      }
    }
  }
  return errs;
}

// A graph in the form the rule counts. names: the organs. links: {from, to, steers}, from the organ that WROTE to
// the organ that READS it. works: organ -> the units it works on. unitIds: the lab's declared units, or null when
// the reach is declared as a number (a level of a story, the anchor).
function graphOf(organs, links, instrument, reach) {
  return {
    names: [...new Set(organs.map(text).filter(Boolean))], works: new Map(),
    links: links.map((k) => ({ from: text(k && k.from), to: text(k && k.to), steers: !!(k && k.steers === true) })),
    instrument: text(instrument) || null, unitIds: null, reach: typeof reach === 'number' ? reach : 0,
  };
}

// today's graph of a lab, from plan.scope_today:
// {organs: [{name, does, units, instrument?}], links: [{from, to, what, steers?}], evidence}
export function scopeToday(plan) {
  const s = plan.scope_today || {};
  const organs = (Array.isArray(s.organs) ? s.organs : []).filter((o) => o && text(o.name));
  const g = graphOf(organs.map((o) => o.name), Array.isArray(s.links) ? s.links : [], null, 0);
  const flagged = organs.filter((o) => o.instrument === true).map((o) => text(o.name));
  g.instrument = flagged.length === 1 ? flagged[0] : null;
  g.works = new Map(organs.map((o) => [text(o.name), Array.isArray(o.units) ? o.units : []]));
  g.unitIds = new Set((Array.isArray(plan.bindings && plan.bindings.units) ? plan.bindings.units : []).map((u) => u && u.id).filter(Boolean));
  return g;
}

// Count a graph the way scope.rule reads, against one level's threshold t. Self-links are no links and a repeated
// ordered pair counts once. Where the level is joined, only the largest connected part counts (links read in either
// direction) with the links inside it, and the instrument must be in that part. A unit counts toward reach only when
// enough counted organs work on it. A graph given as plain numbers is taken as already counted.
export function measure(g, t = {}) {
  if (typeof g.organs === 'number') {
    return { organs: g.organs, links: g.links || 0, steering: g.steering || 0, cycle: g.cycle === true, readBy: g.read_by || 0, instrumentIn: g.instrument_in !== false, reach: g.reach || 0, kept: new Set(), all: { organs: g.organs, links: g.links || 0, steering: g.steering || 0 } };
  }
  const names = new Set(g.names);
  const pairs = new Map();
  for (const k of g.links) {
    if (!k.from || !k.to || k.from === k.to || !names.has(k.from) || !names.has(k.to)) continue;
    const key = `${k.from}\n${k.to}`;
    const had = pairs.get(key);
    pairs.set(key, { from: k.from, to: k.to, steers: !!(k.steers || (had && had.steers)) });
  }
  let keep = names, instrumentIn = true;
  if (t.joined === true) {
    const nb = new Map([...names].map((n) => [n, new Set()]));
    for (const k of pairs.values()) { nb.get(k.from).add(k.to); nb.get(k.to).add(k.from); }
    const seen = new Set(), parts = [];
    for (const n of names) {
      if (seen.has(n)) continue;
      const part = new Set([n]), stack = [n];
      seen.add(n);
      while (stack.length) for (const m of nb.get(stack.pop())) if (!seen.has(m)) { seen.add(m); part.add(m); stack.push(m); }
      parts.push(part);
    }
    parts.sort((a, b) => b.size - a.size || (b.has(g.instrument) ? 1 : 0) - (a.has(g.instrument) ? 1 : 0));
    keep = parts[0] || new Set();
    instrumentIn = !!g.instrument && keep.has(g.instrument);
  }
  const links = [...pairs.values()].filter((k) => keep.has(k.from) && keep.has(k.to));
  const steer = links.filter((k) => k.steers);
  const out = new Map();
  for (const k of steer) { if (!out.has(k.from)) out.set(k.from, []); out.get(k.from).push(k.to); }
  const state = new Map();
  let cycle = false;
  const walk = (n) => { state.set(n, 1); for (const m of out.get(n) || []) { if (state.get(m) === 1) cycle = true; else if (!state.has(m)) walk(m); } state.set(n, 2); };
  for (const n of out.keys()) if (!state.has(n)) walk(n);
  const readBy = g.instrument && keep.has(g.instrument) ? new Set(links.filter((k) => k.from === g.instrument).map((k) => k.to)).size : 0;
  let reach = g.reach || 0;
  if (g.unitIds) {
    const per = t.organs_per_unit || 1;
    let n = 0;
    for (const u of g.unitIds) { let c = 0; for (const o of keep) if ((g.works.get(o) || []).includes(u)) c++; if (c >= per) n++; }
    reach = g.unitIds.size ? n / g.unitIds.size : 0;
  }
  return { organs: keep.size, links: links.length, steering: steer.length, cycle, readBy, instrumentIn, reach, kept: keep, all: { organs: names.size, links: pairs.size, steering: [...pairs.values()].filter((k) => k.steers).length } };
}

// An axis a lab marks not applicable, read one way everywhere in this file: the axis has a stated reason of 20+
// characters, as tools/stories.mjs asks. A key with no reason marks nothing, and the axis is graded.
const marked = (na, axis) => typeof (na || {})[axis] === 'string' && na[axis].trim().length >= 20;

// At level 5 each product axis a lab marks not applicable lowers the organ floor by the organs that axis carries in
// the anchor's joined graph (scope.organ_of, each organ once) and the link floor by two for each, to no fewer than
// 4 organs and no fewer links than the level's steering links, which are links too. Above level 5 the steps the
// thresholds state are kept on top of that lowered floor, so the ladder still climbs. Below level 5 no level asks
// such a lab for more than its level 5 floor, or the relief could not be reached, and a level that asks for a
// link still asks for one.
function floorAt(level, atlas, na) {
  const th = (atlas.scope && atlas.scope.thresholds) || {};
  const t = th[String(level)], t5 = th['5'];
  if (!t || !t5) return t;
  const of = (atlas.scope && atlas.scope.organ_of) || {};
  const kinds = new Map((atlas.axes || []).map((a) => [a.id, a.kind]));
  const dropped = new Set();
  for (const a of Object.keys(na || {})) if (kinds.get(a) === 'product' && marked(na, a)) for (const o of Array.isArray(of[a]) ? of[a] : []) if (text(o)) dropped.add(text(o));
  const drop = dropped.size;
  if (!drop) return t;
  const f5 = { organs: Math.max(Math.min(4, t5.organs), t5.organs - drop), links: Math.max(t5.steering || 0, t5.links - 2 * drop) };
  if (level === 5) return { ...t, ...f5 };
  if (level > 5) return { ...t, organs: f5.organs + (t.organs - t5.organs), links: f5.links + (t.links - t5.links) };
  // f5.links is at least level 5's steering links, so a lower level that asks for a link still asks for one
  return { ...t, organs: Math.min(t.organs, f5.organs), links: Math.max(t.steering || 0, Math.min(t.links, f5.links)) };
}

// Where a plan stands before anything else is checked: no concept written, a concept written and waiting for
// Luis, a concept he chose, or a status this tool does not know (a typo must not pass as waiting).
export function conceptState(c) {
  if (!c) return 'unwritten';
  if (c.status === 'chosen') return 'chosen';
  return ['proposed', 'pending'].includes(c.status) ? 'waiting' : 'unknown';
}

// what a counted graph lacks for one level; empty when it meets it
function shortfalls(m, t) {
  const out = [];
  const joined = t.joined === true;
  if (m.organs < t.organs) out.push(`${t.organs} ${joined ? 'joined ' : ''}organs (it has ${m.organs})`);
  if (m.links < t.links) out.push(`${t.links} links${joined ? ' among them' : ''} (it has ${m.links})`);
  if (m.reach + 1e-9 < t.reach) out.push(`reach ${t.reach}${(t.organs_per_unit || 1) > 1 ? ` with ${t.organs_per_unit} organs on each unit` : ''} (it has ${m.reach.toFixed(2)})`);
  if (joined && !m.instrumentIn) out.push('the instrument inside the largest connected part');
  if ((t.steering || 0) > m.steering) out.push(`${t.steering} steering links (it has ${m.steering})`);
  if (t.cycle === true && !m.cycle) out.push('a directed loop of steering links');
  if ((t.instrument_read_by || 0) > m.readBy) out.push(`${t.instrument_read_by} other organ(s) reading the instrument (it has ${m.readBy})`);
  return out;
}

// the scope level of a graph, how it counts at that level, and what holds it there
export function scopeDetail(graph, atlas, na) {
  const th = (atlas.scope && atlas.scope.thresholds) || {};
  let level = 0, at = measure(graph, th['1'] || {}), holds = [];
  for (let l = 1; l <= 10; l++) {
    const t = floorAt(l, atlas, na);
    if (!t) break;
    const m = measure(graph, t);
    const miss = shortfalls(m, t);
    if (miss.length) { holds = miss; break; }
    level = l; at = m;
  }
  return { level, at, holds };
}
export function scopeLevel(graph, atlas, na) { return scopeDetail(graph, atlas, na).level; }

const halfLevel = (vals) => { if (!vals.length) return null; const s = [...vals].sort((a, b) => a - b); return Math.min(s[Math.floor((s.length - 1) / 2)], s[0] + 2); };
// Product, subject, scope and the lab's level: the lowest of the three. `rungs` holds the product and subject
// levels as the axis grades give them; `product` and `subject` are those capped at the scope level, because a deep
// rung on a one-organ lab is not a deep lab. A lab whose graph has not been counted has no level yet: unknown is
// not 0.
export function threeLevels(plan, atlas) {
  const na = plan.na || {};
  const of = (kind) => atlas.axes.filter((a) => a.kind === kind && !marked(na, a.id)).map((a) => { const g = plan.grade && plan.grade[a.id]; return g && Number.isInteger(g.level) ? g.level : 0; });
  const rungs = { product: halfLevel(of('product')), subject: halfLevel(of('subject')) };
  // counted means the plan states its graph in the shape the gate accepts; a placeholder is not a count
  const st = plan.scope_today;
  const counted = !!(atlas.scope && st && Array.isArray(st.organs) && st.organs.length && Array.isArray(st.links));
  const detail = counted ? scopeDetail(scopeToday(plan), atlas, na) : null;
  const scope = detail ? detail.level : null;
  const cap = (x) => (x == null || scope == null ? x : Math.min(x, scope));
  const product = cap(rungs.product), subject = cap(rungs.subject);
  const parts = [product, subject, scope].filter((x) => x != null);
  const level = atlas.scope && !counted ? null : (parts.length ? Math.min(...parts) : null);
  // every count twice: all the lab has, and what counts at the level it reached (the joined part from level 3)
  const graph = detail ? { organs: detail.at.all.organs, links: detail.at.all.links, steering: detail.at.all.steering, counted: { organs: detail.at.organs, links: detail.at.links, steering: detail.at.steering }, reach: detail.at.reach } : null;
  return { product, subject, scope, rungs, graph, holds: detail ? detail.holds : [], level };
}

function checkPlanScope(plan, atlas) {
  const errs = [];
  const lab = plan.lab;
  const sc = atlas.scope;
  if (!sc) return errs;
  const s = plan.scope_today;
  if (!s || !Array.isArray(s.organs) || !Array.isArray(s.links)) return [`${lab}: scope_today lists the organs and links the lab has now`];
  if (!s.organs.length) errs.push(`${lab}: scope_today lists no organs; a lab that has a page has at least its instrument`);
  const unitIds = new Set((Array.isArray(plan.bindings && plan.bindings.units) ? plan.bindings.units : []).map((u) => u && u.id).filter(Boolean));
  const names = new Set();
  for (const o of s.organs) {
    if (!long(o && o.name, 3) || !long(o && o.does, 30)) errs.push(`${lab}: scope_today organ "${(o && o.name) || '?'}" needs a name and what it does (30+ characters)`);
    if (o && names.has(text(o.name))) errs.push(`${lab}: scope_today organ "${o.name}" is listed twice`);
    if (o) names.add(text(o.name));
    if (o && o.units != null && !Array.isArray(o.units)) errs.push(`${lab}: scope_today organ "${o.name}": units is a list of unit ids`);
    for (const u of (o && Array.isArray(o.units) ? o.units : [])) if (!unitIds.has(u)) errs.push(`${lab}: scope_today organ "${o.name}" names unit ${u}, which is not in the bindings`);
  }
  if (s.organs.filter((o) => o && o.instrument === true).length !== 1) errs.push(`${lab}: scope_today marks exactly one organ as the instrument ("instrument": true): the organ that runs the lab's mechanism on the visitor's own input`);
  for (const k of s.links) {
    if (!(k && names.has(text(k.from)) && names.has(text(k.to)) && text(k.from) !== text(k.to) && long(k.what, 20))) errs.push(`${lab}: scope_today link ${k && k.from} -> ${k && k.to} must join two different listed organs, from the one that wrote to the one that reads, and say what is read`);
    else if (k.steers != null && typeof k.steers !== 'boolean') errs.push(`${lab}: scope_today link ${k.from} -> ${k.to}: steers is true when what the first organ wrote changes what the second deals, orders or proposes next`);
  }
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
    if (!g || !Array.isArray(g.organs) || !Array.isArray(g.links) || typeof g.reach !== 'number') { errs.push(`${at}: graph lists the organs, the links ("A -> B", from the organ that wrote to the one that reads), those of them that steer, the instrument and the reach the lab has at this level`); prev = null; continue; }
    if (g.organs.some((o) => !text(o))) errs.push(`${at}: an organ has no name`);
    const listed = g.organs.map(text).filter(Boolean);
    const organs = new Set(listed);
    if (organs.size !== listed.length) errs.push(`${at}: an organ is listed twice`);
    const parsed = [];
    if (g.steers != null && !Array.isArray(g.steers)) errs.push(`${at}: steers lists the links that steer, each written as it is in links`);
    const steers = new Set((Array.isArray(g.steers) ? g.steers : []).map(text));
    for (const k of g.links) {
      const m = /^(.+?) -> (.+)$/.exec(text(k));
      if (!m || !organs.has(m[1].trim()) || !organs.has(m[2].trim()) || m[1].trim() === m[2].trim()) { errs.push(`${at}: link "${k}" must join two different organs of this level as "A -> B"`); continue; }
      parsed.push({ from: m[1].trim(), to: m[2].trim(), steers: steers.has(text(k)) });
    }
    for (const k of steers) if (!g.links.map(text).includes(k)) errs.push(`${at}: steers names "${k}", which is not one of this level's links`);
    if (g.instrument != null && !organs.has(text(g.instrument))) errs.push(`${at}: the instrument "${g.instrument}" is not one of this level's organs`);
    const floor = floorAt(l, atlas, plan.na);
    const miss = shortfalls(measure(graphOf(listed, parsed, g.instrument, g.reach), floor), floor);
    if (miss.length) errs.push(`${at}: the graph does not meet this level; it lacks ${miss.join('; ')}`);
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
  // The concept comes first (Luis, 2026-11-13): "we were just scaling up garbage"; "each of the ideas are the seed".
  // The seed, and the distinct thing it grows into, chosen by him. Nothing below is worth checking before that.
  const c = plan.concept;
  if (!c) return [`${lab}: no concept yet: the seed and the concept grown from it come before any story`];
  const errs = [];
  for (const k of ['seed', 'sentence', 'scene', 'answers_to']) if (!long(c[k], 40)) errs.push(`${lab}: concept.${k} is missing or under 40 characters`);
  if (c.status !== 'chosen') return [...errs, `${lab}: the concept is ${text(c.status) || 'pending'}; Luis chooses it, and the story of its levels waits until he has`];
  if (!long(c.chosen_by, 8)) errs.push(`${lab}: concept.chosen_by says who chose it and when`);
  if (!ev) return [...errs, `${lab}: plan has no evolution block`];
  const na = plan.na || {};
  for (const k of Object.keys(na)) {
    if (!atlas.axes.some((a) => a.id === k)) errs.push(`${lab}: not applicable names "${k}", which is no axis`);
    else if (!marked(na, k)) errs.push(`${lab}: not applicable ${k} needs its reason in 20+ characters; without one the axis is graded and lowers no floor`);
  }
  const axes = atlas.axes.filter((a) => !marked(na, a.id));
  const generic = new Set(Object.values((atlas.evolution && atlas.evolution.levels) || {}).map((L) => text(L.name).toLowerCase()));
  const names = new Set();
  // "Things pop up as you go up the levels" (Luis, 2026-11-13): what lies above the next level cannot be listed today.
  // The stories are written for the one level above where the lab stands; every level above that is a conjecture,
  // rewritten from what actually appeared when the level below shipped.
  const through = ev.planned_through;
  if (!(Number.isInteger(through) && through >= 1 && through <= 10)) errs.push(`${lab}: planned_through names the one level the stories are written for`);
  const today = threeLevels(plan, atlas).level;
  if (Number.isInteger(through) && today != null && through !== Math.min(10, today + 1)) errs.push(`${lab}: the lab stands at level ${today}, so the stories are written for level ${Math.min(10, today + 1)} only (planned_through is ${through}); what lies above is conjecture until that level ships and shows what popped up`);
  const seenEmerged = new Set();
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
    // what emerges: evolution is the concept rounding out to more, with things appearing that the level below made
    // possible and did not contain, each still traceable to the seed
    if (l === 1 && !long(L.seed_here, 60)) errs.push(`${at}: seed_here says how the seed first shows as a thing a visitor meets`);
    if (l >= 2) {
      const em = Array.isArray(L.emerges) ? L.emerges : [];
      if (!em.length) errs.push(`${at}: emerges names at least one thing that pops up at this level: made possible by the level below, not contained in it, and still the seed`);
      for (const e of em) {
        if (!long(e && e.what, 30) || !long(e && e.made_possible_by, 30) || !long(e && e.still_the_seed, 30)) errs.push(`${at}: each thing that emerges says what it is, what in the level below made it possible, and how it is still the seed`);
        const key = text(e && e.what).toLowerCase();
        if (key && seenEmerged.has(key)) errs.push(`${at}: "${key.slice(0, 50)}" already emerged at a lower level`);
        if (key) seenEmerged.add(key);
      }
    }
    const conjecture = L.conjecture === true;
    if (Number.isInteger(through)) {
      if (l > through && !conjecture) errs.push(`${at}: above the planned level (${through}) a level is a conjecture and says so ("conjecture": true)`);
      if (l <= through && conjecture) errs.push(`${at}: a level the stories are written for cannot be a conjecture`);
    }
    const cp = L.checkpoint || {};
    if (l <= Math.min(TARGET, Number.isInteger(through) ? through : TARGET)) {
      for (const a of axes) if (!long(L.axes && L.axes[a.id], MIN.axisLine)) errs.push(`${at}: no line for axis ${a.id} (what it is here at this level, ${MIN.axisLine}+ characters)`);
    }
    if (l < TARGET && !long(cp.why_not_5, MIN.labShift)) errs.push(`${at}: the checkpoint says why this is not level 5 yet (why_not_5)`);
    if (l < 10 && !long(cp.takes_it_up, MIN.labShift)) errs.push(`${at}: the checkpoint says what takes it to level ${l + 1} (takes_it_up)`);
    if (l === 10 && !long(cp.keeps_it, MIN.labShift)) errs.push(`${at}: the checkpoint says what keeps it at level 10 (keeps_it)`);
  }
  // each shipped level leaves a record of what popped up that nobody had listed, and how the levels above changed
  for (const g of ev.generations || []) {
    if (!(g && Number.isInteger(g.level) && long(g.date, 8) && Array.isArray(g.popped_up) && g.popped_up.filter((x) => long(x, 20)).length >= 1 && long(g.changed_above, 40))) {
      errs.push(`${lab}: a generation records the level that shipped, the date, what popped up that nobody had listed, and how the levels above were rewritten`);
    }
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
  for (const e of edges) if (marked(na, e.from.axis) || marked(na, e.to.axis)) errs.push(`${lab}: a coupling uses axis ${marked(na, e.from.axis) ? e.from.axis : e.to.axis}, which this lab marks not applicable`);
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
    if (!f || !t || f.rung > TARGET || t.rung > TARGET || marked(na, f.axis) || marked(na, t.axis)) continue;
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
  const unwritten = [], pending = [];
  if (!all) console.log('NOT_CHECKED: the lab plans are private and absent here');
  else {
    for (const p of all.filter((x) => !only || x.dir === only)) {
      // Three states. No concept written: nothing to check yet. A concept written and waiting for Luis: its own
      // fields are checked and nothing built on it is. A chosen concept: everything is checked.
      const c = p.plan.concept;
      const state = conceptState(c);
      if (state === 'unwritten') { unwritten.push(p.dir); continue; }
      if (state !== 'chosen') {
        if (state === 'unknown') errs.push(`${p.dir}: concept.status "${c.status}" is not one of chosen, proposed, pending`);
        for (const k of ['seed', 'sentence', 'scene', 'answers_to']) if (!long(c[k], 40)) errs.push(`${p.dir}: concept.${k} is missing or under 40 characters`);
        pending.push(p.dir);
        continue;
      }
      labs++;
      const siblings = all.filter((x) => x.dir !== p.dir && x.plan.world === p.plan.world).map((x) => x.dir);
      errs.push(...checkPlanEvolution(p.plan, atlas, siblings));
      const miss = missingLinks(p.plan, p.stories, atlas);
      if (miss.length) errs.push(`${p.dir}: ${miss.length} stor${miss.length === 1 ? 'y builds' : 'ies build'} a rung without depending on the stories for the rung it stands on (run: node tools/evolution.mjs weave ${p.dir}); first: ${miss.slice(0, 3).map((m) => `${m.story} builds ${m.for}, needs ${m.needs}`).join('; ')}`);
      else woven++;
    }
    if (!only) {
      const withEv = all.filter((x) => x.plan.evolution && x.plan.concept && x.plan.concept.status === 'chosen').map((x) => x.plan);
      for (const t of tooAlike(withEv)) {
        if (t.portraits > LIMIT.portraitSimilarity) errs.push(`${t.a} and ${t.b}: their level portraits share ${(t.portraits * 100).toFixed(0)}% of their phrases (limit ${LIMIT.portraitSimilarity * 100}%); two labs are not one lab with the nouns changed`);
        if (t.notes > LIMIT.notesSimilarity) errs.push(`${t.a} and ${t.b}: their binding notes share ${(t.notes * 100).toFixed(0)}% of their phrases (limit ${LIMIT.notesSimilarity * 100}%)`);
      }
    }
  }
  if (unwritten.length) console.log(`no concept written yet (${unwritten.length}, nothing to check): ${unwritten.join(', ')}`);
  if (pending.length) console.log(`concept written and waiting for Luis to choose (${pending.length}, only the concept's own fields are checked): ${pending.join(', ')}`);
  if (errs.length) { console.log(`evolution: ${errs.length} problem(s)`); for (const e of errs.slice(0, 150)) console.log('  ' + e); process.exit(1); }
  console.log(`evolution: the atlas names 10 levels and ${atlas.evolution.couplings.length} couplings, and its anchor's graph stands at scope level 5${all ? `; ${labs} plan(s) with a chosen concept were checked, and ${woven} carry their couplings in their tickets` : ''}`);
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
    // an axis grade is a rung, never a level: the rungs are printed with the lab's graph beside them
    const graph = g ? `graph: ${g.organs} organs (${g.counted.organs} counted), ${g.links} links (${g.counted.links} counted), ${g.steering} steer (${g.counted.steering} counted), reach ${(g.reach * 100).toFixed(0)}%${r.holds.length ? `; for the next level it lacks ${r.holds.join('; ')}` : ''}` : 'graph: not counted yet (no scope_today)';
    console.log(`  ${r.lab.padEnd(17)} level ${r.level ?? '-'}   rungs: product ${r.rungs.product}, subject ${r.rungs.subject}   scope ${r.scope ?? '-'}   ${graph}`);
  }
  const by = {};
  for (const r of rows) { const k = r.level ?? 'not counted'; by[k] = (by[k] || 0) + 1; }
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
  const ev = { principle: 'x'.repeat(130), emergence: 'e'.repeat(210), analogy_rule: 'y'.repeat(130), levels, couplings, roots: {} };
  const atlas = { axes: atlasAxes, evolution: ev };
  const aErrs = checkAtlasEvolution(atlas);
  const onlyCross = aErrs.every((e) => e.includes('join a subject axis'));
  const labLevels = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => [String(l), {
    name: `The plate at ${l}`, portrait: P, shift: S, visitor_can: ['open one catalogued world and read it', 'ask their own question of it', 'keep what they found today'],
    entails: ['a computed value shown with its source', 'a record of what the visitor did here', 'a view that answers the visitor question'],
    ...(l <= 5 ? { axes: Object.fromEntries(ids.map((a) => [a, `at level ${l} the ${a} of this lab is a different thing than before it`])) } : {}),
    checkpoint: l < 5 ? { why_not_5: S, takes_it_up: S } : l < 10 ? { takes_it_up: S } : { keeps_it: S },
    ...(l === 1 ? { seed_here: 'the seed shows as one trace a visitor can start and read in a minute' } : { emerges: [{ what: `a thing nobody listed at level ${l - 1} appears here`, made_possible_by: 'the records the level below began to keep', still_the_seed: 'it is still the rhythm of arrivals, read one way more' }] }),
    conjecture: l > 1,
  }]));
  const concept = { seed: 'a reply arrives one token at a time and the rhythm can be read', sentence: 'a place where the rhythm of a model is read like a pulse', scene: 'two traces side by side and the visitor names which model is which', answers_to: 'the population of language models people can reach today', status: 'chosen', chosen_by: 'Luis, 2026-11-14' };
  const LW = 'because on this lab the second is computed from the first and cannot exist before it does';
  const labCouplings = [];
  for (let r = 1; r <= 4; r++) { labCouplings.push({ from: `fidelity.${r}`, to: `evidence.${r + 1}`, why: LW }, { from: `records.${r}`, to: `fidelity.${r + 1}`, why: LW }, { from: `evidence.${r}`, to: `records.${r + 1}`, why: LW }); }
  const an = { claude_prep: 'a'.repeat(45), here: 'b'.repeat(45), holds_because: 'c'.repeat(45), breaks_where: 'd'.repeat(45) };
  const plan = { lab: 'x', world: 'cosmos', concept, evolution: { planned_through: 1, levels: labLevels, analogy: { records: an, evidence: an }, couplings: labCouplings,
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
  const L = (from, to, steers) => ({ from, to, steers: !!steers });
  const chain5 = { instrument: 'p1', organs: ['p1', 'p2', 'p3', 'p4', 'p5'], links: [L('p1', 'p2'), L('p2', 'p3'), L('p3', 'p4'), L('p4', 'p5')], reach: 1 };
  const scope = { principle: D, organ: D, link: D, reach: D, rule: D, claude_prep: { organs: 5, links: 4, how_counted: D, graph: chain5 }, thresholds };
  const atlasS = { ...atlas, scope };
  // the rule as the atlas states it: joined organs, steering links, a loop of them, readers of the instrument
  const SAYS = 'the graph at this level has this many working parts and links between them';
  const TR = {
    1: { organs: 1, links: 0, reach: 0.01, organs_per_unit: 1, says: SAYS },
    2: { organs: 3, links: 1, reach: 0.25, organs_per_unit: 1, says: SAYS },
    3: { organs: 5, links: 4, reach: 0.5, organs_per_unit: 2, joined: true, instrument_read_by: 0, says: SAYS },
    4: { organs: 6, links: 7, steering: 3, cycle: true, reach: 0.8, organs_per_unit: 3, joined: true, instrument_read_by: 1, says: SAYS },
    5: { organs: 7, links: 11, steering: 5, cycle: true, reach: 1, organs_per_unit: 3, joined: true, instrument_read_by: 2, says: SAYS },
  };
  for (let l = 6; l <= 10; l++) TR[l] = { ...TR[5], organs: 7 + (l - 5) * 2, links: 11 + (l - 5) * 5 };
  const anchor = { instrument: 'mock', organs: ['today', 'lessons', 'drills', 'mock', 'cards', 'progress', 'plan', 'labs', 'tracker'], reach: 1,
    links: [L('lessons', 'today', 1), L('cards', 'today', 1), L('drills', 'today', 1), L('progress', 'today', 1), L('drills', 'progress'), L('mock', 'progress'), L('lessons', 'progress'),
      L('drills', 'lessons', 1), L('lessons', 'drills', 1), L('mock', 'drills', 1), L('lessons', 'plan'), L('today', 'lessons', 1), L('today', 'drills', 1), L('today', 'cards', 1)] };
  const scopeR = { principle: D, organ: D, link: D, reach: D, rule: D, thresholds: TR, organ_of: { records: ['cards', 'plan'] }, claude_prep: { organs: 9, joined: 7, links: 14, steering: 10, how_counted: D, graph: anchor } };
  const atlasR = { axes: atlasAxes, scope: scopeR };
  const anchorG = graphOf(anchor.organs, anchor.links, anchor.instrument, 1);
  const core = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'];
  const dense = graphOf([...core, 'o7', 'o8', 'o9'], core.flatMap((a) => core.filter((b) => b !== a).map((b) => L(a, b, 1))), 'o1', 1);
  const six = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const noLoop = graphOf(six, [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c4', 1), L('c4', 'c5'), L('c5', 'c6'), L('c6', 'c1'), L('c1', 'c5')], 'c1', 1);
  const withLoop = graphOf(six, [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c1', 1), L('c3', 'c4'), L('c4', 'c5'), L('c5', 'c6'), L('c6', 'c1')], 'c1', 1);
  const unread = graphOf(six, [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c1', 1), L('c3', 'c4'), L('c4', 'c5'), L('c5', 'c6'), L('c1', 'c6')], 'c6', 1);
  const five = graphOf(['c1', 'c2', 'c3', 'c4', 'c5'], [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c1', 1), L('c1', 'c4', 1), L('c4', 'c5', 1), L('c5', 'c1'), L('c2', 'c4')], 'c1', 1);
  const chainOf = (inst) => graphOf(['c1', 'c2', 'c3', 'c4', 'c5', 'apart'], [L('c1', 'c2'), L('c2', 'c3'), L('c3', 'c4'), L('c4', 'c5')], inst, 1);
  const perUnit = (eUnits) => scopeToday({ bindings: { units: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }] }, scope_today: {
    organs: [{ name: 'A', instrument: true, units: ['u1', 'u2'] }, { name: 'B', units: ['u1'] }, { name: 'C', units: ['u1'] }, { name: 'D', units: ['u1'] }, { name: 'E', units: eUnits }],
    links: [L('A', 'B'), L('B', 'C'), L('C', 'D'), L('D', 'E')] } });
  const organNames = Array.from({ length: 10 }, (_, i) => `organ ${i + 1}`);
  const graphAt = (l) => ({ organs: organNames.slice(0, l), links: Array.from({ length: l - 1 }, (_, i) => `organ ${i + 1} -> organ ${i + 2}`), reach: Math.min(1, l / 5) });
  const levelsG = Object.fromEntries(Object.entries(labLevels).map(([k, v]) => [k, { ...v, graph: graphAt(Number(k)), conjecture: Number(k) > 2 }]));
  const units = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }, { id: 'u5' }];
  const today = { organs: [{ name: 'bench', instrument: true, does: 'measures the arrival time of every token of a reply', units: ['u1'] }], links: [], evidence: 'counted from the three plates of the page and main.js' };
  const planS = { ...plan, bindings: { units }, scope_today: today, grade: { records: { level: 1 }, evidence: { level: 1 }, fidelity: { level: 3 } }, evolution: { ...plan.evolution, planned_through: 2, levels: levelsG } };
  const ps = (patch) => checkPlanEvolution({ ...planS, ...patch }, atlasS, ['y']);
  const lv = (l, g) => ({ evolution: { ...planS.evolution, levels: { ...levelsG, [l]: { ...levelsG[l], graph: g } } } });
  const atlasJ = { ...atlas, scope: { ...scope, thresholds: Object.fromEntries(Object.entries(thresholds).map(([k, v]) => [k, Number(k) >= 3 ? { ...v, joined: true } : v])) } };
  const withInstrument = { ...planS, evolution: { ...planS.evolution, levels: Object.fromEntries(Object.entries(levelsG).map(([k, v]) => [k, { ...v, graph: { ...v.graph, instrument: 'organ 1' } }])) } };
  const REASON = 'this lab keeps nothing between visits by design';
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const fewSteer = graphOf(seven, [L('a', 'b', 1), L('b', 'a', 1), L('a', 'c'), L('c', 'd'), L('d', 'e'), L('e', 'f'), L('f', 'g'), L('g', 'a'), L('b', 'd'), L('c', 'e'), L('d', 'f')], 'a', 1);
  const steerApart = graphOf([...six, 'x', 'y', 'z'], [L('c1', 'c2'), L('c2', 'c3'), L('c3', 'c4'), L('c4', 'c5'), L('c5', 'c6'), L('c6', 'c1'), L('c1', 'c3'), L('x', 'y', 1), L('y', 'z', 1), L('z', 'x', 1)], 'c1', 1);
  const reachApart = (join) => scopeToday({ bindings: { units: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }] }, scope_today: {
    organs: [{ name: 'A', instrument: true, units: ['u1'] }, { name: 'B', units: ['u1'] }, { name: 'C', units: ['u2'] }, { name: 'D', units: [] }, { name: 'E', units: [] }, { name: 'X', units: ['u2'] }],
    links: [L('A', 'B'), L('B', 'C'), L('C', 'D'), L('D', 'E'), ...(join ? [L('E', 'X')] : [])] } });
  const sixOf = { records: ['cards', 'plan', 'today'], evidence: ['lessons', 'drills', 'progress'] };
  const atlas6 = { ...atlasR, scope: { ...scopeR, organ_of: sixOf } };
  const na2 = { records: REASON, evidence: REASON };
  const four = graphOf(['c1', 'c2', 'c3', 'c4'], [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c1', 1), L('c1', 'c4', 1), L('c4', 'c1', 1), L('c2', 'c4', 1), L('c3', 'c4')], 'c1', 1);
  const atlasNA = { ...atlas, scope: { ...scope, organ_of: { records: ['p4', 'p5'] } } };
  const thin4 = lv(4, { organs: organNames.slice(0, 4), links: ['organ 1 -> organ 2', 'organ 2 -> organ 3'], reach: 0.8 });
  const level4 = (e) => e.includes('level 4') && e.includes('does not meet');
  const noThrow = (f) => { try { return f(); } catch { return false; } };
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
    ['a plan without a concept fails before anything else', (() => { const e = checkPlanEvolution({ lab: 'x', evolution: plan.evolution }, atlas); return e.length === 1 && e[0].includes('no concept'); })()],
    ['a concept Luis has not chosen stops the check', (() => { const e = checkPlanEvolution({ ...plan, concept: { ...concept, status: 'pending' } }, atlas, ['y']); return e.length === 1 && e[0].includes('Luis chooses'); })()],
    ['a concept without its seed fails', checkPlanEvolution({ ...plan, concept: { ...concept, seed: 'a chart' } }, atlas, ['y']).some((e) => e.includes('concept.seed'))],
    ['a chosen concept without its evolution fails', checkPlanEvolution({ lab: 'x', concept }, atlas).some((e) => e.includes('no evolution block'))],
    ['a level where nothing emerges fails', pe({ levels: { ...labLevels, 4: { ...labLevels[4], emerges: [] } } }).some((e) => e.includes('level 4') && e.includes('pops up'))],
    ['a thing that emerges without its lineage fails', pe({ levels: { ...labLevels, 3: { ...labLevels[3], emerges: [{ what: 'a new way of reading the same trace appears', made_possible_by: '', still_the_seed: '' }] } } }).some((e) => e.includes('level 3') && e.includes('made it possible'))],
    ['the same thing cannot emerge twice', pe({ levels: { ...labLevels, 5: { ...labLevels[5], emerges: labLevels[4].emerges } } }).some((e) => e.includes('already emerged'))],
    ['level 1 says how the seed first shows', pe({ levels: { ...labLevels, 1: { ...labLevels[1], seed_here: '' } } }).some((e) => e.includes('seed_here'))],
    ['a level above the planned one must say it is a conjecture', pe({ levels: { ...labLevels, 6: { ...labLevels[6], conjecture: false } } }).some((e) => e.includes('level 6') && e.includes('conjecture'))],
    ['the planned level cannot be a conjecture', pe({ levels: { ...labLevels, 1: { ...labLevels[1], conjecture: true } } }).some((e) => e.includes('level 1') && e.includes('cannot be a conjecture'))],
    ['stories are written for the next level only', pe({ planned_through: 5 }).some((e) => e.includes('level 1 only'))],
    ['a lab at level 1 plans level 2', ps({}).length === 0 && ps({ evolution: { ...planS.evolution, planned_through: 3 } }).some((e) => e.includes('level 2 only'))],
    ['a generation records what popped up', pe({ generations: [{ level: 1, date: '2026-12-01', popped_up: ['two traces of one model differ by provider'], changed_above: 'level 3 now starts from the provider difference, not from the tokenizer' }] }).length === 0 && pe({ generations: [{ level: 1, date: '2026-12-01', popped_up: [], changed_above: '' }] }).some((e) => e.includes('a generation records'))],
    ['a level named with the atlas generic name fails', pe({ levels: { ...labLevels, 2: { ...labLevels[2], name: 'Stage 2' } } }).some((e) => e.includes('generic name'))],
    ['a level without a checkpoint fails', pe({ levels: { ...labLevels, 3: { ...labLevels[3], checkpoint: {} } } }).some((e) => e.includes('why_not_5'))],
    ['level 5 says what takes it to 6', pe({ levels: { ...labLevels, 5: { ...labLevels[5], checkpoint: { why_not_5: S } } } }).some((e) => e.includes('level 5') && e.includes('takes_it_up'))],
    ['the story goes through every level: a missing level 8 fails', pe({ levels: { ...labLevels, 8: undefined } }).some((e) => e.includes('level 8 is missing'))],
    ['a level without what it entails fails', pe({ levels: { ...labLevels, 7: { ...labLevels[7], entails: ['more'] } } }).some((e) => e.includes('level 7') && e.includes('entails'))],
    ['level 10 says what keeps it there', pe({ levels: { ...labLevels, 10: { ...labLevels[10], checkpoint: {} } } }).some((e) => e.includes('keeps_it'))],
    ['levels 6 to 10 need no axis lines', pe({}).every((e) => !/level (6|7|8|9|10): no line/.test(e))],
    ['an axis line repeated at two levels fails', pe({ levels: { ...labLevels, 4: { ...labLevels[4], axes: { ...labLevels[4].axes, records: labLevels[3].axes.records } } } }).some((e) => e.includes('same line'))],
    ['a missing axis line on the planned level fails', pe({ levels: { ...labLevels, 1: { ...labLevels[1], axes: { records: labLevels[1].axes.records } } } }).some((e) => e.includes('no line for axis'))],
    ['a conjectured level needs no axis lines', pe({ levels: { ...labLevels, 3: { ...labLevels[3], axes: {} } } }).every((e) => !e.includes('level 3: no line'))],
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
    ['an atlas without scope fails', checkAtlasScope(atlas).length === 1],
    ['a scope level that does not grow fails', checkAtlasScope({ ...atlas, scope: { ...scope, thresholds: { ...thresholds, 4: { ...thresholds[4], organs: 3 } } } }).some((e) => e.includes('level 4') && e.includes('larger'))],
    ['a level 5 above the anchor fails', checkAtlasScope({ ...atlas, scope: { ...scope, claude_prep: { ...scope.claude_prep, organs: 4 } } }).some((e) => e.includes('more than Claude Prep'))],
    ['one organ on one unit is scope level 1', scopeLevel(scopeToday(planS), atlasS) === 1],
    ['three linked organs on three of five units are scope level 3', scopeLevel({ organs: 3, links: 2, reach: 0.6 }, atlasS) === 3],
    ['many organs with no links stay low: breadth needs connection', scopeLevel({ organs: 9, links: 0, reach: 1 }, atlasS) === 1],
    ['the lab level is the lowest of product, subject and scope, and neither half reads above the scope', (() => { const r = threeLevels({ ...planS, grade: { records: { level: 4 }, evidence: { level: 4 }, fidelity: { level: 3 } } }, atlasS); return r.rungs.product === 4 && r.rungs.subject === 3 && r.scope === 1 && r.product === 1 && r.subject === 1 && r.level === 1; })()],
    ['a lab whose graph was never counted has no level, which is not level 0', (() => { const r = threeLevels({ ...planS, scope_today: undefined }, atlasS); return r.scope === null && r.level === null && r.graph === null && r.rungs.product === 1; })()],
    ['an atlas without the emergence statement fails', checkAtlasEvolution({ ...atlas, evolution: { ...ev, emergence: 'things appear' } }).some((e) => e.includes('emergence'))],
    ['the rule as stated: a scope block with the anchor\'s graph passes', checkAtlasScope(atlasR).length === 0],
    ['the anchor counts 9 organs, 7 joined, 14 links, 10 steering, and stands at scope level 5', (() => { const m = measure(anchorG, TR[5]); return m.all.organs === 9 && m.organs === 7 && m.links === 14 && m.steering === 10 && m.cycle && m.readBy === 2 && scopeLevel(anchorG, atlasR) === 5; })()],
    ['an anchor whose stated counts disagree with its graph fails', checkAtlasScope({ ...atlasR, scope: { ...scopeR, claude_prep: { ...scopeR.claude_prep, links: 15 } } }).some((e) => e.includes('links says 15'))],
    ['thresholds the anchor does not reach at level 5 fail', checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 5: { ...TR[5], instrument_read_by: 3 } } } }).some((e) => e.includes('stands at scope level 4'))],
    ['a scope block without the anchor\'s graph fails', checkAtlasScope({ ...atlasR, scope: { ...scopeR, claude_prep: { ...scopeR.claude_prep, graph: undefined } } }).some((e) => e.includes('claude_prep.graph'))],
    ['organ_of naming an organ the anchor does not have fails', checkAtlasScope({ ...atlasR, scope: { ...scopeR, organ_of: { records: ['ghost'] } } }).some((e) => e.includes('organ_of.records'))],
    ['a threshold that drops the joined rule above level 3 fails', checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 4: { ...TR[4], joined: false } } } }).some((e) => e.includes('level 4') && e.includes('joined'))],
    ['a dense core beside isolated organs does not climb: 9 organs with 30 links among 6 stand at 4', measure(dense, TR[5]).organs === 6 && scopeLevel(dense, atlasR) === 4],
    ['two pairs and two isolated organs are not a graph of five', scopeLevel(graphOf(['a', 'b', 'c', 'd', 'e'], [L('a', 'b'), L('b', 'a'), L('a', 'c'), L('c', 'a')], 'a', 0.6), atlasR) === 2],
    ['a self-link is no link and a repeated pair counts once', (() => { const m = measure(graphOf(['a', 'b', 'c'], [L('a', 'a'), L('a', 'b'), L('a', 'b'), L('a', 'b', 1), L('a', 'ghost')], 'a', 1), {}); return m.links === 1 && m.steering === 1 && m.all.links === 1; })()],
    ['the instrument must be inside the largest connected part', scopeLevel(chainOf('apart'), atlasR) === 2 && scopeLevel(chainOf('c1'), atlasR) === 3 && scopeDetail(chainOf('apart'), atlasR).holds.some((h) => h.includes('instrument'))],
    ['level 4 needs a directed loop of steering links', scopeLevel(noLoop, atlasR) === 3 && scopeLevel(withLoop, atlasR) === 4],
    ['level 4 needs another organ to read the instrument', scopeLevel(unread, atlasR) === 3 && scopeDetail(unread, atlasR).holds.some((h) => h.includes('reading the instrument'))],
    ['a unit counts only when enough organs work on it', scopeLevel(perUnit(['u1', 'u2']), atlasR) === 3 && scopeLevel(perUnit(['u1']), atlasR) === 2],
    ['a not-applicable product axis lowers the floor by its organs, and a lower level never asks for more', scopeLevel(five, atlasR) === 3 && scopeLevel(five, atlasR, { records: 'this lab keeps nothing between visits by design' }) === 5],
    ['a not-applicable subject axis lowers nothing, even where organ_of wrongly lists one', scopeLevel(five, { ...atlasR, scope: { ...scopeR, organ_of: { fidelity: ['cards', 'plan'] } } }, { fidelity: REASON }) === 3],
    ['the floor never falls below 4 organs', scopeLevel(graphOf(['c1', 'c2', 'c3'], [L('c1', 'c2', 1), L('c2', 'c3', 1), L('c3', 'c1', 1), L('c1', 'c3', 1), L('c2', 'c1', 1), L('c3', 'c2', 1)], 'c1', 1), { ...atlasR, scope: { ...scopeR, organ_of: { records: ['cards', 'plan', 'today', 'lessons', 'drills'] } } }, { records: REASON }) === 2],
    ['a steering loop with too few steering links does not pass level 4', scopeLevel(fewSteer, atlasR) === 3 && scopeDetail(fewSteer, atlasR).holds.some((h) => h.includes('steering links'))],
    ['steering links outside the joined part do not count', scopeLevel(steerApart, atlasR) === 3],
    ['an organ outside the joined part adds no reach', scopeLevel(reachApart(false), atlasR) === 2 && scopeLevel(reachApart(true), atlasR) === 3],
    ['a threshold must carry the clauses the rule states', ['joined', 'cycle', 'organs_per_unit'].every((k) => checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 4: { ...TR[4], [k]: k === 'organs_per_unit' ? 2 : undefined } } } }).some((e) => e.includes('scope level 4'))) && checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 3: { ...TR[3], joined: undefined } } } }).some((e) => e.includes('scope level 3') && e.includes('joined'))],
    ['joined and cycle are true or false, never a word', checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 2: { ...TR[2], joined: 'no' } } } }).some((e) => e.includes('level 2') && e.includes('true or false')) && scopeLevel(graphOf(['i', 'a', 'b', 'z'], [L('i', 'a'), L('a', 'b')], 'i', 1), { ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 2: { ...TR[2], joined: 'no', cycle: 'false' } } } }) === 2],
    ['organ_of takes only the joined organs of the anchor, each once, under product axes', checkAtlasScope({ ...atlasR, scope: { ...scopeR, organ_of: { records: ['labs'] } } }).some((e) => e.includes('outside the anchor')) && checkAtlasScope({ ...atlasR, scope: { ...scopeR, organ_of: { records: ['cards'], evidence: ['cards'] } } }).some((e) => e.includes('already carried')) && checkAtlasScope({ ...atlasR, scope: { ...scopeR, organ_of: { fidelity: ['drills'] } } }).some((e) => e.includes('only a product axis'))],
    ['an axis marked with no reason, or a short one, lowers no floor', [{ records: '' }, { records: false }, { records: null }, { records: 'too short' }].every((na) => scopeLevel(five, atlasR, na) === 3)],
    ['a plan that marks an axis without a reason, or marks no axis at all, fails', checkPlanEvolution({ ...plan, na: { evidence: '' } }, atlas, ['y']).some((e) => e.includes('needs its reason')) && checkPlanEvolution({ ...plan, na: { ghost: REASON } }, atlas, ['y']).some((e) => e.includes('which is no axis'))],
    ['with every allowed axis marked, level 2 still asks for a link', scopeLevel(graphOf(['a', 'b', 'c'], [], 'a', 1), atlas6, na2) === 1],
    ['a lowered floor is one level of relief, never a staircase: four organs stop at 5', scopeLevel(four, atlas6, na2) === 5 && scopeLevel(four, atlas6) === 2],
    ['a lowered ladder never steps down', (() => { let po = 0, pl = 0; for (let l = 1; l <= 10; l++) { const f = floorAt(l, atlas6, na2); if (f.organs < po || f.links < pl || f.links < (f.steering || 0)) return false; po = f.organs; pl = f.links; } return true; })()],
    ['an anchor that stands above level 5 is told that level 6 must ask for more', checkAtlasScope({ ...atlasR, scope: { ...scopeR, thresholds: { ...TR, 5: { ...TR[5], organs: 6 }, 6: { ...TR[6], organs: 7, links: 14 } } } }).some((e) => e.includes('level 6 must ask for more'))],
    ['an anchor graph with a nameless organ fails', checkAtlasScope({ ...atlasR, scope: { ...scopeR, claude_prep: { ...scopeR.claude_prep, graph: { ...anchor, organs: [...anchor.organs, ''] } } } }).some((e) => e.includes('no name'))],
    ['a plan is unwritten, waiting, chosen or unknown, and a typo is not waiting', conceptState(undefined) === 'unwritten' && conceptState({ status: 'pending' }) === 'waiting' && conceptState({ status: 'proposed' }) === 'waiting' && conceptState({ status: 'chosen' }) === 'chosen' && conceptState({ status: 'Chosen' }) === 'unknown' && conceptState({}) === 'unknown'],
    ['a placeholder scope_today is not a count', threeLevels({ ...planS, scope_today: {} }, atlasS).level === null && threeLevels({ ...planS, scope_today: { organs: 'TBD' } }, atlasS).level === null && threeLevels({ ...planS, scope_today: { organs: [], links: [] } }, atlasS).level === null],
    ['a scope_today with no organs fails', ps({ scope_today: { organs: [], links: [], evidence: today.evidence } }).some((e) => e.includes('lists no organs'))],
    ['units that are not a list are reported, not thrown', noThrow(() => ps({ scope_today: { ...today, organs: [{ ...today.organs[0], units: 5 }] } }).some((e) => e.includes('units is a list')))],
    ['steers that is not a list is reported', ps(lv(2, { ...graphAt(2), steers: 'organ 1 -> organ 2' })).some((e) => e.includes('level 2') && e.includes('steers lists'))],
    ['a nameless organ is reported at its own level', (() => { const e = ps(lv(3, { ...graphAt(3), organs: [...graphAt(3).organs, ''] })); return e.some((x) => x.includes('level 3') && x.includes('no name')) && !e.some((x) => x.includes('organ ""')); })()],
    ['a story graph of a lab with a marked axis is held to the lowered floor', checkPlanEvolution({ ...planS, ...thin4 }, atlasNA, ['y']).some(level4) && !checkPlanEvolution({ ...planS, ...thin4, na: { records: REASON } }, atlasNA, ['y']).some(level4)],
    ['a plan that marks no instrument fails', ps({ scope_today: { ...today, organs: [{ ...today.organs[0], instrument: false }] } }).some((e) => e.includes('exactly one organ as the instrument'))],
    ['a link from an organ to itself fails', ps({ scope_today: { ...today, links: [{ from: 'bench', to: 'bench', what: 'reads the last run it saved' }] } }).some((e) => e.includes('two different'))],
    ['a level that says a link steers must list that link', ps(lv(2, { ...graphAt(2), steers: ['organ 2 -> organ 1'] })).some((e) => e.includes('level 2') && e.includes('steers names'))],
    ['a joined level whose graph names no instrument fails', checkPlanEvolution(planS, atlasJ, ['y']).some((e) => e.includes('level 3') && e.includes('instrument'))],
    ['a joined level with its instrument in the graph passes', checkPlanEvolution(withInstrument, atlasJ, ['y']).length === 0],
    ['a plan with its graph at every level passes', ps({}).length === 0],
    ['a plan without today\'s graph fails', ps({ scope_today: undefined }).some((e) => e.includes('scope_today'))],
    ['an organ naming an unknown unit fails', ps({ scope_today: { ...today, organs: [{ ...today.organs[0], units: ['u9'] }] } }).some((e) => e.includes('u9'))],
    ['a link between organs that are not listed fails', ps({ scope_today: { ...today, links: [{ from: 'bench', to: 'ghost', what: 'reads the last run it saved' }] } }).some((e) => e.includes('ghost'))],
    ['a level whose graph is smaller than the level asks fails', ps(lv(4, graphAt(2))).some((e) => e.includes('level 4') && e.includes('does not meet') && e.includes('organs (it has 2)'))],
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
