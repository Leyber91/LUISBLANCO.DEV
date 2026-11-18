/* ============================================================
   exoplanet/science.js — the survey's engine. Pure functions,
   no DOM. Each one implements a published model named in
   config.js, and returns its inputs' provenance with the result
   so the page can say what was measured and what was inferred.
   ============================================================ */

import { int } from '../kit/format.js';
import { luminosity, semiMajor, insolation, seff, habitableZone, hzPosition, equilibriumTemp, teqOf, starlightDraws, T_ZERO } from './starlight.js';
import { PHYS, CHEN_KIPPING, LIMB, CIE_FIT, XYZ_TO_SRGB, TEQ, VALLEY, SIZE_CLASSES, SEAGER, RV, MC } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => typeof v === 'number' && isFinite(v);
const int3 = (v) => (isNum(v) ? String(Number(v.toPrecision(3))) : '');   // three figures, for a note

/* ---------- star, orbit, starlight, equilibrium temperature, habitable zone ---------- */
/* One number each, in starlight.js (ticket 2.14): every view calls those, and this module passes them on. */
export { luminosity, semiMajor, insolation, seff, habitableZone, hzPosition, equilibriumTemp, teqOf };

/* ---------- mass-radius (Chen & Kipping 2017) ---------- */

function segmentFor(logM) {
  const segs = CHEN_KIPPING.segments;
  for (const s of segs) if (logM < Math.log10(s.upTo)) return s;
  return segs[segs.length - 1];
}
export function meanLogR(logM) { const s = segmentFor(logM); return s.C + s.S * logM; }
export function radiusFromMass(M) { return Math.pow(10, meanLogR(Math.log10(M))); }

/* Deterministic inverse of the mean relation, as the archive computes its
   "M-R relationship" masses. Null where the relation is flat (Jovian). */
export function massFromRadiusMean(R) {
  const lr = Math.log10(R);
  for (const s of CHEN_KIPPING.segments) {
    if (s.S <= 0) continue;
    const lm = (lr - s.C) / s.S;
    const lo = s === CHEN_KIPPING.segments[0] ? -Infinity : Math.log10(CHEN_KIPPING.segments[CHEN_KIPPING.segments.indexOf(s) - 1].upTo);
    if (lm >= lo && lm < Math.log10(s.upTo)) return Math.pow(10, lm);
  }
  return null;
}

/* Probabilistic inversion: posterior over log M given a radius (and its error), with
   a log-uniform prior on mass. A catalogue limit on mass is a censoring bound: an upper
   limit truncates the posterior above it, a lower limit below it. A limit is a bound,
   never a value. Returns median and 16-84 % interval. */
export function forecastMass(R, Rerr, maxM = null, minM = null) {
  if (!isNum(R) || R <= 0) return null;
  const [lo, hi] = CHEN_KIPPING.logMRange;
  const N = 420;
  const lr = Math.log10(R);
  const sObs = isNum(Rerr) && Rerr > 0 ? (Rerr / R) / Math.LN10 : 0;
  const w = new Float64Array(N);
  let tot = 0;
  for (let i = 0; i < N; i++) {
    const lm = lo + (hi - lo) * (i + 0.5) / N;
    const s = segmentFor(lm);
    const sig2 = s.sigma * s.sigma + sObs * sObs;
    const dz = lr - (s.C + s.S * lm);
    const cut = (isNum(maxM) && lm > Math.log10(maxM)) || (isNum(minM) && lm < Math.log10(minM));
    w[i] = cut ? 0 : Math.exp(-0.5 * dz * dz / sig2) / Math.sqrt(sig2);
    tot += w[i];
  }
  if (!(tot > 0)) return null;
  const q = (f) => {
    let acc = 0;
    for (let i = 0; i < N; i++) { acc += w[i] / tot; if (acc >= f) return Math.pow(10, lo + (hi - lo) * (i + 0.5) / N); }
    return Math.pow(10, hi);
  };
  const med = q(0.5);
  const seg = segmentFor(Math.log10(med));
  const bounded = isNum(maxM) ? 'upper' : isNum(minM) ? 'lower' : null;
  return { median: med, lo: q(0.16), hi: q(0.84), regime: seg.name, pdf: w, tot, range: [lo, hi], bounded, bound: bounded === 'upper' ? maxM : bounded === 'lower' ? minM : null };
}

