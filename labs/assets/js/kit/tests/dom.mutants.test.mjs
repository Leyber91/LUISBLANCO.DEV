/* ============================================================
   The test of the decoder's tests. Run from the repository root:
     node labs/assets/js/kit/tests/dom.mutants.test.mjs

   Each entry breaks one rule of kit/dom.js unesc: an output
   silenced, a table entry dropped, or a condition moved to either
   side of its bound. The broken file is written to a copy of the
   kit in the system's temp folder and dom.test.mjs is run on the
   copy (the runner is kit/tests/mutants.mjs). Every broken rule
   must fail a check there. Written from the independent review of
   ticket 2.19 (2026-11-17), which found nine rules with no test.

   Equivalent, so not listed: the quantifiers {1,6}, {1,7} and
   {2,8} of the pattern (no name in the tables is longer than six
   letters, and a longer number fails the code-point bound); the
   windows-1252 range widened to 0x7f or 0xa0 (an index outside the
   table falls back to the code point itself, which is what HTML
   reads there).

   Add an entry with every new rule in unesc.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const R = String.raw;
const ACC = R`if (!m || !ACCENTED[m[2]][1].includes(m[1])) return null;`;
const W = R`if (cp >= 0x80 && cp <= 0x9f) return CP1252[cp - 0x80] ? String.fromCodePoint(CP1252[cp - 0x80]) : String.fromCodePoint(cp);`;
const NUMB = 'return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : null;';
const BASE = "if (body[0] === '#') return numeric(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)) ?? whole;";
const PATTERN = '/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g';
const HEAD = "export const unesc = (s) => String(s ?? '').replace(";

const named = ['amp', 'lt', 'gt', 'quot', 'nbsp', 'szlig', 'aelig', 'AElig', 'oslash', 'Oslash', 'eth', 'ETH', 'thorn', 'THORN', 'oelig']
  .map((k, i) => [`D${i + 1} the named ${k} dropped`, new RegExp(`(^|[ {])${k}: ('[^']*'|"[^"]*"),`), k]);
const MUTANTS = [
  // the named characters, one by one (the pattern finds each entry; the replacement drops its value)
  ...named.map(([name, re, k]) => {
    const line = R`const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', szlig: '\u00df', aelig: '\u00e6', AElig: '\u00c6',
  oslash: '\u00f8', Oslash: '\u00d8', eth: '\u00f0', ETH: '\u00d0', thorn: '\u00fe', THORN: '\u00de', oelig: '\u0153', OElig: '\u0152' };`;
    return [name, line, line.replace(re, (all, lead) => `${lead}${k}: '',`)];
  }),
  ['D16 the named apos dropped', `apos: "'",`, "apos: '',"],
  ['D17 the named OElig dropped', R`OElig: '\u0152' };`, "OElig: '' };"],
  ['D18 a name an object inherits read as a reference', 'if (Object.hasOwn(NAMED, name)) return NAMED[name];', 'if (name in NAMED) return NAMED[name];'],
  // the accents: each mark silenced, each list of letters short by one, one list given a letter HTML does not name
  ...['grave', 'acute', 'circ', 'tilde', 'uml', 'ring', 'cedil', 'caron'].map((a, i) => {
    const m = { grave: R`grave: ['\u0300', `, acute: R`acute: ['\u0301', `, circ: R`circ: ['\u0302', `, tilde: R`tilde: ['\u0303', `,
      uml: R`uml: ['\u0308', `, ring: R`ring: ['\u030a', `, cedil: R`cedil: ['\u0327', `, caron: R`caron: ['\u030c', ` }[a];
    return [`D${19 + i} the ${a} mark silenced`, m, `${a}: ['', `];
  }),
  ['D27 the grave on u forgotten', "'AEIOUaeiou'], acute", "'AEIOUaeio'], acute"],
  ['D28 the acute on Z forgotten', "'ACEILNORSUYZacegilnorsuyz'", "'ACEILNORSUYacegilnorsuyz'"],
  ['D29 the circumflex on y forgotten', "'ACEGHIJOSUWYaceghijosuwy'", "'ACEGHIJOSUWYaceghijosuw'"],
  ['D30 the tilde on e, which HTML does not name, read', "tilde: ['\\u0303', 'AINOUainou']", "tilde: ['\\u0303', 'AEINOUaeinou']"],
  ['D31 the umlaut on Y forgotten', "'AEIOUYaeiouy'", "'AEIOUaeiouy'"],
  ['D32 the ring on u forgotten', "'AUau'", "'AUa'"],
  ['D33 the cedilla on k forgotten', "'CGKLNRSTcklnrst'", "'CGKLNRSTclnrst'"],
  ['D34 the caron on z forgotten', "'CDELNRSTZcdelnrstz'", "'CDELNRSTZcdelnrst'"],
  ['D35 any letter takes any accent', ACC, 'if (!m) return null;'],
  ['D36 the composition left in two code points', ".normalize('NFC');", ';'],
  // windows-1252
  ['D37 128 not read as windows-1252', W, W.replace('cp >= 0x80', 'cp > 0x80')],
  ['D38 159 not read as windows-1252', W, W.replace('cp <= 0x9f', 'cp <= 0x9e')],
  ['D39 the five HTML keeps lost', W, W.replace(': String.fromCodePoint(cp);', ': null;')],
  ['D40 two dashes swapped in the table', '0x2013, 0x2014', '0x2014, 0x2013'],
  ['D41 128 to 159 read as themselves', W, ''],
  // numbers: each bound, both ways
  ['D42 zero read', NUMB, NUMB.replace('cp > 0 &&', 'cp >= 0 &&')],
  ['D43 one refused', NUMB, NUMB.replace('cp > 0 &&', 'cp > 1 &&')],
  ['D44 the last code point refused', NUMB, NUMB.replace('cp <= 0x10ffff', 'cp < 0x10ffff')],
  ['D45 past the last code point read', NUMB, NUMB.replace('cp <= 0x10ffff', 'cp <= 0x110000')],
  ['D46 the first surrogate read', NUMB, NUMB.replace('cp >= 0xd800', 'cp > 0xd800')],
  ['D47 the code point before the surrogates refused', NUMB, NUMB.replace('cp >= 0xd800', 'cp >= 0xd7ff')],
  ['D48 the last surrogate read', NUMB, NUMB.replace('cp <= 0xdfff', 'cp < 0xdfff')],
  ['D49 the code point after the surrogates refused', NUMB, NUMB.replace('cp <= 0xdfff', 'cp <= 0xe000')],
  ['D50 an upper-case X not matched', PATTERN, PATTERN.replace('#[xX]', '#x')],
  ['D51 an upper-case X read as decimal', BASE, BASE.replace(" || body[1] === 'X'", '')],
  ['D52 hexadecimal read as decimal', BASE, BASE.replace('parseInt(body.slice(2), 16)', 'parseInt(body.slice(2), 10)')],
  ['D53 a number read as nothing', BASE, BASE.replace(' ?? whole;', " ?? '';")],
  // the reading itself
  ['D54 no name read', 'return named(body) ?? whole;', 'return whole;'],
  ['D55 an unknown name dropped', 'return named(body) ?? whole;', "return named(body) ?? '';"],
  ['D56 read twice', HEAD, `export const unesc = (s) => unesc1(unesc1(s)); const unesc1 = (s) => String(s ?? '').replace(`],
  ['D57 nothing read at all', HEAD, "export const unesc = (s) => String(s ?? '') || String(s ?? '').replace("],
];

process.exit(await runMutants({ here, file: 'dom.js', test: 'dom.test.mjs', mutants: MUTANTS }));
