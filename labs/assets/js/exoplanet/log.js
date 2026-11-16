/* ============================================================
   exoplanet/log.js — the survey's log, on the page.

   What a visitor opened and what they chose to save, kept in the
   lab's one record in Labs OS. record.js has the shape and every
   rule; this file asks the store for changes and draws the two
   parts that show the record: the log line under the search
   field and the dialog "Your log".

   The page shows what the store confirmed, and nothing sooner:
   - until the stored record is read the line says "reading",
     the page's buttons for the log and the bench are off, and a
     visit is held (with its time) to be written once the record
     is read;
   - a change is asked of the store (record.update applies it to
     what the store holds then), and the page shows the record
     that comes back. No variable here holds a second copy of
     anything in the record: `stored` is the last record the
     store returned, and everything drawn, the compare bench
     included, comes from it. A change that is refused, or a
     write the browser refuses, is said where the visitor
     pressed;
   - an event is tracked only for a change the store made;
   - when the tab comes back into view the record is read again,
     so a save or an erase made in another tab shows here;
   - a record a later version of the page wrote is shown and not
     written.

   A redraw of the dialog keeps the focus on the control that had
   it (found by its list and its world), keeps the scroll, and
   never replaces the status line #log-said in the page's HTML.

   Where it is kept: Labs OS, lab "exomania", in this browser.
   The privacy page exports and erases it with everything else,
   and an erase made on this page empties the log at once. A
   visit follows the site's recording switch as this page read
   it when it loaded: with recording off, visits are not added.
   A save is the visitor's own press and is stored either way.
   A visit and a save are also usage events (exomania.visit,
   exomania.save), which Labs OS sends to its backend only where
   the visitor allowed that; they never carry anything typed.

   Labs OS is started when the page is idle, not at once. Its
   store gives up on a database that has not opened within 4 s,
   and this page can hold the main thread for longer than that
   while its first shader is built: the store's timer then fires
   before the database's answer is delivered, and the visit runs
   on a store that keeps nothing (seen on 2026-11-15 on a first
   load under software GL).

   A link can carry a log (?log=). It is read at the door by
   record.readShare and shown as "shared with you"; the visitor's
   own log changes only when they press "Add all to your log".

   The sky of clocks writes its visits into the same log (way
   "sky", with the day the sky was at): such a line carries a link
   that reopens its clock on the sky at that day. The catalogue
   the survey last saw is kept in the record too (catalogue()),
   so "new since your last visit" is erased with the rest. The
   dialog's last words carry the record's health check: the
   version this page writes, the version stored, and no sync.
   ============================================================ */

import { LabsOS } from '../os/index.js';
import { ago } from '../os/util.js';   // the one function the labs share for a visitor's moments (kit/format.js states the convention)
import * as R from './record.js';
import { kindLine } from './find.js';
import { esc } from './views/common.js';
import { tallySvg } from '../kit/controls.js';
import { isoDay } from '../kit/format.js';

const LAB = 'exomania';
const SHOWN = 20;   // lines of a list shown before "Show all"
/* Resolves when the main thread is free, or after 10 s at the latest. */
const idle = () => new Promise((done) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => done(), { timeout: 10000 }); else setTimeout(done, 1500);
});

/* host: { line, dialog, body, said } elements. byName: the catalogue, a Map the page may add to. open(p, view): show
   a world. onChange(): the record changed. sharedParam: the link's `log` value. fixture: the `os-fixture` value of
   the address the page was opened with. */
