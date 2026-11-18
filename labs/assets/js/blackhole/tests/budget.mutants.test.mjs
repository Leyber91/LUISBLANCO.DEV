/* ============================================================
   The test of the step budget's checks (kerr.js stepBudget,
   ledger row 12, review_s5b). Run from the repository root:
     node labs/assets/js/blackhole/tests/budget.mutants.test.mjs

   Each entry breaks one part of the rule that gives every trace
   pass 4 times its base budget, bounded by the shader's loop.
   The broken kerr.js is written to a copy of this lab in the
   system's temp folder and verify.mjs is run on the copy (3d
   measures the frame at the closest cameras against a fine
   trace). The first entry is the budget main had before.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['the tier\'s base budget alone, as before', `export const STEP_BUDGET = 4;`, `export const STEP_BUDGET = 1;`],
  ['half the budget', `export const STEP_BUDGET = 4;`, `export const STEP_BUDGET = 2;`],
  ['a loop bound under the largest pass', `export const STEP_LOOP_MAX = 2880;`, `export const STEP_LOOP_MAX = 2400;`],
  ['the rule ignores its factor', `export const stepBudget = (base) => base * STEP_BUDGET;`, `export const stepBudget = (base) => base;`],
];

process.exit(await runMutants({ here, file: 'kerr.js', test: '../verify.mjs', mutants: MUTANTS }));
