/* ============================================================
   The runner the mutants tests of this lab share
   (query.mutants.test.mjs, find.mutants.test.mjs).

   A mutant is one exact replacement in one module that breaks
   one rule: a bound moved to either side, a branch removed, a
   word taken out of a list. The module is copied with its lab
   to the system's temp folder, broken there, and the module's
   test file is run on the copy. Every mutant must make at least
   one check print FAIL. A rule that can be broken with the
   tests still passing is not tested.

   Reported as a failure of the mutants test itself:
   - a mutant the tests still pass on (the rule is untested);
   - a mutant whose text is not in the module exactly once (the
     list went stale: rewrite the entry against the current rule);
   - a mutant that changes nothing;
   - the unbroken copy failing its own tests.

   The copies run a few at a time, each worker in its own folder.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { dirname, join, basename } from 'node:path';

const RUN_LIMIT_MS = 60000;

/* Run one test file; resolves {code, fails}: the exit code and the number of lines that start with FAIL. */
function runTest(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, RUN_LIMIT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, fails: 0, timedOut }); });
    // 'close', not 'exit': at 'exit' the child's output may not all be read yet. On 2026-11-16 the gates reported
    // "first found: switched off: exit 1 with no failing check" in query.mutants2 (run of pull request 45): the
    // tests had failed, and the FAIL lines arrived after the count was taken.
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, fails: out.split('\n').filter((l) => l.startsWith('FAIL')).length, timedOut }); });
  });
}

/* here: this tests folder. file: the module to break, in the lab folder. test: the test file to run, in this
   folder. mutants: [name, the text in the module, what it becomes]. also: sibling folders of the lab that the
   module imports from. data: files under labs/assets that the test reads. Resolves the exit code. */
export async function runMutants({ here, file, test, mutants, also = [], data = [] }) {
  const lab = join(here, '..'), js = join(lab, '..'), assets = join(js, '..');
  const root = mkdtempSync(join(os.tmpdir(), `${basename(lab)}-mutants-`));
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const place = (n) => {
    const base = join(root, `w${n}`, 'labs', 'assets');
    cpSync(lab, join(base, 'js', basename(lab)), { recursive: true });
    for (const d of also) cpSync(join(js, d), join(base, 'js', d), { recursive: true });
    for (const f of data) { mkdirSync(dirname(join(base, f)), { recursive: true }); cpSync(join(assets, f), join(base, f)); }
    return { module: join(base, 'js', basename(lab), file), test: join(base, 'js', basename(lab), 'tests', test) };
  };
  try {
    const original = readFileSync(join(lab, file), 'utf8').replace(/\r\n/g, '\n');
    const first = place(0);
    writeFileSync(first.module, original);
    const clean = await runTest(first.test);
    yes(`unbroken, ${test} passes on the copy`, clean.code === 0 && clean.fails === 0, `exit ${clean.code}, ${clean.fails} failing`);
    if (clean.code !== 0) return 1;

    // which entries can run: the text to break is in the module exactly once, and the entry changes it
    const jobs = [], lines = new Array(mutants.length);
    mutants.forEach(([name, from, to], k) => {
      const i = from ? original.indexOf(from) : -1;
      if (i < 0 || original.indexOf(from, i + 1) >= 0) lines[k] = [`${name}: the text to break is in ${file} exactly once`, false, 'this entry is stale; rewrite it against the current rule'];
      else if (from === to) lines[k] = [`${name}: the entry changes the text`, false, 'from and to are the same'];
      else jobs.push({ k, name, text: original.slice(0, i) + to + original.slice(i + from.length) });
    });
    const names = mutants.map((m) => m[0]);
    yes('no two entries share a name', new Set(names).size === names.length, names.filter((x, i) => names.indexOf(x) !== i).join(', '));

    const width = Math.max(1, Math.min(4, (os.availableParallelism ? os.availableParallelism() : 2) - 1, jobs.length));
    let next = 0;
    await Promise.all(Array.from({ length: width }, async (_, n) => {
      const at = n === 0 ? first : place(n);
      for (;;) {
        const job = jobs[next++];
        if (!job) break;
        writeFileSync(at.module, job.text);
        const r = await runTest(at.test);
        lines[job.k] = [`broken: ${job.name}`, r.fails > 0 && r.code !== 0, r.timedOut ? 'the tests ran past the limit' : r.fails > 0 ? `${r.fails} checks fail` : `exit ${r.code} with no failing check`];
      }
    }));
    for (const l of lines) yes(...l);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}
