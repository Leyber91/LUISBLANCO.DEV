/* ============================================================
   token-ekg/main.js — wiring: state, the loop, the URL.

   Three instruments on one page.
     01 cadence  a token stream timed chunk by chunk: live from the
                 visitor's own Ollama (or any OpenAI-compatible endpoint
                 they hold a key for), or recordings made on 2026-11-11
                 replayed at recorded speed; plus one reply timed
                 through the site's shared route (llm.js).
     02 runs     a dataset of 60 recorded runs over six models.
     03 cost     four real tokenizers on the visitor's text and on 23
                 translations of one sentence.
   Measurement lives in engine/ (no DOM); drawing in view/; this file
   only connects them. Every number shown is computed from a
   measurement or read from a cited file.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import { OLLAMA, PROMPTS, LIVE_PRESETS, SWEEP, PARALLEL, TOKENIZERS, ANALYSIS, longContext } from './config.js';
import { analyze, fmtMs, quantile, mannWhitney, ks2, events } from './engine/stats.js';
import * as Ollama from '../ai/stream/ollama.js';
import { streamingRoutes } from '../ai/stream/index.js';
import * as Shelf from './engine/traces.js';
import { validateTrace } from './engine/schema.js';
import { headline, provenance, TOUR } from './engine/narrate.js';
import { Strip, lowerBound } from './view/strip.js';
import { drawTachogram, drawHistogram, drawPoincare, drawPeriodogram } from './view/plots.js';
import { TokenBench } from './view/tokens-view.js';
import { loadTokenizer } from './engine/tokens.js';
import { renderDataset } from './view/dataset.js';
import { cardSVG, toCSV } from './view/export.js';

const $ = (id) => document.getElementById(id);
const HERE = new URL('./', import.meta.url);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const still = params.has('still');
const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const HOLD_MS = 1600;
const TOUR_MIN_MS = 6500;
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '-');

if (window.self !== window.top) $('back').hidden = true;
mountRoutePanel($('route'));

/* ---------------- state ---------------- */
const S = {
  recordings: [], runs: [], saved: [], extra: [],
  A: null, B: null, aFull: null, aNow: null, bFull: null,
  tau: 0, playing: !reduce && !still, speed: 1, divAuto: true, div: SWEEP.initial,
  tour: { on: false, i: 0, since: 0 },
  live: null, lastN: -1, lastPlot: 0, visible: true, filter: 'all', hover: -1,
  evIndex: -1, frames: [], lastSR: 0,
};

const strip = new Strip($('strip'), $('overview'), {
  onSeek: (t) => { S.tau = t; S.lastN = -1; stopTour(); },
  onHover: (i) => { S.hover = i; showTip(i); S.lastPlot = 0; drawPlots(true); },
});

/* ---------------- shelf ---------------- */
const all = () => [...S.extra, ...S.saved, ...S.recordings, ...S.runs];
const byId = (id) => all().find((t) => t.id === id) || null;
const FILTERS = [['all', 'all'], ['recording', 'recordings'], ['dataset', 'runs'], ['mine', 'yours']];

function renderFilter() {
  $('filt').innerHTML = FILTERS.map(([k, l]) => `<button type="button" role="radio" data-f="${k}" aria-checked="${S.filter === k}">${l}</button>`).join('');
}
$('filt').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  S.filter = b.dataset.f;
  renderFilter();
  renderShelf();
});

function inFilter(t) {
  if (S.filter === 'all') return t.group !== 'dataset' || t === S.A || t === S.B;
  if (S.filter === 'recording') return t.origin === 'recording' && t.group !== 'dataset';
  if (S.filter === 'dataset') return t.group === 'dataset';
  return t.origin !== 'recording';
}

function renderShelf() {
  const rows = all().filter(inFilter).map((t) => {
    const a = t === S.A ? S.aFull : analyze(t);
    const p = provenance(t);
    const stat = t.kind === 'oneshot' ? `${fmtMs(t.tDone)} wait` : `${fmtMs(a.ttft)} first · ${fmt(a.rate, 1)} tok/s · ${fmt(a.n)}`;
    return `<div class="tr" role="listitem" data-id="${esc(t.id)}" data-a="${t === S.A ? 1 : 0}" data-b="${t === S.B ? 1 : 0}">
      <div class="nm"><button type="button" data-act="play" aria-label="Play ${esc(t.label)}">${esc(t.label)}</button>
        <small><span class="org">${p.what}</span>${esc(p.when)} · ${esc(p.where)}</small></div>
      <span class="st">${stat}</span>
      <button type="button" class="tb pin" data-act="pin" aria-pressed="${t === S.B}" aria-label="Pin ${esc(t.label)} as B">B</button>
    </div>`;
  });
  $('shelf').innerHTML = rows.join('') || '<p class="hint">nothing here yet</p>';
}

$('shelf').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const t = byId(b.closest('.tr').dataset.id);
  if (!t) return;
  if (b.dataset.act === 'play') { stopTour(); setA(t, { play: true, user: true }); }
  if (b.dataset.act === 'pin') setB(S.B === t ? null : t);
});

function setB(t) {
  S.B = t;
  S.bFull = t ? analyze(t) : null;
  strip.setB(t);
  renderShelf();
  renderCompare();
  S.lastPlot = 0;
  drawPlots(true);
  syncURL();
}

/* ---------------- the trace playing ---------------- */
function isLiveTrace(t) { return !!(S.live && S.live.trace === t); }
/** A live run that ended (stopped, failed, or closed empty) before its first chunk arrived. */
function endedEmpty(t) { return !!(t && t.kind !== 'oneshot' && !t.chunks.length && (t.stopped || t.failed) && !isLiveTrace(t)); }

function setA(t, { play = true, at = 0, user = false } = {}) {
  S.A = t;
  S.aFull = analyze(t);
  strip.live = isLiveTrace(t);
  if (S.divAuto) S.div = strip.live ? SWEEP.initial : strip.autoDiv(t, S.aFull);
  strip.setDiv(S.div);
  strip.setTrace(t, S.aFull);
  S.tau = at === 'end' ? strip.end() : at;
  S.lastN = -1;
  S._checked = false;
  S.evIndex = -1;
  S.hover = -1;
  showTip(-1);
  S.playing = play;
  renderDivs();
  renderSource();
  renderShelf();
  renderCheck();
  renderStats();
  renderCompare();
  renderNarr();
  $('note').textContent = t.note || '';
  $('strip').setAttribute('aria-label', `Token arrival trace: ${t.label}. ${headline(t, S.aFull)}`);
  $('ticker').classList.toggle('live', strip.live);
  updatePlayBtn();
  renderDatasetSel();
  if (user) wantTokenizers(t);
  tick(true);
  syncURL();
}

/* ---------------- tokenizers, on demand ----------------
   None loads with the page. All four load when the cost section comes near the screen; the
   cadence section's tokenizer rows load just the one they need when the visitor picks a trace
   that uses it (o200k for a one-piece reply, the model's own vocabulary for Qwen3 or Mistral). */
const TK = {};
async function ensureTokenizer(id) {
  if (TK[id]) return TK[id];
  try { TK[id] = await loadTokenizer(id, HERE); } catch { return null; }
  if (S.A) { renderCheck(); renderStats(); renderReadouts(); }
  return TK[id];
}
function wantTokenizers(t) {
  if (!t) return;
  if (t.kind === 'oneshot') ensureTokenizer('o200k_base');
  const mt = matchingTokenizer(t.model);
  if (mt) ensureTokenizer(mt.id);
}

function renderNarr() {
  const t = S.A;
  const live = isLiveTrace(t);
  const tag = S.tour.on ? `<span class="tag">tour ${S.tour.i + 1} / ${tourList().length}</span>` : live ? '<span class="tag live">live</span>' : '';
  const warn = S.aFull.invalid ? ` Not measured as generation: ${S.aFull.invalid}; no decode rate is given.` : S.aFull.buffered ? ' Most chunks arrived together: this stream was buffered on the way, so its intervals time the transport, not the model.' : '';
  const notice = t.notice ? ` The reply was a notice, not model output: "${t.notice}".` : '';
  $('narr').innerHTML = tag + esc(headline(t, S.aFull) + warn + notice);
}

