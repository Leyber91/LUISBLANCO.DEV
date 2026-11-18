/* ============================================================
   exoplanet/starlight.js: one number for each of four things the
   survey prints, and one place on the habitable zone. Pure: no
   page, no storage.

     the star's luminosity      luminosity(p)
     the orbit                  semiMajor(p)
     the starlight a planet     starlight(p), insolation(p)
       receives, with its 68% range
     its equilibrium            teqOf(p, A), equilibriumTemp(p, A)
       temperature, the same
       draws' median and range
     where it sits against      hzPosition(p), habitableZone(p),
       the habitable zone         zoneWords(pos, form)

   Every view that prints or draws one of these calls these
   functions: sheets A and B, the compare bench, the survey note,
   the inference chain, the system view's drawing and caption, the
   list of results, the export. tests/onesource.test.mjs reads what
   each of them prints, for every planet of the catalogue, and
   fails on two numbers for one quantity or two zones for one
   planet.

   The rules (ticket 2.14; each choice among data decided by a
   backtest in labs/assets/data/exomania, logged in
   render_science.md):
   - The starlight is the star's luminosity over the square of the
     orbit, S = L / a^2 (L in solar luminosities, a in AU, S in
     Earth's), and the equilibrium temperature is computed from the
     same S, so the two never disagree. The archive's insolation
     (pl_insol) is used only when the orbit or the star is missing,
     and is shown beside the computed one where the two differ by
     more than ARCHIVE_DIFF. Before, the page printed the archive's
     insolation beside an equilibrium temperature computed from the
     star: HD 28109 b read 33.5 times Earth's sunlight beside 885 K,
     which is about 147 times.
   - The luminosity is the archive's st_lum wherever the snapshot
     has one, and R^2 (Teff / 5772 K)^4 from the star's radius and
     temperature only where it has none. Why (2026-11-17, logged in
     render_science.md): for Kepler stars the archive's luminosity
     rests on Gaia DR2 parallaxes and the composite's radius mostly
     on papers before Gaia; for the M dwarfs of the named worlds the
     papers measure the luminosity and derive the radius from it
     (Teegarden's Star b: R^2 Teff^4 gives 1.61 times Earth's
     sunlight, its papers 1.15 and 1.08). backtest_starlight.py's
     2,283 to 1,071 is mostly that shared parallax (1,816 of its
     3,354 rows pair Berger et al. 2018 with a TICv8 luminosity);
     where reference and luminosity share no catalogue the two
     rules tie (137 to 124).
   - The orbit is Kepler's third law from the period, the star's
     mass and the planet's measured mass, except for a planet of two
     stars and a star whose values in the snapshot cite Stassun et
     al. 2017, which take the archive's pl_orbsmax (backtest_orbit.py,
     2026-11-17, over all 216 planets whose two orbits differ by more
     than 10%: the rule picks the orbit nearer the other papers' for
     116 of 150, the archive's alone for 83, Kepler's law alone for
     67). The archive's orbit also where the period or the star's
     mass is missing, and named beside Kepler's where the two differ
     by more than ORBIT_DIFF of the archive's. The view D drawing,
     sheet B's orbit and S all use this one a.
   - S is the median of MC.draws draws with its 16th and 84th
     percentiles only where the snapshot carries an error on every
     input; a range over some of them would be narrower than the
     truth (WASP-17 b's orbit error alone gave 1.3% where its
     luminosity's is 7.4%). The snapshot carries no error on the
     archive's luminosity, and none on an orbit from Kepler's law (no
     error on the period or the star's mass), so most planets print
     a point value and name the error that is missing
     (errorWords). The equilibrium temperature is
     T_ZERO S^(1/4) (1 - A)^(1/4) of the same draws, so its median
     and range are those of S, in kelvin.
   - Every planet is drawn with one table of deviates, made once
     (DEVIATES), three a draw: the star's temperature, its radius
     and the orbit, each column a stratified sample of the normal.
     So the draws of a star are the same for every planet the
     archive lists it with, and the orbit's error moves with them:
     two planets of one star keep their order against the zone's
     edges, and the system view, which draws one planet's zone
     around all of them, agrees with each planet's own sheet. Each
     planet's own median and range are those of its errors; only
     planets of different stars share deviates, which no printed
     number compares. The radius and the temperature are drawn
     independently: the snapshot carries no correlation between
     them. One table, and not a stream for each star, and a
     selection of the three shares, not a sort, because the whole
     catalogue is drawn on the page's thread when the radius against
     insolation diagram first draws: a stream and a sort for each
     planet took 660 ms on this machine, the table and the selection
     about 100 ms (main's archive values: 2 ms).
   - The zone is placed by that S on every view. Its edges are the
     fluxes of Kopparapu et al. 2013 at the star's temperature; in
     AU they are where the same starlight falls, a sqrt(S / S_edge),
     so the system view draws an orbit inside the zone exactly when
     the sheet says it is inside.
   - "The habitable zone" means the conservative one (runaway to
     maximum greenhouse) unless the text names the optimistic one
     (recent Venus to early Mars).
   - A star outside the fit's 2,600 to 7,200 K has its edges taken
     at the nearer end of that range, and every view that names its
     zone says "extrapolated".
   ============================================================ */

