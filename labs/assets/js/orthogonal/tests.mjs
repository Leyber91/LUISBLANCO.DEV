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
      (each set dealt once a round, a draw seeded by its attempt);
      where the steps stand while ordered, with what each needs
      under them, at every width; the fog around them.
  14. The record in Labs OS's progress store: each answer and choice
      with its time and mode, the count, the log's cap; an order in
      progress (its seed and its presses) read back after a reload
      through Progress over a memory store, each press one change
      to what the store holds; storage refused three ways; a record
      that does not hold together read as fresh.
  15. Hub lesson L17: over 24,000 draws on each of six paths, no
      non-answer (the order shown given back, each of the 24 fixed
      patterns of places, the last draw's right places, and on a
      record started again the places a first visit found right,
      pressed blind) is right more often than random pressing,
      computed exactly from the links, plus a stated margin. Two
      paths stay inside one record; four are the visitor's starting
      states (a fresh record, an erased one, storage off and a
      reload, a returning record), 600 visitors each (review C2).
      The table is printed, and it catches both earlier rules: a
      draw seeded by its item alone, and by the attempt counter
      alone with no salt.
  16. The needs lines: each names a word of every step its node
      needs, never one of a step that needs it, and a reader given
      only the four steps' words orders every item right.
  17. One rule decides gold: the strand is gold in the reading only,
      and the drawing and the legend are painted from one call.
  18. Every sentence on the page about the render or its making (the
      alt text, the caption, the artifact's note and evidence, the
      provenance line, the fallback, Earth's tag and the page's
      description) is read word by word against the parameter file,
      the render's record and the pipeline's source (render-words.js);
      the alt text is held to a closed vocabulary; each fact bites
      from just outside and holds just inside; the provenance line
      prints the record's numbers, its time to the second (review
      C1).
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
  arrival, check, checkOrder, drillFog, drillPlaces, fogAt, fogDensity, fogField, ignitionEnd, item, itemSets, judge, layout, needLine, srcsOf,
  needPath, needsOf, needVerb, pairOf, reading, reasons, stateOf, step, stepBox, stepsOf, strandAt, strandGold, trunk, wrap,
} from './engine.js';
import { countLine, fresh, isSalt, Keeper, KINDS, newSalt, RECORD_V, restore, withChoice, withLeave, withPress, withStart, withUndo } from './record.js';
import { ALT_PLAIN, DEPARTURES, departureFaults, fallbackLine, provenance, RENDER_WORDS, renderSentences, renderWordFaults, wordsOf } from './render-words.js';
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
  ['a list of sources with one that does not exist', (w) => { node(w, 'lamp').evidence[1].src = ['desbenoit2004', 'nobody2099']; }],
  ['an empty list of sources', (w) => { node(w, 'lamp').evidence[1].src = []; }],
  ['a tag other than REAL or ILLUSTRATIVE', (w) => { node(w, 'fungi').evidence[0].tag = 'LIKELY'; }],
  ['no evidence', (w) => { node(w, 'farmed').evidence = []; }],
  ['a step with no line saying what it needs', (w) => { node(w, 'nocoal').needs = ' '; }],
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
ok('every source cited is used', Object.keys(SOURCES).every((k) => WORLD.nodes.some((n) => n.evidence.some((e) => srcsOf(e).includes(k))) || (WORLD.artifact.exposureCites || []).includes(k)));
ok('an item that cites two sources is read with both, in its order', reading(WORLD, 'lamp').evidence[1].source === `${SOURCES.desbenoit2004}; ${SOURCES.raistrick2023}`, reading(WORLD, 'lamp').evidence[1].source);

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

  // the items: a draw is a set's steps in an order seeded by the attempt and the record's salt
  const SALT = 20261121;
  const firstRound = new Set();
  for (let i = 0; i < 120; i++) {
    const it = item(WORLD, i, 1000 + i, SALT);
    const set = it.steps.slice().sort().join();
    if (i < sets.length) firstRound.add(set);
    if (!sets.some((s) => s.slice().sort().join() === set) || it.steps.length !== EXERCISE.size || it.index !== i || it.seed !== 1000 + i) {
      ok(`draw ${i} is a set's steps, shuffled`, false, it.steps.join(' '));
    }
  }
  ok('the first 40 items deal every set once', firstRound.size === sets.length);
  ok('a draw is the same on every call with its seed (a reload draws an order in progress again as it was)', JSON.stringify(item(WORLD, 7, 3, SALT)) === JSON.stringify(item(WORLD, 7, 3, SALT)));
  const places7 = new Set();
  for (let seed = 0; seed < 100; seed++) places7.add(item(WORLD, 7, seed, SALT).steps.join());
  ok('a new seed brings the same four steps in new places: 100 attempts at one item show at least 20 of its 24 orders', places7.size >= 20 && [...places7].every((o) => o.split(',').sort().join() === item(WORLD, 7, 0, SALT).steps.slice().sort().join()), String(places7.size));
  ok('item 40 deals item 0\'s set again', item(WORLD, 40, 5, SALT).steps.slice().sort().join() === item(WORLD, 0, 9, SALT).steps.slice().sort().join());
  ok('an item or a seed that is not a whole number from 0 gives no draw', item(WORLD, -1, 0, SALT) === null && item(WORLD, 1.5, 0, SALT) === null && item(WORLD, 1, -1, SALT) === null && item(WORLD, 1, 0.5, SALT) === null && item(WORLD, 1, undefined, SALT) === null);
  // the salt is required, so no caller can fall back to the counter alone (review C2); its bounds, just inside and out
  ok('a draw with no salt, or a salt that is not 32 bits, is none', item(WORLD, 1, 0) === null && item(WORLD, 1, 0, -1) === null && item(WORLD, 1, 0, 2 ** 32) === null && item(WORLD, 1, 0, 1.5) === null
    && item(WORLD, 1, 0, 0) !== null && item(WORLD, 1, 0, 2 ** 32 - 1) !== null);
  ok('stepsOf draws an order in progress again from its item, its seed and the salt, and gives none for none', stepsOf(WORLD, { item: 7, seed: 3 }, SALT).join() === item(WORLD, 7, 3, SALT).steps.join() && stepsOf(WORLD, null, SALT) === null && stepsOf(WORLD, { item: 7, seed: 3 }) === null);
  {
    // two records, two salts: the same item at the same attempt is the same four steps, in other places for most items
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const a = item(WORLD, i, 0, 1), b = item(WORLD, i, 0, 2);
      if (a.steps.slice().sort().join() !== b.steps.slice().sort().join()) moved = -1000;
      if (a.steps.join() !== b.steps.join()) moved++;
    }
    ok('a draw is seeded by the salt: two salts deal the same steps for an item and its attempt, in other places for at least 30 of 40 items', moved >= 30, String(moved));
  }
  ok('judge keeps the check as the record does: right, or the step and the nearest step it needs that came after it',
    judge(WORLD, ['lignin', 'fungi', 'farmed', 'lamp']).right === true && judge(WORLD, ['lignin', 'fungi', 'farmed', 'lamp']).needs === null
    && judge(WORLD, ['lamp', 'lignin', 'fungi', 'farmed']).right === false && judge(WORLD, ['lamp', 'lignin', 'fungi', 'farmed']).needs.join() === 'lamp,farmed');

  // the reasons the footer is reserved for: every one a wrong order of an item gives, and only those
  const given = new Set();
  for (const s of sets) for (const o of perms(s)) { const r = checkOrder(WORLD, o); if (!r.right) given.add(needLine(WORLD, r.pair.path)); }
  const rs = reasons(WORLD);
  let longest = '';
  for (const a of ids) for (const b of ids) { const pth = needPath(WORLD, a, b); if (pth && needLine(WORLD, pth).length > longest.length) longest = needLine(WORLD, pth); }
  ok(`reasons() is every reason a wrong order of an item gives, once each (${rs.length})`, rs.length === given.size && rs.every((x) => given.has(x)) && new Set(rs).size === rs.length);
  ok('and not the longest chain of the lineage, which no item of four steps can show', !rs.includes(longest) && Math.max(...rs.map((x) => x.length)) < longest.length, `${Math.max(...rs.map((x) => x.length))} against ${longest.length}`);

  // where the steps stand while they are ordered: apart, on the drawing, every target tall enough, each with what it
  // needs under its words
  let bad = 0, checked = 0;
  for (let width = 300; width <= 640; width += 20) for (const height of [0, 560]) {
    const lay = layout(WORLD, { width, height, leader: height > 0 });
    for (const n of lay.nodes) {
      const want = `${needVerb(node(WORLD, n.id))} ${node(WORLD, n.id).needs}`;
      if (n.label.needs.join(' ') !== want) ok(`${width}: ${n.id}'s needs line is the data's, wrapped`, false, n.label.needs.join('|'));
    }
    for (let i = 0; i < sets.length; i++) {
      const it = item(WORLD, i, i, SALT);
      const places = drillPlaces(lay, it.steps);
      const boxes = it.steps.map((id) => { const n = lay.nodes.find((x) => x.id === id), p = places.get(id); return { b: stepBox(n, p.dy, true), hit: { x0: n.drillHit.x, x1: n.drillHit.x + n.drillHit.w, y0: n.drillHit.y + p.dy, y1: n.drillHit.y + n.drillHit.h + p.dy }, h: n.drillHit.h }; });
      checked++;
      const slotsInOrder = it.steps.every((id, j) => j === 0 || places.get(id).slot === j);
      const apart = boxes.every((x, a) => boxes.every((y, b) => a >= b || (!hits(x.b, y.b) && !hits(x.hit, y.hit))));
      const onDrawing = boxes.every((x) => x.b.x0 >= -0.5 && x.b.x1 <= width + 0.5 && x.b.y0 >= LAYOUT.topPad + LAYOUT.headH && x.hit.y1 <= lay.height + 6);
      const tall = boxes.every((x) => x.h >= 44);
      // the target covers the step's words and what it needs
      const covers = boxes.every((x) => x.hit.x0 <= Math.max(0, x.b.x0) + 0.5 && x.hit.x1 >= Math.min(width, x.b.x1) - 0.5 && x.hit.y1 >= x.b.y1);
      const down = it.steps.every((id, j) => j === 0 || stepBox(lay.nodes.find((x) => x.id === id), places.get(id).dy, true).y0 > stepBox(lay.nodes.find((x) => x.id === it.steps[j - 1]), places.get(it.steps[j - 1]).dy, true).y0);
      if (!(slotsInOrder && apart && onDrawing && tall && down && covers)) { bad++; if (bad <= 4) ok(`${width} x ${height}, item ${i}: the steps stand apart, in the draw's order down the drawing, on it, 44 px tall, their targets over their words`, false, JSON.stringify({ slotsInOrder, apart, onDrawing, tall, down, covers })); }
    }
  }
  ok(`in all ${checked} layouts of an item the steps stand apart with what each needs, in order, on the drawing, every target 44 px tall and over its words`, bad === 0, `${bad} bad`);

  // the fog while ordering: the lineage's fog before the strand drew it, clear about each step
  for (const [width, height] of [[390, 0], [640, 560]]) {
    const lay = layout(WORLD, { width, height, leader: height > 0 });
    const field = fogField(WORLD, lay);
    const before = fogDensity(field, strandAt(WORLD, lay, 0).edges);
    for (const i of [0, 3, 5, 11]) {
      const it = item(WORLD, i, i, SALT);
      const places = drillPlaces(lay, it.steps);
      const d = drillFog(WORLD, lay, places, field);
      for (const id of it.steps) {
        const n = lay.nodes.find((x) => x.id === id), p = places.get(id);
        const lastNeed = n.label.y - 4 + p.dy + (n.label.lines.length + n.label.needs.length - 1) * LAYOUT.lineH;
        const lx = n.label.anchor === 'start' ? n.label.x + 12 : n.label.x - 12;
        ok(`${width}: while ordering item ${i}, ${id} and what it needs stand clear of the fog`, fogAt(field, d, n.x, n.y + p.dy) === 0 && fogAt(field, d, lx, n.label.y - 4 + p.dy) === 0 && fogAt(field, d, lx, lastNeed) === 0);
      }
      // away from the steps (past the clearing and three of its reaches) the fog is the lineage's before the strand drew
      const boxes = it.steps.map((id) => stepBox(lay.nodes.find((x) => x.id === id), places.get(id).dy, true));
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
  const drawOf = (o, salt) => stepsOf(WORLD, o, salt);
  const judgeOf = (order) => judge(WORLD, order);
  const unsalted = ({ salt, ...r }) => r;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const rightOf = (steps) => perms(steps).find((o) => checkOrder(WORLD, o).right);
  const wrongOf = (steps) => perms(steps).find((o) => !checkOrder(WORLD, o).right);
  const press = (st, t, node) => withPress(st, { t, node, stepsOf: drawOf, judge: judgeOf });

  // an answer and a choice are kept with their time and their mode; an order is started, pressed and answered
  let s = fresh();
  ok('a record is created with a salt of 32 bits', isSalt(s.salt) && isSalt(newSalt()));
  {
    const salts = new Set(Array.from({ length: 2000 }, () => fresh().salt));
    ok('every record created gets its own salt: 2000 fresh records, at least 1999 salts', salts.size >= 1999, String(salts.size));
  }
  s = withChoice(s, { t: 1000, node: 'fungi' });
  s = withStart(s, { t: 1500, item: 0 });
  ok('a start opens item 0 with the attempt counter as its seed, and counts the attempt', s.attempts === 1 && s.open.item === 0 && s.open.seed === 0 && s.open.picks.length === 0);
  const d0 = drawOf(s.open, s.salt);
  let t = 2000;
  for (const id of rightOf(d0)) s = press(s, t++, id);
  ok('the fourth press is checked and kept as an answer: right, the order closed, the next item after it', s.answered === 1 && s.right === 1 && s.open === null && s.next === 1);
  s = withStart(s, { t: 3000, item: 1 });
  ok('the next start takes the next seed', s.open.seed === 1 && s.attempts === 2);
  const d1 = drawOf(s.open, s.salt);
  const wrong1 = wrongOf(d1);
  for (const id of wrong1) s = press(s, t++, id);
  ok('the count is items answered and items right', s.answered === 2 && s.right === 1 && countLine(s) === '2 answered, 1 right', countLine(s));
  ok('the next item follows the last one answered', s.next === 2);
  const answers = s.log.filter((e) => e.kind === 'answer');
  ok('each answer is stored with its time, the mode it came from and the order pressed', answers.length === 2 && answers.every((e) => typeof e.t === 'number' && e.mode === 'practice') && answers[1].order.join() === wrong1.join());
  ok('a step chosen in the reading is stored as an action of the explore mode, with its time', s.log[0].mode === 'explore' && s.log[0].kind === 'choose' && s.log[0].node === 'fungi' && s.log[0].t === 1000);
  ok('a wrong answer keeps the pair that was out of order, as the engine judged it', answers[1].right === false && answers[1].needs.join() === judge(WORLD, wrong1).needs.join());
  ok('the step chosen is kept to reopen on', s.chosen === 'fungi');
  ok('every press, start and answer is logged with its time and the practice mode', s.log.filter((e) => e.mode === 'practice').map((e) => e.kind).join() === 'start,press,press,press,press,answer,start,press,press,press,press,answer');

  // a press that is not one changes nothing: none in progress, a step not in the draw, a step pressed already
  let o = withStart(fresh(), { t: 1, item: 5 });
  const d5 = drawOf(o.open, o.salt);
  const outside = ids.find((id) => !d5.includes(id));
  ok('a press with no order in progress changes nothing', press(fresh(), 2, d5[0]).log.length === 0);
  ok('a press on a step that is not in the draw changes nothing', press(o, 2, outside) === o);
  o = press(o, 2, d5[0]);
  ok('a step pressed twice is pressed once', press(o, 3, d5[0]) === o && o.open.picks.join() === d5[0]);
  o = press(o, 3, d5[1]);
  o = withUndo(o, { t: 4 });
  ok('an undo takes back the last press, logged with the step it took back', o.open.picks.join() === d5[0] && o.log[o.log.length - 1].kind === 'undo' && o.log[o.log.length - 1].node === d5[1]);
  ok('an undo with nothing pressed changes nothing', withUndo(withStart(fresh(), { t: 1, item: 0 }), { t: 2 }).log.length === 1);
  o = withLeave(o, { t: 5 });
  ok('a leave closes the order unanswered, and its item stays next', o.open === null && o.answered === 0 && o.next === 0 && o.log[o.log.length - 1].kind === 'leave');
  o = withStart(o, { t: 6, item: 5 });
  ok('started again, the same item is a new draw: the next seed', o.open.item === 5 && o.open.seed === 1 && o.attempts === 2);
  ok('a start on another item while one is open takes its place', withStart(o, { t: 7, item: 9 }).open.item === 9 && withStart(o, { t: 7, item: 9 }).open.seed === 2);
  ok('an item that is not a whole number from 0 starts nothing', withStart(fresh(), { t: 1, item: -1 }).open === null && withStart(fresh(), { t: 1, item: 1.5 }).attempts === 0);

  // a walk down the drawing with the arrow keys is one choice, the step it ended on
  let walk = withChoice(fresh(), { t: 0, node: 'lignin' });
  walk = withChoice(walk, { t: 100, node: 'fungi', walk: true });
  walk = withChoice(walk, { t: 100 + EXERCISE.walkMs, node: 'farmed', walk: true });
  walk = withChoice(walk, { t: 101 + 2 * EXERCISE.walkMs, node: 'nocoal', walk: true });
  ok(`arrow-key choices within ${EXERCISE.walkMs} ms are one walk, logged as where it ended; one just past that is a new choice`,
    walk.log.map((e) => e.node).join() === 'lignin,farmed,nocoal' && walk.chosen === 'nocoal', walk.log.map((e) => e.node).join());
  ok('a press is never merged into a walk', withChoice(withChoice(fresh(), { t: 0, node: 'fungi', walk: true }), { t: 10, node: 'lamp' }).log.length === 2);
  ok('a reload keeps every kind of entry the log may hold', restore({ ...s, log: [...s.log, ...o.log, ...walk.log] }, ids, drawOf).log.length === s.log.length + o.log.length + walk.log.length && Object.keys(KINDS).join() === 'practice,explore');
  let big = s;
  for (let i = 0; i < EXERCISE.logCap + 50; i++) big = withChoice(big, { t: 4000 + i, node: 'lamp' });
  ok(`the log keeps its last ${EXERCISE.logCap} entries and the counts are never trimmed`, big.log.length === EXERCISE.logCap && big.answered === 2 && big.right === 1);

  // a reload mid-item: the order in progress, its seed and its presses, through Progress over a memory store
  const store = memoryStore({ persistent: true, note: '' });
  const k1 = new Keeper(lab(store), { persistent: true });
  const loaded1 = await k1.load(ids, drawOf);
  ok('a fresh store reads as a fresh record, with a salt', JSON.stringify(unsalted(loaded1)) === JSON.stringify(unsalted(fresh())) && isSalt(loaded1.salt));
  ok('a fresh store reads the same record until it is first written: its salt is made once', JSON.stringify(await k1.read()) === JSON.stringify(loaded1));
  await k1.apply((r) => withChoice(r, { t: 9, node: 'nocoal' }));
  ok('and the first write keeps that salt', (await new Progress(store).get('alt-reality')).data.salt === loaded1.salt);
  {
    // a record erased from the privacy page (os/privacy.js deleteAll) while the tab is open: the next change starts a
    // new record, with a new salt, not the erased one's
    const { deleteAll } = await import('../os/privacy.js');
    const st = memoryStore({ persistent: true, note: '' });
    const k = new Keeper(lab(st), { persistent: true });
    const born = await k.load(ids, drawOf);
    await k.apply((r) => withStart(r, { t: 1, item: 0 }));
    await deleteAll(st);
    const after = (await k.apply((r) => withStart(r, { t: 2, item: 0 }))).state;
    ok('a record erased while the page is open starts again with a new salt and nothing counted', isSalt(after.salt) && after.salt !== born.salt && after.attempts === 1 && after.open.seed === 0, JSON.stringify({ was: born.salt, now: after.salt }));
  }
  await k1.apply((r) => withStart(r, { t: 10, item: 3 }));
  await k1.apply((r) => withLeave(r, { t: 11 }));
  const started = (await k1.apply((r) => withStart(r, { t: 12, item: 3 }))).state;
  const steps3 = drawOf(started.open, started.salt);
  await k1.apply((r) => press(r, 13, steps3[0]));
  const two = await k1.apply((r) => press(r, 14, steps3[1]));
  ok('each change comes back as the record the store now holds', two.changed && two.state.open.picks.join() === steps3.slice(0, 2).join() && k1.kept);
  ok('a change that changes nothing is said to, and writes nothing', !(await k1.apply((r) => press(r, 15, steps3[0]))).changed);
  const k2 = new Keeper(lab(store), { persistent: true });
  const back = await k2.load(ids, drawOf);
  ok('after a reload the order in progress comes back: its item, its seed and the two presses', back.open && back.open.item === 3 && back.open.seed === 1 && back.open.picks.join() === steps3.slice(0, 2).join(), JSON.stringify(back.open));
  ok('and its draw is the one shown before the reload, step for step and place for place', drawOf(back.open, back.salt).join() === steps3.join());
  ok('a returning record keeps the salt it was created with', back.salt === started.salt && isSalt(back.salt));
  ok('and the attempts, the chosen step and the next item with it', back.attempts === 2 && back.chosen === 'nocoal' && back.next === 0);
  const rest = rightOf(steps3).filter((id) => !back.open.picks.includes(id));
  let after = null;
  for (const id of rest) after = (await k2.apply((r) => press(r, 20, id))).state;
  ok('the order goes on after the reload and is checked as one answer of the four presses', after.answered === 1 && after.open === null && after.log.filter((e) => e.kind === 'answer')[0].order.slice(0, 2).join() === steps3.slice(0, 2).join());
  ok('the record is the plate\'s, at its version, in the lab\'s progress record', (await new Progress(store).get('alt-reality')).v === RECORD_V && (await new Progress(store).get('alt-reality')).data.page === 'orthogonal');

  // every press is applied to what the store holds: two tabs on one store each press, and both presses are kept
  const shared = memoryStore({ persistent: true, note: '' });
  const tabA = new Keeper(lab(shared), { persistent: true }), tabB = new Keeper(lab(shared), { persistent: true });
  await tabA.load(ids, drawOf);
  await tabB.load(ids, drawOf);
  const opened = (await tabA.apply((r) => withStart(r, { t: 1, item: 0 }))).state;
  const sd = drawOf(opened.open, opened.salt);
  await tabB.apply((r) => press(r, 2, sd[0]));
  const both = (await tabA.apply((r) => press(r, 3, sd[1]))).state;
  ok('a press in one tab is applied to the record the other tab wrote, so neither press is lost', both.open && both.open.picks.join() === sd.slice(0, 2).join(), JSON.stringify(both.open));

  // storage refused: no Labs OS, a store that keeps nothing after the tab, or a read or write that fails
  const none = new Keeper(null, { persistent: true });
  const nRec = await none.load(ids, drawOf);
  const nOpen = (await none.apply((r) => withStart(r, { t: 1, item: 0 }))).state;
  let nDone = nOpen;
  for (const id of rightOf(drawOf(nOpen.open, nOpen.salt))) nDone = (await none.apply((r) => press(r, 2, id))).state;
  ok('with no Labs OS the record is fresh and not kept, and the exercise still counts for the visit', JSON.stringify(unsalted(nRec)) === JSON.stringify(unsalted(fresh())) && isSalt(nRec.salt) && !none.kept && countLine(nDone) === '1 answered, 1 right');
  const mem = new Keeper(lab(memoryStore({ persistent: false, note: 'blocked' })), { persistent: false });
  await mem.load(ids, drawOf);
  await mem.apply((r) => withStart(r, { t: 1, item: 2 }));
  ok('a store that keeps nothing after the tab is said to keep nothing, and holds the order for the visit', !mem.kept && (await mem.apply((r) => r)).state.open.item === 2);
  const failing = new Keeper({ get: async () => { throw new Error('refused'); }, set: async () => { throw new Error('refused'); } }, { persistent: true });
  ok('a store that refuses a read gives a fresh record, not kept', JSON.stringify(unsalted(await failing.load(ids, drawOf))) === JSON.stringify(unsalted(fresh())) && !failing.kept);
  const fOpen = (await failing.apply((r) => withStart(r, { t: 1, item: 4 }))).state;
  const fTwo = (await failing.apply((r) => press(r, 2, drawOf(fOpen.open, fOpen.salt)[0]))).state;
  ok('and the order in progress is held for the visit, press by press', !failing.kept && fTwo.open.item === 4 && fTwo.open.picks.length === 1);
  const writeFails = new Keeper({ get: async () => null, set: async () => { throw new Error('quota'); } }, { persistent: true });
  await writeFails.load(ids, drawOf);
  const wf = (await writeFails.apply((r) => withStart(r, { t: 1, item: 6 }))).state;
  ok('a store that refuses a write is said to keep nothing, and the change still holds for the visit', !writeFails.kept && wf.open.item === 6 && (await writeFails.apply((r) => r)).state.open.item === 6);
  ok('the words for that are the bindings\' storage-off diagnosis', STORAGE_OFF === 'Your browser is not letting this page keep anything, so your answers last until you close it. A link to a step still opens that step.');

  // a record that does not hold together is never trusted
  ok('a record of another page reads as fresh', restore({ page: 'loom', answered: 3, right: 1, next: 1 }, ids).answered === 0);
  ok('a record with more right than answered reads as fresh', restore({ page: 'orthogonal', answered: 1, right: 2, next: 0, log: [] }, ids).answered === 0);
  ok('a record with a negative or broken count reads as fresh', restore({ page: 'orthogonal', answered: -1, right: 0, next: 0 }, ids).answered === 0 && restore({ page: 'orthogonal', answered: 1.5, right: 0, next: 0 }, ids).answered === 0 && restore({ page: 'orthogonal', answered: 1, right: 0, next: 0, attempts: -2 }, ids).answered === 0);
  ok('a record of version 1, with no attempts and no order in progress, reads with both at their start', (() => { const r = restore({ page: 'orthogonal', answered: 3, right: 2, next: 3, chosen: 'lamp', log: [] }, ids, drawOf); return r.answered === 3 && r.attempts === 0 && r.open === null && r.chosen === 'lamp'; })());
  ok('a chosen step that is not in the world is dropped, the rest kept', (() => { const r = restore({ ...s, chosen: 'nowhere' }, ids, drawOf); return r.chosen === null && r.answered === 2; })());
  ok('a log entry with no time or no mode is dropped', restore({ ...s, log: [...s.log, { kind: 'answer' }, { t: 5, mode: 'dream', kind: 'answer' }] }, ids).log.length === s.log.length);
  const base = { ...fresh(), attempts: 3 };
  const good = { item: 2, seed: 1, picks: drawOf({ item: 2, seed: 1 }, base.salt).slice(0, 2) };
  const notIn = ids.find((id) => !drawOf({ item: 2, seed: 1 }, base.salt).includes(id));
  ok('an order in progress that holds together is read back', JSON.stringify(restore({ ...base, open: good }, ids, drawOf).open) === JSON.stringify(good));
  for (const [what, open] of [
    ['a seed not yet counted', { ...good, seed: 3 }],
    ['a seed that is not a whole number', { ...good, seed: 0.5 }],
    ['a press on a step not in its draw', { ...good, picks: [good.picks[0], notIn] }],
    ['a step pressed twice', { ...good, picks: [good.picks[0], good.picks[0]] }],
    ['a step that is not in the world', { ...good, picks: ['nowhere'] }],
    ['every step pressed, and no answer', { ...good, picks: drawOf({ item: 2, seed: 1 }, base.salt) }],
    ['no list of presses', { item: 2, seed: 1 }],
  ]) ok(`an order in progress with ${what} is dropped, the rest kept`, (() => { const r = restore({ ...base, answered: 1, right: 1, open }, ids, drawOf); return r.open === null && r.answered === 1 && r.attempts === 3; })());
  // a record with no salt, or one that is not 32 bits, is given a new salt, and its order in progress, drawn without
  // that salt, cannot be drawn again as it was: it is dropped, the rest kept
  for (const [what, salt] of [['no salt', undefined], ['a salt of 33 bits', 2 ** 32], ['a salt below 0', -1], ['a salt that is not whole', 0.5]]) {
    ok(`a record with ${what} is given a new salt and keeps no order in progress, the rest kept`, (() => { const r = restore({ ...base, salt, answered: 1, right: 1, open: good }, ids, drawOf); return isSalt(r.salt) && r.salt !== salt && r.open === null && r.answered === 1 && r.attempts === 3; })());
  }
  ok('a record whose salt is at its bounds keeps it and its order in progress', [0, 2 ** 32 - 1].every((salt) => { const g = { ...good, picks: drawOf({ item: 2, seed: 1 }, salt).slice(0, 2) }; const r = restore({ ...base, salt, open: g }, ids, drawOf); return r.salt === salt && JSON.stringify(r.open) === JSON.stringify(g); }));
}

// ---------------------------------------------------------------- 15. L17: no non-answer clears the exercise
{
  const { memoryStore } = await import('../os/store.js');
  const { Progress } = await import('../os/progress.js');
  const { deleteAll } = await import('../os/privacy.js');
  const ids = WORLD.nodes.map((n) => n.id);
  // the links' closure, written apart from the engine: a step needs every step its parents need, and its parents
  const parents = new Map(WORLD.nodes.map((n) => [n.id, n.after]));
  const closure = new Map();
  const up = (id) => { if (!closure.has(id)) { const out = new Set(); for (const p of parents.get(id)) { out.add(p); for (const q of up(p)) out.add(q); } closure.set(id, out); } return closure.get(id); };
  ids.forEach(up);
  const linksAllow = (order) => order.every((a, i) => order.slice(i + 1).every((b) => !closure.get(a).has(b)));
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const KEYS = perms([0, 1, 2, 3]);
  const validOf = new Map();
  const valid = (steps) => { const k = steps.slice().sort().join(); if (!validOf.has(k)) validOf.set(k, perms(steps).filter(linksAllow).length); return validOf.get(k); };
  // for the four steps as shown, which of the 24 ways of pressing their places is right, by the engine's check; kept
  // per draw shown, so a path of 24,000 draws asks the check once for each order it has not met
  const rightsMemo = new Map();
  const rightsOf = (steps) => { const k = steps.join(); let r = rightsMemo.get(k); if (!r) { r = KEYS.map((p) => checkOrder(WORLD, p.map((j) => steps[j])).right); rightsMemo.set(k, r); } return r; };
  const keyIndex = new Map(KEYS.map((p, i) => [p.join(), i]));
  const right = (order) => rightsOf(order)[0];   // KEYS[0] is 1234, the order as given
  const pressRight = (steps, places) => rightsOf(steps)[keyIndex.get(places.join())];
  const placesOf = (steps) => KEYS[rightsOf(steps).indexOf(true)];   // the first right order, as places
  const N = 24000, MARGIN = 0.01, ITEMS = 40, VISITORS = N / ITEMS;
  const draw = (o, salt) => stepsOf(WORLD, o, salt);
  const judgeOf = (order) => judge(WORLD, order);
  const lab = (store) => { const p = new Progress(store); return { get: (o) => p.get('alt-reality', o), set: (d, o) => p.set('alt-reality', d, o) }; };
  /* Score every non-answer over a list of draws, each { steps, key, first }: the steps in the places shown; on a path
     that starts a record again, the places that were right for the same item before (the blind key); first marks a
     visitor's first draw, where there is no last draw. The last draw's key is the places of the previous draw's right
     order, pressed again on this draw. */
  const score = (draws) => {
    let random = 0, display = 0, prev = 0, prevN = 0, prevKey = null, blind = 0, keyed = 0;
    const keys = KEYS.map(() => 0);
    for (const { steps, key, first } of draws) {
      if (first) prevKey = null;
      random += valid(steps) / 24;
      const rs = rightsOf(steps);
      if (right(steps)) display++;
      rs.forEach((r, i) => { if (r) keys[i]++; });
      if (prevKey) { prevN++; if (pressRight(steps, prevKey)) prev++; }
      prevKey = placesOf(steps);
      if (key) { keyed++; if (pressRight(steps, key)) blind++; }
    }
    const n = draws.length;
    return { n, random: random / n, display: display / n, prev: prev / prevN, keys: keys.map((h) => h / n), blind: keyed ? blind / keyed : null };
  };

  // two paths inside one record, its salt made as the page makes it: a visitor who answers each item in turn (attempt a
  // on item a), and one who leaves and restarts each item 600 times (attempts a on item floor(a / 600))
  const one = fresh();
  const inTurn = Array.from({ length: N }, (_, a) => ({ steps: item(WORLD, a, a, one.salt).steps, first: a === 0 }));
  const again = Array.from({ length: N }, (_, a) => ({ steps: item(WORLD, Math.floor(a / 600), a, one.salt).steps, first: a === 0 }));

  /* The visitor's starting states (review C2): a first visit answers items 0 to 39 right in turn, through the record's
     own changes, and the places that were right for each are the blind key a visitor could write down. Then the record
     starts again by one of four paths, and items 0 to 39 are started again on it (a link to each, ?order=i) and
     pressed at the key's places, blind. 600 visitors a path. */
  const firstVisit = (rec, d) => {
    const key = [];
    for (let i = 0; i < ITEMS; i++) {
      rec = withStart(rec, { t: i, item: i });
      const steps = d(rec.open, rec.salt), places = placesOf(steps);
      key.push(places);
      for (const j of places) rec = withPress(rec, { t: i, node: steps[j], stepsOf: d, judge: judgeOf });
    }
    return { rec, key };
  };
  const secondStart = (rec, key, d) => {
    const out = [];
    for (let i = 0; i < ITEMS; i++) {
      rec = withStart(rec, { t: 1000 + i, item: i });
      out.push({ steps: d(rec.open, rec.salt), key: key[i], first: i === 0 });
      rec = withLeave(rec, { t: 1000 + i });
    }
    return out;
  };
  const STARTS = [
    // a new record: another visitor, another browser, or the same visitor on a new device
    ['a fresh record', async (d) => { const f = firstVisit(fresh(), d); return { rec: fresh(), key: f.key, first: f.rec }; }],
    // the record kept in Labs OS, erased by the privacy page's delete (os/privacy.js deleteAll), read again
    ['an erased record', async (d) => {
      const store = memoryStore({ persistent: true, note: '' });
      const k = new Keeper(lab(store), { persistent: true });
      const f = firstVisit(await k.load(ids, d), d);
      await k.apply(() => f.rec);
      await deleteAll(store);
      return { rec: await new Keeper(lab(store), { persistent: true }).load(ids, d), key: f.key, first: f.rec };
    }],
    // storage refused: the record lives in the Keeper for the visit, and a reload is a new Keeper
    ['storage off and a reload', async (d) => {
      const k = new Keeper(null, { persistent: true });
      const f = firstVisit(await k.load(ids, d), d);
      await k.apply(() => f.rec);
      return { rec: await new Keeper(null, { persistent: true }).load(ids, d), key: f.key, first: f.rec };
    }],
    // the record kept in Labs OS and read again on a later visit: its salt and its attempts go on
    ['a returning record', async (d) => {
      const store = memoryStore({ persistent: true, note: '' });
      const k = new Keeper(lab(store), { persistent: true });
      const f = firstVisit(await k.load(ids, d), d);
      await k.apply(() => f.rec);
      return { rec: await new Keeper(lab(store), { persistent: true }).load(ids, d), key: f.key, first: f.rec };
    }],
  ];
  const runStart = async (start, d) => {
    const draws = [], starts = [];
    for (let v = 0; v < VISITORS; v++) {
      const s = await start(d);
      starts.push(s);
      draws.push(...secondStart(s.rec, s.key, d));
    }
    return { draws, starts };
  };
  const startRuns = [];
  for (const [, start] of STARTS) startRuns.push(await runStart(start, draw));
  const paths = [['each item in turn', inTurn], ['one item again and again', again], ...STARTS.map(([name], i) => [name, startRuns[i].draws])];
  const res = paths.map(([, draws]) => score(draws));
  const f = (v) => (v === null ? '-' : v.toFixed(4));
  const rows = [['random pressing, exact from the links', (r) => r.random], ['the order shown, given back', (r) => r.display],
    ...KEYS.map((k, i) => [`always the places ${k.map((j) => j + 1).join('')}`, (r) => r.keys[i]]), ["the last draw's right places", (r) => r.prev],
    ['the blind key: the first visit\'s places', (r) => r.blind]];
  console.log(`L17: how often each non-answer is right, over ${N} draws a path; random pressing is valid orders over 24, from the links; margin ${MARGIN}`);
  console.log(`  ${'non-answer'.padEnd(42)} ${paths.map(([n]) => n.padStart(25)).join('')}`);
  for (const [name, get] of rows) console.log(`  ${name.padEnd(42)} ${res.map((r) => f(get(r)).padStart(25)).join('')}`);
  for (const [k, [name]] of paths.entries()) {
    const r = res[k], bar = r.random + MARGIN;
    ok(`L17, ${name}: ${r.n} draws, and random pressing's rate is between 1 and 2 in 24, as the sets allow`, r.n === N && r.random >= 1 / 24 && r.random <= 2 / 24, `${r.n} draws, ${f(r.random)}`);
    ok(`L17, ${name}: the order shown, given back, is right no more often than random pressing plus ${MARGIN}`, r.display <= bar, `${f(r.display)} against ${f(bar)}`);
    KEYS.forEach((key, i) => ok(`L17, ${name}: always pressing the places ${key.map((j) => j + 1).join('')} is right no more often than random plus ${MARGIN}`, r.keys[i] <= bar, `${f(r.keys[i])} against ${f(bar)}`));
    ok(`L17, ${name}: pressing the last draw's right places is right no more often than random plus ${MARGIN}`, r.prev <= bar, `${f(r.prev)} against ${f(bar)}`);
    if (k >= 2) ok(`L17, ${name}: the first visit's places, pressed blind on a new start, are right no more often than random plus ${MARGIN}`, r.blind !== null && r.blind <= bar, `${f(r.blind)} against ${f(bar)}`);
  }
  // each start is the state it names: a fresh, erased or storage-off record starts with a new salt and nothing counted;
  // a returning one with its own salt and its count
  const startsHold = STARTS.map(([name], i) => {
    const ss = startRuns[i].starts;
    const salts = new Set(ss.map((s) => s.rec.salt));
    if (name === 'a returning record') return ss.every((s) => s.rec.salt === s.first.salt && s.rec.attempts === ITEMS && s.rec.answered === ITEMS && s.rec.right === ITEMS);
    return ss.every((s) => isSalt(s.rec.salt) && s.rec.salt !== s.first.salt && s.rec.attempts === 0 && s.rec.answered === 0) && salts.size >= VISITORS - 1;
  });
  STARTS.forEach(([name], i) => ok(`L17, ${name}: each of the ${VISITORS} starts is that state (a new salt and nothing counted, or for a returning record its own salt and its 40 answers)`, startsHold[i]));

  // the table bites. The old rule (a draw seeded by its item alone) is caught by the last draw's places on one item
  // again and again; the rule before this pass (the attempt counter alone, no salt) is caught by the blind key on every
  // path that starts a record again
  const old = score(Array.from({ length: N }, (_, a) => ({ steps: item(WORLD, Math.floor(a / 600), 0, one.salt).steps, first: a === 0 })));
  ok('the table catches the old rule: with a draw seeded by its item alone, the last draw\'s places are right far above random', old.prev > old.random + MARGIN && old.prev > 0.9, `${f(old.prev)} against ${f(old.random)}`);
  const counterOnly = (o) => stepsOf(WORLD, o, 0);   // the salt ignored: every record draws as if its salt were 0
  const caught = [];
  for (const [name, start] of STARTS.slice(0, 3)) {
    const r = score((await runStart(start, counterOnly)).draws);
    caught.push(`${name} ${f(r.blind)}`);
    ok(`the table catches counter-only seeding on ${name}: the first visit's places, pressed blind, are right far above random`, r.blind > r.random + MARGIN && r.blind > 0.9, `${f(r.blind)} against ${f(r.random)}`);
  }
  console.log(`  counter-only seeding (the rule before review C2), the blind key: ${caught.join('; ')}`);
}

// ---------------------------------------------------------------- 16. the needs lines: the order can be reasoned out
{
  const ids = WORLD.nodes.map((n) => n.id);
  const root = WORLD.nodes.find((n) => n.role === 'root').id;
  const STOP = new Set(['that', 'this', 'with', 'from', 'into', 'than', 'then', 'they', 'them', 'their', 'there', 'where', 'when', 'what', 'have', 'make', 'made', 'both', 'each', 'only', 'also', 'before', 'after', 'without', 'every']);
  const words = (text) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  // a line names a step when one of its words begins with the first five letters of a word of the step's label
  const names = (a, b) => { const line = words(node(WORLD, a).needs); return words(node(WORLD, b).label).some((w) => line.some((x) => x.startsWith(w.slice(0, 5)))); };
  for (const n of WORLD.nodes) {
    ok(`${n.id} says what it needs, with no digit`, typeof n.needs === 'string' && n.needs.trim().length > 0 && !/\d/.test(n.needs));
    for (const b of needsOf(WORLD, n.id)) if (b !== root) ok(`${n.id}'s needs line names ${b}, which it needs`, names(n.id, b), n.needs);
    for (const b of ids) if (needsOf(WORLD, b).has(n.id)) ok(`${n.id}'s needs line never names ${b}, which needs it`, !names(n.id, b), n.needs);
  }
  ok('the root says it needs nothing', /^nothing\b/.test(node(WORLD, root).needs));
  ok('the needs lines are said with the one verb of every needs sentence', layout(WORLD, { width: 640 }).nodes.every((n) => n.label.needs.join(' ').startsWith(`${needVerb(node(WORLD, n.id))} `)));
  // a reader given only the four steps' words: a step that needs nothing first, then each step once every step its line
  // names among the four is placed, ties in the order shown
  const reader = (shown) => {
    const out = [];
    const nothing = shown.filter((a) => /^nothing\b/.test(node(WORLD, a).needs));
    out.push(...nothing);
    while (out.length < shown.length) {
      const next = shown.find((a) => !out.includes(a) && shown.every((b) => b === a || out.includes(b) || !names(a, b)));
      if (!next) return null;   // the words go round in a circle
      out.push(next);
    }
    return out;
  };
  let solved = 0, tried = 0;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  for (const set of itemSets(WORLD)) for (const shown of perms(set)) {
    tried++;
    const o = reader(shown);
    if (o && checkOrder(WORLD, o).right) solved++;
    else if (tried - solved <= 3) ok(`the reader orders ${shown.join(' ')}`, false, o ? o.join(' ') : 'a circle');
  }
  ok(`a reader given only the four steps' words orders every item right: ${solved} of ${tried} draws (40 sets, 24 orders shown)`, solved === tried && tried === 960, `${solved} of ${tried}`);
}

// ---------------------------------------------------------------- 17. one rule decides gold
{
  ok('the strand is gold in the reading', strandGold({ mode: 'read' }) === true);
  ok('and ink while an order is given, and once it is checked', strandGold({ mode: 'order' }) === false && strandGold({ mode: 'checked' }) === false && strandGold(null) === false);
  // the page paints the drawing and the legend's sample from one call of it
  const main = fs.readFileSync(path.join(HERE, 'main.js'), 'utf8');
  const body = (main.match(/function paintGold\(\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  ok('main.js paints the drawing and the legend from one call of strandGold, and nowhere else decides gold',
    (main.match(/strandGold\(/g) || []).length === 2 && /const gold = strandGold\(\{ mode \}\)/.test(body) && /svg\.classList\.toggle\('gold', gold\)/.test(body) && /\$\('lg-branch'\)\.classList\.toggle\('gold', gold\)/.test(body));
  const css = fs.readFileSync(path.join(LABS, 'assets', 'css', 'orthogonal.css'), 'utf8');
  const goldRules = css.split('}').filter((r) => /--accretion/.test(r)).map((r) => r.split('{')[0].trim());
  ok('every rule that paints the strand gold asks for the drawing\'s class gold, and the legend\'s sample for its own',
    goldRules.filter((sel) => /\.edge\.(fired|thread)|\.leader|\.node\.fired/.test(sel)).every((sel) => sel.split(',').every((x) => /svg\.gold/.test(x)))
    && goldRules.filter((sel) => /lg-branch/.test(sel)).every((sel) => /\.lg-branch\.gold/.test(sel)), goldRules.join(' | '));
}

// ---------------------------------------------------------------- 18. the words about the render, held to the pipeline
{
  const S = fs.readFileSync(path.join(DATA, 'render_artifact.py'), 'utf8');
  const facts = { P: params, R: record, S, world: WORLD };
  // the sentences the markup adds: Earth's tag beside the render, and the page's description
  const raw = fs.readFileSync(path.join(LABS, 'orthogonal.html'), 'utf8');
  const textOf = (re) => { const m = raw.match(re); return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null; };
  const markup = [
    { where: "Earth's tag", text: textOf(/<span class="earth-tag"[^>]*>([\s\S]*?)<\/span>/) },
    { where: "the page's description", text: textOf(/<meta name="description" content="([^"]*)"/) },
  ];
  ok("the markup's sentences about the render are found", markup.every((m) => m.text && m.text.length > 20), JSON.stringify(markup));
  const sentences = [...renderSentences(WORLD, record), ...markup];
  ok(`every sentence on the page about the render or its making is read: ${sentences.length}, the alt text held to its closed vocabulary`, sentences.length >= 10 && sentences.filter((s) => s.closed).length === 1);
  const faults = renderWordFaults(sentences, facts);
  ok('every word about the render stands on the parameter file, the record or the pipeline', faults.length === 0, faults.join(' | '));

  // the review's alt text (C1) fails on its ink, and its ink would stand just inside, where the parameter file draws ink
  const oldAlt = 'At night in fog, a glass column on a ceramic plinth under a louvered hood, drawn in fine ink lines: shelves of gilled bracket fungus on a wooden spindle inside glow blue-white at their gill edges, and light only a small pool of the wet cobbled street around the plinth.';
  const altOf = (text) => [{ where: 'the alt text', text, closed: true }];
  ok('the alt text the review found (C1) fails: "ink" while ink.thickness_px is 0', renderWordFaults(altOf(oldAlt), facts).some((x) => x.includes('"ink"')));
  ok('and "ink" stands just inside, once ink.thickness_px is above 0', !renderWordFaults(altOf(oldAlt), { ...facts, P: { ...params, ink: { ...params.ink, thickness_px: 0.01 } } }).some((x) => x.includes('"ink"')));
  // the method sentence the review found (H5): the pipeline sweeps a profile and holds no grammar
  const grammar = 'The lamp, its brightness and its world are invented. Its form is drawn by a seeded procedural grammar after published mushroom-modelling methods.';
  ok('the method sentence the review found (H5) fails: "grammar", and the pipeline defines no rewriting rules', renderWordFaults([{ where: "the artifact's evidence", text: grammar }], facts).some((x) => x.includes('"grammar"')));
  ok("and the sentence that replaced it says what the pipeline does, with the two sources its header gives", (() => {
    const e = WORLD.nodes.find((n) => n.id === WORLD.artifact.node).evidence.find((x) => /swept round an axis/.test(x.text));
    return !!e && srcsOf(e).join() === 'desbenoit2004,raistrick2023' && /Desbenoit, Vanderhaghe, Galin and Grosjean/.test(S) && /Raistrick et al\., CVPR 2023/.test(S);
  })());
  const moon = renderWordFaults(altOf(`${WORLD.artifact.alt} A green moon.`), facts);
  ok('a word in the alt text that no fact stands for fails its closed vocabulary', moon.some((x) => x.includes('"green"')) && moon.some((x) => x.includes('"moon"')), moon.join(' | '));
  ok('a word of the render outside the alt text still has to hold', renderWordFaults([{ where: 'a probe', text: 'drawn in ink' }], facts).length === 1);
  ok('every word of the alt text that is not plain is one of the render words', wordsOf(WORLD.artifact.alt).every((t) => ALT_PLAIN.has(t) || RENDER_WORDS.some((w) => w.re.test(t))));

  // each fact bites, on the page's own sentences, from just outside; and just inside it holds
  const L = record.measure.light, G = record.measure.frame.ground;
  const bites = [
    ['pool', 'a studio light on', { P: { ...params, air: { ...params.air, rim_energy_w: 1 } } }],
    ['night', "a sky brighter than the culture's dimmest glow", { P: { ...params, air: { ...params.air, sky_ambient: params.glow.flesh * 1.01 } } }, { P: { ...params, air: { ...params.air, sky_ambient: params.glow.flesh } } }],
    ['flask', 'no flask', { P: { ...params, instrument: { ...params.instrument, flask_radius_m: 0 } } }],
    ['blue-white', 'a glow greener than it is blue', { P: { ...params, glow: { ...params.glow, rgb: [0.7, 0.84, 0.8399] } } }, { P: { ...params, glow: { ...params.glow, rgb: [0.7, 0.84, 0.84] } } }],
    ['dark', 'a hood the record measures brighter than the sky', { R: { ...record, measure: { ...record.measure, light: { ...L, hood_p10: L.sky_p50 } } } }, { R: { ...record, measure: { ...record.measure, light: { ...L, hood_p10: L.sky_p50 - 0.0001 } } } }],
    ['faint', 'a sky the record measures at 0.1', { R: { ...record, measure: { ...record.measure, light: { ...L, sky_p50: 0.1 } } } }, { R: { ...record, measure: { ...record.measure, light: { ...L, sky_p50: 0.0999 } } } }],
    ['ceramic', 'a plinth the pipeline builds of wood', { S: S.replace('plinth_h / 2, ceramic', 'plinth_h / 2, wood') }],
    ['glow', 'a culture no brighter than three times the brightest light outside the column', { R: { ...record, measure: { ...record.measure, light: { ...L, culture_p99: 3 * L.beyond_column_p995 } } } }, { R: { ...record, measure: { ...record.measure, light: { ...L, culture_p99: 3 * L.beyond_column_p995 + 0.0001 } } } }],
    ['ground line', "the world's ground line 0.0021 off the record's", { world: { ...WORLD, artifact: { ...WORLD.artifact, frame: { ...WORLD.artifact.frame, ground: G + 0.0021 } } } },
      { world: { ...WORLD, artifact: { ...WORLD.artifact, frame: { ...WORLD.artifact.frame, ground: G + 0.0019 } } } }],
    ['seed', "a record whose seed is not the file's", { R: { ...record, seed: record.seed + 1 } }],
    ['samples', "a record whose samples are not the file's", { R: { ...record, samples: record.samples + 1 } }],
    ['sweep', 'a pipeline whose cap is not swept', { S: S.replace('close both ends of the sweep', 'close both ends') }],
  ];
  for (const [id, what, out, inside] of bites) {
    const used = sentences.some((s) => RENDER_WORDS.find((w) => w.id === id).re.test(s.text));
    ok(`"${id}" is a word the page uses about the render`, used);
    ok(`the words bite: "${id}" fails with ${what}`, renderWordFaults(sentences, { ...facts, ...out }).some((x) => x.includes(`"${id}"`)));
    if (inside) ok(`and "${id}" holds just inside that bound`, !renderWordFaults(sentences, { ...facts, ...inside }).some((x) => x.includes(`"${id}"`)));
  }

  // the provenance line is the record's: its seed, Blender's version, its samples and its time, to the second
  const pv = provenance(record);
  const nums = (s) => s.match(/\d+(\.\d+)*/g) || [];
  ok("the provenance line prints the record's seed, Blender's version and its samples, and no other number", JSON.stringify(nums(pv.head)) === JSON.stringify([String(record.seed), record.blender, String(record.samples)]), pv.head);
  const minSec = (p) => { const m = p.from.match(/(\d+)\s*min\s*(\d+)\s*s\b/); return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN]; };
  {
    const [m, s] = minSec(pv);
    ok("and the time the record took, to the second", m * 60 + s === Math.round(record.render_s) && s < 60 && nums(pv.from).length === 2, pv.from);
  }
  // at the carries, just inside and just outside: 59.4 s and 59.5 s, 119.5 s, 179.6 s (L1: never "2 min 60 s")
  for (const t of [0.2, 59.4, 59.5, 119.5, 179.6, 3599.5]) {
    const [m, s] = minSec(provenance({ ...record, render_s: t }));
    ok(`a render of ${t} s prints ${m} min ${s} s: its time to the second, the seconds under 60`, m * 60 + s === Math.round(t) && s >= 0 && s < 60);
  }
  // the caption's note names every way the render departs from the culture, as the pipeline declares them (review H4)
  const noteFaults = departureFaults(WORLD.artifact.exposure, facts);
  ok("the caption's note names every departure: the long exposure, the sky, the blue-white glow where fungal light is green", noteFaults.length === 0 && DEPARTURES.length === 3 && DEPARTURES.every((d) => d.when(facts)), noteFaults.join(' | '));
  const oldNote = 'Drawn as a long exposure records it, sky included; to the eye it is dimmer.';
  ok('the note the review found (H4) fails: it leaves out the colour', departureFaults(oldNote, facts).length === 1 && /green/.test(departureFaults(oldNote, facts)[0]));
  const colour = DEPARTURES.find((d) => d.id === 'colour');
  ok('the colour is a departure while the glow is drawn no greener than blue, and not once it is greener (a hair either side)',
    colour.when({ ...facts, P: { ...params, glow: { ...params.glow, rgb: [0.7, 0.84, 0.84] } } }) && !colour.when({ ...facts, P: { ...params, glow: { ...params.glow, rgb: [0.7, 0.84, 0.8399] } } }));
  for (const k of WORLD.artifact.exposureCites) {
    const s = SOURCES[k] || '';
    const author = s.split(',')[0], year = (s.match(/\((\d{4})\)/) || [])[1], venue = (s.split(',')[1] || '').trim().split(' ')[0];
    ok(`the caption cites ${k} by its first author, year and venue`, !!SOURCES[k] && WORLD.artifact.exposure.includes(`(${author} ${year}, ${venue})`), `${author} ${year}, ${venue}`);
  }
  ok('the fallback names the parameter file it draws from, tagged, or says it did not load', fallbackLine('a.json', true).includes('a.json') && /\[ILLUSTRATIVE\]/.test(fallbackLine('a.json', true)) && /nor its parameters \(a\.json\)/.test(fallbackLine('a.json', false)));
}

console.log(`orthogonal: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
