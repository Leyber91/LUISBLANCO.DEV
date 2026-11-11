/* ============================================================
   altverse/main.js — the page. Wires the compose form, the
   multipath trace, the world views and the tree; owns no
   computation. On load it weaves a running example (no model
   call); a model pass runs on visitor action, or by itself when a
   fast route (local Ollama, the visitor's key) is present.
   ?still renders the end state without motion (screenshots,
   reduced motion). ?mode=staged|batched forces a model mode.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import { STAGES, STAGE_BY_ID, TIMING, EARTH } from './config.js';
import { PRESETS, DEFAULT_PRESET, PRESETS_BY_ID, DEFAULT_SEED } from './divergence-presets.js';
import { classify, fmtYear } from './classify.js';
import { enginePass, weaveSync, modelPass, routeMode } from './pipeline.js';
import { validateStage } from './validate.js';
import { WorldTree, encodeHash, decodeHash, shareURL, exportTree, modelDelta, applyDelta, deltaFromLean } from './tree.js';
import { remember, recent, saveDelta, loadDelta } from './store.js';
import { MapView } from './render/map-view.js';
import { PipelineView } from './render/pipeline-view.js';
import { RiverView } from './render/river-view.js';
import { CausalView } from './render/causal-view.js';
import { CompareView } from './render/compare-view.js';
import { renderTree } from './render/tree-view.js';
import { renderDossier, renderLedger, renderFoot, fmtNum } from './render/dossier.js';
import { DIALS, dialFor, dialText } from './dials.js';
import { toMarkdown } from './markdown.js';
import { startTour } from './render/tour.js';
import { runSweep } from './render/sweep-view.js';
import { esc, el } from './render/svg.js';
import { ledger } from './validate.js';

const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const reduced = STILL || matchMedia('(prefers-reduced-motion: reduce)').matches;
const forcedMode = params.get('mode');
let lowTier = params.has('low') || (navigator.hardwareConcurrency || 8) <= 4;
if (STILL) document.documentElement.classList.add('still');

const $ = (id) => document.getElementById(id);
const tree = new WorldTree();
let seed = DEFAULT_SEED;
let oursWorld = null;
let busy = false;
let modelCtl = null;
let route = 'unknown';

/* ---------------- views ---------------- */
mountRoutePanel($('route'));
const map = new MapView($('map'), { tip: $('map-tip'), cap: $('map-desc'), reduced, lowTier });
const pipe = new PipelineView($('pipe-graph'), { reduced, onPick: (id) => { const c = document.querySelector(`[data-stage="${id}"]`); if (c) { c.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1200); } } });
const river = new RiverView($('river'), { reduced, onSelect: (e, quiet) => inspect(e, quiet), onOpen: (id) => openWorld(id) });
const causal = new CausalView($('causal'), $('causal-detail'));
const compare = new CompareView($('compare'), {});
map.start();

/* frame-time tier: the map steps down (no route lights, 10 fps, 1x pixels) when a frame costs over 20 ms */
setInterval(() => {
  if (reduced || lowTier || !(map.cost > 20)) return;
  lowTier = true; map.lowTier = true; map.resize(); renderFootFor(tree.current);
}, 3000);
/* the river's flow animates only while it is on screen */
if ('IntersectionObserver' in window) {
  new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('offscreen', !e.isIntersecting))).observe($('river'));
}

/* ---------------- compose ---------------- */
const input = $('dv-in');
function readingHTML(text) {
  const s = classify(text);
  const atRisk = s.year > -1e9 && s.year < 2100 ? ` &middot; ${countAtRisk(s.year)} of our recorded events fall after this date and are at risk` : '';
  const conflict = conflicts(text);
  return `read as <b>${esc(s.family.join(' + '))}</b>: ${esc(s.label)} &middot; from ${esc(fmtYear(s.year))}${atRisk} <span class="conf">&middot; confidence ${s.confidence}${s.matched.length ? ' &middot; matched ' + esc(s.matched.filter(Boolean).slice(0, 3).join(', ')) : ''}</span>${conflict ? `<br><b>conflict:</b> ${esc(conflict)}` : ''}`;
}
function countAtRisk(year) { return oursWorld ? oursWorld.stages.history.events.filter((e) => e.year > year).length : 0; }
function conflicts(text) {
  const parts = String(text).split(/\band\b|;|,\s*and\b/i).map((x) => x.trim()).filter((x) => x.length > 6);
  if (parts.length < 2) return '';
  const seen = {};
  for (const p of parts) for (const [k, v] of Object.entries(classify(p).knobs)) {
    if (typeof v !== 'number') continue;
    if (seen[k] != null && Math.abs(seen[k] - v) > 1e-9) return `${k} is set twice (${fmtNum(seen[k])} and ${fmtNum(v)}); the later value wins`;
    seen[k] = v;
  }
  return '';
}
input.addEventListener('input', () => { $('reading').innerHTML = input.value.trim() ? readingHTML(input.value) : ''; });
$('dv-form').addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) diverge(t); });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('dv-form').requestSubmit(); } });

