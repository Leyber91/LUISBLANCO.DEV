/* ============================================================
   kit/guard.test.mjs — the door, and the four labs that use it.

     node labs/assets/js/kit/guard.test.mjs

   Each case below is a way text from outside reached the page as
   markup, a script address or a fetched address, found by an
   audit on 2026-11-14 and reproduced then. The check is always
   the same: after the guard, the value the page would write
   cannot open a tag, leave a quoted attribute, or name anything
   but a web address or a plain colour.
   ============================================================ */

import { noTags, inert, finite, intIn, httpUrl, hexColour, cleanDeep } from './guard.js';
import { cleanRun } from '../dataspace/run-guard.js';
import { cleanTrace, validateTrace } from '../token-ekg/engine/schema.js';

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
  return out;
};
const MARK = '<img src=x onerror="document.title=\'MARK\'">';

/* ---------------- the primitives ---------------- */
eq(noTags('a < b > c "q" \'s\''), 'a ‹ b › c "q" \'s\'', 'noTags changes the two brackets and nothing else');
ok(!/[<>"'`]/.test(inert(MARK + '`')), 'inert leaves nothing that opens a tag or closes a quoted attribute');
eq(inert('llama3.1:8b (Q4_K_M), 2026-11-11T10:18:58.268Z'), 'llama3.1:8b (Q4_K_M), 2026-11-11T10:18:58.268Z', 'inert leaves an ordinary label as it was');
ok(finite(3.5) === 3.5 && finite('82') === 82 && finite(' ') === null && finite(MARK) === null && finite(NaN) === null && finite(Infinity) === null && finite(null) === null, 'finite takes a number or a string that is one');
ok(intIn(3, 1, 5) === 3 && intIn('4', 1, 5) === 4 && intIn(6, 1, 5) === null && intIn(2.5, 1, 5) === null && intIn(MARK, 1, 5) === null, 'intIn takes a whole number inside its bounds');
ok(httpUrl('https://example.org/a?b=1') === 'https://example.org/a?b=1' && httpUrl('http://example.org') === 'http://example.org/', 'httpUrl takes a web address');
for (const bad of ['javascript:void(document.title="marker")', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///c:/x', '//example.org', 'not a url', '', null, 7, {}]) eq(httpUrl(bad), null, `httpUrl refuses ${JSON.stringify(bad)}`);
ok(hexColour('#D4A24C') === '#D4A24C' && hexColour('url(https://attacker.example/beacon.gif)') === null && hexColour('#fff') === null && hexColour('red;background:url(x)') === null && hexColour(5) === null, 'hexColour takes six hex digits and nothing else');
{
  const v = cleanDeep({ a: MARK, [MARK]: [MARK, { b: MARK, n: 3, t: true, z: null, bad: NaN }] });
  ok(strings(v).every((s) => !/[<>"'`]/.test(s)), 'cleanDeep makes every string and key inert');
  ok(v.a !== undefined && Object.values(v)[1][1].n === 3 && Object.values(v)[1][1].t === true && Object.values(v)[1][1].z === null && Object.values(v)[1][1].bad === null, 'and leaves numbers, booleans and null, turning a non-finite number into null');
  let deep = MARK;
  for (let i = 0; i < 300; i++) deep = { a: [deep] };
  ok(strings(cleanDeep(deep)).every((s) => !/[<>]/.test(s)), 'text nested 300 levels down does not come through');
  const kept = cleanDeep({ text: MARK, label: MARK }, { keep: (p) => p[0] === 'text' });
  ok(kept.text === MARK && !/[<>]/.test(kept.label), 'a field named as measured text stays as written; the rest is cleaned');
}

/* ---------------- Dataspace: a run from a link or a file ---------------- */
{
  const good = { id: 'flatbread.llama3.1-8b.r1.L1', kind: 'recorded', preset: 'flatbread', level: 1, budgetWords: 82, capsule: 'a "quoted" <capsule>', rebuild: 'b',
    provenance: { route: 'ollama, local recorder (record.mjs)', model: 'llama3.1:8b', digest: '46e0c10c039e', quant: 'Q4_K_M', params: '8.0B', ollamaVersion: '0.40.15', date: '2026-11-11T10:18:58.268Z', promptVersion: 'p1', seed: 1, temperature: 0.7, repeat: 1, compressCall: 'c.x', rebuildCall: 'b.x' } };
  const c = cleanRun(good);
  const sorted = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  eq(JSON.stringify(sorted(c)), JSON.stringify(sorted(good)), 'a run in the shape of the lab\'s own files comes through with every field as it was');
  eq(c.capsule, 'a "quoted" <capsule>', 'the capsule is measured text and stays exactly as written');
  const bad = cleanRun({ id: MARK, kind: MARK, level: 1, budgetWords: MARK, capsule: 'x', status: MARK, note: MARK, preset: MARK, schema: MARK, evil: MARK, calls: { a: MARK }, measures: { m: MARK },
    provenance: { repeat: '<b id=marker>', model: MARK, date: MARK, seed: MARK, temperature: MARK, unknown: MARK, rebuild: { x: MARK } } });
  const { capsule, rebuild, source, ...meta } = bad;
  ok(strings(meta).every((s) => !/[<>]/.test(s)), 'no field of a hostile run but its measured text can open a tag');
  ok(strings({ ...meta, note: '' }).every((s) => !/["'`]/.test(s)), 'and none but its note can leave a quoted attribute');
  ok(bad.budgetWords === 0 && bad.provenance.repeat === undefined && bad.provenance.seed === undefined && bad.provenance.temperature === undefined, 'a field the page prints as a number is a number or it is gone');
  ok(bad.evil === undefined && bad.calls === undefined && bad.measures === undefined && bad.provenance.unknown === undefined && bad.provenance.rebuild === undefined, 'fields the schema does not name are dropped, and so are stored measures and call records');
  for (const lvl of [0, 6, 2.5, '3x', MARK, null, undefined]) eq(cleanRun({ level: lvl }), null, `a run at level ${JSON.stringify(lvl)} is refused`);
  ok(cleanRun(null) === null && cleanRun([1]) === null && cleanRun('x') === null, 'what is not a run is refused');
  eq(cleanRun({ level: '3' }).level, 3, 'a level given as a string is taken as its number');
}

/* ---------------- Token EKG: a trace from a file or from storage ---------------- */
{
  const t = { id: MARK, label: MARK, kind: 'oneshot', route: MARK, model: MARK, recorded: '2026-11-14T10:00:00Z', recorder: MARK, note: MARK, placement: MARK,
    chunks: [[0, 'a', MARK], { t: 5, kind: 't', text: MARK }], promptPreview: MARK, reasoning: MARK, tDone: 9, usage: { prompt_tokens: 3, [MARK]: MARK }, options: { [MARK]: MARK } };
  const c = cleanTrace(t);
  ok(c.chunks[0][2] === MARK && c.chunks[1].text === MARK && c.promptPreview === MARK && c.reasoning === MARK, 'what the model said and what it was asked stay exactly as written');
  const { chunks, promptPreview, reasoning, ...meta } = c;
  ok(strings(meta).every((s) => !/[<>"'`]/.test(s)), 'every other string of a hostile trace is inert, keys included');
  eq(validateTrace(c).length, 0, 'a cleaned trace is still a valid trace');
  ok(c.tDone === 9 && c.usage.prompt_tokens === 3 && c.chunks[0][0] === 0 && c.chunks[1].t === 5, 'its numbers are untouched');
  const plain = { id: 'r1', label: 'llama3.1 8b, cold', kind: 'stream', route: 'ollama-local', model: 'llama3.1:8b', recorded: '2026-11-14T10:00:00Z', chunks: [[0, 'a', 'hi']], tDone: 4 };
  eq(JSON.stringify(cleanTrace(plain)), JSON.stringify(plain), 'an ordinary trace comes through unchanged');
}

if (fails.length) { console.log(`guard tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`guard tests: ${passed} passed, 0 failed`);