function renderSource() {
  const t = S.A;
  const p = provenance(t);
  const live = isLiveTrace(t);
  const a = S.aFull;
  // gold ("live") only while the stream is being measured; a run that ended early is never gold
  $('badge').dataset.k = live ? 'live' : (t.failed || t.stopped) ? 'ended' : a.invalid ? 'buffered' : a.buffered ? 'buffered' : t.origin;
  $('badge-what').textContent = live ? 'live stream' : a.oneBurst ? 'invalid: one burst' : a.cached ? 'cached' : t.failed ? 'failed' : t.stopped ? 'stopped' : a.buffered ? 'buffered stream' : t.kind === 'oneshot' ? `${p.what} · one reply` : p.what;
  const place = t.placement && t.placement.size ? ` · ${(t.placement.sizeVram / 1e9).toFixed(1)} of ${(t.placement.size / 1e9).toFixed(1)} GB on GPU` : '';
  const opts = t.options && t.options.num_ctx ? ` · num_ctx ${fmt(t.options.num_ctx)}` : '';
  const pt = promptTokens(t);
  const ptxt = Number.isFinite(pt) ? ` · prompt ${fmt(pt)} tokens` : ` · prompt ${fmt(t.promptChars)} chars`;
  $('src-line').innerHTML = `<b>${esc(t.model || '')}</b>${t.params ? ' ' + esc(t.params) : ''}${t.quant ? ' ' + esc(t.quant) : ''} · ${esc(p.where)}${opts}${place}${ptxt}<br>${esc(p.when)}${t.recorder ? ' · timed by ' + esc(t.recorder) : ''}`;
}

/** Prompt length in tokens: the server's count when it gave one, else the route's usage. */
function promptTokens(t) {
  if (t.final && Number.isFinite(t.final.prompt_eval_count)) return t.final.prompt_eval_count;
  if (t.usage && Number.isFinite(t.usage.prompt_tokens)) return t.usage.prompt_tokens;
  return NaN;
}

/* ---------------- transport ---------------- */
function renderDivs() {
  const opts = [...new Set([...SWEEP.presets, S.div])].sort((a, b) => a - b);
  $('divs').innerHTML = `<button type="button" role="radio" aria-checked="${S.divAuto}" data-d="auto">auto</button>` +
    opts.map((d) => `<button type="button" role="radio" aria-checked="${!S.divAuto && d === S.div}" data-d="${d}">${d < 1000 ? d + ' ms' : d / 1000 + ' s'}</button>`).join('');
  $('strip-cap').textContent = `${S.div < 1000 ? S.div + ' ms' : S.div / 1000 + ' s'} / division · height: the wait, log ms`;
}
$('divs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.d === 'auto') { S.divAuto = true; S.div = strip.autoDiv(S.A, S.aFull); }
  else { S.divAuto = false; S.div = Number(b.dataset.d); }
  strip.setDiv(S.div);
  renderDivs();
  syncURL();
});

const SPEEDS = [0.25, 1, 4, 10];
function renderSpeeds() {
  $('speeds').innerHTML = SPEEDS.map((s) => `<button type="button" role="radio" aria-checked="${s === S.speed}" data-s="${s}">${s === 0.25 ? '1/4' : s}x</button>`).join('');
}
$('speeds').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.speed = Number(b.dataset.s);
  renderSpeeds();
  syncURL();
});

function updatePlayBtn() {
  const live = isLiveTrace(S.A);
  $('play').textContent = live ? 'live' : S.playing ? 'pause' : 'play';
  $('play').setAttribute('aria-pressed', String(S.playing));
  $('play').disabled = live;
}
$('play').addEventListener('click', () => {
  if (!S.playing && S.tau >= strip.end()) S.tau = 0;
  S.playing = !S.playing;
  if (!S.playing) stopTour();
  updatePlayBtn();
});
$('restart').addEventListener('click', () => { S.tau = 0; S.lastN = -1; S.evIndex = -1; S.playing = true; updatePlayBtn(); });

/* ---------------- tour ---------------- */
const tourList = () => TOUR.filter((id) => S.recordings.some((t) => t.id === id));
function startTour(i = 0) {
  S.tour = { on: true, i, since: performance.now() };
  $('tour').setAttribute('aria-pressed', 'true');
  setA(byId(tourList()[i]), { play: true });
}
function stopTour() {
  if (!S.tour.on) return;
  S.tour.on = false;
  $('tour').setAttribute('aria-pressed', 'false');
  $('narr').querySelector('.tag')?.remove();
}
$('tour').addEventListener('click', () => (S.tour.on ? stopTour() : startTour(0)));

/* ---------------- readouts ---------------- */
function provTag(t) {
  if (isLiveTrace(t)) return '<span class="pv live">live</span>';
  if (t.origin === 'recording') return '<span class="pv">recorded</span>';
  if (t.origin === 'imported') return '<span class="pv">imported</span>';
  return '<span class="pv">measured here</span>';
}
function cell(k, v, unit, how, title, fired) {
  return `<div class="ro${fired ? ' fired' : ''}" title="${esc(title)}"><div class="k">${k}${provTag(S.A)}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div><div class="h">${how}</div></div>`;
}
function splitMs(ms) {
  if (!Number.isFinite(ms)) return ['-', ''];
  if (ms >= 1000) return [(ms / 1000).toFixed(ms >= 10000 ? 1 : 2), 's'];
  return [ms >= 100 ? Math.round(ms).toString() : ms.toFixed(1), 'ms'];
}

function o200() { return TK.o200k_base || null; }

function renderReadouts() {
  const t = S.A, a = S.aNow || S.aFull;
  if (!t) return;
  const RO = $('readouts');
  const live = isLiveTrace(t);
  if (t.kind === 'oneshot') {
    const arrived = S.tau >= t.tDone;
    const u = t.usage;
    const text = t.chunks[0]?.text || '';
    const o = o200();
    const vis = o ? o.encode(text).length : NaN;
    const q = o && t.promptPreview ? o.encode(t.promptPreview).length : NaN;
    const rs = o && t.reasoning ? o.encode(t.reasoning).length : NaN;
    const [w, wu] = arrived ? splitMs(t.tDone) : splitMs(S.tau);
    RO.innerHTML =
      cell(arrived ? 'reply after' : 'waiting', w, wu, 'call to parsed reply, in one piece', 'performance.now() before the call to performance.now() after the JSON parsed') +
      cell('completion tokens', arrived && u ? fmt(u.completion_tokens) : '-', '', "the route's usage field", 'usage.completion_tokens as the route reported it') +
      cell('visible answer', arrived ? fmt(vis) : '-', 'tokens', 'the answer text, o200k, counted here', 'o200k_base token count of the reply content') +
      cell('reasoning', arrived && t.reasoning ? fmt(rs) : '-', 'tokens', 'reasoning text sent with it, o200k', 'o200k_base token count of the reasoning field') +
      cell('prompt tokens', arrived && u ? fmt(u.prompt_tokens) : '-', '', `route's count; the question alone is ${fmt(q)} in o200k`, 'usage.prompt_tokens') +
      cell('characters / s', arrived ? fmt(text.length / (t.tDone / 1000), 0) : '-', '', 'answer length over the whole wait', 'characters of the answer divided by the wait in seconds');
    return;
  }
  const ended = endedEmpty(t);
  const waiting = !a.n && !ended;
  const [f, fu] = ended ? splitMs(t.tDone) : waiting ? splitMs(Math.max(0, S.tau)) : splitMs(a.ttft);
  const [m, mu] = splitMs(a.median);
  const [p, pu] = splitMs(a.p99);
  const [r, ru] = splitMs(a.rmssd);
  // the window the rate is taken over: the whole run, or the chunks that have arrived so far
  const win = live || a.n < t.chunks.length ? `chunks 1 to ${fmt(a.n)} so far` : `whole run, ${fmt(a.n)} chunks`;
  const firstHow = ended ? `${t.failed ? 'failed' : 'stopped'} after this long; no chunk arrived` : Number.isFinite(a.ttfa) ? `first answer token ${fmtMs(a.ttfa)}, after the thinking` : 'request sent to first chunk read';
  RO.innerHTML =
    cell(ended ? 'no first token' : waiting ? 'waiting' : 'first token', f, fu, firstHow, 'TTFT = t of the first chunk, ms after the request was sent; with thinking, the first answer token is the second figure', waiting && live) +
    cell('decode rate', fmt(a.rate, 1), 'tok/s', a.invalid ? 'none: not fresh generation' : a.n > 1 ? `(n - 1) / (t_last - t_first), ${win}` : '(n - 1) / (t_last - t_first): needs two chunks', 'rate = (n - 1) / (t_last - t_first) over the chunks arrived; buffered chunks count; one chunk is one token on Ollama', live && !waiting) +
    cell('median wait', m, mu, `mean ${fmtMs(a.mean)} ± ${fmtMs(a.sd)} sd`, 'p50 of the unbuffered waits between chunks') +
    cell('p99 wait', p, pu, `p90 ${fmtMs(a.p90)}; 1 in 100 is longer`, '99th percentile of the unbuffered waits, linear interpolation') +
    cell('RMSSD', r, ru, 'root mean square of successive differences', 'sqrt(mean((w_i - w_(i-1))^2)), Task Force 1996') +
    cell('stalls', fmt(a.stalls ? a.stalls.length : NaN), a.stalls && a.stalls.length ? `longest ${fmtMs(a.stalls[0].ms)}` : '', `waits over ${fmtMs(a.stallThreshold)} (4 x median)`, 'a wait longer than 4 x the median and at least 40 ms');
}

