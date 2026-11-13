// The atlas: the axes every lab is graded on, with level 5 pinned to Claude Prep (Blueprint 720) on the product
// axes and to the lab's fiction made real on the subject axes. This tool proves nothing was dropped on the way down:
//
//   A1  every axis is complete: metric, how a rater checks it, eleven rungs of numbered clauses, rungs 5 and 10 for
//       every world, and, on a product axis, an audit entry naming the Claude Prep code path of every clause at or
//       below its blueprint_level; the site requirements, style gates, bindings schema and world rule are present,
//       and every clause, site requirement and axis they name exists
//   A2  every Claude Prep feature is covered by a product-axis clause at or below rung 5 (needs the feature inventory)
//   A3  every pattern idea has a disposition: a rung, already present, or rejected with a reason (needs the catalogue)
//   A4  every lab ladder on the atlas carries every product axis, or a reasoned "not applicable" (at most 3), and
//       declares its bindings (canon, units, challenge blueprint, central scene, fiction inventory, known setup
//       failures) in the shape of the atlas's bindings_schema
//
// A rung has one shape: {"text": "<the rung as one sentence>", "clauses": [{"id": "<axis>.<rung>.<n>", "text":
// "<one checkable requirement>", "claude_prep": "<path:symbol>" or null}]}, with n counting from 1 in order.
//
// A2 and A3 read private inventories under _reference/ (gitignored). Where those files are absent, as in CI, the
// check says NOT_CHECKED for them instead of passing them.
//
// usage: node tools/atlas.mjs [check|selftest]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ATLAS = path.join(ROOT, 'labs', 'levels', 'atlas.json');
const LADDERS = path.join(ROOT, 'labs', 'levels');
const FEATURES = path.join(ROOT, '_reference', 'labs', 'atlas', 'level5_features.json');
const IDEAS = path.join(ROOT, '_reference', 'labs', 'atlas', 'pattern_ideas.json');
const AUDIT = path.join(ROOT, '_reference', 'labs', 'atlas', 'claude_prep_audit.json');
export const WORLDS = ['cosmos', 'contact', 'machine', 'claims', 'self', 'signals', 'workshop'];
export const BINDINGS = ['canon', 'units', 'challenge_blueprint', 'central_scene', 'fiction_inventory', 'known_setup_failures'];
const MIN_REASON = 20;
const MAX_NA = 3;          // product axes a lab may mark not applicable (atlas.json, na_policy)
const MIN_INVENTORY = 10;  // entries in a fiction inventory (bindings_schema)

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
const reasoned = (s) => nonEmpty(s) && s.trim().length >= MIN_REASON;
const CLAUSE_REF = /\b([a-z]+)\.(\d+)\.(\d+)\b/g;

// every clause of an atlas, by id, with its axis and rung
function clauseIndex(atlas) {
  const ix = new Map();
  for (const a of atlas.axes || []) (a.rungs || []).forEach((r, ri) => (r && Array.isArray(r.clauses) ? r.clauses : []).forEach((c) => {
    if (c && nonEmpty(c.id)) ix.set(c.id, { axis: a.id, rung: ri, clause: c });
  }));
  return ix;
}

