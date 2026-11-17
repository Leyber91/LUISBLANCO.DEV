/* ============================================================
   The test of the physics tests, part 2 of 3. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/physics.mutants2.test.mjs

   Each entry breaks one rule of physics.js's number formats: what
   reads as missing, zero, where s3, sig and sci change to a power
   of ten (each bound moved to either side), how many figures, the
   superscripts, and where dur and len change unit. The broken
   file is written to a copy of this lab in the system's temp
   folder and physics.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Part 1 is physics.mutants.test.mjs; part 3,
   physics.mutants3.test.mjs, breaks the rules of 2026-11-16.

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
  ['sci: the minus sign not raised', `const sup = String(e).replace(/-/g, '⁻')`, `const sup = String(e)`],
  ['sci: the superscript digits shifted by one', `'⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]`, `'¹²³⁴⁵⁶⁷⁸⁹⁰'[+d]`],
  ['sci: plain numbers without thousands separators', `return Number(v.toPrecision(n)).toLocaleString('en-US');`, `return Number(v.toPrecision(n)).toString();`],

  /* ---- dur ---- */
  ['dur: infinity in years', `  if (!Number.isFinite(sec)) return '--';\n`, ``],
  ['dur: exactly a minute in seconds', DUR, DUR.replace(`Math.abs(sec) >= f`, `Math.abs(sec) > f`)],
  ['dur: a negative time stays in seconds', DUR, DUR.replace(`Math.abs(sec) >= f`, `sec >= f`)],
  ['dur: a minute of 61 s', `['min', 60]`, `['min', 61]`],
  /* one entry per row of the unit table (review_s2 P6-1: the hour, the nanosecond and the picosecond survived) */
  ['dur: a year of 3.156e8 s', `['yr', 3.156e7]`, `['yr', 3.156e8]`],
  ['dur: a day of 8640 s', `['d', 86400]`, `['d', 8640]`],
  ['dur: an hour of 360 s', `['h', 3600]`, `['h', 360]`],
  ['dur: a second of 10 s', `['s', 1]`, `['s', 10]`],
  ['dur: a millisecond of 1e-2 s', `['ms', 1e-3]`, `['ms', 1e-2]`],
  ['dur: a microsecond of 1e-5 s', `['µs', 1e-6]`, `['µs', 1e-5]`],
  ['dur: a nanosecond of 1e-8 s', `['ns', 1e-9]`, `['ns', 1e-8]`],
  ['dur: a picosecond of 1e-11 s', `['ps', 1e-12]`, `['ps', 1e-11]`],
  ['dur: a femtosecond of 1e-14 s', `['fs', 1e-15]`, `['fs', 1e-14]`],
  ['dur: an attosecond of 1e-17 s', `['as', 1e-18]`, `['as', 1e-17]`],
  ['dur: a zeptosecond of 1e-20 s', `['zs', 1e-21]`, `['zs', 1e-20]`],
  ['dur: a yoctosecond of 1e-23 s', `['ys', 1e-24]`, `['ys', 1e-23]`],
  ['dur: below every unit, in yoctoseconds', 'return `${sci(sec)} s`;', 'return `${sci(sec)} ys`;'],

  /* ---- len ---- */
  ['len: infinity in parsecs', `  if (!Number.isFinite(m)) return '--';\n`, ``],
  ['len: 999 m in metres', LEN, LEN.replace(`Math.abs(m) >= f * 0.999`, `Math.abs(m) > f * 0.999`)],
  ['len: a unit only from its whole size', LEN, LEN.replace(`f * 0.999`, `f`)],
  ['len: 998.9 m in kilometres', LEN, LEN.replace(`f * 0.999`, `f * 0.998`)],
  ['len: a negative length stays in metres', LEN, LEN.replace(`Math.abs(m) >=`, `m >=`)],
  ['len: below every unit, in femtometres', 'return `${sci(m)} m`;', 'return `${sci(m)} fm`;'],
  /* one entry per row of the unit table (review_s2 P6-1: the AU, the micrometre and the nanometre survived) */
  ['len: a parsec of 3.0857e17 m', `['pc', 3.0857e16]`, `['pc', 3.0857e17]`],
  ['len: an AU of 1.496e10 m', `['AU', 1.496e11]`, `['AU', 1.496e10]`],
  ['len: a kilometre of 1e4 m', `['km', 1e3]`, `['km', 1e4]`],
  ['len: a metre of 10 m', `['m', 1]`, `['m', 10]`],
  ['len: a millimetre of 1e-2 m', `['mm', 1e-3]`, `['mm', 1e-2]`],
  ['len: a micrometre of 1e-5 m', `['µm', 1e-6]`, `['µm', 1e-5]`],
  ['len: a nanometre of 1e-8 m', `['nm', 1e-9]`, `['nm', 1e-8]`],
  ['len: a femtometre of 1e-14 m', `['fm', 1e-15]`, `['fm', 1e-14]`],
  /* ---- the comparison with the EHT (ledger row 2, ruled 2026-11-16) ---- */
  ['compareShadow: no distance gives a comparison', `if (!obj || !obj.distPc) return null;\n  const r = obj.ruler;`, `if (!obj) return null;\n  const r = obj.ruler;`],
  ['compareShadow: no object breaks', `if (!obj || !obj.distPc) return null;\n  const r = obj.ruler;`, `if (!obj.distPc) return null;\n  const r = obj.ruler;`],
  ['the EHT\'s own mass used where a ruler is given', `const r = obj.ruler;`, `const r = null;`],
  ['the ruler\'s upper and lower errors swapped', `up = r ? r.errP : p.err, dn = r ? r.errM : p.err;`, `up = r ? r.errM : p.err, dn = r ? r.errP : p.err;`],
  ['the scale\'s name dropped', `by: r ? r.by : obj.massBy, src };`, `by: obj.massBy, src };`],
  ['no shadow ever set against', `if (e && e.shadow != null) {`, `if (false) {`],
  ['a shadow set against where none was published', `if (e && e.shadow != null) {`, `if (e && e.shadow == null) {`],
  ['the side of the error turned', `d > 0 ? pred.errM : pred.errP`, `d > 0 ? pred.errP : pred.errM`],
  ['the side chosen by the wrong sign', `d > 0 ? pred.errM`, `d < 0 ? pred.errM`],
  ['a sigma without the measurement\'s error', `Math.hypot(d > 0 ? pred.errM : pred.errP, e.shadowErr)`, `(d > 0 ? pred.errM : pred.errP)`],
  ['the ring dropped', `const ring = e && e.ring != null && !shadow ? { value: e.ring, err: e.ringErr, offsetPct: e.ringOffsetPct, scale: obj.thetaGPub?.v } : null;`, `const ring = null;`],
  ['a ring where none was published', `e && e.ring != null && !shadow ?`, `e && e.ring == null && !shadow ?`],
  ['a ring beside a shadow (the ruling: "the ring row goes")', `e.ring != null && !shadow ?`, `e.ring != null ?`],
  ['published drops the error\'s decimals', '${v.toFixed(d)} ${pm} ${e.toFixed(d)}', '${v.toFixed(d)} ${pm} ${e}'],
  ['published breaks on a whole number', `(String(v).split('.')[1] || '').length`, `(String(v).split('.')[1]).length`],
  ['published with one decimal too many', `(String(v).split('.')[1] || '').length`, `(String(v).split('.')[1] || '0').length`],
  ['no comparison read as one', `if (!c || (!c.shadow && !c.ring)) return`, `if (!c) return`],
  ['a null comparison breaks', `if (!c || (!c.shadow && !c.ring)) return`, `if ((!c.shadow && !c.ring)) return`],
  ['a comparison with only a ring read as none', `if (!c || (!c.shadow && !c.ring)) return`, `if (!c || !c.shadow) return`],
  ['the ring sentence where a shadow exists', `if (c.shadow) return`, `if (false) return`],
  ['a sigma of 0 written without its sign', `sigma >= 0 ? '+' : ''`, `sigma > 0 ? '+' : ''`],
  ['a negative sigma given a plus', `sigma >= 0 ? '+' : ''`, `'+'`],
  ['the name left out of the ring sentence', '${where} ${noShadow(name)}${pred}', '${where} ${noShadow(\'M87*\')}${pred}'],
  ['the name left out of the sentence that no shadow was measured', 'from its images of ${name}.`', 'from its images.`'],
];

process.exit(await runMutants({ here, file: 'physics.js', test: '../physics.test.mjs', mutants: MUTANTS }));
