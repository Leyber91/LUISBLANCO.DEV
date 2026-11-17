/* ============================================================
   The test of the physics tests, part 1 of 3. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/physics.mutants.test.mjs

   Each entry breaks one rule of physics.js's model: the cache
   (its size at 64 and 66 keys, and each input it keys), the
   field of view on a portrait screen, derive() (each radius,
   unit and time, the disk's temperature floor at 1e-9 and for
   Primordial, the tide, the Hawking temperature with spin and
   charge), the shadow's three cases (Kerr, charge without spin
   below a = 1e-4, none for Kerr-Newman with spin), the
   integrator's, the predicted angle and its error, the
   measurement and the fall. The broken file is written to a copy
   of this lab in the system's temp folder and physics.test.mjs is
   run on the copy (kit/tests/mutants.mjs). Every broken rule must
   fail a check there. Part 2 (physics.mutants2.test.mjs) breaks
   the number formats.

   Add an entry here with every new rule in physics.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/physics.js labs/assets/js/blackhole/tests/physics.mutants.test.mjs labs/assets/js/blackhole/tests/physics.mutants2.test.mjs
   which names every condition and export no entry changes.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASEKEY = 'b:${a}:${q}:${s.rout}';
const SHAPEKEY = 's:${a}:${q}:${inclDeg.toFixed(2)}';
const FALLKEY = 'f:${a}:${q}:${inclDeg.toFixed(1)}:${r0}';
const TPEAK = `const Tpeak = edd > 1e-9 && obj?.id !== 'primordial' ? K.diskPeakKelvin(massSun, a, edd, base.peak.F, q) : 0;`;
const REL = `Math.hypot((obj.massErr || 0) / obj.mass, (obj.distErr || 0) / obj.distPc)`;
const INCL = `const incl = s.view === 'telescope' ? s.incl : (obj ? obj.incl : 17);`;

const MUTANTS = [
  /* ---- the cache ---- */
  ['nothing is cached', `  if (cache.has(key)) return cache.get(key);\n`, ``],
  ['the cache starts over at 65 keys', `if (cache.size > 64)`, `if (cache.size > 63)`],
  ['the cache starts over only at 67 keys', `if (cache.size > 64)`, `if (cache.size > 65)`],
  ['the cache never starts over', `  if (cache.size > 64) cache.clear();\n`, ``],

  /* ---- the field of view ---- */
  ['a screen up to 1.1 wide per tall read as portrait', `return aspect >= 1 ?`, `return aspect >= 1.1 ?`],
  ['a screen down to 0.9 wide per tall read as landscape', `return aspect >= 1 ?`, `return aspect >= 0.9 ?`],
  ['a portrait screen narrows the view instead of widening it', `t : t / aspect;`, `t : t * aspect;`],
  ['the setting read as the half angle', `Math.tan(fovDeg * Math.PI / 360)`, `Math.tan(fovDeg * Math.PI / 180)`],

  /* ---- objectOf ---- */
  ['objectOf finds another object', `OBJECTS.find((o) => o.id === s.obj) || null`, `OBJECTS.find((o) => o.id !== s.obj) || null`],
  ['objectOf a custom hole is undefined', `OBJECTS.find((o) => o.id === s.obj) || null`, `OBJECTS.find((o) => o.id === s.obj) || undefined`],

  /* ---- derive ---- */
  ['a state with no charge read at Q = 0.1', `const a = s.a, q = s.q || 0;`, `const a = s.a, q = s.q || 0.1;`],
  ['the cache does not key the charge', BASEKEY, 'b:${a}:${s.rout}'],
  ['the cache keys the spin to 2 decimals', BASEKEY, 'b:${a.toFixed(2)}:${q}:${s.rout}'],
  ['the cache does not key the disk\'s outer edge', BASEKEY, 'b:${a}:${q}'],
  ['the disk table drops the charge', `K.ntFluxTable(a, s.rout, 512, q)`, `K.ntFluxTable(a, s.rout, 512, 0)`],
  ['the retrograde photon orbit taken prograde', `rphr: K.photonOrbit(a, -1, q)`, `rphr: K.photonOrbit(a, 1, q)`],
  ['the ISCO taken retrograde', `ri: K.isco(a, 1, q),`, `ri: K.isco(a, -1, q),`],
  ['the gas speed taken at the photon orbit', `vIsco: K.diskSpeed(a, K.isco(a, 1, q), q)`, `vIsco: K.diskSpeed(a, K.photonOrbit(a, 1, q), q)`],
  ['the inner horizon is the outer', `rmin: K.innerHorizon(a, q),`, `rmin: K.horizon(a, q),`],
  ['the interior time ends at the centre by the old rule, r- < 5e-7 (ledger row 6)', `endsAtCentre: a === 0 && q === 0,`, `endsAtCentre: base.rmin < 5e-7,`],
  ['a charge without spin ends at the centre', `endsAtCentre: a === 0 && q === 0,`, `endsAtCentre: a === 0,`],
  ['f_col fits from just below 1% of Eddington', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd > FCOL_MIN_EDD * 0.98 && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`],
  ['f_col fits only above 1% of Eddington', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd > FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`],
  ['the boundary at 10%', `export const FCOL_MIN_EDD = 0.01;`, `export const FCOL_MIN_EDD = 0.1;`],
  ['f_col fits a spinning hole', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`],
  ['f_col fits a charged hole', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && a === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`],
  ['f_col fits a hole below 1.4 Msun', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun <= FCOL_MASS[1];`],
  ['f_col fits a hole above 10 Msun', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0];`],
  ['f_col fits just past 10 Msun', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1] * 1.01;`],
  ['f_col does not fit at 1.4 Msun', `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun >= FCOL_MASS[0] && massSun <= FCOL_MASS[1];`, `  return edd >= FCOL_MIN_EDD && a === 0 && q === 0 && massSun > FCOL_MASS[0] && massSun <= FCOL_MASS[1];`],
  ['a spin without charge ends at the centre', `endsAtCentre: a === 0 && q === 0,`, `endsAtCentre: q === 0,`],
  ['the mass is its log10', `const massSun = Math.pow(10, s.mass);`, `const massSun = s.mass;`],
  ['the distance is its log10', `const distPc = Math.pow(10, s.dist);`, `const distPc = s.dist;`],
  ['the Eddington ratio is its log10', `const edd = Math.pow(10, s.edd);`, `const edd = s.edd;`],
  ['M in metres is one solar mass\'s', `const rg = K.SI.rgSun * massSun,`, `const rg = K.SI.rgSun,`],
  ['the disk is warm at the Eddington floor of 1e-9', TPEAK, TPEAK.replace(`edd > 1e-9`, `edd >= 1e-9`)],
  ['the disk is cold just above the floor', TPEAK, TPEAK.replace(`edd > 1e-9`, `edd > 2e-9`)],
  ['Primordial has a disk', TPEAK, TPEAK.replace(`'primordial'`, `'primordialX'`)],
  ['the disk\'s temperature at the Eddington ratio 1', TPEAK, TPEAK.replace(`(massSun, a, edd,`, `(massSun, a, 1,`)],
  ['the tide falls as 1/r^2', `2 / (base.rh ** 3)`, `2 / (base.rh ** 2)`],
  ['the tide over 1 m, not the body of 2 m', `/ (rg * rg) * BODY_M;`, `/ (rg * rg) * 1;`],
  ['the body every sentence names is 1 m', `export const BODY_M = 2;`, `export const BODY_M = 1;`],
  ['the lethal tide every sentence names is 1 g', `export const TIDE_G = 10;`, `export const TIDE_G = 1;`],
  ['the tide in g left in m/s^2', `tidalHg: tidalH / K.SI.g0,`, `tidalHg: tidalH,`],
  ['the tide radius at 1 g, not the lethal tide', `BODY_M, TIDE_G * K.SI.g0)`, `BODY_M, K.SI.g0)`],
  ['the tide radius for a 1 m body', `K.tideRadius(a, massSun, BODY_M,`, `K.tideRadius(a, massSun, 1,`],
  ['Primordial gets an angular scale', `thetaG: obj?.hypothetical ? null : K.thetaG(massSun, distPc),`, `thetaG: K.thetaG(massSun, distPc),`],
  ['the ISCO period half an orbit', `iscoPeriod: 2 * Math.PI /`, `iscoPeriod: Math.PI /`],
  ['the interior time left in M', `interiorTauS: base.interiorTau * tg,`, `interiorTauS: base.interiorTau,`],
  ['pi M left out its pi', `piM: Math.PI * tg,`, `piM: tg,`],
  ['the e-folding time times the surface gravity', `efold: tg / base.kappa,`, `efold: tg * base.kappa,`],
  ['the Hawking temperature of the non-spinning hole, as before 2026-11-16', `K.hawkingKelvin(massSun * K.SI.Msun, a, q)`, `K.hawkingKelvin(massSun * K.SI.Msun)`],
  ['the Hawking temperature without the charge', `K.hawkingKelvin(massSun * K.SI.Msun, a, q)`, `K.hawkingKelvin(massSun * K.SI.Msun, a, 0)`],
  ['the horizon in metres, not km', `horizonKm: base.rh * rg / 1000,`, `horizonKm: base.rh * rg,`],

  /* ---- the analytic shadow ---- */
  ['charge without spin read only from Q = 0.02', `if (q > 0 && a < 1e-4) {`, `if (q > 0.02 && a < 1e-4) {`],
  ['a = 1e-4 counted as no spin', `if (q > 0 && a < 1e-4) {`, `if (q > 0 && a <= 1e-4) {`],
  ['a = 0.00009 counted as spin', `if (q > 0 && a < 1e-4) {`, `if (q > 0 && a < 5e-5) {`],
  ['Kerr-Newman with spin given a closed form below Q = 0.02', `} else if (q > 0) {`, `} else if (q > 0.02) {`],
  ['every spinning hole given no closed form', `} else if (q > 0) {`, `} else if (q >= 0) {`],
  ['the charged circle drawn at sqrt(27)', `const b = K.rnCriticalB(q);`, `const b = Math.sqrt(27);`],
  ['the charged circle drawn twice round', `b * Math.cos(Math.PI * i / 360), b * Math.sin(Math.PI * i / 360)`, `b * Math.cos(Math.PI * i / 180), b * Math.sin(Math.PI * i / 180)`],
  ['the Kerr curve at the inclination in degrees read as radians', `K.shadowCurve(a, inclDeg * Math.PI / 180, 360)`, `K.shadowCurve(a, inclDeg, 360)`],
  ['the shadow cache does not key the charge', SHAPEKEY, 's:${a}:${inclDeg.toFixed(2)}'],
  ['the shadow cache does not key the inclination', SHAPEKEY, 's:${a}:${q}'],

  /* ---- the shadow for display, the integrator ---- */
  ['the analytic shadow never used', `  if (t) return t;\n`, ``],
  ['the traced shadow\'s mean is its width', `mean: meanDiameter(chords), traced: true`, `mean: chords.width, traced: true`],
  ['the traced shadow not marked as traced', `traced: true, how: 'traced' };`, `how: 'traced' };`],
  ['the integrator drops the charge', `{ q, k: 0.08, iters: 22 }`, `{ k: 0.08, iters: 22 }`],
  ['the integrator at half the inclination', `K.measureShadow(a, inclDeg * Math.PI / 180,`, `K.measureShadow(a, inclDeg * Math.PI / 360,`],
  ['the integrator\'s bisection cut to 6 halvings', `k: 0.08, iters: 22 }`, `k: 0.08, iters: 6 }`],
  ['the integrator\'s cache does not key the charge', 'm:${a}:${q}:', 'm:${a}:'],

  /* ---- the predicted angle ---- */
  ['no distance: an angle all the same', `if (!obj || !obj.distPc) return null;\n  const tg = K.thetaG(obj.mass, obj.distPc);`, `if (!obj) return null;\n  const tg = K.thetaG(obj.mass, obj.distPc);`],
  ['no object: the page breaks', `if (!obj || !obj.distPc) return null;\n  const tg = K.thetaG(obj.mass, obj.distPc);`, `if (!obj.distPc) return null;\n  const tg = K.thetaG(obj.mass, obj.distPc);`],
  ['a missing mass error read as 1 Msun', REL, REL.replace(`(obj.massErr || 0)`, `(obj.massErr || 1)`)],
  ['a missing distance error read as 1 pc', REL, REL.replace(`(obj.distErr || 0)`, `(obj.distErr || 1)`)],
  ['the errors added, not in quadrature', REL, `(obj.massErr || 0) / obj.mass + (obj.distErr || 0) / obj.distPc`],
  ['the angle left in M', `return { value: diamM * tg,`, `return { value: diamM,`],

  /* ---- the measurement ---- */
  ['the telescope view measured at the object\'s inclination', INCL, INCL.replace(`'telescope'`, `'telescopeX'`)],
  ['a custom hole measured at 18 deg', INCL, INCL.replace(`: 17);`, `: 18);`)],
  ['every view measured at the state\'s inclination', INCL, `const incl = s.incl;`],
  ['a state with no charge measured at Q = 0.1', `objectOf(s), q = s.q || 0;`, `objectOf(s), q = s.q || 0.1;`],
  ['no comparison in the measurement', `cmp: compareShadow(th.mean, obj) };`, `cmp: null };`],

  /* ---- the fall ---- */
  ['the fall from 30 M by default', `fall(a, inclDeg, r0 = 40, q = 0)`, `fall(a, inclDeg, r0 = 30, q = 0)`],
  ['the fall at the polar angle in degrees read as radians', `K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 500)`, `K.fallTable(a, inclDeg, r0, q, 500)`],
  ['the fall in 600 steps', `K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 500)`, `K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 600)`],
  ['the fall drops the charge', `K.fallTable(a, inclDeg * Math.PI / 180, r0, q, 500)`, `K.fallTable(a, inclDeg * Math.PI / 180, r0, 0, 500)`],
  ['the fall cache does not key the start', FALLKEY, 'f:${a}:${q}:${inclDeg.toFixed(1)}'],
  ['the fall cache does not key the charge', FALLKEY, 'f:${a}:${inclDeg.toFixed(1)}:${r0}'],
];

process.exit(await runMutants({ here, file: 'physics.js', test: '../physics.test.mjs', mutants: MUTANTS }));
