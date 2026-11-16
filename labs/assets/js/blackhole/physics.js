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
  const tidalH = tidalCoefH * K.SI.c * K.SI.c / (rg * rg) * 2;
  return {
    ...base, a, q, massSun, distPc, edd, rg, tg, Tpeak, obj,
    thetaG: obj?.hypothetical ? null : K.thetaG(massSun, distPc),
    tidalH, tidalHg: tidalH / K.SI.g0,
    tide10g: K.tideRadius(a, massSun, 2, 10 * K.SI.g0),
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

/** The far-observer measurement the Measure card shows and the tour quotes, from the
 *  state (never the eased display values): in the telescope view at the state's own
 *  inclination, elsewhere at the object's measured one (17 deg for a custom hole). */
export function measurement(s) {
  const obj = objectOf(s);
  const incl = s.view === 'telescope' ? s.incl : (obj ? obj.incl : 17);
  const th = shadowFor(s.a, incl, s.q || 0);
  return { obj, incl, th, pred: obj && obj.distPc ? predictedUas(th.mean, obj) : null };
}

/** Sigma distance between a prediction and a measurement with independent errors. */
export function sigmaDiff(pred, meas, measErr) {
  const s = Math.hypot(pred.err, measErr);
  return (pred.value - meas) / s;
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
