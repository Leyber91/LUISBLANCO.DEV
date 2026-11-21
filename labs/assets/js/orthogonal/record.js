/* ============================================================
   orthogonal/record.js: the visitor's record of the plate. No DOM.

   It lives in Labs OS's progress store (os/progress.js, the
   Progress class, through os.progress), never in storage of the
   lab's own (rules/labs.md), so the privacy page's export and
   erase reach it.

   The record:
     answered, right  the counts the plate shows, never trimmed
     next             the item the exercise opens next
     attempts         how many orders have been started: the seed
                      of each draw (engine.js item), so the same
                      steps come in new places on each attempt
     open             the order in progress, or null: its item, its
                      seed and the steps pressed so far, so a reload
                      draws it again as it was and keeps the presses
     chosen           the step last chosen in the reading
     log              each answer and each action, with its time and
                      the mode it came from: "practice" for an
                      answer and for the actions of an order (start,
                      press, undo, leave), "explore" for a step
                      chosen in the reading; a run of choices made
                      by walking the drawing with the arrow keys is
                      one choice, the last. The last EXERCISE.logCap
                      entries are kept.

   The state is a plain value and every change returns a new one
   (withStart, withPress, withUndo, withLeave, withChoice), so
   tests.mjs runs the same functions the page runs. The store is
   the truth: the Keeper applies each change to the record the store
   holds at that moment and writes the result, one change at a time,
   and the page shows what came back. When the browser refuses
   storage, or Labs OS does not start, the Keeper holds the record
   for the visit, and the page shows the storage-off diagnosis.
   ============================================================ */
import { EXERCISE } from './config.js';

export const RECORD_V = 2;   // 2 added attempts and open; a record of version 1 reads with neither
const PAGE = 'orthogonal';

export const fresh = () => ({ page: PAGE, answered: 0, right: 0, next: 0, attempts: 0, open: null, chosen: null, log: [] });

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/* The entries a log may hold, by mode. */
export const KINDS = Object.freeze({ practice: ['answer', 'start', 'press', 'undo', 'leave'], explore: ['choose'] });

/* An order in progress read back, or null when it does not hold together: its item and seed whole numbers from 0, a
   seed already counted, its presses distinct steps of the world and, given `stepsOf` (engine.js, the draw for an item
   and a seed), steps of its own draw, fewer than the draw has. */
function readOpen(o, attempts, known, stepsOf) {
  if (!o || typeof o !== 'object') return null;
  const it = count(o.item), seed = count(o.seed);
  if (it === null || seed === null || seed >= attempts || !Array.isArray(o.picks)) return null;
  const steps = stepsOf ? stepsOf({ item: it, seed }) : null;
  if (stepsOf && !steps) return null;
  const picks = o.picks;
  if (new Set(picks).size !== picks.length || picks.some((p) => !known.has(p) || (steps && !steps.includes(p)))) return null;
  if (picks.length >= (steps ? steps.length : EXERCISE.size)) return null;
  return { item: it, seed, picks: picks.slice() };
}

/* A stored record read back, or a fresh one when it is not this page's or does not hold together: a record someone
   edited by hand never breaks the plate. A record of version 1 has no attempts and no order in progress. */
export function restore(data, nodeIds, stepsOf = null) {
  if (!data || typeof data !== 'object' || data.page !== PAGE) return fresh();
  const answered = count(data.answered), right = count(data.right), next = count(data.next);
  const attempts = data.attempts === undefined ? 0 : count(data.attempts);
  if (answered === null || right === null || next === null || attempts === null || right > answered) return fresh();
  const known = new Set(nodeIds);
  const log = Array.isArray(data.log) ? data.log.filter((e) => e && typeof e.t === 'number' && KINDS[e.mode] && KINDS[e.mode].includes(e.kind))
    .slice(-EXERCISE.logCap) : [];
  return {
    page: PAGE, answered, right, next, attempts, open: readOpen(data.open, attempts, known, stepsOf),
    chosen: known.has(data.chosen) ? data.chosen : null, log,
  };
}

const append = (log, entry) => [...log, entry].slice(-EXERCISE.logCap);
const practice = (t, kind, item, node = null) => ({ t, mode: 'practice', kind, item, ...(node ? { node } : {}) });

/* An order started on item `item`: its seed is the attempt counter, which then counts it. An order already in progress
   gives way to it. */
export function withStart(state, { t, item }) {
  if (count(item) === null) return state;
  return {
    ...state, attempts: state.attempts + 1, open: { item, seed: state.attempts, picks: [] },
    log: append(state.log, practice(t, 'start', item)),
  };
}

