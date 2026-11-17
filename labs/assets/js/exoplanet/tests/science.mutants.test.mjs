/* ============================================================
   The test of the tests of ticket 2.20 (science.js: positive
   values drawn as split log-normals, open ranges). Run from the
   repository root:
     node labs/assets/js/exoplanet/tests/science.mutants.test.mjs

   Each entry breaks one rule of the draws: a side swapped or
   dropped, a bound of "open" moved to either side, an open range
   reported as numbers. The broken science.js is written to a copy
   of the lab in the system's temp folder and science.test.mjs is
   run on the copy (kit/tests/mutants.mjs). Every broken rule must
   fail a check there.

   Equivalent, so not listed: the draw's side at z = 0 (z < 0 or
   z <= 0 gives the value itself either way).

   Add an entry with every new rule of the draws.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = ['data/exomania/pscomppars-snapshot.json'];
const SZ = '  const u = size(up) ?? size(down), d = size(down) ?? size(up);';
const NUL = '  if (!isNum(v) || v <= 0 || u === null) return null;';
const HI = '  const sHi = Math.log((v + u) / v), open = v - d <= 0;';
const RET = '  return { v, sLo: open ? sHi : Math.log(v / (v - d)), sHi, open };';
const DRAW = 'export const drawPositive = (sp, z) => sp.v * Math.exp(z * (z < 0 ? sp.sLo : sp.sHi));';
const OPEN = "  const open = spR && spR.open ? 'radius' : spM && spM.open ? 'mass' : null;";
const DER = '  const derived = (arr) => { const st = stat(arr); return st && open ? { med: st.med, lo: null, hi: null, open } : st; };';
const RD = '    const R = hasR ? (spR ? drawPositive(spR, gauss()) : p.R) : null;';
const MD = '    if (trueM) return spM ? drawPositive(spM, gauss()) : p.M;';
const MUTANTS = [
  ['a missing upper error not taken from the lower', SZ, '  const u = size(up), d = size(down) ?? size(up);'],
  ['a missing lower error not taken from the upper', SZ, '  const u = size(up) ?? size(down), d = size(down);'],
  ['a zero value drawn', NUL, '  if (!isNum(v) || v < 0 || u === null) return null;'],
  ['the upper side from the lower error', HI, '  const sHi = Math.log((v + d) / v), open = v - d <= 0;'],
  ['open only past the value, not at it', HI, '  const sHi = Math.log((v + u) / v), open = v - d < 0;'],
  ['open from just short of the value', HI, '  const sHi = Math.log((v + u) / v), open = v - d <= 1e-3;'],
  ['the lower side from the upper error', RET, '  return { v, sLo: sHi, sHi, open };'],
  ['an open lower side from its own error', RET, '  return { v, sLo: Math.log(v / Math.max(1e-9, v - d)), sHi, open };'],
  ['the sides swapped in the draw', DRAW, 'export const drawPositive = (sp, z) => sp.v * Math.exp(z * (z < 0 ? sp.sHi : sp.sLo));'],
  ['the radius drawn as itself', RD, '    const R = hasR ? p.R : null;'],
  ['a measured mass drawn as itself', MD, '    if (trueM) return p.M;'],
  ['an open mass ignored', OPEN, "  const open = spR && spR.open ? 'radius' : null;"],
  ['an open radius ignored', OPEN, "  const open = spM && spM.open ? 'mass' : null;"],
  ['an open range reported as numbers', DER, '  const derived = (arr) => stat(arr);'],
  ['an open range with no median', DER, '  const derived = (arr) => { const st = stat(arr); return st && open ? { med: null, lo: null, hi: null, open } : st; };'],
  ['the note of an open range silent', '  if (!mc || !mc.open) return \'\';', '  return \'\';'],
];

process.exit(await runMutants({ here, file: 'science.js', test: 'science.test.mjs', mutants: MUTANTS, also: ['kit', 'ai'], data }));
