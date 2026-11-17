/* ============================================================
   heptapod/detail/masses.js — the film-detail suite, the masses (film
   track F4-ink; PROCESS 2026-11-17, F4-ink lesson 3: the suite passed
   a figure the eye failed, having no measure of how ink is shared
   between masses or of how filaments gather on one).

   From a ringTable row (ring.js) and the filaments of the same mask
   (filaments.js):
     dominance   the largest blot cluster's ink over the ink of all
                 clusters (ink of a cluster: the carrier width summed
                 over its angles, ring.js's per-angle width);
     domArea_R2  the largest cluster's ink over R squared;
     fanMax      the most filaments rooted on one cluster (a filament's
                 base within FAN_MARGIN degrees of the cluster's arc);
     fanShare    that cluster's filaments over all filaments.
   A figure whose masses are even and whose filaments spread one or two
   to a mass reads low on dominance and on fanMax.
   ============================================================ */

import { NA, blotClusters } from './ring.js';

export const FAN_MARGIN = 5;

export function masses(row, F) {
  const { R, cx, cy } = row._ring;
  const cl = blotClusters(row.blots);
  const ang = (deg) => ((Math.round((deg * NA) / 360) % NA) + NA) % NA;
  const inkOf = ([lo, hi]) => {
    let s = 0;
    for (let a = ang(lo), n = 0, end = Math.round(((hi - lo) * NA) / 360); n <= end; n++, a = (a + 1) % NA) {
      const w = row._w[a];
      if (!Number.isNaN(w)) s += w;
    }
    return (s * 2 * Math.PI * R) / NA;
  };
  const ink = cl.map(inkOf);
  const total = ink.reduce((a, b) => a + b, 0);
  let jMax = 0;
  ink.forEach((x, j) => { if (x > ink[jMax]) jMax = j; });
  const within = (deg, [lo, hi]) => {
    for (const k of [-360, 0, 360]) if (deg + k >= lo - FAN_MARGIN && deg + k <= hi + FAN_MARGIN) return true;
    return false;
  };
  // ring.js's angle runs with the image's y axis down: a = atan2(y - cy, x - cx)
  const fan = cl.map((c) => F.filter((f) => {
    const deg = (Math.atan2(f.baseXY[1] - cy, f.baseXY[0] - cx) * 180) / Math.PI;
    return within(((deg % 360) + 360) % 360, c);
  }).length);
  const fanMax = fan.length ? Math.max(...fan) : 0;
  return {
    clusters: cl.length,
    dominance: total > 0 ? ink[jMax] / total : 0,
    domArea_R2: cl.length ? ink[jMax] / (R * R) : 0,
    fanMax,
    fanShare: F.length ? fanMax / F.length : 0,
    fanPerCluster: fan,
  };
}
