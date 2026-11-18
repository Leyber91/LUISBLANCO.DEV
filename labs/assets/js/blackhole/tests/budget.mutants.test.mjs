/* ============================================================
   The test of the step budget's tests (kerr.js stepBudget, ledger
   row 12, review_s5 2). Run from the repository root:
     node labs/assets/js/blackhole/tests/budget.mutants.test.mjs

   Each entry breaks one part of the rule that gives a ray more
   steps when the camera is near the horizon: its cap, its
   coefficient, its floor of one budget, and the shader's loop
   bound it never asks past. The broken kerr.js is written to a
   copy of this lab in the system's temp folder and state.test.mjs
   is run on the copy. verify.mjs 3d measures what the rule does
   to the frame; this list checks that the rule is the one
   measured.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const RULE = `  return Math.min(STEP_LOOP_MAX, Math.round(maxSteps * Math.min(STEP_BUDGET_MAX, Math.max(1, 1.5 / Math.max(rcam / rh - 1, 1e-6)))));`;

const MUTANTS = [
  ['three times the budget at most', `export const STEP_BUDGET_MAX = 4;`, `export const STEP_BUDGET_MAX = 3;`],
  ['a loop bound over the measured one', `export const STEP_LOOP_MAX = 2400;`, `export const STEP_LOOP_MAX = 3000;`],
  ['no loop bound', RULE, RULE.replace('Math.min(STEP_LOOP_MAX, ', '(')],
  ['a smaller coefficient', RULE, RULE.replace('1.5 / ', '1.2 / ')],
  ['under one budget far out', RULE, RULE.replace('Math.max(1, ', 'Math.max(0.5, ')],
  ['the closeness read from r, not r - r+', RULE, RULE.replace('rcam / rh - 1', 'rcam / rh')],
];

process.exit(await runMutants({ here, file: 'kerr.js', test: '../state.test.mjs', mutants: MUTANTS }));
