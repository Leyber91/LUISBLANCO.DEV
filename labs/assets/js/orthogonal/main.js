/* ============================================================
   orthogonal/main.js: boot the Orthogonal plate.

   ?node=<id>  opens the plate with that node chosen (an unknown id
               opens the artifact)
   ?order=<n>  opens item n of the exercise (a whole number from 0):
               the order in progress when it is that item, else a
               new draw of it
   ?still      the finished frame, no ignition and no drift (as
               under prefers-reduced-motion)

   The world is grown when the page loads: main.js reads the
   technology table and the engine (grow.js) grows the lineage from
   it, as the tests do.

   One clock runs the ignition (engine.js strandAt): the strokes,
   the steps and the fog behind them are read from it each frame.
   It is a Labs OS scene, so it advances only while the drawing is
   on screen in a visible tab: on a phone, where the lineage is
   below the render, the strand draws when the visitor reaches it.

   The plate has three modes: the reading (a step chosen, its
   evidence in the footer), an order being given (the exercise, on
   the drawing), and an order checked (the verdict on the drawing).
   The visitor's record is read from Labs OS once it starts
   (record.js). The store is the truth: every start, press, undo,
   leave and choice is one change the Keeper applies to what the
   store holds, and the page shows the record that came back. An
   order in progress is in the record, so a reload opens it again
   with its presses.
   ============================================================ */
import { mountScene } from '../os/scene.js';
import { EVENTS, EXERCISE, FOG, STORAGE_OFF, STORAGE_ON, TIMING } from './config.js';
import {
  arrival, check, checkOrder, drillFog, drillPlaces, fogField, ignitionEnd, item, judge, needLine, reasons, step, stepsOf,
  strandAt, strandGold,
} from './engine.js';
import { FogPainter } from './fogview.js';
import { countLine, fresh, Keeper, withChoice, withLeave, withPress, withStart, withUndo } from './record.js';
import { fallbackLine, provenance as provenanceLine } from './render-words.js';
import { applyStrand, drawArtifactInk, drawEarthLamp, drawLineage, markChosen, markPicks, markWhy, placeDrill, writeDrill, writeReading } from './view.js';
import { buildWorld, TABLE_PATH } from './worlds/fungi-early.js';

const $ = (id) => document.getElementById(id);
/* The page marks each text block of its header, captions and legend as a claim (data-claim: it carries [REAL] or
   [ILLUSTRATIVE]) or a label (data-label: a name, a heading, a key or a status). A block whose words change says which
   it is now. tests.mjs section 19 and the drive hold every claim to its tag (review H1). */
const markClaim = (el, claim) => { el.toggleAttribute('data-claim', claim); el.toggleAttribute('data-label', !claim); };
const params = new URLSearchParams(location.search);
const still = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 1000px)');

/* The world is grown on load: the page reads the technology table and runs the engine on it (worlds/fungi-early.js
   buildWorld, grow.js), so the lineage drawn is the one the rules grow, never a typed one. A table that does not load,
   or a world the engine cannot grow, is said in the footer instead of a plate drawn from nothing. */
let WORLD;
try {
  const r = await fetch(TABLE_PATH);
  if (!r.ok) throw new Error(`the technology table answered ${r.status}`);
  WORLD = buildWorld(await r.json());
} catch (e) {
  $('reading').textContent = `This world could not be grown: ${e.message}.`;
  throw e;
}

const problems = check(WORLD);
if (problems.length) {
  // a world that breaks its own rules is not drawn: the plate says so instead of drawing something untrue
  $('reading').textContent = `This world's data breaks the lineage's rules: ${problems[0]}`;
  throw new Error(problems.join('; '));
}

let chosen = WORLD.nodes.some((n) => n.id === params.get('node')) ? params.get('node') : WORLD.artifact.node;
let drawn = null;
let os = null;
let artParams = null;   // the artifact's parameter file, once read: the ink drawing is computed from it