import { PHYS, KOPPARAPU, MC, TEQ, CIRCUMBINARY, STASSUN_MASS_OFF } from './config.js';
import { mulberry32, seedOf, shuffle } from '../kit/rng.js';
import { int, num, MINUS } from '../kit/format.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => isNum(v) && v > 0;
const sd = (e) => (pos(e) ? e : 0);

/* The equilibrium temperature at 1 S_earth and zero albedo: 5772 K x (1 R_sun / 2 AU)^(1/2), 278.3 K. */
export const T_ZERO = PHYS.T_SUN * Math.sqrt(PHYS.R_SUN_KM / PHYS.AU_KM / 2);
/* The archive's insolation is shown beside the computed one when either is more than this many times the other. */
export const ARCHIVE_DIFF = 1.2;

/* Luminosity in L_sun: { L, src, archive, fromStar }. The archive's st_lum (10^log L) wherever the snapshot has one;
   R^2 (Teff / 5772 K)^4 from the star's radius and temperature (Stefan-Boltzmann, R in R_sun) only where it has none.
   Decided 2026-11-17 on the parallax and the M dwarfs' method (the header above; render_science.md), with
   labs/assets/data/exomania/backtest_starlight.py's counts as a witness. archive and fromStar: the two values; the
   second is named beside the first where they differ by more than ARCHIVE_DIFF, and where they differ by more than
   LUMINOSITY_SPLIT the sheet says they disagree and that the starlight rests on the luminosity. */
export function luminosity(p) {
  const archive = isNum(p.logL) ? Math.pow(10, p.logL) : null;
  const fromStar = pos(p.Rs) && pos(p.Teff) ? p.Rs * p.Rs * Math.pow(p.Teff / PHYS.T_SUN, 4) : null;
  if (archive !== null) return { L: archive, src: 'archive', archive, fromStar };
  if (fromStar !== null) return { L: fromStar, src: 'R and Teff', archive, fromStar };
  return { L: null, src: 'none', archive, fromStar };
}
/* The factor between the archive's luminosity and R^2 (Teff / 5772 K)^4, either way up; null without both. */
export const luminosityApart = (L) => (L.src === 'archive' && pos(L.fromStar) ? Math.max(L.fromStar / L.L, L.L / L.fromStar) : null);
/* Whether the luminosity from the star's radius and temperature is to be named beside the archive's. */
export const luminosityDiffers = (L) => luminosityApart(L) > ARCHIVE_DIFF;
/* Past this factor the sheet names the disagreement and says the starlight rests on the luminosity, without a cause: for
   21 planets on 2026-11-17 one paper gives the luminosity, the radius and the temperature, so the two are not always two
   solutions from two papers (the final verification of pull request 50). The factor is the
   95th percentile of the factor over the snapshot (1.96 over 6,129 planets; tests/onesource.test.mjs computes it and
   holds this constant to it at two figures), where 1.2 is about where one paper's own solution ends. */
export const LUMINOSITY_SPLIT = 2.0;

