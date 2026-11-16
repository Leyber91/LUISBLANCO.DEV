// Mutation test of the gates: a selftest is only as good as the broken rules it catches.
//
// On 2026-11-13 the scope rule in tools/evolution.mjs passed its own selftest (90 of 90) while a reviewer who broke
// the rule in a copy, one condition at a time, found broken versions the selftest still passed. So each gate that
// has a list of mutants in tools/mutants/<tool>.json is tested here: every mutant is one exact replacement that
// breaks one rule, and the tool's selftest must fail on it. A mutant that survives means a rule nobody tests. A
// mutant whose text is no longer in the tool exactly once means the list went stale. Both fail this check.
// It works for a gate that node runs and that has a "selftest" argument needing nothing outside its own folder.
//
// A run stopped at its time limit is not a catch: nothing saw the broken rule fail. On 2026-11-16 copies of the
// driver's selftest that waited on one another for Chrome ran past their limit and were counted as caught. So a run
// stopped at the limit runs once more, alone, after the others; stopped again, it is reported as timed out, apart
// from caught and survived, and fails the check unless its entry declares "timeout": "<reason>" (a break that really
// is an endless loop).
//
// The lists of the selftests that drive Chrome (drive, invariants) take most of an hour on the gates' machine. Given
// --changed <file> (the paths a pull request changes, one a line, as git diff --name-only writes them), those two run
// only when one of the files in WATCHED changed; without it, as on a push to main, every list runs.
//
// usage: node tools/mutate.mjs [<tool>] [--tools <folder>] [--changed <file>]   (no tool: every tool with a mutants file)
//        node tools/mutate.mjs selftest
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TOOLS = path.dirname(SELF);
const lf = (s) => s.replace(/\r\n/g, '\n');
// a byte order mark some editors put at the start of a JSON file; JSON.parse refuses it
const BOM = new RegExp('^' + String.fromCharCode(0xFEFF));
/* Mutants run a few at a time, each in its own scratch copy. Kept low: a selftest may start processes of its own. */
const WIDTH = Math.max(1, Math.min(4, (os.availableParallelism ? os.availableParallelism() : 2) - 1));

// Run a tool's selftest from a file; resolves 'pass', 'fail', or 'timeout' when it was stopped at the limit.
const LIMIT_MS = 180000;
function runs(file, limit = LIMIT_MS) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, 'selftest'], { stdio: 'ignore' });
    let late = false;
    const timer = setTimeout(() => { late = true; child.kill(); }, limit);
    child.on('exit', (code) => { clearTimeout(timer); resolve(late ? 'timeout' : code === 0 ? 'pass' : 'fail'); });
    child.on('error', () => { clearTimeout(timer); resolve('fail'); });
  });
}

// The lists that run on a pull request only when one of these files changed, and the decision.
const SLOW = ['drive', 'invariants'];
const WATCHED = ['tools/drive.mjs', 'tools/invariants.mjs', 'tools/drives/invariants.mjs', 'tools/mutants/drive.json', 'tools/mutants/invariants.json', 'tools/mutate.mjs'];
// changed: the paths that changed, or null when they are not known (then every list runs)
export function listsToRun(names, changed) {
  if (!changed) return { run: names, skipped: [], hit: null };
  const hit = changed.filter((f) => WATCHED.includes(f));
  const skipped = hit.length ? [] : names.filter((n) => SLOW.includes(n));
  return { run: names.filter((n) => !skipped.includes(n)), skipped, hit };
}
// the paths in a file of git's names, one a line; null when it cannot be read
export function readChanged(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean); } catch { return null; }
}