/* An archive limit on a value: { v, dir }, dir 1 an upper limit (the value is below v),
   -1 a lower limit. catalog.js moves every flagged value here and leaves the field null. */
export const limitOf = (p, k) => (p && p.lim && p.lim[k]) || null;
export const limitKind = (L) => (L ? (L.dir > 0 ? 'upper limit' : 'lower limit') : '');
const fmtBound = (v, d) => (Math.abs(v) >= 1000 ? int(v) : String(+(+v).toPrecision(d)));
export const limitText = (L, d = 3) => (L ? `${L.dir > 0 ? '<' : '>'} ${fmtBound(L.v, d)}` : '');

/* the forecast for this record, censored by the archive's mass limit when it gives one */
export function forecastFor(p) {
  const L = limitOf(p, 'M');
  return forecastMass(p.R, p.Rerr, L && L.dir > 0 ? L.v : null, L && L.dir < 0 ? L.v : null);
}
export const hasTrueMass = (p) => isNum(p.M) && !p.Mlim && !limitOf(p, 'M') && (p.Mprov === 'Mass' || p.Mprov === 'Msini' || p.Mprov === 'Msin(i)/sin(i)');
export const hasRadius = (p) => isNum(p.R) && p.R > 0;
/* Whether the radius is the archive's estimate from the mass rather than a measurement: the one place the page decides
   it (catalog.js sets measuredR, from the roster or, before it, from the radius's source). A flag not yet set is not an
   estimate. */
export const radiusEstimated = (p) => p.measuredR === false;

/* ---------- composition curves (Seager et al. 2007) ---------- */
export function seagerRadius(M, mat) {
  const ms = M / mat.m1;
  return mat.r1 * Math.pow(10, mat.k1 + Math.log10(ms) / 3 - mat.k2 * Math.pow(ms, mat.k3));
}
export const SEAGER_MATERIALS = SEAGER.materials;

/* ---------- radial velocity (Lovis & Fischer 2010, eq. 14) ---------- */
export function rvSemiAmplitude(p) {
  const fc = hasTrueMass(p) ? null : forecastFor(p);
  const M = hasTrueMass(p) ? p.M : fc ? fc.median : null;
  if (!isNum(M) || !isNum(p.P) || !isNum(p.Ms)) return null;
  const e = isNum(p.ecc) ? Math.min(p.ecc, 0.95) : 0;
  const K = RV.k0 / Math.sqrt(1 - e * e) * (M / RV.mJupEarth) * Math.pow(p.Ms + M / RV.mSunEarth, -2 / 3) * Math.pow(p.P / 365.25, -1 / 3);
  return { K, e, massSrc: hasTrueMass(p) ? (p.Mprov === 'Mass' ? 'measured' : 'minimum') : 'forecast', M, bounded: fc ? fc.bounded : null, eLimit: limitOf(p, 'ecc') };
}
/* velocity over one orbit; argument of periastron 90 deg when unknown (stated) */
export function rvCurve(p, n = 160) {
  const rv = rvSemiAmplitude(p); if (!rv) return null;
  const { K, e } = rv, w = Math.PI / 2, out = [];
  for (let i = 0; i < n; i++) {
    const Mm = 2 * Math.PI * i / (n - 1);
    let E = Mm; for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - Mm) / (1 - e * Math.cos(E));
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    out.push([i / (n - 1), K * (Math.cos(nu + w) + e * Math.cos(w))]);
  }
  return { ...rv, curve: out };
}

