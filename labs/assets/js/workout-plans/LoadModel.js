/* ============================================================
   workout-plans/LoadModel.js — the load model. Pure functions,
   no DOM.

   Session load (Foster et al. 2001): session RPE (CR-10) times
   duration in minutes, in arbitrary units (AU).

   Fitness-fatigue impulse response (Banister et al. 1975), daily
   discrete form, impulse w(t) on day t:
     F(t) = F(t-1) e^(-1/tau1) + k1 w(t)          fitness
     H(t) = H(t-1) e^(-1/tau2) + k2(t) w(t)       fatigue
     form(t) = F(t) - H(t)                         performance - p0
   Fixed dose: k2(t) = k2. Variable dose (Busso 2003):
     k2(t) = k3 q(t),  q(t) = q(t-1) e^(-1/tau3) + w(t-1)
   so a session that lands on recent load costs more fatigue.

   Monotony and strain (Foster 1998): weekly mean daily load over
   its standard deviation; strain = weekly load x monotony.
   ACWR is computed only to be shown beside its critique
   (Impellizzeri et al. 2020); no rule in the planner reads it.
   ============================================================ */

import { LOAD_MODEL } from './constants.js';

export const sessionLoad = (rpe, minutes) => Math.round(rpe * minutes);

/* prior training before day 0: the block's first week, repeated and scaled */
function priorLoads(week1, share, days) {
  const out = new Array(days);
  for (let i = 0; i < days; i++) out[i] = (week1[(i + 7 * 100) % 7] || 0) * share;
  return out;
}

/* k3 so that the mean k2 over the planned block equals k2Mean */
export function calibrateK3(planned, prior, p = LOAD_MODEL) {
  const e3 = Math.exp(-1 / p.tau3);
  let q = 0, sum = 0, last = 0;
  const all = prior.concat(planned);
  for (let i = 0; i < all.length; i++) {
    q = q * e3 + last;
    last = all[i];
    if (i >= prior.length) sum += q;
  }
  const meanQ = sum / Math.max(1, planned.length);
  return meanQ > 0 ? p.k2Mean / meanQ : 0;
}

/**
 * Simulate the block.
 * @param {number[]} loads   daily loads for the block, AU
 * @param {object}   opt     { mode: 'banister'|'busso', prior: number[], k3 }
 * @returns {{fit:number[], fat:number[], form:number[], k2:number[]}}
 */
export function simulate(loads, { mode = 'busso', prior = [], k3 = 0, tau1, tau2 } = {}, p = LOAD_MODEL) {
  if (mode === 'pmc') return simulatePMC(loads, prior, p);
  const e1 = Math.exp(-1 / (tau1 || p.tau1)), e2 = Math.exp(-1 / (tau2 || p.tau2)), e3 = Math.exp(-1 / p.tau3);
  let F = 0, H = 0, q = 0, last = 0;
  const fit = [], fat = [], form = [], k2s = [];
  const all = prior.concat(loads);
  for (let i = 0; i < all.length; i++) {
    const w = all[i];
    q = q * e3 + last;
    last = w;
    const k2 = mode === 'busso' ? k3 * q : p.k2;
    F = F * e1 + p.k1 * w;
    H = H * e2 + k2 * w;
    if (i >= prior.length) { fit.push(F); fat.push(H); form.push(F - H); k2s.push(k2); }
  }
  return { fit, fat, form, k2: k2s };
}

/* the exponentially weighted chart: CTL over 42 days, ATL over 7, form = CTL - ATL */
function simulatePMC(loads, prior, p) {
  let ctl = 0, atl = 0;
  const fit = [], fat = [], form = [], k2 = [];
  const all = prior.concat(loads);
  for (let i = 0; i < all.length; i++) {
    ctl += (all[i] - ctl) / p.pmc.ctl;
    atl += (all[i] - atl) / p.pmc.atl;
    if (i >= prior.length) { fit.push(ctl); fat.push(atl); form.push(ctl - atl); k2.push(1 / p.pmc.atl); }
  }
  return { fit, fat, form, k2 };
}

/* form under tau1 and tau2 each varied by +-frac. The absolute values swing by thousands of AU
   (fitness scales with tau1), so each run is reported with its peak day and its range: the
   honest reading is how far the timing of the peak moves, not the numbers. */
export function sensitivity(loads, { mode, prior, k3 }, frac = LOAD_MODEL.sensitivity, p = LOAD_MODEL) {
  if (mode === 'pmc') return null;
  const runs = [];
  const peakOf = (f) => f.reduce((best, v, i) => (v > f[best] ? i : best), 0);
  runs.push({ a: 1, b: 1, form: simulate(loads, { mode, prior, k3 }).form });
  for (const a of [1 - frac, 1 + frac]) for (const b of [1 - frac, 1 + frac]) {
    runs.push({ a, b, form: simulate(loads, { mode, prior, k3, tau1: p.tau1 * a, tau2: p.tau2 * b }).form });
  }
  for (const r of runs) { r.peak = peakOf(r.form); r.min = Math.min(...r.form); r.max = Math.max(...r.form); }
  const peaks = runs.map((r) => r.peak);
  return { runs, spread: Math.max(...peaks) - Math.min(...peaks) };
}

/* weekly indices: load, monotony, strain (Foster 1998), and the coupled ACWR */
export function weeklyIndices(loads, prior = []) {
  const weeks = [];
  const all = prior.concat(loads);
  const off = prior.length;
  for (let w = 0; w * 7 < loads.length; w++) {
    const days = loads.slice(w * 7, w * 7 + 7);
    const sum = days.reduce((a, b) => a + b, 0);
    const mean = sum / 7;
    const sd = Math.sqrt(days.reduce((a, b) => a + (b - mean) ** 2, 0) / 7);
    const monotony = sd > 0 ? mean / sd : 0;
    // ACWR, coupled: acute = this week's load, chronic = mean weekly load of the last 28 days (this week included)
    const end = off + w * 7 + 7;
    const last28 = all.slice(Math.max(0, end - 28), end);
    const chronic = last28.reduce((a, b) => a + b, 0) / 4;
    // change against the mean weekly load of the 4 weeks before this one (prior training included)
    const prev = all.slice(Math.max(0, end - 35), end - 7);
    const prevMean = prev.length ? prev.reduce((a, b) => a + b, 0) / (prev.length / 7) : 0;
    const rise = prevMean > 0 ? 100 * (sum - prevMean) / prevMean : 0;
    weeks.push({ sum, monotony, strain: sum * monotony, acwr: chronic > 0 ? sum / chronic : 0, rise });
  }
  return weeks;
}

/* everything the views need from one load series */
export function runModel(planned, lived, { mode, level, weeks, band = false }) {
  const p = LOAD_MODEL;
  const week1 = planned.slice(0, 7);
  const prior = priorLoads(week1, p.prior[level] ?? 0.5, p.priorDays);
  const k3 = calibrateK3(planned, prior);
  const plan = simulate(planned, { mode, prior, k3 });
  const live = simulate(lived, { mode, prior, k3 });
  return {
    k3, prior,
    plan, live,
    band: band ? sensitivity(lived, { mode, prior, k3 }) : null,
    weeksPlan: weeklyIndices(planned, prior).slice(0, weeks),
    weeksLive: weeklyIndices(lived, prior).slice(0, weeks),
  };
}
