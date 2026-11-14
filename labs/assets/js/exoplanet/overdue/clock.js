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

   A test has a limit. A measured mid-time is never more than half
   a period from the nearest predicted transit, so once the
   combined uncertainty reaches a sixth of the period a miss of
   three sigma cannot be seen at all. Such a test is called blind
   and is counted apart: landing inside the window proves nothing
   when the window covers the orbit.

   Times are Julian dates in whatever standard the solution
   states; nothing here converts them (time.js does, for the sky).
   [REAL: the propagation formula is the standard one for a linear
   ephemeris; the lamp law and the word "lost" are this lab's]
   ============================================================ */

export const YEAR_DAYS = 365.25;
export const MIN_YEARS_APART = 2;         // a paper tests an older one when it appeared two years or more after it

/* A Julian date as a year with a fraction, and back. */
export const yearOfJd = (jd) => 2000 + (jd - 2451545.0) / YEAR_DAYS;
export const jdOfYear = (y) => 2451545.0 + (y - 2000) * YEAR_DAYS;
export const REAL_TEST_ORBITS = 10;       // a later mid-time fewer orbits on than this is the same transits quoted again
export const BLIND_SHARE = 1 / 6;         // an uncertainty this share of the period or more: three sigma is half an orbit, the largest miss there can be

/* Whether an uncertainty (days) is too wide for this clock to be tested at all. */
export const blindAt = (s, sigma) => sigma >= s.P * BLIND_SHARE;

/* A solution as an object, from a row of the data files: [t0, e_t0, period, e_period, ref, pub, std, flag], and for
   a working clock a ninth number, how many other published solutions stand apart from it (the build script). */
export const solution = (r) => (r ? { t0: r[0], sT: r[1], P: r[2], sP: r[3], ref: r[4], pub: r[5], std: r[6], flag: r[7], disputes: r[8] || 0 } : null);
/* A full Julian date between late 1995 and 2132: the tables hold a few truncated or mistyped dates. */
export const usable = (s) => !!s && [s.t0, s.sT, s.P, s.sP].every(Number.isFinite) && s.t0 > 2450000 && s.t0 < 2500000 && s.P > 0 && s.sT > 0 && s.sP > 0;

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
 * and the newer mid-time's own error together. blind: the combined uncertainty is a sixth of the period or
 * more, so the test could not have shown a miss of three sigma.
 */
export function grade(older, newer) {
  const n = epochAt(older, newer.t0);
  const carried = sigmaAt(older, n);
  const residual = newer.t0 - midAt(older, n);
  const sigma = Math.hypot(carried, newer.sT);
  return { n, residual, carried, sigma, z: residual / sigma, real: Math.abs(n) >= REAL_TEST_ORBITS, blind: blindAt(older, sigma) };
}

/**
 * Whether a later solution tests an older clock, as this lab defines a test, and its grade if it does.
 * Both carry a true publication date; they come from different papers; the later paper appeared two years
 * or more after the older; its mid-time is ten or more orbits on, and later than the day the older paper
 * appeared (a mid-time from before that day is a transit the older paper could have used). Returns null when
 * any of that fails. One definition, used for the tally across planets and for the record of one clock.
 */
export function testOf(older, newer) {
  if (!older || !newer || older.pub == null || newer.pub == null) return null;
  if (older.ref == null || newer.ref == null || older.ref === newer.ref) return null;
  if (newer.pub - older.pub < MIN_YEARS_APART) return null;
  const g = grade(older, newer);
  if (g.n < REAL_TEST_ORBITS || yearOfJd(newer.t0) <= older.pub) return null;
  return g;
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
 * later mid-time is a different transit, and the test is not blind), how many of those land inside one sigma,
 * and how many beyond three. blind counts the later mid-times that came after the old window had covered the
 * orbit; they are in no other count. topRef and topCount: the reference that is the newer paper in the most
 * real tests, and in how many. Shares are recomputed from these totals wherever they are shown.
 */
export function tally(pairs) {
  const t = { pairs: pairs.length, real: 0, blind: 0, inside1: 0, beyond3: 0, same: 0, sameInside1: 0, sameBeyond3: 0, topRef: null, topCount: 0 };
  const by = new Map();
  for (const p of pairs) {
    const g = grade(p.older, p.newer);
    if (!g.real) continue;
    if (g.blind) { t.blind++; continue; }
    t.real++;
    if (p.newer.ref != null) by.set(p.newer.ref, (by.get(p.newer.ref) || 0) + 1);
    const a = Math.abs(g.z);
    if (a < 1) t.inside1++;
    if (a > 3) t.beyond3++;
    if (p.sameStandard) { t.same++; if (a < 1) t.sameInside1++; if (a > 3) t.sameBeyond3++; }
  }
  // the paper that is the newer one most often: when one catalogue does most of the testing, the tally leans on it
  for (const [ref, n] of by) if (n > t.topCount) { t.topRef = ref; t.topCount = n; }
  return t;
}
