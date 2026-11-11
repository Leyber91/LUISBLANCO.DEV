/* ============================================================
   token-ekg/engine/stats.js — interval statistics of a stream.

   The stream is treated the way an electrocardiogram's R-R series
   is treated: a sequence of event times, and the intervals between
   them. The HRV measures used here are standard ones:
     RMSSD  root mean square of successive interval differences
            (Task Force of the ESC and NASPE, Circulation 1996)
     SD1/SD2 the Poincare plot's short- and long-term spread,
            SD1^2 = Var(dRR)/2, SD2^2 = 2 SDRR^2 - SD1^2
            (Brennan, Palaniswami and Kamen, IEEE TBME 2001)
   Applied to inter-chunk intervals they describe a serving pipeline,
   not a heart. The arithmetic is the same.

   Every function is pure: a trace in, numbers out. No DOM.
   ============================================================ */

import { ANALYSIS } from '../config.js';

const NS = 1e6; // Ollama reports durations in nanoseconds

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(a) {
  if (!a.length) return NaN;
  let s = 0;
  for (const x of a) s += x;
  return s / a.length;
}

export function sd(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (const x of a) s += (x - m) * (x - m);
  return Math.sqrt(s / (a.length - 1));
}

/** Intervals between successive chunk arrivals, in ms. A zero means two chunks shared one read. */
export function intervals(chunks, upto = chunks.length) {
  const out = [];
  for (let i = 1; i < upto; i++) out.push(chunks[i].t - chunks[i - 1].t);
  return out;
}

/** Least-squares fit of y on x: slope, intercept and R squared. */
export function linfit(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { slope: NaN, intercept: NaN, r2: NaN };
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : NaN;
  return { slope, intercept: my - slope * mx, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : NaN };
}

/**
 * The full analysis of a trace, optionally only of its first `upto` chunks
 * (the page analyses a replay as it plays).
 *
 * Buffered arrivals: an interval under ANALYSIS.BUFFER_MS means the chunks
 * left the reader together (one network read, or a proxy flushing a batch).
 * Those intervals measure the transport, not generation, so they are
 * counted and shown, and kept out of the interval statistics and the
 * decode rate. Ollama sends one generated token per chunk, so for a local
 * stream a chunk is a token; the server's eval_count checks that.
 */
