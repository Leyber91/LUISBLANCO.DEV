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

   The rules (ticket 2.14, decided 2026-11-16 on the evidence of
   plans/exomania/PROBE_L2.md, logged in render_science.md):
   - The starlight is computed from the star's temperature, the
     star's radius and the orbit, S = (R/a)^2 (Teff / 5772 K)^4,
     the inputs of the equilibrium temperature, so the two never
     disagree. The archive's insolation (pl_insol) is used only
     when one of those inputs is missing, and is shown beside the
     computed one where the two differ by more than ARCHIVE_DIFF.
     Before, the page printed the archive's insolation beside an
     equilibrium temperature computed from the star: HD 28109 b
     read 33.5 times Earth's sunlight beside 885 K, which is about
     147 times.
   - The orbit is Kepler's third law from the period, the star's
     mass and the planet's measured mass, wherever the period and
     the star's mass exist; the archive's pl_orbsmax only where one
     is missing, and named beside where the two differ by more than
     ORBIT_DIFF. Decided 2026-11-17 by backtest_orbit.py: the
     composite table can take the orbit from one paper and the star
     from another (Kepler-1649 c), and every independent paper on
     the same star and orbit that decides supports Kepler's law.
     The view D drawing, sheet B's orbit and S all use this one a.
   - The luminosity is the same inputs' R^2 (Teff / 5772 K)^4, so
     that S = L / a^2 for every planet the page can compute; the
     archive's st_lum only when the radius or the temperature is
     missing.
   - S carries the snapshot's errors on Teff, R and a: MC.draws
     draws, the median and the 16th and 84th percentiles. The
     equilibrium temperature is Teff (R / 2a)^(1/2) (1 - A)^(1/4) of
     the same draws, so its median and range are those of S, in
     kelvin: T = T_ZERO S^(1/4) (1 - A)^(1/4).
   - Every planet is drawn with one table of deviates, made once
     (DEVIATES), three a draw: the star's temperature, its radius
     and the orbit. So the draws of a star are the same for every
     planet the archive lists it with, and the orbit's error moves
     with them: two planets of one star keep their order against
     the zone's edges, and the system view, which draws one planet's
     zone around all of them, agrees with each planet's own sheet.
     Each planet's own median and range are those of its errors;
     only planets of different stars share deviates, which no
     printed number compares. One table, and not a stream for each
     star, and a selection of the three shares, not a sort, because
     the whole catalogue is drawn on the page's thread when the
     radius against insolation diagram first draws: a stream and a
     sort for each planet took 660 ms on this machine, the table and
     the selection about 100 ms (main's archive values: 2 ms).
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

import { PHYS, KOPPARAPU, MC, TEQ } from './config.js';
import { mulberry32, seedOf, normalFrom } from '../kit/rng.js';
import { int, num, range } from '../kit/format.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pos = (v) => isNum(v) && v > 0;
const sd = (e) => (pos(e) ? e : 0);

/* The equilibrium temperature at 1 S_earth and zero albedo: 5772 K x (1 R_sun / 2 AU)^(1/2), 278.3 K. */
export const T_ZERO = PHYS.T_SUN * Math.sqrt(PHYS.R_SUN_KM / PHYS.AU_KM / 2);
/* The archive's insolation is shown beside the computed one when either is more than this many times the other. */
export const ARCHIVE_DIFF = 1.2;

/* Luminosity in L_sun: from the star's radius and temperature (Stefan-Boltzmann), else the archive's log L. */
export function luminosity(p) {
  const archive = isNum(p.logL) ? Math.pow(10, p.logL) : null;
  if (pos(p.Rs) && pos(p.Teff)) return { L: p.Rs * p.Rs * Math.pow(p.Teff / PHYS.T_SUN, 4), src: 'R and Teff', archive };
  if (archive !== null) return { L: archive, src: 'archive', archive };
  return { L: null, src: 'none', archive: null };
}

/* Earth's mass in solar masses: the ratio of the two GM (IAU 2015 nominal), 3.986004e14 / 1.3271244e20. */
export const M_EARTH_IN_SUN = 3.986004e14 / 1.3271244e20;
/* The archive's orbit is named beside Kepler's when the two differ by more than this share. */
export const ORBIT_DIFF = 0.10;
const TRUE_MASS = new Set(['Mass', 'Msini', 'Msin(i)/sin(i)']);
/* The planet's own mass in solar masses where the archive measures one (a minimum mass counts); else none. A bound on
   the mass is never used (catalog.js has already moved it out of p.M). */
const ownMass = (p) => (pos(p.M) && TRUE_MASS.has(p.Mprov) ? p.M * M_EARTH_IN_SUN : 0);

/* Orbit size in AU: { a, src, archive }. Kepler's third law from the period, the star's mass and the planet's own
   measured mass, wherever the period and the star's mass exist; the archive's pl_orbsmax only where one is missing.
   Decided 2026-11-17 by labs/assets/data/exomania/backtest_orbit.py: the composite table takes its orbit from one paper
   and the star from another, and where independent papers describe the same star and orbit, every one of them that
   decides supports Kepler's law (Kepler-1649 c: 0.0649 AU in the archive from an old stellar mass, 0.0827 AU from the
   0.198 solar masses its discovery paper gives, which states 74% of Earth's flux). archive: the archive's value,
   shown beside where it differs by more than ORBIT_DIFF. */
export function semiMajor(p) {
  const archive = isNum(p.a) ? p.a : null;
  if (pos(p.P) && pos(p.Ms)) return { a: Math.cbrt(Math.pow(p.P / 365.25, 2) * (p.Ms + ownMass(p))), src: "Kepler's third law", archive };
  if (archive !== null) return { a: archive, src: 'archive', archive };
  return { a: null, src: 'none', archive: null };
}
/* Whether the archive's orbit is to be named beside the one Kepler's law gives. */
export const orbitDiffers = (o) => o.src === "Kepler's third law" && pos(o.archive) && Math.abs(o.a / o.archive - 1) > ORBIT_DIFF;
/* What the page says about the orbit: where it comes from, and the archive's value where it differs. */
export function orbitNote(o) {
  if (o.src === 'archive') return 'The orbit is the archive\'s: it lacks the period or the star\'s mass.';
  if (o.src !== "Kepler's third law") return '';
  const base = 'The orbit is derived from the period and the star\'s mass, by Kepler\'s third law.';
  if (!orbitDiffers(o)) return base;
  const pc = Math.round(Math.abs(o.archive / o.a - 1) * 100);
  return `${base} The archive lists ${num(o.archive, 3)} AU (NASA Exoplanet Archive, PSCompPars), ${pc}% ${o.archive > o.a ? 'more' : 'less'}.`;
}

/* The starlight at a, for a star of temperature T and radius R, relative to Earth's. */
export const fluxFrom = (T, R, a) => { const t = T / PHYS.T_SUN; return R * R / (a * a) * (t * t) * (t * t); };

/* The deviates every planet is drawn with: 3 x MC.draws standard normals from one seeded generator, made on first use. */
let table = null;
export const DEVIATES = () => {
  if (!table) {
    const z = normalFrom(mulberry32(seedOf('exomania', 'starlight')));
    table = new Float64Array(3 * MC.draws);
    for (let i = 0; i < table.length; i++) table[i] = z();
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

const memo = new WeakMap();
let work = null;
/* The starlight a planet receives, relative to Earth's: { S, lo, hi, src, archive, ratio }.
   src 'star': from Teff, R and a, the median of the draws, lo and hi its 68% range (null when the snapshot gives
   none of the three an error); 'archive': the archive's insolation, because one of the three is missing;
   'L / a^2': the archive's luminosity over the orbit, when the archive gives no insolation either; 'none'.
   archive: the archive's insolation, whichever is used; ratio: archive / S. */
export function starlight(p) {
  let out = memo.get(p);
  if (!out) { out = compute(p); memo.set(p, out); }
  return out;
}
function compute(p) {
  const { a, src: aSrc } = semiMajor(p);
  const archive = pos(p.S) ? p.S : null;
  if (pos(p.Teff) && pos(p.Rs) && pos(a)) {
    const eT = sd(p.TeffErr), eR = sd(p.RsErr), eA = aSrc === 'archive' ? sd(p.aErr) : 0;
    let S = fluxFrom(p.Teff, p.Rs, a), lo = null, hi = null;
    if (eT || eR || eA) {
      // three deviates a draw from the one table, whichever errors this row has
      const z = DEVIATES(), d = work || (work = new Float64Array(MC.draws));   // one buffer: a planet is drawn at once
      let n = 0;
      for (let k = 0; k < MC.draws; k++) {
        const T = p.Teff + eT * z[3 * k], R = p.Rs + eR * z[3 * k + 1], aa = a + eA * z[3 * k + 2];
        if (T > 0 && R > 0 && aa > 0) d[n++] = fluxFrom(T, R, aa);
      }
      if (n) ({ S, lo, hi } = shares(d, n));
    }
    return { S, lo, hi, src: 'star', archive, ratio: archive === null ? null : archive / S };
  }
  if (archive !== null) return { S: archive, lo: null, hi: null, src: 'archive', archive, ratio: 1 };
  const { L } = luminosity(p);
  if (pos(L) && pos(a)) return { S: L / (a * a), lo: null, hi: null, src: 'L / a^2', archive: null, ratio: null };
  return { S: null, lo: null, hi: null, src: 'none', archive: null, ratio: null };
}
/* The name the rest of the page has always called it by. */
export const insolation = starlight;

/* Whether the archive's insolation is to be shown beside the computed one. */
export const archiveDiffers = (s) => s.src === 'star' && isNum(s.ratio) && Math.max(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;
/* Whether the archive's luminosity is to be named beside the one computed from the star's radius and temperature. */
export const luminosityDiffers = (L) => L.src === 'R and Teff' && pos(L.archive) && Math.max(L.archive / L.L, L.L / L.archive) > ARCHIVE_DIFF;

/* The equilibrium temperature at Bond albedo A with full redistribution: { med, lo, hi, src }, the starlight's draws
   in kelvin; null with no starlight. */
export function teqOf(p, albedo = TEQ.albedo) {
  const s = starlight(p);
  if (!pos(s.S)) return null;
  const k = T_ZERO * Math.pow(1 - albedo, 0.25);
  const t = (x) => (isNum(x) ? k * Math.pow(x, 0.25) : null);
  return { med: t(s.S), lo: t(s.lo), hi: t(s.hi), src: s.src };
}
/* Its median, for the callers that need one number. */
export const equilibriumTemp = (p, albedo = TEQ.albedo) => { const t = teqOf(p, albedo); return t ? t.med : null; };

/* ---------- how the two are printed, everywhere ---------- */

/* { v, pm, text }: the value to three figures, its 68% range to two in words ('' without one), and the two in one phrase
   with the unit. */
export function starlightText(s) {
  if (!pos(s.S)) return { v: '', pm: '', text: '' };
  const v = num(s.S, 3), pm = range(s.lo, s.hi, 2);   // ranges to two figures, as every range of sheet B: three cut its column
  return { v, pm, text: `${v} S⊕${pm ? ` (68%: ${pm})` : ''}` };
}
export function teqText(t) {
  if (!t) return { v: '', pm: '', text: '' };
  const v = int(t.med), pm = isNum(t.lo) && isNum(t.hi) ? `${int(t.lo)} to ${int(t.hi)}` : '';
  return { v, pm, text: `${v} K${pm ? ` (68%: ${pm})` : ''}` };
}

/* What the page says about where the starlight comes from, and the archive's value where it differs. */
export function starlightNote(p, s = starlight(p)) {
  if (s.src === 'star') {
    const base = 'The starlight is computed from the star\'s temperature, the star\'s radius and the orbit, S = (R★ / a)² (Teff / 5772 K)⁴, the inputs of the equilibrium temperature.';
    if (!archiveDiffers(s)) return base;
    const f = s.ratio > 1 ? s.ratio : 1 / s.ratio;
    return `${base} The archive lists ${num(s.archive, 3)} S⊕ (NASA Exoplanet Archive, PSCompPars), ${num(f, 2)} times ${s.ratio > 1 ? 'more' : 'less'}.`;
  }
  const { a } = semiMajor(p);
  const lacks = [!pos(p.Teff) && 'the star\'s temperature', !pos(p.Rs) && 'the star\'s radius', !pos(a) && 'the orbit'].filter(Boolean).join(' and ');
  if (s.src === 'archive') return `The archive's insolation (NASA Exoplanet Archive, PSCompPars): it lacks ${lacks}, so the starlight cannot be computed from the star.`;
  if (s.src === 'L / a^2') return `The starlight is the archive's luminosity over the orbit, L / a²: it lacks ${lacks} and gives no insolation.`;
  return '';
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
