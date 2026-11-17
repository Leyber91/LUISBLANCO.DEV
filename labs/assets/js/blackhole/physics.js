/* ============================================================
   blackhole/physics.js — the derived model for the current state:
   every number the panels, captions, tour and question box quote.
   Cached by the inputs that matter, so it is cheap per frame.
   ============================================================ */

import * as K from './kerr.js';
import { OBJECTS, CITE } from './config.js';

// A key holds the spin and the charge exactly, never rounded: the functions behind it branch on them (no charge,
// q > 0; no spin, a < 1e-4), and a key rounded to 4 decimals gave a = 0.00009 and a = 0.0001, or Q = 0.00004 and
// Q = 0, one cached answer from two formulas (the fixer's note, 2026-11-17). Inclination keeps its rounding: no
// branch reads it below 0.01 deg.
const cache = new Map();
const memo = (key, fn) => {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  if (cache.size > 64) cache.clear();
  cache.set(key, v);
  return v;
};

/** Half-angle tangent of the vertical field of view. The fov setting applies to the
 *  shorter screen axis, so a portrait phone shows the same object as a landscape screen. */
export function tanHalfV(fovDeg, aspect) {
  const t = Math.tan(fovDeg * Math.PI / 360);
  return aspect >= 1 ? t : t / aspect;
}

export function objectOf(s) { return OBJECTS.find((o) => o.id === s.obj) || null; }

/** The body a tide is quoted across, in metres, and the tide the card calls lethal, in g: derive() computes with
 *  them, and every sentence that names a body or a lethal tide quotes them. */
export const BODY_M = 2;
export const TIDE_G = 10;

/** Disk + radii + units for a state. */
export function derive(s) {
  const a = s.a, q = s.q || 0;
  const massSun = Math.pow(10, s.mass);
  const distPc = Math.pow(10, s.dist);
  const edd = Math.pow(10, s.edd);
  const base = memo(`b:${a}:${q}:${s.rout}`, () => {
    const tab = K.ntFluxTable(a, s.rout, 512, q);
    return {
      rh: K.horizon(a, q), ri: K.isco(a, 1, q), rph: K.photonOrbit(a, 1, q), rphr: K.photonOrbit(a, -1, q),
      eta: K.efficiency(a, q), tab, peak: K.tablePeak(tab), profile: K.temperatureProfile(tab, 512),
      vIsco: K.diskSpeed(a, K.isco(a, 1, q), q), interiorTau: K.interiorTau(a, q), kappa: K.surfaceGravity(a, q),
      rmin: K.innerHorizon(a, q),
    };
  });
  const obj = objectOf(s);
  const rg = K.SI.rgSun * massSun, tg = K.SI.tgSun * massSun;
  const Tpeak = edd > 1e-9 && obj?.id !== 'primordial' ? K.diskPeakKelvin(massSun, a, edd, base.peak.F, q) : 0;
  const tidalCoefH = 2 / (base.rh ** 3);   // radial stretch in the equatorial plane: 2M/r^3 for any spin
  const tidalH = tidalCoefH * K.SI.c * K.SI.c / (rg * rg) * BODY_M;
  return {
    ...base, a, q, massSun, distPc, edd, rg, tg, Tpeak, obj,
    thetaG: obj?.hypothetical ? null : K.thetaG(massSun, distPc),
    tidalH, tidalHg: tidalH / K.SI.g0,
    tide10g: K.tideRadius(a, massSun, BODY_M, TIDE_G * K.SI.g0),
    iscoPeriod: 2 * Math.PI / K.circular(a, base.ri, q).Omega * tg,
    interiorTauS: base.interiorTau * tg,
    // where the interior time ends, one rule for every sentence that names it (ledger row 6): the inner horizon
    // r- = 1 - sqrt(1 - a^2 - Q^2) exists for any spin or charge, however small, and is the centre only at a = Q = 0
    endsAtCentre: a === 0 && q === 0,
    piM: Math.PI * tg,
    efold: tg / base.kappa,
    hawkingK: K.hawkingKelvin(massSun * K.SI.Msun, a, q),
    horizonKm: base.rh * rg / 1000,
  };
}