const holder = $('lineage');
const svg = $('lineage-svg');
const fog = new FogPainter($('lineage-fog'));

let size = '';   // the box the lineage was last drawn for: a resize that keeps it redraws nothing
let clock = still ? Infinity : 0;   // ms of the ignition, advanced only while the scene runs
let driftS = 0;                     // seconds the fog has drifted at rest
let fogSettled = false;             // the density at rest is computed once and kept
let reached = still;                // the strand has reached the artifact (on the clock below)
let onReach = null;                 // what the render does then (art)

let mode = 'read';                  // 'read', 'order' (an order being given) or 'checked'
let drill = null;                   // { item: { index, seed, steps }, picks, result: null | { right, pair, line } }
let rec = fresh();                  // the record as the store last gave it back (record.js)
let keeper = null;                  // record.js Keeper, once Labs OS has answered; null before
let recordRead = false;             // the stored record has been read (or found missing)
const early = [];                   // choices made before the record was read, applied to it once it is

const drawOf = (o, salt) => stepsOf(WORLD, o, salt);
const judgeOf = (order) => judge(WORLD, order);

function draw() {
  const isWide = wide.matches;
  if (isWide) holder.style.height = '';   // the box's own height on a wide plate, not the one a narrow plate set
  const width = Math.floor(holder.clientWidth);
  if (width < 200) return;
  const height = isWide ? Math.floor(holder.clientHeight) : 0;
  size = `${width}x${height}`;
  drawn = drawLineage(svg, WORLD, { width, height, leader: isWide });
  if (!isWide) holder.style.height = `${drawn.lay.height}px`;
  fog.setField(fogField(WORLD, drawn.lay), drawn.lay.width, drawn.lay.height);
  fogSettled = false;
  markChosen(svg, WORLD, drawn.groups, chosen);
  aimReveal();
  frame();
  if (mode !== 'read') showDrill({ instant: true });   // a redraw keeps the exercise where it was
  else paintGold();
}

/* Draw the strand, the steps and the fog at the clock's moment; at rest, only move the fog. While an order is given
   or checked the fog is the exercise's (showDrill), and the strand is finished. */
function frame() {
  if (!drawn) return null;
  const f = strandAt(WORLD, drawn.lay, Math.min(clock, ignitionEnd(WORLD, drawn.lay)));
  if (!reached && clock >= arrival(WORLD, drawn.lay)) { reached = true; if (onReach) onReach(); }
  if (!f.done || !fogSettled) {
    applyStrand(svg, f, drawn.groups);
    if (mode === 'read' && !fog.blending) fog.setProgress(f.edges);
    fogSettled = f.done;
  }
  fog.paint(TIMING.drift[0] * driftS, TIMING.drift[1] * driftS);
  return f;
}

/* The strand's gold, from the one rule (engine.js strandGold), on the drawing and on the legend's sample alike. */
function paintGold() {
  const gold = strandGold({ mode });
  svg.classList.toggle('gold', gold);
  $('lg-branch').classList.toggle('gold', gold);
}

/* ---------------------------------------------------------------- the exercise

   Order these steps by what each needs (engine.js item, checkOrder). The steps leave their rows into the fog with what
   each needs under it, the visitor presses them in order, the engine checks the fourth press against the links, and
   the steps settle back with the verdict on them. Each start, press, undo and leave is one change to the record
   (record.js), applied by the Keeper to what the store holds; the drawing shows the record that came back. */

/* The fog for the mode: the exercise's while an order is given, the reading's otherwise; blended unless still. */
function fogFor(instant) {
  if (!drawn) return;
  const target = mode === 'order'
    ? drillFog(WORLD, drawn.lay, drillPlaces(drawn.lay, drill.item.steps), fog.field)
    : fog.densityFor(strandAt(WORLD, drawn.lay, ignitionEnd(WORLD, drawn.lay)).edges);
  fog.blendTo(target, instant || still ? 0 : FOG.fadeMs, performance.now());
  if (instant || still) fog.paint(TIMING.drift[0] * driftS, TIMING.drift[1] * driftS);
}

