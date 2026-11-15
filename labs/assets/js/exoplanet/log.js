/* ============================================================
   exoplanet/log.js — the survey's log, on the page.

   What a visitor opened and what they chose to save, kept in the
   lab's one record in Labs OS. record.js has the shape and every
   rule; this file asks the store for changes and draws the two
   parts that show the record: the log line under the search
   field and the dialog "Your log".

   The page shows what the store confirmed, and nothing sooner:
   - until the stored record is read the line says "reading",
     the page's button for the log is off, and a visit is held
     (with its time) to be written once the record is read;
   - a change is asked of the store (record.update applies it to
     what the store holds then), and the page shows the record
     that comes back. A change that is refused, or a write the
     browser refuses, is said where the visitor pressed;
   - when the tab comes back into view the record is read again,
     so a save or an erase made in another tab shows here.

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
   ============================================================ */

import { LabsOS, ago } from '../os/index.js';
import * as R from './record.js';
import { kindLine } from './find.js';
import { esc } from './views/common.js';

const LAB = 'exomania';
const SHOWN = 20;   // visits listed before "Show all"
/* Resolves when the main thread is free, or after 10 s at the latest. */
const idle = () => new Promise((done) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => done(), { timeout: 10000 }); else setTimeout(done, 1500);
});
const worlds = (n) => `${R.thousands(n)} ${n === 1 ? 'world' : 'worlds'}`;

/* host: { line, dialog, body } elements. byName: the catalogue, a Map the page may add to. open(p, view): show a
   world. onChange(): the record changed. sharedParam: the link's `log` value. fixture: the `os-fixture` value of
   the address the page was opened with. */
