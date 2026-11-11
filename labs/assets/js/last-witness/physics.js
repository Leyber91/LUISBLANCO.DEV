/* ============================================================
   last-witness/physics.js — the clocks. Pure functions, no DOM.

   Three ways to let ten thousand years pass outside while little
   passes for you, each with its real formula and its real cost:

     hover   a static observer at radius r outside a Schwarzschild
             hole: dtau/dt = sqrt(1 - rs/r). Proper acceleration
             needed to hold station a = GM / (r^2 sqrt(1 - rs/r)).
             (Hartle 2003, ch. 9; Misner, Thorne & Wheeler 1973, §25.)
     orbit   a prograde circular equatorial geodesic of a Kerr hole
             of spin a* (Bardeen, Press & Teukolsky 1972, ApJ 178,
             347, eqs. 2.12-2.21): u^t, E, L, Omega; the innermost
             stable circular orbit from their eq. 2.21.
     flight  a round trip at constant proper acceleration in four
             equal legs (hyperbolic motion, MTW 1973 §6.2):
             t = (c/a) sinh(a tau / c), x = (c^2/a)(cosh(a tau / c) - 1).

   Units: SI unless a name ends in M (geometric, G = c = 1, lengths
   and times in units of the hole's mass M).

   Precision note: near-extremal spins are handled through
   delta = 1 - a*, never through a* itself, because a* = 1 - 1e-15
   is not representable apart from 1 in a double. The orbit's
   x^3 - 3x + 2a* is factored as (x-1)^2 (x+2) - 2 delta to avoid
   the cancellation that would otherwise eat every digit.
   ============================================================ */

export const C = 299792458;              // m/s, exact (SI)
export const GM_SUN = 1.32712440018e20;  // m^3/s^2, IAU 2015 nominal solar mass parameter
export const G0 = 9.80665;               // m/s^2, standard gravity (exact by definition)
export const YEAR = 365.25 * 86400;      // s, Julian year
export const HOUR = 3600;

/* ---------- Kerr circular orbits (BPT 1972) ---------- */

/* Innermost stable circular orbit, prograde, in units of M. */
export function iscoM(delta) {
  const d = Math.min(1, Math.max(0, delta));
  if (d >= 1) return 6;                   // Schwarzschild
  const a = 1 - d;
  const oneMinusA2 = d * (2 - d);          // 1 - a^2, computed without cancellation
  const z1 = 1 + Math.cbrt(oneMinusA2) * (Math.cbrt(2 - d) + Math.cbrt(d));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

/* Prograde circular equatorial geodesic at radius rM (units of M),
   spin a* = 1 - delta. Returns proper-time rate, energy and angular
   momentum per unit rest mass, and angular velocity seen from far away. */
export function circularOrbit(rM, delta) {
  const d = Math.min(1, Math.max(0, delta));
  const a = 1 - d;
  const x = Math.sqrt(rM);
  const xm1 = (rM - 1) / (x + 1);          // x - 1, exact for x near 1
  const q = xm1 * xm1 * (x + 2) - 2 * d;   // x^3 - 3x + 2a
  if (!(q > 0)) return null;               // inside the photon orbit: no timelike circular orbit
  const r34 = Math.pow(rM, 0.75);
  const den = r34 * Math.sqrt(q);
  const ut = (x * x * x + a) / den;        // dt/dtau
  const eNum = xm1 * (x * x + x - 1) - d;  // x^3 - 2x + a
  const E = eNum / den;
  const L = (rM * rM - 2 * a * x + a * a) / den;
  const omegaM = 1 / (x * x * x + a);      // dphi/dt in units of 1/M
  return { ut, dtaudt: 1 / ut, E, L, omegaM };
}

/* Speed of a prograde circular orbit measured by the local zero-angular-
   momentum observer: gamma = alpha u^t, with the equatorial lapse
   alpha^2 = r^2 Delta / A, A = (r^2 + a^2)^2 - a^2 Delta,
   Delta = (r - 1)^2 - delta (2 - delta) (no cancellation near a* = 1).
   Checks: 1/2 at the Schwarzschild ISCO, tending to 1/2 at the extremal
   ISCO (Bardeen, Press & Teukolsky 1972). */
export function zamoSpeed(rM, delta) {
  const d = Math.min(1, Math.max(0, delta));
  const a = 1 - d;
  const o = circularOrbit(rM, d);
  if (!o) return NaN;
  const Delta = (rM - 1) * (rM - 1) - d * (2 - d);
  const A = (rM * rM + a * a) ** 2 - a * a * Delta;
  const alpha = Math.sqrt(rM * rM * Delta / A);
  const gamma = alpha * o.ut;
  return Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma)));
}