function renderPresets(activeText) {
  const host = $('presets'); host.innerHTML = '';
  PRESETS.forEach((p) => {
    const b = el('button', 'chip', `<i>${esc(p.group)}</i>${esc(p.short)}`);
    b.type = 'button'; b.setAttribute('role', 'listitem'); b.title = `${p.text} ${p.hint}`;
    b.setAttribute('aria-label', `${p.text} ${p.hint}`);
    b.setAttribute('aria-pressed', String(p.text === activeText));
    b.addEventListener('click', () => { input.value = p.text; $('reading').innerHTML = readingHTML(p.text); diverge(p.text); });
    host.appendChild(b);
  });
  const rec = recent().filter((r) => !PRESETS.some((p) => p.text === r.text)).slice(0, 4);
  rec.forEach((r) => {
    const b = el('button', 'chip', `<i>recent</i>${esc(r.name.toLowerCase())}`);
    b.title = r.text;
    b.type = 'button'; b.setAttribute('role', 'listitem');
    b.addEventListener('click', () => { location.hash = r.hash; });
    host.appendChild(b);
  });
}

/* ---------------- weaving ---------------- */
async function weaveVisible(path, parent) {
  document.body.classList.add('weaving');
  busy = true; $('dv-go').disabled = true;
  abortModel();
  pipe.reset();
  $('pipe-mode').textContent = 'engine pass';
  const note = $('pipe-note');
  const w = await enginePass(seed, path, parent, {
    pause: reduced ? 0 : TIMING.stageEngine,
    onStage: (id, state, meta, partial) => {
      pipe.set(id, state, meta);
      // the causal record grows in stage order as each stage completes
      if (partial && (state === 'done' || state === 'pruned') && id !== 'divergence') { partial.ledger = null; causal.setWorld(partial); }
      if (state === 'active') {
        const s = STAGE_BY_ID[id];
        note.innerHTML = `<b>${esc(s.label)}</b> &middot; reads ${s.deps.length ? esc(s.deps.join(', ')) : 'your text'} &middot; ${esc(s.role)}`;
      }
    },
  });
  const delta = loadDelta(w.id);
  if (delta) { applyDelta(w, delta); w.ledger = ledger(w); }
  busy = false; $('dv-go').disabled = false;
  document.body.classList.remove('weaving');
  return w;
}

async function diverge(text) {
  if (busy) return;
  tree.clear();
  const w = await weaveVisible([{ text, eventId: null, year: null }], null);
  tree.add(w); tree.currentId = w.id;
  show(w, { ignite: true });
  maybeAutoModel(w);
}

async function fork(parent, event, text) {
  if (busy || !text.trim()) return;
  const path = [...parent.path, { text: text.trim(), eventId: event.id, year: event.year }];
  const w = await weaveVisible(path, parent);
  tree.add(w); tree.currentId = w.id;
  show(w, { ignite: true });
  $('map-wrap').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  maybeAutoModel(w);
}

function openWorld(id) {
  const w = tree.get(id); if (!w) return;
  tree.currentId = id;
  show(w, { ignite: true });
}

/* ---------------- model pass ---------------- */
function abortModel() { if (modelCtl) { modelCtl.abort(); modelCtl = null; } updateModelButton(); }

