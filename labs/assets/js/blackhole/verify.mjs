/* ============================================================
   blackhole/verify.mjs — checks the engine against published values.
   Run:  node labs/assets/js/blackhole/verify.mjs
   Exit 0 when every check passes. No dependencies.

   What it checks
   1. The Hamiltonian gradient (analytic, as in the shader) against finite differences.
   2. H stays ~0 along a strong-field ray (integrator accuracy).
   3. The shadow measured by bisection with the integrator against the analytic critical
      curve (Bardeen 1973) for a = 0, 0.5, 0.94, 0.998 at several inclinations.
   4. a = 0: shadow diameter 2 sqrt(27) M; the shadow seen by a static observer at r = 6 M
      and r = 4 M against Synge (1966).
   5. ISCO and efficiency against Bardeen, Press & Teukolsky (1972) / Thorne (1974) values.
   6. The Novikov-Thorne flux by quadrature against the Page & Thorne (1974) closed form.
   ============================================================ */
import * as K from './kerr.js';

let fails = 0;
const ok = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);

/* 1. gradient check */
{
  const a = 0.9, s = [3.1, -1.7, 0.8, 0.3, 0.9, -0.2], pt = 1.1;
  const out = new Float64Array(6);
  K.rhs(a, s, pt, out);
  let worst = 0;
  for (let i = 0; i < 6; i++) {
    const h = 1e-6, sp = s.slice(), sm = s.slice();
    sp[i] += h; sm[i] -= h;
    const dH = (K.hamiltonian(a, sp, pt) - K.hamiltonian(a, sm, pt)) / (2 * h);
    // dx_i/dl = dH/dp_i ; dp_i/dl = -dH/dx_i
    const expect = i < 3 ? null : null;
    const idx = i < 3 ? i + 3 : i - 3;
    const analytic = i < 3 ? -out[idx] : out[idx];
    worst = Math.max(worst, Math.abs(analytic - dH));
    void expect;
  }
  ok('Hamiltonian gradient matches finite differences', worst < 1e-6, `max |diff| = ${worst.toExponential(2)}`);
}

/* 2. H conservation on a ray that winds near the photon orbit */
{
  const a = 0.94;
  const cam = K.zamoCamera(a, K.cameraPosition(30, 1.4, 0));
  const p = K.rayMomentum(cam, 0.172, 0.02, 1);
  const s = new Float64Array([cam.pos[0], cam.pos[1], cam.pos[2], p[1], p[2], p[3]]);
  const H0 = K.hamiltonian(a, s, p[0]);
  let worst = 0, steps = 0;
  for (let i = 0; i < 3000; i++) {
    const r = K.ksR(a, s[0], s[1], s[2]);
    if (r < K.horizon(a) * 1.01 || (r > 40 && s[0] * s[3] + s[1] * s[4] + s[2] * s[5] > 0)) break;
    K.rk4(a, s, p[0], K.stepSize(r, K.horizon(a), 0.05));
    worst = Math.max(worst, Math.abs(K.hamiltonian(a, s, p[0])));
    steps++;
  }
  ok('null condition holds along a strong-field ray', worst < 2e-4 && Math.abs(H0) < 1e-12, `|H|max = ${worst.toExponential(2)} over ${steps} steps`);
}

/* 3. shadow vs Bardeen */
const RO = 1000;
function measureShadow(a, inclDeg, k) {
  const incl = inclDeg * Math.PI / 180;
  const cam = K.zamoCamera(a, K.cameraPosition(RO, incl, 0));
  const T = 16 / RO;
  const hor = (t) => [t, 0, 1];
  const left = K.bisectEdge(a, cam, hor, 0, -T, 26, k);
  const right = K.bisectEdge(a, cam, hor, 0, T, 26, k);
  const bL = -K.angleToImpact(Math.atan(-left), RO), bR = K.angleToImpact(Math.atan(right), RO);
  const ac = 0.5 * (bL + bR);
  const tc = Math.tan(Math.asin(ac * Math.sqrt(1 - 2 / RO) / RO));
  const ver = (t) => [tc, t, 1];
  const up = K.bisectEdge(a, cam, ver, 0, T, 26, k);
  const dn = K.bisectEdge(a, cam, ver, 0, -T, 26, k);
  // vertical impact: perpendicular offset, same small-angle map
  const bU = K.angleToImpact(Math.atan(up), RO), bD = -K.angleToImpact(Math.atan(-dn), RO);
  return { amin: bL, amax: bR, width: bR - bL, height: bU - bD };
}