// opts.audit === 'absent': the private Claude Prep audit is not on this machine (CI), so the checks that read it
// are skipped and check() reports them NOT_CHECKED.
export function checkAtlas(atlas, opts = {}) {
  const auditPresent = opts.audit !== 'absent';
  const errs = [];
  if (!atlas || !Array.isArray(atlas.axes) || !atlas.axes.length) return ['atlas has no axes'];
  const axisIds = new Set(atlas.axes.map((a) => a.id));
  const seenAxis = new Set();
  const seenClause = new Set();
  for (const a of atlas.axes) {
    const at = `axis ${a.id || '(no id)'}`;
    if (!nonEmpty(a.id)) errs.push(`${at}: no id`);
    if (seenAxis.has(a.id)) errs.push(`${at}: duplicate id`);
    seenAxis.add(a.id);
    if (!['product', 'subject'].includes(a.kind)) errs.push(`${at}: kind must be product or subject`);
    for (const k of ['name', 'metric', 'how_checked']) if (!nonEmpty(a[k])) errs.push(`${at}: no ${k}`);
    if (!Array.isArray(a.rungs) || a.rungs.length !== 11) { errs.push(`${at}: needs eleven rungs (0 to 10)`); continue; }
    a.rungs.forEach((r, ri) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push(`${at}: rung ${ri} must be an object with text and clauses`); return; }
      if (!nonEmpty(r.text)) errs.push(`${at}: rung ${ri} has no text`);
      if (!Array.isArray(r.clauses) || !r.clauses.length) { errs.push(`${at}: rung ${ri} has no clause`); return; }
      r.clauses.forEach((c, ci) => {
        const want = `${a.id}.${ri}.${ci + 1}`;
        if (!c || c.id !== want) errs.push(`${at}: rung ${ri} clause ${ci + 1} is ${c && c.id ? `'${c.id}'` : 'unnamed'}, expected ${want}`);
        if (c && nonEmpty(c.id)) { if (seenClause.has(c.id)) errs.push(`clause ${c.id}: duplicate id`); seenClause.add(c.id); }
        if (!c || !nonEmpty(c.text)) errs.push(`clause ${want}: no text`);
        if (auditPresent && (!c || !('claude_prep' in c) || !(c.claude_prep === null || nonEmpty(c.claude_prep)))) errs.push(`clause ${want}: claude_prep must be a path:symbol or null`);
      });
    });
    if (a.kind === 'product') {
      if (!(Array.isArray(a.covers) && a.covers.length)) errs.push(`${at}: a product axis cites the Claude Prep features it covers`);
      const bl = a.blueprint_level;
      if (!(Number.isInteger(bl) && bl >= 0 && bl <= 10)) errs.push(`${at}: blueprint_level must be 0 to 10`);
      else if (auditPresent) {
        const audit = new Map();
        for (const e of a.claude_prep_audit || []) {
          const m = nonEmpty(e && e.clause) && e.clause.match(/^([a-z-]+)\.(\d+)\.(\d+)$/);
          if (!m || m[1] !== a.id) { errs.push(`${at}: audit entry names '${e && e.clause}', not a clause of this axis`); continue; }
          const r = a.rungs[Number(m[2])];
          const c = r && Array.isArray(r.clauses) ? r.clauses.find((x) => x && x.id === e.clause) : null;
          if (!c) { errs.push(`${at}: audit entry names unknown clause ${e.clause}`); continue; }
          if (!nonEmpty(e.evidence)) errs.push(`${at}: audit entry ${e.clause} has no evidence`);
          else if (c.claude_prep !== e.evidence) errs.push(`${at}: audit entry ${e.clause} cites ${e.evidence} but the clause cites ${c.claude_prep}`);
          audit.set(e.clause, e);
        }
        for (let ri = 1; ri <= bl; ri++) for (const c of (a.rungs[ri] && a.rungs[ri].clauses) || []) {
          if (c && nonEmpty(c.id) && !audit.has(c.id)) errs.push(`${at}: clause ${c.id} is at or below blueprint_level ${bl} with no audit entry`);
        }
      }
    }
    for (const w of WORLDS) {
      const t = a.worlds && a.worlds[w];
      if (!t) { errs.push(`${at}: no translation for world ${w}`); continue; }
      if (t.na) { if (!reasoned(t.na)) errs.push(`${at}: world ${w} is not applicable without a reason`); continue; }
      if (!nonEmpty(t.r5) || !nonEmpty(t.r10)) { errs.push(`${at}: world ${w} needs rung 5 and rung 10 in its own terms`); continue; }
    }
  }
  // references: a clause named in a world line or a clause text exists; a site requirement named in a clause exists
  const clauses = clauseIndex(atlas);
  const platformIds = new Set((Array.isArray(atlas.platform) ? atlas.platform : []).map((p) => p && p.id));
  const named = (text, where) => {
    for (const m of String(text).matchAll(CLAUSE_REF)) if (axisIds.has(m[1]) && !clauses.has(m[0])) errs.push(`${where} names unknown clause ${m[0]}`);
  };
  for (const a of atlas.axes) {
    for (const w of WORLDS) { const t = a.worlds && a.worlds[w]; if (t && !t.na) { named(t.r5, `axis ${a.id} world ${w}`); named(t.r10, `axis ${a.id} world ${w}`); } }
    for (const r of Array.isArray(a.rungs) ? a.rungs : []) for (const c of (r && Array.isArray(r.clauses) ? r.clauses : [])) {
      if (!c || !nonEmpty(c.text)) continue;
      named(c.text, `clause ${c.id}`);
      for (const m of c.text.matchAll(/site requirement ([a-z][a-z-]*)/g)) if (!platformIds.has(m[1])) errs.push(`clause ${c.id} names unknown site requirement ${m[1]}`);
    }
  }
  if (!nonEmpty(atlas.world_rule)) errs.push('atlas has no world_rule');
  // the site block
  if (!Array.isArray(atlas.platform) || !atlas.platform.length) errs.push('atlas has no platform requirements');
  else {
    const seen = new Set();
    for (const p of atlas.platform) {
      const at = `site requirement ${(p && p.id) || '(no id)'}`;
      if (!p || !nonEmpty(p.id)) errs.push(`${at}: no id`);
      else { if (seen.has(p.id)) errs.push(`${at}: duplicate id`); seen.add(p.id); }
      for (const k of ['requirement', 'how_checked']) if (!p || !nonEmpty(p[k])) errs.push(`${at}: no ${k}`);
    }
  }
  // the style gates
  if (!Array.isArray(atlas.style_gates) || !atlas.style_gates.length) errs.push('atlas has no style gates');
  else {
    const seen = new Set();
    for (const g of atlas.style_gates) {
      const at = `style gate ${(g && g.id) || '(no id)'}`;
      if (!g || !nonEmpty(g.id)) errs.push(`${at}: no id`);
      else { if (seen.has(g.id)) errs.push(`${at}: duplicate id`); seen.add(g.id); }
      for (const k of ['ban', 'how_counted']) if (!g || !nonEmpty(g[k])) errs.push(`${at}: no ${k}`);
      if (!g || !axisIds.has(g.axis)) errs.push(`${at}: caps unknown axis ${g && g.axis}`);
      if (!g || !(Number.isInteger(g.cap) && g.cap >= 0 && g.cap <= 10)) errs.push(`${at}: cap must be a rung 0 to 10`);
      if (!g || typeof g.blocks_shipping !== 'boolean') errs.push(`${at}: blocks_shipping must be true or false`);
    }
  }
  // the bindings schema
  const req = atlas.bindings_schema && atlas.bindings_schema.required;
  if (!Array.isArray(req)) errs.push('atlas has no bindings_schema.required');
  else for (const k of BINDINGS) if (!req.includes(k)) errs.push(`bindings_schema does not require ${k}`);
  return errs;
}

