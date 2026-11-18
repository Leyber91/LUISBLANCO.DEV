/* ============================================================
   blackhole/adapt.js — how the render fits the machine. Pure:
   main.js feeds it what it measures.

   The tier follows how long a full-resolution picture takes: the sum
   of the frame times of the frames that traced it (a picture during
   which the tab was hidden is not counted). It climbs when the next
   tier's picture is predicted, from its rays, under ADAPT.climbMs; it
   drops when a picture takes over ADAPT.dropMs. The first picture
   after a climb decides it: too slow, and the tier returns to where it
   came from, which becomes the ceiling for the visit. So the tier
   changes a bounded number of times: a climb fails at most once a
   tier. Frame time does not weigh: a median of frames spans tier
   changes, and judged on it the tier oscillated and fell three tiers
   in 0.3 s in a replay (review_res2 1). It replaced two judgements in
   the first two seconds from frame intervals, which the display's
   refresh bounds from below: a slow start kept a visit on the
   coarsest tier for good (2026-11-18).

   The preview, traced while the view moves, follows how long those
   frames take: smaller past PREVIEW.slowMs, larger within
   PREVIEW.keepUpMs, a step undone within PREVIEW.undoMs not retried.
   ============================================================ */

export const ORDER = ['min', 'low', 'mid', 'high'];
export const ADAPT = { climbMs: 1200, dropMs: 2500, holdMs: 3000 };
export const PREVIEW_STEPS = [0.3, 0.4, 0.55, 0.75, 1];
export const PREVIEW = { slowMs: 40, keepUpMs: 20, holdMs: 1000, undoMs: 5000 };

/** The rays a full picture traces at tier t, for a window w x h CSS px at device pixel ratio dpr (renderer.resize's
 *  canvas, times the tier's supersamples). */
export function tierRays(t, w, h, dpr) {
  const d = Math.min(dpr, t.dprCap) * t.scale;
  return Math.round(w * d) * Math.round(h * d) * t.ss * t.ss;
}

export function tierStart(tier) {
  return { tier, ceiling: ORDER.length - 1, lastChange: -Infinity, from: null };
}

/** The tier after one full picture that took refineMs, at time now (ms). tiers: config.js TIERS. s.from is the tier a
 *  climb came from, until the first picture after it has decided. */
export function tierAfter(s, { refineMs, w, h, dpr, now, tiers }) {
  const i = ORDER.indexOf(s.tier);
  if (i < 0 || !(refineMs >= 0)) return s;
  const slow = refineMs > ADAPT.dropMs;
  if (s.from != null) {
    // the first picture after a climb: too slow, and the climb is undone and not tried again
    if (slow) { const k = ORDER.indexOf(s.from); return { tier: s.from, ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }
    s = { ...s, from: null };
  }
  if (slow) {
    const j = Math.max(0, i - (refineMs > 3 * ADAPT.dropMs ? 2 : 1));
    return j === i ? s : { tier: ORDER[j], ceiling: s.ceiling, lastChange: now, from: null };
  }
  if (i < s.ceiling && i < ORDER.length - 1 && now - s.lastChange >= ADAPT.holdMs) {
    const next = ORDER[i + 1];
    const predicted = refineMs * tierRays(tiers[next], w, h, dpr) / tierRays(tiers[s.tier], w, h, dpr);
    if (predicted < ADAPT.climbMs) return { tier: next, ceiling: s.ceiling, lastChange: now, from: s.tier };
  }
  return s;
}

/** The step of PREVIEW_STEPS nearest a scale. */
const stepOf = (ps) => PREVIEW_STEPS.reduce((b, p, k) => (Math.abs(p - ps) < Math.abs(PREVIEW_STEPS[b] - ps) ? k : b), 0);

export function previewStart(ps) {
  return { ps: PREVIEW_STEPS[stepOf(ps)], ceiling: PREVIEW_STEPS.length - 1, holdUntil: -Infinity, lastUp: -Infinity };
}

/** After the tier changes, the preview's rays change with it: what the preview's last step taught no longer holds. */
export function previewReset(s, now) {
  return { ...s, lastUp: -Infinity, holdUntil: now + PREVIEW.holdMs };
}

/** The preview's scale after a run of preview frames whose median took frameMs, at time now (ms). s.ps is the scale
 *  the renderer traces at (main.js reads it back before each call). */
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
