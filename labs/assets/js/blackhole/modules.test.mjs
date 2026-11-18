/* ============================================================
   blackhole/modules.test.mjs — every module of the lab parses as a
   module. Run:  node labs/assets/js/blackhole/modules.test.mjs

   On 2026-11-18 ui.js declared `const clock` twice in one function.
   No node test imports ui.js, and `node --check` on a .js file that
   uses import exits 0 on a duplicate declaration, so the page shipped
   to a test browser that refused the module and drew nothing. An
   import parses the file as the browser does. A module that reads a
   browser global as it loads (main.js reads location) throws a
   ReferenceError here, which is expected; a SyntaxError is a defect.
   ============================================================ */

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.js')).sort();

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

ok('the lab has modules to parse', files.length >= 10, `${files.length} files`);
for (const f of files) {
  let err = null;
  try { await import(pathToFileURL(join(here, f)).href); } catch (e) { err = e; }
  const syntax = !!err && (err instanceof SyntaxError || err.name === 'SyntaxError');
  ok(`${f} parses as a module`, !syntax, err ? `${err.name}: ${String(err.message).slice(0, 100)}` : '');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
