/* ============================================================
   The test of the finding tests, second list (find.mutants.test.mjs
   is near the gates' 120 s a file). Run from the repository root:
     node labs/assets/js/exoplanet/tests/find.mutants2.test.mjs

   The rules of ticket 2.14 in find.js's line of results: a world
   passed over for its own heat says so, and not that it has no
   temperature, since its sheet prints the one its starlight
   gives. Each broken rule must fail a check of find.test.mjs on a
   copy of the lab (kit/tests/mutants.mjs).
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['a world passed over for its own heat said to have no temperature', `: p.method === 'Imaging' || isNum(p.Teq) ? 'seen by its own heat' :`, `:`],
  ['an imaged world with no published temperature said to have none', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `isNum(p.Teq) ? 'seen by`],
  ['a published temperature passed over said to have none', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Imaging' ? 'seen by`],
  ['own heat said without its words', `'seen by its own heat'`, `''`],
  ['own heat said of a world found by transit instead', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Transit' || isNum(p.Teq) ? 'seen by`],
  ['own heat said only of an imaged world with a published temperature', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Imaging' && isNum(p.Teq) ? 'seen by`],
];

process.exit(await runMutants({ here, file: 'find.js', test: 'find.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