/* ---------- Monte Carlo: catalogue uncertainties into derived values ---------- */
function rng(seedStr) {
  let h = 2166136261 >>> 0; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mcCache = new Map();
/* A positive value with the archive's interval (+up, -down; one missing takes the other's size, lowerError), drawn
   as a split log-normal: the median is the value, the 16th and 84th percentiles are value - down and value + up, so
   both sides of the interval are kept and no draw is zero or negative. The archive does not state the interval's
   level or whether the value is a median; reading it as the 16th to 84th percentiles about the median is this
   page's choice, and so is the log-normal shape between them (the Method dialog says so). Ticket 2.20, 2026-11-17: the
   draws were a normal on the two sides' average, clamped at 0.05 R_earth or 0.001 M_earth; where an error neared its
   value the clamp piled draws at the floor and sheet B printed density ranges such as "17 to 328,558,509 g/cm3"
   (KOI-2513.01; 69 printed density ranges past a factor of 100). open: the value minus its lower error is zero or
   less, so it is not bounded away from zero at 68%; the gravity, density and scale height computed from it get no range (monteCarlo), and its
   lower side is drawn as the mirror of the upper only so the draws exist. Null for a value with no error. */
const errSize = (e) => (isNum(e) && e !== 0 ? Math.abs(e) : null);
/* The size of a value's lower error: the archive's lower error, or its upper where the lower is missing or 0. The one
   rule the draws and the notes read. */
export const lowerError = (up, down) => errSize(down) ?? errSize(up);
export function positiveSpread(v, up, down) {
  const u = errSize(up) ?? errSize(down), d = lowerError(up, down);
  if (!isNum(v) || v <= 0 || u === null) return null;
  const sHi = Math.log((v + u) / v), open = v - d <= 0;
  return { v, sLo: open ? sHi : Math.log(v / (v - d)), sHi, open };
}
/* What every view says of an open range (monteCarlo's open): which value's lower error reaches zero, and what the
   value printed is. '' when the ranges are not open. */
export const OPEN_RANGE = 'no 68% range';
export function openRangeNote(p, mc) {
  if (!mc || !mc.open) return '';
  const [v, e, u, word] = mc.open === 'radius' ? [p.R, lowerError(p.Rerr1, p.Rerr2), 'R⊕', 'radius'] : [p.M, lowerError(p.Merr1, p.Merr2), 'M⊕', 'mass'];
  return `The ${word} minus its lower error (${int3(v)} − ${int3(e)} ${u}) is zero or less, so the gravity, density and scale height computed from it have no 68% range; each is shown at the radius and mass given.${mc.massFrom === 'forecast' ? ' The mass is the forecast\'s median.' : ''}`;
}
/* One draw from a positiveSpread, given a standard normal deviate z. */
export const drawPositive = (sp, z) => sp.v * Math.exp(z * (z < 0 ? sp.sLo : sp.sHi));

export function monteCarlo(p, albedo = TEQ.albedo) {
  const key = p.name + '|' + albedo;
  if (mcCache.has(key)) return mcCache.get(key);
  const rand = rng(p.name);
  const gauss = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // A mass enters only as a measurement or as the forecast posterior, which a mass limit
  // censors. A limit alone is never drawn as a value. With no radius there is no forecast,
  // so no mass draw, and nothing that needs a radius: gravity, density, scale height, class.
  const trueM = hasTrueMass(p), hasR = hasRadius(p);
  // the radius and a measured mass, each with both sides of its interval (positiveSpread); a forecast mass is drawn
  // from its own posterior below
  const spR = hasR ? positiveSpread(p.R, p.Rerr1, p.Rerr2) : null, spM = trueM ? positiveSpread(p.M, p.Merr1, p.Merr2) : null;
  // a range of gravity, density or scale height divides by the radius and the mass: it is open when either is
  const open = spR && spR.open ? 'radius' : spM && spM.open ? 'mass' : null;
  const fc = trueM ? null : forecastFor(p);
  // inverse-CDF sampler on the forecast posterior grid
  let cdf = null;
  if (fc) { cdf = new Float64Array(fc.pdf.length); let acc = 0; for (let i = 0; i < fc.pdf.length; i++) { acc += fc.pdf[i] / fc.tot; cdf[i] = acc; } }
  const sampleM = () => {
    if (trueM) return spM ? drawPositive(spM, gauss()) : p.M;
    if (!fc) return null;
    const u = rand(); let i = 0; while (i < cdf.length - 1 && cdf[i] < u) i++;
    return Math.pow(10, fc.range[0] + (fc.range[1] - fc.range[0]) * (i + rand()) / cdf.length);
  };
  // the scale height's temperature is the starlight's own draws (starlight.js), by the relation teqOf uses: the orbit,
  // the luminosity and their errors are the page's one each, and the Teq printed is teqOf's
  const sDraws = starlightDraws(p), S0 = insolation(p).S, kT = T_ZERO * Math.pow(1 - albedo, 0.25);
  const N = MC.draws, g = [], rho = [], H = [], cls = new Map();
  const mu = p.R > 1.8 ? MC.muEnvelope : MC.muSecondary;   // the radius given's, as the scale height's note says, for every draw
  for (let k = 0; k < N; k++) {
    const R = hasR ? (spR ? drawPositive(spR, gauss()) : p.R) : null;
    const M = hasR ? sampleM() : null;
    const gg = isNum(R) && isNum(M) ? M / (R * R) : null;
    if (isNum(gg)) { g.push(gg); rho.push(5.514 * M / (R * R * R)); }
    if (isNum(R)) { const c = sizeClass(R); cls.set(c.key, (cls.get(c.key) || 0) + 1); }
    const Sk = sDraws ? sDraws[k % sDraws.length] : S0;
    const T = isNum(Sk) ? kT * Math.pow(Sk, 0.25) : null;   // the starlight and its draws are positive (starlight.js keeps no other)
    if (T) {
      if (isNum(gg)) {
        H.push(1.380649e-23 * T / (mu * 1.6726e-27 * 9.80665 * gg) / 1000);   // km
      }
    }
  }
  const stat = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x - y); const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]; return { med: q(0.5), lo: q(0.16), hi: q(0.84) }; };
  // a range that divides by a value not bounded away from zero has no ends; its value is the one at the radius and mass
  // given (a forecast mass: the forecast's median, as every view prints it; that median carries the radius's averaged
  // error, ticket 2.20b), not the median of draws whose lower side is an assumption
  const M0 = trueM ? p.M : hasR && fc ? fc.median : null, R0 = p.R;   // the forecast's median: the mass every view prints
  const g0 = isNum(M0) && isNum(R0) ? M0 / (R0 * R0) : null, T0 = isNum(S0) ? kT * Math.pow(S0, 0.25) : null;
  const point = { g: g0, rho: isNum(g0) ? 5.514 * M0 / (R0 * R0 * R0) : null, H: isNum(g0) && T0 ? 1.380649e-23 * T0 / (mu * 1.6726e-27 * 9.80665 * g0) / 1000 : null };
  const derived = (arr, k) => { const st = stat(arr); return st && open ? { med: point[k], lo: null, hi: null, open } : st; };
  // the size classes' shares come from the radius draws; an open radius has no lower side to draw, so it has none
  const probs = open === 'radius' ? [] : SIZE_CLASSES.map((c) => ({ key: c.key, label: c.label, p: (cls.get(c.key) || 0) / N })).filter((c) => c.p > 0);
  const out = { n: N, g: derived(g, 'g'), teq: teqOf(p, albedo), rho: derived(rho, 'rho'), H: derived(H, 'H'), probs, hasR, open,
    massFrom: !hasR ? 'none' : trueM ? 'measured' : fc ? 'forecast' : 'none', bounded: fc ? fc.bounded : null };
  mcCache.set(key, out);
  return out;
}

