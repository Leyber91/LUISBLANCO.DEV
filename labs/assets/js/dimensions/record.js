// @ts-check
/* ============================================================
   dimensions/record.js: what Folded Space keeps, its shape and every rule (ticket 1.09; atlas records 1 and 2,
   evidence 1; the record kinds of plans/dimensional/bindings.json). Pure: the page asks for a change, this file
   returns the new record or a refusal, and keep.js writes what came back through Labs OS (lab "dimensional", in this
   browser), so the privacy page's export and erase reach it.

   Version 2 (the pre-grade of 2026-11-21: every answer or action is kept with its time and mode):
   - calls:    the pick of a corner, its key and its verdict;
   - actions:  a pick of a drawing from the strip, Next and Clear;
   - drawings: the visitor's own, as their 28 by 28 reduction;
   - ledger:   the smallest step before and after hardening;
   - dropped:  what was let go past each bound.
   Every entry carries t (ms since 1970, from 2020 on) and mode ('example': an MNIST test digit of the strip; 'pad':
   the visitor's own drawing). A version-1 record is read forward: its drawings take mode 'pad', its ledger rows the
   mode their drawing's id names. Nothing typed is kept. A write that breaks the contract is refused with its reason,
   and the record is left as it was.
   ============================================================ */

import { KINDS } from './call.js';

export const RECORD_V = 2;
export const MAX = Object.freeze({ calls: 500, actions: 500, drawings: 24, ledger: 100 });
export const MODES = Object.freeze(['example', 'pad']);
export const NETWORKS = Object.freeze(['original', 'hardened']);
export const ACTIONS = Object.freeze(['pick', 'next', 'clear']);

/** @typedef {'example' | 'pad'} Mode */
/** A call. `right` is what the picked corner did; `counted` whether it enters the tally; `repeat` marks a call on a
 *  drawing already called on that network (review 1, second reading, finding 5: a repeat kept its corner's truth).
 *  @typedef {{ t: number, mode: Mode, drawing: string, kind: string, answer: number, read: number, right: boolean, counted: boolean, network: 'original' | 'hardened', repeat?: boolean }} Call */
/** @typedef {{ t: number, mode: Mode, what: 'pick' | 'next' | 'clear', drawing: string }} Action */
/** @typedef {{ t: number, mode: 'pad', id: string, pixels: string }} Drawing */
/** @typedef {{ t: number, mode: Mode, drawing: string, before: number | null, after: number | null }} LedgerRow */
/** @typedef {{ calls: number, actions: number, drawings: number, ledger: number }} Dropped */
/** @typedef {{ v: number, calls: Call[], actions: Action[], drawings: Drawing[], ledger: LedgerRow[], dropped: Dropped }} Rec */
/** @typedef {'calls' | 'actions' | 'drawings' | 'ledger'} ListName */
/** @typedef {{ record: Rec, refused: string }} Change */
/** @typedef {{ kind: string, persistent?: boolean } | null} StorageInfo */

const T_MIN = Date.UTC(2020, 0, 1);
// A pad drawing's id is unique across tabs and erases (second reading, finding 3: a count from the page's copy put
// one id on two drawings): base 36 of its time, then two random base-36 digits.
const PAD_ID = /^pad-[0-9a-z]{1,12}$/;
const DRAWING = /^(ex-\d{1,5}|pad-[0-9a-z]{1,12})$/;
/** A new pad drawing's id. @param {number} t ms since 1970 @param {number} r a number in [0, 1) */
export const padId = (t, r) => 'pad-' + Math.floor(t).toString(36) + Math.floor(r * 1296).toString(36).padStart(2, '0');
/** Two drawings are one when their pixels differ by less than this, as a mean over the 784 in full ink: a tap on a
 *  stroke changes 1 or 2 pixels by 1/255, about 0.00001; one more stroke changes 20 or more pixels by 1, over 0.025. */
