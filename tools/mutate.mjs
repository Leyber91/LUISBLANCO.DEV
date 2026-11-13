// Mutation test of the gates: a selftest is only as good as the broken rules it catches.
//
// On 2026-11-13 the scope rule in tools/evolution.mjs passed its own selftest (90 of 90) while a reviewer who broke
// the rule in a copy, one condition at a time, found broken versions the selftest still passed. So each gate that
// has a list of mutants in tools/mutants/<tool>.json is tested here: every mutant is one exact replacement that
// breaks one rule, and the tool's selftest must fail on it. A mutant that survives means a rule nobody tests. A
// mutant whose text is no longer in the tool exactly once means the list went stale. Both fail this check.
// It works for a gate that node runs and that has a "selftest" argument needing nothing outside its own folder.
//
// usage: node tools/mutate.mjs [<tool>] [--tools <folder>]   (no tool: every tool with a mutants file)
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

// Run a tool's selftest from a file; resolves true when it passes. A run over the limit is stopped and counts as failed.
const LIMIT_MS = 180000;
function passes(file, limit = LIMIT_MS) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, 'selftest'], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill(), limit);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code === 0); });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// Test one tool's source against its mutants, each in a scratch copy of the tools folder.
// Returns {caught, survived, stale, noop: [names], broken: true when the unmutated selftest fails}.
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
  const out = { caught: 0, survived: [], stale: [], noop: [], broken: false };
  try {
    if (!(await passes(place('base', base), limit))) { out.broken = true; return out; }
    const jobs = [];
    for (const m of mutants) {
      const from = lf(String(m.from || '')), to = lf(String(m.to ?? ''));
      const i = from ? base.indexOf(from) : -1;
      if (i < 0 || base.indexOf(from, i + 1) >= 0) { out.stale.push(m.name); continue; }
      if (from === to) { out.noop.push(m.name); continue; }
      jobs.push({ name: m.name, text: base.slice(0, i) + to + base.slice(i + from.length) });
    }
    const alive = new Array(jobs.length).fill(false);
    let next = 0;
    const worker = async () => { for (let k = next++; k < jobs.length; k = next++) alive[k] = await passes(place(`m${k}`, jobs[k].text), limit); };
    await Promise.all(Array.from({ length: WIDTH }, worker));
    jobs.forEach((j, k) => { if (alive[k]) out.survived.push(j.name); else out.caught++; });
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
    if (!(m && typeof m.from === 'string' && m.from && typeof m.to === 'string')) errs.push(`${where}: "${m && m.name}" needs "from" (exact text in the tool) and "to" (the broken text)`);
  }
  return errs;
}

// Check every tool that has a mutants file in <tools>/mutants. Returns the exit code: 0 all caught, 1 a failure,
// 2 a tool was named that has no mutants file.
export async function run(only, tools = TOOLS, say = console.log) {
  const folder = path.join(tools, 'mutants');
  if (!fs.existsSync(folder)) { say(`mutate: ${folder} does not exist, so no gate was tested`); return 1; }
  const strays = fs.readdirSync(folder).filter((f) => !f.endsWith('.json'));
  if (strays.length) { say(`mutate: tools/mutants holds ${strays.join(', ')}; a mutants file is named <tool>.json in lower case, and anything else would be skipped in silence`); return 1; }
  const names = fs.readdirSync(folder).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);
  if (only && !names.length) { say(`mutate: no mutants file for "${only}"`); return 2; }
  if (!names.length) { say('mutate: tools/mutants holds no mutants file, so no gate was tested'); return 1; }
  let bad = 0;
  for (const name of names) {
    const tool = path.join(tools, `${name}.mjs`);
    if (!fs.existsSync(tool)) { say(`mutate ${name}: tools/${name}.mjs does not exist`); bad++; continue; }
    let mutants;
    try { mutants = JSON.parse(fs.readFileSync(path.join(folder, `${name}.json`), 'utf8').replace(BOM, '')); }
    catch (e) { say(`mutate ${name}: tools/mutants/${name}.json is not valid JSON (${e.message})`); bad++; continue; }
    const errs = shape(mutants, `tools/mutants/${name}.json`);
    if (errs.length) { for (const e of errs) say('  ' + e); bad++; continue; }
    const r = await mutate(fs.readFileSync(tool, 'utf8'), mutants, name, tools);
    if (r.broken) { say(`mutate ${name}: the selftest fails before any mutation`); bad++; continue; }
    say(`mutate ${name}: ${mutants.length} broken rules, ${r.caught} caught by the selftest`);
    for (const n of r.survived) say(`  SURVIVED  ${n}: the selftest passes with this rule broken, so nothing tests it`);
    for (const n of r.stale) say(`  STALE     ${n}: its "from" text is not in the tool exactly once; rewrite the mutant for the current code`);
    for (const n of r.noop) say(`  NO CHANGE ${n}: its "to" equals its "from", so it breaks nothing`);
    if (r.survived.length || r.stale.length || r.noop.length) bad++;
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
  let r, crlf, broken, hung, cli = {};
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
    ['the command finds its own folder when the path holds a space and a tilde', cli.ownFolder === 0],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`mutate selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--tools');
const tools = at >= 0 ? path.resolve(argv[at + 1] || '') : TOOLS;
const rest = argv.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
if (rest[0] === 'selftest') await selftest();
else process.exit(await run(rest[0], tools));
