// The survey's log, as a visitor uses it. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/log.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 900
//   (and again with --width 390 --height 844)
//
// The log holds to six properties, and each part of this scenario proves one of them in a browser:
//   1. nothing the visitor did is lost without being told: a world opened or pinned before the stored log is read
//      is written once it is read; a write the browser refuses, and a full log, are said under the button pressed;
//   2. nothing the visitor did not do is recorded: the world the page starts on, a reload, a link that carries a
//      log, and a tour that moves by itself are not visits;
//   3. the lab's two pages, and two tabs, never undo each other: an erase or a save made through another
//      connection to the store is still there after the next thing done here, and Overdue leaves the log alone;
//   4. whatever comes from a link or from the store is read at the door: markup and unknown names are not shown;
//   5. the privacy page's erase reaches the log, and ?os-fixture= keeps the page off the visitor's own store;
//   6. every state of the two parts is drawn: reading, empty, saved, shared, full, refused, store not kept,
//      recording off.
// It also checks the two things the page lacked for a keyboard: a link that skips to the survey and a ring on
// the search field.
// The checks named D1 to D12 are the twelve defects of the log's second review (2026-11-15), each driven in the
// state it was reported in: the compare bench written from the page's copy, a save event for a change the store did
// not make, a visit to a world a tour link did not show, words computed on one set and shown beside another, a
// record of a later version rewritten, and a redraw that moved the focus, the scroll or a live region.
//
// No model is called and nothing leaves the page's own origin: the guard below runs before the page's own
// scripts in every document, and refuses every such request.

/* ---- run before the page's own scripts, in every document the drive opens ---- */

function guard() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
  // the page's copy button writes here, so that the link it made can be read back
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); } catch { /* the page falls back to printing the link */ }
  // when the page before asked for it, the page's idle work is held until the drive lets it go: the log starts
  // its store when the page is idle, so this shows the page as it is before the stored log is read
  let hold = false;
  try { hold = sessionStorage.getItem('drive-hold') === '1'; sessionStorage.removeItem('drive-hold'); } catch { /* a document with no storage */ }
  const idle = window.requestIdleCallback;
  if (hold && idle) {
    const held = [];
    window.requestIdleCallback = (fn, o) => { held.push([fn, o]); return 0; };
    window.__release = () => { window.requestIdleCallback = idle; held.splice(0).forEach(([fn, o]) => idle.call(window, fn, o)); return true; };
  }
}

/* ---- run inside the page ---- */

function pageState() {
  const $ = (id) => document.getElementById(id);
  const add = document.querySelector('[data-act="log"]'), dlg = $('log'), line = $('log-line'), said = document.querySelector('.tp-said');
  const count = (document.querySelector('.f-count') || {}).textContent || '';
  const rows = (sec) => [...document.querySelectorAll(`#log-body .log-sec:nth-of-type(${sec}) .log-list li`)].map((li) => ({
    name: (li.querySelector('.log-open, .log-gone') || {}).textContent || '', what: (li.querySelector('.log-what') || {}).textContent || '', when: (li.querySelector('.log-when') || {}).textContent || '' }));
  const secs = [...document.querySelectorAll('#log-body .log-sec')].map((s) => ({ h: (s.querySelector('h3') || {}).textContent || '', n: s.querySelectorAll('.log-list li').length }));
  const lr = line.getBoundingClientRect(), dr = dlg.getBoundingClientRect();
  const inView = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; };
  const a = document.activeElement, pin = document.querySelector('[data-act="pin"]'), sec = a && a.closest('#log-body [data-sec]');
  return {
    line: line.textContent, lineSeen: lr.width > 0 && lr.height > 0 && lr.left >= 0 && lr.right <= innerWidth + 1,
    add: add ? add.textContent : '', addOn: !!add && add.classList.contains('kept'), addPressed: add ? add.getAttribute('aria-pressed') : '', addOff: !!add && add.disabled, addTitle: add ? add.title : '',
    addWidth: add ? Math.round(add.getBoundingClientRect().width) : 0, pinOff: !!pin && pin.disabled, clearOff: $('cmp-clear').disabled,
    said: said ? said.textContent : '', saidSeen: inView(said), addSeen: inView(add), saidUnder: !!said && !!add && said.getBoundingClientRect().top >= add.getBoundingClientRect().bottom - 1,
    saidQuiet: !!said && said.classList.contains('quiet') && getComputedStyle(said).clipPath === 'inset(50%)', logSaid: ($('log-said') || {}).textContent || '',
    focusSec: sec ? sec.dataset.sec : '', focusLabel: a ? (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 80) : '', foot: (document.querySelector('#log-body .log-foot') || {}).textContent || '',
    name: ($('ret-name') || {}).textContent || '', note: ($('q-note') || {}).textContent || '',
    count, n: +count.replace(/[^\d]/g, ''), filtered: /match/.test(count),
    // the switches that show only the log's worlds: 'on', 'off', or 'none' when the switch is not on the page
    chipSaved: ((e) => (e ? (e.getAttribute('aria-checked') === 'true' ? 'on' : 'off') : 'none'))(document.querySelector('#filters [data-act="set-saved"]')),
    chipShared: ((e) => (e ? (e.getAttribute('aria-checked') === 'true' ? 'on' : 'off') : 'none'))(document.querySelector('#filters [data-act="set-shared"]')),
    open: dlg.open, fits: !dlg.open || (dr.left >= 0 && dr.right <= innerWidth + 1), wide: document.documentElement.scrollWidth > innerWidth + 1,
    sum: (document.querySelector('#log-body .log-sum') || {}).textContent || '', notes: [...document.querySelectorAll('#log-body .log-note')].map((n) => n.textContent),
    secs, body: (($('log-body') || {}).textContent || '').replace(/\s+/g, ' ').trim(), imgs: document.querySelectorAll('#log-body img, #q-note img, #filters img, .tp-said img').length,
    saved: rows(secs.findIndex((s) => /^Saved/.test(s.h)) + 1), visited: rows(secs.findIndex((s) => /^Visited/.test(s.h)) + 1), shared: rows(secs.findIndex((s) => /^Shared/.test(s.h)) + 1),
    adopted: ($('log-said') || {}).textContent || '', showAll: (document.querySelector('#log-body [data-sec="visited"] [data-log="all"]') || {}).textContent || '',
    showAllSaved: (document.querySelector('#log-body [data-sec="saved"] [data-log="all"]') || {}).textContent || '',
    pins: document.querySelectorAll('#compare-body [data-unpin]').length, compareOpen: $('compare').open,
    url: location.search, nav: (performance.getEntriesByType('navigation')[0] || {}).type || '', store: dlg.dataset.store || '',
    focus: a ? (a.id || a.className) : '', focusIn: !!a && !!a.closest('#log'), focusClose: !!a && a.matches('[data-close="log"]'),
    view: (document.querySelector('[data-cam].on') || { dataset: {} }).dataset.cam || '',
  };
}
function press(selector) { const e = document.querySelector(selector); if (!e) return false; e.click(); return true; }
function pressIn(selector, text) { const e = [...document.querySelectorAll(selector)].find((x) => x.textContent.trim() === text); if (!e) return false; e.click(); return true; }
/* as a key would: the control has the focus when it is pressed */
function focusPress(selector) { const e = document.querySelector(selector); if (!e) return false; e.focus(); e.click(); return true; }
function bring(selector) { const e = document.querySelector(selector); if (!e) return false; e.scrollIntoView({ block: 'center' }); return true; }
function typeInto(text) { const q = document.getElementById('q'); q.focus(); q.value = text; q.dispatchEvent(new Event('input', { bubbles: true })); }
function comeBack() { window.dispatchEvent(new Event('focus')); return true; }
function noThanks() { const b = [...document.querySelectorAll('button')].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); return true; }
async function osDo(what, arg) {
  const os = (await import(new URL('assets/js/os/index.js', location.href).href)).LabsOS.instance;
  if (!os) return null;
  if (what === 'erase') { await os.privacy.deleteAll(); return true; }
  if (what === 'recording') { await os.recording.set(arg); return os.recording.on; }
  if (what === 'events') { const d = await os.privacy.exportAll(); const all = (d.events || (d.data && d.data.events) || []); return all.filter((e) => /^exomania\.(visit|save)$/.test(e.type)).map((e) => ({ type: e.type, t: e.t, data: e.data })); }
  if (what === 'record') { const r = await os.progress.get(); return r ? { v: r.v, data: r.data, resume: r.resume } : null; }
  if (what === 'storage') return os.storage;
  // the browser refuses every write of the record, as it does when the disk is full
  if (what === 'breakSet') { os.__set = os.progress.set; os.progress.set = () => Promise.reject(new Error('QuotaExceededError: the disk is full')); return os.progress.set !== os.__set; }
  if (what === 'fixSet') { if (os.__set) os.progress.set = os.__set; return true; }
  return null;
}
/* The lab's record straight from the browser's database, through a connection of its own, as another tab reads it. */
function rawRecord() {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('progress', 'readonly'); const g = tx.objectStore('progress').get('exomania'); tx.oncomplete = () => { db.close(); resolve(g.result ? { v: g.result.v, data: g.result.data } : null); }; tx.onerror = () => { db.close(); resolve('read failed'); }; };
    req.onerror = () => resolve('open failed');
  });
}
/* What "Delete everything" on the labs' hub does to the database, from another tab: this page's Labs OS is not told. */
function eraseElsewhere() {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(['events', 'progress', 'meta'], 'readwrite'); ['events', 'progress', 'meta'].forEach((s) => tx.objectStore(s).clear()); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(false); }; };
    req.onerror = () => resolve(false);
  });
}
/* A record written straight into the database, with no check and no bound: what another tab wrote, or what an old
   or damaged store holds. */
