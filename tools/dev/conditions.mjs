/* ============================================================
   Which conditions of a module no mutant changes.

     node tools/dev/conditions.mjs <module.js> <list> [<list> ...]
     node tools/dev/conditions.mjs selftest

   A <list> is a mutants test file (*.mutants.test.mjs) that
   imports runMutants from a mutants.mjs, or a gate's JSON list
   (tools/mutants/<tool>.json). Several lists for one module are
   read as one. A test file is run with its runner replaced by a
   stub that only records the entries, so nothing is copied or
   broken; any other file is refused before it runs.

   A condition is a comparison (< <= > >= == != === !==), a
   default or a boolean chain (?? ||, and their assignments), or
   a clamp (Math.max, Math.min). Conditions inside a function
   named selftest are a gate's own checks and are left out.

   Each entry is compared with the module token by token, and
   each change it makes (a run of removed or added tokens) is
   judged on its own. A removal or insertion that could sit at
   several places among equal tokens changes a condition only if
   it does so at every one of those places:
   - Any condition whose operator it touches is changed.
   - A comparison is changed by a change inside one of its two
     operands (a name with its dots, calls and indexes; a
     string; a number with its sign), or between an operand and
     the operator, or just outside an operand when what it adds
     or removes there binds tighter than the comparison
     (p > lim + 1 changes it; p > lim && q does not).
   - A default (x ?? 1, x || 'none') is changed by a change to
     its value when that value is a literal. A boolean chain
     (a || b) is changed only through its operator.
   - A clamp is changed by a change inside its brackets that is
     not inside a condition nested there, or to its word.
   - A comparison, default or clamp is also changed when the value of a
     constant it names is changed, if that constant is declared
     at the top level and its name occurs exactly twice in the
     module: once declared, once in this condition. A constant
     used anywhere else proves nothing about this condition.
   An exported function is changed by any change inside it.

   A condition no entry can change without changing nothing (a
   bound only ever met by values on one side) is declared with a
   comment containing "equivalent:" and the reason, on its line.
   The comment declares every condition on that line.

   Exit 0: every condition and export is changed or declared.
   Exit 1: a gap, or an entry whose text is not in the module
   exactly once. Exit 2: usage. Exit 3: the tool could not read
   a list.

   Why this exists: CLAUDE.md asks for a mutant that loosens
   each condition. Lists written from memory or from the test
   cases missed 51 of 68 conditions on 2026-11-14, and missed
   conditions again in pull requests 41 and 42 on 2026-11-16.

   Known limits: a comparison nested in another comparison's
   operand (g(a < b) > 0) credits both; a constant also named in
   a message gives no credit, so its condition needs an entry
   that edits it directly; one removed disjunct of a chain of
   equal operators may credit none of them.

   What it cannot see: a bare truthy test (if (x)), a condition
   built at run time, export { } lists, whether an entry that
   changes a condition loosens it rather than tightening it, and
   whether a test checks just inside and just outside each bound.
   Those are still read by hand.
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

/* Every condition in the source: {at, end, line, op, kind, eq, left, right, literal, inner, own, names, declared}.
   kind is cmp, default or clamp; left and right are a comparison's or default's operands as [start, end);
   inner is a clamp's inside of the brackets; own is the stretch a change must stay inside to belong to this
   condition and not to one around it. */
