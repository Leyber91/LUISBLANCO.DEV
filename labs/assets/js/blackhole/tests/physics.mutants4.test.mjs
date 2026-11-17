/* ============================================================
   The test of the physics tests, part 4. Run from the repository
   root:
     node labs/assets/js/blackhole/tests/physics.mutants4.test.mjs

   Each entry breaks one rule physics.js gained on 2026-11-17 from
   review_s2_p1_second.md (fix_s2_p1_brief.md): one definition of
   the mean diameter for every spin and charge (S8), one label of
   how a shadow was obtained (S7), the scale's source carried with
   the comparison (S6), no ring beside a shadow (S3), the
   prediction the lab reproduces at a = 0 and the verbs of what a
   paper did (S2), and one precision for a value and its error
   (K6). The broken file is written to a copy of this lab in the
   system's temp folder and physics.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Parts 1 to 3 are physics.mutants.test.mjs,
   physics.mutants2.test.mjs and physics.mutants3.test.mjs.

   Add an entry here with every new rule in physics.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/physics.js labs/assets/js/blackhole/tests/physics.mutants.test.mjs labs/assets/js/blackhole/tests/physics.mutants2.test.mjs labs/assets/js/blackhole/tests/physics.mutants3.test.mjs labs/assets/js/blackhole/tests/physics.mutants4.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = `const src = (r ? [r.basis] : [...new Set([obj.massSrc, obj.distSrc])]).map((k) => CITE[k]).join('; ');`;
const POW = `const p = big >= 1e5 || big < 1e-3 ? Math.floor(Math.log10(big)) : 0;`;
const PLACE = `const f = Math.pow(10, p), d = Math.max(0, 1 - Math.floor(Math.log10(small / f)));`;
const BODY = 'const body = `${v < 0 ? \'-\' : \'\'}${fx(v)} ${fx(eP) === fx(eM) ? `${pm} ${fx(eP)}` : `(+${fx(eP)}, ${minus}${fx(eM)})`}`;';
const PUB = 'return eM === e ? `${v.toFixed(d)} ${pm} ${e.toFixed(d)}` : `${v.toFixed(d)} (+${e.toFixed(d)}, -${eM.toFixed(d)})`;';

const MUTANTS = [
  /* ---- S8: one definition of the mean diameter ---- */
  ['the mean is the width alone', `export function meanDiameter(ch) { return 0.5 * (ch.width + ch.height); }`, `export function meanDiameter(ch) { return ch.width; }`],
  ['the mean is the height alone', `export function meanDiameter(ch) { return 0.5 * (ch.width + ch.height); }`, `export function meanDiameter(ch) { return ch.height; }`],
  ['the definition named as an area', `export const MEAN_DEF = '(width + height) / 2';`, `export const MEAN_DEF = 'area-equivalent';`],
  ['Kerr back on the area-equivalent diameter, charge on the chords', `return { curve, chords, mean: meanDiameter(chords), how };`, `return { curve, chords, mean: K.shadowMeanDiameter(curve), how };`],

  /* ---- S7: how a shadow was obtained ---- */
  ['every analytic shadow labelled as the circle', `let curve, how = 'bardeen';`, `let curve, how = 'rn';`],
  ['the circle labelled Bardeen', `      how = 'rn';\n`, ``],
  ['the traced shadow labelled Bardeen', `traced: true, how: 'traced' };`, `traced: true, how: 'bardeen' };`],
  ['the circle\'s label says Bardeen', `rn: { label: '2 b_c, Reissner-Nordstrom',`, `rn: { label: 'Bardeen 1973',`],
  ['the circle\'s curve named Bardeen\'s', `curve: 'critical circle 2 b_c, Reissner-Nordstrom' },`, `curve: 'Bardeen 1973 critical curve' },`],
  ['a curve named where none is drawn', `traced: { label: 'traced: no closed form for Q and a', curve: null },`, `traced: { label: 'traced: no closed form for Q and a', curve: 'Bardeen 1973 critical curve' },`],
  ['the traced label names Bardeen', `traced: { label: 'traced: no closed form for Q and a',`, `traced: { label: 'Bardeen 1973, traced',`],
  ['Kerr labelled with no year', `bardeen: { label: 'Bardeen 1973',`, `bardeen: { label: 'Bardeen',`],

  /* ---- S6: the scale's source ---- */
  ['the tabulating paper alone for the stars\' scale', SRC, SRC.replace(`[r.basis]`, `[r.src]`)],
  ['the distance\'s paper dropped', SRC, SRC.replace(`[...new Set([obj.massSrc, obj.distSrc])]`, `[obj.massSrc]`)],
  ['one paper named twice', SRC, SRC.replace(`[...new Set([obj.massSrc, obj.distSrc])]`, `[obj.massSrc, obj.distSrc]`)],
  ['two papers run together', SRC, SRC.replace(`.join('; ')`, `.join(' ')`)],
  ['the scale carries no source', `by: r ? r.by : obj.massBy, src };`, `by: r ? r.by : obj.massBy };`],

  /* ---- S2: the prediction the lab reproduces ---- */
  ['no prediction carried', `  if (e && e.predicted) {`, `  if (false) {`],
  ['the lab\'s value at the object\'s spin, not the predicted one', `const d0 = shadowFor(e.predicted.spin, obj.incl, 0).mean;`, `const d0 = shadowFor(obj.spin, obj.incl, 0).mean;`],
  ['the lab\'s value at the EHT\'s own scale', `lab: { diamM: d0, value: d0 * tg,`, `lab: { diamM: d0, value: d0 * 3.8,`],
  ['the lab\'s errors swapped', `errP: d0 * up, errM: d0 * dn } };`, `errP: d0 * dn, errM: d0 * up } };`],
  ['the prediction\'s sentence dropped', `const pred = pr ? \``, `const pred = false ? \``],
  ['a prediction called a measurement', `the EHT's Paper I predicts a shadow of`, `the EHT's Paper I measured a shadow of`],
  ['the prediction\'s spin dropped', `uas for a hole without spin, and the lab gives`, `uas, and the lab gives`],
  ['the lab\'s value without its errors', '${pmText(pr.lab.value, pr.lab.errP, pr.lab.errM, ASCII)} uas at a =', '${s3(pr.lab.value)} uas at a ='],
  ['the prediction\'s asymmetric errors made one', '${published(pr.v, pr.errP, \'+-\', pr.errM)} uas for', '${published(pr.v, pr.errP)} uas for'],
  ['the EHT said to have published what it did not measure', '`The EHT measured no shadow diameter from its images of', '`The EHT published no shadow diameter for'],
  ['published: asymmetric errors written as one', PUB, PUB.replace(`return eM === e ?`, `return true ?`)],
  ['published: the lower error loses its decimals', PUB, PUB.replace('-${eM.toFixed(d)}', '-${eM}')],

  /* ---- K6: a value and its error to one precision ---- */
  ['pmText: not a number printed', `  if (![v, eP, eM].every(Number.isFinite)) return '--';\n`, ``],
  ['pmText: the larger error sets the place', `const small = Math.min(Math.abs(eP), Math.abs(eM));`, `const small = Math.max(Math.abs(eP), Math.abs(eM));`],
  ['pmText: a zero error printed as one', `  if (small === 0) return sci(v);\n`, ``],
  ['pmText: the value alone sets the power', `const big = Math.max(Math.abs(v), small);`, `const big = Math.abs(v);`],
  ['pmText: 1e5 without a power', POW, POW.replace(`big >= 1e5`, `big > 1e5`)],
  ['pmText: a power from 9e4', POW, POW.replace(`big >= 1e5`, `big >= 9e4`)],
  ['pmText: 1e-3 with a power', POW, POW.replace(`big < 1e-3`, `big <= 1e-3`)],
  ['pmText: no power just under 1e-3', POW, POW.replace(`big < 1e-3`, `big < 9e-4`)],
  ['pmText: the power rounded up', POW, POW.replace(`Math.floor(Math.log10(big))`, `Math.ceil(Math.log10(big))`)],
  ['pmText: a power only where both bounds hold at once, so never', POW, POW.replace(`big >= 1e5 || big < 1e-3`, `big >= 1e5 && big < 1e-3`)],
  ['pmText: three figures of the error', PLACE, PLACE.replace(`Math.max(0, 1 -`, `Math.max(0, 2 -`)],
  ['pmText: a decimal at least', PLACE, PLACE.replace(`Math.max(0, 1 -`, `Math.max(1, 1 -`)],
  ['pmText: the place rounded up', PLACE, PLACE.replace(`Math.floor(Math.log10(small / f))`, `Math.ceil(Math.log10(small / f))`)],
  ['pmText: a negative value loses its sign', BODY, BODY.replace(`\${v < 0 ? '-' : ''}`, ``)],
  ['pmText: two errors that print alike written twice', BODY, BODY.replace(`fx(eP) === fx(eM) ?`, `eP === eM ?`)],
  ['pmText: the power of ten dropped', 'return p ? `(${body})×10${sup(p)}` : body;', 'return body;'],
  ['pmText: the card\'s ± by default is ASCII', `{ pm = '±', minus = '−' } = {}`, `{ pm = '+-', minus = '−' } = {}`],
  ['pmText: the card\'s minus by default is a hyphen', `{ pm = '±', minus = '−' } = {}`, `{ pm = '±', minus = '-' } = {}`],
  ['ASCII with the card\'s ±', `export const ASCII = { pm: '+-', minus: '-' };`, `export const ASCII = { pm: '±', minus: '-' };`],
  ['ASCII with the card\'s minus', `export const ASCII = { pm: '+-', minus: '-' };`, `export const ASCII = { pm: '+-', minus: '−' };`],
  ['sup: the minus not raised', `function sup(e) { return String(e).replace(/-/g, '⁻')`, `function sup(e) { return String(e)`],
  ['sup: the digits not raised', `.replace(/[0-9]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]); }`, `; }`],

  /* ---- the cache's keys hold the spin and the charge exactly (the fixer's note 4) ---- */
  ['the disk\'s key rounds the spin', 'memo(`b:${a}:${q}:', 'memo(`b:${a.toFixed(4)}:${q}:'],
  ['the disk\'s key rounds the charge', 'memo(`b:${a}:${q}:', 'memo(`b:${a}:${q.toFixed(4)}:'],
  ['the shadow\'s key rounds the spin', 'memo(`s:${a}:${q}:', 'memo(`s:${a.toFixed(4)}:${q}:'],
  ['the shadow\'s key rounds the charge', 'memo(`s:${a}:${q}:', 'memo(`s:${a}:${q.toFixed(4)}:'],
  ['the integrator\'s key rounds the spin', 'memo(`m:${a}:${q}:', 'memo(`m:${a.toFixed(4)}:${q}:'],
  ['the integrator\'s key rounds the charge', 'memo(`m:${a}:${q}:', 'memo(`m:${a}:${q.toFixed(4)}:'],
  ['the fall\'s key rounds the spin', 'memo(`f:${a}:${q}:', 'memo(`f:${a.toFixed(4)}:${q}:'],
  ['the fall\'s key rounds the charge', 'memo(`f:${a}:${q}:', 'memo(`f:${a}:${q.toFixed(4)}:'],
];

process.exit(await runMutants({ here, file: 'physics.js', test: '../physics.test.mjs', mutants: MUTANTS }));
