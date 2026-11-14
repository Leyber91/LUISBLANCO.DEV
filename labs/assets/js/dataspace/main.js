/* ============================================================
   dataspace/main.js — wiring: state, URL, data loading, and the
   glue between the run flow, the measures, the views and the scene.
   Measures live in measures.js, calls in flow.js, drawing in
   scene.js, plot.js and views.js; this file decides what to show.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import * as C from './config.js';
import { BPE, pretokenize } from './bpe.js';
import * as M from './measures.js';
import { RunFlow } from './flow.js';
import { Horizon } from './scene.js';
import { renderPlot, SHAPES, DASHES } from './plot.js';
import * as V from './views.js';
import { cleanRun } from './run-guard.js';
import { DEFS, concepts, metaphorRows, methods, floorProse, limitsNote, tourSteps, findings } from './copy.js';

const { $ } = V;
const still = /[?&]still\b/.test(location.search);
const reduce = still || matchMedia('(prefers-reduced-motion: reduce)').matches;
const DATA = C.LAB.dataBase;

/* ---------- state ---------- */
const S = {
  preset: C.DEFAULT_PRESET, source: '', level: C.DEFAULT_LEVEL, dist: 'lexical', repeats: 1,
  bpe: null, runs: [], sel: null, cmp: null, compare: false, pins: new Set(), models: new Set(),
  priors: {}, recordedPriors: {}, calls: {}, srcM: null, floorBits: null, lossless: null, ref: null,
  baseCache: new Map(), liveRuns: [], hideModels: new Set(),
};
const tokenize = (t) => (S.bpe ? S.bpe.encode(t) : pretokenize(t));
const isCommon = (w) => (S.bpe ? S.bpe.count(' ' + w) === 1 : true);
const ctx = { tokenize, isCommon };

/* ---------- back button, frame ---------- */
$('back').addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = 'index.html'; });
if (window.self !== window.top) $('back').hidden = true;
// ?still is the screenshot frame: no route is probed, so two still frames never differ by a network answer
if (still) $('route').innerHTML = '<span class="still-pill">still frame: no model route probed</span>';
else mountRoutePanel($('route'));

/* ---------- the scene (started after the first paint, so the numbers print before the shader compiles) ---------- */
let scene = null;
function startScene() {
  scene = new Horizon({ gl: $('gl'), marks: $('marks'), tip: $('tip'), tier: $('tier'), nogl: $('nogl'), still, reduce });
  performance.mark('ds:shader');
  focusScene();
  addEventListener('resize', focusScene);
  pushScene();
}
/* The horizon owns the gap between the side panels on a wide screen, and the whole scene block on a phone. */
function focusScene() {
  if (!scene) return;
  const c = $('gl').getBoundingClientRect(), l = document.querySelector('.col-l').getBoundingClientRect(), r = document.querySelector('.col-r').getBoundingClientRect();
  const wide = r.left > l.right + 120 && Math.abs(r.top - l.top) < 200;
  scene.setFocus(wide ? { x: l.right - c.left, w: r.left - l.right } : { x: 0, w: c.width });
}

/* ---------- URL state ---------- */
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pack(str) {
  const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(str)); w.close();
  return b64u(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
}
async function unpack(s) {
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter();
  w.write(unb64u(s)); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}
let urlTimer = 0;
function saveURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(async () => {
    const q = new URLSearchParams();
    if (S.preset) q.set('p', S.preset); else q.set('t', await pack(S.source.slice(0, C.LIMITS.urlChars)));
    q.set('s', S.level);
    const sel = S.runs.find((e) => e.run.id === S.sel)?.run;
    if (sel) {
      if (sel.kind === 'recorded') q.set('r', sel.id);
      else q.set('x', await pack(JSON.stringify({ id: sel.id, kind: sel.kind, level: sel.level, budgetWords: sel.budgetWords, capsule: sel.capsule, rebuild: sel.rebuild, provenance: slimProv(sel.provenance), status: sel.status, note: sel.note })));
    }
    if (S.cmp) q.set('c', S.cmp);
    if (S.dist !== 'lexical') q.set('d', S.dist);
    history.replaceState(null, '', location.pathname + location.search + '#' + q.toString());
  }, C.TIMERS.urlDebounce);
}
const slimProv = (p) => ({ ...p, compress: p.compress && { ...p.compress, raw: p.compress.raw?.slice(0, 1500) }, rebuild: p.rebuild && { ...p.rebuild } });

/* ---------- presets and strength controls ---------- */
function buildControls() {
  const host = $('presets');
  host.innerHTML = C.PRESETS.map((p) => `<button type="button" class="chip" role="radio" data-p="${p.id}" aria-checked="false" title="${V.esc(p.blurb)}">${V.esc(p.title)} <small>${V.esc(p.kind)}</small></button>`).join('') +
    '<button type="button" class="chip" role="radio" data-p="" aria-checked="false">your text <small>paste</small></button>';
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    const id = b.dataset.p;
    if (!id) { S.preset = null; markPreset(); $('src').focus(); $('src').select(); return; }
    loadPreset(id);
  });
  const lv = $('levels');
  lv.innerHTML = C.LEVELS.map((l) => `<button type="button" class="lvl" role="radio" data-l="${l.id}" aria-checked="false"><b>L${l.id}</b>${l.name}</button>`).join('');
  lv.addEventListener('click', (e) => { const b = e.target.closest('.lvl'); if (b) setLevel(Number(b.dataset.l), true); });
  lv.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setLevel(Math.max(1, Math.min(5, S.level + (e.key === 'ArrowRight' ? 1 : -1))), true); lv.querySelector(`[data-l="${S.level}"]`).focus(); }
  });
}
function markPreset() {
  for (const b of $('presets').querySelectorAll('.chip')) b.setAttribute('aria-checked', String((b.dataset.p || null) === S.preset));
}
function setLevel(l, pick) {
  S.level = l;
  for (const b of $('levels').querySelectorAll('.lvl')) b.setAttribute('aria-checked', String(Number(b.dataset.l) === l));
  updateBudget();
  if (pick) {
    const cur = S.runs.find((e) => e.run.id === S.sel)?.run;
    const same = S.runs.filter((e) => e.run.level === l && e.run.capsule);
    const best = same.find((e) => cur && e.run.provenance?.model === cur.provenance?.model && e.run.provenance?.repeat === cur.provenance?.repeat) || same[0];
    if (best) select(best.run.id, { replay: true });
  }
  saveURL();
}
function updateBudget() {
  const w = C.wordCount(S.source.slice(0, C.LIMITS.sourceChars));
  $('budgetHint').textContent = `L${S.level}: at most ${C.budgetFor(w, S.level)} of ${w} words`;
}