/* Earth's mass in solar masses: the ratio of the two GM (IAU 2015 nominal), 3.986004e14 / 1.3271244e20. */
export const M_EARTH_IN_SUN = 3.986004e14 / 1.3271244e20;
/* The archive's orbit is named beside Kepler's when the two differ by more than this share of the archive's. */
export const ORBIT_DIFF = 0.10;
/* The star's reference whose masses Kepler's law is not applied to (backtest_orbit.py), by its name in the snapshot. */
export const STASSUN = 'Stassun et al. 2017';
const TWO_STARS = new Set(CIRCUMBINARY);
const TRUE_MASS = new Set(['Mass', 'Msini', 'Msin(i)/sin(i)']);
/* The planet's own mass in solar masses where the archive measures one (a minimum mass counts); else none. A bound on
   the mass is never used (catalog.js has already moved it out of p.M). */
const ownMass = (p) => (pos(p.M) && TRUE_MASS.has(p.Mprov) ? p.M * M_EARTH_IN_SUN : 0);

/* Orbit size in AU: { a, src, why, archive, err }. Decided 2026-11-17 by labs/assets/data/exomania/backtest_orbit.py,
   over every planet whose two orbits differ by more than ORBIT_DIFF, against Kepler's law on the median of the star's
   masses that the other papers give:
   - a planet of two stars (config.js CIRCUMBINARY) takes the archive's orbit, and has none where the archive gives none:
     Kepler's law on one star's mass does not give its orbit (why 'two stars');
   - a star whose reference in the snapshot is Stassun et al. 2017 takes the archive's orbit (why 'star mass'): Kepler's
     law on that paper's masses was the nearer for 5 of the 61 planets where the two differ;
   - every other planet takes Kepler's third law from the period, the star's mass and the planet's measured mass,
     wherever the period and the star's mass exist (Kepler-1649 c: 0.0649 AU in the archive from an old stellar mass,
     0.0827 AU from the 0.198 solar masses of its discovery paper, which states 74% of Earth's flux);
   - the archive's pl_orbsmax where one of them is missing (why 'missing').
   archive: the archive's value. err: the orbit's error the draws carry: the archive's on the archive's orbit, none on
   Kepler's, because the snapshot carries no error on the period or the star's mass. */
export function semiMajor(p) {
  const archive = pos(p.a) ? p.a : null;
  const theirs = (why) => (archive !== null ? { a: archive, src: 'archive', why, archive, err: sd(p.aErr) } : { a: null, src: 'none', why, archive, err: 0 });
  if (TWO_STARS.has(p.name)) return theirs('two stars');
  if (archive !== null && p.refs && p.refs.star && String(p.refs.star.label).trim() === STASSUN) return theirs('star mass');
  if (pos(p.P) && pos(p.Ms)) return { a: Math.cbrt(Math.pow(p.P / 365.25, 2) * (p.Ms + ownMass(p))), src: "Kepler's third law", why: '', archive, err: 0 };
  return theirs('missing');
}
/* Whether the archive's orbit is to be named beside the one Kepler's law gives: their difference as a share of the
   archive's, the base the note's percentage is taken on too. */
export const orbitDiffers = (o) => o.src === "Kepler's third law" && pos(o.archive) && Math.abs(o.a / o.archive - 1) > ORBIT_DIFF;
/* What the page says about the orbit: where it comes from, and the archive's value where it differs. */
export function orbitNote(o) {
  if (o.why === 'two stars') {
    return o.src === 'archive' ? 'The orbit is the archive\'s: the planet orbits two stars, and Kepler\'s third law on one star\'s mass does not give it.'
      : 'The orbit is unknown: the planet orbits two stars, and the archive gives none.';
  }
  if (o.why === 'star mass') return `The orbit is the archive's: the star's values in the snapshot cite ${STASSUN}, whose star masses sit a median ${Math.round(STASSUN_MASS_OFF * 100)}% from other papers', so Kepler's third law is not applied to them.`;
  if (o.src === 'archive') return 'The orbit is the archive\'s: it lacks the period or the star\'s mass.';
  if (o.src !== "Kepler's third law") return '';
  const base = 'The orbit is derived from the period and the star\'s mass, by Kepler\'s third law.';
  if (!orbitDiffers(o)) return base;
  const pc = Math.round(Math.abs(o.a / o.archive - 1) * 100);
  return `${base} The archive lists ${num(o.archive, 3)} AU (NASA Exoplanet Archive, PSCompPars); this orbit is ${pc}% ${o.a > o.archive ? 'wider' : 'narrower'}.`;
}
/* A system's planets in the order of the page's orbit (the order the survey keeps a system in, main.js); those with no
   orbit after them, by their period. */
