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

guard('the kept frames carry a small picture, the 12 newest only (BAR_L1 C17; the 256 KB cap)', () => {
  const jpg = (n) => 'data:image/jpeg;base64,' + 'A'.repeat(n);
  ok('a small JPEG is a thumbnail, at the bound and not past it', R.isThumb(jpg(R.LIMITS.thumb - 23)) && !R.isThumb(jpg(R.LIMITS.thumb - 22)), `${jpg(R.LIMITS.thumb - 23).length}`);
  ok('a PNG, a script or a number is not', !R.isThumb('data:image/png;base64,AAAA') && !R.isThumb('javascript:alert(1)') && !R.isThumb(12) && !R.isThumb('data:image/jpeg;base64,AA AA'));
  let r = R.empty();
  const w = R.keep(r, { q: M87, t: 1, img: jpg(100) });
  ok('a hole kept with its picture keeps it', w.ok && w.record.kept[0].img === jpg(100));
  ok('a picture that is not a small JPEG is refused, with the reason, and the record is as it was', !R.keep(r, { q: M87, t: 1, img: 'data:image/png;base64,AA' }).ok && R.keep(r, { q: M87, t: 1, img: 'x' }).record === r);
  ok('a hole kept without a picture keeps none', !('img' in R.keep(r, { q: M87, t: 1 }).record.kept[0]));
  for (let i = 0; i < 14; i++) r = R.keep(r, { q: `a=0.${i + 10}`, t: i + 1, img: jpg(50) }).record;
  const withImg = r.kept.filter((e) => 'img' in e).length;
  ok(`with 14 kept, the ${R.LIMITS.thumbs} newest keep their picture and the 2 oldest do not`, withImg === R.LIMITS.thumbs && 'img' in r.kept[R.LIMITS.thumbs - 1] && !('img' in r.kept[R.LIMITS.thumbs]), `${withImg}`);
  const stored = R.normalise({ kept: Array.from({ length: 14 }, (_, i) => ({ q: `a=0.${i + 10}`, t: i + 1, img: jpg(50) })).concat([{ q: SGRA, t: 99, img: 'data:image/png;base64,AA' }]) });
  ok('one door: a stored record keeps pictures on the 12 newest only, and a bad picture is dropped, its hole kept', stored.kept.filter((e) => 'img' in e).length === R.LIMITS.thumbs && stored.kept.some((e) => e.q === SGRA && !('img' in e)), JSON.stringify(stored.kept.map((e) => 'img' in e)));
  const first = R.normalise({ kept: [{ q: SGRA, t: 99, img: 'data:image/png;base64,AA' }, { q: M87, t: 98, img: '<svg onload=x>' }] });
  ok('a stored picture that is text and not a small JPEG is dropped where the bound would keep it (the newest)', first.kept.length === 2 && first.kept.every((e) => !('img' in e)), JSON.stringify(first.kept));
  const worst = R.normalise({ kept: Array.from({ length: R.LIMITS.kept }, (_, i) => ({ q: ('ab=1' + '&a=1'.repeat(99)).slice(0, 396) + i.toString().padStart(4, '0').slice(-4), t: i + 1, img: jpg(R.LIMITS.thumb - 23) })), rays: Array.from({ length: R.LIMITS.rays }, (_, i) => ({ q: 'ab=1' + '&a=1'.repeat(99), t: i + 1, p: [0.5, 0.5], fate: 'sky', n: 0 })), falls: Array.from({ length: R.LIMITS.falls }, (_, i) => ({ q: 'ab=1' + '&a=1'.repeat(99), t: i + 1, tau: 1 })) });
  const bytes = new TextEncoder().encode(JSON.stringify(worst)).length;
  ok(`the fullest record the rules allow stays under Labs OS's cap of 256 KB (${bytes} bytes)`, bytes < 256 * 1024, String(bytes));
});

