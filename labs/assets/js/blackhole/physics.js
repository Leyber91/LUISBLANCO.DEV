/* ============================================================
   blackhole/physics.js — the derived model for the current state:
   every number the panels, captions, tour and question box quote.
   Cached by the inputs that matter, so it is cheap per frame.
   ============================================================ */

import * as K from './kerr.js';
import { OBJECTS } from './config.js';

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
  const base = memo(`b:${a.toFixed(4)}:${q.toFixed(4)}:${s.rout}`, () => {
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
    piM: Math.PI * tg,
    efold: tg / base.kappa,
    hawkingK: K.hawkingKelvin(massSun * K.SI.Msun, a, q),
    horizonKm: base.rh * rg / 1000,
  };
}

/** Analytic shadow for a far observer at the state's inclination (q = 0). */
export function theoryShadow(a, inclDeg, q = 0) {
  return memo(`s:${a.toFixed(4)}:${q.toFixed(4)}:${inclDeg.toFixed(2)}`, () => {
    let curve;
    if (q > 0 && a < 1e-4) {
      // Reissner-Nordstrom: a circle of the critical impact parameter
      const b = K.rnCriticalB(q);
      curve = Array.from({ length: 720 }, (_, i) => [b * Math.cos(Math.PI * i / 360), b * Math.sin(Math.PI * i / 360)]);
    } else if (q > 0) {
      return null;                     // Kerr-Newman with spin: no closed form used here
    } else curve = K.shadowCurve(a, inclDeg * Math.PI / 180, 360);
    return { curve, chords: K.shadowChords(curve), mean: K.shadowMeanDiameter(curve) };
  });
}

/** The shadow for display: the analytic curve where one exists (Kerr, or charge without
 *  spin), else the integrator's chords (Kerr-Newman with spin). */
export function shadowFor(a, inclDeg, q = 0) {
  const t = theoryShadow(a, inclDeg, q);
  if (t) return t;
  const m = integratorShadow(a, inclDeg, q);
  return { curve: null, chords: { width: m.width, height: m.height }, mean: 0.5 * (m.width + m.height), traced: true };
}

/** The shadow's mean diameter for a far observer at 90 deg over the horizon's diameter 2 r+: the Instrument card's
 *  "x the horizon", and every sentence that says how much wider than the horizon the shadow is (review_s2 P2-4). */
export function shadowToHorizon(a, q = 0) {
  return shadowFor(a, 90, q).mean / (2 * K.horizon(a, q));
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
  return memo(`m:${a.toFixed(4)}:${q.toFixed(4)}:${inclDeg.toFixed(2)}`, () => K.measureShadow(a, inclDeg * Math.PI / 180, { q, k: 0.08, iters: 22 }));
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
 *  Null for an object with no distance. */
export function compareShadow(diamM, obj) {
  if (!obj || !obj.distPc) return null;
  const r = obj.ruler;
  const p = r ? null : predictedUas(1, obj);
  const tg = r ? r.thetaG : p.value, up = r ? r.errP : p.err, dn = r ? r.errM : p.err;
  const pred = { diamM, value: diamM * tg, errP: diamM * up, errM: diamM * dn, thetaG: tg, thetaErrP: up, thetaErrM: dn, by: r ? r.by : obj.massBy };
  const e = obj.eht;
  let shadow = null;
  if (e && e.shadow != null) {
    const d = pred.value - e.shadow;
    shadow = { value: e.shadow, err: e.shadowErr, sigma: d / Math.hypot(d > 0 ? pred.errM : pred.errP, e.shadowErr) };
  }
  return { pred, shadow, ring: e && e.ring != null ? { value: e.ring, err: e.ringErr, offsetPct: e.ringOffsetPct, scale: obj.thetaGPub?.v } : null };
}

/** The ruling every place that sets the shadow against the EHT states, as one string: the Measure card's note
 *  and the model's context quote it (ledger row 2). */
export const RULING = 'A sigma is set only between two shadows; a ring of emission is a different quantity.';

/** A published value and its error, both with the value's own decimals, as the paper prints them: 48.7 and 7.0,
 *  42 and 3 (a JavaScript number drops the 0 of 7.0). */
export function published(v, e, pm = '+-') {
  const d = (String(v).split('.')[1] || '').length;
  return `${v.toFixed(d)} ${pm} ${e.toFixed(d)}`;
}

/** The comparison in one sentence: the tour's telescope stop and the guide print this and nothing else. A ring's
 *  offset is stated on the scale its paper states it on, the EHT's own theta_g, and only when both are given. */
export function compareSentence(c, name = 'this hole') {
  if (!c || (!c.shadow && !c.ring)) return 'The EHT has not imaged it.';
  if (c.shadow) return `The EHT inferred a shadow of ${published(c.shadow.value, c.shadow.err)} uas: ${sigmaText(c.shadow.sigma)} from this one.`;
  const r = c.ring;
  const where = r.offsetPct != null && r.scale != null ? ` On its own scale, theta_g ${r.scale} uas, its models place the ring about ${r.offsetPct}% outside the photon ring.` : '';
  return `The EHT measured a ring of emission ${published(r.value, r.err)} uas across.${where} It published no shadow diameter for ${name}.`;
}

/** The far-observer measurement the Measure card shows and the tour quotes, from the
 *  state (never the eased display values): in the telescope view at the state's own
 *  inclination, elsewhere at the object's measured one (17 deg for a custom hole). */
export function measurement(s) {
  const obj = objectOf(s);
  const incl = s.view === 'telescope' ? s.incl : (obj ? obj.incl : 17);
  const th = shadowFor(s.a, incl, s.q || 0);
  return { obj, incl, th, cmp: compareShadow(th.mean, obj) };
}


/** Fall table for the journey (rain from rest at infinity at the camera's polar angle). */
export function fall(a, inclDeg, r0 = 40, q = 0) {
  return memo(`f:${a.toFixed(4)}:${q.toFixed(4)}:${inclDeg.toFixed(1)}:${r0}`, () => K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 500));
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