/* The drawing, the footer and the controls for the mode. */
function showDrill({ instant = false } = {}) {
  if (!drawn) return;
  const g = drawn.groups;
  if (mode === 'order') {
    placeDrill(svg, g, drillPlaces(drawn.lay, drill.item.steps));
    markPicks(svg, g, drill.picks);
    markWhy(svg, g, null);
    svg.setAttribute('aria-label', `Order these ${EXERCISE.size} steps by what each needs: press first the one that needs none of the others`);
  } else {
    placeDrill(svg, g, null);
    markPicks(svg, g, drill ? drill.picks : [], drill && drill.result ? (drill.result.right ? 'right' : 'wrong') : null);
    markWhy(svg, g, drill && drill.result && drill.result.pair ? drill.result.pair.path : null);
    // checked, the drawing shows the verdict and no reading: no step is chosen, and the tab stop is the first pressed
    markChosen(svg, WORLD, g, mode === 'checked' ? null : chosen);
    if (mode === 'checked') g.get(drill.picks[0]).setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', "Choose a step to read it; the arrow keys move along the rows and across to Earth's step");
  }
  if (mode === 'order') {
    // the roving tab stop sits on the step in the first slot, or on the one that had it
    const has = drill.item.steps.find((id) => g.get(id).getAttribute('data-roving') === '1') || drill.item.steps[0];
    for (const id of drill.item.steps) { g.get(id).setAttribute('tabindex', id === has ? '0' : '-1'); g.get(id).setAttribute('data-roving', id === has ? '1' : '0'); }
  }
  paintGold();
  fogFor(instant);
  applyReadingHeight();
  writeFooter();
  controls();
}

function writeFooter() {
  if (mode === 'read') writeReading($('reading'), WORLD, chosen);
  else writeDrill($('reading'), WORLD, { steps: drill.item.steps, picks: drill.picks, result: drill.result, size: EXERCISE.size });
}

/* The bar under the drawing: its buttons for the mode, the count, and beside the count what is kept: the storage-off
   diagnosis when nothing is, else where the answers are (on a wide plate the bar runs the sheet's width, so either
   takes the count's one line; on a narrow one fixKeptHeight holds its height). */
function controls() {
  const show = (id, on) => { $(id).hidden = !on; };
  show('drill-start', mode === 'read');
  show('drill-undo', mode === 'order');
  show('drill-leave', mode === 'order');
  show('drill-next', mode === 'checked');
  show('drill-back', mode === 'checked');
  $('drill-start').disabled = !recordRead;
  $('drill-start').textContent = rec.open ? 'Go on with the four steps' : 'Order four steps by what each needs';
  $('drill-undo').disabled = !(drill && drill.picks.length);
  $('drill-count').textContent = recordRead ? countLine(rec) : '';
  const off = recordRead && !(keeper && keeper.kept);
  $('drill-kept').hidden = false;
  $('drill-kept').textContent = !recordRead ? '' : off ? STORAGE_OFF : STORAGE_ON;
  $('drill-kept').toggleAttribute('data-off', off);
  $('drill-bar').dataset.mode = mode;
}

function setOrderParam(index) {
  const url = new URL(location.href);
  if (index === null) url.searchParams.delete('order'); else url.searchParams.set('order', String(index));
  history.replaceState(null, '', url);
}

/* One change to the record, through the Keeper; the record that comes back is the page's. */
async function change(fn) {
  const out = await keeper.apply(fn);
  rec = out.state;
  return out;
}

/* Start item `index` (null: the order in progress, else the next item). An order in progress on that item goes on as
   it was; any other start is a new draw, seeded by the record's attempt counter and its salt. */