function updateModelButton() {
  const b = $('model-go');
  const w = tree.current;
  if (modelCtl) { b.textContent = 'cancel'; b.disabled = false; b.classList.add('on'); return; }
  b.classList.remove('on');
  const mode = forcedMode || routeMode(route);
  const wait = LLM.publicReadyIn();
  b.disabled = busy || !w;
  b.textContent = mode === 'staged' ? 'write it with the model (one call per stage)' : mode === 'batched' ? (wait > 0 ? `public route ready in ${wait} s` : 'write it with the model (1 public call)') : 'write it with the model';
  if (w && w.model && w.model.done) b.textContent = 'write it again with the model';
}
LLM.onStatus((s) => { route = s.route; updateModelButton(); });

$('model-go').addEventListener('click', () => { if (modelCtl) { abortModel(); $('pipe-note').innerHTML = 'Model pass cancelled. The engine world stands.'; return; } runModel(tree.current); });

function maybeAutoModel(w) {
  if (STILL) return;
  LLM.detect().then((r) => { route = r; if ((forcedMode || routeMode(r)) === 'staged' && tree.current === w) runModel(w); else updateModelButton(); });
}

async function runModel(w, only = null) {
  if (typeof only !== 'string') only = null;
  if (!w || busy) return;
  abortModel();
  modelCtl = new AbortController();
  const ctl = modelCtl;
  document.body.classList.add('weaving');
  updateModelButton();
  const mode = forcedMode || 'auto';
  $('pipe-mode').textContent = `model pass: ${mode === 'auto' ? routeMode(route) : mode}`;
  const note = $('pipe-note');
  note.innerHTML = 'asking the model...';
  try {
    await modelPass(w, {
      mode: only ? 'staged' : mode, signal: ctl.signal, only,
      onStage: (id, state, meta) => {
        pipe.set(id, state, meta);
        if (state === 'active') note.innerHTML = `<b>${esc(id)}</b> &middot; ${esc(meta.route || '')} &middot; prompt carries the validated output of ${esc(STAGE_BY_ID[id].deps.join(', '))}`;
        if (state === 'queued') note.innerHTML = `one batched call for every stage &middot; ${LLM.publicReadyIn() > 0 ? 'waiting ' + LLM.publicReadyIn() + ' s for the public window' : 'sent'}`;
        if (state === 'done' || state === 'repaired') note.innerHTML = `<b>${esc(id)}</b> &middot; ${meta.accepted != null ? `<span class="gold">+${meta.accepted} accepted</span>, ${meta.rejected || 0} rejected, ${meta.repaired || 0} repaired by the validator` : esc(meta.note || 'engine')}`;
      },
    });
    if (ctl.signal.aborted) return;
    const m = w.model;
    note.innerHTML = m.route === 'offline' ? 'No route answered. The engine world stands; the ledger says why.' : `<b>${esc(m.route)}</b> ${esc(m.model || '')} &middot; ${m.calls} call${m.calls === 1 ? '' : 's'} in ${(m.ms / 1000).toFixed(1)} s &middot; ${w.rejected.length} line${w.rejected.length === 1 ? '' : 's'} rejected`;
    saveDelta(w.id, modelDelta(w));
    if (tree.current === w) show(w, { ignite: false, keepPipe: true });
  } catch (e) {
    if (e.name !== 'AbortError') note.textContent = 'Model pass failed: ' + (e.message || e);
  } finally {
    if (modelCtl === ctl) modelCtl = null;
    document.body.classList.remove('weaving');
    updateModelButton();
  }
}

