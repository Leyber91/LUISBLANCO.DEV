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
/** @typedef {{ t: number, mode: Mode, drawing: string, kind: string, answer: number, read: number, right: boolean, counted: boolean, network: 'original' | 'hardened' }} Call */
/** @typedef {{ t: number, mode: Mode, what: 'pick' | 'next' | 'clear', drawing: string }} Action */
/** @typedef {{ t: number, mode: 'pad', id: string, pixels: string }} Drawing */
/** @typedef {{ t: number, mode: Mode, drawing: string, before: number | null, after: number | null }} LedgerRow */
/** @typedef {{ calls: number, actions: number, drawings: number, ledger: number }} Dropped */
/** @typedef {{ v: number, calls: Call[], actions: Action[], drawings: Drawing[], ledger: LedgerRow[], dropped: Dropped }} Rec */
/** @typedef {'calls' | 'actions' | 'drawings' | 'ledger'} ListName */
/** @typedef {{ record: Rec, refused: string }} Change */
/** @typedef {{ kind: string, persistent?: boolean } | null} StorageInfo */

const T_MIN = Date.UTC(2020, 0, 1);
const DRAWING = /^(ex-\d{1,5}|pad-\d{1,6})$/;
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
  if (c.right && !c.counted) return 'a call that is not counted cannot be right';
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
  if (typeof d.id !== 'string' || !/^pad-\d{1,6}$/.test(d.id)) return 'a kept drawing is one of the pad’s';
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
  if (raw.v > RECORD_V) return { record: raw, readOnly: true, problems: [`kept by a later version of this page (${raw.v}); shown, not written`] };
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
/** @param {Rec} rec @param {Call} c */
export const addCall = (rec, c) => add(rec, 'calls', c, callProblem);
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
  const counted = rec.calls.filter((c) => c.counted);
  return { made: counted.length, right: counted.filter((c) => c.right).length };
}

/** The health line (records 2.4): the contract's version, what is kept, and where. @param {Rec} rec @param {StorageInfo} storage @param {boolean} [readOnly] */
export function health(rec, storage, readOnly = false) {
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