export function byOrbit(planets) {
  const key = (p) => semiMajor(p).a;
  return planets.slice().sort((x, y) => {
    const ax = key(x), ay = key(y);
    if (ax !== null && ay !== null) return ax - ay;
    if (ax !== null || ay !== null) return ax !== null ? -1 : 1;
    return (isNum(x.P) ? x.P : Infinity) - (isNum(y.P) ? y.P : Infinity) || 0;   // equivalent: two with neither give NaN, which a sort reads as 0
  });
}

/* The starlight at a, for a star of temperature T and radius R, relative to Earth's: R in R_sun and a in AU. */
export const fluxFrom = (T, R, a) => { const t = T / PHYS.T_SUN; return R * R / (a * a) * (t * t) * (t * t); };

/* The standard normal's quantile: the x below which a share u of it lies (Acklam's rational approximation, relative
   error below 1.2e-9). Its three pieces meet at u = 0.02425 and 1 - 0.02425 where they agree to that error, so which
   piece takes the meeting point is not observable. */
const QA = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const QB = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const QC = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const QD = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
const tail = (q) => (((((QC[0] * q + QC[1]) * q + QC[2]) * q + QC[3]) * q + QC[4]) * q + QC[5]) / ((((QD[0] * q + QD[1]) * q + QD[2]) * q + QD[3]) * q + 1);
export function normalQuantile(u) {
  if (u < 0.02425) return tail(Math.sqrt(-2 * Math.log(u)));   // equivalent: the pieces agree at the meeting point
  if (u > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - u)));   // equivalent: the pieces agree at the meeting point
  const q = u - 0.5, r = q * q;
  return (((((QA[0] * r + QA[1]) * r + QA[2]) * r + QA[3]) * r + QA[4]) * r + QA[5]) * q / (((((QB[0] * r + QB[1]) * r + QB[2]) * r + QB[3]) * r + QB[4]) * r + 1);
}

/* The deviates every planet is drawn with: MC.draws draws of three standard normals, one for each input that can carry
   an error (the star's temperature, its radius, the orbit). Each column holds the normal's quantiles at
   (i + 0.5) / MC.draws, each once, in an order one seeded generator shuffles (a stratified sample): so each column's
   median and 16th and 84th percentiles are the normal's own. 400 free draws had skewed every planet's range one way
   (this seed's temperature column: mean -0.106, sd 1.053). Made on first use. */
let table = null;
export const DEVIATES = () => {
  if (!table) {
    const n = MC.draws, rng = mulberry32(seedOf('exomania', 'starlight'));
    const col = Array.from({ length: n }, (_, i) => normalQuantile((i + 0.5) / n));
    table = new Float64Array(3 * n);
    for (let c = 0; c < 3; c++) { const s = shuffle(col, rng); for (let k = 0; k < n; k++) table[3 * k + c] = s[k]; }
  }
  return table;
};

/* The value that would stand at index k of a[from..to] sorted, found without sorting (Hoare's selection, middle
   pivot). It reorders that part of a so that what is left of k is no larger and what is right of it no smaller, which
   lets the next share be looked for on one side only. On 400 draws it takes half the time of a sort. */
export function kth(a, k, from, to) {
  let lo = from, hi = to;
  while (hi > lo) {
    const x = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < x) i++;
      while (a[j] > x) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return a[k];
}
/* The median and the 68% range of the first n draws: the values at floor(f n) of them sorted, for f 0.5, 0.16 and 0.84,
   as the page's other ranges take them (science.js monteCarlo). The median first; then each end on its side of it. */
