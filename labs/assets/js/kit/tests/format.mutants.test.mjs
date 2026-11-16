/* ============================================================
   The test of the format tests. Run from the repository root:
     node labs/assets/js/kit/tests/format.mutants.test.mjs

   Each entry breaks one rule of kit/format.js: an output
   silenced, or a condition loosened to either side of its bound.
   The broken file is written to a copy of the kit in the system's
   temp folder and format.test.mjs is run on the copy (the runner
   is Exomania's, labs/assets/js/exoplanet/tests/mutants.mjs).
   Every broken rule must fail a check there.

   Add an entry here with every new rule in format.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../exoplanet/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GROUP = `const g = whole.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');`;
const NUM_D = `const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));`;

const MUTANTS = [
  /* ---- grouping ---- */
  ['digits grouped by fours', GROUP, GROUP.replace('{3}', '{4}')],
  ['digits not grouped', GROUP, `const g = whole;`],
  ['grouped with a point', GROUP, GROUP.replace(`, ',');`, `, '.');`)],
  ['the sign of a negative value dropped', `return (neg ? '-' : '') + g`, `return g`],
  ['the fraction dropped', `+ (frac !== undefined ? '.' + frac : '');`, `;`],
  /* ---- whole numbers ---- */
  ['a whole number not rounded', `return grouped(Math.round(v));\n}\n\n/* A value`, `return grouped(v);\n}\n\n/* A value`],
  ['a whole number cut instead of rounded', `return grouped(Math.round(v));\n}\n\n/* A value`, `return grouped(Math.floor(v));\n}\n\n/* A value`],
  ['what is not a number written as one', `export function int(v, none = '') {\n  if (!isFiniteNumber(v)) return none;`, `export function int(v, none = '') {\n  if (v === undefined) return none;`],
  ['the word for none not used', `export function int(v, none = '') {\n  if (!isFiniteNumber(v)) return none;`, `export function int(v, none = '') {\n  if (!isFiniteNumber(v)) return '';`],
  ['a string of digits taken as a number', `export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);`, `export const isFiniteNumber = (v) => Number.isFinite(Number(v)) && v !== null;`],
  /* ---- significant figures ---- */
  ['one significant figure more', NUM_D, NUM_D.replace('sig - 1 -', 'sig -')],
  ['one significant figure fewer', NUM_D, NUM_D.replace('sig - 1 -', 'sig - 2 -')],
  ['five decimals allowed', `const s = v.toFixed(Math.min(d, 4));`, `const s = v.toFixed(Math.min(d, 5));`],
  ['three decimals at most', `const s = v.toFixed(Math.min(d, 4));`, `const s = v.toFixed(Math.min(d, 3));`],
  ['a value that rounds to a thousand left ungrouped', `return Math.abs(Number(s)) >= 1000 ? grouped(Math.round(v)) : s;`, `return s;`],
  ['a value that rounds to a thousand grouped only past it', `return Math.abs(Number(s)) >= 1000 ? grouped(Math.round(v)) : s;`, `return Math.abs(Number(s)) > 1000 ? grouped(Math.round(v)) : s;`],
  ['a negative value that rounds to a thousand left ungrouped', `return Math.abs(Number(s)) >= 1000 ? grouped(Math.round(v)) : s;`, `return Number(s) >= 1000 ? grouped(Math.round(v)) : s;`],
  ['zero written by the rule for the rest', `  if (a === 0) return '0';\n`, ``],
  ['the word for none not used by a value', `export function num(v, sig = 3, none = '') {\n  if (!isFiniteNumber(v)) return none;`, `export function num(v, sig = 3, none = '') {\n  if (!isFiniteNumber(v)) return '';`],
  ['one said in the plural', `\${n === 1 ? noun : many}`, `\${n <= 1 ? noun : many}`],
  ['two said in the singular', `\${n === 1 ? noun : many}`, `\${n < 3 ? noun : many}`],
  /* ---- dates ---- */
  ['the date in the visitor\'s own time zone', `return \`\${d.getUTCDate()}\${NBSP}`, `return \`\${d.getDate()}\${NBSP}`],
  ['the month one on', `\${MONTHS[d.getUTCMonth()]}`, `\${MONTHS[(d.getUTCMonth() + 1) % 12]}`],
  ['a date that can break across lines', `const NBSP = String.fromCharCode(160);`, `const NBSP = String.fromCharCode(32);`],
  ['the year left out', `\${NBSP}\${d.getUTCFullYear()}\`;`, `\`;`],
  ['a date for what is not a time', `export function day(ms, none = '') {\n  if (!isFiniteNumber(ms)) return none;`, `export function day(ms, none = '') {\n  if (ms === undefined) return none;`],
  ['a day of the month with one digit read', `/^(\\d{4})-(\\d{2})-(\\d{2})$/`, `/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/`],
  ['a day that is not in the calendar read', `return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;`, `return t;`],
  ['only the year of a day checked', `return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;`, `return d.getUTCFullYear() === +m[1] ? t : NaN;`],
  ['the ISO day cut to the month', `new Date(ms).toISOString().slice(0, 10) : '';`, `new Date(ms).toISOString().slice(0, 7) : '';`],
  ['an ISO day for what is not a time', `return isFiniteNumber(ms) ? new Date(ms).toISOString()`, `return ms != null ? new Date(ms).toISOString()`],
  /* ---- how long ago ---- */
  ['"just now" for a minute', `if (d < 45000) return 'just now';`, `if (d < 60000) return 'just now';`],
  ['"just now" for 30 seconds only', `if (d < 45000) return 'just now';`, `if (d < 30000) return 'just now';`],
  ['"just now" at 45 seconds', `if (d < 45000) return 'just now';`, `if (d <= 45000) return 'just now';`],
  ['a moment ahead of the clock said as a negative time', `if (d < 45000) return 'just now';   // a moment ahead of the clock too`, `if (d >= 0 && d < 45000) return 'just now';`],
  ['minutes cut instead of rounded', `const m = Math.max(1, Math.round(d / MIN));`, `const m = Math.max(1, Math.floor(d / MIN));`],
  ['sixty minutes said as minutes', `if (m < 60) return`, `if (m <= 60) return`],
  ['fifty-nine minutes said as an hour', `if (m < 60) return`, `if (m < 59) return`],
  ['twenty-four hours said as hours', `if (h < 24) return`, `if (h <= 24) return`],
  ['twenty-three hours said as a day', `if (h < 24) return`, `if (h < 23) return`],
  ['fourteen days said as days', `if (days < 14) return`, `if (days <= 14) return`],
  ['thirteen days said as a date', `if (days < 14) return`, `if (days < 13) return`],
  ['an old moment said in the visitor\'s own words', `  return day(then);\n}`, `  return \`\${plural(days, 'day')} ago\`;\n}`],
  ['words for no time', `if (!isFiniteNumber(then) || !isFiniteNumber(now)) return '';`, `if (!isFiniteNumber(then)) return '';`],
  /* ---- the time of day ---- */
  ['seconds always shown', `...(seconds ? { second: '2-digit' } : {})`, `second: '2-digit'`],
  ['the weekday never shown', `...(weekday ? { weekday: 'short' } : {})`, `...{}`],
];

process.exit(await runMutants({ here, file: 'format.js', test: 'format.test.mjs', mutants: MUTANTS }));
