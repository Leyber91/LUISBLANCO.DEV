// Stories: proves every lab's plan accounts for every atlas clause between its graded level and rung 5.
//
// A lab's plan lives in _reference/labs/plans/<lab>/ (private, gitignored):
//   plan.json     {"lab", "world", "bindings": {...}, "na": {axis: reason}, "grade": {axis: {"level": n, "evidence"}},
//                  "met": {"<clause id>": "<evidence>"}, "binding_notes": {"<template key>": {"on_this_lab", ...}}}
//   stories.json  [story, ...]
// Platform stories, built once for every lab, live in _reference/labs/plans/_platform/stories.json.
//
// The rule (META_PLAN.md): for every axis the lab does not mark not applicable, every clause of every rung from its
// graded level + 1 up to 5 is either met (with evidence) or cited by at least one of the lab's own stories. A
// platform story never covers a lab's clause by itself: the lab binds it with its own story that depends on it.
//
// Product-axis stories are not hand-written per lab. _platform/binding_templates.json holds one template per group
// of product clauses; `scaffold <lab>` instantiates them for a lab from its plan.json (dropping clauses that are
// met, not applicable or at or below its grade), and each instance carries "on_this_lab": what the template means
// on that lab's own instrument, written in plan.json binding_notes. Subject stories are written by hand.
//
// usage: node tools/stories.mjs [check [<lab>]|report|scaffold <lab>|selftest]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ATLAS = path.join(ROOT, 'labs', 'levels', 'atlas.json');
const PLANS = path.join(ROOT, '_reference', 'labs', 'plans');
const TARGET = 5;
const SIZES = ['S', 'M', 'L'];
const STATUS = ['open', 'built', 'verified'];
const BINDINGS = ['canon', 'units', 'challenge_blueprint', 'central_scene', 'fiction_inventory', 'known_setup_failures'];
const MIN_NOTE = 40;
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

/* clause index from the atlas: id -> {axis, rung, kind} */
export function clauseIndex(atlas) {
  const idx = new Map();
  for (const a of atlas.axes) (a.rungs || []).forEach((r, rung) => {
    for (const c of (r && r.clauses) || []) idx.set(c.id, { axis: a.id, rung, kind: a.kind });
  });
  return idx;
}

export function checkStory(s, idx, ids, where) {
  const errs = [];
  const at = `${where} ${s.id || '(no id)'}`;
  for (const k of ['id', 'title', 'as_a', 'i_want', 'so_that']) if (!nonEmpty(s[k])) errs.push(`${at}: no ${k}`);
  if (!Array.isArray(s.clauses) || !s.clauses.length) errs.push(`${at}: cites no atlas clause`);
  for (const c of s.clauses || []) if (!idx.has(c)) errs.push(`${at}: unknown clause ${c}`);
  if (!Array.isArray(s.acceptance) || !s.acceptance.length || !s.acceptance.every(nonEmpty)) errs.push(`${at}: needs testable acceptance criteria`);
  if (!SIZES.includes(s.size)) errs.push(`${at}: size must be S, M or L`);
  if (s.size === 'L') errs.push(`${at}: an L story is split before it is planned`);
  if (!STATUS.includes(s.status)) errs.push(`${at}: status must be open, built or verified`);
  if (s.status === 'verified' && !nonEmpty(s.evidence)) errs.push(`${at}: verified without evidence`);
  const top = Math.max(...(s.clauses || []).filter((c) => idx.has(c)).map((c) => idx.get(c).rung), -1);
  if (top >= 0 && s.target_rung !== top) errs.push(`${at}: target_rung ${s.target_rung} but its highest clause is at rung ${top}`);
  for (const d of s.depends_on || []) if (!ids.has(d)) errs.push(`${at}: depends on unknown story ${d}`);
  if (s.template != null && !(nonEmpty(s.on_this_lab) && s.on_this_lab.trim().length >= MIN_NOTE)) {
    errs.push(`${at}: a story from a template says what it means on this lab's own instrument (on_this_lab, ${MIN_NOTE}+ characters)`);
  }
  return errs;
}

function cycles(stories) {
  const by = new Map(stories.map((s) => [s.id, s]));
  const state = new Map(); const errs = [];
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { errs.push(`dependency cycle: ${[...trail, id].join(' -> ')}`); return; }
    state.set(id, 1);
    for (const d of (by.get(id)?.depends_on || [])) if (by.has(d)) visit(d, [...trail, id]);
    state.set(id, 2);
  };
  for (const s of stories) visit(s.id, []);
  return errs;
}

