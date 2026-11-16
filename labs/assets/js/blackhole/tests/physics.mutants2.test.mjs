/* ============================================================
   The test of the physics tests, part 2 of 2. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/physics.mutants2.test.mjs

   Each entry breaks one rule of physics.js's number formats: what
   reads as missing, zero, where s3, sig and sci change to a power
   of ten (each bound moved to either side), how many figures, the
   superscripts, and where dur and len change unit. The broken
   file is written to a copy of this lab in the system's temp
   folder and physics.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Part 1 is physics.mutants.test.mjs.

   Add an entry here with every new rule in physics.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// the three formats open with the same lines, so each entry names its function's own first line
const MISSING = `  if (v == null || !Number.isFinite(v)) return '--';`;
const S3 = `export function s3(v) {\n${MISSING}\n  if (v === 0) return '0.00';`;
const SIG = `export function sig(v, n = 3) {\n${MISSING}\n  if (v === 0) return '0';`;
const SCI = `export function sci(v, n = 3) {\n${MISSING}\n  if (v === 0) return '0';\n  const e = Math.floor(Math.log10(Math.abs(v)));`;
const S3FORM = `if (e >= 5 || e <= -3) return sci(v);`;
const SIGFORM = `if (e >= 6 || e <= -4) {`;
const SCIFORM = `if (e >= 5 || e <= -3) {`;
const DUR = 'for (const [name, f] of u) if (Math.abs(sec) >= f) return `${sci(sec / f)} ${name}`;';
const LEN = 'for (const [name, f] of u) if (Math.abs(m) >= f * 0.999) return `${sci(m / f)} ${name}`;';

const MUTANTS = [
  /* ---- s3 ---- */
  ['s3: zero read as missing', S3, S3.replace(`v == null ||`, `v == 0 ||`)],
  ['s3: NaN read as a number', S3, S3.replace(`v == null || !Number`, `v == null && !Number`)],
  ['s3: zero not caught', S3, S3.replace(`if (v === 0)`, `if (v === 1)`)],
  ['s3: a power of ten from 1e4', S3FORM, S3FORM.replace(`e >= 5`, `e >= 4`)],
  ['s3: a power of ten only from 1e6', S3FORM, S3FORM.replace(`e >= 5`, `e >= 6`)],
  ['s3: a power of ten from 0.01', S3FORM, S3FORM.replace(`e <= -3`, `e <= -2`)],
  ['s3: a power of ten only below 0.001', S3FORM, S3FORM.replace(`e <= -3`, `e <= -4`)],
  ['s3: never a power of ten', S3FORM, S3FORM.replace(`e >= 5 || e <= -3`, `e >= 5 && e <= -3`)],
  ['s3: the power of ten in sig\'s form', S3FORM, S3FORM.replace(`return sci(v);`, `return sig(v);`)],
  ['s3: decimals not held at 0 or more', `return v.toFixed(Math.max(0, 2 - e));`, `return v.toFixed(2 - e);`],
  ['s3: at least 1 decimal', `return v.toFixed(Math.max(0, 2 - e));`, `return v.toFixed(Math.max(1, 2 - e));`],
  ['s3: 4 significant figures', `return v.toFixed(Math.max(0, 2 - e));`, `return v.toFixed(Math.max(0, 3 - e));`],

  /* ---- sig ---- */
  ['sig: zero read as missing', SIG, SIG.replace(`v == null ||`, `v == 0 ||`)],
  ['sig: NaN read as a number', SIG, SIG.replace(`v == null || !Number`, `v == null && !Number`)],
  ['sig: zero not caught', SIG, SIG.replace(`if (v === 0)`, `if (v === 1)`)],
  ['sig: 4 figures by default', SIG, SIG.replace(`n = 3`, `n = 4`)],
  ['sig: a power of ten from 1e5', SIGFORM, SIGFORM.replace(`e >= 6`, `e >= 5`)],
  ['sig: a power of ten only from 1e7', SIGFORM, SIGFORM.replace(`e >= 6`, `e >= 7`)],
  ['sig: a power of ten from 0.001', SIGFORM, SIGFORM.replace(`e <= -4`, `e <= -3`)],
  ['sig: a power of ten only below 1e-4', SIGFORM, SIGFORM.replace(`e <= -4`, `e <= -5`)],
  ['sig: never a power of ten', SIGFORM, SIGFORM.replace(`e >= 6 || e <= -4`, `e >= 6 && e <= -4`)],
  ['sig: the mantissa with one decimal more', '`${m.toFixed(n - 1)}e${e}`', '`${m.toFixed(n)}e${e}`'],
  ['sig: the mantissa not divided by its power', '    const m = v / Math.pow(10, e);\n    return `${m.toFixed(n - 1)}e${e}`;', '    const m = v;\n    return `${m.toFixed(n - 1)}e${e}`;'],
  ['sig: plain numbers to n - 1 figures', `return Number(v.toPrecision(n)).toString();`, `return Number(v.toPrecision(n - 1)).toString();`],

  /* ---- sci ---- */
  ['sci: zero read as missing', SCI, SCI.replace(`v == null ||`, `v == 0 ||`)],
  ['sci: NaN read as a number', SCI, SCI.replace(`v == null || !Number`, `v == null && !Number`)],
  ['sci: zero not caught', SCI, SCI.replace(`if (v === 0)`, `if (v === 1)`)],
  ['sci: 2 figures by default', SCI, SCI.replace(`n = 3`, `n = 2`)],
  ['sci: a negative value\'s power read from its sign', SCI, SCI.replace(`Math.log10(Math.abs(v))`, `Math.log10(v)`)],
  ['sci: a power of ten from 1e4', SCIFORM, SCIFORM.replace(`e >= 5`, `e >= 4`)],
  ['sci: a power of ten only from 1e6', SCIFORM, SCIFORM.replace(`e >= 5`, `e >= 6`)],
  ['sci: a power of ten from 0.01', SCIFORM, SCIFORM.replace(`e <= -3`, `e <= -2`)],
  ['sci: a power of ten only below 0.001', SCIFORM, SCIFORM.replace(`e <= -3`, `e <= -4`)],
  ['sci: never a power of ten', SCIFORM, SCIFORM.replace(`e >= 5 || e <= -3`, `e >= 5 && e <= -3`)],
  ['sci: the minus sign not raised', `.replace(/-/g, '⁻')`, ``],
  ['sci: the superscript digits shifted by one', `'⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]`, `'¹²³⁴⁵⁶⁷⁸⁹⁰'[+d]`],
  ['sci: plain numbers without thousands separators', `return Number(v.toPrecision(n)).toLocaleString('en-US');`, `return Number(v.toPrecision(n)).toString();`],

  /* ---- dur ---- */
  ['dur: infinity in years', `  if (!Number.isFinite(sec)) return '--';\n`, ``],
  ['dur: exactly a minute in seconds', DUR, DUR.replace(`Math.abs(sec) >= f`, `Math.abs(sec) > f`)],
  ['dur: a negative time stays in seconds', DUR, DUR.replace(`Math.abs(sec) >= f`, `sec >= f`)],
  ['dur: a minute of 61 s', `['min', 60]`, `['min', 61]`],
  ['dur: below every unit, in yoctoseconds', 'return `${sci(sec)} s`;', 'return `${sci(sec)} ys`;'],

  /* ---- len ---- */
  ['len: infinity in parsecs', `  if (!Number.isFinite(m)) return '--';\n`, ``],
  ['len: 999 m in metres', LEN, LEN.replace(`Math.abs(m) >= f * 0.999`, `Math.abs(m) > f * 0.999`)],
  ['len: a unit only from its whole size', LEN, LEN.replace(`f * 0.999`, `f`)],
  ['len: 998.9 m in kilometres', LEN, LEN.replace(`f * 0.999`, `f * 0.998`)],
  ['len: a negative length stays in metres', LEN, LEN.replace(`Math.abs(m) >=`, `m >=`)],
  ['len: below every unit, in femtometres', 'return `${sci(m)} m`;', 'return `${sci(m)} fm`;'],
];

process.exit(await runMutants({ here, file: 'physics.js', test: '../physics.test.mjs', mutants: MUTANTS }));
