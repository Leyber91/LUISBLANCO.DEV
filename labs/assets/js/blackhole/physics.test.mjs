/* ============================================================
   blackhole/physics.test.mjs — the derived model and the number
   formats every panel, caption, tour stop and question quotes.
   Run:  node labs/assets/js/blackhole/physics.test.mjs
   Exit 0 when every check passes. No dependencies.

   Each rule of physics.js is checked with a case just inside and
   just outside its bound: the cache's size and keys, the field of
   view on a portrait screen, the shadow's three cases (Kerr,
   charge without spin, Kerr-Newman with spin), the predicted
   angle and its error, the disk's temperature floor, and the
   formats at each change of unit or of form. Written on
   2026-11-16 with tests/physics.mutants.test.mjs, which breaks
   each rule and expects a check here to fail. The expected values
   come from the engine (kerr.js) or are written out from the
   formula the comment in physics.js names.
   ============================================================ */

import * as K from './kerr.js';
import * as P from './physics.js';
import { OBJECTS, DEFAULTS } from './config.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
/* a rule broken so that it throws is a failing check, not a crash */
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
/* relative closeness */
const near = (x, y, eps = 1e-9) => Math.abs(x - y) <= eps * Math.max(1, Math.abs(y));
const state = (over = {}) => ({ ...DEFAULTS, ...over });
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const SI = K.SI;

/* ---------- the cache, first: it starts empty with this module ---------- */
guard('the cache', () => {
  const first = P.theoryShadow(0, 1, 0.5);
  for (let i = 2; i <= 65; i++) P.theoryShadow(0, i, 0.5);
  ok('with 65 keys in the cache the first is still cached', P.theoryShadow(0, 1, 0.5) === first);
  P.theoryShadow(0, 66, 0.5);
  ok('the 66th key starts the cache over: the first is computed again', P.theoryShadow(0, 1, 0.5) !== first);
});

/* ---------- the field of view applies to the shorter screen axis ---------- */
guard('the field of view', () => {
  const t = Math.tan(60 * Math.PI / 360);
  ok('a square screen: the tangent of half of 60 deg', P.tanHalfV(60, 1) === t);
  ok('a landscape screen just wider than tall (1.05): the same vertical field', P.tanHalfV(60, 1.05) === t);
  ok('a portrait screen just taller than wide (0.95): the width shows 60 deg, so the vertical tangent is t / 0.95', near(P.tanHalfV(60, 0.95), t / 0.95), `${P.tanHalfV(60, 0.95)}`);
});

guard('objectOf', () => {
  ok('a state names its object by id', P.objectOf({ obj: 'sgra' }) === OBJECTS[1]);
  ok('a custom hole has no object: null', P.objectOf({ obj: 'custom' }) === null);
});

