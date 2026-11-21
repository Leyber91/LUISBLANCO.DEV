/* ============================================================
   orthogonal/main.js: boot the Orthogonal plate.

   ?node=<id>  opens the plate with that node chosen (an unknown id
               opens the artifact)
   ?still      the finished frame, no ignition (as under
               prefers-reduced-motion)
   ============================================================ */
import { EVENTS, TIMING } from './config.js';
import { check, step } from './engine.js';
import { drawEarthLamp, drawLineage, ignite, markChosen, settle, writeReading } from './view.js';
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

const holder = $('lineage');
const svg = $('lineage-svg');

let size = '';   // the box the lineage was last drawn for: a resize that keeps it redraws nothing

function draw() {
  const width = Math.floor(holder.clientWidth);
  if (width < 200) return;
  const isWide = wide.matches;
  const height = isWide ? Math.floor(holder.clientHeight) : 0;
  size = `${width}x${height}`;
  drawn = drawLineage(svg, WORLD, { width, height, leader: isWide });
  if (!isWide) holder.style.height = `${drawn.lay.height}px`;
  else holder.style.height = '';
  markChosen(svg, WORLD, drawn.groups, chosen);
}

function choose(id, { focus = false, track = true } = {}) {
  if (!id || !drawn || !drawn.groups.has(id)) return;
  chosen = id;
  markChosen(svg, WORLD, drawn.groups, id);
  writeReading($('reading'), WORLD, id);
  if (focus) drawn.groups.get(id).focus({ preventScroll: false });
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

/* The render: it surfaces from the fog once it has loaded and the gold strand has reached it. */
function art(revealAt) {
  const fig = $('art');
  const img = $('art-img');
  const status = $('art-status');
  let loaded = false, timeUp = still;
  const show = () => {
    if (!loaded || !timeUp || !fig.classList.contains('fog')) return;
    fig.classList.remove('fog');
    fig.dataset.liftedAt = String(Math.round(performance.now()));   // read by the drive: never before the strand arrives
  };
  if (!still) { fig.classList.add('fog'); setTimeout(() => { timeUp = true; show(); }, revealAt); }
  const ok = () => { loaded = true; fig.classList.remove('failed'); status.textContent = ''; show(); };
  const fail = () => {
    fig.classList.remove('fog');
    fig.classList.add('failed');
    status.textContent = `The render did not load. It is drawn by render_artifact.py from ${WORLD.artifact.params.split('/').pop()}.`;
  };
  img.addEventListener('load', ok);
  img.addEventListener('error', fail);
  if (img.complete) { if (img.naturalWidth) ok(); else if (img.getAttribute('src')) fail(); }
}

/* The provenance strip: the render's record, and whether the parameters on the site are the ones it was drawn from. */
async function provenance() {
  const strip = $('provenance');
  const sha = async (text) => {
    const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n'));
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  try {
    const [rec, ptext] = await Promise.all([
      fetch(WORLD.artifact.record).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(WORLD.artifact.params).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }),
    ]);
    const same = crypto.subtle ? (await sha(ptext)) === rec.params_sha256 : null;
    const day = String(rec.rendered_utc).slice(0, 10);
    const mins = Math.floor(rec.render_s / 60), secs = Math.round(rec.render_s % 60);
    const line = (...parts) => { const s = document.createElement('span'); s.className = 'pl'; s.append(...parts); return s; };
    const a = document.createElement('a');
    a.href = WORLD.artifact.params;
    a.textContent = rec.params;
    const verdict = line(same === null ? 'The parameters were not checked against the render.'
      : same ? 'The parameters on this site match the render.' : 'The parameters changed after this render.');
    if (same === false) verdict.classList.add('stale');
    strip.replaceChildren(
      line(`Seed ${rec.seed} \u00b7 Blender ${rec.blender} \u00b7 ${rec.samples} samples \u00b7 ${mins} min ${secs} s`),
      line(`Rendered ${day} from `, a),
      verdict,
    );
    strip.dataset.state = same === false ? 'stale' : 'ok';
  } catch {
    strip.textContent = `The render's record did not load; the parameters are in ${WORLD.artifact.params.split('/').pop()}.`;
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
  $('art-img').alt = WORLD.artifact.alt;
  q('.dim-line').textContent = WORLD.earthArtifact.line;
  q('.earth-name').textContent = WORLD.earthArtifact.title;
  q('.earth-foot').textContent = WORLD.earthArtifact.supply;
}

function boot() {
  words();
  drawEarthLamp($('earth-svg'));
  draw();
  fixReadingHeight();
  writeReading($('reading'), WORLD, chosen);
  const startedAt = performance.now();
  const revealAt = still ? 0 : ignite(svg, WORLD);
  art(revealAt);
  provenance();
  labsOS();
  document.body.classList.add('ready');

  svg.addEventListener('click', (ev) => {
    const g = ev.target.closest('.node');
    if (g) choose(g.getAttribute('data-id'));
  });
  svg.addEventListener('keydown', (ev) => {
    const g = ev.target.closest('.node');
    if (!g) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(g.getAttribute('data-id')); return; }
    const next = step(WORLD, g.getAttribute('data-id'), ev.key);
    if (next) { ev.preventDefault(); choose(next, { focus: true }); }
  });

  const ro = new ResizeObserver(() => {
    const now = `${Math.floor(holder.clientWidth)}x${wide.matches ? Math.floor(holder.clientHeight) : 0}`;
    if (now === size) return;   // the observer's first call, and the height a narrow plate sets itself
    settle(svg);
    draw();
    fixReadingHeight();
  });
  ro.observe(holder);
  wide.addEventListener('change', () => { settle(svg); draw(); fixReadingHeight(); });
  window.__orthogonal = { world: WORLD, chosen: () => chosen, layout: () => drawn && drawn.lay, timing: TIMING, startedAt, revealAt };
}

boot();
