/* ============================================================
   orthogonal/main.js: boot the Orthogonal plate.

   ?node=<id>  opens the plate with that node chosen (an unknown id
               opens the artifact)
   ?still      the finished frame, no ignition and no drift (as
               under prefers-reduced-motion)

   One clock runs the ignition (engine.js strandAt): the strokes,
   the steps and the fog behind them are read from it each frame.
   It is a Labs OS scene, so it advances only while the drawing is
   on screen in a visible tab: on a phone, where the lineage is
   below the render, the strand draws when the visitor reaches it.
   ============================================================ */
import { mountScene } from '../os/scene.js';
import { EVENTS, TIMING } from './config.js';
import { arrival, check, fogField, ignitionEnd, step, strandAt } from './engine.js';
import { FogPainter } from './fogview.js';
import { applyStrand, drawArtifactInk, drawEarthLamp, drawLineage, markChosen, writeReading } from './view.js';
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
}

/* Draw the strand, the steps and the fog at the clock's moment; at rest, only move the fog. */
function frame() {
  if (!drawn) return null;
  const f = strandAt(WORLD, drawn.lay, Math.min(clock, ignitionEnd(WORLD, drawn.lay)));
  if (!reached && clock >= arrival(WORLD, drawn.lay)) { reached = true; if (onReach) onReach(); }
  if (!f.done || !fogSettled) {
    applyStrand(svg, f, drawn.groups);
    fog.setProgress(f.edges);
    fogSettled = f.done;
  }
  fog.paint(TIMING.drift[0] * driftS, TIMING.drift[1] * driftS);
  return f;
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
  chosen = id;
  markChosen(svg, WORLD, drawn.groups, id);
  writeReading($('reading'), WORLD, id);
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
  if (track && os) { try { os.track(EVENTS.node, { node: id }); } catch { /* usage is never in the way */ } }
}

/* The footer keeps one height whatever node is read, the tallest reading's, so nothing below it jumps. */
function fixReadingHeight() {
  const box = $('reading');
  box.style.minHeight = '';
  let max = 0;
  for (const n of WORLD.nodes) { writeReading(box, WORLD, n.id); max = Math.max(max, box.offsetHeight); }
  box.style.minHeight = `${max}px`;
  writeReading(box, WORLD, chosen);
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

async function labsOS() {
  try {
    const { LabsOS } = await import('../os/index.js');
    os = await LabsOS.init({ lab: 'alt-reality' });
    try { os.register(EVENTS.node, { cls: 'action' }); } catch { /* registered by an earlier init on this page */ }
  } catch { os = null; }
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
    if (g) choose(g.getAttribute('data-id'), { reveal: true });
  });
  svg.addEventListener('keydown', (ev) => {
    const g = ev.target.closest('.node');
    if (!g) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(g.getAttribute('data-id'), { reveal: true }); return; }
    const next = step(WORLD, g.getAttribute('data-id'), ev.key);
    if (next) { ev.preventDefault(); choose(next, { focus: true }); }
  });

  const ro = new ResizeObserver(() => {
    const now = `${Math.floor(holder.clientWidth)}x${wide.matches ? Math.floor(holder.clientHeight) : 0}`;
    if (now === size) return;   // the observer's first call, and the height a narrow plate sets itself
    draw();   // the clock carries on: a resize mid-ignition (a web font arriving) redraws the same moment
    fixReadingHeight();
  });
  ro.observe(holder);
  wide.addEventListener('change', () => { draw(); fixReadingHeight(); });
  window.__orthogonal = { world: WORLD, chosen: () => chosen, layout: () => drawn && drawn.lay, timing: TIMING, startedAt, revealAt };
}

boot();