/* ---------- validation against the archive's own published values ---------- */
/* Transit: the limb-darkened depth at the archive impact parameter against the published
   depth, and the eq. 3 duration (archive impact
   parameter, circular orbit) against the published duration. Pass = within 10%. */
export function transitValidation(list) {
  let nd = 0, pd = 0, nt = 0, pt = 0;
  const dr = [], tr = [];
  for (const p of list) {
    if (p.method !== 'Transit') continue;
    const geo = transitGeometry(p); if (!geo) continue;
    if (isNum(p.depth) && p.depth > 0) { const r = geo.depthLD * 100 / p.depth; nd++; if (Math.abs(r - 1) <= 0.1) pd++; dr.push(r); }
    if (isNum(p.dur) && p.dur > 0 && isNum(p.b)) { const r = geo.T14 / p.dur; nt++; if (Math.abs(r - 1) <= 0.1) pt++; tr.push(r); }
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  return { depth: { n: nd, pass: pd, rate: nd ? pd / nd : null, median: med(dr) }, dur: { n: nt, pass: pt, rate: nt ? pt / nt : null, median: med(tr) } };
}
/* Withholding test: for planets with a measured (not minimum) mass and a published Teq, hide
   both, forecast the mass from the radius alone and compute Teq at zero albedo. A calibrated
   forecaster puts the measured mass inside its 68% interval about 68% of the time. */
export function withholdingTest(list) {
  const ref = list.filter((p) => p.Mprov === 'Mass' && !p.Mlim && isNum(p.M) && isNum(p.R) && isNum(p.Teq) && isNum(p.Teff)
    && isNum(p.Rs) && isNum(p.a) && isNum(p.Merr1) && p.Merr1 / p.M < 0.3);
  let n = 0, inside = 0, teq = 0, nS = 0, inS = 0;
  for (const p of ref) {
    const f = forecastMass(p.R, p.Rerr); if (!f) continue;
    n++; const ok = p.M >= f.lo && p.M <= f.hi; if (ok) inside++;
    if (p.R < 6) { nS++; if (ok) inS++; }
    const t = equilibriumTemp(p, 0); if (t && Math.abs(t / p.Teq - 1) <= 0.1) teq++;
  }
  return { n, massIn68: n ? inside / n : null, nSmall: nS, massIn68Small: nS ? inS / nS : null, teqWithin10: n ? teq / n : null };
}

/* Equilibrium temperature at zero albedo against the published value. Pass = within 10%. */
export function teqValidation(list) {
  let n = 0, pass = 0; const rs = [];
  for (const p of list) {
    if (!isNum(p.Teq) || !isNum(p.Teff) || !isNum(p.Rs) || !isNum(p.a)) continue;
    const t = equilibriumTemp(p, 0); if (!t) continue;
    const r = t / p.Teq; n++; rs.push(r); if (Math.abs(r - 1) <= 0.1) pass++;
  }
  rs.sort((x, y) => x - y);
  return { n, pass, rate: n ? pass / n : null, median: rs.length ? rs[Math.floor(rs.length / 2)] : null };
}

/* Composition hint from bulk density when a mass is measured. Thresholds in g/cm^3,
   coarse and labelled as such on the page. */
export function density(R, M) {
  if (!isNum(R) || !isNum(M)) return null;
  return 5.514 * M / (R * R * R);
}

/* The size class of a radius; null when there is no radius: a missing value has no class. */
export function sizeClass(R) {
  if (!isNum(R) || R <= 0) return null;
  return SIZE_CLASSES.find((c) => R < c.max) || SIZE_CLASSES[SIZE_CLASSES.length - 1];
}
/* The class of a world: from its radius; with only a radius limit, the class every radius
   the bound allows falls in (a lower limit at or above 8 R_earth is a giant, an upper limit
   below 1.5 is Earth-size), flagged fromLimit; otherwise null. */
export function sizeClassOf(p) {
  if (hasRadius(p)) return { ...sizeClass(p.R), fromLimit: false };
  const L = limitOf(p, 'R');
  const c = L ? sizeClass(L.v) : null;
  if (!c) return null;
  if (L.dir < 0 && c.max === Infinity) return { ...c, fromLimit: true };
  if (L.dir > 0 && c.key === SIZE_CLASSES[0].key) return { ...c, fromLimit: true };
  return null;
}

/* ---------- transit (Seager & Mallen-Ornelas 2003, eq. 3) ---------- */

export function transitGeometry(p) {
  const { a } = semiMajor(p);
  if (!isNum(p.R) || !isNum(p.Rs) || !a || !isNum(p.P)) return null;
  const k = p.R * PHYS.R_EARTH_KM / (p.Rs * PHYS.R_SUN_KM);
  const aRs = a * PHYS.AU_KM / (p.Rs * PHYS.R_SUN_KM);
  const bMeasured = isNum(p.b);
  // with only a limit on b, assume the value nearest 0 the bound allows (the page says so)
  const bLimit = limitOf(p, 'b');
  const b = bMeasured ? clamp(p.b, 0, 1 + k - 1e-4) : bLimit && bLimit.dir < 0 ? clamp(bLimit.v, 0, 1 + k - 1e-4) : 0;
  const sinI = Math.sqrt(Math.max(1e-9, 1 - Math.pow(b / aRs, 2)));
  const arg = Math.sqrt(Math.max(0, (1 + k) * (1 + k) - b * b)) / (aRs * sinI);
  const T14 = arg >= 1 ? p.P * 24 / 2 : (p.P * 24 / Math.PI) * Math.asin(arg);   // hours
  const { u1, u2 } = LIMB;
  const norm = 1 - u1 / 3 - u2 / 6;
  const depthUniform = k * k;
  const mu = Math.sqrt(Math.max(0, 1 - b * b));
  const depthLD = k * k * (1 - u1 * (1 - mu) - u2 * (1 - mu) * (1 - mu)) / norm;
  const geomProb = (1 + k) / aRs;   // probability that a random orientation transits
  return { k, aRs, b, bMeasured, bLimit, T14, depthUniform, depthLD, geomProb, transits: p.method === 'Transit' || isNum(p.depth) || !!limitOf(p, 'depth') };
}

/* Limb-darkened intensity normalised so the disc integrates to 1. */
const I_ld = (r2) => {
  const mu = Math.sqrt(Math.max(0, 1 - r2));
  return (1 - LIMB.u1 * (1 - mu) - LIMB.u2 * (1 - mu) * (1 - mu)) / (Math.PI * (1 - LIMB.u1 / 3 - LIMB.u2 / 6));
};

/* Relative flux when the planet's centre is at distance z (stellar radii) from the
   star's centre: numerical integration over the planet's disc on a polar grid. */
export function fluxAt(z, k, nr = 14, nt = 36) {
  if (z >= 1 + k) return 1;
  let blocked = 0;
  for (let i = 0; i < nr; i++) {
    const rr = k * (i + 0.5) / nr;
    const dA = (Math.PI * 2 / nt) * rr * (k / nr);
    for (let j = 0; j < nt; j++) {
      const th = (j + 0.5) * Math.PI * 2 / nt;
      const x = z + rr * Math.cos(th), y = rr * Math.sin(th);
      const r2 = x * x + y * y;
      if (r2 < 1) blocked += I_ld(r2) * dA;
    }
  }
  return 1 - blocked;
}

/* Light curve sampled across +-span hours of mid-transit. Circular orbit. */
export function lightCurve(geo, P, spanH, n = 160) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const tH = -spanH + 2 * spanH * i / (n - 1);
    const ph = 2 * Math.PI * (tH / 24) / P;
    const x = geo.aRs * Math.sin(ph);
    const y = geo.b * Math.cos(ph);
    const z = Math.hypot(x, y);
    out.push([tH, Math.cos(ph) > 0 ? fluxAt(z, geo.k) : 1]);
  }
  return out;
}