/* ---------------- tables ---------------- */
const row = (k, here, srv, d = '', cls = '') => `<tr class="${cls}"><td>${k}</td><td>${here}</td><td>${srv}</td></tr>${d ? `<tr><td></td><td class="d" colspan="2">${d}</td></tr>` : ''}`;

function matchingTokenizer(model) {
  return TOKENIZERS.find((t) => t.match && t.match.test(model || '')) || null;
}

function renderCheck() {
  const t = S.A;
  const live = isLiveTrace(t);
  const a = live ? (S.aNow || S.aFull) : S.aFull;
  const X = $('xc');
  if (!t) return;
  if (t.kind === 'oneshot') {
    const u = t.usage;
    const o = o200();
    const vis = o ? o.encode(t.chunks[0]?.text || '').length : NaN;
    const rs = o && t.reasoning ? o.encode(t.reasoning).length : 0;
    const q = o && t.promptPreview ? o.encode(t.promptPreview).length : NaN;
    const rt = t.resourceTiming;
    X.innerHTML = `<tr><th></th><th>counted here</th><th>route says</th></tr>` +
      row('prompt', `${fmt(q)} tok`, u ? `${fmt(u.prompt_tokens)} tok` : '-', u && Number.isFinite(q) ? `${fmt(u.prompt_tokens - q)} tokens the caller never sent: a route prompt plus chat framing` : 'no usage field on this route') +
      row('completion', `${fmt(vis + rs)} tok`, u ? `${fmt(u.completion_tokens)} tok` : '-', 'answer + reasoning text in o200k; gpt-oss uses o200k_harmony, which adds format tokens') +
      row('wait', fmtMs(t.tDone), rt ? `fetch ${fmtMs(rt.duration)}` : '-', rt ? (rt.ttfb ? `connect ${fmtMs(rt.connect)}, first byte ${fmtMs(rt.ttfb)} (Resource Timing)` : 'the server sends no Timing-Allow-Origin, so the browser hides connect and first-byte times') : (t.recorder || ''));
    return;
  }
  const s = a.server;
  const show = s && S.tau >= (t.tDone || a.tLast);
  const pend = 'pending: sent last';
  let html = `<tr><th></th><th>measured here</th><th>server says</th></tr>`;
  html += row('tokens', `${fmt(a.n)} chunks`, show ? `${fmt(s.evalCount)} eval_count` : (t.usage ? `${fmt(t.usage.completion_tokens)} usage` : pend),
    show ? (s.evalCount - a.n === 1 ? 'one more than the chunks: the end-of-turn token is counted, not sent' : `${fmt(s.evalCount - a.n)} more than the chunks${a.think ? ': thinking tags and the end-of-turn token are counted, not sent' : ''}`) : '');
  const mt = matchingTokenizer(t.model);
  if (mt && !TK[mt.id] && a.n) {
    html += row('re-tokenized', '-', show ? `${fmt(s.evalCount)} eval_count` : pend, `the ${esc(mt.short)} tokenizer loads when you play this trace yourself or open the cost section`);
  }
  if (mt && TK[mt.id] && a.n) {
    const txt = t.chunks.slice(0, a.n).map((c) => c.text).join('');
    const n = TK[mt.id].encode(txt).length;
    const eos = show && s.doneReason === 'stop' ? 1 : 0;
    const think = show && a.think ? ' (a thinking run also spends tokens on the tags around its reasoning, which are not sent, so it does not add up here)' : '';
    html += row('re-tokenized', `${fmt(n)} + ${eos} = ${fmt(n + eos)} tok`, show ? `${fmt(s.evalCount)} eval_count` : pend,
      `the streamed text through the model's own tokenizer (${esc(mt.short)}, in this page), plus ${eos ? 'one end-of-turn token (done_reason stop)' : 'no end-of-turn token (the run hit its length limit)'}${show ? (n + eos === s.evalCount ? ': exact' : `: differs by ${n + eos - s.evalCount}`) : ''}${think}`);
  }
  if (s || !t.final) {
    html += row('decode rate', `${fmt(a.rate, 1)} tok/s`, show ? `${fmt(s.rate, 1)} tok/s` : (t.final === null && t.tDone != null ? 'not reported' : pend), show ? `differ by ${fmt(Math.abs(1 - a.rate / s.rate) * 100, 1)}%` : '');
    html += row('total', fmtMs(t.tDone), show ? fmtMs(s.totalMs) : (t.final === null && t.tDone != null ? 'not reported' : pend), show ? `${fmtMs(t.tDone - s.totalMs)} is HTTP and parsing outside the server's clock` : '');
  }
  if (show) {
    const net = a.ttft - s.loadMs - s.promptMs;
    html += row('first token', fmtMs(a.ttft), `load ${fmtMs(s.loadMs)} + read ${fmtMs(s.promptMs)}`,
      `${fmt(s.promptEvaluated)} of ${fmt(s.promptCount)} prompt tokens read (${fmt(s.prefillRate)} tok/s), ${fmt(s.promptCached)} from cache; ${fmtMs(net)} left for the first decode step and the network`, 'sep');
  }
  if (t.handlerMs) html += row('page overhead', `${fmtMs(t.handlerMs.median)} / read`, '-', `median time this page spent per read, max ${fmtMs(t.handlerMs.max)}`);
  if (t.hidden && t.hidden.length) html += row('tab hidden', t.hidden.map(([x, y]) => `${fmtMs(x)}-${fmtMs(y)}`).join(', '), '-', 'the browser may throttle a hidden tab; times in these spans are less certain');
  X.innerHTML = html;
  $('sd-ax').textContent = Number.isFinite(a.sd1) ? `SD1 ${fmtMs(a.sd1)} · SD2 ${fmtMs(a.sd2)}` : 'SD1 SD2';
}

