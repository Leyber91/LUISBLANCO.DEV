/* ============================================================
   timeline/main.js — wiring. Loads the event data, holds the
   application state (moment, pinned moment, selection, gate,
   lens, highlights, tour, alignment, followed person) and routes
   intents between the view, the panels, the URL and the ask box.
   ============================================================ */

import { NOW, TOUR, PRESETS, JUMPS, SUGGESTIONS, DATA_URL, CEILING, WORLDS, TIMING } from './config.js';
import {
  setData, setGate, getGate, byId, layerById, VIS, compare, decodeState, encodeState, momentMarkdown, readable, CHARS,
} from './engine.js';
import { fmtCE } from './chronology.js';
import { TimelineView } from './view-canvas.js';
import {
  renderCompare, renderCard, renderFilters, renderIndex, markIndex, renderAnswer, renderRefs, renderPeople,
  renderDiscrepancies, convert, renderTrail,
} from './view-panels.js';
import { ask } from './ask.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const $ = (s) => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still/.test(location.search);
const state = { cursor: -9000, sel: null, lens: null, hi: [], touring: false, pin: null, align: false, follow: null, filter: '', onlyInView: false, trail: [], trailAt: -1 };
let view;

/* ---------------- boot ---------------- */

async function boot() {
  let data;
  try { data = await (await fetch(DATA_URL)).json(); }
  catch (e) { $('#tl-why').textContent = 'The event data did not load. Reload the page.'; throw e; }
  // ?stress=N adds N synthetic events (test mode only, labelled on the page) to measure frame cost
  const stress = Number((location.search.match(/[?&]stress=(\d+)/) || [])[1] || 0);
  if (stress) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const W = ['kharen', 'earth', 'terra'];
    for (let i = 0; i < Math.min(stress, 20000); i++) data.events.push({ id: `synthetic-${i}`, world: W[i % 3], y: -9000 + rnd() * 11068, imp: 3, tier: 0, tag: 'UNTAGGED', title: `synthetic ${i}`, text: 'Synthetic test event.', src: 'real', sec: 'stress test' });
    document.querySelector('.tl-kick').textContent = `STRESS TEST · ${stress} synthetic events added`;
  }
  setData(data);

  view = new TimelineView($('#tl-canvas'), $('#tl-wrap'), {
    onCursor: (t) => { state.cursor = t; queueCompare(); queueURL(); },
    onSelect: (id, o) => select(id, o),
    onView: () => { queueURL(); if (state.onlyInView) queueIndex(); },
    onInteract: () => stopTour(),
    onStep: (d) => step(d),
    onIgnited: () => { if (!state.fromURL && !reduced) startTour(); },
    onTier: (tier, ms) => { $('#tl-tier').textContent = `render tier: ${tier} · ${ms.toFixed(1)} ms to draw a frame`; },
  });

  const s = decodeState(location.hash);
  if (Object.keys(s).length) {
    state.fromURL = true;
    setGate({ read: s.read ?? CEILING, hideDims: s.hideDims || [], hideTags: s.hideTags || [] });
    state.lens = s.lens || null; view.setLens(state.lens);
    if (s.align) { state.align = true; view.setAlign(true); }
    if (s.pin != null) { state.pin = s.pin; view.setPin(s.pin); }
    if (s.follow) { state.follow = s.follow; view.setFollow(s.follow); }
    if (s.trail?.length) state.trail = s.trail.filter((id) => readable(byId.get(id)));
    if (s.t0 != null) view.setView(s.t0, s.t1, { animate: false });
    if (s.sel) select(s.sel, { fit: s.t0 == null, animate: false, keepCursor: s.cursor != null });
    if (s.cursor != null) { state.cursor = s.cursor; view.setCursor(s.cursor, { animate: false }); }
  } else if (reduced) {
    view.setView(-9200, 2300, { animate: false });
    select('te-disc', { fit: false, animate: false });
  } else {
    view.setView(-9200, 2300, { animate: false });
    view.setCursor(state.cursor, { animate: false });
  }

  renderAll();
  wireTools();
  wireAsk();
  wireConverter();
  wireKeys();
  renderRefs($('#tl-refs'));
  renderDiscrepancies($('#tl-disc'));
  loadEval();
  mountRoutePanel($('#route'));
  view.start();
  setTourButton();
  setToggles();
  document.fonts?.load(`500 11px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')}`).then(() => view.refresh()).catch(() => {});
}