/* ---------- the source ---------- */
let measureTimer = 0;
function setSourceText(text) {
  S.source = text;
  $('src').value = text;
  measureSource();
}
function measureSource() {
  const t = S.source;
  const toks = tokenize(t);
  const bits = M.twoPartBits(toks);
  S.srcM = { tokens: toks, bits };
  const bytes = new TextEncoder().encode(t);
  const cut = t.length > C.LIMITS.sourceChars;
  $('srcHint').textContent = cut ? `the first ${C.LIMITS.sourceChars} characters are sent and scored` : '';
  const meter = () => {
    const fl = S.floorBits;
    $('srcMeter').innerHTML = `${t.length.toLocaleString('en-US')} chars · <b>${toks.length}</b> ${S.bpe ? 'GPT-2 tokens' : 'pre-tokens (BPE loading)'} · <b>${V.fmt(bits.total)}</b> bits` +
      ` · DEFLATE <b>${fl == null ? '...' : V.fmt(fl)}</b>` + (bytes.length < M.DEFLATE_SHORT_BYTES ? ' <span class="warn">under 50 bytes DEFLATE\'s header and tables dominate</span>' : '');
  };
  meter();
  if (!performance.getEntriesByName('ds:bits').length) performance.mark('ds:bits');
  M.deflateBits(bytes).then((fb) => { if (S.source === t) { S.floorBits = fb; meter(); renderCurrent(); } });
  updateBudget();
  requestLossless();
}

$('src').addEventListener('input', () => {
  S.preset = null; markPreset();
  S.source = $('src').value;
  clearTimeout(measureTimer);
  measureTimer = setTimeout(() => { measureSource(); adoptRunsForSource(); saveURL(); }, C.TIMERS.measureDebounce);
});

