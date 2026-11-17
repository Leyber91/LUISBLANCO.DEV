/* ============================================================
   The page code that hands a pure function's answer to the page,
   read from its source. Run from the repository root:
     node labs/assets/js/exoplanet/tests/wiring.test.mjs

   main.js builds the whole page on import, so no Node test can run
   it. What it must do with starlight.js is one line each, and this
   file holds those lines: a system is kept in the page's orbit
   order (byOrbit), and the method reads the census of the
   starlight. Review of pull request 50, second pass (V6): removing
   main.js's call of byOrbit failed no test. wiring.mutants.test.mjs
   breaks each line.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const main = readFileSync(join(here, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');   // comments are not code

const sets = [...code.matchAll(/\bst\.system\s*=\s*([^;\n]+)/g)].map((m) => m[1].trim());
yes('every place main.js sets the selected system, it takes byOrbit\'s order', sets.length > 0 && sets.every((x) => /^byOrbit\(st\.list\.filter\(\(q\) => q\.host === p\.host\)\)$/.test(x)), sets.join(' | '));
yes('main.js imports byOrbit from starlight.js', /import \{[^}]*\bbyOrbit\b[^}]*\} from '\.\/starlight\.js';/.test(code));
yes('no other sort of a system is left in main.js', !/\.host === p\.host\)\)?\.sort\(/.test(code));
const census = [...code.matchAll(/census: ([^,}]+)/g)].map((m) => m[1].trim());
yes('the method reads the starlight\'s census wherever its data are made', census.length === 2 && census.every((x) => x === 'starlightCensus(st.list)'), census.join(' | '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