/** The shadow's mean diameter, one definition for every spin and charge (fix_s2_p1 K1, S8): the mean of its two
 *  chords, the width along beta = 0 and the height through the width's midpoint. The engine has both chords in every
 *  case (Bardeen's curve, the charged circle, the integrator's edges); an area needs a closed outline, which the
 *  integrator does not trace. MEAN_DEF is how every label names it. */
export function meanDiameter(ch) { return 0.5 * (ch.width + ch.height); }
export const MEAN_DEF = '(width + height) / 2';

/** How a shadow was obtained, and the words every label of it uses (fix_s2_p1 K4, S7): the card's width row, the
 *  plate, the overlay's legend, the idle caption and the probe read these, never a label of their own. `curve` is
 *  the outline drawn on the image, null where none is drawn. */
export const SHADOW_HOW = {
  bardeen: { label: 'Bardeen 1973', curve: 'Bardeen 1973 critical curve' },
  rn: { label: '2 b_c, Reissner-Nordstrom', curve: 'critical circle 2 b_c, Reissner-Nordstrom' },
  traced: { label: 'traced: no closed form for Q and a', curve: null },
};

/** Analytic shadow for a far observer at the state's inclination: Bardeen's curve (Kerr) or the circle of the
 *  critical impact parameter (charge without spin); null for Kerr-Newman with spin. */
export function theoryShadow(a, inclDeg, q = 0) {
  return memo(`s:${a}:${q}:${inclDeg.toFixed(2)}`, () => {
    let curve, how = 'bardeen';
    if (q > 0 && a < 1e-4) {
      // Reissner-Nordstrom: a circle of the critical impact parameter
      const b = K.rnCriticalB(q);
      curve = Array.from({ length: 720 }, (_, i) => [b * Math.cos(Math.PI * i / 360), b * Math.sin(Math.PI * i / 360)]);
      how = 'rn';
    } else if (q > 0) {
      return null;                     // Kerr-Newman with spin: no closed form used here
    } else curve = K.shadowCurve(a, inclDeg * Math.PI / 180, 360);
    const chords = K.shadowChords(curve);
    return { curve, chords, mean: meanDiameter(chords), how };
  });
}

/** The shadow for display: the analytic curve where one exists (Kerr, or charge without
 *  spin), else the integrator's chords (Kerr-Newman with spin). */
export function shadowFor(a, inclDeg, q = 0) {
  const t = theoryShadow(a, inclDeg, q);
  if (t) return t;
  const m = integratorShadow(a, inclDeg, q);
  const chords = { width: m.width, height: m.height };
  return { curve: null, chords, mean: meanDiameter(chords), traced: true, how: 'traced' };
}

/** The Lyapunov exponent gamma of the polar photon orbit: each further half-orbit image is e^gamma times thinner
 *  (Johnson et al. 2020). The number the Measure card's sub-ring row prints as e^-gamma and every sentence about
 *  the sub-rings quotes (review_s2 P2-2). Kerr only: null for a charged hole, for which no closed form is used. */
export function ringGamma(a, q = 0) {
  return q > 0 ? null : K.lyapunov(a, K.polarPhotonOrbit(a));
}

/** The mass at which a non-spinning hole is as warm as the cosmic background: hbar c^3 / (8 pi G k_B T_CMB), in
 *  kg and in Moon masses (both constants in kerr.js's SI table). A heavier hole is colder than the background, and
 *  spin or charge cools a hole further (review_s2 P2-6). */
export function cmbCrossover() {
  const kg = K.SI.hbar * K.SI.c ** 3 / (8 * Math.PI * K.SI.G * K.SI.kB * K.SI.Tcmb);
  return { kg, moons: kg / K.SI.Mmoon, T: K.SI.Tcmb };
}

