/* ============================================================
   orthogonal/record.js: the visitor's record of the plate. No DOM.

   It lives in Labs OS's progress store (os/progress.js, the
   Progress class, through os.progress), never in storage of the
   lab's own (rules/labs.md), so the privacy page's export and
   erase reach it.

   The record:
     answered, right  the counts the plate shows, never trimmed
     next             the item the exercise opens next
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
   (withAnswer, withChoice), so tests.mjs reads the same functions
   the page runs. The Keeper writes it through and says whether it
   is kept: when the browser refuses storage, or Labs OS does not
   start, the page keeps the state for the visit and shows the
   storage-off diagnosis.
   ============================================================ */
import { EXERCISE } from './config.js';

export const RECORD_V = 1;
const PAGE = 'orthogonal';

export const fresh = () => ({ page: PAGE, answered: 0, right: 0, next: 0, chosen: null, log: [] });

const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/* A stored record read back, or a fresh one when it is not this page's or does not hold together: a record someone
   edited by hand never breaks the plate. */
export function restore(data, nodeIds) {
  if (!data || typeof data !== 'object' || data.page !== PAGE) return fresh();
  const answered = count(data.answered), right = count(data.right), next = count(data.next);
  if (answered === null || right === null || next === null || right > answered) return fresh();
  const known = new Set(nodeIds);
  const log = Array.isArray(data.log) ? data.log.filter((e) => e && typeof e.t === 'number' && KINDS[e.mode] && KINDS[e.mode].includes(e.kind))
    .slice(-EXERCISE.logCap) : [];
  return { page: PAGE, answered, right, next, chosen: known.has(data.chosen) ? data.chosen : null, log };
}

/* The entries a log may hold, by mode. */
export const KINDS = Object.freeze({ practice: ['answer', 'start', 'press', 'undo', 'leave'], explore: ['choose'] });

const append = (log, entry) => [...log, entry].slice(-EXERCISE.logCap);

/* An action of an order (start, press, undo, leave), logged with its time and the practice mode. */
export function withAction(state, { t, kind, item, node = null }) {
  if (!KINDS.practice.includes(kind) || kind === 'answer') return state;
  return { ...state, log: append(state.log, { t, mode: 'practice', kind, item, ...(node ? { node } : {}) }) };
}

/* An answer checked: counted, logged with its time and mode, and the next item after it. */
export function withAnswer(state, { t, item, order, right, needs = null }) {
  const entry = { t, mode: 'practice', kind: 'answer', item, order: order.slice(), right: !!right, ...(needs ? { needs } : {}) };
  return {
    ...state,
    answered: state.answered + 1,
    right: state.right + (right ? 1 : 0),
    next: Math.max(state.next, item + 1),
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

/* Writes the record through Labs OS and says whether it is kept. `progress` is os.progress (get and set for this
   lab), or null when Labs OS did not start; `persistent` is os.storage.persistent. */
export class Keeper {
  constructor(progress, { persistent = false } = {}) {
    this.progress = progress;
    this.persistent = !!progress && persistent;
    this.failed = false;
  }

  /** Kept across a reload: the store persists and no write has failed. */
  get kept() { return this.persistent && !this.failed; }

  async load(nodeIds) {
    if (!this.progress) return fresh();
    try {
      const rec = await this.progress.get({ v: RECORD_V });
      return restore(rec && rec.data, nodeIds);
    } catch {
      this.failed = true;
      return fresh();
    }
  }

  async save(state) {
    if (!this.progress) return false;
    try {
      await this.progress.set(state, { v: RECORD_V });
    } catch {
      this.failed = true;
    }
    return this.kept;
  }
}