function writeRaw(data, v) {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('progress', 'readwrite'); tx.objectStore('progress').put({ lab: 'exomania', v, data, updated: Date.now(), resume: null, due: [], finished: false }); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(String(tx.error)); }; };
    req.onerror = () => resolve('open failed');
  });
}
/* Names from the catalogue the page loads. */
async function names(k, from) {
  const d = await (await fetch(new URL('assets/data/exomania/pscomppars-snapshot.json', location.href).href)).json();
  return d.rows.map((r) => r[0]).slice(from, from + k);
}
function ring() { const q = document.getElementById('q'); q.focus(); const c = getComputedStyle(q); return { style: c.outlineStyle, width: parseFloat(c.outlineWidth) }; }
function skipSeen() { const a = document.activeElement, b = a.getBoundingClientRect(); return { cls: a.className, text: a.textContent, seen: b.left >= 0 && b.top >= 0 && b.width > 0 }; }

/* ---- the scenario ---- */

export default async function log(p, { base }) {
  await p.before(`(${guard})()`);
  const call = (fn, ...args) => p.ev(`(${fn})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const state = () => call(pageState);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const NAMED = '(() => { const n = (document.getElementById("ret-name") || {}).textContent; return !!n && n.trim().length > 1 && n.trim() !== "…"; })()';
  const settle = async () => {
    await p.until('!!document.getElementById("log").dataset.store', 30000);   // the stored log has been read
    await p.sleep(600);
    await call(noThanks);
    await p.until('getComputedStyle(document.querySelector(".search")).opacity === "1"', 10000);   // the instruments have assembled
  };
  /* Open the survey. hold: its idle work waits for window.__release(), so the stored log is not read yet. */
  const open = async (query = '', { hold = false, still = true } = {}) => {
    if (hold) await p.ev('(sessionStorage.setItem("drive-hold", "1"), true)');
    await p.go(`${base}/labs/exomania-survey.html?${[still ? 'still' : '', query].filter(Boolean).join('&')}`);
    await p.until(NAMED, 90000);
    if (!hold) await settle();
  };
  const reload = async () => {
    await p.ev('(window.__old = 1, setTimeout(() => location.reload(), 50), true)');
    await p.until(`!window.__old && ${NAMED}`, 90000);
    await settle();
  };
  const another = async () => { await call(press, '#btn-random'); await p.sleep(800); return state(); };
  /* the state once the log line reads `want`, or after 6 s whatever it reads */
  const line = async (want) => { await p.until(`document.getElementById("log-line").textContent === ${JSON.stringify(want)}`, 6000); return state(); };
  const openLog = async () => { await call(press, '#log-line'); await p.sleep(400); return state(); };
  const closeLog = () => call(press, '[data-close="log"]');
  const WAYS = '(by name|from a question|on a tour|at random|on the diagram|in its system|from a link|from the log|from the sky)';
  const VIA = new RegExp(`^(${WAYS}|[\\d,]+ visits, the last ${WAYS})$`);
  const FULL = 'the log holds 200 saved worlds, which is all it takes; take one out first';
  const blank = () => ({ overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } });

  // ---- a first visit: nothing is counted yet ----
  await open();
  const start = await state();
  p.check('on a first load the log is on the browser\'s own store, which outlives the page', start.store === 'indexeddb', start.store);
  p.check('the log line is on the page and starts at nothing: the world the page opened by itself is not a visit', start.lineSeen && start.line === 'Log: 0 visited, 0 saved', start.line);
  p.check('the world on screen can be added to the log, and is not in it; the button is a plain button, with no pressed state to read wrongly', start.add === 'Add to log' && !start.addOn && !start.addOff && start.addPressed === null,
    JSON.stringify({ add: start.add, on: start.addOn, off: start.addOff, pressed: start.addPressed }));

  // ---- before the stored log is read (on a fixture store, so the visitor's own store is not written) ----
  // Since version 3 the survey keeps the catalogue it saw in the visitor's own store once the weekly roster is in
  // (recording on): that write is waited for here, so the store the fixture page must leave alone is the one it found.
  await p.until(`(${rawRecord})().then((r) => !!r && !!r.data && !!r.data.seen)`, 30000);
  const ownBefore = await call(rawRecord);
  await open('os-fixture=first-visit', { hold: true });
  const early = await state();
  p.check('before the stored log is read the line says so, and the button for the log is off', early.line === 'Log: reading' && early.addOff && early.addTitle === 'The log is being read' && early.store === '',
    JSON.stringify({ line: early.line, off: early.addOff, title: early.addTitle, store: early.store }));
  // second review, D1: a pin, or "Unpin all", before the read replaced or emptied the stored bench
  p.check('before the stored log is read the bench is the log\'s too: Pin and "Unpin all" are off', early.pinOff && early.clearOff, JSON.stringify({ pin: early.pinOff, clear: early.clearOff }));
  await call(press, '[data-act="log"]');   // a button that is off takes no press
  const held = await another();
  await call(press, '[data-act="pin"]');
  await p.sleep(500);
  await call(press, '[data-close="compare"]');
  const earlyDlg = await openLog();
  p.check('the log, opened then, says it is being read, and a world opened meanwhile is not yet counted', earlyDlg.open && /^Reading the log from this browser.s store\.$/.test(earlyDlg.body) && earlyDlg.line === 'Log: reading' && held.name !== early.name,
    `${earlyDlg.line} | ${earlyDlg.body.slice(0, 120)}`);
  await p.shot('log-reading');
  await p.ev('window.__release()');
  await settle();
  const late = await line('Log: 1 visited, 0 saved');
  await p.sleep(400);   // the bench is written after the visit
  const fx = await call(osDo, 'record'), where = await call(osDo, 'storage'), own0 = await call(rawRecord);
  p.check('once it is read, the world opened meanwhile is one visit with the way it was opened, nothing was saved by the press on the button that was off, and the button is on',
    late.line === 'Log: 1 visited, 0 saved' && !late.addOff && late.add === 'Add to log' && !!fx && same(fx.data.log.visits.map((v) => [v.name, v.via, v.n]), [[held.name, 'random', 1]]) && fx.data.log.saved.length === 0,
    `${late.line} | ${JSON.stringify(fx && fx.data.log.visits)}`);
  p.check('a press on Pin while it was off pinned nothing, and the button is on once the log is read', !!fx && same(fx.data.log.pins, []) && !late.pinOff, JSON.stringify({ pins: fx && fx.data.log.pins, off: late.pinOff }));
  p.check('the log that was open then shows it', late.open && late.visited.length === 1 && late.visited[0].name === held.name && late.visited[0].what === 'at random', JSON.stringify(late.visited));
  p.check('with ?os-fixture= the page runs on the labs\' fixture store: the address keeps the parameter, and the browser\'s own store is not written',
    !!where && where.fixture === 'first-visit' && /[?&]os-fixture=first-visit/.test(late.url) && !!ownBefore && same(own0, ownBefore) && own0.data.log.visits.length === 0,
    `${JSON.stringify(where)} | ${late.url} | own store ${same(own0, ownBefore) ? 'as it was' : 'changed'}, ${own0 && own0.data ? own0.data.log.visits.length : '?'} visits`);
  await closeLog();

  // ---- the keyboard: a link that skips to the survey, and a ring on the search field ----
  await open();
  await p.ev('document.activeElement && document.activeElement.blur()');
  await p.key('Tab');
  const skip = await call(skipSeen);
  await p.key('Enter');
  await p.sleep(200);
  const landed = await state();
  p.check('the first Tab shows a link that skips to the survey, and Enter takes the focus there', skip.cls === 'skip' && skip.seen && /Skip to the survey/.test(skip.text) && landed.focus === 'survey', `${JSON.stringify(skip)} then ${landed.focus}`);
  const r = await call(ring);
  p.check('the search field shows a ring when it has the focus', r.style === 'solid' && r.width >= 2, JSON.stringify(r));

  // ---- the world alone: the log line leaves with the other instruments ----
  const shown = (sel) => p.ev(`(() => { const c = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); return c.visibility === 'visible' && c.opacity === '1'; })()`);
  await call(press, '#btn-clean');
  await p.sleep(2400);   // the instruments leave and arrive on a delay of 1.1 s and a fade of 0.7 s
  const alone = [await shown('.logrow'), await shown('.search')];
  await call(press, '#btn-clean');
  await p.sleep(2400);   // the instruments leave and arrive on a delay of 1.1 s and a fade of 0.7 s
  const withThem = [await shown('.logrow'), await shown('.search')];
  p.check('"Hide instruments" hides the log line with the search field, and "Show instruments" brings both back', same(alone, [false, false]) && same(withThem, [true, true]), `hidden ${JSON.stringify(alone)} | shown ${JSON.stringify(withThem)}`);

  // ---- visits: by name, at random ----
  await call(typeInto, 'kepler-4');
  await p.sleep(250);
  await p.key('Enter');
  const named = await line('Log: 1 visited, 0 saved');   // the write waits its turn behind the page's first frames
  p.check('a world opened by name is one visit', named.line === 'Log: 1 visited, 0 saved' && named.name.length > 1 && named.name !== start.name, `${named.name} | ${named.line}`);
  const r1 = await another(), r2 = { ...(await another()), ...(await line('Log: 3 visited, 0 saved')) };
  p.check('two more opened at random make three', r2.line === 'Log: 3 visited, 0 saved' && new Set([named.name, r1.name, r2.name]).size === 3, `${r1.name}, ${r2.name} | ${r2.line}`);

  // ---- saving ----
  await call(press, '[data-act="log"]');
  const saved1 = await line('Log: 3 visited, 1 saved');
  p.check('"Add to log" saves the world on screen: the button says so, at the same width, and the count follows', saved1.add === 'In your log' && saved1.addOn && saved1.addWidth === start.addWidth && saved1.line === 'Log: 3 visited, 1 saved',
    JSON.stringify({ add: saved1.add, on: saved1.addOn, width: [start.addWidth, saved1.addWidth], line: saved1.line }));
  // second review, D9: a save that went through said nothing
  p.check('the line under the buttons says the save to a screen reader, and clips it from view', saved1.said === `${r2.name} is in your log.` && saved1.saidQuiet, `"${saved1.said}" clipped ${saved1.saidQuiet}`);
  await call(bring, '[data-act="log"]');
  await p.shot('log-saved-quiet');
  p.check('a switch for the log appears beside the filters, off', saved1.chipSaved === 'off', saved1.chipSaved);
  const r3 = await another();
  p.check('the next world is not in the log', r3.add === 'Add to log' && !r3.addOn && r3.name !== r2.name, `${r3.name}: ${r3.add}`);
  await call(press, '[data-act="pin"]');
  await p.sleep(600);
  const pinned = await state();
  await call(press, '[data-close="compare"]');
  p.check('pinning puts the world on the compare bench', pinned.compareOpen && pinned.pins === 1, `${pinned.pins} pinned`);

  // ---- a link to a world is a visit; a reload of it is not ----
  await open(`p=${encodeURIComponent(r2.name)}`);
  const back = await line('Log: 4 visited, 1 saved');
  p.check('a link to a world opens it as one visit, and the counts and the saved world of before are there', back.nav === 'navigate' && back.line === 'Log: 4 visited, 1 saved' && back.name === r2.name && back.add === 'In your log' && back.addOn,
    `${back.nav} | ${back.name} | ${back.line} | ${back.add}`);
  await reload();
  const again = await state();
  p.check('a reload of that address is not a visit', again.nav === 'reload' && again.name === r2.name && again.line === 'Log: 4 visited, 1 saved' && again.add === 'In your log', `${again.nav} | ${again.name} | ${again.line}`);
  await another();
  await call(press, '[data-act="pin"]');
  await p.sleep(600);
  const bench = await state();
  await call(press, '[data-close="compare"]');
  p.check('the compare bench of before the reload is there, with the new world beside it', bench.pins === 2, `${bench.pins} on the bench`);

  // ---- the log itself ----
  const dlg = await openLog();
  p.check('the log opens as a dialog that fits the screen', dlg.open && dlg.fits && !dlg.wide, JSON.stringify({ open: dlg.open, fits: dlg.fits, wide: dlg.wide }));
  p.check('it says the counts in a sentence', dlg.sum === '5 worlds visited, 1 saved.', dlg.sum);
  p.check('the saved world is listed with the kind it is drawn as and when it was saved', dlg.saved.length === 1 && dlg.saved[0].name === r2.name && /^[a-z]/.test(dlg.saved[0].what) && /^saved (just now|\d+ minutes? ago)$/.test(dlg.saved[0].when), JSON.stringify(dlg.saved));
  // second review, D4: this line said "from a link, 2 times" of a world reached once at random and once by the link
  p.check('the visits are listed newest first, each with the way it was reached and a time; the world reached at random, then by the link and then reloaded, says 2 visits and the way of the last',
    dlg.visited.length === 5 && dlg.visited[0].name === bench.name && dlg.visited.every((v) => VIA.test(v.what) && /^(just now|\d+ minutes? ago)$/.test(v.when))
    && dlg.visited.some((v) => v.what === 'by name') && dlg.visited.some((v) => /^at random/.test(v.what)) && dlg.visited.find((v) => v.name === r2.name).what === '2 visits, the last from a link', JSON.stringify(dlg.visited));
  await p.shot('log-open');
  await call(pressIn, '#log-body .log-open', named.name);
  await p.sleep(900);
  const reopened = await state();
  p.check('a line of the log reopens its world and closes the log', !reopened.open && reopened.name === named.name && reopened.line === 'Log: 5 visited, 1 saved', `${reopened.name} | ${reopened.line}`);

  // ---- what is stored: each action with its time and the way it came ----
  const events = await call(osDo, 'events');
  const visits = (events || []).filter((e) => e.type === 'exomania.visit'), saves = (events || []).filter((e) => e.type === 'exomania.save');
  p.check('each visit and each save is in the activity log with its time, and each visit with the way it came', visits.length === 7 && saves.length === 1 && visits.every((e) => e.t > 1.7e12 && typeof e.data.planet === 'string' && ['search', 'results', 'tour', 'random', 'diagram', 'system', 'link', 'log'].includes(e.data.via))
    && visits.some((e) => e.data.via === 'search') && visits.some((e) => e.data.via === 'random') && visits.filter((e) => e.data.via === 'link').length === 1 && visits.at(-1).data.via === 'log', JSON.stringify(visits.map((e) => e.data.via)));
  const rec = await call(osDo, 'record');
  p.check('the record is the lab\'s one record in the labs\' store, at version 3, with its slices and a place to resume', !!rec && rec.v === 3 && !!rec.data.overdue && rec.data.log.saved.length === 1 && rec.data.log.visits.length === 5 && rec.data.log.pins.length === 2
    && !!rec.resume && rec.resume.url.includes('exomania-survey.html?p='), JSON.stringify(rec && { v: rec.v, saved: rec.data.log.saved.length, visits: rec.data.log.visits.length, pins: rec.data.log.pins, resume: rec.resume }));

  // ---- the saved worlds as a filter ----
  await another();
  await call(press, '[data-act="log"]');
  const two = await line('Log: 6 visited, 2 saved');
  await call(press, '#filters [data-act="set-saved"]');
  await p.sleep(400);
  const only = await state();
  p.check('the switch shows only the saved worlds', two.line === 'Log: 6 visited, 2 saved' && only.chipSaved === 'on' && only.filtered && only.n === 2, `${two.line} | ${only.count}`);
  const within = [await another(), await another(), await another()];
  p.check('"Another world" then stays among them', within.every((s) => s.add === 'In your log') && within.every((s) => [r2.name, two.name].includes(s.name)), within.map((s) => s.name).join(', '));

  // ---- a link to the saved worlds ----
  await openLog();
  await call(pressIn, '#log-body button', 'Copy a link to these worlds');
  await p.sleep(300);
  const link = await p.ev('window.__copied || ""');
  const copied = await state();
  p.check('"Copy a link to these worlds" makes a link to this page that carries both names', /exomania-survey\.html\?log=/.test(link) && [r2.name, two.name].every((n) => decodeURIComponent(link).includes(n)) && copied.logSaid === 'Copied: a link to these 2 worlds.', link);
  // second review, D8: "Take out" sent the focus to Close and the dialog to its top
  const firstOut = copied.saved[0].name, secondOut = copied.saved[1].name;
  await call(focusPress, '#log-body .log-out');
  const out1 = await line('Log: 6 visited, 1 saved');
  p.check('"Take out" takes the world out, says so in the dialog\'s status line, and the focus goes to the "Take out" of the line that took its place', out1.saved.length === 1 && out1.open && out1.focusIn && out1.focusLabel === `Take ${secondOut} out of the log` && out1.logSaid === `${firstOut} is out of your log.`,
    `${out1.saved.length} saved | focus on ${out1.focusLabel} | ${out1.logSaid}`);
  await call(focusPress, '#log-body .log-out');
  const emptied = await line('Log: 6 visited, 0 saved');
  p.check('taking both out empties the saved list, says how to fill it, and ends the filter that showed only them', emptied.saved.length === 0 && /Nothing saved yet\. Open a world and press .Add to log./.test(emptied.body) && emptied.line === 'Log: 6 visited, 0 saved' && emptied.chipSaved === 'none' && !emptied.filtered,
    `${emptied.line} | chip ${emptied.chipSaved} | ${emptied.count}`);
  p.check('with the last one taken out, the focus goes to the sentence of the empty list, in the saved section', emptied.focusSec === 'saved' && /^Nothing saved yet\./.test(emptied.focusLabel), `${emptied.focusSec} | ${emptied.focusLabel}`);
  await call(comeBack);
  await p.sleep(600);
  const emptied2 = await state();
  p.check('a re-read leaves the focus on that sentence', emptied2.focusSec === 'saved' && /^Nothing saved yet\./.test(emptied2.focusLabel), `${emptied2.focusSec} | ${emptied2.focusLabel}`);
  await closeLog();

  // ---- an erase on the privacy page's own path empties the log here at once ----
  await call(osDo, 'erase');
  const erased = await line('Log: 0 visited, 0 saved');
  p.check('an erase empties the log on the page', erased.line === 'Log: 0 visited, 0 saved' && erased.add === 'Add to log', erased.line);

  // ---- the link, opened by a visitor whose store is empty ----
  await open(link.split('?')[1]);
  const got = await state();
  p.check('the link opens on the first of its worlds, shows only its two, and says where they are listed', [r2.name, two.name].includes(got.name) && got.chipShared === 'on' && got.filtered && got.n === 2
    && /This link carries a log of 2 worlds\. They are the ones on the diagram now, and the log lists them under .Shared with you.\./.test(got.note), `${got.name} | ${got.count} | ${got.note}`);
  p.check('a link that carries a log is not a visit to a world: the receiver\'s own log is as it was, empty', got.line === 'Log: 0 visited, 0 saved, 2 shared with you' && got.add === 'Add to log', got.line);
  p.check('the link keeps its log in the address, so a reload shows the same', /[?&]log=/.test(got.url), got.url);
  const sharedDlg = await openLog();
  p.check('the log lists what was shared, apart from what is the visitor\'s own', sharedDlg.shared.length === 2 && sharedDlg.saved.length === 0 && sharedDlg.shared.every((s) => [r2.name, two.name].includes(s.name) && s.when === ''), JSON.stringify(sharedDlg.shared));
  await p.shot('log-shared');
  await call(pressIn, '#log-body button', 'Add all to your log');
  const adopted = await line('Log: 0 visited, 2 saved, 2 shared with you');
  p.check('"Add all to your log" saves both, says so beside the button, and the shared lines say they are now in the log', adopted.saved.length === 2 && adopted.line === 'Log: 0 visited, 2 saved, 2 shared with you' && adopted.adopted === 'Added 2 worlds.'
    && adopted.shared.every((s) => s.when === 'in your log'), `${adopted.line} | ${adopted.adopted} | ${JSON.stringify(adopted.shared)}`);
  await closeLog();

  // ---- a link with junk in it is read at the door ----
  await open('log=' + encodeURIComponent(`<img src=x onerror=window.__hit=1>|not a planet|${r2.name}|${r2.name}`));
  const junk = await openLog();
  const hit = await p.ev('window.__hit === 1');
  p.check('markup and unknown names in a link are not read, and the log says how many', !hit && junk.imgs === 0 && junk.shared.length === 1 && junk.shared[0].name === r2.name && /3 names in the link were not read/.test(junk.body), `${junk.shared.length} read | hit ${hit} | ${junk.body.slice(0, 200)}`);
  await closeLog();

  // ---- recording off: visits stop, a save does not ----
  await call(press, '#filters [data-act="set-shared"]');   // leave the filter of the shared log: the next world comes from the whole catalogue
  await p.sleep(300);
  const before = await state();
  p.check('the switch of a shared log turns its filter off, and the whole catalogue is back', !before.filtered && before.n > 5000 && before.chipShared !== 'on', `${before.count} | ${before.chipShared}`);
  await call(osDo, 'recording', false);
  let off1 = await another();
  for (let i = 0; i < 5 && off1.add !== 'Add to log'; i++) off1 = await another();
  await call(press, '[data-act="log"]');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  const off2 = await state();
  const offDlg = await openLog();
  p.check('with the site\'s recording off a world opened is not added to the visits, a world saved is saved, and the log says so', off1.name !== before.name && off2.line.replace(/, \d+ saved.*/, '') === before.line.replace(/, \d+ saved.*/, '') && off2.add === 'In your log'
    && offDlg.notes.some((n) => /Recording is off on this site, so visits are not added\. A world you save is still saved\./.test(n)), `${before.line} then ${off2.line} | ${offDlg.notes.join(' / ')}`);
  await closeLog();
  await call(osDo, 'recording', true);

  // ---- Overdue writes its own slice, and the clock it opened as a visit from the sky; the rest of the log is left ----
  const mine = await state(), rawMine = await call(rawRecord);
  await p.go(`${base}/labs/exomania.html?still`);
  await p.until('document.body.dataset.state === "ready"', 60000);
  await p.ev(`(() => { const i = document.getElementById("pick"); i.value = "WASP-12 b"; document.getElementById("pick-form").requestSubmit(); })()`);
  await p.sleep(1200);
  await open();
  const after = await state();
  const rec2 = await call(osDo, 'record'), rawAfter = await call(rawRecord);
  const own = (s) => s.line.replace(/, \d+ shared with you$/, '');
  const others = (r) => r.data.log.visits.filter((v) => v.name !== 'WASP-12 b').map((v) => [v.name, v.t, v.via, v.n]);
  const skyTop = rawAfter && rawAfter.data.log.visits[0];
  p.check('after Overdue opened a clock, the survey\'s log holds all it held and that clock as a visit from the sky at the sky\'s day, and the record holds the sky\'s planet',
    /, 3 saved$/.test(own(after)) && !!rec2 && rec2.data.overdue.planet === 'WASP-12 b' && same(rawAfter.data.log.saved, rawMine.data.log.saved) && same(rawAfter.data.log.pins, rawMine.data.log.pins)
    && same(others(rawAfter), others(rawMine)) && !!skyTop && skyTop.name === 'WASP-12 b' && skyTop.via === 'sky' && /^\d{4}-\d{2}-\d{2}$/.test(skyTop.at || ''),
    `${mine.line} then ${after.line} | overdue ${rec2 && rec2.data.overdue.planet} | top ${JSON.stringify(skyTop)}`);

  // ---- a tour: the visitor's own steps are visits ----
  await another();
  await call(press, '#tours [data-tour]');
  await p.sleep(900);
  const tA = await state(), recA = await call(rawRecord);
  await call(press, '#tour-next');
  await p.sleep(900);
  const tB = await state(), recB = await call(rawRecord);
  const top = (rr) => (rr && rr.data && rr.data.log.visits[0]) || {};
  p.check('a tour the visitor starts, and each step they take in it, is a visit "on a tour"', tB.name !== tA.name && top(recA).name === tA.name && top(recA).via === 'tour' && top(recB).name === tB.name && top(recB).via === 'tour',
    `${tA.name}: ${JSON.stringify(top(recA))} | ${tB.name}: ${JSON.stringify(top(recB))}`);

  // ---- a tour started by a link and left alone moves by itself, and is no visit ----
  await open('tour=earthlike', { still: false });
  const c0 = await state(), rawC0 = await call(rawRecord);
  const moved = await p.until(`(document.getElementById("ret-name") || {}).textContent !== ${JSON.stringify(c0.name)}`, 60000);
  await p.sleep(1500);
  const c1 = await state(), rawC1 = await call(rawRecord);
  p.check('a tour started by a link, left alone, moves to its next stop by itself and writes no visit', moved && c1.name !== c0.name && c1.line === c0.line && same(rawC1.data.log.visits, rawC0.data.log.visits) && same(rawC0.data.log.visits, recB.data.log.visits),
    `${c0.name} then ${c1.name} | ${c0.line} then ${c1.line}`);
  await call(press, '#tour-next');
  await p.sleep(1500);
  const c2 = await state(), rawC2 = await call(rawRecord);
  p.check('a step the visitor takes in it is a visit', c2.name !== c1.name && top(rawC2).name === c2.name && top(rawC2).via === 'tour', `${c2.name}: ${JSON.stringify(top(rawC2))}`);

  // ---- another tab: what it erased or saved is not undone by the next thing done here ----
  await open();
  const d0 = await state();
  await call(eraseElsewhere);
  await another();
  const dA = await line('Log: 1 visited, 0 saved'), rawA = await call(rawRecord);
  p.check('an erase made in another tab is not undone by the next thing done here: the log holds that one visit and nothing of before', dA.line === 'Log: 1 visited, 0 saved' && dA.add === 'Add to log' && !!rawA && rawA.data.log.saved.length === 0
    && same(rawA.data.log.visits.map((v) => v.name), [dA.name]), `${d0.line} then ${dA.line} | stored ${JSON.stringify(rawA && rawA.data.log.visits.map((v) => v.name))}`);
  const [x, y] = await call(names, 2, 300);
  const cur = rawA.data;
  cur.log.saved.unshift({ name: x, t: Date.now(), view: 'orbit' });
  await call(writeRaw, cur, 2);
  await another();
  const dB = await line('Log: 2 visited, 1 saved'), rawB = await call(rawRecord);
  p.check('a save made in another tab is not undone by the next thing done here', dB.line === 'Log: 2 visited, 1 saved' && !!rawB && same(rawB.data.log.saved.map((e) => e.name), [x]) && rawB.data.log.visits.length === 2, `${dB.line} | stored ${JSON.stringify(rawB && rawB.data.log.saved.map((e) => e.name))}`);
  const cur2 = rawB.data;
  cur2.log.saved.unshift({ name: y, t: Date.now(), view: 'surface' });
  await call(writeRaw, cur2, 2);
  await call(comeBack);
  const dC = await line('Log: 2 visited, 2 saved');
  p.check('when the tab comes back into view the page reads the store again, with nothing pressed', dC.line === 'Log: 2 visited, 2 saved' && dC.chipSaved !== 'none', `${dC.line} | chip ${dC.chipSaved}`);

  // ---- what the store holds is read at the door, as a link is ----
  const cur3 = (await call(rawRecord)).data, t3 = Date.now();
  cur3.log.saved.unshift({ name: '<img src=x onerror=window.__hit2=1>', t: t3, view: 'orbit' }, { name: 'Not A Planet b', t: t3 - 1, view: 'orbit' });
  cur3.log.visits.unshift({ name: 'Gone World c', t: t3, via: 'log', n: 1 });
  cur3.log.pins = ['Gone World c'];
  await call(writeRaw, cur3, 2);
  await call(comeBack);
  await p.sleep(800);
  const e1 = await openLog();
  await call(pressIn, '#log-body button', 'Copy a link to these worlds');
  await p.sleep(300);
  const link2 = await p.ev('window.__copied || ""'), hit2 = await p.ev('window.__hit2 === 1'), rawE = await call(rawRecord);
  p.check('stored names the catalogue does not have are not shown, not counted, and the log says how many there are', !hit2 && e1.imgs === 0 && e1.line === 'Log: 2 visited, 2 saved' && same(e1.saved.map((s) => s.name), [y, x]) && e1.visited.length === 2
    && e1.notes.some((n) => n.replace(/\s+/g, ' ').trim() === '3 stored entries name worlds this catalogue does not have, and are not shown. Remove them from the log'), `${e1.line} | ${JSON.stringify(e1.saved.map((s) => s.name))} | ${e1.notes.join(' / ')} | hit ${hit2}`);
  // second review, D5: the heading counted the shown saved worlds against the bound and said nothing of the hidden two
  p.check('the saved heading says how many of the stored saved worlds are not shown', (e1.secs.find((s) => /^Saved/.test(s.h)) || {}).h === 'Saved 2 of 200, and 2 not shown', JSON.stringify(e1.secs.map((s) => s.h)));
  p.check('a link made from the log carries none of them, and they are left in the store as they were', decodeURIComponent(link2.split('log=')[1] || '') === `${y}|${x}` && !!rawE && rawE.data.log.saved.length === 4 && rawE.data.log.visits.length === 3,
    `${link2} | stored ${rawE && rawE.data.log.saved.length} saved, ${rawE && rawE.data.log.visits.length} visits`);
  await closeLog();

  // ---- a write the browser refuses ----
  let g0 = await another();
  for (let i = 0; i < 5 && g0.add !== 'Add to log'; i++) g0 = await another();
  await p.sleep(600);
  const gLine = (await state()).line;   // the count once the visit to this world is written
  const broke = await call(osDo, 'breakSet');
  await call(press, '[data-act="log"]');
  await p.until('!!document.querySelector(".tp-said").textContent', 6000);
  await call(bring, '[data-act="log"]');
  const g1 = await state();
  await p.shot('log-refused');
  const g2 = await openLog();
  p.check('a write the browser refuses is said under the button pressed, in view, and the button and the count stay as they were', broke && g1.said === `${g0.name} was not added: the browser refused to write the log.` && g1.add === 'Add to log' && !g1.addOn
    && g1.line === gLine && g1.addSeen && g1.saidSeen && g1.saidUnder, `${g1.said} | ${g1.add} | ${gLine} then ${g1.line} | seen ${g1.addSeen} ${g1.saidSeen} under ${g1.saidUnder}`);
  p.check('and the log says what happened and what it is showing', g2.notes.some((n) => n === 'The browser refused to write the log (QuotaExceededError: the disk is full). What is listed here is what was stored before.'), g2.notes.join(' / '));
  await closeLog();
  await call(osDo, 'fixSet');
  await call(press, '[data-act="log"]');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  const g3 = await state(), g4 = await openLog();
  p.check('once the browser takes the write the world is saved, and neither place says otherwise any more', g3.add === 'In your log' && g3.said === `${g0.name} is in your log.` && g3.saidQuiet && /, 3 saved$/.test(g3.line) && !g4.notes.some((n) => /refused/.test(n)), `${g3.add} | "${g3.said}" | ${g3.line} | ${g4.notes.join(' / ')}`);
  await closeLog();

  // ---- a full log ----
  const all = await call(names, 203, 0), t5 = Date.now();
  const full = blank();
  full.log.saved = all.slice(0, 200).map((name, i) => ({ name, t: t5 - i, view: 'orbit' }));
  await call(writeRaw, full, 2);
  await open(`log=${encodeURIComponent(`${all[200]}|${all[201]}`)}`);
  const f0 = await state();
  await call(press, '[data-act="log"]');
  await p.until('!!document.querySelector(".tp-said").textContent', 6000);
  await call(bring, '[data-act="log"]');
  const f1 = await state();
  await p.shot('log-full');
  p.check('a full log refuses at the button pressed, in view, with the reason and the way out', f0.line === 'Log: 0 visited, 200 saved, 2 shared with you' && f0.name === all[200] && f1.said === `${all[200]} was not added: ${FULL}.`
    && f1.add === 'Add to log' && f1.line === f0.line && f1.addSeen && f1.saidSeen && f1.saidUnder, `${f0.line} | ${f1.said} | seen ${f1.addSeen} ${f1.saidSeen} under ${f1.saidUnder}`);
  await openLog();
  await call(pressIn, '#log-body button', 'Add all to your log');
  await p.until('!!(document.querySelector("#log-body [data-log=adopt] ~ span") || {}).textContent', 6000);
  const f2 = await state();
  p.check('"Add all to your log" on a full log adds none and says why in the dialog\'s status line', f2.adopted === `None could be added: ${FULL}.` && f2.line === f0.line && f2.saved.length === 20 && f2.showAllSaved === 'Show all 200'
    && (f2.secs.find((s) => /^Saved/.test(s.h)) || {}).h === 'Saved 200 of 200', `${f2.adopted} | ${f2.line} | ${f2.saved.length} listed, ${f2.showAllSaved}`);
  const outName = f2.saved[0].name;
  await call(focusPress, '#log-body .log-out');
  const f3 = await line('Log: 0 visited, 199 saved, 2 shared with you');
  p.check('after one is taken out, what "Add all" said before is gone, and the status line says what was taken out', f3.saved.length === 20 && (f3.secs.find((s) => /^Saved/.test(s.h)) || {}).h === 'Saved 199 of 200' && f3.adopted === `${outName} is out of your log.` && f3.focusIn, `${f3.line} | "${f3.adopted}"`);
  await call(pressIn, '#log-body button', 'Add all to your log');
  await p.until('!!(document.querySelector("#log-body [data-log=adopt] ~ span") || {}).textContent', 6000);
  const f4 = await state();
  p.check('"Add all" then adds the one there is room for and says how many were left', f4.adopted === `Added 1 world. 1 world could not be added: ${FULL}.` && f4.line === 'Log: 0 visited, 200 saved, 2 shared with you', `${f4.adopted} | ${f4.line}`);

  // ---- a long list of visits ----
  const long = blank();
  long.log.visits = all.slice(0, 25).map((name, i) => ({ name, t: t5 - i * 1000, via: 'search', n: 1 }));
  long.log.dropped = 3;
  await call(writeRaw, long, 2);
  await call(comeBack);
  const h0 = await line('Log: 28 visited, 0 saved, 2 shared with you');
  p.check('the log lists the 20 newest visits, offers the rest, and says how many are counted and no longer listed', h0.open && h0.visited.length === 20 && h0.showAll === 'Show all 25' && h0.sum === '28 worlds visited, 0 saved.'
    && /3 worlds visited earlier are counted and no longer listed: the list holds 500 worlds\./.test(h0.body), `${h0.line} | ${h0.visited.length} listed | ${h0.showAll} | ${h0.sum}`);
  await call(focusPress, '#log-body [data-sec="visited"] [data-log="all"]');
  await p.sleep(400);
  const h1 = await state();
  // second review, D8: "Show all" sent the focus to Close and the dialog to its top
  p.check('"Show all" lists every visit, and the focus goes to the first visit that was not listed before', h1.visited.length === 25 && h1.showAll === '' && h1.focusIn && h1.focusSec === 'visited' && h1.focusLabel === h1.visited[20].name, `${h1.visited.length} listed | focus on ${h1.focusSec}: ${h1.focusLabel}`);
  await closeLog();

  // ---- the states of the store, on the labs' fixtures ----
  await open('os-fixture=storage-unavailable');
  const i1 = await openLog();
  p.check('where the browser\'s store did not open, the log says that what is done here is not kept', i1.notes.some((n) => /^The browser.s store did not open on this page, so what you do here is not kept after the page closes\.$/.test(n)) && i1.line === 'Log: 0 visited, 0 saved', `${i1.line} | ${i1.notes.join(' / ')}`);
  // second review, D11: the footer said "The log is kept in this browser." here
  p.check('and its last words do not say the log is kept in this browser', !/kept in this browser/.test(i1.foot) && /^A visit and a save are also usage events, which are sent to the labs. backend only where you have allowed it\. This page writes version 3 of the record, and [^.]+\. No copy is synced to another device\. What this site keeps/.test(i1.foot), i1.foot);
  await closeLog();
  await open('os-fixture=recording-off');
  await another();
  const i2 = await openLog();
  p.check('with recording off and nothing visited, the log says why no visit is listed', i2.line === 'Log: 0 visited, 0 saved' && /No visit is listed\. Recording is off on this site\./.test(i2.body)
    && i2.notes.some((n) => /^Recording is off on this site, so visits are not added\./.test(n)), `${i2.line} | ${i2.notes.join(' / ')}`);
  await closeLog();
  // second review, D11: with recording off the footer said a visit and a save are usage events, and a save wrote none
  const sv = await another();
  await call(press, '[data-act="log"]');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  const offEvents = await call(osDo, 'events'), i3 = await openLog();
  p.check('with recording off a save is saved and writes no usage event, and the footer says so instead of naming the events', i3.saved.some((s) => s.name === sv.name) && (offEvents || []).length === 0
    && /^The log is kept in this browser\. With recording off, no usage event is written\. This page writes version 3 of the record, and [^.]+\. No copy is synced to another device\. What this site keeps/.test(i3.foot) && !/usage events/.test(i3.foot), `${(offEvents || []).length} events | ${i3.foot}`);
  await closeLog();

  /* ======== the second review: each defect in the state it was reported in ======== */
  const t9 = Date.now();
  const rec9 = (log9) => ({ overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0, ...log9 } });
  const saveEvents = async (name) => ((await call(osDo, 'events')) || []).filter((e) => e.type === 'exomania.save' && e.data && e.data.planet === name).length;
  const pinsNow = async () => { const rr = await call(rawRecord); return rr && rr.data && rr.data.log ? rr.data.log.pins : null; };
  const pinHere = async () => { await call(press, '[data-act="pin"]'); await p.until('document.getElementById("compare").open', 4000); await p.sleep(200); const s = await state(); await call(press, '[data-close="compare"]'); return s; };

  // ---- D2 and T3: a double press of "Add to log" made one save and two save events ----
  await call(writeRaw, rec9({}), 2);
  await open();
  const w2 = await another();
  const busy = await p.ev('(() => { const b = document.querySelector("[data-act=log]"); b.click(); const s = { off: b.disabled, busy: b.getAttribute("aria-busy") }; b.click(); return s; })()');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  await p.sleep(400);
  const d2 = await state(), d2raw = await call(rawRecord), d2ev = await saveEvents(w2.name);
  p.check('D2: while the store answers a press, "Add to log" is off and busy, so a double press saves once and writes one save event', busy.off && busy.busy === 'true' && !d2.addOff && d2.add === 'In your log' && d2raw.data.log.saved.filter((e) => e.name === w2.name).length === 1 && d2ev === 1,
    `${JSON.stringify(busy)} | ${d2ev} events | button ${d2.add} off ${d2.addOff}`);
  // a world saved in another tab, then "Add to log" pressed here on the stale page
  const w2b = await another();
  const cur9 = (await call(rawRecord)).data;
  cur9.log.saved.unshift({ name: w2b.name, t: Date.now(), view: 'orbit' });
  await call(writeRaw, cur9, 2);
  const stale = await state();
  await call(press, '[data-act="log"]');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  await p.sleep(400);
  const d2c = await state(), d2craw = await call(rawRecord), d2cev = await saveEvents(w2b.name);
  p.check('D2: "Add to log" pressed on a stale page for a world another tab saved changes nothing, writes no save event, and shows it saved', stale.add === 'Add to log' && d2c.add === 'In your log' && d2craw.data.log.saved.filter((e) => e.name === w2b.name).length === 1 && d2cev === 0,
    `${stale.add} then ${d2c.add} | ${d2cev} events`);

  // ---- D1 and T1: the compare bench is the store's ----
  await call(writeRaw, rec9({}), 2);
  await open();
  const b1 = await another(); await pinHere();
  await call(eraseElsewhere);
  await call(comeBack);
  await p.sleep(600);
  const b2 = await another(); const b2s = await pinHere(), b2raw = await pinsNow();
  p.check('D1: an erase made in another tab is not undone by the next pin here: the bench holds only the new world', same(b2raw, [b2.name]) && same(b2s.pins, 1), `${b1.name} pinned, erased elsewhere, ${b2.name} pinned | stored ${JSON.stringify(b2raw)}`);
  const cur10 = (await call(rawRecord)).data, [other] = await call(names, 1, 900);
  cur10.log.pins.push(other);
  await call(writeRaw, cur10, 2);   // another tab pinned a world after this one
  const b3 = await another(); await pinHere();
  const b3raw = await pinsNow();
  p.check('D1: a pin made in another tab is kept by the next pin here', same(b3raw, [b2.name, other, b3.name]), JSON.stringify(b3raw));
  await call(press, '[data-act="pin"]');
  await p.until('document.getElementById("compare").open', 4000);
  await call(osDo, 'erase');
  await p.sleep(500);
  const b4 = await state();
  await call(press, '[data-close="compare"]');
  p.check('D1: an erase on this page empties the bench, the open one included', b4.pins === 0 && b4.compareOpen, `${b4.pins} on the bench, open ${b4.compareOpen}`);
  await call(writeRaw, rec9({ pins: [b2.name, other] }), 2);   // another tab pinned two worlds
  await call(comeBack);
  await p.sleep(500);
  await call(press, '[data-act="pin"]');
  await p.until('document.getElementById("compare").open', 4000);
  await call(press, '#cmp-clear');
  await p.sleep(500);
  const b5 = await state(), b5raw = await pinsNow();
  await call(press, '[data-close="compare"]');
  p.check('D1: "Unpin all" empties the bench the store holds, worlds pinned in another tab included', b5.pins === 0 && same(b5raw, []), `${b5.pins} shown | stored ${JSON.stringify(b5raw)}`);

  // ---- D12 and T2: what "Add all" said outlived an erase made in another tab ----
  const [s1, s2] = await call(names, 2, 1200);
  await open(`log=${encodeURIComponent(`${s1}|${s2}`)}`);
  await openLog();
  const said0 = await p.ev('(window.__said = document.getElementById("log-said"), true)');
  await call(pressIn, '#log-body button', 'Add all to your log');
  await p.until('document.getElementById("log-said").textContent === "Added 2 worlds."', 6000);
  const ad0 = await state(), sameEl = await p.ev('window.__said === document.getElementById("log-said") && window.__said.isConnected');
  // second review, D9: the status regions were drawn again with their text already in them
  p.check('D9: what "Add all" did is written into the dialog\'s one status line, which was on the page before it spoke', said0 && sameEl && ad0.logSaid === 'Added 2 worlds.' && await p.ev('document.getElementById("log-said").getAttribute("role")') === 'status', `${sameEl} | ${ad0.logSaid}`);
  await call(eraseElsewhere);
  await call(comeBack);
  await p.until('document.getElementById("log-line").textContent === "Log: 0 visited, 0 saved, 2 shared with you"', 6000);
  const ad1 = await state();
  p.check('D12: after an erase made in another tab, the status line no longer says the worlds were added', ad1.logSaid === '' && ad1.shared.every((s) => s.when === ''), `"${ad1.logSaid}" | ${JSON.stringify(ad1.shared)}`);
  await call(pressIn, '#log-body button', 'Add all to your log');
  await p.until('document.getElementById("log-said").textContent === "Added 2 worlds."', 6000);
  await call(pressIn, '#log-body button', 'Copy a link to these worlds');
  await p.sleep(300);
  const cp0 = (await state()).logSaid;
  await call(comeBack);
  await p.sleep(700);
  const cp1 = (await state()).logSaid;
  p.check('D9: what "Copy a link" said stays through a re-read that changed nothing', cp0 === 'Copied: a link to these 2 worlds.' && cp1 === cp0, `${cp0} then ${cp1}`);
  await closeLog();

  // ---- D3 and T5: a tour link that names a world ----
  await open('tour=earthlike');
  const tr0 = await state();
  await call(press, '#tour-next'); await p.sleep(700);
  await call(press, '#tour-next'); await p.sleep(900);
  const tr2 = await state(), addr = await p.ev('location.search'), trBefore = (await call(rawRecord)).data.log.visits;
  await p.go(`${base}/labs/exomania-survey.html${addr}`);
  await p.until(NAMED, 90000); await settle(); await p.sleep(600);
  const tr3 = await state(), trAfter = (await call(rawRecord)).data.log.visits;
  p.check('D3: a tour link opens the tour at the stop it names, and writes that one visit, from a link', tr3.name === tr2.name && / 3 of /.test(await p.ev('document.getElementById("tour-k").textContent'))
    && trAfter[0].name === tr2.name && trAfter[0].via === 'link' && trAfter[0].n === trBefore.find((v) => v.name === tr2.name).n + 1 && trAfter.length === trBefore.length, `${tr0.name} … ${tr2.name} | shown ${tr3.name} | top ${JSON.stringify(trAfter[0])}`);
  const [notStop] = await call(names, 1, 4500);
  await open(`tour=earthlike&p=${encodeURIComponent(notStop)}`);
  const tr4 = await state(), trAfter2 = (await call(rawRecord)).data.log.visits;
  p.check('D3: a tour link whose world is no stop of the tour opens the tour at its first stop and writes nothing', tr4.name === tr0.name && / 1 of /.test(await p.ev('document.getElementById("tour-k").textContent')) && same(trAfter2, trAfter), `asked ${notStop}, shown ${tr4.name}`);

  // ---- D5 and T7: entries the page hides count against the bounds ----
  const many = await call(names, 700, 1000);
  await call(writeRaw, rec9({ saved: [{ name: 'Gone World b', t: t9 + 5, view: 'orbit' }, { name: 'Gone World c', t: t9 + 4, view: 'orbit' }, ...many.slice(0, 198).map((name, i) => ({ name, t: t9 - i, view: 'orbit' }))] }), 2);
  await open(`p=${encodeURIComponent(many[300])}`);
  await call(press, '[data-act="log"]');
  await p.until('!!document.querySelector(".tp-said").textContent', 6000);
  const hf = await state();
  p.check('D5: a log of 198 shown and 2 hidden refuses a save and names the 2 and where to remove them', hf.add === 'Add to log' && hf.said === `${many[300]} was not added: ${FULL}. 2 of them are not shown; remove them in the log.` && !hf.saidQuiet, hf.said);
  const hd = await openLog();
  await call(pressIn, '#log-body button', 'Remove them from the log');
  await p.until('/^Removed/.test(document.getElementById("log-said").textContent)', 6000);
  const hr = await state(), hraw = await call(rawRecord);
  p.check('D5: "Remove them from the log" takes the hidden entries out of the store and says how many', (hd.secs.find((s) => /^Saved/.test(s.h)) || {}).h === 'Saved 198 of 200, and 2 not shown' && hr.logSaid === 'Removed 2 entries that named worlds this catalogue does not have.'
    && hraw.data.log.saved.length === 198 && (hr.secs.find((s) => /^Saved/.test(s.h)) || {}).h === 'Saved 198 of 200' && !hr.notes.some((n) => /stored entr/.test(n)), `${hr.logSaid} | stored ${hraw.data.log.saved.length}`);
  await closeLog();
  await call(press, '[data-act="log"]');
  await p.until('document.querySelector("[data-act=log]").textContent === "In your log"', 6000);
  p.check('D5: then "Add to log" saves the world', (await state()).line.endsWith('199 saved'), (await state()).line);
  // a full list of visits whose oldest line is hidden: one visit more raises "visited" by one
  await call(writeRaw, rec9({ visits: [...many.slice(0, 499).map((name, i) => ({ name, t: t9 - i * 1000, via: 'search', n: 1 })), { name: 'Gone World d', t: t9 - 600000, via: 'search', n: 1 }] }), 2);
  await open();
  const hv0 = await state();
  // the one more visit is a link to a named world that is not among the log's 499: "Another world" picked one of
  // them at random about once in thirteen runs, and a world visited again raises nothing
  const fresh5 = many[650];
  await open(`p=${encodeURIComponent(fresh5)}`);
  const hv1 = await line('Log: 500 visited, 0 saved'), hraw5 = await call(rawRecord), top5 = hraw5.data.log.visits[0];
  p.check('D5: with the oldest of 500 visits hidden, a visit to a world not in the log raises "visited" by one, and the hidden line is the one that goes',
    !many.slice(0, 499).includes(fresh5) && hv0.line === 'Log: 499 visited, 0 saved' && hv1.line === 'Log: 500 visited, 0 saved' && top5.name === fresh5 && top5.n === 1 && top5.via === 'link'
    && hraw5.data.log.visits.length === 500 && !hraw5.data.log.visits.some((v) => v.name === 'Gone World d'), `${hv0.line} then ${hv1.line} | top ${JSON.stringify(top5)}`);

  // ---- D6 and T9: a record of a later version ----
  const later = { overdue: { planet: 'WASP-12 b', place: null, tz: 'Europe/Madrid' }, log: { saved: [{ name: many[0], t: t9, view: 'orbit', note: 'kept by a later page' }], visits: [], pins: [], dropped: 0, tags: { [many[0]]: ['hot'] } }, notes: { a: 1 } };
  await call(writeRaw, later, 4);
  await open();
  const v3a = await another();
  await p.sleep(600);
  await call(press, '[data-act="log"]');
  await p.until('!!document.querySelector(".tp-said").textContent', 6000);
  const v3s = await state(), v3d = await openLog(), v3raw = await call(rawRecord);
  await closeLog();
  p.check('D6: a record of a later version is shown and not written: a visit and a save leave it as it was, and the press says why', !!v3raw && v3raw.v === 4 && same(v3raw.data, later) && v3s.said === `${v3a.name} was not added: this log was written by a newer version of this page.`
    && v3s.line === 'Log: 0 visited, 1 saved', `v${v3raw && v3raw.v} | ${v3s.said} | ${v3s.line}`);
  p.check('D6: the log says why nothing is written', v3d.notes.includes('This log was written by a newer version of this page. It is shown as far as this version reads it, and nothing is written until the page is reloaded.') && v3d.saved.length === 1, v3d.notes.join(' / '));
  await p.go(`${base}/labs/exomania.html?still`);
  await p.until('document.body.dataset.state === "ready"', 60000);
  await p.ev('(() => { const i = document.getElementById("pick"); i.value = "HD 209458 b"; document.getElementById("pick-form").requestSubmit(); return true; })()');
  await p.sleep(1500);
  const v3o = await call(rawRecord), v3name = await p.ev('(document.getElementById("c-name") || {}).textContent');
  p.check('D6: Overdue keeps working on a record of a later version and writes nothing', v3name === 'HD 209458 b' && v3o.v === 4 && same(v3o.data, later), `${v3name} | v${v3o.v}`);

  // ---- D7 and T10: the focus on the filter bar ----
  await call(writeRaw, rec9({}), 2);
  await open();
  await p.ev('(document.querySelector("#filters [data-cls=all]").focus(), true)');
  await call(comeBack);
  await p.sleep(700);
  const fc1 = await p.ev('document.activeElement.dataset.cls || ""');
  await p.key('r');
  // the visit "r" writes, waited for in the store and then on the line, not for a fixed time (a 1,200 ms wait failed at 390 under load)
  const wrote = await p.until(`(${rawRecord})().then((r) => !!r && !!r.data && !!r.data.log && r.data.log.visits.length === 1)`, 8000);
  await p.until('/^Log: 1 visited/.test(document.getElementById("log-line").textContent)', 4000);
  const fc2 = await p.ev('document.activeElement.dataset.cls || ""'), fcl = await state();
  p.check('D7: a re-read of the log, and a world opened with "r" that writes a visit, leave the focus on the filter\'s "all sizes"', wrote && fc1 === 'all' && fc2 === 'all' && fcl.line === 'Log: 1 visited, 0 saved', `${fc1} | ${fc2} | ${fcl.line} | stored ${wrote}`);

  // ---- D8 and T11: a world both saved and visited keeps the focus in the list it was in ----
  const both = many[5];
  await call(writeRaw, rec9({ saved: [{ name: both, t: t9, view: 'orbit' }], visits: [{ name: both, t: t9, via: 'search', n: 1 }] }), 2);
  await open();
  await openLog();
  await p.ev('(document.querySelector("#log-body [data-sec=visited] .log-open").focus(), true)');
  await call(comeBack);
  await p.sleep(700);
  const fb = await state();
  p.check('D8: after a re-read the focus stays on the Visited line of a world that is also saved', fb.focusSec === 'visited' && fb.focusLabel === both, `${fb.focusSec}: ${fb.focusLabel}`);
  await closeLog();

  // ---- D10 and T13: a full log in the dialog ----
  await call(writeRaw, rec9({ saved: many.slice(0, 200).map((name, i) => ({ name, t: t9 - i * 60000, view: 'orbit' })), visits: many.slice(0, 500).map((name, i) => ({ name, t: t9 - i * 1000, via: 'search', n: 1 })) }), 2);
  await open();
  await openLog();
  const geo = await p.ev('(() => { const d = document.getElementById("log"), v = document.querySelector("#log-body [data-sec=visited]"); return { visitedTop: Math.round(v.getBoundingClientRect().top - d.getBoundingClientRect().top + d.scrollTop), rows: document.querySelectorAll("#log-body [data-sec=saved] .log-list li").length }; })()');
  await p.ev('(() => { const d = document.getElementById("log"); d.scrollTop = d.scrollHeight; return true; })()');
  await p.sleep(300);
  const closeAt = await p.ev('(() => { const r = document.querySelector("[data-close=log]").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight }; })()');
  await p.shot('log-full-bottom');
  p.check('D10: with 200 saved the dialog lists 20 of them and the visits start near its top, and Close stays in view when it is scrolled', geo.rows === 20 && geo.visitedTop < 2600 && closeAt.top >= 0 && closeAt.bottom <= closeAt.h, `${JSON.stringify(geo)} | close ${JSON.stringify(closeAt)}`);
  const row = await p.ev('(() => { const li = document.querySelector("#log-body [data-sec=saved] .log-list li"); const w = li.querySelector(".log-when").getBoundingClientRect(), o = li.querySelector(".log-out").getBoundingClientRect(); return { dy: Math.round(Math.abs(w.top - o.top)), outW: Math.round(o.width), liW: Math.round(li.getBoundingClientRect().width) }; })()');
  p.check('D10: "Take out" sits on the row of "saved ... ago", at its own width', row.dy <= 6 && row.outW < 100 && row.outW < row.liW / 3, JSON.stringify(row));
  await closeLog();
}
