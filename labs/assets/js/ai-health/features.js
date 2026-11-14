/* ============================================================
   ai-health/features.js — the temporal features, derived from a
   patient's observation history at read time, so an edited index
   set never leaves a stale trend behind.
     d_rr, d_hr, d_sbp, d_spo2   index set minus the previous set
     slope                        least-squares NEWS2 points per hour
                                  over the last three sets
     gap                          hours since the previous set
     miss                         values carried forward into the index set
   ============================================================ */

import { scoreNEWS2 } from './news2.js';

const NO_HISTORY_GAP = 4;   // hours assumed when a patient has no earlier set

export const lastPrev = (p) => (p.prev && p.prev.length ? p.prev[p.prev.length - 1] : null);

export function news2Slope(p) {
  const sets = [...(p.prev || []).slice(-2), { ...p, t: 0 }];
  if (sets.length < 2) return 0;
  const pts = sets.map((q) => [q.t, scoreNEWS2({ ...q, scale2: p.scale2 }).total]);
  const mt = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const my = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const [t, y] of pts) { num += (t - mt) * (y - my); den += (t - mt) ** 2; }
  return den ? num / den : 0;
}

export function featureValue(p, key) {
  if (p.ovr && key in p.ovr) return p.ovr[key];   // the deletion test sets a feature to its reference value
  switch (key) {
    case 'd_rr': { const q = lastPrev(p); return q ? p.rr - q.rr : 0; }
    case 'd_hr': { const q = lastPrev(p); return q ? p.hr - q.hr : 0; }
    case 'd_sbp': { const q = lastPrev(p); return q ? p.sbp - q.sbp : 0; }
    case 'd_spo2': { const q = lastPrev(p); return q ? p.spo2 - q.spo2 : 0; }
    case 'gap': { const q = lastPrev(p); return q ? -q.t : NO_HISTORY_GAP; }
    case 'slope': return news2Slope(p);
    case 'miss': return p.miss || 0;
    default: return +p[key];
  }
}

export const featureRow = (p, keys) => keys.map((k) => featureValue(p, k));