/* ---------------- showing a world ---------------- */
function show(w, { ignite = false, keepPipe = false } = {}) {
  history.replaceState(null, '', encodeHash(w));
  remember(w, encodeHash(w));
  const root = tree.get(tree.rootId);
  input.value = root.path[0].text;
  $('reading').innerHTML = readingHTML(root.path[0].text);
  renderPresets(root.path[0].text);
  if (!keepPipe) w.trace.filter((t) => t.route === 'engine').forEach((t) => pipe.set(t.stage, t.status, { route: 'engine', ms: t.ms }));

  const parent = w.parentId ? tree.get(w.parentId) : null;
  $('w-kick').innerHTML = parent ? `FORK ${w.path.length - 1} &middot; from ${esc(parent.name)} at ${esc(fmtYear(w.spec.year))}` : 'WORLD &middot; root of this tree';
  $('w-name').textContent = w.name;
  $('w-motto').textContent = w.motto + (w.model && w.model.done && w.model.route !== 'offline' ? '' : '');
  $('w-div').innerHTML = `${esc(w.spec.text)}<span class="fam">${esc(w.spec.label)} &middot; ${esc(fmtYear(w.spec.year))}${w.spec.sudden ? ' &middot; arrives suddenly' : ''} &middot; written by ${w.model && w.model.done && w.model.route !== 'offline' ? 'the engine and ' + esc(w.model.route) + ' (validated)' : 'the engine'}</span>`;
  applyIdentity(w);
  renderTree($('tree'), tree, openWorld);
  map.setWorld(w, { ignite: ignite && !reduced });
  renderQuant(w);
  river.setWorld(w, tree.children(w.id), parent);
  causal.setWorld(w);
  renderDossier($('dossier'), w, { onRerun: (stage) => runModel(w, stage) });
  document.querySelectorAll('#dossier .card').forEach((c, i) => c.setAttribute('data-stage', STAGES[i] ? STAGES[i].id : ''));
  renderLedger($('ledger'), w, { onPlant: () => plant(w) });
  compare.setTree(tree, w.id, oursWorld);
  renderFootFor(w);
  renderDial(w);
  updateModelButton();
}

function renderFootFor(w) { if (w) renderFoot($('foot'), w, `map tier: ${reduced ? 'still (reduced motion)' : lowTier ? 'reduced: no route lights, 10 fps, 1x pixels (a frame cost over 20 ms)' : 'full: 20 fps, route lights, up to 1.5x pixels'}`); }

/* a world's identity: void tint and ink derived from its climate, kept inside the ink ladder */
function applyIdentity(w) {
  const c = w.ctx.clim;
  const warm = c && !c.runaway ? Math.max(-1, Math.min(1, (c.Tmean - 14.5) / 15)) : w.ctx.ter ? 1 : -1;
  const ice = w.ctx.ter ? w.ctx.ter.stats.iceFrac : 0;
  const r = 6 + Math.round(warm * 2), g = 8, b = 13 + Math.round(ice * 6 - warm * 2);
  document.body.style.setProperty('--world-void', `rgb(${r},${g},${b})`);
  document.body.style.background = `rgb(${r},${g},${b})`;
}

function renderQuant(w) {
  const host = $('qstrip'); host.innerHTML = '';
  const cells = [];
  const ph = w.stages.physics.quantities || [];
  ph.slice(0, 3).forEach((q) => cells.push({ k: q.name, v: fmtNum(q.theirs, q.digits), u: q.unit, o: `ours ${fmtNum(q.ours, q.digits)} ${q.unit}`, tag: q.tag, gold: true }));
  const c = w.ctx.clim;
  if (c && !c.runaway) cells.push({ k: 'global mean', v: c.Tmean.toFixed(1), u: 'C', o: 'ours 14.5 C (model)', tag: 'ILLUSTRATIVE', gold: Math.abs(c.Tmean - 14.5) > 0.7 });
  if (c && !c.runaway) cells.push({ k: 'permanent ice line', v: c.snowball ? '0' : c.iceFree ? 'none' : Math.round(c.iceN), u: c.iceFree ? '' : 'deg', o: 'ours 67 deg (model)', tag: 'ILLUSTRATIVE', gold: Math.abs(c.iceN - 67) > 3 });
  if (w.ctx.ter) cells.push({ k: 'land / ice', v: `${Math.round(w.ctx.ter.stats.landFrac * 100)} / ${Math.round(w.ctx.ter.stats.iceFrac * 100)}`, u: '%', o: `ours ${Math.round(w.ctx.base.landFrac * 100)} / ${Math.round(w.ctx.base.ter.stats.iceFrac * 100)} % on this map`, tag: 'ILLUSTRATIVE' });
  const tl = (w.stages.technology && w.stages.technology.ladder) || [];
  const orb = tl.find((x) => x.tech === 'orbit');
  cells.push({ k: 'orbital flight', v: orb ? (orb.theirs == null ? 'never' : fmtYear(orb.theirs)) : 'never', u: '', o: 'ours 1957 CE', tag: 'ILLUSTRATIVE', gold: !orb || orb.theirs !== 1957 });
  cells.slice(0, 6).forEach((x) => {
    host.appendChild(el('div', 'q', `<span class="k">${esc(x.k)}</span><span class="v${x.gold ? ' gold' : ''}">${esc(x.v)}</span> <span class="u">${esc(x.u)}</span><span class="o">${esc(x.o)} <span class="tag ${x.tag === 'REAL' ? 'real' : 'ill'}">${x.tag}</span></span>`));
  });
}

