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
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath turns %20 back into a space; a URL's pathname keeps it, and the files are then not found
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const ATLAS = path.join(ROOT, 'labs', 'levels', 'atlas.json');
const PLANS = path.join(ROOT, '_reference', 'labs', 'plans');
const TARGET = 5;
const SIZES = ['S', 'M', 'L'];
const STATUS = ['open', 'built', 'verified'];
const BINDINGS = ['canon', 'units', 'challenge_blueprint', 'central_scene', 'fiction_inventory', 'known_setup_failures'];
const MIN_NOTE = 40;
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
// a list read from a plan: anything that is not a list is read as none (checkStory and checkTemplates report it once)
const asList = (x) => (Array.isArray(x) ? x : []);

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
  const clauses = Array.isArray(s.clauses) ? s.clauses : [];   // a word in place of the list is reported above, never iterated
  // a list holding lists or objects is the wrong shape: said once, and never read clause by clause
  if (!clauses.every((c) => typeof c === 'string')) errs.push(`${at}: clauses must be a list of clause ids`);
  else for (const c of clauses) if (!idx.has(c)) errs.push(`${at}: unknown clause ${c}`);
  if (!Array.isArray(s.acceptance) || !s.acceptance.length || !s.acceptance.every(nonEmpty)) errs.push(`${at}: needs testable acceptance criteria`);
  if (!SIZES.includes(s.size)) errs.push(`${at}: size must be S, M or L`);
  if (s.size === 'L') errs.push(`${at}: an L story is split before it is planned`);
  if (!STATUS.includes(s.status)) errs.push(`${at}: status must be open, built or verified`);
  if (s.status === 'verified' && !nonEmpty(s.evidence)) errs.push(`${at}: verified without evidence`);
  const top = Math.max(...clauses.filter((c) => idx.has(c)).map((c) => idx.get(c).rung), -1);
  if (top >= 0 && s.target_rung !== top) errs.push(`${at}: target_rung ${s.target_rung} but its highest clause is at rung ${top}`);
  if (s.depends_on != null && !Array.isArray(s.depends_on)) errs.push(`${at}: depends_on must be a list of story ids`);
  for (const d of asList(s.depends_on)) if (!ids.has(d)) errs.push(`${at}: depends on unknown story ${d}`);
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
    for (const d of asList(by.get(id)?.depends_on)) if (by.has(d)) visit(d, [...trail, id]);
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
  const cited = new Set(stories.flatMap((s) => asList(s.clauses)));   // a word in place of the list owns no clause
  const met = plan.met || {};
  for (const [c, ev] of Object.entries(met)) {
    if (!idx.has(c)) errs.push(`${plan.lab}: met lists unknown clause ${c}`);
    if (!nonEmpty(ev)) errs.push(`${plan.lab}: met clause ${c} has no evidence`);
  }
  // "Things pop up as you go up the levels" (Luis, 2026-11-13): a plan that owns every clause to rung 5 today is
  // pretending to know what the lower levels will reveal. Where a plan names the one level its stories are written
  // for (evolution.planned_through), only the clauses up to that rung must be owned; without it, the old rule holds.
  const through = plan.evolution && plan.evolution.planned_through;
  const target = Number.isInteger(through) ? Math.max(1, Math.min(TARGET, through)) : TARGET;
  const need = [], missing = [];
  for (const a of atlas.axes) {
    if (na[a.id]) continue;
    const g = plan.grade && plan.grade[a.id];
    if (!g || !Number.isInteger(g.level)) { errs.push(`${plan.lab}: no grade for axis ${a.id}`); continue; }
    for (let r = g.level + 1; r <= target; r++) for (const c of (a.rungs[r] && a.rungs[r].clauses) || []) {
      need.push(c.id);
      if (!cited.has(c.id) && !met[c.id]) missing.push(c.id);
    }
  }
  if (missing.length) errs.push(`${plan.lab}: ${missing.length} clause(s) up to rung ${target} owned by no story and not met: ${missing.slice(0, 40).join(', ')}${missing.length > 40 ? ' ...' : ''}`);
  return { errs, need: need.length, covered: need.length - missing.length, missing, target };
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
    if (!Array.isArray(t.acceptance) || !t.acceptance.length || !t.acceptance.every(nonEmpty)) errs.push(`${at}: needs acceptance criteria`);
    if (!['S', 'M'].includes(t.size)) errs.push(`${at}: size must be S or M`);
    if (t.depends_on != null && !Array.isArray(t.depends_on)) errs.push(`${at}: depends_on must be a list of platform story ids`);
    for (const d of asList(t.depends_on)) if (!platformIds.has(d)) errs.push(`${at}: depends on unknown platform story ${d}`);
    if (!Array.isArray(t.clauses) || !t.clauses.length) errs.push(`${at}: cites no clause`);
    if (!asList(t.clauses).every((c) => typeof c === 'string')) errs.push(`${at}: clauses must be a list of clause ids`);
    else for (const c of asList(t.clauses)) {
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
    const keep = asList(t.clauses).filter((c) => {
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
      acceptance: [...asList(t.acceptance), ...asList(note.acceptance)],
      depends_on: [...asList(t.depends_on), ...asList(note.depends_on)],
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
  // an atlas with four product axes, so that a plan can mark one too many not applicable
  const wide = { axes: [...atlas.axes, ...['p1', 'p2', 'p3'].map((id) => ({ id, kind: 'product', rungs: Array.from({ length: 11 }, (_, r) => rung(id, r, 1)) }))] };
  const why = 'this lab keeps no record of any kind by design';
  const safe = (f) => { try { return f(); } catch { return false; } };
  // the errors given to one story or template, so that a case can say a problem is reported once and in plain words
  const errsOf = (errs, who) => errs.filter((e) => e.startsWith(`${who}:`));
  const storyErrs = (patch) => checkLab(atlas, plan, [story('x-1', recClauses(4), patch), full[1]], []).errs;
  const tplErrs = (patch) => checkTemplates(atlas, [{ ...tpl('rec-low', low), ...patch }, tpl('rec-high', recClauses(4))], new Set(['os-1']));
  // The command itself, as `node tools/stories.mjs` runs it: a copy of this file in a fixture folder finds the
  // repository from its own location. The folder name holds a space, which a URL's pathname keeps as %20.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stories self '));
  const cli = {};
  try {
    const P = '_reference/labs/plans/';
    // a fixture folder holds a copy of this file under tools/ and the given files, each written as JSON
    const make = (name, files) => {
      const dir = path.join(root, name);
      for (const [f, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), JSON.stringify(body));
      }
      fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
      fs.copyFileSync(SELF, path.join(dir, 'tools', 'stories.mjs'));
      return dir;
    };
    const run = (dir, ...args) => {
      const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'stories.mjs'), ...args], { encoding: 'utf8', timeout: 20000 });
      return { code: r.status, out: r.stdout || '', lines: (r.stdout || '').split(/\r?\n/) };
    };
    const A = { 'labs/levels/atlas.json': atlas };
    const platform = { [`${P}_platform/stories.json`]: plat, [`${P}_platform/binding_templates.json`]: [tpl('rec-low', low), tpl('rec-high', recClauses(4))] };
    cli.valid = run(make('valid', { ...A, ...platform, [`${P}x/plan.json`]: plan, [`${P}x/stories.json`]: full }));
    // a broken platform and no lab, so that its story, cycle and template problems can only come from check() itself
    cli.platform = run(make('broken platform', { ...A,
      [`${P}_platform/stories.json`]: [story('os-1', ['records.4.1'], { title: '', depends_on: ['os-2'] }), story('os-2', ['records.4.2'], { depends_on: ['os-1'] })],
      [`${P}_platform/binding_templates.json`]: [tpl('rec-high', recClauses(4))],
    }));
    // lab x is broken and lab y is valid: the whole check fails, and `check y` checks y alone
    const two = make('broken lab', { ...A, ...platform, [`${P}x/plan.json`]: plan, [`${P}x/stories.json`]: [story('x-1', recClauses(4), { size: 'L' }), full[1]],
      [`${P}y/plan.json`]: { ...plan, lab: 'y' }, [`${P}y/stories.json`]: [story('y-1', recClauses(4)), story('y-2', ficClauses(5))] });
    cli.lab = run(two);
    cli.only = run(two, 'check', 'y');
    // as the gates run in CI: the private plans are absent; then an atlas whose rungs are not split; then no atlas at all
    cli.public = run(make('public only', A));
    cli.unsplit = run(make('unsplit atlas', { 'labs/levels/atlas.json': { axes: [atlas.axes[0], { ...atlas.axes[1], rungs: atlas.axes[1].rungs.map((r) => r.text) }] } }));
    cli.noAtlas = run(make('no atlas', {}));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
    ['a plan written for the next level only owns that level', (() => { const r = checkLab(atlas, { ...plan, na: { fiction: 'this lab has no source fiction to reproduce' }, evolution: { planned_through: 4 } }, [story('x-1', ['records.4.1', 'records.4.2'])], []); return r.errs.length === 0 && r.target === 4 && r.need === 2; })()],
    ['a plan written for the next level still has to own all of it', checkLab(atlas, { ...plan, na: { fiction: 'this lab has no source fiction to reproduce' }, evolution: { planned_through: 4 } }, [story('x-1', ['records.4.1'])], []).missing.includes('records.4.2')],
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
    ['a story without a title fails', checkLab(atlas, plan, [story('x-1', recClauses(4), { title: '' }), full[1]], []).errs.some((e) => e.includes('x x-1: no title'))],
    ['a story that cites no clause fails', checkLab(atlas, plan, [...full, story('x-3', [])], []).errs.some((e) => e.includes('x x-3: cites no atlas clause'))],
    ['a story without acceptance criteria fails', checkLab(atlas, plan, [story('x-1', recClauses(4), { acceptance: [] }), full[1]], []).errs.some((e) => e.includes('x x-1: needs testable acceptance criteria'))],
    ['a story size other than S, M or L fails', checkLab(atlas, plan, [story('x-1', recClauses(4), { size: 'XL' }), full[1]], []).errs.some((e) => e.includes('x x-1: size must be S, M or L'))],
    ['a story status other than open, built or verified fails', checkLab(atlas, plan, [story('x-1', recClauses(4), { status: 'done' }), full[1]], []).errs.some((e) => e.includes('x x-1: status must be open, built or verified'))],
    ['a lab story and a platform story with one id fail', checkLab(atlas, plan, full, [story('x-1', ['records.4.1', 'records.4.2'])]).errs.some((e) => e.includes('x: duplicate story ids'))],
    ['four product axes not applicable fail', checkLab(wide, { ...plan, na: { records: why, p1: why, p2: why, p3: why } }, [full[1]], []).errs.some((e) => e.includes('x: 4 product axes not applicable; at most 3'))],
    ['a not applicable axis with a short reason fails', checkLab(atlas, { ...plan, na: { fiction: 'none' } }, [full[0]], []).errs.some((e) => e.includes('x: not applicable fiction without a reason'))],
    ['a met clause the atlas does not have fails', checkLab(atlas, { ...plan, met: { 'records.9.9': 'export button in view.js' } }, full, []).errs.some((e) => e.includes('x: met lists unknown clause records.9.9'))],
    ['a met clause with blank evidence is reported as such, even when a story owns it', checkLab(atlas, { ...plan, met: { 'records.4.2': ' ' } }, full, []).errs.some((e) => e.includes('x: met clause records.4.2 has no evidence'))],
    ['a clause owned by no story is reported by id', checkLab(atlas, plan, [story('x-1', ['records.4.1', 'records.5.1', 'records.5.2']), full[1]], []).errs.some((e) => e.includes('x: 1 clause(s) up to rung 5 owned by no story and not met: records.4.2'))],
    ['a template key that is kebab-case only at its start or its end fails', checkTemplates(atlas, [tpl('rec_Low', low), tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec_Low: key must be kebab-case'))],
    ['two templates with one key fail', checkTemplates(atlas, [tpl('rec', low), tpl('rec', recClauses(4))], new Set()).some((e) => e.includes('template rec: duplicate key'))],
    ['a template without a title fails', checkTemplates(atlas, [{ ...tpl('rec-low', low), title: '' }, tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: no title'))],
    ['a template without acceptance criteria fails', checkTemplates(atlas, [{ ...tpl('rec-low', low), acceptance: [] }, tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: needs acceptance criteria'))],
    ['a template with a blank acceptance criterion fails', checkTemplates(atlas, [{ ...tpl('rec-low', low), acceptance: ['the record exports', ' '] }, tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: needs acceptance criteria'))],
    ['a story whose clauses are a word, a number, an object or false is reported once, never walked or thrown', ['records.4.1', 7, { 'records.4.1': true }, false].every((clauses) => safe(() => {
      const e = errsOf(checkLab(atlas, plan, [{ ...full[0], clauses }, full[1]], []).errs, 'x x-1');
      return e.length === 1 && e[0] === 'x x-1: cites no atlas clause';
    }))],
    ['a story whose clauses are a word owns no clause', checkLab(atlas, plan, [{ ...full[0], clauses: 'records.4.1' }, full[1]], []).missing.includes('records.4.1')],
    ['a template of size L fails', checkTemplates(atlas, [{ ...tpl('rec-low', low), size: 'L' }, tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: size must be S or M'))],
    ['a template that cites no clause fails', checkTemplates(atlas, [tpl('rec-low', low), tpl('rec-high', recClauses(4)), tpl('rec-none', [])], new Set()).some((e) => e.includes('template rec-none: cites no clause'))],
    ['a template citing a clause the atlas does not have fails', checkTemplates(atlas, [tpl('rec-low', [...low, 'records.9.9']), tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: unknown clause records.9.9'))],
    ['a template citing a product clause above rung 5 fails', checkTemplates(atlas, [tpl('rec-low', [...low, 'records.6.1']), tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: records.6.1 is outside rungs 1 to 5'))],
    ['a template citing a product clause at rung 0 fails', checkTemplates(atlas, [tpl('rec-low', [...low, 'records.0.1']), tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template rec-low: records.0.1 is outside rungs 1 to 5'))],
    ['a story without an id fails', storyErrs({ id: undefined }).some((e) => e.includes('x (no id): no id'))],
    ['a story without as_a fails', storyErrs({ as_a: ' ' }).some((e) => e.includes('x x-1: no as_a'))],
    ['a story without i_want fails', storyErrs({ i_want: ' ' }).some((e) => e.includes('x x-1: no i_want'))],
    ['a story without so_that fails', storyErrs({ so_that: ' ' }).some((e) => e.includes('x x-1: no so_that'))],
    ['a story with a blank acceptance criterion fails', storyErrs({ acceptance: ['passes', ' '] }).some((e) => e.includes('x x-1: needs testable acceptance criteria'))],
    ['a story whose acceptance criteria are a word is reported, never thrown', safe(() => storyErrs({ acceptance: 'it passes' }).some((e) => e.includes('x x-1: needs testable acceptance criteria')))],
    ['a verified story with blank evidence fails', storyErrs({ status: 'verified', evidence: ' ' }).some((e) => e.includes('x x-1: verified without evidence'))],
    ['a target rung above the highest clause fails', storyErrs({ target_rung: 6 }).some((e) => e.includes('x x-1: target_rung 6 but its highest clause is at rung 5'))],
    ['a template story note of 39 characters fails and one of 40 passes', storyErrs({ template: 'rec', on_this_lab: 'n'.repeat(39) }).some((e) => e.includes('x x-1: a story from a template says what it means on this lab'))
      && storyErrs({ template: 'rec', on_this_lab: 'n'.repeat(40) }).length === 0],
    ['a story whose depends_on is a word, a number, an object or false is reported once, never walked or thrown', ['os-1', 7, { 'os-1': true }, false].every((depends_on) => safe(() => {
      const e = errsOf(storyErrs({ depends_on }), 'x x-1');
      return e.length === 1 && e[0] === 'x x-1: depends_on must be a list of story ids';
    }))],
    ['three product axes not applicable pass', ok(checkLab(wide, { ...plan, na: { p1: why, p2: why, p3: why } }, full, []))],
    ['a subject axis not applicable does not count toward the product cap', ok(checkLab(wide, { ...plan, na: { p1: why, p2: why, p3: why, fiction: why } }, [full[0]], []))],
    ['a not applicable reason of 19 characters fails and one of 20 passes', checkLab(atlas, { ...plan, na: { fiction: 'n'.repeat(19) } }, [full[0]], []).errs.some((e) => e.includes('x: not applicable fiction without a reason'))
      && ok(checkLab(atlas, { ...plan, na: { fiction: 'n'.repeat(20) } }, [full[0]], []))],
    ['a plan without bindings reports each one, never throws', safe(() => { const e = checkLab(atlas, { ...plan, bindings: undefined }, full, []).errs; return BINDINGS.every((k) => e.includes(`x: bindings.${k} missing`)); })],
    ['a grade level written as a word fails', checkLab(atlas, { ...plan, grade: { records: { level: '3' }, fiction: { level: 4 } } }, full, []).errs.some((e) => e.includes('x: no grade for axis records'))],
    ['a template without a key fails', checkTemplates(atlas, [{ ...tpl('rec-low', low), key: undefined }, tpl('rec-high', recClauses(4))], new Set()).some((e) => e.includes('template (no key): key must be kebab-case'))],
    ['a template without as_a fails', tplErrs({ as_a: ' ' }).some((e) => e.includes('template rec-low: no as_a'))],
    ['a template without i_want fails', tplErrs({ i_want: ' ' }).some((e) => e.includes('template rec-low: no i_want'))],
    ['a template without so_that fails', tplErrs({ so_that: ' ' }).some((e) => e.includes('template rec-low: no so_that'))],
    ['a template whose acceptance criteria are a word is reported, never thrown', safe(() => tplErrs({ acceptance: 'it passes' }).some((e) => e.includes('template rec-low: needs acceptance criteria')))],
    ['a template whose clauses are a word, a number, an object or false is reported once, never walked or thrown', ['records.1.1', 7, { 'records.1.1': true }, false].every((clauses) => safe(() => {
      const e = errsOf(checkTemplates(atlas, [tpl('rec-low', low), tpl('rec-high', recClauses(4)), { ...tpl('rec-none', []), clauses }], new Set()), 'template rec-none');
      return e.length === 1 && e[0] === 'template rec-none: cites no clause';
    }))],
    ['a template whose depends_on is a word, a number, an object or false is reported once, never walked or thrown', ['os-1', 7, { 'os-1': true }, false].every((depends_on) => safe(() => {
      const e = errsOf(tplErrs({ depends_on }), 'template rec-low');
      return e.length === 1 && e[0] === 'template rec-low: depends_on must be a list of platform story ids';
    }))],
    ['the command passes a valid folder, found from its own path with a space in it', cli.valid.code === 0
      && cli.valid.out.includes('stories: 1 lab plan(s) with 2 stories, 1 platform stories, 2 binding templates; every clause up to rung 5 is met or owned (5/5)')],
    ['the command fails on a broken platform story, platform cycle and template, and names each', cli.platform.code === 1
      && ['_platform os-1: no title', 'dependency cycle: os-1 -> os-2 -> os-1', '6 product clause(s) at rungs 1 to 5 owned by no template'].every((m) => cli.platform.out.includes(m))],
    ['the command fails on a broken lab plan and names the problem', cli.lab.code === 1 && cli.lab.out.includes('x x-1: an L story is split before it is planned')],
    ['check <lab> checks that lab alone', cli.only.code === 0
      && cli.only.out.includes('stories: 2 lab plan(s) with 2 stories, 1 platform stories, 2 binding templates; every clause up to rung 5 is met or owned (5/5)')],
    ['the command without the private plans says NOT_CHECKED, exits 0 and claims no result', cli.public.code === 0
      && cli.public.lines.some((l) => l.startsWith('NOT_CHECKED: the lab plans')) && !cli.public.lines.some((l) => l.startsWith('stories:'))],
    ['the command on an atlas whose rungs are not split says NOT_CHECKED', cli.unsplit.code === 0 && cli.unsplit.lines.some((l) => l.startsWith('NOT_CHECKED: the atlas rungs are not split into clauses'))],
    ['the command without an atlas says NOT_CHECKED', cli.noAtlas.code === 0 && cli.noAtlas.lines.some((l) => l.startsWith('NOT_CHECKED: labs/levels/atlas.json does not exist'))],
    ['a story and a template whose depends_on is null pass', storyErrs({ depends_on: null }).length === 0 && tplErrs({ depends_on: null }).length === 0],
    ['a story whose clauses hold a list or an object is reported once as the wrong shape', [[['records.4.1']], [{ id: 'records.4.1' }]].every((clauses) => safe(() => {
      const e = errsOf(checkLab(atlas, plan, [{ ...full[0], clauses }, full[1]], []).errs, 'x x-1');
      return e.length === 1 && e[0] === 'x x-1: clauses must be a list of clause ids';
    }))],
    ['a template whose clauses hold a list or an object is reported once as the wrong shape', [[['records.1.1']], [{ id: 'records.1.1' }]].every((clauses) => safe(() => {
      const e = errsOf(checkTemplates(atlas, [tpl('rec-low', low), tpl('rec-high', recClauses(4)), { ...tpl('rec-none', []), clauses }], new Set()), 'template rec-none');
      return e.length === 1 && e[0] === 'template rec-none: clauses must be a list of clause ids';
    }))],
    ['scaffold reads a template whose clauses are a word as citing none, never throws', safe(() => scaffold(atlas, plan, [{ ...tpl('rec-high', recClauses(4)), clauses: 'records.4.1' }], []).length === 0)],
    ['scaffold reads a word in place of depends_on or acceptance, in a template or its note, as none', safe(() => {
      const p2 = { ...plan, binding_notes: { 'rec-high': { on_this_lab: here, depends_on: 'os-2', acceptance: 'it works' } } };
      const [b] = scaffold(atlas, p2, [{ ...tpl('rec-high', recClauses(4)), depends_on: 'os-1', acceptance: 'it passes' }], []);
      return JSON.stringify(b.depends_on) === '[]' && JSON.stringify(b.acceptance) === '[]';
    })],
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