/* Propellant for the whole journey, ideal photon rocket (exhaust at c):
   each burn needs m0/m1 = exp(dpsi), dpsi the change in rapidity
   (delta-v = c tanh(ln(m0/m1)) for v_e = c).
     flight  four burns of rapidity phi each, exact
     hover   continuous thrust: m1 = m0 exp(-integral of a dtau / c), exact
     orbit   a slow spiral between circular orbits; dpsi is taken as the
             change in local orbital rapidity, the Newtonian low-thrust
             spiral result applied to zero-angular-momentum-observer
             speeds [approximation, tagged on the page]
   Masses are counted backward from the craft that comes home. */
export function propellant(plan, craftKg) {
  const legs = plan.journey.legs;
  const lnR = legs.map((l) => {
    if (plan.method === 'flight') return plan.phi;
    if (plan.method === 'hover') {
      const k = C * C / (plan.mSun * GM_SUN);          // 1/M in 1/m, so a = k c^2 * aM
      const aAt = (rM) => (k * C * C) * (1 / (rM * rM)) / Math.sqrt(1 - 2 / rM);
      if (l.id === 'fall' || l.id === 'climb') {
        const n = 400; let s = 0;
        for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; s += aAt(plan.journey.path(l.id === 'fall' ? x : 1 - x)); }
        return (s / n) * l.shipS / C;
      }
      return aAt(l.rFrom) * l.shipS / C;
    }
    if (l.id !== 'fall' && l.id !== 'climb') return 0;
    const psi = (rM) => Math.atanh(Math.min(0.999999, zamoSpeed(rM, plan.delta)));
    return Math.abs(psi(plan.journey.path(1)) - psi(l.id === 'fall' ? l.rFrom : l.rTo));
  });
  const out = new Array(legs.length);
  let m = craftKg;
  for (let i = legs.length - 1; i >= 0; i--) {
    const after = m;
    m = after * Math.exp(Math.min(700, lnR[i]));
    out[i] = { id: legs[i].id, lnRatio: lnR[i], massBeforeKg: m, massAfterKg: after, dvC: Math.tanh(lnR[i]) };
  }
  return { legs: out, startKg: m, lnTotal: lnR.reduce((s, x) => s + x, 0) };
}

/* Horizon radius r+ = M (1 + sqrt(1 - a^2)), in units of M. */
export function horizonM(delta) {
  const d = Math.min(1, Math.max(0, delta));
  return 1 + Math.sqrt(d * (2 - d));
}

/* ---------- conversions ---------- */
export const massSI = (mSun) => mSun * GM_SUN;          // GM in m^3/s^2
export const lengthM = (mSun) => massSI(mSun) / (C * C); // GM/c^2, metres
export const timeM = (mSun) => massSI(mSun) / (C * C * C); // GM/c^3, seconds

/* ---------- the three crossings ---------- */

/* Tidal stretch across a body of length L at Boyer-Lindquist radius r
   (metres): the Newtonian 2GML/r^3. Exact for a static observer in
   Schwarzschild; an order-one estimate for an orbit near a spinning hole. */
export const tidal = (mSun, rMetres, L) => 2 * massSI(mSun) * L / Math.pow(rMetres, 3);