// covers entries: {"feature": "<id>", "clause": "<axis>.<rung>.<n>"}
export function checkCoverage(atlas, features) {
  const errs = [];
  const known = new Set(features.map((f) => f.id));
  const clauses = clauseIndex(atlas);
  const covered = new Map();
  for (const a of atlas.axes) for (const c of a.covers || []) {
    if (!known.has(c.feature)) { errs.push(`axis ${a.id} cites unknown feature ${c.feature}`); continue; }
    const hit = clauses.get(c.clause);
    if (!hit || hit.axis !== a.id) { errs.push(`axis ${a.id} places ${c.feature} on '${c.clause}', not a clause of this axis`); continue; }
    if (hit.rung > 5) { errs.push(`axis ${a.id} places ${c.feature} at rung ${hit.rung} (${c.clause}); Claude Prep features sit at rung 5 or below`); continue; }
    covered.set(c.feature, true);
  }
  const missing = features.filter((f) => !covered.has(f.id)).map((f) => f.id);
  if (missing.length) errs.push(`${missing.length} Claude Prep feature(s) covered by no clause: ${missing.join(', ')}`);
  return errs;
}

export function checkIdeas(atlas, ideas) {
  const errs = [];
  const axes = new Set(atlas.axes.map((a) => a.id));
  for (const i of ideas) {
    const at = `idea ${i.id} (${i.title})`;
    if (!['rung', 'exists', 'rejected'].includes(i.disposition)) { errs.push(`${at}: no disposition`); continue; }
    if (!nonEmpty(i.reason)) errs.push(`${at}: no reason`);
    if (i.disposition === 'rung') {
      if (!axes.has(i.axis)) errs.push(`${at}: axis ${i.axis} is not in the atlas`);
      if (!(Number.isInteger(i.rung) && i.rung >= 0 && i.rung <= 10)) errs.push(`${at}: rung ${i.rung} is not 0 to 10`);
    }
    if (i.disposition === 'rejected' && !reasoned(i.reason)) errs.push(`${at}: a rejection needs a real reason`);
  }
  return errs;
}

