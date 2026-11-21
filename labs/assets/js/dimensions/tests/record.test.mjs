// record.test.mjs: the record's contract (record.js, version 2), each rule just inside and just outside its bound.
// Run: node labs/assets/js/dimensions/tests/record.test.mjs (exit 1 on any failure).
import { empty, read, addCall, addAction, addLedger, putDrawing, tallyOf, health, callProblem, actionProblem, drawingProblem, ledgerProblem, pixelsTo64, pixelsFrom64, modeOf, MAX, RECORD_V } from '../record.js';

let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const T = Date.UTC(2026, 10, 21, 9, 0, 0);
const call = (o = {}) => ({ t: T, mode: 'example', drawing: 'ex-4', kind: 'template', answer: 4, read: 9, right: true, counted: true, network: 'original', ...o });
const act = (o = {}) => ({ t: T, mode: 'example', what: 'pick', drawing: 'ex-4', ...o });
const px = pixelsTo64(new Float64Array(784).fill(0.5));
const drawing = (o = {}) => ({ t: T, mode: 'pad', id: 'pad-1', pixels: px, ...o });
const row = (o = {}) => ({ t: T, mode: 'pad', drawing: 'pad-1', before: 0.042, after: null, ...o });

ok(RECORD_V === 2, 'the contract is version 2');
ok(modeOf('pad-3') === 'pad' && modeOf('ex-4') === 'example', 'an id names its mode');

// 1. Calls: a good call is kept; each broken field is refused with a reason, and the record is left as it was.
ok(callProblem(call()) === '', 'a good call keeps the contract');
const bad = [
  [{ t: Date.UTC(2019, 11, 31) }, 'time'], [{ t: NaN }, 'time'], [{ mode: 'drawn' }, 'mode'], [{ drawing: 'x-1' }, 'drawing'],
  [{ drawing: 'ex-123456' }, 'drawing'], [{ mode: 'pad' }, 'mode must match'], [{ kind: 'corner' }, 'corner'], [{ answer: 10 }, 'digit'],
  [{ read: -1 }, 'digit'], [{ answer: 4.5 }, 'digit'], [{ right: 'yes' }, 'true or false'], [{ right: true, counted: false }, 'not counted'],
  [{ network: 'robust' }, 'network'],
];
for (const [o, why] of bad) {
  const r = addCall(empty(), call(o));
  ok(r.refused && r.refused.includes(why) && r.record.calls.length === 0, `a call with ${JSON.stringify(o)} is refused (${r.refused})`);
}
ok(callProblem(call({ t: Date.UTC(2020, 0, 1) })) === '' && callProblem(call({ answer: 0, read: 9 })) === '', 'the bounds themselves are kept (2020-01-01, digits 0 and 9)');
ok(callProblem(call({ right: false, counted: false })) === '' && callProblem(call({ mode: 'pad', drawing: 'pad-12', network: 'hardened' })) === '', 'not counted and not right is kept; the pad and the hardened network are kept');

// 2. Actions: a pick, Next and Clear, each with its time and mode.
for (const what of ['pick', 'next', 'clear']) ok(actionProblem(act({ what })) === '', `the action ${what} keeps the contract`);
ok(actionProblem(act({ what: 'erase' })).includes('unknown action'), 'an unknown action is refused');
ok(actionProblem(act({ mode: 'pad' })).includes('mode must match'), 'an action’s mode must match its drawing');
ok(actionProblem(act({ t: T_before() })).includes('time'), 'an action needs a time from 2020 on');
function T_before() { return Date.UTC(2019, 11, 31, 23, 59, 59); }
let r = addAction(empty(), act({ what: 'clear', mode: 'pad', drawing: 'pad-2' }));
ok(!r.refused && r.record.actions.length === 1, 'a Clear on a pad drawing is kept');

// 3. Drawings: 784 bytes in base64, only the pad's, with the mode pad, replaced while one grows.
ok(drawingProblem(drawing()) === '', 'a good drawing keeps the contract');
ok(pixelsFrom64(px).length === 784 && Math.abs(pixelsFrom64(px)[0] - 128 / 255) < 1e-12, 'pixels go to base64 and back');
ok(drawingProblem(drawing({ pixels: px.slice(4) })).includes('784'), 'a short drawing is refused');
ok(drawingProblem(drawing({ id: 'ex-4' })).includes('pad'), 'an example digit is not kept as a drawing');
ok(drawingProblem(drawing({ mode: 'example' })).includes('mode pad'), 'a kept drawing has the mode pad');
r = putDrawing(empty(), drawing());
r = putDrawing(r.record, drawing({ pixels: pixelsTo64(new Float64Array(784)) }));
ok(r.record.drawings.length === 1 && pixelsFrom64(r.record.drawings[0].pixels)[0] === 0, 'the same drawing id replaces its entry');
r = putDrawing(r.record, drawing({ id: 'pad-2' }));
ok(r.record.drawings.length === 2, 'a new id adds a drawing');