/* A press on `node` in the order in progress. `stepsOf` gives the order's steps (engine.js stepsOf, from its item and
   seed); a press on a step that is not one of them, or is pressed already, changes nothing. The press that completes
   the order is checked by `judge` (engine.js judge, against the links) and kept as an answer. */
export function withPress(state, { t, node, stepsOf, judge }) {
  const o = state.open;
  const steps = o ? stepsOf(o) : null;
  if (!steps || !steps.includes(node) || o.picks.includes(node)) return state;
  const picks = [...o.picks, node];
  const pressed = { ...state, open: { ...o, picks }, log: append(state.log, practice(t, 'press', o.item, node)) };
  if (picks.length < steps.length) return pressed;
  const res = judge(picks);
  return withAnswer(pressed, { t, item: o.item, order: picks, right: res.right, needs: res.needs });
}

/* The last press of the order in progress taken back. */
export function withUndo(state, { t }) {
  const o = state.open;
  if (!o || !o.picks.length) return state;
  const node = o.picks[o.picks.length - 1];
  return { ...state, open: { ...o, picks: o.picks.slice(0, -1) }, log: append(state.log, practice(t, 'undo', o.item, node)) };
}

/* The order in progress left unanswered. Its item stays next; a new start draws it again with a new seed. */
export function withLeave(state, { t }) {
  if (!state.open) return state;
  return { ...state, open: null, log: append(state.log, practice(t, 'leave', state.open.item)) };
}

/* An answer checked: counted, logged with its time and mode, the order closed, and the next item after it. */
export function withAnswer(state, { t, item, order, right, needs = null }) {
  const entry = { t, mode: 'practice', kind: 'answer', item, order: order.slice(), right: !!right, ...(needs ? { needs } : {}) };
  return {
    ...state,
    answered: state.answered + 1,
    right: state.right + (right ? 1 : 0),
    next: Math.max(state.next, item + 1),
    open: null,
    log: append(state.log, entry),
  };
}

/* A step chosen in the reading: kept as the step to reopen on, and logged with its time and mode. With `walk`, a
   choice made by an arrow key, it replaces a choice the arrows made just before it (within EXERCISE.walkMs), so a walk
   down the drawing is logged as the step it ended on. */
export function withChoice(state, { t, node, walk = false }) {
  const last = state.log[state.log.length - 1];
  const entry = { t, mode: 'explore', kind: 'choose', node, ...(walk ? { walk: true } : {}) };
  const merge = walk && last && last.mode === 'explore' && last.walk && t - last.t <= EXERCISE.walkMs;
  return { ...state, chosen: node, log: merge ? [...state.log.slice(0, -1), entry] : append(state.log, entry) };
}

/* The count the plate shows. */
export const countLine = (state) => `${state.answered} answered, ${state.right} right`;

/* Holds the record in Labs OS and says whether it is kept. `progress` is os.progress (get and set for this lab), or
   null when Labs OS did not start; `persistent` is os.storage.persistent.

   apply(change) is the only way the page changes the record: it reads what the store holds, applies the one change
   to it, writes the result and gives back { state, changed }, and the page shows that state. Changes run one at a
   time, each on the record the one before it left. When the store cannot be read or written, the Keeper keeps the
   record for the visit and says nothing is kept. */
export class Keeper {
  constructor(progress, { persistent = false } = {}) {
    this.progress = progress;
    this.persistent = !!progress && persistent;
    this.failed = false;
    this.mem = null;        // the record for the visit: what the store last gave back, or held here when it fails
    this.ids = [];
    this.stepsOf = null;
    this.queue = new Promise((resolve) => { this.opened = resolve; });   // changes wait until the record is read
  }

  /** Kept across a reload: the store persists and no read or write has failed. */
  get kept() { return this.persistent && !this.failed; }

  /** Read the record once, with the world's step ids and its draws (engine.js stepsOf), and open the Keeper to
      changes. */
  async load(nodeIds, stepsOf = null) {
    this.ids = nodeIds;
    this.stepsOf = stepsOf;
    this.mem = await this.read();
    this.opened();
    return this.mem;
  }

  async read() {
    if (!this.progress || this.failed) return this.mem || fresh();
    try {
      const rec = await this.progress.get({ v: RECORD_V });
      return restore(rec && rec.data, this.ids, this.stepsOf);
    } catch {
      this.failed = true;
      return this.mem || fresh();
    }
  }

  apply(change) {
    const run = this.queue.then(async () => {
      const cur = await this.read();
      const next = change(cur);
      this.mem = next;
      if (next === cur) return { state: next, changed: false };
      if (this.progress && !this.failed) {
        try { await this.progress.set(next, { v: RECORD_V }); } catch { this.failed = true; }
      }
      return { state: next, changed: true };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
