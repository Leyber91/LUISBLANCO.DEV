/* ============================================================
   orthogonal/main.js: boot the Orthogonal plate.

   ?node=<id>  opens the plate with that node chosen (an unknown id
               opens the artifact)
   ?order=<n>  opens item n of the exercise (a whole number from 0)
   ?still      the finished frame, no ignition and no drift (as
               under prefers-reduced-motion)

   One clock runs the ignition (engine.js strandAt): the strokes,
   the steps and the fog behind them are read from it each frame.
   It is a Labs OS scene, so it advances only while the drawing is
   on screen in a visible tab: on a phone, where the lineage is
   below the render, the strand draws when the visitor reaches it.

   The plate has three modes: the reading (a step chosen, its
   evidence in the footer), an order being given (the exercise, on
   the drawing), and an order checked (the verdict on the drawing).
   The visitor's record is read from Labs OS once it starts
   (record.js); the exercise works before that and without it.
   ============================================================ */
import { mountScene } from '../os/scene.js';
import { EVENTS, EXERCISE, FOG, STORAGE_OFF, TIMING } from './config.js';
import { arrival, check, checkOrder, drillFog, drillPlaces, fogField, ignitionEnd, item, needLine, needPath, step, strandAt } from './engine.js';
import { FogPainter } from './fogview.js';
import { countLine, fresh, Keeper, withAction, withAnswer, withChoice } from './record.js';
import { applyStrand, drawArtifactInk, drawEarthLamp, drawLineage, markChosen, markPicks, markWhy, placeDrill, writeDrill, writeReading } from './view.js';
import { WORLD } from './worlds/fungi-early.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const still = params.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 1000px)');

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
let drill = null;                   // { item: { index, steps }, picks, result: null | { right, pair, line } }
let rec = fresh();                  // the visitor's record (record.js), kept in Labs OS once it has started
let keeper = null;                  // record.js Keeper, once Labs OS has answered; null before
let recordRead = false;             // the stored record has been read (or found missing)

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

/* ---------------------------------------------------------------- the exercise

   Order these steps by what each needs (engine.js item, checkOrder). The steps leave their rows into the fog, the
   visitor presses them in order, the engine checks the fourth press against the links, and the steps settle back with
   the verdict on them. Each answer and each step chosen in the reading goes into the record (record.js), with its time
   and its mode. */

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
  fogFor(instant);
  applyReadingHeight();
  if (mode === 'read') writeReading($('reading'), WORLD, chosen);
  else writeDrill($('reading'), WORLD, { steps: drill.item.steps, picks: drill.picks, result: drill.result, size: EXERCISE.size });
  controls();
}

/* The bar under the drawing: its buttons for the mode, the count, and the storage-off diagnosis when nothing is kept. */
function controls() {
  const show = (id, on) => { $(id).hidden = !on; };
  show('drill-start', mode === 'read');
  show('drill-undo', mode === 'order');
  show('drill-leave', mode === 'order');
  show('drill-next', mode === 'checked');
  show('drill-back', mode === 'checked');
  $('drill-start').disabled = !recordRead;
  $('drill-undo').disabled = !(drill && drill.picks.length);
  $('drill-count').textContent = recordRead ? countLine(rec) : '';
  const off = recordRead && !(keeper && keeper.kept);
  $('drill-kept').hidden = !off;
  $('drill-kept').textContent = off ? STORAGE_OFF : '';
  $('drill-bar').dataset.mode = mode;
}

function setOrderParam(index) {
  const url = new URL(location.href);
  if (index === null) url.searchParams.delete('order'); else url.searchParams.set('order', String(index));
  history.replaceState(null, '', url);
}

function startOrder(index) {
  const it = item(WORLD, index);
  if (!it || !drawn) return;
  clock = Infinity;   // an order asked during the ignition finishes it first
  frame();
  drill = { item: it, picks: [], result: null };
  mode = 'order';
  rec = withAction(rec, { t: Date.now(), kind: 'start', item: index });
  persist();
  setOrderParam(index);
  showDrill();
  const first = drawn.groups.get(it.steps[0]);
  first.focus({ preventScroll: true });
  if (!wide.matches) {
    const r = holder.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.4) scrollBy({ top: r.top - 12, behavior: still ? 'auto' : 'smooth' });
  }
}

