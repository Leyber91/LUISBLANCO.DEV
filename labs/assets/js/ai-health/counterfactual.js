/* ============================================================
   ai-health/counterfactual.js — "the smallest change in vitals that
   would change this triage decision" (Wachter, Mittelstadt and
   Russell 2018), for any decision rule: NEWS2 at a threshold, or a
   learned model at a probability threshold.

   Distance is L1 over the vitals of the index set, each change divided
   by its scale in config.js (about one cohort standard deviation).
   Age and comorbidities are held fixed: they are not things that
   change. The temporal features follow from the edit, because they
   are derived from the history at read time.

   The search is exact over a grid: every single-vital change is tried
   in order of size, then every pair of vitals whose combined cost
   could beat the best single change. Nothing cheaper exists on the
   grid. Diversity: the best change for each vital is kept, and the
   cheapest few that move different vitals are listed.
   ============================================================ */

import { FEATURES, CF } from './config.js';

const ACTIONABLE = FEATURES.filter((f) => f.actionable);

function candidates(f, current, coarse) {
  if (f.binary) return [current ? 0 : 1];
  const step = coarse ? CF.coarse[f.key] || f.step : f.step;
  const out = [];
  const n = Math.round((f.max - f.min) / step);
  for (let i = 0; i <= n; i++) {
    const v = +(f.min + i * step).toFixed(1);
    if (Math.abs(v - current) < 1e-9) continue;
    out.push(v);
  }
  return out.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));
}

const costOf = (f, from, to) => (f.binary ? f.cost : Math.abs(to - from) / f.cost);

/**
 * decide(patient) -> boolean
 * returns { flagged, found, list: [{changes:[{key,from,to}], cost}], best, evaluated, bound }
 */
export function counterfactuals(patient, decide, { maxCost = CF.maxCost, k = CF.diverse } = {}) {
  const flagged = !!decide(patient);
  let evaluated = 0;
  const flips = (q) => { evaluated++; return !!decide(q) !== flagged; };
  const singles = [];

  // 1. each vital alone, nearest values first: its first flip is its best
  for (const f of ACTIONABLE) {
    const cur = +patient[f.key];
    for (const v of candidates(f, cur, false)) {
      const c = costOf(f, cur, v);
      if (c > maxCost) break;
      if (flips({ ...patient, [f.key]: v })) { singles.push({ changes: [{ key: f.key, from: cur, to: v }], cost: c }); break; }
    }
  }
  singles.sort((a, b) => a.cost - b.cost);
  let best = singles[0] || null;

  // 2. pairs that could beat the best single change
  let bestPair = null;
  for (let a = 0; a < ACTIONABLE.length; a++) {
    for (let b = a + 1; b < ACTIONABLE.length; b++) {
      const fa = ACTIONABLE[a], fb = ACTIONABLE[b];
      const ca = +patient[fa.key], cb = +patient[fb.key];
      const bound = () => (best ? best.cost : maxCost);
      const va = candidates(fa, ca, true).filter((v) => costOf(fa, ca, v) < bound());
      const vb = candidates(fb, cb, true).filter((v) => costOf(fb, cb, v) < bound());
      for (const x of va) {
        const cx = costOf(fa, ca, x);
        for (const z of vb) {
          const c = cx + costOf(fb, cb, z);
          if (c >= bound()) break;
          if (flips({ ...patient, [fa.key]: x, [fb.key]: z })) {
            bestPair = { changes: [{ key: fa.key, from: ca, to: x }, { key: fb.key, from: cb, to: z }], cost: c };
            best = bestPair;
            break;
          }
        }
      }
    }
  }
  const list = (bestPair ? [bestPair] : []).concat(singles).slice(0, k);
  return { flagged, found: !!best, list, best, evaluated, bound: maxCost };
}
