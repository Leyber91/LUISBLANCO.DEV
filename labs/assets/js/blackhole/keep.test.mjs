/* ============================================================
   blackhole/keep.test.mjs — the record's card (keep.js) on the real
   Labs OS store, in node, with a stub of the card's elements. After
   the second reader of slice 3 (review_s3b.md), whose harness this
   is: a press acts on what the visitor saw, presses do not cross,
   the card's words follow the state.
   Run:  node labs/assets/js/blackhole/keep.test.mjs
   ============================================================ */

globalThis.location = { pathname: '/labs/bh_animation_page.html', search: '' };
const docListeners = {};
globalThis.document = { hidden: false, addEventListener(t, fn) { (docListeners[t] ||= []).push(fn); } };

const { Store } = await import('./state.js');
const { createKeep } = await import('./keep.js');
const R = await import('./record.js');

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => { checks++; if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** A card on a fresh page: its elements, the store, the api, and helpers to read the store and the card. */
async function page({ open = '', moving = () => false } = {}) {
  const mk = () => ({ textContent: '', innerHTML: '', disabled: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const els = { '#bh-keep': mk(), '#bh-recline': mk(), '#bh-reclist': mk(), '#bh-recsaid': mk(), '#bh-recfoot': mk() };
  const card = { dataset: {}, querySelector: (s) => els[s] };
  const store = new Store(); store.open(open);
  let t = 1000;
  const api = createKeep({ card, store, fixture: null, now: () => ++t, start: async () => {}, moving });
  await api.ready;
  const os = api.os;
  // a fresh record for each page: Labs OS's memory store is shared by the process
  await os.progress.set(R.empty(), { v: R.V });
  await os.progress.setResume('/labs/', 'none');
  const reread = async () => { for (const fn of docListeners.visibilitychange || []) fn(); await sleep(5); };
  await reread();
  return {
    els, store, api, os, reread,
    stored: async () => R.normalise((await os.progress.get())?.data),
    said: () => els['#bh-recsaid'].textContent,
    /** A click on Keep; detail is the click's count, 2 for the second click of a double-click. */
    press: (detail = 1) => els['#bh-keep'].onclick({ detail }),
    /** The rows as the card draws them: each row's name and its Take out button's data-out. */
    rows: () => [...els['#bh-reclist'].innerHTML.matchAll(/<li><span>([^<]*)<\/span>[^]*?data-out="([^"]*)"/g)].map((m) => ({ name: unesc(m[1]), out: unesc(m[2]) })),
    takeOut: (out) => els['#bh-reclist'].onclick({ target: { closest: (sel) => (sel === 'button[data-out]' ? { dataset: { out } } : null) } }),
  };
}
const other = (open) => { const s = new Store(); s.open(open); return s.toQuery(); };

/* the first reader's races: two rays in one instant, a keep during a ray's write, Keep then a pixel */
{
  const p = await page();
  p.api.ray({ s: [0.1, 0.1], fate: 'sky' });
  p.api.ray({ s: [0.2, 0.2], fate: 'disk', n: 1 });
  await sleep(30);
  ok('two rays pressed in one instant are both stored', (await p.stored()).rays.length === 2, String((await p.stored()).rays.length));
  p.api.ray({ s: [0.3, 0.3], fate: 'captured' });
  await p.press(); await sleep(30);
  let s = await p.stored();
  ok('a keep pressed while a ray is written lands, and so does the ray', s.kept.length === 1 && s.rays.length === 3, `${s.kept.length} ${s.rays.length}`);
  p.store.set({ a: 0.5 }, { instant: true }); p.api.refresh();
  const k = p.press();
  p.api.ray({ s: [0.5, 0.5], fate: 'sky' });
  await k; await sleep(30);
  s = await p.stored();
  ok('Keep then a pixel before the keep returns: both land', s.kept.length === 2 && s.rays.length === 4, `${s.kept.length} ${s.rays.length}`);
}

/* A: a keep made in another window is not undone by a press on "Keep this hole" */
{
  const p = await page({ open: '?o=sgra' });
  ok('the button reads "Keep this hole" before the press', p.els['#bh-keep'].textContent === 'Keep this hole');
  await p.os.progress.set(R.keep(R.empty(), { q: p.store.toQuery(), t: 5 }).record, { v: R.V });   // the other window
  await p.press(); await sleep(10);
  const s = await p.stored();
  ok('a press on "Keep this hole" leaves the hole kept, though another window kept it first', R.isKept(s, p.store.toQuery()) && s.kept.length === 1, JSON.stringify(s.kept));
  ok('and the card says it is kept', / is kept\.$/.test(p.said()), p.said());
}

/* a double press on "Keep this hole" keeps the hole once */
{
  const p = await page({ open: '?o=cygx1' });
  const a = p.press(), b = p.press();
  await a; await b; await sleep(10);
  const s = await p.stored();
  ok('a double press on "Keep this hole" ends with the hole kept', R.isKept(s, p.store.toQuery()), JSON.stringify(s.kept));
  ok('the second press of the pair does nothing', s.kept.length === 1, String(s.kept.length));
}

/* G: the hub's way back names a hole that is kept, in a label Labs OS does not cut */
{
  const p = await page({ open: '?o=custom&a=0.5&qq=0.3&i=62.5&r=120&m=7.25' });
  await p.press(); await sleep(10);
  const rec = await p.os.progress.get();
  ok('after a keep the way back opens that hole', rec.resume && rec.resume.url === `/labs/bh_animation_page.html?${p.store.toQuery()}`, JSON.stringify(rec.resume));
  ok('its label fits Labs OS\'s 80 characters and names the view', rec.resume && rec.resume.label.length <= 80 && !rec.resume.label.endsWith('…') && /cinematic|telescope|fall/.test(rec.resume.label), rec.resume && rec.resume.label);
  await p.press(); await sleep(10);
  const rec2 = await p.os.progress.get();
  ok('a press on "Kept" takes it out, and with nothing left kept the way back is cleared (review_s3c 5)', !R.isKept(R.normalise(rec2.data), p.store.toQuery()) && rec2.resume === null, JSON.stringify(rec2.resume));
}

/* F: Take out takes out the row the visitor saw, though the list moved under it */
{
  const p = await page();
  p.store.set({ a: 0.5 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  const seen = p.rows()[0];
  ok('the card draws the kept hole with its Take out', !!seen, p.els['#bh-reclist'].innerHTML.slice(0, 200));
  // another window keeps Sgr A* (it goes on top), then a ray's write starts, slowly, and the visitor presses Take out
  const cur = await p.stored();
  await p.os.progress.set(R.keep(cur, { q: other('?o=sgra'), t: 99999 }).record, { v: R.V });
  const set = p.os.progress.set; p.os.progress.set = async (...x) => { await sleep(30); return set(...x); };
  p.api.ray({ s: [0.6, 0.6], fate: 'sky' });
  await sleep(0);
  p.takeOut(seen.out);
  await sleep(120);
  p.os.progress.set = set;
  const s = await p.stored();
  ok('the hole the visitor saw is the one taken out', s.kept.length === 1 && R.linkLabel(s.kept[0].q).startsWith('Sgr A*'), JSON.stringify(s.kept.map((e) => R.linkLabel(e.q))));
}

/* H: with recording off, the foot does not call anything a usage event */
{
  const p = await page();
  await p.os.recording.set(false); await sleep(5); p.api.refresh();
  const foot = p.els['#bh-recfoot'].textContent;
  ok('recording off: the foot does not say keeps, rays and falls are usage events', !/are also usage events/.test(foot) && /no usage event/.test(foot), foot);
  await p.os.recording.set(true); await sleep(5); p.api.refresh();
  ok('recording on: the foot says what is recorded', /usage events/.test(p.els['#bh-recfoot'].textContent), p.els['#bh-recfoot'].textContent);
}

/* I: a ray traced while the view still moves is not added, and the card says so */
{
  let moving = true;
  const p = await page({ moving: () => moving });
  p.api.ray({ s: [0.1, 0.2], fate: 'sky' }); await sleep(10);
  ok('a ray traced while the view moves is not added', (await p.stored()).rays.length === 0);
  ok('and the card says why', /still moving/.test(p.said()), p.said());
  moving = false;
  p.api.ray({ s: [0.1, 0.2], fate: 'sky' }); await sleep(10);
  ok('once the view has settled, a ray is added', (await p.stored()).rays.length === 1);
}

/* a read that fails inside a write says the read failed */
{
  const p = await page();
  const get = p.os.progress.get; p.os.progress.get = async () => { throw new Error('read refused'); };
  await p.press(); await sleep(10);
  p.os.progress.get = get;
  ok('a read refused inside a press says the record could not be read', /could not read/.test(p.said()) && !/refused to write/.test(p.said()), p.said());
}

/* E: a ray's row opens the ray by its place on the image plane, not by a fraction of the window */
{
  const p = await page();
  p.api.ray({ s: [0.0123, -0.0456], fate: 'disk', n: 1 }); await sleep(10);
  const html = unesc(p.els['#bh-reclist'].innerHTML);
  ok('the ray\'s Open carries ps, its place on the image plane', /&ps=0\.01230,-0\.04560"/.test(html) && !/&p=/.test(html), html.slice(0, 300));
}

/* review_s3c 1: a real double-click (its second click 120 ms after the first, the write long done) keeps the hole */
{
  const p = await page({ open: '?o=cygx1&a=0.3' });
  await p.press(1); await sleep(120);
  await p.press(2); await sleep(20);
  ok('a double-click on "Keep this hole" ends with the hole kept', R.isKept(await p.stored(), p.store.toQuery()), p.said());
}

/* review_s3c 2: while a press is written the button is off and says so, the Take out buttons are off, and another
   press writes nothing */
{
  const p = await page();
  p.store.set({ a: 0.42 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  p.store.set({ a: 0.43 }, { instant: true }); p.api.refresh();
  const set = p.os.progress.set; let sets = 0;
  p.os.progress.set = async (...x) => { sets++; await sleep(40); return set(...x); };
  const first = p.press();
  await sleep(5);
  const b = p.els['#bh-keep'];
  ok('while a press is written the Keep button is off and says it is busy', b.disabled === true && b.getAttribute('aria-busy') === 'true', JSON.stringify({ d: b.disabled, busy: b.getAttribute('aria-busy') }));
  const html = p.els['#bh-reclist'].innerHTML;
  ok('and every Take out is off', /data-out="[^"]*" disabled>/.test(html) && !/data-out="[^"]*">/.test(html), html.slice(0, 300));
  await p.press();
  await first; await sleep(60);
  p.os.progress.set = set;
  ok('a second press while the first is written writes nothing', sets === 1, String(sets));
  ok('once written the button is on again', b.disabled === false && b.getAttribute('aria-busy') === 'false');
}

/* review_s3c 3 and 5: the way back is the newest hole in the record; a refused keep leaves it; a take out moves it to
   the next newest, and the last take out clears it */
{
  const p = await page();
  const full = R.empty();
  for (let i = 0; i < R.LIMITS.kept; i++) full.kept.push({ q: other(`?o=custom&a=0.${String(100 + i)}`), t: 10 + i });
  await p.os.progress.set(full, { v: R.V });
  await p.os.progress.setResume('/labs/hub.html', 'sentinel');
  await p.reread();
  p.store.set({ a: 0.77 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  const r0 = await p.os.progress.get();
  ok('a keep refused (the list is full) leaves the way back as it was', !!r0.resume && r0.resume.url === '/labs/hub.html', JSON.stringify(r0.resume));
  ok('and says why', /take one out first/.test(p.said()), p.said());
}
{
  const p = await page();
  p.store.set({ a: 0.21 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  const qa = p.store.toQuery();
  p.store.set({ a: 0.22 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  const qb = p.store.toQuery();
  ok('after two keeps the way back is the second', (await p.os.progress.get()).resume.url.endsWith(`?${qb}`));
  await p.press(); await sleep(10);
  const r1 = await p.os.progress.get();
  ok('taking out the newest moves the way back to the next newest', !!r1.resume && r1.resume.url.endsWith(`?${qa}`), JSON.stringify(r1.resume));
  p.takeOut(qa); await sleep(20);
  const r2 = await p.os.progress.get();
  ok('taking out the last clears the way back', r2.resume === null, JSON.stringify(r2.resume));
}

/* review_s3c 4: a write refused says so in its own words, and the card shows the record it read */
{
  const p = await page();
  await p.os.progress.set(R.keep(R.empty(), { q: other('?o=sgra'), t: 7 }).record, { v: R.V });   // another window
  const set = p.os.progress.set; p.os.progress.set = async () => { throw new Error('quota'); };
  p.store.set({ a: 0.66 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  p.os.progress.set = set;
  ok('a refused write says the browser refused to write', /refused to write/.test(p.said()) && !/could not read/.test(p.said()), p.said());
  ok('and the card shows the record it read (the other window\'s keep)', p.rows().some((r) => r.name.startsWith('Sgr A*')), JSON.stringify(p.rows()));
}

/* review_s3c 7: a ray written behind a keep leaves the keep's sentence */
{
  const p = await page();
  p.store.set({ a: 0.31 }, { instant: true }); p.api.refresh();
  const k = p.press();
  p.api.ray({ s: [0.01, 0.02], fate: 'sky' });
  await k; await sleep(30);
  ok('a ray written behind a keep leaves "... is kept."', / is kept\.$/.test(p.said()), p.said());
}

/* review_s3c 6: a press whose drawing fails releases the card and says the press failed */
{
  const p = await page();
  const tq = p.store.toQuery.bind(p.store); let once = true;
  p.store.toQuery = () => { if (once) { once = false; throw new Error('boom'); } return tq(); };
  const warn = console.warn; console.warn = () => {};   // the card warns of the fault; this check expects it
  await Promise.resolve(p.press()).catch(() => {}); await sleep(10);
  console.warn = warn;
  p.store.toQuery = tq;
  ok('a press that fails leaves the Keep button on, and says it failed', p.els['#bh-keep'].disabled === false && /could not be completed/.test(p.said()), JSON.stringify({ d: p.els['#bh-keep'].disabled, s: p.said() }));
}

/* the rest of the card's rules, so each has a check its mutant breaks (tests/keep.mutants.test.mjs) */
{
  const p = await page();
  const types = [];
  const track = p.os.track.bind(p.os); p.os.track = (type, data) => { types.push(type); return track(type, data); };
  p.store.set({ a: 0.51 }, { instant: true }); p.api.refresh();
  await p.press(); await sleep(10);
  await p.press(); await sleep(10);
  ok('a keep then a take out track one keep event, none for the take out', types.filter((x) => x === 'black-hole.keep').length === 1, JSON.stringify(types));
  p.takeOut('o=sgra'); await sleep(10);
  ok('a Take out of a hole not kept says it was not written, not that it is out', /^Not written: that hole is not kept\./.test(p.said()), p.said());
  // a failure's sentence is cleared by a later success
  const set = p.os.progress.set; p.os.progress.set = async () => { throw new Error('quota'); };
  p.api.ray({ s: [0.01, 0.01], fate: 'sky' }); await sleep(10);
  p.os.progress.set = set;
  const failed = p.said();
  p.api.ray({ s: [0.02, 0.01], fate: 'sky' }); await sleep(10);
  ok('a write refused says so, and the next write that lands clears it', /refused to write/.test(failed) && p.said() === '', JSON.stringify([failed, p.said()]));
  // a Take out pressed while a keep is written writes nothing
  p.store.set({ a: 0.52 }, { instant: true }); p.api.refresh();
  let sets = 0; p.os.progress.set = async (...x) => { sets++; await sleep(40); return set(...x); };
  const k = p.press(); await sleep(5);
  p.takeOut(p.store.toQuery()); await k; await sleep(60);
  p.os.progress.set = set;
  ok('a Take out pressed while a keep is written writes nothing', sets === 1 && R.isKept(await p.stored(), p.store.toQuery()), String(sets));
}

/* before the record is read, and over a newer version's record, the button is off and a press does nothing */
{
  const mk = () => ({ textContent: '', innerHTML: '', disabled: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const els = { '#bh-keep': mk(), '#bh-recline': mk(), '#bh-reclist': mk(), '#bh-recsaid': mk(), '#bh-recfoot': mk() };
  const store = new Store(); store.open('?o=sgra');
  let release; const gate = new Promise((r) => { release = r; });
  const api = createKeep({ card: { dataset: {}, querySelector: (s) => els[s] }, store, start: () => gate });
  ok('before the record is read the line says reading and Keep is off', els['#bh-recline'].textContent === 'reading' && els['#bh-keep'].disabled === true);
  await els['#bh-keep'].onclick({ detail: 1 });
  ok('and a press then does nothing and says nothing', els['#bh-recsaid'].textContent === '', els['#bh-recsaid'].textContent);
  release(); await api.ready;
}
{
  const p = await page();
  await p.os.progress.set(R.keep(R.empty(), { q: other('?o=sgra'), t: 3 }).record, { v: R.V + 1 });
  await p.reread(); p.api.refresh();
  ok('over a record a newer version wrote, Keep is off', p.els['#bh-keep'].disabled === true && /newer version/.test(p.said()), p.said());
  await p.os.progress.set(R.empty(), { v: R.V });
}

/* Labs OS started and the record not yet read: a redraw then (the state changed) keeps Keep off */
{
  const { LabsOS } = await import('../os/index.js');
  const init = LabsOS.init;
  let release; const gate = new Promise((r) => { release = r; });
  LabsOS.init = async (o) => { const os = await init.call(LabsOS, o); const get = os.progress.get.bind(os.progress); os.progress.get = async (...a) => { await gate; os.progress.get = get; return get(...a); }; return os; };
  const mk = () => ({ textContent: '', innerHTML: '', disabled: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const els = { '#bh-keep': mk(), '#bh-recline': mk(), '#bh-reclist': mk(), '#bh-recsaid': mk(), '#bh-recfoot': mk() };
  const store = new Store(); store.open('?o=sgra');
  const api = createKeep({ card: { dataset: {}, querySelector: (s) => els[s] }, store, start: async () => {} });
  await sleep(20);
  LabsOS.init = init;
  api.refresh();
  ok('Labs OS started, the record not yet read: a redraw keeps Keep off', !!api.os && els['#bh-keep'].disabled === true, JSON.stringify({ os: !!api.os, d: els['#bh-keep'].disabled }));
  release(); await api.ready;
}

/* the card's remaining conditions (conditions.mjs on keep.js): the lists' "Show the N more", the empty card's words,
   the count of entries let go, where the record lives, writes held before the read, Labs OS failing to start */
{
  const p = await page();
  const many = (n) => { const r = R.empty(); for (let i = 0; i < n; i++) r.kept.push({ q: other(`?o=custom&a=0.${String(200 + i)}`), t: 10 + i }); return r; };
  ok('a fresh card with recording on asks for a keep, a pixel or a fall', /press a pixel to trace its ray/.test(p.els['#bh-reclist'].innerHTML), p.els['#bh-reclist'].innerHTML);
  ok('in node Labs OS keeps the record in memory, and the foot says it lasts until the page closes', /cannot reach the storage/.test(p.els['#bh-recfoot'].textContent), p.els['#bh-recfoot'].textContent);
  await p.os.progress.set(many(8), { v: R.V }); await p.reread();
  ok('8 kept holes are all shown, with no "Show the more"', p.rows().length === 8 && !/data-all/.test(p.els['#bh-reclist'].innerHTML));
  await p.os.progress.set(many(9), { v: R.V }); await p.reread();
  ok('9 kept: 8 shown and "Show the 1 more"', p.rows().length === 8 && /Show the 1 more/.test(p.els['#bh-reclist'].innerHTML));
  p.els['#bh-reclist'].onclick({ target: { closest: (sel) => (sel === 'button[data-all]' ? { dataset: { all: 'kept' } } : null) } });
  ok('and once pressed, all 9', p.rows().length === 9);
  await p.os.progress.set({ ...R.empty(), dropped: 1 }, { v: R.V }); await p.reread();
  const one = p.said();
  await p.os.progress.set({ ...R.empty(), dropped: 2 }, { v: R.V }); await p.reread();
  ok('one entry let go is counted as one, two as rays and falls', /^1 older entry was let go/.test(one) && /^2 older rays and falls were let go/.test(p.said()), JSON.stringify([one, p.said()]));
  await p.os.progress.set(R.empty(), { v: R.V }); await p.reread();
  ok('none let go, none counted', !/let go/.test(p.said()), p.said());
  await p.os.recording.set(false); await sleep(5); p.api.refresh();
  ok('a fresh card with recording off asks for a keep only', /with recording off, rays and falls are not added/.test(p.els['#bh-reclist'].innerHTML), p.els['#bh-reclist'].innerHTML);
  await p.os.recording.set(true); await sleep(5);
}
{
  // a ray and a fall made before the record is read are written once it is
  const mk = () => ({ textContent: '', innerHTML: '', disabled: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const els = { '#bh-keep': mk(), '#bh-recline': mk(), '#bh-reclist': mk(), '#bh-recsaid': mk(), '#bh-recfoot': mk() };
  const store = new Store(); store.open('?o=m87');
  let release; const gate = new Promise((r) => { release = r; });
  const api = createKeep({ card: { dataset: {}, querySelector: (s) => els[s] }, store, start: () => gate });
  api.ray({ s: [0.03, 0.04], fate: 'disk', n: 1 });
  api.fall({ tau: 12.5 });
  release(); await api.ready; await sleep(10);
  const rec = R.normalise((await api.os.progress.get())?.data);
  ok('a ray and a fall made before the record is read are each written once it is', rec.rays.length >= 1 && rec.rays[0].fate === 'disk' && rec.falls.length >= 1 && rec.falls[0].tau === 12.5, JSON.stringify({ r: rec.rays[0], f: rec.falls[0] }));
}
{
  // Labs OS failing to start: Keep is off and the card says so
  const { LabsOS } = await import('../os/index.js');
  const init = LabsOS.init; LabsOS.init = async () => { throw new Error('no store'); };
  const mk = () => ({ textContent: '', innerHTML: '', disabled: false, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this['on' + t] = fn; } });
  const els = { '#bh-keep': mk(), '#bh-recline': mk(), '#bh-reclist': mk(), '#bh-recsaid': mk(), '#bh-recfoot': mk() };
  const store = new Store(); store.open('?o=m87');
  const warn = console.warn; console.warn = () => {};
  const api = createKeep({ card: { dataset: {}, querySelector: (s) => els[s] }, store, start: async () => {} });
  await api.ready;
  console.warn = warn; LabsOS.init = init;
  ok('Labs OS failing to start: Keep is off and the card says Labs OS did not start', els['#bh-keep'].disabled === true && /Labs OS did not start/.test(els['#bh-recsaid'].textContent), JSON.stringify({ d: els['#bh-keep'].disabled, s: els['#bh-recsaid'].textContent }));
}

console.log(fails ? `\n${fails} of ${checks} keep check(s) failed` : `\nall ${checks} keep checks passed`);
process.exit(fails ? 1 : 0);
