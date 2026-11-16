/* ============================================================
   Which conditions of a module no mutant breaks.

     node tools/dev/conditions.mjs <module.js> <list>
     node tools/dev/conditions.mjs --selftest

   <list> is a mutants test file that hands its entries to
   runMutants (labs/assets/js/exoplanet/tests/mutants.mjs), or a
   gate's JSON list (tools/mutants/<tool>.json). The test file is
   run with its runner replaced by a stub that only records the
   entries, so nothing is broken or copied.

   A condition is a comparison (< <= > >= == != === !==), a
   default (?? ||, and their assignments) or a clamp
   (Math.max, Math.min). It counts as broken when some entry
   edits the condition itself or the operand next to it, or the
   line that defines that operand's constant. An entry that only
   rewrites text nearby does not count. An exported function
   counts as broken when some entry edits its body.

   A condition that no entry can break without changing nothing
   (two guards that cover each other) is declared on its own line
   with a comment that starts "equivalent:" and gives the reason.

   Exit 1 when a condition or an export is never broken.

   Why this exists: the rule in CLAUDE.md asks for a mutant that
   loosens each condition. Mutant lists written from memory or
   from the test cases missed 51 of 68 conditions on 2026-11-14,
   and missed conditions again in pull requests 41 and 42 on
   2026-11-16. This tool counts conditions from the code instead.

   What it cannot see: a bare truthy test (if (x)), a condition
   built at run time, and whether a test checks just inside and
   just outside each bound. The tests are still read for that.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

/* The source with comments and the contents of strings, templates and regular expressions replaced by spaces.
   Same length, newlines kept, so a position in the result is the same position in the source. The code inside
   a template's ${ } is kept, since a condition can sit there. */
export function blank(src) {
  const out = src.split('');
  const n = src.length;
  const wipe = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '; };
  const stack = [];               // open template literals: the brace depth at which each ${ was opened
  let depth = 0, i = 0, lastSig = '', lastWord = '';
  const regexCanStart = () => lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig) || KEYWORDS_BEFORE_REGEX.has(lastWord);
  const readTemplate = (from) => {           // from: just after ` or after the } that closes a ${ }
    let k = from;
    while (k < n) {
      if (src[k] === '\\') { k += 2; continue; }
      if (src[k] === '`') { wipe(from, k); return { end: k + 1, open: false }; }
      if (src[k] === '$' && src[k + 1] === '{') { wipe(from, k); return { end: k + 2, open: true }; }
      k++;
    }
    wipe(from, n); return { end: n, open: false };
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; wipe(i, end); i = end; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; wipe(i, end); i = end; continue; }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
      wipe(i + 1, k); i = k + 1; lastSig = c; lastWord = ''; continue;
    }
    if (c === '`') {
      const t = readTemplate(i + 1);
      if (t.open) { stack.push(depth); depth++; lastSig = '{'; lastWord = ''; }
      else { lastSig = '`'; lastWord = ''; }
      i = t.end; continue;
    }
    if (c === '/' && regexCanStart()) {
      let k = i + 1, inClass = false;
      while (k < n && src[k] !== '\n') {
        if (src[k] === '\\') { k += 2; continue; }
        if (src[k] === '[') inClass = true;
        else if (src[k] === ']') inClass = false;
        else if (src[k] === '/' && !inClass) break;
        k++;
      }
      wipe(i + 1, k); k++;
      while (k < n && /[a-z]/i.test(src[k])) k++;
      i = k; lastSig = '/'; lastWord = ''; continue;
    }
    if (c === '{') { depth++; lastSig = c; lastWord = ''; i++; continue; }
    if (c === '}') {
      depth--;
      if (stack.length && stack[stack.length - 1] === depth) {   // the } that closes a ${ }: back inside the template
        stack.pop();
        const t = readTemplate(i + 1);
        if (t.open) { stack.push(depth); depth++; lastSig = '{'; }
        else lastSig = '`';
        lastWord = ''; i = t.end; continue;
      }
      lastSig = c; lastWord = ''; i++; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let k = i; while (k < n && /[\w$]/.test(src[k])) k++;
      lastWord = src.slice(i, k); lastSig = 'w'; i = k; continue;
    }
    if (/[0-9]/.test(c)) { let k = i; while (k < n && /[\w.]/.test(src[k])) k++; lastSig = '0'; lastWord = ''; i = k; continue; }
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  }
  return out.join('');
}

