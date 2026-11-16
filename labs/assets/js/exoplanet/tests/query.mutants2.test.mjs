/* ============================================================
   The test of the reader tests, second half. Run from the
   repository root:
     node labs/assets/js/exoplanet/tests/query.mutants2.test.mjs

   The broken rules are in query.mutants.list.mjs, with the
   reason this test exists; mutants.mjs runs them.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';
import { MUTANTS } from './query.mutants.list.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cut = Math.ceil(MUTANTS.length / 2);
process.exit(await runMutants({ here, file: 'query.js', test: 'query.test.mjs', mutants: MUTANTS.slice(cut), also: ['ai'] }));