export function createLog({ host, byName, open, onChange, sharedParam = null, fixture = null, now = () => Date.now(), start = idle }) {
  const known = (n) => byName.has(n);
  let os = null, stored = R.empty(), newer = false, loaded = false;
  const all = { saved: false, visited: false };   // a list shown whole after its "Show all"
  let fault = '';                  // a write the browser refused, said in the dialog until a write goes through
  let healthNow = null;            // the record's health check, read again after each read and change
  let said = { text: '', about: '' };   // what the dialog's status line says, and the saved worlds it was about
  let shared = R.readShare(sharedParam, known);
  const held = [];                 // visits made before the stored record was read
  const pending = new Set();       // worlds whose save or take-out waits for the store
  let focusNext = null;            // where the focus goes when the dialog is drawn next: { sec, index } or { sec, row }
  let queue = Promise.resolve();
  const seen = () => R.view(stored, known);
  const savedKey = () => seen().record.log.saved.map((e) => e.name).join('|');
  const track = (type, data) => { if (os) void os.track(type, data); };
  const show = () => { draw(); onChange(); };
  /* The dialog's status line. It is in the page's HTML and only its text changes, so a screen reader hears it. */
  const say = (text) => { said = { text, about: savedKey() }; if (host.said) host.said.textContent = text; };
  /* The record the store returned, which the page shows from now on. What the status line said about the saved
     worlds goes once they are not the ones it was about. */
  const take = (record, isNewer) => {
    stored = record; newer = isNewer;
    if (said.text && savedKey() !== said.about) say('');
  };
  /* One job after another. A job that throws is reported by the browser as any error is, and the jobs after it
     still run: one failure does not stop the log for the rest of the visit. */
  const inTurn = (job) => { const run = queue.then(job); queue = run.catch(() => {}); return run; };
  /* The health check, as the store answers it now. A store that cannot answer leaves the last one read. */
  const checkHealth = async () => { if (os) { try { healthNow = await R.health(os); } catch { /* keep the last */ } } };
  /* The same change on the page alone, when Labs OS did not start. */
  const local = (op) => { const w = op(stored); const changed = JSON.stringify(w.record) !== JSON.stringify(stored); return { ...w, record: changed ? w.record : stored, changed }; };

  /* One change, asked of the store in turn. before(w) runs once the store has answered and before the page is
     drawn; then(w) after. w is { ok, why, changed }: ok false with the reason when the change was refused, when a
     later version wrote the record, or when the browser refused the write (the log on screen is then the stored
     one). resume: where the labs' hub leads back to, written with an accepted change. */
  const change = (op, { before = () => {}, then = () => {}, resume = null } = {}) => inTurn(async () => {
    let w;
    try { w = os ? await R.update(os, op, { resume }) : local(op); }
    catch (e) {
      fault = `The browser refused to write the log (${String((e && e.message) || e).slice(0, 80)}). What is listed here is what was stored before.`;
      try { const r = await R.read(os); take(r.record, r.newer); } catch { /* the store cannot be read either: the page keeps what it last read */ }
      w = { ok: false, why: 'the browser refused to write the log', changed: false };
      before(w); show(); then(w);
      return;
    }
    if (w.ok) fault = '';
    take(w.record, w.why === R.NEWER);
    await checkHealth();
    before(w); show(); then(w);
  });
  /* Read the store again: another tab may have saved, or erased, since this page read it. */
  const reread = () => inTurn(async () => {
    if (!loaded) return;
    if (os) { try { const r = await R.read(os); take(r.record, r.newer); } catch { /* keep what was read last */ } }
    await checkHealth();
    shared = R.readShare(sharedParam, known);
    show();
  });
  const writeVisit = (p, via, t) => {
    if (os && !os.recording.on) return;
    change((rec) => R.visit(rec, { name: p.name, t, via }, known), {
      resume: { url: `exomania-survey.html?p=${encodeURIComponent(p.name)}`, label: p.name },
      then: (w) => { if (w.changed) track('exomania.visit', { planet: p.name, via }); },
    });
  };

  /* ---------- what the page calls ---------- */
  const api = {
    get ready() { return ready; },
    loaded: () => loaded,
    counts: () => R.counts(seen().record),
    isSaved: (name) => R.isSaved(stored, name),
    /* a save or a take-out of this world waits for the store */
    busy: (name) => pending.has(name),
    saved: () => seen().record.log.saved.map((e) => e.name),
    pins: () => seen().record.log.pins.slice(),
    shared: () => shared.names.slice(),
    /* The visitor opened a world by an action of theirs. */
    visit(p, via) { if (loaded) writeVisit(p, via, now()); else held.push([p, via, now()]); },
    /* Put the world in the log, or take it out, once the log is read: what the button said when it was pressed,
       applied to the record the store holds then. The button is off until the store answers. said(text, ok) gets
       what was done, or why not. */
    toggle(p, view, said = () => {}) {
      if (!loaded || pending.has(p.name)) return;
      const add = !R.isSaved(stored, p.name);
      pending.add(p.name);
      show();
      change((rec) => (add ? R.save(rec, { name: p.name, t: now(), view }, known) : R.unsave(rec, p.name)), {
        before: () => { pending.delete(p.name); },
        then: (w) => {
          if (w.changed && add) track('exomania.save', { planet: p.name });
          said(R.toggleWords(p.name, add, w), w.ok);
        },
      });
    },
    /* The compare bench, once the log is read. then(w) runs once the page shows the bench the store returned. */
    pin(name, then) { if (loaded) change((rec) => R.pin(rec, name, known), { then }); },
    unpin(name, then) { if (loaded) change((rec) => R.unpin(rec, name), { then }); },
    clearPins(then) { if (loaded) change((rec) => R.clearPins(rec), { then }); },
    reread,
    /* The worlds of this catalogue new since the visitor's last visit, once the log is read; with recording on, the
       record then keeps this catalogue as the one last seen. Without Labs OS nothing is kept, so nothing is new. */
    catalogue: (names) => ready.then(() => inTurn(async () => {
      if (!os) return [];
      const w = await R.seeCatalogue(os, names, { day: isoDay(now()), keep: os.recording.on });
      take(w.record, w.why === R.NEWER);
      return w.fresh;
    })),
    open() { all.saved = false; all.visited = false; focusNext = null; if (!host.dialog.open) host.dialog.showModal(); draw(); },
  };

  /* ---------- the two parts ---------- */
  const when = (t) => ago(t, now());
  const kind = (name) => kindLine(byName.get(name));
  const world = (name) => `<button type="button" class="log-open" data-open="${esc(name)}">${esc(name)}</button>`;
  /* a line whose clock was opened on the sky reopens it there, on that planet at that day */
  const sky = (e) => (e.at ? `<a class="ref log-sky" data-sky="${esc(e.name)}" href="${esc(R.skyLink(e))}">${esc(R.skyWords(e))}</a>` : '');
  /* The control with the focus, by its list and its own key, so that drawing the dialog again finds it in the same
     list: a world can be both saved and visited. */
  const focusKey = () => {
    const a = document.activeElement;
    if (!a || !host.body.contains(a)) return '';
    const own = ['open', 'unsave', 'log', 'list', 'empty', 'sky'].map((k) => (a.dataset[k] ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : '')).join('');
    const sec = a.closest('[data-sec]');
    return own ? `${sec ? `[data-sec="${sec.dataset.sec}"] ` : ''}${own}` : '';
  };
  /* The control a press moved the focus to: after "Take out", the "Take out" of the line that took its place, or of
     the line before it when it was the last, or the sentence of an empty list; after "Show all", the first line that
     was not listed before. */
  const placeOf = (f) => {
    const sec = host.body.querySelector(`[data-sec="${f.sec}"]`);
    if (!sec) return null;
    if (f.row !== undefined) { const li = sec.querySelectorAll('.log-list li')[f.row]; return li ? li.querySelector('.log-open') : null; }
    const outs = sec.querySelectorAll('[data-unsave]');
    return outs.length ? outs[Math.min(f.index, outs.length - 1)] : sec.querySelector('[data-empty]');
  };
  const more = (sec, n, shown) => (n > shown ? `<p><button type="button" class="plain" data-log="all" data-list="${sec}">Show all ${R.thousands(n)}</button></p>` : '');
  /* The log line is a tally (an observer's logbook): a mark per world visited, a tall gold mark per world saved, as many
     as fit beside its words, which say the counts. It keeps one line at any count: the marks give way, the words do not. */
  const words = host.line.querySelector('.tally-w') || host.line;
  let marks = null;
  function tally(c) {
    words.textContent = loaded ? R.lineWords(c, shared.names.length) : 'Log: reading';
    if (words === host.line) return;
    const box = host.line.parentElement, cap = window.matchMedia('(max-width: 700px)').matches ? 16 : 26;
    const room = Math.max(0, Math.min(cap * 7, (box ? box.clientWidth : 0) - words.scrollWidth - 12));
    const { svg } = tallySvg(loaded ? Math.max(c.visited, c.saved) : 0, loaded ? c.saved : 0, room);
    if (marks) marks.replaceWith(svg); else host.line.prepend(svg);
    marks = svg;
  }
  if (typeof ResizeObserver === 'function' && host.line.parentElement) new ResizeObserver(() => tally(R.counts(seen().record))).observe(host.line.parentElement);
  function draw() {
    const v = seen(), c = R.counts(v.record);
    tally(c);
    if (!host.dialog.open) return;
    if (!loaded) { host.body.innerHTML = '<p class="log-note">Reading the log from this browser’s store.</p>'; return; }
    const had = focusKey(), top = host.dialog.scrollTop;
    const notes = [];
    if (!os) notes.push('This page could not start the labs’ store, so what you do here is not kept after the page closes.');
    else if (!os.storage.persistent) notes.push('The browser’s store did not open on this page, so what you do here is not kept after the page closes.');
    if (newer) notes.push('This log was written by a newer version of this page. It is shown as far as this version reads it, and nothing is written until the page is reloaded.');
    if (os && !os.recording.on) notes.push('Recording is off on this site, so visits are not added. A world you save is still saved.');
    if (fault) notes.push(fault);
    const hiddenHtml = !v.hidden ? '' : `<p class="log-note">${R.thousands(v.hidden)} stored ${v.hidden === 1 ? 'entry names a world' : 'entries name worlds'} this catalogue does not have, and ${v.hidden === 1 ? 'is' : 'are'} not shown.
      <button type="button" class="plain" data-log="forget">Remove them from the log</button></p>`;
    const sharedHtml = !shared.names.length && !shared.refused ? '' : `
      <section class="log-sec" data-sec="shared"><h3>Shared with you <span>${R.worlds(shared.names.length)} from the link</span></h3>
        ${shared.names.length ? `<ul class="log-list">${shared.names.map((n) => `<li>${world(n)}<span class="log-what">${esc(kind(n))}</span><span class="log-when">${R.isSaved(stored, n) ? 'in your log' : ''}</span></li>`).join('')}</ul>
        <p><button type="button" class="plain" data-log="adopt">Add all to your log</button></p>` : ''}
        ${shared.refused ? `<p class="dim">${R.thousands(shared.refused)} ${shared.refused === 1 ? 'name in the link was' : 'names in the link were'} not read: not in this catalogue, given twice, or past the first ${R.LIMITS.shared}.</p>` : ''}
      </section>`;
    const saved = v.record.log.saved, visits = v.record.log.visits;
    const shownSaved = all.saved ? saved : saved.slice(0, SHOWN), shownVisits = all.visited ? visits : visits.slice(0, SHOWN);
    const noSaved = v.hiddenSaved ? 'No saved world of this log is in this catalogue.' : 'Nothing saved yet. Open a world and press “Add to log”, under its numbers.';
    const noVisits = os && !os.recording.on ? 'No visit is listed. Recording is off on this site.' : 'No world opened yet. Type a name or a question in the search field, or press “Another world”.';
    host.body.innerHTML = `
      <p class="log-sum">${R.worlds(c.visited)} visited, ${R.thousands(c.saved)} saved.</p>
      ${notes.map((n) => `<p class="log-note">${esc(n)}</p>`).join('')}
      ${hiddenHtml}
      ${sharedHtml}
      <section class="log-sec" data-sec="saved"><h3>Saved <span>${R.savedWords(saved.length, v.hiddenSaved)}</span></h3>
        ${saved.length ? `<ul class="log-list">${shownSaved.map((e) => `<li>${world(e.name)}<span class="log-what">${esc(kind(e.name))}</span><span class="log-when">saved ${esc(when(e.t))}</span><button type="button" class="plain log-out" data-unsave="${esc(e.name)}" aria-label="Take ${esc(e.name)} out of the log">take out</button></li>`).join('')}</ul>
          ${more('saved', saved.length, shownSaved.length)}
          <p><button type="button" class="plain" data-log="copy">Copy a link to these worlds</button></p>`
    : `<p class="dim" data-empty="saved" tabindex="-1">${noSaved}</p>`}
      </section>
      <section class="log-sec" data-sec="visited"><h3>Visited <span>${R.worlds(visits.length)} listed, newest first</span></h3>
        ${visits.length ? `<ul class="log-list">${shownVisits.map((e) => `<li>${world(e.name)}<span class="log-what">${esc(R.visitWords(e))}</span><span class="log-when">${esc(when(e.t))}</span>${sky(e)}</li>`).join('')}</ul>
        ${more('visited', visits.length, shownVisits.length)}` : `<p class="dim">${noVisits}</p>`}
        ${v.record.log.dropped ? `<p class="dim">${R.worlds(v.record.log.dropped)} visited earlier ${v.record.log.dropped === 1 ? 'is' : 'are'} counted and no longer listed: the list holds ${R.LIMITS.visits} worlds.</p>` : ''}
      </section>
      <p class="log-foot">${esc(R.footWords({ persistent: !!os && os.storage.persistent, recording: os ? os.recording.on : null }))}${healthNow ? ` ${esc(R.healthWords(healthNow))}` : ''} <a class="ref" href="privacy.html">What this site keeps, and how to erase it</a></p>`;
    host.dialog.scrollTop = top;   // the dialog stays where it was scrolled to
    // the focus goes where the press sent it, or stays on the control it was on, or goes to Close when that is gone
    const to = focusNext ? placeOf(focusNext) : had ? host.body.querySelector(had) : null;
    focusNext = null;
    if (to) to.focus();
    else if (had) host.dialog.querySelector('[data-close]').focus();
  }

  host.line.addEventListener('click', () => api.open());
  host.body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !loaded) return;
    if (b.dataset.open) {
      const p = byName.get(b.dataset.open); if (!p) return;
      const entry = stored.log.saved.find((x) => x.name === p.name);
      host.dialog.close();
      open(p, entry ? entry.view : 'orbit');
    } else if (b.dataset.unsave) {
      const name = b.dataset.unsave, i = [...host.body.querySelectorAll('[data-sec="saved"] [data-unsave]')].indexOf(b);
      change((rec) => R.unsave(rec, name), { before: (w) => { if (w.ok) focusNext = { sec: 'saved', index: i }; say(R.toggleWords(name, false, w)); } });
    } else if (b.dataset.log === 'all') {
      const sec = b.dataset.list;
      if (sec !== 'saved' && sec !== 'visited') return;
      all[sec] = true; focusNext = { sec, row: SHOWN };
      draw();
    } else if (b.dataset.log === 'adopt') {
      let did = { added: 0, left: 0 };
      change((rec) => { const w = R.saveAll(rec, shared.names, now(), known); did = w; return { ok: true, why: '', record: w.record }; }, {
        before: (w) => { say(w.ok ? R.adoptWords(did, seen().hiddenSaved) : `Not added: ${w.why}.`); },
        then: (w) => { if (w.changed && did.added) track('exomania.save', { shared: did.added }); },
      });
    } else if (b.dataset.log === 'forget') {
      let n = 0;
      change((rec) => { const w = R.forget(rec, known); n = (rec.log.saved.length + rec.log.visits.length) - (w.record.log.saved.length + w.record.log.visits.length); return w; }, {
        before: (w) => { say(w.ok ? R.forgetWords(n) : `Not removed: ${w.why}.`); },
      });
    } else if (b.dataset.log === 'copy') {
      const mine = seen().record;
      const url = `${location.origin}${location.pathname}?log=${encodeURIComponent(R.shareValue(mine))}`;
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      const n = Math.min(mine.log.saved.length, R.LIMITS.shared);
      say(ok ? `Copied: a link to ${n === mine.log.saved.length ? 'these' : 'the newest'} ${R.worlds(n)}.` : `Copying failed. The link is: ${url}`);
    }
  });
  // another tab may have changed the store while this one was out of view
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reread(); });
  window.addEventListener('focus', () => reread());

  /* ---------- start: read the stored record, then write the visits made meanwhile ---------- */
  const ready = (async () => {
    await start();
    try { os = await LabsOS.init({ lab: LAB, ...(fixture ? { fixture } : {}) }); } catch { os = null; }
    if (os) {
      for (const [type, cls] of [['exomania.visit', 'action'], ['exomania.save', 'outcome']]) { try { os.register(type, { cls }); } catch { /* registered already */ } }
      try { const r = await R.read(os); take(r.record, r.newer); } catch { take(R.empty(), false); fault = 'The stored log could not be read, so what is listed here is empty. The stored log has not been changed.'; }
      await checkHealth();
      os.onDeleted(() => { take(R.empty(), false); show(); });
      os.recording.onChange(() => draw());
    }
    loaded = true;
    host.dialog.dataset.store = os ? os.storage.kind : 'none';   // which store the log is on, once it is read
    show();
    for (const [p, via, t] of held.splice(0)) writeVisit(p, via, t);
    return api;
  })();

  draw();
  return api;
}