/* ---------- data: merges, priors, recorded runs ---------- */
async function loadBPE() {
  try {
    const r = await fetch(DATA + 'gpt2-merges.txt');
    S.bpe = new BPE(await r.text());
    S.baseCache.clear();
    for (const e of S.runs) e.m = null;
    measureSource();
    renderCurrent();
    scoreAllSoon();
  } catch (e) { $('srcMeter').insertAdjacentText('beforeend', ' · BPE merges failed to load; counts are GPT-2 pre-tokens'); }
}
const fileCache = new Map();
async function loadRunFile(id) {
  if (fileCache.has(id)) return fileCache.get(id);
  const p = fetch(DATA + `runs-${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  fileCache.set(id, p);
  return p;
}
async function loadPriors() {
  try {
    const j = await (await fetch(DATA + 'priors.json')).json();
    for (const p of j.priors) (S.recordedPriors[p.model] ||= []).push(p);
  } catch { /* no priors: the split shows prior 0 */ }
}
const priorText = (model) => S.priors[model]?.text ?? S.recordedPriors[model]?.[0]?.call?.raw ?? null;
const priorSource = (model) => (S.priors[model] ? 'live' : S.recordedPriors[model] ? 'recorded' : null);

async function loadPreset(id, opts = {}) {
  S.preset = id; markPreset();
  S.sel = null; S.cmp = null;
  const p = C.PRESETS.find((x) => x.id === id);
  setSourceText(p.text);
  S.pins.clear();
  stage(1);
  const f = await loadRunFile(id);
  S.calls = f?.calls || {};
  const rec = (f?.runs || []).map((r) => ({ run: { ...r, source: p.text }, m: null }));
  S.runs = rec.concat(S.liveRuns.filter((e) => e.run.source === p.text));
  S.models = new Set(S.runs.map((e) => e.run.provenance?.model));
  buildModelToggles();
  const want = opts.run && S.runs.find((e) => e.run.id === opts.run);
  const first = want || S.runs.find((e) => e.run.level === S.level && e.run.provenance?.model === 'llama3.1:8b' && e.run.provenance?.repeat === 1) ||
    S.runs.find((e) => e.run.level === S.level) || S.runs[0];
  if (first) await select(first.run.id, { replay: !opts.noReplay });
  else { S.sel = null; renderCurrent(); }
  if (opts.cmp) { S.cmp = opts.cmp; S.compare = true; $('cmpBtn').setAttribute('aria-pressed', 'true'); }
  scoreAllSoon();
  saveURL();
}
function adoptRunsForSource() {
  S.runs = S.liveRuns.filter((e) => e.run.source === S.source.slice(0, C.LIMITS.sourceChars));
  S.models = new Set(S.runs.map((e) => e.run.provenance?.model));
  buildModelToggles();
  S.sel = S.runs.length ? S.runs[S.runs.length - 1].run.id : null;
  S.cmp = null;
  S.baseCache.clear();
  stage(1);
  renderCurrent();
}

/* ---------- scoring ---------- */
function scoredAs(run) {
  if (run.kind === 'engine') return 'literal';
  if (!run.rebuild) return 'none';
  return 'rebuild';
}
function score(entry) {
  if (entry.m) return entry.m;
  const r = entry.run;
  const mode = scoredAs(r);
  entry.scoredAs = mode;
  entry.m = M.scoreRun({ source: r.source, capsule: r.capsule || '', rebuild: mode === 'literal' ? (r.capsule || '') : (r.rebuild || ''),
    prior: mode === 'rebuild' ? priorText(r.provenance?.model) : null }, ctx, C.LIMITS);
  return entry.m;
}
let scoreTimer = 0;
function scoreAllSoon() {
  clearTimeout(scoreTimer);
  const todo = S.runs.filter((e) => !e.m);
  const step = () => {
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < C.TIMERS.scoreSlice) score(todo.shift());
    if (todo.length) scoreTimer = setTimeout(step, 0);
    else { renderPlots(); renderRunTables(); renderPins(); }
  };
  scoreTimer = setTimeout(step, C.TIMERS.scoreStart);
}

/* ---------- selection and replay ---------- */
let stageNow = 0;
function stage(n) {
  stageNow = n;
  for (const s of $('stages').querySelectorAll('[data-stage]')) {
    const k = Number(s.dataset.stage);
    s.className = k === n ? 'on' : k < n ? 'done' : '';
  }
  pushScene();
}
const delay = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

async function select(id, { replay = false } = {}) {
  S.sel = id;
  const e = S.runs.find((x) => x.run.id === id);
  if (!e) return;
  if (e.run.level !== S.level) { S.level = e.run.level; setLevel(S.level, false); }
  if (replay && !reduce) {
    // a recorded run replays its three stages in order: source measured, capsule received, rebuild received
    stage(1); renderCurrent({ capsuleOnly: true, hideRebuild: true });
    await delay(C.MOTION.infall.value * 0.6);
    if (S.sel !== id) return;
    stage(2); renderCurrent({ hideRebuild: true });
    await delay(C.MOTION.crush.value + C.MOTION.replayHold.value);
    if (S.sel !== id) return;
  }
  score(e);
  stage(e.run.capsule ? (e.scoredAs === 'none' ? 2 : 3) : 1);
  renderCurrent();
  saveURL();
}

/* ---------- rendering ---------- */
/* The selected run, only while it belongs to the text on screen (a run is scored against its own source). */
const onScreen = (e) => !!e && e.run.source === S.source.slice(0, C.LIMITS.sourceChars);
function current() { const e = S.runs.find((x) => x.run.id === S.sel); return onScreen(e) ? e : null; }

function renderCurrent(opt = {}) {
  const e = current();
  const src = S.srcM;
  if (!src) return;
  const m = e ? score(e) : null;
  const mode = e ? e.scoredAs : 'none';
  const hide = opt.hideRebuild;
  V.renderPlate({ run: e?.run, m, src, floorBits: S.floorBits, scoredAs: hide ? 'none' : mode });
  if (hide && e) { for (const id of ['f_lex', 'f_num', 'f_ent', 'f_turn']) $(id).textContent = '...'; $('split').innerHTML = ''; }
  V.renderCapsule(opt.capsuleOnly ? null : e?.run, m);
  if (opt.capsuleOnly && e) $('capText').textContent = 'compressing...';
  // ledger
  const per = src.bits.per;
  const kept = m && mode !== 'none' && !hide ? m.lex.keptSrc : null;
  V.renderStrip($('strip'), src.tokens, per, kept);
  V.renderHeat($('heat'), src.tokens, per, S.pins);
  $('heatHint').textContent = `${src.tokens.length} tokens, ${V.fmt(src.bits.total)} bits; darker cells are cheaper`;
  if (m && !hide) V.renderDiff($('diff'), m, mode); else $('diff').textContent = e ? 'rebuilding...' : 'no run yet';
  if (!m || hide) $('diffCounts').textContent = '';
  // survival
  V.renderUnits($('units').tBodies[0], m || { units: [] }, e?.run.rebuild || e?.run.capsule || '', hide ? 'none' : mode);
  $('unitHint').textContent = m && mode !== 'none' && !hide ? `numbers ${m.summary.numbers.survived}/${m.summary.numbers.total}, names ${m.summary.entities.survived}/${m.summary.entities.total}` : '';
  V.renderTurns($('turns').tBodies[0], m || {}, hide ? 'none' : mode);
  $('turnHint').textContent = m && mode === 'rebuild' && !hide ? `${m.turns.srcCount} in the source, ${m.turns.recCount} in the rebuild, speaker order ${V.pct(m.turns.order)}${m.turns.countMatch ? '' : ' (count changed)'}` : '';
  V.renderSplit($('splitBig'), m && mode === 'rebuild' && !hide ? m.split : null, m?.lex.fidelity || 0);
  $('splitNote').innerHTML = m && mode === 'rebuild' && !hide ? splitText(e, m) : 'The split needs a rebuild.';
  $('limits').innerHTML = m && mode !== 'none' && !hide ? limitsNote(m, e.run) : '';
  // calls
  const calls = callsOf(e?.run);
  V.renderCalls(e?.run, calls, (t) => tokenize(t).length);
  $('capEdit').value = e?.run.capsule || '';
  // legend numbers, scene, plots, tables
  $('lg_core').textContent = m && e.run.capsule ? m.rate.toFixed(3) : '-';
  $('lg_lost').textContent = m && mode !== 'none' && !hide ? `${m.lex.dropped} tokens, ${m.units.filter((u) => u.status === 'lost').length} facts` : '-';
  pushScene(hide);
  renderPlots();
  renderRunTables();
  renderPins();
  renderLossless();
  $('floorProse').innerHTML = floorProse({ src, floorBits: S.floorBits, lossless: S.lossless, run: e?.run, m, mode });
  $('sceneText').textContent = sceneAlt(e, m, mode);
}

function splitText(e, m) {
  const ps = priorSource(e.run.provenance?.model);
  return `Of the ${m.lex.N} scored source tokens, the rebuild kept ${V.pct(m.lex.fidelity)}: <b>${V.pct(m.split.prior)}</b> the model writes even from an empty capsule (its prior${ps ? `, ${ps}` : ', not measured for this model'}), ` +
    `<b>${V.pct(m.split.literal)}</b> sat in the capsule as written, and <b>${V.pct(m.split.decoder)}</b> the decoder restored from what the capsule implied.`;
}

function callsOf(run) {
  if (!run) return {};
  const pv = run.provenance || {};
  if (run.kind === 'recorded') {
    const c = S.calls[pv.compressCall], r = S.calls[pv.rebuildCall];
    const norm = (x) => x && { system: x.request.messages[0].content, user: x.request.messages[1].content, raw: x.raw, ms: x.ms,
      promptTokens: x.promptTokens, completionTokens: x.completionTokens, usage: null, cached: 'no' };
    return { compress: norm(c), rebuild: norm(r) };
  }
  return { compress: pv.compress, rebuild: pv.rebuild };
}

function sceneAlt(e, m, mode) {
  if (!e || !m) return 'The disk shows the source tokens by bits; no run is selected.';
  if (mode === 'none') return `The capsule glows at the core at rate ${m.rate.toFixed(2)}; its rebuild did not run.`;
  const lost = m.units.filter((u) => u.status === 'lost').map((u) => u.text).slice(0, 6).join(', ');
  return `Run ${e.run.id}: the capsule spends ${V.fmt(m.bits.cap.total)} of ${V.fmt(m.bits.src.total)} source bits (rate ${m.rate.toFixed(3)}). ` +
    `${m.lex.kept} of ${m.lex.N} source tokens came back; ${m.lex.dropped} drift out as motes. Lost facts: ${lost || 'none'}.`;
}

/* The scene object for one run: bands from the source bits and the kept flags, motes from the losses. */
function sceneFor(entry, hide) {
  let e = entry;
  const src = S.srcM;
  const toks = src.tokens, per = src.bits.per, B = 64;
  const sum = new Float64Array(B), cnt = new Float64Array(B), keep = new Float64Array(B);
  if (e && !onScreen(e)) e = null;
  const m = e && e.m && !hide && e.scoredAs !== 'none' ? e.m : null;
  const content = toks.map((t, i) => i).filter((i) => /\S/.test(toks[i].t));
  content.forEach((i, k) => {
    const b = Math.min(B - 1, Math.floor((k / Math.max(1, content.length)) * B));
    sum[b] += per[i]; cnt[b]++; keep[b] += m ? m.lex.keptSrc[i] : 1;
  });
  // each band averages the tokens within two bands either side (about 8% of the text), so a band is a stretch, not one token
  const bands = new Float32Array(B * 2);
  for (let b = 0; b < B; b++) {
    let s = 0, n = 0, kk = 0;
    for (let k = Math.max(0, b - 2); k <= Math.min(B - 1, b + 2); k++) { s += sum[k]; n += cnt[k]; kk += keep[k]; }
    bands[b * 2] = n ? Math.max(0, Math.min(1, (s / n - 4) / 36)) : 0;   // 4 bits per token -> dim, 40 -> bright
    bands[b * 2 + 1] = n ? kk / n : 1;
  }
  const lost = [];
  if (m) {
    const turns = M.parseTurns(e.run.source);
    const turnOf = (a) => turns.findIndex((t) => a >= t.a && a < t.b) + 1;
    for (const u of m.units) if (u.status === 'lost') lost.push({ text: u.text, unit: true, kind: u.kind === 'entity' ? 'name' : u.kind, i: u.spans[0][0], turn: turnOf(u.spans[0][0]), bits: 0 });
    for (const i of m.lex.scored) {
      if (m.lex.keptSrc[i] || !/[\p{L}\p{N}]/u.test(toks[i].t)) continue;
      lost.push({ text: toks[i].t.trim(), unit: false, i, turn: turnOf(toks[i].a), bits: per[i] });
      if (lost.length > 160) break;
    }
  }
  const pv = e?.run.provenance || {};
  return {
    bands, core: e && e.m && e.run.capsule ? Math.min(1, e.m.rate * 2) : 0, lost,
    stage: e ? stageNow : 1, waiting: e?.waiting || 0, window: C.PUBLIC_WINDOW_S,
    caption: e ? `${pv.model || ''} · L${e.run.level} · rate ${e.m ? e.m.rate.toFixed(2) : '-'} · lexical ${e.m && e.scoredAs !== 'none' ? V.pct(e.m.lex.fidelity) : '-'}` : '',
  };
}
let waitInfo = 0;
function pushScene(hide) {
  if (!scene || !S.srcM) return;
  const e = current();
  const a = sceneFor(e, hide);
  a.waiting = waitInfo;
  const views = [a];
  if (S.compare && S.cmp && S.cmp !== S.sel) {
    const c = S.runs.find((x) => x.run.id === S.cmp);
    if (c && onScreen(c)) { score(c); const b = sceneFor(c, false); b.stage = c.scoredAs === 'none' ? 2 : 3; views.push(b); }
  }
  scene.set(views);
}

/* ---------- the rate-distortion plots ---------- */
function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; }
function baselinesAt(level) {
  const runs = S.runs.filter((e) => e.run.level === level && e.m && e.run.capsule && e.run.kind !== 'engine');
  if (!runs.length || !S.srcM) return null;
  const B = median(runs.map((e) => e.m.bits.cap.total));
  const key = `${S.source.length}|${level}|${Math.round(B)}`;
  if (S.baseCache.has(key)) return S.baseCache.get(key);
  const src = S.srcM.tokens;
  const sc = (text) => M.scoreRun({ source: S.source, capsule: text, rebuild: text }, ctx, C.LIMITS);
  const head = M.headTruncation(src, B, tokenize), ext = M.extractive(src, S.srcM.bits.per, B, tokenize);
  const out = { B, head: { text: head, m: sc(head) }, ext: { text: ext, m: sc(ext) } };
  S.baseCache.set(key, out);
  return out;
}
const dOf = (m, d) => (m ? m.distortion[d] : null);

function plotData() {
  const entries = S.runs.filter((e) => e.m && e.run.capsule && e.scoredAs !== 'none' && !S.hideModels.has(e.run.provenance?.model));
  const points = entries.map((e) => ({ id: e.run.id, x: e.m.rate, y: dOf(e.m, S.dist), kind: e.run.kind, model: e.run.provenance?.model, level: e.run.level }));
  const models = [...new Set(entries.filter((e) => e.run.kind === 'recorded').map((e) => e.run.provenance.model))];
  const series = models.map((model, k) => {
    const levels = C.LEVELS.map((l) => {
      const rs = entries.filter((e) => e.run.provenance.model === model && e.run.level === l.id && e.run.kind === 'recorded');
      const ys = rs.map((e) => dOf(e.m, S.dist)).filter((y) => y != null);
      if (!rs.length || !ys.length) return { level: l.id, x: 0, y: null };
      return { level: l.id, x: rs.reduce((a, e) => a + e.m.rate, 0) / rs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length, ymin: Math.min(...ys), ymax: Math.max(...ys) };
    });
    return { model, shape: SHAPES[k % SHAPES.length], dash: DASHES[k % DASHES.length], levels };
  });
  const base = [{ name: 'head', pts: [] }, { name: 'extractive', pts: [] }];
  for (const l of C.LEVELS) {
    const b = baselinesAt(l.id);
    if (!b) continue;
    base[0].pts.push({ level: l.id, x: b.head.m.rate, y: dOf(b.head.m, S.dist) });
    base[1].pts.push({ level: l.id, x: b.ext.m.rate, y: dOf(b.ext.m, S.dist) });
  }
  const priors = [...S.models].filter(Boolean).map((model) => {
    const t = priorText(model);
    if (!t) return null;
    const m = M.scoreRun({ source: S.source, capsule: '', rebuild: t }, ctx, C.LIMITS);
    return { model, y: dOf(m, S.dist) };
  }).filter(Boolean);
  const floor = S.floorBits && S.srcM ? { x: S.floorBits / S.srcM.bits.total } : null;
  // when a meaning measure is on the y axis, the lexical mean curve stays as a faint reference, so the two can be compared
  const ghost = S.dist === 'lexical' ? null : C.LEVELS.map((l) => {
    const rs = entries.filter((e) => e.run.level === l.id && e.run.kind === 'recorded');
    return rs.length ? { x: rs.reduce((a, e) => a + e.m.rate, 0) / rs.length, y: rs.reduce((a, e) => a + e.m.distortion.lexical, 0) / rs.length } : null;
  }).filter(Boolean);
  return { points, series, base, priors, floor, ghost };
}

const DIST_LABEL = Object.fromEntries(M.DISTORTIONS.map((d) => [d.id, d.axis]));
$('dist').innerHTML = M.DISTORTIONS.map((d) => `<option value="${d.id}">${V.esc(d.label)}</option>`).join('');
let plotTimer = 0;
function renderPlots() {
  cancelAnimationFrame(plotTimer);
  plotTimer = requestAnimationFrame(() => {
    const data = plotData();
    const pick = (id, ev) => {
      if (S.compare && (ev.shiftKey || S.compare)) {
        if (id !== S.sel) { S.cmp = id; pushScene(); renderPlots(); renderRunTables(); saveURL(); return; }
      }
      select(id, { replay: true });
    };
    const W = Math.max(320, Math.round($('plot').parentElement.clientWidth || 760));
    renderPlot($('plot'), data, { W, H: Math.round(Math.min(460, Math.max(300, W * (W < 600 ? 0.8 : 0.42)))), sel: S.sel, cmp: S.compare ? S.cmp : null, onPick: pick, showBase: $('showBase').checked, showBand: $('showBand').checked, yLabel: DIST_LABEL[S.dist] });
    renderPlot($('miniPlot'), data, { W: 320, H: 170, mini: true, sel: S.sel, cmp: S.compare ? S.cmp : null, onPick: pick, showBase: true, showBand: true });
    const rows = C.LEVELS.map((l) => {
      const rs = S.runs.filter((e) => e.m && e.run.level === l.id && e.run.capsule && e.scoredAs === 'rebuild');
      const b = baselinesAt(l.id);
      const fid = rs.length ? rs.reduce((a, e) => a + (1 - dOf(e.m, S.dist) ?? 0), 0) / rs.length : null;
      const ys = rs.map((e) => 1 - dOf(e.m, S.dist));
      const head = b ? 1 - dOf(b.head.m, S.dist) : null, ext = b ? 1 - dOf(b.ext.m, S.dist) : null;
      const bestBase = head == null ? null : Math.max(head, ext);
      return { level: l.id, budget: C.budgetFor(C.wordCount(S.source.slice(0, C.LIMITS.sourceChars)), l.id), n: rs.length,
        rate: rs.length ? rs.reduce((a, e) => a + e.m.rate, 0) / rs.length : null, fid, spread: ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0,
        head, ext, gain: fid == null || bestBase == null ? null : fid - bestBase };
    });
    V.renderLevelsTable($('levelsTbl').tBodies[0], rows);
    const gains = rows.filter((r) => r.gain != null);
    $('plotNote').innerHTML = gains.length
      ? `Baselines share the plot at matched rate: for each level, <b>head cut</b> keeps the longest start of the source and <b>extractive</b> keeps its most expensive tokens, both inside the median capsule's bits, and both are scored as written with no decoder. ` +
        `On this conversation the model's capsule ${gains.every((r) => r.gain > 0) ? 'beats the best baseline at every level' : 'beats the best baseline at ' + gains.filter((r) => r.gain > 0).map((r) => 'L' + r.level).join(', ') + (gains.some((r) => r.gain <= 0) ? ' and loses at ' + gains.filter((r) => r.gain <= 0).map((r) => 'L' + r.level).join(', ') : '')} on ${V.esc(S.dist)} fidelity. The grey squares at rate 0 are each model's rebuild from an empty capsule. Click a point to load it${S.compare ? '; in compare mode a click sets the second horizon' : ''}.`
      : 'Run a sweep to draw the curve for this text.';
  });
}

