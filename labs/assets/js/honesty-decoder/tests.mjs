#!/usr/bin/env node
/* ============================================================
   honesty-decoder/tests.mjs — the decoder's own checks, in Node.
   Run by tools/lab_tests.mjs in the site gate, or directly:
     node labs/assets/js/honesty-decoder/tests.mjs [--strict]

   Hard failures (always): the row schema (with planted bad rows that
   must be rejected), 0 contradictions across shared components, the
   engine fixtures, the gold set's shape and a floor on held-out F1,
   no stored figure in any row.

   Drift (warnings by default, failures with --strict or HD_STRICT=1):
   a built or beta lab with a page but no row, a row naming an unknown
   hub id, a cited line gone from its file, a Node-runnable check whose
   result no longer matches the grading. Labs are being rebuilt in
   parallel; a lab's rewrite should mark its row stale, not block it.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const imp = (p) => import(pathToFileURL(path.join(HERE, p)).href);
const STRICT = process.argv.includes('--strict') || process.env.HD_STRICT === '1';

const { ROWS, SHARED, OFFSITE } = await imp('registry.js');
const E = await imp('engine.js');
const C = await imp('config.js');
const { GOLD, TUNE, HELD } = await imp('gold.js');
const { SNAPSHOT } = await imp('data/snapshot.js');
const { ALL_PROJECTS } = await import(pathToFileURL(path.join(ROOT, 'labs/assets/js/config/site.config.js')).href);

let fails = 0, warns = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log(`FAIL ${msg}`); } };
const drift = (cond, msg) => { if (cond) passes++; else if (STRICT) { fails++; console.log(`FAIL ${msg}`); } else { warns++; console.log(`warn ${msg}`); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n?/g, '\n');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/* ------------------------------------------------------------ schema */
const HUB = Object.fromEntries(ALL_PROJECTS.map((p) => [p.id, p]));
export function validateRow(r, hub = HUB) {
  const errs = [];
  if (!r || typeof r.id !== 'string') return ['row without id'];
  if (!hub[r.id]) errs.push(`${r.id}: not a hub id in site.config.js`);
  if (!Array.isArray(r.files) || !r.files.length) errs.push(`${r.id}: no files`);
  if (!Array.isArray(r.mech) || !r.mech.length) errs.push(`${r.id}: no mechanism`);
  if (!Array.isArray(r.subs) || r.subs.filter((s) => s.type !== 'framing').length < 3) errs.push(`${r.id}: fewer than 3 scored sub-claims`);
  const ids = new Set();
  for (const s of r.subs || []) {
    const at = `${r.id}/${s.id}`;
    if (!s.id || ids.has(s.id)) errs.push(`${at}: missing or duplicate id`);
    ids.add(s.id);
    if (typeof s.phrase !== 'string' || !s.phrase) errs.push(`${at}: no phrase`);
    else if (hub[r.id] && !hub[r.id].blurb.toLowerCase().includes(s.phrase.toLowerCase())) errs.push(`${at}: phrase "${s.phrase}" not in the live blurb`);
    if (!C.TYPES[s.type]) errs.push(`${at}: bad type ${s.type}`);
    if (!Number.isInteger(s.w) || s.w < 1 || s.w > 3) errs.push(`${at}: weight must be 1..3`);
    if (typeof s.why !== 'string' || s.why.length < 10) errs.push(`${at}: weight has no justification`);
    if (!['supported', 'partial', 'unsupported'].includes(s.verdict)) errs.push(`${at}: bad verdict ${s.verdict}`);
    if (typeof s.note !== 'string' || !s.note) errs.push(`${at}: verdict has no reason`);
    const basis = E.basisOf(s);
    if (s.type !== 'framing' && basis === 'author' && s.basis !== 'author') errs.push(`${at}: no evidence and not labelled author assertion`);
    if (s.basis && !C.BASES[s.basis]) errs.push(`${at}: bad basis ${s.basis}`);
    for (const k of Object.keys(s)) if (/^(figure|reality|percent|pct)$/i.test(k)) errs.push(`${at}: stores a figure (${k})`);
    if (s.shared && !SHARED[s.shared]) errs.push(`${at}: unknown shared component ${s.shared}`);
    if (s.route && !['direct', 'llm', 'provider'].includes(s.route.via)) errs.push(`${at}: bad route spec`);
  }
  for (const k of Object.keys(r)) if (/^(figure|reality|percent|pct)$/i.test(k)) errs.push(`${r.id}: stores a figure (${k})`);
  return errs;
}

for (const r of ROWS) { const e = validateRow(r); ok(!e.length, `schema: ${e.join('; ')}`); }