/* ---------- the journey: four legs, each integrated ----------

   depart    leave the station, holding its orbit far out at r0; the ship
             starts at the hole, so there is no transit from home to count
             [illustrative: no hole is known near any inhabited world]
   fall      spiral in through circular orbits (or lower the station) to
             the working radius; r(s) = rd + (r0 - rd) 10^(-K s), so the
             integration is dense where the clock rate climbs fastest
   dwell     the orbit or the hover itself; its proper time is solved so
             that the four legs total exactly the outside target
   climb     the fall in reverse
   return    back to the station at r0
   Each leg integrates dt/dtau along its path with classical RK4. The
   rate depends on tau only through r(tau), so each RK4 step reduces to
   Simpson's rule; N steps per leg. Energy E is the conserved energy per
   unit rest mass of the circular orbit (BPT 1972) or of the static
   observer, sqrt(1 - rs/r); each burn changes it by dE. */
export const LEG_N = 4000;
const LEG_K = 8;

export function rk4Leg(rate, shipS, n = LEG_N) {
  // integrate dt/dtau = rate(tau) on [0, shipS]; returns total and a sampled table
  const h = shipS / n;
  let t = 0;
  const tab = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = i * h;
    const k1 = rate(a), k2 = rate(a + h / 2), k3 = k2, k4 = rate(a + h);
    t += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    tab[i + 1] = t;
  }
  return { homeS: t, tab, h };
}

export function buildLegs({ method, rd, rateAt, energyAt, outsideS, r0, approachShipS = 300, fallShipS = 2400 }) {
  const path = (sFrac) => rd + (r0 - rd) * Math.pow(10, -LEG_K * sFrac);
  const approach = rk4Leg(() => rateAt(r0), approachShipS, 200);
  const fall = rk4Leg((tau) => rateAt(path(tau / fallShipS)), fallShipS);
  const climbRate = (tau) => rateAt(path(1 - tau / fallShipS));
  const climb = rk4Leg(climbRate, fallShipS);
  const dwellRate = rateAt(rd);
  const back = rk4Leg(() => rateAt(r0), approachShipS, 200);
  const dwellShipS = Math.max(0, (outsideS - approach.homeS - fall.homeS - climb.homeS - back.homeS) / dwellRate);
  const dwell = { homeS: dwellShipS * dwellRate };
  const E0 = energyAt(r0), Ed = energyAt(rd), Eend = energyAt(path(1));
  const legs = [
    { id: 'depart', shipS: approachShipS, homeS: approach.homeS, rFrom: r0, rTo: r0, rate: [rateAt(r0), rateAt(r0)], dE: 0, tab: approach.tab },
    { id: 'fall', shipS: fallShipS, homeS: fall.homeS, rFrom: r0, rTo: rd, rate: [rateAt(r0), rateAt(path(1))], dE: Eend - E0, tab: fall.tab },
    { id: 'dwell', shipS: dwellShipS, homeS: dwell.homeS, rFrom: rd, rTo: rd, rate: [dwellRate, dwellRate], dE: Ed - Eend, tab: null },
    { id: 'climb', shipS: fallShipS, homeS: climb.homeS, rFrom: rd, rTo: r0, rate: [rateAt(path(1)), rateAt(r0)], dE: E0 - Ed, tab: climb.tab },
    { id: 'return', shipS: approachShipS, homeS: back.homeS, rFrom: r0, rTo: r0, rate: [rateAt(r0), rateAt(r0)], dE: 0, tab: back.tab },
  ];
  let ts = 0, th = 0;
  for (const l of legs) { l.ship0 = ts; l.home0 = th; ts += l.shipS; th += l.homeS; }
  return { legs, shipS: ts, homeS: th, path, rateAt, method };
}

/* Home time at ship time tau, from the integrated legs. */
export function legsHome(J, tau) {
  for (const l of J.legs) {
    if (tau > l.ship0 + l.shipS && l !== J.legs[J.legs.length - 1]) continue;
    const x = Math.max(0, Math.min(l.shipS, tau - l.ship0));
    if (!l.tab) return l.home0 + x * l.rate[0];
    const n = l.tab.length - 1, f = (x / l.shipS) * n, i = Math.min(n - 1, Math.floor(f));
    return l.home0 + l.tab[i] + (l.tab[i + 1] - l.tab[i]) * (f - i);
  }
  return J.homeS;
}

