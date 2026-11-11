/* ============================================================
   exoplanet/science.js — the survey's engine. Pure functions,
   no DOM. Each one implements a published model named in
   config.js, and returns its inputs' provenance with the result
   so the page can say what was measured and what was inferred.
   ============================================================ */

import { PHYS, KOPPARAPU, CHEN_KIPPING, LIMB, CIE_FIT, XYZ_TO_SRGB, TEQ, VALLEY, SIZE_CLASSES, SEAGER, RV, MC } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => typeof v === 'number' && isFinite(v);

/* ---------- star ---------- */

/* Luminosity in L_sun: archive log10 L when given, else Stefan-Boltzmann from R and Teff. */
export function luminosity(p) {
  if (isNum(p.logL)) return { L: Math.pow(10, p.logL), src: 'archive' };
  if (isNum(p.Rs) && isNum(p.Teff)) return { L: p.Rs * p.Rs * Math.pow(p.Teff / PHYS.T_SUN, 4), src: 'R and Teff' };
  return { L: null, src: 'none' };
}

/* Orbit size in AU: archive value, else Kepler's third law from P and the stellar mass. */
export function semiMajor(p) {
  if (isNum(p.a)) return { a: p.a, src: 'archive' };
  if (isNum(p.P) && isNum(p.Ms)) return { a: Math.cbrt(Math.pow(p.P / 365.25, 2) * p.Ms), src: "Kepler's third law" };
  return { a: null, src: 'none' };
}

/* Insolation relative to Earth: archive value, else L / a^2. */
export function insolation(p) {
  if (isNum(p.S)) return { S: p.S, src: 'archive' };
  const { L } = luminosity(p);
  const { a } = semiMajor(p);
  if (L && a) return { S: L / (a * a), src: 'L / a^2' };
  return { S: null, src: 'none' };
}

/* ---------- habitable zone (Kopparapu et al. 2013 with erratum) ---------- */

export function seff(teff, c) {
  const T = clamp(teff, KOPPARAPU.tRange[0], KOPPARAPU.tRange[1]) - 5780;
  return c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T + c[4] * T * T * T * T;
}

export function habitableZone(p) {
  const { L } = luminosity(p);
  if (!isNum(p.Teff) || !L) return null;
  const d = (c) => Math.sqrt(L / seff(p.Teff, c));
  const K = KOPPARAPU;
  return {
    inner: d(K.runaway), outer: d(K.maxGreen),             // conservative
    innerOpt: d(K.recentVenus), outerOpt: d(K.earlyMars),  // optimistic
    sInner: seff(p.Teff, K.runaway), sOuter: seff(p.Teff, K.maxGreen),
    sInnerOpt: seff(p.Teff, K.recentVenus), sOuterOpt: seff(p.Teff, K.earlyMars),
    extrapolated: p.Teff < K.tRange[0] || p.Teff > K.tRange[1],
    L,
  };
}

/* Where the planet sits relative to the zone, by flux (works when a is unknown). */
export function hzPosition(p) {
  const hz = habitableZone(p);
  const { S } = insolation(p);
  if (!hz || !S) return { key: 'unknown', label: 'not computable', hz, S };
  if (S <= hz.sInner && S >= hz.sOuter) return { key: 'cons', label: 'inside the conservative habitable zone', hz, S };
  if (S <= hz.sInnerOpt && S >= hz.sOuterOpt) return { key: 'opt', label: 'inside the optimistic habitable zone', hz, S };
  if (S > hz.sInnerOpt) return { key: 'hot', label: `${fmtX(S / hz.sInner)} the flux at the zone's inner edge`, hz, S };
  return { key: 'cold', label: `${fmtX(hz.sOuter / S)} below the flux at the zone's outer edge`, hz, S };
}
const fmtX = (x) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x >= 10 ? x.toFixed(0) : x.toFixed(1)) + 'x';

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
   a log-uniform prior on mass. A catalogue upper limit on mass truncates the posterior:
   a limit is a bound, never a value. Returns median and 16-84 % interval. */
export function forecastMass(R, Rerr, maxM = null) {
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
    w[i] = isNum(maxM) && lm > Math.log10(maxM) ? 0 : Math.exp(-0.5 * dz * dz / sig2) / Math.sqrt(sig2);
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
  return { median: med, lo: q(0.16), hi: q(0.84), regime: seg.name, pdf: w, tot, range: [lo, hi], bounded: isNum(maxM) };
}