guard('rays: bounded, the oldest go and are counted', () => {
  let r = R.empty();
  ok('a ray is kept with its place on the image plane and its fate', R.ray(r, { q: M87, t: 1, s: [0.05, -0.02], fate: 'disk', n: 1 }).ok);
  for (const [why, bad] of [['a place past the plane\'s bound', { s: [R.PLANE * 1.001, 0] }], ['a place past it below', { s: [0, -R.PLANE * 1.001] }], ['a place that is not a number', { s: [NaN, 0] }], ['a place of three numbers', { s: [0.1, 0.2, 0.3] }], ['a pixel of the old shape', { s: undefined, p: [0.5, 0.5] }], ['a fate it does not name', { fate: 'wormhole' }], ['an order of 10', { n: 10 }], ['an order that is not whole', { n: 1.5 }], ['a negative order', { n: -1 }]]) {
    ok(`refused: ${why}`, !R.ray(r, { q: M87, t: 1, s: [0.05, 0.05], fate: 'disk', n: 0, ...bad }).ok);
  }
  ok('refused: a place written as text', !R.ray(r, { q: M87, t: 1, s: ['0.1', '0.2'], fate: 'disk', n: 0 }).ok);
  ok('the edges are inside: the plane\'s bound either way, order 0 and 9', R.ray(r, { q: M87, t: 1, s: [-R.PLANE, R.PLANE], fate: 'sky', n: 9 }).ok && R.ray(r, { q: M87, t: 1, s: [R.PLANE, -R.PLANE], fate: 'captured', n: 0 }).ok);
  for (let i = 0; i < R.LIMITS.rays + 3; i++) r = R.ray(r, { q: M87, t: i + 1, s: [0.05, 0.05], fate: 'sky' }).record;
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
  const two = R.ray(R.keep(R.keep(R.empty(), { q: M87, t: 1 }).record, { q: SGRA, t: 2 }).record, { q: M87, t: 3, s: [0.05, 0.05], fate: 'disk', n: 0 }).record;
  ok('the counts: 2 kept, 1 ray, 0 falls', J(R.counts(two)) === J({ kept: 2, rays: 1, falls: 0 }), J(R.counts(two)));
  ok('isKept: a kept hole yes, another no', R.isKept(two, M87) && !R.isKept(two, CUSTOM));
});

guard('one door: what the store gives back passes the same checks', () => {
  const dirty = { kept: [{ q: M87, t: 1 }, { q: M87, t: 2 }, { q: '<b>', t: 3 }, { q: SGRA }], rays: [{ q: M87, t: 1, s: [R.PLANE + 1, 0], fate: 'sky', n: 0 }, { q: M87, t: 1, s: [0.2, 0.3], fate: 'sky', n: 0, extra: 'typed words' }, { q: M87, t: 1, p: [0.2, 0.3], fate: 'sky', n: 0 }], falls: 'no', dropped: -4 };
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
  const nb = R.normalise({ rays: many(R.LIMITS.rays + 1, { q: M87, s: [0.05, 0.05], fate: 'sky', n: 0 }), falls: many(R.LIMITS.falls + 1, { q: M87, tau: 5 }) });
  ok(`stored rays and falls past their bounds are cut to ${R.LIMITS.rays} and ${R.LIMITS.falls}`, nb.rays.length === R.LIMITS.rays && nb.falls.length === R.LIMITS.falls, `${nb.rays.length} ${nb.falls.length}`);
  const ray0 = { q: M87, t: 1, s: [0.05, 0.05], fate: 'sky', n: 0 };
  const odd = R.normalise({ rays: [{ ...ray0, s: [0.1, 0.2, 0.3] }, { ...ray0, n: 10 }, { ...ray0, n: -1 }, { ...ray0, n: 1.5 }, { ...ray0, fate: 'wormhole' }, { ...ray0, s: [0.5, -R.PLANE - 0.1] }, { ...ray0, n: 9 }] });
  ok('stored rays with a place of three numbers, an order outside 0 to 9 or not whole, an unknown fate or a place off the plane go; order 9 stays', odd.rays.length === 1 && odd.rays[0].n === 9, J(odd.rays));
  ok(`a stored count of drops above ${R.LIMITS.dropped} is held at it; a count that is not whole is 0`, R.normalise({ dropped: 2e6 }).dropped === R.LIMITS.dropped && R.normalise({ dropped: 2.5 }).dropped === 0);
  const capped = R.ray({ ...R.empty(), rays: R.normalise({ rays: many(R.LIMITS.rays, ray0) }).rays, dropped: R.LIMITS.dropped }, ray0).record;
  ok('a drop past the cap leaves the count at the cap', capped.dropped === R.LIMITS.dropped, capped.dropped);
  const f0 = R.normalise({ falls: [{ q: M87, t: 1, tau: 0 }, { q: M87, t: 1, tau: 3 }] });
  ok('a stored fall with no proper time goes', f0.falls.length === 1 && f0.falls[0].tau === 3, J(f0.falls));
});