/* ---------------- the dial: the divergence's own number ---------------- */
function renderDial(w) {
  const host = $('dial'); if (!host) return;
  const d = w.path.length === 1 ? dialFor(w.spec) : null;
  host.innerHTML = '';
  host.hidden = !d;
  if (!d) return;
  const id = 'dial-r';
  host.innerHTML = `<label for="${id}">${esc(d.label)}</label><input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.value}"><output id="dial-o">${esc(d.fmt(d.value))}</output><span class="dial-ours">ours ${esc(d.fmt(d.ours))} &middot; range ${esc(d.fmt(d.min))} to ${esc(d.fmt(d.max))}</span><button type="button" class="ghost dial-sw">sweep this number</button>`;
  host.querySelector('.dial-sw').addEventListener('click', (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    $('sweep-sec').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    runSweep($('sweep'), seed, d, d.value, { onDone: () => { b.disabled = false; } });
  });
  const r = host.querySelector('input'), o = host.querySelector('output');
  r.addEventListener('input', () => { o.textContent = d.fmt(Number(r.value)); });
  r.addEventListener('change', () => { const t = dialText(d, Number(r.value)); input.value = t; diverge(t); });
}

/* ---------------- the river's inspector and the fork ---------------- */
function chainSentences(w, startId) {
  const idx = new Map();
  for (const s of Object.values(w.stages)) { (s.items || []).forEach((i) => idx.set(i.id, { text: i.text, cause: i.cause, ladder: i.ladder })); (s.events || []).forEach((e) => idx.set(e.id, { text: `${fmtYear(e.year)}: ${e.title}`, cause: e.cause, ladder: e.ladder })); }
  idx.set('dv', { text: w.spec.text, cause: null, ladder: 'ESTABLISHED' });
  const out = []; let c = startId, guard = 0;
  while (c && guard++ < 10) { const n = idx.get(c); if (!n) break; out.push(`${esc(n.text)} <code>[${esc(n.ladder)}]</code>`); c = n.cause; }
  return out;
}