/* ---------- derive ---------- */
guard('derive', () => {
  const m = P.derive(state({ obj: 'custom', a: 0, q: 0, mass: 1, dist: 3, edd: -2 }));   // 10 Msun at a = Q = 0
  const GM = SI.GMsun * 10, rg = GM / SI.c ** 2, tg = GM / SI.c ** 3;
  ok('mass, distance and Eddington ratio are 10 to their log10', m.massSun === 10 && m.distPc === 1000 && near(m.edd, 0.01), `${m.massSun} ${m.distPc} ${m.edd}`);
  ok('a = Q = 0: horizon 2 M, ISCO 6 M, photon orbits 3 M, no inner horizon', m.rh === 2 && m.ri === 6 && m.rph === 3 && m.rphr === 3 && m.rmin === 0, `${m.rh} ${m.ri} ${m.rph} ${m.rphr} ${m.rmin}`);
  ok('a = Q = 0: efficiency 1 - sqrt(8/9), gas at the ISCO at 0.5 c, surface gravity 1/4', near(m.eta, 1 - Math.sqrt(8 / 9), 1e-6) && near(m.vIsco, 0.5, 1e-9) && near(m.kappa, 0.25, 1e-12), `${m.eta} ${m.vIsco} ${m.kappa}`);
  ok('M and time in SI: rg = GM/c^2, tg = GM/c^3', near(m.rg, rg, 1e-12) && near(m.tg, tg, 1e-12));
  ok('the horizon of 10 Msun at a = 0 spans 2 GM/c^2 = 29.5 km', near(m.horizonKm, 2 * rg / 1000, 1e-12), `${m.horizonKm}`);
  ok('the tide over 2 m at the horizon is 2 GM L / r^3 with L = 2 m', near(m.tidalH, 2 * GM * 2 / (2 * rg) ** 3, 1e-9) && near(m.tidalHg, m.tidalH / SI.g0, 1e-12), `${m.tidalH}`);
  ok('the tide over 2 m reaches 10 g at r = (4 GM / 10 g)^(1/3)', near(m.tide10g, Math.cbrt(4 * GM / (10 * SI.g0)) / rg, 1e-6), `${m.tide10g}`);
  ok('the ISCO period at a = 0: 2 pi 6^1.5 GM/c^3', near(m.iscoPeriod, 2 * Math.PI * 6 ** 1.5 * tg, 1e-9), `${m.iscoPeriod}`);
  ok('from the horizon to r = 0 takes 4/3 GM/c^3 of proper time', near(m.interiorTauS, (4 / 3) * tg, 1e-5), `${m.interiorTauS / tg}`);
  ok('pi M and the e-folding time 1/kappa = 4 GM/c^3', near(m.piM, Math.PI * tg, 1e-12) && near(m.efold, 4 * tg, 1e-9), `${m.efold / tg}`);
  const noq = state({ obj: 'custom', a: 0, mass: 1 });
  delete noq.q;
  ok('a state with no charge is uncharged', P.derive(noq).rh === 2 && P.derive(noq).q === 0, `${P.derive(noq).rh}`);
  // the cache keys every input that changes the hole
  const c0 = P.derive(state({ obj: 'custom', a: 0.3, q: 0 })), c9 = P.derive(state({ obj: 'custom', a: 0.3, q: 0.9 }));
  ok('the cache keys the charge: a = 0.3 at Q = 0 and at Q = 0.9 are two holes', c0.rh === K.horizon(0.3, 0) && c9.rh === K.horizon(0.3, 0.9), `${c0.rh} ${c9.rh}`);
  const s0 = P.derive(state({ a: 0.94 })), s1 = P.derive(state({ a: 0.941 }));
  ok('the cache keys the spin to the slider\'s step: a = 0.940 and 0.941 are two holes', s0.ri === K.isco(0.94) && s1.ri === K.isco(0.941), `${s0.ri} ${s1.ri}`);
  ok('at a = 0.94 the prograde photon orbit is inside the retrograde one', s0.rph === K.photonOrbit(0.94, 1) && s0.rphr === K.photonOrbit(0.94, -1) && s0.rph < s0.rphr, `${s0.rph} ${s0.rphr}`);
  ok('the disk table of a charged hole starts at its charged ISCO', near(c9.tab.rIn, K.isco(0.3, 1, 0.9), 1e-9) && !near(c9.tab.rIn, K.isco(0.3), 1e-3), `${c9.tab.rIn}`);
  const r20 = P.derive(state({ rout: 20 })), r40 = P.derive(state({ rout: 40 }));
  ok('the cache keys the disk\'s outer edge', r20.tab.rOut === 20 && r40.tab.rOut === 40, `${r20.tab.rOut} ${r40.tab.rOut}`);
  // the disk's temperature: none at the Eddington floor of 1e-9, none for Primordial
  const T = (over) => P.derive(state(over)).Tpeak;
  ok('at the Eddington floor, 10^-9, the disk has no temperature', T({ edd: -9 }) === 0, `${T({ edd: -9 })}`);
  ok('just above the floor, 10^-8.95, it has one: diskPeakKelvin at the table\'s peak flux', T({ edd: -8.95 }) > 0 && near(T({ edd: -8.95 }), K.diskPeakKelvin(10 ** DEFAULTS.mass, 0.94, 10 ** -8.95, s0.peak.F, 0), 1e-12), `${T({ edd: -8.95 })}`);
  ok('Primordial has no disk whatever its Eddington ratio', T({ obj: 'primordial', edd: -2 }) === 0, `${T({ obj: 'primordial', edd: -2 })}`);
  // the angular scale: none for a hypothetical object
  ok('Primordial is hypothetical: no angular scale', P.derive(state({ obj: 'primordial' })).thetaG === null);
  ok('M87* at its mass and distance: theta_g = GM / (c^2 D)', near(P.derive(state({ obj: 'm87', mass: Math.log10(6.5e9), dist: Math.log10(16.8e6) })).thetaG, K.thetaG(6.5e9, 16.8e6), 1e-12));
  // the Hawking temperature carries the hole's own spin and charge
  const h = P.derive(state({ obj: 'custom', a: 0.3, q: 0.9, mass: 1 }));
  ok('the Hawking temperature at a = 0.3, Q = 0.9 is the Kerr-Newman value, below the non-spinning one', near(h.hawkingK, K.hawkingKelvin(10 * SI.Msun, 0.3, 0.9), 1e-12) && h.hawkingK < 0.95 * K.hawkingKelvin(10 * SI.Msun), `${h.hawkingK}`);
});

