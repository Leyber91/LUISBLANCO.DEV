/* Used by conditions.mjs only. When a mutants test file imports its runner (a module named mutants.mjs), it gets
   a stub instead: everything the real runner exports, with runMutants replaced by one that records the module and
   the entries in the file CONDITIONS_DUMP names and returns 0. Nothing is copied, broken or run. */

const stub = (real) => `
export * from ${JSON.stringify(real)};
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
export async function runMutants({ here, file, mutants }) {
  appendFileSync(process.env.CONDITIONS_DUMP, JSON.stringify({ module: resolve(here, '..', file), mutants }) + '\\n');
  return 0;
}
`;

export async function resolve(specifier, context, next) {
  if (/(^|\/)mutants\.mjs$/.test(specifier) && context.parentURL && /\.mutants\d*\.test\.mjs$/.test(context.parentURL)) {
    const real = await next(specifier, context);
    return { url: `data:text/javascript,${encodeURIComponent(stub(real.url))}`, shortCircuit: true };
  }
  return next(specifier, context);
}
