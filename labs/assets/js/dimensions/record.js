/* ============================================================
   dimensions/record.js: what Folded Space keeps, its shape and every rule (ticket 1.09; atlas records 1 and 2,
   evidence 1). Pure: the page asks for a change, this file returns the new record or a refusal, and the page writes
   what came back through Labs OS (lab "dimensional", in this browser), so the privacy page's export and erase reach it.

   The contract, version 1:
     { v: 1,
       calls:    [{ t, mode, drawing, kind, answer, read, right, counted, network }]   at most MAX.calls, newest last
       drawings: [{ t, id, pixels }]                                                  at most MAX.drawings
       ledger:   [{ t, drawing, before, after }]                                      at most MAX.ledger
       dropped:  { calls, drawings, ledger } }                                         what was let go past a bound
   - t: a time in ms since 1970, from the page's clock, finite and after 2020;
   - mode: 'example' (an MNIST test digit of the strip) or 'pad' (the visitor's own drawing);
   - network: 'original' or 'hardened'; kind: one of KINDS; answer and read: digits 0 to 9;
   - drawing: 'ex-<test index>' or 'pad-<n>'; pixels: 784 bytes in base64 (the reduced drawing, nothing else);
   - before and after: a step in [0, 0.5], or null for "over 0.5".
   Nothing typed is kept, and a drawing is kept only as its 28 by 28 reduction.
   A write that breaks the contract is refused with its reason, and the record is left as it was.
   ============================================================ */

import { KINDS } from './call.js';

export const RECORD_V = 1;
export const MAX = Object.freeze({ calls: 500, drawings: 24, ledger: 100 });
export const MODES = Object.freeze(['example', 'pad']);
export const NETWORKS = Object.freeze(['original', 'hardened']);
const T_MIN = Date.UTC(2020, 0, 1);
const DRAWING = /^(ex-\d{1,5}|pad-\d{1,6})$/;
const B64_784 = /^[A-Za-z0-9+/]{1044}AA==$|^[A-Za-z0-9+/]{1044}[A-Za-z0-9+/]{2}==$/;

export const empty = () => ({ v: RECORD_V, calls: [], drawings: [], ledger: [], dropped: { calls: 0, drawings: 0, ledger: 0 } });

const isT = (t) => Number.isFinite(t) && t >= T_MIN && t <= 8.64e15;
const isDigit = (d) => Number.isInteger(d) && d >= 0 && d <= 9;
const isStep = (s) => s === null || (typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 0.5);

/** Why an entry breaks the contract, or '' when it keeps it. */
export function callProblem(c) {
  if (!c || typeof c !== 'object') return 'a call must be an object';
  if (!isT(c.t)) return 'a call needs a time';
  if (!MODES.includes(c.mode)) return `unknown mode ${String(c.mode)}`;
  if (typeof c.drawing !== 'string' || !DRAWING.test(c.drawing)) return 'unknown drawing id';
  if (!KINDS.includes(c.kind)) return `unknown corner ${String(c.kind)}`;
  if (!isDigit(c.answer) || !isDigit(c.read)) return 'an answer is a digit from 0 to 9';
  if (typeof c.right !== 'boolean' || typeof c.counted !== 'boolean') return 'right and counted are true or false';
  if (c.right && !c.counted) return 'a call that is not counted cannot be right';
  if (!NETWORKS.includes(c.network)) return `unknown network ${String(c.network)}`;
  return '';
}
export function drawingProblem(d) {
  if (!d || typeof d !== 'object') return 'a drawing must be an object';
  if (!isT(d.t)) return 'a drawing needs a time';
  if (typeof d.id !== 'string' || !/^pad-\d{1,6}$/.test(d.id)) return 'a kept drawing is one of the pad’s';
  if (typeof d.pixels !== 'string' || !B64_784.test(d.pixels)) return 'a drawing is 784 bytes in base64';
  return '';
}
export function ledgerProblem(l) {
  if (!l || typeof l !== 'object') return 'a ledger row must be an object';
  if (!isT(l.t)) return 'a ledger row needs a time';
  if (typeof l.drawing !== 'string' || !DRAWING.test(l.drawing)) return 'unknown drawing id';
  if (!isStep(l.before) || !isStep(l.after)) return 'a step is between 0 and 0.5, or none';
  return '';
}

