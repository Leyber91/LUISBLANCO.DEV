/* ============================================================
   Which conditions of a module no mutant breaks.

     node tools/dev/conditions.mjs <module.js> <list> [<list> ...]
     node tools/dev/conditions.mjs selftest

   A <list> is a mutants test file that imports runMutants from
   a mutants.mjs (labs/assets/js/exoplanet/tests/mutants.mjs), or
   a gate's JSON list (tools/mutants/<tool>.json). Several lists
   for one module are read as one. A test file is run with its
   runner replaced by a stub that only records the entries, so
   nothing is copied or broken. A file that does not import
   runMutants from a mutants.mjs is refused before it runs.

   A condition is a comparison (< <= > >= == != === !==), a
   default (?? ||, and their assignments) or a clamp
   (Math.max, Math.min). Conditions inside a function named
   selftest are a gate's own checks and are left out.

   An entry breaks a condition when what it changes touches the
   operator, or one of the two operands beside it, or, for a
   clamp, the word Math.max or Math.min or one of its own
   arguments (not a clamp nested inside it). A change touches a
   span when they share a character; an insertion touches it
   when it sits inside it or at either end.
   An entry also breaks a condition by moving the value of a
   constant the condition names, when that constant is declared
   once, at the top level, is never a parameter, and is named by
   no other condition: one moved constant shared by several
   conditions does not show that each of them is tested.
   An exported function counts as broken when an entry changes
   something inside it.

   A condition no entry can break without changing nothing (a
   bound only ever met by values on one side) is declared with a
   comment containing "equivalent:" and the reason, on its line.
   The comment declares every condition on that line.

   Exit 0: every condition and export is broken or declared.
   Exit 1: a gap, or an entry whose text is not in the module
   exactly once. Exit 2: usage. Exit 3: the tool could not read
   a list.

   Why this exists: CLAUDE.md asks for a mutant that loosens
   each condition. Lists written from memory or from the test
   cases missed 51 of 68 conditions on 2026-11-14, and missed
   conditions again in pull requests 41 and 42 on 2026-11-16.

   What it cannot see: a bare truthy test (if (x)), a condition
   built at run time, export default of a value, export { }
   lists, and whether a test checks just inside and just outside
   each bound. Those are still read by hand.
   ============================================================ */

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

/* The source with comments and the contents of strings, templates and regular expressions replaced by spaces.
   Same length, newlines kept, so a position in the result is the same position in the source. Quote marks stay,
   so a string can still be found as an operand. The code inside a template's ${ } is kept. */
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
    // x++ and x-- end an operand: a slash after them divides
    if ((c === '+' || c === '-') && d === c && ['w', '0', ')', ']'].includes(lastSig)) { lastSig = 'w'; lastWord = ''; i += 2; continue; }
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

const OPERATOR = /===|!==|==|!=|(?<![<>])<=|(?<![<>])>=|\?\?=?|\|\|=?|(?<![<=>!])<(?![<=])|(?<![=<>-])>(?![>=])|Math\.(?:max|min)\(/g;

const lineAt = (src, p) => { let l = 1; for (let k = 0; k < p; k++) if (src[k] === '\n') l++; return l; };
const lineText = (src, l) => src.split('\n')[l - 1] ?? '';

/* Brackets, forward from an opening one and back from a closing one. Return the position just past the match,
   or of the opening one. */
function closeOf(code, open) {
  const o = code[open], c = { '(': ')', '[': ']', '{': '}' }[o];
  let depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === o) depth++;
    else if (code[k] === c && --depth === 0) return k + 1;
  }
  return code.length;
}
function openOf(code, close) {
  const c = code[close], o = { ')': '(', ']': '[', '}': '{' }[c];
  let depth = 0;
  for (let k = close; k >= 0; k--) {
    if (code[k] === c) depth++;
    else if (code[k] === o && --depth === 0) return k;
  }
  return 0;
}