function renderStats() {
  const a = S.aNow || S.aFull;
  const t = S.A;
  if (!t) return;
  if (t.kind === 'oneshot' || a.iti.length < 2) {
    $('st').innerHTML = `<tr><td colspan="3" class="d">${t.kind === 'oneshot' ? 'A reply in one piece has no waits between chunks.' : 'Not enough chunks yet.'}</td></tr>`;
    return;
  }
  const stl = a.stallList.slice(0, 4).map((s) => `#${s.index} ${fmtMs(s.ms)}`).join(', ');
  const per = Object.entries(a.perRead).sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}: ${v}`).join(', ');
  const d = a.drift;
  $('st').innerHTML =
    row('waits', `${fmt(a.iti.length - a.coalesced)} kept`, `${fmt(a.coalesced)} buffered`, 'buffered = under 2 ms after the previous chunk') +
    row('mean ± sd', `${fmtMs(a.mean)} ± ${fmtMs(a.sd)}`, `cv ${fmt(a.cv, 2)}`) +
    row('p50 · p90 · p99', `${fmtMs(a.median)} · ${fmtMs(a.p90)}`, fmtMs(a.p99)) +
    row('min · max', fmtMs(a.min), fmtMs(a.max)) +
    row('RMSSD · SD1 · SD2', fmtMs(a.rmssd), `${fmtMs(a.sd1)} · ${fmtMs(a.sd2)}`) +
    row('stalls', `${fmt(a.stallList.length)} · ${pct(a.stallShare)} of the run`, fmtMs(a.stallMs), stl ? `at chunk ${stl}` : '') +
    row('bursts', `${fmt(a.bursts.length)}`, a.bursts.length ? `${fmt(a.bursts.reduce((x, b) => x + b.chunks, 0) / a.bursts.length, 1)} chunks each` : '-', `chunks per delivery: ${per}`) +
    tokensPerChunk(t, a) +
    row('drift', Number.isFinite(d.msPer1k) ? `${d.msPer1k >= 0 ? '+' : ''}${fmt(d.msPer1k, 2)} ms / 1k tok` : '-', Number.isFinite(d.r2) ? `R² ${fmt(d.r2, 2)}` : '-', Number.isFinite(d.from) ? `wait against context position ${fmt(d.from)} to ${fmt(d.to)}` : '') +
    (a.think ? row('thinking · answer', `${fmt(a.think.n)} at ${fmt(a.think.rate, 1)} tok/s`, a.answer ? `${fmt(a.answer.n)} at ${fmt(a.answer.rate, 1)} tok/s` : '-') : '');
}

/** With the model's own tokenizer loaded, count the tokens each chunk carried (a chunk can hold more than one). */
function tokensPerChunk(t, a) {
  const mt = matchingTokenizer(t.model);
  const k = mt && TK[mt.id];
  if (!k || !a.n) return row('tokens per chunk', '-', '-', mt ? `the ${esc(mt.short)} tokenizer loads when you play this trace yourself or open the cost section` : 'needs the model\'s own tokenizer (Qwen3 or Mistral here)');
  const dist = {};
  let tot = 0;
  for (const c of t.chunks.slice(0, a.n)) { const m = k.encode(c.text, { noPrefix: true }).length; dist[m] = (dist[m] || 0) + 1; tot += m; }
  return row('tokens per chunk', `${fmt(tot)} tokens`, `${fmt(tot / a.n, 2)} per chunk`,
    `${esc(mt.short)} tokenizer on each chunk alone; chunks holding k tokens: ${Object.entries(dist).map(([x, v]) => `${x}: ${v}`).join(', ')}`);
}

function renderCompare() {
  const A = S.aFull, B = S.bFull;
  const C = $('cmp');
  if (!S.B || !S.A) { C.innerHTML = '<tr><td class="d">Pin any trace below as B. Its waits overlay A on the strip and the plots, and this table tests whether the two sets of waits differ.</td></tr>'; $('cmp-hint').textContent = 'pin a trace as B below'; return; }
  $('cmp-hint').textContent = `A ${S.A.label} · B ${S.B.label}`;
  const d = (x, y, f = fmtMs) => (Number.isFinite(x) && Number.isFinite(y) ? `${x - y >= 0 ? '+' : ''}${f(x - y)}` : '-');
  const ka = S.A.kind === 'oneshot' || S.B.kind === 'oneshot';
  let h = `<tr><th></th><th>A</th><th>B</th></tr>`;
  h += row('first token', fmtMs(ka && S.A.kind === 'oneshot' ? S.A.tDone : A.ttft), fmtMs(ka && S.B.kind === 'oneshot' ? S.B.tDone : B.ttft), `A - B = ${d(S.A.kind === 'oneshot' ? S.A.tDone : A.ttft, S.B.kind === 'oneshot' ? S.B.tDone : B.ttft)}`);
  if (!ka) {
    h += row('decode rate', `${fmt(A.rate, 1)} tok/s`, `${fmt(B.rate, 1)} tok/s`, `A / B = ${fmt(A.rate / B.rate, 2)}`);
    h += row('median wait', fmtMs(A.median), fmtMs(B.median), `A - B = ${d(A.median, B.median)}`);
    h += row('p99 wait', fmtMs(A.p99), fmtMs(B.p99));
    h += row('chunks', fmt(A.n), fmt(B.n));
    const wa = A.iti.filter((x) => x >= ANALYSIS.BUFFER_MS), wb = B.iti.filter((x) => x >= ANALYSIS.BUFFER_MS);
    const mw = mannWhitney(wa, wb), ks = ks2(wa, wb);
    const p = (x) => (x < 1e-4 ? '< 0.0001' : fmt(x, 4));
    h += row('Mann-Whitney', `p ${p(mw.p)}`, `effect ${fmt(mw.effect, 2)}`, `P(a wait in A exceeds one in B) = ${fmt(mw.effect, 2)}; 0.5 means no difference`, 'sep');
    h += row('Kolmogorov-Smirnov', `D ${fmt(ks.D, 3)}`, `p ${p(ks.p)}`, `${wa.length} and ${wb.length} waits`);
  }
  C.innerHTML = h;
}

function drawPlots(force) {
  const now = performance.now();
  if (!force && now - S.lastPlot < 110) return;
  S.lastPlot = now;
  const A = S.aNow || S.aFull;
  const B = S.bFull;
  drawTachogram($('p-tach'), A, B, S.hover);
  drawHistogram($('p-hist'), A, B, S.hover);
  drawPoincare($('p-poin'), A, B);
  drawPeriodogram($('p-freq'), A, S.A);
  if (A && A.n > 2 && force) {
    $('p-tach').setAttribute('aria-label', `Tachogram of ${S.A.label}: ${A.iti.length} waits, median ${fmtMs(A.median)}, longest ${fmtMs(A.max)}`);
    $('p-hist').setAttribute('aria-label', `Distribution of waits: p50 ${fmtMs(A.median)}, p90 ${fmtMs(A.p90)}, p99 ${fmtMs(A.p99)}`);
    $('p-poin').setAttribute('aria-label', `Poincare plot: SD1 ${fmtMs(A.sd1)}, SD2 ${fmtMs(A.sd2)}`);
    const pk = $('p-freq').dataset.peak;
    $('p-freq').setAttribute('aria-label', pk ? `Periodogram: peak at ${pk} Hz, false-alarm p ${Number($('p-freq').dataset.fap).toFixed(3)}` : 'Periodogram: too few waits');
  }
}

/* ---------------- tooltip: the chunk under the pointer ---------------- */
function showTip(i) {
  const tip = $('tip');
  const t = S.A;
  if (i < 0 || !t || !t.chunks[i]) { tip.hidden = true; return; }
  const c = t.chunks[i];
  const w = i ? c.t - t.chunks[i - 1].t : c.t;
  tip.innerHTML = `chunk <b>${i + 1}</b> at <b>${fmtMs(c.t)}</b> · wait <b>${fmtMs(w)}</b>${i && w < ANALYSIS.BUFFER_MS ? ' (buffered)' : ''}${c.kind === 't' ? ' · thinking' : ''}<br>${esc(JSON.stringify(c.text))}`;
  const g = strip._geom;
  const x = g ? g.x(c.t) : 0;
  tip.hidden = false;
  const W = $('strip').clientWidth;
  tip.style.left = Math.max(0, Math.min(W - tip.offsetWidth, x + 10)) + 'px';
  tip.style.top = '8px';
}

/* ---------------- ticker ---------------- */
function renderTicker(n) {
  const t = S.A;
  let html = '';
  let budget = 260;
  for (let i = n - 1; i >= 0 && budget > 0; i--) {
    const c = t.chunks[i];
    let txt = c.text;
    if (txt.length > budget) txt = txt.slice(-budget);
    budget -= txt.length;
    const cls = i === n - 1 ? 'now' : c.kind === 't' ? 'tk-t' : 'tk-a';
    html = `<span class="${cls}">${esc(txt)}</span>` + html;
  }
  const none = t.kind === 'oneshot' ? 'the reply arrives in one piece' : endedEmpty(t) ? `no text: the run ${t.failed ? 'failed' : 'was stopped'} before the first token` : 'no text yet';
  $('ticker').innerHTML = `<div>${html || `<span class="tk-t">${esc(none)}</span>`}</div>`;
}

/* ---------------- event captions: the page says what just happened ---------------- */
function renderEvent() {
  const t = S.A;
  if (!t) return;
  const list = isLiveTrace(t) ? events(t, S.aNow || S.aFull) : (S._events ||= new Map()).get(t.id) || S._events.set(t.id, events(t, S.aFull)).get(t.id);
  let k = -1;
  for (let i = 0; i < list.length; i++) if (list[i].t <= S.tau) k = i;
  if (k === S.evIndex) return;
  S.evIndex = k;
  const e = list[k];
  const el = $('evline');
  el.classList.toggle('live', isLiveTrace(t));
  if (!e) { el.textContent = ''; return; }
  const what = { sent: 'request', first: 'first token', phase: 'phase', stall: 'stall', burst: 'burst', end: 'cross-check', ended: t.failed ? 'failed' : 'stopped' }[e.kind] || e.kind;
  let text = e.text;
  if (e.kind === 'sent') text = t.kind === 'oneshot' ? 'request sent; a non-streamed reply arrives in one piece' : 'request sent; the dotted line is the wait for the first token';
  if (e.kind === 'end') {
    const s = (S.aFull || {}).server;
    text = s ? `last chunk at ${fmtMs(e.t)}; ${fmt((S.aFull || {}).n)} chunks against eval_count ${fmt(s.evalCount)}, rates ${fmt(S.aFull.rate, 1)} against ${fmt(s.rate, 1)} tok/s: see the cross-check` : e.text;
  }
  el.innerHTML = `<span class="tag">${what} · ${fmtMs(e.t)}</span>${esc(text)}`;
}

/* ---------------- the loop ---------------- */
let lastFrame = performance.now();
let slow = 0;
function tick(force = false) {
  const now = performance.now();
  const dtRaw = now - lastFrame;
  const dt = Math.min(100, dtRaw);
  lastFrame = now;
  if (!force) {
    S.frames.push(dtRaw);
    if (S.frames.length > 120) S.frames.shift();
    // performance tier: frames over 20 ms for 2 s drop the glow and the pixel ratio
    if (dtRaw > 20) slow += dtRaw; else slow = Math.max(0, slow - dtRaw);
    if (slow > 2000 && strip.glow) { strip.glow = false; strip.dprCap = 1; }
  }
  const t = S.A;
  if (!t) return;
  const live = isLiveTrace(t);
  if (live) S.tau = now - S.live.t0;
  else if (S.playing) S.tau += dt * S.speed;
  const end = strip.end();
  if (!live && S.playing && S.tau > end + HOLD_MS) {
    if (S.tour.on && now - S.tour.since > TOUR_MIN_MS) {
      const list = tourList();
      S.tour.i = (S.tour.i + 1) % list.length;
      S.tour.since = now;
      setA(byId(list[S.tour.i]), { play: true });
      return;
    }
    S.tau = 0;
    S.lastN = -1;
    S.evIndex = -1;
  }
  const n = lowerBound(t.chunks, S.tau + 1e-9);
  const roDue = now - (S.lastRO || 0) > 66;
  if (n !== S.lastN || force) {
    S.lastN = n;
    S.aNow = live ? analyze(t) : analyze(t, n);
    if (live) {
      strip.setAnalysis(S.aNow);
      if (S.divAuto && n >= 24 && !S.live.fitted) { S.live.fitted = true; S.div = strip.autoDiv(t, S.aNow); strip.setDiv(S.div); renderDivs(); }
    }
    renderTicker(n);
    drawPlots(force);
    if (now - (S.lastStats || 0) > 250 || force) { S.lastStats = now; renderStats(); }
  }
  if (force || (roDue && (S.playing || live || n !== S.lastRON))) {
    S.lastRO = now;
    S.lastRON = n;
    renderReadouts();
  }
  renderEvent();
  if (S.tau >= (t.tDone || 0) && !S._checked) { S._checked = true; renderCheck(); renderStats(); }
  if (S.tau < (t.tDone || 0) && S._checked) { S._checked = false; renderCheck(); }
  strip.tau = S.tau;
  if (S.visible || force) { strip.draw(); strip.drawOverview(); }
  const med = S.frames.length > 10 ? quantile([...S.frames].sort((x, y) => x - y), 0.5) : NaN;
  $('clock').textContent = `${((live ? S.tau : Math.min(end, Math.max(0, S.tau))) / 1000).toFixed(3)} s / ${(end / 1000).toFixed(3)} s` +
    (Number.isFinite(med) ? ` · frame ${med.toFixed(1)} ms` : '');
  // a screen-reader summary, at most once a second, only when it changed
  if (now - S.lastSR > 1000) {
    S.lastSR = now;
    const a = S.aNow || S.aFull;
    const msg = t.kind === 'oneshot' ? `${t.label}: reply after ${fmtMs(t.tDone)}` :
      a.n ? `${t.label}: ${a.n} chunks, first token ${fmtMs(a.ttft)}, ${fmt(a.rate, 1)} tokens per second, median wait ${fmtMs(a.median)}` : `${t.label}: waiting for the first token`;
    if (msg !== S.srMsg) { S.srMsg = msg; $('sr').textContent = msg; }
  }
}

function loop() { tick(); requestAnimationFrame(loop); }

new IntersectionObserver((es) => { S.visible = es[0].isIntersecting; }).observe($('cadence'));
addEventListener('resize', () => { S.lastPlot = 0; tick(true); });

function reveal() {
  if (reduce || still) { strip.reveal = 1; return; }
  strip.reveal = 0;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 900);
    strip.reveal = 1 - (1 - k) ** 3;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------------- export / import ---------------- */
function download(name, type, text) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
$('export').addEventListener('click', () => { if (S.A) { download(`token-ekg-${S.A.id}.json`, 'application/json', Shelf.exportJSON([S.A])); $('shelf-msg').textContent = `saved ${S.A.label} as JSON`; } });
$('export-csv').addEventListener('click', () => { if (S.A) { download(`token-ekg-${S.A.id}.csv`, 'text/csv', toCSV(S.A)); $('shelf-msg').textContent = `saved ${S.A.label} as CSV`; } });
$('export-card').addEventListener('click', () => { if (S.A) { download(`token-ekg-${S.A.id}.svg`, 'image/svg+xml', cardSVG(S.A, S.aFull)); $('shelf-msg').textContent = `saved a card of ${S.A.label}`; } });
$('import').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const list = Shelf.parseImport(await f.text());
    const bad = list.map((t) => [t, validateTrace(t)]).filter(([, errs]) => errs.length);
    if (bad.length) throw new Error(`${bad[0][0].label}: ${bad[0][1].join(', ')}`);
    S.extra.unshift(...list);
    renderShelf();
    stopTour();
    setA(list[0], { user: true });
    $('shelf-msg').textContent = `imported ${list.length} trace${list.length > 1 ? 's' : ''}`;
  } catch (err) {
    $('shelf-msg').textContent = `not imported: ${err.message}`;
  }
  e.target.value = '';
});
$('clear-saved').addEventListener('click', () => {
  Shelf.clearSaved();
  S.saved = [];
  renderShelf();
  $('shelf-msg').textContent = 'saved traces forgotten in this browser';
});

/* ---------------- measure: live streams ---------------- */
let models = [];
let udhrFull = null;
const ROUTES = () => streamingRoutes({ ollamaUp: models.length > 0 });

async function probeOllama() {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), OLLAMA.probeMs);
  try { return await Ollama.listModels(OLLAMA.base, ctrl.signal); } finally { clearTimeout(to); }
}

async function setupLive(fromButton = false) {
  if (!isLocal && !fromButton) {
    $('rec-hint').textContent = 'live streams need a model on your machine';
    $('rec-probe').hidden = false;
    if (LLM.ownKey()) { models = []; showLivePanel(); }
    return;
  }
  $('rec-hint').textContent = `looking for Ollama at ${OLLAMA.base}`;
  try {
    models = await probeOllama();
  } catch (err) {
    models = [];
    const why = err.name === 'AbortError' ? `no reply in ${OLLAMA.probeMs / 1000} s` : err.message;
    $('rec-hint').textContent = `no Ollama answered at ${OLLAMA.base} (${why})`;
    if (fromButton) $('probe-msg').textContent = `not reached (${why}). Is it running, with this site in OLLAMA_ORIGINS?`;
    $('rec-probe').hidden = isLocal;
    if (LLM.ownKey()) showLivePanel();
    return;
  }
  $('rec-probe').hidden = true;
  showLivePanel();
}

function showLivePanel() {
  const routes = ROUTES();
  $('m-route').innerHTML = routes.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  const want = params.get('route');
  if (want && routes.some((r) => r.id === want)) $('m-route').value = want;
  if (!models.length) $('m-route').value = routes.find((r) => r.id === 'own-key') ? 'own-key' : routes[0].id;
  const fillModels = () => {
    const r = routes.find((x) => x.id === $('m-route').value);
    if (r.id === 'own-key') { $('m-model').innerHTML = `<option value="${esc(r.model)}">${esc(r.model)}</option>`; }
    else {
      const pref = params.get('model') && models.some((x) => x.name === params.get('model')) ? params.get('model') : OLLAMA.prefer.find((m) => models.some((x) => x.name === m)) || models[0]?.name;
      $('m-model').innerHTML = models.map((m) => `<option value="${esc(m.name)}"${m.name === pref ? ' selected' : ''}>${esc(m.name)} ${esc(m.params)}</option>`).join('');
    }
    syncThink();
  };
  const syncThink = () => {
    const m = models.find((x) => x.name === $('m-model').value);
    const native = $('m-route').value === 'ollama';
    $('m-think').disabled = !native || !m?.thinking;
    if ($('m-think').disabled) $('m-think').checked = false;
    $('m-ctx').disabled = !native;
  };
  $('m-route').onchange = () => { fillModels(); syncURL(); };
  $('m-model').onchange = () => { syncThink(); syncURL(); };
  $('m-prompt').innerHTML = [...LIVE_PRESETS.map((k) => [k, PROMPTS[k].label]), ['custom', 'your own prompt']].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  if (params.get('p') && [...LIVE_PRESETS, 'custom'].includes(params.get('p'))) $('m-prompt').value = params.get('p');
  if (params.get('t')) $('m-temp').value = params.get('t');
  if (params.get('mx')) $('m-max').value = params.get('mx');
  if (params.has('ctx')) $('m-ctx').value = params.get('ctx');
  if (params.get('q')) $('m-custom').value = params.get('q');
  const syncPrompt = () => {
    $('m-custom').hidden = $('m-prompt').value !== 'custom';
    if (!$('m-custom').value) $('m-custom').value = PROMPTS.short.text;
  };
  $('m-prompt').onchange = () => { syncPrompt(); syncURL(); };
  syncPrompt();
  fillModels();
  for (const id of ['m-temp', 'm-max', 'm-ctx', 'm-n']) $(id).addEventListener('change', syncURL);
  // Enter starts the run (Ctrl or Cmd + Enter too), Shift+Enter adds a line; an IME composition keeps its
  // own Enter, and a held key does not start a second run. Assigned, not added: this panel can be built twice.
  $('m-custom').onkeydown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (!e.repeat) $('m-go').click();
  };
  $('rec-live').hidden = false;
  $('rec-hint').textContent = models.length ? `Ollama at ${OLLAMA.base}: ${models.length} models, streamed straight from this page` : 'your own key, from the route panel';
}

$('probe-go').addEventListener('click', () => { $('probe-msg').textContent = 'looking'; setupLive(true); });

async function buildPrompt(kind) {
  if (kind === 'custom') return $('m-custom').value.trim() || PROMPTS.short.text;
  if (kind === 'long') {
    udhrFull = udhrFull || await (await fetch(new URL('./data/udhr-eng-full.txt', HERE))).text();
    return longContext(udhrFull, PROMPTS.long.text);
  }
  return PROMPTS[kind].text;
}

async function recordOne(cfg, i, n) {
  const { route, model, kind, prompt, options, think } = cfg;
  let resident = [];
  if (route.adapter === Ollama) { try { resident = (await Ollama.resident(OLLAMA.base)).map((m) => m.name); } catch { /* optional */ } }
  const meta = models.find((m) => m.name === model) || {};
  const trace = {
    id: Shelf.newId('live'), label: `${model}, ${kind === 'custom' ? 'your prompt' : PROMPTS[kind].label}${think ? ', thinking' : ''}${n > 1 ? `, run ${i + 1} of ${n}` : ''}`,
    origin: 'live', kind: 'stream', route: route.id, recorder: `browser, ai/stream/${route.adapter === Ollama ? 'ollama' : 'openai-sse'}.js`,
    recorded: new Date().toISOString(), model, params: meta.params || '', quant: meta.quant || '',
    promptKey: kind, promptChars: prompt.length,
    promptPreview: kind === 'long' ? `[the full UDHR in English, ${udhrFull.length} characters] ${PROMPTS.long.text}` : prompt,
    think, options, residentAtStart: resident, warm: resident.includes(model), placement: null, contention: null,
    tHeaders: null, tDone: null, reads: 0, coalesced: 0, final: null, usage: null, chunks: [], hidden: [],
    group: n > 1 ? 'repeat-' + cfg.batch : null,
    note: route.adapter !== Ollama ? 'OpenAI-style stream: no server durations, so no server rate to check against.' : resident.includes(model) ? 'The model was resident when the request was sent.' : 'The model was not resident when the request was sent, so the wait includes loading it.',
  };
  const ctrl = new AbortController();
  let first = null;
  const clock = () => { const x = performance.now(); if (first === null) { first = x; S.live.t0 = x; } return x; };
  S.live = { trace, ctrl, t0: performance.now() };
  S.extra.unshift(trace);
  setA(trace, { play: true });
  $('m-msg').textContent = n > 1 ? `run ${i + 1} of ${n}` : 'streaming';
  const onVis = () => {
    const t = performance.now() - S.live.t0;
    if (document.hidden) trace.hidden.push([t, null]);
    else if (trace.hidden.length && trace.hidden[trace.hidden.length - 1][1] == null) trace.hidden[trace.hidden.length - 1][1] = t;
  };
  document.addEventListener('visibilitychange', onVis);
  try {
    const raw = await route.adapter.record({
      base: route.base, key: route.key, model, think, options, signal: ctrl.signal, clock,
      messages: [{ role: 'user', content: prompt }],
      onChunk: (c) => { trace.chunks.push(c); },
    });
    Object.assign(trace, {
      model: raw.model || model, tHeaders: raw.tHeaders, tDone: raw.tDone ?? (performance.now() - S.live.t0), reads: raw.reads,
      coalesced: raw.coalesced, final: raw.final, usage: raw.usage, handlerMs: raw.handlerMs, notice: raw.notice || '',
    });
    if (route.adapter === Ollama) {
      try { const ps = (await Ollama.resident(OLLAMA.base)).find((m) => m.name === model); if (ps) trace.placement = ps; } catch { /* optional */ }
    }
  } catch (err) {
    trace.tDone = performance.now() - S.live.t0;
    const before = trace.chunks.length ? '' : ', before the first token';
    trace.note = ctrl.signal.aborted ? `Stopped${before || ' before the stream ended'}.` : `The stream failed${before}: ${err.message}`;
    trace.failed = !ctrl.signal.aborted;
    trace.stopped = ctrl.signal.aborted;
    trace.error = ctrl.signal.aborted ? '' : String(err.message || err);
  }
  if (!trace.chunks.length && !trace.stopped && !trace.failed && trace.kind === 'stream') {
    // the server closed the stream without one token: nothing to measure, and the page says so
    trace.failed = true;
    trace.error = trace.notice || 'the stream closed without a single token';
    trace.note = `The stream ended before the first token: ${trace.error}.`;
  }
  document.removeEventListener('visibilitychange', onVis);
  trace.hidden = trace.hidden.filter(([x, y]) => y != null);
  S.live = null;
  S.extra = S.extra.filter((x) => x !== trace);
  if (trace.chunks.length) {
    trace.origin = 'saved';
    if (Shelf.save(trace)) S.saved = Shelf.loadSaved(); else S.extra.unshift(trace);
  }
  const kept = byId(trace.id) || trace;
  // the live state ends here, whatever happened: the badge, the gold trace, the ticker and the
  // play button are rebuilt from the run as it ended (stopped, failed or complete)
  if (S.A === trace) setA(kept, { play: false, at: 'end' });
  return { trace: kept, aborted: ctrl.signal.aborted };
}

$('m-go').addEventListener('click', async () => {
  if (S.live || S.recBusy) return;
  const route = ROUTES().find((r) => r.id === $('m-route').value);
  if (!route) return;
  const kind = $('m-prompt').value;
  let prompt;
  S.recBusy = true; // one run at a time, also while the long-context document loads
  try { prompt = await buildPrompt(kind); } catch { S.recBusy = false; $('m-msg').textContent = 'could not load the long-context document'; return; }
  const ctx = $('m-ctx').value;
  const temp = Number($('m-temp').value);
  const max = Number($('m-max').value);
  const think = $('m-think').disabled ? null : $('m-think').checked;
  const options = {
    ...(Number.isFinite(temp) ? { temperature: temp } : {}),
    ...(max > 0 ? { num_predict: max } : {}),
    ...(route.adapter === Ollama && ctx ? { num_ctx: Number(ctx) } : {}),
  };
  const n = Number($('m-n').value) || 1;
  const batch = Date.now().toString(36);
  stopTour();
  $('m-go').disabled = true; $('m-stop').disabled = false;
  const done = [];
  let lastTry = null, lastI = 0;
  try {
    for (let i = 0; i < n; i++) {
      // a fresh seed on every run: a nonce, so no cache can answer a repeated prompt
      const seed = Math.floor(Math.random() * 2 ** 31);
      const r = await recordOne({ route, model: route.model || $('m-model').value, kind, prompt, options: { ...options, seed }, think, batch }, i, n);
      lastTry = r.trace; lastI = i;
      if (r.trace.chunks.length) done.push(r.trace);
      if (r.aborted) break;
    }
  } finally {
    $('m-go').disabled = false; $('m-stop').disabled = true;
    S.recBusy = false;
    S.live = null;
  }
  const last = done[done.length - 1];
  // a last run that ended before its first token stays on the strip (recordOne already drew it as
  // stopped or failed); otherwise the last run with chunks is shown
  const empty = lastTry && endedEmpty(lastTry) ? lastTry : null;
  if (!empty && last) setA(last, { play: false, at: 'end', user: true }); else renderShelf();
  const parts = [];
  if (done.length > 1) { S.repeat = done; parts.push(repeatSummary(done)); }
  else if (last) parts.push(`recorded: ${fmt(last.chunks.length)} chunks${last.failed ? ', then it failed' : last.stopped ? ', stopped' : ''}`);
  if (empty) {
    const which = n > 1 ? `Run ${lastI + 1} of ${n}` : 'The run';
    parts.push(`${which} ${empty.stopped ? 'was stopped' : 'failed'} after ${fmtMs(empty.tDone)}, before the first token${empty.error ? ` (${empty.error})` : ''}; nothing was saved.`);
  }
  $('m-msg').textContent = parts.join('. ').replace(/\.\. /g, '. ') || 'nothing arrived';
});
$('m-stop').addEventListener('click', () => S.live?.ctrl.abort());

/** Median and interquartile range over repeated runs; the first run is reported apart when it was cold. */
export function repeatSummary(list) {
  const as = list.map((t) => [t, analyze(t)]);
  const cold = as.filter(([t]) => t.warm === false);
  const warm = as.filter(([t]) => t.warm !== false);
  const q = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return `${fmtMs(quantile(s, 0.5))} [${fmtMs(quantile(s, 0.25))}-${fmtMs(quantile(s, 0.75))}]`; };
  const qr = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return `${fmt(quantile(s, 0.5), 1)} [${fmt(quantile(s, 0.25), 1)}-${fmt(quantile(s, 0.75), 1)}]`; };
  const w = warm.map(([, a]) => a);
  return `${list.length} runs. ${cold.length ? `Cold first run: first token ${fmtMs(cold[0][1].ttft)}. ` : ''}Warm, median [IQR]: first token ${q(w.map((a) => a.ttft))}, median wait ${q(w.map((a) => a.median))}, decode ${qr(w.map((a) => a.rate))} tok/s.`;
}

/* ---------------- measure: one reply through llm.js ---------------- */
function publicText() {
  const st = LLM.status();
  const where = st.route === 'ollama' ? 'your local Ollama, not streamed' : st.route === 'pollinations' ? 'the public route (one reply per 45 s per IP)' : st.route === 'own-key' ? 'your own key' : 'the first route that answers';
  $('rp-text').innerHTML = `<span class="tag">one reply</span>Sends the question below through ${where}, times the wait with performance.now(), and counts what came back against the route's own usage numbers. A reply that is not streamed has no cadence: the strip shows one spike.`;
}
$('p-prompt').value = params.get('pq') || PROMPTS.oneshot.text;
// Enter in the question field times one reply, the same as the button (which is disabled while the route waits)
$('p-prompt').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (!e.repeat) $('p-go').click();
});
LLM.onStatus((s) => {
  publicText();
  const wait = s.route === 'pollinations' ? s.readyIn : 0;
  $('p-go').disabled = wait > 0 || !!S.oneshotBusy;
  $('p-go').textContent = wait > 0 ? `next reply in ${wait} s` : 'time one reply';
});