/** The share of rest mass hydrogen fusion releases, in percent: four 1H atoms to one 4He atom, from the atomic
 *  masses in kerr.js's SI table. The guide sets the disk's efficiency against it. */
export function fusionPercent() {
  return 100 * (1 - K.SI.uHe4 / (4 * K.SI.uH1));
}

/** The ergosurface of a Kerr-Newman hole, where g_tt = 0: r = 1 + sqrt(1 - Q^2 - a^2 cos^2 theta), theta in degrees
 *  from the spin axis. The cross-section draws it and the guide quotes its equatorial radius. */
export function ergosurface(a, q, thetaDeg) {
  const c = Math.cos(thetaDeg * Math.PI / 180);
  return 1 + Math.sqrt(Math.max(0, 1 - q * q - a * a * c * c));
}

/** Shadow measured by the JS integrator (bisection), far observer. */
export function integratorShadow(a, inclDeg, q = 0) {
  return memo(`m:${a}:${q}:${inclDeg.toFixed(2)}`, () => K.measureShadow(a, inclDeg * Math.PI / 180, { q, k: 0.08, iters: 22 }));
}

/** Predicted angular size of the shadow for an object, with the mass and distance errors
 *  propagated (relative errors in quadrature). */
export function predictedUas(diamM, obj) {
  if (!obj || !obj.distPc) return null;
  const tg = K.thetaG(obj.mass, obj.distPc);
  const rel = Math.hypot((obj.massErr || 0) / obj.mass, (obj.distErr || 0) / obj.distPc);
  return { value: diamM * tg, err: diamM * tg * rel, thetaG: tg };
}

/** The traced shadow on the sky set against what the Event Horizon Telescope inferred: like for like and never
 *  circular (ledger row 2, ruled 2026-11-16; BAR_L1 C4). Every place that states the comparison calls this: the
 *  Measure card, the tour, the guide, the plate and its table.
 *  - The scale theta_g comes from a mass the EHT image did not give: the object's `ruler` when it has one (M87*:
 *    the stellar-dynamics theta of EHT 2019 Paper VI, Table 9, since the EHT's own mass rests on its ring), else
 *    its mass and distance with their errors (Sgr A*: stellar orbits).
 *  - A sigma is computed only between two shadows. A ring of emission is not a shadow (Paper VI: emission
 *    "preferentially from outside the photon ring leads to a 10% offset"), so it is shown beside, never in sigma.
 *  - Errors may be asymmetric: the sigma takes the prediction's error on the side of the measurement.
 *  - The prediction carries the diameter it was computed from (diamM) and its scale with that scale's errors, so a
 *    sentence or a table row that prints the angle prints its own chord beside it (review_s2 P2-3, P1-3).
 *  - A ring carries the offset its paper states and the scale that offset is on (the EHT's own theta_g), so the
 *    sentence can name both (review_s2 P2-10).
 *  - A ring of emission is shown only where no shadow was published (M87*): where the EHT gives a shadow (Sgr A*),
 *    the ring is not carried, so no writer can set it beside the lab's shadow (ruling: "the ring row goes";
 *    fix_s2_p1 S3).
 *  - The scale carries its source, the primary paper and the one that tabulates it (`src`, CITE text), so every
 *    writer of the angle prints the scale's number with its source (fix_s2_p1 S6).
 *  - A shadow the EHT's paper predicted (M87*: Paper I's 37.6 uas for a = 0, from the stars' mass) is carried with
 *    the lab's own value at that spin, at the same scale, so the sentence can say the lab gives that prediction.
 *  Null for an object with no distance. */
