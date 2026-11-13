/* ============================================================
   trending/score.js — every number the board ranks by.

   Pure functions, no DOM, no network; tests.mjs runs them in Node.

   Per source kind (TUNING holds every parameter):
     forum       rate = points / max(age_h, 0.4)              points/h
     code        rate = stars / max(age_h, 6) * 24            stars/day
     readership  ratio = views(D) / median(views(D-7k), k=1..4)  x weekday median
   Every rate carries a 95% Poisson interval on its count (Garwood
   1936, Biometrika 28:437, the exact chi-square limits), and the
   default rank is the interval's lower bound, so 8 points in 24
   minutes (raw 20/h, lower 8.6/h) ranks under 60 points in 4 hours
   (raw 15/h, lower 11.4/h).
   Across sources every score becomes a median-based z-score of its
   log against the scored items of the same source in the same scan:
   z = (ln x - median) / (1.4826 MAD).
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';

/* ---------------- special functions ---------------- */
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* Regularized lower incomplete gamma P(a, x): series below a+1, continued fraction above. */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const lead = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, del = 1 / a, sum = del;
    for (let n = 0; n < 5000; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return Math.min(1, sum * Math.exp(lead));
  }
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 5000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.max(0, 1 - Math.exp(lead) * h);
}

/* Quantile of Gamma(shape a, scale 1) by bisection on P(a, x). */
export function gammaInv(p, a) {
  let lo = 0, hi = Math.max(1, a + 12 * Math.sqrt(a) + 12);
  while (gammaP(a, hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gammaP(a, mid) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-10 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

/* Standard normal quantile (Acklam's rational approximation, relative error < 1.2e-9). */
export function normInv(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Exact (Garwood) Poisson interval for an observed count k.
 * Above 300 the Wilson-Hilferty cube-root form is used (error under 0.1%).
 */
export function garwood(k, conf = TUNING.confidence) {
  const al = 1 - conf;
  k = Math.max(0, Math.round(k));
  if (k === 0) return [0, gammaInv(1 - al / 2, 1)];
  if (k > 300) {
    const z = normInv(1 - al / 2), k1 = k + 1;
    return [k * (1 - 1 / (9 * k) - z / (3 * Math.sqrt(k))) ** 3, k1 * (1 - 1 / (9 * k1) + z / (3 * Math.sqrt(k1))) ** 3];
  }
  return [gammaInv(al / 2, k), gammaInv(1 - al / 2, k + 1)];
}

/* ---------------- robust statistics ---------------- */
export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
export function mad(xs) {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}
/* A z-scorer fitted to a reference sample of log values. */
export function robustScaler(refLogs) {
  const med = median(refLogs);
  let s = TUNING.madScale * mad(refLogs);
  if (!(s > 1e-9)) {
    const fin = refLogs.filter(Number.isFinite);
    s = fin.length ? Math.sqrt(fin.reduce((a, x) => a + (x - med) ** 2, 0) / fin.length) : 1;
    if (!(s > 1e-9)) s = 1;
  }
  return { med, scale: s, z: (x) => (Math.log(Math.max(x, 1e-9)) - med) / s };
}

/* ---------------- per-item scores ---------------- */
const H = 3.6e6;

/* Same-weekday baseline from a daily series ending on `day`. */
export function weekdayBaseline(series, day) {
  const idx = new Map(series.map(([d, v]) => [d, v]));
  const at = (k) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * k);
    return idx.get(d.toISOString().slice(0, 10));
  };
  const weeks = [];
  for (let k = 1; k <= TUNING.wikiWeeks; k++) { const v = at(k); if (Number.isFinite(v)) weeks.push(v); }
  return { weeks, base: weeks.length >= 3 ? median(weeks) : NaN };
}

/**
 * Score one observation on its own data. Returns
 * { kind, rate, lo, hi, total, unit, ageH, ageEff, base, isNew, dod, third, detail }.
 */
export function scoreItem(o) {
  const s = SOURCES[o.src];
  if (s.kind === 'forum' || s.kind === 'code') {
    const floor = s.kind === 'forum' ? TUNING.hnAgeFloorH : TUNING.ghAgeFloorH;
    const per = s.kind === 'forum' ? 1 : 24;          // per hour, or per day
    const ageH = o.created ? Math.max(0, (o.t - o.created) / H) : NaN;
    const ageEff = Math.max(floor, Number.isFinite(ageH) ? ageH : floor);
    const [cl, ch] = garwood(o.count);
    return {
      kind: 'rate', unit: s.unit, total: o.count, ageH, ageEff, floor, per,
      rate: (o.count / ageEff) * per, lo: (cl / ageEff) * per, hi: (ch / ageEff) * per,
      base: null, isNew: false, third: o.third,
      detail: { count: o.count, created: o.created, t: o.t, ageH, ageEff, floor, per, cl, ch },
    };
  }
  // readership
  const v = (o.series && o.series.find(([d]) => d === o.day)?.[1]) ?? o.count;
  const { weeks, base } = weekdayBaseline(o.series || [], o.day);
  const dod = o.prev > 0 ? v / o.prev : NaN;
  const third = (o.series || []).filter(([d]) => d < o.day).slice(-28).reduce((a, [, x]) => a + x, 0);
  const [cl, ch] = garwood(v);
  const isNew = !(base >= TUNING.wikiMinBaseline);
  return {
    kind: 'ratio', unit: s.unit, total: v, ageH: null, base: isNew ? null : base, isNew,
    rate: isNew ? null : v / base, lo: isNew ? null : cl / base, hi: isNew ? null : ch / base,
    dod, third, weeks,
    detail: { views: v, day: o.day, weeks, base, cl, ch, prev: o.prev, prevCensored: o.prevCensored },
  };
}

/* The value a score mode ranks by, in the source's own unit. */
export function modeValue(sc, mode) {
  if (!sc) return null;
  if (mode === 'total') return sc.total;
  if (mode === 'rate') return sc.rate;
  return sc.lo;
}

/* Reference sample (logs) for a source's z-scores: the scored items of that source in the scan. */
export function referenceLogs(scored, mode) {
  return scored.map((x) => modeValue(x.sc, mode)).filter((x) => x > 0).map(Math.log);
}

/* ---------------- trajectories from stored observations ---------------- */
/**
 * Observations of one item over time, oldest first: [{ t, c, kind }].
 * kind: 'origin' (creation, from the source), 'stored' (an earlier scan), 'now'.
 */
export function trajectory(o, earlier = []) {
  const s = SOURCES[o.src];
  if (s.kind === 'readership') {
    const pts = (o.series || []).filter(([d]) => d <= o.day).slice(-30)
      .map(([d, v]) => ({ t: Date.parse(`${d}T00:00:00Z`) + 86400000, c: v, kind: d === o.day ? 'now' : 'backfill', day: d }));
    return pts;
  }
  const out = [];
  if (o.created) out.push({ t: o.created, c: s.kind === 'forum' ? 1 : 0, kind: 'origin' });
  for (const e of earlier) if (e.t < o.t && e.t > (o.created || 0)) out.push({ t: e.t, c: e.c, kind: 'stored' });
  out.push({ t: o.t, c: o.count, kind: 'now' });
  return out;
}

/* Rate measured between the last stored observation and now, with its interval. */
export function measuredRate(traj, per = 1) {
  const stored = traj.filter((p) => p.kind === 'stored');
  const now = traj[traj.length - 1];
  if (!stored.length || !now || now.kind !== 'now') return null;
  const prev = stored[stored.length - 1];
  const dtH = (now.t - prev.t) / H;
  if (dtH < TUNING.accelMinGapH) return null;
  const dc = now.c - prev.c;
  const [l, h] = garwood(Math.max(0, dc));
  return { dc, dtH, rate: (dc / dtH) * per, lo: (l / dtH) * per, hi: (h / dtH) * per, from: prev.t, to: now.t };
}

/* Rise against the item's own earlier pace: measured rate over the rate before the last stored scan. */
export function ownPace(traj, per = 1) {
  const m = measuredRate(traj, per);
  const origin = traj.find((p) => p.kind === 'origin');
  const stored = traj.filter((p) => p.kind === 'stored');
  if (!m || !origin || !stored.length) return null;
  const prev = stored[stored.length - 1];
  const dtH = (prev.t - origin.t) / H;
  if (dtH < TUNING.accelMinGapH) return null;
  const before = ((prev.c - origin.c) / dtH) * per;
  return { before, recent: m.rate, ratio: before > 0 ? m.rate / before : null };
}

/**
 * Acceleration from the last three observations at least accelMinGapH apart.
 * Readership series are daily: the rates are the last two days' views.
 * Returns { r1, r2, accel (per h, per h), rho, label } or null with fewer than 3.
 */
export function acceleration(traj, per = 1) {
  const pts = [];
  for (let i = traj.length - 1; i >= 0 && pts.length < 3; i--) {
    if (!pts.length || (pts[pts.length - 1].t - traj[i].t) / H >= TUNING.accelMinGapH) pts.push(traj[i]);
  }
  if (pts.length < 3) return null;
  const [c, b, a] = pts;   // newest first
  let r1, r2, spanH;
  if (a.day && b.day) {
    r1 = b.c; r2 = c.c; spanH = 24;
  } else {
    r1 = ((b.c - a.c) / ((b.t - a.t) / H)) * per;
    r2 = ((c.c - b.c) / ((c.t - b.t) / H)) * per;
    spanH = (c.t - a.t) / H / 2;
  }
  const rho = r1 > 0 ? (r2 - r1) / r1 : r2 > 0 ? Infinity : 0;
  const th = TUNING.accelThreshold;
  const label = rho > th ? 'accelerating' : rho < -th ? 'decaying' : 'steady';
  return { r1, r2, accel: (r2 - r1) / spanH, rho, label, n: traj.length };
}

/* ---------------- burst detection ---------------- */
/**
 * One-sided CUSUM change-point test (Page, Continuous inspection schemes,
 * Biometrika 41, 1954, 100-115) on x = ln(views + 1) of a daily series.
 * Baseline mean and sd come from every day before the last cusumMonitorDays;
 * over the monitored days S = max(0, S + (x - mean) / sd - k), and a burst is
 * declared when S > h. The onset is the first day of the run that crossed.
 */
export function cusum(series, { k = TUNING.cusumK, h = TUNING.cusumH, monitor = TUNING.cusumMonitorDays } = {}) {
  if (!series || series.length < monitor + 14) return null;
  const xs = series.map(([d, v]) => [d, Math.log(1 + v)]);
  const base = xs.slice(0, xs.length - monitor).map(([, x]) => x);
  const mu = base.reduce((a, x) => a + x, 0) / base.length;
  const sd = Math.max(TUNING.cusumMinSd, Math.sqrt(base.reduce((a, x) => a + (x - mu) ** 2, 0) / (base.length - 1)));
  let S = 0, start = null;
  for (const [d, x] of xs.slice(xs.length - monitor)) {
    const s = Math.max(0, S + (x - mu) / sd - k);
    if (S === 0 && s > 0) start = d;
    if (s === 0) start = null;
    S = s;
    if (S > h) return { burst: true, onset: start, alarm: d, S, mu, sd, k, h };
  }
  return { burst: false, S, mu, sd, k, h };
}

/* ---------------- ranking ---------------- */
/* Fitted z-scale per source and mode: { med, scale } of the logs of its pool. */
export function fitScalers(scored) {
  const out = {};
  for (const mode of ['lower', 'rate', 'total']) {
    const logs = referenceLogs(scored, mode);
    const { med, scale } = robustScaler(logs);
    out[mode] = { med, scale, n: logs.length };
  }
  return out;
}
export const zOf = (v, sc) => (v > 0 && sc && Number.isFinite(sc.med) ? (Math.log(v) - sc.med) / sc.scale : null);

/**
 * Rank scored items. With one source the native unit ranks; with more,
 * every value becomes a z-score against its own source's pool first.
 * items: [{ ...obs, sc }]; scalers: { src: { lower|rate|total: { med, scale } } }.
 */
export function rank(items, mode, scalers) {
  const merged = new Set(items.map((x) => x.src)).size > 1;
  const out = items.map((x) => {
    const v = modeValue(x.sc, mode);
    return { ...x, value: v, z: zOf(v, scalers?.[x.src]?.[mode]) };
  });
  const key = (x) => (merged ? x.z : x.value);
  out.sort((p, q) => {
    const a = key(p), b = key(q);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return b - a;
  });
  return { items: out, merged };
}