function renderAll() {
  renderFilters($('#tl-filters'), { lens: state.lens }, {
    read: (r) => { setGate({ read: r }); afterGate(); },
    dim: (d) => { const g = getGate(); const h = new Set(g.hideDims); h.has(d) ? h.delete(d) : h.add(d); setGate({ hideDims: [...h] }); afterGate(); },
    tag: (t) => { const g = getGate(); const h = new Set(g.hideTags); h.has(t) ? h.delete(t) : h.add(t); setGate({ hideTags: [...h] }); afterGate(); },
    lens: (r) => { stopTour(); state.lens = state.lens === r ? null : r; view.setLens(state.lens); renderAll(); queueURL(); },
  });
  renderPeople($('#tl-people'), state.follow, follow);
  renderTrailNow();
  renderIndexNow();
  if (state.sel) renderCardNow();
  updateCompare();
}

/** After the gate changes: anything no longer readable leaves every channel. */
function afterGate() {
  stopTour();
  if (state.sel && byId.has(state.sel) && !readable(byId.get(state.sel))) { state.sel = null; view.select(null); $('#tl-card').hidden = true; }
  if (state.follow && !CHARS.find((c) => c.id === state.follow && readable({ tier: c.tier }))) { state.follow = null; view.setFollow(null); }
  state.hi = state.hi.filter((id) => !byId.has(id) || VIS.includes(byId.get(id)));
  view.setHighlights(state.hi);
  view.refresh();
  renderAll();
  queueURL();
}

/* ---------------- selection and the moment ---------------- */

function pick(id) { stopTour(); select(id); }

function select(id, { fit = true, animate = true, from = '', keepCursor = false } = {}) {
  const ev = byId.get(id);
  const layer = !ev && layerById.get(id);
  if (!(ev && readable(ev)) && !layer) return;
  state.sel = id;
  view.select(id);
  if (ev) {
    const t = Math.min(ev.y, NOW + 0.5) - (state.align ? view.wOff(ev.world) : 0);
    if (!keepCursor) { state.cursor = t; view.setCursor(t, { animate }); }
    if (fit) {
      const [a, b] = view.fitFor(ev);
      if (a !== view.t0 || b !== view.t1) view.setView(a, b, { animate });
    }
  }
  state.trailAt = state.trail.indexOf(id);
  renderCardNow();
  renderTrailNow();
  markIndex($('#tl-index'), id, state.hi);
  updateCompare();
  queueURL();
  if (from && from !== 'tour') announce(ev ? `${ev.title}, ${fmtCE(ev.y, ev.c)}, ${ev.world}` : layer.title);
}

function renderCardNow() {
  renderCard($('#tl-card'), state.sel, { onPick: pick, onFollow: follow, onTrail: new Set(state.trail), onTrailToggle: trailToggle });
}
function trailToggle(id) {
  stopTour();
  const has = state.trail.includes(id);
  state.trail = has ? state.trail.filter((x) => x !== id) : [...state.trail, id];
  state.trail.sort((a, b) => byId.get(a).y - byId.get(b).y);
  renderCardNow(); renderTrailNow(); queueURL();
  announce(has ? 'removed from the trail' : `added to the trail: ${state.trail.length} events`);
}
function renderTrailNow() {
  renderTrail($('#tl-trail'), state.trail, state.trailAt, {
    pick: (id) => { stopTour(); select(id); },
    prev: () => { if (!state.trail.length) return; stopTour(); select(state.trail[Math.max(0, (state.trailAt < 0 ? 1 : state.trailAt) - 1)]); },
    next: () => { if (!state.trail.length) return; stopTour(); select(state.trail[Math.min(state.trail.length - 1, state.trailAt + 1)]); },
    clear: () => { state.trail = []; state.trailAt = -1; renderTrailNow(); renderCardNow(); queueURL(); },
  });
}

function step(dir) {
  let list = VIS;
  if (state.follow) list = VIS.filter((e) => e.who?.includes(state.follow));
  let i = list.findIndex((e) => e.id === state.sel);
  if (i < 0) i = list.findIndex((e) => e.y >= state.cursor) - (dir > 0 ? 1 : 0);
  const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
  if (next) select(next.id, { from: 'key' });
}

