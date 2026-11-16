/* ============================================================
   The test of the format tests. Run from the repository root:
     node labs/assets/js/kit/tests/format.mutants.test.mjs

   Each entry breaks one rule of kit/format.js: an output
   silenced, or a condition loosened to either side of its bound.
   The broken file is written to a copy of the kit in the system's
   temp folder and format.test.mjs is run on the copy (the runner
   is kit/tests/mutants.mjs). Every broken rule must fail a check
   there.

   Which conditions no entry breaks is counted from the code by
   tools/dev/conditions.mjs; a condition no entry can break
   without changing nothing says why in a comment beside it that
   starts "equivalent:".

   Add an entry with every new rule in format.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const IS = "export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);";
const GROUP = "const g = whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');";
const NUM_D = 'const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));';
const INT_HEAD = "export function int(v, none = '') {\n  if (!isFiniteNumber(v)) return none;";
const NUM_HEAD = "export function num(v, sig = 3, none = '') {\n  if (!isFiniteNumber(v)) return none;";
const SIGNED = "export const signed = (v, sig = 2) => (isFiniteNumber(v) ? (v < 0 ? '' : '+') + num(v, sig) : '');";
const IV_GUARD = "if (!isFiniteNumber(up) || !isFiniteNumber(down)) return '';";
const RANGE = "export const range = (lo, hi, sig = 2) => (isFiniteNumber(lo) && isFiniteNumber(hi) ? `${num(lo, sig)} to ${num(hi, sig)}` : '');";
const PLURAL = "export const plural = (n, noun, many = noun + 's') => `${int(n)} ${n === 1 ? noun : many}`;";
const DAY = "export function day(ms, none = '') {\n  if (!isFiniteNumber(ms)) return none;";
const DAYW = 'return `${d.getUTCDate()}${NBSP}${MONTHS[d.getUTCMonth()]}${NBSP}${d.getUTCFullYear()}`;';
const LDAY = "export function localDay(ms, none = '') {\n  if (!isFiniteNumber(ms)) return none;";
const LDAYW = 'return `${d.getDate()}${NBSP}${MONTHS[d.getMonth()]}${NBSP}${d.getFullYear()}`;';
const ISO_RE = '/^(\\d{4})-(\\d{2})-(\\d{2})$/';
const CAL = 'return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? t : NaN;';
const ISO = "return isFiniteNumber(ms) ? new Date(ms).toISOString().slice(0, 10) : '';";
const CLOCK = "export function clock(ms, { weekday = false, seconds = false } = {}) {\n  if (!isFiniteNumber(ms)) return '';";

const MUTANTS = [
  ['F01 a string of digits taken as a number', IS, "export const isFiniteNumber = (v) => Number.isFinite(Number(v)) && v !== null;"],
  ['F02 infinity taken as a number', IS, "export const isFiniteNumber = (v) => typeof v === 'number' && !Number.isNaN(v);"],
  ['F03 the sign of a negative value dropped', "const neg = v < 0, s", "const neg = false, s"],
  ['F04 zero read as negative', "const neg = v < 0, s", "const neg = v <= 0, s"],
  ['F05 digits not grouped', GROUP, 'const g = whole;'],
  ['F06 digits grouped by fours', GROUP, GROUP.replace('{3}', '{4}')],
  ['F07 grouped with a point', GROUP, GROUP.replace(", ',');", ", '.');")],
  ['F08 the fraction dropped', "+ (frac !== undefined ? '.' + frac : '');", ';'],
  ['F09 the word for none not used', INT_HEAD, "export function int(v, none = '') {\n  if (!isFiniteNumber(v)) return '';"],
  ['F10 what is not a number written as one', INT_HEAD, "export function int(v, none = '') {\n  if (v === undefined) return none;"],
  ['F11 a whole number cut instead of rounded', 'return grouped(Math.round(v));\n}\n\n/* A value', 'return grouped(Math.floor(v));\n}\n\n/* A value'],
  ['F12 four significant figures by default', NUM_HEAD, NUM_HEAD.replace('sig = 3', 'sig = 4')],
  ['F13 a missing value written as a dash by default', NUM_HEAD, NUM_HEAD.replace("none = ''", "none = '-'")],
  ['F14 the word for none not used by a value', NUM_HEAD, NUM_HEAD.replace('return none;', "return '';")],
  ['F15 what is not a number written as a value', NUM_HEAD, NUM_HEAD.replace('if (!isFiniteNumber(v))', 'if (v === undefined)')],
  ['F16 zero written by the rule for the rest', "  if (a === 0) return '0';\n", ''],
  ['F17 a small value written as zero', "if (a === 0) return '0';", "if (a < 0.001) return '0';"],
  ['F18 no floor on the decimals', NUM_D, 'const d = sig - 1 - Math.floor(Math.log10(a));'],
  ['F19 one significant figure more', NUM_D, NUM_D.replace('sig - 1 -', 'sig -')],
  ['F20 one significant figure fewer', NUM_D, NUM_D.replace('sig - 1 -', 'sig - 2 -')],
  ['F21 five decimals allowed', 'const s = a.toFixed(Math.min(d, 4));', 'const s = a.toFixed(Math.min(d, 5));'],
  ['F22 three decimals at most', 'const s = a.toFixed(Math.min(d, 4));', 'const s = a.toFixed(Math.min(d, 3));'],
  ['F23 a value that rounds to a thousand left ungrouped', '  if (Number(s) >= 1000) return grouped(Math.round(v));', ''],
  ['F24 a thousand itself left ungrouped', 'if (Number(s) >= 1000) return', 'if (Number(s) > 1000) return'],
  ['F25 whole and grouped from 999', 'if (Number(s) >= 1000) return', 'if (Number(s) >= 999) return'],
  ['F26 a negative value written with no sign', "return (v < 0 ? MINUS : '') + s;", 'return s;'],
  ['F27 a negative difference given a plus as well', SIGNED, SIGNED.replace("(v < 0 ? '' : '+')", "'+'")],
  ['F28 a difference of zero given no sign', SIGNED, SIGNED.replace('(v < 0 ?', '(v <= 0 ?')],
  ['F29 a difference to three figures by default', SIGNED, SIGNED.replace('sig = 2', 'sig = 3')],
  ['F30 an interval with a missing side written', IV_GUARD, ''],
  ['F31 only the upper side looked for', IV_GUARD, "if (!isFiniteNumber(up)) return '';"],
  ['F32 two equal sides written as two', 'if (Math.abs(a - b) / Math.max(a, 1e-9) < 0.15) return', 'if (false) return'],
  ['F33 sides 15% apart written as one', '/ Math.max(a, 1e-9) < 0.15)', '/ Math.max(a, 1e-9) <= 0.15)'],
  ['F34 sides 14% apart written as two', '/ Math.max(a, 1e-9) < 0.15)', '/ Math.max(a, 1e-9) < 0.14)'],
  ['F63 two sides of zero written as two', '/ Math.max(a, 1e-9) < 0.15)', '/ a < 0.15)'],
  ['F35 an interval to three figures by default', 'export function interval(up, down, sig = 2) {', 'export function interval(up, down, sig = 3) {'],
  ['F36 a range with a missing end written', RANGE, RANGE.replace('isFiniteNumber(lo) && isFiniteNumber(hi)', 'true')],
  ['F37 only the low end looked for', RANGE, RANGE.replace(' && isFiniteNumber(hi)', '')],
  ['F38 a range to three figures by default', RANGE, RANGE.replace('sig = 2', 'sig = 3')],
  ['F39 one said in the plural', PLURAL, PLURAL.replace('n === 1 ? noun : many', 'many')],
  ['F40 none said in the singular', PLURAL, PLURAL.replace('n === 1', 'n <= 1')],
  ['F41 the plural made with -es', PLURAL, PLURAL.replace("noun + 's'", "noun + 'es'")],
  ['F42 a date for what is not a time', DAY, DAY.replace('if (!isFiniteNumber(ms)) return none;', '')],
  ['F43 the word for no date not used', DAY, DAY.replace('return none;', "return '';")],
  ['F44 the day of a date of the data in the machine\'s zone', DAYW, DAYW.replace('d.getUTCDate()', 'd.getDate()')],
  ['F45 the month of a date of the data in the machine\'s zone', DAYW, DAYW.replace('d.getUTCMonth()', 'd.getMonth()')],
  ['F46 the year of a date of the data in the machine\'s zone', DAYW, DAYW.replace('d.getUTCFullYear()', 'd.getFullYear()')],
  ['F47 a date that can break across lines', 'const NBSP = String.fromCharCode(160);', 'const NBSP = String.fromCharCode(32);'],
  ['F48 a date of the visitor\'s for what is not a time', LDAY, LDAY.replace('if (!isFiniteNumber(ms)) return none;', '')],
  ['F49 the day of a visitor\'s moment in UTC', LDAYW, LDAYW.replace('d.getDate()', 'd.getUTCDate()')],
  ['F50 the month of a visitor\'s moment in UTC', LDAYW, LDAYW.replace('d.getMonth()', 'd.getUTCMonth()')],
  ['F51 the year of a visitor\'s moment in UTC', LDAYW, LDAYW.replace('d.getFullYear()', 'd.getUTCFullYear()')],
  ['F52 a day read with something before it', ISO_RE, ISO_RE.replace('/^', '/')],
  ['F53 a day read with something after it', ISO_RE, ISO_RE.replace('$/', '/')],
  ['F54 a day of the month with one digit read', ISO_RE, '/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/'],
  ['F55 a day that is not in the calendar read', CAL, 'return t;'],
  ['F56 only the year of a day checked', CAL, 'return d.getUTCFullYear() === +m[1] ? t : NaN;'],
  ['F57 only the month of a day checked', CAL, 'return d.getUTCMonth() === +m[2] - 1 ? t : NaN;'],
  ['F58 an ISO day for what is not a time', ISO, "return ms != null ? new Date(ms).toISOString().slice(0, 10) : '';"],
  ['F59 the ISO day cut to the month', ISO, ISO.replace('slice(0, 10)', 'slice(0, 7)')],
  ['F60 the weekday shown by default', CLOCK, CLOCK.replace('weekday = false', 'weekday = true')],
  ['F61 seconds shown by default', CLOCK, CLOCK.replace('seconds = false', 'seconds = true')],
  ['F62 a time of day for what is not a time', CLOCK, CLOCK.replace("if (!isFiniteNumber(ms)) return '';", '')],
];

process.exit(await runMutants({ here, file: 'format.js', test: 'format.test.mjs', mutants: MUTANTS }));