/* ---------- the analytic shadow: Kerr, charge without spin, or none ---------- */
guard('the analytic shadow', () => {
  const kerr = P.theoryShadow(0.5, 60);
  ok('Kerr: Bardeen\'s curve at the inclination asked (60 deg in radians), 360 points a side', same(kerr.curve, K.shadowCurve(0.5, Math.PI / 3, 360)));
  ok('its chords and mean diameter are the curve\'s', same(kerr.chords, K.shadowChords(kerr.curve)) && kerr.mean === K.shadowMeanDiameter(kerr.curve));
  const rn = P.theoryShadow(0, 60, 0.01);
  ok('charge without spin, Q = 0.01 just above 0: a circle of the critical impact parameter b_c(0.01), not sqrt(27)', rn && rn.curve.length === 720 && rn.curve.every(([x, y]) => near(Math.hypot(x, y), K.rnCriticalB(0.01), 1e-12)) && !near(K.rnCriticalB(0.01), Math.sqrt(27), 1e-6), rn && `${rn.curve.length}`);
  ok('the circle goes once round: its mean diameter is 2 b_c', near(rn.mean, 2 * K.rnCriticalB(0.01), 1e-4), `${rn.mean}`);
  const small = P.theoryShadow(0.00009, 61, 0.5);
  ok('Q = 0.5 at a = 0.00009, just below 1e-4: the circle', !!small && near(small.mean, 2 * K.rnCriticalB(0.5), 1e-4), small && `${small.mean}`);
  ok('Q = 0.5 at a = 1e-4: no closed form (null)', P.theoryShadow(0.0001, 62, 0.5) === null);
  ok('Q = 0.01 at a = 0.5: no closed form (null)', P.theoryShadow(0.5, 60, 0.01) === null);
  ok('the cache keys the charge: a = 0 at Q = 0 and at Q = 0.6 are two shadows', near(P.theoryShadow(0, 63, 0).mean, 2 * Math.sqrt(27), 1e-4) && near(P.theoryShadow(0, 63, 0.6).mean, 2 * K.rnCriticalB(0.6), 1e-4));
  ok('the cache keys the inclination', P.theoryShadow(0.9, 17).chords.amin !== P.theoryShadow(0.9, 90).chords.amin);
});

