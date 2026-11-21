/* ============================================================
   orthogonal/tests.mjs: the Orthogonal plate's checks, run by
   tools/lab_tests.mjs on every pull request.

   1. The world's data holds the lineage's rules, and each rule
      refuses a world broken in its one way (check).
   2. The branch that fired, the gold, is the one the data says.
   3. The layout at every width from 300 to 420 px: no label runs
      into another or off the drawing, every target is 44 px tall,
      every line runs downward, Earth's steps sit on their pairs'
      rows.
   4. The keys walk every node, and cross to Earth and back.
   5. Every REAL claim on the plate has a source or a declared gap.
   6. The artifact pipeline: the parameter file holds its schema
      (render_artifact.py's own validate, run in Python), a value
      just outside a bound is refused and one just inside passes,
      and the render's record matches the parameter file byte for
      byte (SHA-256, CRLF read as LF), so an image never outlives
      the parameters it was drawn from.
   7. The page's markup says what the data says.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUT, ROLES, SOURCES } from './config.js';
import { check, layout, pairOf, reading, stateOf, step, trunk, wrap } from './engine.js';
import { WORLD } from './worlds/fungi-early.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABS = path.resolve(HERE, '..', '..', '..');
const DATA = path.join(LABS, 'assets', 'data', 'orthogonal');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
};
const clone = (w) => JSON.parse(JSON.stringify(w));
const node = (w, id) => w.nodes.find((n) => n.id === id);

// ---------------------------------------------------------------- 1. the rules
ok('the world holds every rule', check(WORLD).length === 0, check(WORLD).join('; '));
const broken = [
  ['two roots', (w) => { node(w, 'fungi').role = 'root'; node(w, 'fungi').after = []; }],
  ['two drivers', (w) => { node(w, 'farmed').role = 'driver'; }],
  ['an unknown role', (w) => { node(w, 'farmed').role = 'widget'; }],
  ['a parent that is not a node', (w) => { node(w, 'nocoal').after = ['nowhere']; }],
  ['a world node grown from Earth', (w) => { node(w, 'farmed').after = ['buried']; }],
  ['an Earth node grown from the world', (w) => { node(w, 'seams').after = ['fungi']; }],
  ['an Earth node with no pair', (w) => { delete node(w, 'coalgas').pair; }],
  ['a world node that names a pair', (w) => { node(w, 'nocoal').pair = 'seams'; }],
  ['an Earth node paired off the trunk', (w) => { node(w, 'coalgas').pair = 'farmed'; }],
  ['two Earth nodes on one pair', (w) => { node(w, 'coalgas').pair = 'nocoal'; }],
  ['an Earth step paired above its parent', (w) => { node(w, 'seams').pair = 'lamp'; node(w, 'gaslamp').pair = 'nocoal'; }],
  ['a cycle', (w) => { node(w, 'fungi').after = ['lignin', 'lamp']; }],
  ['a REAL claim with no source and no gap', (w) => { node(w, 'coalgas').evidence = [{ tag: 'REAL', text: 'x' }]; }],
  ['a source that does not exist', (w) => { node(w, 'fungi').evidence[0].src = 'nobody2099'; }],
  ['a tag other than REAL or ILLUSTRATIVE', (w) => { node(w, 'fungi').evidence[0].tag = 'LIKELY'; }],
  ['no evidence', (w) => { node(w, 'farmed').evidence = []; }],
  ['an artifact that is not one', (w) => { w.artifact.node = 'luminous'; }],
  ["Earth's artifact not paired with this world's", (w) => { w.earthArtifact.node = 'coalgas'; }],
  ['no path from the driver through first parents', (w) => { node(w, 'luminous').after = ['farmed', 'nocoal']; node(w, 'farmed').after = ['lignin']; }],
];
for (const [name, breakIt] of broken) {
  const w = clone(WORLD);
  breakIt(w);
  ok(`check refuses ${name}`, check(w).length > 0);
}
// just inside: a REAL claim with a declared gap and no source is allowed
{
  const w = clone(WORLD);
  node(w, 'buried').evidence = [{ tag: 'REAL', text: 'x', gap: 'No source opened yet.' }];
  ok('check allows a REAL claim whose gap is declared', check(w).length === 0, check(w).join('; '));
}

// ---------------------------------------------------------------- 2. what fired
ok('the trunk runs driver, pressure, combination, artifact', JSON.stringify(trunk(WORLD)) === JSON.stringify(['fungi', 'nocoal', 'luminous', 'lamp']));
const states = Object.fromEntries(WORLD.nodes.map((n) => [n.id, stateOf(WORLD, n.id)]));
ok('gold is the driver, the threads and the steps the artifact grew from', ['fungi', 'farmed', 'nocoal', 'luminous', 'lamp'].every((id) => states[id] === 'fired'));
ok('nothing else is gold', Object.values(states).filter((s) => s === 'fired').length === 5);
ok('the seed of trouble has not happened', states.trouble === 'pending');
ok("Earth's branch is the ghost", ['buried', 'seams', 'coalgas', 'gaslamp'].every((id) => states[id] === 'earth'));
ok('the root belongs to both', states.lignin === 'root');

// ---------------------------------------------------------------- 3. the layout
const textBox = (n) => {
  const w = Math.max(...n.label.lines.map((s) => s.length), n.label.role.length) * LAYOUT.charW;
  const h = (n.label.lines.length + (n.label.role ? 1 : 0)) * LAYOUT.lineH;
  const x0 = n.label.anchor === 'start' ? n.label.x : n.label.x - w;
  return { x0, x1: x0 + w, y0: n.label.y - 10, y1: n.label.y - 10 + h };
};
const hits = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
for (let width = 300; width <= 640; width += 4) {   // the phone's 300 to 420, and a wide plate's column
  for (const height of [0, 560]) {
    const lay = layout(WORLD, { width, height, leader: height > 0 });
    const where = `${width} x ${height}`;
    const boxes = lay.nodes.map((n) => [n.id, textBox(n)]);
    for (let i = 0; i < boxes.length; i++) {
      const [id, b] = boxes[i];
      ok(`${where}: ${id}'s label stays on the drawing`, b.x0 >= 0 && b.x1 <= width + 0.5, JSON.stringify(b));
      for (let j = i + 1; j < boxes.length; j++) ok(`${where}: ${id} and ${boxes[j][0]} labels apart`, !hits(b, boxes[j][1]));
      // a node's square is never under another node's label
      for (const n of lay.nodes) if (n.id !== id) {
        const sq = { x0: n.x - 5, x1: n.x + 5, y0: n.y - 5, y1: n.y + 5 };
        ok(`${where}: ${n.id}'s square is clear of ${id}'s label`, !hits(sq, b));
      }
    }
    for (const h of lay.heads) {
      const hb = { x0: h.x, x1: h.x + h.text.length * LAYOUT.charW, y0: h.y - 10, y1: h.y + 4 };
      ok(`${where}: the head "${h.text}" stays on the drawing`, hb.x0 >= 0 && hb.x1 <= width);
      for (const [id, b] of boxes) ok(`${where}: the head "${h.text}" is clear of ${id}'s label`, !hits(hb, b));
      for (const n of lay.nodes) ok(`${where}: the head "${h.text}" is clear of ${n.id}'s square`, !hits(hb, { x0: n.x - 5, x1: n.x + 5, y0: n.y - 5, y1: n.y + 5 }));
    }
    ok(`${where}: the heads sit over Earth's lane and the trunk`, Math.abs(lay.heads[0].x - lay.lanes.earth) <= LAYOUT.node && Math.abs(lay.heads[1].x - lay.lanes.trunk) <= LAYOUT.node);
    for (const n of lay.nodes) ok(`${where}: ${n.id}'s target is at least 44 px tall`, n.hit.h >= 44);
    const hb = lay.nodes.map((n) => [n.id, { x0: n.hit.x, x1: n.hit.x + n.hit.w, y0: n.hit.y, y1: n.hit.y + n.hit.h }]);
    for (let i = 0; i < hb.length; i++) for (let j = i + 1; j < hb.length; j++) {
      ok(`${where}: targets ${hb[i][0]} and ${hb[j][0]} do not overlap`, !hits(hb[i][1], hb[j][1]));
    }
    const pos = new Map(lay.nodes.map((n) => [n.id, n]));
    for (const e of lay.edges) ok(`${where}: ${e.from} to ${e.to} runs downward`, pos.get(e.from).y < pos.get(e.to).y);
    for (const n of WORLD.nodes.filter((x) => x.branch === 'earth')) ok(`${where}: ${n.id} sits on its pair's row`, pos.get(n.id).row === pos.get(n.pair).row);
    if (height) ok(`${where}: the rows fill the height given`, lay.height === height, String(lay.height));
    if (lay.leader) ok(`${where}: the leader runs right from the artifact's label`, lay.leader.x1 < lay.leader.x2 && lay.leader.x1 > pos.get('lamp').x);
  }
}
ok('wrap keeps every word and its order', wrap('No coal; iron from rationed forests', 18).join(' ') === 'No coal; iron from rationed forests');
ok('wrap keeps each line within its width', wrap('The rot that lights the city eats its timber', 19).every((l) => l.length <= 19));
ok('wrap keeps a word longer than a line whole', JSON.stringify(wrap('Carboniferous era', 6)) === JSON.stringify(['Carboniferous', 'era']));

// ---------------------------------------------------------------- 4. the keys
{
  const seen = [];
  let id = step(WORLD, 'lamp', 'Home');
  while (id && seen.length < 40) { seen.push(id); id = step(WORLD, id, 'ArrowDown'); }
  const world = WORLD.nodes.filter((n) => n.branch !== 'earth').map((n) => n.id);
  ok('ArrowDown from the root walks every node of the world, once', seen.length === world.length && world.every((x) => seen.includes(x)), seen.join(' '));
  ok('End reaches the last row', step(WORLD, 'lignin', 'End') === seen[seen.length - 1]);
  for (const n of WORLD.nodes.filter((x) => x.branch === 'earth')) {
    ok(`ArrowRight from ${n.id} crosses to ${n.pair}`, step(WORLD, n.id, 'ArrowRight') === n.pair);
    ok(`ArrowLeft from ${n.pair} crosses back`, step(WORLD, n.pair, 'ArrowLeft') === n.id);
  }
  ok("ArrowUp from Earth's first step reaches the root", step(WORLD, 'buried', 'ArrowUp') === 'lignin');
  ok("ArrowDown walks Earth's branch on Earth's branch", step(WORLD, 'seams', 'ArrowDown') === 'coalgas');
  ok('a key the drawing does not use moves nowhere', step(WORLD, 'lamp', 'x') === null);
  ok('a step with no pair has nowhere to cross', pairOf(WORLD, 'farmed') === null && step(WORLD, 'farmed', 'ArrowLeft') === null);
}

// ---------------------------------------------------------------- 5. the claims
for (const n of WORLD.nodes) {
  const r = reading(WORLD, n.id);
  ok(`${n.id} has a reading`, !!r && r.role === (n.branch === 'earth' ? 'Earth' : ROLES[n.role]));
  for (const e of r.evidence) ok(`${n.id}: a REAL claim names its source or its gap`, e.tag !== 'REAL' || !!(e.source || e.gap));
  ok(`${n.id}: its note has no digit the data did not cite`, !/\d/.test(n.note) || n.evidence.some((e) => e.src));
}
ok('every source cited is used', Object.keys(SOURCES).every((k) => WORLD.nodes.some((n) => n.evidence.some((e) => e.src === k))));

// ---------------------------------------------------------------- 6. the pipeline
const paramsPath = path.join(LABS, WORLD.artifact.params);
const recordPath = path.join(LABS, WORLD.artifact.record);
const imagePath = path.join(LABS, WORLD.artifact.image);
ok('the parameter file, the render and its record are on the site', [paramsPath, recordPath, imagePath].every((p) => fs.existsSync(p)));
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const sha = crypto.createHash('sha256').update(fs.readFileSync(paramsPath).toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex');
ok("the record's parameter hash is the file's", record.params_sha256 === sha, `${record.params_sha256} against ${sha}`);
ok('the record names the parameter file and the image', record.params === path.basename(paramsPath) && record.image === path.basename(imagePath));
ok("the record's byte count is the image's", record.image_bytes === fs.statSync(imagePath).size);
ok('the render used the seed in the file', record.seed === params.seed);
ok('the render is the size the file asks for', record.width === Math.round(params.render.width * params.render.percent / 100) && record.height === Math.round(params.render.height * params.render.percent / 100));
ok('the artifact the world names is the one rendered', record.artifact === params.artifact && WORLD.artifact.image.includes(params.artifact));

/* render_artifact.py's validate, run on the committed file and on copies a bound apart. The script imports bpy only
   inside the functions that build, so plain Python can import it. */