for (const [a, incl] of [[0.0, 60], [0.5, 60], [0.9, 17], [0.9, 90], [0.998, 17], [0.998, 90], [0.94, 17], [0.94, 90], [0.9, 30]]) {
  const th = K.shadowChords(K.shadowCurve(a, incl * Math.PI / 180));
  const m = measureShadow(a, incl, 0.05);
  const eW = rel(m.width, th.width), eA = Math.abs(m.amin - th.amin), eH = rel(m.height, th.height);
  ok(`shadow a=${a} i=${incl}deg  width ${m.width.toFixed(4)} vs ${th.width.toFixed(4)}`, eW < 2e-3 && eA < 0.02,
    `rel ${(eW * 100).toFixed(3)}%  left edge ${m.amin.toFixed(3)} vs ${th.amin.toFixed(3)}  height ${m.height.toFixed(3)} vs ${th.height.toFixed(3)} (${(eH * 100).toFixed(2)}%)`);
}

/* the full outline: 360 polar angles around the shadow centre, traced edge vs Bardeen curve,
   at both spins and both inclinations (a = 0.9 and 0.998, i = 17 and 90 deg) */
for (const [a, inclDeg] of [[0.9, 17], [0.9, 90], [0.998, 17], [0.998, 90]]) {
  const incl = inclDeg * Math.PI / 180;
  const cam = K.zamoCamera(a, K.cameraPosition(RO, incl, 0, a));
  const curve = K.shadowCurve(a, incl, 2000);
  const ch = K.shadowChords(curve);
  const cx = ch.center;
  const toT = (b) => Math.tan(Math.asin(b * Math.sqrt(1 - 2 / RO) / RO));
  // radius of the analytic curve along direction psi from (cx, 0)
  const curveR = (psi) => {
    const dx = Math.cos(psi), dy = Math.sin(psi);
    let best = null;
    for (let i = 0; i < curve.length; i++) {
      const [x0, y0] = curve[i], [x1, y1] = curve[(i + 1) % curve.length];
      // solve (cx + t dx, t dy) = p0 + s (p1 - p0)
      const ex = x1 - x0, ey = y1 - y0, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((x0 - cx) * ey - y0 * ex) / den, s = ((x0 - cx) * dy - y0 * dx) / den;
      if (t > 0 && s >= 0 && s <= 1) best = best == null ? t : Math.min(best, t);
    }
    return best;
  };
  let worst = 0, sumR = 0;
  for (let k = 0; k < 360; k++) {
    const psi = (k + 0.5) * Math.PI / 180;
    const dx = Math.cos(psi), dy = Math.sin(psi);
    let lo = 0, hi = 9;   // radial distance from the centre in impact parameter, M
    for (let it = 0; it < 18; it++) {
      const m = 0.5 * (lo + hi);
      const f = K.traceRay(a, cam, toT(cx + m * dx), toT(m * dy), 1, { k: 0.08 }).fate;
      if (f === 'captured') lo = m; else hi = m;
    }
    const rt = 0.5 * (lo + hi), rb = curveR(psi);
    sumR += rb;
    worst = Math.max(worst, Math.abs(rt - rb));
  }
  const meanR = sumR / 360;
  ok(`outline at 360 angles, a=${a} i=${inclDeg}deg, camera 1000 M: max radial deviation ${(100 * worst / meanR).toFixed(3)}% of the mean radius ${meanR.toFixed(3)} M`,
    worst / meanR < 0.01);
}