export function analyze(trace, upto) {
  const chunks = trace.chunks || [];
  const n = upto == null ? chunks.length : Math.min(upto, chunks.length);
  const complete = n === chunks.length && trace.final != null;
  const f = complete ? trace.final : null;
  const iti = intervals(chunks, n);
  const B = ANALYSIS.BUFFER_MS;
  const pos = iti.filter((x) => x >= B);
  const sorted = [...pos].sort((a, b) => a - b);
  const med = quantile(sorted, 0.5);

  const dRR = [];
  for (let i = 1; i < iti.length; i++) dRR.push(iti[i] - iti[i - 1]);
  const rmssd = dRR.length ? Math.sqrt(mean(dRR.map((d) => d * d))) : NaN;
  const sdrr = sd(iti);
  const sd1 = dRR.length > 1 ? Math.sqrt(0.5) * sd(dRR) : NaN;
  const sd2sq = 2 * sdrr * sdrr - sd1 * sd1;
  const sd2 = sd2sq > 0 ? Math.sqrt(sd2sq) : NaN;

  const thr = Math.max(ANALYSIS.STALL_K * med, ANALYSIS.STALL_MIN_MS);
  const stallList = [];
  for (let i = 0; i < iti.length; i++) if (iti[i] > thr) stallList.push({ index: i + 1, ms: iti[i], at: chunks[i].t });
  const stalls = [...stallList].sort((a, b) => b.ms - a.ms);

  // bursts: runs of consecutive buffered intervals; a run of k intervals is k + 1 chunks in one delivery
  const bursts = [];
  for (let i = 0; i < iti.length; i++) {
    if (iti[i] < B) {
      let j = i;
      while (j + 1 < iti.length && iti[j + 1] < B) j++;
      bursts.push({ index: i, chunks: j - i + 2, at: chunks[i].t });
      i = j;
    }
  }
  // chunks per delivery: 1 for every chunk that arrived alone, k for each burst of k
  const perRead = {};
  const inBurst = bursts.reduce((s, b) => s + b.chunks, 0);
  if (n - inBurst > 0) perRead[1] = n - inBurst;
  for (const b of bursts) perRead[b.chunks] = (perRead[b.chunks] || 0) + 1;

  let nThink = 0, firstAnswer = -1;
  for (let i = 0; i < n; i++) {
    if (chunks[i].kind === 't') nThink++;
    else if (firstAnswer < 0) firstAnswer = i;
  }
  const phaseRate = (from, to) => {
    if (to - from < 2) return NaN;
    return (to - from - 1) / ((chunks[to - 1].t - chunks[from].t) / 1000);
  };
  const hasThink = nThink > 0;

  const ttft = n ? chunks[0].t : NaN;
  const tLast = n ? chunks[n - 1].t : NaN;
  const span = n > 1 ? tLast - chunks[0].t : NaN;
  const coalesced = iti.length - pos.length;

  const server = f ? {
    evalCount: f.eval_count ?? NaN,
    evalMs: (f.eval_duration ?? NaN) / NS,
    rate: f.eval_count && f.eval_duration ? f.eval_count / (f.eval_duration / 1e9) : NaN,
    promptCount: f.prompt_eval_count ?? NaN,
    promptCached: f.prompt_eval_cached_count ?? 0,
    promptMs: (f.prompt_eval_duration ?? NaN) / NS,
    loadMs: (f.load_duration ?? NaN) / NS,
    totalMs: (f.total_duration ?? NaN) / NS,
    doneReason: f.done_reason || '',
  } : null;
  if (server) {
    const evaluated = server.promptCount - server.promptCached;
    server.promptEvaluated = evaluated;
    server.prefillRate = evaluated > 0 && server.promptMs > 0 ? evaluated / (server.promptMs / 1000) : NaN;
  }

  // drift: interval against context position (prompt tokens + output position), ms per 1,000 tokens
  const ctx0 = Number.isFinite(trace.final?.prompt_eval_count) ? trace.final.prompt_eval_count : 0;
  const xs = [], ys = [];
  for (let i = 0; i < iti.length; i++) if (iti[i] >= B && iti[i] <= thr) { xs.push(ctx0 + i + 1); ys.push(iti[i]); }
  const fit = linfit(xs, ys);

  // a stream that did not come out of a generator at generation speed
  const buffered = iti.length >= 8 && coalesced / iti.length > 0.5;
  // fresh-generation guards: more than half the waits under 1 ms (a cache or a replay), or over 90 percent
  // of the chunks inside one 50 ms window (a whole answer delivered in one burst)
  const cached = iti.length >= 8 && iti.filter((x) => x < 1).length / iti.length > 0.5;
  let densest = 0;
  for (let i = 0, j = 0; i < n; i++) {
    while (chunks[i].t - chunks[j].t > 50) j++;
    densest = Math.max(densest, i - j + 1);
  }
  const oneBurst = n >= 10 && densest / n > 0.9;
  const invalid = oneBurst ? 'the whole answer arrived in one burst: over 90% of the chunks inside 50 ms'
    : cached ? 'more than half the waits are under 1 ms: a cached or replayed stream, not fresh generation' : '';

  return {
    n,
    complete,
    ttft,
    ttfa: hasThink && firstAnswer >= 0 ? chunks[firstAnswer].t : NaN,
    tLast,
    tDone: complete ? trace.tDone : NaN,
    span,
    rateAll: n > 1 ? (n - 1) / (span / 1000) : NaN,
    rate: !invalid && pos.length ? pos.length / (pos.reduce((s, x) => s + x, 0) / 1000) : NaN,
    think: hasThink ? { n: nThink, rate: phaseRate(0, firstAnswer < 0 ? n : firstAnswer) } : null,
    answer: hasThink && firstAnswer >= 0 ? { n: n - firstAnswer, rate: phaseRate(firstAnswer, n) } : null,
    iti,
    median: med,
    mean: mean(pos),
    sd: sd(pos),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    min: sorted[0] ?? NaN,
    max: sorted[sorted.length - 1] ?? NaN,
    cv: sd(pos) / mean(pos),
    rmssd,
    sd1,
    sd2,
    stallThreshold: thr,
    stalls,
    stallList,
    stallMs: stalls.reduce((s, x) => s + x.ms, 0),
    stallShare: Number.isFinite(tLast) && tLast > 0 ? stalls.reduce((s, x) => s + x.ms, 0) / tLast : NaN,
    bursts,
    perRead,
    drift: { msPer1k: fit.slope * 1000, r2: fit.r2, n: xs.length, from: xs[0], to: xs[xs.length - 1] },
    coalesced,
    buffered,
    cached,
    oneBurst,
    invalid,
    server,
    chars: chunks.slice(0, n).reduce((s, c) => s + c.text.length, 0),
  };
}

