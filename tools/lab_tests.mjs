#!/usr/bin/env node
/* ============================================================
   tools/lab_tests.mjs: run every lab's own tests.

   What runs. Under labs/assets/js/<lab>/, a file named tests.mjs,
   test.mjs, verify.mjs, selftest.mjs, self-test.mjs or check.mjs,
   any <name>.test.mjs, and run.mjs inside a test folder (tests,
   test or __tests__, in any letter case). Each runs in Node from
   its own folder; a non-zero exit, an uncaught error or a run over
   120 s fails the gate. Labs without tests are listed, not failed.

   What fails without running. A gate that passes because nothing ran
   is a defect, and on 2026-11-13 a lab's check sat under a name this
   runner did not know. So a Node file (.mjs or .cjs) fails the gate:
   - when its name reads as a test and it is not one of the files
     above: the words test, spec, verify, selftest, check, gate or
     audit standing alone between dashes, dots, underscores or a
     capital (check-data, verifyRates, APITest, unit-tests, test2);
   - when it sits anywhere under a test folder in which nothing runs.
   Files under a test folder that has a runner are that runner's
   helpers and are left alone, whatever their names.
   A file that is truly not a test says so on one comment line among
   its first twelve:
       // lab_tests: not a test (why, in 20 or more characters)
   and is listed with its reason instead.

     node tools/lab_tests.mjs [<lab>] [--root <folder>]
     node tools/lab_tests.mjs selftest
   ============================================================ */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const LIMIT_MS = 120000;

