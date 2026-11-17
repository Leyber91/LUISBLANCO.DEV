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
    press: () => els['#bh-keep'].onclick(),
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
  ok('a press on "Kept" takes it out, and the way back is not written again', !R.isKept(R.normalise(rec2.data), p.store.toQuery()) && rec2.resume.url === rec.resume.url);
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

console.log(fails ? `\n${fails} of ${checks} keep check(s) failed` : `\nall ${checks} keep checks passed`);
process.exit(fails ? 1 : 0);