/* Clock rate dt/dtau at ship time tau. */
export function legsRate(J, tau) {
  for (const l of J.legs) {
    if (tau > l.ship0 + l.shipS && l !== J.legs[J.legs.length - 1]) continue;
    const x = Math.max(0, Math.min(1, (tau - l.ship0) / (l.shipS || 1)));
    if (l.id === 'fall') return J.rateAt(J.path(x));
    if (l.id === 'climb') return J.rateAt(J.path(1 - x));
    if (l.id === 'return' || l.id === 'depart') return l.rate[0];
    return l.rate[0];
  }
  return 1;
}

/**
 * orbit: a circular orbit at radius factor k >= 1 times the ISCO.
 * Returns the clock ratio and every cost the planner shows.
 */
export function planOrbit({ mSun, delta, k = 1, outsideYears, bodyL, craftKg }) {
  const r0 = iscoM(delta);
  const rM = r0 * Math.max(1, k);
  const o = circularOrbit(rM, delta);
  if (!o) return null;
  const D = o.ut;                                     // outside seconds per ship second, at the orbit
  const J = buildLegs({
    method: 'orbit', rd: rM, r0: Math.max(40, rM * 4), outsideS: outsideYears * YEAR,
    rateAt: (r) => circularOrbit(r, delta).ut, energyAt: (r) => circularOrbit(r, delta).E,
  });
  const shipS = J.shipS;
  const rSI = rM * lengthM(mSun);
  const periodFar = 2 * Math.PI / o.omegaM * timeM(mSun); // s, far-away clock
  const bind = 1 - o.E;                                // fraction of rest mass to shed going in, and to find coming out
  return {
    method: 'orbit', D, shipS, outsideS: outsideYears * YEAR, journey: J,
    rM, iscoM: r0, horizonM: horizonM(delta), rSI,
    E: o.E, L: o.L, bind,
    accelG: 0,                                         // free fall: weightless
    tidalG: tidal(mSun, rSI, bodyL) / G0,
    periodFarS: periodFar, periodShipS: periodFar / D,
    energyJ: bind * craftKg * C * C,                   // to climb back out
    massRatio: null,
  };
}

/**
 * hover: hold station at r = f * rs with engines (Schwarzschild).
 */
export function planHover({ mSun, f, outsideYears, bodyL, craftKg }) {
  const ff = Math.max(1 + 1e-12, f);
  const rs = 2 * lengthM(mSun);
  const r = ff * rs;
  const alpha = Math.sqrt(1 - 1 / ff);               // dtau/dt for a static observer
  const D = 1 / alpha;
  const J = buildLegs({
    method: 'hover', rd: 2 * ff, r0: Math.max(80, 8 * ff), outsideS: outsideYears * YEAR,
    rateAt: (rM) => 1 / Math.sqrt(1 - 2 / rM), energyAt: (rM) => Math.sqrt(1 - 2 / rM),
  });
  const shipS = J.shipS;
  const aProper = massSI(mSun) / (r * r * alpha);      // m/s^2 the engines must supply
  return {
    method: 'hover', D, shipS, outsideS: outsideYears * YEAR, journey: J,
    rM: 2 * ff, rSI: r, alpha,
    accelG: aProper / G0,
    tidalG: tidal(mSun, r, bodyL) / G0,
    // surface gravity of the hole; a static ship near the horizon needs
    // a * alpha -> kappa, so the dilation it can survive is a_max / kappa
    kappaG: (C ** 4 / (4 * massSI(mSun))) / G0,
    // rocket: holding station for shipS at proper acceleration a costs
    // rapidity a*tau/c, mass ratio exp(a tau / c) for an ideal photon drive
    massRatio: Math.exp(Math.min(700, aProper * shipS / C)),
    energyJ: null,
  };
}

/**
 * flight: out and back in four legs of equal proper duration at
 * constant proper acceleration aG (in g).
 */
