// @ts-check
/* ============================================================
   dimensions/keep.js: the record on the page, after Black Hole's keep.js and Exomania's log.js. record.js holds the
   shape and every rule; this file asks Labs OS (lab "dimensional", in this browser) for changes and hands the page
   what came back.
   - The store is the truth: each change reads what the store holds then, is checked by record.js, is written once,
     and the page draws the record the store returned. Changes go one at a time (inTurn).
   - A change refused by the contract, or a write the browser refused, is said in the page's own words (onSay).
   - A record a later version of the page wrote is left as it is: not read here and never written.
   - A change runs under a lock shared by the browser's tabs of the page (Web Locks), so its read and its write are
     one step; a call is marked a repeat on the record the store holds then, and the page draws the call as kept.
   - Events carry the corner's kind, whether the call was right, which network, or which action, never a drawing or
     anything typed: dimensional.call (outcome), dimensional.draw and dimensional.act (action), dimensional.harden
     (outcome).
   ============================================================ */

import { LabsOS } from '../os/index.js';
import * as R from './record.js';

export const LAB = 'dimensional';
/** @type {ReadonlyArray<[string, 'action' | 'outcome']>} */
const EVENTS = [['dimensional.call', 'outcome'], ['dimensional.draw', 'action'], ['dimensional.act', 'action'], ['dimensional.harden', 'outcome']];

/** @typedef {{ type: string, data: object | null }} KeepEvent */
/**
 * @typedef {object} Keep
 * @property {Promise<void>} ready
 * @property {(c: R.Call) => Promise<R.Call | null>} call  resolves to the call as kept (a repeat marked), or null
 * @property {(a: R.Action) => Promise<void>} action
 * @property {(d: R.Drawing) => Promise<void>} drawing
 * @property {(l: R.LedgerRow) => Promise<void>} ledger
 * @property {() => R.Rec} current
 * @property {() => Promise<void>} reread
 */

/**
 * @param {{ onRecord: (rec: R.Rec, line: string, state: { writable: boolean, later: boolean }) => void, onSay: (s: string) => void }} hooks
 * @returns {Keep}
 */
export function startKeep({ onRecord, onSay }) {
  /** @type {import('../os/index.js').LabsOSInstance | null} */
  let os = null;
  let rec = R.empty(), readOnly = false;
  /** @type {R.StorageInfo} */
  let storage = null;
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  /** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  const inTurn = (job) => { const run = queue.then(job); queue = run.catch(() => {}); return run; };
  const publish = () => {
    try { onRecord(rec, R.health(rec, storage, readOnly), { writable: !!os && !readOnly, later: readOnly && rec.v > R.RECORD_V }); }
    catch { onSay('The record could not be drawn on this page.'); }
  };
  /** Read what the store holds now. @returns {Promise<boolean>} */
  /** @type {Set<string>} */
  const said = new Set();
  const readNow = async () => {
    if (!os) return true;
    try {
      const got = await os.progress.get(); const r = R.read(got ? got.data : null); rec = r.record; readOnly = r.readOnly;
      // What a read sets aside is said once, before a write lets it go (second reading: it went without a word).
      const fresh = r.problems.filter((p) => !said.has(p)); fresh.forEach((p) => said.add(p));
      if (fresh.length) onSay(fresh.join(' '));
      return true;
    } catch { return false; }
  };
  /** One change at a time across this browser's tabs of the page: the read and the write of a change are not
   *  interleaved with another tab's (Web Locks; where a browser has none, one tab at a time is assumed).
   *  @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  const locked = (job) => {
    const locks = /** @type {any} */ (globalThis.navigator)?.locks;
    return locks && typeof locks.request === 'function' ? locks.request('labs-dimensional-record', job) : job();
  };
  const ready = (async () => {
    try {
      os = await LabsOS.init({ lab: LAB, ui: false });
      storage = os.storage;
      for (const [type, cls] of EVENTS) { try { os.register(type, { cls }); } catch { /* registered already on this page */ } }
      const got = await os.progress.get();
      const r = R.read(got ? got.data : null);
      rec = r.record; readOnly = r.readOnly;
      r.problems.forEach((p) => said.add(p));
      if (r.problems.length) onSay(r.problems.join(' '));
    } catch {
      os = null;
      onSay('The record did not open, so calls are counted only until this tab closes.');
    }
    publish();
  })();
  /** Applies a change to the record as the store holds it and writes it. Resolves true when it was kept.
   *  @param {(x: R.Rec) => R.Change} apply @param {KeepEvent} event @returns {Promise<boolean>} */
  const change = (apply, event) => inTurn(() => locked(async () => {
    await ready;
    // Each change applies to what the store holds now, never to the copy read at load (review 1, finding 2): an erase
    // made on the privacy page or another tab's write since then is kept, not written over.
    if (!(await readNow())) { onSay('The record could not be read, so this change is not kept.'); return false; }
    if (readOnly) { onSay('This record was kept by a later version of the page, so nothing new is written to it.'); publish(); return false; }
    const r = apply(rec);
    if (r.refused) { onSay(`Not kept: ${r.refused}.`); publish(); return false; }
    if (os) {
      try { const pr = await os.progress.set(r.record, { v: R.RECORD_V }); rec = R.read(pr.data).record; }
      catch { onSay('The browser refused the write, so this change is not kept.'); return false; }
      os.track(event.type, event.data).catch(() => {});
    } else {
      rec = r.record;
    }
    publish();
    return true;
  }));
  return {
    ready,
    call: async (c) => {
      /** @type {R.Call} */
      let kept = c;
      const ok = await change((x) => { kept = R.markRepeat(x, c); return R.addCall(x, kept); }, { type: 'dimensional.call', data: { kind: c.kind, right: c.right, network: c.network } });
      return ok ? kept : null;
    },
    action: async (a) => { await change((x) => R.addAction(x, a), { type: 'dimensional.act', data: { what: a.what, mode: a.mode } }); },
    drawing: async (d) => { await change((x) => R.putDrawing(x, d), { type: 'dimensional.draw', data: null }); },
    ledger: async (l) => { await change((x) => R.addLedger(x, l), { type: 'dimensional.harden', data: { flipped: l.after !== null } }); },
    current: () => rec,
    // Read again when the tab comes back into view, so an erase made elsewhere shows here then.
    reread: () => inTurn(() => locked(async () => { await ready; await readNow(); publish(); })),
  };
}
