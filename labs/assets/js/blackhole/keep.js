/* ============================================================
   blackhole/keep.js — the record, on the page: the card "Your
   record" in the left column (the sheet at 390), after Exomania's
   log (exoplanet/log.js). record.js holds the shape and every rule;
   this file asks the store for changes and draws what comes back.

   - The page shows what the store confirmed. Until the stored
     record is read, the line says "reading" and Keep is off; a ray
     or a fall made meanwhile is held and written once it is read.
   - A change is asked of the store (record.update applies it to
     what the store holds then); the card draws the record that
     comes back. A change refused, or a write the browser refused,
     is said under the list.
   - An event is tracked only for a change the store made, and it
     carries the object's id and a fate, never anything typed:
     black-hole.keep, black-hole.ray, black-hole.fall.
   - Rays and falls follow the site's recording switch: with
     recording off they are not added. A keep is the visitor's own
     press and is stored either way.
   - Only what the visitor did is recorded: a ray they pressed, a
     fall they started; never a ray a link opens or the tour's fall
     (ui.js passes who did it).
   - When the tab comes back into view the record is read again, so
     a keep or an erase made in another tab shows here; an erase on
     the privacy page empties it at once.
   - A record a later version of the page wrote is shown and never
     written.
   - The list is redrawn only when its words change (setHTML), so a
     press on one of its buttons is never cut by a redraw.

   Where it is kept: Labs OS, lab "black-hole", in this browser; the
   privacy page exports and erases it with everything else.
   ============================================================ */

import { LabsOS } from '../os/index.js';
import * as R from './record.js';
import { dur } from './physics.js';
import { setHTML } from './tour.js';

const LAB = 'black-hole';
const SHOWN = { kept: 8, rays: 5, falls: 3 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Resolves when the main thread is free, or after 10 s at the latest (Labs OS's store gives up on a database that has
   not opened within 4 s, and this page holds the main thread while its first shader is built). */
const idle = () => new Promise((done) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => done(), { timeout: 10000 }); else setTimeout(done, 1500);
});

/* card: the card's element (its #bh-keep, #bh-recline, #bh-reclist, #bh-recsaid, #bh-recfoot). store: the page's
   state. fixture: the os-fixture value of the address. */