// a lab's bindings, in the shape of atlas.json bindings_schema
export function checkBindings(id, b) {
  const errs = [];
  if (!b || typeof b !== 'object') return [`${id}: declares no bindings, so no axis can be graded`];
  for (const k of BINDINGS) if (b[k] == null) errs.push(`${id}: bindings lack ${k}`);
  const c = b.canon;
  if (c && !(nonEmpty(c.name) && nonEmpty(c.source))) errs.push(`${id}: bindings canon needs a name and a source`);
  const units = Array.isArray(b.units) ? b.units : null;
  if (b.units != null && !(units && units.length)) errs.push(`${id}: bindings units must list at least 1 unit`);
  const unitIds = new Set();
  for (const u of units || []) {
    if (!u || !nonEmpty(u.id) || !nonEmpty(u.name)) errs.push(`${id}: every unit needs an id and a name`);
    else { if (unitIds.has(u.id)) errs.push(`${id}: duplicate unit ${u.id}`); unitIds.add(u.id); }
  }
  const bp = b.challenge_blueprint;
  if (bp && typeof bp === 'object') {
    if ('na' in bp) { if (!reasoned(bp.na)) errs.push(`${id}: a challenge blueprint marked not applicable needs a reason`); }
    else {
      const w = bp.units && typeof bp.units === 'object' ? Object.entries(bp.units) : [];
      if (!w.length) errs.push(`${id}: the challenge blueprint weighs no unit`);
      for (const [u] of w) if (!unitIds.has(u)) errs.push(`${id}: the challenge blueprint weighs undeclared unit ${u}`);
      const sum = w.reduce((s, [, x]) => s + (Number(x) || 0), 0);
      if (w.length && Math.abs(sum - 100) > 0.5) errs.push(`${id}: the challenge blueprint weights sum to ${sum}, not 100`);
      if (!(Array.isArray(bp.formats) && bp.formats.length)) errs.push(`${id}: the challenge blueprint lists no format`);
      if (!(Number.isInteger(bp.items) && bp.items > 0)) errs.push(`${id}: the challenge blueprint needs an item count`);
      if (!(typeof bp.minutes === 'number' && bp.minutes > 0)) errs.push(`${id}: the challenge blueprint needs its minutes`);
    }
  }
  const s = b.central_scene;
  if (s && !(nonEmpty(s.description) && nonEmpty(s.source))) errs.push(`${id}: the central scene needs a description and a source`);
  const inv = b.fiction_inventory;
  if (inv != null) {
    if (!Array.isArray(inv) || inv.length < MIN_INVENTORY) errs.push(`${id}: the fiction inventory needs at least ${MIN_INVENTORY} entries`);
    const ids = new Set();
    for (const e of Array.isArray(inv) ? inv : []) {
      if (!e || !nonEmpty(e.id) || !nonEmpty(e.capability) || !nonEmpty(e.source)) errs.push(`${id}: every inventory entry needs an id, a capability and a source`);
      else { if (ids.has(e.id)) errs.push(`${id}: duplicate inventory entry ${e.id}`); ids.add(e.id); }
    }
  }
  const f = b.known_setup_failures;
  if (f != null) {
    if (!Array.isArray(f)) { if (!(f && reasoned(f.na))) errs.push(`${id}: known setup failures need entries or a reasoned not applicable`); }
    else {
      if (!f.length) errs.push(`${id}: known setup failures need at least 1 entry or a reasoned not applicable`);
      for (const e of f) if (!e || !nonEmpty(e.failure) || !nonEmpty(e.diagnosis)) errs.push(`${id}: every known setup failure needs the failure and its diagnosis`);
    }
  }
  return errs;
}

// a ladder on the atlas: {"atlas": <version>, "inherits": [axis ids], "na": {axis id: reason}, "bindings": {...}, "axes": [own subject axes]}
export function checkLadder(id, ladder, atlas) {
  const errs = [];
  const product = atlas.axes.filter((a) => a.kind === 'product').map((a) => a.id);
  const inh = new Set(ladder.inherits || []);
  const na = ladder.na || {};
  for (const p of product) {
    if (inh.has(p)) continue;
    if (reasoned(na[p])) continue;
    errs.push(`${id}: product axis ${p} is neither inherited nor marked not applicable with a reason`);
  }
  const naCount = Object.keys(na).filter((k) => product.includes(k)).length;
  if (naCount > MAX_NA) errs.push(`${id}: ${naCount} product axes marked not applicable; at most ${MAX_NA}, because a weak axis is graded, not excused`);
  for (const x of inh) if (!atlas.axes.some((a) => a.id === x)) errs.push(`${id}: inherits unknown axis ${x}`);
  if (!(ladder.axes || []).some((a) => a.kind === 'subject' || a.frame)) errs.push(`${id}: has no subject axis of its own`);
  errs.push(...checkBindings(id, ladder.bindings));
  return errs;
}

