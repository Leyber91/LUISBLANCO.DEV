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

   What runs on a pull request. Given --changed-since <ref> (the gates
   give origin/main), the files changed since <ref> are named as
   tools/mutate.mjs names them (git, renames split into a deletion and
   an addition), and a test file runs only when a change can reach it:
   - it changed, or a module in its import closure changed: static
     import and export ... from, and import('<literal path>'), in turn,
     a path missing on disk included;
   - its closure names the changed file: a path that ends the same way,
     or a bare file name, which reaches no other lab's module folder;
   - its closure lists a folder (readdir, opendir, glob) or imports a
     path it computes, and the change sits under its lab's folder;
   - its closure names labs/assets/data/<folder> and the change sits
     there.
   Every test runs when tools/lab_tests.mjs, tools/mutate.mjs, the gates
   workflow, a package.json or a lockfile changed; when a change under
   labs/assets/data reaches no test (which test reads it cannot be
   told); when a module or JSON file under labs/assets/js reaches no
   test (a test could still load it by a path it builds); and when the
   files cannot be named. Any other file no test reaches runs nothing,
   and is listed. A push to main runs everything.

     node tools/lab_tests.mjs [<lab>] [--root <folder>] [--changed-since <ref>]
     node tools/lab_tests.mjs selftest
   ============================================================ */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince } from './mutate.mjs';

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

