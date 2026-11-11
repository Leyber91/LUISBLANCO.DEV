/* ============================================================
   honesty-decoder/main.js — boot, state, URL, and the check pass.

   1. Read the hub registry (site.config.js) and make one system per
      hub entry: a graded row (registry.js) when the lab has a page, a
      generated no-page row when it does not; plus the off-site rows.
   2. Render the ledger, the receipt and the side panel from graded
      verdicts at once (first paint), then run every check in this
      browser and re-render as each one resolves.
   3. Keep the selection, the visitor's challenges and the compare
      choice in the URL hash, so a link restores them.
   ============================================================ */

import { ALL_PROJECTS } from '../config/site.config.js';
import { ROWS, SHARED, OFFSITE } from './registry.js';
import { SNAPSHOT } from './data/snapshot.js';
import { HEAVY_MIN_WIDTH } from './config.js';
import * as E from './engine.js';
import { renderLedger } from './view/ledger.js';
import { renderReceipt, drawWires } from './view/receipt.js';
import { renderSide } from './view/side.js';

const $ = (id) => document.getElementById(id);
const still = /[?&]still/.test(location.search);
if (still) document.documentElement.classList.add('still');

/* ---------------------------------------------------------- systems */
const rowById = Object.fromEntries(ROWS.map((r) => [r.id, r]));

function noPageRow(p) {
  const subs = E.decompose(p.blurb).map((s, i) => ({
    id: `${p.id}.${i + 1}`, phrase: s.text, text: s.text, type: s.type, w: E.TYPE_WEIGHT[s.type] || 1,
    why: 'default weight by type: there is no page to weigh it against',
    verdict: 'unsupported', note: 'no page exists: the hub entry has no href, so nothing can back this', nopage: true, ev: [],
  }));
  return { id: p.id, subs, files: [], mech: [['No page exists for this lab yet: its entry in site.config.js has no href. The rule engine split its blurb; every checkable piece is unsupported until a page exists.', subs.map((s) => s.id)]] };
}

const systems = [];
for (const p of ALL_PROJECTS) {
  const has = !!p.href;
  const row = has && rowById[p.id] ? rowById[p.id] : has ? null : noPageRow(p);
  systems.push({ id: p.id, kind: has ? 'lab' : 'nopage', title: p.title, status: p.status, href: p.href || null, blurb: p.blurb, row, category: p.categoryLabel });
}
for (const o of OFFSITE) {
  systems.push({ id: o.id, kind: 'offsite', title: o.title, status: 'off-site', href: null, blurb: o.claim, line: o.line,
    row: { id: o.id, subs: o.subs.map((s) => ({ ...s, basis: 'author', why: s.why || 'the author\'s weighting' })), files: [], mech: [[o.mech, o.subs.map((s) => s.id)]] } });
}
// rows whose lab is gone from the hub still show, flagged
for (const r of ROWS) if (!systems.find((s) => s.id === r.id)) systems.push({ id: r.id, kind: 'lab', title: r.id, status: 'not in hub', href: null, blurb: '', row: r, orphan: true });
const missingRows = systems.filter((s) => s.kind === 'lab' && !s.row).map((s) => s.title);

/* Blurb drift: a graded phrase no longer in the live blurb. */
for (const s of systems) {
  if (s.kind !== 'lab' || !s.row) continue;
  const b = (s.blurb || '').toLowerCase();
  s.drift = s.row.subs.filter((x) => x.phrase && !b.includes(x.phrase.toLowerCase())).map((x) => x.phrase);
}

const coverage = E.coverage(ALL_PROJECTS, systems.filter((s) => s.row && s.kind !== 'offsite').map((s) => s.id));

/* ---------------------------------------------------------- state */
const app = {
  systems, byId: Object.fromEntries(systems.map((s) => [s.id, s])), coverage, missingRows,
  snapshot: SNAPSHOT, shared: SHARED,
  results: {}, route: 'pollinations', routeNote: 'not yet called: graded under the public route', routeAnswered: null,
  sel: 'the-figure', focus: null, hover: null, testing: null,
  over: {}, weights: {}, compare: null,
  log: [], progress: { done: 0, total: 0, failed: 0, skipped: 0 },
  heavy: innerWidth >= HEAVY_MIN_WIDTH && !navigator.connection?.saveData,
  E,
};
window.L212_DECODER = app; // read-only handle for a sibling page or a console

const counted = () => systems.filter((s) => s.kind === 'lab' && s.row);
app.counted = counted;

