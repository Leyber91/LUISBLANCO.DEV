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
      render measured, and the ones its parameters asked for; the
      night sky is on, cold and bounded by the culture's glow, and
      the render's own pixels show the culture brightest and the
      hood dark against the sky.
  12. The fog thins to none at the drawing's edges, at every moment.
  13. The exercise: what each step needs, against an oracle written
      apart from the engine; the sets (every four steps with at most
      one unordered pair); the check on all 960 orders of every set,
      on the 420 orders of the whole lineage its links allow, and on
      every swap of a step with the step it grows from; the items
      (each set dealt once a round, seeded, never already in order);
      where the steps stand while ordered, at every width; the fog
      around them.
  14. The record in Labs OS's progress store: each answer and choice
      with its time and mode, the count, the log's cap, a reload
      that reads it all back, storage refused three ways, and a
      record that does not hold together read as fresh.
   ============================================================ */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brushStroke } from '../kit/brush.js';
import { seedOf } from '../kit/rng.js';
import { EXERCISE, FOG, INK, LAYOUT, ROLES, SOURCES, STORAGE_OFF, TIMING } from './config.js';
import {
  arrival, check, checkOrder, drillFog, drillPlaces, fogAt, fogDensity, fogField, ignitionEnd, item, itemSets, layout, needLine,
  needPath, needsOf, pairOf, reading, stateOf, step, stepBox, strandAt, trunk, wrap,
} from './engine.js';
import { countLine, fresh, Keeper, KINDS, RECORD_V, restore, withAction, withAnswer, withChoice } from './record.js';
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
    ['a night sky at its bound', { ...params, air: { ...params.air, sky_ambient: 0.02 } }, true],
    ['a night sky past its bound', { ...params, air: { ...params.air, sky_ambient: 0.0201 } }, false],
    ['a file with no night sky', { ...params, air: (() => { const a = { ...params.air }; delete a.sky_ambient; return a; })() }, false],
    ['a sky as strong as the culture\'s dimmest glow', { ...params, air: { ...params.air, sky_ambient: 0.01 }, glow: { ...params.glow, flesh: 0.01 } }, true],
    ['a sky stronger than the culture\'s dimmest glow', { ...params, air: { ...params.air, sky_ambient: 0.01 }, glow: { ...params.glow, flesh: 0.0099 } }, false],
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
  ok('no studio light lit it', params.air.rim_energy_w === 0);
  const sky = params.air.sky_rgb;
  ok("a night sky the long exposure records: on, cold (blue over green over red), and no stronger than the culture's dimmest glow",
    params.air.sky_ambient > 0 && params.air.sky_ambient <= params.glow.flesh && sky[2] > sky[1] && sky[1] > sky[0], JSON.stringify(params.air));
}

// ---------------------------------------------------------------- 11b. the light, read from the render's own pixels
{
  const L = record.measure.light;
  ok('the record measures the light of its own render', !!L && ['culture_p99', 'beyond_column_p995', 'sky_p50', 'hood_p10'].every((k) => typeof L[k] === 'number'), JSON.stringify(L));
  if (L) {
    ok('the culture is the brightest thing in the frame: its top percent over three times the brightest half-percent outside the column', L.culture_p99 > 3 * L.beyond_column_p995, `${L.culture_p99} against ${L.beyond_column_p995}`);
    ok('the sky is recorded and faint: its median luma between 0.02 and 0.1', L.sky_p50 > 0.02 && L.sky_p50 < 0.1, String(L.sky_p50));
    ok('the hood stands dark against the lit sky', L.hood_p10 < L.sky_p50, `${L.hood_p10} against ${L.sky_p50}`);
    ok("the regions read are the instrument's: the hood above the column, the plinth below it", record.measure.regions.hood[3] <= record.measure.regions.column[1] + 0.06 && record.measure.regions.plinth[1] >= record.measure.regions.column[3] - 0.08, JSON.stringify(record.measure.regions));
  }
}