export function shares(d, n) {
  const im = Math.floor(0.5 * n), il = Math.floor(0.16 * n), ih = Math.min(n - 1, Math.floor(0.84 * n));   // equivalent: f is 0.84 at most, so floor(f n) never reaches n
  const S = kth(d, im, 0, n - 1);
  return { S, lo: il < im ? kth(d, il, 0, im - 1) : S, hi: ih > im ? kth(d, ih, im + 1, n - 1) : S };
}

/* What a planet's starlight is computed from: src, the inputs, those whose error the snapshot carries (have), and those
   drawn: all of them when every input has an error, else none, since a range over some of the errors is narrower than
   the truth. 'luminosity': the archive's luminosity over the orbit, S = L / a^2; the snapshot carries no error on L, so
   it is never drawn. 'star': R^2 (Teff / 5772 K)^4 / a^2, where the snapshot gives the star no luminosity. 'archive':
   the archive's insolation, where the orbit or the star is missing. */
const every = (inputs, have) => (have.length === inputs.length ? have : []);
function plan(p) {
  const o = semiMajor(p), a = o.a, L = luminosity(p), archive = pos(p.S) ? p.S : null;
  if (L.src === 'archive' && pos(a)) {
    const have = o.err ? ['a'] : [];
    return { src: 'luminosity', a, eA: o.err, L: L.L, inputs: ['L', 'a'], have, drawn: every(['L', 'a'], have), archive };
  }
  if (L.src === 'R and Teff' && pos(a)) {
    const eT = sd(p.TeffErr), eR = sd(p.RsErr), have = [eT && 'Teff', eR && 'Rs', o.err && 'a'].filter(Boolean);
    return { src: 'star', a, eA: o.err, eT, eR, inputs: ['Teff', 'Rs', 'a'], have, drawn: every(['Teff', 'Rs', 'a'], have), archive };
  }
  if (archive !== null) return { src: 'archive', inputs: ['S'], have: [], drawn: [], archive };
  return { src: 'none', inputs: [], have: [], drawn: [], archive: null };
}
const pointOf = (p, q) => (q.src === 'luminosity' ? q.L / (q.a * q.a) : q.src === 'star' ? fluxFrom(p.Teff, p.Rs, q.a) : q.src === 'archive' ? q.archive : null);
/* The draws of the starlight into d, three deviates a draw from the one table; their count. A draw that puts an input
   at or below zero is left out. Only the star's path is ever drawn: the snapshot carries no error on the archive's
   luminosity, so plan() never draws the luminosity's path (a luminosity error in the snapshot would add it here). */
function fill(p, q, d) {
  const z = DEVIATES();
  let n = 0;
  for (let k = 0; k < MC.draws; k++) {
    const aa = q.a + q.eA * z[3 * k + 2];
    const T = p.Teff + q.eT * z[3 * k], R = p.Rs + q.eR * z[3 * k + 1];
    if (T > 0 && R > 0 && aa > 0) d[n++] = fluxFrom(T, R, aa);
  }
  return n;
}

const memo = new WeakMap();
let work = null;
/* The starlight a planet receives, relative to Earth's: { S, lo, hi, src, inputs, drawn, archive, ratio }. S is the
   median of the draws and lo and hi its 68% range, over the errors the snapshot carries for this planet; where it
   carries none, S is the point value and lo and hi are null. src, inputs, drawn: as plan() above. archive: the
   archive's insolation, whichever is used; ratio: archive / S. */
export function starlight(p) {
  let out = memo.get(p);
  if (!out) { out = compute(p); memo.set(p, out); }
  return out;
}
function compute(p) {
  const q = plan(p);
  let S = pointOf(p, q), lo = null, hi = null;
  if (q.drawn.length) {
    const d = work || (work = new Float64Array(MC.draws));   // one buffer: a planet is drawn at once
    const n = fill(p, q, d);
    if (n) ({ S, lo, hi } = shares(d, n));
  }
  return { S, lo, hi, src: q.src, inputs: q.inputs, have: q.have, drawn: q.drawn, archive: q.archive, ratio: q.archive === null || !pos(S) ? null : q.archive / S };
}
/* The draws themselves, in the table's order, for a quantity drawn with the starlight (science.js, the scale height's
   temperature); null unless the snapshot gives every input an error. */