export function compareShadow(diamM, obj) {
  if (!obj || !obj.distPc) return null;
  const r = obj.ruler;
  const p = r ? null : predictedUas(1, obj);
  const tg = r ? r.thetaG : p.value, up = r ? r.errP : p.err, dn = r ? r.errM : p.err;
  const src = (r ? [r.basis] : [...new Set([obj.massSrc, obj.distSrc])]).map((k) => CITE[k]).join('; ');
  const pred = { diamM, value: diamM * tg, errP: diamM * up, errM: diamM * dn, thetaG: tg, thetaErrP: up, thetaErrM: dn, by: r ? r.by : obj.massBy, src };
  const e = obj.eht;
  let shadow = null;
  if (e && e.shadow != null) {
    const d = pred.value - e.shadow;
    shadow = { value: e.shadow, err: e.shadowErr, sigma: d / Math.hypot(d > 0 ? pred.errM : pred.errP, e.shadowErr) };
  }
  const ring = e && e.ring != null && !shadow ? { value: e.ring, err: e.ringErr, offsetPct: e.ringOffsetPct, scale: obj.thetaGPub?.v } : null;
  let predicted = null;
  if (e && e.predicted) {
    const d0 = shadowFor(e.predicted.spin, obj.incl, 0).mean;
    predicted = { ...e.predicted, lab: { diamM: d0, value: d0 * tg, errP: d0 * up, errM: d0 * dn } };
  }
  return { pred, shadow, ring, predicted };
}

/** The ruling every place that sets the shadow against the EHT states, in full, as one string: the Measure card's
 *  note and the model's context quote it (ledger row 2; fix_s2_p1 K3). */
export const RULING = 'A shadow is compared only with a shadow. A ring of emission is a different quantity: the lab shows it only where the EHT measured no shadow, and never compares it with one by a sigma, a ratio, a percentage or a match.';

/** A published value and its error, both with the value's own decimals, as the paper prints them: 48.7 and 7.0,
 *  42 and 3 (a JavaScript number drops the 0 of 7.0); 37.6 (+6.2, -3.5) when the two errors differ. */
export function published(v, e, pm = '+-', eM = e) {
  const d = (String(v).split('.')[1] || '').length;
  return eM === e ? `${v.toFixed(d)} ${pm} ${e.toFixed(d)}` : `${v.toFixed(d)} (+${e.toFixed(d)}, -${eM.toFixed(d)})`;
}

/** The comparison in one sentence: the tour's telescope stop and the guide print this and nothing else. A ring's
 *  offset is stated on the scale its paper states it on, the EHT's own theta_g, and only when both are given. What
 *  a paper did is said with its own verb (research/eht_diameters.md 1.4: no shadow diameter "as a measured value";
 *  Paper I "predict[s] a theoretical shadow diameter for a Schwarzschild black hole of 37.6 (+6.2, -3.5)"). */
export function compareSentence(c, name = 'this hole') {
  if (!c || (!c.shadow && !c.ring)) return 'The EHT has not imaged it.';
  if (c.shadow) return `The EHT inferred a shadow of ${published(c.shadow.value, c.shadow.err)} uas: ${sigmaText(c.shadow.sigma)} from this one.`;
  const r = c.ring, pr = c.predicted;
  const where = r.offsetPct != null && r.scale != null ? ` On its own scale, theta_g ${r.scale} uas, its models place the ring about ${r.offsetPct}% outside the photon ring.` : '';
  const pred = pr ? ` From the mass given by ${pr.by}, the EHT's Paper I predicts a shadow of ${published(pr.v, pr.errP, '+-', pr.errM)} uas for a hole without spin, and the lab gives ${pmText(pr.lab.value, pr.lab.errP, pr.lab.errM, ASCII)} uas at a = ${spinText(pr.spin)}.` : '';
  return `The EHT measured a ring of emission ${published(r.value, r.err)} uas across.${where} ${noShadow(name)}${pred}`;
}

/** What the EHT did not measure, one sentence for the comparison's sentence, the Measure card's note and the plate. */
export function noShadow(name) { return `The EHT measured no shadow diameter from its images of ${name}.`; }