// ---------------------------------------------------------------- 12. the fog at the drawing's edges
for (const [width, height] of [[640, 560], [360, 0], [390, 0]]) {
  const lay = layout(WORLD, { width, height, leader: height > 0 });
  const field = fogField(WORLD, lay);
  const end = ignitionEnd(WORLD, lay);
  const where = `${width} x ${height}`;
  let edgeFog = 0, inside = 0;
  for (const ms of [0, end / 3, end]) {
    const d = fogDensity(field, strandAt(WORLD, lay, ms).edges);
    for (let r = 0; r < field.rows; r++) for (let c = 0; c < field.cols; c++) {
      const outer = r === 0 || c === 0 || r === field.rows - 1 || c === field.cols - 1;
      if (outer && d[r * field.cols + c] > 0) edgeFog++;
    }
  }
  ok(`${where}: no fog in the outermost cells at any moment, so the box never cuts a cloud off square`, edgeFog === 0, `${edgeFog} cells`);
  // just inside the fade: a cell FOG.edge + a cell in from every side keeps its fog in full
  for (let i = 0; i < field.cols * field.rows; i++) {
    const x = ((i % field.cols) + 0.5) * field.cell, y = (Math.floor(i / field.cols) + 0.5) * field.cell;
    const din = Math.min(x, lay.width - x, y, lay.height - y) - field.cell / 2;
    if (din >= FOG.edge && field.edge[i] !== 1) inside++;
    if (din <= 0 && field.edge[i] !== 0) inside++;
  }
  ok(`${where}: the fade is 0 at the edge and 1 from FOG.edge px in`, inside === 0, `${inside} cells`);
}

