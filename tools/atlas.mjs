// The atlas: the axes every lab is graded on, with level 5 pinned to Claude Prep (Blueprint 720) on the product
// axes and to the lab's fiction made real on the subject axes. This tool proves nothing was dropped on the way down:
//
//   A1  every axis is complete: metric, how a rater checks it, eleven rungs, and rungs 5 and 10 for every world
//   A2  every Claude Prep feature is covered by a product-axis rung at or below 5 (needs the feature inventory)
//   A3  every pattern idea has a disposition: a rung, already present, or rejected with a reason (needs the catalogue)
//   A4  every lab ladder on the atlas carries every product axis, or a reasoned "not applicable"
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
export const WORLDS = ['cosmos', 'contact', 'machine', 'claims', 'self', 'signals', 'workshop'];
const MIN_REASON = 20;

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

export function checkAtlas(atlas) {
  const errs = [];
  const ids = new Set();
  if (!atlas || !Array.isArray(atlas.axes) || !atlas.axes.length) return ['atlas has no axes'];
  for (const a of atlas.axes) {
    const at = `axis ${a.id || '(no id)'}`;
    if (!nonEmpty(a.id)) errs.push(`${at}: no id`);
    if (ids.has(a.id)) errs.push(`${at}: duplicate id`);
    ids.add(a.id);
    if (!['product', 'subject'].includes(a.kind)) errs.push(`${at}: kind must be product or subject`);
    for (const k of ['name', 'metric', 'how_checked']) if (!nonEmpty(a[k])) errs.push(`${at}: no ${k}`);
    if (!Array.isArray(a.rungs) || a.rungs.length !== 11) errs.push(`${at}: needs eleven rungs (0 to 10)`);
    else a.rungs.forEach((r, i) => { if (!nonEmpty(r)) errs.push(`${at}: rung ${i} is empty`); });
    if (a.kind === 'product' && !(Array.isArray(a.covers) && a.covers.length)) errs.push(`${at}: a product axis cites the Claude Prep features it covers`);
    for (const w of WORLDS) {
      const t = a.worlds && a.worlds[w];
      if (!t) { errs.push(`${at}: no translation for world ${w}`); continue; }
      if (t.na) { if (!nonEmpty(t.na) || t.na.trim().length < MIN_REASON) errs.push(`${at}: world ${w} is not applicable without a reason`); continue; }
      if (!nonEmpty(t.r5) || !nonEmpty(t.r10)) errs.push(`${at}: world ${w} needs rung 5 and rung 10 in its own terms`);
    }
  }
  return errs;
}

// covers entries: {"feature": "<id>", "rung": n}
export function checkCoverage(atlas, features) {
  const errs = [];
  const known = new Set(features.map((f) => f.id));
  const covered = new Map();
  for (const a of atlas.axes) for (const c of a.covers || []) {
    if (!known.has(c.feature)) { errs.push(`axis ${a.id} cites unknown feature ${c.feature}`); continue; }
    if (!(Number.isInteger(c.rung) && c.rung >= 0 && c.rung <= 5)) { errs.push(`axis ${a.id} places ${c.feature} at rung ${c.rung}; Claude Prep features sit at rung 5 or below`); continue; }
    covered.set(c.feature, true);
  }
  const missing = features.filter((f) => !covered.has(f.id)).map((f) => f.id);
  if (missing.length) errs.push(`${missing.length} Claude Prep feature(s) covered by no axis: ${missing.join(', ')}`);
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
    if (i.disposition === 'rejected' && (!nonEmpty(i.reason) || i.reason.trim().length < MIN_REASON)) errs.push(`${at}: a rejection needs a real reason`);
  }
  return errs;
}

// a ladder on the atlas: {"atlas": <version>, "inherits": [axis ids], "na": {axis id: reason}, "axes": [own subject axes]}
export function checkLadder(id, ladder, atlas) {
  const errs = [];
  const product = atlas.axes.filter((a) => a.kind === 'product').map((a) => a.id);
  const inh = new Set(ladder.inherits || []);
  const na = ladder.na || {};
  for (const p of product) {
    if (inh.has(p)) continue;
    if (nonEmpty(na[p]) && na[p].trim().length >= MIN_REASON) continue;
    errs.push(`${id}: product axis ${p} is neither inherited nor marked not applicable with a reason`);
  }
  for (const x of inh) if (!atlas.axes.some((a) => a.id === x)) errs.push(`${id}: inherits unknown axis ${x}`);
  if (!(ladder.axes || []).some((a) => a.kind === 'subject' || a.frame)) errs.push(`${id}: has no subject axis of its own`);
  return errs;
}

