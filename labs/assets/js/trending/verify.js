/* ============================================================
   trending/verify.js — does a rising call hold up?

   A "pair" is one call time and its follow-up for one source:
     cumulative sources (HN, Show HN, GitHub): two scans, gain = count
       at the next scan minus count at the call, over the gap printed;
     readership (Wikipedia): one day D and day D+1, gain = views on D+1.
   A call is a hit when its gain beats the median gain of every item
   observed in the same pair (the source's median gain over the span).

   Three rankings are checked over the same pairs, top 10 each:
     method   lower 95% bound of the rise score (what the board uses)
     total    raw total (points, stars, views)
     alt      total over age (HN, GitHub) / views over the previous day (Wikipedia)
   Each hit rate carries a 90% bootstrap interval over pairs, Spearman's
   rho between the method score and the gain is printed with n, and a
   figure from fewer than 30 calls is labelled too few to judge.
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';
import { median, scoreItem } from './score.js';

/* ---------------- statistics ---------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return { rho: null, n };
  const rx = ranks(xs), ry = ranks(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = rx[i] - mx, dy = ry[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return { rho: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, n };
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* Percentile bootstrap over groups (pairs): stat(groups) -> number. */
export function bootstrap(groups, stat, { reps = TUNING.bootstrapReps, level = TUNING.bootstrapLevel, seed = 212 } = {}) {
  if (groups.length < 2) return null;
  const rnd = mulberry32(seed);
  const vals = [];
  for (let r = 0; r < reps; r++) {
    const s = [];
    for (let i = 0; i < groups.length; i++) s.push(groups[Math.floor(rnd() * groups.length)]);
    const v = stat(s);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  const al = (1 - level) / 2;
  return [quantile(vals, al), quantile(vals, 1 - al)];
}

/* ---------------- pairs from stored scans (cumulative sources) ---------------- */
const H = 3.6e6;

function callIds(rows, key, n = TUNING.topPerSource) {
  return rows.filter((r) => Number.isFinite(r[key])).sort((a, b) => b[key] - a[key]).slice(0, n).map((r) => r.id);
}

/**
 * Build verification pairs from hydrated scans (oldest first) for one
 * cumulative source. Each scan is paired with the next scan of that source
 * at least 10 minutes later.
 */
export function pairsFromScans(scans, src) {
  const list = scans.filter((s) => s.sources?.[src]?.status === 'ok' && s.items.some((i) => i.src === src));
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const tA = a.sources[src].fetchedAt || a.t;
    const next = list.slice(i + 1).find((b) => ((b.sources[src].fetchedAt || b.t) - tA) / H >= 1 / 6);
    if (!next) continue;
    const tB = next.sources[src].fetchedAt || next.t;
    const later = new Map(next.items.filter((x) => x.src === src).map((x) => [x.id, x.count]));
    const mine = a.items.filter((x) => x.src === src);
    const rateMed = median(mine.map((x) => x.sc.rate));
    const rows = mine.map((x) => ({
      id: x.id, title: x.title, lo: x.sc.lo, rate: x.sc.rate, total: x.count, alt: x.sc.rate,
      gain: later.has(x.id) ? later.get(x.id) - x.count : null, cen: 0, gone: later.has(x.id) ? 0 : 1,
    }));
    // six-hour outcome: the first later scan 4 to 9 hours after the call
    const [w0, w1] = TUNING.outcomeWindowH;
    const six = list.slice(i + 1).find((b) => { const g = ((b.sources[src].fetchedAt || b.t) - tA) / H; return g >= w0 && g <= w1; });
    if (six) {
      const gH = ((six.sources[src].fetchedAt || six.t) - tA) / H;
      const at6 = new Map(six.items.filter((x) => x.src === src).map((x) => [x.id, x.count]));
      for (const r of rows) {
        if (!at6.has(r.id)) continue;
        const per = SOURCES[src].kind === 'code' ? 24 : 1;
        r.above = ((at6.get(r.id) - r.total) / gH) * per > rateMed ? 1 : 0;
      }
    }
    const known = rows.filter((r) => r.gain != null).map((r) => r.gain);
    pairs.push({
      src, key: new Date(tA).toISOString(), at: tA, gapH: (tB - tA) / H, med: median(known), n: known.length,
      rows, calls: { method: callIds(rows, 'lo'), total: callIds(rows, 'total'), alt: callIds(rows, 'alt') },
      horizon: six ? `${(((six.sources[src].fetchedAt || six.t) - tA) / H).toFixed(1)} h` : null, baseline: 'source median rate at the call',
    });
  }
  return pairs;
}