$('p-go').addEventListener('click', async () => {
  if (S.oneshotBusy) return;
  const q = $('p-prompt').value.trim() || PROMPTS.oneshot.text;
  S.oneshotBusy = true;
  $('p-go').disabled = true;
  $('p-msg').textContent = 'sent; waiting for the whole reply';
  const started = new Date().toISOString();
  const mark = performance.now();
  const r = await LLM.complete({ prompt: q, maxWaitMs: 0, timeoutMs: 45000, fallback: () => '' });
  S.oneshotBusy = false;
  $('p-go').disabled = false;
  if (r.source === 'offline' || !r.text) {
    $('p-msg').textContent = `No route answered, so nothing was measured. ${r.errors?.[r.errors.length - 1] || ''}`;
    return;
  }
  // Resource Timing for the call: connect and first byte are visible only with Timing-Allow-Origin
  let rt = null;
  try {
    const e = performance.getEntriesByType('resource').filter((x) => x.startTime >= mark - 5 && /pollinations|11434|chat\/completions/.test(x.name)).pop();
    if (e) rt = { duration: e.duration, ttfb: e.responseStart > 0 ? e.responseStart - e.startTime : 0, connect: e.connectEnd > 0 ? e.connectEnd - e.startTime : 0 };
  } catch { /* not available */ }
  const trace = {
    id: Shelf.newId('reply'), label: `${r.model}, one reply`, origin: 'saved', kind: 'oneshot',
    route: r.source === 'ollama' ? 'ollama-local' : r.source, recorder: 'browser, llm.js, performance.now()',
    recorded: started, model: r.model, params: '', quant: '',
    promptKey: 'oneshot', promptChars: q.length, promptPreview: q,
    think: null, options: {}, tHeaders: r.ms, tDone: r.ms, reads: 1, coalesced: 0, final: null,
    usage: r.usage || null, reasoning: r.reasoning || '', resourceTiming: rt,
    chunks: [{ t: r.ms, kind: 'a', text: r.text }],
    note: `Timed in this browser around one call to ${r.source}. The time includes the network.`,
  };
  if (Shelf.save(trace)) S.saved = Shelf.loadSaved(); else S.extra.unshift(trace);
  $('p-msg').textContent = `measured: ${fmtMs(r.ms)} via ${r.source}`;
  stopTour();
  setA(byId(trace.id) || trace, { play: true, user: true });
});

