/* ============================================================
   blackhole/adapt.js — how the render fits the machine. Pure:
   main.js feeds it what it measures.

   The tier follows how long the full-resolution picture takes to
   finish after the view stops changing. It climbs when the next
   tier's picture is predicted, from its rays, to finish within
   ADAPT.climbMs; it drops when a picture takes over ADAPT.dropMs.
   A climb undone within ADAPT.undoMs is not tried again in the
   visit, so the tier never oscillates. It replaced two judgements
   in the first two seconds from the interval between frames, which
   the display's refresh bounds from below: a slow start kept a visit
   on the coarsest tier for good (2026-11-18).

   The preview, traced while the view moves, follows how long those
   frames take: smaller when they drag past 40 ms, larger when they
   keep up within 20 ms, a step that had to be undone not retried.
   ============================================================ */

export const ORDER = ['min', 'low', 'mid', 'high'];
export const ADAPT = { climbMs: 1200, dropMs: 2500, holdMs: 3000, undoMs: 10000 };
export const PREVIEW_STEPS = [0.3, 0.4, 0.55, 0.75, 1];
export const PREVIEW = { slowMs: 40, keepUpMs: 20, holdMs: 1000, undoMs: 5000 };

/** The rays a full picture traces at tier t, for a window w x h CSS px at device pixel ratio dpr (renderer.resize's
 *  canvas, times the tier's supersamples). */
export function tierRays(t, w, h, dpr) {
  const d = Math.min(dpr, t.dprCap) * t.scale;
  return Math.round(w * d) * Math.round(h * d) * t.ss * t.ss;
}

export function tierStart(tier) {
  return { tier, ceiling: ORDER.length - 1, lastChange: -Infinity, lastDir: null };
}

/** The tier after one full picture that took refineMs, at time now (ms). tiers: config.js TIERS. */
export function tierAfter(s, { refineMs, w, h, dpr, now, tiers }) {
  const i = ORDER.indexOf(s.tier);
  if (i < 0 || !(refineMs >= 0)) return s;
  if (refineMs > ADAPT.dropMs) {
    const j = Math.max(0, i - (refineMs > 3 * ADAPT.dropMs ? 2 : 1));
    if (j === i) return s;
    // a climb undone soon after: that tier is not tried again in this visit
    const ceiling = s.lastDir === 'up' && now - s.lastChange < ADAPT.undoMs ? Math.min(s.ceiling, i - 1) : s.ceiling;
    return { tier: ORDER[j], ceiling, lastChange: now, lastDir: 'down' };
  }
  if (i < s.ceiling && i < ORDER.length - 1 && now - s.lastChange >= ADAPT.holdMs) {
    const next = ORDER[i + 1];
    const predicted = refineMs * tierRays(tiers[next], w, h, dpr) / tierRays(tiers[s.tier], w, h, dpr);
    if (predicted < ADAPT.climbMs) return { tier: next, ceiling: s.ceiling, lastChange: now, lastDir: 'up' };
  }
  return s;
}

/** The step of PREVIEW_STEPS nearest a scale. */
const stepOf = (ps) => PREVIEW_STEPS.reduce((b, p, k) => (Math.abs(p - ps) < Math.abs(PREVIEW_STEPS[b] - ps) ? k : b), 0);

export function previewStart(ps) {
  return { ps: PREVIEW_STEPS[stepOf(ps)], ceiling: PREVIEW_STEPS.length - 1, holdUntil: -Infinity, lastUp: -Infinity };
}

/** The preview's scale after a run of preview frames whose median took frameMs, at time now (ms). */
export function previewAfter(s, { frameMs, now }) {
  const k = stepOf(s.ps);
  if (!(frameMs > 0) || now < s.holdUntil) return s;
  if (frameMs > PREVIEW.slowMs && k > 0) {
    const ceiling = now - s.lastUp < PREVIEW.undoMs ? Math.min(s.ceiling, k - 1) : s.ceiling;
    return { ps: PREVIEW_STEPS[k - 1], ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: s.lastUp };
  }
  if (frameMs < PREVIEW.keepUpMs && k < s.ceiling) {
    return { ps: PREVIEW_STEPS[k + 1], ceiling: s.ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: now };
  }
  return s;
}
