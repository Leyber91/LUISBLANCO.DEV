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
   8. The ignition clock (strandAt): nothing of this world's branch
      at 0, Earth's branch always; each line drawn in row order; the
      artifact reached at arrival and not before; done at its end.
   9. The fog (fogDensity), bound to state: none on Earth's branch
      or the root at any moment; full on this world's branch before
      the strand, thinner after it with a clear channel along the
      ink; the seed of trouble in full fog always; and no cell's fog
      grows as the strand advances.
  10. The brush: every line is seeded by the two steps it joins, so
      no two lines share a stroke and a redraw is the same drawing.
  11. The frame: the lines Earth's lamp stands on are the ones the
      render measured, and the ones its parameters asked for.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brushStroke } from '../kit/brush.js';
import { seedOf } from '../kit/rng.js';
import { FOG, INK, LAYOUT, ROLES, SOURCES, TIMING } from './config.js';
import { arrival, check, fogAt, fogDensity, fogField, ignitionEnd, layout, pairOf, reading, stateOf, step, strandAt, trunk, wrap } from './engine.js';
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
    for (const e of lay.edges) {
      const bad = lay.nodes.find((n) => { const b = textBox(n); return e.pts.some(([x, y]) => x > b.x0 + 1 && x < b.x1 - 1 && y > b.y0 + 1 && y < b.y1 - 1); });
      ok(`${where}: ${e.from} to ${e.to} crosses no label`, !bad, bad && bad.id);
      for (let k = 1; k < e.pts.length; k++) if (e.pts[k][1] < e.pts[k - 1][1] - 1e-9) { ok(`${where}: ${e.from} to ${e.to} never turns upward`, false); break; }
      const a = e.pts[0], b = e.pts[e.pts.length - 1], P = pos.get(e.from), C = pos.get(e.to), h = LAYOUT.node / 2;
      ok(`${where}: ${e.from} to ${e.to} is laid from the foot of its cause's square to the head of its effect's`, Math.hypot(a[0] - P.x, a[1] - (P.y + h)) < 0.01 && Math.hypot(b[0] - C.x, b[1] - (C.y - h)) < 0.01);
    }
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
    ['an instrument as tall as the line its foot stands on', { ...params, camera: { ...params.camera, fill: params.camera.ground_y } }, true],
    ['an instrument taller than the line its foot stands on', { ...params, camera: { ...params.camera, fill: params.camera.ground_y + 0.0001 } }, false],
    ['a street with no ground block', (() => { const c = { ...params }; delete c.ground; return c; })(), false],
    ['an exposure past its bound', { ...params, exposure: { stops: 10.01 } }, false],
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
  ['image', WORLD.artifact.image], ['alt text', WORLD.artifact.alt], ['exposure note', WORLD.artifact.exposure]]) {
  ok(`the markup's ${what} is the data's`, html.includes(text), text);
}

// ---------------------------------------------------------------- 8. the ignition clock
{
  const lay = layout(WORLD, { width: 640, height: 560, leader: true });
  const at = (ms) => strandAt(WORLD, lay, ms);
  const idx = (from, to) => lay.edges.findIndex((e) => e.from === from && e.to === to);
  const s0 = at(0);
  ok('at 0 no line of this world is drawn', lay.edges.every((e, i) => (e.kind === 'fired' || e.kind === 'thread' || e.kind === 'pending' ? s0.edges[i] === 0 : true)));
  ok("at 0 Earth's branch is all there", lay.edges.every((e, i) => (e.kind === 'earth' ? s0.edges[i] === 1 : true)));
  ok('at 0 no step of this world shows, and Earth and the root do', lay.nodes.every((n) => s0.nodes.get(n.id) === (n.state === 'fired' || n.state === 'pending' ? 0 : 1)));
  const art = arrival(WORLD, lay), into = idx('luminous', 'lamp');
  ok('the line into the artifact is drawn at arrival', at(art).edges[into] === 1);
  ok('and not 1 ms before', at(art - 1).edges[into] < 1);
  ok('arrival is the artifact row less one, times a row, plus a line', art === (lay.nodes.find((n) => n.id === 'lamp').row - 1) * TIMING.perRow + TIMING.edge);
  ok('the driver is drawn before the step under it', at(TIMING.edge).edges[idx('lignin', 'fungi')] === 1 && at(TIMING.edge).edges[idx('fungi', 'nocoal')] < 1);
  let mono = true;
  for (let t = 0; t < ignitionEnd(WORLD, lay); t += 17) {
    const a = at(t), b = at(t + 17);
    if (a.edges.some((v, i) => b.edges[i] < v) || [...a.nodes].some(([id, v]) => b.nodes.get(id) < v)) mono = false;
  }
  ok('nothing undraws as the clock runs', mono);
  ok('the ignition is done at its end and not before', at(ignitionEnd(WORLD, lay)).done && !at(ignitionEnd(WORLD, lay) - 1).done);
  const end = at(ignitionEnd(WORLD, lay));
  ok('at its end every line and step is drawn', end.edges.every((v) => v === 1) && [...end.nodes.values()].every((v) => v === 1) && end.leader === 1);
  ok('the strand reaches the artifact inside the ignition', art > 0 && art < ignitionEnd(WORLD, lay));
}