// Test one tool's source against its mutants, each in a scratch copy of the tools folder.
// Returns {caught, survived, stale, noop: [names], timedOut: [{ name, reason }], broken: true when the unmutated
// selftest fails or does not end}.
export async function mutate(source, mutants, name, siblings, limit = LIMIT_MS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-'));
  const place = (label, text) => {
    const work = path.join(root, label, 'tools');
    fs.mkdirSync(work, { recursive: true });
    if (siblings && fs.existsSync(siblings)) for (const f of fs.readdirSync(siblings, { withFileTypes: true })) if (f.isFile() && /\.(mjs|js|json)$/.test(f.name)) fs.copyFileSync(path.join(siblings, f.name), path.join(work, f.name));
    const file = path.join(work, `${name}.mjs`);
    fs.writeFileSync(file, text);
    return file;
  };
  const base = lf(source);
  const out = { caught: 0, survived: [], stale: [], noop: [], timedOut: [], broken: false };
  try {
    if ((await runs(place('base', base), limit)) !== 'pass') { out.broken = true; return out; }
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
    const worker = async () => { for (let k = next++; k < jobs.length; k = next++) result[k] = await runs(place(`m${k}`, jobs[k].text), limit); };
    await Promise.all(Array.from({ length: WIDTH }, worker));
    // a run stopped at the limit may have waited on another run (a lock, a busy machine): once more, alone
    for (let k = 0; k < jobs.length; k++) if (result[k] === 'timeout') result[k] = await runs(place(`m${k}`, jobs[k].text), limit);
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
// 2 a tool was named that has no mutants file. changed: see listsToRun; limit: each run's time.
export async function run(only, tools = TOOLS, say = console.log, { changed = null, limit = LIMIT_MS } = {}) {
  const folder = path.join(tools, 'mutants');
  if (!fs.existsSync(folder)) { say(`mutate: ${folder} does not exist, so no gate was tested`); return 1; }
  const strays = fs.readdirSync(folder).filter((f) => !f.endsWith('.json'));
  if (strays.length) { say(`mutate: tools/mutants holds ${strays.join(', ')}; a mutants file is named <tool>.json in lower case, and anything else would be skipped in silence`); return 1; }
  const names = fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);
  if (only && !names.length) { say(`mutate: no mutants file for "${only}"`); return 2; }
  if (!names.length) { say('mutate: tools/mutants holds no mutants file, so no gate was tested'); return 1; }
  const plan = listsToRun(names, changed);
  if (plan.hit && plan.hit.length) say(`mutate: ran ${SLOW.join(' and ')}: changed files ${plan.hit.join(', ')}`);
  if (plan.skipped.length) say(`mutate: skipped ${plan.skipped.join(' and ')}: none of ${WATCHED.join(', ')} changed`);
  let bad = 0;
  for (const name of plan.run) {
    const tool = path.join(tools, `${name}.mjs`);
    if (!fs.existsSync(tool)) { say(`mutate ${name}: tools/${name}.mjs does not exist`); bad++; continue; }
    let mutants;
    try { mutants = JSON.parse(fs.readFileSync(path.join(folder, `${name}.json`), 'utf8').replace(BOM, '')); }
    catch (e) { say(`mutate ${name}: tools/mutants/${name}.json is not valid JSON (${e.message})`); bad++; continue; }
    const errs = shape(mutants, `tools/mutants/${name}.json`);
    if (errs.length) { for (const e of errs) say('  ' + e); bad++; continue; }
    const r = await mutate(fs.readFileSync(tool, 'utf8'), mutants, name, tools, limit);
    if (r.broken) { say(`mutate ${name}: the selftest fails before any mutation`); bad++; continue; }
    say(`mutate ${name}: ${mutants.length} broken rules, ${r.caught} caught by the selftest${r.timedOut.length ? `, ${r.timedOut.length} timed out` : ''}`);
    for (const n of r.survived) say(`  SURVIVED  ${n}: the selftest passes with this rule broken, so nothing tests it`);
    for (const n of r.stale) say(`  STALE     ${n}: its "from" text is not in the tool exactly once; rewrite the mutant for the current code`);
    for (const n of r.noop) say(`  NO CHANGE ${n}: its "to" equals its "from", so it breaks nothing`);
    for (const t of r.timedOut) say(`  TIMED OUT ${t.name}: the selftest did not end within ${limit / 1000} s, twice; ${t.reason ? `declared: ${t.reason}` : 'nothing saw it fail, so it is not caught'}`);
    if (r.survived.length || r.stale.length || r.noop.length || r.timedOut.some((t) => !t.reason)) bad++;
  }
  return bad ? 1 : 0;
}

async function selftest() {
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
  let r, crlf, broken, hung, cli = {}, tm, said = {}, codes = {}, runsPast = '', reruns = [], readBack = {};
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
    // runs stopped at the limit. LIM is short; a toy stopped at it would end by itself (12 s at most), so none is left
    // behind. The three calls run at once: their toys wait on timers, so they do not slow one another.
    const LIM = 1500, END = 'process.exit(ok ? 0 : 1); }', count = path.join(root, 'past.runs'), log = path.join(root, 'reruns.log');
    const late = (ms) => `setTimeout(() => process.exit(1), ${ms}); }`;
    // stopped on its first run; its second run ends at once with the code given, and writes when it ran
    const flaky = (code) => `const { existsSync, writeFileSync, appendFileSync } = await import('node:fs'); const mark = new URL('./mark', import.meta.url); if (!existsSync(mark)) { writeFileSync(mark, ''); ${late(12000)} else { appendFileSync(${J(log)}, 'start ' + Date.now() + String.fromCharCode(10)); const t = Date.now() + 250; while (Date.now() < t); appendFileSync(${J(log)}, 'end ' + Date.now() + String.fromCharCode(10)); process.exit(${code}); } }`;
    said.und = []; said.dec = [];
    [tm, codes.und, codes.dec] = await Promise.all([
      mutate(toy, [{ name: 'fails 0.5 s past the limit', from: END, to: `const { appendFileSync } = await import('node:fs'); appendFileSync(${J(count)}, 'n'); ${late(2000)}` },
        { name: 'stopped once, then passes', from: END, to: flaky(0) }, { name: 'stopped once, then fails', from: END, to: flaky(1) },
        { name: 'fails 0.7 s inside the limit', from: END, to: late(800) }], 'toy', undefined, LIM),
      // the command's report of a timeout, undeclared and declared
      run(undefined, make('timeout-undeclared', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, { name: 'a break that never ends', from: END, to: late(12000) }]) }), (l) => said.und.push(l), { limit: LIM }),
      run(undefined, make('timeout-declared', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, { name: 'a break that never ends', from: END, to: late(12000), timeout: 'the break is an endless loop' }]) }), (l) => said.dec.push(l), { limit: LIM }),
    ]);
    runsPast = fs.readFileSync(count, 'utf8');
    reruns = fs.readFileSync(log, 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => l.split(' ')[0]);
    const code = (tools, ...args) => spawnSync(process.execPath, [SELF, ...args, '--tools', tools], { stdio: 'pipe', timeout: 120000 }).status;
    cli.clean = code(make('clean', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) }));
    cli.survivor = code(make('survivor', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[1]]) }));
    cli.stale = code(make('stale', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[2]]) }));
    cli.noop = code(make('noop', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT, M[4]]) }));
    cli.malformed = code(make('malformed', { 'toy.mjs': toy, 'mutants/toy.json': '[{"name": "addition subtracts",}]' }));
    cli.bom = code(make('bom', { 'toy.mjs': toy, 'mutants/toy.json': String.fromCharCode(0xFEFF) + J([CAUGHT]) }));
    cli.stray = code(make('stray', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]), 'mutants/other.JSON': J([M[1]]) }));
    cli.unnamed = code(make('unnamed', { 'toy.mjs': toy, 'mutants/toy.json': J([{ from: 'a + b', to: 'a - b' }]) }));
    cli.missingTool = code(make('missing-tool', { 'mutants/toy.json': J([CAUGHT]) }));
    cli.brokenBase = code(make('broken-base', { 'toy.mjs': toy.replace('=== 4', '=== 5'), 'mutants/toy.json': J([CAUGHT]) }));
    cli.unknownName = code(make('unknown-name', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) }), 'ghost');
    cli.noFolder = code(make('no-folder', { 'toy.mjs': toy, mutants: null }));
    cli.emptyFolder = code(make('empty-folder', { 'toy.mjs': toy }));
    // and from its own folder, with no --tools: the folder is found whatever characters its path holds
    const own = make('own folder', { 'toy.mjs': toy, 'mutants/toy.json': J([CAUGHT]) });
    fs.copyFileSync(SELF, path.join(own, 'mutate.mjs'));
    cli.ownFolder = spawnSync(process.execPath, [path.join(own, 'mutate.mjs')], { stdio: 'pipe', timeout: 120000 }).status;
    // which lists run: a folder with a slow list (drive) and another (toy)
    const slow = make('slow', { 'toy.mjs': toy, 'drive.mjs': toy, 'mutants/toy.json': J([CAUGHT]), 'mutants/drive.json': J([CAUGHT]) });
    said.skip = []; said.ran = [];
    codes.skip = await run(undefined, slow, (l) => said.skip.push(l), { changed: ['labs/a.css', 'tools/drives/air.mjs'] });
    codes.ran = await run(undefined, slow, (l) => said.ran.push(l), { changed: ['labs/a.css', 'tools/drive.mjs'] });
    const listed = path.join(root, 'changed.txt');
    fs.writeFileSync(listed, 'labs/a.css' + String.fromCharCode(13, 10) + '  tools/drives/air.mjs ' + String.fromCharCode(10, 10));
    readBack.file = readChanged(listed); readBack.none = readChanged(path.join(root, 'nowhere.txt'));
    const outOf = (...args) => { const x = spawnSync(process.execPath, [SELF, ...args, '--tools', slow], { stdio: 'pipe', timeout: 120000 }); return { code: x.status, text: String(x.stdout) }; };
    cli.skip = outOf('--changed', listed);
    cli.lost = outOf('--changed', path.join(root, 'nowhere.txt'));
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
    ['a run stopped at the limit, and stopped again on its second run, is timed out, apart from caught and survived; it ran twice, no more',
      tm.timedOut.length === 1 && tm.timedOut[0].name === 'fails 0.5 s past the limit' && tm.timedOut[0].reason === undefined && runsPast === 'nn'],
    ['a run stopped once is counted by its second run: passing, it survives; failing, it is caught', tm.survived.length === 1 && tm.survived[0] === 'stopped once, then passes' && tm.caught === 2],
    ['the second runs run alone, one after another', reruns.join(' ') === 'start end start end'],
    ['a run that ends 0.7 s inside the limit is counted, one that ends 0.5 s past it is timed out', !tm.timedOut.some((t) => t.name === 'fails 0.7 s inside the limit') && tm.timedOut.some((t) => t.name === 'fails 0.5 s past the limit')],
    ['the command reports a timeout and counts it in the summary; it fails on one undeclared and passes on one declared',
      codes.und === 1 && codes.dec === 0 && said.und.includes('mutate toy: 2 broken rules, 1 caught by the selftest, 1 timed out')
      && said.und.some((l) => /^  TIMED OUT a break that never ends: the selftest did not end within 1.5 s, twice; nothing saw it fail/.test(l))
      && said.dec.some((l) => /^  TIMED OUT a break that never ends: .*declared: the break is an endless loop$/.test(l))],
    ['a timeout is declared with its reason, 8 characters or more', shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: '' }], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: 'seven c' }], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b', timeout: 'eight ch' }], 't').length === 0],
    ['with no list of changes every list runs', JSON.stringify(listsToRun(['atlas', 'drive', 'invariants'], null).run) === JSON.stringify(['atlas', 'drive', 'invariants'])],
    ['each watched file alone runs the slow lists', ['tools/drive.mjs', 'tools/invariants.mjs', 'tools/drives/invariants.mjs', 'tools/mutants/drive.json', 'tools/mutants/invariants.json', 'tools/mutate.mjs'].every((f) => JSON.stringify(listsToRun(['atlas', 'drive', 'invariants'], [f]).run) === JSON.stringify(['atlas', 'drive', 'invariants']))],
    ['a change to none of them skips drive and invariants and runs every other list, a near name included', JSON.stringify(listsToRun(['atlas', 'drive', 'invariants'], ['labs/a.css', 'tools/drives/air.mjs', 'tools/drive.mjs.orig', 'x/tools/drive.mjs'])) === JSON.stringify({ run: ['atlas'], skipped: ['drive', 'invariants'], hit: [] }) && JSON.stringify(listsToRun(['atlas', 'drive'], []).skipped) === JSON.stringify(['drive'])],
    ['the command says which way it went', codes.skip === 0 && said.skip.some((l) => l === 'mutate: skipped drive: none of tools/drive.mjs, tools/invariants.mjs, tools/drives/invariants.mjs, tools/mutants/drive.json, tools/mutants/invariants.json, tools/mutate.mjs changed') && !said.skip.some((l) => l.startsWith('mutate drive:')) && said.skip.some((l) => l.startsWith('mutate toy:'))
      && codes.ran === 0 && said.ran.includes('mutate: ran drive and invariants: changed files tools/drive.mjs') && said.ran.some((l) => l.startsWith('mutate drive: 1 broken rules, 1 caught'))],
    ['the changed files are read one a line, trimmed, blank lines left out; a file that cannot be read gives none', JSON.stringify(readBack.file) === JSON.stringify(['labs/a.css', 'tools/drives/air.mjs']) && readBack.none === null],
    ['the command reads --changed, and runs every list when the file cannot be read, saying so', cli.skip.code === 0 && /mutate: skipped drive:/.test(cli.skip.text) && !/mutate drive:/.test(cli.skip.text)
      && cli.lost.code === 0 && /the changed files could not be read from .*nowhere\.txt, so every list runs/.test(cli.lost.text) && /mutate drive: 1 broken rules, 1 caught/.test(cli.lost.text)],
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
    ['the command finds its own folder when the path holds a space and a tilde', cli.ownFolder === 0],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`mutate selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--tools'), ch = argv.indexOf('--changed');
const tools = at >= 0 ? path.resolve(argv[at + 1] || '') : TOOLS;
const rest = argv.filter((_, i) => (at < 0 || (i !== at && i !== at + 1)) && (ch < 0 || (i !== ch && i !== ch + 1)));
let changed = null;
if (ch >= 0) { changed = readChanged(argv[ch + 1] || ''); if (!changed) console.log(`mutate: the changed files could not be read from ${argv[ch + 1]}, so every list runs`); }
if (rest[0] === 'selftest') await selftest();
else process.exit(await run(rest[0], tools, console.log, { changed }));