/* planted bad rows: each must be rejected */
const good = ROWS.find((r) => r.id === 'primordial-seed');
const clone = () => JSON.parse(JSON.stringify(good));
const planted = [
  ['unknown hub id', (r) => { r.id = 'not-a-lab'; }],
  ['weight out of range', (r) => { r.subs[0].w = 9; }],
  ['bad verdict', (r) => { r.subs[0].verdict = 'mostly'; }],
  ['phrase not in blurb', (r) => { r.subs[0].phrase = 'a phrase nobody wrote'; }],
  ['stored figure', (r) => { r.reality = 85; }],
  ['unlabelled assertion', (r) => { r.subs[0].ev = []; delete r.subs[0].probe; }],
  ['too few sub-claims', (r) => { r.subs = r.subs.slice(0, 2); }],
  ['no weight reason', (r) => { r.subs[1].why = ''; }],
];
for (const [name, plant] of planted) { const r = clone(); plant(r); ok(validateRow(r).length > 0, `planted bad row "${name}" was accepted`); }

/* ------------------------------------------------------------ hub keying */
const rowIds = new Set(ROWS.map((r) => r.id));
for (const p of ALL_PROJECTS) {
  if (p.href && (p.status === 'built' || p.status === 'beta')) drift(rowIds.has(p.id), `coverage: ${p.status} lab "${p.title}" (${p.id}) has a page but no decoder row`);
}
for (const r of ROWS) ok(!!HUB[r.id], `coverage: row ${r.id} names no hub entry in site.config.js`);
/* every hub entry gets a row on the page: graded (registry.js), generated for a
   lab with a page but no graded row yet, or generated for a lab with no page */
const pageRows = ALL_PROJECTS.map((p) => (rowIds.has(p.id) ? 'graded' : p.href ? 'ungraded' : 'no page'));
ok(pageRows.every(Boolean), 'coverage: a hub entry would get no row on the page');
for (const p of ALL_PROJECTS) {
  if (!p.href) continue;
  const sys = E.decompose(p.blurb);
  ok(rowIds.has(p.id) || sys.length > 0, `coverage: ${p.id} has a page and neither a graded row nor a decodable blurb`);
}
const cov = E.coverage(ALL_PROJECTS, [...rowIds, ...ALL_PROJECTS.filter((p) => !p.href).map((p) => p.id)]);
console.log(`coverage: ${cov.n} of ${cov.m} hub entries have a row (graded or no-page)`);

/* ------------------------------------------------------------ consistency */
const cons = E.consistency(ROWS, SHARED);
ok(cons.contradictions.length === 0, `consistency: ${cons.contradictions.map((c) => `${c.id}: ${c.why}`).join('; ')}`);
console.log(`consistency: ${Object.keys(cons.users).length} shared components, ${Object.values(cons.users).flat().length} uses, ${cons.contradictions.length} contradictions`);

/* ------------------------------------------------------------ anchors */
let gone = 0;
for (const r of ROWS) {
  for (const s of r.subs) {
    for (const [f, a] of s.ev || []) {
      const full = path.join(ROOT, f);
      const has = fs.existsSync(full) && read(f).includes(a);
      if (!has) gone++;
      drift(has, `anchor gone: ${r.id}/${s.id} ${f}: "${a.slice(0, 60)}"`);
    }
    for (const [f, a] of s.absent || []) drift(!read(f).includes(a), `absent string present: ${r.id}/${s.id} ${f}: "${a}"`);
  }
}
for (const [id, c] of Object.entries(SHARED)) for (const [f, a] of c.ev) drift(read(f).includes(a), `shared ${id}: anchor gone in ${f}`);
console.log(`anchors: ${gone} gone`);

/* ------------------------------------------------------------ snapshot */
let changed = 0;
for (const [f, x] of Object.entries(SNAPSHOT.files)) {
  if (x.missing || !fs.existsSync(path.join(ROOT, f))) continue;
  const sha = createHash('sha256').update(read(f), 'utf8').digest('hex');
  if (sha !== x.sha256 && !f.startsWith('labs/assets/js/honesty-decoder/')) changed++;
}
console.log(`snapshot: ${Object.keys(SNAPSHOT.files).length} files, ${changed} changed since ${SNAPSHOT.generated} (head ${SNAPSHOT.head})`);
ok(SNAPSHOT.grading && SNAPSHOT.grading.labs, 'snapshot has no grading block');