/* The operand on each side of an operator, as [start, end) in the source: a name with its dots, calls and
   indexes (a.b(c)[d]), a string, or a number with its sign and exponent (-1e-3). */
function operandLeft(code, p) {
  let k = p - 1; while (k >= 0 && code[k] === ' ') k--;
  const end = k + 1;
  for (;;) {
    if (k < 0) break;
    const ch = code[k];
    if (ch === ')' || ch === ']') k = openOf(code, k) - 1;
    else if (ch === '"' || ch === "'" || ch === '`') k = code.lastIndexOf(ch, k - 1) - 1;
    else if (/[\w$.]/.test(ch)) {
      while (k >= 0 && /[\w$.]/.test(code[k])) k--;
      if ((code[k] === '-' || code[k] === '+') && /[eE]/.test(code[k + 0 - 1] ?? '') && /^[0-9]/.test(code.slice(k + 1))) {
        k--; while (k >= 0 && /[\w.]/.test(code[k])) k--;     // the mantissa of 1e-3
      }
    } else break;
    if (!(k >= 0 && /[\w$.)\]]/.test(code[k]))) break;
  }
  const start = k + 1;
  return { start: Math.min(start, end), end, text: code.slice(Math.min(start, end), end) };
}
function operandRight(code, p) {
  let k = p; while (k < code.length && code[k] === ' ') k++;
  const start = k;
  while (code[k] === '-' || code[k] === '+' || code[k] === '!') k++;
  const q = code[k];
  if (q === '"' || q === "'" || q === '`') { const e = code.indexOf(q, k + 1); k = e < 0 ? code.length : e + 1; }
  else if (/[0-9.]/.test(q ?? '')) k += /^[0-9.]*(?:[eE][+-]?[0-9]+)?[\w]*/.exec(code.slice(k))[0].length;
  else {
    for (;;) {
      while (k < code.length && /[\w$.]/.test(code[k])) k++;
      if (code[k] === '(' || code[k] === '[') k = closeOf(code, k);
      else if (code[k] === '?' && code[k + 1] === '.') k += 2;
      else break;
    }
  }
  return { start, end: k, text: code.slice(start, k) };
}

const isName = (t) => /^[A-Za-z_$][\w$]*$/.test(t);