function pickStep(id) {
  if (mode !== 'order' || !drill.item.steps.includes(id) || drill.picks.includes(id)) return;
  drill.picks.push(id);
  rec = withAction(rec, { t: Date.now(), kind: 'press', item: drill.item.index, node: id });
  if (drill.picks.length === drill.item.steps.length) { finishOrder(); return; }
  persist();
  markPicks(svg, drawn.groups, drill.picks);
  writeDrill($('reading'), WORLD, { steps: drill.item.steps, picks: drill.picks, result: null, size: EXERCISE.size });
  controls();
}

function undoPick() {
  if (mode !== 'order' || !drill.picks.length) return;
  const undone = drill.picks.pop();
  rec = withAction(rec, { t: Date.now(), kind: 'undo', item: drill.item.index, node: undone });
  persist();
  markPicks(svg, drawn.groups, drill.picks);
  writeDrill($('reading'), WORLD, { steps: drill.item.steps, picks: drill.picks, result: null, size: EXERCISE.size });
  controls();
}

/* The fourth press: the engine checks the order, the steps settle back with the verdict, and the answer is kept with its
   time and its mode. */
function finishOrder() {
  const res = checkOrder(WORLD, drill.picks);
  drill.result = { right: res.right, pair: res.pair, line: res.pair ? needLine(WORLD, res.pair.path) : '' };
  mode = 'checked';
  setOrderParam(null);
  rec = withAnswer(rec, { t: Date.now(), item: drill.item.index, order: drill.picks, right: res.right, needs: res.pair ? [res.pair.step, res.pair.needs] : null });
  persist();
  if (os) { try { os.track(EVENTS.order, { item: drill.item.index, right: res.right }); } catch { /* usage is never in the way */ } }
  showDrill();
  $('drill-next').focus({ preventScroll: true });
  if (!wide.matches) {
    const r = $('reading').getBoundingClientRect();
    const short = r.top + 160 - innerHeight;
    if (short > 0) scrollBy({ top: short, behavior: still ? 'auto' : 'smooth' });
  }
}

function leaveOrder() {
  if (mode === 'read') return;
  if (mode === 'order') { rec = withAction(rec, { t: Date.now(), kind: 'leave', item: drill.item.index }); persist(); }
  mode = 'read';
  drill = null;
  setOrderParam(null);
  showDrill();
}

/* Write the record through Labs OS; when a write fails the bar says nothing is kept. */
function persist() {
  if (!keeper) return;
  keeper.save(rec).then(() => controls(), () => controls());
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
  if (track) { rec = withChoice(rec, { t: Date.now(), node: id, walk: focus }); persist(); }
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

/* The footer's reserved height: on a wide plate the tallest of everything it can hold, so nothing below it jumps; on a
   narrow one the tallest of the mode it is in, so a short exercise leaves no empty band (a change of mode is the
   visitor's own act, and the footer may change height with it). */
let heights = { read: 0, drill: 0 };
function applyReadingHeight() {
  const h = wide.matches ? Math.max(heights.read, heights.drill) : mode === 'read' ? heights.read : heights.drill;
  $('reading').style.minHeight = h ? `${h}px` : '';
}

/* Measure the tallest reading and the exercise at its fullest, for applyReadingHeight. */
function fixReadingHeight() {
  const box = $('reading');
  box.style.minHeight = '';
  let max = 0;
  for (const n of WORLD.nodes) { writeReading(box, WORLD, n.id); max = Math.max(max, box.offsetHeight); }
  // the exercise at its fullest: every step pressed, and the longest reason a wrong order can be given in this world
  const it = item(WORLD, 0);
  let line = '';
  for (const a of WORLD.nodes) for (const b of WORLD.nodes) {
    const p = needPath(WORLD, a.id, b.id);
    if (p) { const s = needLine(WORLD, p); if (s.length > line.length) line = s; }
  }
  writeDrill(box, WORLD, { steps: it.steps, picks: it.steps, size: EXERCISE.size, result: { right: false, line } });
  heights = { read: max, drill: box.offsetHeight };
  applyReadingHeight();
  if (mode === 'read') writeReading(box, WORLD, chosen);
  else writeDrill(box, WORLD, { steps: drill.item.steps, picks: drill.picks, result: drill.result, size: EXERCISE.size });
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
      status.textContent = `The render did not load; this outline is drawn from ${file} [ILLUSTRATIVE].`;
    } catch {
      status.textContent = `The render did not load, nor its parameters (${file}).`;
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
    const [rec, ptext] = await Promise.all([
      fetch(WORLD.artifact.record).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
      readParams(),
    ]);
    const same = crypto.subtle ? (await sha(ptext)) === rec.params_sha256 : null;
    const mins = Math.floor(rec.render_s / 60), secs = Math.round(rec.render_s % 60);
    const nb = ' ', dot = ' · ';
    const a = document.createElement('a');
    a.href = WORLD.artifact.params;
    a.textContent = 'its parameters';
    const line = (...parts) => { const s = document.createElement('span'); s.className = 'pl'; s.append(...parts); return s; };
    const from = line(`Rendered in ${mins}${nb}min${nb}${secs}${nb}s from `, a);
    if (same === false) {
      const s = document.createElement('span');
      s.className = 'stale';
      s.textContent = ', changed since this render';
      from.append(s);
    }
    strip.replaceChildren(line(`Seed${nb}${rec.seed}${dot}Blender${nb}${rec.blender}${dot}${rec.samples}${nb}samples`), from);
    strip.dataset.state = same === false ? 'stale' : same === null ? 'unchecked' : 'ok';
  } catch {
    strip.textContent = `The render's record did not load; its parameters are in ${WORLD.artifact.params.split('/').pop()}.`;
    strip.dataset.state = 'error';
  }
}