/* ---------- star colour from Teff: Planck x CIE 1931 -> sRGB ---------- */

const lobe = (lam, [w, mu, il, ir]) => { const t = (lam - mu) * (lam < mu ? il : ir); return w * Math.exp(-0.5 * t * t); };
const cmf = (lam, set) => set.reduce((s, l) => s + lobe(lam, l), 0);
const planck = (lamNm, T) => { const l = lamNm * 1e-9; return 1 / (Math.pow(l, 5) * (Math.exp(1.4387769e-2 / (l * T)) - 1)); };
const gammaEnc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/* The share of a blackbody's power that the eye weighs as light: Planck's law times the CIE
   photopic curve (the y-bar fit above), over the whole spectrum. The whole-spectrum integral of
   the planck() used here is (T / c2)^4 pi^4 / 15, with c2 = 1.4387769e-2 m K. Times 683 lm/W
   this is the luminous efficacy of a blackbody. The render uses it only as a ratio between a
   glowing surface and its star. */
export function photopicFraction(T) {
  if (!isNum(T) || T <= 0) return 0;
  let s = 0;
  for (let lam = 380; lam <= 780; lam += 5) s += planck(lam, T) * cmf(lam, CIE_FIT.y) * 5e-9;
  return s / (Math.pow(T / 1.4387769e-2, 4) * Math.pow(Math.PI, 4) / 15);
}