function follow(cid) {
  stopTour();
  state.follow = state.follow === cid ? null : cid;
  view.setFollow(state.follow);
  renderPeople($('#tl-people'), state.follow, follow);
  $('#tl-follow-step').hidden = !state.follow;
  if (state.follow) {
    const first = VIS.find((e) => e.who?.includes(state.follow));
    view.setView(1985, 2071);
    if (first) select(first.id, { fit: false });
  }
  queueURL();
}

let cmpQueued = false;
function queueCompare() { if (cmpQueued) return; cmpQueued = true; requestAnimationFrame(() => { cmpQueued = false; updateCompare(); }); }
function updateCompare() {
  const ev = byId.get(state.sel);
  renderCompare($('#tl-compare'), compare(state.cursor, { align: state.align }), { selWorld: ev?.world, onPick: pick, pin: state.pin });
}
let idxQueued = false;
function queueIndex() { if (idxQueued) return; idxQueued = true; setTimeout(() => { idxQueued = false; renderIndexNow(); }, TIMING.indexDebounce); }
function renderIndexNow() {
  renderIndex($('#tl-index'), { filter: state.filter, inView: state.onlyInView && view ? [view.t0, view.t1] : null }, (id, o) => { stopTour(); select(id, o); });
  markIndex($('#tl-index'), state.sel, state.hi);
}

function announce(text) { const n = $('#tl-live'); n.textContent = ''; requestAnimationFrame(() => { n.textContent = text; }); }

/* ---------------- URL ---------------- */

let urlTimer = 0;
function urlState() {
  const g = getGate();
  return { t0: view.t0, t1: view.t1, cursor: state.cursor, sel: state.sel, read: g.read, hideDims: g.hideDims, hideTags: g.hideTags, lens: state.lens, pin: state.pin, align: state.align, follow: state.follow, trail: state.trail };
}
function queueURL() {
  if (state.touring || !view) return;
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => { try { history.replaceState(null, '', encodeState(urlState())); } catch { /* sandboxed */ } }, TIMING.urlDebounce);
}

/* ---------------- the tour ---------------- */

let tourTimer = 0, tourIdx = 0;
function startTour() {
  if (state.align) toggleAlign(false);
  state.touring = true;
  tourNext();
}
function tourNext() {
  clearTimeout(tourTimer);
  const id = TOUR[tourIdx % TOUR.length];
  tourIdx++;
  select(id, { from: 'tour' });
  if (state.touring) tourTimer = setTimeout(tourNext, ['sync', 'ea-access', 'hs-origin', 'inh-emerge'].includes(id) ? TIMING.tourDwellLong : TIMING.tourDwell);
  setTourButton();
}
function stopTour() {
  if (!state.touring) return;
  state.touring = false;
  clearTimeout(tourTimer);
  setTourButton();
  queueURL();
}
function setTourButton() {
  const b = $('#tl-tour');
  b.setAttribute('aria-pressed', String(state.touring));
  b.textContent = state.touring ? `tour: stop ${((tourIdx - 1) % TOUR.length) + 1} of ${TOUR.length}` : tourIdx ? 'resume the tour' : 'play the tour';
}

/* ---------------- tools ---------------- */

function setToggles() {
  $('#tl-align').setAttribute('aria-pressed', String(state.align));
  $('#tl-pin').setAttribute('aria-pressed', String(state.pin != null));
  $('#tl-pin').textContent = state.pin != null ? 'unpin' : 'pin this moment';
  $('#tl-follow-step').hidden = !state.follow;
}

function toggleAlign(on = !state.align) {
  const ev = byId.get(state.sel);
  state.align = on;
  view.setAlign(on);
  state.pin = null; view.setPin(null);
  if (on) { view.setView(-1500, 10400); const d = ev && WORLDS.some((w) => w.id === ev.world) ? ev.y - view.wOff(ev.world) : 100; state.cursor = d > -1500 && d < 10400 ? d : 100; }
  else { view.setView(-9200, 2300); state.cursor = ev ? Math.min(ev.y, NOW + 0.5) : -3537; }
  view.setCursor(state.cursor);
  setToggles(); updateCompare(); queueURL();
}

