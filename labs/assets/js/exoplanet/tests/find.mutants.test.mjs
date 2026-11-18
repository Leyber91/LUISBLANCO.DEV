/* ============================================================
   The test of the finding tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/find.mutants.test.mjs

   Each entry breaks one rule of find.js: the bound of cold or
   hot moved to either side, the imaging exception removed, a
   kind found for a world that is not drawn, the order of a
   list turned round, a unit dropped from a line of results.
   The broken file is written to a copy of this lab in the
   system's temp folder and find.test.mjs is run on the copy
   (mutants.mjs). Every broken rule must fail a check there.

   Add an entry here with every new rule in find.js. The rules of
   the line of results are in find.mutants2.test.mjs, so each list
   stays well under the gates' 120 s a file.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const EARTH = '⊕';   // the Earth sign after R and S

const MUTANTS = [
  /* ---- cold and hot ---- */
  ['cold from 200 K up to 201 K', `export const COLD_K = 200,`, `export const COLD_K = 201,`],
  ['cold from 200 K down to 199 K', `export const COLD_K = 200,`, `export const COLD_K = 199,`],
  ['hot from 1,000 K down to 999 K', `HOT_K = 1000;`, `HOT_K = 999;`],
  ['hot from 1,000 K up to 1,001 K', `HOT_K = 1000;`, `HOT_K = 1001;`],
  ['200 K itself counted as cold', `return !!t && t.T < COLD_K;`, `return !!t && t.T <= COLD_K;`],
  ['1,000 K itself not counted as hot', `return !!t && t.T >= HOT_K;`, `return !!t && t.T > HOT_K;`],
  // the rule of a planet's own heat is starlight.js ownHeat, with its entries in starlight.mutants.test.mjs
  ['a planet seen by its own heat given the temperature the archive lists', `  if (ownHeat(p)) return null;\n`, ``],
  ['every planet given no temperature', `if (ownHeat(p)) return null;`, `return null;`],
  ['a value that is not a number counted as one', `const isNum = (v) => typeof v === 'number' && isFinite(v);`, `const isNum = (v) => typeof v === 'number';`],

  /* ---- the temperature a world is found by ---- */
  ['a published temperature ignored', `  if (isNum(p.Teq)) return { T: p.Teq, published: true };\n`, ``],
  ['a published temperature marked as computed', `return { T: p.Teq, published: true };`, `return { T: p.Teq, published: false };`],
  ['a computed temperature marked as published', `{ T: t, published: false } : null;`, `{ T: t, published: true } : null;`],
  ['the temperature computed with no albedo', `equilibriumTemp(p, 0.3)`, `equilibriumTemp(p, 0)`],
  ['the temperature computed at albedo 0.5', `equilibriumTemp(p, 0.3)`, `equilibriumTemp(p, 0.5)`],
  ['a world with no temperature given an empty one', `return isNum(t) ? { T: t, published: false } : null;`, `return { T: t, published: false };`],

  /* ---- the kind, and one face to the star ---- */
  ['a kind for a world with no radius', `drawn: c.physics.radiusKnown };`, `drawn: true };`],
  ['a kind only for a measured radius', `drawn: c.physics.radiusKnown };`, `drawn: !!p.measuredR };`],
  ['a kind found whether or not it is drawn', `return k.drawn && looks.includes(k.look);`, `return looks.includes(k.look);`],
  ['any kind found for a drawn world', `return k.drawn && looks.includes(k.look);`, `return k.drawn;`],
  ['the first kind asked for is the only one read', `return k.drawn && looks.includes(k.look);`, `return k.drawn && looks[0] === k.look;`],
  ['locked only for a drawn world', `export const isLocked = (p) => kindOf(p).locked;`, `export const isLocked = (p) => kindOf(p).drawn && kindOf(p).locked;`],
  ['every world locked', `export const isLocked = (p) => kindOf(p).locked;`, `export const isLocked = (p) => true;`],
  ['the kind named by its key', `label: c.label, drawn:`, `label: c.look, drawn:`],

  /* ---- the order of a list ---- */
  ['a list ordered by the published temperature only', `: key === 'T' ? (tempOf(p) || {}).T : p[key]);`, `: key === 'T' ? p.Teq : p[key]);`],
  ['the starlight ordered by the archive\'s field', `key === 'S' ? insolation(p).S`, `key === 'S' ? p.S`],
  ['likeness ordered by a field the catalogue does not have', `key === 'earthlike' ? earthLikeness(p)`, `key === 'earthlike' ? p.earthlike`],
  ['a question ordered most Earth-like first', `querySort || (hasQuestion ? { key: 'dist', dir: 1 } : { key: 'earthlike', dir: -1 });`, `querySort || { key: 'earthlike', dir: -1 };`],
  ['the chips ordered nearest first', `querySort || (hasQuestion ? { key: 'dist', dir: 1 } : { key: 'earthlike', dir: -1 });`, `querySort || { key: 'dist', dir: 1 };`],
  ['the order a question asked for ignored', `=> querySort || (hasQuestion`, `=> (hasQuestion`],
  ['a question ordered farthest first', `(hasQuestion ? { key: 'dist', dir: 1 }`, `(hasQuestion ? { key: 'dist', dir: -1 }`],
  ['the chips ordered least Earth-like first', `: { key: 'earthlike', dir: -1 });`, `: { key: 'earthlike', dir: 1 });`],
  ['the words for distance turned round', `dist: s.dir > 0 ? 'nearest first' : 'farthest first'`, `dist: s.dir > 0 ? 'farthest first' : 'nearest first'`],
  ['the words for likeness turned round', `earthlike: s.dir < 0 ? 'most Earth-like first' : 'least Earth-like first'`, `earthlike: s.dir < 0 ? 'least Earth-like first' : 'most Earth-like first'`],
  ['the words for temperature turned round', `T: s.dir > 0 ? 'coldest first' : 'hottest first'`, `T: s.dir > 0 ? 'hottest first' : 'coldest first'`],
  ['the words for size turned round', `R: s.dir > 0 ? 'smallest first' : 'largest first'`, `R: s.dir > 0 ? 'largest first' : 'smallest first'`],
  ['the words for the period turned round', `P: s.dir > 0 ? 'shortest year first' : 'longest year first'`, `P: s.dir > 0 ? 'longest year first' : 'shortest year first'`],
  ['the words for the year turned round', `year: s.dir < 0 ? 'most recently found first' : 'earliest found first'`, `year: s.dir < 0 ? 'earliest found first' : 'most recently found first'`],
  ['the year\'s order said as an age', `year: s.dir < 0 ? 'most recently found first' : 'earliest found first'`, `year: s.dir < 0 ? 'newest first' : 'oldest first'`],
  ['every world counted as having a value to order by', `const known = pool.filter((p) => isNum(val(p))).length;`, `const known = pool.length;`],
  ['an order no world has a value for said as applied', `(r.total > 0 && r.known === 0 ? 'in catalogue order, since none of them has a value to order by' : sortWords(r.sort))`, `(sortWords(r.sort))`],
  ['an empty list said to be in catalogue order', `(r.total > 0 && r.known === 0 ?`, `(r.known === 0 ?`],
  ['the words for an order that was not applied changed', `'in catalogue order, since none of them has a value to order by'`, `'in no order'`],
  ['the words for starlight turned round', `S: s.dir > 0 ? 'least starlight first' : 'most starlight first'`, `S: s.dir > 0 ? 'most starlight first' : 'least starlight first'`],
  ['worlds with no value first', `isNum(x) ? -1 : isNum(y) ? 1 : 0`, `isNum(x) ? 1 : isNum(y) ? -1 : 0`],
  ['the direction of an order ignored', `sort.dir * (x - y)`, `(x - y)`],
  ['the direction of an order turned round', `sort.dir * (x - y)`, `sort.dir * (y - x)`],
  ['the limit of a list ignored', `hits: limit ? pool.slice(0, limit) : pool };`, `hits: pool };`],
  ['the total cut to the limit', `total: pool.length,`, `total: (limit ? pool.slice(0, limit) : pool).length,`],
  ['every world passes', `const pool = list.filter(passes);`, `const pool = list.slice();`],

];

process.exit(await runMutants({ here, file: 'find.js', test: 'find.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
