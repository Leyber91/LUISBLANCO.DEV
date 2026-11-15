/* ============================================================
   The test of the system view's rules. Run from the repository
   root:
     node labs/assets/js/exoplanet/tests/system.mutants.test.mjs

   Each entry breaks one rule of views/system.js that is a rule
   and not a drawing: how far the view reaches with the Solar
   System shown, and the sentence that says where a system falls
   among the Sun's planets. The broken file is written to a copy
   of this lab in the system's temp folder and orbit.test.mjs is
   run on the copy (mutants.mjs). Every broken rule must fail a
   check there. What the view draws is proved in a browser by
   tools/drives/orbit.mjs.

   Add an entry here with every new rule of that kind.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REACH = `export const viewExtent = (extent, solar) => (solar ? Math.max(extent, SOLAR_REACH) : extent);`;
const WHERE = 'const where = same ? `about as wide as the orbit of ${au(same)}` : !out ? `beyond the orbit of ${au(inn)}` : !inn ? `inside the orbit of ${au(out)}` : `between the orbits of ${au(inn)} and ${au(out)}`;';
const SENTENCE = 'return `[REAL] On the scale of the Solar System, the outermost known orbit of ${host} reaches ${fmt(outer, 2)} AU, ${where}.`;';

const MUTANTS = [
  /* ---- how far the view reaches ---- */
  ['Neptune\'s orbit on the very edge of the view', `Math.max(...SOLAR.map((s) => s.a)) * 1.08;`, `Math.max(...SOLAR.map((s) => s.a));`],
  ['the view reaching a fifth past Neptune', `Math.max(...SOLAR.map((s) => s.a)) * 1.08;`, `Math.max(...SOLAR.map((s) => s.a)) * 1.2;`],
  ['the view reaching 7 percent past Neptune', `Math.max(...SOLAR.map((s) => s.a)) * 1.08;`, `Math.max(...SOLAR.map((s) => s.a)) * 1.07;`],
  ['the view reaching to Mercury\'s orbit only', `Math.max(...SOLAR.map((s) => s.a)) * 1.08;`, `Math.min(...SOLAR.map((s) => s.a)) * 1.08;`],
  ['a system wider than Neptune\'s orbit cut to it', REACH, `export const viewExtent = (extent, solar) => (solar ? SOLAR_REACH : extent);`],
  ['the view drawn back whether or not the Solar System is shown', REACH, `export const viewExtent = (extent, solar) => Math.max(extent, SOLAR_REACH);`],
  ['the view never drawn back', REACH, `export const viewExtent = (extent, solar) => extent;`],
  ['the view drawn back only when the Solar System is not shown', REACH, `export const viewExtent = (extent, solar) => (solar ? extent : Math.max(extent, SOLAR_REACH));`],

  /* ---- where a system falls among the Sun's planets ---- */
  ['a system beyond Neptune said to be beyond Mercury', `inn = i < 0 ? SOLAR[SOLAR.length - 1] :`, `inn = i < 0 ? SOLAR[0] :`],
  ['the inner neighbour taken as the outer one', `: i > 0 ? SOLAR[i - 1] : null;`, `: i > 0 ? SOLAR[i] : null;`],
  ['a system inside Mercury\'s orbit given Mercury as its inner neighbour too', `: i > 0 ? SOLAR[i - 1] : null;`, `: i >= 0 ? SOLAR[Math.max(0, i - 1)] : null;`],
  ['the first planet farther in taken for the first farther out', `SOLAR.findIndex((s) => s.a > outer)`, `SOLAR.findIndex((s) => s.a < outer)`],
  ['two sizes compared as they are, not as they print', `const printed = (x) => Number(fmt(x, 2).replace(/,/g, ''));`, `const printed = (x) => x;`],
  ['two sizes compared at three figures', `const printed = (x) => Number(fmt(x, 2).replace(/,/g, ''));`, `const printed = (x) => Number(fmt(x, 3).replace(/,/g, ''));`],
  ['an orbit that prints like a planet\'s still called between', WHERE, WHERE.replace('same ? `about as wide as the orbit of ${au(same)}` : ', '')],
  ['the words for a planet\'s own size changed', WHERE, WHERE.replace('about as wide as the orbit of', 'the size of the orbit of')],
  ['the words for beyond changed', WHERE, WHERE.replace('`beyond the orbit of ${au(inn)}`', '`outside the orbit of ${au(inn)}`')],
  ['the words for inside changed', WHERE, WHERE.replace('`inside the orbit of ${au(out)}`', '`within the orbit of ${au(out)}`')],
  ['the words for between changed', WHERE, WHERE.replace('between the orbits of', 'between')],
  ['between names its two planets the wrong way round', WHERE, WHERE.replace('${au(inn)} and ${au(out)}`;', '${au(out)} and ${au(inn)}`;')],
  ['a neighbour named without its size', 'const au = (s) => `${s.name} (${fmt(s.a, 2)} AU)`;', 'const au = (s) => `${s.name}`;'],
  ['a neighbour\'s size at three figures', 'const au = (s) => `${s.name} (${fmt(s.a, 2)} AU)`;', 'const au = (s) => `${s.name} (${fmt(s.a, 3)} AU)`;'],
  ['a neighbour\'s size without its unit', 'const au = (s) => `${s.name} (${fmt(s.a, 2)} AU)`;', 'const au = (s) => `${s.name} (${fmt(s.a, 2)})`;'],
  ['the sentence without its tag', SENTENCE, SENTENCE.replace('`[REAL] On the scale', '`On the scale')],
  ['the sentence without the host', SENTENCE, SENTENCE.replace('the outermost known orbit of ${host} reaches', 'the outermost known orbit reaches')],
  ['the system\'s size at three figures', SENTENCE, SENTENCE.replace('${fmt(outer, 2)} AU', '${fmt(outer, 3)} AU')],
  ['the system\'s size without its unit', SENTENCE, SENTENCE.replace('${fmt(outer, 2)} AU,', '${fmt(outer, 2)},')],
  ['the sentence without its end', SENTENCE, SENTENCE.replace('${where}.`;', '${where}`;')],
];

process.exit(await runMutants({ here, file: 'views/system.js', test: 'orbit.test.mjs', mutants: MUTANTS }));