async function startOrder(index = null, { focus = true } = {}) {
  if (!drawn || !keeper) return;
  clock = Infinity;   // an order asked during the ignition finishes it first
  frame();
  const t = Date.now();
  const { state } = await change((r) => {
    const want = index === null ? (r.open ? r.open.item : r.next) : index;
    return r.open && r.open.item === want ? r : withStart(r, { t, item: want });
  });
  if (state.open) openOrder(state.open, state.salt, { focus });
  else controls();
}

/* Show the order in progress as the record holds it: its draw (from its item, its seed and the record's salt), and the
   steps pressed so far. */
function openOrder(o, salt, { focus = false } = {}) {
  drill = { item: item(WORLD, o.item, o.seed, salt), picks: o.picks.slice(), result: null };
  mode = 'order';
  setOrderParam(o.item);
  showDrill();
  if (!focus) return;
  const next = drill.item.steps.find((id) => !drill.picks.includes(id)) || drill.item.steps[0];
  drawn.groups.get(next).focus({ preventScroll: true });
  if (!wide.matches) {
    const r = holder.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.4) scrollBy({ top: r.top - 12, behavior: still ? 'auto' : 'smooth' });
  }
}

async function pickStep(id) {
  if (mode !== 'order' || !drill.item.steps.includes(id)) return;
  const t = Date.now();
  const { state, changed } = await change((r) => withPress(r, { t, node: id, stepsOf: drawOf, judge: judgeOf }));
  if (!changed) return;
  if (state.open) { showPresses(state.open, state.salt); return; }
  showChecked(state.log[state.log.length - 1]);
}

async function undoPick() {
  if (mode !== 'order') return;
  const { state, changed } = await change((r) => withUndo(r, { t: Date.now() }));
  if (changed && state.open) showPresses(state.open, state.salt);
}

/* The presses of the order in progress, as the record gave them back. */
function showPresses(o, salt) {
  if (mode !== 'order' || !drill || drill.item.index !== o.item || drill.item.seed !== o.seed || drill.item.salt !== salt) { openOrder(o, salt); return; }
  drill.picks = o.picks.slice();
  markPicks(svg, drawn.groups, drill.picks);
  writeFooter();
  controls();
}

/* The fourth press came back as an answer: the steps settle back with the verdict on them. The verdict is the record's;
   the pair and the links that decide a wrong one are the engine's, from the same order. */
function showChecked(answer) {
  const res = checkOrder(WORLD, answer.order);
  drill = { item: drill.item, picks: answer.order.slice(), result: { right: answer.right, pair: res.pair, line: res.pair ? needLine(WORLD, res.pair.path) : '' } };
  mode = 'checked';
  setOrderParam(null);
  if (os) { try { os.track(EVENTS.order, { item: answer.item, right: answer.right }); } catch { /* usage is never in the way */ } }
  showDrill();
  $('drill-next').focus({ preventScroll: true });
  if (!wide.matches) {
    const r = $('reading').getBoundingClientRect();
    const short = r.top + 160 - innerHeight;
    if (short > 0) scrollBy({ top: short, behavior: still ? 'auto' : 'smooth' });
  }
}

async function leaveOrder() {
  if (mode === 'read') return;
  const was = mode;
  mode = 'read';
  drill = null;
  setOrderParam(null);
  showDrill();
  if (was === 'order') { await change((r) => withLeave(r, { t: Date.now() })); controls(); }
}

function focusSlot(k) {
  const steps = drill.item.steps;
  const i = Math.max(0, Math.min(steps.length - 1, k));
  steps.forEach((id, j) => { const g = drawn.groups.get(id); g.setAttribute('tabindex', j === i ? '0' : '-1'); g.setAttribute('data-roving', j === i ? '1' : '0'); });
  drawn.groups.get(steps[i]).focus({ preventScroll: false });
}

/* The ignition, then the fog's drift, as one Labs OS scene on the fog's canvas. Under reduced motion or ?still the
   clock starts at its end and nothing loops. */
