/* ============================================================
   exoplanet/record.js — what the Exomania lab keeps about a
   visitor, in one shape for its two pages.

   The lab has one record in Labs OS (lab "exomania"), so the
   privacy page's export and erase reach all of it. It has two
   slices:
   - overdue: the planet and the place the Overdue page was left
     on (the whole record, before version 2);
   - log: the survey's log. `saved` is what the visitor chose to
     keep, `visits` is where they have been (one line per world,
     with the time of the last visit, how it was reached and how
     many times), `pins` is the compare bench.

   Five rules, each learned from a review on 2026-11-15:

   1. The store is the truth. A page never writes back its own
      copy of the record. A write is one change (a visit, a save,
      a pin, a planet for Overdue) applied by `update` to what the
      store holds at that moment, so a save made in another tab,
      or an erase made on the privacy page, is not undone by a
      page that read the record earlier. What `update` returns is
      what the page shows, and `changed` says whether the store
      was written: an event is tracked only for a change.
   2. One door. What comes out of the store passes the same
      checks as what comes in a link: `normalise` for its shape
      and bounds, and `view` for the names, which keeps from the
      page every entry the catalogue does not have (they stay in
      the store, untouched, and are counted as hidden).
   3. A write is checked on arrival: a name that is not in the
      catalogue, a time that is not a positive number, a way of
      reaching a world this page does not have are refused, and
      the record comes back as it was with the reason.
   4. A page writes only a record whose version it knows. A
      record of a later version is read for display and never
      written, by either page.
   5. A count, a bound and a sentence are computed on the set the
      visitor sees. The words that depend on the record's state
      are the functions at the end of this file.

   Every function but `read`, `load` and `update` is pure: a
   record in, a record out, no storage and no page.
   ============================================================ */

/* The version of the record's shape. */
export const V = 2;
export const LIMITS = Object.freeze({ saved: 200, visits: 500, pins: 3, shared: 24, dropped: 1000000 });
/* How a world was reached, and the words the log prints for each. */
export const VIA_WORDS = Object.freeze({
  search: 'by name', results: 'from a question', tour: 'on a tour', random: 'at random',
  diagram: 'on the diagram', system: 'in its system', link: 'from a link', log: 'from the log',
});
export const VIAS = Object.freeze(Object.keys(VIA_WORDS));
/* The views a saved world can reopen in. */
export const VIEWS = Object.freeze(['orbit', 'closeorbit', 'surface']);
const NAME_MAX = 80;

const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= NAME_MAX;
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const placeOf = (p) => {
  const o = obj(p);
  return isNum(o.lat) && isNum(o.lon) && o.lat >= -90 && o.lat <= 90 && o.lon >= -180 && o.lon <= 180 ? { lat: o.lat, lon: o.lon } : null;
};

export const empty = () => ({ overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } });

/* Any stored value as a sound record. A record of the first shape, { planet, place }, becomes the Overdue slice.
   Entries that fail their checks are left out; lists are put newest first, each world once, and cut to their bounds. */
export function normalise(data) {
  const d = obj(data), out = empty();
  const od = 'overdue' in d || 'log' in d ? obj(d.overdue) : d;
  out.overdue = { planet: isName(od.planet) ? od.planet : null, place: placeOf(od.place) };
  const log = obj(d.log);
  const newest = (a, b) => b.t - a.t;
  const once = (entries) => { const seen = new Set(); return entries.filter((e) => !seen.has(e.name) && seen.add(e.name)); };
  out.log.saved = once(list(log.saved).map(obj).filter((e) => isName(e.name) && isTime(e.t)).sort(newest))
    .slice(0, LIMITS.saved).map((e) => ({ name: e.name, t: e.t, view: VIEWS.includes(e.view) ? e.view : 'orbit' }));
  const visits = once(list(log.visits).map(obj).filter((e) => isName(e.name) && isTime(e.t) && VIAS.includes(e.via)).sort(newest));
  out.log.visits = visits.slice(0, LIMITS.visits).map((e) => ({ name: e.name, t: e.t, via: e.via, n: Number.isInteger(e.n) && e.n >= 1 ? e.n : 1 }));
  out.log.pins = [...new Set(list(log.pins).filter(isName))].slice(0, LIMITS.pins);
  const was = Number.isInteger(log.dropped) && log.dropped >= 0 ? log.dropped : 0;
  out.log.dropped = Math.min(LIMITS.dropped, was + Math.max(0, visits.length - LIMITS.visits));
  return out;
}