const py = ['python3', 'python'].find((c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
ok('a Python to run the pipeline validator is installed', !!py);
if (py) {
  const cases = [
    ['the committed file', params, true],
    ['a column radius just inside its bound', { ...params, instrument: { ...params.instrument, column_radius_m: 0.8 } }, true],
    ['a column radius just outside its bound', { ...params, instrument: { ...params.instrument, column_radius_m: 0.8001 } }, false],
    ['a range turned round', { ...params, culture: { ...params.culture, front_radius_m: [0.38, 0.34] } }, false],
    ['a glow channel above 1', { ...params, glow: { ...params.glow, rgb: [0.7, 0.84, 1.01] } }, false],
    ['a seed that is not a whole number', { ...params, seed: 1.5 }, false],
    ['a missing parameter', { ...params, air: { fog_density: 0.075, fog_anisotropy: 0.35 } }, false],
    ['an unknown family', { ...params, family: 'teapot' }, false],
    ['a time limit at the bound', { ...params, render: { ...params.render, time_limit_s: 540 } }, true],
    ['a time limit past the bound', { ...params, render: { ...params.render, time_limit_s: 541 } }, false],
  ];
  const code = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(DATA)})`,
    'import render_artifact as ra',
    'schema = json.load(open(ra.SCHEMA_PATH, encoding="utf-8"))',
    'cases = json.load(sys.stdin)',
    'print(json.dumps([len(ra.validate(c, schema)) == 0 for c in cases]))',
    `print(ra.params_sha256(${JSON.stringify(paramsPath)}))`,
  ].join('\n');
  const r = spawnSync(py, ['-I', '-B', '-c', code], { input: JSON.stringify(cases.map((c) => c[1])), encoding: 'utf8' });
  ok('the validator ran', r.status === 0, r.stderr);
  if (r.status === 0) {
    const [verdicts, pySha] = r.stdout.trim().split(/\r?\n/);
    const v = JSON.parse(verdicts);
    cases.forEach(([name, , want], i) => ok(`validate: ${name} ${want ? 'passes' : 'is refused'}`, v[i] === want));
    ok('Python and Node hash the parameter file alike', pySha === sha);
  }
}

// ---------------------------------------------------------------- 7. the markup
const html = fs.readFileSync(path.join(LABS, 'orthogonal.html'), 'utf8').replace(/\s+/g, ' ');
for (const [what, text] of [['title', WORLD.title], ['driver', WORLD.driver], ['evidence line', WORLD.favours.line],
  ['artifact', WORLD.artifact.title], ['artifact line', WORLD.artifact.line], ["Earth's artifact", WORLD.earthArtifact.title],
  ["Earth's line", WORLD.earthArtifact.line],
  ['image', WORLD.artifact.image], ['alt text', WORLD.artifact.alt]]) {
  ok(`the markup's ${what} is the data's`, html.includes(text), text);
}

console.log(`orthogonal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
