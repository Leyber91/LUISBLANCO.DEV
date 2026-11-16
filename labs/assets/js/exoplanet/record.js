// @ts-check
/* ============================================================
   exoplanet/record.js — the one client of the Exomania lab's
   record, for its two rooms: the sky of clocks (exomania.html)
   and the survey (exomania-survey.html).

   The lab has one record in Labs OS (lab "exomania"), so the
   export and erase the privacy page points to reach all of it.
   No other module of either room reads or writes it, or keeps
   anything of the lab in browser storage: record.contract.test.mjs
   greps both rooms for it. (The model route, ai/llm.js, keeps the
   visitor's own model key in localStorage; that key is the
   route's, not the lab's record.)

   The record kinds are the ones the lab's bindings list
   (records-contract), typed below and checked by tsc
   (labs-src/tsconfig.labs.json, run by the gates' labs build):
   - configuration: where the sky was left (`overdue`: planet
     and place), the worlds kept with the view each reopens in
     (`log.saved`), the compare bench (`log.pins`) and the
     catalogue as the survey last saw it (`seen`);
   - observation: a world opened (`log.visits`: one line per
     world, with the time of the last visit, how it was reached,
     how many times, and, once its clock was opened on the sky,
     the day the sky was at), and the visits counted and no
     longer listed (`log.dropped`);
   - prediction and note: typed, with no writer yet. Play
     (ticket 2.04) writes the first predictions, checked against
     the type here.

   Nine rules, the first five learned from reviews on 2026-11-15,
   the last two from the review of this client on 2026-11-16:

   1. The store is the truth. A page never writes back its own
      copy of the record. A write is one change (a visit, a save,
      a pin, the sky's planet) applied by `update` to what the
      store holds at that moment, so a save made in another tab,
      or an erase made on the privacy page, is not undone by a
      page that read the record earlier. What `update` returns is
      what the page shows, and `changed` says whether the store
      was written: an event is tracked only for a change. A
      change that is refused stores nothing, even when it is two
      writes and the first was taken. Every read and write of a
      page runs in turn, in the order asked, so two writes fired
      at once both land.
   2. One door. What comes out of the store passes the same
      checks as what comes in: `normalise` reads every entry with
      the function of its kind that a write applies, and `view`
      keeps from the page every entry the catalogue does not have
      (they stay in the store, untouched, and are counted as
      hidden).
   3. A write is checked on arrival: a name that is not in the
      room's catalogue, a time that is not a positive number, a
      way of reaching a world the lab does not have, a day off the
      sky's line of time, a place off the globe are refused, and
      the record comes back as it was with the reason.
   4. A page writes only a record whose version it knows. A
      record of a later version is read for display and never
      written, by either room.
   5. A count, a bound and a sentence are computed on the set the
      visitor sees. The words that depend on the record's state
      are the functions at the end of this file.
   6. Nothing stored is lost to a new shape. Labs OS upgrades a
      record of an older version once, on its first read here:
      version 1 ({ planet, place }) becomes the sky's slice,
      version 2 ({ overdue, log }) is kept whole. Until version 3
      the survey kept the catalogue it last saw in localStorage
      (exo:seen:v1), where the erase does not reach; the upgrade
      of a record of the visitor's own store takes that copy in.
      The copy is removed only by a later read that finds a record
      of this version already holding the catalogue, because a tab
      of version 2 that read the record before the upgrade can
      still write it back without one, and the next upgrade then
      needs the copy again. With no record (none was ever written,
      or it was erased) nothing is taken in.
   7. The health check (`health`) reports the version this page
      writes, the version stored, the store, and that nothing is
      synced to another device.
   8. A rule that judges the log by a catalogue runs only in the
      room whose catalogue it is. The log is the survey's: only a
      visit the survey writes may decide which lines the survey
      does not show. A visit from the sky, past the bound, drops
      the oldest line and counts it, since the sky's catalogue
      lacks 1,665 of the survey's planets and would have dropped
      survey lines uncounted (the class: a rule applied with
      another room's data).
   9. A sentence about the record says what the record holds.
      "New since your last visit" is said only when this visit is
      kept; with recording off it names the day the catalogue it
      counts from was kept, and with no catalogue kept it says
      nothing. A catalogue longer than the record keeps shows no
      world as new, and the log says why.

   Every function but `read`, `load`, `update`, `seeCatalogue`
   and `health` is pure: a record in, a record out, no storage
   and no page.
   ============================================================ */