/* ---------------- URL state ---------------- */
let urlT = null;
function syncURL() {
  clearTimeout(urlT);
  urlT = setTimeout(() => {
    const q = new URLSearchParams();
    if (S.A && !S.tour.on && S.A.origin !== 'live') q.set('a', S.A.id);
    if (S.B) q.set('b', S.B.id);
    if (!S.divAuto) q.set('div', String(S.div));
    if (S.speed !== 1) q.set('speed', String(S.speed));
    if (bench?.ready) {
      const st = bench.state();
      if (st.enc !== TOKENIZERS[0].id) q.set('enc', st.enc);
      if (st.cmp !== TOKENIZERS[1].id) q.set('cmp', st.cmp);
      if (st.lang && st.lang !== PARALLEL.baseline) q.set('lang', st.lang);
    }
    if (!$('rec-live').hidden) {
      q.set('route', $('m-route').value);
      if ($('m-model').value) q.set('model', $('m-model').value);
      q.set('p', $('m-prompt').value);
      if ($('m-prompt').value === 'custom') q.set('q', $('m-custom').value.slice(0, 600));
      if ($('m-temp').value !== '0.7') q.set('t', $('m-temp').value);
      if ($('m-max').value) q.set('mx', $('m-max').value);
      if ($('m-ctx').value !== '8192') q.set('ctx', $('m-ctx').value);
    }
    if ($('p-prompt').value && $('p-prompt').value !== PROMPTS.oneshot.text) q.set('pq', $('p-prompt').value.slice(0, 400));
    if (still) q.set('still', '');
    const s = q.toString();
    history.replaceState(null, '', s ? `?${s}` : location.pathname);
  }, 150);
}
$('p-prompt').addEventListener('change', syncURL);
$('m-custom').addEventListener('change', syncURL);