export function conditions(src) {
  const code = blank(src);
  const skip = selftestSpans(code);
  const found = [];
  for (const m of code.matchAll(OPERATOR)) {
    const at = m.index, op = m[0], end = at + op.length;
    if (skip.some(([a, b]) => at >= a && at < b)) continue;
    const line = lineAt(src, at), text = lineText(src, line), cut = text.search(/\/\/|\/\*/);
    const c = { at, end, line, op, declared: cut >= 0 && /equivalent:/.test(text.slice(cut)), names: [] };
    if (op.startsWith('Math.')) {
      const open = end - 1, close = closeOf(code, open);
      Object.assign(c, { kind: 'clamp', inner: [open + 1, close - 1], own: [at, close] });
      let depth = 0, s = open + 1;
      for (let k = open + 1; k < close; k++) {
        const ch = code[k];
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        if ((ch === ',' && depth === 0) || k === close - 1) {
          const arg = code.slice(s, ch === ',' ? k : k).trim().replace(/^-/, '');
          if (isName(arg)) c.names.push(arg);
          s = k + 1;
        }
      }
    } else {
      const l = operandLeft(code, at), r = operandRight(code, end);
      const isDefault = /^(\?\?|\|\|)/.test(op);
      const literal = isDefault && /^(['"`]|-?[0-9.]|true\b|false\b|null\b|undefined\b|\[|\{)/.test(r.text);
      Object.assign(c, {
        kind: isDefault ? 'default' : 'cmp', eq: /^[=!]=/.test(op), literal,
        left: [l.start, l.end], right: [r.start, r.end],
        own: isDefault ? [at, literal ? r.end : end] : [l.start, r.end],
      });
      c.names = isDefault ? [r.text].filter(isName) : [l.text, r.text.replace(/^[-+!]+/, '')].filter(isName);
    }
    found.push(c);
  }
  return found;
}

/* Constants a changed value may stand for: declared at the top level (brace depth 0), with the [start, end) of
   each one's value. Comma declarations are read. */
export function constantsOf(src) {
  const code = blank(src);
  const depthAt = new Int32Array(code.length + 1);
  for (let k = 0, d = 0; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') d--; depthAt[k + 1] = d; }
  const out = new Map();
  for (const m of code.matchAll(/(?:^|[;\n])\s*(?:export\s+)?(?:const|let|var)\s+/g)) {
    const k0 = m.index + m[0].length;
    if (depthAt[k0] !== 0) continue;
    let depth = 0, end = code.length;
    for (let j = k0; j < code.length; j++) {
      const ch = code[j];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (depth === 0 && ch === ';') { end = j; break; }
      else if (depth === 0 && ch === '\n' && !/[,=+\-*/?:|&(]\s*$/.test(code.slice(k0, j)) && !/^\s*[,.?:|&+\-*/]/.test(code.slice(j + 1, j + 20))) { end = j; break; }
    }
    depth = 0;
    let s = k0;
    for (let j = k0; j <= end; j++) {
      const ch = code[j];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if ((ch === ',' && depth === 0) || j === end) {
        const mm = /^\s*([A-Za-z_$][\w$]*)\s*=(?![=>])\s*/.exec(code.slice(s, j));
        if (mm) out.set(mm[1], [s + mm[0].length, j]);
        s = j + 1;
      }
    }
  }
  return out;
}

/* How many times a name occurs in the code, not as a property (a.name) and not inside strings or comments. */
export function occurrences(src, name) {
  const code = blank(src);
  return [...code.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))].length;
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

/* The changes one entry makes, found by comparing its two texts token by token: [{a, b, ins, alts}], where
   [a, b) is what it removes (positions in from), ins what it adds there, and alts every placement that gives the
   same text. A pure removal or insertion can often sit at several places (removing "x == null || " from
   "x == null || x[k] == null" reads the same as removing " == null || x"); a condition counts as changed only
   when every such placement changes it. A change of spaces alone is no change. */
const TOKEN = /\s+|[A-Za-z_$][\w$]*|\d[\w.]*|===|!==|\*\*=?|\?\?=?|\|\|=?|&&=?|\?\.|=>|<<=?|>>>?=?|<=|>=|==|!=|\+\+|--|\.\.\.|[\s\S]/g;
export function changes(from, to) {
  const A = [...from.matchAll(TOKEN)].map((x) => [x[0], x.index]), B = [...to.matchAll(TOKEN)].map((x) => x[0]);
  const T = A.map((t) => t[0]);
  const at = (k) => (k < A.length ? A[k][1] : from.length);
  let p = 0; while (p < A.length && p < B.length && T[p] === B[p]) p++;
  let q = 0; while (q < A.length - p && q < B.length - p && T[A.length - 1 - q] === B[B.length - 1 - q]) q++;
  const a = T.slice(p, A.length - q), b = B.slice(p, B.length - q);
  const ops = [];                                  // {i, j, ins: [tokens]}: tokens [i, j) of from replaced by ins
  if (a.length * b.length > 4e6 || !a.length || !b.length) {
    if (a.length || b.length) ops.push({ i: p, j: A.length - q, ins: b });
  } else {
    const n = a.length, m = b.length, W = m + 1, L = new Int32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = a[i] === b[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0, j = 0, cur = null;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { if (cur) ops.push(cur); cur = null; i++; j++; }
      else if (j < m && (i === n || L[i * W + j + 1] >= L[(i + 1) * W + j])) { cur ??= { i: p + i, j: p + i, ins: [] }; cur.ins.push(b[j]); j++; }
      else { cur ??= { i: p + i, j: p + i, ins: [] }; cur.j = p + i + 1; i++; }
    }
    if (cur) ops.push(cur);
  }
  const place = (i, j, ins) => ({ a: at(i), b: at(j), ins: ins.join('') });
  for (const o of ops) {
    o.alts = [place(o.i, o.j, o.ins)];
    if (!o.ins.length) {                           // a pure removal: every place it slides to over equal tokens
      for (let i = o.i, j = o.j; i > 0 && T[i - 1] === T[j - 1];) { i--; j--; o.alts.push(place(i, j, [])); }
      for (let i = o.i, j = o.j; j < T.length && T[i] === T[j];) { i++; j++; o.alts.push(place(i, j, [])); }
    } else if (o.i === o.j) {                      // a pure insertion: the same
      for (let k = o.i, run = o.ins.slice(); k > 0 && T[k - 1] === run[run.length - 1];) { run = [run[run.length - 1], ...run.slice(0, -1)]; k--; o.alts.push(place(k, k, run)); }
      for (let k = o.i, run = o.ins.slice(); k < T.length && T[k] === run[0];) { run = [...run.slice(1), run[0]]; k++; o.alts.push(place(k, k, run)); }
    }
  }
  return ops.map((o) => ({ ...o.alts[0], alts: o.alts })).filter((c) => from.slice(c.a, c.b).trim() || c.ins.trim());
}

/* Where each entry changes the source: {name, changes: [{a, b, ins, del, alts}]} in the source's positions, or
   {name, missing: true} when its text is not in the source exactly once. */
export function edits(src, mutants) {
  const MT = [...src.matchAll(TOKEN)].map((x) => x[0]);
  const starts = new Map(), P = [0];
  MT.forEach((t, k) => { starts.set(P[k], k); P.push(P[k] + t.length); });
  starts.set(src.length, MT.length);
  const posOf = (k) => P[k];
  // every place in the module a pure removal or insertion slides to over equal tokens, the entry's text aside
  const widen = (alt) => {
    const out = [alt], i0 = starts.get(alt.a), j0 = starts.get(alt.b);
    if (i0 === undefined || j0 === undefined) return out;
    const at = (i, j, ins) => ({ a: posOf(i), b: posOf(j), ins: ins.join(''), del: MT.slice(i, j).join('') });
    if (!alt.ins) {
      for (let i = i0, j = j0; i > 0 && MT[i - 1] === MT[j - 1];) { i--; j--; out.push(at(i, j, [])); }
      for (let i = i0, j = j0; j < MT.length && MT[i] === MT[j];) { i++; j++; out.push(at(i, j, [])); }
    } else if (alt.a === alt.b) {
      const ins = [...alt.ins.matchAll(TOKEN)].map((x) => x[0]);
      for (let k = i0, run = ins.slice(); k > 0 && MT[k - 1] === run[run.length - 1];) { run = [run[run.length - 1], ...run.slice(0, -1)]; k--; out.push(at(k, k, run)); }
      for (let k = i0, run = ins.slice(); k < MT.length && MT[k] === run[0];) { run = [...run.slice(1), run[0]]; k++; out.push(at(k, k, run)); }
    }
    return out;
  };
  return mutants.map(({ name, from, to }) => {
    const i = from ? src.indexOf(from) : -1;
    if (i < 0 || src.indexOf(from, i + 1) >= 0) return { name, missing: true };
    const move = (c) => ({ a: i + c.a, b: i + c.b, ins: c.ins, del: from.slice(c.a, c.b) });
    return { name, changes: changes(from, to).map((c) => {
      const seen = new Set(), alts = [];
      for (const x of c.alts.map(move).flatMap(widen)) { const key = `${x.a},${x.b},${x.ins}`; if (!seen.has(key)) { seen.add(key); alts.push(x); } }
      return { ...move(c), alts };
    }) };
  });
}

/* A removal overlaps a span when they share a character; an insertion lies in it when it sits strictly inside. */
const overlaps = (c, [s, e]) => (c.a === c.b ? s < c.a && c.a < e : c.a < e && s < c.b);
const within = (c, [s, e]) => (c.a === c.b ? s < c.a && c.a < e : s <= c.a && c.b <= e);
/* What binds tighter than a comparison when it follows or precedes an operand; an equality also yields to < and >. */
const TIGHT_AFTER = /^(?:\*\*|[*/%+\-.([]|\?\.)/, REL_AFTER = /^(?:<=?|>=?|instanceof\b|in\b)/;
const TIGHT_BEFORE = /(?:\*\*|[*/%+\-!~.([]|\?\.|\btypeof|\bvoid|\bawait|\bnew)$/, REL_BEFORE = /(?:<=?|>=?|\binstanceof|\bin)$/;
const LOOSE_AFTER_DEFAULT = /^(?:\|\||\?\?|\?(?!\.)|,|\)|\]|\}|;|:)/;

/* Whether one change changes one condition, by the rules in the header. */
export function changesCondition(c, ch, all) {
  if (overlaps(ch, [c.at, c.end])) return true;
  const added = ch.ins.trim(), removed = ch.del.trim();
  if (c.kind === 'clamp') {
    if (!within(ch, [c.inner[0] - 1, c.inner[1] + 1]) && !(ch.a === ch.b && (ch.a === c.inner[0] || ch.a === c.inner[1]))) return false;
    return !all.some((o) => o !== c && o.own[0] >= c.inner[0] && o.own[1] <= c.inner[1] && within(ch, o.own));
  }
  const [l0, l1] = c.left, [r0, r1] = c.right;
  if (c.kind === 'default') {
    if (!c.literal) return false;
    if (overlaps(ch, c.right) || within(ch, c.right)) return true;
    if (ch.a >= c.end && ch.b <= r0) return true;
    return ch.a === r1 && [added, removed].some((t) => t && !LOOSE_AFTER_DEFAULT.test(t));
  }
  if (overlaps(ch, c.left) || overlaps(ch, c.right) || within(ch, c.left) || within(ch, c.right)) return true;
  if ((ch.a >= l1 && ch.b <= c.at) || (ch.a >= c.end && ch.b <= r0)) return true;
  if (ch.b === l0 && [added, removed].some((t) => t && (TIGHT_BEFORE.test(t) || (c.eq && REL_BEFORE.test(t))))) return true;
  if (ch.a === r1 && [added, removed].some((t) => t && (TIGHT_AFTER.test(t) || (c.eq && REL_AFTER.test(t))))) return true;
  return false;
}

/* The report: every condition and export with the entries that change it. */
export function coverage(src, mutants) {
  const all = edits(src, mutants), es = all.filter((e) => !e.missing);
  const conds = conditions(src);
  const consts = constantsOf(src);
  const out = conds.map((c) => {
    const values = c.names.filter((nm) => consts.has(nm) && occurrences(src, nm) === 2).map((nm) => consts.get(nm));
    const hits = (ch) => changesCondition(c, ch, conds) || values.some((v) => overlaps(ch, v) || (ch.a === ch.b && v[0] <= ch.a && ch.a <= v[1]));
    const by = es.filter((e) => e.changes.some((ch) => ch.alts.every(hits)));
    return { ...c, by: by.map((e) => e.name), status: c.declared ? 'declared' : by.length ? 'broken' : 'never broken' };
  });
  const exps = exportsOf(src).filter((x) => x.name !== 'selftest').map((x) => {
    const by = es.filter((e) => e.changes.some((ch) => ch.alts.every((alt) => overlaps(alt, [x.start, x.end]) || (alt.a === alt.b && x.start <= alt.a && alt.a <= x.end))));
    return { ...x, by: by.map((e) => e.name), status: by.length ? 'broken' : 'never broken' };
  });
  return { conditions: out, exports: exps, stale: all.filter((e) => e.missing).map((e) => e.name) };
}

/* The entries a list file holds for one module: [{name, from, to}]. Throws when it cannot read them. */
export function readList(listPath, modulePath) {
  if (listPath.endsWith('.json')) return JSON.parse(readFileSync(listPath, 'utf8').replace(/^﻿/, '')).map((m) => ({ name: m.name, from: m.from, to: m.to }));
  const text = readFileSync(listPath, 'utf8');
  const imp = /import\s*\{[^}]*\brunMutants\b[^}]*\}\s*from\s*(['"])/.exec(blank(text));
  const spec = imp ? text.slice(imp.index + imp[0].length, text.indexOf(imp[1], imp.index + imp[0].length)) : '';
  if (!/\.mutants\d*\.test\.mjs$/.test(listPath) || !/(^|\/)mutants\.mjs$/.test(spec)) {
    throw new Error(`${listPath} is not a *.mutants.test.mjs that imports runMutants from a mutants.mjs, so its entries cannot be read without running it`);
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
  console.log(`${modulePath}: ${list.length} entries; ${cov.conditions.length} conditions, ${cov.conditions.length - gaps.length - declared} changed, ${declared} declared, ${gaps.length} never changed; ${cov.exports.length} exports, ${cov.exports.length - lost.length} changed; ${cov.stale.length} stale`);
  for (const c of gaps) console.log(`  never changed  line ${c.line}  ${c.op}  ${short(lineText(src, c.line))}`);
  for (const x of lost) console.log(`  export never changed  line ${x.line}  ${x.name}`);
  for (const s of cov.stale) console.log(`  stale entry (text not in the module exactly once)  ${s}`);
  return gaps.length || lost.length || cov.stale.length ? 1 : 0;
}

/* ---------------- selftest ---------------- */
function selftest() {
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const ops = (s) => conditions(s).map((c) => c.op);
  const m = (name, from, to) => ({ name, from, to });
  // a stale entry would make a case pass for the wrong reason, so it fails the case
  const st = (src, list) => { const cov = coverage(src, list); return cov.stale.length ? `stale: ${cov.stale.join()}` : cov.conditions.map((c) => c.status).join(' | '); };

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
  yes('a condition just past a selftest\'s closing brace is counted', ops('function selftest() { ok(); }<1').join() === '<');

  // the operands
  const opnd = (s) => { const c = conditions(s)[0]; return [c.left, c.right].map(([a, b]) => s.slice(a, b)).join('|'); };
  yes('a string is an operand', opnd("if (k.w === 'around') x();") === "k.w|'around'");
  yes('a string on the left is an operand', opnd("if ('a' === k) x();") === "'a'|k");
  yes('an exponent number is one operand', opnd('if (e < 1e-3) x();') === 'e|1e-3');
  yes('an exponent number on the left is one operand', opnd('if (1e-3 < e) x();') === '1e-3|e');
  yes('a negative bound is an operand', opnd('if (t > -5) x();') === 't|-5');
  yes('a call and an index are part of the operand', opnd('if (f(a)[0] >= g.h(b)) x();') === 'f(a)[0]|g.h(b)');
  yes('a negation and an optional chain on the right are part of the operand', opnd('if (a === !b) x();') === 'a|!b' && opnd('if (a > b?.c) x();') === 'a|b?.c');

  // the changes an entry makes
  const ch = (f, t) => changes(f, t).map((c) => `${c.a},${c.b},${c.ins}`).join(';');
  yes('only the changed token is the change', ch('if (a < 10) x', 'if (a < 11) x') === '8,10,11');
  yes('a change at both ends is two changes', ch('f(x)', '[...new Set(f(x))]') === '0,0,[...new Set(;4,4,)]');
  yes('a change of spaces alone is no change', ch('a<1', 'a < 1') === '');
  const rm = changes('a || b === 1 || c', 'a || c');
  yes('a removal is one change with nothing added', rm.length === 1 && rm[0].ins === '' && rm[0].alts.every((x) => x.ins === ''));
  const alts = (f, t) => changes(f, t).map((c) => c.alts.map((x) => `${x.a},${x.b},${x.ins}`).sort().join(' / ')).join(';');
  yes('a removal that could sit in two places has both', alts('x == null || x[k] == null', 'x[k] == null') === '0,13, / 1,14,');
  yes('an insertion that could sit in two places has both', alts('x[k] == null', 'x == null || x[k] == null') === '0,0,x == null ||  / 1,1, == null || x');
  yes('a change with one place has one', alts('a < 1', 'a < 2') === '4,5,2');
  yes('a removal is credited only for what every placement changes', st('if (i < 0 || b.indexOf(f, i + 1) >= 0) x();\n', [m('a', ' || b.indexOf(f, i + 1) >= 0', '')]) === 'never broken | broken | broken');
  yes('a removed outer clamp leaves the inner clamp unchanged', st('const v = Math.max(0, Math.min(1, x));\n', [m('a', 'Math.max(0, Math.min(1, x))', 'Math.min(1, x)')]) === 'broken | never broken');

  // a comparison: what changes it
  const SRC = 'export function clamp(p, lim) {\n  if (p > lim) return lim;\n  return Math.max(0, p);\n}\n';
  yes('no entries: every condition never changed', st(SRC, []) === 'never broken | never broken');
  yes('the operator changed changes it', st(SRC, [m('a', 'p > lim', 'p >= lim')]).startsWith('broken'));
  yes('an operand changed changes it', st(SRC, [m('a', 'if (p > lim)', 'if (p > 2 * lim)')]).startsWith('broken'));
  yes('something tighter added after the bound changes it', st(SRC, [m('a', 'p > lim)', 'p > lim + 1)')]).startsWith('broken'));
  yes('a member access added after the bound changes it', st(SRC, [m('a', 'p > lim)', 'p > lim.v)')]).startsWith('broken'));
  yes('a call added after the bound changes it', st(SRC, [m('a', 'p > lim)', 'p > lim(2))')]).startsWith('broken'));
  yes('an index added after the bound changes it', st(SRC, [m('a', 'p > lim)', 'p > lim[0])')]).startsWith('broken'));
  yes('something looser added after the bound does not', st(SRC, [m('a', 'p > lim)', 'p > lim && p)')]).startsWith('never broken'));
  yes('a prefix operator removed before the operand changes it', st("if (typeof v === 'n') x();\n", [m('a', 'typeof v', 'v')]) === 'broken');
  yes('a looser operand removed before it does not', st("if (q && v === 'n') x();\n", [m('a', 'q && v', 'v')]) === 'never broken');
  yes('a relational test added after an equality changes it', st('if (a === b) x();\n', [m('a', 'a === b', 'a === b < 2')]) === 'broken');
  yes('a relational test added before an equality changes it', st('if (b === c) x();\n', [m('a', '(b === c)', '(a < b === c)')]) === 'broken');
  yes('a relational test added after a relation does not', st('if (a > b) x();\n', [m('a', 'a > b)', 'a > b < 2)')]) === 'never broken');
  yes('a change beside the condition does not', st(SRC, [m('a', 'return lim;', 'return 0;')]) === 'never broken | never broken');
  yes('the left operand changed changes it', st(SRC, [m('a', 'if (p > lim)', 'if (q > lim)')]).startsWith('broken'));
  yes('something added after the left operand changes it', st(SRC, [m('a', 'if (p > lim)', 'if (p + 1 > lim)')]).startsWith('broken'));
  yes('an entry reaching over the condition that changes only what follows does not', st(SRC, [m('a', 'if (p > lim) return lim;', 'if (p > lim) return 0;')]).startsWith('never broken'));
  yes('a changed string operand changes it', st("if (k === 'a') x();\n", [m('a', "'a')", "'b')")]) === 'broken');
  yes('a changed exponent changes it', st('if (e < 1e-3) x();\n', [m('a', '1e-3', '2e-3')]) === 'broken');
  yes('a conjunct added after a string does not', st("if (c.b === 'pending') x();\n", [m('a', "'pending')", "'pending' && y)")]) === 'never broken');
  yes('a wrap around the expression does not', st('const k = f(typeof v === "s");\n', [m('a', 'f(typeof v === "s")', '[...new Set(f(typeof v === "s"))]')]) === 'never broken');

  // chains, defaults and nesting
  const CH = 'if (!a || b === 1 || c === 2) x();\n';
  yes('removing one disjunct changes its comparison, and neither operator it could have taken', st(CH, [m('a', 'b === 1 || ', '')]) === 'never broken | broken | never broken | never broken');
  yes('a removal that slides right over equal tokens credits neither operator', st('if (b||b||a<1) x();\n', [m('a', '(b||', '(')]) === 'never broken | never broken | never broken');
  const ed = (src, f, t) => edits(src, [m('a', f, t)])[0].changes[0].alts.map((x) => x.a);
  yes('an insertion slides right into the module past the entry\'s text', ed('x y y z', 'x y', 'x y y').includes(5));
  yes('an insertion slides left into the module past the entry\'s text', ed('x y y z', 'y z', 'y y z').some((a) => a < 4));
  yes('removing a disjunct that can sit in one place changes its operator', st('if (a < 1 || b > 2) x();\n', [m('a', 'a < 1 || ', '')]) === 'broken | broken | never broken');
  yes('a boolean chain is not changed through its operands', st('if (!a || b) x();\n', [m('a', '!a || b', '!a || c')]) === 'never broken');
  yes('a default\'s literal value changed changes it', st("const t = w || 'every planet';\n", [m('a', "'every planet'", "'all'")]) === 'broken');
  yes('a default\'s literal extended tighter changes it', st('const t = w ?? 2;\n', [m('a', 'w ?? 2;', 'w ?? 2 * 3;')]) === 'broken');
  yes('a sign added before a default\'s literal changes it', st('const t = w ?? 2;\n', [m('a', 'w ?? 2;', 'w ?? -2;')]) === 'broken');
  yes('a default inside a clamp: a change to what it defaults changes the clamp, not the default', st('const t = Math.max(0, w ?? 1);\n', [m('a', 'w ??', 'v ??')]) === 'broken | never broken');
  yes('a default followed by a comma does not change', st('const t = [w ?? 2];\n', [m('a', 'w ?? 2]', 'w ?? 2, 3]')]) === 'never broken');
  yes('null is a literal default', st('const t = w ?? null;\n', [m('a', 'w ?? null', 'w ?? undefined')]) === 'broken');
  yes('undefined is a literal default', st('const t = w ?? undefined;\n', [m('a', 'w ?? undefined', 'w ?? null')]) === 'broken');
  yes('a default whose value is a constant changes when the constant does', st('export const D = 2;\nexport const f = (w) => w ?? D;\n', [m('a', 'D = 2', 'D = 3')]) === 'broken');
  yes('a default followed by a looser addition does not change', st('const t = w ?? 2;\n', [m('a', 'w ?? 2;', 'w ?? 2 || 3;')]) === 'never broken');
  yes('a condition nested in an operand does not change the one around it', st('if (!g || !(g.c >= 0)) x();\n', [m('a', 'g.c >= 0', 'g.c >= 1')]) === 'never broken | broken');

  // clamps
  yes('the clamp\'s own argument changes the clamp', st(SRC, [m('a', 'Math.max(0, p)', 'Math.max(1, p)')]).endsWith('| broken'));
  yes('something added at the inside edge of a clamp changes it', st('const v = Math.max(0, p);\n', [m('a', 'Math.max(0', 'Math.max(-1 + 0')]) === 'broken');
  yes('the word Math.max changed changes the clamp', st(SRC, [m('a', 'Math.max(0', 'Math.min(0')]).endsWith('| broken'));
  const NEST = 'export const f = (most, pitch) => Math.max(-most, Math.min(most, pitch));\n';
  yes('a change inside a nested clamp changes the inner clamp only', st(NEST, [m('a', 'Math.min(most, pitch)', 'Math.min(most, pitch * 2)')]) === 'never broken | broken');
  const NEST2 = 'export const g = (a, b) => Math.max(Math.min(a, b) / 2 - 10, 0);\n';
  yes('a change in the outer clamp\'s own argument after a nested clamp changes the outer', st(NEST2, [m('a', '- 10', '- 12')]) === 'broken | never broken');

  // the change sees just inside and just outside
  const ov = (a, b, s, e) => overlaps({ a, b }, [s, e]);
  yes('a removal sharing one character with a span overlaps it', ov(4, 6, 5, 9));
  yes('a removal ending where a span starts does not', !ov(2, 5, 5, 9));
  yes('a removal starting where a span ends does not', !ov(9, 11, 5, 9));
  yes('an insertion strictly inside a span overlaps it', ov(6, 6, 5, 9));
  yes('an insertion at the edge of a span does not', !ov(5, 5, 5, 9) && !ov(9, 9, 5, 9));

  // constants
  const K = 'export const LIMIT = 1.4;\nexport function f(p) {\n  if (p > LIMIT) return 1;\n  return 0;\n}\n';
  yes('a constant changed at its definition changes the one condition naming it', st(K, [m('a', 'LIMIT = 1.4', 'LIMIT = 1.5')]) === 'broken');
  yes('a constant used twice changes neither', st('export const L = 1.4;\nexport const f = (p) => p > L;\nexport const g = (q) => q < L;\n', [m('a', 'L = 1.4', 'L = 1.5')]) === 'never broken | never broken');
  yes('a constant used outside conditions too does not', st('export const V = 2;\nexport const f = (p) => p > V;\nexport const g = () => V;\n', [m('a', 'V = 2', 'V = 3')]) === 'never broken');
  yes('a name declared inside a function is not a constant', st('function a() {\nconst K = 5;\nreturn 0;\n}\nexport const f = (p) => p > K;\n', [m('a', 'K = 5', 'K = 6')]) === 'never broken');
  yes('a name also used as a parameter is not used', st('export const N = 3;\nconst o = { m(N) { return N; } };\nexport const f = (p) => p > N;\n', [m('a', 'N = 3', 'N = 4')]) === 'never broken');
  yes('a top-level let assigned again is not used', st('let L = 3;\nL = 4;\nexport const f = (p) => p > L;\n', [m('a', 'L = 3', 'L = 5')]) === 'never broken');
  yes('a comma declaration is a constant too', st('export const LO = 1, HI = 9;\nexport const f = (p) => p < HI;\n', [m('a', 'HI = 9', 'HI = 8')]) === 'broken');
  yes('a value on the next line is part of the constant', st('export const L =\n  3;\nexport const f = (p) => p > L;\n', [m('a', '  3;', '  4;')]) === 'broken');
  yes('an edit elsewhere on the definition\'s line does not', st('export const LIMIT = 4;\nexport const f = (p) => p > LIMIT;\n', [m('a', 'export const LIMIT', 'const LIMIT')]) === 'never broken');
  yes('a comment that looks like a definition is not one', st('// LIMIT = 3 was tried\nexport const LIMIT = 4;\nexport const f = (p) => p > LIMIT;\n', [m('a', 'LIMIT = 4', 'LIMIT = 5')]) === 'broken');
  yes('a property of the same name is not another use', st('export const L = 3;\nexport const f = (p) => p.L > L;\n', [m('a', 'L = 3', 'L = 4')]) === 'broken');
  yes('a constant named in a clamp changes the clamp', st('export const LO = 0;\nexport const f = (p) => Math.max(LO, p);\n', [m('a', 'LO = 0', 'LO = 1')]) === 'broken');

  // declared and stale
  yes('a declared condition is reported as declared', st('if (a < 1) b(); // equivalent: the guard above covers it\n', []) === 'declared');
  yes('an ordinary comment does not declare', st('if (a < 1) b(); // a guard\n', []) === 'never broken');
  yes('the word in code does not declare', st('const o = { equivalent: 1 }; if (a < 1) b(); // a guard\n', []) === 'never broken');
  yes('an entry whose text appears twice is stale, not counted', coverage('a < 1; a < 1;\n', [m('a', 'a < 1', 'a <= 1')]).stale.join() === 'a');

  // exports
  const ex = exportsOf('export function f(a) { return a; }\nexport const g = (b) => b + 1;\nexport const h = async (c) => { return c; };\nexport default function (d) { return d; }\nexport const k = mk(2);\nexport const w = (1 + 2);\nconst z = 2;\n');
  yes('exports are found with their names', ex.map((x) => x.name).join() === 'f,g,h,default', ex.map((x) => x.name).join());
  const two = 'export function f(a) { return a; }\nexport function g(b) { return b; }\n';
  yes('an export whose body an entry edits is changed; another is not', coverage(two, [m('a', 'return a;', 'return 0;')]).exports.map((x) => x.status).join() === 'broken,never broken');
  yes('an entry in the second export does not change the first', coverage(two, [m('a', 'return b;', 'return 0;')]).exports.map((x) => x.status).join() === 'never broken,broken');
  yes('an exported selftest is not counted as an export', coverage('export function selftest() { return 1; }\n', []).exports.length === 0);
  yes('a removal that could sit in either of two exports changes only the one every placement touches', coverage('export function f(a) { return a; }\nexport function g(a) { return a; }\n', [m('a', 'return a; }\nexport function g(a) { return a; }', 'return a; }')]).exports.map((x) => x.status).join() === 'never broken,broken');
  yes('an arrow export\'s body ends at its statement', coverage('export const f = (a) => a + 1;\nexport const g = (b) => b + 2;\n', [m('a', 'b + 2', 'b + 3')]).exports.map((x) => x.status).join() === 'never broken,broken');

  // the report and its exit code
  const rd = mkdtempSync(join(tmpdir(), 'conditions-report-'));
  const capture = (fn) => { const lines = [], log = console.log, err = console.error; console.log = (s) => lines.push(String(s)); console.error = (s) => lines.push(String(s)); try { return { code: fn(), lines }; } finally { console.log = log; console.error = err; } };
  try {
    const mod = join(rd, 'mod.js'), list = join(rd, 'list.json'), list2 = join(rd, 'list2.json');
    writeFileSync(mod, 'export function f(a) { return a < 1; }\nexport function g(b) { return b; }\n');
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }, { name: 'y', from: 'return b;', to: 'return 0;' }]));
    yes('every condition and export changed: exit 0', capture(() => report(mod, [list])).code === 0);
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }]));
    let r = capture(() => report(mod, [list]));
    yes('an export never changed alone: exit 1, and its line printed', r.code === 1 && r.lines.some((l) => /^ {2}export never changed {2}line 2 {2}g$/.test(l)));
    writeFileSync(list2, JSON.stringify([{ name: 'y', from: 'return b;', to: 'return 0;' }]));
    yes('two lists are read as one', capture(() => report(mod, [list, list2])).code === 0);
    writeFileSync(list, JSON.stringify([{ name: 'y', from: 'return b;', to: 'return 0;' }, { name: 'z', from: 'f(a)', to: 'f(b)' }]));
    r = capture(() => report(mod, [list]));
    yes('a condition never changed alone: exit 1, and its line printed', r.code === 1 && r.lines.some((l) => /^ {2}never changed {2}line 1 {2}< /.test(l)));
    writeFileSync(list, JSON.stringify([{ name: 'x', from: 'a < 1', to: 'a <= 1' }, { name: 'y', from: 'return b;', to: 'return 0;' }, { name: 's', from: 'gone', to: 'x' }]));
    r = capture(() => report(mod, [list]));
    yes('a stale entry alone: exit 1, and it is printed', r.code === 1 && r.lines.some((l) => /stale entry .* s$/.test(l)));
    writeFileSync(join(rd, 'other.mutants.test.mjs'), 'console.log(1);\n');
    yes('a list the tool cannot read: exit 3', capture(() => report(mod, [join(rd, 'other.mutants.test.mjs')])).code === 3);
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
    const body = `import { runMutants, helper } from './mutants.mjs';\nimport { fileURLToPath } from 'node:url';\nimport { dirname } from 'node:path';\nconst here = dirname(fileURLToPath(import.meta.url));\nprocess.exit(await runMutants({ here, file: 'mod.js', test: 'mod.test.mjs', mutants: [['one', 'a < 1', 'a <= ' + (helper - 6)]] }));\n`;
    writeFileSync(join(tests, 'mod.mutants.test.mjs'), body);
    const got = readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'mod.js'));
    yes('a mutants test file is read without running its runner, its other imports kept', got.map((e) => `${e.name}:${e.from}:${e.to}`).join() === 'one:a < 1:a <= 1');
    let threw = false;
    try { readList(join(tests, 'mod.mutants.test.mjs'), join(lab, 'other.js')); } catch { threw = true; }
    yes('a list with no entries for the module is an error, not an empty pass', threw);
    const refused = (file, text) => { writeFileSync(join(tests, file), text); try { readList(join(tests, file), join(lab, 'mod.js')); return false; } catch (e) { return /is not a \*\.mutants\.test\.mjs/.test(e.message); } };
    yes('a file with its own runner is refused before it runs', refused('own.mutants.test.mjs', 'import { spawn } from "node:child_process";\n'));
    yes('a file not named *.mutants.test.mjs is refused', refused('mod.mutation.test.mjs', body));
    yes('an import left in a comment is refused', refused('cm.mutants.test.mjs', `// import { runMutants } from './mutants.mjs';\n`));
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