import { grouped, day, fromIso } from '../kit/format.js';
import { LINE_JD } from './overdue/clock.js';

/**
 * A place on the globe, in degrees.
 * @typedef {{ lat: number, lon: number }} Place
 * kind configuration: where the sky of clocks was left.
 * @typedef {{ planet: string | null, place: Place | null }} SkyView
 * @typedef {'orbit' | 'closeorbit' | 'surface'} View
 * kind configuration: a world the visitor kept, with the view it reopens in.
 * @typedef {{ name: string, t: number, view: View }} SavedView
 * @typedef {'search' | 'results' | 'tour' | 'random' | 'diagram' | 'system' | 'link' | 'log' | 'sky'} Via
 * kind observation: a world opened. `at` is the day the sky was at when its clock was last opened there.
 * @typedef {{ name: string, t: number, via: Via, n: number, at?: string }} Visit
 * kind configuration: the catalogue as the survey last saw it, its names joined by bars, on the visitor's day.
 * @typedef {{ day: string, names: string }} Seen
 * @typedef {{ saved: SavedView[], visits: Visit[], pins: string[], dropped: number }} Log
 * The record, as stored at version V.
 * @typedef {{ overdue: SkyView, log: Log, seen: Seen | null }} ExoRecord
 * kind observation, no writer yet: a depth, period or duration the visitor measured, or a planet found.
 * @typedef {{ kind: 'measure', name: string, quantity: 'depth' | 'period' | 'duration', value: number, unit: string, t: number }} Measure
 * @typedef {{ kind: 'find', name: string, t: number }} Find
 * @typedef {Visit | Measure | Find} Observation
 * @typedef {SkyView | SavedView | string[] | Seen} Configuration
 * kind prediction, no writer yet: an answer to an item before the engine reveals it.
 * @typedef {{ item: string, answer: string, right: boolean, confidence: number, mode: string, ms: number, t: number }} Prediction
 * kind note, no writer yet.
 * @typedef {{ target: string, text: string, t: number }} Note
 * What a write returns: whether it was taken, why not, and the record to show.
 * @typedef {{ ok: boolean, why: string, record: ExoRecord }} Write
 * A test of a name against the room's catalogue.
 * @typedef {(name: string) => boolean} Known
 * The part of Labs OS the client uses.
 * @typedef {Pick<import('../os/index.js').LabsOSInstance, 'progress' | 'storage'>} OS
 * The browser's localStorage, as far as the client uses it.
 * @typedef {Pick<Storage, 'getItem' | 'removeItem'>} Local
 */

/* The version of the record's shape. */
export const V = 3;
export const LIMITS = Object.freeze({ saved: 200, visits: 500, pins: 3, shared: 24, dropped: 1000000, seen: 150000 });
/* Where each record kind lives in the record. A kind with no place has no writer yet. */
export const KINDS = Object.freeze({
  configuration: Object.freeze(['overdue', 'log.saved', 'log.pins', 'seen']),
  observation: Object.freeze(['log.visits', 'log.dropped']),
  prediction: Object.freeze([]),
  note: Object.freeze([]),
});
/** How a world was reached, and the words the log prints for each. @type {Readonly<Record<Via, string>>} */
export const VIA_WORDS = Object.freeze({
  search: 'by name', results: 'from a question', tour: 'on a tour', random: 'at random',
  diagram: 'on the diagram', system: 'in its system', link: 'from a link', log: 'from the log', sky: 'from the sky',
});
export const VIAS = /** @type {readonly Via[]} */ (Object.freeze(Object.keys(VIA_WORDS)));
/** The views a saved world can reopen in. @type {readonly View[]} */
export const VIEWS = Object.freeze(['orbit', 'closeorbit', 'surface']);
const NAME_MAX = 80;