/* The spans of the functions named selftest: their conditions are a gate's own checks, not its rules. */
function selftestSpans(code) {
  const spans = [];
  for (const m of code.matchAll(/function\s+selftest\s*\(/g)) {
    const open = code.indexOf('{', closeOf(code, m.index + m[0].length - 1));
    if (open >= 0) spans.push([m.index, closeOf(code, open)]);
  }
  return spans;
}

/* Every condition in the source: {at, end, line, op, near: [[start, end), ...], names: operand identifiers}. */
export function conditions(src) {
  const code = blank(src);
  const skip = selftestSpans(code);
  const found = [];
  for (const m of code.matchAll(OPERATOR)) {
    const at = m.index, op = m[0];
    if (skip.some(([a, b]) => at >= a && at < b)) continue;
    let near, names = [];
    if (op.startsWith('Math.')) {
      const open = at + op.length - 1, close = closeOf(code, open);
      near = [[at, open + 1]];
      let depth = 0, s = open + 1;
      for (let k = open + 1; k < close; k++) {
        const ch = code[k];
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        if ((ch === ',' && depth === 0) || k === close - 1) {
          const e = ch === ',' ? k : k;
          const text = code.slice(s, e).trim();
          if (text && !/^Math\.(?:max|min)\(/.test(text)) {
            const a0 = s + code.slice(s, e).indexOf(text);
            near.push([a0, a0 + text.length]);
            if (isName(text.replace(/^-/, ''))) names.push(text.replace(/^-/, ''));
          }
          s = k + 1;
        }
      }
    } else {
      const l = operandLeft(code, at), r = operandRight(code, at + op.length);
      near = [[l.start, l.end], [r.start, r.end]];
      names = [l.text, r.text.replace(/^[-+!]+/, '')].filter(isName);
    }
    const line = lineAt(src, at);
    found.push({ at, end: at + op.length, line, op, near, names, declared: /equivalent:/.test(lineText(src, line).slice(lineText(src, line).search(/\/\/|\/\*/) >= 0 ? lineText(src, line).search(/\/\/|\/\*/) : Infinity)) });
  }
  return found;
}

/* Constants a moved value may stand for: declared once at the top level (const, let or var at the start of a
   line, comma declarations included), never declared again and never a parameter. {name: [start, end) of its
   value}. */
export function constantsOf(src) {
  const code = blank(src);
  const decl = new Map(), count = new Map();
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g)) count.set(m[1], (count.get(m[1]) || 0) + 1);
  for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var)\s+/gm)) {
    let k = m.index + m[0].length, depth = 0, s = k;
    const end = (() => { for (let j = k; j < code.length; j++) { const ch = code[j]; if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ';' && depth === 0) return j; else if (ch === '\n' && depth === 0 && !/[,=+\-*/?:|&(]\s*$/.test(code.slice(s, j)) && !/^\s*[,.?:|&+\-*/]/.test(code.slice(j + 1, j + 20))) return j; } return code.length; })();
    depth = 0;
    const parts = [];
    for (let j = k; j <= end; j++) {
      const ch = code[j];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if ((ch === ',' && depth === 0) || j === end) { parts.push([s, j]); s = j + 1; }
    }
    for (const [a, b] of parts) {
      const mm = /^\s*([A-Za-z_$][\w$]*)\s*=(?![=>])/.exec(code.slice(a, b));
      if (!mm) continue;
      const v0 = a + mm[0].length;
      decl.set(mm[1], [v0, b]);
      if (!count.has(mm[1])) count.set(mm[1], 1);        // a comma declarator: counted here
      else if (code.slice(a, b).trim() !== code.slice(m.index + m[0].length, b).trim()) count.set(mm[1], count.get(mm[1]) + 1);
    }
  }
  const params = new Set();
  for (const m of code.matchAll(/function\s*[\w$]*\s*\(/g)) for (const p of code.slice(m.index + m[0].length, closeOf(code, m.index + m[0].length - 1) - 1).match(/[A-Za-z_$][\w$]*/g) || []) params.add(p);
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) for (const p of m[1].match(/[A-Za-z_$][\w$]*/g) || []) params.add(p);
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) params.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) for (const p of m[1].match(/[A-Za-z_$][\w$]*/g) || []) params.add(p);
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) params.add(m[1]);
  const out = new Map();
  for (const [name, span] of decl) if (count.get(name) === 1 && !params.has(name)) out.set(name, span);
  return out;
}

/* Exported functions and their bodies: {name, start, end, line}. */
export function exportsOf(src) {
  const code = blank(src);
  const out = [];
  const re = /export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]*)\s*\(|export\s+const\s+([\w$]+)\s*=\s*(?:async\s*)?(\(|[\w$]+\s*=>)/g;
  for (const m of code.matchAll(re)) {
    if (m[1] !== undefined) {                       // a function: its parameters, then its body's braces
      const open = code.indexOf('{', closeOf(code, m.index + m[0].length - 1));
      out.push({ name: m[1] || 'default', start: m.index, end: open < 0 ? code.length : closeOf(code, open), line: lineAt(src, m.index) });
      continue;
    }
    let k = m.index + m[0].length;
    if (m[3] === '(') {                             // an arrow with parameters in brackets: skip them and its =>
      k = closeOf(code, k - 1);
      const arrow = /^\s*=>/.exec(code.slice(k));
      if (!arrow) continue;                         // a call, not a function
      k += arrow[0].length;
    }
    while (code[k] === ' ') k++;
    let end;
    if (code[k] === '{') end = closeOf(code, k);
    else {                                          // an expression: up to the statement's end
      let depth = 0; end = code.length;
      for (let j = k; j < code.length; j++) {
        const c = code[j];
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) { if (depth === 0) { end = j; break; } depth--; }
        else if (depth === 0 && (c === ';' || (c === '\n' && /^\s*(export|const|let|var|function|\/)/.test(code.slice(j + 1, j + 40))))) { end = j; break; }
      }
    }
    out.push({ name: m[2], start: m.index, end, line: lineAt(src, m.index) });
  }
  return out;
}