// ---------------------------------------------------------------- 13. the exercise: order these steps by what each needs
{
  const ids = WORLD.nodes.map((n) => n.id);
  // an oracle written apart from the engine: ancestry by the transitive closure of the parent links (Warshall)
  const k = new Map(ids.map((id, i) => [id, i]));
  const anc = ids.map(() => ids.map(() => false));   // anc[a][b]: a needs b
  for (const n of WORLD.nodes) for (const p of n.after) anc[k.get(n.id)][k.get(p)] = true;
  for (let m = 0; m < ids.length; m++) for (let a = 0; a < ids.length; a++) for (let b = 0; b < ids.length; b++) if (anc[a][m] && anc[m][b]) anc[a][b] = true;
  const needs = (a, b) => anc[k.get(a)][k.get(b)];
  // the oracle's distance in links, by breadth-first search over parents
  const dist = (a, b) => { let frontier = [a], d = 0; const seen = new Set([a]); while (frontier.length) { d++; const nx = []; for (const x of frontier) for (const p of WORLD.nodes.find((n) => n.id === x).after) { if (p === b) return d; if (!seen.has(p)) { seen.add(p); nx.push(p); } } frontier = nx; } return Infinity; };
  const oracle = (order) => {
    for (let i = 0; i < order.length; i++) {
      const later = order.slice(i + 1).filter((b) => needs(order[i], b));
      if (later.length) return { right: false, step: order[i], d: Math.min(...later.map((b) => dist(order[i], b))) };
    }
    return { right: true };
  };
  for (const a of ids) {
    const want = ids.filter((b) => needs(a, b)).sort().join();
    ok(`needsOf ${a} is every step its links reach`, [...needsOf(WORLD, a)].sort().join() === want, [...needsOf(WORLD, a)].join());
  }
  ok('the root needs nothing', needsOf(WORLD, 'lignin').size === 0);
  ok('a step one link away is named by that link', needLine(WORLD, needPath(WORLD, 'farmed', 'fungi')) === 'Fungi farmed needs Fungi eat lignin');
  ok('a step further away is named through each step between', needLine(WORLD, needPath(WORLD, 'lamp', 'farmed')) === 'Mycelial lamp needs Luminous mycelium + glass, which needs Fungi farmed');
  ok('a seed of trouble grows from the success that plants it, and is said so', needLine(WORLD, needPath(WORLD, 'trouble', 'luminous')) === 'The rot that lights the city eats its timber grows from Mycelial lamp, which needs Luminous mycelium + glass');
  ok('a step does not need what grows after it', needPath(WORLD, 'fungi', 'farmed') === null && needPath(WORLD, 'lamp', 'lamp') === null);
  ok("this world's steps never need Earth's, nor Earth's this world's", needPath(WORLD, 'lamp', 'coalgas') === null && needPath(WORLD, 'gaslamp', 'fungi') === null);
  for (const a of ids) for (const b of ids) {
    const p = needPath(WORLD, a, b);
    if (!p) { if (needs(a, b)) ok(`needPath finds ${a} to ${b}`, false); continue; }
    const linked = p.every((x, i) => i === 0 || WORLD.nodes.find((n) => n.id === p[i - 1]).after.includes(x));
    ok(`needPath ${a} to ${b} is a chain of links, as short as any`, linked && p[0] === a && p[p.length - 1] === b && p.length - 1 === dist(a, b), p.join(' '));
  }

  // the sets: every four steps with at most one pair the links leave unordered, and no other
  const sets = itemSets(WORLD);
  const loose = (s) => { let n = 0; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (!needs(s[i], s[j]) && !needs(s[j], s[i])) n++; return n; };
  let all4 = 0, kept = 0;
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) for (let d = c + 1; d < ids.length; d++) {
    all4++;
    const s = [ids[a], ids[b], ids[c], ids[d]];
    const inSets = sets.some((x) => x.join() === s.join());
    if (inSets) kept++;
    if (inSets !== (loose(s) <= EXERCISE.free)) ok(`the set ${s.join(' ')} is an item exactly when at most ${EXERCISE.free} pair is unordered`, false, `loose ${loose(s)}`);
  }
  ok(`the sets are the ${kept} of ${all4} fours with at most one unordered pair`, kept === sets.length && sets.length === 40, `${sets.length}`);
  ok('a set with two unordered pairs is not an item, one with one is', itemSets(WORLD, 4, 2).length > sets.length && sets.some((s) => loose(s) === 1) && sets.every((s) => loose(s) <= 1));

  // the check, on every order of every set: 40 sets, 24 orders each
  let orders = 0, agree = 0;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  for (const s of sets) for (const o of perms(s)) {
    orders++;
    const got = checkOrder(WORLD, o), want = oracle(o);
    const same = got.right === want.right && (want.right || (got.pair && got.pair.step === want.step && got.pair.path.length - 1 === want.d && needs(got.pair.step, got.pair.needs) && o.indexOf(got.pair.needs) > o.indexOf(got.pair.step)));
    if (same) agree++;
    else if (orders - agree <= 5) ok(`check of ${o.join(' ')}`, false, JSON.stringify({ got, want }));
  }
  ok(`the check agrees with the oracle on all ${orders} orders of every set`, agree === orders && orders === 960, `${agree} of ${orders}`);
  ok('a set with an unordered pair has two right orders, every other set one', sets.every((s) => perms(s).filter((o) => checkOrder(WORLD, o).right).length === (loose(s) ? 2 : 1)));

  // every order of the whole lineage the links allow is right, and every swap of two linked neighbours in one is wrong
  const exts = [];
  const grow = (done, left) => {
    if (!left.length) { exts.push(done); return; }
    for (const id of left) if (WORLD.nodes.find((n) => n.id === id).after.every((p) => done.includes(p))) grow([...done, id], left.filter((x) => x !== id));
  };
  grow([], ids);
  ok('the whole lineage has 420 orders its links allow (the two threads either way, Earth woven in)', exts.length === 420, String(exts.length));
  ok('every one of them is right', exts.every((o) => checkOrder(WORLD, o).right));
  let swaps = 0, caught = 0;
  for (const o of exts) for (let i = 0; i + 1 < o.length; i++) {
    if (!needs(o[i + 1], o[i])) continue;
    swaps++;
    const w = o.slice(); [w[i], w[i + 1]] = [w[i + 1], w[i]];
    const r = checkOrder(WORLD, w);
    if (!r.right && r.pair.step === w[i] && r.pair.needs === w[i + 1] && r.pair.path.length === 2) caught++;
  }
  ok(`each of the ${swaps} swaps of a step with the step it grows from is wrong, and named by that one link`, swaps > 0 && caught === swaps, `${caught} of ${swaps}`);
  ok('an order of repeated, unknown or no steps is refused, never marked', ['', ['lamp', 'lamp'], ['lamp', 'nowhere'], []].every((o) => { const r = checkOrder(WORLD, o); return !r.right && r.pair === null && !!r.refused; }));

  // the items
  const firstRound = new Set();
  for (let i = 0; i < 120; i++) {
    const it = item(WORLD, i);
    const set = it.steps.slice().sort().join();
    if (i < sets.length) firstRound.add(set);
    if (!sets.some((s) => s.slice().sort().join() === set) || it.steps.length !== EXERCISE.size || checkOrder(WORLD, it.steps).right) {
      ok(`item ${i} is a set's steps, shuffled, and not already in order`, false, it.steps.join(' '));
    }
  }
  ok('the first 40 items deal every set once', firstRound.size === sets.length);
  ok('an item is the same on every call (seeded by its index)', JSON.stringify(item(WORLD, 7)) === JSON.stringify(item(WORLD, 7)) && JSON.stringify(item(WORLD, 7)) !== JSON.stringify(item(WORLD, 8)));
  ok('item 40 deals item 0\'s set again', item(WORLD, 40).steps.slice().sort().join() === item(WORLD, 0).steps.slice().sort().join());
  ok('an item index that is not a whole number from 0 gives no item', item(WORLD, -1) === null && item(WORLD, 1.5) === null);

  // where the steps stand while they are ordered: apart, on the drawing, every target tall enough
  let bad = 0, checked = 0;
  for (let width = 300; width <= 640; width += 20) for (const height of [0, 560]) {
    const lay = layout(WORLD, { width, height, leader: height > 0 });
    for (let i = 0; i < sets.length; i++) {
      const it = item(WORLD, i);
      const places = drillPlaces(lay, it.steps);
      const boxes = it.steps.map((id) => { const n = lay.nodes.find((x) => x.id === id), p = places.get(id); return { b: stepBox(n, p.dy), hit: { x0: n.hit.x, x1: n.hit.x + n.hit.w, y0: n.hit.y + p.dy, y1: n.hit.y + n.hit.h + p.dy }, h: n.hit.h }; });
      checked++;
      const slotsInOrder = it.steps.every((id, j) => j === 0 || places.get(id).slot === j);
      const apart = boxes.every((x, a) => boxes.every((y, b) => a >= b || (!hits(x.b, y.b) && !hits(x.hit, y.hit))));
      const onDrawing = boxes.every((x) => x.b.x0 >= -0.5 && x.b.x1 <= width + 0.5 && x.b.y0 >= LAYOUT.topPad + LAYOUT.headH && x.hit.y1 <= lay.height + 6);
      const tall = boxes.every((x) => x.h >= 44);
      const down = it.steps.every((id, j) => j === 0 || stepBox(lay.nodes.find((x) => x.id === id), places.get(id).dy).y0 > stepBox(lay.nodes.find((x) => x.id === it.steps[j - 1]), places.get(it.steps[j - 1]).dy).y0);
      if (!(slotsInOrder && apart && onDrawing && tall && down)) { bad++; if (bad <= 4) ok(`${width} x ${height}, item ${i}: the steps stand apart, in the item's order down the drawing, on it, 44 px tall`, false, JSON.stringify({ slotsInOrder, apart, onDrawing, tall, down })); }
    }
  }
  ok(`in all ${checked} layouts of an item the steps stand apart, in order, on the drawing, every target 44 px tall`, bad === 0, `${bad} bad`);

  // the fog while ordering: the lineage's fog before the strand drew it, clear about each step
  for (const [width, height] of [[390, 0], [640, 560]]) {
    const lay = layout(WORLD, { width, height, leader: height > 0 });
    const field = fogField(WORLD, lay);
    const before = fogDensity(field, strandAt(WORLD, lay, 0).edges);
    for (const i of [0, 3, 5, 11]) {
      const it = item(WORLD, i);
      const places = drillPlaces(lay, it.steps);
      const d = drillFog(WORLD, lay, places, field);
      for (const id of it.steps) {
        const n = lay.nodes.find((x) => x.id === id), p = places.get(id);
        ok(`${width}: while ordering item ${i}, ${id} stands clear of the fog`, fogAt(field, d, n.x, n.y + p.dy) === 0 && fogAt(field, d, n.label.anchor === 'start' ? n.label.x + 12 : n.label.x - 12, n.label.y - 4 + p.dy) === 0);
      }
      // away from the steps (past the clearing and three of its reaches) the fog is the lineage's before the strand drew
      const boxes = it.steps.map((id) => stepBox(lay.nodes.find((x) => x.id === id), places.get(id).dy));
      let away = 0, off = 0;
      for (let k = 0; k < d.length; k++) {
        const x = ((k % field.cols) + 0.5) * field.cell, y = (Math.floor(k / field.cols) + 0.5) * field.cell;
        const dist = Math.min(...boxes.map((b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1))));
        if (dist > FOG.drillClear + 3 * FOG.drillReach) { away++; if (Math.abs(d[k] - before[k]) > 2e-4) off++; }
      }
      ok(`${width}, item ${i}: the fog is never more than the lineage's before the strand drew, and is that fog away from the steps`,
        d.every((v, k) => v <= before[k] + 1e-9) && away > 100 && off === 0, `${off} of ${away} cells away`);
      ok(`${width}, item ${i}: and it thins to none at the edges`, d.every((v, k) => { const c = k % field.cols, r = Math.floor(k / field.cols); return !(c === 0 || r === 0 || c === field.cols - 1 || r === field.rows - 1) || v === 0; }));
    }
  }
}