const colourCache = new Map();
/* Returns { srgb: [0..1]x3 gamma-encoded, linear: [0..1]x3, hex }. Brightest channel = 1. */
export function starColour(teff) {
  const T = Math.round(clamp(isNum(teff) ? teff : 5772, 1000, 40000) / 10) * 10;
  if (colourCache.has(T)) return colourCache.get(T);
  let X = 0, Y = 0, Z = 0;
  for (let lam = 380; lam <= 780; lam += 5) {
    const B = planck(lam, T);
    X += B * cmf(lam, CIE_FIT.x); Y += B * cmf(lam, CIE_FIT.y); Z += B * cmf(lam, CIE_FIT.z);
  }
  const M = XYZ_TO_SRGB;
  let lin = [0, 1, 2].map((i) => M[i][0] * X + M[i][1] * Y + M[i][2] * Z);
  const mx = Math.max(...lin);
  lin = lin.map((c) => clamp(c / mx, 0, 1));
  const srgb = lin.map(gammaEnc);
  const hex = '#' + srgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  const out = { srgb, linear: lin, hex };
  colourCache.set(T, out);
  return out;
}

export function spectralType(teff) {
  if (!isNum(teff)) return '?';
  if (teff >= 30000) return 'O'; if (teff >= 10000) return 'B'; if (teff >= 7500) return 'A';
  if (teff >= 6000) return 'F'; if (teff >= 5200) return 'G'; if (teff >= 3700) return 'K';
  if (teff >= 2400) return 'M'; return 'L';
}