/* Labs OS, then the visitor's record from its progress store: the count, the step last chosen (unless the link names
   one) and the next item. When Labs OS does not start, or its store keeps nothing, the record lives for the visit and
   the bar says so. A link that names an item opens it once the record is read. */
async function labsOS() {
  try {
    const { LabsOS } = await import('../os/index.js');
    os = await LabsOS.init({ lab: 'alt-reality' });
    for (const [type, cls] of [[EVENTS.node, 'action'], [EVENTS.order, 'outcome']]) {
      try { os.register(type, { cls }); } catch { /* registered by an earlier init on this page */ }
    }
  } catch { os = null; }
  keeper = new Keeper(os ? os.progress : null, { persistent: !!(os && os.storage.persistent) });
  const stored = await keeper.load(WORLD.nodes.map((n) => n.id));
  // what the visitor did before the record was read (steps chosen; the exercise waits for the record) goes on top of it
  const before = rec;
  rec = { ...stored, answered: stored.answered + before.answered, right: stored.right + before.right,
    next: Math.max(stored.next, before.next), chosen: before.chosen || stored.chosen, log: [...stored.log, ...before.log].slice(-EXERCISE.logCap) };
  recordRead = true;
  if (before.log.length) persist();
  if (!params.has('node') && !before.chosen && stored.chosen && mode === 'read') choose(stored.chosen, { track: false });
  const want = Number(params.get('order'));
  if (params.has('order') && Number.isInteger(want) && want >= 0 && mode === 'read') startOrder(want);
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
  q('.thesis').replaceChildren('Changed driver: ', b, `. ${WORLD.favours.line}`);
  q('.art-name').textContent = WORLD.artifact.title;
  q('.art-line').textContent = WORLD.artifact.line;
  q('.art-exposure-text').textContent = WORLD.artifact.exposure;
  $('art-img').alt = WORLD.artifact.alt;
  q('.earth-name').textContent = WORLD.earthArtifact.title;
  q('.dim-line').textContent = WORLD.earthArtifact.line;
}

function boot() {
  words();
  drawEarthLamp($('earth-svg'), WORLD.earthArtifact.supply, WORLD.artifact.frame);
  draw();
  fixReadingHeight();
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
  $('drill-start').addEventListener('click', () => startOrder(rec.next));
  $('drill-next').addEventListener('click', () => startOrder(rec.next));
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
    // the exercise as the page holds it, for the drive: the mode, the item, the presses and the verdict
    drill: () => ({ mode, item: drill && drill.item, picks: drill ? drill.picks.slice() : [], result: drill && drill.result }),
    record: () => null,
  };
  if (still) document.body.classList.add('still');
}

boot();
