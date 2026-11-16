/* ============================================================
   The test of the physics tests, part 3 of 3. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/physics.mutants3.test.mjs

   Each entry breaks one rule physics.js gained on 2026-11-16 from
   review_s2.md: the numbers a sentence quotes (the shadow against
   the horizon, the sub-ring factor, the background crossover, the
   fusion share, the ergosurface), the comparison's chord, scale
   errors and ring basis, the ruling's words (P6-2: "inferred",
   "outside", "its own scale", a claim only with both its offset
   and its scale), one format per quantity kind (sigmaText, sigNum,
   deg, spinText, parsecs, photonEnergy), and the claim tags. The
   broken file is written to a copy of this lab in the system's
   temp folder and physics.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Parts 1 and 2 are physics.mutants.test.mjs and
   physics.mutants2.test.mjs.

   Add an entry here with every new rule in physics.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/physics.js labs/assets/js/blackhole/tests/physics.mutants.test.mjs labs/assets/js/blackhole/tests/physics.mutants2.test.mjs labs/assets/js/blackhole/tests/physics.mutants3.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WHERE = 'const where = r.offsetPct != null && r.scale != null ?';
const SIGNUM = 'return v == null || !Number.isFinite(v) ? null : +v.toPrecision(n);';
const PC = 'return pc >= 1e6 ? `${(pc / 1e6).toPrecision(3)} Mpc` : pc >= 1e3 ? `${(pc / 1e3).toPrecision(3)} kpc` : `${pc.toPrecision(3)} pc`;';
const EV = 'return eV >= 1000 ? `${(eV / 1000).toPrecision(3)} keV` : `${eV.toPrecision(3)} eV`;';
const TAGS = `if (!obj || obj.hypothetical) return { mass: 'ILLUSTRATIVE', dist: 'ILLUSTRATIVE', spin: 'ILLUSTRATIVE', edd: 'ILLUSTRATIVE' };`;
const REAL = `return { mass: 'REAL', dist: 'REAL', spin: obj.spinTag, edd: obj.eddTag };`;

const MUTANTS = [
  /* ---- the shadow against the horizon (P2-4) ---- */
  ['the ratio taken at 17 deg', `return shadowFor(a, 90, q).mean / (2 * K.horizon(a, q));`, `return shadowFor(a, 17, q).mean / (2 * K.horizon(a, q));`],
  ['the ratio over the radius, not the diameter', `return shadowFor(a, 90, q).mean / (2 * K.horizon(a, q));`, `return shadowFor(a, 90, q).mean / K.horizon(a, q);`],
  ['the ratio\'s horizon without the charge', `return shadowFor(a, 90, q).mean / (2 * K.horizon(a, q));`, `return shadowFor(a, 90, q).mean / (2 * K.horizon(a, 0));`],

  /* ---- the sub-ring factor (P2-2) ---- */
  ['a small charge given a closed form', `return q > 0 ? null : K.lyapunov`, `return q > 0.01 ? null : K.lyapunov`],
  ['no charge read as charge', `return q > 0 ? null : K.lyapunov`, `return q >= 0 ? null : K.lyapunov`],
  ['the factor at the photon orbit of a = 0', `K.lyapunov(a, K.polarPhotonOrbit(a));`, `K.lyapunov(a, 3);`],

  /* ---- the background crossover (P2-6), the fusion share, the ergosurface ---- */
  ['the crossover with 4 pi', `(8 * Math.PI * K.SI.G * K.SI.kB * K.SI.Tcmb)`, `(4 * Math.PI * K.SI.G * K.SI.kB * K.SI.Tcmb)`],
  ['the crossover against a typed Moon', `moons: kg / K.SI.Mmoon,`, `moons: kg / 7.342e22,`],
  ['the crossover\'s background typed', `T: K.SI.Tcmb };`, `T: 2.7 };`],
  ['the fusion share for three atoms', `(1 - K.SI.uHe4 / (4 * K.SI.uH1))`, `(1 - K.SI.uHe4 / (3.98 * K.SI.uH1))`],
  ['the ergosurface without the charge', `1 - q * q - a * a * c * c`, `1 - a * a * c * c`],
  ['the ergosurface by the sine', `const c = Math.cos(thetaDeg * Math.PI / 180);`, `const c = Math.sin(thetaDeg * Math.PI / 180);`],
  ['the ergosurface held at a floor of 0.1', `Math.max(0, 1 - q * q - a * a * c * c)`, `Math.max(0.1, 1 - q * q - a * a * c * c)`],

  /* ---- what the comparison carries (P2-3, P1-3, P2-10) ---- */
  ['the chord\'s diameter not carried', `const pred = { diamM, value:`, `const pred = { diamM: 0, value:`],
  ['the scale\'s errors swapped', `thetaErrP: up, thetaErrM: dn,`, `thetaErrP: dn, thetaErrM: up,`],
  ['the ring\'s offset typed', `offsetPct: e.ringOffsetPct,`, `offsetPct: 10,`],
  ['the ring\'s scale typed', `scale: obj.thetaGPub?.v }`, `scale: 3.8 }`],

  /* ---- the ruling's words (P6-2) ---- */
  ['the ring sentence says inside', `% outside the photon ring.`, `% inside the photon ring.`],
  ['the shadow sentence says measured', `The EHT inferred a shadow`, `The EHT measured a shadow`],
  ['the ring\'s scale not named as its own', ` On its own scale, theta_g`, ` On a scale, theta_g`],
  ['the ring\'s place given as fact, not its models\'', `its models place the ring`, `it places the ring`],
  ['a claim with no offset', WHERE, WHERE.replace(`r.offsetPct != null &&`, `true &&`)],
  ['a claim with no scale', WHERE, WHERE.replace(`&& r.scale != null`, `&& true`)],
  ['the ruling reworded', `'A sigma is set only between two shadows; a ring of emission is a different quantity.'`, `'A sigma is set between a shadow and a ring.'`],

  /* ---- one format per quantity kind (C3) ---- */
  ['sigmaText: 2 decimals, not 3 figures', '${sigma >= 0 ? \'+\' : \'\'}${s3(sigma)} ${sym}', '${sigma >= 0 ? \'+\' : \'\'}${sigma.toFixed(2)} ${sym}'],
  ['sigmaText: the symbol by default', `sigmaText(sigma, sym = 'sigma')`, `sigmaText(sigma, sym = 'σ')`],
  ['sigNum: zero read as none', SIGNUM, SIGNUM.replace(`v == null ||`, `v == 0 ||`)],
  ['sigNum: NaN read as a number', SIGNUM, SIGNUM.replace(`v == null || !Number`, `v == null && !Number`)],
  ['sigNum: 3 figures by default', `sigNum(v, n = 4)`, `sigNum(v, n = 3)`],
  ['deg: no decimal', `return String(+(+v).toFixed(1));`, `return String(+(+v).toFixed(0));`],
  ['deg: a whole angle keeps its .0', `return String(+(+v).toFixed(1));`, `return (+v).toFixed(1);`],
  ['spinText: 2 decimals', `return (+a).toFixed(3);`, `return (+a).toFixed(2);`],
  ['parsecs: a megaparsec in kiloparsecs', PC, PC.replace(`pc >= 1e6`, `pc > 1e6`)],
  ['parsecs: just below a megaparsec in megaparsecs', PC, PC.replace(`pc >= 1e6`, `pc >= 9e5`)],
  ['parsecs: a kiloparsec in parsecs', PC, PC.replace(`pc >= 1e3`, `pc > 1e3`)],
  ['parsecs: just below a kiloparsec in kiloparsecs', PC, PC.replace(`pc >= 1e3`, `pc >= 900`)],
  ['parsecs: megaparsecs off by ten', PC, PC.replace(`(pc / 1e6)`, `(pc / 1e5)`)],
  ['photonEnergy: a keV in eV', EV, EV.replace(`eV >= 1000`, `eV > 1000`)],
  ['photonEnergy: just below a keV in keV', EV, EV.replace(`eV >= 1000`, `eV >= 990`)],
  ['photonEnergy: keV off by ten', EV, EV.replace(`(eV / 1000)`, `(eV / 100)`)],

  /* ---- the claim tags (C10) ---- */
  ['weakest: a missing tag counted as REAL', `tags.every((t) => t === 'REAL')`, `tags.every((t) => t !== 'ILLUSTRATIVE')`],
  ['weakest: the strongest input wins', `tags.every((t) => t === 'REAL')`, `tags.some((t) => t === 'REAL')`],
  ['inputTags: a hypothetical hole measured', TAGS, TAGS.replace(`!obj || obj.hypothetical`, `!obj`)],
  ['inputTags: a custom hole breaks', TAGS, TAGS.replace(`!obj || obj.hypothetical`, `obj.hypothetical`)],
  ['inputTags: every spin measured', REAL, REAL.replace(`spin: obj.spinTag`, `spin: 'REAL'`)],
  ['inputTags: every accretion rate measured', REAL, REAL.replace(`edd: obj.eddTag`, `edd: 'REAL'`)],
  ['inputTags: a real mass illustrative', REAL, REAL.replace(`mass: 'REAL'`, `mass: 'ILLUSTRATIVE'`)],
  ['inputTags: a real distance illustrative', REAL, REAL.replace(`dist: 'REAL'`, `dist: 'ILLUSTRATIVE'`)],
];

process.exit(await runMutants({ here, file: 'physics.js', test: '../physics.test.mjs', mutants: MUTANTS }));