function buildModelToggles() {
  const host = $('modelToggles');
  host.innerHTML = [...S.models].filter(Boolean).map((m) => `<label class="chk"><input type="checkbox" data-m="${V.esc(m)}" ${S.hideModels.has(m) ? '' : 'checked'}> ${V.esc(m)}</label>`).join('');
}
$('modelToggles').addEventListener('change', (e) => {
  const m = e.target.dataset.m; if (!m) return;
  if (e.target.checked) S.hideModels.delete(m); else S.hideModels.add(m);
  renderPlots();
});
$('dist').addEventListener('change', () => { S.dist = $('dist').value; renderPlots(); saveURL(); });
$('showBase').addEventListener('change', renderPlots);
$('showBand').addEventListener('change', renderPlots);
$('cmpBtn').addEventListener('click', () => {
  S.compare = !S.compare;
  $('cmpBtn').setAttribute('aria-pressed', String(S.compare));
  if (S.compare && !S.cmp) {
    const cur = current()?.run;
    const other = S.runs.find((e) => cur && e.run.provenance?.model === cur.provenance?.model && e.run.provenance?.repeat === cur.provenance?.repeat && e.run.level === (cur.level === 5 ? 1 : 5));
    S.cmp = other?.run.id || null;
  }
  if (!S.compare) S.cmp = null;
  pushScene(); renderPlots(); renderRunTables(); saveURL();
});