function inkScene() {
  mountScene($('lineage-fog'), ({ reducedMotion }) => {
    let raf = 0, prev = null, lastDrift = 0;
    if (reducedMotion) clock = Infinity;
    const canvas = $('lineage-fog');
    // the scene's observer reports a drawing off screen a frame or two late, and counts a sliver at the window's edge as
    // seen; the clock runs only while at least 60 px of the drawing is in the window
    const seen = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 60 && r.top < innerHeight - 60 && r.right > 0 && r.left < innerWidth; };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // the page's own clock, not the frame's timestamp, which can begin before the plate booted: the ignition never
      // runs ahead of the time since it started
      const now = performance.now();
      const dt = prev === null || !seen() ? 0 : Math.min(100, now - prev);
      prev = now;
      // a change of fog between the reading and an order runs every frame, ahead of the drift's slower clock
      if (fog.blending) { fog.advance(now); fog.paint(TIMING.drift[0] * driftS, TIMING.drift[1] * driftS); return; }
      if (!dt && drawn && clock < ignitionEnd(WORLD, drawn.lay)) return;
      if (drawn && clock < ignitionEnd(WORLD, drawn.lay)) { clock += dt; frame(); return; }
      if (reducedMotion) { cancelAnimationFrame(raf); raf = 0; frame(); return; }
      if (now - lastDrift < 1000 / TIMING.driftFps) return;
      driftS += (lastDrift ? Math.min(200, now - lastDrift) : 0) / 1000;
      lastDrift = now;
      frame();
    };
    const start = () => { if (!raf) { prev = null; lastDrift = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    if (reducedMotion) frame(); else start();
    return { destroy: stop, pause: stop, resume: () => { if (!reducedMotion) start(); } };
  }, { reducedMotion: still });
}

/* The fog clears outward from where the gold strand meets the render: the leader's row on a wide plate, the render's
   foot on a narrow one, where the lineage below it grows up into it. */
function aimReveal() {
  const fig = $('art');
  const view = fig.querySelector('.art-view').getBoundingClientRect();
  const lead = svg.querySelector('.leader');
  if (wide.matches && lead) {
    const y = lead.getBoundingClientRect().top - view.top;
    fig.style.setProperty('--rx', '0px');
    fig.style.setProperty('--ry', `${Math.round(Math.max(0, Math.min(view.height, y)))}px`);
  } else {
    fig.style.setProperty('--rx', '50%');
    fig.style.setProperty('--ry', '100%');
  }
}

function choose(id, { focus = false, track = true, reveal = false } = {}) {
  if (!id || !drawn || !drawn.groups.has(id)) return;
  if (mode !== 'read') { mode = 'read'; drill = null; setOrderParam(null); chosen = id; showDrill(); }
  chosen = id;
  markChosen(svg, WORLD, drawn.groups, id);
  writeReading($('reading'), WORLD, id);
  // a choice made by an arrow key (focus) is part of a walk down the drawing: logged as the step it ends on
  if (track) {
    const t = Date.now();
    const fn = (r) => withChoice(r, { t, node: id, walk: focus });
    if (recordRead) change(fn).then(controls, controls); else early.push(fn);
  }
  if (focus) drawn.groups.get(id).focus({ preventScroll: false });
  // on a narrow plate the reading is below the drawing: a press brings its head and first claims into view
  if (reveal && !wide.matches) {
    const r = $('reading').getBoundingClientRect();
    const short = r.top + 200 - innerHeight;
    if (short > 0) scrollBy({ top: short, behavior: still ? 'auto' : 'smooth' });
  }
  const url = new URL(location.href);
  url.searchParams.set('node', id);
  history.replaceState(null, '', url);
  if (track && !focus && os) { try { os.track(EVENTS.node, { node: id }); } catch { /* usage is never in the way */ } }
}

