/* ============================================================
   blackhole/record.test.mjs — the record's rules (record.js),
   each one broken by a case just inside and just outside it.
   Run:  node labs/assets/js/blackhole/record.test.mjs
   ============================================================ */

import * as R from './record.js';
import { Store } from './state.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => { checks++; if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); } };
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
const J = (x) => JSON.stringify(x);

/* links the page writes */
const linkOf = (patch) => { const s = new Store(); s.set(patch, { instant: true }); return s.toQuery(); };
const M87 = (() => { const s = new Store(); s.set(s.objectPatch('m87'), { instant: true }); return s.toQuery(); })();
const SGRA = (() => { const s = new Store(); s.set(s.objectPatch('sgra'), { instant: true }); return s.toQuery(); })();
const CUSTOM = linkOf({ obj: 'custom', a: 0.5, q: 0.3, incl: 60, rcam: 120 });

guard('every link the state writes is a link the record keeps', () => {
  for (const q of [M87, SGRA, CUSTOM, '']) ok(`isLink(${J(q)})`, R.isLink(q), q);
  const at400 = 'ab=1' + '&a=1'.repeat(99), at401 = 'abc=1' + '&a=1'.repeat(99);
  ok('a link of 400 characters is kept, one of 401 is not', at400.length === 400 && at401.length === 401 && R.isLink(at400) && !R.isLink(at401), `${at400.length} ${at401.length}`);
  ok('a value of 24 characters is kept, 25 is not; a key of 4 letters is kept, 5 is not', R.isLink('a=' + '1'.repeat(24)) && !R.isLink('a=' + '1'.repeat(25)) && R.isLink('abcd=1') && !R.isLink('abcde=1'));
  for (const bad of ['<script>', 'a=1 2', 'name=hello world', 'a=1&&b=2', 'A=1', 'a=' + 'x'.repeat(25), 12, null, ['a=1']]) ok(`not a link: ${J(bad)}`, !R.isLink(bad));
});

guard('keep: most recent first, one entry per hole, refused when full', () => {
  let r = R.empty();
  let w = R.keep(r, { q: M87, t: 1 }); ok('keeps a hole', w.ok && w.record.kept.length === 1); r = w.record;
  w = R.keep(r, { q: SGRA, t: 2 }); r = w.record;
  ok('the newest first', r.kept[0].q === SGRA);
  w = R.keep(r, { q: M87, t: 3 }); r = w.record;
  ok('keeping a kept hole moves it to the top with its new time, once', r.kept.length === 2 && r.kept[0].q === M87 && r.kept[0].t === 3, J(r.kept));
  ok('a bad link is refused and the record comes back as it was', !R.keep(r, { q: 'a b', t: 4 }).ok && R.keep(r, { q: 'a b', t: 4 }).record === r);
  ok('a time that is not positive, or not finite, is refused', !R.keep(r, { q: CUSTOM, t: 0 }).ok && !R.keep(r, { q: CUSTOM, t: NaN }).ok && !R.keep(r, { q: CUSTOM, t: Infinity }).ok);
  let full = R.empty();
  for (let i = 0; i < R.LIMITS.kept; i++) full = R.keep(full, { q: `a=0.${i + 10}`, t: i + 1 }).record;
  ok(`${R.LIMITS.kept} are kept`, full.kept.length === R.LIMITS.kept);
  ok('one more is refused with the reason', !R.keep(full, { q: M87, t: 99 }).ok && R.keep(full, { q: M87, t: 99 }).why === R.FULL);
  ok('one already kept is still moved to the top when full', R.keep(full, { q: 'a=0.10', t: 99 }).ok);
  w = R.unkeep(r, M87); ok('unkeep takes it out', w.ok && !R.isKept(w.record, M87));
  ok('unkeep of one not kept is refused', !R.unkeep(r, CUSTOM).ok);
});

guard('rays: bounded, the oldest go and are counted', () => {
  let r = R.empty();
  ok('a ray is kept with its pixel and fate', R.ray(r, { q: M87, t: 1, p: [0.5, 0.5], fate: 'disk', n: 1 }).ok);
  for (const [why, bad] of [['pixel off the screen', { p: [1.01, 0.5] }], ['pixel below 0', { p: [-0.01, 0.5] }], ['pixel of three numbers', { p: [0.1, 0.2, 0.3] }], ['a fate it does not name', { fate: 'wormhole' }], ['an order of 10', { n: 10 }], ['an order that is not whole', { n: 1.5 }], ['a negative order', { n: -1 }]]) {
    ok(`refused: ${why}`, !R.ray(r, { q: M87, t: 1, p: [0.5, 0.5], fate: 'disk', n: 0, ...bad }).ok);
  }
  ok('the edges are inside: pixel 0 and 1, order 0 and 9', R.ray(r, { q: M87, t: 1, p: [0, 1], fate: 'sky', n: 9 }).ok && R.ray(r, { q: M87, t: 1, p: [1, 0], fate: 'captured', n: 0 }).ok);
  for (let i = 0; i < R.LIMITS.rays + 3; i++) r = R.ray(r, { q: M87, t: i + 1, p: [0.5, 0.5], fate: 'sky' }).record;
  ok(`the list stops at ${R.LIMITS.rays}, the newest first, and 3 dropped are counted`, r.rays.length === R.LIMITS.rays && r.rays[0].t === R.LIMITS.rays + 3 && r.dropped === 3, `${r.rays.length} ${r.rays[0].t} ${r.dropped}`);
});