/** The far-observer measurement every number of the shadow comes from, from the state (never the eased display
 *  values): in the telescope view at the state's own inclination, elsewhere at the object's measured one (17 deg
 *  for a custom hole). The only function that picks the shadow's inclination (fix_s2_p1 K1, S1): the Measure card,
 *  the Instrument card, the tour, the guide and its context, the plate and the CSV call it, and each prints `incl`
 *  beside the numbers. `toHorizon` is the mean diameter over the horizon's diameter 2 r+. */
export function measurement(s) {
  const obj = objectOf(s), q = s.q || 0;
  const incl = s.view === 'telescope' ? s.incl : (obj ? obj.incl : 17);
  const th = shadowFor(s.a, incl, q);
  return { obj, incl, th, toHorizon: th.mean / (2 * K.horizon(s.a, q)), cmp: compareShadow(th.mean, obj) };
}


/** Fall table for the journey (rain from rest at infinity at the camera's polar angle). */
export function fall(a, inclDeg, r0 = 40, q = 0) {
  return memo(`f:${a}:${q}:${inclDeg.toFixed(1)}:${r0}`, () => K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 500));
}

/** Exactly 3 significant figures (keeps trailing zeros: 0.00, 2.00, 1.34). */
export function s3(v) {
  if (v == null || !Number.isFinite(v)) return '--';
  if (v === 0) return '0.00';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= 5 || e <= -3) return sci(v);
  return v.toFixed(Math.max(0, 2 - e));
}

/** Format helpers: 3 significant figures, tabular. */
export function sig(v, n = 3) {
  if (v == null || !Number.isFinite(v)) return '--';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= 6 || e <= -4) {
    const m = v / Math.pow(10, e);
    return `${m.toFixed(n - 1)}e${e}`;
  }
  return Number(v.toPrecision(n)).toString();
}
export function sci(v, n = 3) {
  if (v == null || !Number.isFinite(v)) return '--';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= 5 || e <= -3) {
    const m = v / Math.pow(10, e);
    const sup = String(e).replace(/-/g, '⁻').replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
    return `${m.toFixed(n - 1)}×10${sup}`;
  }
  return Number(v.toPrecision(n)).toLocaleString('en-US');
}
/* ---------------- one format per quantity kind (review_s2 P1-2, P1-4; fix_s2_brief C3) ----------------
   A length or radius in M, an angle on the sky in uas, a speed in c, a ratio, a percentage: s3. A mass, a
   temperature, a tide, a distance in km: sci. A time: dur. A sigma: sigmaText. An inclination: deg. A spin:
   spinText. A distance in parsecs: parsecs. A photon energy: photonEnergy. A number for a machine (the model's
   context, the CSV): sigNum, never fixed decimals. */

/** A sigma as every place writes it: the sign always (+0.00 for none), 3 significant figures, then the symbol or
 *  the word asked for: the card writes σ, the sentences and the plate "sigma". */
export function sigmaText(sigma, sym = 'sigma') {
  return `${sigma >= 0 ? '+' : ''}${s3(sigma)} ${sym}`;
}

/** A number for a machine: n significant figures as a Number, so Cygnus X-1's 9.14e-4 uas is not 0. None stays
 *  null. */
export function sigNum(v, n = 4) {
  return v == null || !Number.isFinite(v) ? null : +v.toPrecision(n);
}

/** A value with its error, both to one decimal place (fix_s2_p1 K6: never "52.6 ± 0.268"): the error to 2
 *  significant figures (the smaller of an asymmetric pair), the value to the same place, and one power of ten for
 *  both where the larger is 1e5 or more or under 1e-3, as sci() writes such numbers. Two errors that print alike are
 *  written once. The card writes ± and −; a sentence passes ASCII. */