/* ---------------- the dataset section ---------------- */
function renderDatasetSel() {
  document.querySelectorAll('#ds .dots button').forEach((b) => b.setAttribute('aria-current', String(S.A && b.dataset.id === S.A.id)));
}

/* ---------------- clock resolution: the instrument states its own precision ---------------- */
function clockResolution() {
  let min = Infinity, n = 0;
  let last = performance.now();
  const stop = last + 30;
  while (n < 200000) {
    const x = performance.now();
    if (x !== last) { min = Math.min(min, x - last); last = x; }
    if (x > stop) break;
    n++;
  }
  return min;
}

/* ---------------- the cost section: built when it is first needed ---------------- */
let bench = null;
async function initBench(udhr) {
  if (bench) return;
  bench = new TokenBench({
    text: $('tok-text'), chips: $('chips'), chips2: $('chips2'), h1: $('chips-h1'), h2: $('chips-h2'), inspect: $('inspect'), read: $('tok-read'),
    langs: $('langs'), sum: $('lang-sum'), encsw: $('encsw'), langLabel: $('tok-lang'), hint: $('lang-hint'), viewsw: $('viewsw'), cmp: $('tok-cmp'),
  }, { onChange: syncURL, base: HERE });
  try {
    await bench.init(udhr, { enc: params.get('enc'), cmp: params.get('cmp'), lang: params.get('lang') });
    Object.assign(TK, bench.tk);
    renderCheck();
    renderStats();
    renderReadouts();
    const v = await bench.verify();
    const okAll = v.results.every((r) => r.ok === r.n);
    $('verify').innerHTML = `Checked just now in this browser: ` + v.results.map((r) => `${esc(TOKENIZERS.find((t) => t.id === r.id).short)} <b>${r.ok}/${r.n}</b>`).join(', ') +
      ` texts give exactly the reference libraries' token ids (reference made ${esc(v.made)}).` + (okAll ? '' : ` Differences: ${v.results.filter((r) => r.bad.length).map((r) => `${r.id}: ${r.bad.slice(0, 4).join(', ')}`).join('; ')}.`);
  } catch (e) {
    $('tok-read').innerHTML = `<div class="ro"><div class="k">tokenizer</div><div class="v">not loaded</div><div class="h">${esc(e.message || e)}</div></div>`;
    $('verify').textContent = 'The tokenizers did not load, so nothing was checked.';
  }
}

