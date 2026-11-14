/* ============================================================
   overdue/clock.js — a transiting planet as a clock.

   A published ephemeris is a mid-transit time T0 and a period P,
   each with an error. It predicts transit n at T0 + nP, and the
   prediction blurs as n grows:

       sigma(n) = sqrt( sigma_T0^2 + (n sigma_P)^2 )

   with the two errors taken as independent, which is what the
   archive's tables allow (they give no covariance). The lamp is
   the transit's duration divided by sigma: how many times the
   transit itself fits inside its own uncertainty. Below one, an
   observer who trusts this ephemeris no longer knows which night
   to watch, and the planet is called lost.

   A later published solution of the same planet is a test of the
   older one: carry the older clock to the later mid-time and see
   how far off it is, in units of the combined uncertainty (z).
   Honest Gaussian errors put about 68% of such tests inside one.

   Times are Julian dates in whatever standard the solution
   states; nothing here converts them (time.js does, for the sky).
   [REAL: the propagation formula is the standard one for a linear
   ephemeris; the lamp law and the word "lost" are this lab's]
   ============================================================ */

export const YEAR_DAYS = 365.25;
export const REAL_TEST_ORBITS = 10;       // a later mid-time fewer orbits on than this is the same transits quoted again

/* A solution as an object, from a row of ephemerides.json: [t0, e_t0, period, e_period, ref, pub, std, flag]. */
export const solution = (r) => (r ? { t0: r[0], sT: r[1], P: r[2], sP: r[3], ref: r[4], pub: r[5], std: r[6], flag: r[7] } : null);
export const usable = (s) => !!s && [s.t0, s.sT, s.P, s.sP].every(Number.isFinite) && s.t0 > 2400000 && s.t0 < 2500000 && s.P > 0 && s.sT > 0 && s.sP > 0;

/* The transit nearest to a time, and the clock's prediction and blur for transit n (days). */
export const epochAt = (s, t) => Math.round((t - s.t0) / s.P);
export const midAt = (s, n) => s.t0 + n * s.P;
export const sigmaAt = (s, n) => Math.hypot(s.sT, n * s.sP);

/* The lamp at a time: duration over blur. durDays is the transit's duration in days. */
export const lampAt = (s, t, durDays) => durDays / sigmaAt(s, epochAt(s, t));

/* The Julian date from which the lamp is below one: the blur has grown past the transit's own length.
   A clock whose mid-time error is already longer than the transit was lost the day it was published. */
export function lostFrom(s, durDays) {
  if (s.sT >= durDays) return s.t0;
  return s.t0 + (Math.sqrt(durDays * durDays - s.sT * s.sT) / s.sP) * s.P;
}

/* Where the planet is on its orbit at a time, as a fraction of a turn since mid-transit, in [0, 1).
   Exact for a circular orbit; for an eccentric one it is the mean phase, and the crossings are still right. */
export const phaseAt = (s, t) => { const f = ((t - s.t0) / s.P) % 1; return f < 0 ? f + 1 : f; };

/* The arc of the orbit the planet may be on at a time, in degrees, at k sigma either side; a full turn at most. */
export const bandDegrees = (s, t, k = 1) => Math.min(360, (2 * k * sigmaAt(s, epochAt(s, t)) / s.P) * 360);

/**
 * Grade an older solution against a newer one of the same planet. The older clock is carried to the transit
 * nearest the newer mid-time. residual is newer minus predicted, in days; z divides it by the carried blur
 * and the newer mid-time's own error together.
 */
export function grade(older, newer) {
  const n = epochAt(older, newer.t0);
  const carried = sigmaAt(older, n);
  const residual = newer.t0 - midAt(older, n);
  const sigma = Math.hypot(carried, newer.sT);
  return { n, residual, carried, sigma, z: residual / sigma, real: Math.abs(n) >= REAL_TEST_ORBITS };
}

/**
 * Every transit of one clock whose predicted mid-time falls between two Julian dates (in the clock's own
 * standard), with its blur.
 */
export function transitsBetween(s, from, to) {
  const out = [];
  for (let n = Math.ceil((from - s.t0) / s.P); midAt(s, n) <= to; n++) out.push({ n, mid: midAt(s, n), sigma: sigmaAt(s, n) });
  return out;
}

/**
 * The tally across planets. pairs: [{ older, newer, sameStandard }]. Counts the tests that are real (the
 * later mid-time is a different transit), how many of those land inside one sigma, and how many beyond three.
 * Shares are recomputed from these totals wherever they are shown.
 */
export function tally(pairs) {
  const t = { pairs: pairs.length, real: 0, inside1: 0, beyond3: 0, same: 0, sameInside1: 0, sameBeyond3: 0 };
  for (const p of pairs) {
    const g = grade(p.older, p.newer);
    if (!g.real) continue;
    t.real++;
    const a = Math.abs(g.z);
    if (a < 1) t.inside1++;
    if (a > 3) t.beyond3++;
    if (p.sameStandard) { t.same++; if (a < 1) t.sameInside1++; if (a > 3) t.sameBeyond3++; }
  }
  return t;
}
