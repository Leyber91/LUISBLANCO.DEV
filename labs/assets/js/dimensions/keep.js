// @ts-check
/* ============================================================
   dimensions/keep.js: the record on the page, after Black Hole's keep.js and Exomania's log.js. record.js holds the
   shape and every rule; this file asks Labs OS (lab "dimensional", in this browser) for changes and hands the page
   what came back.
   - The store is the truth: each change reads what the store holds then, is checked by record.js, is written once,
     and the page draws the record the store returned. Changes go one at a time (inTurn).
   - A change refused by the contract, or a write the browser refused, is said in the page's own words (onSay).
   - A record a later version of the page wrote is shown and never written.
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
 * @property {(c: R.Call) => Promise<void>} call
 * @property {(a: R.Action) => Promise<void>} action
 * @property {(d: R.Drawing) => Promise<void>} drawing
 * @property {(l: R.LedgerRow) => Promise<void>} ledger
 * @property {() => R.Rec} current
 */

/**
 * @param {{ onRecord: (rec: R.Rec, line: string) => void, onSay: (s: string) => void }} hooks
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
  /** @param {() => Promise<void>} job */
  const inTurn = (job) => { const run = queue.then(job); queue = run.catch(() => {}); return run; };
  const publish = () => onRecord(rec, R.health(rec, storage, readOnly));
  const ready = (async () => {
    try {
      os = await LabsOS.init({ lab: LAB, ui: false });
      storage = os.storage;
      for (const [type, cls] of EVENTS) { try { os.register(type, { cls }); } catch { /* registered already on this page */ } }
      const got = await os.progress.get();
      const r = R.read(got ? got.data : null);
      rec = r.record; readOnly = r.readOnly;
      if (r.problems.length) onSay(r.problems.join(' '));
    } catch {
      os = null;
      onSay('The record did not open, so calls are counted only until this tab closes.');
    }
    publish();
  })();
  /** @param {(x: R.Rec) => R.Change} apply @param {KeepEvent} event */
  const change = (apply, event) => inTurn(async () => {
    await ready;
    if (readOnly) { onSay('This record was kept by a later version of the page, so nothing new is written to it.'); return; }
    const r = apply(rec);
    if (r.refused) { onSay(`Not kept: ${r.refused}.`); return; }
    if (os) {
      try { const pr = await os.progress.set(r.record, { v: R.RECORD_V }); rec = R.read(pr.data).record; }
      catch { onSay('The browser refused the write, so this change is not kept.'); return; }
      os.track(event.type, event.data).catch(() => {});
    } else {
      rec = r.record;
    }
    publish();
  });
  return {
    ready,
    call: (c) => change((x) => R.addCall(x, c), { type: 'dimensional.call', data: { kind: c.kind, right: c.right, network: c.network } }),
    action: (a) => change((x) => R.addAction(x, a), { type: 'dimensional.act', data: { what: a.what, mode: a.mode } }),
    drawing: (d) => change((x) => R.putDrawing(x, d), { type: 'dimensional.draw', data: null }),
    ledger: (l) => change((x) => R.addLedger(x, l), { type: 'dimensional.harden', data: { flipped: l.after !== null } }),
    current: () => rec,
  };
}
