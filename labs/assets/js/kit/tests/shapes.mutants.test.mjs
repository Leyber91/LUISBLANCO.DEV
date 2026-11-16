/* ============================================================
   The test of the shapes tests. Run from the repository root:
     node labs/assets/js/kit/tests/shapes.mutants.test.mjs

   Each entry breaks one rule of kit/shapes.js: an output
   silenced, or a bound moved to either side. The broken file is
   written to a copy of the kit in the system's temp folder and
   shapes.test.mjs is run on the copy (the runner is Exomania's,
   labs/assets/js/exoplanet/tests/mutants.mjs). Every broken rule
   must fail a check there.

   Add an entry here with every new rule in shapes.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../exoplanet/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RANGED = 'const ranged = positive(lo) && positive(hi) && lo <= value && value <= hi && lo < hi;';
const SHOWN = 'const shown = marks === 0 || t === 0 ? 0 : Math.max(1, Math.round((marks * t) / n));';
const POS = "const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;";
const GATE = 'if (!positive(value) || !(width > 2 * IV_PAD) || !(span > 1)) return null;';
const ENDS = 'const a = Math.max(IV_PAD, ra), b = Math.min(width - IV_PAD, rb);';
const CUT = 'cutLo: ra < IV_PAD, cutHi: rb > width - IV_PAD';
const RIGHT = "if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(n - 1, i + 1);";
const LEFT = "if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, i - 1);";

const MUTANTS = [
  /* ---- the interval ---- */
  ['the axis reaches 2.3', 'export const IV_SPAN = 2.2;', 'export const IV_SPAN = 2.3;'],
  ['the axis reaches 2.1', 'export const IV_SPAN = 2.2;', 'export const IV_SPAN = 2.1;'],
  ['2 px kept at the ends', 'export const IV_PAD = 3;', 'export const IV_PAD = 2;'],
  ['4 px kept at the ends', 'export const IV_PAD = 3;', 'export const IV_PAD = 4;'],
  ['a value of zero placed on the log axis', POS, POS.replace('v > 0', 'v >= 0')],
  ['an end at infinity placed', POS, POS.replace(' && Number.isFinite(v)', '')],
  ['a strip as wide as its two ends drawn', GATE, GATE.replace('width > 2', 'width >= 2')],
  ['an axis of no reach drawn', GATE, GATE.replace('span > 1', 'span >= 1')],
  ['a range whose low end is above its value drawn', RANGED, RANGED.replace(' && lo <= value', '')],
  ['a range whose high end is below its value drawn', RANGED, RANGED.replace(' && value <= hi', '')],
  ['a range that starts at its value not drawn', RANGED, RANGED.replace('lo <= value', 'lo < value')],
  ['a range that ends at its value not drawn', RANGED, RANGED.replace('value <= hi', 'value < hi')],
  ['a range of no length drawn', RANGED, RANGED.replace(' && lo < hi', '')],
  ['a range with no high end drawn', RANGED, RANGED.replace('positive(hi) && ', '')],
  ['the low end placed by the high end\'s ratio', 'const ra = x(lo), rb = x(hi);', 'const ra = x(hi), rb = x(hi);'],
  ['an end past the axis not cut', ENDS, ENDS.replace('Math.max(IV_PAD, ra)', 'ra')],
  ['the high end never cut', ENDS, ENDS.replace('Math.min(width - IV_PAD, rb)', 'rb')],
  ['an end at the axis\'s reach said to be cut', CUT, CUT.replace('ra < IV_PAD', 'ra <= IV_PAD + 1e-9')],
  ['a cut high end said for the low one', CUT, CUT.replace('cutLo: ra < IV_PAD', 'cutLo: rb > width - IV_PAD')],
  ['the high end never said to be cut', CUT, CUT.replace('cutHi: rb > width - IV_PAD', 'cutHi: false')],
  ['a bare tick off the middle', 'return { xc, a: xc, b: xc, ranged: false', 'return { xc, a: 0, b: xc, ranged: false'],
  ['the axis\'s labels placed on a straight scale', 'return xc + k * Math.log(factor);', 'return xc + k * (factor - 1);'],
  /* ---- the scale ---- */
  ['the scale runs past its last option', RIGHT, RIGHT.replace('Math.min(n - 1, i + 1)', 'i + 1')],
  ['the scale runs past its first option', LEFT, LEFT.replace('Math.max(0, i - 1)', 'i - 1')],
  ['the down key not taken', RIGHT, RIGHT.replace(" || key === 'ArrowDown'", '')],
  ['the up key not taken', LEFT, LEFT.replace(" || key === 'ArrowUp'", '')],
  ['Home goes to the second option', "if (key === 'Home') return 0;", "if (key === 'Home') return 1;"],
  ['End goes past the last', "if (key === 'End') return n - 1;", "if (key === 'End') return n;"],
  ['a scale with no options moved', 'if (!(n > 0)) return null;', 'if (!(n >= 0)) return null;'],
  /* ---- the tally ---- */
  ['a part of a pitch counted as a mark', 'Math.floor(room / pitch)', 'Math.round(room / pitch)'],
  ['marks drawn past the count', 'const marks = Math.min(n, fit);', 'const marks = fit;'],
  ['a strip one short said to hold them all', 'const all = marks === n;', 'const all = marks >= n - 1;'],
  ['no mark stands for a kept few', SHOWN, SHOWN.replace('Math.max(1, Math.round((marks * t) / n))', 'Math.round((marks * t) / n)')],
  ['kept marks cut instead of rounded', SHOWN, SHOWN.replace('Math.round((marks * t) / n)', 'Math.floor((marks * t) / n)')],
  ['a kept thing with no mark of its own when all fit', SHOWN, SHOWN.replace('Math.round((marks * t) / n)', 'Math.round((marks * t) / (n + 1))')],
  ['a fraction of a thing counted', 'const n = Math.max(0, Math.floor(Number.isFinite(count)', 'const n = Math.max(0, Math.ceil(Number.isFinite(count)'],
  ['the kept marks bunched at the start', 'if (Math.floor(((i + 1) * shown) / marks) > Math.floor((i * shown) / marks)) at.push(i);', 'if (i < shown) at.push(i);'],
];

process.exit(await runMutants({ here, file: 'shapes.js', test: 'shapes.test.mjs', mutants: MUTANTS }));