function inspect(e, quiet) {
  const w = tree.current; if (!w || !e) return;
  const host = $('inspect');
  const chain = chainSentences(w, e.cause);
  const year = Math.round(e.year);
  const sugg = [];
  sugg.push(`Gravity becomes ${(EARTH.g * w.knobs.gFactor * 1.25).toFixed(1)} m/s2.`);
  if (w.knobs.moon !== 0) sugg.push('The Moon is lost.');
  if (year > -3000 && year < 1700) sugg.push(`The steam engine is invented in ${year > 0 ? year + 15 + ' CE' : -year - 15 + ' BCE'}.`);
  sugg.push('Oxygen falls to 14% of the air.');
  if (year > -1e5) sugg.push('Sea level rises 60 m.');
  const kids = tree.children(w.id).filter((c) => c.path[c.path.length - 1].eventId === e.id);
  host.innerHTML = `<div>
      <div class="ins-y">${esc(fmtYear(e.year))} &middot; ${esc(e.kind)} &middot; ${esc(e.ladder || '')}</div>
      <div class="ins-t">${esc(e.title)}</div>
      ${e.text ? `<p class="ins-x">${esc(e.text)}</p>` : ''}
      <div class="ins-chain">${chain.length ? 'because ' + chain.join('<br>because ') : 'This is where the record starts.'}</div>
      ${kids.length ? `<div class="ins-chain" style="margin-top:6px">forks from here: ${kids.map((k) => `<button type="button" class="ghost" data-open="${k.id}">${esc(k.name)}</button>`).join(' ')}</div>` : ''}
    </div>
    <form class="fork" autocomplete="off">
      <h3>Fork a world here</h3>
      <p>And then this also changed, from ${esc(fmtYear(e.year))} on. Everything before stays as in ${esc(w.name)}. Numbers are read against our world.</p>
      <label class="sr" for="fork-in">Fork divergence</label>
      <textarea id="fork-in" rows="2" maxlength="240" placeholder="type a change"></textarea>
      <div class="sugg">${sugg.map((s) => `<button type="button" class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div class="row"><button type="submit" class="go">Fork &rarr;</button></div>
    </form>`;
  const form = host.querySelector('form'), ta = host.querySelector('textarea');
  host.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { ta.value = b.dataset.s; ta.focus(); }));
  host.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openWorld(b.dataset.open)));
  form.addEventListener('submit', (ev) => { ev.preventDefault(); fork(w, e, ta.value); });
  ta.addEventListener('keydown', (k) => { if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); form.requestSubmit(); } });
  if (!quiet) causal.highlight && causal.highlight(e.id);
}

/* ---------------- the planted fault ---------------- */
function plant(w) {
  const k = w.knobs;
  const wrongG = (EARTH.g * k.gFactor * 0.62).toFixed(1);
  const reply = {
    summary: `The world has a surface gravity of ${wrongG} m/s2.`,
    events: [
      { year: Math.round(w.spec.year) - 500, title: 'A decree issued before the branch point', cause: 'dv', ladder: 'THEORETICAL' },
      { year: 2350, title: 'A colony beyond the horizon year', cause: 'dv', ladder: 'SF' },
      { year: Math.max(Math.round(w.spec.year) + 10, -3000), title: 'An effect that comes before its cause', cause: (w.stages.history.events.slice(-1)[0] || {}).id || 'dv', ladder: 'SPECULATIVE' },
      { year: Math.max(Math.round(w.spec.year) + 20, -2000), title: k.iceDensity > 1 ? 'Skaters cross lakes under floating ice' : k.moon === 0 ? 'A festival by moonlight' : 'Gravity is measured at ' + wrongG + ' m/s2', cause: 'dv', ladder: 'ESTABLISHED' },
      { year: Math.max(Math.round(w.spec.year) + 30, -1000), title: 'A cause that does not exist', cause: 'zz-404', ladder: 'probably' },
    ],
  };
  const res = validateStage('history', reply, w);
  const host = $('ledger');
  const box = el('div', 'card');
  box.style.gridColumn = '1 / -1';
  box.innerHTML = `<div class="card-h"><h3>planted fault test (not merged)</h3><span class="r">${res.rejected.length} rejected, ${res.repaired.length} repaired, ${res.accepted.length} accepted</span></div>` +
    res.rejected.map((r) => `<div class="rej"><span class="rule">${esc(r.rule)}</span>${r.at ? `<code>${esc(r.at)}</code> ` : ''}${esc(r.reason)}<q>${esc(r.item)}</q></div>`).join('') +
    res.repaired.map((r) => `<div class="rej"><span class="rule">${esc(r.rule)}</span>${r.at ? `<code>${esc(r.at)}</code> ` : ''}${esc(r.note)}<q>${esc(r.item)}</q></div>`).join('');
  const old = host.querySelector('.planted'); if (old) old.remove();
  box.classList.add('planted');
  host.appendChild(box);
}

/* ---------------- actions ---------------- */
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (w) => (w.name || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-');
$('act-link').addEventListener('click', async () => {
  const b = $('act-link'); const url = shareURL(tree.current);
  try { await navigator.clipboard.writeText(url); b.textContent = 'link copied'; } catch { b.textContent = 'copy failed'; prompt && 0; }
  setTimeout(() => (b.textContent = 'copy link'), 1600);
});
$('act-json').addEventListener('click', () => download(`altverse-${slug(tree.current)}.json`, new Blob([JSON.stringify(exportTree(tree), null, 1)], { type: 'application/json' })));
$('act-md').addEventListener('click', () => download(`altverse-${slug(tree.current)}.md`, new Blob([toMarkdown(tree.current, tree)], { type: 'text/markdown' })));
$('act-png').addEventListener('click', () => map.toPNG((blob) => blob && download(`altverse-${slug(tree.current)}-map.png`, blob)));
$('act-seed').addEventListener('click', () => { seed = (seed * 1103515245 + 12345) >>> 0 % 100000; seed = seed % 100000; const root = tree.get(tree.rootId); diverge(root.path[0].text); });
$('act-tour').addEventListener('click', () => startTour({ reduced }));
document.querySelectorAll('.map-modes button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.map-modes button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  map.setMode(b.dataset.mode);
}));

/* import: an exported tree comes back whole; the engine replays each world, the model's lines are re-applied */
$('act-import').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.format !== 'altverse-world-tree/1' || !Array.isArray(data.worlds)) throw new Error('not an Altverse export');
    abortModel();
    const lean = data.worlds.slice().sort((a, b) => a.path.length - b.path.length).slice(0, 40);
    tree.clear();
    const map = new Map();
    seed = lean[0].seed >>> 0;
    for (const l of lean) {
      const parent = l.parentId ? map.get(l.parentId) : null;
      if (l.parentId && !parent) continue;
      const w = weaveSync(seed, l.path, parent);
      const d = deltaFromLean(l); if (d) { applyDelta(w, d); w.ledger = ledger(w); saveDelta(w.id, d); }
      map.set(l.id, w); tree.add(w);
    }
    tree.currentId = (map.get(data.root) || tree.get(tree.rootId)).id;
    show(tree.current, { ignite: true });
    $('pipe-note').innerHTML = `Imported ${map.size} world${map.size === 1 ? '' : 's'}: the engine replayed each from seed and path; model lines came back from the file and were re-checked by the ledger.`;
  } catch (err) { $('pipe-note').textContent = 'Import failed: ' + (err.message || err); }
  e.target.value = '';
});

/* tree keyboard: arrows move to parent, child and sibling */
$('tree').addEventListener('keydown', (e) => {
  const cur = tree.current; if (!cur) return;
  let next = null;
  if (e.key === 'ArrowLeft' && cur.parentId) next = cur.parentId;
  if (e.key === 'ArrowRight') { const k = tree.children(cur.id); if (k.length) next = k[0].id; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const sib = cur.parentId ? tree.children(cur.parentId) : [cur];
    const i = sib.indexOf(cur); const j = i + (e.key === 'ArrowDown' ? 1 : -1);
    if (sib[j]) next = sib[j].id;
  }
  if (next) { e.preventDefault(); openWorld(next); requestAnimationFrame(() => { const n = document.querySelector('.tr-node.cur'); if (n) n.focus(); }); }
});

window.addEventListener('hashchange', () => { const h = decodeHash(location.hash); if (h && (!tree.current || encodeHash(tree.current) !== location.hash)) boot(); });

/* ---------------- boot ---------------- */
async function boot() {
  const h = decodeHash(location.hash);
  const rootText = h ? h.root : (PRESETS_BY_ID[params.get('demo')] || PRESETS_BY_ID[DEFAULT_PRESET]).text;
  seed = h ? h.seed : DEFAULT_SEED;
  oursWorld = weaveSync(seed, [{ text: 'No divergence: our world.' }]);
  oursWorld.name = 'OUR WORLD';
  // the ground shows while the stages run
  map.setWorld(oursWorld, { ignite: false });
  $('w-name').textContent = 'weaving';
  tree.clear();
  input.value = rootText;
  $('reading').innerHTML = readingHTML(rootText);
  renderPresets(rootText);
  const forks = h ? h.forks : [];
  const w0 = await weaveVisible([{ text: rootText, eventId: null, year: null }], null);
  tree.add(w0);
  let cur = w0;
  for (const f of forks) {
    const ev = cur.stages.history.events.find((e) => e.id === f.eventId);
    if (!ev) break;
    const child = weaveSync(seed, [...cur.path, { text: f.text, eventId: f.eventId, year: ev.year }], cur);
    const d = loadDelta(child.id); if (d) { applyDelta(child, d); child.ledger = ledger(child); }
    tree.add(child); cur = child;
  }
  tree.currentId = cur.id;
  show(cur, { ignite: true });
  maybeAutoModel(cur);
  if (params.has('tour')) startTour({ reduced });
  if (params.has('sweep')) { const b = document.querySelector('.dial-sw'); if (b) b.click(); }
}
boot();
