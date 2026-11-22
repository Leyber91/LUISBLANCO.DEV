/* ============================================================
   orthogonal/catalog.test.mjs: the catalogue's checks, run by
   tools/lab_tests.mjs on every pull request.

   A. The parts schema (catalog-model.js validateTree): a tree just
      inside every bound passes and one just outside is refused,
      for the part count, the kind, the material, each triple, the
      keys and emits; the offline script's own validate (make_parts.py,
      run in Python) agrees on every case.
   B. The data: worlds.json holds 42 worlds, seven in each of six
      domains, five steps each (technology and needs, no why_then),
      status drafted, a plain name with no possessive beside the
      drafted one; parts.json holds a valid tree for each of them.
   C. The walk: ?w= opens that world, an unknown id the first and
      says so; previous and next wrap; surprise never repeats the
      world and reaches all the others over its range.
   D. The camera's sphere holds every part.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, DOMAINS, groupByDomain, KINDS, LIMITS, MATERIALS, partLine, resolveWorld, step, surprise, validateTree } from './catalog-model.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../../data/orthogonal/catalog');
const worlds = JSON.parse(fs.readFileSync(path.join(DATA, 'worlds.json'), 'utf8')).worlds;
const parts = JSON.parse(fs.readFileSync(path.join(DATA, 'parts.json'), 'utf8'));

let pass = 0, fail = 0;
const t = (name, fn) => {
  let ok = false, why = '';
  try { ok = fn() !== false; } catch (e) { why = e.message; }
  if (ok) pass++; else { fail++; console.log(`  FAIL ${name}${why ? ': ' + why : ''}`); }
};

const part = (o = {}) => ({ kind: 'box', size: [1, 1, 1], at: [0, 0, 0], rot: [0, 0, 0], material: 'stone', emits: false, ...o });
const tree = (n, o) => ({ name: 'A plain tree', parts: Array.from({ length: n }, () => part(o)) });

// ---- A. the schema, each bound just inside and just outside, and the Python script's own rule on the same cases
const cases = [
  ['3 parts is the least', tree(3), true], ['2 parts is one short', tree(2), false],
  ['14 parts is the most', tree(14), true], ['15 parts is one over', tree(15), false],
  ['size at the least bound', tree(3, { size: [LIMITS.minSize, LIMITS.minSize, LIMITS.minSize] }), true],
  ['size just under the least bound', tree(3, { size: [LIMITS.minSize / 2, 1, 1] }), false],
  ['size at the largest bound', tree(3, { size: [LIMITS.maxCoord, 1, 1] }), true],
  ['size just over the largest bound', tree(3, { size: [LIMITS.maxCoord + 0.1, 1, 1] }), false],
  ['at on the bound', tree(3, { at: [LIMITS.maxCoord, -LIMITS.maxCoord, 0] }), true],
  ['at just over the bound', tree(3, { at: [0, LIMITS.maxCoord + 0.1, 0] }), false],
  ['rot at 360', tree(3, { rot: [360, -360, 0] }), true], ['rot at 361', tree(3, { rot: [361, 0, 0] }), false],
  ['a triple of two', tree(3, { size: [1, 1] }), false], ['a string in a triple', tree(3, { at: [0, '1', 0] }), false],
  ['a null in a triple', tree(3, { at: [0, null, 0] }), false],
  ['an unknown kind', tree(3, { kind: 'turbine' }), false], ['an unknown material', tree(3, { material: 'steel' }), false],
  ['emits as a string', tree(3, { emits: 'true' }), false],
  ...KINDS.map((k) => [`kind ${k}`, tree(3, { kind: k }), true]),
  ...MATERIALS.map((m) => [`material ${m}`, tree(3, { material: m }), true]),
];
const extra = tree(3); extra.parts[0].color = 'gold'; cases.push(['an extra key', extra, false]);
const missing = tree(3); delete missing.parts[1].rot; cases.push(['a missing key', missing, false]);
cases.push(['no parts list', { name: 'x' }, false], ['not an object', 'tree', false]);
for (const [name, tr, want] of cases) t(`A. js: ${name}`, () => (validateTree(tr).length === 0) === want);

const py = spawnSync('python', ['-I', '-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(DATA)})
import make_parts as m
cases = json.load(sys.stdin)
print(json.dumps([len(m.validate(c)) == 0 for c in cases]))
`], { input: JSON.stringify(cases.map(([, tr]) => tr)), encoding: 'utf8' });
t('A. the offline script runs', () => py.status === 0, (py.stderr || '').slice(-200));
if (py.status === 0) {
  const got = JSON.parse(py.stdout.trim().split('\n').pop());
  cases.forEach(([name, , want], i) => t(`A. python agrees: ${name}`, () => got[i] === want));
}
t('A. the Python script and the page share the kinds, materials and bounds', () => {
  const src = fs.readFileSync(path.join(DATA, 'make_parts.py'), 'utf8');
  const list = (v) => src.match(new RegExp(`${v} = \\[([^\\]]*)\\]`, 's'))[1].match(/"([a-z]+)"/g).map((x) => x.slice(1, -1)).join();
  return list('KINDS') === KINDS.join() && list('MATERIALS') === MATERIALS.join()
    && src.includes(`MIN_PARTS, MAX_PARTS = ${LIMITS.minParts}, ${LIMITS.maxParts}`) && src.includes(`MAX_COORD = ${LIMITS.maxCoord}`)
    && src.includes(`("size", ${LIMITS.minSize}, MAX_COORD)`);
});

// ---- B. the data
t('B. 42 worlds with ids w00 to w41', () => worlds.length === 42 && worlds.every((w, i) => w.id === 'w' + String(i).padStart(2, '0')));
t('B. seven in each of six domains', () => DOMAINS.length === 6 && DOMAINS.every((d) => worlds.filter((w) => w.domain === d).length === 7));
t('B. every world has a driver, a job, a kind, a function and a form', () => worlds.every((w) => ['driver', 'job', 'kind', 'provenance'].every((k) => typeof w[k] === 'string' && w[k].length > 4) && w.artifact.function.length > 10 && w.artifact.form.length > 10));
t('B. five steps each, technology and needs only', () => worlds.every((w) => w.steps.length === 5 && w.steps.every((s) => Object.keys(s).sort().join() === 'needs,technology' && s.technology.length > 5 && s.needs.length > 5)));
t('B. no why_then anywhere in the catalogue', () => !/why_then/.test(fs.readFileSync(path.join(DATA, 'worlds.json'), 'utf8')));
t('B. status drafted, and provenance says a model drafted it', () => worlds.every((w) => w.status === 'drafted' && /^Drafted by /.test(w.provenance)));
t('B. a plain name beside the drafted one, no possessive, unique', () => worlds.every((w) => w.artifact.name && w.artifact.draft_name && !/['’]s\b/.test(w.artifact.name)) && new Set(worlds.map((w) => w.artifact.name)).size === 42);
t('B. parts.json has a tree for exactly these worlds, each valid', () => Object.keys(parts.trees).sort().join() === worlds.map((w) => w.id).join() && worlds.every((w) => validateTree(parts.trees[w.id]).length === 0));
t('B. the kinds and materials the data lists are the page\'s', () => parts.kinds.join() === KINDS.join() && parts.materials.join() === MATERIALS.join());
t('B. every kind is drawn by some tree (the renderer has a use for each)', () => KINDS.every((k) => Object.values(parts.trees).some((tr) => tr.parts.some((p) => p.kind === k))));
t('B. the calls record counts a call for every world', () => { const c = JSON.parse(fs.readFileSync(path.join(DATA, 'calls.json'), 'utf8')); return worlds.every((w) => c.some((x) => x.id === w.id)) && c.every((x) => x.cost_usd > 0); });
t('B. the grouping lists every world once, domains in order', () => { const g = groupByDomain(worlds); return g.map((x) => x.domain).join() === DOMAINS.join() && g.flatMap((x) => x.worlds).length === 42; });
t('B. a part reads as one plain line', () => partLine(part({ size: [12, 0.5, 0.05], emits: true })) === 'stone box, 12 x 0.50 x 0.050 m, glowing');

// ---- C. the walk
t('C. ?w= opens that world', () => { const r = resolveWorld('?w=w23', worlds); return r.world.id === 'w23' && r.known; });
t('C. no ?w= opens the first, nothing to say', () => { const r = resolveWorld('', worlds); return r.world.id === 'w00' && r.known; });
t('C. an unknown id opens the first and says so', () => { const r = resolveWorld('?w=w99', worlds); return r.world.id === 'w00' && !r.known; });
t('C. an empty id opens the first', () => resolveWorld('?w=', worlds).world.id === 'w00');
t('C. next wraps from the last, previous from the first', () => step(worlds, 'w41', 1) === 'w00' && step(worlds, 'w00', -1) === 'w41' && step(worlds, 'w05', 1) === 'w06' && step(worlds, 'w05', -1) === 'w04');
t('C. surprise never repeats the world and reaches every other over its range', () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) { const id = surprise(worlds, 'w07', i / 1000); if (id === 'w07') return false; seen.add(id); }
  return seen.size === 41 && surprise(worlds, 'w07', 0.9999999) !== 'w07';
});

// ---- D. the camera's sphere
t('D. the sphere holds every part\'s own sphere, for every tree', () => worlds.every((w) => {
  const { center, radius } = boundsOf(parts.trees[w.id].parts);
  return parts.trees[w.id].parts.every((p) => Math.hypot(p.at[0] - center[0], p.at[1] - center[1], p.at[2] - center[2]) + Math.hypot(...p.size) / 2 <= radius + 1e-9);
}));
t('D. one part\'s sphere is its own', () => { const b = boundsOf([part({ size: [2, 0, 0], at: [1, 2, 3] })]); return Math.abs(b.radius - 1) < 1e-9 && b.center.join() === '1,2,3'; });

console.log(`orthogonal catalogue: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
