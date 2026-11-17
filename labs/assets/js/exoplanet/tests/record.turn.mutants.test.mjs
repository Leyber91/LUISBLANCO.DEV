/* ============================================================
   The test of rule 10's tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/record.turn.mutants.test.mjs

   Each entry breaks one part of the time a read or write of the
   record is given (record.js inTurn), and record.turn.test.mjs
   is run on the broken copy (kit/tests/mutants.mjs). The rest of
   record.js is broken by record.mutants.test.mjs; count the two
   lists together with
     node tools/dev/conditions.mjs labs/assets/js/exoplanet/record.js labs/assets/js/exoplanet/tests/record.mutants.test.mjs labs/assets/js/exoplanet/tests/record.turn.mutants.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['rule 10: no time limit', `if (spent >= limit) { clearInterval(tick); reject(new Error(STUCK)); }`, ``],
  ['rule 10: a limit a hundred times longer', `if (spent >= limit)`, `if (spent >= limit * 100)`],
  ['rule 10: time the page holds its thread charged to the store', `spent += Math.min(now - last, 2 * TICK_MS);`, `spent += now - last;`],
  ['rule 10: a held thread charged up to twenty ticks', `spent += Math.min(now - last, 2 * TICK_MS);`, `spent += Math.min(now - last, 20 * TICK_MS);`],
  ['rule 10: ticks of 2.5 s', `export const TICK_MS = 250;`, `export const TICK_MS = 2500;`],
  ['rule 10: a job past its time fails with no reason', `reject(new Error(STUCK))`, `reject(new Error(''))`],
  ['rule 10: the time a read is given ignored', `{ return inTurn(() => readNow(os, storage), limit); }`, `{ return inTurn(() => readNow(os, storage), TURN_MS); }`],
  ['rule 10: the time a write is given ignored', `  }, limit);\n}`, `  }, TURN_MS);\n}`],
  ['rule 10: 4 seconds a job', `export const TURN_MS = 5000;`, `export const TURN_MS = 4000;`],
  ['rule 10: the reason a job failed changed', `did not answer within \${TURN_MS / 1000} seconds`, `timed out`],
];

process.exit(await runMutants({ here, file: 'record.js', test: 'record.turn.test.mjs', mutants: MUTANTS, also: ['kit'] }));
