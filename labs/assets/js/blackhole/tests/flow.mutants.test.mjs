/* ============================================================
   The test of the disk's motion checks (flow.js, the shader's
   turbulence(), flow.test.mjs). Run from the repository root:
     node labs/assets/js/blackhole/tests/flow.mutants.test.mjs

   Each entry breaks one rule; the broken file is written to a copy
   of this lab in the system's temp folder and flow.test.mjs is run
   on the copy. The list began with review_spin's 14 mutants
   (2026-11-18), all of which the first tests let pass.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const FLOW_MUTANTS = [
  ['copy 1 carried from -0.1 T', 'const t0 = t - c0 * T, t1 = t + 0.5 * T - c1 * T;', 'const t0 = t - c0 * T, t1 = t + 0.4 * T - c1 * T;'],
  ['copy 1 on the even seeds, copy 0\'s seed half the time', 'seed: seed(c1, 1) }', 'seed: seed(c1, 0) }'],
  ['seeds one apart, not two', '((c * 2 + odd) % FLOW.seeds', '((c + odd) % FLOW.seeds'],
  ['the clock ignores the charge', 'const here = iscoOrbitM(m.a, m.q) / FLOW.mPerSecond;', 'const here = iscoOrbitM(m.a, 0) / FLOW.mPerSecond;'],
  ['the ISCO radius at no charge', 'K.circular(a, K.isco(a, 1, q), q).Omega', 'K.circular(a, K.isco(a, 1, 0), q).Omega'],
  ['the hole never named', '${who || \'this hole\'}', 'this hole'],
  ['a cycle of 2.3 ISCO orbits', 'cycleOrbits: 2,', 'cycleOrbits: 2.3,'],
  ['64 seeds', 'seeds: 256,', 'seeds: 64,'],
  ['the blend around 0.5', 'const m = FLOW.patternMean, rho = FLOW.copyCorrelation;', 'const m = 0.5, rho = FLOW.copyCorrelation;'],
  ['the blend ignores the correlation', '+ 2 * rho * w0 * w1));', '));'],
  ['the blend not normalised', 'm + (w0 * (v0 - m) + w1 * (v1 - m)) / Math.sqrt(w0 * w0 + w1 * w1 + 2 * rho * w0 * w1)', 'm + (w0 * (v0 - m) + w1 * (v1 - m))'],
  ['the pattern\'s mean 0.82', 'patternMean: 0.778,', 'patternMean: 0.82,'],
  ['a clock sentence where the disk is thin', 'return s.emit === \'thick\' &&', 'return s.emit !== \'off\' &&'],
  ['a clock sentence in the diagnostic maps', '(s.color === \'thermal\' || s.color === \'true\')', '(s.color !== \'redshift\')'],
  ['a clock sentence while paused', '&& !!s.anim && !reduced;', '&& !reduced;'],
  ['a clock sentence under reduced motion', '&& !!s.anim && !reduced;', '&& !!s.anim;'],
  ['the clock said in the hole\'s own time again', 'by a distant clock at', 'of the time at'],
];

const SHADER_MUTANTS = [
  ['no half-cycle offset for copy 1', 't1 = uTime + 0.5*T - c1*T;', 't1 = uTime - c1*T;'],
  ['copy 1 on copy 0\'s seed', 'mod(c1*2.0 + 1.0, ${FLOW.seeds.toFixed(1)})', 'mod(c0*2.0, ${FLOW.seeds.toFixed(1)})'],
  ['copy 1 carried by copy 0\'s time', 'diskPattern(phiW - Om*t1, lr', 'diskPattern(phiW - Om*t0, lr'],
  ['one copy shown twice', 'w1*(v1 - m)', 'w1*(v0 - m)'],
  ['a cycle eight times longer', 'float T = uCycle;', 'float T = 8.0*uCycle;'],
  ['c0 a quarter cycle off', 'float c0 = floor(uTime/T),', 'float c0 = floor(uTime/T + 0.25),'],
  ['the blend not normalised', '*inversesqrt(w0*w0 + w1*w1 + ${(2 * FLOW.copyCorrelation).toFixed(4)}*w0*w1));', '*1.0);'],
  ['the blend around a fixed 0.5', 'float m = ${FLOW.patternMean.toFixed(4)};', 'float m = 0.5;'],
  ['seeds one cell apart, correlated', 'vec3(seed*13.7, seed*7.9, 0.0)', 'vec3(seed*1.37, seed*0.73, 0.0)'],
  ['the ignition from the ISCO outward again', 'float ign = smoothstep(0.0, 1.0, uIgnite);', 'float ign = smoothstep(0.0, 1.0, (uIgnite*1.35 - (r - uRin)/(uRout - uRin))*3.0);'],
];

const a = await runMutants({ here, file: 'flow.js', test: '../flow.test.mjs', mutants: FLOW_MUTANTS });
const b = await runMutants({ here, file: 'shaders.js', test: '../flow.test.mjs', mutants: SHADER_MUTANTS });
process.exit(a || b);