const OPERATOR = /===|!==|==|!=|<=|>=|\?\?=?|\|\|=?|(?<![<=>!])<(?![<=])|(?<![=<>-])>(?![>=])|Math\.(?:max|min)\(/g;

const lineAt = (src, p) => { let l = 1; for (let k = 0; k < p; k++) if (src[k] === '\n') l++; return l; };
const lineText = (src, l) => src.split('\n')[l - 1] ?? '';

/* The span of the operand next to an operator: a run of name, number, dot, quote or minus characters, skipping
   spaces. Returned as [start, end) in the source, and the name when the operand is a plain identifier. */
function operandLeft(code, p) {
  let k = p - 1; while (k >= 0 && code[k] === ' ') k--;
  const end = k + 1;
  while (k >= 0 && /[\w$.]/.test(code[k])) k--;
  const start = k + 1;
  return { start: Math.min(start, end), end, text: code.slice(start, end) };
}
function operandRight(code, p) {
  let k = p; while (k < code.length && code[k] === ' ') k++;
  const start = k;
  if (code[k] === '-' || code[k] === '+') k++;
  while (k < code.length && /[\w$.]/.test(code[k])) k++;
  return { start, end: k, text: code.slice(start, k) };
}
function matchParen(code, open) {
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === '(') depth++;
    else if (code[k] === ')') { depth--; if (depth === 0) return k + 1; }
  }
  return code.length;
}

/* Every condition in the source: {at, end, line, op, near: [start, end), names: operand identifiers}. */
export function conditions(src) {
  const code = blank(src);
  const found = [];
  for (const m of code.matchAll(OPERATOR)) {
    const at = m.index, op = m[0];
    let near, names = [];
    if (op.startsWith('Math.')) near = [at, matchParen(code, at + op.length - 1)];
    else {
      const l = operandLeft(code, at), r = operandRight(code, at + op.length);
      near = [l.start, r.end];
      names = [l.text, r.text].filter((t) => /^[A-Za-z_$][\w$]*$/.test(t));
    }
    const line = lineAt(src, at);
    found.push({ at, end: at + op.length, line, op, near, names, declared: /\/\/\s*equivalent:|\/\*\s*equivalent:/.test(lineText(src, line)) });
  }
  return found;
}

/* Exported functions and their bodies: {name, start, end, line}. */
export function exportsOf(src) {
  const code = blank(src);
  const out = [];
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)|export\s+const\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g)) {
    const name = m[1] || m[2], start = m.index;
    let k = start + m[0].length, end;
    if (m[1]) {                                   // function: skip the parameters, then the body's braces
      k = matchParen(code, code.indexOf('(', k));
      const open = code.indexOf('{', k);
      let depth = 0; end = code.length;
      for (let j = open; j < code.length; j++) { if (code[j] === '{') depth++; else if (code[j] === '}' && --depth === 0) { end = j + 1; break; } }
    } else {                                      // arrow: a braced body, or an expression up to the statement's end
      while (code[k] === ' ') k++;
      if (code[k] === '{') {
        let depth = 0; end = code.length;
        for (let j = k; j < code.length; j++) { if (code[j] === '{') depth++; else if (code[j] === '}' && --depth === 0) { end = j + 1; break; } }
      } else {
        let depth = 0; end = code.length;
        for (let j = k; j < code.length; j++) {
          const c = code[j];
          if ('([{'.includes(c)) depth++;
          else if (')]}'.includes(c)) { if (depth === 0) { end = j; break; } depth--; }
          else if ((c === ';' || (c === '\n' && /^\s*(export|const|let|function|\/)/.test(code.slice(j + 1, j + 40)))) && depth === 0) { end = j; break; }
        }
      }
    }
    out.push({ name, start, end, line: lineAt(src, start) });
  }
  return out;
}