function renderRunTables() {
  for (const e of S.runs) if (e.m && !e.scoredAs) e.scoredAs = scoredAs(e.run);
  V.renderRunsTable($('runsTbl').tBodies[0], S.runs.filter((e) => e.m), S.sel, S.compare ? S.cmp : null);
  const rec = S.runs.filter((e) => e.run.kind === 'recorded').length, live = S.runs.length - rec;
  $('runsHint').textContent = `${rec} recorded, ${live} from this session`;
}
$('runsTbl').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-run]'); if (tr) select(tr.dataset.run, { replay: true }); });

/* ---------- pins ---------- */
$('heat').addEventListener('click', (e) => {
  const n = e.target.closest('[data-i]'); if (!n) return;
  const i = Number(n.dataset.i);
  if (S.pins.has(i)) S.pins.delete(i); else S.pins.add(i);
  n.classList.toggle('pin');
  renderPins();
});
function renderPins() {
  if (!S.pins.size || !S.srcM) { $('pins').innerHTML = S.srcM ? 'Click a source token to pin it; each run then reports whether it came back, and each sweep the level where it died.' : ''; return; }
  const out = [];
  for (const i of S.pins) {
    const tok = S.srcM.tokens[i]?.t.trim();
    const scored = S.runs.filter((e) => e.m && e.scoredAs === 'rebuild');
    const kept = scored.filter((e) => e.m.lex.keptSrc[i]).length;
    // per sweep (one model, one repeat, five levels): the first level where it is not kept
    const sweeps = new Map();
    for (const e of scored) {
      const k = `${e.run.provenance?.model}|${e.run.provenance?.repeat}|${e.run.kind}`;
      if (!sweeps.has(k)) sweeps.set(k, []);
      sweeps.get(k).push(e);
    }
    const deaths = [];
    for (const [k, rs] of sweeps) {
      if (rs.length < 2) continue;
      rs.sort((a, b) => a.run.level - b.run.level);
      const d = rs.find((e) => !e.m.lex.keptSrc[i]);
      deaths.push(`${k.split('|')[0]} run ${k.split('|')[1]}: ${d ? 'dies at L' + d.run.level : 'survives L5'}`);
    }
    const cur = current();
    const now = cur?.m && cur.scoredAs === 'rebuild' ? (cur.m.lex.keptSrc[i] ? 'came back in this run' : 'lost in this run') : '';
    out.push(`<div><span class="pin-t">${V.esc(tok)}</span> · ${now} · kept in <b>${kept} of ${scored.length}</b> runs${deaths.length ? ' · ' + V.esc(deaths.slice(0, 6).join('; ')) : ''}</div>`);
  }
  $('pins').innerHTML = out.join('');
}

/* ---------- linked hover across strip, heat and diff ---------- */
V.linkHover([$('strip'), $('heat'), $('diff'), $('capText')]);
$('units').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-u]'); if (!tr) return;
  const cur = current(); if (!cur?.m) return;
  const u = cur.m.units[Number(tr.dataset.u)];
  for (const n of document.querySelectorAll('.find')) n.classList.remove('find');
  for (const r of $('units').querySelectorAll('tr.sel')) r.classList.remove('sel');
  tr.classList.add('sel');
  const src = cur.m.tokens.src, rec = cur.m.tokens.rec;
  const hit = (t, spans) => spans.some(([a, b]) => t.a < b && t.b > a);
  let first = null;
  src.forEach((t, i) => { if (hit(t, u.spans)) for (const n of document.querySelectorAll(`#heat [data-i="${i}"], #diff .drop[data-i="${i}"]`)) { n.classList.add('find'); first ||= n; } });
  rec.forEach((t, j) => { if (hit(t, u.recSpans)) for (const n of document.querySelectorAll(`#diff [data-j="${j}"]`)) n.classList.add('find'); });
  first?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
});
$('turns').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-a]'); if (!tr) return;
  const a = Number(tr.dataset.a), b = Number(tr.dataset.b);
  for (const n of document.querySelectorAll('.find')) n.classList.remove('find');
  const cur = current(); if (!cur?.m) return;
  cur.m.tokens.src.forEach((t, i) => { if (t.a >= a && t.a < b) for (const n of document.querySelectorAll(`#heat [data-i="${i}"], #diff [data-i="${i}"]`)) n.classList.add('find'); });
  document.querySelector('#heat .find')?.scrollIntoView({ block: 'nearest' });
});

/* Table rows open with Enter or Space as well as a click. */
for (const id of ['units', 'turns', 'runsTbl']) {
  $(id).addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[tabindex]')) { e.preventDefault(); e.target.click(); }
  });
}
/* The source ledger: Tab reaches it, arrow keys walk the tokens, Enter pins the focused one. */
$('heat').tabIndex = 0;
$('heat').setAttribute('aria-label', 'source tokens shaded by bits; arrow keys move, Enter pins');
$('heat').addEventListener('keydown', (e) => {
  const cells = [...$('heat').querySelectorAll('[data-i]')];
  if (!cells.length) return;
  let k = cells.indexOf(document.activeElement);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    k = Math.max(0, Math.min(cells.length - 1, k + (e.key === 'ArrowRight' ? 1 : -1)));
    cells[k].focus();
  } else if (e.key === 'Enter' && k >= 0) { e.preventDefault(); cells[k].click(); }
});