/* ---------------- tests on interval samples ---------------- */

/** Complementary error function, fractional error under 1.2e-7 (Numerical Recipes, erfcc). */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/**
 * Mann-Whitney U, two-sided, normal approximation with tie correction.
 * Effect size: the probability that a value from x exceeds one from y, ties counted half;
 * 0.5 means no difference.
 */
export function mannWhitney(x, y) {
  const n1 = x.length, n2 = y.length;
  if (n1 < 3 || n2 < 3) return { U: NaN, z: NaN, p: NaN, effect: NaN };
  const all = x.map((v) => [v, 0]).concat(y.map((v) => [v, 1])).sort((a, b) => a[0] - b[0]);
  const N = all.length;
  const ranks = new Float64Array(N);
  let tieSum = 0;
  for (let i = 0; i < N;) {
    let j = i;
    while (j + 1 < N && all[j + 1][0] === all[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const tc = j - i + 1;
    tieSum += tc ** 3 - tc;
    i = j + 1;
  }
  let R1 = 0;
  for (let k = 0; k < N; k++) if (all[k][1] === 0) R1 += ranks[k];
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * ((N + 1) - tieSum / (N * (N - 1))));
  const z = sigma > 0 ? (U1 - mu) / sigma : 0;
  const p = Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  return { U: U1, z, p, effect: U1 / (n1 * n2) };
}

/** Two-sample Kolmogorov-Smirnov: D and its asymptotic p-value (Numerical Recipes, probks). */
export function ks2(x, y) {
  const a = [...x].sort((p, q) => p - q), b = [...y].sort((p, q) => p - q);
  const n1 = a.length, n2 = b.length;
  if (n1 < 3 || n2 < 3) return { D: NaN, p: NaN };
  let i = 0, j = 0, D = 0;
  while (i < n1 && j < n2) {
    const v = Math.min(a[i], b[j]);
    while (i < n1 && a[i] <= v) i++;
    while (j < n2 && b[j] <= v) j++;
    D = Math.max(D, Math.abs(i / n1 - j / n2));
  }
  const ne = Math.sqrt((n1 * n2) / (n1 + n2));
  const lam = (ne + 0.12 + 0.11 / ne) * D;
  let sum = 0, sign = 1;
  for (let k = 1; k <= 100; k++) {
    const term = sign * 2 * Math.exp(-2 * k * k * lam * lam);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
    sign = -sign;
  }
  return { D, p: Math.max(0, Math.min(1, sum)) };
}

/**
 * Lomb-Scargle periodogram for unevenly sampled data (Lomb 1976; Scargle 1982):
 * times in seconds, values mean-removed inside; power normalised by the variance.
 */
export function lombScargle(t, y, { fmin, fmax, n = 200 } = {}) {
  const N = Math.min(t.length, y.length);
  if (N < 8) return { freq: [], power: [] };
  const T = t[N - 1] - t[0];
  const lo = fmin ?? 1 / T;
  const hi = fmax ?? N / (2 * T);
  const my = mean(y.slice(0, N));
  let v = 0;
  for (let i = 0; i < N; i++) v += (y[i] - my) ** 2;
  v /= (N - 1);
  const freq = [], power = [];
  for (let k = 0; k < n; k++) {
    const fq = lo + ((hi - lo) * k) / (n - 1);
    const w = 2 * Math.PI * fq;
    let s2 = 0, c2 = 0;
    for (let i = 0; i < N; i++) { s2 += Math.sin(2 * w * t[i]); c2 += Math.cos(2 * w * t[i]); }
    const tau = Math.atan2(s2, c2) / (2 * w);
    let yc = 0, ys = 0, cc = 0, ss = 0;
    for (let i = 0; i < N; i++) {
      const c = Math.cos(w * (t[i] - tau)), s = Math.sin(w * (t[i] - tau)), d = y[i] - my;
      yc += d * c; ys += d * s; cc += c * c; ss += s * s;
    }
    freq.push(fq);
    power.push(v > 0 ? ((yc * yc) / cc + (ys * ys) / ss) / (2 * v) : 0);
  }
  return { freq, power };
}

/** Log-spaced histogram of positive intervals. Returns edges (ms) and counts. */
export function histogram(iti, bins = ANALYSIS.HIST_BINS, lo = 1, hi = 10000) {
  const edges = [];
  const a = Math.log10(lo), b = Math.log10(hi);
  for (let i = 0; i <= bins; i++) edges.push(10 ** (a + (b - a) * i / bins));
  const counts = new Array(bins).fill(0);
  for (const x of iti) {
    if (!(x > 0)) continue;
    const k = Math.floor((Math.log10(x) - a) / (b - a) * bins);
    counts[Math.max(0, Math.min(bins - 1, k))]++;
  }
  return { edges, counts };
}

/**
 * Moments a viewer should notice, in time order, for the page's running captions:
 * the request, the first chunk, the switch from thinking to answer, the longest stalls, the end.
 */
export function events(trace, a = analyze(trace)) {
  const ev = [{ t: 0, kind: 'sent', text: 'request sent' }];
  const s = a.server;
  if (a.n) {
    let why = '';
    if (s && s.loadMs > 300) why = `, ${fmtMs(s.loadMs)} of it loading weights`;
    else if (s && s.promptMs > 0) why = `, ${fmtMs(s.promptMs)} of it reading the ${s.promptEvaluated} uncached prompt tokens`;
    ev.push({ t: a.ttft, kind: 'first', text: `first token at ${fmtMs(a.ttft)}${why}` });
  }
  if (a.think && Number.isFinite(a.ttfa)) ev.push({ t: a.ttfa, kind: 'phase', text: `thinking ends after ${a.think.n} chunks; the answer starts` });
  for (const st of a.stalls.slice(0, 3)) {
    ev.push({ t: st.at, kind: 'stall', ms: st.ms, text: `stall: ${fmtMs(st.ms)}, ${(st.ms / a.median).toFixed(1)} x the median interval` });
  }
  if (a.complete) ev.push({ t: a.tLast, kind: 'end', text: `last chunk; ${a.n} chunks, server counted ${s ? s.evalCount : '?'} tokens` });
  return ev.sort((x, y) => x.t - y.t);
}

export function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms >= 10000) return (ms / 1000).toFixed(1) + ' s';
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  if (ms >= 100) return Math.round(ms) + ' ms';
  if (ms >= 10) return ms.toFixed(1) + ' ms';
  return ms.toFixed(2) + ' ms';
}