/** @param {unknown} v @returns {v is number} */
const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);   // equivalent: Number.isFinite does not coerce, so it refuses every value that is no number
/** @param {unknown} v @returns {v is string} */
const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= NAME_MAX;
/** @param {unknown} v @returns {v is Via} */
const isVia = (v) => /** @type {readonly unknown[]} */ (VIAS).includes(v);
/** @param {unknown} v @returns {v is View} */
const isView = (v) => /** @type {readonly unknown[]} */ (VIEWS).includes(v);
/** @param {unknown} v @returns {v is number} */
const isCount = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 1;
/** An ISO day: "2026-11-16". @param {unknown} v @returns {v is string} */
const isIso = (v) => Number.isFinite(fromIso(v));
/** A day the sky's line of time shows: the day, from its start in UTC, overlaps the line, whose ends are the sky's own
   (overdue/clock.js LINE_JD: 1999-01-01 06:00 and 2040-01-01 12:00 UTC), so its first day is 1999-01-01 and its last
   2040-01-01. @param {unknown} v @returns {v is string} */
const isSkyDay = (v) => { const jd = fromIso(v) / 86400000 + 2440587.5; return jd + 1 > LINE_JD.from && jd <= LINE_JD.to; };
/** @param {unknown} v @returns {Record<string, unknown>} */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : {});
/** @param {unknown} v @returns {unknown[]} */
const list = (v) => (Array.isArray(v) ? v : []);
/** @template T @param {T | null} v @returns {v is T} */
const isSome = (v) => v !== null;
/** @param {unknown} p @returns {Place | null} */
const placeOf = (p) => {
  const o = obj(p);
  return isNum(o.lat) && isNum(o.lon) && o.lat >= -90 && o.lat <= 90 && o.lon >= -180 && o.lon <= 180 ? { lat: o.lat, lon: o.lon } : null;
};

/* ---------- one function per kind of entry: what a write applies, and what normalise reads with ---------- */

/** @param {unknown} v @returns {SavedView | null} */
const savedOf = (v) => { const e = obj(v); return isName(e.name) && isTime(e.t) ? { name: e.name, t: e.t, view: isView(e.view) ? e.view : 'orbit' } : null; };
/** A visit; `at` is kept only when it is a day of the sky's line. @param {unknown} v @returns {Visit | null} */
const visitOf = (v) => {
  const e = obj(v);
  if (!isName(e.name) || !isTime(e.t) || !isVia(e.via)) return null;
  return { name: e.name, t: e.t, via: e.via, n: isCount(e.n) ? e.n : 1, ...(isSkyDay(e.at) ? { at: e.at } : {}) };
};
/** @param {unknown} v @returns {Seen | null} */
const seenOf = (v) => { const s = obj(v); return isIso(s.day) && typeof s.names === 'string' && s.names.length <= LIMITS.seen ? { day: s.day, names: s.names } : null; };

/** @returns {ExoRecord} */
export const empty = () => ({ overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 }, seen: null });

/** Any stored value as a sound record. A record of the first shape, { planet, place }, becomes the sky's slice.
   Entries that fail their checks are left out; lists are put newest first, each world once, and cut to their bounds.
   @param {unknown} data @returns {ExoRecord} */
export function normalise(data) {
  const d = obj(data), out = empty();
  const od = 'overdue' in d || 'log' in d ? obj(d.overdue) : d;
  out.overdue = { planet: isName(od.planet) ? od.planet : null, place: placeOf(od.place) };
  const log = obj(d.log);
  /** @param {{ t: number }} a @param {{ t: number }} b */
  const newest = (a, b) => b.t - a.t;
  /** @template {{ name: string }} E @param {E[]} entries @returns {E[]} */
  const once = (entries) => { const seen = new Set(); return entries.filter((e) => !seen.has(e.name) && seen.add(e.name)); };
  out.log.saved = once(list(log.saved).map(savedOf).filter(isSome).sort(newest)).slice(0, LIMITS.saved);
  const visits = once(list(log.visits).map(visitOf).filter(isSome).sort(newest));
  out.log.visits = visits.slice(0, LIMITS.visits);
  out.log.pins = [...new Set(list(log.pins).filter(isName))].slice(0, LIMITS.pins);
  const was = Number.isInteger(log.dropped) && /** @type {number} */ (log.dropped) >= 0 ? /** @type {number} */ (log.dropped) : 0;
  out.log.dropped = Math.min(LIMITS.dropped, was + Math.max(0, visits.length - LIMITS.visits));
  out.seen = seenOf(d.seen);
  return out;
}