/* The record as the page shows it: without the entries whose name the catalogue does not have. `hidden` counts
   the saved worlds and visits kept from the page, `hiddenSaved` the saved worlds among them. They are not taken out
   of the store: a world can leave the archive and come back under the same name. */
export function view(record, known) {
  const saved = record.log.saved.filter((e) => known(e.name)), visits = record.log.visits.filter((e) => known(e.name));
  const hiddenSaved = record.log.saved.length - saved.length;
  return {
    record: { overdue: record.overdue, log: { saved, visits, pins: record.log.pins.filter(known), dropped: record.log.dropped } },
    hidden: hiddenSaved + (record.log.visits.length - visits.length),
    hiddenSaved,
  };
}

const copy = (r) => ({
  overdue: { planet: r.overdue.planet, place: r.overdue.place ? { ...r.overdue.place } : null },
  log: { saved: r.log.saved.map((e) => ({ ...e })), visits: r.log.visits.map((e) => ({ ...e })), pins: [...r.log.pins], dropped: r.log.dropped },
});
const refused = (record, why) => ({ ok: false, why, record });
const done = (record) => ({ ok: true, why: '', record });
/* why a write about a world the catalogue does not have is refused */
export const UNKNOWN = 'that world is not in the catalogue';
/* why a write about a world is refused, or '' */
const wrong = (name, t, known) => (!isName(name) || !known(name) ? UNKNOWN : !isTime(t) ? 'the time is not a number' : '');

/* The visitor opened a world. Its line moves to the top with the new time and way, and its count goes up by one.
   Past the bound one line goes: a line the page does not show goes first and is not counted, because the page
   never counted it as visited; otherwise the oldest goes and is counted, so the number of worlds visited stays
   true. */
export function visit(record, { name, t, via }, known) {
  const bad = wrong(name, t, known) || (VIAS.includes(via) ? '' : 'the way the world was reached is not one this page has');
  if (bad) return refused(record, bad);
  const r = copy(record), i = r.log.visits.findIndex((e) => e.name === name);
  const n = i >= 0 ? r.log.visits.splice(i, 1)[0].n + 1 : 1;
  r.log.visits.unshift({ name, t, via, n });
  if (r.log.visits.length > LIMITS.visits) {
    const h = r.log.visits.findLastIndex((e) => !known(e.name));
    if (h >= 0) r.log.visits.splice(h, 1);
    else { r.log.dropped = Math.min(LIMITS.dropped, r.log.dropped + r.log.visits.length - LIMITS.visits); r.log.visits.length = LIMITS.visits; }
  }
  return done(r);
}

/* why the log takes no more saved worlds */
export const FULL = `the log holds ${LIMITS.saved} saved worlds, which is all it takes; take one out first`;
/* The same, naming the saved worlds of the log the page does not show: they count against the bound, and the
   visitor can only remove them from the dialog's note. */
export const fullWhy = (notShown = 0) => (notShown > 0 ? `${FULL}. ${thousands(notShown)} of them ${notShown === 1 ? 'is' : 'are'} not shown; remove ${notShown === 1 ? 'it' : 'them'} in the log` : FULL);
/* The visitor saved a world, with the view it was in. Saving a world twice changes nothing. */
export function save(record, { name, t, view: v }, known) {
  const bad = wrong(name, t, known);
  if (bad) return refused(record, bad);
  if (isSaved(record, name)) return done(record);
  if (record.log.saved.length >= LIMITS.saved) return refused(record, fullWhy(record.log.saved.filter((e) => !known(e.name)).length));
  const r = copy(record);
  r.log.saved.unshift({ name, t, view: VIEWS.includes(v) ? v : 'orbit' });
  return done(r);
}
export function unsave(record, name) {
  if (!isSaved(record, name)) return done(record);
  const r = copy(record);
  r.log.saved = r.log.saved.filter((e) => e.name !== name);
  return done(r);
}
/* Save several worlds at one time (a log that came by link), each in the orbit view. Those already saved are passed
   over; a name the catalogue does not have, and every world past the bound, is counted as left. */