/* Pairs from the recorded Wikipedia backtest (record.mjs backtest). */
export function pairsFromBacktest(bt) {
  if (!bt?.days) return [];
  return bt.days.map((d) => ({
    src: bt.src, key: d.day, at: Date.parse(`${d.day}T00:00:00Z`), gapH: 24, med: d.med, n: d.poolN,
    rows: d.rows.map((r) => ({ ...r, gain: r.gain ?? null, above: r.base != null && r.gain != null ? (r.gain > r.base ? 1 : 0) : r.base != null && r.cen ? 0 : undefined })),
    calls: d.calls, horizon: 'next day', baseline: 'its own same-weekday median', medCensored: d.medCensored,
  }));
}

/**
 * Pairs from stored readership scans: a scan of day D is paired with the
 * stored pool of day D+1 for the same edition.
 */
export function pairsFromStoredWiki(scans, src) {
  const pools = new Map();
  for (const s of scans) { const p = s.pools?.[src]; if (p?.top && !pools.has(p.day)) pools.set(p.day, p); }
  const seen = new Set();
  const pairs = [];
  for (const s of scans) {
    const day = s.sources?.[src]?.day;
    if (!day || seen.has(day)) continue;
    const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const nk = next.toISOString().slice(0, 10);
    const np = pools.get(nk), mp = pools.get(day);
    if (!np || !mp) continue;
    seen.add(day);
    const nextMap = new Map(np.top.map(([a, v]) => [a, v]));
    const floor = Math.min(...np.top.map(([, v]) => v));
    const items = s.items.filter((x) => x.src === src);
    const rows = items.map((x) => {
      const a = x.meta?.article || x.id.slice(src.length + 1);
      const g = nextMap.get(a);
      return { id: x.id, title: x.title, lo: x.sc.lo, rate: x.sc.rate, total: x.count, alt: x.sc.dod, base: x.sc.base,
        gain: g ?? null, cen: g == null ? 1 : 0, above: x.sc.base != null ? (g != null && g > x.sc.base ? 1 : 0) : undefined };
    });
    const poolRows = mp.top.map(([a, v]) => ({ id: `${src}:${a}`, total: v, gain: nextMap.get(a) ?? null }));
    const gains = poolRows.map((r) => r.gain ?? -1).sort((a, b) => a - b);
    const med = median(gains);
    const byTotal = poolRows.slice(0, TUNING.topPerSource);
    for (const r of byTotal) if (!rows.some((x) => x.id === r.id)) rows.push({ id: r.id, lo: null, rate: null, total: r.total, alt: null, gain: r.gain, cen: r.gain == null ? 1 : 0 });
    pairs.push({
      src, key: day, at: Date.parse(`${day}T00:00:00Z`), gapH: 24, med: med < 0 ? floor : med, n: poolRows.length, rows,
      calls: { method: callIds(rows, 'lo'), total: byTotal.map((r) => r.id), alt: callIds(rows, 'alt') },
      horizon: 'next day', baseline: 'its own same-weekday median',
    });
  }
  return pairs;
}

/* ---------------- summaries ---------------- */
function hitsOf(pairs, method) {
  let calls = 0, hits = 0;
  for (const p of pairs) {
    const rows = new Map(p.rows.map((r) => [r.id, r]));
    for (const id of p.calls[method] || []) {
      const r = rows.get(id);
      if (!r || (r.gain == null && !r.cen)) continue;
      calls++;
      if (r.gain != null && r.gain > p.med) hits++;
    }
  }
  return { calls, hits, rate: calls ? hits / calls : null };
}