/** The record as the page shows it: without the entries whose name the catalogue does not have. `hidden` counts
   the saved worlds and visits kept from the page, `hiddenSaved` the saved worlds among them. They are not taken out
   of the store: a world can leave the archive and come back under the same name.
   @param {ExoRecord} record @param {Known} known @returns {{ record: ExoRecord, hidden: number, hiddenSaved: number }} */
export function view(record, known) {
  const saved = record.log.saved.filter((e) => known(e.name)), visits = record.log.visits.filter((e) => known(e.name));
  const hiddenSaved = record.log.saved.length - saved.length;
  return {
    record: { overdue: record.overdue, log: { saved, visits, pins: record.log.pins.filter(known), dropped: record.log.dropped }, seen: record.seen },
    hidden: hiddenSaved + (record.log.visits.length - visits.length),
    hiddenSaved,
  };
}

/** @param {ExoRecord} r @returns {ExoRecord} */
const copy = (r) => ({
  overdue: { planet: r.overdue.planet, place: r.overdue.place ? { ...r.overdue.place } : null },
  log: { saved: r.log.saved.map((e) => ({ ...e })), visits: r.log.visits.map((e) => ({ ...e })), pins: [...r.log.pins], dropped: r.log.dropped },
  seen: r.seen ? { ...r.seen } : null,
});
/** @param {ExoRecord} record @param {string} why @returns {Write} */
const refused = (record, why) => ({ ok: false, why, record });
/** @param {ExoRecord} record @returns {Write} */
const done = (record) => ({ ok: true, why: '', record });
/* why a write about a world the catalogue does not have is refused */
export const UNKNOWN = 'that world is not in the catalogue';
/* why a sky visit with no day of the sky's line is refused */
export const OFF_LINE = 'the day is not one the sky’s line of time has';
/* why a place off the globe is refused */
export const OFF_GLOBE = 'the place is not on the globe';
/** why a write about a world is refused, or ''
   @param {unknown} name @param {unknown} t @param {Known} known */
const wrong = (name, t, known) => (!isName(name) || !known(name) ? UNKNOWN : !isTime(t) ? 'the time is not a number' : '');

/** The visitor opened a world. Its line moves to the top with the new time and way, and its count goes up by one.
   A visit from the sky carries the day the sky was at, and the line keeps the last such day through visits of
   other ways, so the line can reopen its clock there. Past the bound one line goes: on a visit the survey writes, a
   line the survey does not show goes first and is not counted, because it never counted it as visited; otherwise
   the oldest goes and is counted, so the number of worlds visited stays true. A visit from the sky judges no line
   by its own catalogue (rule 8): the oldest goes, counted.
   @param {ExoRecord} record @param {{ name: string, t: number, via: Via, at?: string }} w @param {Known} known @returns {Write} */