export function saveAll(record, names, t, known) {
  let r = record, added = 0, left = 0;
  for (const name of list(names)) {
    if (isSaved(r, name)) continue;
    const w = save(r, { name, t, view: 'orbit' }, known);
    if (w.ok) { r = w.record; added++; } else left++;
  }
  return { ok: left === 0, why: left ? `${left} could not be added` : '', record: r, added, left };
}
/* The compare bench. A world pinned goes at the end, each world once, and past LIMITS.pins the first pinned goes.
   Pinning a world that is on the bench changes nothing. */
export function pin(record, name, known) {
  if (!isName(name) || !known(name)) return refused(record, UNKNOWN);
  if (record.log.pins.includes(name)) return done(record);
  const r = copy(record);
  r.log.pins = [...r.log.pins, name].slice(-LIMITS.pins);
  return done(r);
}
export function unpin(record, name) {
  if (!record.log.pins.includes(name)) return done(record);
  const r = copy(record);
  r.log.pins = r.log.pins.filter((n) => n !== name);
  return done(r);
}
export function clearPins(record) {
  if (!record.log.pins.length) return done(record);
  const r = copy(record);
  r.log.pins = [];
  return done(r);
}
/* The visitor removed the entries the page does not show: the saved worlds, visits and pins whose name the
   catalogue does not have. A visit removed this way is not counted as dropped: the page never counted it. */
export function forget(record, known) {
  const r = copy(record);
  r.log.saved = r.log.saved.filter((e) => known(e.name));
  r.log.visits = r.log.visits.filter((e) => known(e.name));
  r.log.pins = r.log.pins.filter((n) => known(n));
  const same = r.log.saved.length === record.log.saved.length && r.log.visits.length === record.log.visits.length && r.log.pins.length === record.log.pins.length;
  return done(same ? record : r);
}
/* Where the Overdue page was left. A place outside the globe is no place. */
export function setOverdue(record, { planet, place }) {
  const r = copy(record);
  r.overdue = { planet: isName(planet) ? planet : null, place: placeOf(place) };
  return done(r);
}

export const isSaved = (record, name) => record.log.saved.some((e) => e.name === name);
/* What the visitor has done: worlds visited (those dropped from the list still count), worlds saved. */
export const counts = (record) => ({ visited: record.log.visits.length + record.log.dropped, saved: record.log.saved.length });

/* The value of a link's `log` parameter: the saved worlds, newest first, at most LIMITS.shared. */
export const shareValue = (record) => record.log.saved.slice(0, LIMITS.shared).map((e) => e.name).join('|');
/* A `log` parameter as it arrives. Only names the catalogue has, each once, at most LIMITS.shared; `refused` counts
   every other piece. A value longer than any real one is cut before it is read. */