export function starlightDraws(p) {
  const q = plan(p);
  if (!q.drawn.length) return null;
  const d = new Float64Array(MC.draws), n = fill(p, q, d);
  return n ? d.subarray(0, n) : null;
}
/* The name the rest of the page has always called it by. */
export const insolation = starlight;

/* How the catalogue's starlight is computed, the method's numbers: how many planets take it each way (src), how many
   carry a range (an error on every input), how many print a point value, and how many of those have an error on some
   input but not on all (partial). */
export function starlightCensus(list) {
  const c = { n: 0, luminosity: 0, star: 0, archive: 0, ranged: 0, point: 0, partial: 0 };
  for (const p of list) {
    const s = starlight(p);
    if (!pos(s.S)) continue;
    c.n++; c[s.src]++;
    if (isNum(s.lo)) c.ranged++;
    else if (s.src !== 'archive') { c.point++; if (s.have.length) c.partial++; }
  }
  return c;
}

/* Whether the archive's insolation is to be shown beside the computed one. */
export const archiveDiffers = (s) => s.src !== 'archive' && isNum(s.ratio) && Math.max(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;

/* The words for what a range carries, from the inputs and the errors drawn: { carried, missing }. */
const INPUT = { L: 'the star\'s luminosity', Teff: 'the star\'s temperature', Rs: 'the star\'s radius', a: 'the orbit', S: 'the archive\'s insolation' };
const listed = (xs, w) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${w} ${xs[xs.length - 1]}`);
export function errorWords(s) {
  const drawn = s.drawn || [], have = s.have || drawn, yes = drawn.map((k) => INPUT[k]), no = (s.inputs || []).filter((k) => !have.includes(k)).map((k) => INPUT[k]);
  return { carried: yes.length ? `the error${yes.length > 1 ? 's' : ''} of ${listed(yes, 'and')}` : '', missing: no.length ? `the snapshot carries no error on ${listed(no, 'or')}` : '' };
}

/* The equilibrium temperature at Bond albedo A with full redistribution: { med, lo, hi, src, drawn }, the starlight's
   draws in kelvin; null with no starlight. */
export function teqOf(p, albedo = TEQ.albedo) {
  const s = starlight(p);
  if (!pos(s.S)) return null;
  const k = T_ZERO * Math.pow(1 - albedo, 0.25);
  const t = (x) => (isNum(x) ? k * Math.pow(x, 0.25) : null);
  return { med: t(s.S), lo: t(s.lo), hi: t(s.hi), src: s.src, drawn: s.drawn };
}
/* Its median, for the callers that need one number. */
export const equilibriumTemp = (p, albedo = TEQ.albedo) => { const t = teqOf(p, albedo); return t ? t.med : null; };

/* A published temperature more than this many times what the starlight gives is the planet's own heat. */
export const OWN_HEAT = 2;
/* Whether the temperature the archive lists for a planet is its own heat and not an equilibrium with its starlight.
   Those are giants that still glow from their formation, most of them found by direct imaging far from their stars:
   the starlight would leave them at a few kelvin, and the temperature the archive lists for them is their own
   (1RXS J160929.1-210524 b, imaged at 330 AU, is listed at 1,700 K where the starlight gives 11 K). Two tests find
   them: the method is imaging, or the published value is more than OWN_HEAT times what the starlight gives at Bond
   albedo 0.3 (bet Pic c, found by radial velocity, is listed at 1,250 K where the starlight gives 269 K). The search
   (find.js tempOf) gives such a planet no temperature to be found by, and the picture (data.js classify) does not
   name it by one. */
export function ownHeat(p) {
  if (p.method === 'Imaging') return true;
  const t = equilibriumTemp(p, 0.3);
  return isNum(p.Teq) && isNum(t) && p.Teq > OWN_HEAT * t;
}

/* ---------- how the two are printed, everywhere ---------- */

/* The one way the starlight and the luminosity are written: sig figures by the kit's num, and below 0.01, where num's
   four decimals would leave fewer than three figures (AB Aur b's 0.006459 printed "0.0065"), as a power of ten:
   6.46 × 10⁻³, 2.60 × 10⁻⁷. */
const SUP = { '-': '⁻', '+': '', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const SMALL = 0.01;
export function starNum(x, sig = 3) {
  if (!isNum(x)) return '';
  if (x <= 0 || x >= SMALL) return num(x, sig);
  const [m, e] = x.toExponential(sig - 1).split('e');
  return `${m} × 10${[...e].map((c) => SUP[c]).join('')}`;
}
/* The number starNum writes, as a number: what a sheet of facts carries so that it says what the page prints. */
export const starValue = (x, sig = 3) => (!isNum(x) ? null : x > 0 && x < SMALL ? +x.toExponential(sig - 1) : +num(x, sig).replace(/,/g, '').replace(MINUS, '-'));

/* { v, pm, point, text }: the value to three figures, its 68% range to two in words ('' without one), whether it is a
   point value for want of errors (never said of the archive's own insolation), and the whole in one phrase with the
   unit. */
export function starlightText(s) {
  if (!pos(s.S)) return { v: '', pm: '', point: false, text: '' };
  const v = starNum(s.S, 3), pm = isNum(s.lo) && isNum(s.hi) ? `${starNum(s.lo, 2)} to ${starNum(s.hi, 2)}` : '';   // ranges to two figures, as every range of sheet B: three cut its column
  const point = !pm && s.src !== 'archive';
  return { v, pm, point, text: `${v} S⊕${pm ? ` (68%: ${pm})` : point ? ', a point value' : ''}` };
}
export function teqText(t) {
  if (!t) return { v: '', pm: '', point: false, text: '' };
  const v = int(t.med), pm = isNum(t.lo) && isNum(t.hi) ? `${int(t.lo)} to ${int(t.hi)}` : '';
  const point = !pm && t.src !== 'archive';
  return { v, pm, point, text: `${v} K${pm ? ` (68%: ${pm})` : point ? ', a point value' : ''}` };
}

/* What the page says about where the starlight comes from, what its range carries, and the archive's value where it
   differs. */
export function starlightNote(p, s = starlight(p)) {
  const ew = errorWords(s);
  const range_ = isNum(s.lo) ? `Its 68% range carries ${ew.carried}.` : ew.missing ? `A point value: ${ew.missing}.` : '';
  const f = luminosityApart(luminosity(p));
  const split = f > LUMINOSITY_SPLIT ? ` The archive's luminosity and the star's radius and temperature differ by a factor of ${num(f, 2)}; the starlight rests on the luminosity.` : '';
  const differs = archiveDiffers(s) ? ` The archive lists ${starNum(s.archive, 3)} S⊕ (NASA Exoplanet Archive, PSCompPars), ${num(s.ratio > 1 ? s.ratio : 1 / s.ratio, 2)} times ${s.ratio > 1 ? 'more' : 'less'}.` : '';
  if (s.src === 'luminosity') return `The starlight is the star's luminosity, the archive's, over the square of the orbit: S = L / a², L in L☉ and a in AU. ${range_}${split}${differs}`;
  if (s.src === 'star') return `The starlight is computed from the star's temperature and radius and the orbit, S = (R★ / a)² (Teff / 5772 K)⁴ with R★ in R☉ and a in AU: the archive gives the star no luminosity. ${range_}${differs}`;
  if (s.src !== 'archive') return '';
  const { a } = semiMajor(p);
  const lacks = [!pos(a) && 'the orbit', luminosity(p).src === 'none' && 'the star\'s luminosity and its radius or temperature'].filter(Boolean).join(' and ');
  return `The archive's insolation (NASA Exoplanet Archive, PSCompPars): it lacks ${lacks}, so the starlight cannot be computed here.`;
}

