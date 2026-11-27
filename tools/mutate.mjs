// Mutation test of the gates: a selftest is only as good as the broken rules it catches.
//
// On 2026-11-13 the scope rule in tools/evolution.mjs passed its own selftest (90 of 90) while a reviewer who broke
// the rule in a copy, one condition at a time, found broken versions the selftest still passed. So each gate that
// has a list of mutants in tools/mutants/<tool>.json is tested here: every mutant is one exact replacement that
// breaks one rule, and the tool's selftest must fail on it. A list named <tool>.<part>.json breaks <tool>.mjs and runs
// "selftest <part>", a part of the selftest that catches that list's entries in less time (mutate.core.json: the
// entries main had before 2026-11-17, a few seconds a copy, against about 13 s for the whole selftest on the gates). A mutant that survives means a rule nobody tests. A
// mutant whose text is no longer in the tool exactly once means the list went stale. Both fail this check.
// It works for a gate that node runs and that has a "selftest" argument needing nothing outside its own folder.
//
// A run stopped at its time limit is not a catch: nothing saw the broken rule fail. On 2026-11-16 copies of the
// driver's selftest that waited on one another for Chrome ran past their limit and were counted as caught. So a run
// stopped at the limit, or a selftest that stops itself at its own limit with exit code 124 (tools/drive.mjs
// WATCHDOG_EXIT), runs once more, alone, after the others, and that is printed (RERUN); stopped again, it is reported
// as timed out, apart from caught and survived, and fails the check unless its entry declares "timeout": "<reason>"
// (a break that really is an endless loop). Each list's summary gives how many ran again and how long it took.
//
// Every run of a list gets LABS_DRIVE_LOCK, a lock file of that list run's own: a copy with its lock broken cannot
// hold or take the machine's lock that drives share (tools/drive.mjs). The lists of the selftests that drive Chrome
// (SLOW) run one copy at a time, and mutate holds the machine's lock itself around each of their copies, with the
// holdChrome of tools/drive.mjs in its own folder (never a copy's), so that one Chrome runs on the machine: a drive of
// another conversation waits, and gets its turn in the 600 ms mutate leaves between copies (a waiting drive looks
// every 250 ms). On 2026-11-17 a private lock for every copy let a local run of these lists start Chrome beside other
// drives. Those lists take most of an hour on the gates' machine, and mutate's own (mutate.json) took 498 s of every
// pull request: each is GATED. Given --changed-since <ref> (on a pull request: origin/main), mutate asks git for the
// files changed since <ref> (renames as a deletion and an addition, so a watched file moved away still counts) and runs
// a gated list only when one of its files changed; --changed <file> gives the paths instead, one a line; with neither,
// as on a push to main, every list runs. When the files cannot be named, or --changed-since is given no ref, every list
// runs, and that is said. Since 2026-11-21 every list is gated, each by its own tool's files (GATED), so that a pull
// request that touches no gate tool runs no list; a list GATED does not name runs on every pull request.
//
// usage: node tools/mutate.mjs [<list>] [--tools <folder>] [--changed-since <ref> | --changed <file>]
//        node tools/mutate.mjs selftest [core]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TOOLS = path.dirname(SELF);
const lf = (s) => s.replace(/\r\n/g, '\n');
// a byte order mark some editors put at the start of a JSON file; JSON.parse refuses it
const BOM = new RegExp('^' + String.fromCharCode(0xFEFF));
/* Mutants run a few at a time, each in its own scratch copy. Kept low: a selftest may start processes of its own. */
const WIDTH = Math.max(1, Math.min(4, (os.availableParallelism ? os.availableParallelism() : 2) - 1));

// Run a tool's selftest from a file; resolves 'pass', 'fail', or 'timeout' when it was stopped at the limit or stopped
// itself at its own (exit WATCHDOG). WATCHDOG is tools/drive.mjs WATCHDOG_EXIT, and each of the two selftests checks
// that the other's is the same.
export const WATCHDOG = 124;
const LIMIT_MS = 180000;
/* The copies running now end with this process: on its exit, and on SIGTERM and SIGINT, after which Node would end
   without its exit handlers. On Windows the copy's whole tree goes (taskkill /T /F: the copy and the Chrome it started);
   elsewhere the copy gets SIGTERM and ends its own Chromes (tools/drive.mjs). On 2026-11-17 a run stopped from outside
   left its copy and that copy's Chrome running, while the machine's lock named a dead pid.
   Killed outright, a process runs no handler. On Windows Node ends the children it did not detach when it dies, by any
   means (libuv puts them in a job that closes with it), and a copy's Chrome with them: checked here on 2026-11-17. A
   declared limit, elsewhere: a mutate killed outright (SIGKILL) leaves its copy running until the copy's own watchdog
   (120 s for drive, 60 s for invariants), and a waiting drive takes the lock from the dead pid meanwhile, so a second
   Chrome can run beside that copy's. */
const RUNNING = new Set();
// sync: wait for taskkill (on exit, where nothing waits after); else it runs beside (it takes about 2 s here)
export function endTree(child, sync = false) {
  const args = ['/T', '/F', '/PID', String(child.pid)];
  if (process.platform === 'win32') { if (sync) spawnSync('taskkill', args, { stdio: 'ignore' }); else spawn('taskkill', args, { stdio: 'ignore' }).on('error', () => {}); }
  else child.kill('SIGTERM');
}
process.on('exit', () => { for (const c of RUNNING) endTree(c, true); });
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130]]) process.on(sig, () => process.exit(code));
// part: the selftest's part a list asks for (tools/mutants/<tool>.<part>.json runs "<tool>.mjs selftest <part>")
function runs(file, limit = LIMIT_MS, env = process.env, part = '') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, 'selftest', ...(part ? [part] : [])], { stdio: 'ignore', env });
    RUNNING.add(child);
    let late = false;
    const timer = setTimeout(() => { late = true; endTree(child); }, limit);
    child.on('exit', (code) => { RUNNING.delete(child); clearTimeout(timer); resolve(late || code === WATCHDOG ? 'timeout' : code === 0 ? 'pass' : 'fail'); });
    child.on('error', () => { RUNNING.delete(child); clearTimeout(timer); resolve('fail'); });
  });
}