export function createLog({ host, byName, open, onChange, sharedParam = null, fixture = null, now = () => Date.now(), start = idle }) {
  const known = (n) => byName.has(n);
  let os = null, stored = R.empty(), loaded = false, all = false;
  let fault = '';                  // a write the browser refused, said in the dialog until a write goes through
  let adopted = '';                // what "Add all to your log" did, said beside it
  let shared = R.readShare(sharedParam, known);
  const held = [];                 // visits made before the stored record was read
  let queue = Promise.resolve();
  const seen = () => R.view(stored, known);
  const track = (type, data) => { if (os) void os.track(type, data); };
  const show = () => { draw(); onChange(); };
  /* One job after another. A job that throws is reported by the browser as any error is, and the jobs after it
     still run: one failure does not stop the log for the rest of the visit. */
  const inTurn = (job) => { const run = queue.then(job); queue = run.catch(() => {}); return run; };

  /* One change, asked of the store in turn. `then(w)` gets { ok, why }: ok false with the reason when the change was
     refused, or when the browser refused the write (the log on screen is then the stored one). */
  const change = (op, then = () => {}) => {
    return inTurn(async () => {
      let w;
      try { w = os ? await R.update(os, op) : (() => { const r = op(stored); return { ...r, record: r.ok ? r.record : stored }; })(); }
      catch (e) {
        fault = `The browser refused to write the log (${String((e && e.message) || e).slice(0, 80)}). What is listed here is what was stored before.`;
        try { stored = await R.load(os); } catch { /* the store cannot be read either: the page keeps what it last read */ }
        show(); then({ ok: false, why: 'the browser refused to write the log' });
        return;
      }
      if (w.ok) fault = '';
      stored = w.record;
      show(); then({ ok: w.ok, why: w.why });
    });
  };
  /* Read the store again: another tab may have saved, or erased, since this page read it. */
  const reread = () => inTurn(async () => {
    if (!loaded) return;
    if (os) { try { stored = await R.load(os); } catch { /* keep what was read last */ } }
    shared = R.readShare(sharedParam, known);
    show();
  });
  const writeVisit = (p, via, t) => {
    if (os && !os.recording.on) return;
    change((rec) => R.visit(rec, { name: p.name, t, via }, known), (w) => {
      if (!w.ok) return;
      track('exomania.visit', { planet: p.name, via });
      if (os) os.progress.setResume(`exomania-survey.html?p=${encodeURIComponent(p.name)}`, p.name).catch(() => {});
    });
  };

  /* ---------- what the page calls ---------- */
  const api = {
    get ready() { return ready; },
    loaded: () => loaded,
    counts: () => R.counts(seen().record),
    isSaved: (name) => R.isSaved(stored, name),
    saved: () => seen().record.log.saved.map((e) => e.name),
    pins: () => seen().record.log.pins.slice(),
    shared: () => shared.names.slice(),
    /* The visitor opened a world by an action of theirs. */
    visit(p, via) { if (loaded) writeVisit(p, via, now()); else held.push([p, via, now()]); },
    /* Put the world in the log, or take it out, once the log is read. said(text) gets the reason when the store
       did not do it; '' when it did. */
    toggle(p, view, said = () => {}) {
      if (!loaded) return;
      const on = R.isSaved(stored, p.name);
      change((rec) => (on ? R.unsave(rec, p.name) : R.save(rec, { name: p.name, t: now(), view }, known)), (w) => {
        if (w.ok && !on) track('exomania.save', { planet: p.name });
        said(w.ok ? '' : `${p.name} was not ${on ? 'taken out' : 'added'}: ${w.why}.`);
      });
    },
    setPins(names) { if (loaded) change((rec) => R.setPins(rec, names, known)); },
    reread,
    open() { all = false; if (!host.dialog.open) host.dialog.showModal(); draw(); },
  };

  /* ---------- the two parts ---------- */
  const when = (t) => ago(t, now());
  const kind = (name) => kindLine(byName.get(name));
  const world = (name) => `<button type="button" class="log-open" data-open="${esc(name)}">${esc(name)}</button>`;
  /* the control with the focus, so that drawing the dialog again does not drop it */
  const focusKey = () => { const a = document.activeElement; return a && host.body.contains(a) ? ['open', 'unsave', 'log'].map((k) => (a.dataset[k] ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : '')).join('') : ''; };
  function draw() {
    const v = seen(), c = R.counts(v.record);
    host.line.textContent = loaded ? R.lineWords(c, shared.names.length) : 'Your log · reading';
    if (!host.dialog.open) return;
    if (!loaded) { host.body.innerHTML = '<p class="log-note">Reading the log from this browser’s store.</p>'; return; }
    const had = focusKey();
    const notes = [];
    if (!os) notes.push('This page could not start the labs’ store, so what you do here is not kept after the page closes.');
    else if (!os.storage.persistent) notes.push('The browser’s store did not open on this page, so what you do here is not kept after the page closes.');
    if (os && !os.recording.on) notes.push('Recording is off on this site, so visits are not added. A world you save is still saved.');
    if (fault) notes.push(fault);
    if (v.hidden) notes.push(`${R.thousands(v.hidden)} stored ${v.hidden === 1 ? 'entry names a world' : 'entries name worlds'} this catalogue does not have, and ${v.hidden === 1 ? 'is' : 'are'} not shown.`);
    const sharedHtml = !shared.names.length && !shared.refused ? '' : `
      <section class="log-sec"><h3>Shared with you <span>${worlds(shared.names.length)} from the link</span></h3>
        ${shared.names.length ? `<ul class="log-list">${shared.names.map((n) => `<li>${world(n)}<span class="log-what">${esc(kind(n))}</span><span class="log-when">${R.isSaved(stored, n) ? 'in your log' : ''}</span></li>`).join('')}</ul>
        <p><button type="button" class="btn" data-log="adopt">Add all to your log</button> <span class="dim" role="status">${esc(adopted)}</span></p>` : ''}
        ${shared.refused ? `<p class="dim">${R.thousands(shared.refused)} ${shared.refused === 1 ? 'name in the link was' : 'names in the link were'} not read: not in this catalogue, given twice, or past the first ${R.LIMITS.shared}.</p>` : ''}
      </section>`;
    const saved = v.record.log.saved, visits = v.record.log.visits, shownVisits = all ? visits : visits.slice(0, SHOWN);
    const noVisits = os && !os.recording.on ? 'No visit is listed. Recording is off on this site.' : 'No world opened yet. Type a name or a question in the search field, or press “Another world”.';
    host.body.innerHTML = `
      <p class="log-sum">${worlds(c.visited)} visited, ${R.thousands(c.saved)} saved.</p>
      ${notes.map((n) => `<p class="log-note">${esc(n)}</p>`).join('')}
      ${sharedHtml}
      <section class="log-sec"><h3>Saved <span>${R.thousands(saved.length)} of ${R.LIMITS.saved}</span></h3>
        ${saved.length ? `<ul class="log-list">${saved.map((e) => `<li>${world(e.name)}<span class="log-what">${esc(kind(e.name))}</span><span class="log-when">saved ${esc(when(e.t))}</span>
          <button type="button" class="btn log-out" data-unsave="${esc(e.name)}" aria-label="Take ${esc(e.name)} out of the log">Take out</button></li>`).join('')}</ul>
        <p><button type="button" class="btn" data-log="copy">Copy a link to these worlds</button> <span class="dim" data-log-said role="status"></span></p>`
    : '<p class="dim">Nothing saved yet. Open a world and press “Add to log”, in the panel with its measurements.</p>'}
      </section>
      <section class="log-sec"><h3>Visited <span>${worlds(visits.length)} listed, newest first</span></h3>
        ${visits.length ? `<ul class="log-list">${shownVisits.map((e) => `<li>${world(e.name)}<span class="log-what">${esc(R.VIA_WORDS[e.via])}${e.n > 1 ? `, ${R.thousands(e.n)} times` : ''}</span><span class="log-when">${esc(when(e.t))}</span></li>`).join('')}</ul>
        ${visits.length > shownVisits.length ? `<p><button type="button" class="btn" data-log="all">Show all ${R.thousands(visits.length)}</button></p>` : ''}` : `<p class="dim">${noVisits}</p>`}
        ${v.record.log.dropped ? `<p class="dim">${worlds(v.record.log.dropped)} visited earlier ${v.record.log.dropped === 1 ? 'is' : 'are'} counted and no longer listed: the list holds ${R.LIMITS.visits} worlds.</p>` : ''}
      </section>
      <p class="log-foot">The log is kept in this browser. A visit and a save are also usage events, which are sent to the labs’ backend only where you have allowed it. <a class="ref" href="privacy.html">What this site keeps, and how to erase it</a></p>`;
    // the focus stays on the control it was on, or goes to the dialog's Close when that control is gone
    if (had) (host.body.querySelector(had) || host.dialog.querySelector('[data-close]') || host.body).focus();
  }

  host.line.addEventListener('click', () => api.open());
  host.body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b || !loaded) return;
    if (b.dataset.open) {
      const p = byName.get(b.dataset.open); if (!p) return;
      const entry = stored.log.saved.find((x) => x.name === p.name);
      host.dialog.close();
      open(p, entry ? entry.view : 'orbit');
    } else if (b.dataset.unsave) { adopted = ''; change((rec) => R.unsave(rec, b.dataset.unsave)); }   // what "Add all" said was about the log as it was
    else if (b.dataset.log === 'all') { all = true; draw(); }
    else if (b.dataset.log === 'adopt') {
      let did = { added: 0, left: 0 };
      change((rec) => { const w = R.saveAll(rec, shared.names, now(), known); did = w; return { ok: true, why: '', record: w.record }; }, (w) => {
        if (!w.ok) { adopted = 'Not added: the browser refused to write the log.'; draw(); return; }
        if (did.added) track('exomania.save', { shared: did.added });
        adopted = `${did.added ? `Added ${worlds(did.added)}.` : 'All of them were in your log already.'}${did.left ? ` ${worlds(did.left)} could not be added: ${R.FULL}.` : ''}`;
        if (did.left && !did.added) adopted = `None could be added: ${R.FULL}.`;
        draw();
      });
    } else if (b.dataset.log === 'copy') {
      const mine = seen().record;
      const url = `${location.origin}${location.pathname}?log=${encodeURIComponent(R.shareValue(mine))}`;
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      const said = host.body.querySelector('[data-log-said]');
      const n = Math.min(mine.log.saved.length, R.LIMITS.shared);
      if (said) said.textContent = ok ? `Copied: a link to ${n === mine.log.saved.length ? 'these' : 'the newest'} ${worlds(n)}.` : `Copying failed. The link is: ${url}`;
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
      try { stored = await R.load(os); } catch { stored = R.empty(); fault = 'The stored log could not be read, so what is listed here is empty. The stored log has not been changed.'; }
      os.onDeleted(() => { stored = R.empty(); adopted = ''; show(); });
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