export function readShare(value, known) {
  const names = [];
  let no = 0;
  for (const piece of (typeof value === 'string' ? value.slice(0, 4000) : '').split('|').map((s) => s.trim()).filter(Boolean)) {
    if (names.length < LIMITS.shared && isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;
  }
  return { names, refused: no };
}

/* How the page opened a world, as one of VIAS, or null when it was no visit. `from` is where the page's own code
   says the world came from; `self` is true when the page opened it with no action of the visitor (the world it
   starts on, a tour that moves by itself); `results` is true for a tour that walks a question's list. */
export function viaOf(from, { self = false, results = false } = {}) {
  if (self) return null;
  const ways = { search: 'search', random: 'random', plot: 'diagram', system: 'system', link: 'link', log: 'log', tour: results ? 'results' : 'tour' };
  return Object.prototype.hasOwnProperty.call(ways, from) ? ways[from] : null;
}

/* ---------- the words that depend on the record ---------- */

/* 1234567 as "1,234,567", whatever the browser's own language. */
export const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const worlds = (n) => `${thousands(n)} ${n === 1 ? 'world' : 'worlds'}`;
/* The words of the log line. */
export const lineWords = (c, shared = 0) => `Your log · ${thousands(c.visited)} visited · ${thousands(c.saved)} saved${shared > 0 ? ` · ${thousands(shared)} shared with you` : ''}`;
/* How a line of the visits was reached: the way alone for one visit; for more, the count and the way of the last.
   The way of the earlier visits is not kept, so it is not said. */
export const visitWords = (e) => (e.n > 1 ? `${thousands(e.n)} visits, the last ${VIA_WORDS[e.via]}` : VIA_WORDS[e.via]);
/* Beside the heading of the saved worlds: how many are shown, of the bound, and how many stored are not shown. */
export const savedWords = (shown, notShown = 0) => `${thousands(shown)} of ${LIMITS.saved}${notShown > 0 ? `, and ${thousands(notShown)} not shown` : ''}`;
/* What a press on "Add to log" (add true) or on "In your log" or "Take out" (add false) did. */
export const toggleWords = (name, add, w) => (w.ok ? `${name} is ${add ? 'in' : 'out of'} your log.` : `${name} was not ${add ? 'added' : 'taken out'}: ${w.why}.`);
/* What "Add all to your log" did. notShown: the saved worlds of the log the page does not show. */
export const adoptWords = ({ added, left }, notShown = 0) => (!added && left ? `None could be added: ${fullWhy(notShown)}.`
  : `${added ? `Added ${worlds(added)}.` : 'All of them were in your log already.'}${left ? ` ${worlds(left)} could not be added: ${fullWhy(notShown)}.` : ''}`);
/* What "Remove them from the log" did, with the count of saved worlds and visits it removed. */
export const forgetWords = (n) => (n > 0 ? `Removed ${thousands(n)} ${n === 1 ? 'entry' : 'entries'} that named worlds this catalogue does not have.` : 'There was nothing to remove.');
/* The last words of the log. The log is said to be kept only on a store that keeps it; the usage events are named
   with recording on, and said to be off with recording off. recording null: no store, so no event and no switch. */
export const footWords = ({ persistent, recording }) => [
  persistent ? 'The log is kept in this browser.' : '',
  recording === true ? 'A visit and a save are also usage events, which are sent to the labs’ backend only where you have allowed it.'
    : recording === false ? 'With recording off, no usage event is written.' : '',
].filter(Boolean).join(' ');

/* ---------- Labs OS ---------- */

/* why nothing is written to a record of a later version */
export const NEWER = 'this log was written by a newer version of this page';
/* The lab's record as stored, sound, and whether a later version of the page wrote it. A record of the first shape
   is upgraded by Labs OS once, on this read. */
export async function read(os) {
  const rec = await os.progress.get({ v: V, migrate: (d) => normalise(d) });
  return { record: normalise(rec ? rec.data : null), newer: !!rec && rec.v > V };
}
export async function load(os) { return (await read(os)).record; }
/* One change, applied to what the store holds now. `change(record)` is one of the writes above and returns
   { ok, why, record }; a write that is refused hands back the record it was given. The store is written only when
   the record changed, and never when a later version wrote it. What comes back is the store's record after the
   change, which the page then shows, and `changed`, which says whether the store was written. `resume` ({ url,
   label }) is where the labs' hub leads back to, written beside an accepted change. Two tabs that write in the same
   instant can still interleave (Labs OS says so of every record); the window is one read and one write. */
export async function update(os, change, { resume = null } = {}) {
  const { record: cur, newer } = await read(os);
  if (newer) return { ok: false, why: NEWER, record: cur, changed: false };
  const w = change(cur);
  const changed = JSON.stringify(w.record) !== JSON.stringify(cur);
  if (changed) await os.progress.set(w.record, { v: V });
  if (w.ok && resume) {
    try { await os.progress.setResume(resume.url, resume.label); } catch { /* the hub's way back is not the log: the change is stored */ }
  }
  return { ...w, changed };
}