/** A record read from the store, checked whole. A later version is shown and never written (readOnly). */
export function read(raw) {
  if (raw == null) return { record: empty(), readOnly: false, problems: [] };
  if (typeof raw !== 'object' || !Number.isInteger(raw.v)) return { record: empty(), readOnly: false, problems: ['the stored record has no version; it was set aside'] };
  if (raw.v > RECORD_V) return { record: raw, readOnly: true, problems: [`kept by a later version of this page (${raw.v}); shown, not written`] };
  const problems = [];
  const keep = (arr, check, name) => (Array.isArray(arr) ? arr : []).filter((e) => { const p = check(e); if (p) problems.push(`${name}: ${p}`); return !p; });
  const dropped = raw.dropped && typeof raw.dropped === 'object' ? raw.dropped : {};
  const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    record: {
      v: RECORD_V,
      calls: keep(raw.calls, callProblem, 'call').slice(-MAX.calls),
      drawings: keep(raw.drawings, drawingProblem, 'drawing').slice(-MAX.drawings),
      ledger: keep(raw.ledger, ledgerProblem, 'ledger').slice(-MAX.ledger),
      dropped: { calls: n(dropped.calls), drawings: n(dropped.drawings), ledger: n(dropped.ledger) },
    },
    readOnly: false,
    problems,
  };
}

function add(rec, list, entry, problem) {
  const p = problem(entry);
  if (p) return { record: rec, refused: p };
  const items = [...rec[list], entry];
  const over = Math.max(0, items.length - MAX[list]);
  return { record: { ...rec, [list]: items.slice(over), dropped: { ...rec.dropped, [list]: rec.dropped[list] + over } }, refused: '' };
}
export const addCall = (rec, c) => add(rec, 'calls', c, callProblem);
export const addLedger = (rec, l) => add(rec, 'ledger', l, ledgerProblem);
/** A drawing grows stroke by stroke: the same id replaces its earlier entry. */
export function putDrawing(rec, d) {
  const p = drawingProblem(d);
  if (p) return { record: rec, refused: p };
  const i = rec.drawings.findIndex((x) => x.id === d.id);
  if (i >= 0) { const drawings = rec.drawings.slice(); drawings[i] = d; return { record: { ...rec, drawings }, refused: '' }; }
  return add(rec, 'drawings', d, drawingProblem);
}

/** The tally the page shows, computed from the kept calls (progress 1). */
export function tallyOf(rec) {
  const counted = rec.calls.filter((c) => c.counted);
  return { made: counted.length, right: counted.filter((c) => c.right).length };
}

/** The health line (records 2.4): the contract's version, what is kept, and where. */
export function health(rec, storage, readOnly = false) {
  const where = !storage ? 'not kept: the store did not open'
    : storage.kind === 'memory' ? 'kept only until this tab closes'
    : `kept in this browser${storage.persistent ? '' : ', which may clear it'}`;
  const c = rec.calls.length, d = rec.drawings.length, l = rec.ledger.length;
  const parts = [`${c} call${c === 1 ? '' : 's'}`, `${d} drawing${d === 1 ? '' : 's'}`, `${l} ledger row${l === 1 ? '' : 's'}`];
  return `Record version ${rec.v}${readOnly ? ' (read only)' : ''}: ${parts.join(', ')}, ${where}.`;
}

/** 784 values in [0, 1] as base64 bytes, and back. */
export function pixelsTo64(x) { let s = ''; for (let p = 0; p < 784; p++) s += String.fromCharCode(Math.max(0, Math.min(255, Math.round(x[p] * 255)))); return btoa(s); }
export function pixelsFrom64(b) { return Float64Array.from(atob(b), (c) => c.charCodeAt(0) / 255); }
