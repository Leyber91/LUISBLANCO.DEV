/* ============================================================
   altverse/climate.js — insolation and a one-dimensional
   energy-balance climate (Budyko 1969 / Sellers 1969 form).

   Insolation: daily-mean top-of-atmosphere flux by latitude and
   solar declination on a circular orbit (the standard formula, as
   in Berger 1978), averaged over the year. [REAL]

   Climate: each 2-degree band balances absorbed sunlight against
   outgoing longwave A + B*T and relaxes toward the global mean with
   a transport coefficient C. Ice raises albedo where it is cold
   enough, which is the ice-albedo feedback behind the snowball
   result of Budyko and Sellers. B is the North et al. (1981) value;
   A is calibrated at load so our world's mean is 14.5 C; C and the
   seasonal factors are illustrative, tuned to put our ice line near
   70 degrees. The model has no oceans, clouds or land-sea contrast
   beyond a seasonal damping factor. [ILLUSTRATIVE coefficients]
   ============================================================ */

import { EARTH } from './config.js';

const D2R = Math.PI / 180;
export const NB = 90;                                     // 2-degree bands
export const BAND_LAT = Array.from({ length: NB }, (_, i) => -89 + 2 * i);
const W = BAND_LAT.map((l) => Math.cos(l * D2R));
const WSUM = W.reduce((a, b) => a + b, 0);
const wmean = (arr) => arr.reduce((s, v, i) => s + v * W[i], 0) / WSUM;

const B = 2.09;               // W m^-2 K^-1, North et al. 1981
const ALB_FREE = 0.30;
const ALB_ICE = 0.62;         // Budyko's ice albedo
const T_ICE = -10;            // C, annual mean below which a band holds ice (Budyko)
const T_SEAICE = -1.9;        // C, seawater freezing point near 35 g/kg salinity
const C0 = 2.2;               // transport, illustrative (puts our ice line near 70 degrees)
const GAMMA_LAND = 0.55;      // seasonal amplitude factor over land, illustrative
const GAMMA_SEA = 0.20;       // over ocean (thermal inertia), illustrative
const LAMBDA = 3.71 / 3.0;    // W m^-2 K^-1 implied by ECS 3 C and 3.71 W m^-2 per doubling

export function dailyInsolation(latDeg, declDeg, S) {
  const phi = latDeg * D2R, d = declDeg * D2R;
  const x = -Math.tan(phi) * Math.tan(d);
  const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
  return (S / Math.PI) * (h0 * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(h0));
}

/* annual mean, max and min daily insolation for every band */
export function insolationProfile(tiltDeg, S, steps = 96) {
  const ann = new Float64Array(NB), max = new Float64Array(NB), min = new Float64Array(NB).fill(1e9);
  const se = Math.sin(tiltDeg * D2R);
  for (let k = 0; k < steps; k++) {
    const decl = Math.asin(se * Math.sin((2 * Math.PI * (k + 0.5)) / steps)) / D2R;
    for (let i = 0; i < NB; i++) {
      const q = dailyInsolation(BAND_LAT[i], decl, S);
      ann[i] += q / steps;
      if (q > max[i]) max[i] = q;
      if (q < min[i]) min[i] = q;
    }
  }
  return { ann, max, min };
}

/* smooth ice fraction so the iteration converges */
const iceFrac = (T, Tc) => 1 / (1 + Math.exp((T - Tc) / 1.5));

function solve(Q, A, C, ice) {
  let T = new Float64Array(NB).fill(15);
  let alb = new Float64Array(NB).fill(ALB_FREE);
  for (let it = 0; it < 160; it++) {
    const absorbed = Array.from(Q.ann, (q, i) => q * (1 - alb[i]));
    const Tm = (wmean(absorbed) - A) / B;
    for (let i = 0; i < NB; i++) T[i] = (absorbed[i] - A + C * Tm) / (B + C);
    const next = new Float64Array(NB);
    for (let i = 0; i < NB; i++) {
      const winterSea = T[i] - GAMMA_SEA * (Q.ann[i] - Q.min[i]) * (1 - alb[i]) / (B + C);
      const f = ice(T[i], winterSea);
      next[i] = ALB_FREE + (ALB_ICE - ALB_FREE) * f;
    }
    let delta = 0;
    for (let i = 0; i < NB; i++) { delta = Math.max(delta, Math.abs(next[i] - alb[i])); alb[i] = alb[i] * 0.5 + next[i] * 0.5; }
    if (delta < 1e-5 && it > 10) break;
  }
  return { T, alb };
}

const ourIce = (T) => iceFrac(T, T_ICE);

/* Calibrate A once: our world at 14.5 C. */
const A_CAL = (() => {
  const Q = insolationProfile(EARTH.tiltDeg, EARTH.solarWm2);
  let lo = 150, hi = 260;
  for (let k = 0; k < 50; k++) {
    const A = (lo + hi) / 2;
    const { T } = solve(Q, A, C0, ourIce);
    if (wmean(T) > EARTH.meanTempC) lo = A; else hi = A;
  }
  return (lo + hi) / 2;
})();

/**
 * runClimate(knobs) -> bands and global numbers.
 * knobs: solar, tiltDeg, dayHours, co2ppm, iceDensity, gFactor
 */