/* Where each entry edits the source: {name, span: [start, end) of its text, edit: [start, end) of what changes},
   or {name, missing: true} when its text is not in the source exactly once. */
export function edits(src, mutants) {
  return mutants.map(({ name, from, to }) => {
    const i = from ? src.indexOf(from) : -1;
    if (i < 0 || src.indexOf(from, i + 1) >= 0) return { name, missing: true };
    let a = 0; while (a < from.length && a < to.length && from[a] === to[a]) a++;
    let b = 0; while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
    return { name, span: [i, i + from.length], edit: [i + a, Math.max(i + a, i + from.length - b)] };
  });
}

const touches = ([a, b], [c, d]) => (a === b ? a >= c && a <= d : a < d && c < b);

/* The report: every condition and export with the entries that break it. */
export function coverage(src, mutants) {
  const es = edits(src, mutants).filter((e) => !e.missing);
  const defs = new Map();                        // the line of each constant's definition
  src.split('\n').forEach((t, k) => { for (const m of t.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=|,\s*([\w$]+)\s*=(?!=)/g)) defs.set(m[1] || m[2], k + 1); });
  const lineSpan = (l) => { const lines = src.split('\n'); let s = 0; for (let k = 0; k < l - 1; k++) s += lines[k].length + 1; return [s, s + lines[l - 1].length]; };
  const conds = conditions(src).map((c) => {
    const at = es.filter((e) => touches(e.edit, [c.at, c.end]) || touches(e.edit, c.near)
      || c.names.some((nm) => defs.has(nm) && touches(e.edit, lineSpan(defs.get(nm)))));
    return { ...c, by: at.map((e) => e.name), status: c.declared ? 'declared' : at.length ? 'broken' : 'never broken' };
  });
  const exps = exportsOf(src).map((x) => {
    const at = es.filter((e) => touches(e.edit, [x.start, x.end]));
    return { ...x, by: at.map((e) => e.name), status: at.length ? 'broken' : 'never broken' };
  });
  return { conditions: conds, exports: exps, stale: edits(src, mutants).filter((e) => e.missing).map((e) => e.name) };
}

/* The entries a list file holds for one module: [{name, from, to}]. */
export function readList(listPath, modulePath) {
  if (listPath.endsWith('.json')) return JSON.parse(readFileSync(listPath, 'utf8')).map((m) => ({ name: m.name, from: m.from, to: m.to }));
  const dir = mkdtempSync(join(tmpdir(), 'conditions-'));
  const dump = join(dir, 'entries.jsonl');
  writeFileSync(dump, '');
  const loader = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'conditions-loader.mjs')).href;
  const hook = `data:text/javascript,import{register}from"node:module";register(${encodeURIComponent(JSON.stringify(loader))});`;
  const r = spawnSync(process.execPath, ['--import', hook, listPath], { env: { ...process.env, CONDITIONS_DUMP: dump }, encoding: 'utf8', timeout: 60000 });
  const lines = readFileSync(dump, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  rmSync(dir, { recursive: true, force: true });
  const want = resolve(modulePath);
  const mine = lines.filter((l) => resolve(l.module) === want);
  if (!mine.length) throw new Error(`no entries for ${modulePath} were handed to runMutants by ${listPath}${r.status ? ` (it exited ${r.status}: ${(r.stderr || '').split('\n')[0]})` : ''}`);
  return mine.flatMap((l) => l.mutants.map(([name, from, to]) => ({ name, from, to })));
}