function check() {
  if (!fs.existsSync(ATLAS)) { console.log('NOT_CHECKED: labs/levels/atlas.json does not exist yet'); return; }
  const atlas = JSON.parse(fs.readFileSync(ATLAS, 'utf8'));
  const errs = checkAtlas(atlas);
  const notes = [];
  if (fs.existsSync(FEATURES)) errs.push(...checkCoverage(atlas, JSON.parse(fs.readFileSync(FEATURES, 'utf8'))));
  else notes.push('NOT_CHECKED A2: the Claude Prep feature inventory is private and absent here');
  if (fs.existsSync(IDEAS)) errs.push(...checkIdeas(atlas, JSON.parse(fs.readFileSync(IDEAS, 'utf8')).ideas));
  else notes.push('NOT_CHECKED A3: the pattern catalogue is private and absent here');
  let ladders = 0;
  for (const f of fs.readdirSync(LADDERS).filter((n) => n.endsWith('.json') && n !== 'atlas.json')) {
    const l = JSON.parse(fs.readFileSync(path.join(LADDERS, f), 'utf8'));
    if (l.atlas == null) continue;
    ladders++;
    errs.push(...checkLadder(f.replace(/\.json$/, ''), l, atlas));
  }
  for (const n of notes) console.log(n);
  if (errs.length) { console.log(`atlas: ${errs.length} problem(s)`); for (const e of errs) console.log('  ' + e); process.exit(1); }
  console.log(`atlas: ${atlas.axes.length} axes complete; ${ladders} lab ladder(s) on the atlas carry every product axis`);
}

function selftest() {
  const rungs = Array.from({ length: 11 }, (_, i) => `rung ${i}`);
  const worlds = Object.fromEntries(WORLDS.map((w) => [w, { r5: 'five here', r10: 'ten here' }]));
  const good = { axes: [
    { id: 'memory', kind: 'product', name: 'Progress and memory', metric: 'm', how_checked: 'h', rungs, worlds, covers: [{ feature: 'f-log', rung: 5 }, { feature: 'f-home', rung: 4 }] },
    { id: 'fiction', kind: 'subject', name: 'Fiction made real', metric: 'm', how_checked: 'h', rungs, worlds },
  ] };
  const feats = [{ id: 'f-log' }, { id: 'f-home' }];
  const cases = [
    ['a complete atlas passes', checkAtlas(good).length === 0],
    ['ten rungs fail', checkAtlas({ axes: [{ ...good.axes[0], rungs: rungs.slice(1) }] }).some((e) => e.includes('eleven'))],
    ['an empty rung fails', checkAtlas({ axes: [{ ...good.axes[0], rungs: [...rungs.slice(0, 10), ' '] }] }).some((e) => e.includes('rung 10 is empty'))],
    ['a missing world fails', checkAtlas({ axes: [{ ...good.axes[0], worlds: { ...worlds, self: undefined } }] }).some((e) => e.includes('world self'))],
    ['a short n/a fails', checkAtlas({ axes: [{ ...good.axes[0], worlds: { ...worlds, self: { na: 'no' } } }] }).some((e) => e.includes('without a reason'))],
    ['a reasoned n/a passes', checkAtlas({ axes: [{ ...good.axes[0], worlds: { ...worlds, self: { na: 'breathing practice has no spatial graphics at all' } } }] }).length === 0],
    ['a product axis without covers fails', checkAtlas({ axes: [{ ...good.axes[0], covers: [] }] }).some((e) => e.includes('cites'))],
    ['full coverage passes', checkCoverage(good, feats).length === 0],
    ['an uncovered feature fails', checkCoverage(good, [...feats, { id: 'f-sync' }]).some((e) => e.includes('f-sync'))],
    ['a feature above rung 5 fails', checkCoverage({ axes: [{ ...good.axes[0], covers: [{ feature: 'f-log', rung: 7 }, { feature: 'f-home', rung: 3 }] }] }, feats).some((e) => e.includes('rung 7'))],
    ['ideas with dispositions pass', checkIdeas(good, [{ id: 'P1', title: 't', disposition: 'rung', axis: 'memory', rung: 6, reason: 'r' }, { id: 'P2', title: 't', disposition: 'exists', reason: 'llm.js already does it' }]).length === 0],
    ['an idea without disposition fails', checkIdeas(good, [{ id: 'P3', title: 't', disposition: null }]).length === 1],
    ['an idea on an unknown axis fails', checkIdeas(good, [{ id: 'P4', title: 't', disposition: 'rung', axis: 'nope', rung: 5, reason: 'r' }]).some((e) => e.includes('nope'))],
    ['a lazy rejection fails', checkIdeas(good, [{ id: 'P5', title: 't', disposition: 'rejected', reason: 'meh' }]).some((e) => e.includes('real reason'))],
    ['a ladder that inherits passes', checkLadder('x', { atlas: 3, inherits: ['memory'], axes: [{ kind: 'subject' }] }, good).length === 0],
    ['a ladder that drops a product axis fails', checkLadder('x', { atlas: 3, inherits: [], axes: [{ kind: 'subject' }] }, good).some((e) => e.includes('memory'))],
    ['a ladder with a reasoned n/a passes', checkLadder('x', { atlas: 3, na: { memory: 'a single-visit installation keeps no history by design' }, axes: [{ kind: 'subject' }] }, good).length === 0],
    ['a ladder without subject axes fails', checkLadder('x', { atlas: 3, inherits: ['memory'], axes: [] }, good).some((e) => e.includes('subject'))],
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