/* Where each entry changes the source: {name, edit: [start, end) of what changes}, or {name, missing: true} when
   its text is not in the source exactly once. The text the entry keeps at either end is not part of the change. */
export function edits(src, mutants) {
  return mutants.map(({ name, from, to }) => {
    const i = from ? src.indexOf(from) : -1;
    if (i < 0 || src.indexOf(from, i + 1) >= 0) return { name, missing: true };
    let a = 0; while (a < from.length && a < to.length && from[a] === to[a]) a++;
    let b = 0; while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
    return { name, edit: [i + a, Math.max(i + a, i + from.length - b)] };
  });
}

/* A change touches a span when they share a character; an insertion (an empty change) when it sits inside the
   span or at either end. */
export const touches = ([a, b], [c, d]) => (a === b ? a >= c && a <= d : a < d && c < b);

/* The report: every condition and export with the entries that break it. */
export function coverage(src, mutants) {
  const all = edits(src, mutants), es = all.filter((e) => !e.missing);
  const conds = conditions(src);
  const consts = constantsOf(src);
  const uses = new Map();
  for (const c of conds) for (const nm of new Set(c.names)) uses.set(nm, (uses.get(nm) || 0) + 1);
  const out = conds.map((c) => {
    const spans = [[c.at, c.end], ...c.near];
    const own = c.names.filter((nm) => consts.has(nm) && uses.get(nm) === 1).map((nm) => consts.get(nm));
    const by = es.filter((e) => spans.some((s) => touches(e.edit, s)) || own.some((s) => touches(e.edit, s)));
    return { ...c, by: by.map((e) => e.name), status: c.declared ? 'declared' : by.length ? 'broken' : 'never broken' };
  });
  const exps = exportsOf(src).filter((x) => x.name !== 'selftest').map((x) => {
    const by = es.filter((e) => touches(e.edit, [x.start, x.end]));
    return { ...x, by: by.map((e) => e.name), status: by.length ? 'broken' : 'never broken' };
  });
  return { conditions: out, exports: exps, stale: all.filter((e) => e.missing).map((e) => e.name) };
}