function check() {
  if (!fs.existsSync(ATLAS)) { console.log('NOT_CHECKED: labs/levels/atlas.json does not exist yet'); return; }
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  // The public atlas names no file of the private Claude Prep repository. Where each clause is met, and the audit
  // behind every blueprint_level, live in a private file that is merged in here when present.
  const hasAudit = fs.existsSync(AUDIT);
  if (hasAudit) {
    const priv = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
    for (const a of atlas.axes || []) {
      for (const r of a.rungs || []) for (const c of (r && r.clauses) || []) c.claude_prep = (priv.clauses && priv.clauses[c.id]) || null;
      if (a.kind === 'product') a.claude_prep_audit = (priv.audit && priv.audit[a.id]) || [];
    }
  }
  const errs = checkAtlas(atlas, { audit: hasAudit ? 'present' : 'absent' });
  const notes = [];
  if (fs.existsSync(FEATURES)) errs.push(...checkCoverage(atlas, JSON.parse(fs.readFileSync(FEATURES, 'utf8'))));
  else notes.push('NOT_CHECKED A2: the Claude Prep feature inventory is private and absent here');
  if (fs.existsSync(IDEAS)) errs.push(...checkIdeas(atlas, JSON.parse(fs.readFileSync(IDEAS, 'utf8')).ideas));
  else notes.push('NOT_CHECKED A3: the pattern catalogue is private and absent here');
  if (!hasAudit) notes.push('NOT_CHECKED A5: the Claude Prep clause audit is private and absent here');
  let ladders = 0;
  for (const f of fs.readdirSync(LADDERS).filter((n) => n.endsWith('.json') && n !== 'atlas.json')) {
    const l = JSON.parse(fs.readFileSync(path.join(LADDERS, f), 'utf8'));
    if (l.atlas == null) continue;
    ladders++;
    errs.push(...checkLadder(f.replace(/\.json$/, ''), l, atlas));
  }
  for (const n of notes) console.log(n);
  if (errs.length) { console.log(`atlas: ${errs.length} problem(s)`); for (const e of errs) console.log('  ' + e); process.exit(1); }
  const clauses = clauseIndex(atlas);
  const upTo5 = [...clauses.values()].filter((c) => c.rung <= 5).length;
  console.log(`atlas: ${atlas.axes.length} axes complete, ${clauses.size} clauses (${upTo5} up to rung 5); ${ladders} lab ladder(s) on the atlas carry every product axis and their bindings`);
}

