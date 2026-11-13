// Stories: proves every lab's plan accounts for every atlas clause between its graded level and rung 5.
//
// A lab's plan lives in _reference/labs/plans/<lab>/ (private, gitignored):
//   plan.json     {"lab", "world", "bindings": {...}, "na": {axis: reason}, "grade": {axis: {"level": n, "evidence"}},
//                  "met": {"<clause id>": "<evidence>"}}
//   stories.json  [story, ...]
// Platform stories, built once for every lab, live in _reference/labs/plans/_platform/stories.json.
//
// The rule (META_PLAN.md): for every axis the lab does not mark not applicable, every clause of every rung from its
// graded level + 1 up to 5 is either met (with evidence) or cited by at least one of the lab's own stories. A
// platform story never covers a lab's clause by itself: the lab binds it with its own story that depends on it.
//
// usage: node tools/stories.mjs [check [<lab>]|report|selftest]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ATLAS = path.join(ROOT, 'labs', 'levels', 'atlas.json');
const PLANS = path.join(ROOT, '_reference', 'labs', 'plans');
const TARGET = 5;
const SIZES = ['S', 'M', 'L'];
const STATUS = ['open', 'built', 'verified'];
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

// returns {errs, need, covered, missing}
export function checkLab(atlas, plan, stories, platform) {
  const idx = clauseIndex(atlas);
  const errs = [];
  const ids = new Set([...stories, ...platform].map((s) => s.id));
  if (ids.size !== stories.length + platform.length) errs.push(`${plan.lab}: duplicate story ids`);
  for (const s of stories) errs.push(...checkStory(s, idx, ids, plan.lab));
  errs.push(...cycles([...stories, ...platform]));
  const na = plan.na || {};
  const naProduct = Object.keys(na).filter((k) => atlas.axes.some((a) => a.id === k && a.kind === 'product'));
  if (naProduct.length > 3) errs.push(`${plan.lab}: ${naProduct.length} product axes not applicable; at most 3`);
  for (const k of Object.keys(na)) if (!nonEmpty(na[k]) || na[k].trim().length < 20) errs.push(`${plan.lab}: not applicable ${k} without a reason`);
  for (const k of ['canon', 'units', 'challenge_blueprint', 'central_scene', 'fiction_inventory', 'known_setup_failures'])
    if (plan.bindings == null || plan.bindings[k] == null) errs.push(`${plan.lab}: bindings.${k} missing`);
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
  for (const s of stories) for (const d of s.depends_on || []) {
    // a lab story that leans on a platform story must cite at least one clause itself (the binding)
    if (platform.some((p) => p.id === d) && !(s.clauses || []).length) errs.push(`${plan.lab} ${s.id}: binds platform story ${d} without citing a clause`);
  }
  if (missing.length) errs.push(`${plan.lab}: ${missing.length} clause(s) up to rung ${TARGET} owned by no story and not met: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' ...' : ''}`);
  return { errs, need: need.length, covered: need.length - missing.length, missing };
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
  let total = 0, covered = 0;
  for (const lab of loaded.labs.filter((l) => !only || l === only)) {
    const plan = readJSON(path.join(PLANS, lab, 'plan.json'));
    const sf = path.join(PLANS, lab, 'stories.json');
    const stories = fs.existsSync(sf) ? readJSON(sf) : [];
    const r = checkLab(atlas, plan, stories, loaded.platform);
    total += r.need; covered += r.covered;
    if (report) console.log(`${lab.padEnd(18)} stories ${String(stories.length).padStart(3)}  clauses to rung ${TARGET}: ${r.covered}/${r.need}`);
    errs.push(...r.errs);
  }
  if (errs.length) { console.log(`stories: ${errs.length} problem(s)`); for (const e of errs) console.log('  ' + e); process.exit(1); }
  console.log(`stories: ${loaded.labs.length} lab plan(s), ${loaded.platform.length} platform stories; every clause up to rung ${TARGET} is met or owned (${covered}/${total})`);
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
  const recClauses = (from) => { const out = []; for (let r = from; r <= 5; r++) out.push(`records.${r}.1`, `records.${r}.2`); return out; };
  const ficClauses = (from) => { const out = []; for (let r = from; r <= 5; r++) out.push(`fiction.${r}.1`); return out; };
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
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`stories selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const [cmd = 'check', arg] = process.argv.slice(2);
if (cmd === 'check') check(arg, false);
else if (cmd === 'report') check(arg, true);
else if (cmd === 'selftest') selftest();
else { console.log('usage: node tools/stories.mjs [check [<lab>]|report|selftest]'); process.exit(2); }
