/* ============================================================
   The runner every lab's mutants tests share (moved here from
   exoplanet/tests on 2026-11-16, when the kit's own lists began
   to use it). A caller passes its own tests folder as `here`; the
   folder above it is the lab that is copied and broken.

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

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { dirname, join, basename } from 'node:path';

const RUN_LIMIT_MS = 60000;

/* Run one test file; resolves {code, fails, timedOut, err}: the exit code, the number of lines that start with FAIL,
   whether it ran past the limit, and the last line it wrote to stderr. The copy writes its stdout and stderr to files,
   not pipes. Node writes to a pipe asynchronously on POSIX ("Pipes (and sockets): synchronous on Windows, asynchronous
   on POSIX", nodejs.org/api/process.html, "A note on process I/O"), and a test that ends with process.exit(1) can
   leave its last lines unwritten: on 2026-11-17 the gates on Linux reported "exit 1 with no failing check" for two
   mutants of query.mutants2 on main (run 44133832161) and two others on pull request 54, a different pair each time,
   never on Windows. A file is written synchronously on both. Tests: kit/tests/mutants.test.mjs. */
export function runTest(file) {
  const dir = mkdtempSync(join(os.tmpdir(), 'mutant-run-'));
  const outPath = join(dir, 'out.txt'), errPath = join(dir, 'err.txt');
  const out = openSync(outPath, 'w'), err = openSync(errPath, 'w');
  return new Promise((resolve) => {
    let timedOut = false, settled = false, child;
    const done = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const text = readFileSync(outPath, 'utf8'), last = readFileSync(errPath, 'utf8').split('\n').map((l) => l.trim())
        .filter((l) => l && !l.startsWith('at ') && !/^Node\.js v\d/.test(l)).pop() || '';   // the error, not its stack or Node's banner
      rmSync(dir, { recursive: true, force: true });
      resolve({ code, fails: text.split('\n').filter((l) => l.startsWith('FAIL')).length, timedOut, err: last.trim() });
    };
    try { child = spawn(process.execPath, [file], { stdio: ['ignore', out, err] }); } finally { closeSync(out); closeSync(err); }   // the child holds its own copies
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, RUN_LIMIT_MS);
    child.on('error', () => done(-1));
    // 'close' after the child has exited: its files are complete then
    child.on('close', (code) => done(code));
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
        lines[job.k] = [`broken: ${job.name}`, r.fails > 0 && r.code !== 0, r.timedOut ? 'the tests ran past the limit' : r.fails > 0 ? `${r.fails} checks fail` : `exit ${r.code} with no failing check${r.err ? `; its last error: ${r.err.slice(0, 240)}` : ''}`];
      }
    }));
    for (const l of lines) yes(...l);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}