/* ------------------------------------------------------------ engine fixtures */
const F = (items) => E.figureOf(items.map(([w, v, type = 'mechanism'], i) => ({ id: `s${i}`, w, v, type })));
let f = F([[1, 1], [1, 0.5], [1, 0]]);
ok(near(f.point, 50), 'fixture 1: equal weights 1, .5, 0 give 50');
ok(near(f.low, 100 / 3) && near(f.high, 200 / 3), 'fixture 2: interval 33.3 to 66.7');
ok(near(f.factscore, 100 / 3), 'fixture 3: FActScore 33.3');
f = F([[3, 1], [1, 0]]);
ok(near(f.point, 75), 'fixture 4: weights 3 and 1 give 75');
ok(near(f.gap, 25), 'fixture 5: gap 75 - 50 = 25');
f = F([[2, 1], [2, null]]);
ok(near(f.point, 100) && near(f.low, 50) && near(f.high, 100), 'fixture 6: unverified stays out of the point, spans the interval');
ok(near(f.unverifiedShare, 50), 'fixture 7: unverified share 50');
f = F([[2, 1], [5, 0, 'framing']]);
ok(near(f.point, 100) && f.n === 1, 'fixture 8: framing never enters');
f = F([[1, null]]);
ok(f.point === null && near(f.low, 0) && near(f.high, 100), 'fixture 9: all unverified gives no point and the whole scale');
ok(F([]).point === null, 'fixture 10: empty gives no point');
let it = [[3, 1], [1, 1], [1, 0]].map(([w, v], i) => ({ id: `s${i}`, w, v, type: 'mechanism' }));
let sn = E.sensitivity(it);
ok(sn.id === 's0' && near(sn.delta, -60), 'fixture 11: the heaviest supported sub-claim is most sensitive (80 to 20)');
it = [[1, 0.5], [1, 1]].map(([w, v], i) => ({ id: `s${i}`, w, v, type: 'mechanism' }));
sn = E.sensitivity(it);
ok(sn.id === 's1' && near(sn.delta, -50), 'fixture 12: a partial moves to the end that moves the figure more');
it = [[3, 1], [1, 0.5], [1, 0]].map(([w, v], i) => ({ id: `s${i}`, w, v, type: 'mechanism' }));
const gd = E.gapDriver(it);
ok(near(gd.terms.reduce((a, t) => a + t.c, 0), gd.gap, 1e-6), 'fixture 13: gap terms sum to the gap');
ok(gd.driver.id === 's0', 'fixture 14: the weight of the heavy supported sub-claim drives a positive gap');
ok(E.routeVerdict({ via: 'direct', onLoad: 0, perRun: 4 }, 'ollama').verdict === 'unsupported', 'fixture 15: a direct 4-call run fails on any visitor route');
ok(E.routeVerdict({ via: 'direct', onLoad: 1, perRun: 1 }, 'pollinations').verdict === 'partial', 'fixture 16: an on-load call spends the window');
ok(E.routeVerdict({ via: 'direct', onLoad: 0, perRun: 1 }, 'pollinations').verdict === 'supported', 'fixture 17: one call per run fits');
ok(E.routeVerdict({ via: 'llm', onLoad: 0, perRun: 3 }, 'ollama').verdict === 'supported', 'fixture 18: llm.js on a local model has no window');
ok(E.routeVerdict({ via: 'llm', onLoad: 0, perRun: 3 }, 'pollinations').verdict === 'unsupported', 'fixture 19: llm.js on the public route allows 1');
ok(E.routeVerdict({ via: 'provider', local: 'partial', public: 'unsupported' }, 'pollinations').verdict === 'unsupported', 'fixture 20: provider.js has no public tier');
ok(E.routeVerdict({ via: 'provider', local: 'partial', public: 'unsupported' }, 'ollama').verdict === 'partial', 'fixture 21: provider.js reaches a local Ollama');
const sub = { id: 'x', type: 'mechanism', w: 1, verdict: 'supported', ev: [['f', 'a']] };
ok(E.effective(sub, { 'x#code': { status: 'fail', detail: 'gone' } }, 'pollinations').verdict === 'unverified', 'fixture 22: a failed check unverifies at once');
ok(E.effective(sub, { 'x#code': { status: 'pass' } }, 'pollinations').verdict === 'supported', 'fixture 23: a passed check keeps the grading');
ok(E.effective({ ...sub, probe: 'p' }, { 'x#code': { status: 'pass' }, 'x#probe': { status: 'pass', verdict: 'partial' } }, 'pollinations').verdict === 'partial', 'fixture 24: a probe verdict replaces the grading');
ok(E.effective(sub, { 'x#code': { status: 'skipped' } }, 'pollinations').verdict === 'unverified', 'fixture 25: a check not run is unverified');
ok(E.effective({ ...sub, basis: 'author', ev: [] }, {}, 'pollinations').verdict === 'unverified', 'fixture 26: author assertions are unverified');
const dec = (t) => E.decompose(t).map((s) => s.text.toLowerCase());
ok(dec('A deterministic L-system grows itself into an organism.').some((t) => t.includes('organism')), 'fixture 27: "into an organism" splits off');
ok(E.decompose('A deterministic L-system grows itself into an organism.').some((s) => s.type === 'framing'), 'fixture 28: organism is framing');
ok(dec('A live agentic scan fetches real signals.').some((t) => t === 'scan is live'), 'fixture 29: a load-bearing qualifier becomes its own sub-claim');
ok(dec('no model and no network').length === 2, 'fixture 30: conjunction splits');
ok(E.decompose('fed daily by NASA data').some((s) => s.type === 'quantity'), 'fixture 31: daily is a quantity');
ok(E.matchSets([{ text: 'gravitational lensing' }], [{ text: 'the gravitational lensing' }]).length === 1, 'fixture 32: stop words do not block a match');
ok(E.matchSets([{ text: 'a fourth call' }], [{ text: 'gravitational lensing' }]).length === 0, 'fixture 33: unrelated texts do not match');
const fig = ROWS.find((r) => r.id === 'the-figure');
ok(E.ground('the orchestration runs live on every call', fig)?.sub.id === 'fg.live', 'fixture 34: grounding finds the live sub-claim');
ok(E.ground('it composes symphonies', fig) === null, 'fixture 35: an unmatched sub-claim takes no verdict');
ok(E.nearestLab('the Schwarzschild lensing looks real', ROWS, { 'black-hole': 'Black Hole' }).id === 'black-hole', 'fixture 36: nearest lab by keyword');