/* ---------- the habitable zone (Kopparapu et al. 2013 with erratum) ---------- */

/* The flux of one edge at temperature teff, the polynomial in T = Teff - 5780 K, with Teff held inside the fit's range. */
export function seff(teff, c) {
  const T = Math.max(KOPPARAPU.tRange[0], Math.min(KOPPARAPU.tRange[1], teff)) - 5780;
  return c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T + c[4] * T * T * T * T;
}
/* The four edges as fluxes, and whether the star lies outside the fit. Null with no temperature. */
export function zoneEdges(teff) {
  if (!isNum(teff)) return null;
  const K = KOPPARAPU;
  return {
    sInner: seff(teff, K.runaway), sOuter: seff(teff, K.maxGreen),             // conservative
    sInnerOpt: seff(teff, K.recentVenus), sOuterOpt: seff(teff, K.earlyMars),  // optimistic
    extrapolated: teff < K.tRange[0] || teff > K.tRange[1],
  };
}

/* The zone with its edges in AU as well: where the planet's own starlight would be each edge's flux,
   a sqrt(S / S_edge); with no orbit, sqrt(L / S_edge). Null without a temperature, or without both. */
export function habitableZone(p) {
  const e = zoneEdges(p.Teff);
  if (!e) return null;
  const s = starlight(p), { a } = semiMajor(p), { L } = luminosity(p);
  const byS = pos(s.S) && pos(a);
  const scale = byS ? a * Math.sqrt(s.S) : pos(L) ? Math.sqrt(L) : null;
  if (scale === null) return null;
  const d = (x) => scale / Math.sqrt(x);
  return { ...e, inner: d(e.sInner), outer: d(e.sOuter), innerOpt: d(e.sInnerOpt), outerOpt: d(e.sOuterOpt), by: byS ? 'S' : 'L', L, S: byS ? s.S : null };
}