// otherIds: story ids of other labs' plans, valid as dependencies (a merged platform shares stories across pages)
// returns {errs, need, covered, missing}
export function checkLab(atlas, plan, stories, platform, otherIds = []) {
  const idx = clauseIndex(atlas);
  const errs = [];
  const ids = new Set([...stories, ...platform].map((s) => s.id));
  if (ids.size !== stories.length + platform.length) errs.push(`${plan.lab}: duplicate story ids`);
  for (const o of otherIds) ids.add(o);
  for (const s of stories) errs.push(...checkStory(s, idx, ids, plan.lab));
  errs.push(...cycles([...stories, ...platform]));
  const na = plan.na || {};
  const naProduct = Object.keys(na).filter((k) => atlas.axes.some((a) => a.id === k && a.kind === 'product'));
  if (naProduct.length > 3) errs.push(`${plan.lab}: ${naProduct.length} product axes not applicable; at most 3`);
  for (const k of Object.keys(na)) if (!nonEmpty(na[k]) || na[k].trim().length < 20) errs.push(`${plan.lab}: not applicable ${k} without a reason`);
  for (const k of BINDINGS) if (plan.bindings == null || plan.bindings[k] == null) errs.push(`${plan.lab}: bindings.${k} missing`);
  const cited = new Set(stories.flatMap((s) => s.clauses || []));
  const met = plan.met || {};
  for (const [c, ev] of Object.entries(met)) {
    if (!idx.has(c)) errs.push(`${plan.lab}: met lists unknown clause ${c}`);
    if (!nonEmpty(ev)) errs.push(`${plan.lab}: met clause ${c} has no evidence`);
  }
  const need = [], missing = [];
  for (const a of atlas.axes) {
    if (na[a.id]) continue;
    const g = plan.grade && plan.grade[a.id];
    if (!g || !Number.isInteger(g.level)) { errs.push(`${plan.lab}: no grade for axis ${a.id}`); continue; }
    for (let r = g.level + 1; r <= TARGET; r++) for (const c of (a.rungs[r] && a.rungs[r].clauses) || []) {
      need.push(c.id);
      if (!cited.has(c.id) && !met[c.id]) missing.push(c.id);
    }
  }
  if (missing.length) errs.push(`${plan.lab}: ${missing.length} clause(s) up to rung ${TARGET} owned by no story and not met: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' ...' : ''}`);
  return { errs, need: need.length, covered: need.length - missing.length, missing };
}

// Every template clause is a real product clause at rung 1 to 5, and together the templates own each exactly once.
export function checkTemplates(atlas, templates, platformIds) {
  const idx = clauseIndex(atlas);
  const errs = [];
  const keys = new Set(); const covered = new Set();
  for (const t of templates) {
    const at = `template ${t.key || '(no key)'}`;
    if (!nonEmpty(t.key) || !/^[a-z0-9-]+$/.test(t.key)) errs.push(`${at}: key must be kebab-case`);
    if (keys.has(t.key)) errs.push(`${at}: duplicate key`);
    keys.add(t.key);
    for (const k of ['title', 'as_a', 'i_want', 'so_that']) if (!nonEmpty(t[k])) errs.push(`${at}: no ${k}`);
    if (!Array.isArray(t.acceptance) || !t.acceptance.length) errs.push(`${at}: needs acceptance criteria`);
    if (!['S', 'M'].includes(t.size)) errs.push(`${at}: size must be S or M`);
    for (const d of t.depends_on || []) if (!platformIds.has(d)) errs.push(`${at}: depends on unknown platform story ${d}`);
    if (!Array.isArray(t.clauses) || !t.clauses.length) errs.push(`${at}: cites no clause`);
    for (const c of t.clauses || []) {
      const hit = idx.get(c);
      if (!hit) { errs.push(`${at}: unknown clause ${c}`); continue; }
      if (hit.kind !== 'product') errs.push(`${at}: ${c} is a subject clause; subject stories are written per lab`);
      if (hit.rung < 1 || hit.rung > TARGET) errs.push(`${at}: ${c} is outside rungs 1 to ${TARGET}`);
      if (covered.has(c)) errs.push(`${at}: ${c} is already owned by another template`);
      covered.add(c);
    }
  }
  const missing = [];
  for (const [id, hit] of idx) if (hit.kind === 'product' && hit.rung >= 1 && hit.rung <= TARGET && !covered.has(id)) missing.push(id);
  if (missing.length) errs.push(`${missing.length} product clause(s) at rungs 1 to ${TARGET} owned by no template: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' ...' : ''}`);
  return errs;
}