function report(modulePath, listPath) {
  const src = readFileSync(modulePath, 'utf8').replace(/\r\n/g, '\n');
  const cov = coverage(src, readList(listPath, modulePath));
  const gaps = cov.conditions.filter((c) => c.status === 'never broken');
  const lost = cov.exports.filter((x) => x.status === 'never broken');
  const short = (t) => t.trim().replace(/\s+/g, ' ').slice(0, 90);
  console.log(`${modulePath}: ${cov.conditions.length} conditions, ${cov.conditions.length - gaps.length} broken or declared; ${cov.exports.length} exports, ${cov.exports.length - lost.length} broken`);
  for (const c of gaps) console.log(`  never broken  line ${c.line}  ${c.op}  ${short(lineText(src, c.line))}`);
  for (const x of lost) console.log(`  export never broken  line ${x.line}  ${x.name}`);
  for (const s of cov.stale) console.log(`  stale entry (text not in the module exactly once)  ${s}`);
  return gaps.length || lost.length ? 1 : 0;
}

/* ---------------- selftest ---------------- */
function selftest() {
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const ops = (s) => conditions(s).map((c) => c.op);

  // what counts as a condition
  yes('a comparison is found', ops('if (a < 3) x();').join() === '<');
  yes('each comparison operator is found', ops('a<b; a<=b; a>b; a>=b; a==b; a!=b; a===b; a!==b;').join(' ') === '< <= > >= == != === !==');
  yes('defaults and clamps are found', ops('x = a ?? 1; y = b || 2; z ??= 3; w = Math.max(0, v); u = Math.min(v, 1);').join(' ') === '?? || ??= Math.max( Math.min(');
  yes('an arrow is not a comparison', ops('const f = (a) => a;').length === 0);
  yes('shifts are not comparisons', ops('x = a << 2; y = b >> 1; z = c >>> 0;').length === 0);
  yes('a comparison inside a string is not counted', ops('const s = "a < b";').length === 0);
  yes('a comparison inside a comment is not counted', ops('// a < b\n/* c > d */ x = 1;').length === 0);
  yes('a comparison inside a regular expression is not counted', ops('const r = /a<b|c>d/;').length === 0);
  yes('a division is not taken for a regular expression', ops('const q = a / b; if (q < 1) x();').join() === '<');
  yes('a slash inside the class of a regular expression does not end it', ops('const r = /[/<]x/; if (a > 1) y();').join() === '>');
  yes('template text is not counted', ops('const t = `a < b`;').length === 0);
  yes('template text after a ${ } is not counted', ops('const t = `${a} < ${b}`;').length === 0);
  yes('a comparison inside a template\'s ${ } is counted', ops('const t = `n ${a < b ? 1 : 2} m`;').join() === '<');
  yes('a nested template keeps counting after it closes', ops('const t = `x ${`y ${a > 1}`} z`; if (b <= 2) y();').join(' ') === '> <=');
  yes('a line number is right', conditions('a = 1;\nb = 2;\nif (c >= 3) d();').map((c) => c.line).join() === '3');

  // what counts as broken
  const SRC = 'export const LIMIT = 1.4;\nexport function clamp(p) {\n  if (p > LIMIT) return LIMIT;\n  return Math.max(0, p);\n}\n';
  const m = (name, from, to) => ({ name, from, to });
  const st = (list) => coverage(SRC, list).conditions.map((c) => c.status).join(' ');
  yes('no entries: every condition never broken', st([]) === 'never broken never broken');
  yes('an entry that edits the operator breaks it', st([m('a', 'p > LIMIT', 'p >= LIMIT')]).startsWith('broken'));
  yes('an entry that edits the operand breaks it', st([m('a', 'if (p > LIMIT)', 'if (q > LIMIT)')]).startsWith('broken'));
  yes('an entry that moves the constant at its definition breaks it', st([m('a', 'LIMIT = 1.4', 'LIMIT = 1.5')]).startsWith('broken'));
  yes('an entry that edits only the return beside it does not', st([m('a', 'return LIMIT;', 'return 0;')]).startsWith('never broken'));
  yes('an entry that only adds to the bound breaks it', st([m('a', 'p > LIMIT)', 'p > LIMIT + 1)')]).startsWith('broken'));
  yes('an entry that changes a negative bound breaks it', coverage('if (t > -5) x();\n', [m('a', '-5', '-4')]).conditions[0].status === 'broken');
  yes('an entry that edits the clamp breaks the clamp', st([m('a', 'Math.max(0, p)', 'p')]).endsWith(' broken') && !st([m('a', 'Math.max(0, p)', 'p')]).endsWith('never broken'));
  yes('an entry whose text appears twice is stale, not counted', coverage(SRC, [m('a', 'LIMIT', 'X')]).stale.join() === 'a');
  yes('a declared condition is reported as declared', coverage('if (a < 1) b(); // equivalent: the guard above covers it\n', []).conditions[0].status === 'declared');

  // exports
  const ex = exportsOf('export function f(a) { return a; }\nexport const g = (b) => b + 1;\nexport const h = async (c) => { return c; };\nconst k = 2;\n');
  yes('exports are found with their names', ex.map((x) => x.name).join() === 'f,g,h');
  const cx = coverage('export function f(a) { return a; }\nexport function g(b) { return b; }\n', [m('a', 'return a;', 'return 0;')]).exports;
  yes('an export whose body an entry edits is broken; another is not', cx.map((x) => x.status).join() === 'broken,never broken');

  // the exit code
  const rd = mkdtempSync(join(tmpdir(), 'conditions-report-'));
  try {
    const mod = join(rd, 'mod.js'), list = join(rd, 'list.json');
    writeFileSync(mod, 'export function f(a) { return a < 1; }\nexport function g(b) { return b; }\n');
    const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }, { name: 'y', from: 'return b;', to: 'return 0;' }]));
    yes('every condition and export broken: exit 0', quiet(() => report(mod, list)) === 0);
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }]));
    yes('an export never broken alone: exit 1', quiet(() => report(mod, list)) === 1);
    writeFileSync(list, JSON.stringify([{ name: 'y', from: 'return b;', to: 'return 0;' }, { name: 'z', from: 'f(a)', to: 'f(b)' }]));
    yes('a condition never broken alone: exit 1', quiet(() => report(mod, list)) === 1);
  } finally { rmSync(rd, { recursive: true, force: true }); }

  // the list readers
  const dir = mkdtempSync(join(tmpdir(), 'conditions-self-'));
  try {
    const json = join(dir, 'list.json');
    writeFileSync(json, JSON.stringify([{ name: 'x', from: 'a', to: 'b' }]));
    yes('a gate\'s JSON list is read', readList(json, join(dir, 'mod.js')).map((e) => e.name).join() === 'x');
    const lab = join(dir, 'lab'), tests = join(lab, 'tests');
    mkdirSync(tests, { recursive: true });
    writeFileSync(join(lab, 'mod.js'), 'export const f = (a) => a < 1;\n');
    writeFileSync(join(tests, 'runner.mutants.mjs'), 'export async function runMutants() { throw new Error("the real runner must not run"); }\n');
    writeFileSync(join(tests, 'mutants.mjs'), 'export async function runMutants() { throw new Error("the real runner must not run"); }\n');
    writeFileSync(join(tests, 'mod.mutants.test.mjs'), `import { runMutants } from './mutants.mjs';\nimport { fileURLToPath } from 'node:url';\nimport { dirname } from 'node:path';\nconst here = dirname(fileURLToPath(import.meta.url));\nprocess.exit(await runMutants({ here, file: 'mod.js', test: 'mod.test.mjs', mutants: [['one', 'a < 1', 'a <= 1']] }));\n`);
    const got = readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'mod.js'));
    yes('a mutants test file is read without running its runner', got.map((e) => `${e.name}:${e.from}:${e.to}`).join() === 'one:a < 1:a <= 1');
    let threw = false;
    try { readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'other.js')); } catch { threw = true; }
    yes('a list with no entries for the module is an error, not an empty pass', threw);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  console.log(`conditions selftest: ${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}

/* Run as a command only; another script may import the functions above. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--selftest' || args[0] === 'selftest') process.exit(selftest());
  else if (args.length === 2 && existsSync(args[0]) && existsSync(args[1])) process.exit(report(args[0], args[1]));
  else { console.error('usage: node tools/dev/conditions.mjs <module.js> <mutants test file | list.json>   or   --selftest'); process.exit(2); }
}