function wireTools() {
  const host = $('#tl-presets');
  host.innerHTML = PRESETS.map((p) => `<button type="button" class="tl-btn" data-p="${p.id}">${p.label}</button>`).join('');
  host.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    stopTour();
    if (state.align) toggleAlign(false);
    const p = PRESETS.find((x) => x.id === b.dataset.p);
    view.setView(p.t0, p.t1);
    if (state.cursor < p.t0 || state.cursor > p.t1) { state.cursor = Math.min(NOW + 0.5, p.t0 + (p.t1 - p.t0) * 0.62); view.setCursor(state.cursor); updateCompare(); }
  }));
  const jumps = $('#tl-jumps');
  jumps.innerHTML = JUMPS.map((j) => `<button type="button" class="tl-btn" data-j="${j.id}">${j.label}</button>`).join('');
  jumps.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { stopTour(); select(b.dataset.j); }));
  $('#tl-zin').addEventListener('click', () => { stopTour(); view.setView(...view.zoomWin(state.cursor, 0.4), { maxMs: view.motion.slow }); });
  $('#tl-zout').addEventListener('click', () => { stopTour(); view.setView(...view.zoomWin(state.cursor, 2.5), { maxMs: view.motion.slow }); });
  $('#tl-tour').addEventListener('click', () => { if (state.touring) stopTour(); else { state.fromURL = false; startTour(); } });
  $('#tl-tour-next').addEventListener('click', () => { if (!state.touring) { state.touring = true; } tourNext(); setTourButton(); });
  $('#tl-align').addEventListener('click', () => { stopTour(); toggleAlign(); });
  $('#tl-pin').addEventListener('click', () => {
    stopTour();
    state.pin = state.pin == null ? state.cursor : null;
    view.setPin(state.pin);
    setToggles(); updateCompare(); queueURL();
    announce(state.pin == null ? 'pin cleared' : `moment pinned at ${fmtCE(state.pin)}; move the gold line to compare`);
  });
  $('#tl-follow-prev').addEventListener('click', () => step(-1));
  $('#tl-follow-next').addEventListener('click', () => step(1));
  $('#tl-copy').addEventListener('click', async () => {
    stopTour();
    const url = location.origin + location.pathname + encodeState(urlState());
    try { await navigator.clipboard.writeText(url); flash('#tl-copy', 'link copied'); } catch { flash('#tl-copy', 'copy blocked'); }
  });
  $('#tl-copytext').addEventListener('click', async () => {
    stopTour();
    const md = momentMarkdown(state.cursor, { sel: state.sel, align: state.align, pin: state.pin }) + `\n\n${location.origin + location.pathname + encodeState(urlState())}`;
    try { await navigator.clipboard.writeText(md); flash('#tl-copytext', 'text copied'); } catch { flash('#tl-copytext', 'copy blocked'); }
  });
  $('#tl-export').addEventListener('click', () => {
    stopTour();
    const md = momentMarkdown(state.cursor, { sel: state.sel, align: state.align, pin: state.pin }) + `\n\n${location.origin + location.pathname + encodeState(urlState())}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `triverse-${(state.align ? `since-${Math.round(state.cursor)}` : fmtCE(state.cursor)).replace(/[^\w]+/g, '-').toLowerCase()}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    flash('#tl-export', 'saved');
  });
  $('#tl-search').addEventListener('input', (e) => { state.filter = e.target.value; queueIndex(); });
  $('#tl-inview').addEventListener('change', (e) => { state.onlyInView = e.target.checked; renderIndexNow(); });
}

function flash(sel, text) {
  const b = $(sel), old = b.dataset.label || b.textContent;
  b.dataset.label = old; b.textContent = text;
  setTimeout(() => { b.textContent = old; }, TIMING.flash);
}

/* ---------------- keyboard: ? help, / search, Escape ---------------- */

function wireKeys() {
  const help = $('#tl-helpbox');
  const open = (on) => { help.hidden = !on; if (on) help.querySelector('button').focus(); };
  $('#tl-helpbtn').addEventListener('click', () => open(help.hidden));
  help.querySelector('button').addEventListener('click', () => { open(false); $('#tl-helpbtn').focus(); });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape' && !help.hidden) { open(false); return; }
    if (typing) return;
    if (e.key === '?') { e.preventDefault(); open(help.hidden); }
    else if (e.key === '/') { e.preventDefault(); $('#tl-search').focus(); }
    else if (e.key === 't' || e.key === 'T') { state.touring ? stopTour() : startTour(); }
    else if (e.key === 'p' || e.key === 'P') $('#tl-pin').click();
    else if (e.key === 'a' || e.key === 'A') toggleAlign();
  });
}

/* ---------------- the clock converter ---------------- */