export function runClimate(k) {
  const S = EARTH.solarWm2 * k.solar;
  const Q = insolationProfile(k.tiltDeg, S);
  const C = C0 * Math.max(0.5, Math.min(1.6, Math.pow(k.dayHours / 24, 0.25)));
  const dF = 5.35 * Math.log(k.co2ppm / EARTH.co2ppm);               // Myhre et al. 1998
  const A = A_CAL - dF * (B / LAMBDA);
  const iceSinks = k.iceDensity > 1.0;
  // ice sinks: any band whose ocean freezes in winter fills with sunken ice
  const ice = iceSinks ? (T, Tw) => Math.max(iceFrac(T, T_ICE), iceFrac(Tw, T_SEAICE)) : ourIce;
  let { T, alb } = solve(Q, A, C, ice);
  let co2 = k.co2ppm, thermostat = null;
  // carbonate-silicate thermostat (Walker, Hays & Kasting 1981): over 10^5-10^6 years
  // weathering slows on a cold planet and CO2 accumulates until the ice-free world is
  // back near its old warmth. Applied only to changes that have held for that long.
  if (k.longTerm && k.co2ppm === EARTH.co2ppm) {
    const target = OURS_ICEFREE_T;
    const icefreeT = (TT, aa) => { let s = 0, w = 0; for (let i = 0; i < NB; i++) if (aa[i] < (ALB_FREE + ALB_ICE) / 2) { s += TT[i] * W[i]; w += W[i]; } return w ? s / w : -99; };
    const now = icefreeT(T, alb);
    if (Math.abs(now - target) > 0.5) {
      let lo = Math.log(EARTH.co2ppm / 30), hi = Math.log(EARTH.co2ppm * 400);
      for (let it = 0; it < 36; it++) {
        const mid = (lo + hi) / 2;
        const A2 = A_CAL - 5.35 * Math.log(Math.exp(mid) / EARTH.co2ppm) * (B / LAMBDA);
        const r = solve(Q, A2, C, ice);
        if (icefreeT(r.T, r.alb) < target) lo = mid; else hi = mid;
      }
      co2 = Math.exp((lo + hi) / 2);
      const A2 = A_CAL - 5.35 * Math.log(co2 / EARTH.co2ppm) * (B / LAMBDA);
      ({ T, alb } = solve(Q, A2, C, ice));
      thermostat = { co2, capped: co2 > EARTH.co2ppm * 399, before: now, target };
    }
  }

  const bands = BAND_LAT.map((lat, i) => {
    const amp = (Q.max[i] - Q.min[i]) * (1 - alb[i]) / (B + C);
    return {
      lat,
      T: T[i],
      Tsummer: T[i] + GAMMA_LAND * (Q.max[i] - Q.ann[i]) * (1 - alb[i]) / (B + C),
      Twinter: T[i] - GAMMA_LAND * (Q.ann[i] - Q.min[i]) * (1 - alb[i]) / (B + C),
      TwinterSea: T[i] - GAMMA_SEA * (Q.ann[i] - Q.min[i]) * (1 - alb[i]) / (B + C),
      seasonal: GAMMA_LAND * amp,
      ice: alb[i] > (ALB_FREE + ALB_ICE) / 2,
      Qann: Q.ann[i], Qmax: Q.max[i], Qmin: Q.min[i],
    };
  });
  const Tmean = wmean(T);
  const iceN = bands.filter((b) => b.lat > 0 && b.ice).reduce((m, b) => Math.min(m, b.lat), 90);
  const iceS = bands.filter((b) => b.lat < 0 && b.ice).reduce((m, b) => Math.max(m, b.lat), -90);
  const iceArea = bands.reduce((s, b, i) => s + (b.ice ? W[i] : 0), 0) / WSUM;
  const eq = bands[NB / 2];
  const pole = bands[NB - 1];
  return {
    bands, Tmean, iceN, iceS, iceArea,
    snowball: iceArea > 0.97,
    iceFree: iceArea < 0.005,
    Seff: k.solar,
    runaway: k.solar >= 1.1,                 // 3-D threshold, Leconte et al. 2013
    moistZone: k.solar >= 1.0146 && k.solar < 1.1,   // between the 1-D moist-greenhouse limit and the 3-D runaway
    Teq: eq.T, Tpole: pole.T,
    QpoleOverEq: Q.ann[NB - 1] / Q.ann[NB / 2],
    co2Forcing: dF,
    co2: thermostat ? thermostat.co2 : k.co2ppm,
    thermostat,
    transport: C,
    A,
  };
}

/* temperature at a latitude and elevation (km), lapse rate scaled by g */
export function tempAt(clim, lat, elevKm, gFactor = 1) {
  const x = (lat + 89) / 2;
  const i = Math.max(0, Math.min(NB - 2, Math.floor(x)));
  const f = Math.max(0, Math.min(1, x - i));
  const a = clim.bands[i], b = clim.bands[i + 1];
  const lapse = EARTH.lapseMoist * gFactor;                 // moist lapse scales with g/cp as the dry one does
  const h = Math.max(0, elevKm);
  return {
    T: a.T + (b.T - a.T) * f - lapse * h,
    Tw: a.Twinter + (b.Twinter - a.Twinter) * f - lapse * h,
    Ts: a.Tsummer + (b.Tsummer - a.Tsummer) * f - lapse * h,
    TwSea: a.TwinterSea + (b.TwinterSea - a.TwinterSea) * f,
  };
}

/* our ice-free mean, the thermostat's target */
const OURS_ICEFREE_T = (() => {
  const Q = insolationProfile(EARTH.tiltDeg, EARTH.solarWm2);
  const { T, alb } = solve(Q, A_CAL, C0, ourIce);
  let s = 0, w = 0; for (let i = 0; i < NB; i++) if (alb[i] < (ALB_FREE + ALB_ICE) / 2) { s += T[i] * W[i]; w += W[i]; }
  return s / w;
})();

export const CLIMATE_CONST = { B, ALB_FREE, ALB_ICE, T_ICE, T_SEAICE, C0, A_CAL, OURS_ICEFREE_T };