guard('the words: a link named as the page would show it', () => {
  ok('M87*', R.linkLabel(M87) === 'M87*, a = 0.940, i = 84°, cinematic', R.linkLabel(M87));
  ok('Sgr A*', R.linkLabel(SGRA).startsWith('Sgr A*, a = '), R.linkLabel(SGRA));
  ok('a hole of your own with its mass, charge, inclination and view', /^a hole of your own, [\d.×⁰-⁹]+ M☉, a = 0\.500, Q = 0\.30, i = 60°, cinematic, observer r 120\.0 M$/.test(R.linkLabel(CUSTOM)), R.linkLabel(CUSTOM));
  // review_s3 finding 5: two different holes never share a name
  const own1 = linkOf({ obj: 'custom', a: 0.5, incl: 20, mass: 1 }), own2 = linkOf({ obj: 'custom', a: 0.5, incl: 80, mass: 9 }), own3 = linkOf({ obj: 'custom', a: 0.5, incl: 20, mass: 9 });
  ok('holes of your own differing in inclination or in mass have different names', new Set([own1, own2, own3].map(R.linkLabel)).size === 3, [own1, own2, own3].map(R.linkLabel).join(' | '));
  ok('no charge, no charge named', !R.linkLabel(M87).includes('Q ='));
  const TELE = (() => { const s = new Store(); s.set(s.preset('m87', 'telescope'), { instant: true }); return s.toQuery(); })();
  ok('the view by its label: telescope, as its preset opens it', R.linkLabel(TELE).endsWith(', telescope'), R.linkLabel(TELE));
  const FALL = (() => { const s = new Store(); s.set(s.preset('m87', 'journey'), { instant: true }); return s.toQuery(); })();
  ok('the fall by its label, fall in, not its key', R.linkLabel(FALL).endsWith(', fall in'), R.linkLabel(FALL));
  ok('a key the preset does not have is named with its label', R.linkLabel(linkOf({ obj: 'm87', view: 'telescope' })).includes('observer r 46.0 M') && R.linkLabel(linkOf({ obj: 'm87', color: 'redshift' })).endsWith('colour redshift'), R.linkLabel(linkOf({ obj: 'm87', color: 'redshift' })));
  ok('an empty link is the page as it opens', R.linkLabel('').includes(', a = '), R.linkLabel(''));
  ok('a ray on the disk after going round names its order', R.rayWords({ fate: 'disk', n: 2 }) === 'lands on the disk after going round, n = 2' && R.rayWords({ fate: 'disk', n: 0 }) === R.FATE_WORDS.disk);
  ok('the other fates in their words', R.rayWords({ fate: 'captured', n: 0 }) === R.FATE_WORDS.captured && R.rayWords({ fate: 'sky', n: 0 }) === R.FATE_WORDS.sky && R.rayWords({ fate: 'ring', n: 0 }) === R.FATE_WORDS.ring);
  ok('the line, one and many', R.lineWords({ kept: 1, rays: 1, falls: 1 }) === '1 kept · 1 ray · 1 fall' && R.lineWords({ kept: 0, rays: 2, falls: 0 }) === '0 kept · 2 rays · 0 falls');
});

guard('a hole is the same hole whatever its azimuth (review_s3 finding 5: the idle drift)', () => {
  // as the page drifts: M87*'s preset, then the azimuth alone
  const turned = (() => { const s = new Store(); s.set(s.objectPatch('m87'), { instant: true }); s.set({ az: 37 }, { instant: true }); return s.toQuery(); })();
  ok('the drifted link carries z=', /(^|&)z=/.test(turned), turned);
  ok('holeKey leaves out the azimuth', R.holeKey(turned) === R.holeKey(M87), R.holeKey(turned));
  let r = R.keep(R.empty(), { q: M87, t: 1 }).record;
  ok('a kept hole is still kept once the view has drifted', R.isKept(r, turned));
  r = R.keep(r, { q: turned, t: 2 }).record;
  ok('keeping it again after the drift moves it up with the new link, not a second entry', r.kept.length === 1 && r.kept[0].q === turned && r.kept[0].t === 2, JSON.stringify(r.kept));
  ok('take out after the drift takes it out', R.unkeep(r, M87).ok && R.unkeep(r, M87).record.kept.length === 0);
  ok('one door: two stored entries of one hole are one', R.normalise({ kept: [{ q: turned, t: 2 }, { q: M87, t: 1 }] }).kept.length === 1);
});