/* The footer's reserved height. On a wide plate, where the plate fits one frame, the tallest of everything it can hold,
   so nothing jumps. On a narrow one the reading is the last block (orthogonal.css), so nothing the visitor looks at
   sits below it: a reading takes the height of what it says, with no empty band (the road's call, item 8), and an
   order being given or checked takes the tallest of the exercise, so the fourth press does not shorten the page under
   the visitor's finger. Every state of the exercise is one height on its own: its pressed list always has its four
   places (view.js writeDrill), so a state with fewer presses has no empty band. */
let heights = { read: 0, drill: 0 };
function applyReadingHeight() {
  const h = wide.matches ? Math.max(heights.read, heights.drill) : mode === 'read' ? 0 : heights.drill;
  $('reading').style.minHeight = h ? `${h}px` : '';
}

/* On a narrow plate the bar's line about what is kept wraps to its own lines: it is held at the height of the longer of
   its two states (STORAGE_ON, STORAGE_OFF) from the start, so the answer Labs OS gives after load moves nothing below
   it, in either state (item 9). On a wide plate it shares the count's one line and needs no height. */
function fixKeptHeight() {
  const k = $('drill-kept');
  k.style.minHeight = '';
  if (wide.matches) return;
  const was = k.textContent;
  let h = 0;
  for (const text of [STORAGE_ON, STORAGE_OFF]) { k.textContent = text; h = Math.max(h, k.offsetHeight); }
  k.textContent = was;
  k.style.minHeight = `${h}px`;
}

/* Measure the tallest reading and the exercise at its fullest, for applyReadingHeight. */
function fixReadingHeight() {
  const box = $('reading');
  box.style.minHeight = '';
  let max = 0;
  for (const n of WORLD.nodes) { writeReading(box, WORLD, n.id); max = Math.max(max, box.offsetHeight); }
  // the exercise at its fullest: every step pressed, and the tallest reason a wrong order of an item can be given (any
  // draw of any record serves: only its height is read)
  const it = item(WORLD, 0, 0, 0);
  let drillH = 0;
  for (const line of reasons(WORLD)) {
    writeDrill(box, WORLD, { steps: it.steps, picks: it.steps, size: EXERCISE.size, result: { right: false, line } });
    drillH = Math.max(drillH, box.offsetHeight);
  }
  heights = { read: max, drill: drillH };
  applyReadingHeight();
  writeFooter();
  fixKeptHeight();
}

async function readParams() {
  if (!artParams) artParams = fetch(WORLD.artifact.params).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
  return artParams;
}

/* The render: on a wide plate it surfaces from the fog once it has loaded and the gold strand has reached it, read on
   the strand's own clock (frame above), so a paused or hidden drawing holds the render back too. On a narrow plate the
   render comes first and its lineage below it, so it shows at once and the strand draws when the visitor reaches it.
   When it does not load, the lamp is drawn in ink from its parameter file in the same box, and the strand that pointed
   at it goes to ink. */
function art() {
  const fig = $('art');
  const img = $('art-img');
  const ink = $('art-ink');
  const status = $('art-status');
  let loaded = false, timeUp = still;
  const show = () => {
    if (!loaded || !timeUp || !fig.classList.contains('fog')) return;
    fig.classList.remove('fog');
    fig.dataset.liftedAt = String(Math.round(performance.now()));   // read by the drive: never before the strand arrives
  };
  if (!still && wide.matches) {
    fig.classList.add('fog');
    onReach = () => { timeUp = true; show(); };
    if (reached) onReach();
  } else timeUp = true;
  const ok = () => {
    loaded = true;
    fig.classList.remove('failed');
    $('lineage').classList.remove('no-art');
    ink.hidden = true;
    status.textContent = '';
    markClaim(status, false);
    show();
  };
  const fail = async () => {
    fig.classList.remove('fog');
    fig.classList.add('failed');
    $('lineage').classList.add('no-art');
    const file = WORLD.artifact.params.split('/').pop();
    try {
      drawArtifactInk(ink, JSON.parse(await readParams()), WORLD.artifact.frame);
      ink.hidden = false;
      status.textContent = fallbackLine(file, true);
      markClaim(status, true);   // the outline is drawn from the parameter file: a claim, tagged in its words
    } catch {
      status.textContent = fallbackLine(file, false);
      markClaim(status, false);
    }
  };
  img.addEventListener('load', ok);
  img.addEventListener('error', fail);
  if (img.complete) { if (img.naturalWidth) ok(); else if (img.getAttribute('src')) fail(); }
}