app.score = (sys) => {
  if (!sys?.row) return null;
  const sel = sys.id;
  return E.scoreRow(sys.row, app.results, app.route, { override: app.over[sel], weights: app.weights[sel] });
};
app.graded = (sys) => (sys?.row ? E.scoreRow(sys.row, {}, 'pollinations') : null);
app.author = (sys) => (sys?.row ? E.figureOf(sys.row.subs.map((s) => ({ id: s.id, w: s.w, v: E.vOf(s.verdict), type: s.type }))) : null);
app.stale = (sys) => {
  if (!sys?.row || sys.kind !== 'lab') return null;
  const g = SNAPSHOT.grading?.labs?.[sys.id], now = SNAPSHOT.labs?.[sys.id]?.commit;
  const changedFiles = (sys.row.files || []).filter((f) => {
    const r = Object.values(app.results).find((x) => x?.lines?.some((l) => l.f === f));
    return r && r.lines.find((l) => l.f === f)?.changed;
  });
  return { graded: g || null, now: now || null, commitStale: !!(g && now && g !== now), changedFiles, drift: sys.drift || [], any: !!((g && now && g !== now) || changedFiles.length || (sys.drift || []).length) };
};

/* ---------------------------------------------------------- URL */
const CODE = { s: 'supported', p: 'partial', u: 'unsupported' };
const DECODE = { supported: 's', partial: 'p', unsupported: 'u' };
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = h.get('s');
  if (s && app.byId[s]) app.sel = s;
  if (h.get('f')) app.focus = h.get('f');
  if (h.get('o')) app.over[app.sel] = Object.fromEntries(h.get('o').split(',').map((x) => x.split(':')).filter(([, v]) => CODE[v]).map(([k, v]) => [k, CODE[v]]));
  if (h.get('w')) app.weights[app.sel] = Object.fromEntries(h.get('w').split(',').map((x) => x.split(':')).filter(([, v]) => Number(v) >= 0).map(([k, v]) => [k, Number(v)]));
  if (h.get('c') && app.byId[h.get('c')]) app.compare = h.get('c');
  app.pastedHash = h.get('p');
}
app.writeHash = () => {
  const h = new URLSearchParams();
  h.set('s', app.sel);
  if (app.focus) h.set('f', app.focus);
  const o = app.over[app.sel];
  if (o && Object.keys(o).length) h.set('o', Object.entries(o).map(([k, v]) => `${k}:${DECODE[v]}`).join(','));
  const w = app.weights[app.sel];
  if (w && Object.keys(w).length) h.set('w', Object.entries(w).map(([k, v]) => `${k}:${v}`).join(','));
  if (app.compare) h.set('c', app.compare);
  if (app.pastedState) h.set('p', app.pastedState);
  history.replaceState(null, '', `${location.pathname}${location.search}#${h.toString()}`);
};

/* ---------------------------------------------------------- render */
let raf = 0;
app.render = (what = 'all') => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderLedger(app, $('ledger'));
    renderReceipt(app, $('receipt'));
    renderSide(app, $('side'));
    drawWires(app, $('deck'), $('wires'));
    app.tools?.refresh?.(what);
  });
};
app.renderNow = () => {
  renderLedger(app, $('ledger'));
  renderReceipt(app, $('receipt'));
  renderSide(app, $('side'));
  drawWires(app, $('deck'), $('wires'));
};

app.select = (id, { focus = null, announce = true } = {}) => {
  if (!app.byId[id]) return;
  const changed = app.sel !== id;
  app.sel = id;
  app.focus = focus;
  if (changed) app.previewDirty = true;
  app.writeHash();
  app.render();
  if (changed) deepOnSelect(id);
  if (announce) {
    const sys = app.byId[id], sc = app.score(sys);
    $('live').textContent = `${sys.title}: ${sc?.fig.point != null ? `${Math.round(sc.fig.point)} percent, interval ${Math.round(sc.fig.low)} to ${Math.round(sc.fig.high)}` : 'not checkable from this page'}`;
  }
};
app.setFocus = (subId) => { app.focus = subId; app.writeHash(); app.render(); };
app.challenge = (subId, verdict) => {
  const o = (app.over[app.sel] = app.over[app.sel] || {});
  if (verdict == null) delete o[subId]; else o[subId] = verdict;
  app.writeHash(); app.render();
};
app.reweigh = (subId, w) => {
  const o = (app.weights[app.sel] = app.weights[app.sel] || {});
  if (w == null) delete o[subId]; else o[subId] = Math.max(0, Math.min(5, w));
  app.writeHash(); app.render();
};
app.restore = () => { delete app.over[app.sel]; delete app.weights[app.sel]; app.writeHash(); app.render(); };