function selftest() {
  const R = (axis, ri, n = 1, cp = 'x.ts:f') => ({ text: `rung ${ri}`, clauses: Array.from({ length: n }, (_, i) => ({ id: `${axis}.${ri}.${i + 1}`, text: `clause ${i + 1}`, claude_prep: ri === 0 ? null : cp })) });
  const rungsFor = (axis) => Array.from({ length: 11 }, (_, i) => R(axis, i));
  const worlds = Object.fromEntries(WORLDS.map((w) => [w, { r5: 'five here', r10: 'ten here' }]));
  const audit = (axis, bl) => Array.from({ length: bl }, (_, i) => ({ clause: `${axis}.${i + 1}.1`, evidence: 'x.ts:f' }));
  const mem = { id: 'memory', kind: 'product', name: 'Progress and memory', metric: 'm', how_checked: 'h', rungs: rungsFor('memory'), worlds,
    covers: [{ feature: 'f-log', clause: 'memory.5.1' }, { feature: 'f-home', clause: 'memory.4.1' }], blueprint_level: 5, claude_prep_audit: audit('memory', 5) };
  const fic = { id: 'fiction', kind: 'subject', name: 'Fiction made real', metric: 'm', how_checked: 'h', rungs: rungsFor('fiction'), worlds };
  const shell = {
    world_rule: 'A world line substitutes only the clauses it names.',
    platform: [{ id: 'site-fonts', requirement: 'Fonts from approved hosts.', how_checked: 'Grep the pages.' }],
    style_gates: [{ id: 'glass-blur', ban: 'A frosted panel.', how_counted: 'Count backdrop blurs.', axis: 'fiction', cap: 4, blocks_shipping: true }],
    bindings_schema: { required: [...BINDINGS] },
  };
  const good = { ...shell, axes: [mem, fic] };
  const withAxis = (patch) => ({ ...shell, axes: [{ ...mem, ...patch }, fic] });
  const setClause = (axis, ri, ci, patch) => axis.rungs.map((r, i) => (i !== ri ? r : { ...r, clauses: r.clauses.map((c, j) => (j !== ci ? c : { ...c, ...patch })) }));
  const feats = [{ id: 'f-log' }, { id: 'f-home' }];
  const inv = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, capability: 'writes the script', detail: 'film', source: 'scene 3' }));
  const bind = {
    canon: { name: 'Story of Your Life', source: 'Chiang 1998', kind: 'source fiction' },
    units: [{ id: 'u1', name: 'Roles', weight: 60 }, { id: 'u2', name: 'Tense', weight: 40 }],
    challenge_blueprint: { units: { u1: 60, u2: 40 }, formats: ['single'], items: 20, minutes: 30 },
    central_scene: { description: 'The pod conversation', source: 'Arrival, final act' },
    fiction_inventory: inv,
    known_setup_failures: [{ id: 'f1', failure: 'No WebGL', diagnosis: 'This browser cannot draw the scene.' }],
  };
  const ladder = (patch) => ({ atlas: 3, inherits: ['memory'], axes: [{ kind: 'subject' }], bindings: bind, ...patch });
  const why = 'a single-visit installation keeps no history by design';
  const many = { ...shell, axes: ['p1', 'p2', 'p3', 'p4'].map((id) => ({ ...mem, id, rungs: rungsFor(id), covers: [], claude_prep_audit: audit(id, 5) })) };
  const cases = [
    ['a complete atlas passes', checkAtlas(good).length === 0],
    ['ten rungs fail', checkAtlas(withAxis({ rungs: mem.rungs.slice(1) })).some((e) => e.includes('eleven'))],
    ['a rung written as a string fails', checkAtlas(withAxis({ rungs: [...mem.rungs.slice(0, 10), 'rung 10'] })).some((e) => e.includes('rung 10 must be an object'))],
    ['a rung without text fails', checkAtlas(withAxis({ rungs: [...mem.rungs.slice(0, 10), { ...mem.rungs[10], text: ' ' }] })).some((e) => e.includes('rung 10 has no text'))],
    ['a rung without clauses fails', checkAtlas(withAxis({ rungs: [...mem.rungs.slice(0, 10), { text: 'rung 10', clauses: [] }] })).some((e) => e.includes('rung 10 has no clause'))],
    ['a clause id on the wrong rung fails', checkAtlas(withAxis({ rungs: setClause(mem, 7, 0, { id: 'memory.6.1' }) })).some((e) => e.includes('expected memory.7.1'))],
    ['a clause id of another axis fails', checkAtlas(withAxis({ rungs: setClause(mem, 7, 0, { id: 'fiction.7.1' }) })).some((e) => e.includes('expected memory.7.1'))],
    ['a duplicate clause id fails', checkAtlas({ ...shell, axes: [{ ...mem, rungs: mem.rungs.map((r, i) => (i !== 8 ? r : R('memory', 8, 2))).map((r, i) => (i !== 8 ? r : { ...r, clauses: [r.clauses[0], { ...r.clauses[1], id: 'memory.8.1' }] })) }, fic] }).some((e) => e.includes('duplicate id'))],
    ['a clause without text fails', checkAtlas(withAxis({ rungs: setClause(mem, 7, 0, { text: '' }) })).some((e) => e.includes('memory.7.1: no text'))],
    ['with the private audit absent, clauses need no claude_prep and no audit entries', (() => {
      const bare = JSON.parse(JSON.stringify(good));
      for (const a of bare.axes) { delete a.claude_prep_audit; for (const r of a.rungs) for (const c of r.clauses) delete c.claude_prep; }
      return checkAtlas(bare, { audit: 'absent' }).length === 0 && checkAtlas(bare).length > 0;
    })()],
    ['a clause without claude_prep fails', checkAtlas(withAxis({ rungs: setClause(mem, 7, 0, { claude_prep: undefined }) })).some((e) => e.includes('claude_prep'))],
    ['a clause at or below blueprint_level without an audit entry fails', checkAtlas(withAxis({ claude_prep_audit: audit('memory', 4) })).some((e) => e.includes('memory.5.1') && e.includes('no audit entry'))],
    ['an audit entry naming an unknown clause fails', checkAtlas(withAxis({ claude_prep_audit: [...audit('memory', 5), { clause: 'memory.5.9', evidence: 'x.ts:f' }] })).some((e) => e.includes('unknown clause memory.5.9'))],
    ['an audit entry naming another axis fails', checkAtlas(withAxis({ claude_prep_audit: [...audit('memory', 5), { clause: 'fiction.2.1', evidence: 'x.ts:f' }] })).some((e) => e.includes('not a clause of this axis'))],
    ['an audit entry that disagrees with its clause fails', checkAtlas(withAxis({ claude_prep_audit: [...audit('memory', 4), { clause: 'memory.5.1', evidence: 'y.ts:g' }] })).some((e) => e.includes('cites y.ts:g'))],
    ['a blueprint_level out of range fails', checkAtlas(withAxis({ blueprint_level: 11 })).some((e) => e.includes('blueprint_level'))],
    ['a missing world fails', checkAtlas(withAxis({ worlds: { ...worlds, self: undefined } })).some((e) => e.includes('world self'))],
    ['a short n/a fails', checkAtlas(withAxis({ worlds: { ...worlds, self: { na: 'no' } } })).some((e) => e.includes('without a reason'))],
    ['a reasoned n/a passes', checkAtlas(withAxis({ worlds: { ...worlds, self: { na: 'breathing practice has no spatial graphics at all' } } })).length === 0],
    ['a world line naming an unknown clause fails', checkAtlas(withAxis({ worlds: { ...worlds, self: { r5: 'Instead of memory.5.4: the record.', r10: 'ten' } } })).some((e) => e.includes('unknown clause memory.5.4'))],
    ['a world line naming a real clause passes', checkAtlas(withAxis({ worlds: { ...worlds, self: { r5: 'Instead of memory.5.1: the record.', r10: 'ten' } } })).length === 0],
    ['a clause naming an unknown site requirement fails', checkAtlas(withAxis({ rungs: setClause(mem, 2, 0, { text: 'Fonts load (site requirement site-nope).' }) })).some((e) => e.includes('site-nope'))],
    ['a clause naming a real site requirement passes', checkAtlas(withAxis({ rungs: setClause(mem, 2, 0, { text: 'Fonts load (site requirement site-fonts).' }) })).length === 0],
    ['a site requirement without how_checked fails', checkAtlas({ ...good, platform: [{ id: 'site-fonts', requirement: 'r' }] }).some((e) => e.includes('no how_checked'))],
    ['an atlas without site requirements fails', checkAtlas({ ...good, platform: [] }).some((e) => e.includes('no platform'))],
    ['a style gate on an unknown axis fails', checkAtlas({ ...good, style_gates: [{ ...shell.style_gates[0], axis: 'nope' }] }).some((e) => e.includes('unknown axis nope'))],
    ['a style gate without a cap fails', checkAtlas({ ...good, style_gates: [{ ...shell.style_gates[0], cap: undefined }] }).some((e) => e.includes('cap'))],
    ['an atlas without style gates fails', checkAtlas({ ...good, style_gates: [] }).some((e) => e.includes('no style gates'))],
    ['a bindings schema that drops a binding fails', checkAtlas({ ...good, bindings_schema: { required: BINDINGS.slice(1) } }).some((e) => e.includes('canon'))],
    ['an atlas without a world rule fails', checkAtlas({ ...good, world_rule: '' }).some((e) => e.includes('world_rule'))],
    ['a product axis without covers fails', checkAtlas(withAxis({ covers: [] })).some((e) => e.includes('cites'))],
    ['full coverage passes', checkCoverage(good, feats).length === 0],
    ['an uncovered feature fails', checkCoverage(good, [...feats, { id: 'f-sync' }]).some((e) => e.includes('f-sync'))],
    ['a feature on a clause above rung 5 fails', checkCoverage(withAxis({ covers: [{ feature: 'f-log', clause: 'memory.7.1' }, { feature: 'f-home', clause: 'memory.3.1' }] }), feats).some((e) => e.includes('rung 7'))],
    ['a feature on an unknown clause fails', checkCoverage(withAxis({ covers: [{ feature: 'f-log', clause: 'memory.5.9' }, { feature: 'f-home', clause: 'memory.3.1' }] }), feats).some((e) => e.includes('memory.5.9'))],
    ['ideas with dispositions pass', checkIdeas(good, [{ id: 'P1', title: 't', disposition: 'rung', axis: 'memory', rung: 6, reason: 'r' }, { id: 'P2', title: 't', disposition: 'exists', reason: 'llm.js already does it' }]).length === 0],
    ['an idea without disposition fails', checkIdeas(good, [{ id: 'P3', title: 't', disposition: null }]).length === 1],
    ['an idea on an unknown axis fails', checkIdeas(good, [{ id: 'P4', title: 't', disposition: 'rung', axis: 'nope', rung: 5, reason: 'r' }]).some((e) => e.includes('nope'))],
    ['a lazy rejection fails', checkIdeas(good, [{ id: 'P5', title: 't', disposition: 'rejected', reason: 'meh' }]).some((e) => e.includes('real reason'))],
    ['a ladder that inherits and binds passes', checkLadder('x', ladder({}), good).length === 0],
    ['a ladder that drops a product axis fails', checkLadder('x', ladder({ inherits: [] }), good).some((e) => e.includes('memory'))],
    ['a ladder with a reasoned n/a passes', checkLadder('x', ladder({ inherits: [], na: { memory: why } }), good).length === 0],
    ['four not-applicable product axes fail', checkLadder('x', ladder({ inherits: [], na: { p1: why, p2: why, p3: why, p4: why } }), many).some((e) => e.includes('at most 3'))],
    ['three not-applicable product axes pass', checkLadder('x', ladder({ inherits: ['p4'], na: { p1: why, p2: why, p3: why } }), many).length === 0],
    ['a ladder without subject axes fails', checkLadder('x', ladder({ axes: [] }), good).some((e) => e.includes('subject'))],
    ['a ladder without bindings fails', checkLadder('x', ladder({ bindings: undefined }), good).some((e) => e.includes('declares no bindings'))],
    ['bindings without a central scene fail', checkLadder('x', ladder({ bindings: { ...bind, central_scene: undefined } }), good).some((e) => e.includes('lack central_scene'))],
    ['a canon without a source fails', checkLadder('x', ladder({ bindings: { ...bind, canon: { name: 'x' } } }), good).some((e) => e.includes('canon needs'))],
    ['an empty unit list fails', checkLadder('x', ladder({ bindings: { ...bind, units: [] } }), good).some((e) => e.includes('at least 1 unit'))],
    ['blueprint weights that do not sum to 100 fail', checkLadder('x', ladder({ bindings: { ...bind, challenge_blueprint: { ...bind.challenge_blueprint, units: { u1: 60, u2: 30 } } } }), good).some((e) => e.includes('sum to 90'))],
    ['a blueprint that weighs an undeclared unit fails', checkLadder('x', ladder({ bindings: { ...bind, challenge_blueprint: { ...bind.challenge_blueprint, units: { u1: 60, u9: 40 } } } }), good).some((e) => e.includes('undeclared unit u9'))],
    ['a blueprint without formats fails', checkLadder('x', ladder({ bindings: { ...bind, challenge_blueprint: { ...bind.challenge_blueprint, formats: [] } } }), good).some((e) => e.includes('no format'))],
    ['a reasoned not-applicable blueprint passes', checkLadder('x', ladder({ bindings: { ...bind, challenge_blueprint: { na: 'a breathing practice has no summative test at all' } } }), good).length === 0],
    ['a short not-applicable blueprint fails', checkLadder('x', ladder({ bindings: { ...bind, challenge_blueprint: { na: 'none' } } }), good).some((e) => e.includes('needs a reason'))],
    ['a fiction inventory of 9 fails', checkLadder('x', ladder({ bindings: { ...bind, fiction_inventory: inv.slice(1) } }), good).some((e) => e.includes('at least 10'))],
    ['an inventory entry without a source fails', checkLadder('x', ladder({ bindings: { ...bind, fiction_inventory: [...inv.slice(1), { id: 'i9', capability: 'c' }] } }), good).some((e) => e.includes('a capability and a source'))],
    ['an empty list of setup failures fails', checkLadder('x', ladder({ bindings: { ...bind, known_setup_failures: [] } }), good).some((e) => e.includes('at least 1 entry'))],
    ['a setup failure without its diagnosis fails', checkLadder('x', ladder({ bindings: { ...bind, known_setup_failures: [{ id: 'f1', failure: 'x' }] } }), good).some((e) => e.includes('its diagnosis'))],
    ['a reasoned not-applicable list of setup failures passes', checkLadder('x', ladder({ bindings: { ...bind, known_setup_failures: { na: 'a static page with nothing to install or connect' } } }), good).length === 0],
  ];
  const fail = cases.filter(([, ok]) => !ok);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`atlas selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const cmd = process.argv[2] || 'check';
if (cmd === 'check') check();
else if (cmd === 'selftest') selftest();
else { console.log('usage: node tools/atlas.mjs [check|selftest]'); process.exit(2); }