/* The render's record in one line, and a warning only when the parameters on the site are not the ones it was drawn
   from (their SHA-256 against the record's). */
async function provenance() {
  const strip = $('provenance');
  const sha = async (text) => {
    const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  try {
    const [record, ptext] = await Promise.all([
      fetch(WORLD.artifact.record).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
      readParams(),
    ]);
    const same = crypto.subtle ? (await sha(ptext)) === record.params_sha256 : null;
    // the line is written from the record by one function (render-words.js provenance), which tests.mjs reads
    const words = provenanceLine(record);
    const a = document.createElement('a');
    a.href = WORLD.artifact.params;
    a.textContent = 'its parameters';
    const line = (...parts) => { const s = document.createElement('span'); s.className = 'pl'; s.append(...parts); return s; };
    const from = line(words.from, a);
    if (same === false) {
      const s = document.createElement('span');
      s.className = 'stale';
      s.textContent = ', changed since this render';
      from.append(s);
    }
    // read from the render's record, so a claim tagged [REAL] (the rules; review L6, closed by H1's test of every claim)
    const tag = document.createElement('b');
    tag.className = 't real';
    tag.textContent = '[REAL]';
    strip.replaceChildren(line(tag, ' ', words.head), from);
    markClaim(strip, true);
    strip.dataset.state = same === false ? 'stale' : same === null ? 'unchecked' : 'ok';
  } catch {
    strip.textContent = `The render's record did not load; its parameters are in ${WORLD.artifact.params.split('/').pop()}.`;
    strip.dataset.state = 'error';
  }
}

/* Labs OS, then the visitor's record from its progress store: the count, the step last chosen (unless the link names
   one), the next item, and an order in progress with its presses. When Labs OS does not start, or its store keeps
   nothing, the record lives for the visit and the bar says so. A link that names an item opens it once the record is
   read; without one, an order in progress opens again, unless the link names a step to read. */
async function labsOS() {
  try {
    const { LabsOS } = await import('../os/index.js');
    os = await LabsOS.init({ lab: 'alt-reality' });
    for (const [type, cls] of [[EVENTS.node, 'action'], [EVENTS.order, 'outcome']]) {
      try { os.register(type, { cls }); } catch { /* registered by an earlier init on this page */ }
    }
  } catch { os = null; }
  keeper = new Keeper(os ? os.progress : null, { persistent: !!(os && os.storage.persistent) });
  rec = await keeper.load(WORLD.nodes.map((n) => n.id), drawOf);
  // what the visitor chose before the record was read goes on top of it, one change each
  const before = early.splice(0);
  for (const fn of before) await change(fn);
  recordRead = true;
  if (!params.has('node') && !before.length && rec.chosen && mode === 'read') choose(rec.chosen, { track: false });
  const want = Number(params.get('order'));
  if (params.has('order') && Number.isInteger(want) && want >= 0 && mode === 'read') await startOrder(want, { focus: false });
  else if (rec.open && !params.has('node') && mode === 'read') openOrder(rec.open, rec.salt);
  controls();
  window.__orthogonal.record = () => ({ ...rec, kept: keeper.kept, store: os ? os.storage.kind : 'none' });
}

/* The plate's words come from the world's data; the page's markup holds the same words for a browser without scripts,
   and tests.mjs holds the two to each other. */
function words() {
  const q = (sel) => document.querySelector(sel);
  q('.title').textContent = WORLD.title;
  const b = document.createElement('b');
  b.textContent = WORLD.driver;
  q('.driver-line').replaceChildren('Changed driver: ', b, '.');
  q('.favours-text').textContent = WORLD.favours.line;   // its [REAL] tag stays in the markup beside it
  q('.art-name').textContent = WORLD.artifact.title;
  q('.art-line').textContent = WORLD.artifact.line;
  q('.art-exposure-text').textContent = WORLD.artifact.exposure;
  $('art-img').alt = WORLD.artifact.alt;
  q('.earth-name').textContent = WORLD.earthArtifact.title;
  q('.dim-line').textContent = WORLD.earthArtifact.line;
}

function boot() {
  words();
  drawEarthLamp($('earth-svg'), WORLD.earthArtifact, WORLD.artifact.frame);
  draw();
  fixReadingHeight();
  // the plate's mono face arrives after the first layout: the reserved heights are measured again in it
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fixReadingHeight(), () => {});
  writeReading($('reading'), WORLD, chosen);
  const startedAt = performance.now();
  const revealAt = still || !drawn ? 0 : arrival(WORLD, drawn.lay);
  inkScene();
  art();
  provenance();
  labsOS();
  document.body.classList.add('ready');

  svg.addEventListener('click', (ev) => {
    const g = ev.target.closest('.node');
    if (!g) return;
    if (mode === 'order') pickStep(g.getAttribute('data-id'));
    else choose(g.getAttribute('data-id'), { reveal: true });
  });
  svg.addEventListener('keydown', (ev) => {
    const g = ev.target.closest('.node');
    if (!g) return;
    const id = g.getAttribute('data-id');
    if (mode === 'order') {
      // arrows move between the steps being ordered, in the order they stand; Enter picks; Backspace and Escape are the
      // document's, below
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pickStep(id); return; }
      const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
      if (k) { ev.preventDefault(); focusSlot(drill.item.steps.indexOf(id) + k); }
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(id, { reveal: true }); return; }
    const next = step(WORLD, id, ev.key);
    if (next) { ev.preventDefault(); choose(next, { focus: true }); }
  });
  document.addEventListener('keydown', (ev) => {
    if (mode === 'read' || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.target && ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (ev.key === 'Backspace' && mode === 'order') { ev.preventDefault(); undoPick(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); leaveOrder(); }
  });
  $('drill-start').addEventListener('click', () => startOrder(null));
  $('drill-next').addEventListener('click', () => startOrder(null));
  $('drill-undo').addEventListener('click', () => undoPick());
  $('drill-leave').addEventListener('click', () => leaveOrder());
  $('drill-back').addEventListener('click', () => { leaveOrder(); drawn.groups.get(chosen).focus({ preventScroll: true }); });
  controls();

  const ro = new ResizeObserver(() => {
    const now = `${Math.floor(holder.clientWidth)}x${wide.matches ? Math.floor(holder.clientHeight) : 0}`;
    if (now === size) return;   // the observer's first call, and the height a narrow plate sets itself
    draw();   // the clock carries on: a resize mid-ignition (a web font arriving) redraws the same moment
    fixReadingHeight();
  });
  ro.observe(holder);
  wide.addEventListener('change', () => { draw(); fixReadingHeight(); });
  window.__orthogonal = {
    world: WORLD, chosen: () => chosen, layout: () => drawn && drawn.lay, timing: TIMING, startedAt, revealAt,
    // the exercise as the page holds it, for the drive: the mode, the draw, the presses and the verdict
    drill: () => ({ mode, item: drill && drill.item, picks: drill ? drill.picks.slice() : [], result: drill && drill.result }),
    gold: () => strandGold({ mode }),
    record: () => null,
  };
  if (still) document.body.classList.add('still');
}

boot();