/* the forecast for this record: bounded by an upper limit when the catalogue gives one */
export function forecastFor(p) { return forecastMass(p.R, p.Rerr, p.Mlim === 1 && isNum(p.M) ? p.M : null); }
export const hasTrueMass = (p) => isNum(p.M) && !p.Mlim && (p.Mprov === 'Mass' || p.Mprov === 'Msini' || p.Mprov === 'Msin(i)/sin(i)');

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
  return { K, e, massSrc: hasTrueMass(p) ? (p.Mprov === 'Mass' ? 'measured' : 'minimum') : 'forecast', M };
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
export function monteCarlo(p, albedo = TEQ.albedo) {
  const key = p.name + '|' + albedo;
  if (mcCache.has(key)) return mcCache.get(key);
  const rand = rng(p.name);
  const gauss = () => { const u = Math.max(1e-12, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const draw = (v, e) => (isNum(v) ? (isNum(e) && e > 0 ? v + e * gauss() : v) : null);
  const fc = hasTrueMass(p) ? null : forecastFor(p);
  // inverse-CDF sampler on the forecast posterior grid
  let cdf = null;
  if (fc) { cdf = new Float64Array(fc.pdf.length); let acc = 0; for (let i = 0; i < fc.pdf.length; i++) { acc += fc.pdf[i] / fc.tot; cdf[i] = acc; } }
  const sampleM = () => {
    if (!fc) { const e = isNum(p.Merr1) && isNum(p.Merr2) ? (Math.abs(p.Merr1) + Math.abs(p.Merr2)) / 2 : null; return Math.max(1e-3, draw(p.M, e)); }
    const u = rand(); let i = 0; while (i < cdf.length - 1 && cdf[i] < u) i++;
    return Math.pow(10, fc.range[0] + (fc.range[1] - fc.range[0]) * (i + rand()) / cdf.length);
  };
  const { a } = semiMajor(p);
  const N = MC.draws, g = [], teq = [], rho = [], H = [], cls = new Map();
  for (let k = 0; k < N; k++) {
    const R = Math.max(0.05, draw(p.R, p.Rerr));
    const M = sampleM();
    const gg = M / (R * R);
    g.push(gg); rho.push(5.514 * M / (R * R * R));
    const c = sizeClass(R); cls.set(c.key, (cls.get(c.key) || 0) + 1);
    const Teff = draw(p.Teff, p.TeffErr), Rs = draw(p.Rs, p.RsErr), aa = draw(a, p.aErr);
    let T = null;
    if (isNum(Teff) && isNum(Rs) && Rs > 0 && isNum(aa) && aa > 0) T = Teff * Math.sqrt(Rs * PHYS.R_SUN_KM / PHYS.AU_KM / (2 * aa)) * Math.pow(1 - albedo, 0.25);
    if (T) {
      teq.push(T);
      const mu = R > 1.8 ? MC.muEnvelope : MC.muSecondary;
      H.push(1.380649e-23 * T / (mu * 1.6726e-27 * 9.80665 * gg) / 1000);   // km
    }
  }
  const stat = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((x, y) => x - y); const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]; return { med: q(0.5), lo: q(0.16), hi: q(0.84) }; };
  const probs = SIZE_CLASSES.map((c) => ({ key: c.key, label: c.label, p: (cls.get(c.key) || 0) / N })).filter((c) => c.p > 0);
  const out = { n: N, g: stat(g), teq: stat(teq), rho: stat(rho), H: stat(H), probs, massFrom: fc ? 'forecast' : 'measured' };
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

export function sizeClass(R) {
  if (!isNum(R)) return SIZE_CLASSES[SIZE_CLASSES.length - 1];
  return SIZE_CLASSES.find((c) => R < c.max) || SIZE_CLASSES[SIZE_CLASSES.length - 1];
}

/* ---------- equilibrium temperature ---------- */

/* Teq = Teff sqrt(Rs / 2a) (1 - A)^(1/4): full heat redistribution, Bond albedo A. */
export function equilibriumTemp(p, albedo = TEQ.albedo) {
  const { a } = semiMajor(p);
  if (isNum(p.Teff) && isNum(p.Rs) && a) {
    const rsAU = p.Rs * PHYS.R_SUN_KM / PHYS.AU_KM;
    return p.Teff * Math.sqrt(rsAU / (2 * a)) * Math.pow(1 - albedo, 0.25);
  }
  const { S } = insolation(p);
  if (S) return 278.3 * Math.pow(S, 0.25) * Math.pow(1 - albedo, 0.25);   // 278.3 K: zero-albedo Teq at 1361 W/m^2
  return null;
}

/* ---------- transit (Seager & Mallen-Ornelas 2003, eq. 3) ---------- */

export function transitGeometry(p) {
  const { a } = semiMajor(p);
  if (!isNum(p.R) || !isNum(p.Rs) || !a || !isNum(p.P)) return null;
  const k = p.R * PHYS.R_EARTH_KM / (p.Rs * PHYS.R_SUN_KM);
  const aRs = a * PHYS.AU_KM / (p.Rs * PHYS.R_SUN_KM);
  const bMeasured = isNum(p.b);
  const b = bMeasured ? clamp(p.b, 0, 1 + k - 1e-4) : 0;
  const sinI = Math.sqrt(Math.max(1e-9, 1 - Math.pow(b / aRs, 2)));
  const arg = Math.sqrt(Math.max(0, (1 + k) * (1 + k) - b * b)) / (aRs * sinI);
  const T14 = arg >= 1 ? p.P * 24 / 2 : (p.P * 24 / Math.PI) * Math.asin(arg);   // hours
  const { u1, u2 } = LIMB;
  const norm = 1 - u1 / 3 - u2 / 6;
  const depthUniform = k * k;
  const mu = Math.sqrt(Math.max(0, 1 - b * b));
  const depthLD = k * k * (1 - u1 * (1 - mu) - u2 * (1 - mu) * (1 - mu)) / norm;
  const geomProb = (1 + k) / aRs;   // probability that a random orientation transits
  return { k, aRs, b, bMeasured, T14, depthUniform, depthLD, geomProb, transits: p.method === 'Transit' || isNum(p.depth) };
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