/* ---------- definitions in place ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('.def');
  const box = $('defbox');
  if (!b) { if (!e.target.closest('#defbox')) { box.hidden = true; document.querySelectorAll('.def[aria-expanded="true"]').forEach((x) => x.setAttribute('aria-expanded', 'false')); } return; }
  const open = b.getAttribute('aria-expanded') === 'true';
  document.querySelectorAll('.def').forEach((x) => x.setAttribute('aria-expanded', 'false'));
  if (open) { box.hidden = true; return; }
  b.setAttribute('aria-expanded', 'true');
  box.hidden = false;
  box.innerHTML = DEFS[b.dataset.def] || '';
});
for (const b of document.querySelectorAll('.def')) b.addEventListener('mouseenter', () => { if (matchMedia('(hover:hover)').matches) { $('defbox').hidden = false; $('defbox').innerHTML = DEFS[b.dataset.def] || ''; } });

/* ---------- lossless baselines (worker) ---------- */
let worker = null, wid = 0;
const pending = new Map();
function startWorker() {
  try {
    worker = new Worker(new URL('./lossless.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    call('init', { base: new URL(DATA, location.href).href }).then((r) => { S.ref = r.ok ? r.ref : { err: r.error }; renderLossless(); requestLossless(); });
  } catch (e) { S.ref = { err: String(e.message || e) }; }
}
function call(op, data) { return new Promise((res) => { const id = ++wid; pending.set(id, res); worker.postMessage({ id, op, ...data }); }); }
let lossTimer = 0;
function requestLossless() {
  if (!worker || !S.ref || S.ref.err) return;
  clearTimeout(lossTimer);
  const text = S.source;
  lossTimer = setTimeout(async () => {
    const r = await call('measure', { text });
    if (r.ok && S.source === text) { S.lossless = r.out; renderLossless(); $('floorProse').innerHTML = floorProse({ src: S.srcM, floorBits: S.floorBits, lossless: S.lossless, run: current()?.run, m: current()?.m, mode: current()?.scoredAs }); }
  }, C.TIMERS.losslessDebounce);
}
let refFile = null;
fetch(DATA + 'reference.json').then((r) => r.json()).then((j) => { refFile = j; renderLossless(); }).catch(() => {});
function renderLossless() {
  const src = S.srcM; if (!src) return;
  const n = [...S.source].length || 1;
  const L = S.lossless;
  const e = current();
  const rows = [
    { name: 'zeroth order', method: 'GPT-2 tokens, -log2(c/n) summed; no vocabulary cost (a lower bound, not a code)', bits: src.bits.data },
    { name: 'two-part code', method: 'the page\'s accounting: zeroth order plus the spelled vocabulary', bits: src.bits.total },
    { name: 'PPM-C order 4', method: 'context model over bytes, primed on alice29.txt, adaptive on this text', bits: L?.ppmBits ?? null, pending: !L },
    { name: 'DEFLATE', method: 'CompressionStream deflate-raw (RFC 1951), level 6', bits: S.floorBits },
    { name: 'Brotli q11', method: 'brotli-wasm 3.0.1 (RFC 7932), window 22', bits: L?.brotliBits ?? null, pending: !L && !(S.ref?.brotliErr) },
  ];
  if (e?.run.capsule && e.m) rows.push({ name: 'the capsule', method: `two-part code of the ${e.run.kind} capsule (lossy), over the source's characters`, bits: e.m.bits.cap.total });
  for (const r of rows) r.bpc = r.bits == null ? null : r.bits / n;
  V.renderBpc($('bpcTbl').tBodies[0], rows);
  if (refFile) {
    const R = S.ref || {};
    const t = (id) => refFile.tools.find((x) => x.id === id);
    V.renderRef($('refTbl').tBodies[0], [
      { name: 'DEFLATE level 6', page: R.deflateBytes ?? null, ref: t('deflate').bytes, n: refFile.bytes, cmd: `${t('deflate').command} - 18 B (${t('deflate').version})`, err: R.err },
      { name: 'Brotli q11 w22', page: R.brotliBytes ?? null, ref: t('brotli').bytes, n: refFile.bytes, cmd: `${t('brotli').command} (${t('brotli').version})`, err: R.brotliErr || R.err },
    ]);
    $('refNote').innerHTML = R.ppmBits ? `PPM-C order 4 on the same file: <b>${(R.ppmBits / R.bytes).toFixed(3)}</b> bits per character, primed in ${R.primeMs.toFixed(0)} ms (no command-line reference; Cleary and Witten 1984, Moffat 1990). Reference figures recorded on ${refFile.date}; the file, its hash and the commands are in labs/assets/data/dataspace/reference.json.` : '';
  }
}

/* ---------- the run flow ---------- */
const engine = {
  capsule(source, words) {
    const toks = tokenize(source); const b = M.twoPartBits(toks);
    const facts = M.extractNumbers(source).concat(M.extractEntities(source, isCommon)).map((u) => [u.a, u.b]);
    return M.extractiveWords(toks, b.per, words, facts);
  },
};
const flow = new RunFlow({
  llm: LLM, engine,
  onState: (st, d) => onFlowState(st, d),
  onRun: (run) => onLiveRun(run),
  onCapsule: (run) => onCapsule(run),
});
function onFlowState(st, d) {
  const el = $('status');
  const running = flow.busy();
  el.className = 'status' + (running ? ' running' : '');
  $('go').disabled = running; $('sweep').disabled = running; $('rebuildBtn').disabled = running; $('priorBtn').disabled = running;
  $('cancel').hidden = !running;
  const route = LLM.status();
  const rep = d.repeats > 1 ? ` · run ${d.rep} of ${d.repeats}` : '';
  let msg = '';
  waitInfo = 0;
  if (st === 'compressing') { msg = `<span class="st">compressing</span> · one call writes ${d.levels.length} capsule${d.levels.length > 1 ? 's' : ''} from the source${rep}`; stage(1); }
  else if (st === 'waiting') { waitInfo = d.readyIn; msg = `<span class="st">waiting</span> · the public route answers once per ${d.window} s per IP · next call (${d.next}${d.level ? ' L' + d.level : ''}) in <span class="count">${d.readyIn} s</span>${rep}`; pushScene(); }
  else if (st === 'reconstructing') msg = d.prior ? '<span class="st">rebuilding</span> from an empty capsule: the prior' : `<span class="st">rebuilding</span> L${d.level} from the capsule alone${rep}`;
  else if (st === 'scored') msg = `<span class="st">scored</span> L${current()?.run.level ?? ''}${rep}`;
  else if (st === 'failed') msg = `<span class="st">failed</span> · ${V.esc(d.reason || '')}`;
  else msg = d.cancelled ? '<span class="st">cancelled</span>' : still ? '<span class="st">ready</span> · still frame, no route probed'
    : `<span class="st">ready</span> · the next call goes to ${V.esc((route.label || '').replace(/^model: /, '').replace(/ · ready$/, ''))}`;
  el.innerHTML = msg;
}
function onCapsule(run) {
  const entry = { run, m: null };
  addLive(entry);
  S.sel = run.id;
  stage(2);
  renderCurrent({ hideRebuild: true });
}
function addLive(entry) {
  if (!S.liveRuns.includes(entry)) S.liveRuns.push(entry);
  if (entry.run.source === S.source.slice(0, C.LIMITS.sourceChars) && !S.runs.includes(entry)) S.runs.push(entry);
  S.models = new Set(S.runs.map((e) => e.run.provenance?.model)); buildModelToggles();
}
function onLiveRun(run) {
  let entry = S.liveRuns.find((e) => e.run === run);
  if (!entry) { entry = { run, m: null }; addLive(entry); }
  entry.m = null;
  S.sel = run.id;
  score(entry);
  stage(entry.scoredAs === 'none' ? 2 : 3);
  renderCurrent();
  saveURL();
  announce(entry);
}
function announce(e) {
  const m = e.m;
  const pv = e.run.provenance;
  const live = e.run.kind === 'live' ? `<span class="live">live</span> ${V.esc(pv.model)} via ${V.esc(pv.route)}` : 'offline engine';
  $('status').innerHTML = `<span class="st">scored</span> · ${live} · L${e.run.level} · rate ${m.rate.toFixed(3)}` +
    (e.scoredAs === 'none' ? ' · rebuild did not run' : ` · lexical ${V.pct(m.lex.fidelity)} · numbers ${m.summary.numbers.survived}/${m.summary.numbers.total} · names ${m.summary.entities.survived}/${m.summary.entities.total}`);
}
$('go').addEventListener('click', () => flow.collapse({ source: S.source, levels: [S.level], repeats: S.repeats, preset: S.preset }));
$('sweep').addEventListener('click', () => flow.collapse({ source: S.source, levels: C.LEVELS.map((l) => l.id), repeats: S.repeats, preset: S.preset }));
$('cancel').addEventListener('click', () => flow.cancel());
$('repeats').addEventListener('change', () => { S.repeats = Number($('repeats').value); });
$('rebuildBtn').addEventListener('click', () => {
  const cur = current()?.run;
  const cap = $('capEdit').value.trim(); if (!cap) return;
  flow.rebuildOnly({ source: S.source.slice(0, C.LIMITS.sourceChars), capsule: cap, level: cur?.level || S.level,
    budgetWords: cur?.budgetWords || C.budgetFor(C.wordCount(S.source), S.level), preset: S.preset, parent: cur?.id || null });
});
$('priorBtn').addEventListener('click', async () => {
  $('priorHint').textContent = 'one call, empty capsule';
  const p = await flow.prior();
  if (!p) { $('priorHint').textContent = 'no route answered; the recorded prior stays in use'; return; }
  S.priors[p.model] = p;
  for (const e of S.runs) if (e.run.provenance?.model === p.model) e.m = null;
  $('priorHint').textContent = `measured for ${p.model} via ${p.route}`;
  scoreAllSoon(); renderCurrent();
});
if (!still) LLM.onStatus(() => { if (!flow.busy()) onFlowState('idle', {}); });

/* ---------- exports and import ---------- */
function download(name, type, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, C.TIMERS.revokeUrl);
  $('exNote').textContent = `saved ${name}`;
}
const runExport = (e) => {
  const r = e.run;
  const calls = r.kind === 'recorded' ? { compress: S.calls[r.provenance.compressCall], rebuild: S.calls[r.provenance.rebuildCall] } : undefined;
  return { schema: C.LAB.runSchema, id: r.id, kind: r.kind, preset: r.preset ?? S.preset, source: r.source, level: r.level, budgetWords: r.budgetWords,
    capsule: r.capsule, rebuild: r.rebuild, status: r.status, note: r.note, provenance: r.provenance, calls,
    measures: e.m ? M.snapshot(e.m) : null };
};
$('exRun').addEventListener('click', () => { const e = current(); if (e) download(`dataspace-${e.run.id}.json`, 'application/json', JSON.stringify(runExport(e), null, 1)); });
$('exAll').addEventListener('click', () => download(`dataspace-${S.preset || 'own'}-runs.json`, 'application/json',
  JSON.stringify({ schema: C.LAB.runSchema, exported: new Date().toISOString(), runs: S.runs.filter((e) => e.m).map(runExport) }, null, 1)));
$('exPlot').addEventListener('click', () => {
  const svg = $('plot').cloneNode(true);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } })
    .filter((t) => /^\.(ax|grid|axt|axl|pt|ln-|band|plab)/.test(t));
  const root = getComputedStyle(document.documentElement);
  const vars = ['--line', '--line-bright', '--text-dim', '--text', '--text-bright', '--horizon', '--horizon-dim', '--accretion', '--accretion-soft', '--surface', '--void', '--font-mono', '--heat']
    .map((v) => `${v}:${root.getPropertyValue(v)}`).join(';');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `svg{${vars};background:${root.getPropertyValue('--surface')}}` + css.join('\n');
  svg.prepend(style);
  download(`dataspace-rd-${S.dist}.svg`, 'image/svg+xml', new XMLSerializer().serializeToString(svg));
});
const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
$('exUnits').addEventListener('click', () => {
  const e = current(); if (!e?.m) return;
  download(`dataspace-${e.run.id}-survival.csv`, 'text/csv', csv([['kind', 'rule', 'source text', 'occurrences', 'status', 'rebuild text']].concat(
    e.m.units.map((u) => [u.kind, u.rule || '', u.text, u.spans.length, u.status, u.recSpans.length ? (e.run.rebuild || e.run.capsule).slice(u.recSpans[0][0], u.recSpans[0][1]) : '']))));
});
$('exRuns').addEventListener('click', () => download(`dataspace-${S.preset || 'own'}-runs.csv`, 'text/csv', csv([['run', 'kind', 'model', 'level', 'budget words', 'capsule words', 'source bits', 'capsule bits', 'rate', 'lexical', 'numbers survived', 'numbers total', 'names survived', 'names total', ...M.DISTORTIONS.map((d) => 'distortion ' + d.id)]].concat(
  S.runs.filter((e) => e.m).map((e) => [e.run.id, e.run.kind, e.run.provenance?.model, e.run.level, e.run.budgetWords, C.wordCount(e.run.capsule || ''), e.m.bits.src.total.toFixed(2), e.m.bits.cap.total.toFixed(2), e.m.rate.toFixed(6), e.scoredAs === 'none' ? '' : e.m.lex.fidelity.toFixed(6), e.m.summary.numbers.survived, e.m.summary.numbers.total, e.m.summary.entities.survived, e.m.summary.entities.total,
    ...M.DISTORTIONS.map((d) => (e.scoredAs === 'none' || e.m.distortion[d.id] == null ? '' : e.m.distortion[d.id].toFixed(6)))])))));
