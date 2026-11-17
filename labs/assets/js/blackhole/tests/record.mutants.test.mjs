/* ============================================================
   The test of the record's tests. Run from the repository root:
     node labs/assets/js/blackhole/tests/record.mutants.test.mjs

   Each entry breaks one rule of record.js: one that silences a
   rule, and one that loosens each condition, with a case just
   inside and just outside every bound in record.test.mjs. The
   broken file is written to a copy of this lab in the system's
   temp folder and record.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check.

   Add an entry here with every new rule in record.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LINK = '/^([a-z]{1,4}=[A-Za-z0-9._%+-]{1,24})?(&[a-z]{1,4}=[A-Za-z0-9._%+-]{1,24})*$/';

const MUTANTS = [
  /* ---- the checks of a value ---- */
  ['a time of 0 is a time', `Number.isFinite(v) && v > 0;`, `Number.isFinite(v) && v >= 0;`],
  ['a time need not be finite', `const isTime = (v) => Number.isFinite(v) && v > 0;`, `const isTime = (v) => typeof v === 'number' && v > 0;`],
  ['a pixel at 0 is off the screen', `v >= 0 && v <= 1;`, `v > 0 && v <= 1;`],
  ['an entry that is a list read as an entry', `v && typeof v === 'object' && !Array.isArray(v) ? v : {}`, `v && typeof v === 'object' ? v : {}`],
  ['no entry read as an entry', `v && typeof v === 'object' && !Array.isArray(v) ? v : {}`, `v && typeof v !== 'object' && !Array.isArray(v) ? v : {}`],
  ['a list whose text is a link is a link', `typeof v === 'string' && v.length <= LIMITS.link`, `v.length <= LIMITS.link`],
  ['a pixel at 1 is off the screen', `v >= 0 && v <= 1;`, `v >= 0 && v < 1;`],
  ['a pixel a little past 1 is on the screen', `v >= 0 && v <= 1;`, `v >= 0 && v <= 1.02;`],
  ['a link of 401 characters is a link', `v.length <= LIMITS.link &&`, `v.length <= LIMITS.link + 1 &&`],
  ['a link of 400 characters is not', `v.length <= LIMITS.link &&`, `v.length < LIMITS.link &&`],
  ['a link of anything', `typeof v === 'string' && v.length <= LIMITS.link && ${LINK}.test(v)`, `typeof v === 'string' && v.length <= LIMITS.link`],
  ['a value of 25 characters', LINK, LINK.replace(/\{1,24\}/g, '{1,25}')],
  ['a key of 5 letters', LINK, LINK.replace(/\{1,4\}/g, '{1,5}')],
  ['a link not held from its start', LINK, LINK.replace('/^(', '/(')],

  /* ---- one door ---- */
  ['a stored hole with a bad link', `filter((e) => isLink(e.q) && isTime(e.t)).map((e) => ({ q: e.q, t: e.t }))`, `filter((e) => isTime(e.t)).map((e) => ({ q: e.q, t: e.t }))`],
  ['a stored hole with no time', `filter((e) => isLink(e.q) && isTime(e.t)).map((e) => ({ q: e.q, t: e.t }))`, `filter((e) => isLink(e.q)).map((e) => ({ q: e.q, t: e.t }))`],
  ['a stored hole twice', `if (seen.has(k)) return false; `, ``],
  ['a stored ray of three numbers', `e.p.length === 2 && e.p.every(isFrac) && FATES`, `e.p.length >= 2 && e.p.every(isFrac) && FATES`],
  ['a stored ray off the screen', `e.p.length === 2 && e.p.every(isFrac) && FATES`, `e.p.length === 2 && FATES`],
  ['a stored ray of a fate it does not name', `&& FATES.includes(e.fate) && Number.isInteger(e.n)`, `&& Number.isInteger(e.n)`],
  ['a stored ray of an order that is not whole', `&& FATES.includes(e.fate) && Number.isInteger(e.n)`, `&& FATES.includes(e.fate) && Number.isFinite(e.n)`],
  ['a stored ray of order 10', `e.n >= 0 && e.n <= 9)`, `e.n >= 0 && e.n <= 10)`],
  ['a stored ray of order -1', `e.n >= 0 && e.n <= 9)`, `e.n >= -1 && e.n <= 9)`],
  ['a stored fall with no proper time', `isTime(e.t) && isTime(e.tau)).map`, `isTime(e.t)).map`],
  ['a negative count of drops kept', `Number.isInteger(d.dropped) && d.dropped >= 0 ?`, `Number.isInteger(d.dropped) && d.dropped >= -5 ?`],
  ['a count of drops above the cap', `Math.min(d.dropped, LIMITS.dropped) : 0;`, `d.dropped : 0;`],
  ['the stored holes past their bound', `kept: unique(kept, (e) => e.q).slice(0, LIMITS.kept),`, `kept: unique(kept, (e) => e.q).slice(0, LIMITS.kept + 1),`],
  ['the stored rays past their bound', `    rays: rays.slice(0, LIMITS.rays),\n    falls:`, `    rays: rays.slice(0, LIMITS.rays + 1),\n    falls:`],
  ['the stored falls past their bound', `    falls: falls.slice(0, LIMITS.falls),\n    dropped,`, `    falls: falls.slice(0, LIMITS.falls + 1),\n    dropped,`],

  /* ---- the writes ---- */
  ['keep takes a bad link', `export function keep(record, { q, t }) {\n  if (!isLink(q)) return refuse(record, BAD_LINK);\n`, `export function keep(record, { q, t }) {\n`],
  ['keep takes a bad time', `  if (!isTime(t)) return refuse(record, BAD_TIME);\n  const rest`, `  const rest`],
  ['a hole past the bound kept', `record.kept.length >= LIMITS.kept) return refuse(record, FULL);`, `record.kept.length > LIMITS.kept) return refuse(record, FULL);`],
  ['a kept hole cannot move up when full', `if (rest.length === record.kept.length && record.kept.length >= LIMITS.kept)`, `if (record.kept.length >= LIMITS.kept)`],
  ['keeping a kept hole keeps it twice', `const rest = record.kept.filter((e) => e.q !== q);`, `const rest = record.kept.filter((e) => e.q === q);`],
  ['unkeep takes out every other hole', `const kept = record.kept.filter((e) => e.q !== q);`, `const kept = record.kept.filter((e) => e.q === q);`],
  ['unkeep of one not kept', `return kept.length === record.kept.length ? refuse(record, 'that hole is not kept')`, `return kept.length !== record.kept.length ? refuse(record, 'that hole is not kept')`],
  ['a ray of three numbers', `if (!(Array.isArray(p) && p.length === 2 && p.every(isFrac)))`, `if (!(Array.isArray(p) && p.length >= 2 && p.every(isFrac)))`],
  ['a ray off the screen', `if (!(Array.isArray(p) && p.length === 2 && p.every(isFrac)))`, `if (!(Array.isArray(p) && p.length === 2))`],
  ['a ray of a fate it does not name', `  if (!FATES.includes(fate)) return refuse(record, 'the ray did something this page does not name');\n`, ``],
  ['a ray of order 10', `n >= 0 && n <= 9)) return refuse`, `n >= 0 && n <= 10)) return refuse`],
  ['a ray of order -1', `n >= 0 && n <= 9)) return refuse`, `n >= -1 && n <= 9)) return refuse`],
  ['a ray of an order that is not whole', `if (!(Number.isInteger(n) && n >= 0`, `if (!(Number.isFinite(n) && n >= 0`],
  ['rays past the bound counted as negative drops', `const over = Math.max(0, rays.length - LIMITS.rays);`, `const over = rays.length - LIMITS.rays;`],
  ['rays past the bound kept', `rays: rays.slice(0, LIMITS.rays), dropped`, `rays, dropped`],
  ['drops past the cap counted', `dropped: Math.min(LIMITS.dropped, record.dropped + over) } };\n}\n/** A fall`, `dropped: record.dropped + over } };\n}\n/** A fall`],
  ['a fall with no proper time', `  if (!isTime(tau)) return refuse(record, 'the proper time is not a positive number');\n`, ``],
  ['fall drops past the cap counted', `falls: falls.slice(0, LIMITS.falls), dropped: Math.min(LIMITS.dropped, record.dropped + over) } };`, `falls: falls.slice(0, LIMITS.falls), dropped: record.dropped + over } };`],
  ['falls past the bound counted as negative drops', `const over = Math.max(0, falls.length - LIMITS.falls);`, `const over = falls.length - LIMITS.falls;`],

  /* ---- the store ---- */
  /* ---- the words and counts ---- */
  ['every hole read as kept', `export const isKept = (record, q) => record.kept.some((e) => e.q === q);`, `export const isKept = (record, q) => record.kept.some((e) => e.q !== q);`],
  ['the counts swapped', `({ kept: record.kept.length, rays: record.rays.length, falls: record.falls.length })`, `({ kept: record.rays.length, rays: record.kept.length, falls: record.falls.length })`],
  ['the empty record with a drop counted', `export const empty = () => ({ kept: [], rays: [], falls: [], dropped: 0 });`, `export const empty = () => ({ kept: [], rays: [], falls: [], dropped: 1 });`],
  ['load gives an empty record', `export async function load(os) { return (await read(os)).record; }`, `export async function load(os) { return empty(); }`],
  ['a change thought unchanged', `const changed = JSON.stringify(w.record) !== JSON.stringify(cur);`, `const changed = JSON.stringify(w.record) === JSON.stringify(cur);`],
  ['a record of this version read as newer', `newer: !!rec && rec.v > V };`, `newer: !!rec && rec.v >= V };`],
  ['a later version written', `newer: !!rec && rec.v > V };`, `newer: false };`],
  ['every change written, refused or not', `  if (changed) await os.progress.set(w.record, { v: V });`, `  await os.progress.set(w.record, { v: V });`],
  ['the way back written beside a refused change', `if (w.ok && resume) {`, `if (resume) {`],
];

process.exit(await runMutants({ here, file: 'record.js', test: '../record.test.mjs', mutants: MUTANTS }));