// ---------------------------------------------------------------- 14. the record, in Labs OS's progress store
{
  const { memoryStore } = await import('../os/store.js');
  const { Progress } = await import('../os/progress.js');
  const ids = WORLD.nodes.map((n) => n.id);
  const lab = (store) => { const p = new Progress(store); return { get: (o) => p.get('alt-reality', o), set: (d, o) => p.set('alt-reality', d, o) }; };

  // an answer and a choice are kept with their time and their mode
  let s = fresh();
  s = withChoice(s, { t: 1000, node: 'fungi' });
  s = withAnswer(s, { t: 2000, item: 0, order: ['lignin', 'fungi', 'farmed', 'trouble'], right: true });
  s = withAnswer(s, { t: 3000, item: 1, order: ['lamp', 'trouble', 'nocoal', 'fungi'], right: false, needs: ['lamp', 'nocoal'] });
  ok('the count is items answered and items right', s.answered === 2 && s.right === 1 && countLine(s) === '2 answered, 1 right', countLine(s));
  ok('the next item follows the last one answered', s.next === 2);
  ok('each answer is stored with its time and the mode it came from', s.log.filter((e) => e.kind === 'answer').every((e) => typeof e.t === 'number' && e.mode === 'practice'));
  ok('a step chosen in the reading is stored as an action of the explore mode, with its time', s.log[0].mode === 'explore' && s.log[0].kind === 'choose' && s.log[0].node === 'fungi' && s.log[0].t === 1000);
  ok('a wrong answer keeps the pair that was out of order', s.log[2].right === false && s.log[2].needs.join() === 'lamp,nocoal');
  ok('the step chosen is kept to reopen on', s.chosen === 'fungi');
  // the actions of an order are kept too, each with its time and the practice mode
  let acts = withAction(fresh(), { t: 10, kind: 'start', item: 4 });
  acts = withAction(acts, { t: 11, kind: 'press', item: 4, node: 'fungi' });
  acts = withAction(acts, { t: 12, kind: 'undo', item: 4, node: 'fungi' });
  acts = withAction(acts, { t: 13, kind: 'leave', item: 4 });
  ok('starting, pressing, undoing and leaving an order are each stored with their time and the practice mode',
    acts.log.map((e) => `${e.mode}:${e.kind}:${e.t}`).join() === 'practice:start:10,practice:press:11,practice:undo:12,practice:leave:13' && acts.answered === 0);
  ok('an action that is not one of an order is not stored, nor an answer by that door', withAction(fresh(), { t: 1, kind: 'dance', item: 0 }).log.length === 0 && withAction(fresh(), { t: 1, kind: 'answer', item: 0 }).log.length === 0);
  // a walk down the drawing with the arrow keys is one choice, the step it ended on
  let walk = withChoice(fresh(), { t: 0, node: 'lignin' });
  walk = withChoice(walk, { t: 100, node: 'fungi', walk: true });
  walk = withChoice(walk, { t: 100 + EXERCISE.walkMs, node: 'farmed', walk: true });
  walk = withChoice(walk, { t: 101 + 2 * EXERCISE.walkMs, node: 'nocoal', walk: true });
  ok(`arrow-key choices within ${EXERCISE.walkMs} ms are one walk, logged as where it ended; one just past that is a new choice`,
    walk.log.map((e) => e.node).join() === 'lignin,farmed,nocoal' && walk.chosen === 'nocoal', walk.log.map((e) => e.node).join());
  ok('a press is never merged into a walk', withChoice(withChoice(fresh(), { t: 0, node: 'fungi', walk: true }), { t: 10, node: 'lamp' }).log.length === 2);
  ok('a reload keeps every kind of entry the log may hold', restore({ ...fresh(), log: [...acts.log, ...walk.log] }, ids).log.length === acts.log.length + walk.log.length && Object.keys(KINDS).join() === 'practice,explore');
  let big = s;
  for (let i = 0; i < EXERCISE.logCap + 50; i++) big = withChoice(big, { t: 4000 + i, node: 'lamp' });
  ok(`the log keeps its last ${EXERCISE.logCap} entries and the counts are never trimmed`, big.log.length === EXERCISE.logCap && big.answered === 2 && big.right === 1);

  // a reload: a second keeper over the same store reads back the count, the chosen step and the next item
  const store = memoryStore({ persistent: true, note: '' });
  const k1 = new Keeper(lab(store), { persistent: true });
  ok('a fresh store reads as a fresh record', JSON.stringify(await k1.load(ids)) === JSON.stringify(fresh()));
  ok('a write to a store that persists is kept', (await k1.save(s)) === true && k1.kept);
  const k2 = new Keeper(lab(store), { persistent: true });
  const back = await k2.load(ids);
  ok('after a reload the count, the chosen step and the next item come back', back.answered === 2 && back.right === 1 && back.chosen === 'fungi' && back.next === 2 && back.log.length === 3, JSON.stringify(back));
  ok('the record is the plate\'s, at its version, in the lab\'s progress record', (await new Progress(store).get('alt-reality')).v === RECORD_V && (await new Progress(store).get('alt-reality')).data.page === 'orthogonal');

  // storage refused: no Labs OS, a store that keeps nothing after the tab, or a write that fails
  const none = new Keeper(null, { persistent: true });
  ok('with no Labs OS the record is fresh and not kept, and the exercise still counts for the visit', JSON.stringify(await none.load(ids)) === JSON.stringify(fresh()) && (await none.save(s)) === false && !none.kept && countLine(withAnswer(fresh(), { t: 1, item: 0, order: ['a'], right: true })) === '1 answered, 1 right');
  const mem = new Keeper(lab(memoryStore({ persistent: false, note: 'blocked' })), { persistent: false });
  await mem.save(s);
  ok('a store that keeps nothing after the tab is said to keep nothing', !mem.kept && (await mem.load(ids)).answered === 2);
  const failing = new Keeper({ get: async () => { throw new Error('refused'); }, set: async () => { throw new Error('refused'); } }, { persistent: true });
  ok('a store that refuses a read gives a fresh record, not kept', JSON.stringify(await failing.load(ids)) === JSON.stringify(fresh()) && !failing.kept);
  ok('a store that refuses a write is said to keep nothing', (await failing.save(s)) === false && !failing.kept);
  ok('the words for that are the bindings\' storage-off diagnosis', STORAGE_OFF === 'Your browser is not letting this page keep anything, so your answers last until you close it. A link to a step still opens that step.');

  // a record that does not hold together is never trusted
  ok('a record of another page reads as fresh', restore({ page: 'loom', answered: 3, right: 1, next: 1 }, ids).answered === 0);
  ok('a record with more right than answered reads as fresh', restore({ page: 'orthogonal', answered: 1, right: 2, next: 0, log: [] }, ids).answered === 0);
  ok('a record with a negative or broken count reads as fresh', restore({ page: 'orthogonal', answered: -1, right: 0, next: 0 }, ids).answered === 0 && restore({ page: 'orthogonal', answered: 1.5, right: 0, next: 0 }, ids).answered === 0);
  ok('a chosen step that is not in the world is dropped, the rest kept', (() => { const r = restore({ ...s, chosen: 'nowhere' }, ids); return r.chosen === null && r.answered === 2; })());
  ok('a log entry with no time or no mode is dropped', restore({ ...s, log: [...s.log, { kind: 'answer' }, { t: 5, mode: 'dream', kind: 'answer' }] }, ids).log.length === 3);
}

console.log(`orthogonal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