guard('every link the record writes opens the state it names (review_s3 finding 2)', () => {
  ok('the page as it opens (an empty link) names its object, so the tour does not start', R.openLink('') === '?o=m87', R.openLink(''));
  ok('any other link is kept as it is (prefixing an object could change the preset it opens from)', R.openLink('a=0.5') === '?a=0.5' && R.openLink(SGRA) === `?${SGRA}`, R.openLink('a=0.5'));
  // the property: every link the record writes opens the state of the link it was made from
  const stateOf = (search) => { const s = new Store(); s.open(search); return JSON.stringify(s.all()); };
  const qs = ['', M87, SGRA, CUSTOM, 'a=0.5', 'i=30', 'v=telescope', 'z=37', linkOf({ obj: 'custom', a: 0.2, mass: 3 })];
  const bad = qs.filter((q) => stateOf(R.openLink(q).slice(1)) !== stateOf(q));
  ok(`every written link opens the same state as its source (${qs.length} links)`, bad.length === 0, JSON.stringify(bad));
  ok('a ray link carries its place after the state', R.openLink('', '&ps=0.05000,0.03000') === '?o=m87&ps=0.05000,0.03000', R.openLink('', '&ps=0.05000,0.03000'));
});

guard('a hole and its name are one (review_s3b B): the same name if and only if the same holeKey', () => {
  // the keys the page or the device changes, and the display's tone, are not the hole
  const look = [{ az: 37 }, { anim: false }, { notes: false }, { tier: 'min' }, { ev: 1.5 }, { tdisp: 7000 }, { stretch: 0.5 }];
  for (const p of look) ok(`holeKey leaves out ${Object.keys(p)[0]}`, R.holeKey(linkOf({ ...p })) === R.holeKey(linkOf({})), J(p));
  // every other key is the hole: a change of it is another hole, with another name
  const hole = [{ a: 0.5 }, { q: 0.3 }, { incl: 60 }, { rcam: 20 }, { fov: 50 }, { tilt: 10 }, { observer: 'faller' }, { obj: 'custom', mass: 7 }, { obj: 'custom', dist: 3 }, { edd: -1 }, { rout: 30 }, { emit: 'thin' }, { color: 'redshift' }, { fcol: 1.9 }, { hotspot: 6 }, { view: 'telescope' }];
  for (const p of hole) ok(`a change of ${Object.keys(p).join(' and ')} is another hole, with another name`, R.holeKey(linkOf(p)) !== R.holeKey(linkOf({})) && R.linkLabel(linkOf(p)) !== R.linkLabel(linkOf({})), R.linkLabel(linkOf(p)));
  // the second reader's collisions: values that print alike are one hole; values that print apart are two
  ok('a = 0.5001 and a = 0.5 print alike and are one hole', R.holeKey(linkOf({ a: 0.5001 })) === R.holeKey(linkOf({ a: 0.5 })) && R.linkLabel(linkOf({ a: 0.5001 })) === R.linkLabel(linkOf({ a: 0.5 })));
  ok('i = 60.04 and i = 60 print alike and are one hole', R.holeKey(linkOf({ incl: 60.04 })) === R.holeKey(linkOf({ incl: 60 })));
  ok('M87* at e = -1 is not M87* as it opens, and is named apart', R.linkLabel(`${M87}&e=-1`) !== R.linkLabel(M87) && R.holeKey(`${M87}&e=-1`) !== R.holeKey(M87), R.linkLabel(`${M87}&e=-1`));
  ok('holes of your own at e = -1 and e = -3 are named apart', R.linkLabel(linkOf({ obj: 'custom', edd: -1 })) !== R.linkLabel(linkOf({ obj: 'custom', edd: -3 })));
  // the property, over random states: two links share a name if and only if they share a holeKey
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const randomLink = () => {
    const p = { obj: pick(['m87', 'sgra', 'cygx1', 'custom']), view: pick(['cinematic', 'telescope']) };
    if (rnd() < 0.5) p.a = pick([0.5, 0.5001, 0.9, 0.94]);
    if (rnd() < 0.3) p.incl = pick([60, 60.04, 17, 84]);
    if (rnd() < 0.3) p.edd = pick([-1, -3, -5]);
    if (rnd() < 0.3) p.az = pick([0, 37]);
    if (rnd() < 0.3) p.ev = pick([0, 1]);
    if (rnd() < 0.2) p.color = pick(['thermal', 'redshift']);
    if (rnd() < 0.2) p.rcam = pick([20, 46]);
    const s = new Store(); s.set(s.preset(p.obj, p.view), { instant: true }); s.set(p, { instant: true }); return s.toQuery();
  };
  const links = Array.from({ length: 120 }, randomLink);
  let pairs = 0, bad = [];
  for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
    pairs++;
    const sameName = R.linkLabel(links[i]) === R.linkLabel(links[j]), sameKey = R.holeKey(links[i]) === R.holeKey(links[j]);
    if (sameName !== sameKey) bad.push([links[i], links[j]]);
  }
  ok(`same name if and only if same holeKey, over ${pairs} pairs of random links`, bad.length === 0, J(bad.slice(0, 2)));
  ok('the random links include pairs of one name and pairs of two', new Set(links.map(R.linkLabel)).size > 5 && new Set(links.map(R.linkLabel)).size < links.length, String(new Set(links.map(R.linkLabel)).size));
});

