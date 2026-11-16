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
});

/* ---------- the comparison with the EHT (ledger row 2, ruled 2026-11-16) ---------- */
guard('the comparison', () => {
  const [m87, sgr, cyg] = OBJECTS;
  // M87*: scaled by the stars' motions, theta_dyn 3.62 (+0.60, -0.34) uas (EHT 2019 Paper VI, Table 9)
  const z = P.compareShadow(2 * Math.sqrt(27), m87);
  ok('M87* at a = 0: 2 sqrt(27) theta_dyn is Paper I\'s published 37.6 (+6.2, -3.5) uas (section 2)',
    z.pred.value.toFixed(1) === '37.6' && z.pred.errP.toFixed(1) === '6.2' && z.pred.errM.toFixed(1) === '3.5',
    `${z.pred.value} +${z.pred.errP} -${z.pred.errM}`);
  ok('M87*: the scale is the stars\', never the EHT\'s own mass', z.pred.thetaG === 3.62 && z.pred.by === 'the motions of its stars' && !near(z.pred.thetaG, K.thetaG(m87.mass, m87.distPc), 1e-3));
  ok('M87*: no shadow to set it against, and the ring beside it', z.shadow === null && z.ring.value === 42 && z.ring.err === 3);
  const zs = P.compareSentence(z, 'M87*');
  ok('M87*: the sentence names the ring of emission and sets no sigma', zs.includes('ring of emission 42 +- 3 uas') && zs.includes('no shadow diameter for M87*') && !/sigma/.test(zs), zs);
  // Sgr A*: scaled by its mass and distance (stellar orbits), set against the EHT shadow 48.7 +- 7.0 in sigma
  const s = P.compareShadow(10, sgr), tg = K.thetaG(sgr.mass, sgr.distPc), e = 10 * tg * Math.hypot(sgr.massErr / sgr.mass, sgr.distErr / sgr.distPc);
  ok('Sgr A*: scaled by its mass and distance, errors in quadrature', near(s.pred.value, 10 * tg, 1e-12) && near(s.pred.errP, e, 1e-12) && near(s.pred.errM, e, 1e-12) && s.pred.by === 'the orbits of its stars');
  ok('Sgr A*: one sigma, against the shadow', near(s.shadow.sigma, (10 * tg - 48.7) / Math.hypot(e, 7.0), 1e-12) && s.shadow.value === 48.7 && s.ring.value === 51.8, `${s.shadow.sigma}`);
  ok('Sgr A*: the sentence prints 7.0 as the paper does', P.compareSentence(s).includes('48.7 +- 7.0 uas') && /sigma from this one/.test(P.compareSentence(s)), P.compareSentence(s));
  // the error on the side of the measurement, just above, at and below it
  const fake = { distPc: 1, ruler: { thetaG: 1, errP: 2, errM: 1, by: 'x' }, eht: { shadow: 10, shadowErr: 0 } };
  // the errors scale with the diameter: at 12 M the lower error is 12, at 8 M the upper error is 16
  ok('a prediction above the shadow takes its lower error', P.compareShadow(12, fake).shadow.sigma === 2 / 12, `${P.compareShadow(12, fake).shadow.sigma}`);
  ok('a prediction below the shadow takes its upper error', P.compareShadow(8, fake).shadow.sigma === -2 / 16, `${P.compareShadow(8, fake).shadow.sigma}`);
  ok('a prediction on the shadow is 0 sigma', P.compareShadow(10, fake).shadow.sigma === 0);
  ok('a ruler with no EHT entry gives no shadow and no ring', (() => { const c = P.compareShadow(10, { distPc: 1, ruler: fake.ruler }); return c.shadow === null && c.ring === null; })());
  ok('an EHT entry with a ring and no shadow gives no sigma', P.compareShadow(10, { distPc: 1, ruler: fake.ruler, eht: { ring: 5, ringErr: 1 } }).shadow === null);
  // Cygnus X-1, Primordial, a custom hole
  const c = P.compareShadow(10, cyg);
  ok('Cygnus X-1: scaled by its companion\'s orbit, no EHT image', c.pred.by === 'the orbit of its companion star' && c.shadow === null && c.ring === null && P.compareSentence(c) === 'The EHT has not imaged it.');
  ok('no distance or no object: no comparison', P.compareShadow(10, OBJECTS[3]) === null && P.compareShadow(10, null) === null && P.compareSentence(null) === 'The EHT has not imaged it.');
  ok('published(): the value\'s own decimals for both', P.published(48.7, 7) === '48.7 +- 7.0' && P.published(42, 3, '±') === '42 ± 3' && P.published(5.125, 0.02) === '5.125 +- 0.020', `${P.published(48.7, 7)}`);
  ok('a sign in front of a positive sigma, none added to a negative one', P.compareSentence({ shadow: { value: 1, err: 1, sigma: 0.5 } }).includes('+0.500 sigma') && P.compareSentence({ shadow: { value: 1, err: 1, sigma: -0.5 } }).includes(': -0.500 sigma'));
  ok('a sigma of exactly 0 is written +0.00', P.compareSentence({ shadow: { value: 1, err: 1, sigma: 0 } }).includes('+0.00 sigma'), P.compareSentence({ shadow: { value: 1, err: 1, sigma: 0 } }));
});

