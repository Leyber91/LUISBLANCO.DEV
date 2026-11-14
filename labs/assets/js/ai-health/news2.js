/* ============================================================
   ai-health/news2.js — the transparent baseline. NEWS2 exactly as
   published (RCP 2017, Charts 1 and 2), no learning, no tuning.
   Every point it gives can be read off one cell of Chart 1.
   ============================================================ */

import { NEWS2_ROWS, NEWS2_RISK, NEWS2_LOW_MONITORING, VIGNETTES } from './config.js';

const ROW = {
  rr: NEWS2_ROWS.find((r) => r.key === 'rr'),
  spo2_1: NEWS2_ROWS.find((r) => r.key === 'spo2' && r.scale === 1),
  spo2_2: NEWS2_ROWS.find((r) => r.key === 'spo2' && r.scale === 2),
  o2: NEWS2_ROWS.find((r) => r.key === 'o2'),
  sbp: NEWS2_ROWS.find((r) => r.key === 'sbp'),
  hr: NEWS2_ROWS.find((r) => r.key === 'hr'),
  cvpu: NEWS2_ROWS.find((r) => r.key === 'cvpu'),
  temp: NEWS2_ROWS.find((r) => r.key === 'temp'),
};

function matchBand(row, v, ctx = {}) {
  for (const b of row.bands) {
    if (b.eq != null && v !== b.eq) continue;
    if (b.min != null && v < b.min) continue;
    if (b.max != null && v > b.max) continue;
    if (b.air && ctx.o2) continue;
    if (b.o2 && !ctx.o2) continue;
    return b;
  }
  throw new Error(`NEWS2: no band for ${row.key}=${v}`);
}

/* How each recorded value is held before scoring. */
export const recorded = {
  rr: (v) => Math.round(v),
  spo2: (v) => Math.round(v),
  sbp: (v) => Math.round(v),
  hr: (v) => Math.round(v),
  temp: (v) => Math.round(v * 10) / 10,
  o2: (v) => (v ? 1 : 0),
  cvpu: (v) => (v ? 1 : 0),
};

/**
 * Score one observation set.
 * obs: { rr, spo2, o2, sbp, hr, cvpu, temp, scale2 }
 * returns { total, parts: [{key, row, value, pts, col}], red, risk, scale }
 */
export function scoreNEWS2(obs) {
  const o2 = recorded.o2(obs.o2);
  const scale = obs.scale2 ? 2 : 1;
  const parts = [];
  const add = (key, row, value, scoredAs = value) => {
    const b = matchBand(row, scoredAs, { o2 });
    parts.push({ key, row, value, pts: b.pts, col: b.col });
  };
  add('rr', ROW.rr, recorded.rr(obs.rr));
  add('spo2', scale === 2 ? ROW.spo2_2 : ROW.spo2_1, recorded.spo2(obs.spo2));
  add('o2', ROW.o2, o2);
  add('sbp', ROW.sbp, recorded.sbp(obs.sbp));
  add('hr', ROW.hr, recorded.hr(obs.hr));
  add('cvpu', ROW.cvpu, recorded.cvpu(obs.cvpu));
  const t = recorded.temp(obs.temp);
  add('temp', ROW.temp, t, Math.round(t * 10));
  const total = parts.reduce((s, p) => s + p.pts, 0);
  const red = parts.some((p) => p.pts === 3);
  return { total, parts, red, risk: riskOf(total, red), scale };
}

/* Chart 2 category, with Chart 4 monitoring and response. */
export function riskOf(total, red) {
  const by = (id) => NEWS2_RISK.find((r) => r.id === id);
  if (total >= 7) return by('high');
  if (total >= 5) return by('medium');
  if (red) return by('red');
  const low = by('low');
  return total === 0
    ? { ...low, monitoring: NEWS2_LOW_MONITORING.zero, chart4: NEWS2_LOW_MONITORING.zeroResponse }
    : { ...low, monitoring: NEWS2_LOW_MONITORING.oneToFour };
}

/* The alert rule a visitor picks: aggregate >= t, optionally also any single 3. */
export const alerts = (news, rule) => news.total >= rule.t || (rule.red && news.red);

export const news2Total = (obs) => scoreNEWS2(obs).total;