// 4. The ledger: steps in [0, 0.5] or null, with the mode of its drawing.
ok(ledgerProblem(row()) === '', 'a ledger row with "over 0.5" keeps the contract');
ok(ledgerProblem(row({ before: 0, after: 0.5 })) === '', 'the steps 0 and 0.5 are kept');
ok(ledgerProblem(row({ before: 0.51, after: 0.6 })).includes('0.5'), 'a step over 0.5 is refused');
ok(ledgerProblem(row({ before: -0.01, after: 0.1 })).includes('0.5'), 'a negative step is refused');
ok(ledgerProblem(row({ mode: 'example' })).includes('mode must match'), 'a row’s mode must match its drawing');
ok(!addLedger(empty(), row({ mode: 'example', drawing: 'ex-4' })).refused, 'a row on an example is kept with the mode example');

// 5. Bounds: past MAX the oldest go, and the record counts what it let go.
let rec = empty();
for (let i = 0; i < MAX.calls + 3; i++) rec = addCall(rec, call({ t: T + i })).record;
ok(rec.calls.length === MAX.calls && rec.dropped.calls === 3 && rec.calls[0].t === T + 3, `the calls keep the newest ${MAX.calls} and count 3 let go`);
rec = empty();
for (let i = 0; i < MAX.actions + 1; i++) rec = addAction(rec, act({ t: T + i })).record;
ok(rec.actions.length === MAX.actions && rec.dropped.actions === 1, 'the actions keep their bound and count what went');

// 6. The tally comes from the kept calls.
rec = empty();
for (const o of [{}, { right: false }, { right: false, counted: false }, {}]) rec = addCall(rec, call(o)).record;
const t = tallyOf(rec);
ok(t.made === 3 && t.right === 2, `the tally counts calls that count (${t.right} of ${t.made})`);

// 7. Reading: nothing stored, a broken store, a later version, a version-1 record read forward, and one bad entry.
ok(read(null).record.calls.length === 0 && !read(null).readOnly, 'nothing stored reads as an empty record');
ok(read('junk').problems.length === 1 && read({}).problems.length === 1, 'a record without a version is set aside, and said');
const later = read({ v: RECORD_V + 1, calls: [] });
ok(later.readOnly && later.problems[0].includes('later version'), 'a later version is shown and never written');
const v1 = read({ v: 1, calls: [call()], drawings: [{ t: T, id: 'pad-1', pixels: px }], ledger: [{ t: T, drawing: 'ex-4', before: 0.04, after: null }], dropped: { calls: 2 } });
ok(v1.problems.length === 0 && v1.record.v === 2 && v1.record.drawings[0].mode === 'pad' && v1.record.ledger[0].mode === 'example' && v1.record.actions.length === 0 && v1.record.dropped.calls === 2, `a version-1 record is read forward (${v1.problems})`);
const mixed = read({ v: 2, calls: [call(), call({ kind: 'x' })], actions: [act(), act({ what: 'x' })], drawings: [drawing()], ledger: [] });
ok(mixed.record.calls.length === 1 && mixed.record.actions.length === 1 && mixed.problems.length === 2, `bad entries are left out and named (${mixed.problems})`);

// 8. The health line names the version, what is kept and where.
ok(/^Record version 2: 4 calls, 0 actions, 0 drawings, 0 ledger rows, kept in this browser\.$/.test(health(rec, { kind: 'indexeddb', persistent: true })), health(rec, { kind: 'indexeddb', persistent: true }));
ok(/which may clear it/.test(health(rec, { kind: 'indexeddb', persistent: false })) && /until this tab closes/.test(health(rec, { kind: 'memory' })) && /did not open/.test(health(rec, null)), 'the health line says when the browser may clear it, when it is memory only, and when the store did not open');
ok(/read only/.test(health(rec, { kind: 'indexeddb', persistent: true }, true)), 'a read-only record says so');

console.log(`record.test: ${n - fails} of ${n} passed`);
process.exit(fails ? 1 : 0);
