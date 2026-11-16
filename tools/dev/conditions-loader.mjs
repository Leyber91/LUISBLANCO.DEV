/* Used by conditions.mjs only. When a mutants test file imports its runner (any module named mutants.mjs), it
   gets a stub instead: runMutants records the module and the entries in the file CONDITIONS_DUMP names and
   returns 0, so nothing is copied, broken or run. */

const STUB = `
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function runMutants({ here, file, mutants }) {
  appendFileSync(process.env.CONDITIONS_DUMP, JSON.stringify({ module: resolve(here, '..', file), mutants }) + '\\n');
  return 0;
}
`;

export async function resolve(specifier, context, next) {
  if (/(^|\/)mutants\.mjs$/.test(specifier) && context.parentURL && /\.mutants\d*\.test\.mjs$/.test(context.parentURL)) {
    return { url: `data:text/javascript,${encodeURIComponent(STUB)}`, shortCircuit: true };
  }
  return next(specifier, context);
}