/* ---------------- boot ---------------- */
renderSpeeds();
renderFilter();
reveal();

(async function boot() {
  const [rec, runs, udhr] = await Promise.all([
    Shelf.loadRecordings(new URL('./data/traces.json', HERE)).catch((e) => ({ traces: [], error: e })),
    Shelf.loadRecordings(new URL('./data/runs.json', HERE)).catch((e) => ({ traces: [], error: e })),
    fetch(new URL('./' + PARALLEL.file, HERE)).then((r) => r.json()).catch(() => null),
  ]);
  S.recordings = rec.traces;
  S.runs = runs.traces;
  S.saved = Shelf.loadSaved();
  if (!all().length) { $('src-line').textContent = 'recordings could not be loaded'; return; }
  const sp = Number(params.get('speed'));
  if (SPEEDS.includes(sp)) { S.speed = sp; renderSpeeds(); }
  const qa = params.get('a'), qb = params.get('b'), qd = params.get('div');
  if (qd && Number(qd) > 0) { S.divAuto = false; S.div = Number(qd); }
  if (qb && byId(qb)) { S.B = byId(qb); S.bFull = analyze(S.B); strip.setB(S.B); }
  const first = qa && byId(qa);
  if (first) setA(first, { play: !reduce && !still, user: true });
  else if (!reduce && !still) startTour(0);
  else setA(byId('qwen8-think') || all()[0], { play: false, at: 'end' });
  if (reduce || still) { S.tau = strip.end(); S.playing = false; updatePlayBtn(); tick(true); }
  requestAnimationFrame(loop);
  setupLive();
  publicText();
  renderDataset($('ds'), $('ds-note'), S.runs, (id) => { stopTour(); setA(byId(id), { play: true, user: true }); $('cadence').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); });
  renderDatasetSel();
  const res = clockResolution();
  $('ev-clock').textContent = `This browser's clock resolution, measured on load: ${Number.isFinite(res) ? fmtMs(res) : 'unknown'}.`;

  $('tok-read').innerHTML = '<div class="ro"><div class="k">tokenizers</div><div class="v">waiting</div><div class="h">four vocabularies, about 2.5 MB, load when this section comes into view</div></div>';
  if (udhr) {
    const start = () => initBench(udhr);
    if (params.get('enc') || params.get('cmp') || params.get('lang')) start();
    else {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px 0px' });
      io.observe($('tokens'));
      $('tokens').addEventListener('focusin', start, { once: true });
    }
  }
})();