$('imRun').addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    const list = j.runs || [j];
    let ok = 0, same = 0;
    for (const r of list) {
      if (r.schema && r.schema !== C.LAB.runSchema && j.schema !== C.LAB.runSchema) continue;
      // an imported run keeps its own kind and provenance; its id gains a suffix so it never collides with a bundled run
      const c = cleanRun(r);                  // a file a visitor was handed is no more trusted than a link
      if (!c) continue;
      const run = { ...c, id: c.id + '.imported', note: ((c.note || '') + ' Loaded from a run file.').trim() };
      const entry = { run, m: null };
      score(entry);
      if (r.measures) same += JSON.stringify(M.snapshot(entry.m)) === JSON.stringify(r.measures) ? 1 : 0;
      S.liveRuns.push(entry);
      if (run.source === S.source || !run.source) { run.source ||= S.source; S.runs.push(entry); }
      ok++;
    }
    $('exNote').textContent = `loaded ${ok} run${ok === 1 ? '' : 's'}; ${same} reproduce the stored measures exactly`;
    if (ok && list[0].preset && list[0].preset !== S.preset && C.PRESETS.some((p) => p.id === list[0].preset)) {
      await loadPreset(list[0].preset, { noReplay: true });
      for (const e of S.liveRuns.slice(-ok)) if (!S.runs.includes(e) && e.run.source === S.source) S.runs.push(e);
    }
    scoreAllSoon(); renderCurrent();
  } catch (err) { console.error(err); $('exNote').textContent = 'not a DATASPACE run file: ' + err.message; }
  ev.target.value = '';
});
$('exLink').addEventListener('click', async () => {
  clearTimeout(urlTimer); saveURL();
  await new Promise((r) => setTimeout(r, C.TIMERS.linkSettle));
  try { await navigator.clipboard.writeText(location.href); $('exNote').textContent = 'link copied: preset or text, strength, selected run and compare state'; }
  catch { $('exNote').textContent = 'copy this address: ' + location.href; }
});