/* ---------- the shadow for display, and the integrator's ---------- */
guard('the shadow for display', () => {
  ok('Kerr: the analytic shadow itself', P.shadowFor(0.5, 60) === P.theoryShadow(0.5, 60));
  const kn = P.shadowFor(0.3, 17, 0.9), m = P.integratorShadow(0.3, 17, 0.9);
  ok('Kerr-Newman with spin: the integrator\'s chords, marked traced, with no curve', kn.traced === true && kn.curve === null && kn.chords.width === m.width && kn.chords.height === m.height, JSON.stringify(kn.chords));
  ok('its mean diameter is the mean of its width and height', kn.mean === 0.5 * (m.width + m.height), `${kn.mean}`);
  const ki = P.integratorShadow(0.5, 60, 0), kt = P.theoryShadow(0.5, 60).chords;
  ok('the integrator at a = 0.5, 60 deg: Bardeen\'s width within 0.2 %, left edge within 0.02 M', Math.abs(ki.width / kt.width - 1) < 2e-3 && Math.abs(ki.amin - kt.amin) < 0.02, `${ki.width} vs ${kt.width}, ${ki.amin} vs ${kt.amin}`);
  const i0 = P.integratorShadow(0, 60, 0), i6 = P.integratorShadow(0, 60, 0.6);
  ok('the integrator at a = 0: 2 sqrt(27) wide', Math.abs(i0.width / (2 * Math.sqrt(27)) - 1) < 2e-3, `${i0.width}`);
  ok('the integrator carries the charge: Q = 0.6 at a = 0 is 2 b_c(0.6) wide', Math.abs(i6.width / (2 * K.rnCriticalB(0.6)) - 1) < 2e-3, `${i6.width}`);
});

/* ---------- the predicted angle and the measurement ---------- */
guard('the predicted angle', () => {
  const m87 = OBJECTS[0], tg = K.thetaG(m87.mass, m87.distPc);
  const p = P.predictedUas(10, m87);
  ok('M87*: 10 M is 10 theta_g', p.value === 10 * tg && p.thetaG === tg);
  ok('its error: the mass and distance errors in quadrature', near(p.err, 10 * tg * Math.hypot(0.7 / 6.5, 0.8 / 16.8), 1e-12), `${p.err}`);
  ok('no distance (Primordial): no angle', P.predictedUas(10, OBJECTS[3]) === null);
  ok('no object: no angle', P.predictedUas(10, null) === null);
  const bare = P.predictedUas(10, { mass: 6.5e9, distPc: 16.8e6 });
  ok('an object with no errors given has none', bare.err === 0 && bare.value === 10 * tg, `${bare.err}`);
  const onlyM = P.predictedUas(10, { mass: 6.5e9, massErr: 0.7e9, distPc: 16.8e6 });
  ok('a mass error alone', near(onlyM.err, 10 * tg * 0.7 / 6.5, 1e-12), `${onlyM.err}`);
  const onlyD = P.predictedUas(10, { mass: 6.5e9, distPc: 16.8e6, distErr: 0.8e6 });
  ok('a distance error alone', near(onlyD.err, 10 * tg * 0.8 / 16.8, 1e-12), `${onlyD.err}`);
  ok('sigmaDiff: (40 - 42) / hypot(3, 4) = -0.4', P.sigmaDiff({ value: 40, err: 3 }, 42, 4) === -0.4, `${P.sigmaDiff({ value: 40, err: 3 }, 42, 4)}`);
});

guard('the measurement', () => {
  const tel = P.measurement(state({ view: 'telescope', incl: 40 }));
  ok('in the telescope view: at the state\'s own inclination', tel.incl === 40 && tel.th === P.shadowFor(0.94, 40, 0), `${tel.incl}`);
  const cin = P.measurement(state({ view: 'cinematic', incl: 84 }));
  ok('elsewhere: at the object\'s measured inclination, M87*\'s 17 deg', cin.incl === 17 && cin.th === P.shadowFor(0.94, 17, 0), `${cin.incl}`);
  const cus = P.measurement(state({ obj: 'custom', view: 'cinematic', a: 0.5 }));
  ok('a custom hole elsewhere: at 17 deg, with no prediction', cus.incl === 17 && cus.pred === null && cus.obj === null, `${cus.incl}`);
  const sg = P.measurement(state({ obj: 'sgra', a: 0.5, view: 'cinematic' }));
  ok('Sgr A* elsewhere: at its 30 deg, predicted from its mass and distance', sg.incl === 30 && near(sg.pred.value, P.predictedUas(sg.th.mean, OBJECTS[1]).value, 1e-12), `${sg.incl}`);
  const noq = state({ obj: 'custom', a: 0.5, view: 'telescope', incl: 40 });
  delete noq.q;
  ok('a state with no charge is measured uncharged', P.measurement(noq).th === P.shadowFor(0.5, 40, 0));
});