// Instantiate the binding templates for one lab. Pure: returns the stories; the command writes them.
export function scaffold(atlas, plan, templates, existing = []) {
  const idx = clauseIndex(atlas);
  const na = plan.na || {}, met = plan.met || {}, notes = plan.binding_notes || {};
  const out = [];
  for (const t of templates) {
    const keep = (t.clauses || []).filter((c) => {
      const at = idx.get(c);
      if (!at || na[at.axis] || met[c]) return false;
      const g = plan.grade && plan.grade[at.axis];
      return at.rung <= TARGET && at.rung > ((g && Number.isInteger(g.level)) ? g.level : 0);
    });
    if (!keep.length) continue;
    const note = notes[t.key] || {};
    const prev = existing.find((s) => s.template === t.key);
    out.push({
      id: `${plan.lab}-b-${t.key}`, template: t.key, title: t.title,
      as_a: t.as_a, i_want: t.i_want, so_that: t.so_that,
      on_this_lab: note.on_this_lab || '',
      clauses: keep, claude_prep: t.claude_prep || [],
      acceptance: [...(t.acceptance || []), ...(note.acceptance || [])],
      depends_on: [...(t.depends_on || []), ...(note.depends_on || [])],
      size: note.size || t.size, target_rung: Math.max(...keep.map((c) => idx.get(c).rung)),
      status: prev ? prev.status : 'open', evidence: prev ? (prev.evidence ?? null) : null,
    });
  }
  return [...out, ...existing.filter((s) => s.template == null)];
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function loadPlans() {
  if (!fs.existsSync(PLANS)) return null;
  const platformFile = path.join(PLANS, '_platform', 'stories.json');
  const platform = fs.existsSync(platformFile) ? readJSON(platformFile) : [];
  const labs = fs.readdirSync(PLANS, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name).filter((n) => fs.existsSync(path.join(PLANS, n, 'plan.json')));
  return { platform, labs };
}

function scaffoldCmd(lab) {
  if (!lab) { console.log('scaffold needs a lab'); process.exit(2); }
  const atlas = readJSON(ATLAS);
  const dir = path.join(PLANS, lab);
  const plan = readJSON(path.join(dir, 'plan.json'));
  const templates = readJSON(path.join(PLANS, '_platform', 'binding_templates.json'));
  const sf = path.join(dir, 'stories.json');
  const existing = fs.existsSync(sf) ? readJSON(sf) : [];
  const stories = scaffold(atlas, plan, templates, existing);
  fs.writeFileSync(sf, JSON.stringify(stories, null, 1) + '\n');
  const fromT = stories.filter((s) => s.template != null);
  const bare = fromT.filter((s) => !nonEmpty(s.on_this_lab)).map((s) => s.template);
  console.log(`${lab}: ${fromT.length} stories from templates, ${stories.length - fromT.length} written by hand`);
  if (bare.length) console.log(`  still need binding_notes.<key>.on_this_lab in plan.json: ${bare.join(', ')}`);
}

function check(only, report) {
  if (!fs.existsSync(ATLAS)) { console.log('NOT_CHECKED: labs/levels/atlas.json does not exist yet'); return; }
  const atlas = readJSON(ATLAS);
  if (!atlas.axes.every((a) => (a.rungs || []).every((r) => r && Array.isArray(r.clauses)))) { console.log('NOT_CHECKED: the atlas rungs are not split into clauses yet'); return; }
  const loaded = loadPlans();
  if (!loaded) { console.log('NOT_CHECKED: the lab plans are private and absent here'); return; }
  const idx = clauseIndex(atlas);
  const pids = new Set(loaded.platform.map((s) => s.id));
  const errs = [];
  for (const s of loaded.platform) errs.push(...checkStory(s, idx, pids, '_platform'));
  errs.push(...cycles(loaded.platform));
  const tf = path.join(PLANS, '_platform', 'binding_templates.json');
  const templates = fs.existsSync(tf) ? readJSON(tf) : null;
  if (templates) errs.push(...checkTemplates(atlas, templates, pids));
  const storiesOf = (lab) => { const sf = path.join(PLANS, lab, 'stories.json'); return fs.existsSync(sf) ? readJSON(sf) : []; };
  const all = new Map(loaded.labs.map((l) => [l, storiesOf(l)]));
  let total = 0, covered = 0, count = 0;
  for (const lab of loaded.labs.filter((l) => !only || l === only)) {
    const plan = readJSON(path.join(PLANS, lab, 'plan.json'));
    const stories = all.get(lab);
    const others = [...all].filter(([l]) => l !== lab).flatMap(([, ss]) => ss.map((x) => x.id));
    const r = checkLab(atlas, plan, stories, loaded.platform, others);
    total += r.need; covered += r.covered; count += stories.length;
    if (report) console.log(`${lab.padEnd(18)} stories ${String(stories.length).padStart(3)}  clauses to rung ${TARGET}: ${r.covered}/${r.need}`);
    errs.push(...r.errs);
  }
  if (errs.length) { console.log(`stories: ${errs.length} problem(s)`); for (const e of errs.slice(0, 200)) console.log('  ' + e); process.exit(1); }
  console.log(`stories: ${loaded.labs.length} lab plan(s) with ${count} stories, ${loaded.platform.length} platform stories${templates ? `, ${templates.length} binding templates` : ''}; every clause up to rung ${TARGET} is met or owned (${covered}/${total})`);
}

function selftest() {
  const rung = (axis, r, n) => ({ text: 't', clauses: Array.from({ length: n }, (_, i) => ({ id: `${axis}.${r}.${i + 1}`, text: 'c' })) });
  const atlas = { axes: [
    { id: 'records', kind: 'product', rungs: Array.from({ length: 11 }, (_, r) => rung('records', r, r === 0 ? 1 : 2)) },
    { id: 'fiction', kind: 'subject', rungs: Array.from({ length: 11 }, (_, r) => rung('fiction', r, 1)) },
  ] };
  const bindings = { canon: 'c', units: [], challenge_blueprint: 'b', central_scene: 's', fiction_inventory: [], known_setup_failures: [] };
  const story = (id, clauses, extra = {}) => ({ id, title: 't', as_a: 'a visitor', i_want: 'x', so_that: 'y', clauses, acceptance: ['passes'], size: 'M', status: 'open',
    target_rung: Math.max(...clauses.map((c) => +c.split('.')[1])), depends_on: [], ...extra });
  const tpl = (key, clauses) => ({ key, axis: 'records', title: 't', as_a: 'a visitor', i_want: 'x', so_that: 'y', clauses, acceptance: ['passes'], depends_on: [], size: 'M' });
  const recClauses = (from) => { const out = []; for (let r = from; r <= 5; r++) out.push(`records.${r}.1`, `records.${r}.2`); return out; };
  const ficClauses = (from) => { const out = []; for (let r = from; r <= 5; r++) out.push(`fiction.${r}.1`); return out; };
  const low = ['records.1.1', 'records.1.2', 'records.2.1', 'records.2.2', 'records.3.1', 'records.3.2'];
  const here = 'the record kinds are observations, predictions and saved configurations';
  const plan = { lab: 'x', world: 'cosmos', bindings, grade: { records: { level: 3 }, fiction: { level: 4 } } };
  const full = [story('x-1', recClauses(4)), story('x-2', ficClauses(5))];
  const plat = [story('os-1', ['records.4.1', 'records.4.2'])];
  const ok = (r) => r.errs.length === 0;
  const cases = [
    ['a complete plan passes', ok(checkLab(atlas, plan, full, []))],
    ['a missing clause fails', checkLab(atlas, plan, [story('x-1', ['records.4.1', 'records.5.1', 'records.5.2']), full[1]], []).missing.includes('records.4.2')],
    ['a met clause with evidence counts', ok(checkLab(atlas, { ...plan, met: { 'records.4.2': 'export button in view.js' } }, [story('x-1', ['records.4.1', 'records.5.1', 'records.5.2']), full[1]], []))],
    ['a met clause without evidence fails', !ok(checkLab(atlas, { ...plan, met: { 'records.4.2': '' } }, [story('x-1', ['records.4.1', 'records.5.1', 'records.5.2']), full[1]], []))],
    ['a platform story alone does not cover a lab', checkLab(atlas, plan, [story('x-1', recClauses(5)), full[1]], plat).missing.includes('records.4.1')],
    ['a lab story binding a platform story passes', ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { depends_on: ['os-1'] }), full[1]], plat))],
    ['an unknown clause fails', !ok(checkLab(atlas, plan, [...full, story('x-3', ['records.9.9'])], []))],
    ['an L story fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { size: 'L' }), full[1]], []))],
    ['a wrong target rung fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { target_rung: 4 }), full[1]], []))],
    ['verified without evidence fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { status: 'verified' }), full[1]], []))],
    ['an unknown dependency fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { depends_on: ['os-9'] }), full[1]], []))],
    ['a dependency cycle fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { depends_on: ['x-2'] }), story('x-2', ficClauses(5), { depends_on: ['x-1'] })], []))],
    ['missing bindings fail', !ok(checkLab(atlas, { ...plan, bindings: { canon: 'c' } }, full, []))],
    ['a missing grade fails', !ok(checkLab(atlas, { ...plan, grade: { records: { level: 3 } } }, full, []))],
    ['a reasoned not applicable axis is skipped', ok(checkLab(atlas, { ...plan, na: { fiction: 'this lab has no source fiction to reproduce' } }, [full[0]], []))],
    ['an axis at 5 needs nothing', ok(checkLab(atlas, { ...plan, grade: { records: { level: 5 }, fiction: { level: 5 } } }, [], []))],
    ['a dependency on another lab story is accepted when that story exists', ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { depends_on: ['y-7'] }), full[1]], [], ['y-7']))],
    ['a template story without on_this_lab fails', !ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { template: 'rec' }), full[1]], []))],
    ['a template story that says what it means here passes', ok(checkLab(atlas, plan, [story('x-1', recClauses(4), { template: 'rec', on_this_lab: here }), full[1]], []))],
    ['templates that own every product clause to rung 5 pass', checkTemplates(atlas, [tpl('rec-low', low), tpl('rec-high', recClauses(4))], new Set()).length === 0],
    ['templates that leave a product clause out fail', checkTemplates(atlas, [tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('records.1.1'))],
    ['a template citing a subject clause fails', checkTemplates(atlas, [tpl('rec-low', [...low, 'fiction.5.1']), tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('subject clause'))],
    ['two templates owning one clause fail', checkTemplates(atlas, [tpl('a', low), tpl('b', [...recClauses(4), 'records.1.1'])], new Set()).some((e) => e.includes('already owned'))],
    ['a template depending on an unknown platform story fails', checkTemplates(atlas, [tpl('rec-low', low), { ...tpl('rec-high', recClauses(4)), depends_on: ['os-9'] }], new Set(['os-1'])).some((e) => e.includes('os-9'))],
    ['scaffold keeps only clauses above the grade and not met', (() => {
      const out = scaffold(atlas, { ...plan, met: { 'records.4.2': 'done' }, binding_notes: { 'rec-high': { on_this_lab: here } } },
        [tpl('rec-low', low), tpl('rec-high', recClauses(4))], [full[1]]);
      const b = out.find((s) => s.template === 'rec-high');
      return out.length === 2 && b.id === 'x-b-rec-high' && !b.clauses.includes('records.4.2') && b.clauses.includes('records.5.2')
        && b.target_rung === 5 && out.some((s) => s.id === 'x-2') && !out.some((s) => s.template === 'rec-low');
    })()],
    ['a scaffolded plan passes the check', (() => {
      const p2 = { ...plan, binding_notes: { 'rec-high': { on_this_lab: here } } };
      return ok(checkLab(atlas, p2, scaffold(atlas, p2, [tpl('rec-high', recClauses(4))], [full[1]]), []));
    })()],
    ['scaffold skips an axis marked not applicable', scaffold(atlas, { ...plan, na: { records: 'this lab keeps no record of any kind by design' } }, [tpl('rec-high', recClauses(4))], []).length === 0],
    ['scaffold keeps the status of a story it rebuilds', scaffold(atlas, plan, [tpl('rec-high', recClauses(4))], [{ id: 'x-b-rec-high', template: 'rec-high', status: 'built', evidence: 'abc123' }])[0].status === 'built'],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`stories selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const [cmd = 'check', arg] = process.argv.slice(2);
if (cmd === 'check') check(arg, false);
else if (cmd === 'report') check(arg, true);
else if (cmd === 'scaffold') scaffoldCmd(arg);
else if (cmd === 'selftest') selftest();
else { console.log('usage: node tools/stories.mjs [check [<lab>]|report|scaffold <lab>|selftest]'); process.exit(2); }