/* ---- --changed-since: which test files a change can reach (see the head of this file) ---- */
const JS_DIR = 'labs/assets/js/', DATA_DIR = 'labs/assets/data/';
// a change to one of these runs every test: the runner, the code it names changed files with, the workflow that runs it
const RUNS_ALL = ['tools/lab_tests.mjs', 'tools/mutate.mjs', '.github/workflows/gates.yml'];
const PACKAGE = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;
// a module or data a test can load by a path it builds
const LOADABLE = /\.([cm]?js|json)$/;
// the paths a module imports: import and export ... from '<path>', import '<path>', import('<literal path>')
const SPECIFIER = /\b(?:import|export)\s*(?:[\w$*{}\s,]*?\bfrom\s*)?(['"])([^'"\n]+)\1|\bimport\s*\(\s*(['"`])([^'"`$\n]+)\3\s*\)/g;
// a folder listed, or an import whose path is computed: the test may read any file of its lab's folder
const WALKS = /\b(?:readdir|opendir|glob)(?:Sync)?\s*\(|\bimport\s*\(\s*(?!(['"`])[^'"`$\n]+\1\s*\))/;
// a file named in a text, with the path before it: a run of path characters that ends in a dot and an extension
// (two steps, so that a long run is read once: one pattern with both parts took seconds on a long line)
const PATH_RUN = /[\w./-]+/g, ENDS_AS_FILE = /[\w-]\.[A-Za-z][A-Za-z0-9]{0,5}$/;
// labs/assets/data/<folder> named as data/<folder> or 'data', '<folder>'
const DATA_NAMED = /\bdata(?:\/|['"`]\s*,\s*['"`])([\w-]+)/g;
const slash = (p) => p.split(path.sep).join('/');
const labOf = (rel) => (rel.startsWith(JS_DIR) ? rel.slice(JS_DIR.length).split('/')[0] : '');

// one file read once: what it imports, names and lists; null when it cannot be read. cache: path -> that
function readOne(f, root, cache) {
  if (cache.has(f)) return cache.get(f);
  let text = null;
  try { text = fs.readFileSync(f, 'utf8'); } catch { /* missing: nothing to follow */ }
  let one = null;
  if (text !== null) {
    const code = /\.[cm]?js$/.test(f);   // a JSON import is read, not followed
    one = { imports: [], names: [], data: [...text.matchAll(DATA_NAMED)].map((m) => m[1]), walks: code && WALKS.test(text) };
    for (const n of text.match(PATH_RUN) || []) if (ENDS_AS_FILE.test(n)) one.names.push(n.replace(/^(\.{1,2}\/)+|^\/+/, ''));
    if (code) for (const m of text.matchAll(SPECIFIER)) {
      const spec = (m[2] ?? m[4]).split(/[?#]/)[0];
      if (spec.startsWith('./') || spec.startsWith('../')) one.imports.push(path.resolve(path.dirname(f), spec));
      else if (spec.startsWith('/') && !spec.startsWith('//')) one.imports.push(path.join(root, spec));
    }
  }
  cache.set(f, one);
  return one;
}
// What a test file can read, from its own text and its import closure's: imports (root-relative paths, missing ones
// included: a file added there later counts), names (the file names its closure spells, with their path, ./ and ../
// taken off), walks, data (the folders under labs/assets/data it names).
export function reachOf(test, root, cache = new Map()) {
  const seen = new Set(), queue = [test], names = new Set(), data = new Set();
  let walks = false;
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const one = readOne(f, root, cache);
    if (!one) continue;
    for (const n of one.names) names.add(n);
    for (const d of one.data) data.add(d);
    if (one.walks) walks = true;
    queue.push(...one.imports);
  }
  const rel = slash(path.relative(root, test));
  return { rel, lab: labOf(rel), imports: new Set([...seen].map((f) => slash(path.relative(root, f)))), names, walks, data };
}

// why a test file runs for a changed path, or null
function reaches(t, c) {
  if (c === t.rel) return 'changed itself';
  if (t.imports.has(c)) return `imports ${c}`;
  const base = c.split('/').pop();
  for (const n of t.names) {
    if (n.includes('/') ? (c === n || c.endsWith('/' + n)) : (n === base && (!c.startsWith(JS_DIR) || labOf(c) === t.lab))) return `names ${c}`;
  }
  if (t.walks && t.lab && c.startsWith(`${JS_DIR}${t.lab}/`)) return `lists a folder or imports a computed path, and ${c} is in ${JS_DIR}${t.lab}/`;
  if (c.startsWith(DATA_DIR) && t.data.has(c.slice(DATA_DIR.length).split('/')[0])) return `reads ${DATA_DIR}${c.slice(DATA_DIR.length).split('/')[0]}/, where ${c} changed`;
  return null;
}

// Which test files the changed paths (relative to root, with /) can reach. tests: absolute paths; changed: null when
// the files are not known. Returns { all: why every test runs, or null; run: Map(test -> why it runs); unread: the
// changed paths no test reaches and that run nothing }.
export function testsToRun(tests, changed, root) {
  if (!changed) return { all: 'the changed files are not known', run: new Map(), unread: [] };
  const shared = changed.filter((c) => RUNS_ALL.includes(c) || PACKAGE.test(c));
  if (shared.length) return { all: `${shared.join(', ')} changed`, run: new Map(), unread: [] };
  const cache = new Map(), info = tests.map((t) => reachOf(t, root, cache));
  const run = new Map(), unread = [], wide = [];
  for (const c of changed) {
    let hit = false;
    for (const t of info) { const why = reaches(t, c); if (why) { hit = true; if (!run.has(t.rel)) run.set(t.rel, why); } }
    if (hit) continue;
    if (c.startsWith(DATA_DIR)) wide.push(`${c} changed and no test names its folder, so which test reads it cannot be told`);
    else if (c.startsWith(JS_DIR) && LOADABLE.test(c)) wide.push(`${c} changed and no test imports, names or lists it, yet a test could load it by a path it builds`);
    else unread.push(c);
  }
  if (wide.length) return { all: wide.join('; '), run: new Map(), unread: [] };
  return { all: null, run, unread };
}

// Run the tests under <root>/labs/assets/js and return the exit code: 0 passed, 1 a failure, 2 an unknown lab.
// changed: the paths changed (see testsToRun), null when they could not be named; undefined, as on a push: every test.
export function run(only, root = ROOT, say = console.log, limit = LIMIT_MS, changed = undefined) {
  const JS = path.join(root, 'labs', 'assets', 'js');
  if (!fs.existsSync(JS)) { say(`lab_tests: ${JS} does not exist, so nothing was run`); return 1; }
  const labs = fs.readdirSync(JS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  if (only && !labs.includes(only)) { say(`lab_tests: no folder labs/assets/js/${only}`); return 2; }
  const inLab = (f) => !only || path.relative(JS, f).split(path.sep)[0] === only;
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const found = findTests(JS).filter(inLab);
  let files = found;
  if (changed !== undefined) {
    // over every lab's tests, also when one lab is named: whether a test names a data folder is a question for all
    const plan = testsToRun(findTests(JS), changed, root);
    if (plan.all) say(`lab_tests: every test runs: ${plan.all}`);
    else {
      files = found.filter((f) => plan.run.has(rel(f)));
      for (const f of files) say(`lab_tests: ran ${rel(f)}: ${plan.run.get(rel(f))}`);
      const left = new Map();
      for (const f of found) if (!plan.run.has(rel(f))) { const lab = labOf(rel(f)); left.set(lab, (left.get(lab) || 0) + 1); }
      for (const [lab, n] of left) say(`lab_tests: skipped ${n} of ${found.filter((f) => labOf(rel(f)) === lab).length} test files of ${lab}: none imports, names or lists a changed file`);
      if (plan.unread.length) say(`lab_tests: changed and read by no test: ${plan.unread.join(', ')}`);
    }
  }
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
    if (!ok) {
      // the failing checks first, wherever they sit: a mutants test prints hundreds of lines and its one FAIL line
      // was outside the last twenty on 2026-11-16, so a failure in the gates could not be read
      const lines = ((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')).trim().split(/\r?\n/);
      const failing = lines.filter((l) => /^\s*FAIL\b/.test(l));
      if (failing.length) say(`failing checks (${failing.length}):\n${failing.slice(0, 40).join('\n')}`);
      say(lines.slice(-20).join('\n'));
    }
  }
  for (const m of missed.filter((x) => inLab(x.file))) {
    fail++;
    say(`FAIL ${rel(m.file)}: ${m.why}; name it tests.mjs, <name>.test.mjs or tests/run.mjs, or declare on a comment line at its top why it is not a test`);
  }
  for (const e of excused.filter((x) => inLab(x.file))) say(`not a test, as declared: ${rel(e.file)} (${e.why})`);
  const skipped = found.length - files.length ? `, ${found.length - files.length} skipped as out of the change's reach` : '';
  if (!only) {
    const tested = new Set(found.map((f) => path.relative(JS, f).split(path.sep)[0]));
    // os is Labs OS, compiled from labs-src/os; its tests run there (vitest), in the gates' labs-src step.
    const untested = labs.filter((d) => !tested.has(d) && !['ai', 'config', 'hub', 'os'].includes(d));
    say(`lab_tests: ${files.length} files, ${fail} failed${skipped}; no tests yet: ${untested.join(', ') || 'none'}`);
  } else say(`lab_tests ${only}: ${files.length} files, ${fail} failed${skipped}`);
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
  let tests, missed, excused, why, code = {}, out = {}, planCount = 0, hasRepo = false;
  // the changes planned on the small site below, each a list of paths; P: what each runs
  const J = JS_DIR, P = {};
  const CHANGES = {
    engine: [J + 'a/engine.js'], kit: [J + 'kit/dom.js'], deep: [J + 'a/deep.js'], lazy: [J + 'a/lazy.js'], rooted: [J + 'c/x.js'], deeper: [J + 'a/deeper.js'], lazier: [J + 'a/lazy2.js'], rootedDeeper: [J + 'c/x2.js'], self: [J + 'a/tests/engine.test.mjs'],
    none: [], unknown: null,
    page: ['labs/a.html'], otherPage: ['labs/b.html'],
    bareOwn: [J + 'c/style.css'], bareOut: ['labs/style.css'], bareOther: [J + 'a/style.css'],
    walked: [J + 'b/view.js'], walkedDeep: [J + 'b/deep/z.css'], walkedNear: [J + 'bb/view.css'],
    computed: [J + 'd/x.js'], dataJoin: ['labs/assets/data/gamma/q.json'], dataSameName: ['labs/assets/data/beta/x.json'],
    data: ['labs/assets/data/alpha/x.json'], dataFolder: ['labs/assets/data/alpha/other.json'], dataNone: ['labs/assets/data/beta/y.json'], dataNear: ['labs/assets/data/alphabet/z.json'],
    loose: [J + 'a/ui.js'], looseJson: [J + 'a/ui.json'], looseCjs: [J + 'a/ui.cjs'], looseJsx: [J + 'a/ui.jsx'], looseMd: [J + 'a/notes.md'], looseCss: ['labs/a.css'], looseTool: ['tools/drives/x.mjs'],
    twoWide: [J + 'a/ui.js', 'labs/assets/data/beta/y.json'],
    ...Object.fromEntries(['tools/lab_tests.mjs', 'tools/mutate.mjs', '.github/workflows/gates.yml', 'package.json', 'labs-src/package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json', 'pnpm-lock.yaml'].map((f) => ['all:' + f, [f, J + 'a/engine.js']])),
    ...Object.fromEntries(['tools/lab_tests.mjs.orig', 'x/tools/mutate.mjs', 'docs/package.json.md', 'tools/lab_tests.json'].map((f) => ['near:' + f, [f]])),
  };
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
    go('buried', { 'z/tests.mjs': 'console.log("FAIL  the buried check: 0 checks fail");\nconsole.log("  FAIL  an indented check");\nconsole.log("note: FAIL inside a line");\nconsole.log("FAILED to start");\nfor (let i = 0; i < 30; i++) console.log("pass  filler " + i);\nprocess.exit(1);\n' });
    go('many', { 'z/tests.mjs': 'for (let i = 1; i <= 41; i++) console.log("FAIL  c" + String(i).padStart(3, "0"));\nfor (let i = 0; i < 25; i++) console.log("pass  filler " + i);\nprocess.exit(1);\n' });
    // --changed-since: which test files a change reaches, on a small site
    const site = (name, files) => { const root = path.join(tmp, name); for (const [f, body] of Object.entries(files)) { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); } return root; };
    const S = JS_DIR;
    const plan = site('plan', {
      [S + 'kit/dom.js']: 'export const dom = 1;\n',
      [S + 'kit/tests/dom.test.mjs']: "import { dom } from '../dom.js';\n",
      [S + 'a/engine.js']: "import { dom } from '../kit/dom.js';\nexport const e = dom;\n",
      [S + 'a/deep.js']: "import './deeper.js';\nexport const d = 1;\n",
      [S + 'a/deeper.js']: 'export const dd = 1;\n',
      [S + 'a/engine2.js']: "export { d } from './deep.js';\n",
      [S + 'a/lazy.js']: "import './lazy2.js';\nexport const l = 1;\n",
      [S + 'a/lazy2.js']: 'export const l2 = 1;\n',
      [S + 'a/ui.js']: "import '../kit/dom.js';\n",
      [S + 'a/tests/engine.test.mjs']: "import { e } from '../engine.js';\n",
      [S + 'a/tests/two.test.mjs']: "import {\n  d,\n} from '../engine2.js?v=2';\n",
      [S + 'a/tests/lazy.test.mjs']: "const m = await import('../lazy.js');\n",
      [S + 'a/tests/page.test.mjs']: "const t = readFileSync(join(here, '../../../../a.html'));\n",
      [S + 'a/tests/data.test.mjs']: "const x = readFileSync(join(here, '../../../data/alpha/x.json'));\n",
      [S + 'b/tests.mjs']: "import fs from 'node:fs';\nconst all = fs.readdirSync(here);\n",
      [S + 'b/view.js']: 'export const v = 1;\n',
      [S + 'c/tests.mjs']: "import { x } from '/labs/assets/js/c/x.js';\n",
      [S + 'c/x.js']: "import './x2.js';\nexport const x = 1;\n",
      [S + 'c/x2.js']: 'export const x2 = 1;\n',
      [S + 'c/named.test.mjs']: "const s = readFileSync(join(here, 'style.css'));\n",
      [S + 'd/tests.mjs']: "const m = await import(pathToFileURL(join(here, name)).href);\n",
      [S + 'd/x.js']: 'export const x = 1;\n',
      [S + 'e/tests.mjs']: "const D = path.join(here, '..', '..', 'data', 'gamma');\n",
      'labs/assets/data/alpha/x.json': '{}\n',
      'labs/assets/data/beta/y.json': '{}\n',
    });
    const planTests = findTests(path.join(plan, 'labs', 'assets', 'js'));
    const planned = (changed) => { const p = testsToRun(planTests, changed, plan); return { all: p.all, run: [...p.run.keys()].map((t) => t.slice(S.length)).sort(), why: Object.fromEntries([...p.run].map(([t, w]) => [t.slice(S.length), w])), unread: p.unread }; };
    for (const [k, changed] of Object.entries(CHANGES)) P[k] = planned(changed);
    planCount = planTests.length;
    // the command, as the gates run it, in a git repository: a kit module renamed, one lab's test moved to the new name,
    // another lab's test left on the old one (it fails: the old path still counts), a third lab untouched
    const repo = site('repo', {
      [S + 'kit/dom.js']: 'export const dom = 1;\n',
      [S + 'a/tests/engine.test.mjs']: "import { dom } from '../../kit/dom.js';\nconsole.log('ran a');\n",
      [S + 'b/tests.mjs']: "import { dom } from '../kit/dom.js';\nconsole.log('ran b');\n",
      [S + 'c/tests.mjs']: "console.log('ran c');\n",
    });
    const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...a], { cwd: repo, stdio: 'pipe' }).status;
    hasRepo = git('init', '-q') === 0 && git('add', '.') === 0 && git('commit', '-qm', 'one') === 0 && git('checkout', '-qb', 'work') === 0
      && git('mv', `${S}kit/dom.js`, `${S}kit/dom2.js`) === 0
      && (fs.writeFileSync(path.join(repo, S, 'a/tests/engine.test.mjs'), "import { dom } from '../../kit/dom2.js';\nconst q = '../../../../data/q/x.json';\nconsole.log('ran a');\n"), fs.writeFileSync(path.join(repo, 'labs', 'notes.css'), 'a {}\n'), fs.mkdirSync(path.join(repo, 'labs', 'assets', 'data', 'q'), { recursive: true }), fs.writeFileSync(path.join(repo, 'labs', 'assets', 'data', 'q', 'x.json'), '{}\n'), git('add', '.') === 0) && git('commit', '-qm', 'two') === 0;
    const cli = (name, ...args) => { const r = spawnSync(process.execPath, [SELF, '--root', repo, ...args], { cwd: tmp, encoding: 'utf8', timeout: 120000 }); code[name] = r.status; out[name] = (r.stdout || '') + (r.stderr || ''); };
    if (hasRepo) { cli('renamed', '--changed-since', 'main'); cli('unchanged', '--changed-since', 'HEAD'); cli('no-ref', '--changed-since'); cli('bad-ref', '--changed-since', 'no-such-ref'); cli('push'); cli('one-lab-plan', 'c', '--changed-since', 'main'); }
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
    ['a failing check far above the last lines is shown, and only lines that start with FAIL', code.buried === 1 && out.buried.includes('failing checks (2):\nFAIL  the buried check: 0 checks fail\n  FAIL  an indented check\n')],
    ['the last lines are still printed, after the failing checks', out.buried.includes('pass  filler 29') && out.buried.indexOf('failing checks (2)') < out.buried.lastIndexOf('pass  filler 29') && out.buried.includes('pass  filler 10\n')],
    ['at most forty failing checks are printed, counted in full', out.many.includes('failing checks (41):') && out.many.includes('FAIL  c040') && !out.many.includes('FAIL  c041')],
    ['a test that is killed fails the gate', code.killed === 1],
    ['a test that runs past the limit fails the gate', code.slow === 1],
    ['a test that prints three megabytes and exits 0 passes', code.loud === 0],
    // --changed-since
    ['the small site has the eleven test files it was written with', planCount === 11, planCount],
    ['a lab file changed runs only the test files that import it, not the lab\'s others', same(P.engine.run, ['a/tests/engine.test.mjs']) && !P.engine.all, JSON.stringify(P.engine)],
    ['a kit file changed runs every test file that imports it, in any lab, through a module between, and no other', same(P.kit.run, ['a/tests/engine.test.mjs', 'kit/tests/dom.test.mjs']) && !P.kit.all, JSON.stringify(P.kit)],
    ['an import is followed through export ... from, an import over several lines and a query after the path', same(P.deep.run, ['a/tests/two.test.mjs']), JSON.stringify(P.deep)],
    ['import() with a literal path is followed', same(P.lazy.run, ['a/tests/lazy.test.mjs']), JSON.stringify(P.lazy)],
    ['the closure goes on through every kind of import, three modules down: a module the third imports runs the test', same(P.deeper.run, ['a/tests/two.test.mjs']) && same(P.lazier.run, ['a/tests/lazy.test.mjs']) && same(P.rootedDeeper.run, ['c/tests.mjs']) && !P.deeper.all && !P.lazier.all && !P.rootedDeeper.all, JSON.stringify([P.deeper, P.lazier, P.rootedDeeper])],
    ['an import from the site root is followed', same(P.rooted.run, ['c/tests.mjs']), JSON.stringify(P.rooted)],
    ['a test file changed runs itself, and says so', same(P.self.run, ['a/tests/engine.test.mjs']) && P.self.why['a/tests/engine.test.mjs'] === 'changed itself', JSON.stringify(P.self)],
    ['nothing changed runs none; files not known run all', !P.none.all && P.none.run.length === 0 && P.none.unread.length === 0 && !!P.unknown.all, JSON.stringify([P.none, P.unknown])],
    ['the runner, mutate.mjs, the gates workflow, a package.json or a lockfile changed runs all, and says which', Object.keys(CHANGES).filter((k) => k.startsWith('all:')).every((k) => P[k].all === `${k.slice(4)} changed` && P[k].run.length === 0)],
    ['a near name of those runs nothing', Object.keys(CHANGES).filter((k) => k.startsWith('near:')).every((k) => !P[k].all && P[k].run.length === 0 && P[k].unread.length === 1)],
    ['a file a test names with its path runs that test; another file runs none and is listed', same(P.page.run, ['a/tests/page.test.mjs']) && P.page.why['a/tests/page.test.mjs'] === 'names labs/a.html' && P.otherPage.run.length === 0 && same(P.otherPage.unread, ['labs/b.html']), JSON.stringify([P.page, P.otherPage])],
    ['a bare file name reaches its own lab\'s folder and files outside the module folders, never another lab\'s module folder', same(P.bareOwn.run, ['c/named.test.mjs']) && same(P.bareOut.run, ['c/named.test.mjs']) && P.bareOther.run.length === 0 && !P.bareOther.all, JSON.stringify([P.bareOwn, P.bareOut, P.bareOther])],
    ['a test that lists a folder reaches every file of its lab\'s folder, at any depth, and no other lab\'s', same(P.walked.run, ['b/tests.mjs']) && same(P.walkedDeep.run, ['b/tests.mjs']) && P.walkedNear.run.length === 0 && !P.walkedNear.all, JSON.stringify([P.walked, P.walkedDeep, P.walkedNear])],
    ['a test that imports a path it computes reaches every file of its lab\'s folder; one whose import() has a literal path does not', same(P.computed.run, ['d/tests.mjs']) && !P.engine.run.includes('a/tests/lazy.test.mjs'), JSON.stringify(P.computed)],
    ['a data folder named as \'data\', \'<folder>\' counts; a data file named with its path does not reach a file of that name in another folder', same(P.dataJoin.run, ['e/tests.mjs']) && /beta\/x\.json changed and no test names its folder/.test(P.dataSameName.all), JSON.stringify([P.dataJoin, P.dataSameName])],
    ['a data file runs the test that names it or its folder; a folder no test names, a near name included, runs all', same(P.data.run, ['a/tests/data.test.mjs']) && same(P.dataFolder.run, ['a/tests/data.test.mjs']) && !P.dataFolder.all
      && /beta\/y\.json changed and no test names its folder/.test(P.dataNone.all) && /alphabet\/z\.json changed and no test names its folder/.test(P.dataNear.all), JSON.stringify([P.data, P.dataFolder, P.dataNone.all, P.dataNear.all])],
    ['a module or JSON file under labs/assets/js no test reaches runs all and is named; another file no test reaches runs none and is listed', [P.loose, P.looseJson, P.looseCjs].every((p, i) => p.all && p.all.includes(['a/ui.js', 'a/ui.json', 'a/ui.cjs'][i] + ' changed and no test imports, names or lists it'))
      && [[P.looseJsx, 'a/ui.jsx'], [P.looseMd, 'a/notes.md'], [P.looseCss, 'labs/a.css'], [P.looseTool, 'tools/drives/x.mjs']].every(([p, f]) => !p.all && p.run.length === 0 && p.unread.length === 1 && p.unread[0].endsWith(f)), JSON.stringify([P.loose, P.looseJsx, P.looseMd])],
    ['every reason to run all is given, not only the first', !!P.twoWide.all && P.twoWide.all.includes('a/ui.js') && P.twoWide.all.includes('beta/y.json'), P.twoWide.all],
    ['the command asks git: a rename counts as a deletion and an addition, so a test still on the old path runs (and fails), and says which ran, why, and which were skipped', hasRepo && code.renamed === 1
      && out.renamed.includes('lab_tests: ran labs/assets/js/a/tests/engine.test.mjs: names labs/assets/data/q/x.json') && out.renamed.includes('lab_tests: ran labs/assets/js/b/tests.mjs: imports labs/assets/js/kit/dom.js')
      && out.renamed.includes('lab_tests: skipped 1 of 1 test files of c: none imports, names or lists a changed file') && out.renamed.includes('FAIL labs/assets/js/b/tests.mjs') && !out.renamed.includes('ran c')
      && out.renamed.includes('lab_tests: changed and read by no test: labs/notes.css') && out.renamed.includes('lab_tests: 2 files, 1 failed, 1 skipped as out of the change\'s reach'), out.renamed],
    ['the command with nothing changed runs none and passes', hasRepo && code.unchanged === 0 && out.unchanged.includes('lab_tests: 0 files, 0 failed, 3 skipped') && !/ran [abc]/.test(out.unchanged), out.unchanged],
    ['--changed-since with no ref, or a ref git cannot read, runs every test and says so; with no --changed-since every test runs and no plan is printed', hasRepo
      && out['no-ref'].includes('lab_tests: --changed-since was given no ref, so every test runs') && out['no-ref'].includes('ran c') && code['no-ref'] === 1
      && out['bad-ref'].includes('lab_tests: git could not name the files changed since no-such-ref, so every test runs') && out['bad-ref'].includes('lab_tests: every test runs: the changed files are not known') && out['bad-ref'].includes('ran c')
      && out.push.includes('ran c') && out.push.includes('ran a') && !out.push.includes('lab_tests: ran ') && !out.push.includes('every test runs'), JSON.stringify([out['no-ref'], out['bad-ref'], out.push])],
    ['with one lab named, the plan still reads every lab\'s tests: a data folder another lab\'s test names does not run all', hasRepo && code['one-lab-plan'] === 0
      && out['one-lab-plan'].includes('lab_tests: skipped 1 of 1 test files of c') && out['one-lab-plan'].includes('lab_tests c: 0 files, 0 failed, 1 skipped') && !out['one-lab-plan'].includes('every test runs'), out['one-lab-plan']],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n, , d] of fail) console.log('FAIL ' + n + (d === undefined ? '' : ': ' + String(d).slice(0, 600)));
  console.log(`lab_tests selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

// run as a command, not imported (an import runs nothing)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
const argv = isMain ? process.argv.slice(2) : [];
const take = (flag) => { const i = argv.indexOf(flag); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v === undefined ? '' : v; };
const rootArg = take('--root'), limitArg = take('--limit'), sinceArg = take('--changed-since');
if (!isMain) { /* imported */ }
else if (argv[0] === 'selftest') selftest();
else if (rootArg === '' || (limitArg !== undefined && !(Number(limitArg) > 0))) { console.log('usage: node tools/lab_tests.mjs [<lab>] [--root <folder>] [--changed-since <ref>] | selftest'); process.exit(2); }
else {
  const root = rootArg === undefined ? ROOT : path.resolve(rootArg);
  let changed;
  if (sinceArg !== undefined) {
    changed = changedSince(sinceArg, root);
    if (!changed) console.log(sinceArg ? `lab_tests: git could not name the files changed since ${sinceArg}, so every test runs` : 'lab_tests: --changed-since was given no ref, so every test runs');
  }
  process.exit(run(argv[0], root, console.log, limitArg === undefined ? LIMIT_MS : Number(limitArg), changed));
}