/* ---------- the sky from the surface ---------- */

export function skyView(p) {
  const { a } = semiMajor(p);
  if (!isNum(p.Rs) || !a) return null;
  const ang = 2 * Math.atan(p.Rs * PHYS.R_SUN_KM / (a * PHYS.AU_KM)) * 180 / Math.PI;
  const { S } = insolation(p);
  return { angDeg: ang, vsSun: ang / PHYS.SUN_ANG_DEG, S };
}

/* ---------- Earth-likeness: this page's own measure ---------- */
/* Gaussian closeness in log radius (scale 0.12 dex, a factor 1.32) and log insolation
   (scale 0.30 dex, a factor 2). Earth scores 1. Not a published index. */
export function earthLikeness(p) {
  const { S } = insolation(p);
  if (!isNum(p.R) || !S) return null;
  const zr = Math.log10(p.R) / 0.12, zs = Math.log10(S) / 0.30;
  return Math.exp(-0.5 * (zr * zr + zs * zs));
}

/* ---------- catalogue statistics ---------- */

/* Radius histogram for close-in Kepler planets with precise radii: the valley as this
   catalogue shows it, without the completeness correction Fulton et al. applied.
   Kepler only, because Fulton et al. used one homogeneous Kepler sample. */
export function valleyHistogram(list) {
  const lo = Math.log10(0.5), hi = Math.log10(6), bins = 26;
  const h = new Array(bins).fill(0);
  let n = 0;
  for (const p of list) {
    if (!p.measuredR || p.facility !== 'Kepler' || !isNum(p.R) || !isNum(p.P) || p.P > 100) continue;
    if (!isNum(p.Rerr) || p.Rerr / p.R > 0.1) continue;
    const lr = Math.log10(p.R);
    if (lr < lo || lr >= hi) continue;
    h[Math.floor((lr - lo) / (hi - lo) * bins)]++; n++;
  }
  const centre = (i) => Math.pow(10, lo + (i + 0.5) * (hi - lo) / bins);
  const inValley = (i) => centre(i) >= VALLEY.lo && centre(i) <= VALLEY.hi;
  const inside = h.map((c, i) => [c, i]).filter(([, i]) => inValley(i));
  const [valleyMin, minBin] = inside.reduce((m, x) => (x[0] < m[0] ? x : m), [Infinity, -1]);
  const peakBelow = Math.max(...h.filter((_, i) => centre(i) < VALLEY.lo && centre(i) > 1.0));
  const peakAbove = Math.max(...h.filter((_, i) => centre(i) > VALLEY.hi && centre(i) < 3.5));
  return { h, bins, lo, hi, n, centre, valleyMin, valleyAt: centre(minBin), peakBelow, peakAbove };
}

/* How well this engine reproduces the archive's own relation-derived masses. */
export function validateAgainstArchive(list) {
  const diffs = [];
  for (const p of list) {
    if (p.Mprov !== 'M-R relationship' || !isNum(p.M) || !isNum(p.R)) continue;
    const m = massFromRadiusMean(p.R);
    if (!m) continue;
    diffs.push(Math.abs(m - p.M) / p.M);
  }
  diffs.sort((x, y) => x - y);
  const q = (f) => diffs.length ? diffs[Math.min(diffs.length - 1, Math.floor(f * diffs.length))] : null;
  return { n: diffs.length, median: q(0.5), p95: q(0.95), within2: diffs.filter((d) => d < 0.02).length };
}

/* Model duration and depth against the archive's measured values. */
export function transitCheck(p, geo) {
  if (!geo) return null;
  const out = {};
  if (isNum(p.dur)) out.dur = { model: geo.T14, measured: p.dur, ratio: geo.T14 / p.dur };
  if (isNum(p.depth)) out.depth = { model: geo.depthLD * 100, measured: p.depth, ratio: geo.depthLD * 100 / p.depth };
  return out;
}

export { isNum, clamp };