export const SAME_PX = 0.01;
const B64_784 = /^[A-Za-z0-9+/]{1046}==$/;

/** @returns {Rec} */
export const empty = () => ({ v: RECORD_V, calls: [], actions: [], drawings: [], ledger: [], dropped: { calls: 0, actions: 0, drawings: 0, ledger: 0 } });

/** @param {unknown} t */
const isT = (t) => typeof t === 'number' && Number.isFinite(t) && t >= T_MIN && t <= 8.64e15;
/** @param {unknown} d */
const isDigit = (d) => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 9;
/** @param {unknown} s */
const isStep = (s) => s === null || (typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 0.5);
/** The mode a drawing id names. @param {string} id @returns {Mode} */
export const modeOf = (id) => (id.startsWith('pad-') ? 'pad' : 'example');

/** Why a call breaks the contract, or '' when it keeps it. @param {any} c */
export function callProblem(c) {
  if (!c || typeof c !== 'object') return 'a call must be an object';
  if (!isT(c.t)) return 'a call needs a time';
  if (!MODES.includes(c.mode)) return `unknown mode ${String(c.mode)}`;
  if (typeof c.drawing !== 'string' || !DRAWING.test(c.drawing)) return 'unknown drawing id';
  if (c.mode !== modeOf(c.drawing)) return 'the mode must match the drawing';
  if (!KINDS.includes(c.kind)) return `unknown corner ${String(c.kind)}`;
  if (!isDigit(c.answer) || !isDigit(c.read)) return 'an answer is a digit from 0 to 9';
  if (typeof c.right !== 'boolean' || typeof c.counted !== 'boolean') return 'right and counted are true or false';
  if (c.repeat !== undefined && typeof c.repeat !== 'boolean') return 'repeat is true or false';
  if (c.repeat && c.counted) return 'a repeat is not counted';
  if (c.right && !c.counted && !c.repeat) return 'a call that is not counted cannot be right, unless it is a repeat';
  if (!NETWORKS.includes(c.network)) return `unknown network ${String(c.network)}`;
  return '';
}
/** @param {any} a */
export function actionProblem(a) {
  if (!a || typeof a !== 'object') return 'an action must be an object';
  if (!isT(a.t)) return 'an action needs a time';
  if (!ACTIONS.includes(a.what)) return `unknown action ${String(a.what)}`;
  if (typeof a.drawing !== 'string' || !DRAWING.test(a.drawing)) return 'unknown drawing id';
  if (!MODES.includes(a.mode) || a.mode !== modeOf(a.drawing)) return 'the mode must match the drawing';
  return '';
}
/** @param {any} d */
export function drawingProblem(d) {
  if (!d || typeof d !== 'object') return 'a drawing must be an object';
  if (!isT(d.t)) return 'a drawing needs a time';
  if (typeof d.id !== 'string' || !PAD_ID.test(d.id)) return 'a kept drawing is one of the pad’s';
  if (d.mode !== 'pad') return 'a kept drawing has the mode pad';
  if (typeof d.pixels !== 'string' || !B64_784.test(d.pixels)) return 'a drawing is 784 bytes in base64';
  return '';
}
/** @param {any} l */
export function ledgerProblem(l) {
  if (!l || typeof l !== 'object') return 'a ledger row must be an object';
  if (!isT(l.t)) return 'a ledger row needs a time';
  if (typeof l.drawing !== 'string' || !DRAWING.test(l.drawing)) return 'unknown drawing id';
  if (!MODES.includes(l.mode) || l.mode !== modeOf(l.drawing)) return 'the mode must match the drawing';
  if (!isStep(l.before) || !isStep(l.after)) return 'a step is between 0 and 0.5, or none';
  return '';
}

/**
 * A record read from the store, checked whole. A later version is shown and never written (readOnly).
 * @param {any} raw
 * @returns {{ record: Rec, readOnly: boolean, problems: string[] }}
 */
