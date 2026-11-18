/* ============================================================
   blackhole/flow.js — how the disk's texture moves, and the page's
   clock. The orbits are real (Kerr-Newman prograde circular orbits,
   kerr.js circular); the texture riding on them is illustrative.

   Each annulus turns at its own orbital frequency, so one pattern
   carried along winds into tighter and tighter spirals: after a
   minute the inner disk was rings finer than the pixels, and a
   turning spiral reads as rings sliding inward or outward. Luis saw
   the disk "expanding and contracting" and not rotating (2026-11-18).
   Real turbulence is torn apart and re-formed within about an orbit.
   So two copies of the pattern are carried along the orbits, each
   for one cycle from a fresh seed, and crossfaded, the copy at its
   reset weighing nothing: flow noise (Max and Becker 1995; Neyret
   2003, Advected Textures). A cycle is two orbits at the ISCO, so
   a copy is never sheared by more than about a turn and a half
   between the ISCO and twice its radius, and an inner feature can be
   followed around before it fades.

   What the copies carry is the pattern's random core; the thin lanes
   along the orbits are rings drawn once, the same for both copies and
   the same however far the disk turns, so they neither turn nor slide.
   The two cores are independent (their correlation is under 0.005)
   and are blended around the core's own mean, FLOW.coreMean (0.520,
   measured in flow.test.mjs from a port of the shader's noise), their
   spread kept, so the disk neither brightens nor loses contrast as the
   copies trade places. Blended field by field around 0.5 the disk
   clamped and breathed (review_spin 3); blended with the lanes inside
   the copies, the lanes' shared rings pulsed at every crossover
   (review_spin2 3).

   The page's clock runs FLOW.mPerSecond M of coordinate time, as a
   distant clock counts it, a second of display; clockLine says what
   that is for the hole shown, and clockShown when a sentence about a
   turning disk is true (review_spin 4 and 5).
   ============================================================ */

import * as K from './kerr.js';
import { dur } from './physics.js';

export const FLOW = { mPerSecond: 7.5, cycleOrbits: 2, seeds: 256, coreMean: 0.52 };

/** One prograde circular orbit at the ISCO, in M of coordinate time. */
export function iscoOrbitM(a, q = 0) {
  return 2 * Math.PI / K.circular(a, K.isco(a, 1, q), q).Omega;
}

/** How long a copy of the pattern is carried along the orbits before it is replaced, in M. */
export function flowCycle(a, q = 0) {
  return FLOW.cycleOrbits * iscoOrbitM(a, q);
}

/** The two copies at page time t (M), cycle T (M): tau is how long each has been carried since its reset, w its weight
 *  (zero at its reset, the two summing to one), seed the noise offset it started from. The shader's turbulence() mirrors
 *  this line for line. */
export function flowPhases(t, T) {
  const c0 = Math.floor(t / T), c1 = Math.floor(t / T + 0.5);
  const t0 = t - c0 * T, t1 = t + 0.5 * T - c1 * T;
  const w0 = 1 - Math.abs(2 * t0 / T - 1);
  const seed = (c, odd) => ((c * 2 + odd) % FLOW.seeds + FLOW.seeds) % FLOW.seeds;
  return [{ tau: t0, w: w0, seed: seed(c0, 0) }, { tau: t1, w: 1 - w0, seed: seed(c1, 1) }];
}

/** The two copies' cores blended around the core's mean, their spread kept (independent copies: the weighted sum's
 *  spread is sqrt(w0^2 + w1^2) of one's). The shader's turbulence() blends with this line. */
export function flowBlend(x0, x1, w0, w1) {
  const m = FLOW.coreMean;
  return Math.max(0, m + (w0 * (x0 - m) + w1 * (x1 - m)) / Math.sqrt(w0 * w0 + w1 * w1));
}

/** The clock's numbers for the hole shown, the one rule both sentences say: an ISCO orbit in seconds of display, a
 *  second of display by a distant clock, and an ISCO orbit by a distant clock. m: physics.js derive() (a, q; tg, the
 *  hole's time unit in s; iscoPeriod in s, a distant clock's). The gas's own clock at the ISCO counts less (u^t is 3.2
 *  at a 0.94), which is why the sentences name the distant clock. */
export function clockParts(m) {
  return { here: iscoOrbitM(m.a, m.q) / FLOW.mPerSecond, per: FLOW.mPerSecond * m.tg, there: m.iscoPeriod };
}

/** The page's clock for the hole shown, in a sentence, for the view's note. who: the hole's name, or null. */
export function clockLine(m, who) {
  const c = clockParts(m);
  return `Time here runs at ${FLOW.mPerSecond} M a second: a second here is ${dur(c.per)} by a distant clock at ${who || 'this hole'}, and an orbit at the ISCO takes ${c.here.toFixed(1)} s here and ${dur(c.there)} by that clock.`;
}

/** The clock in short, for the caption card under the picture, which shows at every width (the full sentence sits in the
 *  view's note, in the panels). */
export function clockShort(m) {
  const c = clockParts(m);
  return `Time here runs at ${FLOW.mPerSecond} M a second: an orbit at the ISCO takes ${c.here.toFixed(1)} s here and ${dur(c.there)} by a distant clock.`;
}

/** Whether a sentence about the disk turning is true of the view: a disk drawn with its texture (the thick disk in the
 *  thermal or true-colour map; the thin emitter and the diagnostic maps carry none), the clock running, and not the fall,
 *  whose own clocks run on the fall's schedule (ui.js, the journey). */
export function clockShown(s, reduced = false) {
  return s.emit === 'thick' && (s.color === 'thermal' || s.color === 'true') && !!s.anim && !reduced && s.view !== 'journey';
}