/* ---------------------------------------------------------- checks */
let runner = null;
async function runChecks({ only = null, heavy = app.heavy } = {}) {
  const { Runner } = await import('./checks/runner.js');
  if (!runner) {
    runner = new Runner({ rows: ROWS, shared: SHARED, snapshot: SNAPSHOT, self: () => ({ coverage, counted: ROWS, results: app.results }) });
    app.runner = runner;
    runner.addEventListener('start', (e) => { app.testing = e.detail; app.render('caption'); });
    runner.addEventListener('result', (e) => {
      const { key, result, row, sub } = e.detail;
      const prev = app.results[key];
      app.results[key] = result;
      app.progress.done++;
      if (result.status === 'fail' || result.status === 'error') app.progress.failed++;
      if (result.status === 'skipped') app.progress.skipped++;
      noteCorrection(key, result, row, sub, prev);
      app.render('results');
    });
  }
  const jobs = runner.jobs({ heavy, only });
  app.progress = { done: 0, total: jobs.length, failed: 0, skipped: 0, started: performance.now(), only };
  if (only) for (const j of jobs) delete app.results[j.key];
  app.passBusy = true;
  try { await runner.runAll({ heavy, only }); } finally { app.passBusy = false; }
  app.testing = null;
  app.progress.ms = Math.round(performance.now() - app.progress.started);
  app.render('done');
  if (app.pendingDeep) { const p = app.pendingDeep; app.pendingDeep = null; deepOnSelect(p); }
}
app.runChecks = runChecks;

/* Selecting a lab runs the deep checks the first pass left waiting. */
function deepOnSelect(id) {
  const row = app.byId[id]?.row;
  if (!row || app.byId[id].kind !== 'lab') return;
  const waiting = row.subs.some((s) => app.results[`${s.id}#probe`]?.status === 'skipped');
  if (!waiting) return;
  if (app.passBusy) { app.pendingDeep = id; return; }
  runChecks({ only: id, heavy: true });
}

/* A check that disagrees with the grading is logged as a correction. */
function noteCorrection(key, result, rowId, subId, prev) {
  if (!rowId || !subId) return;
  const sys = app.byId[rowId];
  const sub = sys?.row?.subs.find((s) => s.id === subId);
  if (!sub) return;
  const bad = result.status === 'fail' || result.status === 'error';
  const differs = result.verdict && result.verdict !== sub.verdict;
  const flipped = prev && prev.status && prev.status !== 'pending' && prev.verdict !== result.verdict;
  if (!bad && !differs && !flipped) return;
  app.log.unshift({
    date: new Date(result.ts).toISOString().replace('T', ' ').slice(0, 19), id: rowId, field: subId,
    old: `${sub.verdict} (graded)`, new: bad ? `unverified (${result.status})` : result.verdict,
    reason: result.detail, runtime: true,
  });
}

/* ---------------------------------------------------------- route */
async function mountRoute() {
  try {
    const [{ mountRoutePanel }, { LLM }, { cachedRoute }] = await Promise.all([
      import('../ai/route-panel.js'), import('../ai/llm.js'), import('./model.js'),
    ]);
    mountRoutePanel($('route'));
    const cached = cachedRoute();
    if (cached) { app.routeAnswered = cached; }
    LLM.onStatus((s) => {
      if (!s || s.route === 'unknown') return;
      const prev = app.route;
      app.route = s.route === 'offline' ? (app.routeAnswered?.route || 'pollinations') : s.route;
      app.routeNote = app.routeAnswered ? `answered ${app.routeAnswered.route} ${new Date(app.routeAnswered.ts).toLocaleTimeString()}` : `${s.route}: detected, not yet called`;
      if (prev !== app.route) app.render('route');
    });
  } catch { /* the route pill is optional; checks never call a model */ }
}

/* ---------------------------------------------------------- boot */
readHash();
document.getElementById('back').addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = 'index.html'; });
if (window.self !== window.top) document.getElementById('back').style.display = 'none';
app.renderNow();
const stageEl = document.getElementById('stage');
stageEl.classList.add('lit');
if (!still && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  stageEl.classList.add('ignite');
  setTimeout(() => stageEl.classList.remove('ignite'), 1700);
}
addEventListener('resize', () => app.render('resize'));
$('rerun').addEventListener('click', () => runChecks({ only: app.sel, heavy: true }));
$('walk-go').addEventListener('click', async () => { const t = await import('./view/tools.js'); t.walk(app); });

const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
idle(async () => {
  const t = await import('./view/tools.js');
  app.tools = t.mountTools(app, $('tools'), $('record'));
  app.render();
  mountRoute();
  // the verification pass starts once the ignition has drawn the ledger
  if (!/[?&]nochecks/.test(location.search)) setTimeout(() => runChecks(), still ? 0 : 1200);
});
