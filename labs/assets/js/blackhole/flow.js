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

   The page's clock runs FLOW.mPerSecond M of the hole's time a
   second of display; clockLine says what that is for the hole shown.
   ============================================================ */

import * as K from './kerr.js';
import { dur } from './physics.js';

export const FLOW = { mPerSecond: 7.5, cycleOrbits: 2, seeds: 64 };

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

/** The page's clock for the hole shown, in a sentence: what a second here is there, and an orbit at the ISCO in both.
 *  m: physics.js derive() (tg, the hole's time unit in s; iscoPeriod in s); who: the hole's name, or null. */
export function clockLine(m, who) {
  const here = iscoOrbitM(m.a, m.q) / FLOW.mPerSecond;
  const per = FLOW.mPerSecond * m.tg;
  const whose = who ? `${who}'s` : 'the hole\'s';
  return `The disk turns at ${FLOW.mPerSecond} M of time a second: a second here is ${dur(per)} of ${whose} time, and an orbit at the ISCO takes ${here.toFixed(1)} s here and ${dur(m.iscoPeriod)} there.`;
}