/* A self-test of every band edge against Chart 1. Returns a list of
   failures (empty when the implementation matches the chart). Run in
   the browser console as  (await import('./news2.js')).selfTest() */
export function selfTest() {
  const base = { rr: 16, spo2: 97, o2: 0, sbp: 120, hr: 70, cvpu: 0, temp: 37.0, scale2: 0 };
  const cases = [
    ['rr', 8, 3], ['rr', 9, 1], ['rr', 11, 1], ['rr', 12, 0], ['rr', 20, 0], ['rr', 21, 2], ['rr', 24, 2], ['rr', 25, 3],
    ['spo2', 91, 3], ['spo2', 92, 2], ['spo2', 93, 2], ['spo2', 94, 1], ['spo2', 95, 1], ['spo2', 96, 0],
    ['sbp', 90, 3], ['sbp', 91, 2], ['sbp', 100, 2], ['sbp', 101, 1], ['sbp', 110, 1], ['sbp', 111, 0], ['sbp', 219, 0], ['sbp', 220, 3],
    ['hr', 40, 3], ['hr', 41, 1], ['hr', 50, 1], ['hr', 51, 0], ['hr', 90, 0], ['hr', 91, 1], ['hr', 110, 1], ['hr', 111, 2], ['hr', 130, 2], ['hr', 131, 3],
    ['temp', 35.0, 3], ['temp', 35.1, 1], ['temp', 36.0, 1], ['temp', 36.1, 0], ['temp', 38.0, 0], ['temp', 38.1, 1], ['temp', 39.0, 1], ['temp', 39.1, 2],
    ['cvpu', 1, 3], ['o2', 1, 2], ['cvpu', 0, 0], ['o2', 0, 0],
    ['rr', 7, 3], ['rr', 10, 1], ['rr', 13, 0], ['rr', 19, 0], ['rr', 22, 2], ['rr', 26, 3],
    ['spo2', 90, 3], ['spo2', 97, 0], ['sbp', 89, 3], ['sbp', 221, 3], ['hr', 39, 3], ['hr', 132, 3],
    ['temp', 34.9, 3], ['temp', 39.2, 2],
  ];
  const s2 = [ // [spo2, o2, expected points] on Scale 2
    [83, 0, 3], [84, 0, 2], [85, 0, 2], [86, 0, 1], [87, 0, 1], [88, 0, 0], [92, 0, 0], [93, 0, 0], [99, 0, 0],
    [93, 1, 1], [94, 1, 1], [95, 1, 2], [96, 1, 2], [97, 1, 3], [100, 1, 3], [90, 1, 0],
    [82, 0, 3], [82, 1, 3], [88, 1, 0], [92, 1, 0], [96, 0, 0], [98, 1, 3],
  ];
  const fails = [];
  for (const [k, v, want] of cases) {
    const r = scoreNEWS2({ ...base, [k]: v });
    const got = r.parts.find((p) => p.key === k).pts;
    if (got !== want) fails.push(`${k}=${v}: got ${got}, chart says ${want}`);
  }
  for (const [v, o2, want] of s2) {
    const r = scoreNEWS2({ ...base, spo2: v, o2, scale2: 1 });
    const got = r.parts.find((p) => p.key === 'spo2').pts;
    if (got !== want) fails.push(`scale2 spo2=${v} o2=${o2}: got ${got}, chart says ${want}`);
  }
  const tot = scoreNEWS2({ rr: 25, spo2: 91, o2: 1, sbp: 90, hr: 131, cvpu: 1, temp: 35.0, scale2: 0 }).total;
  if (tot !== 20) fails.push(`maximum aggregate: got ${tot}, expected 20`);
  fails.checked = cases.length + s2.length + 1;
  return fails;
}

/* The hand-scored vignettes: total, Chart 2 category and Chart 4 monitoring. */
export function checkVignettes() {
  return VIGNETTES.map((v) => {
    const r = scoreNEWS2(v.obs);
    const ok = r.total === v.total && r.risk.id === v.risk && r.risk.monitoring === v.monitoring;
    return { ...v, got: { total: r.total, risk: r.risk.id, monitoring: r.risk.monitoring }, ok };
  });
}