guard('falls', () => {
  const r = R.empty();
  ok('a fall with its proper time', R.fall(r, { q: M87, t: 1, tau: 3.7e6 }).ok);
  ok('a fall with no proper time is refused', !R.fall(r, { q: M87, t: 1, tau: 0 }).ok && !R.fall(r, { q: M87, t: 1 }).ok);
  let fr = R.empty();
  for (let i = 0; i < R.LIMITS.falls + 2; i++) fr = R.fall(fr, { q: M87, t: i + 1, tau: 5 }).record;
  ok(`falls stop at ${R.LIMITS.falls}, the newest first, and 2 dropped are counted`, fr.falls.length === R.LIMITS.falls && fr.falls[0].t === R.LIMITS.falls + 2 && fr.dropped === 2, `${fr.falls.length} ${fr.dropped}`);
  const fcap = R.fall({ ...fr, dropped: R.LIMITS.dropped }, { q: M87, t: 99, tau: 5 }).record;
  ok('a fall dropped past the cap leaves the count at the cap', fcap.dropped === R.LIMITS.dropped, fcap.dropped);
  const two = R.ray(R.keep(R.keep(R.empty(), { q: M87, t: 1 }).record, { q: SGRA, t: 2 }).record, { q: M87, t: 3, p: [0.5, 0.5], fate: 'disk', n: 0 }).record;
  ok('the counts: 2 kept, 1 ray, 0 falls', J(R.counts(two)) === J({ kept: 2, rays: 1, falls: 0 }), J(R.counts(two)));
  ok('isKept: a kept hole yes, another no', R.isKept(two, M87) && !R.isKept(two, CUSTOM));
});

guard('one door: what the store gives back passes the same checks', () => {
  const dirty = { kept: [{ q: M87, t: 1 }, { q: M87, t: 2 }, { q: '<b>', t: 3 }, { q: SGRA }], rays: [{ q: M87, t: 1, p: [2, 0], fate: 'sky', n: 0 }, { q: M87, t: 1, p: [0.2, 0.3], fate: 'sky', n: 0, extra: 'typed words' }], falls: 'no', dropped: -4 };
  const n = R.normalise(dirty);
  ok('duplicates, bad links and entries without a time go', n.kept.length === 1 && n.kept[0].q === M87, J(n.kept));
  ok('a ray off the screen goes; a field the shape does not have is not carried', n.rays.length === 1 && !('extra' in n.rays[0]), J(n.rays));
  ok('a list that is not a list is empty; a negative count is 0', n.falls.length === 0 && n.dropped === 0);
  // a structured clone (IndexedDB) keeps an array's named fields, which JSON drops: such an array is not an entry
  ok('an entry that is a list, even one carrying a link and a time, goes', R.normalise({ kept: [Object.assign([], { q: M87, t: 1 })] }).kept.length === 0);
  ok('nothing at all is the empty record', J(R.normalise(null)) === J(R.empty()) && J(R.normalise('x')) === J(R.empty()));
  const big = { kept: Array.from({ length: 80 }, (_, i) => ({ q: `a=0.${i + 10}`, t: i + 1 })) };
  ok(`a stored list longer than its bound is cut to ${R.LIMITS.kept}`, R.normalise(big).kept.length === R.LIMITS.kept);
  const many = (n, e) => Array.from({ length: n }, (_, i) => ({ ...e, t: i + 1 }));
  const nb = R.normalise({ rays: many(R.LIMITS.rays + 1, { q: M87, p: [0.5, 0.5], fate: 'sky', n: 0 }), falls: many(R.LIMITS.falls + 1, { q: M87, tau: 5 }) });
  ok(`stored rays and falls past their bounds are cut to ${R.LIMITS.rays} and ${R.LIMITS.falls}`, nb.rays.length === R.LIMITS.rays && nb.falls.length === R.LIMITS.falls, `${nb.rays.length} ${nb.falls.length}`);
  const ray0 = { q: M87, t: 1, p: [0.5, 0.5], fate: 'sky', n: 0 };
  const odd = R.normalise({ rays: [{ ...ray0, p: [0.1, 0.2, 0.3] }, { ...ray0, n: 10 }, { ...ray0, n: -1 }, { ...ray0, n: 1.5 }, { ...ray0, fate: 'wormhole' }, { ...ray0, p: [0.5, -0.1] }, { ...ray0, n: 9 }] });
  ok('stored rays with a pixel of three numbers, an order outside 0 to 9 or not whole, an unknown fate or a pixel off the screen go; order 9 stays', odd.rays.length === 1 && odd.rays[0].n === 9, J(odd.rays));
  ok(`a stored count of drops above ${R.LIMITS.dropped} is held at it; a count that is not whole is 0`, R.normalise({ dropped: 2e6 }).dropped === R.LIMITS.dropped && R.normalise({ dropped: 2.5 }).dropped === 0);
  const capped = R.ray({ ...R.empty(), rays: R.normalise({ rays: many(R.LIMITS.rays, ray0) }).rays, dropped: R.LIMITS.dropped }, ray0).record;
  ok('a drop past the cap leaves the count at the cap', capped.dropped === R.LIMITS.dropped, capped.dropped);
  const f0 = R.normalise({ falls: [{ q: M87, t: 1, tau: 0 }, { q: M87, t: 1, tau: 3 }] });
  ok('a stored fall with no proper time goes', f0.falls.length === 1 && f0.falls[0].tau === 3, J(f0.falls));
});