export function summarize(pairs) {
  const out = { pairs: pairs.length, methods: {}, spearman: null, span: null };
  if (!pairs.length) return out;
  for (const m of ['method', 'total', 'alt']) {
    const h = hitsOf(pairs, m);
    const ci = bootstrap(pairs, (g) => hitsOf(g, m).rate);
    out.methods[m] = { ...h, ci, tooFew: h.calls < TUNING.minCallsToJudge };
  }
  const xs = [], ys = [];
  for (const p of pairs) for (const r of p.rows) {
    if (!Number.isFinite(r.lo)) continue;
    if (r.gain == null && !r.cen) continue;
    xs.push(r.lo); ys.push(r.gain == null ? -1 : r.gain);
  }
  out.spearman = spearman(xs, ys);
  out.spearman.ci = bootstrap(pairs, (g) => {
    const a = [], b = [];
    for (const p of g) for (const r of p.rows) {
      if (!Number.isFinite(r.lo) || (r.gain == null && !r.cen)) continue;
      a.push(r.lo); b.push(r.gain == null ? -1 : r.gain);
    }
    return spearman(a, b).rho;
  });
  out.gapH = median(pairs.map((p) => p.gapH));
  out.span = [pairs[0].key, pairs[pairs.length - 1].key];
  out.horizon = pairs.find((p) => p.horizon)?.horizon || null;
  out.baseline = pairs[0].baseline;
  return out;
}

/**
 * Calibration by score decile: for each method call with a known outcome,
 * the share still above its baseline at the horizon.
 */
export function deciles(pairs) {
  const calls = [];
  for (const p of pairs) {
    const rows = new Map(p.rows.map((r) => [r.id, r]));
    for (const id of p.calls.method || []) {
      const r = rows.get(id);
      if (r && Number.isFinite(r.lo) && (r.above === 0 || r.above === 1)) calls.push({ lo: r.lo, above: r.above, key: p.key });
    }
  }
  if (calls.length < TUNING.minCallsToJudge) return { n: calls.length, tooFew: true, bins: [] };
  const sorted = calls.map((c) => c.lo).sort((a, b) => a - b);
  const edges = [];
  for (let k = 1; k < 10; k++) edges.push(quantile(sorted, k / 10));
  const bin = (x) => { let b = 0; while (b < 9 && x > edges[b]) b++; return b; };
  const bins = Array.from({ length: 10 }, () => ({ n: 0, above: 0 }));
  for (const c of calls) { const b = bins[bin(c.lo)]; b.n++; b.above += c.above; }
  return { n: calls.length, tooFew: false, edges, bins: bins.map((b) => ({ ...b, p: b.n ? b.above / b.n : null })), bin };
}

/* Probability for a new call from the earlier calls in its score decile. */
export function probabilityFor(lo, dec) {
  if (!dec || dec.tooFew || !Number.isFinite(lo)) return null;
  const b = dec.bins[dec.bin(lo)];
  return b.n ? { p: b.p, n: b.n } : null;
}

/* ---------------- earlier calls revisited (rose, held, fell) ---------------- */
/**
 * For each call of the previous stored scan of a source, what happened since.
 * prev, now: hydrated scans. Returns [{ id, title, label, then, since, unit, gapH }].
 */
export function revisit(prev, now, src) {
  if (!prev || !now) return [];
  const per = SOURCES[src].kind === 'code' ? 24 : 1;
  const cur = new Map(now.items.filter((x) => x.src === src).map((x) => [x.id, x]));
  const ids = prev.calls?.[src] || [];
  const tA = prev.sources[src]?.fetchedAt || prev.t;
  const tB = now.sources[src]?.fetchedAt || now.t;
  const gapH = (tB - tA) / H;
  return ids.map((id) => {
    const a = prev.items.find((x) => x.id === id && x.src === src);
    const b = cur.get(id);
    if (!a) return null;
    if (SOURCES[src].kind === 'readership') {
      if (!b || b.day === a.day) return { id, title: a.title, label: b ? 'same day' : 'not seen', gapH };
      const then = a.count, since = b.count;
      const rho = then > 0 ? (since - then) / then : 0;
      return { id, title: a.title, then, since, unit: 'views/day', gapH, label: rho > TUNING.accelThreshold ? 'rose' : rho < -TUNING.accelThreshold ? 'fell' : 'held' };
    }
    if (!b || gapH < TUNING.accelMinGapH) return { id, title: a.title, label: b ? 'too soon' : 'not seen', gapH };
    const then = a.sc.rate;
    const since = ((b.count - a.count) / gapH) * per;
    const rho = then > 0 ? (since - then) / then : 0;
    return { id, title: a.title, then, since, unit: SOURCES[src].unit, gapH, label: rho > TUNING.accelThreshold ? 'rose' : rho < -TUNING.accelThreshold ? 'fell' : 'held' };
  }).filter(Boolean);
}

export { scoreItem };