/* ------------------------------------------------------------ gold set */
ok(GOLD.length >= 50, `gold: ${GOLD.length} claims, need 50`);
ok(TUNE.length + HELD.length === GOLD.length && HELD.length >= 25, 'gold: halves');
ok(GOLD.every((g) => g.subs.length && g.subs.every((s) => C.TYPES[s.type])), 'gold: every sub-claim typed');
ok(new Set(GOLD.map((g) => g.id)).size === GOLD.length, 'gold: unique ids');
const held = E.scoreSet(HELD, (g) => E.decompose(g.claim));
const tune = E.scoreSet(TUNE, (g) => E.decompose(g.claim));
ok(held.F1 >= 0.5, `gold: held-out F1 ${held.F1.toFixed(2)} under the 0.5 floor`);
console.log(`gold: ${GOLD.length} claims; engine held-out P ${held.P.toFixed(3)} R ${held.R.toFixed(3)} F1 ${held.F1.toFixed(3)}; tuning F1 ${tune.F1.toFixed(3)}`);

/* ------------------------------------------------------------ Node-runnable checks */
const nodeCtx = { file: async (f2) => ({ text: read(f2), commit: SNAPSHOT.files[f2]?.commit || null }) };
const probeMods = { 'black-hole': ['bh-bcrit', 'bh-beta'], dimensional: ['dm-cube'], exomania: ['ex-physics'], heptapod: ['hp-vectors'], 'workout-plans': ['wp-week'] };
for (const [lab, ids] of Object.entries(probeMods)) {
  const mod = await imp(`checks/labs/${lab}.js`);
  for (const id of ids) {
    const sub2 = ROWS.find((r) => r.id === lab).subs.find((s) => s.probe === id);
    try {
      const r = await mod.PROBES[id].run(nodeCtx);
      drift(r.status === 'pass' && r.verdict === sub2.verdict, `check ${id}: ${r.status} ${r.verdict}, graded ${sub2.verdict}: ${r.detail}`);
      console.log(`check ${id}: ${r.verdict} · ${r.detail.slice(0, 110)}`);
    } catch (e) { drift(false, `check ${id} threw: ${e.message}`); }
  }
}

/* ------------------------------------------------------------ figures reproduce */
const figs = ROWS.map((r) => [r.id, E.scoreRow(r, {}, 'pollinations').fig.point]);
ok(figs.every(([, p]) => p == null || (p >= 0 && p <= 100)), 'figures in range');
console.log(`G1 figures (graded verdicts, public route): ${figs.map(([id, p]) => `${id} ${p == null ? '-' : p.toFixed(1)}`).join(', ')}`);
ok(OFFSITE.every((o) => o.subs.length >= 2), 'off-site rows carry sub-claims');

console.log(`honesty-decoder tests: ${passes} passed, ${fails} failed, ${warns} drift warnings${STRICT ? ' (strict)' : ''}`);
process.exit(fails ? 1 : 0);
