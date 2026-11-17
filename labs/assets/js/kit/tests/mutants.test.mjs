/* ============================================================
   The mutants runner's reading of a copy's output. Run from the
   repository root:
     node labs/assets/js/kit/tests/mutants.test.mjs

   A mutant counts as caught only when its copy's tests print a
   line that starts with FAIL and exit non-zero (mutants.mjs). So
   the runner must read every line a copy prints, including the
   lines a test prints just before process.exit(1). On 2026-11-17
   the gates, on Linux, reported "exit 1 with no failing check"
   for two mutants of query.mutants2 on main (run 44133832161) and
   for two others on pull request 54, a different pair each time,
   never on Windows. Node writes to a pipe asynchronously on POSIX
   and synchronously on Windows (nodejs.org/api/process.html, "A
   note on process I/O"), and process.exit drops what is pending.
   ============================================================ */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { runTest } from './mutants.mjs';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const dir = mkdtempSync(join(os.tmpdir(), 'mutants-runner-test-'));
const script = (name, body) => { const f = join(dir, name); writeFileSync(f, body); return f; };

try {
  // a copy that prints many failing lines and leaves at once, as a test does when its checks fail
  const N = 50000;
  const loud = script('loud.mjs', `for (let i = 0; i < ${N}; i++) console.log('FAIL  line ' + i + ' ' + 'x'.repeat(60));\nprocess.exit(1);\n`);
  const r = await runTest(loud);
  yes(`every failing line a copy prints before process.exit(1) is read (${N} lines of about 80 characters)`, r.code === 1 && r.fails === N, `exit ${r.code}, ${r.fails} read`);

  // a copy that prints nothing and exits 0
  const quiet = await runTest(script('quiet.mjs', 'process.exit(0);\n'));
  yes('a copy that prints nothing and exits 0 has no failing line', quiet.code === 0 && quiet.fails === 0, `exit ${quiet.code}, ${quiet.fails}`);

  // a copy that crashes before printing anything: no failing line, and the runner can say why
  const crash = await runTest(script('crash.mjs', "throw new Error('the copy could not start');\n"));
  yes('a copy that crashes has no failing line and a non-zero exit', crash.code !== 0 && crash.fails === 0, `exit ${crash.code}, ${crash.fails}`);
  yes('and the runner keeps the last line it wrote to stderr', /the copy could not start/.test(crash.err || ''), JSON.stringify(crash.err));

  // a line that only contains FAIL is not counted; one that starts with it is
  const mixed = await runTest(script('mixed.mjs', "console.log('pass  no FAIL here');\nconsole.log('FAIL  one');\nconsole.log('  FAIL indented');\nprocess.exitCode = 1;\n"));
  yes('only lines that start with FAIL are counted', mixed.code === 1 && mixed.fails === 1, `exit ${mixed.code}, ${mixed.fails}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