/* The file names labs use for a self-contained Node check. */
const TEST_NAMES = new Set(['tests.mjs', 'test.mjs', 'verify.mjs', 'selftest.mjs', 'self-test.mjs', 'check.mjs']);
const isTestFolder = (name) => /^(tests?|__tests__)$/i.test(name);
/* A name that reads as a test: the word stands alone, with digits allowed after it. */
const LOOKS_LIKE_A_TEST = /(^|[-_.])(tests?|specs?|verify|selftest|self-test|checks?|gates?|audits?)\d*([-_.]|$)/i;
const DECLARED = /^\s*(?:\/\/|\/\*+|\*)\s*lab_tests: not a test \((.+)\)\s*(?:\*\/)?\s*$/;
const isNode = (p) => p.endsWith('.mjs') || p.endsWith('.cjs');
/* verifyRates reads as verify-Rates, runTests as run-Tests, APITest as API-Test */
const words = (p) => path.basename(p).replace(/\.[cm]js$/, '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const isTest = (p) => { const name = path.basename(p); return TEST_NAMES.has(name) || name.endsWith('.test.mjs') || (name === 'run.mjs' && isTestFolder(path.basename(path.dirname(p)))); };
export const findTests = (dir) => walk(dir).filter(isTest);
// the reason a file gives, on one comment line among its first twelve, for not being a test; null when it gives none
function declared(p) {
  let head;
  try { head = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(0, 12); } catch { return null; }
  for (const line of head) { const m = DECLARED.exec(line); const why = m && m[1].trim(); if (why && why.length >= 20) return why; }
  return null;
}
// the outermost test folder a file sits under, inside dir; null when it sits under none
function testFolderOf(p, dir) {
  const parts = path.relative(dir, path.dirname(p)).split(path.sep);
  const i = parts.findIndex(isTestFolder);
  return i < 0 ? null : path.join(dir, ...parts.slice(0, i + 1));
}

// Node files the runner does not run and should have: named like a test, or under a test folder where nothing runs.
// Returns {missed: [{file, why}], excused: [{file, why}]}.
export function findMissed(dir) {
  const all = walk(dir), missed = [], excused = [];
  const runnerUnder = new Map();   // test folder -> does anything under it run
  for (const p of all) {
    if (!isNode(p) || isTest(p)) continue;
    const folder = testFolderOf(p, dir);
    let why = null;
    if (folder) {
      if (!runnerUnder.has(folder)) runnerUnder.set(folder, all.some((x) => x.startsWith(folder + path.sep) && isTest(x)));
      if (!runnerUnder.get(folder)) why = 'sits in a test folder where nothing runs';
    } else if (LOOKS_LIKE_A_TEST.test(words(p))) why = 'named like a test and not run';
    if (!why) continue;
    const reason = declared(p);
    if (reason) excused.push({ file: p, why: reason }); else missed.push({ file: p, why });
  }
  return { missed, excused };
}

// Run the tests under <root>/labs/assets/js and return the exit code: 0 passed, 1 a failure, 2 an unknown lab.
export function run(only, root = ROOT, say = console.log, limit = LIMIT_MS) {
  const JS = path.join(root, 'labs', 'assets', 'js');
  if (!fs.existsSync(JS)) { say(`lab_tests: ${JS} does not exist, so nothing was run`); return 1; }
  const labs = fs.readdirSync(JS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  if (only && !labs.includes(only)) { say(`lab_tests: no folder labs/assets/js/${only}`); return 2; }
  const inLab = (f) => !only || path.relative(JS, f).split(path.sep)[0] === only;
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const files = findTests(JS).filter(inLab);
  const { missed, excused } = findMissed(JS);
  let fail = 0;
  for (const f of files) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [f], { cwd: path.dirname(f), encoding: 'utf8', timeout: limit, maxBuffer: 64 * 1024 * 1024 });
    const ms = Date.now() - t0;
    const ok = r.status === 0 && !r.error;
    if (!ok) fail++;
    const last = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-1)[0] || '';
    say(`${ok ? 'pass' : 'FAIL'} ${rel(f)} (${ms} ms) ${last.slice(0, 120)}`);
    if (!ok) say(((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')).trim().split(/\r?\n/).slice(-20).join('\n'));
  }
  for (const m of missed.filter((x) => inLab(x.file))) {
    fail++;
    say(`FAIL ${rel(m.file)}: ${m.why}; name it tests.mjs, <name>.test.mjs or tests/run.mjs, or declare on a comment line at its top why it is not a test`);
  }
  for (const e of excused.filter((x) => inLab(x.file))) say(`not a test, as declared: ${rel(e.file)} (${e.why})`);
  if (!only) {
    const tested = new Set(files.map((f) => path.relative(JS, f).split(path.sep)[0]));
    // os is Labs OS, compiled from labs-src/os; its tests run there (vitest), in the gates' labs-src step.
    const untested = labs.filter((d) => !tested.has(d) && !['ai', 'config', 'hub', 'os'].includes(d));
    say(`lab_tests: ${files.length} files, ${fail} failed; no tests yet: ${untested.join(', ') || 'none'}`);
  } else say(`lab_tests ${only}: ${files.length} files, ${fail} failed`);
  return fail ? 1 : 0;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-tests-'));
  const tree = (name, files) => { const root = path.join(tmp, name); fs.mkdirSync(path.join(root, 'labs', 'assets', 'js'), { recursive: true }); for (const [f, body] of Object.entries(files)) { const p = path.join(root, 'labs', 'assets', 'js', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return root; };
  const rel = (dir, list) => list.map((p) => path.relative(dir, p).split(path.sep).join('/')).sort();
  const PASS = 'process.exit(0);\n', FAILS = 'process.exit(1);\n';
  const WHY = '(it calls the network, so it cannot run in the gates)';
  const RUN = ['a/tests.mjs', 'a/test.mjs', 'a/verify.mjs', 'a/selftest.mjs', 'a/self-test.mjs', 'a/check.mjs', 'b/planner.test.mjs', 'c/tests/run.mjs', 'c2/test/run.mjs', 'c3/Tests/run.mjs', 'c4/__tests__/run.mjs'];
  const NAMED = ['d/checks/check-data.mjs', 'd/data_spec.mjs', 'd/verify-rates.mjs', 'd/unit-tests.mjs', 'd/foo-test.mjs', 'd/lab-selftest.mjs', 'd/lab-self-test.mjs', 'd/Check-Data.mjs',
    'd/test_engine.mjs', 'd/data.check.mjs', 'd/a_check_b.mjs', 'd/verifyRates.mjs', 'd/checkData.mjs', 'd/runTests.mjs', 'd/test2.mjs', 'd/check-data.cjs', 'd/checks/gate.mjs', 'd/audit-citations.mjs',
    'd/APITest.mjs', 'd/URLCheck.mjs', 'd/parseJSONTest.mjs'];
  const FOLDER = ['g/tests/index.mjs', 'g/tests/helper.mjs', 'g/tests/unit/cases.mjs', 'g2/TEST/cases.mjs', 'g3/__tests__/deep/more/x.cjs'];
  const QUIET = ['a/engine.mjs', 'c/tests/cases.mjs', 'c/tests/check-engine.mjs', 'c/tests/unit/verify-more.mjs', 'c/run.mjs', 'e/news2-check.js', 'e/checkout.mjs', 'e/latest.mjs', 'e/spectrum.mjs', 'e/investigate.mjs', 'e/auditorium.mjs', 'e/attest.mjs', 'e/APIClient.mjs'];
  const DECL = {
    'h/audit-links.mjs': `// lab_tests: not a test ${WHY}\n`,                                                   // excused
    'h/audit-block.mjs': `/* lab_tests: not a test ${WHY} */\n`,                                                // excused
    'h/audit-paren.mjs': '// lab_tests: not a test (it needs a key (the owner\'s) that the gates do not hold)\n', // excused: a bracket inside the reason
    'h/audit-short.mjs': '// lab_tests: not a test (too short)\n',                                              // reported
    'h/audit-padded.mjs': '// lab_tests: not a test (too short            )\n',                                 // reported: padding is not a reason
    'h/audit-late.mjs': '\n'.repeat(14) + `// lab_tests: not a test ${WHY}\n`,                                   // reported: not among the first lines
    'h/audit-code.mjs': `const note = 'lab_tests: not a test ${WHY}';\n`,                                        // reported: a string in code is not a declaration
  };
  let tests, missed, excused, why, code = {}, out = {};
  try {
    const disc = tree('discovery', { ...Object.fromEntries([...RUN, ...NAMED, ...FOLDER, ...QUIET].map((f) => [f, ''])), ...DECL });
    const js = path.join(disc, 'labs', 'assets', 'js');
    tests = rel(js, findTests(js));
    const m = findMissed(js);
    missed = rel(js, m.missed.map((x) => x.file)); excused = rel(js, m.excused.map((x) => x.file));
    why = Object.fromEntries(m.missed.map((x) => [path.relative(js, x.file).split(path.sep).join('/'), x.why]));
    // the command itself, as the gates run it, on small trees
    const go = (name, files, ...args) => { const r = spawnSync(process.execPath, [SELF, ...args, '--root', files === null ? path.join(tmp, name) : tree(name, files)], { encoding: 'utf8', timeout: 120000 }); code[name] = r.status; out[name] = (r.stdout || '') + (r.stderr || ''); };
    go('missed', { 'x/check-data.mjs': PASS });
    go('failing', { 'y/tests.mjs': FAILS });
    go('passing', { 'z/tests.mjs': PASS });
    go('excused', { 'w/tests.mjs': PASS, 'w/audit-citations.mjs': `// lab_tests: not a test ${WHY}\n` });
    go('folder', { 'v/tests/index.mjs': PASS });
    go('typo', { 'z/tests.mjs': PASS }, 'zz');
    go('one-lab', { 'z/tests.mjs': 'console.log("ran z");\n', 'q/tests.mjs': 'console.log("ran q");\n', 'q/check-data.mjs': PASS }, 'z');
    go('empty', {});
    go('no-root', null);
    go('cwd', { 'z/tests.mjs': 'process.exit(process.cwd().split(/[\\\\/]/).pop() === "z" ? 0 : 1);\n' });
    go('killed', { 'z/tests.mjs': 'process.kill(process.pid);\nsetTimeout(() => {}, 5000);\n' });
    go('slow', { 'z/tests.mjs': 'setTimeout(() => process.exit(0), 6000);\n' }, '--limit', '1500');
    go('loud', { 'z/tests.mjs': 'const line = "x".repeat(99) + "\\n"; for (let i = 0; i < 30000; i++) process.stdout.write(line);\n' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());
  const named = (list, label, bad) => bad.length === 0 || (console.log(`  ${label}: ${bad.join(', ')}`), false);
  const REPORTED = [...NAMED, ...FOLDER, 'h/audit-short.mjs', 'h/audit-padded.mjs', 'h/audit-late.mjs', 'h/audit-code.mjs'];
  const cases = [
    ['every name the runner knows is found, and nothing else', same(tests, RUN)],
    ['a run.mjs outside a test folder is not a test', !tests.includes('c/run.mjs')],
    ['every file named like a test and not run is reported', named(missed, 'not reported', NAMED.filter((f) => !missed.includes(f)))],
    ['every Node file under a test folder where nothing runs is reported, at any depth and in any letter case', named(missed, 'not reported', FOLDER.filter((f) => !missed.includes(f)))],
    ['helpers of a runner, browser modules and words that only contain a test word are left alone', named(missed, 'wrongly reported', QUIET.filter((f) => missed.includes(f)))],
    ['exactly the expected files are reported', same(missed, REPORTED)],
    ['the reason says which rule reported a file', why['d/checks/check-data.mjs'] === 'named like a test and not run' && why['g/tests/index.mjs'] === 'sits in a test folder where nothing runs'],
    ['a declaration excuses a file only as one comment line among the first twelve, with a real reason', same(excused, ['h/audit-links.mjs', 'h/audit-block.mjs', 'h/audit-paren.mjs'])],
    ['a file that is run is never also reported', tests.every((t) => !missed.includes(t))],
    ['the command fails on a missed file and names it', code.missed === 1 && out.missed.includes('FAIL labs/assets/js/x/check-data.mjs: named like a test and not run')],
    ['the command fails when a test fails', code.failing === 1 && out.failing.includes('FAIL labs/assets/js/y/tests.mjs')],
    ['the command passes when the tests pass', code.passing === 0 && out.passing.includes('1 files, 0 failed')],
    ['a declared file is listed with its reason and does not fail the gate', code.excused === 0 && out.excused.includes('not a test, as declared: labs/assets/js/w/audit-citations.mjs')],
    ['a test folder with nothing that runs fails the gate, and the message says why', code.folder === 1 && out.folder.includes('v/tests/index.mjs: sits in a test folder where nothing runs')],
    ['a lab name that matches no folder exits 2', code.typo === 2],
    ['one lab alone: only its tests run, and another lab\'s missed file is not its failure', code['one-lab'] === 0 && out['one-lab'].includes('ran z') && !out['one-lab'].includes('ran q') && out['one-lab'].includes('lab_tests z: 1 files, 0 failed') && !out['one-lab'].includes('no tests yet')],
    ['a labs folder with no labs passes with nothing to run', code.empty === 0],
    ['a root with no labs folder fails: nothing ran', code['no-root'] === 1 && out['no-root'].includes('does not exist, so nothing was run')],
    ['a test runs from its own folder', code.cwd === 0],
    ['a test that is killed fails the gate', code.killed === 1],
    ['a test that runs past the limit fails the gate', code.slow === 1],
    ['a test that prints three megabytes and exits 0 passes', code.loud === 0],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`lab_tests selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const argv = process.argv.slice(2);
const take = (flag) => { const i = argv.indexOf(flag); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v === undefined ? '' : v; };
const rootArg = take('--root'), limitArg = take('--limit');
if (argv[0] === 'selftest') selftest();
else if (rootArg === '' || (limitArg !== undefined && !(Number(limitArg) > 0))) { console.log('usage: node tools/lab_tests.mjs [<lab>] [--root <folder>] | selftest'); process.exit(2); }
else process.exit(run(argv[0], rootArg === undefined ? ROOT : path.resolve(rootArg), console.log, limitArg === undefined ? LIMIT_MS : Number(limitArg)));