export function planFlight({ aG, outsideYears, craftKg }) {
  const a = aG * G0;
  const T = outsideYears * YEAR;
  const k = C / a;                                     // s
  const tauQ = k * Math.asinh(T / (4 * k));            // proper time per leg
  const phi = tauQ / k;                                // rapidity at the end of leg 1
  const gammaMax = Math.cosh(phi);
  const xMax = 2 * (C * k) * (Math.cosh(phi) - 1);     // farthest distance, m
  const lnRatio = 4 * phi;                             // ideal photon rocket, four burns
  const t1 = k * Math.sinh(phi);                       // coordinate time per leg, closed form
  const ids = ['accelerate', 'brake', 'return', 'arrive'];
  const legs = ids.map((id, i) => {
    const up = i % 2 === 0;                             // rapidity rising on legs 1 and 3
    const rate = (tau) => Math.cosh((up ? tau : tauQ - tau) / k);
    const num = rk4Leg(rate, tauQ, 2000);
    return { id, shipS: tauQ, homeS: t1, homeRK4: num.homeS, tab: num.tab, rate: [up ? 1 : gammaMax, up ? gammaMax : 1],
      massRatio: Math.exp(phi), dE: 0, ship0: i * tauQ, home0: i * t1 };
  });
  return {
    method: 'flight', D: T / (4 * tauQ), shipS: 4 * tauQ, outsideS: T, journey: { legs, shipS: 4 * tauQ, homeS: 4 * t1, method: 'flight' },
    aG, accelG: aG, tidalG: 0, tauQ, phi, gammaMax,
    betaMax: Math.tanh(phi), xMaxLy: xMax / (C * YEAR),
    lnRatio, massRatio: Math.exp(Math.min(700, lnRatio)),
    energyJ: (Math.exp(Math.min(700, lnRatio)) - 1) * craftKg * C * C,
  };
}

/* ---------- the round trip in time, for the film and the pulse ----------

   For any plan, two maps from ship proper time tau (s) to home time:
     home(tau)  home's own clock at the same moment, in home's frame
     rx(tau)    when home RECEIVES what the ship sends at tau
     seen(tau)  which home moment the ship SEES at tau (light from home)
   For the orbit and the hover the hole is taken to sit close to home,
   so light delays are dropped [ILLUSTRATIVE]; the clocks keep the exact
   ratio D. For the flight the delays are the whole story and are kept. */
export function timeMaps(plan) {
  if (plan.method !== 'flight') {
    const J = plan.journey;
    const home = (tau) => legsHome(J, tau);
    const rate = (tau) => legsRate(J, tau);
    return { home, rx: home, seen: home, rate, seenRate: rate };
  }
  const a = plan.aG * G0, k = C / a, tq = plan.tauQ;
  const t1 = k * Math.sinh(tq / k), x1 = C * k * (Math.cosh(tq / k) - 1);
  const T = 4 * t1;
  const leg = (tau) => {                               // first half (outbound, 0..2tq)
    if (tau <= tq) return { t: k * Math.sinh(tau / k), x: C * k * (Math.cosh(tau / k) - 1), v: Math.tanh(tau / k) };
    const u = 2 * tq - tau;
    return { t: 2 * t1 - k * Math.sinh(u / k), x: 2 * x1 - C * k * (Math.cosh(u / k) - 1), v: Math.tanh(u / k) };
  };
  const state = (tau) => {
    const s = Math.min(4 * tq, Math.max(0, tau));
    if (s <= 2 * tq) return leg(s);
    const m = leg(4 * tq - s);
    return { t: T - m.t, x: m.x, v: -m.v };
  };
  return {
    home: (tau) => state(tau).t,
    rx: (tau) => { const s = state(tau); return s.t + s.x / C; },
    seen: (tau) => { const s = state(tau); return s.t - s.x / C; },
    // received-rate factor at home: time dilation times Doppler, sqrt((1+b)/(1-b))
    rate: (tau) => { const v = state(tau).v; return Math.sqrt((1 + v) / (1 - v)); },
    // how fast the ship sees home's clock run: d seen / d tau = gamma (1 - b) = sqrt((1-b)/(1+b))
    seenRate: (tau) => { const v = state(tau).v; return Math.sqrt((1 - v) / (1 + v)); },
    state,
  };
}