/* the store: a stand-in with the Labs OS progress API */
function fakeOS(initial = null, v = R.V) {
  let rec = initial ? { data: initial, v } : null, writes = 0, resume = null;
  return {
    progress: {
      async get({ migrate } = {}) { return rec && (rec.v <= R.V && migrate ? { ...rec, data: migrate(rec.data) } : rec); },
      async set(data, { v: vv }) { writes++; rec = { data: JSON.parse(JSON.stringify(data)), v: vv }; return rec; },
      async setResume(url, label) { resume = { url, label }; },
    },
    get writes() { return writes; }, get resume() { return resume; }, get rec() { return rec; },
  };
}
const asyncGuard = async (name, fn) => { try { await fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };

await asyncGuard('the store is the truth: a change applies to what it holds now', async () => {
  const os = fakeOS();
  const a = await R.update(os, (r) => R.keep(r, { q: M87, t: 1 }));
  ok('an accepted change is written once', a.ok && a.changed && os.writes === 1);
  // another tab keeps Sgr A* in the meantime
  os.progress.set({ ...os.rec.data, kept: [{ q: SGRA, t: 2 }, ...os.rec.data.kept] }, { v: R.V });
  const b = await R.update(os, (r) => R.keep(r, { q: CUSTOM, t: 3 }));
  ok('a later change keeps what another tab wrote', b.record.kept.map((e) => e.q).join('|') === [CUSTOM, SGRA, M87].join('|'), J(b.record.kept));
  const w0 = os.writes;
  const c = await R.update(os, (r) => R.keep(r, { q: 'a b', t: 4 }));
  ok('a refused change writes nothing and says why', !c.ok && !c.changed && os.writes === w0 && c.why === R.BAD_LINK);
  const e = await R.update(os, (r) => R.keep(r, { q: 'a b', t: 5 }), { resume: { url: '/x', label: 'refused' } });
  ok('no way back is written beside a refused change', !e.ok && os.resume === null, J(os.resume));
  const d = await R.update(os, (r) => R.keep(r, { q: M87, t: 5 }), { resume: { url: '/labs/bh_animation_page.html?' + M87, label: 'M87*' } });
  ok('the way back is written beside an accepted change', d.ok && os.resume && os.resume.label === 'M87*');
});

await asyncGuard('a record of a later version is read and never written', async () => {
  const os = fakeOS({ kept: [{ q: M87, t: 1 }], rays: [], falls: [], dropped: 0 }, R.V + 1);
  const r = await R.read(os);
  ok('it is read and marked newer', r.newer && r.record.kept.length === 1);
  ok('load gives the stored record', (await R.load(os)).kept[0].q === M87);
  const u = await R.update(os, (x) => R.keep(x, { q: SGRA, t: 2 }));
  ok('a change to it is refused with the reason, and nothing is written', !u.ok && u.why === R.NEWER && os.writes === 0);
});

console.log(fails ? `\n${fails} of ${checks} record check(s) failed` : `\nall ${checks} record checks passed`);
process.exit(fails ? 1 : 0);