function wireConverter() {
  const input = $('#tl-conv'), out = $('#tl-conv-out'), go = $('#tl-conv-go');
  let last = null;
  const run = () => { const r = convert(input.value); last = r; out.innerHTML = r.html; go.hidden = r.kind !== 'date'; };
  input.addEventListener('input', run);
  const goThere = () => {
    if (last?.kind !== 'date') return;
    stopTour();
    if (state.align) toggleAlign(false);
    const t = last.ce, span = Math.max(40, Math.min(12000, Math.abs(NOW - t) * 0.5));
    view.setView(t - span / 2, Math.min(t + span / 2, 2400));
    state.cursor = t; view.setCursor(t); updateCompare(); queueURL();
  };
  go.addEventListener('click', goThere);
  $('#tl-convform').addEventListener('submit', (e) => { e.preventDefault(); run(); goThere(); });
  run();
}

/* ---------------- ask ---------------- */

let askCtl = null;
function wireAsk() {
  const form = $('#tl-askform'), input = $('#tl-q'), out = $('#tl-answer');
  $('#tl-sugg').innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="tl-chip tl-sq">${s}</button>`).join('');
  $('#tl-sugg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; form.requestSubmit(); }));
  const show = (res, opt) => {
    renderAnswer(out, res, { ...opt, onPick: pick });
    state.hi = (res.events || []).filter((id) => byId.has(id));
    view.setHighlights(state.hi);
    markIndex($('#tl-index'), state.sel, state.hi);
    if (res.events?.length && !opt.pending) select(res.events[0], { from: 'ask' });
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    stopTour();
    askCtl?.abort();
    askCtl = new AbortController();
    const btn = $('#tl-askbtn');
    btn.disabled = true;
    try {
      const res = await ask(q, {
        signal: askCtl.signal,
        onInstant: (det) => {
          const label = det.kind === 'guard' ? 'plot guard: refused without calling a model'
            : det.refused ? 'no supporting event: refused without calling a model'
              : det.computed ? `computed by the chronology engine (${det.kind})` : 'instant search over the published events';
          show(det, { pending: !det.refused && det.kind === 'search', label });
          if (det.events?.length) select(det.events[0], { from: 'ask' });
        },
      });
      if (['guard', 'no-support', 'computed'].includes(res.source)) { if (res.source === 'computed') show(res, { pending: false, label: `computed by the chronology engine (${res.kind}); a model cannot improve a computed answer, so none was called` }); return; }
      const label = res.source === 'offline' ? `no model answered; the ${res.computed ? 'computed' : 'search'} answer stands${res.note ? ` (${res.note})` : ''}`
        : res.source === 'rejected' ? `the model’s reply was rejected: ${res.note}; the ${res.computed ? 'computed' : 'search'} answer stands`
          : `phrased by ${res.model || 'a model'} via ${res.source === 'ollama' ? 'your machine' : res.source} in ${(res.ms / 1000).toFixed(1)} s from ${res.contextSize} events; citations checked${res.claims?.some((c) => !c.ok) ? `; ${res.claims.filter((c) => !c.ok).length} sentence(s) struck: a date or number not in its events` : ', every dated sentence supported'}`;
      show(res, { pending: false, label });
    } catch (err) {
      if (err?.name !== 'AbortError') renderAnswer(out, { answer: 'Something went wrong; the instant answer above still stands.', events: [] }, { label: String(err?.message || err) });
    } finally { btn.disabled = false; }
  });
}

/* ---------------- the measured answer quality ---------------- */

async function loadEval() {
  try {
    const r = await (await fetch(new URL('./data/eval.json', import.meta.url))).json();
    const det = r.runs.find((x) => x.route === 'deterministic');
    const mod = r.runs.find((x) => x.route !== 'deterministic');
    $('#tl-eval').textContent = `Measured on a fixed set of ${r.questions} questions (${r.date}, local route): the deterministic engine alone answers ${det.correct} correctly${mod ? `; with ${mod.model} phrasing its retrieval answers, ${mod.correct}, with ${mod.struck} sentence${mod.struck === 1 ? '' : 's'} struck by the claim check` : ''}. Unanswerable and plot questions refused: ${det.refusedOk} of ${r.unanswerable}. The engine computes every answer; the model adds phrasing only. An earlier run that let the model phrase every answer scored ${r.history?.[0]?.correct ?? '27'} of ${r.questions}; computed answers no longer go to a model.`;
  } catch { /* the line stays as written in the page */ }
}

boot();