export function createKeep({ card, store, fixture = null, now = () => Date.now(), start = idle }) {
  const $ = (s) => card.querySelector(s);
  const btn = $('#bh-keep'), line = $('#bh-recline'), list = $('#bh-reclist'), saidEl = $('#bh-recsaid'), foot = $('#bh-recfoot');
  let os = null, stored = R.empty(), newer = false, loaded = false, said = '';
  const held = [];
  // a usage event never stops the page: track resolves with its refusal, and a store that throws is ignored here
  const track = (type, data) => { if (os) os.track(type, data).catch(() => {}); };
  const take = (record, isNewer) => { stored = record; newer = isNewer; };
  const here = (q, extra = '') => `${location.pathname}?${q}${extra}`;
  // a link's name never changes, and the card is drawn on every change of state (every frame of a fall)
  const names = new Map();
  const nameOf = (q) => { if (!names.has(q)) names.set(q, R.linkLabel(q)); return names.get(q); };

  async function change(fn, opts) {
    if (!os) { said = 'This browser keeps nothing for this page, so nothing could be written.'; draw(); return null; }
    try {
      const w = await R.update(os, fn, opts);
      take(w.record, newer || w.why === R.NEWER);
      said = w.ok ? '' : `Not written: ${w.why}.`;
      return w;
    } catch {
      said = 'The browser refused to write the record. Nothing was changed.';
      return null;
    } finally { draw(); }
  }

  function draw() {
    const c = R.counts(stored), q = store.toQuery(), kept = R.isKept(stored, q);
    line.textContent = loaded ? R.lineWords(c) : 'reading';
    btn.disabled = !loaded || !os || newer;
    btn.setAttribute('aria-pressed', String(kept));
    btn.textContent = kept ? 'Kept' : 'Keep this hole';
    const rows = [];
    for (const [i, e] of stored.kept.slice(0, SHOWN.kept).entries()) rows.push(`<li><span>${esc(nameOf(e.q))}</span><a class="bh-btn" href="${esc(here(e.q))}">Open</a><button class="bh-btn" type="button" data-out="${i}">Take out</button></li>`);
    for (const e of stored.rays.slice(0, SHOWN.rays)) rows.push(`<li><span>A ray at ${esc(nameOf(e.q))}: it ${esc(R.rayWords(e))}</span><a class="bh-btn" href="${esc(here(e.q, `&p=${e.p[0].toFixed(4)},${e.p[1].toFixed(4)}`))}">Open</a></li>`);
    for (const e of stored.falls.slice(0, SHOWN.falls)) rows.push(`<li><span>A fall at ${esc(nameOf(e.q))}: ${esc(dur(e.tau))} of its own time from 40 M to the stop</span><a class="bh-btn" href="${esc(here(e.q))}">Open</a></li>`);
    setHTML(list, rows.length ? `<ul class="bh-rec">${rows.join('')}</ul>` : `<p class="bh-note">${loaded ? 'Nothing yet. Keep a hole, press a pixel to trace its ray, or fall in.' : ''}</p>`);
    const notes = [];
    if (newer) notes.push('This record was written by a newer version of this page. It is shown as far as this version reads it, and nothing is written until the page is reloaded.');
    if (os && !os.recording.on) notes.push('Recording is off on this site, so rays and falls are not added. A hole you keep is still kept.');
    if (loaded && !os) notes.push('This browser keeps nothing for this page (its storage is off or full).');
    saidEl.textContent = [said, ...notes].filter(Boolean).join(' ');
    // where it lives, as Labs OS reports it: a memory store (storage off or refused) keeps it until the page closes
    foot.textContent = !os ? '' : os.storage.kind === 'memory' ? 'This page cannot reach the storage of this browser, so the record lasts until the page closes.'
      : os.storage.persistent ? 'Kept in this browser with the other labs\' records.' : 'Kept in this browser; it may clear it when space runs short.';
  }

  async function keep() {
    if (!loaded) return;
    const q = store.toQuery(), kept = R.isKept(stored, q), label = nameOf(q);
    const w = await change((r) => (kept ? R.unkeep(r, q) : R.keep(r, { q, t: now() })), kept ? {} : { resume: { url: here(q), label: `Black Hole: ${label}` } });
    if (w && w.changed) { if (!kept) track('black-hole.keep', { obj: store.get('obj') }); said = kept ? `${label} is out of your record.` : `${label} is kept.`; draw(); }
  }
  async function writeRay(r) {
    if (os && !os.recording.on) return;
    const w = await change((x) => R.ray(x, r));
    if (w && w.changed) track('black-hole.ray', { obj: r.obj, fate: r.fate });
  }
  async function writeFall(f) {
    if (os && !os.recording.on) return;
    const w = await change((x) => R.fall(x, f));
    if (w && w.changed) track('black-hole.fall', { obj: f.obj });
  }

  btn.addEventListener('click', keep);
  // one listener on the list, so a redraw never leaves a button without its listener or with two
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-out]'); if (!b) return;
    const entry = stored.kept[+b.dataset.out]; if (!entry) return;
    const label = nameOf(entry.q);
    void change((r) => R.unkeep(r, entry.q)).then((w) => { if (w && w.changed) { said = `${label} is out of your record.`; draw(); } });
  });
  const reread = async () => { if (os) { try { const r = await R.read(os); take(r.record, r.newer); } catch { /* keep what was read last */ } draw(); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reread(); });

  const api = {
    /** A ray the visitor traced: p, fractions of the screen; fate and n from the probe. */
    ray({ p, fate, n = 0 }) {
      const r = { q: store.toQuery(), t: now(), p, fate, n, obj: store.get('obj') };
      if (!loaded) held.push(['ray', r]); else void writeRay(r);
    },
    /** A fall the visitor ran to its stop, with the proper time the Fall card shows there (s). */
    fall({ tau }) {
      const f = { q: store.toQuery(), t: now(), tau, obj: store.get('obj') };
      if (!loaded) held.push(['fall', f]); else void writeFall(f);
    },
    /** The state changed: the Keep button says whether this hole is kept. */
    refresh: draw,
    get record() { return stored; },
    get os() { return os; },
  };

  api.ready = (async () => {
    await start();
    try { os = await LabsOS.init({ lab: LAB, ...(fixture ? { fixture } : {}) }); } catch { os = null; }
    if (os) {
      for (const [type, cls] of [['black-hole.keep', 'outcome'], ['black-hole.ray', 'action'], ['black-hole.fall', 'outcome']]) { try { os.register(type, { cls }); } catch { /* registered already */ } }
      try { const r = await R.read(os); take(r.record, r.newer); } catch { take(R.empty(), false); said = 'The stored record could not be read, so what is listed here is empty. The stored record has not been changed.'; }
      os.onDeleted(() => { take(R.empty(), false); said = ''; draw(); });
      os.recording.onChange(() => draw());
    }
    loaded = true;
    card.dataset.store = os ? os.storage.kind : 'none';
    draw();
    for (const [kind, x] of held.splice(0)) await (kind === 'ray' ? writeRay(x) : writeFall(x));
    return api;
  })();

  draw();
  return api;
}