/* ---------- the fall ---------- */
guard('the fall table', () => {
  const f = P.fall(0.9, 60);
  ok('the engine\'s table at the camera\'s polar angle (60 deg in radians), from rest at 40 M, 500 steps', same(f, K.fallTable(0.9, Math.PI / 3, 40, 0, 500)) && f.length === 501 && near(f[0].r, 40, 1e-12), `${f.length} ${f[0].r}`);
  const f30 = P.fall(0.9, 60, 30);
  ok('a start radius given is used, and keyed in the cache', near(f30[0].r, 30, 1e-12), `${f30[0].r}`);
  const fq = P.fall(0.9, 60, 40, 0.3);
  ok('the charge is carried, and keyed: the fall ends just outside the charged horizon', near(fq[fq.length - 1].r, K.horizon(0.9, 0.3) * 1.0005, 1e-9), `${fq[fq.length - 1].r}`);
});

/* ---------- the formats ---------- */
guard('s3: 3 significant figures, trailing zeros kept', () => {
  for (const [v, want] of [[null, '--'], [undefined, '--'], [NaN, '--'], [Infinity, '--'], [0, '0.00'], [1, '1.00'], [-5, '-5.00'], [1.344, '1.34'], [123.4, '123'],
    [0.01, '0.0100'], [0.00999, '9.99×10⁻³'], [100000, '1.00×10⁵']]) ok(`s3(${v}) = ${want}`, P.s3(v) === want, P.s3(v));
  // from 1e3 to 1e5 s3 writes the whole number: plain digits, within the rounding of 3 figures (see the report on s3)
  for (const v of [1234, 99999]) ok(`s3(${v}) is plain digits within 0.5 %`, /^\d+$/.test(P.s3(v)) && Math.abs(Number(P.s3(v)) / v - 1) < 5e-3, P.s3(v));
});
guard('sig: 3 significant figures', () => {
  for (const [v, want] of [[null, '--'], [NaN, '--'], [0, '0'], [1234, '1230'], [123456, '123000'], [1234567, '1.23e6'], [-1234567, '-1.23e6'], [0.001234, '0.00123'], [0.0001234, '1.23e-4']]) {
    ok(`sig(${v}) = ${want}`, P.sig(v) === want, P.sig(v));
  }
  ok('sig(1234, 2) = 1200', P.sig(1234, 2) === '1200', P.sig(1234, 2));
});
guard('sci: 3 significant figures, powers of ten in superscript', () => {
  for (const [v, want] of [[null, '--'], [NaN, '--'], [0, '0'], [12345, '12,300'], [123456, '1.23×10⁵'], [-123456, '-1.23×10⁵'], [0.05, '0.05'], [0.00999, '9.99×10⁻³'], [1.5e-12, '1.50×10⁻¹²']]) {
    ok(`sci(${v}) = ${want}`, P.sci(v) === want, P.sci(v));
  }
  ok('sci(123456, 2) = 1.2×10⁵', P.sci(123456, 2) === '1.2×10⁵', P.sci(123456, 2));
});
guard('dur: seconds in a readable unit', () => {
  for (const [v, want] of [[Infinity, '--'], [NaN, '--'], [3.156e7, '1 yr'], [3.155e7, '365 d'], [60, '1 min'], [59.9, '59.9 s'], [-120, '-2 min'], [1e-3, '1 ms'], [9.99e-4, '999 µs'], [0, '0 s'], [1e-25, '1.00×10⁻²⁵ s']]) {
    ok(`dur(${v}) = ${want}`, P.dur(v) === want, P.dur(v));
  }
});
guard('len: metres in a readable unit', () => {
  for (const [v, want] of [[Infinity, '--'], [999, '0.999 km'], [998.9, '999 m'], [1000, '1 km'], [-2000, '-2 km'], [0.000999, '0.999 mm'], [3.0857e16, '1 pc'], [1e-16, '1.00×10⁻¹⁶ m']]) {
    ok(`len(${v}) = ${want}`, P.len(v) === want, P.len(v));
  }
});

console.log(fails ? `\n${fails} of ${checks} physics check(s) failed` : `\nall ${checks} physics checks passed`);
process.exit(fails ? 1 : 0);