/* ---------- copy, tour, findings ---------- */
function renderCopy() {
  $('concepts').innerHTML = concepts();
  $('metaTbl').tBodies[0].innerHTML = metaphorRows().map((r) => `<tr><td>${V.esc(r[0])}</td><td>${V.esc(r[1])}</td><td>${V.esc(r[2])}</td></tr>`).join('');
  $('methods').innerHTML = methods(C.CITATIONS);
}
$('concepts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-try]'); if (!b) return;
  const t = b.dataset.try;
  if (t === 'bit') { const n = document.querySelector('#heat [data-i]'); n?.scrollIntoView({ block: 'center' }); n?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }
  else if (t === 'brutal') setLevel(5, true);
  else if (t === 'gentle') setLevel(1, true);
  else if (t === 'edit') { $('capEdit').focus(); $('capEdit').scrollIntoView({ block: 'center' }); }
  else if (t === 'floor') $('floor').scrollIntoView({ block: 'start' });
  else if (t === 'rd') { S.dist = 'meaning'; $('dist').value = 'meaning'; renderPlots(); $('rd').scrollIntoView({ block: 'start' }); }
  else if (t === 'short') { S.preset = null; markPreset(); setSourceText('USER: hi\nASSISTANT: hello'); adoptRunsForSource(); }
});
let tourAt = -1;
function tourShow(k) {
  document.querySelectorAll('.tour-focus').forEach((n) => n.classList.remove('tour-focus'));
  const steps = tourSteps({ e: current(), src: S.srcM, floorBits: S.floorBits });
  if (k < 0 || k >= steps.length) { $('tour').hidden = true; tourAt = -1; return; }
  tourAt = k;
  const s = steps[k];
  $('tour').hidden = false;
  $('tourN').textContent = `step ${k + 1} of ${steps.length}`;
  $('tourT').textContent = s.title;
  $('tourB').innerHTML = s.body;
  const tgt = document.querySelector(s.target);
  tgt?.classList.add('tour-focus');
  tgt?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  $('tourNext').textContent = k === steps.length - 1 ? 'done' : 'next';
  $('tourPrev').disabled = k === 0;
}
$('tourBtn').addEventListener('click', () => tourShow(0));
$('tourNext').addEventListener('click', () => tourShow(tourAt + 1));
$('tourPrev').addEventListener('click', () => tourShow(tourAt - 1));
$('tourClose').addEventListener('click', () => tourShow(-1));
$('cardBtn').addEventListener('click', () => {
  const card = $('findCard');
  const f = findings({ runs: S.runs.filter((e) => e.m && e.scoredAs === 'rebuild'), preset: S.preset, levels: C.LEVELS });
  card.hidden = false;
  card.innerHTML = f.html + '<div class="actions"><button class="ghost sm" id="cardCopy" type="button">copy as text</button><button class="ghost sm" id="cardSave" type="button">save as .txt</button></div>';
  $('cardCopy').onclick = async () => { try { await navigator.clipboard.writeText(f.text); $('cardCopy').textContent = 'copied'; } catch { $('cardCopy').textContent = 'copy blocked'; } };
  $('cardSave').onclick = () => download(`dataspace-finding-${S.preset || 'own'}.txt`, 'text/plain', f.text);
});

/* ---------- boot ---------- */
async function boot() {
  buildControls();
  renderCopy();
  const q = new URLSearchParams(location.hash.slice(1));
  // the link may name a distortion: only one of the page's own ids is taken, since the id is printed in the plot's note
  if (M.DISTORTIONS.some((x) => x.id === q.get('d'))) { S.dist = q.get('d'); $('dist').value = S.dist; }
  const lv = Number(q.get('s')); setLevel(lv >= 1 && lv <= 5 ? lv : C.DEFAULT_LEVEL, false);
  let own = null, liveSel = null;
  if (q.get('t')) { try { own = await unpack(q.get('t')); } catch { own = null; } }
  // a run packed into the link is written by whoever made the link: it is cleaned before anything reads it
  if (q.get('x')) { try { liveSel = cleanRun(JSON.parse(await unpack(q.get('x')))); } catch { liveSel = null; } }
  const presetId = C.PRESETS.some((p) => p.id === q.get('p')) ? q.get('p') : C.DEFAULT_PRESET;
  // the source and its bits print first, from the pre-tokenizer, before any fetch or shader
  setSourceText(own ?? C.PRESETS.find((p) => p.id === presetId).text);
  requestAnimationFrame(() => setTimeout(startScene, 0));
  // every file the first run needs is requested at once: merges, priors and the preset's recorded runs
  if (own == null) { loadRunFile(presetId); $('runHead').textContent = 'loading the recorded runs'; }
  // the default run shows as soon as the priors and its run file arrive; the GPT-2 merges (456 KB) re-score it when they land
  const bpeReady = loadBPE();
  await loadPriors();
  startWorker();
  if (own != null) {
    S.preset = null; markPreset();
    if (liveSel) { const entry = { run: { ...liveSel, source: S.source.slice(0, C.LIMITS.sourceChars) }, m: null }; S.liveRuns.push(entry); }
    adoptRunsForSource();
    if (liveSel) await select(S.runs[S.runs.length - 1].run.id, { replay: !still });
  } else {
    if (liveSel) S.liveRuns.push({ run: { ...liveSel, source: C.PRESETS.find((p) => p.id === presetId).text }, m: null });
    await loadPreset(presetId, { run: liveSel ? liveSel.id : q.get('r'), cmp: q.get('c'), noReplay: still });
  }
  await bpeReady;
  onFlowState('idle', {});
}
boot();
addEventListener('resize', () => renderPlots());