export function read(raw) {
  if (raw == null) return { record: empty(), readOnly: false, problems: [] };
  if (typeof raw !== 'object' || !Number.isInteger(raw.v)) return { record: empty(), readOnly: false, problems: ['the stored record has no version; it was set aside'] };
  // A later version's shape is unknown here, so it is left as it is, never read into version 2's readers and never
  // written (review 1, finding 4: handing it on raw broke every reader). The page shows an empty record and says why.
  if (raw.v > RECORD_V) return { record: { ...empty(), v: raw.v }, readOnly: true, problems: [`This record was kept by a later version of this page (version ${raw.v}), so it is left as it is: not shown here and not written.`] };
  /** @type {string[]} */
  const problems = [];
  const v1 = raw.v === 1;
  /** @template T @param {any} arr @param {(e: any) => string} check @param {string} name @param {(e: any) => any} [up] @returns {T[]} */
  const keep = (arr, check, name, up = (e) => e) => (Array.isArray(arr) ? arr : []).map((e) => (e && typeof e === 'object' ? up(e) : e)).filter((e) => { const p = check(e); if (p) problems.push(`${name}: ${p}`); return !p; });
  const dropped = raw.dropped && typeof raw.dropped === 'object' ? raw.dropped : {};
  /** @param {unknown} x */
  const n = (x) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);
  return {
    record: {
      v: RECORD_V,
      calls: /** @type {Call[]} */ (keep(raw.calls, callProblem, 'call')).slice(-MAX.calls),
      actions: /** @type {Action[]} */ (keep(raw.actions, actionProblem, 'action')).slice(-MAX.actions),
      drawings: /** @type {Drawing[]} */ (keep(raw.drawings, drawingProblem, 'drawing', (d) => (v1 ? { ...d, mode: 'pad' } : d))).slice(-MAX.drawings),
      ledger: /** @type {LedgerRow[]} */ (keep(raw.ledger, ledgerProblem, 'ledger', (l) => (v1 && typeof l.drawing === 'string' ? { ...l, mode: modeOf(l.drawing) } : l))).slice(-MAX.ledger),
      dropped: { calls: n(dropped.calls), actions: n(dropped.actions), drawings: n(dropped.drawings), ledger: n(dropped.ledger) },
    },
    readOnly: false,
    problems,
  };
}

/** @param {Rec} rec @param {ListName} list @param {any} entry @param {(e: any) => string} problem @returns {Change} */
function add(rec, list, entry, problem) {
  const p = problem(entry);
  if (p) return { record: rec, refused: p };
  const items = [...rec[list], entry];
  const over = Math.max(0, items.length - MAX[list]);
  return { record: { ...rec, [list]: items.slice(over), dropped: { ...rec.dropped, [list]: rec.dropped[list] + over } }, refused: '' };
}
/** A call on a pad drawing names a drawing the record holds (second reading, finding 3: a call on an erased drawing
 *  was kept). @param {Rec} rec @param {Call} c @returns {Change} */
export function addCall(rec, c) {
  const p = callProblem(c);
  if (p) return { record: rec, refused: p };
  if (c.mode === 'pad' && !rec.drawings.some((d) => d.id === c.drawing)) return { record: rec, refused: 'a call on your drawing needs the drawing kept, and it is not' };
  return add(rec, 'calls', c, callProblem);
}
/** @param {Rec} rec @param {Action} a */
export const addAction = (rec, a) => add(rec, 'actions', a, actionProblem);
/** @param {Rec} rec @param {LedgerRow} l */
export const addLedger = (rec, l) => add(rec, 'ledger', l, ledgerProblem);
/** A drawing grows stroke by stroke: the same id replaces its earlier entry. @param {Rec} rec @param {Drawing} d @returns {Change} */
export function putDrawing(rec, d) {
  const p = drawingProblem(d);
  if (p) return { record: rec, refused: p };
  const i = rec.drawings.findIndex((x) => x.id === d.id);
  if (i >= 0) { const drawings = rec.drawings.slice(); drawings[i] = d; return { record: { ...rec, drawings }, refused: '' }; }
  return add(rec, 'drawings', d, drawingProblem);
}