export const ASCII = { pm: '+-', minus: '-' };
export function pmText(v, eP, eM = eP, { pm = '±', minus = '−' } = {}) {
  if (![v, eP, eM].every(Number.isFinite)) return '--';
  const small = Math.min(Math.abs(eP), Math.abs(eM));
  if (small === 0) return sci(v);
  const big = Math.max(Math.abs(v), small);
  const p = big >= 1e5 || big < 1e-3 ? Math.floor(Math.log10(big)) : 0;
  const f = Math.pow(10, p), d = Math.max(0, 1 - Math.floor(Math.log10(small / f)));
  const fx = (x) => (Math.abs(x) / f).toFixed(d);
  const body = `${v < 0 ? '-' : ''}${fx(v)} ${fx(eP) === fx(eM) ? `${pm} ${fx(eP)}` : `(+${fx(eP)}, ${minus}${fx(eM)})`}`;
  return p ? `(${body})×10${sup(p)}` : body;
}
/** An exponent in superscript digits: -4 is ⁻⁴. */
function sup(e) { return String(e).replace(/-/g, '⁻').replace(/[0-9]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]); }

/** An inclination in degrees: one decimal at most (the slider's step is 0.5), none when whole: 17, 27.5. */
export function deg(v) { return String(+(+v).toFixed(1)); }

/** A spin a/M: three decimals, the slider's step. */
export function spinText(a) { return (+a).toFixed(3); }

/** A distance in parsecs in its unit: Mpc from a million, kpc from a thousand, 3 significant figures. */
export function parsecs(pc) {
  return pc >= 1e6 ? `${(pc / 1e6).toPrecision(3)} Mpc` : pc >= 1e3 ? `${(pc / 1e3).toPrecision(3)} kpc` : `${pc.toPrecision(3)} pc`;
}

/** A photon energy in eV in its unit: keV from a thousand, 3 significant figures. */
export function photonEnergy(eV) {
  return eV >= 1000 ? `${(eV / 1000).toPrecision(3)} keV` : `${eV.toPrecision(3)} eV`;
}

/* ---------------- the claim tags (review_s2 P2-11; fix_s2_brief C10) ---------------- */

/** A derived value is as strong as its weakest input: REAL only when every input is. */
export function weakest(...tags) {
  return tags.every((t) => t === 'REAL') ? 'REAL' : 'ILLUSTRATIVE';
}
/** The tags of the state's inputs: the object's own, and ILLUSTRATIVE for everything of a custom or hypothetical
 *  hole (nothing of it is measured). */
export function inputTags(obj) {
  if (!obj || obj.hypothetical) return { mass: 'ILLUSTRATIVE', dist: 'ILLUSTRATIVE', spin: 'ILLUSTRATIVE', edd: 'ILLUSTRATIVE' };
  return { mass: 'REAL', dist: 'REAL', spin: obj.spinTag, edd: obj.eddTag };
}

/** Seconds in a readable unit, 3 significant figures. */
export function dur(sec) {
  if (!Number.isFinite(sec)) return '--';
  const u = [['yr', 3.156e7], ['d', 86400], ['h', 3600], ['min', 60], ['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9], ['ps', 1e-12], ['fs', 1e-15], ['as', 1e-18], ['zs', 1e-21], ['ys', 1e-24]];
  for (const [name, f] of u) if (Math.abs(sec) >= f) return `${sci(sec / f)} ${name}`;
  return `${sci(sec)} s`;
}
/** Length in a readable unit. */
export function len(m) {
  if (!Number.isFinite(m)) return '--';
  const u = [['pc', 3.0857e16], ['AU', 1.496e11], ['km', 1e3], ['m', 1], ['mm', 1e-3], ['µm', 1e-6], ['nm', 1e-9], ['fm', 1e-15]];
  for (const [name, f] of u) if (Math.abs(m) >= f * 0.999) return `${sci(m / f)} ${name}`;
  return `${sci(m)} m`;
}
