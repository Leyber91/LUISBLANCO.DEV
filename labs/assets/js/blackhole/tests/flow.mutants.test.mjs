/* ============================================================
   The test of the disk's motion checks (flow.js, the shader's
   turbulence(), flow.test.mjs). Run from the repository root:
     node labs/assets/js/blackhole/tests/flow.mutants.test.mjs

   Each entry breaks one rule; the broken file is written to a copy
   of this lab in the system's temp folder and flow.test.mjs is run
   on the copy. The list began with review_spin's 14 mutants and
   review_spin2's (2026-11-18), which the tests of the day let pass.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const FLOW_MUTANTS = [
  ['copy 1 carried from -0.1 T', 'const t0 = t - c0 * T, t1 = t + 0.5 * T - c1 * T;', 'const t0 = t - c0 * T, t1 = t + 0.4 * T - c1 * T;'],
  ['copy 1 on the even seeds', 'seed: seed(c1, 1) }', 'seed: seed(c1, 0) }'],
  ['seeds one apart, not two', '((c * 2 + odd) % FLOW.seeds', '((c + odd) % FLOW.seeds'],
  ['the clock ignores the charge', 'here: iscoOrbitM(m.a, m.q) / FLOW.mPerSecond', 'here: iscoOrbitM(m.a, 0) / FLOW.mPerSecond'],
  ['the ISCO radius at no charge', 'K.circular(a, K.isco(a, 1, q), q).Omega', 'K.circular(a, K.isco(a, 1, 0), q).Omega'],
  ['the hole never named', 'by a distant clock at ${who || \'this hole\'}', 'by a distant clock at this hole'],
  ['a cycle of 2.3 ISCO orbits', 'cycleOrbits: 2,', 'cycleOrbits: 2.3,'],
  ['64 seeds', 'seeds: 256,', 'seeds: 64,'],
  ['the blend around 0.5', 'const m = FLOW.coreMean;', 'const m = 0.5;'],
  ['the blend not normalised', 'm + (w0 * (x0 - m) + w1 * (x1 - m)) / Math.sqrt(w0 * w0 + w1 * w1)', 'm + (w0 * (x0 - m) + w1 * (x1 - m))'],
  ['the core\'s mean 0.535', 'coreMean: 0.52 }', 'coreMean: 0.535 }'],
  ['the blend floored at 0.1', 'return Math.max(0, m +', 'return Math.max(0.1, m +'],
  ['a clock sentence where the disk is thin', 'return s.emit === \'thick\' &&', 'return s.emit !== \'off\' &&'],
  ['a clock sentence in the diagnostic maps', '(s.color === \'thermal\' || s.color === \'true\')', '(s.color !== \'redshift\')'],
  ['a clock sentence while paused', '&& !!s.anim && !reduced &&', '&& !reduced &&'],
  ['a clock sentence under reduced motion', '&& !!s.anim && !reduced &&', '&& !!s.anim &&'],
  ['a clock sentence in the fall', ' && s.view !== \'journey\';', ';'],
  ['the long sentence in the hole\'s own time again', 'by a distant clock at ${who', 'of the time at ${who'],
  ['the short sentence without its clock', 'here and ${dur(c.there)} by a distant clock.`', 'here and ${dur(c.there)} there.`'],
];

const SHADER_MUTANTS = [
  ['no half-cycle offset for copy 1', 't1 = uTime + 0.5*T - c1*T;', 't1 = uTime - c1*T;'],
  ['copy 1 on copy 0\'s seed', 'mod(c1*2.0 + 1.0, ${FLOW.seeds.toFixed(1)})', 'mod(c0*2.0, ${FLOW.seeds.toFixed(1)})'],
  ['copy 1 carried by copy 0\'s time', 'diskCore(phiW - Om*t1, lr', 'diskCore(phiW - Om*t0, lr'],
  ['one copy shown twice', 'w1*(x1 - m)', 'w1*(x0 - m)'],
  ['a cycle eight times longer', 'float T = uCycle;', 'float T = 8.0*uCycle;'],
  ['c0 a quarter cycle off', 'float c0 = floor(uTime/T),', 'float c0 = floor(uTime/T + 0.25),'],
  ['the blend not normalised', '*inversesqrt(w0*w0 + w1*w1));', '*1.0);'],
  ['the blend around a fixed 0.5', 'float m = ${FLOW.coreMean.toFixed(4)};', 'float m = 0.5;'],
  ['the weights a ramp, the reset seen', 'float w0 = 1.0 - abs(2.0*t0/T - 1.0), w1 = 1.0 - w0;', 'float w0 = t0/T, w1 = 1.0 - w0;'],
  ['the blend a plain average', 'float x = max(0.0, m + (w0*(x0 - m) + w1*(x1 - m))*inversesqrt(w0*w0 + w1*w1));', 'float x = 0.5*(x0 + x1);'],
  ['seeds one cell apart, correlated', 'vec3(seed*13.7, seed*7.9, 0.0)', 'vec3(seed*1.37, seed*0.73, 0.0)'],
  ['the lanes inside the copies again', 'float lanes = 0.5 + 0.5*sin(lr*42.0);', 'float lanes = 0.5 + 0.5*sin(lr*42.0 + 3.0*x);'],
  ['a corner of the value noise moved', 'hash13(i + vec3(1,1,1))', 'hash13(i + vec3(1,1,0))'],
  ['the value noise without its smoothstep', 'f = f*f*(3.0 - 2.0*f);', 'f = f;'],
  ['the ignition from the ISCO outward again', 'float ign = smoothstep(0.0, 1.0, uIgnite);', 'float ign = smoothstep(0.0, 1.0, (uIgnite*1.35 - (r - uRin)/(uRout - uRin))*3.0);'],
];

const a = await runMutants({ here, file: 'flow.js', test: '../flow.test.mjs', mutants: FLOW_MUTANTS });
const b = await runMutants({ here, file: 'shaders.js', test: '../flow.test.mjs', mutants: SHADER_MUTANTS });
process.exit(a || b);