/* The ship's beacon as home hears it. The ship sends the pilot's
   heartbeat and carries an X-band carrier; both arrive stretched by the
   received-rate factor, and the carrier drops by the same factor. */
export function beaconAtHome(plan, { heartHz, carrierHz }) {
  const maps = timeMaps(plan);
  const N = 240;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const tau = plan.shipS * i / N;
    samples.push({ tau, rxYears: maps.rx(tau) / YEAR, factor: maps.rate(tau) });
  }
  const fmax = Math.max(...samples.map((s) => s.factor));
  const beatS = 1 / heartHz;
  const rxCarrierMin = carrierHz / fmax;
  return {
    samples,
    factorMax: fmax,
    beatsSent: plan.shipS * heartHz,
    beatIntervalMaxS: beatS * fmax,
    carrierMinHz: rxCarrierMin,
    halfWaveM: C / (2 * rxCarrierMin),                 // a half-wave dipole for the lowest carrier
  };
}

/* ---------- reference checks: the engine against published values ----------
   Each check runs the same functions the planner uses. */
export function referenceChecks() {
  const out = [];
  // 1. Schwarzschild ISCO: r = 6M, E = sqrt(8/9), dtau/dt = sqrt(1 - 3M/r) = 1/sqrt(2)
  const s = circularOrbit(iscoM(1), 1);
  out.push({ id: 'isco0', what: 'Schwarzschild ISCO radius', got: iscoM(1), want: 6, unit: 'M', src: 'Hartle 2003, §9.3' });
  out.push({ id: 'e0', what: 'Schwarzschild ISCO energy E', got: s.E, want: Math.sqrt(8 / 9), unit: '', src: 'Hartle 2003, §9.3' });
  out.push({ id: 'ut0', what: 'Schwarzschild ISCO dtau/dt', got: s.dtaudt, want: Math.SQRT1_2, unit: '', src: 'sqrt(1 - 3M/r) at r = 6M' });
  // 2. Thorne-limit spin a* = 0.998: ISCO near 1.237M, binding near 32 %
  out.push({ id: 'isco998', what: 'ISCO radius, a* = 0.998', got: iscoM(0.002), want: 1.237, unit: 'M', src: 'Thorne 1974, ApJ 191, 507' });
  // 3. Extremal Kerr: r = M, E = 1/sqrt(3)
  const ex = circularOrbit(iscoM(1e-30), 1e-30);
  out.push({ id: 'e1', what: 'Extremal Kerr ISCO energy E', got: ex ? ex.E : NaN, want: 1 / Math.sqrt(3), unit: '', src: 'Bardeen, Press & Teukolsky 1972' });
  // 4. GPS: gravitational gain minus velocity loss, ~ +38 microseconds a day
  const GM_E = 3.986004418e14, rE = 6.371e6, rG = 2.6561e7;
  const grav = (GM_E / (C * C)) * (1 / rE - 1 / rG);
  const vel = (GM_E / rG) / (2 * C * C);
  out.push({ id: 'gps', what: 'GPS clock, net rate vs ground', got: (grav - vel) * 86400 * 1e6, want: 38.5, unit: 'us/day', src: 'Ashby 2003, Living Rev. Relativity 6, 1' });
  return out.map((c) => ({ ...c, err: Math.abs(c.got - c.want) / Math.abs(c.want) }));
}

/* Solve for the spin offset delta = 1 - a* that puts the ISCO clock
   ratio at D (bisection in log delta). Used by the presets. */
export function deltaForD(D) {
  let lo = -40, hi = 0;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const d = Math.pow(10, mid);
    const o = circularOrbit(iscoM(d), d);
    if (!o || o.ut > D) lo = mid; else hi = mid;
  }
  return Math.pow(10, (lo + hi) / 2);
}