export function visit(record, { name, t, via, at }, known) {
  const bad = wrong(name, t, known) || (isVia(via) ? '' : 'the way the world was reached is not one this page has') || (via !== 'sky' || isSkyDay(at) ? '' : OFF_LINE);
  if (bad) return refused(record, bad);
  const r = copy(record), i = r.log.visits.findIndex((e) => e.name === name);
  const [was = null] = i >= 0 ? r.log.visits.splice(i, 1) : [];
  const last = via === 'sky' ? at : was ? was.at : undefined;
  r.log.visits.unshift({ name, t, via, n: was ? was.n + 1 : 1, ...(last ? { at: last } : {}) });
  if (r.log.visits.length > LIMITS.visits) {
    const h = via === 'sky' ? -1 : r.log.visits.findLastIndex((e) => !known(e.name));
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
/** The visitor saved a world, with the view it was in. Saving a world twice changes nothing.
   @param {ExoRecord} record @param {{ name: string, t: number, view?: unknown }} w @param {Known} known @returns {Write} */
export function save(record, { name, t, view: v }, known) {
  const bad = wrong(name, t, known);
  if (bad) return refused(record, bad);
  if (isSaved(record, name)) return done(record);
  if (record.log.saved.length >= LIMITS.saved) return refused(record, fullWhy(record.log.saved.filter((e) => !known(e.name)).length));
  const r = copy(record);
  r.log.saved.unshift({ name, t, view: isView(v) ? v : 'orbit' });
  return done(r);
}
/** @param {ExoRecord} record @param {string} name @returns {Write} */
export function unsave(record, name) {
  if (!isSaved(record, name)) return done(record);
  const r = copy(record);
  r.log.saved = r.log.saved.filter((e) => e.name !== name);
  return done(r);
}
/** Save several worlds at one time (a log that came by link), each in the orbit view. Those already saved are passed
   over; a name the catalogue does not have, and every world past the bound, is counted as left.
   @param {ExoRecord} record @param {unknown} names @param {number} t @param {Known} known */
export function saveAll(record, names, t, known) {
  let r = record, added = 0, left = 0;
  for (const name of list(names)) {
    if (isSaved(r, name)) continue;
    const w = save(r, { name: /** @type {string} */ (name), t, view: 'orbit' }, known);
    if (w.ok) { r = w.record; added++; } else left++;
  }
  return { ok: left === 0, why: left ? `${left} could not be added` : '', record: r, added, left };
}
/** The compare bench. A world pinned goes at the end, each world once, and past LIMITS.pins the first pinned goes.
   Pinning a world that is on the bench changes nothing.
   @param {ExoRecord} record @param {string} name @param {Known} known @returns {Write} */
export function pin(record, name, known) {
  if (!isName(name) || !known(name)) return refused(record, UNKNOWN);
  if (record.log.pins.includes(name)) return done(record);
  const r = copy(record);
  r.log.pins = [...r.log.pins, name].slice(-LIMITS.pins);
  return done(r);
}
/** @param {ExoRecord} record @param {string} name @returns {Write} */
export function unpin(record, name) {
  if (!record.log.pins.includes(name)) return done(record);
  const r = copy(record);
  r.log.pins = r.log.pins.filter((n) => n !== name);
  return done(r);
}
/** @param {ExoRecord} record @returns {Write} */
export function clearPins(record) {
  if (!record.log.pins.length) return done(record);
  const r = copy(record);
  r.log.pins = [];
  return done(r);
}
/** The visitor removed the entries the page does not show: the saved worlds, visits and pins whose name the
   catalogue does not have. A visit removed this way is not counted as dropped: the page never counted it.
   @param {ExoRecord} record @param {Known} known @returns {Write} */
export function forget(record, known) {
  const r = copy(record);
  r.log.saved = r.log.saved.filter((e) => known(e.name));
  r.log.visits = r.log.visits.filter((e) => known(e.name));
  r.log.pins = r.log.pins.filter((n) => known(n));
  const same = r.log.saved.length === record.log.saved.length && r.log.visits.length === record.log.visits.length && r.log.pins.length === record.log.pins.length;
  return done(same ? record : r);
}
/** Where the sky was left: its planet, which the sky's catalogue must have, or none; and a place on the globe, or
   none.
   @param {ExoRecord} record @param {{ planet: string | null, place: Place | null }} w @param {Known} known @returns {Write} */
export function setOverdue(record, { planet, place }, known) {
  if (planet !== null && (!isName(planet) || !known(planet))) return refused(record, UNKNOWN);
  const where = placeOf(place);
  if (place !== null && !where) return refused(record, OFF_GLOBE);
  const r = copy(record);
  r.overdue = { planet, place: where };
  return done(r);
}

/* ---------- the catalogue as the survey last saw it ---------- */

/* why the catalogue is not kept as the one last seen */
export const NO_DAY = 'the day is not a date';
export const TOO_LONG = `the catalogue's names come to more than ${grouped(LIMITS.seen)} characters, more than the record keeps`;
/* what the log says when the catalogue no longer fits */
export const LONG_NOTE = `This catalogue's names come to more than the ${grouped(LIMITS.seen)} characters the log keeps of them, so no world is shown as new since an earlier visit.`;
/** The catalogue's names as the record keeps them, joined by bars, names that cannot be a name left out; null when
   they come to more than the bound. @param {unknown} names @returns {string | null} */
const keepable = (names) => { const joined = list(names).filter(isName).join('|'); return joined.length > LIMITS.seen ? null : joined; };
/** The survey saw this catalogue on this day. Names that cannot be a name are left out.
   @param {ExoRecord} record @param {{ day: string, names: unknown }} w @returns {Write} */
export function see(record, { day: on, names }) {
  if (!isIso(on)) return refused(record, NO_DAY);
  const joined = keepable(names);
  if (joined === null) return refused(record, TOO_LONG);
  if (record.seen && record.seen.day === on && record.seen.names === joined) return done(record);
  const r = copy(record);
  r.seen = { day: on, names: joined };
  return done(r);
}
/** The names of the catalogue that the catalogue last seen did not have; none when none was seen before.
   @param {Seen | null} seen @param {string[]} names @returns {string[]} */
export function newSince(seen, names) {
  if (!seen) return [];
  const before = new Set(seen.names.split('|'));
  return names.filter((n) => !before.has(n));
}
/* The key under which the survey kept the catalogue it last saw before version 3, in localStorage. */
export const LEGACY_SEEN = 'exo:seen:v1';
/** That old copy, { date, names }, as the record keeps it, or null.
   @param {Pick<Storage, 'getItem'> | null | undefined} storage @returns {Seen | null} */
export function legacySeen(storage) {
  /** @type {unknown} */
  let v = null;
  try { v = storage ? JSON.parse(String(storage.getItem(LEGACY_SEEN))) : null; } catch { v = null; }
  const o = obj(v);
  return seenOf({ day: o.date, names: list(o.names).filter(isName).join('|') });
}

/* ---------- the rooms read each other ---------- */

/** The sky's address at a line's clock and day, or '' for a line whose clock was never opened on the sky. A page on a
   fixture store (?os-fixture=) passes its fixture, so the sky opens on the same store and not on the visitor's own.
   @param {Visit} e @param {string | null} [fixture] */
export const skyLink = (e, fixture = null) => (e.at ? `exomania.html?planet=${encodeURIComponent(e.name)}&date=${e.at}${fixture ? `&os-fixture=${encodeURIComponent(fixture)}` : ''}` : '');
/** The words of that link. @param {Visit} e */
export const skyWords = (e) => `its clock on ${day(fromIso(e.at))}`;

export const isSaved = (/** @type {ExoRecord} */ record, /** @type {unknown} */ name) => record.log.saved.some((e) => e.name === name);
/* What the visitor has done: worlds visited (those dropped from the list still count), worlds saved. */
export const counts = (/** @type {ExoRecord} */ record) => ({ visited: record.log.visits.length + record.log.dropped, saved: record.log.saved.length });

/* The value of a link's `log` parameter: the saved worlds, newest first, at most LIMITS.shared. */
export const shareValue = (/** @type {ExoRecord} */ record) => record.log.saved.slice(0, LIMITS.shared).map((e) => e.name).join('|');
/** A `log` parameter as it arrives. Only names the catalogue has, each once, at most LIMITS.shared; `refused` counts
   every other piece. A value longer than any real one is cut before it is read.
   @param {unknown} value @param {Known} known @returns {{ names: string[], refused: number }} */
export function readShare(value, known) {
  /** @type {string[]} */
  const names = [];
  let no = 0;
  for (const piece of (typeof value === 'string' ? value.slice(0, 4000) : '').split('|').map((s) => s.trim()).filter(Boolean)) {
    if (names.length < LIMITS.shared && isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;
  }
  return { names, refused: no };
}

/** How the page opened a world, as one of VIAS, or null when it was no visit. `from` is where the page's own code
   says the world came from; `self` is true when the page opened it with no action of the visitor (the world it
   starts on, a tour that moves by itself); `results` is true for a tour that walks a question's list. The sky's way
   is the sky's own: the survey never gives it.
   @param {unknown} from @returns {Via | null} */
export function viaOf(from, { self = false, results = false } = {}) {
  if (self) return null;
  const ways = /** @type {const} */ ({ search: 'search', random: 'random', plot: 'diagram', system: 'system', link: 'link', log: 'log', tour: results ? 'results' : 'tour' });
  return Object.prototype.hasOwnProperty.call(ways, String(from)) ? ways[/** @type {keyof typeof ways} */ (from)] : null;
}

/* ---------- the words that depend on the record ---------- */

/* 1234567 as "1,234,567", whatever the browser's own language. */
export const thousands = (/** @type {number} */ n) => grouped(n);   // the kit's one convention for numbers
export const worlds = (/** @type {number} */ n) => `${thousands(n)} ${n === 1 ? 'world' : 'worlds'}`;
/** The words of the log line. @param {{ visited: number, saved: number }} c */
export const lineWords = (c, shared = 0) => `Log: ${thousands(c.visited)} visited, ${thousands(c.saved)} saved${shared > 0 ? `, ${thousands(shared)} shared with you` : ''}`;
/** How a line of the visits was reached: the way alone for one visit; for more, the count and the way of the last.
   The way of the earlier visits is not kept, so it is not said. @param {{ n: number, via: Via }} e */
export const visitWords = (e) => (e.n > 1 ? `${thousands(e.n)} visits, the last ${VIA_WORDS[e.via]}` : VIA_WORDS[e.via]);
/* Beside the heading of the saved worlds: how many are shown, of the bound, and how many stored are not shown. */
export const savedWords = (/** @type {number} */ shown, notShown = 0) => `${thousands(shown)} of ${LIMITS.saved}${notShown > 0 ? `, and ${thousands(notShown)} not shown` : ''}`;
/** What a press on "Add to log" (add true) or on "In your log" or "Take out" (add false) did.
   @param {string} name @param {boolean} add @param {{ ok: boolean, why: string }} w */
export const toggleWords = (name, add, w) => (w.ok ? `${name} is ${add ? 'in' : 'out of'} your log.` : `${name} was not ${add ? 'added' : 'taken out'}: ${w.why}.`);
/** What "Add all to your log" did. notShown: the saved worlds of the log the page does not show.
   @param {{ added: number, left: number }} did */
export const adoptWords = ({ added, left }, notShown = 0) => (!added && left ? `None could be added: ${fullWhy(notShown)}.`
  : `${added ? `Added ${worlds(added)}.` : 'All of them were in your log already.'}${left ? ` ${worlds(left)} could not be added: ${fullWhy(notShown)}.` : ''}`);
/* What "Remove them from the log" did, with the count of saved worlds and visits it removed. */
export const forgetWords = (/** @type {number} */ n) => (n > 0 ? `Removed ${thousands(n)} ${n === 1 ? 'entry' : 'entries'} that named worlds this catalogue does not have.` : 'There was nothing to remove.');
/** The last words of the log. The log is said to be kept only on a store that keeps it; the usage events are named
   with recording on, and said to be off with recording off. recording null: no store, so no event and no switch.
   @param {{ persistent: boolean, recording: boolean | null }} s */
export const footWords = ({ persistent, recording }) => [
  persistent ? 'The log is kept in this browser.' : '',
  recording === true ? 'A visit and a save are also usage events, which are sent to the labs’ backend only where you have allowed it.'
    : recording === false ? 'With recording off, no usage event is written.' : '',
].filter(Boolean).join(' ');
/** What the worlds shown as new are new since (rule 9): the visitor's last visit when this visit is kept; with
   recording off, the day the catalogue they are counted from was kept.
   @param {{ kept: boolean, since: string | null }} s */
export const sinceWords = ({ kept, since }) => (kept ? 'since your last visit' : `since ${day(fromIso(since))}`);
/** The health check in words: the version this page writes, the version stored, and the sync.
   @param {{ stored: number | null }} h */
export const healthWords = (h) => `This page writes version ${V} of the record, and ${h.stored === null ? 'nothing is stored yet' : `the stored record is version ${thousands(h.stored)}`}. No copy is synced to another device.`;

/* ---------- Labs OS ---------- */

/* why nothing is written to a record of a later version */
export const NEWER = 'this log was written by a newer version of this page';
/** The browser's localStorage, or null where reading it is refused. @returns {Local | null | undefined} */
const local = () => { try { return globalThis.localStorage; } catch { return null; } };
/* Every read and write of the record on a page runs in turn (rule 1): a page that fires two writes without waiting
   (the sky, when two clocks are opened at once) gets both. A job that fails does not stop the ones after it. */
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
/** @template T @param {() => Promise<T>} job @returns {Promise<T>} */
const inTurn = (job) => { const run = queue.then(job); queue = run.catch(() => undefined); return run; };
/** The lab's record as stored, sound, and whether a later version of the page wrote it. A record of an older version
   is upgraded by Labs OS once, on this read (rule 6). `storage`: the browser's localStorage, where the survey kept the
   catalogue it last saw before version 3; that copy is read, and later removed, only for the visitor's own store,
   which keeps what it is given (not a fixture, not memory).
   @param {OS} os @param {Local | null | undefined} storage @returns {Promise<{ record: ExoRecord, newer: boolean }>} */
export function read(os, storage = local()) { return inTurn(() => readNow(os, storage)); }
/** The read itself, for a job already in turn. @param {OS} os @param {Local | null | undefined} storage */
async function readNow(os, storage) {
  const own = os.storage.persistent && !os.storage.fixture;
  let upgraded = false;
  // Labs OS calls migrate only for a record older than V, and every older shape is from before the record kept seen
  const rec = await os.progress.get({ v: V, migrate: (d) => { upgraded = true; return own ? { ...normalise(d), seen: legacySeen(storage) } : normalise(d); } });
  const record = normalise(rec ? rec.data : null);
  // the copy goes once a record of this version, not upgraded by this read, holds the catalogue (rule 6)
  if (own && storage && !upgraded && record.seen) { try { storage.removeItem(LEGACY_SEEN); } catch { /* a store that refuses: the copy stays, read by no page */ } }
  return { record, newer: !!rec && rec.v > V };
}
/** @param {OS} os */
export async function load(os) { return (await read(os)).record; }
/** One change, applied to what the store holds now, in turn with every other read and write of the page.
   `change(record)` is one of the writes above, or several in a row, and returns { ok, why, record }. A change that is
   refused stores nothing and hands back the stored record, even when a first write of it was taken. The store is
   written only when the record changed, and never when a later version wrote it. What comes back is the store's record after the
   change, which the page then shows, and `changed`, which says whether the store was written. `resume` ({ url,
   label }) is where the labs' hub leads back to, written beside an accepted change. Two tabs that write in the same
   instant can still interleave (Labs OS says so of every record); the window is one read and one write.
   @param {OS} os @param {(record: ExoRecord) => Write} change @param {{ resume?: { url: string, label: string } | null }} [opts]
   @returns {Promise<Write & { changed: boolean }>} */
export function update(os, change, { resume = null } = {}) {
  return inTurn(async () => {
    const { record: cur, newer } = await readNow(os, local());
    if (newer) return { ok: false, why: NEWER, record: cur, changed: false };
    const w = change(cur);
    if (!w.ok) return { ok: false, why: w.why, record: cur, changed: false };
    const changed = JSON.stringify(w.record) !== JSON.stringify(cur);
    if (changed) await os.progress.set(w.record, { v: V });
    if (resume) {
      try { await os.progress.setResume(resume.url, resume.label); } catch { /* the hub's way back is not the log: the change is stored */ }
    }
    return { ...w, changed };
  });
}
/** The worlds of this catalogue new since the catalogue the record last kept (rule 9). With `keep` (the survey's
   recording is on) the record then holds this catalogue, seen on `day`, as the one last seen. `kept`: this visit's
   catalogue is now the one kept; `since`: the day of the catalogue counted from, or null when none was kept;
   `long`: the catalogue does not fit the record, and nothing is new.
   @param {OS} os @param {string[]} names @param {{ day: string, keep: boolean }} opts
   @returns {Promise<Write & { changed: boolean, fresh: string[], kept: boolean, since: string | null, long: boolean }>} */
export async function seeCatalogue(os, names, { day: on, keep }) {
  /** @type {Seen | null} */
  let before = null;
  const long = keepable(names) === null;
  const w = await update(os, (r) => { before = r.seen; return keep ? see(r, { day: on, names }) : done(r); });
  const was = /** @type {Seen | null} */ (before);   // set inside the change, which tsc does not follow
  return { ...w, fresh: long ? [] : newSince(was, names), kept: keep && w.ok, since: was ? was.day : null, long };
}
/** The health check: the version this page writes, the version stored (null when nothing is), the store, and the
   sync, which the lab does not have.
   @param {OS} os */
export async function health(os) {
  const rec = await os.progress.get();
  return { version: V, stored: rec ? rec.v : null, store: os.storage.kind, persistent: os.storage.persistent, fixture: os.storage.fixture, synced: false };
}