/* the shader's step constant: how coarse can it go? */
for (const k of [0.08, 0.12]) {
  const th = K.shadowChords(K.shadowCurve(0.94, Math.PI / 2));
  const m = measureShadow(0.94, 90, k);
  console.log(`info  step k=${k}: width ${m.width.toFixed(4)} vs ${th.width.toFixed(4)} (${(rel(m.width, th.width) * 100).toFixed(3)}%)`);
}

/* 3b. the critical curve against its form as Gralla and Lupsasca (2020, Phys. Rev. D 101, 044031, Eqs. 38 to 40 and
   55 to 57) state it, written out here independently of kerr.js (ledger row 5, S10). For every point (alpha, beta) of
   K.shadowCurve, the photon-shell radius r with lambda(r) = -alpha sin(i) is found by bisection inside
   [r-, r+] = 2[1 + cos(2/3 arccos(-+a))], and their beta at that r must equal the point's |beta|. */
{
  const glLambda = (a, r) => { const D = r * r - 2 * r + a * a; return a + (r / a) * (r - 2 * D / (r - 1)); };
  const glEta = (a, r) => { const D = r * r - 2 * r + a * a; return (r ** 3 / (a * a)) * (4 * D / ((r - 1) ** 2) - r); };
  let worst = 0, n = 0;
  for (const a of [0.5, 0.94, 0.998]) for (const inclDeg of [17, 60, 90]) {
    const incl = inclDeg * Math.PI / 180, s = Math.sin(incl), c = Math.cos(incl);
    const rLo = 2 * (1 + Math.cos(2 / 3 * Math.acos(-a))), rHi = 2 * (1 + Math.cos(2 / 3 * Math.acos(a)));
    for (const [alpha, beta] of K.shadowCurve(a, incl, 400)) {
      const want = -alpha * s;
      let lo = rLo, hi = rHi;
      const f = (r) => glLambda(a, r) - want;
      if (f(lo) * f(hi) > 0) continue;            // the curve's ends, where the root sits on the shell's edge
      for (let k = 0; k < 200; k++) { const mid = 0.5 * (lo + hi); if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
      const r = 0.5 * (lo + hi), L = glLambda(a, r);
      const b2 = glEta(a, r) + a * a * c * c - L * L * c * c / (s * s);
      // beta^2 and not beta: near the curve's ends beta goes as sqrt(r - r_end), which magnifies the last digit of r
      worst = Math.max(worst, Math.abs(b2 - beta * beta));
      n++;
    }
  }
  ok(`critical curve = Gralla & Lupsasca 2020 eqs (38)-(40), (55)-(57) at a = 0.5, 0.94, 0.998 and i = 17, 60, 90 deg`, n > 5000 && worst < 1e-9, `${n} points, worst |beta^2| difference ${worst.toExponential(2)} M^2`);
}

/* 4. Schwarzschild numbers */
{
  const th = K.shadowChords(K.shadowCurve(0, Math.PI / 3));
  ok('a=0 analytic shadow diameter = 2 sqrt(27)', rel(th.width, 2 * Math.sqrt(27)) < 1e-4, th.width.toFixed(5));
  for (const r of [6, 4]) {
    const cam = K.zamoCamera(0, K.cameraPosition(r, Math.PI / 2, 0));
    // angle from the forward axis: direction (sin t, 0, cos t)
    let lo = 0, hi = Math.PI * 0.999;
    for (let i = 0; i < 30; i++) {
      const m = 0.5 * (lo + hi);
      const f = K.traceRay(0, cam, Math.sin(m), 0, Math.cos(m), { k: 0.03 }).fate;
      if (f === 'captured') lo = m; else hi = m;
    }
    const meas = 0.5 * (lo + hi), theory = K.syngeAngle(r);
    ok(`static observer at r=${r}M sees the shadow radius ${(meas * 180 / Math.PI).toFixed(2)} deg (Synge ${(theory * 180 / Math.PI).toFixed(2)})`,
      Math.abs(meas - theory) < 2e-3);
  }
}

/* 4b. charge: Reissner-Nordstrom shadow and horizon (the q term of the metric) */
{
  const q = 0.6;
  const m = K.measureShadow(0, Math.PI / 3, { q, k: 0.05, iters: 26 });
  const bc = K.rnCriticalB(q);
  ok(`Reissner-Nordstrom q=${q}: shadow diameter ${m.width.toFixed(4)} vs 2 b_c ${(2 * bc).toFixed(4)}`, rel(m.width, 2 * bc) < 2e-3);
  ok('Kerr-Newman horizon a=0.6 q=0.6 = 1 + sqrt(0.28)', Math.abs(K.horizon(0.6, 0.6) - (1 + Math.sqrt(0.28))) < 1e-12);
  const tab = K.ntFluxTable(0.5, 40, 256, 0), tabq = K.ntFluxTable(0.5, 40, 256, 1e-9);
  ok('ISCO by E-minimisation equals the closed form (a=0.5)', Math.abs(K.isco(0.5, 1, 1e-9) - K.isco(0.5)) < 1e-4 && Math.abs(tab.rIn - tabq.rIn) < 1e-4,
    `${K.isco(0.5, 1, 1e-9).toFixed(5)} vs ${K.isco(0.5).toFixed(5)}`);
}

/* 4c. moving observers: aberration of the shadow (special-relativistic formula at the camera) */
{
  const edgeAngle = (cam, sgn) => {
    let lo = 0, hi = sgn * Math.PI * 0.999;
    for (let i = 0; i < 30; i++) {
      const m = 0.5 * (lo + hi);
      const f = K.traceRay(0, cam, Math.sin(m), 0, Math.cos(m), { k: 0.03 }).fate;
      if (f === 'captured') lo = m; else hi = m;
    }
    return 0.5 * (lo + hi) * 180 / Math.PI;
  };
  // free faller (raindrop) at r = 6: v = sqrt(2/r) relative to the static observer,
  // cos(th') = (cos th + v) / (1 + v cos th) with th = 45 deg (Synge)
  const fal = K.observerFrame(0, K.cameraPosition(6, Math.PI / 2, 0), { observer: 'faller' });
  const v = Math.sqrt(2 / 6), c45 = Math.SQRT1_2;
  const expectF = Math.acos((c45 + v) / (1 + v * c45)) * 180 / Math.PI;
  const mF = edgeAngle(fal, 1);
  ok(`falling observer at 6M sees a smaller shadow: ${mF.toFixed(2)} deg (aberration ${expectF.toFixed(2)}; hovering 45.00)`, Math.abs(mF - expectF) < 0.1);
  // circular orbiter at r = 6: v = 1/sqrt(r - 2) = 0.5 along +phi = screen right
  const orb = K.observerFrame(0, K.cameraPosition(6, Math.PI / 2, 0), { observer: 'orbiter' });
  const vo = 0.5;
  const ab = (thStaticFromMotion) => Math.acos((Math.cos(thStaticFromMotion) + vo) / (1 + vo * Math.cos(thStaticFromMotion)));
  const expL = -(ab(Math.PI * 135 / 180) * 180 / Math.PI - 90), expR = 90 - ab(Math.PI / 4) * 180 / Math.PI;
  const mL = edgeAngle(orb, -1), mR = edgeAngle(orb, 1);
  // the width is frame-independent of where the camera points; the centre depends on the
  // camera's pointing convention, so only its sign (forward, toward +phi = right) is checked
  ok(`orbiting observer at 6M: shadow width ${(mR - mL).toFixed(2)} deg (aberration ${(expR - expL).toFixed(2)}), shifted toward the motion`,
    Math.abs((mR - mL) - (expR - expL)) < 0.15 && (mL + mR) > 0, `edges ${mL.toFixed(2)}, ${mR.toFixed(2)}`);
  ok('orbiting clock at 6M, a=0 runs at sqrt(1 - 3/r) = 0.70711 of the far clock', Math.abs(K.orbitClockRate(0, 6) - Math.SQRT1_2) < 1e-6, K.orbitClockRate(0, 6).toFixed(6));
  ok('hovering clock at 3M, a=0 runs at sqrt(1 - 2/r) = 0.57735', Math.abs(K.hoverClockRate(0, 3) - Math.sqrt(1 / 3)) < 1e-9);
  ok('fall from the horizon to r = 0 takes 4/3 M of proper time (a = 0)', Math.abs(K.interiorTau(0) - 4 / 3) < 1e-4, K.interiorTau(0).toFixed(5));
  const ft = K.fallTable(0, Math.PI / 2, 40);
  const last = ft[ft.length - 1];
  const tauExact = (2 / 3) * (Math.pow(40, 1.5) - Math.pow(last.r, 1.5)) / Math.sqrt(2);
  ok('raindrop proper time 40M -> horizon = (2/3)(r0^1.5 - r^1.5)/sqrt(2)', rel(last.tau, tauExact) < 1e-3, `${last.tau.toFixed(3)} vs ${tauExact.toFixed(3)}`);
  // near the horizon r - r_h shrinks by e for every 2M of far time (a = 0), without bound,
  // while the proper time converges
  const prev = ft[ft.length - 2];
  const du = Math.log(prev.r - 2) - Math.log(last.r - 2);
  const slope = (last.t - prev.t) / du, dtau = (last.tau - prev.tau) / du;
  ok('far clock: 2M per e-fold of (r - r_h) at the horizon, proper time converging', Math.abs(slope - 2) < 0.01 && dtau < 2e-3,
    `dt/du = ${slope.toFixed(4)} M, dtau/du = ${dtau.toExponential(2)} M`);
}

/* 4d. photon sub-rings: successive images thinner by e^-gamma, gamma = pi at a = 0 (Johnson et al. 2020) */
for (const a of [0, 0.6, 0.9]) {
  // face-on, test annulus [6, 8] M (outside where near-critical rays first cross the plane)
  const w = K.subringWidths(a, 0.001, 6, 8, { samples: 4000, k: 0.03 });
  const gam = K.lyapunov(a, K.polarPhotonOrbit(a)), th = Math.exp(-gam);
  const r21 = w[2] / w[1], r32 = w[3] / w[2];
  ok(`sub-rings a=${a} face-on: n3/n2 ${r32.toFixed(4)}, n2/n1 ${r21.toFixed(4)} vs e^-gamma ${th.toFixed(4)} (gamma ${gam.toFixed(4)})`,
    Math.abs(r32 / th - 1) < 0.06 && Math.abs(r21 / th - 1) < 0.3,
    `n3/n2 off ${(100 * (r32 / th - 1)).toFixed(1)}%, n2/n1 off ${(100 * (r21 / th - 1)).toFixed(1)}% (not yet asymptotic)`);
}
ok('Lyapunov exponent tends to pi at a -> 0', Math.abs(K.lyapunov(1e-5, K.polarPhotonOrbit(1e-5)) - Math.PI) < 1e-3);

/* 5. ISCO, efficiency */
ok('ISCO a=0 = 6M', Math.abs(K.isco(0) - 6) < 1e-9, K.isco(0).toFixed(4));
ok('ISCO a=0.998 = 1.237M (Thorne 1974)', Math.abs(K.isco(0.998) - 1.2369) < 2e-3, K.isco(0.998).toFixed(4));
ok('efficiency a=0 = 5.72%', Math.abs(K.efficiency(0) - 0.0572) < 2e-4, (K.efficiency(0) * 100).toFixed(3) + '%');
ok('efficiency a=0.998 = 32.1%', Math.abs(K.efficiency(0.998) - 0.321) < 3e-3, (K.efficiency(0.998) * 100).toFixed(2) + '%');
ok('photon orbit a=0 = 3M, a=1 prograde -> 1M', Math.abs(K.photonOrbit(0) - 3) < 1e-9 && Math.abs(K.photonOrbit(1) - 1) < 1e-6);

/* 6. NT flux: quadrature vs closed form */
for (const a of [0.0, 0.5, 0.94, 0.998]) {
  const tab = K.ntFluxTable(a, 40, 512);
  let worst = 0, peakQ = 0;
  for (let i = 4; i < tab.r.length; i++) peakQ = Math.max(peakQ, tab.F[i]);
  for (let i = 4; i < tab.r.length; i += 7) {
    const c = K.ntFluxClosed(a, tab.r[i]);
    worst = Math.max(worst, Math.abs(tab.F[i] - c) / peakQ);
  }
  const pk = K.tablePeak(tab);
  ok(`NT flux a=${a}: quadrature = Page-Thorne closed form`, worst < 5e-3, `max dev ${(worst * 100).toFixed(3)}% of peak, peak at r=${pk.r.toFixed(2)}M`);
}

/* 7. units */
{
  const m87 = K.thetaG(6.5e9, 16.8e6);
  ok('M87* theta_g from M and D = 3.8 uas (EHT 2019 Paper VI)', Math.abs(m87 - 3.8) < 0.05, m87.toFixed(3) + ' uas');
  const sgr = K.thetaG(4.297e6, 8277);
  ok('Sgr A* theta_g (GRAVITY M, D) = 5.125 uas (EHT 2022 Paper I, Table 1)', Math.abs(sgr - 5.125) < 0.01, sgr.toFixed(4) + ' uas');
  const T = K.hawkingKelvin(K.SI.Msun);
  ok('Hawking temperature of 1 Msun = 6.17e-8 K', Math.abs(T - 6.17e-8) < 0.02e-8, T.toExponential(3) + ' K');
  // the a = q = 0 value is hbar c^3 / (8 pi G M k_B) to rounding
  const T0 = K.SI.hbar * K.SI.c ** 3 / (8 * Math.PI * K.SI.G * K.SI.Msun * K.SI.kB);
  ok('Hawking temperature at a = Q = 0 is hbar c^3 / (8 pi G M k_B)', Math.abs(T / T0 - 1) < 1e-12, `ratio ${(T / T0).toFixed(15)}`);
  // spinning and charged: T / T(a = q = 0) = 4 sqrt(1 - a^2 - q^2) / (r+^2 + a^2), r+ = 1 + sqrt(1 - a^2 - q^2)
  // (Adamo and Newman, arXiv:1410.6626, p. 21: T_bh proportional to sqrt(M^2 - a^2 - Q^2) / (r+^2 + a^2)), written
  // here from that form and not from the engine's (r+ - r-) / (2 (r+^2 + a^2))
  for (const [a, q] of [[0.5, 0], [0.94, 0], [0.998, 0], [0, 0.5], [0.3, 0.9]]) {
    const s = Math.sqrt(1 - a * a - q * q), want = 4 * s / ((1 + s) ** 2 + a * a);
    const got = K.hawkingKelvin(K.SI.Msun, a, q) / T;
    ok(`Hawking temperature at a = ${a}, Q = ${q}: ${want.toFixed(4)} of the non-spinning value`, Math.abs(got / want - 1) < 1e-9, `engine ${got.toFixed(6)}`);
  }
  ok('an extremal hole has no Hawking temperature', K.hawkingKelvin(K.SI.Msun, 1, 0) === 0 && K.hawkingKelvin(K.SI.Msun, 0.6, 0.8) < 1e-20, `${K.hawkingKelvin(K.SI.Msun, 0.6, 0.8)}`);
  // the number the page shows (physics.js derive, the Instrument card's "Hawking T") carries the hole's own spin
  // and charge: Cygnus X-1 as the page opens it, and a custom charged hole
  const { Store } = await import('./state.js');
  const { derive } = await import('./physics.js');
  for (const [name, search, patch] of [['Cygnus X-1', '?o=cygx1', null], ['a custom hole at a = 0.3, Q = 0.9', '', { obj: 'custom', a: 0.3, q: 0.9 }]]) {
    const st = new Store(); st.open(search); if (patch) st.set(patch, { instant: true });
    const m = derive(st.all());
    const want = K.hawkingKelvin(m.massSun * K.SI.Msun, m.a, m.q), flat = K.hawkingKelvin(m.massSun * K.SI.Msun);
    ok(`the page's Hawking T for ${name} is the spinning, charged value`, Math.abs(m.hawkingK / want - 1) < 1e-12 && m.hawkingK < flat * 0.95,
      `${m.hawkingK.toExponential(3)} K at a = ${m.a}, Q = ${m.q} (non-spinning ${flat.toExponential(3)} K)`);
  }
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
