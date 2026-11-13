// Mutation test of the gates: a selftest is only as good as the broken rules it catches.
//
// On 2026-11-13 the scope rule in tools/evolution.mjs passed its own selftest (90 of 90) while a reviewer who broke
// the rule in a copy, one condition at a time, found broken versions the selftest still passed. So each gate that
// has a list of mutants in tools/mutants/<tool>.json is tested here: every mutant is one exact replacement that
// breaks one rule, and the tool's selftest must fail on it. A mutant that survives means a rule nobody tests. A
// mutant whose text is no longer in the tool means the list went stale; both fail this check.
//
// usage: node tools/mutate.mjs [<tool> | selftest]     (no argument: every tool with a mutants file)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TOOLS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const MUTANTS = path.join(TOOLS, 'mutants');
const lf = (s) => s.replace(/\r\n/g, '\n');

// Run a tool's selftest from a file; true when it passes.
function passes(file) {
  const r = spawnSync(process.execPath, [file, 'selftest'], { stdio: 'pipe', timeout: 120000 });
  return r.status === 0;
}

// Test one tool's source against its mutants in a scratch copy of the tools folder.
// Returns {caught, survived: [names], stale: [names], broken: true when the unmutated selftest fails}.
export function mutate(source, mutants, name, siblings = TOOLS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-'));
  const work = path.join(dir, 'tools');
  fs.mkdirSync(work);
  for (const f of fs.readdirSync(siblings, { withFileTypes: true })) if (f.isFile() && /\.(mjs|js|json)$/.test(f.name)) fs.copyFileSync(path.join(siblings, f.name), path.join(work, f.name));
  const file = path.join(work, `${name}.mjs`);
  const base = lf(source);
  const out = { caught: 0, survived: [], stale: [], broken: false };
  try {
    fs.writeFileSync(file, base);
    if (!passes(file)) { out.broken = true; return out; }
    for (const m of mutants) {
      const from = lf(String(m.from || '')), to = lf(String(m.to ?? ''));
      const i = from ? base.indexOf(from) : -1;
      if (i < 0 || base.indexOf(from, i + 1) >= 0 || from === to) { out.stale.push(m.name); continue; }
      fs.writeFileSync(file, base.slice(0, i) + to + base.slice(i + from.length));
      if (passes(file)) out.survived.push(m.name); else out.caught++;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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

function run(only) {
  if (!fs.existsSync(MUTANTS)) { console.log('NOT_CHECKED: tools/mutants does not exist'); return; }
  const names = fs.readdirSync(MUTANTS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);
  if (only && !names.length) { console.log(`mutate: no mutants file for "${only}"`); process.exit(2); }
  let bad = 0;
  for (const name of names) {
    const tool = path.join(TOOLS, `${name}.mjs`);
    if (!fs.existsSync(tool)) { console.log(`mutate ${name}: tools/${name}.mjs does not exist`); bad++; continue; }
    const mutants = JSON.parse(fs.readFileSync(path.join(MUTANTS, `${name}.json`), 'utf8'));
    const errs = shape(mutants, `tools/mutants/${name}.json`);
    if (errs.length) { for (const e of errs) console.log('  ' + e); bad++; continue; }
    const r = mutate(fs.readFileSync(tool, 'utf8'), mutants, name);
    if (r.broken) { console.log(`mutate ${name}: the selftest fails before any mutation`); bad++; continue; }
    console.log(`mutate ${name}: ${mutants.length} broken rules, ${r.caught} caught by the selftest`);
    for (const n of r.survived) console.log(`  SURVIVED  ${n}: the selftest passes with this rule broken, so nothing tests it`);
    for (const n of r.stale) console.log(`  STALE     ${n}: its "from" text is not in the tool exactly once; rewrite the mutant for the current code`);
    if (r.survived.length || r.stale.length) bad++;
  }
  if (bad) process.exit(1);
}

function selftest() {
  // a toy gate: one rule that is tested, one that is not
  const toy = [
    `const add = (a, b) => a + b;`,
    `const label = (n) => (n > 9 ? 'big' : 'small');`,
    `if (process.argv[2] === 'selftest') { const ok = add(2, 2) === 4; console.log(ok ? 'toy selftest: 1/1' : 'FAIL'); process.exit(ok ? 0 : 1); }`,
    ``,
  ].join('\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-self-'));
  let r, crlf, broken;
  try {
    const M = [
      { name: 'addition subtracts', from: 'a + b', to: 'a - b' },
      { name: 'label threshold moved', from: 'n > 9', to: 'n > 99' },
      { name: 'text that is not there', from: 'a * b', to: 'a / b' },
      { name: 'a mutant that changes nothing', from: 'a + b', to: 'a + b' },
    ];
    r = mutate(toy, M, 'toy', dir);
    crlf = mutate(toy.replace(/\n/g, '\r\n'), [{ name: 'spans two lines', from: 'a + b;\nconst label', to: 'a - b;\nconst label' }], 'toy', dir);
    broken = mutate(toy.replace('=== 4', '=== 5'), M, 'toy', dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const cases = [
    ['a broken rule that the selftest tests is caught', r.caught === 1],
    ['a broken rule that nothing tests survives and is named', r.survived.length === 1 && r.survived[0] === 'label threshold moved'],
    ['a mutant whose text is gone, or that changes nothing, is stale', r.stale.length === 2 && r.stale.includes('text that is not there') && r.stale.includes('a mutant that changes nothing')],
    ['line endings do not hide a mutant', crlf.caught === 1 && !crlf.stale.length],
    ['a selftest that fails before any mutation is reported, not counted as catching', broken.broken === true && broken.caught === 0],
    ['a mutants file must name each rule and give exact text', shape([{ name: 'x', from: '', to: '' }], 't').length === 2 && shape([], 't').length === 1 && shape([{ name: 'a rule broken', from: 'a', to: 'b' }], 't').length === 0],
    ['the same mutant listed twice is refused', shape([{ name: 'a rule broken', from: 'a', to: 'b' }, { name: 'a rule broken', from: 'c', to: 'd' }], 't').some((e) => e.includes('twice'))],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`mutate selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const [cmd] = process.argv.slice(2);
if (cmd === 'selftest') selftest();
else run(cmd);