/** The tally the page shows, computed from the kept calls (progress 1). @param {{ calls: Call[] }} rec */
export function tallyOf(rec) {
  // A drawing counts once per network state (review 1, finding 3): the first counted call on (drawing, network).
  /** @type {Set<string>} */
  const seen = new Set();
  const counted = rec.calls.filter((c) => { if (!c.counted) return false; const k = c.drawing + '|' + c.network; if (seen.has(k)) return false; seen.add(k); return true; });
  return { made: counted.length, right: counted.filter((c) => c.right).length };
}

/** Whether two kept drawings are one drawing (SAME_PX). @param {string} a @param {string} b */
export function sameDrawing(a, b) {
  if (a === b) return true;
  const x = atob(a), y = atob(b);
  let d = 0;
  for (let p = 0; p < 784; p++) d += Math.abs(x.charCodeAt(p) - y.charCodeAt(p));
  return d / (784 * 255) < SAME_PX;
}

/** Whether a counted call on this drawing, or on a pad drawing with the same pixels, is already kept on this network:
 *  then a later call is a repeat (second reading, finding 2: a tap made a new id with the same pixels).
 *  @param {Rec} rec @param {{ drawing: string, network: 'original' | 'hardened' }} c */
export function calledBefore(rec, c) {
  const on = rec.calls.filter((k) => k.counted && k.network === c.network);
  if (on.some((k) => k.drawing === c.drawing)) return true;
  if (modeOf(c.drawing) !== 'pad') return false;
  const mine = rec.drawings.find((d) => d.id === c.drawing);
  if (!mine) return false;
  return on.some((k) => { if (modeOf(k.drawing) !== 'pad') return false; const d = rec.drawings.find((e) => e.id === k.drawing); return !!d && sameDrawing(d.pixels, mine.pixels); });
}

/** The call as it is kept, decided on the record as the store holds it at the write (second reading, finding 4):
 *  a repeat keeps what its corner did and is not counted. @param {Rec} rec @param {Call} c @returns {Call} */
export function markRepeat(rec, c) {
  return c.counted && calledBefore(rec, c) ? { ...c, counted: false, repeat: true } : c;
}

/** The health line (records 2.4): the contract's version, what is kept, and where. @param {Rec} rec @param {StorageInfo} storage @param {boolean} [readOnly] */
export function health(rec, storage, readOnly = false) {
  // A later version's record is not read here, so its contents are not counted as if they were none (second reading,
  // finding 6).
  if (readOnly && rec.v > RECORD_V) return `Record version ${rec.v} (read only), written by a later version of this page: not read here, and nothing is written to it.`;
  const where = !storage ? 'not kept: the store did not open'
    : storage.kind === 'memory' ? 'kept only until this tab closes'
    : `kept in this browser${storage.persistent ? '' : ', which may clear it'}`;
  /** @param {number} k @param {string} one @param {string} many */
  const count = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const parts = [count(rec.calls.length, 'call', 'calls'), count(rec.actions.length, 'action', 'actions'), count(rec.drawings.length, 'drawing', 'drawings'), count(rec.ledger.length, 'ledger row', 'ledger rows')];
  return `Record version ${rec.v}${readOnly ? ' (read only)' : ''}: ${parts.join(', ')}, ${where}.`;
}

/** 784 values in [0, 1] as base64 bytes, and back. @param {ArrayLike<number>} x */
export function pixelsTo64(x) { let s = ''; for (let p = 0; p < 784; p++) s += String.fromCharCode(Math.max(0, Math.min(255, Math.round((x[p] ?? 0) * 255)))); return btoa(s); }
/** @param {string} b */
export function pixelsFrom64(b) { return Float64Array.from(atob(b), (c) => c.charCodeAt(0) / 255); }