guard('the measurement', () => {
  const tel = P.measurement(state({ view: 'telescope', incl: 40 }));
  ok('in the telescope view: at the state\'s own inclination', tel.incl === 40 && tel.th === P.shadowFor(0.94, 40, 0), `${tel.incl}`);
  const cin = P.measurement(state({ view: 'cinematic', incl: 84 }));
  ok('elsewhere: at the object\'s measured inclination, M87*\'s 17 deg', cin.incl === 17 && cin.th === P.shadowFor(0.94, 17, 0), `${cin.incl}`);
  const cus = P.measurement(state({ obj: 'custom', view: 'cinematic', a: 0.5 }));
  ok('a custom hole elsewhere: at 17 deg, with no comparison', cus.incl === 17 && cus.cmp === null && cus.obj === null, `${cus.incl}`);
  const sg = P.measurement(state({ obj: 'sgra', a: 0.5, view: 'cinematic' }));
  ok('Sgr A* elsewhere: at its 30 deg, compared at its traced mean diameter', sg.incl === 30 && near(sg.cmp.pred.value, P.compareShadow(sg.th.mean, OBJECTS[1]).pred.value, 1e-12) && near(sg.cmp.pred.value, P.predictedUas(sg.th.mean, OBJECTS[1]).value, 1e-12), `${sg.incl}`);
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

/* ============================================================
   Added 2026-11-16 after review_s2.md, each block a finding's
   reproduction: the numbers a sentence quotes come from the
   function the readout beside it uses (C1), one format per
   quantity (C3), a tag no stronger than its inputs (C10), and
   one check per row of the unit tables (P6-1).
   ============================================================ */

/* ---------- P1-4: one sigma, one way of writing it ---------- */
guard('sigmaText', () => {
  ok('a positive sigma with its sign and the symbol asked: +0.553 σ', P.sigmaText(0.5532, 'σ') === '+0.553 σ', P.sigmaText(0.5532, 'σ'));
  ok('the word by default: -1.00 sigma', P.sigmaText(-1, undefined) === '-1.00 sigma', P.sigmaText(-1));
  ok('none at all is +0.00 sigma', P.sigmaText(0) === '+0.00 sigma', P.sigmaText(0));
  ok('just below none, -0.001: no plus', P.sigmaText(-0.001) === '-1.00×10⁻³ sigma', P.sigmaText(-0.001));
  const s = P.compareShadow(10, OBJECTS[1]);
  ok('the sentence writes the sigma by sigmaText', P.compareSentence(s).includes(`: ${P.sigmaText(s.shadow.sigma)} from this one.`), P.compareSentence(s));
});

/* ---------- P1-2: a number for a machine keeps its significant figures ---------- */
guard('sigNum', () => {
  ok('9.13651e-4 to 4 figures is 0.0009137, not 0', P.sigNum(9.13651e-4) === 0.0009137, `${P.sigNum(9.13651e-4)}`);
  ok('35.4183 to 4 figures is 35.42', P.sigNum(35.4183) === 35.42);
  ok('0.55321 to 3 figures is 0.553', P.sigNum(0.55321, 3) === 0.553);
  ok('none stays none', P.sigNum(null) === null && P.sigNum(NaN) === null && P.sigNum(undefined) === null);
  ok('zero is 0', P.sigNum(0) === 0);
});

/* ---------- C3: one format per quantity kind ---------- */
guard('the quantity formats', () => {
  ok('an inclination: one decimal at most, none when whole: 17, 27.5, 84', P.deg(17) === '17' && P.deg(27.51) === '27.5' && P.deg(84.0) === '84' && P.deg(1.04) === '1', [P.deg(17), P.deg(27.51), P.deg(84), P.deg(1.04)].join(' '));
  ok('a spin: three decimals, 0.940 and 0.998', P.spinText(0.94) === '0.940' && P.spinText(0.998) === '0.998' && P.spinText(0) === '0.000');
  for (const [pc, want] of [[1e6, '1.00 Mpc'], [999000, '999 kpc'], [1e3, '1.00 kpc'], [999, '999 pc'], [16.8e6, '16.8 Mpc'], [8277, '8.28 kpc']]) ok(`a distance of ${pc} pc reads ${want}`, P.parsecs(pc) === want, P.parsecs(pc));
  for (const [ev, want] of [[1000, '1.00 keV'], [999, '999 eV'], [2345.6, '2.35 keV'], [1.234, '1.23 eV']]) ok(`a photon of ${ev} eV reads ${want}`, P.photonEnergy(ev) === want, P.photonEnergy(ev));
});

/* ---------- P2-4: the shadow against the horizon, from one function ---------- */
guard('shadowToHorizon', () => {
  const r = P.shadowToHorizon(0.94, 0);
  ok('at M87*\'s a = 0.94: the 90 deg mean diameter over 2 r+, 3.73', near(r, P.shadowFor(0.94, 90, 0).mean / (2 * K.horizon(0.94, 0)), 1e-12) && P.s3(r) === '3.73', `${r}`);
  ok('at a = 0: sqrt(27) / 2 = 2.60', near(P.shadowToHorizon(0), Math.sqrt(27) / 2, 1e-4), `${P.shadowToHorizon(0)}`);
  ok('a charged hole carries its charge: a = 0, Q = 0.6, b_c(0.6) / r+(0.6)', near(P.shadowToHorizon(0, 0.6), K.rnCriticalB(0.6) / K.horizon(0, 0.6), 1e-4), `${P.shadowToHorizon(0, 0.6)}`);
});

/* ---------- P2-2: the sub-ring factor is the engine's at the spin on screen ---------- */
guard('ringGamma', () => {
  for (const [a, want] of [[0, '23.1'], [0.5, '20.5'], [0.94, '13.0'], [0.998, '11.4']]) {
    const g = P.ringGamma(a);
    ok(`a = ${a}: e^gamma = ${want}, the Lyapunov exponent of the polar photon orbit`, g === K.lyapunov(a, K.polarPhotonOrbit(a)) && P.s3(Math.exp(g)) === want, `${g}`);
  }
  ok('a charged hole, Q = 0.005: no closed form, null', P.ringGamma(0.5, 0.005) === null);
  ok('Q = 0 has one', P.ringGamma(0.5, 0) !== null);
});

/* ---------- P2-6: the mass at which a hole is as warm as the background is computed ---------- */
guard('cmbCrossover', () => {
  const c = P.cmbCrossover();
  const kg = SI.hbar * SI.c ** 3 / (8 * Math.PI * SI.G * SI.kB * 2.725);
  ok('hbar c^3 / (8 pi G k_B 2.725 K) = 4.50e22 kg', near(c.kg, kg, 1e-12) && P.sci(c.kg) === '4.50×10²²', `${c.kg}`);
  ok('a non-spinning hole of that mass is at 2.725 K', near(K.hawkingKelvin(c.kg), 2.725, 1e-12), `${K.hawkingKelvin(c.kg)}`);
  ok('in Moon masses (7.346e22 kg, NASA): 0.613, not 0.75% of one', SI.Mmoon === 7.346e22 && near(c.moons, kg / 7.346e22, 1e-12) && P.s3(c.moons) === '0.613', `${c.moons}`);
  ok('the background temperature is the SI table\'s 2.725 K', c.T === 2.725 && SI.Tcmb === 2.725);
});

/* ---------- P2-3: an angle and its diameter are one chord ---------- */
guard('the chord on the sky', () => {
  for (const o of OBJECTS.slice(0, 3)) {
    const th = P.shadowFor(o.spin, o.incl, 0), c = P.compareShadow(th.mean, o);
    ok(`${o.name}: the angle is the diameter it carries times the scale`, c.pred.diamM === th.mean && near(c.pred.value, c.pred.diamM * c.pred.thetaG, 1e-12), `${c.pred.diamM} x ${c.pred.thetaG} vs ${c.pred.value}`);
  }
});

/* ---------- P2-10 and P6-2: the ruling's words, exactly ---------- */
guard('the ruling\'s words', () => {
  const [m87, sgr] = OBJECTS;
  const m = P.compareSentence(P.compareShadow(P.shadowFor(0.94, 17).mean, m87), 'M87*');
  ok('M87*: the ring sentence, word for word', m === 'The EHT measured a ring of emission 42 +- 3 uas across. On its own scale, theta_g 3.8 uas, its models place the ring about 10% outside the photon ring. It published no shadow diameter for M87*.', m);
  const sg = P.compareShadow(P.shadowFor(0.5, 30).mean, sgr);
  ok('Sgr A*: the shadow sentence, word for word', P.compareSentence(sg) === `The EHT inferred a shadow of 48.7 +- 7.0 uas: ${P.sigmaText(sg.shadow.sigma)} from this one.` && P.sigmaText(sg.shadow.sigma) === '+0.553 sigma', P.compareSentence(sg));
  ok('a ring with no published offset or scale gives the ring and no claim about it',
    P.compareSentence({ ring: { value: 5, err: 1 } }, 'X') === 'The EHT measured a ring of emission 5 +- 1 uas across. It published no shadow diameter for X.',
    P.compareSentence({ ring: { value: 5, err: 1 } }, 'X'));
  ok('an offset with no scale gives no claim either', !/models/.test(P.compareSentence({ ring: { value: 5, err: 1, offsetPct: 10 } }, 'X')));
  ok('a scale with no offset gives no claim either', !/models/.test(P.compareSentence({ ring: { value: 5, err: 1, scale: 3.8 } }, 'X')));
  ok('the ruling, one string: a sigma only between two shadows', P.RULING === 'A sigma is set only between two shadows; a ring of emission is a different quantity.', P.RULING);
});

/* ---------- C10: a value is as strong as its weakest input ---------- */
guard('the tags', () => {
  ok('all REAL is REAL', P.weakest('REAL', 'REAL') === 'REAL' && P.weakest('REAL') === 'REAL');
  ok('one ILLUSTRATIVE input makes it ILLUSTRATIVE', P.weakest('REAL', 'ILLUSTRATIVE', 'REAL') === 'ILLUSTRATIVE');
  ok('a missing tag is not REAL', P.weakest('REAL', undefined) === 'ILLUSTRATIVE');
  const [m87, , cyg, prim] = OBJECTS;
  const t = P.inputTags(m87);
  ok('M87*: a sourced mass and distance, an illustrative spin and accretion rate', t.mass === 'REAL' && t.dist === 'REAL' && t.spin === 'ILLUSTRATIVE' && t.edd === 'ILLUSTRATIVE', JSON.stringify(t));
  ok('Cygnus X-1: its spin is measured', P.inputTags(cyg).spin === 'REAL');
  ok('Primordial is hypothetical: nothing measured', Object.values(P.inputTags(prim)).every((v) => v === 'ILLUSTRATIVE'), JSON.stringify(P.inputTags(prim)));
  ok('a custom hole: nothing measured', Object.values(P.inputTags(null)).every((v) => v === 'ILLUSTRATIVE'));
  ok('the disk\'s peak temperature at Cygnus X-1: ILLUSTRATIVE, as its Eddington ratio is', P.weakest(P.inputTags(cyg).mass, P.inputTags(cyg).spin, P.inputTags(cyg).edd) === 'ILLUSTRATIVE');
});

/* ---------- the reference numbers the guide sets beside the readouts ---------- */
guard('fusionPercent and ergosurface', () => {
  ok('four 1H atoms to one 4He atom release 0.712% of their mass (AME2020 masses)', near(P.fusionPercent(), 100 * (1 - 4.00260325413 / (4 * 1.00782503223)), 1e-12) && P.s3(P.fusionPercent()) === '0.712', `${P.fusionPercent()}`);
  ok('the ergosurface at the equator is 2 M for any spin, uncharged', P.ergosurface(0.94, 0, 90) === 2 && P.ergosurface(0, 0, 90) === 2);
  ok('a charge pulls it in: 1 + sqrt(1 - Q^2), 1.8 M at Q = 0.6', near(P.ergosurface(0, 0.6, 90), 1.8, 1e-12), `${P.ergosurface(0, 0.6, 90)}`);
  ok('at the pole it meets the horizon', near(P.ergosurface(0.94, 0, 0), K.horizon(0.94), 1e-12) && near(P.ergosurface(0.5, 0.6, 0), K.horizon(0.5, 0.6), 1e-12));
  ok('at 60 deg: 1 + sqrt(1 - a^2 / 4)', near(P.ergosurface(0.9, 0, 60), 1 + Math.sqrt(1 - 0.81 / 4), 1e-12));
  ok('the slider\'s limit a = 0.998 at the pole: 1 + sqrt(0.004), not held at a floor', near(P.ergosurface(0.998, 0, 0), 1 + Math.sqrt(1 - 0.998 * 0.998), 1e-12));
});

/* ---------- the comparison carries its chord, its scale's errors and its ring's basis ---------- */
guard('what the comparison carries', () => {
  const [m87, sgr] = OBJECTS;
  const z = P.compareShadow(10, m87), s = P.compareShadow(10, sgr);
  ok('M87*: the scale\'s own errors, +0.60 and -0.34', z.pred.thetaErrP === 0.6 && z.pred.thetaErrM === 0.34);
  ok('Sgr A*: the scale\'s error from its mass and distance, both sides', near(s.pred.thetaErrP, P.predictedUas(1, sgr).err, 1e-12) && s.pred.thetaErrM === s.pred.thetaErrP);
  ok('M87*: the ring carries its paper\'s 10% and the EHT\'s own scale, 3.8 uas', z.ring.offsetPct === 10 && z.ring.scale === 3.8);
  const bare = P.compareShadow(10, { distPc: 1, ruler: { thetaG: 1, errP: 0, errM: 0, by: 'x' }, eht: { ring: 5, ringErr: 1 } });
  ok('a ring with no offset and an object with no scale of its own carry neither', bare.ring.offsetPct === undefined && bare.ring.scale === undefined);
});

/* ---------- the body and the tide every sentence names ---------- */
guard('the tide\'s body', () => {
  ok('a 2 m body and a 10 g tide', P.BODY_M === 2 && P.TIDE_G === 10);
});

/* ---------- P6-1: every row of the unit tables, just at and just below its size ---------- */
guard('dur, row by row', () => {
  for (const [name, f] of [['yr', 3.156e7], ['d', 86400], ['h', 3600], ['min', 60], ['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9], ['ps', 1e-12], ['fs', 1e-15], ['as', 1e-18], ['zs', 1e-21], ['ys', 1e-24]]) {
    ok(`dur(${f}) = 1 ${name}`, P.dur(f) === `1 ${name}`, P.dur(f));
    ok(`dur(${f} x 0.998) is not in ${name}`, !P.dur(f * 0.998).endsWith(` ${name}`), P.dur(f * 0.998));
  }
});
guard('len, row by row', () => {
  for (const [name, f] of [['pc', 3.0857e16], ['AU', 1.496e11], ['km', 1e3], ['m', 1], ['mm', 1e-3], ['µm', 1e-6], ['nm', 1e-9], ['fm', 1e-15]]) {
    ok(`len(${f}) = 1 ${name}`, P.len(f) === `1 ${name}`, P.len(f));
    ok(`len(${f} x 0.998) is not in ${name}`, !P.len(f * 0.998).endsWith(` ${name}`), P.len(f * 0.998));
  }
});

console.log(fails ? `\n${fails} of ${checks} physics check(s) failed` : `\nall ${checks} physics checks passed`);
process.exit(fails ? 1 : 0);