// The tools whose selftests drive Chrome: their lists run one copy at a time, under the machine's lock.
const SLOW = ['drive', 'invariants'];
// The lists that run on a pull request only when one of their files changed; a push to main runs every list. mutate's own
// list (this PR's entries: the timeouts, the machine's lock, the stopped runs) took 498 s of every pull request on
// 2026-11-17; the entries main had before are in mutate.core.json.
const CHROME_FILES = ['tools/drive.mjs', 'tools/invariants.mjs', 'tools/drives/invariants.mjs', 'tools/mutants/drive.json', 'tools/mutants/invariants.json', 'tools/mutate.mjs', '.github/workflows/gates.yml'];
const GATED = { drive: CHROME_FILES, invariants: CHROME_FILES, mutate: ['tools/mutate.mjs', 'tools/mutants/mutate.json', 'tools/drive.mjs', '.github/workflows/gates.yml'] };
// Every other list, by its own tool's files since 2026-11-21 (Luis: "not to over test what hasn't been changed unless it
// affects another area"): the tool, its list, every file of this folder the tool spells as a quoted name ('drive.mjs',
// './drive.mjs': what it imports or reads; the selftest checks this), and the runner, this file and the gates workflow.
// Before, these lists ran on every pull request, about 6.7 minutes whatever it changed. A list missing here still
// runs on every pull request, and the selftest fails on it.
const RUNNER = ['tools/mutate.mjs', '.github/workflows/gates.yml'];
const own = (list, tool, ...reads) => [...new Set([`tools/${tool}.mjs`, `tools/mutants/${list}.json`, ...reads, ...RUNNER])];
Object.assign(GATED, {
  atlas: own('atlas', 'atlas'),
  'drive.waits': [...CHROME_FILES, 'tools/mutants/drive.waits.json'],
  evolution: own('evolution', 'evolution'),
  lab_tests: own('lab_tests', 'lab_tests'),
  'labs-wt': own('labs-wt', 'labs-wt', 'tools/drive.mjs', 'tools/levels.mjs', 'tools/ship_pr.mjs'),
  'mutate.core': own('mutate.core', 'mutate', 'tools/drive.mjs'),
  ship_pr: own('ship_pr', 'ship_pr'),
  stories: own('stories', 'stories'),
});
// the siblings a tool spells as a quoted file name, bare or after ./ (siblings: the file names of its folder)
export function quotedSiblings(source, siblings, self) {
  return siblings.filter((s) => s !== self && new RegExp(`['"\`](\\./)?${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(source));
}
// changed: the paths that changed, or null when they are not known (then every list runs). hits: for each gated list
// that runs, the changed files that made it run
export function listsToRun(names, changed) {
  if (!changed) return { run: names, skipped: [], hits: {} };
  const hits = {}, skipped = [];
  for (const n of names) {
    if (!Object.hasOwn(GATED, n)) continue;
    const h = changed.filter((f) => GATED[n].includes(f));
    if (h.length) hits[n] = h; else skipped.push(n);
  }
  return { run: names.filter((n) => !skipped.includes(n)), skipped, hits };
}
// the files changed since a ref, as git names them with renames split and every name as it is (core.quotePath=false:
// git quotes a name with a letter outside ASCII by default); null when git cannot say, or no ref is given (git would
// read "...HEAD" as HEAD against itself: nothing changed)
export function changedSince(ref, cwd = process.cwd()) {
  if (!ref) return null;
  const r = spawnSync('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', `${ref}...HEAD`], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : null;
}
// the paths in a file of git's names, one a line; null when it cannot be read
export function readChanged(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { return null; }
}

// The machine's Chrome lock around each copy of a slow list: hold(run) waits for it (waitMs at most: then 'busy'), runs,
// gives it back, and leaves GAP_MS before it is taken again. Imported from this file's own folder when first asked.
const GAP_MS = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function machineHold(waitMs) {
  const { holdChrome } = await import(pathToFileURL(path.join(TOOLS, 'drive.mjs')).href);
  let last = 0;
  return async (run) => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const release = await holdChrome(waitMs);
    if (!release) return 'busy';
    try { return await run(); } finally { release(); last = Date.now(); }
  };
}

// Test one tool's source against its mutants, each in a scratch copy of the tools folder.
// Returns {caught, survived, stale, noop: [names], timedOut: [{ name, reason }], reruns: [{ name, result }], broken:
// true when the unmutated selftest fails or does not end, busy: true when the machine's lock was not free in time}.
// width: how many copies run at once; hold: machineHold's function, for a list that drives Chrome.
export async function mutate(source, mutants, name, siblings, limit = LIMIT_MS, width = WIDTH, hold = null, part = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-'));
  const env = { ...process.env, LABS_DRIVE_LOCK: path.join(root, 'chrome.lock') };
  const place = (label, text) => {
    const work = path.join(root, label, 'tools');
    fs.mkdirSync(work, { recursive: true });
    if (siblings && fs.existsSync(siblings)) for (const f of fs.readdirSync(siblings, { withFileTypes: true })) if (f.isFile() && /\.(mjs|js|json)$/.test(f.name)) fs.copyFileSync(path.join(siblings, f.name), path.join(work, f.name));
    const file = path.join(work, `${name}.mjs`);
    fs.writeFileSync(file, text);
    return file;
  };
  const base = lf(source);
  const out = { caught: 0, survived: [], stale: [], noop: [], timedOut: [], reruns: [], broken: false, busy: false };
  // one copy's run; once the machine's lock was not free, no copy runs any more
  const go = async (label, text) => {
    if (!hold) return runs(place(label, text), limit, env, part);
    const got = out.busy ? 'busy' : await hold(() => runs(place(label, text), limit, env, part));
    if (got === 'busy') out.busy = true;
    return got;
  };
  try {
    const first = await go('base', base);
    if (out.busy) return out;
    if (first !== 'pass') { out.broken = true; return out; }
    const jobs = [];
    for (const m of mutants) {
      const from = lf(String(m.from || '')), to = lf(String(m.to ?? ''));
      const i = from ? base.indexOf(from) : -1;
      if (i < 0 || base.indexOf(from, i + 1) >= 0) { out.stale.push(m.name); continue; }
      if (from === to) { out.noop.push(m.name); continue; }
      jobs.push({ name: m.name, timeout: m.timeout, text: base.slice(0, i) + to + base.slice(i + from.length) });
    }
    const result = new Array(jobs.length).fill('fail');
    let next = 0;
    const worker = async () => { for (let k = next++; k < jobs.length; k = next++) result[k] = await go(`m${k}`, jobs[k].text); };
    await Promise.all(Array.from({ length: width }, worker));
    // a run stopped at the limit may have waited on another run (a lock, a busy machine): once more, alone
    for (let k = 0; k < jobs.length; k++) if (result[k] === 'timeout') { result[k] = await go(`m${k}`, jobs[k].text); out.reruns.push({ name: jobs[k].name, result: result[k] }); }
    if (out.busy) return out;
    jobs.forEach((j, k) => {
      if (result[k] === 'pass') out.survived.push(j.name);
      else if (result[k] === 'timeout') out.timedOut.push({ name: j.name, reason: j.timeout });
      else out.caught++;
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return out;
}

function shape(mutants, where) {
  const errs = [];
  if (!Array.isArray(mutants) || !mutants.length) return [`${where}: a list of at least one mutant`];
  const seen = new Set();
  for (const m of mutants) {
    if (!(m && typeof m.name === 'string' && m.name.trim().length >= 8)) errs.push(`${where}: a mutant names the rule it breaks (8+ characters)`);
    else if (seen.has(m.name)) errs.push(`${where}: "${m.name}" is listed twice`);
    if (m && m.name) seen.add(m.name);
    if (m && 'timeout' in m && !(typeof m.timeout === 'string' && m.timeout.trim().length >= 8)) errs.push(`${where}: "${m.name}" declares a timeout without its reason (8+ characters)`);
    if (!(m && typeof m.from === 'string' && m.from && typeof m.to === 'string')) errs.push(`${where}: "${m && m.name}" needs "from" (exact text in the tool) and "to" (the broken text)`);
  }
  return errs;
}

// Check every tool that has a mutants file in <tools>/mutants. Returns the exit code: 0 all caught, 1 a failure,
// 2 a tool was named that has no mutants file. changed: see listsToRun; limit: each run's time; waitMs: the longest
// wait for the machine's lock before a copy of a slow list (LABS_DRIVE_WAIT_MS, as drives read it, or 20 minutes).
export async function run(only, tools = TOOLS, say = console.log, { changed = null, limit = LIMIT_MS, waitMs = Number(process.env.LABS_DRIVE_WAIT_MS) || 20 * 60 * 1000 } = {}) {
  const folder = path.join(tools, 'mutants');
  if (!fs.existsSync(folder)) { say(`mutate: ${folder} does not exist, so no gate was tested`); return 1; }
  const strays = fs.readdirSync(folder).filter((f) => !f.endsWith('.json'));
  if (strays.length) { say(`mutate: tools/mutants holds ${strays.join(', ')}; a mutants file is named <tool>.json in lower case, and anything else would be skipped in silence`); return 1; }
  const names = fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);
  if (only && !names.length) { say(`mutate: no mutants file for "${only}"`); return 2; }
  if (!names.length) { say('mutate: tools/mutants holds no mutants file, so no gate was tested'); return 1; }
  const plan = listsToRun(names, changed);
  for (const n of Object.keys(plan.hits)) say(`mutate: ran ${n}: changed files ${plan.hits[n].join(', ')}`);
  for (const n of plan.skipped) say(`mutate: skipped ${n}: none of ${GATED[n].join(', ')} changed`);
  let bad = 0;
  for (const name of plan.run) {
    // a list named <tool>.<part> breaks <tool>.mjs and runs that part of its selftest
    const [toolName, ...more] = name.split('.'), part = more.join('.');
    const tool = path.join(tools, `${toolName}.mjs`);
    if (!fs.existsSync(tool)) { say(`mutate ${name}: tools/${toolName}.mjs does not exist`); bad++; continue; }
    let mutants;
    try { mutants = JSON.parse(fs.readFileSync(path.join(folder, `${name}.json`), 'utf8').replace(BOM, '')); }
    catch (e) { say(`mutate ${name}: tools/mutants/${name}.json is not valid JSON (${e.message})`); bad++; continue; }
    const errs = shape(mutants, `tools/mutants/${name}.json`);
    if (errs.length) { for (const e of errs) say('  ' + e); bad++; continue; }
    const t0 = Date.now();
    const slow = SLOW.includes(toolName);
    const r = await mutate(fs.readFileSync(tool, 'utf8'), mutants, toolName, tools, limit, slow ? 1 : WIDTH, slow ? await machineHold(waitMs) : null, part);
    if (r.busy) { say(`mutate ${name}: the machine's Chrome lock was not free within ${Math.round(waitMs / 1000)} s, so the list did not finish`); bad++; continue; }
    if (r.broken) { say(`mutate ${name}: the selftest fails before any mutation`); bad++; continue; }
    say(`mutate ${name}: ${mutants.length} broken rules, ${r.caught} caught by the selftest${r.timedOut.length ? `, ${r.timedOut.length} timed out` : ''}, ${r.reruns.length} run again, ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const x of r.reruns) say(`  RERUN     ${x.name}: stopped at the limit once, then ${{ pass: 'survived', fail: 'caught', timeout: 'stopped again' }[x.result]}`);
    for (const n of r.survived) say(`  SURVIVED  ${n}: the selftest passes with this rule broken, so nothing tests it`);
    for (const n of r.stale) say(`  STALE     ${n}: its "from" text is not in the tool exactly once; rewrite the mutant for the current code`);
    for (const n of r.noop) say(`  NO CHANGE ${n}: its "to" equals its "from", so it breaks nothing`);
    for (const t of r.timedOut) say(`  TIMED OUT ${t.name}: the selftest did not end within ${limit / 1000} s, twice; ${t.reason ? `declared: ${t.reason}` : 'nothing saw it fail, so it is not caught'}`);
    if (r.survived.length || r.stale.length || r.noop.length || r.timedOut.some((t) => !t.reason)) bad++;
  }
  return bad ? 1 : 0;
}

// part 'core': the cases that catch the entries of tools/mutants/mutate.core.json (the ones main had before 2026-11-17),
// a few seconds; with no part, every case
async function selftest(part) {
  const core = part === 'core';
  // a toy gate: one rule that is tested, one that is not
  const toy = [
    `const add = (a, b) => a + b;`,
    `const twice = (a) => a + a;`,
    `const label = (n) => (n > 9 ? 'big' : 'small');`,
    `if (process.argv[2] === 'selftest') { const ok = add(2, 2) === 4; console.log(ok ? 'toy selftest: 1/1' : 'FAIL'); process.exit(ok ? 0 : 1); }`,
    ``,
  ].join('\n');
  const CAUGHT = { name: 'addition subtracts', from: 'a + b', to: 'a - b' };
  // the folder name holds a space and a tilde: a path a URL would percent-encode
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate self~1 '));
  // the machine's lock of drives, for this selftest a file of its own: it neither waits on a drive nor holds one up
  process.env.LABS_DRIVE_LOCK = path.join(root, 'machine.lock');
  const MACHINE = process.env.LABS_DRIVE_LOCK, DRIVE = pathToFileURL(path.join(TOOLS, 'drive.mjs')).href;
  const { WATCHDOG_EXIT } = await import(DRIVE);
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean) : []);
  let unquoted = null, r, crlf, broken, hung, cli = {}, tm, said = {}, codes = {}, runsPast = '', reruns = [], readBack = {}, lockSeen = '', slowRuns = [], renamed = null, gitless = null;
  let held = {}, fake = {}, imported = {}, ranAt = 0, busyStarted = true, orphans = {};
  try {
    const M = [CAUGHT, { name: 'label threshold moved', from: 'n > 9', to: 'n > 99' }, { name: 'text that is not there', from: 'a * b', to: 'a / b' },
      { name: 'text that is there twice', from: 'a + ', to: 'a - ' }, { name: 'a mutant that changes nothing', from: 'a + b', to: 'a + b' }];
    r = await mutate(toy, M, 'toy');
    crlf = await mutate(toy.replace(/\n/g, '\r\n'), [{ name: 'spans two lines', from: 'a + b;\nconst twice', to: 'a - b;\nconst twice' }], 'toy');
    broken = await mutate(toy.replace('=== 4', '=== 5'), M, 'toy');
    // a selftest that is still running at the limit (it ends by itself a few seconds later, so nothing is left behind)
    hung = await mutate(toy.replace('process.exit(ok ? 0 : 1); }', 'setTimeout(() => process.exit(ok ? 0 : 1), 8000); }'), [CAUGHT], 'toy', undefined, 1500);
    // the command itself, run as CI runs it, on toy tools folders
    const make = (name, files) => { const t = path.join(root, name, 'tools'); fs.mkdirSync(path.join(t, 'mutants'), { recursive: true }); for (const [f, body] of Object.entries(files)) { if (body === null) fs.rmSync(path.join(t, f), { recursive: true, force: true }); else fs.writeFileSync(path.join(t, f), body); } return t; };
    const J = (list) => JSON.stringify(list);
    // the command itself, as CI runs it: four at a time, each with a lock file of its own, so that none waits on another
    let lockN = 0;
    const cmd = (args, cwd) => () => new Promise((res) => {
      const k = spawn(process.execPath, args, { cwd, env: { ...process.env, LABS_DRIVE_LOCK: path.join(root, `cmd${lockN++}.lock`) }, stdio: ['ignore', 'pipe', 'ignore'] });
      let text = '';
      const timer = setTimeout(() => k.kill(), 120000);
      k.stdout.on('data', (d) => { text += d; });
      k.on('close', (c) => { clearTimeout(timer); res({ code: c, text }); });
    });
    const code = (tools, ...args) => cmd([SELF, ...args, '--tools', tools]);
    let extra = {};
    if (!core) {
    // runs stopped at the limit. LIM is short; a toy stopped at it would end by itself (12 s at most), so none is left
    // behind. The three calls run at once: their toys wait on timers, so they do not slow one another.
    const LIM = 1500, END = 'process.exit(ok ? 0 : 1); }', count = path.join(root, 'past.runs'), log = path.join(root, 'reruns.log'), log2 = path.join(root, 'reruns2.log'), lockLog = path.join(root, 'lock.seen');
    const late = (ms) => `setTimeout(() => process.exit(1), ${ms}); }`;
    // stopped on its first run; its second run ends at once with the code given, and writes when it ran
    const flaky = (code, to = log) => `const { existsSync, writeFileSync, appendFileSync } = await import('node:fs'); const mark = new URL('./mark', import.meta.url); if (!existsSync(mark)) { writeFileSync(mark, ''); ${late(12000)} else { appendFileSync(${J(to)}, 'start ' + Date.now() + String.fromCharCode(10)); const t = Date.now() + 250; while (Date.now() < t); appendFileSync(${J(to)}, 'end ' + Date.now() + String.fromCharCode(10)); process.exit(${code}); } }`;
    said.und = []; said.dec = []; said.surv = [];
    [tm, codes.und, codes.surv, codes.dec] = await Promise.all([
      mutate(toy, [{ name: 'fails 0.5 s past the limit', from: END, to: `const { appendFileSync } = await import('node:fs'); appendFileSync(${J(count)}, 'n'); ${late(2000)}` },
        { name: 'stopped once, then passes', from: END, to: flaky(0) }, { name: 'stopped once, then fails', from: END, to: flaky(1) },
        { name: 'fails 0.7 s inside the limit', from: END, to: late(800) },
        { name: 'names its lock', from: END, to: `const { writeFileSync } = await import('node:fs'); writeFileSync(${J(lockLog)}, String(process.env.LABS_DRIVE_LOCK)); process.exit(1); }` },
        { name: 'stops itself at its own limit', from: END, to: `process.exit(${WATCHDOG_EXIT}); }` }], 'toy', undefined, LIM),
      // the command's report of a timeout, undeclared and declared, and of a second run
      run(undefined, make('timeout-undeclared', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, { name: 'a break that never ends', from: END, to: late(12000) }]) }), (l) => said.und.push(l), { limit: LIM }),
      run(undefined, make('rerun-survives', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, { name: 'stopped once, then survives', from: END, to: flaky(0, log2) }]) }), (l) => said.surv.push(l), { limit: LIM }),
      run(undefined, make('timeout-declared', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, { name: 'a break that never ends', from: END, to: late(12000), timeout: 'the break is an endless loop' }, { name: 'stopped once, then caught', from: END, to: flaky(1, log2) }]) }), (l) => said.dec.push(l), { limit: LIM }),
    ]);
    lockSeen = fs.readFileSync(lockLog, 'utf8');
    runsPast = fs.readFileSync(count, 'utf8');
    reruns = fs.readFileSync(log, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => l.split(' ')[0]);
    // imported, it runs nothing and gives WATCHDOG (tools/drive.mjs's selftest reads it): from a script, and from node -e
    const importer = path.join(root, 'importer.mjs');
    fs.writeFileSync(importer, `const m = await import(${J(pathToFileURL(SELF).href)}); console.log('imported ' + m.WATCHDOG);`);
    const imp = (args) => { const x = spawnSync(process.execPath, args, { stdio: 'pipe', timeout: 60000 }); return { code: x.status, text: String(x.stdout).trim() }; };
    imported.script = imp([importer]); imported.evaluated = imp(['--input-type=module', '-e', fs.readFileSync(importer, 'utf8')]);
    // a hold of the machine's lock that is not free: at the first copy, nothing runs and the list is not broken; at a
    // later one, the copies left run no more and do not ask again
    let asked = 0;
    fake.first = await mutate(toy, [CAUGHT], 'toy', undefined, LIMIT_MS, 1, async () => { asked++; return 'busy'; });
    fake.firstAsked = asked; asked = 0;
    fake.later = await mutate(toy, [CAUGHT, { name: 'addition adds one more', from: 'a + b', to: 'a + b + 1' }], 'toy', undefined, LIMIT_MS, 1, async (go) => (asked++ === 1 ? 'busy' : go()));
    fake.laterAsked = asked;
    // a run stopped while a copy runs: the copy and what the copy started end with it (exit, SIGTERM, SIGINT, and a copy
    // stopped at the limit). What the copy starts here is detached, out of the job in which Windows ends a Node process's
    // children with it, so that only the tree kill can end it. Killed outright, mutate leaves the machine's lock to a dead
    // pid, and a waiting drive takes it
    const orphanRun = async (how, slowList) => {
      const dir = path.join(root, 'orphan-' + how), pids = path.join(dir, 'pids.txt'), lock = path.join(dir, 'machine.lock');
      const copy = `const { spawn } = await import('node:child_process'); const { writeFileSync } = await import('node:fs'); const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', detached: true }); process.on('SIGTERM', () => { try { g.kill(); } catch { /* gone */ } process.exit(143); }); writeFileSync(${J(pids)}, process.pid + ' ' + g.pid); setTimeout(() => process.exit(1), 30000); }`;
      const tools = make('orphan-' + how, { 'toy.mjs': toy, [slowList ? 'drive.mjs' : 'other.mjs']: toy, [`mutants/${slowList ? 'drive' : 'toy'}.json`]: J([{ name: 'a copy that waits', from: END, to: copy }]) });
      if (slowList) fs.rmSync(path.join(tools, 'mutants', 'toy.json'), { force: true });
      const script = path.join(dir, 'stop.mjs');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(script, `import { existsSync } from 'node:fs'; const { run } = await import(${J(pathToFileURL(SELF).href)}); const how = ${J(how)};
const look = setInterval(() => { if (!existsSync(${J(pids)})) return; clearInterval(look); if (how === 'exit') process.exit(7); else if (how !== 'limit' && how !== 'kill') process.emit(how); }, 20);
process.exit(await run(undefined, ${J(tools)}, () => {}, how === 'limit' ? { limit: 1000 } : {}));`);
      const k = spawn(process.execPath, [script], { stdio: 'ignore', env: { ...process.env, LABS_DRIVE_LOCK: lock } });
      const out = { code: null, pids: [], gone: false, lockTaken: null };
      if (how === 'kill') {
        for (let i = 0; i < 300 && !fs.existsSync(pids); i++) await sleep(20);
        const heldBy = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, 'utf8')).pid : null;
        k.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        await new Promise((r) => k.once('exit', r));
        const { holdChrome } = await import(DRIVE);
        const t0 = Date.now(), got = await holdChrome(3000, lock);
        out.lockTaken = { heldBy: heldBy === k.pid, got: !!got, ms: Date.now() - t0 };
        if (got) got();
      } else out.code = await new Promise((r) => k.once('exit', (c) => r(c)));
      out.pids = (fs.existsSync(pids) ? fs.readFileSync(pids, 'utf8') : '').split(' ').map(Number).filter(Boolean);
      const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
      for (let i = 0; i < 100 && how !== 'kill' && out.pids.some(alive); i++) await sleep(50);
      out.gone = out.pids.length === 2 && !out.pids.some(alive);
      for (const pid of out.pids) if (alive(pid)) { if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' }); else try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      return out;
    };
    [orphans.exit, orphans.term, orphans.int, orphans.limit, orphans.kill] = await Promise.all([orphanRun('exit'), orphanRun('SIGTERM'), orphanRun('SIGINT'), orphanRun('limit'), orphanRun('kill', true)]);
    // which lists run: a folder with a slow list (drive) and another (toy)
    // its two copies write when they run, with the pid that holds the machine's lock then: a slow list runs them one at
    // a time, each under mutate's hold of that lock
    const slowLog = path.join(root, 'slow.log'), busy = `const { appendFileSync, readFileSync } = await import('node:fs'); let pid = ''; try { pid = JSON.parse(readFileSync(${J(MACHINE)}, 'utf8')).pid; } catch { /* free */ } appendFileSync(${J(slowLog)}, 'start ' + Date.now() + ' ' + pid + String.fromCharCode(10)); const t = Date.now() + 400; while (Date.now() < t); appendFileSync(${J(slowLog)}, 'end ' + Date.now() + String.fromCharCode(10)); process.exit(1); }`;
    const slow = make('slow', { 'toy.mjs': toy, 'drive.mjs': toy, 'mutants/toy.json': J([CAUGHT]), 'mutants/drive.json': J([{ name: 'busy one', from: END, to: busy }, { name: 'busy two', from: END, to: busy.replace('400', '401') }]) });
    // another holder of the machine's lock, and another drive that waits for it: children that log when they hold it
    const holdLog = path.join(root, 'hold.log'), waitLog = path.join(root, 'wait.log');
    const child = (file, body) => { fs.writeFileSync(file, `import { appendFileSync, readFileSync } from 'node:fs'; const { holdChrome } = await import(${J(DRIVE)}); const nap = (ms) => new Promise((r) => setTimeout(r, ms)); const at = (log, w) => appendFileSync(log, w + ' ' + Date.now() + String.fromCharCode(10)); ${body}`); return spawn(process.execPath, [file], { stdio: 'ignore' }); };
    const ended = (k) => new Promise((res) => { if (k.exitCode !== null) res(); else k.once('exit', res); });
    said.skip = []; said.ran = [];
    codes.skip = await run(undefined, slow, (l) => said.skip.push(l), { changed: ['labs/a.css', 'tools/drives/air.mjs'] });
    const holder = child(path.join(root, 'holder.mjs'), `const give = await holdChrome(5000, ${J(MACHINE)}); at(${J(holdLog)}, 'held'); await nap(2500); at(${J(holdLog)}, 'freed'); give();`);
    for (let i = 0; i < 100 && !fs.existsSync(holdLog); i++) await sleep(50);
    // while it holds the lock: the slow list waits 600 ms and gives up; the other list does not wait for it
    said.busy = []; said.free = [];
    [codes.busy, codes.free] = await Promise.all([run('drive', slow, (l) => said.busy.push(l), { waitMs: 600 }), run('toy', slow, (l) => said.free.push(l), { waitMs: 600 })]);
    busyStarted = fs.existsSync(slowLog);
    // the waiting drive asks for the lock once a copy has started, and holds it 100 ms
    const waiter = child(path.join(root, 'waiter.mjs'), `for (const t0 = Date.now(); Date.now() - t0 < 20000; await nap(20)) { let s = ''; try { s = readFileSync(${J(slowLog)}, 'utf8'); } catch { /* not yet */ } if (s.includes('start')) break; } const give = await holdChrome(20000, ${J(MACHINE)}); at(${J(waitLog)}, 'got'); await nap(100); at(${J(waitLog)}, 'gave'); give();`);
    ranAt = Date.now();
    codes.ran = await run(undefined, slow, (l) => said.ran.push(l), { changed: ['labs/a.css', 'tools/drive.mjs'] });
    await Promise.race([Promise.all([ended(holder), ended(waiter)]), sleep(5000)]);
    holder.kill(); waiter.kill();
    slowRuns = read(slowLog); held.hold = read(holdLog); held.wait = read(waitLog);
    // a watched file renamed away still counts: git names a rename as a deletion and an addition
    const repo = path.join(root, 'repo'), git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...a], { cwd: repo, stdio: 'pipe' }).status;
    fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'tools', 'drive.mjs'), 'export const x = 1;' + String.fromCharCode(10));
    // main moves on after the branch: what main gained is not the branch's change (merge base, three dots)
    const onMain = () => { fs.mkdirSync(path.join(repo, 'labs'), { recursive: true }); fs.writeFileSync(path.join(repo, 'labs', 'x.css'), 'a {}' + String.fromCharCode(10)); return git('checkout', '-q', 'main') === 0 && git('add', 'labs') === 0 && git('commit', '-qm', 'main moves') === 0 && git('checkout', '-q', 'moved') === 0; };
    const hasRepo = git('init', '-q') === 0 && git('add', '.') === 0 && git('commit', '-qm', 'one') === 0 && git('checkout', '-qb', 'moved') === 0 && git('mv', 'tools/drive.mjs', 'tools/driver.mjs') === 0 && git('commit', '-qm', 'two') === 0 && onMain();
    if (hasRepo) renamed = changedSince('main', repo);
    // a name with a letter outside ASCII comes back as it is
    const accented = 'labs/caf' + String.fromCharCode(0xe9) + '.css';
    if (hasRepo && (fs.mkdirSync(path.join(repo, 'labs'), { recursive: true }), fs.writeFileSync(path.join(repo, accented), 'a {}' + String.fromCharCode(10)), git('add', '.') === 0) && git('commit', '-qm', 'three') === 0) unquoted = changedSince('HEAD~1', repo);
    gitless = changedSince('no-such-ref', repo);
    const listed = path.join(root, 'changed.txt');
    fs.writeFileSync(listed, 'labs/a.css' + String.fromCharCode(13, 10) + '  tools/drives/air.mjs ' + String.fromCharCode(10, 10));
    readBack.file = readChanged(listed); readBack.none = readChanged(path.join(root, 'nowhere.txt'));
    // a list named <tool>.<part>.json breaks <tool>.mjs and runs "selftest <part>": a toy whose selftest passes only so;
    // a list of a tool that drives Chrome holds the machine's lock, whatever its part
    const toyPart = toy.replace('const ok = add(2, 2) === 4;', "const ok = add(2, 2) === 4 && process.argv[3] === 'quick';");
    said.part = []; said.ghost = [];
    codes.part = await run(undefined, make('parts', { 'toy.mjs': toyPart, 'mutants/toy.quick.json': J([CAUGHT]) }), (l) => said.part.push(l));
    codes.ghost = await run(undefined, make('ghost-part', { 'toy.mjs': toy, 'mutants/ghost.quick.json': J([CAUGHT]) }), (l) => said.ghost.push(l));
    const partLog = path.join(root, 'part.log');
    const partCopy = `const { appendFileSync, readFileSync } = await import('node:fs'); let pid = ''; try { pid = JSON.parse(readFileSync(${J(MACHINE)}, 'utf8')).pid; } catch { /* free */ } appendFileSync(${J(partLog)}, String(pid)); process.exit(1); }`;
    codes.slowPart = await run('drive.quick', make('slow-part', { 'drive.mjs': toyPart, 'mutants/drive.quick.json': J([{ name: 'a copy that names the lock holder', from: END, to: partCopy }]) }), () => {});
    held.part = fs.existsSync(partLog) ? fs.readFileSync(partLog, 'utf8') : '';
    extra = {
      renamed: hasRepo ? cmd([SELF, '--changed-since', 'main', '--tools', slow], repo) : async () => null,
      gitless: cmd([SELF, '--changed-since', 'no-such-ref', '--tools', slow], repo),
      skip: cmd([SELF, '--changed', listed, '--tools', slow]),
      lost: cmd([SELF, '--changed', path.join(root, 'nowhere.txt'), '--tools', slow]),
      noRef: cmd([SELF, '--tools', slow, '--changed-since']),
    };
    }
    // and from its own folder, with no --tools: the folder is found whatever characters its path holds
    const own = make('own folder', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) });
    fs.copyFileSync(SELF, path.join(own, 'mutate.mjs'));
    const tasks = {
      clean: code(make('clean', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) })),
      survivor: code(make('survivor', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[1]]) })),
      stale: code(make('stale', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[2]]) })),
      noop: code(make('noop', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[4]]) })),
      malformed: code(make('malformed', { 'toy.mjs': toy, 'mutants/toy.json': '[{"name": "addition subtracts",}]' })),
      bom: code(make('bom', { 'toy.mjs': toy, 'mutants/toy.json': String.fromCharCode(0xFEFF) + J([CAUGHT]) })),
      stray: code(make('stray', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]), 'mutants/other.JSON': J([M[1]]) })),
      unnamed: code(make('unnamed', { 'toy.mjs': toy, 'mutants/toy.json': J([{ from: 'a + b', to: 'a - b' }]) })),
      missingTool: code(make('missing-tool', { 'mutants/toy.json': J([CAUGHT]) })),
      brokenBase: code(make('broken-base', { 'toy.mjs': toy.replace('=== 4', '=== 5'), 'mutants/toy.json': J([CAUGHT]) })),
      unknownName: code(make('unknown-name', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) }), 'ghost'),
      noFolder: code(make('no-folder', { 'toy.mjs': toy, mutants: null })),
      emptyFolder: code(make('empty-folder', { 'toy.mjs': toy })),
      ownFolder: cmd([path.join(own, 'mutate.mjs')]),
      ...extra,
    };
    const keys = Object.keys(tasks);
    let nextTask = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { for (let k = nextTask++; k < keys.length; k = nextTask++) cli[keys[k]] = await tasks[keys[k]](); }));
    for (const k of ['clean', 'survivor', 'stale', 'noop', 'malformed', 'bom', 'stray', 'unnamed', 'missingTool', 'brokenBase', 'unknownName', 'noFolder', 'emptyFolder']) cli[k] = cli[k].code;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const cases = [
    ['a broken rule that the selftest tests is caught', r.caught === 1],
    ['a broken rule that nothing tests survives and is named', r.survived.length === 1 && r.survived[0] === 'label threshold moved'],
    ['a mutant whose text is gone, or is there twice, is stale', r.stale.length === 2 && r.stale.includes('text that is not there') && r.stale.includes('text that is there twice')],
    ['a mutant that changes nothing is reported as that', r.noop.length === 1 && r.noop[0] === 'a mutant that changes nothing'],
    ['line endings do not hide a mutant', crlf.caught === 1 && !crlf.stale.length],
    ['a selftest that fails before any mutation is reported, not counted as catching', broken.broken === true && broken.caught === 0],
    ['a selftest that does not end within the limit counts as failed', hung.broken === true && hung.caught === 0],
    ['a mutants file must name each rule and give exact text', shape([{ name: 'x', from: '', to: '' }], 't').length === 2 && shape([], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b' }], 't').length === 0 && shape([{ name: 'a rule broken', from: 'a' }], 't').length === 1],
    ['the same mutant listed twice is refused', shape([{ name: 'a rule broken', from: 'a', to: 'b' }, { name: 'a rule broken', from: 'c', to: 'd' }], 't').some((e) => e.includes('twice'))],
    ['the command exits 0 when every broken rule is caught', cli.clean === 0],
    ['the command fails on a survivor', cli.survivor === 1],
    ['the command fails on a stale mutant', cli.stale === 1],
    ['the command fails on a mutant that changes nothing', cli.noop === 1],
    ['the command fails on a mutants file that is not JSON, and reads one that starts with a byte order mark', cli.malformed === 1 && cli.bom === 0],
    ['the command fails on a mutants file whose mutants have no names', cli.unnamed === 1],
    ['the command fails on a file in the mutants folder that is not <tool>.json', cli.stray === 1],
    ['the command fails when the tool a mutants file names is missing', cli.missingTool === 1],
    ['the command fails when the tool fails its selftest unbroken', cli.brokenBase === 1],
    ['a tool named on the command line with no mutants file exits 2', cli.unknownName === 2],
    ['no mutants folder, or an empty one, is a failure and never a pass', cli.noFolder === 1 && cli.emptyFolder === 1],
    ['the command finds its own folder when the path holds a space and a tilde', cli.ownFolder.code === 0 && /mutate toy: 1 broken rules, 1 caught/.test(cli.ownFolder.text), JSON.stringify(cli.ownFolder)],
    // since 2026-11-21 every list is gated: each runs when one of its own files changed, alone, and for nothing else
    ['each list runs when its tool, its list, a sibling its tool reads, mutate.mjs or the gates workflow changed, each alone; another gate\'s file, a near name or a lab file runs none', (() => {
      const OWN = { atlas: ['tools/atlas.mjs'], evolution: ['tools/evolution.mjs'], lab_tests: ['tools/lab_tests.mjs'], ship_pr: ['tools/ship_pr.mjs'], stories: ['tools/stories.mjs'],
        'labs-wt': ['tools/labs-wt.mjs', 'tools/drive.mjs', 'tools/levels.mjs', 'tools/ship_pr.mjs'], 'mutate.core': ['tools/drive.mjs'],
        'drive.waits': ['tools/drive.mjs', 'tools/invariants.mjs', 'tools/drives/invariants.mjs', 'tools/mutants/drive.json', 'tools/mutants/invariants.json'] };
      const bad = [];
      for (const [n, files] of Object.entries(OWN)) {
        for (const f of [...files, `tools/mutants/${n}.json`, 'tools/mutate.mjs', '.github/workflows/gates.yml']) if (JSON.stringify(listsToRun([n], [f])) !== JSON.stringify({ run: [n], skipped: [], hits: { [n]: [f] } })) bad.push(`${n} not run by ${f}`);
        for (const f of ['tools/anti_tells.mjs', `tools/${n.split('.')[0]}.mjs.orig`, `x/tools/mutants/${n}.json`, 'labs/assets/js/kit/fog.js']) if (listsToRun([n], [f]).run.length) bad.push(`${n} run by ${f}`);
      }
      return bad.length === 0 || (console.log('  ' + bad.join('; ')), false);
    })()],
    ['a pull request that touches no gate tool runs no list', (() => {
      const folder = path.join(TOOLS, 'mutants'), lists = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : Object.keys(GATED);
      const plan = listsToRun(lists, ['labs/assets/js/kit/fog.js', 'labs/orthogonal.html', 'tools/drives/orthogonal.mjs', 'tools/anti_tells.mjs', 'ROADMAP.md']);
      return lists.length >= 11 && plan.run.length === 0;
    })()],
    ['every list has its entry, and the entry holds its tool, its list, the runner and every sibling its tool spells as a quoted name', (() => {
      const folder = path.join(TOOLS, 'mutants'), lists = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : Object.keys(GATED);
      const siblings = fs.readdirSync(TOOLS).filter((f) => /\.(mjs|js|json)$/.test(f)), bad = [];
      for (const n of lists) {
        const tool = n.split('.')[0];
        if (!Object.hasOwn(GATED, n)) { bad.push(`${n}: no entry`); continue; }
        const need = [`tools/${tool}.mjs`, `tools/mutants/${n}.json`, 'tools/mutate.mjs', '.github/workflows/gates.yml'];
        if (fs.existsSync(path.join(TOOLS, `${tool}.mjs`))) need.push(...quotedSiblings(fs.readFileSync(path.join(TOOLS, `${tool}.mjs`), 'utf8'), siblings, `${tool}.mjs`).map((s) => `tools/${s}`));
        for (const f of need) if (!GATED[n].includes(f)) bad.push(`${n}: lacks ${f}`);
      }
      return bad.length === 0 || (console.log('  ' + bad.join('; ')), false);
    })()],
    ['a sibling counts as read when it is quoted bare or after ./, not as a repository path, in a comment or inside a longer name', JSON.stringify(quotedSiblings("import('./a.mjs'); join(d, 'b.mjs'); join(d, \"c.json\"); `d.mjs`; 'tools/e.mjs'; // f.mjs\n'xg.mjs'; 'self.mjs'", ['a.mjs', 'b.mjs', 'c.json', 'd.mjs', 'e.mjs', 'f.mjs', 'g.mjs', 'self.mjs'], 'self.mjs')) === JSON.stringify(['a.mjs', 'b.mjs', 'c.json', 'd.mjs'])],
  ];
  if (!core) cases.push(
    ['a run stopped at the limit, and stopped again on its second run, is timed out, apart from caught and survived; it ran twice, no more',
      tm.timedOut.length === 2 && tm.timedOut.find((t) => t.name === 'fails 0.5 s past the limit').reason === undefined && runsPast === 'nn'],
    ['a run stopped once is counted by its second run: passing, it survives; failing, it is caught', tm.survived.length === 1 && tm.survived[0] === 'stopped once, then passes' && tm.caught === 3],
    ['a selftest that stops itself at its own limit (exit 124) is timed out, not caught, after a second run', tm.timedOut.some((t) => t.name === 'stops itself at its own limit') && tm.reruns.some((x) => x.name === 'stops itself at its own limit' && x.result === 'timeout')],
    ['every run stopped at the limit is run again and named with what its second run did; a run inside the limit is not', JSON.stringify(tm.reruns.map((x) => x.name + ':' + x.result).sort()) === JSON.stringify(['fails 0.5 s past the limit:timeout', 'stopped once, then fails:fail', 'stopped once, then passes:pass', 'stops itself at its own limit:timeout'])],
    ['each run of a list gets a lock file of its own, not the machine\'s nor the one this process was given', /mutate-[^/\\]+[/\\]chrome\.lock$/.test(lockSeen) && lockSeen !== String(process.env.LABS_DRIVE_LOCK), lockSeen],
    ['the second runs run alone, one after another', reruns.join(' ') === 'start end start end'],
    ['a run that ends 0.7 s inside the limit is counted, one that ends 0.5 s past it is timed out', !tm.timedOut.some((t) => t.name === 'fails 0.7 s inside the limit') && tm.timedOut.some((t) => t.name === 'fails 0.5 s past the limit')],
    ['the command reports a timeout and counts it in the summary; it fails on one undeclared and passes on one declared',
      codes.und === 1 && codes.dec === 0 && said.und.some((l) => /^mutate toy: 2 broken rules, 1 caught by the selftest, 1 timed out, 1 run again, \d+ s$/.test(l))
      && said.und.includes('  RERUN     a break that never ends: stopped at the limit once, then stopped again') && codes.surv === 1 && said.surv.includes('  RERUN     stopped once, then survives: stopped at the limit once, then survived')
      && said.dec.includes('  RERUN     stopped once, then caught: stopped at the limit once, then caught') && said.dec.some((l) => /^mutate toy: 3 broken rules, 2 caught by the selftest, 1 timed out, 2 run again, \d+ s$/.test(l))
      && said.und.some((l) => /^  TIMED OUT a break that never ends: the selftest did not end within 1.5 s, twice; nothing saw it fail/.test(l))
      && said.dec.some((l) => /^  TIMED OUT a break that never ends: .*declared: the break is an endless loop$/.test(l))],
    ['a timeout is declared with its reason, 8 characters or more', shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: '' }], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: 'seven c' }], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: 'eight ch' }], 't').length === 0],
    ['mutate\'s own list runs when mutate.mjs, its list, drive.mjs or the gates workflow changed, each alone; the core list\'s own list runs the core list and not the other two', ['tools/mutate.mjs', 'tools/mutants/mutate.json', 'tools/drive.mjs', '.github/workflows/gates.yml'].every((f) => JSON.stringify(listsToRun(['mutate'], [f]).run) === JSON.stringify(['mutate']))
      && JSON.stringify(listsToRun(['atlas', 'mutate', 'mutate.core'], ['labs/a.css', 'tools/mutants/mutate.core.json'])) === JSON.stringify({ run: ['mutate.core'], skipped: ['atlas', 'mutate'], hits: { 'mutate.core': ['tools/mutants/mutate.core.json'] } })],
    ['each gated list is run by its own files: invariants.mjs runs drive and invariants, not mutate; mutate\'s list runs mutate, not the other two', JSON.stringify(listsToRun(['drive', 'invariants', 'mutate'], ['tools/invariants.mjs'])) === JSON.stringify({ run: ['drive', 'invariants'], skipped: ['mutate'], hits: { drive: ['tools/invariants.mjs'], invariants: ['tools/invariants.mjs'] } })
      && JSON.stringify(listsToRun(['drive', 'invariants', 'mutate'], ['tools/mutants/mutate.json'])) === JSON.stringify({ run: ['mutate'], skipped: ['drive', 'invariants'], hits: { mutate: ['tools/mutants/mutate.json'] } })
      && JSON.stringify(listsToRun(['constructor', 'toString'], ['x']).run) === JSON.stringify(['constructor', 'toString'])],
    ['a list named <tool>.<part>.json breaks <tool>.mjs and runs that part of its selftest; one whose tool is missing is a failure that names it', codes.part === 0 && said.part.some((l) => /^mutate toy\.quick: 1 broken rules, 1 caught by the selftest/.test(l)) && codes.ghost === 1 && said.ghost.includes('mutate ghost.quick: tools/ghost.mjs does not exist'), JSON.stringify([said.part, said.ghost])],
    ['a list of a tool that drives Chrome holds the machine lock, whatever its part', codes.slowPart === 0 && held.part === String(process.pid), JSON.stringify([codes.slowPart, held.part])],
    ['with no list of changes every list runs', JSON.stringify(listsToRun(['atlas', 'drive', 'invariants'], null).run) === JSON.stringify(['atlas', 'drive', 'invariants'])],
    ['each watched file alone runs the slow lists, the gates workflow among them', ['tools/drive.mjs', 'tools/invariants.mjs', 'tools/drives/invariants.mjs', 'tools/mutants/drive.json', 'tools/mutants/invariants.json', 'tools/mutate.mjs', '.github/workflows/gates.yml'].every((f) => JSON.stringify(listsToRun(['toy', 'drive', 'invariants'], [f]).run) === JSON.stringify(['toy', 'drive', 'invariants']))],
    ['a change to none of their files skips the gated lists and runs a list GATED does not name, a near name included', JSON.stringify(listsToRun(['atlas', 'drive', 'invariants', 'toy'], ['labs/a.css', 'tools/drives/air.mjs', 'tools/drive.mjs.orig', 'x/tools/drive.mjs'])) === JSON.stringify({ run: ['toy'], skipped: ['atlas', 'drive', 'invariants'], hits: {} }) && JSON.stringify(listsToRun(['atlas', 'drive'], []).skipped) === JSON.stringify(['atlas', 'drive'])],
    ['the command says which way it went', codes.skip === 0 && said.skip.some((l) => l === 'mutate: skipped drive: none of tools/drive.mjs, tools/invariants.mjs, tools/drives/invariants.mjs, tools/mutants/drive.json, tools/mutants/invariants.json, tools/mutate.mjs, .github/workflows/gates.yml changed') && !said.skip.some((l) => l.startsWith('mutate drive:')) && said.skip.some((l) => l.startsWith('mutate toy:'))
      && codes.ran === 0 && said.ran.includes('mutate: ran drive: changed files tools/drive.mjs') && said.ran.some((l) => /^mutate drive: 2 broken rules, 2 caught by the selftest, 0 run again, \d+ s$/.test(l))],
    ['a slow list runs its copies one at a time', slowRuns.map((l) => l.split(' ')[0]).join(' ') === 'start end start end', slowRuns.join(' ')],
    ['while another holds the machine\'s lock, a slow list waits for it, and holds it itself around each copy', (() => {
      const freed = +((held.hold.find((l) => l.startsWith('freed ')) || '').split(' ')[1]), starts = slowRuns.filter((l) => l.startsWith('start '));
      return ranAt < freed && starts.length === 2 && +starts[0].split(' ')[1] >= freed && starts.every((l) => l.split(' ')[2] === String(process.pid));
    })(), JSON.stringify([held.hold, ranAt, slowRuns])],
    ['between two copies a drive that waits gets its turn: the lock is free for 600 ms', (() => {
      const t = (list, w, k = 0) => +((list.filter((l) => l.startsWith(w + ' '))[k] || '').split(' ')[1]);
      const e1 = t(slowRuns, 'end'), s2 = t(slowRuns, 'start', 1), got = t(held.wait, 'got'), gave = t(held.wait, 'gave');
      return got >= e1 && gave <= s2 && s2 - e1 >= 590;
    })(), JSON.stringify([held.wait, slowRuns])],
    ['a list that does not drive Chrome does not wait for the machine lock', codes.free === 0 && said.free.some((l) => /^mutate toy: 1 broken rules, 1 caught/.test(l)), JSON.stringify(said.free)],
    ['a slow list whose lock is not free in its time is a failure that says so, and none of its copies runs', codes.busy === 1 && said.busy.includes('mutate drive: the machine\'s Chrome lock was not free within 1 s, so the list did not finish') && !busyStarted, JSON.stringify(said.busy)],
    ['a lock not free at the first copy runs nothing and is not a broken list; at a later copy, the copies left neither run nor ask again', fake.first.busy && !fake.first.broken && fake.first.caught === 0 && fake.firstAsked === 1 && fake.later.busy && !fake.later.broken && fake.later.caught === 0 && fake.laterAsked === 2, JSON.stringify([fake.first, fake.firstAsked, fake.later, fake.laterAsked])],
    ['a run stopped by its exit, by SIGTERM (143) or by SIGINT (130) ends the copy it runs and what that copy started', orphans.exit.code === 7 && orphans.exit.gone && orphans.term.code === 143 && orphans.term.gone && orphans.int.code === 130 && orphans.int.gone, JSON.stringify([orphans.exit, orphans.term, orphans.int])],
    ['a copy stopped at the limit ends with what it started', orphans.limit.code === 1 && orphans.limit.gone, JSON.stringify(orphans.limit)],
    ['killed outright while it holds the machine lock for a copy, mutate leaves the lock to a dead pid, and a waiting drive takes it at once', !!orphans.kill.lockTaken && orphans.kill.lockTaken.heldBy && orphans.kill.lockTaken.got && orphans.kill.lockTaken.ms < 1500, JSON.stringify(orphans.kill)],
    ['the code read as timed out is the one tools/drive.mjs stops its selftests with', WATCHDOG === WATCHDOG_EXIT, `${WATCHDOG} and ${WATCHDOG_EXIT}`],
    ['imported, from a script or from node -e, it runs nothing and gives WATCHDOG', [imported.script, imported.evaluated].every((x) => x.code === 0 && x.text === 'imported ' + WATCHDOG), JSON.stringify(imported)],
    ['--changed-since with no ref runs every list and says so; git is not asked', changedSince('') === null && cli.noRef.code === 0 && cli.noRef.text.includes('mutate: --changed-since was given no ref, so every list runs') && /mutate drive: 2 broken rules, 2 caught/.test(cli.noRef.text), cli.noRef.text],
    ['git names a watched file renamed away, so the slow lists run; the command asks it with --changed-since', JSON.stringify(renamed) === JSON.stringify(['tools/drive.mjs', 'tools/driver.mjs']) && !!cli.renamed && cli.renamed.code === 0 && cli.renamed.text.includes('mutate: ran drive: changed files tools/drive.mjs'), JSON.stringify([renamed, cli.renamed])],
    ['a changed name with a letter outside ASCII comes back as it is, not quoted', JSON.stringify(unquoted) === JSON.stringify(['labs/caf' + String.fromCharCode(0xe9) + '.css']), JSON.stringify(unquoted)],
    ['when git cannot name the files, every list runs and the command says so', gitless === null && cli.gitless.code === 0 && cli.gitless.text.includes('mutate: git could not name the files changed since no-such-ref, so every list runs') && /mutate drive: 2 broken rules/.test(cli.gitless.text), cli.gitless.text],
    ['the changed files are read one a line, trimmed, blank lines left out; a file that cannot be read gives none', JSON.stringify(readBack.file) === JSON.stringify(['labs/a.css', 'tools/drives/air.mjs']) && readBack.none === null],
    ['the command reads --changed, and runs every list when the file cannot be read, saying so', cli.skip.code === 0 && /mutate: skipped drive:/.test(cli.skip.text) && !/mutate drive:/.test(cli.skip.text)
      && cli.lost.code === 0 && /the changed files could not be read from .*nowhere\.txt, so every list runs/.test(cli.lost.text) && /mutate drive: 2 broken rules, 2 caught/.test(cli.lost.text)],
  );
  const fail = cases.filter(([, v]) => !v);
  for (const [n, , d] of fail) console.log('FAIL ' + n + (d ? ': ' + String(d).slice(0, 300) : ''));
  console.log(`mutate selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

// run as a command, not imported (tools/drive.mjs's selftest reads WATCHDOG)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
if (isMain) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--tools'), ch = argv.indexOf('--changed'), since = argv.indexOf('--changed-since');
  const tools = at >= 0 ? path.resolve(argv[at + 1] || '') : TOOLS;
  const rest = argv.filter((_, i) => (at < 0 || (i !== at && i !== at + 1)) && (ch < 0 || (i !== ch && i !== ch + 1)) && (since < 0 || (i !== since && i !== since + 1)));
  let changed = null;
  if (ch >= 0) { changed = readChanged(argv[ch + 1] || ''); if (!changed) console.log(`mutate: the changed files could not be read from ${argv[ch + 1]}, so every list runs`); }
  if (since >= 0) { const ref = argv[since + 1]; changed = changedSince(ref); if (!changed) console.log(ref ? `mutate: git could not name the files changed since ${ref}, so every list runs` : 'mutate: --changed-since was given no ref, so every list runs'); }
  if (rest[0] === 'selftest') await selftest(rest[1]);
  else process.exit(await run(rest[0], tools, console.log, { changed }));
}