const fmtX = (x) => (x >= 100 ? int(x) : x >= 10 ? x.toFixed(0) : x.toFixed(1)) + 'x';
/* The words every view adds for a star outside the fit. */
export const extrapolatedWords = (teff) => `extrapolated: the star's ${int(teff)} K is outside the ${int(KOPPARAPU.tRange[0])} to ${int(KOPPARAPU.tRange[1])} K the zone was fitted on`;

/* Where the planet sits, by its starlight: { key, label, hz, S, extrapolated }. key: cons, opt, hot, cold or unknown.
   The label names the conservative zone as "the zone" (its edges, for hot and cold) and the optimistic one by name. */
export function hzPosition(p) {
  const e = zoneEdges(p.Teff), s = starlight(p), hz = habitableZone(p);
  if (!e || !pos(s.S)) return { key: 'unknown', label: 'not computable', hz, S: s.S, extrapolated: false };
  const S = s.S;
  const key = S <= e.sInner && S >= e.sOuter ? 'cons' : S <= e.sInnerOpt && S >= e.sOuterOpt ? 'opt' : S > e.sInnerOpt ? 'hot' : 'cold';
  const words = {
    cons: 'inside the conservative habitable zone',
    opt: 'inside the optimistic habitable zone',
    hot: `${fmtX(S / e.sInner)} the flux at the zone's inner edge`,
    cold: `${fmtX(e.sOuter / S)} below the flux at the zone's outer edge`,
  }[key];
  return { key, label: e.extrapolated ? `${words}, ${extrapolatedWords(p.Teff)}` : words, hz, S, extrapolated: e.extrapolated, edges: e };
}

/* The zone as each view words it. form 'label': the full phrase (the bench, the survey note, the chain);
   'word': the sheet's one word; 'reticle': the line under the planet's name. Each says "extrapolated" when the
   star is outside the fit. */
export function zoneWords(pos_, form = 'label') {
  if (form === 'label') return pos_.label;
  const W = form === 'word'
    ? { cons: 'conservative', opt: 'optimistic', hot: 'too hot', cold: 'too cold', unknown: 'unknown' }
    : { cons: 'in the conservative habitable zone', opt: 'in the optimistic habitable zone', hot: 'hotter than the habitable zone', cold: 'colder than the habitable zone', unknown: 'its zone unknown' };
  return pos_.extrapolated ? `${W[pos_.key]}, extrapolated` : W[pos_.key];
}

/* Where an orbit of size a is drawn against a zone hz in AU: the key the system view's drawing shows. */
export function placedAt(hz, a) {
  if (!hz || !pos(a)) return 'unknown';
  if (a >= hz.inner && a <= hz.outer) return 'cons';
  if (a >= hz.innerOpt && a <= hz.outerOpt) return 'opt';
  return a < hz.innerOpt ? 'hot' : 'cold';
}