// ---------------------------------------------------------------- 9. the fog
for (const [width, height] of [[640, 560], [360, 0]]) {
  const lay = layout(WORLD, { width, height, leader: height > 0 });
  const field = fogField(WORLD, lay);
  const at = (ms) => fogDensity(field, strandAt(WORLD, lay, ms).edges);
  const end = ignitionEnd(WORLD, lay);
  const d0 = at(0), d1 = at(end);
  const where = `${width} x ${height}`;
  const n = (id) => lay.nodes.find((x) => x.id === id);
  const fogOf = (d, x, y) => fogAt(field, d, x, y);
  for (const node of lay.nodes.filter((x) => x.state === 'earth' || x.state === 'root')) {
    ok(`${where}: no fog on ${node.id} (history) at 0 or at rest`, fogOf(d0, node.x, node.y) === 0 && fogOf(d1, node.x, node.y) === 0);
  }
  for (const e of lay.edges.filter((x) => x.kind === 'earth')) {
    const clear = e.pts.every(([x, y]) => [0, end / 2, end].every((t) => fogOf(at(t), x, y) === 0));
    ok(`${where}: no fog along Earth's line ${e.from} to ${e.to}, at any moment`, clear);
  }
  for (const id of ['fungi', 'farmed', 'nocoal', 'luminous']) {
    const p = n(id);
    ok(`${where}: before the strand, ${id} stands in nearly full fog`, fogOf(d0, p.x, p.y) >= 0.9 * FOG.full, fogOf(d0, p.x, p.y).toFixed(2));
    const side = p.x + (p.x > lay.lanes.side ? 20 : -20);
    const v = fogOf(d1, side, p.y + 16);
    ok(`${where}: at rest ${id}'s ink sits in a clearing, its fog under 0.65 of the fog 20 px off`, fogOf(d1, p.x, p.y) <= 0.65 * v, `${fogOf(d1, p.x, p.y).toFixed(2)} against ${v.toFixed(2)}`);
    ok(`${where}: and 20 px from it the invented branch keeps its fog`, v >= 0.3 && v <= FOG.rest, v.toFixed(2));
  }
  const t = n('trouble');
  ok(`${where}: the seed of trouble stands in full fog, at 0 and at rest`, fogOf(d0, t.x, t.y) >= 0.95 && fogOf(d1, t.x, t.y) >= 0.95);
  {
    const w = Math.max(...t.label.lines.map((s) => s.length)) * LAYOUT.charW;
    const v = fogOf(d1, t.label.x + w / 2, t.label.y);
    ok(`${where}: and its fog runs over its words`, v >= 0.6, v.toFixed(2));
  }
  ok(`${where}: more fog on what has not happened than beside what was invented`, fogOf(d1, t.x + 20, t.y) > fogOf(d1, n('nocoal').x + 20, n('nocoal').y + 16));
  let grew = 0;
  let prev = d0;
  for (let ms = 60; ms <= end; ms += 60) {
    const d = at(ms);
    for (let i = 0; i < d.length; i++) if (d[i] > prev[i] + 1e-6) grew++;
    prev = d;
  }
  ok(`${where}: no cell's fog grows as the strand advances`, grew === 0, `${grew} cells`);
  ok(`${where}: the fog never leaves 0 to 1`, d0.every((v) => v >= 0 && v <= 1) && d1.every((v) => v >= 0 && v <= 1));
}

// ---------------------------------------------------------------- 10. the brush
{
  const lay = layout(WORLD, { width: 640, height: 560, leader: true });
  const seeds = lay.edges.map((e) => seedOf('orthogonal', e.from, e.to));
  ok('every line has its own seed', new Set(seeds).size === seeds.length);
  const draw = () => lay.edges.map((e, i) => brushStroke(e.pts, { width: INK[e.kind], seed: seeds[i] }).paths.join('|'));
  const a = draw(), b = draw();
  ok('a redraw is the same drawing', a.every((x, i) => x === b[i]));
  ok('every kind of line has a brush width', lay.edges.every((e) => INK[e.kind] > 0));
  ok("this world's branch is drawn wider than Earth's, and Earth's wider than what has not happened", INK.fired > INK.thread && INK.thread > INK.earth && INK.earth > INK.pending);
}

// ---------------------------------------------------------------- 11. the frame
{
  const f = WORLD.artifact.frame, m = record.measure.frame, cam = params.camera;
  ok("the frame Earth's lamp stands on is the one the render measured", !!m && Math.abs(f.top - m.top) <= 0.002 && Math.abs(f.ground - m.ground) <= 0.002, JSON.stringify({ f, m }));
  ok('and the one its parameters asked for', Math.abs(f.ground - cam.ground_y) <= 0.005 && Math.abs(f.top - (cam.ground_y - cam.fill)) <= 0.005, JSON.stringify(cam));
  ok("the record's exposure is the parameter file's, and it is a long exposure", record.exposure_stops === params.exposure.stops && params.exposure.stops > 0);
  ok('no light but the culture lit it: no studio light, a black sky', params.air.rim_energy_w === 0 && params.air.sky_rgb.every((v) => v === 0));
}

console.log(`orthogonal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