guard('a hole of your own is named by its mass as the page shows it; a bad link is not a hole', () => {
  ok('a hole of your own at 1000 pc names its distance', R.linkLabel(linkOf({ obj: 'custom', dist: 3 })).endsWith('distance 1,000 pc'), R.linkLabel(linkOf({ obj: 'custom', dist: 3 })));
  ok('an angle past the head carries its degree sign', R.linkLabel(linkOf({ tilt: 10 })).endsWith('look up 10.0°'), R.linkLabel(linkOf({ tilt: 10 })));
  ok('a hole of your own of 10^7 Msun', R.linkLabel(linkOf({ obj: 'custom', mass: 7 })).startsWith('a hole of your own, 1.00×10⁷ M☉, a = '), R.linkLabel(linkOf({ obj: 'custom', mass: 7 })));
  ok('a stored entry with a bad link goes, though its state would be the page as it opens', R.normalise({ kept: [{ q: '<b>', t: 3 }] }).kept.length === 0 && R.normalise({ kept: [{ q: 'a=1 2', t: 3 }] }).kept.length === 0);
  for (let i = 0; i < R.KEY_CACHE + 100; i++) R.holeKey(`a=0.${String(i).padStart(4, '0')}`);
  ok(`the identity cache stays at ${R.KEY_CACHE} after ${R.KEY_CACHE + 100} links, and still answers`, R.cachedKeys() === R.KEY_CACHE && R.holeKey('a=0.0000') === R.holeKey(linkOf({ a: 0 })), String(R.cachedKeys()));
});

guard('the hub\'s way back fits Labs OS\'s 80 characters and names the view (review_s3b G)', () => {
  const long = linkOf({ obj: 'custom', a: 0.5, q: 0.3, incl: 62.5, rcam: 120, mass: 7.25, edd: -1, color: 'redshift' });
  ok('the way back to a hole of your own with many keys', R.resumeLabel(long).length <= 80 && R.resumeLabel(long).endsWith(', cinematic'), R.resumeLabel(long));
  ok('the way back to M87* in the telescope', R.resumeLabel(`${M87}&v=telescope`) === 'Black Hole: M87*, telescope', R.resumeLabel(`${M87}&v=telescope`));
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
  // a failure names its stage (review_s3b, the minor read): a read refused, or a write refused after a read
  const noRead = fakeOS(); noRead.progress.get = async () => { throw new Error('no'); };
  const e1 = await R.update(noRead, (x) => R.keep(x, { q: M87, t: 1 })).catch((e) => e);
  ok('a refused read fails with stage read', e1 instanceof Error && e1.stage === 'read', String(e1 && e1.stage));
  const noWrite = fakeOS(); noWrite.progress.set = async () => { throw new Error('no'); };
  const e2 = await R.update(noWrite, (x) => R.keep(x, { q: M87, t: 1 })).catch((e) => e);
  ok('a refused write fails with stage write and the record read', e2 instanceof Error && e2.stage === 'write' && e2.record && e2.record.kept.length === 0, String(e2 && e2.stage));
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
