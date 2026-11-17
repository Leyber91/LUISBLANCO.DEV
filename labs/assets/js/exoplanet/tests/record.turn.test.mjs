/* ============================================================
   Rule 10 of the record's client (record.js): a store that does
   not answer does not stall the page. Run from the repository
   root:
     node labs/assets/js/exoplanet/tests/record.turn.test.mjs

   Apart from record.test.mjs because these cases wait on the
   client's ticks and hold the thread on purpose (about 1.3 s),
   and record.mutants.test.mjs runs that file once per broken
   rule. record.turn.mutants.test.mjs breaks these rules and runs
   this file.
   ============================================================ */

import { TURN_MS, TICK_MS, STUCK, empty, pin, read, update } from '../record.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const stop = (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const known = (n) => /^w([1-9]\d{0,2})$/.test(n) && +n.slice(1) <= 600;

/* ---- rule 10: a store that does not answer does not stall the page ---- */
{
  yes('each read and write has 5 seconds, counted in ticks of 250 ms, and the reason says so', TURN_MS === 5000 && TICK_MS === 250 && STUCK === 'the browser\'s store did not answer within 5 seconds');
  const settles = (p, ms = 1500) => Promise.race([p.then(() => 'resolved', (e) => e.message), new Promise((r) => setTimeout(() => r('still waiting'), ms))]);
  const stuck = { storage: { kind: 'memory', persistent: false, fixture: null }, progress: { get: () => new Promise(() => {}), set: async () => null, setResume: async () => null } };
  const fine = (() => { let rec = { v: 3, data: empty() }; return { storage: { kind: 'memory', persistent: false, fixture: null }, progress: { get: async () => rec, set: async (d, o) => { rec = { v: o.v, data: d }; return rec; }, setResume: async () => rec } }; })();
  const hung = read(stuck, null, 30), after = read(fine);
  yes('a read the store never answers fails with the reason once its time is up', (await settles(hung)) === STUCK);
  yes('and the read after it runs', (await settles(after)) === 'resolved');
  const hungWrite = update(stuck, (r) => pin(r, 'w1', known), { limit: 30 }), nextWrite = update(fine, (r) => pin(r, 'w2', known));
  yes('a write the store never answers fails with the reason, and the write after it lands', (await settles(hungWrite)) === STUCK && (await settles(nextWrite)) === 'resolved'
    && (await Promise.race([read(fine).then((r) => r.record.log.pins.join('|')), new Promise((r) => setTimeout(() => r('still waiting'), 1500))])) === 'w2');
  const quick = await settles(read(fine, null, 30));
  yes('a read that answers within its time is not failed', quick === 'resolved');
  // the page holds its thread for 700 ms (as the survey does while it builds a shader), and the store answers right after
  const held = { storage: { kind: 'memory', persistent: false, fixture: null }, progress: { get: () => new Promise((r) => { setTimeout(() => { const t = Date.now(); while (Date.now() - t < 700) { /* the page's own work */ } setTimeout(() => r({ v: 3, data: empty() }), 0); }, 10); }), set: async () => null, setResume: async () => null } };
  const t0 = Date.now(), heldRead = await settles(read(held, null, 600), 3000), took = Date.now() - t0;
  yes('a store that answers once the page frees its thread is not failed, though the wall clock passed the limit', heldRead === 'resolved' && took > 600, `${heldRead} after ${took} ms`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