/* The entries a list file holds for one module: [{name, from, to}]. Throws when it cannot read them. */
export function readList(listPath, modulePath) {
  if (listPath.endsWith('.json')) return JSON.parse(readFileSync(listPath, 'utf8').replace(/^﻿/, '')).map((m) => ({ name: m.name, from: m.from, to: m.to }));
  const text = readFileSync(listPath, 'utf8');
  if (!/import\s*\{[^}]*\brunMutants\b[^}]*\}\s*from\s*['"][^'"]*\bmutants\.mjs['"]/.test(text)) {
    throw new Error(`${listPath} does not import runMutants from a mutants.mjs, so its entries cannot be read without running it`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'conditions-'));
  try {
    const dump = join(dir, 'entries.jsonl');
    writeFileSync(dump, '');
    const loader = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'conditions-loader.mjs')).href;
    const hook = `data:text/javascript,import{register}from"node:module";register(${encodeURIComponent(JSON.stringify(loader))});`;
    const r = spawnSync(process.execPath, ['--import', hook, listPath], { env: { ...process.env, CONDITIONS_DUMP: dump }, encoding: 'utf8', timeout: 60000 });
    const lines = readFileSync(dump, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const want = resolve(modulePath);
    const mine = lines.filter((l) => resolve(l.module) === want);
    if (!mine.length) {
      const why = r.status ? ` (it exited ${r.status}: ${(r.stderr || '').trim().split('\n').slice(-3).join(' / ')})` : '';
      throw new Error(`no entries for ${modulePath} were handed to runMutants by ${listPath}${why}`);
    }
    return mine.flatMap((l) => l.mutants.map(([name, from, to]) => ({ name, from, to })));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function report(modulePath, listPaths) {
  const src = readFileSync(modulePath, 'utf8').replace(/\r\n/g, '\n');
  let list;
  try { list = listPaths.flatMap((p) => readList(p, modulePath)); }
  catch (e) { console.error(`conditions: ${e.message}`); return 3; }
  const cov = coverage(src, list);
  const gaps = cov.conditions.filter((c) => c.status === 'never broken');
  const lost = cov.exports.filter((x) => x.status === 'never broken');
  const declared = cov.conditions.filter((c) => c.status === 'declared').length;
  const short = (t) => t.trim().replace(/\s+/g, ' ').slice(0, 90);
  console.log(`${modulePath}: ${list.length} entries; ${cov.conditions.length} conditions, ${cov.conditions.length - gaps.length - declared} broken, ${declared} declared, ${gaps.length} never broken; ${cov.exports.length} exports, ${cov.exports.length - lost.length} broken; ${cov.stale.length} stale`);
  for (const c of gaps) console.log(`  never broken  line ${c.line}  ${c.op}  ${short(lineText(src, c.line))}`);
  for (const x of lost) console.log(`  export never broken  line ${x.line}  ${x.name}`);
  for (const s of cov.stale) console.log(`  stale entry (text not in the module exactly once)  ${s}`);
  return gaps.length || lost.length || cov.stale.length ? 1 : 0;
}

/* ---------------- selftest ---------------- */
function selftest() {
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const ops = (s) => conditions(s).map((c) => c.op);
  const m = (name, from, to) => ({ name, from, to });
  const st = (src, list) => coverage(src, list).conditions.map((c) => c.status).join(' | ');

  // what counts as a condition
  yes('a comparison is found', ops('if (a < 3) x();').join() === '<');
  yes('each comparison operator is found', ops('a<b; a<=b; a>b; a>=b; a==b; a!=b; a===b; a!==b;').join(' ') === '< <= > >= == != === !==');
  yes('defaults and clamps are found', ops('x = a ?? 1; y = b || 2; z ??= 3; w = Math.max(0, v); u = Math.min(v, 1);').join(' ') === '?? || ??= Math.max( Math.min(');
  yes('an arrow is not a comparison', ops('const f = (a) => a;').length === 0);
  yes('shifts are not comparisons', ops('x = a << 2; y = b >> 1; z = c >>> 0;').length === 0);
  yes('shift assignments are not comparisons', ops('a <<= 1; b >>= 1; c >>>= 1;').length === 0);
  yes('a comparison inside a string is not counted', ops('const s = "a < b";').length === 0);
  yes('a comparison inside a comment is not counted', ops('// a < b\n/* c > d */ x = 1;').length === 0);
  yes('a comparison inside a regular expression is not counted', ops('const r = /a<b|c>d/;').length === 0);
  yes('a division is not taken for a regular expression', ops('const q = a / b; if (q < 1) x();').join() === '<');
  yes('a division after i++ is not taken for a regular expression', ops('const q = i++ / 2; if (q < 1) x();').join() === '<');
  yes('a slash inside the class of a regular expression does not end it', ops('const r = /[/<]x/; if (a > 1) y();').join() === '>');
  yes('a keyword lets a regular expression start', ops('function f() { return /a<b/.test(s); }').length === 0);
  yes('template text is not counted', ops('const t = `a < b`;').length === 0);
  yes('template text after a ${ } is not counted', ops('const t = `${a} < ${b}`;').length === 0);
  yes('a comparison inside a template\'s ${ } is counted', ops('const t = `n ${a < b ? 1 : 2} m`;').join() === '<');
  yes('a nested template keeps counting after it closes', ops('const t = `x ${`y ${a > 1}`} z`; if (b <= 2) y();').join(' ') === '> <=');
  yes('a line number is right', conditions('a = 1;\nb = 2;\nif (c >= 3) d();').map((c) => c.line).join() === '3');
  yes('a selftest function\'s own checks are left out', ops('function rule(a) { return a < 1; }\nfunction selftest() { ok(rule(0) === true); }\n').join() === '<');

  // the operands beside an operator
  const near = (s) => conditions(s)[0].near.map(([a, b]) => s.slice(a, b));
  yes('a string is an operand', near("if (k.w === 'around') x();").join('|') === "k.w|'around'");
  yes('an exponent number is one operand', near('if (e < 1e-3) x();').join('|') === 'e|1e-3');
  yes('a negative bound is an operand', near('if (t > -5) x();').join('|') === 't|-5');
  yes('a string on the left is an operand', near("if ('a' === k) x();").join('|') === "'a'|k");
  yes('a condition just past a selftest\'s closing brace is counted', ops('function selftest() { ok(); }<1').join() === '<');
  yes('a call and an index are part of the operand', near('if (f(a)[0] >= g.h(b)) x();').join('|') === 'f(a)[0]|g.h(b)');
  yes('an exponent number on the left is one operand', near('if (1e-3 < e) x();').join('|') === '1e-3|e');

  // what counts as broken: the operator and its operands
  const SRC = 'export function clamp(p, lim) {\n  if (p > lim) return lim;\n  return Math.max(0, p);\n}\n';
  yes('no entries: every condition never broken', st(SRC, []) === 'never broken | never broken');
  yes('an entry that edits the operator breaks it', st(SRC, [m('a', 'p > lim', 'p >= lim')]).startsWith('broken'));
  yes('an entry that edits an operand breaks it', st(SRC, [m('a', 'if (p > lim)', 'if (p > 2 * lim)')]).startsWith('broken'));
  yes('an entry that only adds to the bound breaks it', st(SRC, [m('a', 'p > lim)', 'p > lim + 1)')]).startsWith('broken'));
  yes('an entry that edits only the return beside it does not', st(SRC, [m('a', 'return lim;', 'return 0;')]).startsWith('never broken'));
  yes('an entry whose text reaches the condition but changes only what follows does not', st(SRC, [m('a', 'if (p > lim) return lim;', 'if (p > lim) return 0;')]).startsWith('never broken'));
  yes('a changed string operand breaks it', st("if (k === 'a') x();\n", [m('a', "'a')", "'b')")]) === 'broken');
  yes('a changed exponent breaks it', st('if (e < 1e-3) x();\n', [m('a', '1e-3', '2e-3')]) === 'broken');
  yes('the clamp\'s own argument breaks the clamp', st(SRC, [m('a', 'Math.max(0, p)', 'Math.max(1, p)')]).endsWith('| broken'));
  yes('the word Math.max changed breaks the clamp', st(SRC, [m('a', 'Math.max(0', 'Math.min(0')]).endsWith('| broken'));
  const NEST = 'export const f = (most, pitch) => Math.max(-most, Math.min(most, pitch));\n';
  yes('an edit inside a nested clamp breaks the inner clamp only', st(NEST, [m('a', 'Math.min(most, pitch)', 'Math.min(most, pitch * 2)')]) === 'never broken | broken');

  // touching, just inside and just outside
  yes('a change sharing one character with a span touches it', touches([4, 6], [5, 9]));
  yes('a change ending where a span starts does not touch it', !touches([2, 5], [5, 9]));
  yes('a change starting where a span ends does not touch it', !touches([9, 11], [5, 9]));
  yes('an insertion at the start of a span touches it', touches([5, 5], [5, 9]));
  yes('an insertion at the end of a span touches it', touches([9, 9], [5, 9]));
  yes('an insertion one character outside does not', !touches([4, 4], [5, 9]) && !touches([10, 10], [5, 9]));
  const ed = edits('abcdef', [m('x', 'bcd', 'bXd')])[0].edit;
  yes('only the changed characters count as the change', ed[0] === 2 && ed[1] === 3);

  // what counts as broken: a constant moved at its definition
  const K = 'export const LIMIT = 1.4;\nexport function f(p) {\n  if (p > LIMIT) return 1;\n  return 0;\n}\n';
  yes('a constant moved at its definition breaks the one condition naming it', st(K, [m('a', 'LIMIT = 1.4', 'LIMIT = 1.5')]) === 'broken');
  const K2 = 'export const LIMIT = 1.4;\nexport const f = (p) => p > LIMIT;\nexport const g = (q) => q < LIMIT;\n';
  yes('a constant shared by two conditions breaks neither', st(K2, [m('a', 'LIMIT = 1.4', 'LIMIT = 1.5')]) === 'never broken | never broken');
  const K3 = 'function a(i) { return i < 3; }\nfunction b() { const i = 5; return i; }\n';
  yes('a name declared inside a function is not a constant', st(K3, [m('a', 'const i = 5', 'const i = 6')]) === 'never broken');
  const K4 = 'export const N = 3;\nfunction a(N) { return N > 1; }\n';
  yes('a constant whose name is also a parameter is not used', st(K4, [m('a', 'N = 3', 'N = 4')]) === 'never broken');
  const K5 = 'export const LO = 1, HI = 9;\nexport const f = (p) => p < HI;\n';
  yes('a comma declaration is a constant too', st(K5, [m('a', 'HI = 9', 'HI = 8')]) === 'broken');
  const K8 = 'export const N = 3;\nfunction a() { const N = 4; return N; }\nexport const f = (p) => p > N;\n';
  yes('a name declared twice is not a constant', st(K8, [m('a', 'N = 3', 'N = 5')]) === 'never broken');
  const K9 = 'export const N = 3;\nexport const f = (N) => N > 1;\n';
  yes('an arrow\'s parameter of the same name is not the constant', st(K9, [m('a', 'N = 3', 'N = 4')]) === 'never broken');
  const K6 = '// LIMIT = 3 was tried\nexport const LIMIT = 4;\nexport const f = (p) => p > LIMIT;\n';
  yes('a comment that looks like a definition is not one', st(K6, [m('a', 'LIMIT = 4', 'LIMIT = 5')]) === 'broken');
  const K7 = 'export const LIMIT = 4;\nexport const f = (p) => p > LIMIT;\n';
  yes('an edit elsewhere on the definition\'s line does not count', st(K7, [m('a', 'export const LIMIT', 'const LIMIT')]) === 'never broken');

  // declared and stale
  yes('a declared condition is reported as declared', st('if (a < 1) b(); // equivalent: the guard above covers it\n', []) === 'declared');
  yes('an ordinary comment does not declare', st('if (a < 1) b(); // a guard\n', []) === 'never broken');
  yes('the word in code does not declare', st('const o = { equivalent: 1 }; if (a < 1) b();\n', []) === 'never broken');
  yes('an entry whose text appears twice is stale, not counted', coverage('a < 1; a < 1;\n', [m('a', 'a < 1', 'a <= 1')]).stale.join() === 'a');

  // exports
  const ex = exportsOf('export function f(a) { return a; }\nexport const g = (b) => b + 1;\nexport const h = async (c) => { return c; };\nexport default function (d) { return d; }\nexport const k = mk(2);\nexport const w = (1 + 2);\nconst z = 2;\n');
  yes('exports are found with their names', ex.map((x) => x.name).join() === 'f,g,h,default', ex.map((x) => x.name).join());
  const cx = coverage('export function f(a) { return a; }\nexport function g(b) { return b; }\n', [m('a', 'return a;', 'return 0;')]).exports;
  yes('an export whose body an entry edits is broken; another is not', cx.map((x) => x.status).join() === 'broken,never broken');
  const ax = coverage('export const f = (a) => a + 1;\nexport const g = (b) => b + 2;\n', [m('a', 'b + 2', 'b + 3')]).exports;
  yes('an arrow export\'s body ends at its statement', ax.map((x) => x.status).join() === 'never broken,broken');

  // the exit code
  const rd = mkdtempSync(join(tmpdir(), 'conditions-report-'));
  const quiet = (fn) => { const log = console.log, err = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = log; console.error = err; } };
  try {
    const mod = join(rd, 'mod.js'), list = join(rd, 'list.json'), list2 = join(rd, 'list2.json');
    writeFileSync(mod, 'export function f(a) { return a < 1; }\nexport function g(b) { return b; }\n');
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }, { name: 'y', from: 'return b;', to: 'return 0;' }]));
    yes('every condition and export broken: exit 0', quiet(() => report(mod, [list])) === 0);
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }]));
    yes('an export never broken alone: exit 1', quiet(() => report(mod, [list])) === 1);
    writeFileSync(list2, JSON.stringify([{ name: 'y', from: 'return b;', to: 'return 0;' }]));
    yes('two lists are read as one', quiet(() => report(mod, [list, list2])) === 0);
    writeFileSync(list, JSON.stringify([{ name: 'y', from: 'return b;', to: 'return 0;' }, { name: 'z', from: 'f(a)', to: 'f(b)' }]));
    yes('a condition never broken alone: exit 1', quiet(() => report(mod, [list])) === 1);
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }, { name: 'y', from: 'return b;', to: 'return 0;' }, { name: 's', from: 'gone', to: 'x' }]));
    yes('a stale entry alone: exit 1', quiet(() => report(mod, [list])) === 1);
    writeFileSync(join(rd, 'other.mutants.test.mjs'), 'console.log(1);\n');
    yes('a list the tool cannot read: exit 3', quiet(() => report(mod, [join(rd, 'other.mutants.test.mjs')])) === 3);
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
    writeFileSync(join(tests, 'mutants.mjs'), 'export async function runMutants() { throw new Error("the real runner must not run"); }\nexport const helper = 7;\n');
    writeFileSync(join(tests, 'mod.mutants.test.mjs'), `import { runMutants, helper } from './mutants.mjs';\nimport { fileURLToPath } from 'node:url';\nimport { dirname } from 'node:path';\nconst here = dirname(fileURLToPath(import.meta.url));\nprocess.exit(await runMutants({ here, file: 'mod.js', test: 'mod.test.mjs', mutants: [['one', 'a < 1', 'a <= ' + (helper - 6)]] }));\n`);
    const got = readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'mod.js'));
    yes('a mutants test file is read without running its runner, its other imports kept', got.map((e) => `${e.name}:${e.from}:${e.to}`).join() === 'one:a < 1:a <= 1');
    let threw = false;
    try { readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'other.js')); } catch { threw = true; }
    yes('a list with no entries for the module is an error, not an empty pass', threw);
    writeFileSync(join(tests, 'own.mutants.test.mjs'), 'import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.CONDITIONS_DUMP + ".ran", "x");\n');
    let refused = false;
    try { readList(join(tests, 'own.mutants.test.mjs'), join(lab, 'mod.js')); } catch (e) { refused = /does not import runMutants/.test(e.message); }
    yes('a file with its own runner is refused before it runs', refused);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  console.log(`conditions selftest: ${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}

/* Run as a command only; another script may import the functions above. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--selftest' || args[0] === 'selftest') process.exit(selftest());
  else if (args.length >= 2 && args.every((a) => existsSync(a))) process.exit(report(args[0], args.slice(1)));
  else { console.error('usage: node tools/dev/conditions.mjs <module.js> <mutants test file | list.json> [...]   or   selftest'); process.exit(2); }
}
