/* ============================================================
   The visitor's record of the Exomania lab (record.js). Run from
   the repository root:
     node labs/assets/js/exoplanet/tests/record.test.mjs

   Each rule has a case just inside it and one just outside: the
   200th saved world is taken and the 201st refused; latitude 90
   is a place and 90.1 is none; the 24th name of a shared log is
   read and the 25th counted as refused; the third pin is kept and
   the fourth drops the first. A write that is refused must hand
   back the very record it was given.

   record.mutants.test.mjs breaks each rule in turn and runs this
   file: a rule added here needs an entry there.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  V, LIMITS, KINDS, VIAS, VIA_WORDS, VIEWS, FULL, NEWER, UNKNOWN, OFF_LINE, OFF_GLOBE, NO_DAY, TOO_LONG, LONG_NOTE, LEGACY_SEEN, empty, normalise, view, visit, save, unsave, saveAll, pin, unpin, clearPins, forget, setOverdue,
  see, newSince, legacySeen, skyLink, skyWords, sinceWords, healthWords, seeCatalogue, health,
  isSaved, counts, thousands, worlds, lineWords, visitWords, savedWords, toggleWords, adoptWords, forgetWords, footWords, fullWhy, shareValue, readShare, viaOf, read, load, update,
} from '../record.js';
import { LINE_JD } from '../overdue/clock.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
/* a check that throws is a failed check, with a line that says so, and the run ends there */
const stop = (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* a catalogue of 600 worlds: "w1" to "w600" */
const known = (n) => /^w([1-9]\d{0,2})$/.test(n) && +n.slice(1) <= 600;
const T = 1_800_000_000_000;   // a time in ms
/* a record with worlds w1..wn visited (w1 first, so wn is the newest) and w1..wm saved */
const filled = (nVisits, nSaved = 0) => {
  let r = empty();
  for (let i = 1; i <= nVisits; i++) r = visit(r, { name: `w${i}`, t: T + i, via: 'search' }, known).record;
  for (let i = 1; i <= nSaved; i++) r = save(r, { name: `w${i}`, t: T + i, view: 'orbit' }, known).record;
  return r;
};

/* ---- the shape ---- */
{
  yes('the record is at version 3, and its bounds are 200 saved, 500 visits, 3 pins, 24 shared, a count of dropped visits of a million and 150,000 characters of the catalogue last seen', V === 3 && same(LIMITS, { saved: 200, visits: 500, pins: 3, shared: 24, dropped: 1000000, seen: 150000 }));
  yes('a world is reached in one of nine ways, and each has words: the ninth is the sky\'s', same(VIAS, ['search', 'results', 'tour', 'random', 'diagram', 'system', 'link', 'log', 'sky'])
    && same(VIAS.map((v) => VIA_WORDS[v]), ['by name', 'from a question', 'on a tour', 'at random', 'on the diagram', 'in its system', 'from a link', 'from the log', 'from the sky']));
  yes('the sky\'s line of time runs from 1999-01-01 06:00 to 2040-01-01 12:00 UTC', new Date((LINE_JD.from - 2440587.5) * 86400000).toISOString() === '1999-01-01T06:00:00.000Z'
    && new Date((LINE_JD.to - 2440587.5) * 86400000).toISOString() === '2040-01-01T12:00:00.000Z');
  yes('the four kinds of the record, and where each lives in it', same(KINDS, { configuration: ['overdue', 'log.saved', 'log.pins', 'seen'], observation: ['log.visits', 'log.dropped'], prediction: [], note: [] }));
  yes('a saved world reopens in one of three views', same(VIEWS, ['orbit', 'closeorbit', 'surface']));
  yes('an empty record has its three slices, and two of them share nothing', same(empty(), { overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 }, seen: null }) && empty().log !== empty().log && empty().log.saved !== empty().log.saved
    && empty().log.visits !== empty().log.visits && empty().log.pins !== empty().log.pins && empty().overdue !== empty().overdue);
}

/* ---- what comes out of the store is made sound ---- */
{
  yes('nothing, or something that is no record, is an empty record', [null, undefined, 7, 'x', [], [1, 2]].every((d) => same(normalise(d), empty())));
  const v1 = normalise({ planet: 'w5', place: { lat: 41.4, lon: 2.2, name: 'somewhere' } });
  yes('a record of the first shape becomes the Overdue slice, with an empty log and no catalogue seen', same(v1, { overdue: { planet: 'w5', place: { lat: 41.4, lon: 2.2 } }, log: empty().log, seen: null }));
  yes('a place keeps its latitude and longitude and nothing else', same(Object.keys(v1.overdue.place), ['lat', 'lon']));
  const place = (lat, lon) => normalise({ planet: 'w1', place: { lat, lon } }).overdue.place;
  yes('latitude 90 and longitude 180 are a place; a step outside is none', place(90, 180) !== null && place(-90, -180) !== null && place(90.1, 0) === null && place(-90.1, 0) === null && place(0, 180.1) === null && place(0, -180.1) === null);
  yes('a place with a number missing, or written as text, is none', place(41, undefined) === null && place(41, null) === null && place(41, '2') === null && place(null, 2) === null && place('41', 2) === null && place(NaN, 2) === null);
  yes('a stored planet that is no name is none', [7, '', 'x'.repeat(81), ['w1'], { name: 'w1' }].every((p) => normalise({ planet: p, place: null }).overdue.planet === null) && normalise({ overdue: { planet: ['w1'] } }).overdue.planet === null);
  yes('a name that is a list holding a name is no name', normalise({ log: { saved: [{ name: ['w1'], t: T }], visits: [{ name: ['w1'], t: T, via: 'log' }], pins: [['w1']] } }).log.saved.length === 0 && normalise({ log: { visits: [{ name: ['w1'], t: T, via: 'log' }] } }).log.visits.length === 0
    && !visit(empty(), { name: ['w1'], t: T, via: 'log' }, known).ok && !save(empty(), { name: ['w1'], t: T }, known).ok && !pin(empty(), ['w1'], known).ok);
  yes('a record of the second shape with no Overdue slice has an empty one, and its top level is not read as the first shape', same(normalise({ log: {}, planet: 'w9' }).overdue, { planet: null, place: null }) && same(normalise({ overdue: { planet: 'w3' }, planet: 'w9' }).overdue, { planet: 'w3', place: null }));
  const raw = { overdue: { planet: 'w2', place: null, extra: 1 }, extra: 2, log: {
    saved: [{ name: 'w1', t: T + 1, view: 'surface' }, { name: 'w2', t: T + 3 }, { name: 'w1', t: T + 9 }, { name: '', t: T }, { name: 'w4' }, { name: 'w5', t: 'now' }, { name: 'w6', t: T + 2, view: 'sideways', junk: 1 }, 'w7', null],
    visits: [{ name: 'w1', t: T + 1, via: 'tour', n: 4 }, { name: 'w2', t: T + 5, via: 'teleport' }, { name: 'w3', t: T + 4, via: 'random', n: 0 }, { name: 'w3', t: T + 2, via: 'link', n: 7 }, { name: 'w8', t: NaN, via: 'log' }, { name: 'w9', t: T + 3, via: 'log', n: 2.5 }],
    pins: ['w1', 'w1', 'w2', 3, '', 'w3', 'w4'], dropped: 6, junk: true } };
  const n = normalise(raw);
  yes('saved worlds: entries with no name or no time are left out, each world once with its newest entry, newest first, an unknown view read as orbit, and no field carried that the record does not have',
    same(n.log.saved, [{ name: 'w1', t: T + 9, view: 'orbit' }, { name: 'w2', t: T + 3, view: 'orbit' }, { name: 'w6', t: T + 2, view: 'orbit' }]), JSON.stringify(n.log.saved));
  yes('a saved world keeps the view it was saved in', same(normalise({ log: { saved: [{ name: 'w1', t: T, view: 'surface' }, { name: 'w2', t: T - 1, view: 'closeorbit' }] } }).log.saved.map((e) => e.view), ['surface', 'closeorbit']));
  yes('visits: an entry with a way this page does not have or no time is left out, each world once, newest first, and a count that is not a whole number of one or more is read as one',
    same(n.log.visits, [{ name: 'w3', t: T + 4, via: 'random', n: 1 }, { name: 'w9', t: T + 3, via: 'log', n: 1 }, { name: 'w1', t: T + 1, via: 'tour', n: 4 }]), JSON.stringify(n.log.visits));
  yes('pins: each once, three at most, text only', same(n.log.pins, ['w1', 'w2', 'w3']));
  yes('the Overdue slice and the count of dropped visits are kept, and nothing else at any level', same(n.overdue, { planet: 'w2', place: null }) && n.log.dropped === 6 && same(Object.keys(n), ['overdue', 'log', 'seen']) && same(Object.keys(n.log), ['saved', 'visits', 'pins', 'dropped']));
  yes('a count of dropped visits that is negative, or not a whole number, is read as none', [-1, 1.5, '3', null].every((d) => normalise({ log: { dropped: d } }).log.dropped === 0));
  yes('a name of 80 characters is a name, one of 81 is not', normalise({ log: { saved: [{ name: 'x'.repeat(80), t: T }] } }).log.saved.length === 1 && normalise({ log: { saved: [{ name: 'x'.repeat(81), t: T }] } }).log.saved.length === 0);
  const many = (k) => Array.from({ length: k }, (_, i) => ({ name: `p${i}`, t: T + i, via: 'search' }));
  const cut = normalise({ log: { saved: many(201), visits: many(503), dropped: 2 } });
  yes('a stored list longer than its bound is cut to it, the oldest go, and the visits cut are counted as dropped', cut.log.saved.length === 200 && cut.log.saved[0].name === 'p200' && cut.log.saved[199].name === 'p1'
    && cut.log.visits.length === 500 && cut.log.visits[499].name === 'p3' && cut.log.dropped === 5 && normalise({ log: { visits: many(500), dropped: 2 } }).log.dropped === 2);
  const two = normalise({ log: { saved: [{ name: 'w1', t: T + 1, view: 'surface' }, { name: 'w1', t: T + 9, view: 'closeorbit' }], visits: [{ name: 'w2', t: T + 1, via: 'tour', n: 3 }, { name: 'w2', t: T + 9, via: 'log', n: 5 }] } });
  yes('of two stored entries for one world the newer is the one kept, wherever it stands', same(two.log.saved, [{ name: 'w1', t: T + 9, view: 'closeorbit' }]) && same(two.log.visits, [{ name: 'w2', t: T + 9, via: 'log', n: 5 }]));
  const junk = Array.from({ length: 503 }, (_, i) => (i < 493 ? { name: `p${i}`, t: T + i, via: 'search' } : { name: '', t: T, via: 'search' }));
  yes('stored visits that fail their checks are not counted as dropped', normalise({ log: { visits: junk, dropped: 4 } }).log.dropped === 4 && normalise({ log: { visits: junk, dropped: 4 } }).log.visits.length === 493);
  yes('the count of dropped visits stops at a million, in the store and on a write', normalise({ log: { dropped: 5000000 } }).log.dropped === 1000000 && normalise({ log: { dropped: 1e21 } }).log.dropped === 1000000 && normalise({ log: { dropped: 1000000 } }).log.dropped === 1000000 && normalise({ log: { dropped: 999999 } }).log.dropped === 999999
    && visit({ overdue: empty().overdue, log: { ...filled(500).log, dropped: 1000000 } }, { name: 'w501', t: T + 900, via: 'log' }, known).record.log.dropped === 1000000
    && visit({ overdue: empty().overdue, log: { ...filled(500).log, dropped: 999999 } }, { name: 'w501', t: T + 900, via: 'log' }, known).record.log.dropped === 1000000);
  yes('a stored time without end is no time', normalise({ log: { saved: [{ name: 'w1', t: Infinity }, { name: 'w2', t: T }], visits: [{ name: 'w1', t: Infinity, via: 'log' }, { name: 'w2', t: T, via: 'log' }] } }).log.saved.length === 1
    && normalise({ log: { visits: [{ name: 'w1', t: Infinity, via: 'log' }, { name: 'w2', t: T, via: 'log' }] } }).log.visits.length === 1);
  yes('a stored time of zero or less is no time', normalise({ log: { saved: [{ name: 'w1', t: 0 }, { name: 'w2', t: -5 }, { name: 'w3', t: 1 }], visits: [{ name: 'w1', t: 0, via: 'log' }, { name: 'w2', t: -5, via: 'log' }, { name: 'w3', t: 1, via: 'log' }] } }).log.saved.length === 1
    && normalise({ log: { visits: [{ name: 'w1', t: 0, via: 'log' }, { name: 'w3', t: 1, via: 'log' }] } }).log.visits.length === 1);
  yes('a stored pin of more than 80 characters is no pin', same(normalise({ log: { pins: ['x'.repeat(81), 'x'.repeat(80)] } }).log.pins, ['x'.repeat(80)]));
  yes('a sound record comes back as it went in', same(normalise(n), n) && same(normalise(filled(12, 4)), filled(12, 4)));
}

/* ---- one door: what the page shows of a stored record ---- */
{
  const raw = normalise({ overdue: { planet: 'w9', place: null }, log: { saved: [{ name: 'w1', t: T + 2 }, { name: 'gone a', t: T + 1 }], visits: [{ name: 'gone b', t: T + 3, via: 'log' }, { name: 'w2', t: T + 2, via: 'tour', n: 2 }, { name: 'gone a', t: T + 1, via: 'log' }], pins: ['w1', 'gone a'], dropped: 7 } });
  const v = view(raw, known);
  yes('an entry whose name the catalogue does not have is kept from the page, and counted', same(v.record.log.saved.map((e) => e.name), ['w1']) && same(v.record.log.visits.map((e) => e.name), ['w2']) && same(v.record.log.pins, ['w1']) && v.hidden === 3);
  yes('the hidden entries that are saved worlds are counted apart', v.hiddenSaved === 1 && view(normalise({ log: { visits: [{ name: 'gone', t: T, via: 'log' }] } }), known).hiddenSaved === 0 && view(normalise({ log: { saved: [{ name: 'gone a', t: T }, { name: 'gone b', t: T + 1 }] } }), known).hiddenSaved === 2);
  yes('and it stays in the record', raw.log.saved.length === 2 && raw.log.visits.length === 3 && same(raw.log.pins, ['w1', 'gone a']));
  yes('the counts of dropped visits and the Overdue slice pass through', v.record.log.dropped === 7 && same(v.record.overdue, raw.overdue) && same(counts(v.record), { visited: 8, saved: 1 }));
  yes('a record of catalogue names alone is shown whole, with nothing hidden', same(view(filled(5, 2), known).record, filled(5, 2)) && view(filled(5, 2), known).hidden === 0 && view(empty(), known).hidden === 0 && view(filled(5, 2), known).hiddenSaved === 0);
  yes('a link made from what the page shows carries no name the catalogue lacks', shareValue(v.record) === 'w1');
}

/* ---- how the page opened a world ---- */
{
  yes('each place the page opens a world from has its way', same(['search', 'random', 'plot', 'system', 'link', 'log', 'tour'].map((x) => viaOf(x)), ['search', 'random', 'diagram', 'system', 'link', 'log', 'tour']));
  yes('a tour that walks a question\'s list is "from a question", and no other place is', viaOf('tour', { results: true }) === 'results' && viaOf('search', { results: true }) === 'search' && viaOf('tour', { results: false }) === 'tour');
  yes('a world the page opened by itself is no visit, wherever from', ['search', 'random', 'plot', 'system', 'link', 'log', 'tour'].every((x) => viaOf(x, { self: true }) === null) && viaOf('tour', { self: true, results: true }) === null);
  yes('the world the page starts on, and a place this list does not have, is no visit', viaOf('boot') === null && viaOf('ui') === null && viaOf(undefined) === null && viaOf('constructor') === null);
  yes('every way it gives is one the record takes', ['search', 'random', 'plot', 'system', 'link', 'log', 'tour'].every((x) => VIAS.includes(viaOf(x))) && VIAS.includes(viaOf('tour', { results: true })));
}

/* ---- a visit ---- */
{
  const a = visit(empty(), { name: 'w1', t: T, via: 'search' }, known);
  yes('a visit is written with its time, its way and a count of one', a.ok && a.why === '' && same(a.record.log.visits, [{ name: 'w1', t: T, via: 'search', n: 1 }]));
  const b = visit(visit(a.record, { name: 'w2', t: T + 1, via: 'random' }, known).record, { name: 'w1', t: T + 2, via: 'tour' }, known);
  yes('a world visited again moves to the top with the new time and way, counted twice, and is in the list once', same(b.record.log.visits, [{ name: 'w1', t: T + 2, via: 'tour', n: 2 }, { name: 'w2', t: T + 1, via: 'random', n: 1 }]));
  yes('every way the lab has is taken, the sky\'s with its day', VIAS.every((via) => visit(empty(), { name: 'w1', t: T, via, at: '2026-11-16' }, known).ok));
  const r0 = filled(3);
  const no = [visit(r0, { name: 'w601', t: T, via: 'search' }, known), visit(r0, { name: 'zzz', t: T, via: 'search' }, known), visit(r0, { name: '', t: T, via: 'search' }, known), visit(r0, { name: 5, t: T, via: 'search' }, known),
    visit(r0, { name: 'w1', t: NaN, via: 'search' }, known), visit(r0, { name: 'w1', t: '5', via: 'search' }, known), visit(r0, { name: 'w1', t: 0, via: 'search' }, known), visit(r0, { name: 'w1', t: -1, via: 'search' }, known), visit(r0, { name: 'w1', t: T, via: 'teleport' }, known), visit(r0, { name: 'w1', t: T }, known), visit(r0, { name: 'w1', t: Infinity, via: 'search' }, known)];
  yes('a world that is not in the catalogue, a time that is not a number and a way the page does not have are refused, and the record handed back is the one given', no.every((w) => !w.ok && w.record === r0 && w.why.length > 10));
  yes('each refusal says which of the three it was', no[0].why === 'that world is not in the catalogue' && no[0].why === UNKNOWN && no[4].why === 'the time is not a number' && no[6].why === 'the time is not a number' && no[10].why === 'the time is not a number' && no[8].why === 'the way the world was reached is not one this page has');
  yes('a write does not change the record it was given', same(r0, filled(3)) && visit(r0, { name: 'w9', t: T, via: 'log' }, known).record !== r0 && visit(r0, { name: 'w9', t: T, via: 'log' }, known).record.log.visits !== r0.log.visits);
  const full = filled(500), over = visit(full, { name: 'w501', t: T + 501, via: 'diagram' }, known), again = visit(over.record, { name: 'w2', t: T + 502, via: 'log' }, known);
  yes('the 500th world is listed and nothing is dropped; the 501st drops the oldest and counts it', full.log.visits.length === 500 && full.log.dropped === 0 && over.record.log.visits.length === 500 && over.record.log.dropped === 1
    && over.record.log.visits[0].name === 'w501' && !over.record.log.visits.some((e) => e.name === 'w1') && over.record.log.visits[499].name === 'w2');
  yes('a world already in a full list moves to the top and drops nothing', again.record.log.visits.length === 500 && again.record.log.dropped === 1 && again.record.log.visits[0].name === 'w2' && again.record.log.visits[0].n === 2);
  yes('the count of worlds visited includes the ones dropped from the list', counts(over.record).visited === 501 && counts(full).visited === 500 && counts(empty()).visited === 0);
  // a full list that holds lines the page does not show
  const lines = (names) => normalise({ log: { visits: names.map((name, i) => ({ name, t: T + names.length - i, via: 'search' })) } });
  const knownNames = (k) => Array.from({ length: k }, (_, i) => `w${i + 1}`);
  const oldestHidden = lines([...knownNames(499), 'gone a']), shownBefore = counts(view(oldestHidden, known).record).visited;
  const h1 = visit(oldestHidden, { name: 'w600', t: T + 900, via: 'log' }, known);
  yes('past the bound a line the page does not show goes first and is not counted as dropped, so "visited" goes up by one', h1.ok && h1.record.log.visits.length === 500 && h1.record.log.dropped === 0 && !h1.record.log.visits.some((e) => e.name === 'gone a')
    && counts(view(h1.record, known).record).visited === shownBefore + 1, `${shownBefore} then ${counts(view(h1.record, known).record).visited}, dropped ${h1.record.log.dropped}`);
  const midHidden = lines([...knownNames(250), 'gone a', ...knownNames(499).slice(250)]);
  const h2 = visit(midHidden, { name: 'w600', t: T + 900, via: 'log' }, known);
  yes('a hidden line goes before the oldest line the page shows, wherever it stands', h2.record.log.visits.length === 500 && h2.record.log.dropped === 0 && !h2.record.log.visits.some((e) => e.name === 'gone a') && h2.record.log.visits[499].name === 'w499');
  const twoHidden = lines([...knownNames(249), 'gone a', ...knownNames(498).slice(249), 'gone b']);
  const h3 = visit(twoHidden, { name: 'w600', t: T + 900, via: 'log' }, known);
  yes('of two hidden lines the older goes first', h3.record.log.visits.length === 500 && h3.record.log.visits.some((e) => e.name === 'gone a') && !h3.record.log.visits.some((e) => e.name === 'gone b') && h3.record.log.dropped === 0);
  const underHidden = lines([...knownNames(498), 'gone a']), h4 = visit(underHidden, { name: 'w600', t: T + 900, via: 'log' }, known);
  yes('a list under its bound keeps its hidden lines', h4.record.log.visits.length === 500 && h4.record.log.visits.some((e) => e.name === 'gone a') && h4.record.log.dropped === 0);
}

/* ---- saving ---- */
{
  const a = save(empty(), { name: 'w1', t: T, view: 'surface' }, known);
  yes('a saved world is written with its time and the view it was in', a.ok && same(a.record.log.saved, [{ name: 'w1', t: T, view: 'surface' }]) && isSaved(a.record, 'w1') && !isSaved(a.record, 'w2') && !isSaved(empty(), 'w1'));
  yes('a view the page does not have, or none, is saved as orbit', save(empty(), { name: 'w1', t: T, view: 'sideways' }, known).record.log.saved[0].view === 'orbit' && save(empty(), { name: 'w1', t: T }, known).record.log.saved[0].view === 'orbit');
  const b = save(a.record, { name: 'w2', t: T + 1, view: 'orbit' }, known), twice = save(b.record, { name: 'w1', t: T + 9, view: 'orbit' }, known);
  yes('the newest saved world is first, and saving a world twice changes nothing', same(b.record.log.saved.map((e) => e.name), ['w2', 'w1']) && twice.ok && twice.record === b.record);
  yes('a world that is not in the catalogue and a time that is not a number are refused', [save(a.record, { name: 'w601', t: T }, known), save(a.record, { name: 'w3', t: NaN }, known), save(a.record, { name: '', t: T }, known)].every((w) => !w.ok && w.record === a.record)
    && save(a.record, { name: 'w601', t: T }, known).why === 'that world is not in the catalogue' && save(a.record, { name: 'w3', t: NaN }, known).why === 'the time is not a number');
  const full = filled(0, 200), over = save(full, { name: 'w201', t: T + 201 }, known), had = save(full, { name: 'w7', t: T + 300 }, known);
  yes('the 200th world is saved and the 201st is refused, with the reason and the way out', counts(full).saved === 200 && save(filled(0, 199), { name: 'w200', t: T }, known).ok && !over.ok && over.record === full
    && over.why === 'the log holds 200 saved worlds, which is all it takes; take one out first' && over.why === FULL);
  yes('a world already in a full log is not refused', had.ok && had.record === full);
  // saved worlds the page does not show count against the bound, and the refusal names them
  const stored = (hidden, shown) => normalise({ log: { saved: [...Array.from({ length: hidden }, (_, i) => ({ name: `gone ${i}`, t: T + 900 - i })), ...Array.from({ length: shown }, (_, i) => ({ name: `w${i + 1}`, t: T + i }))] } });
  const h2 = save(stored(2, 198), { name: 'w300', t: T + 999 }, known), h1 = save(stored(1, 199), { name: 'w300', t: T + 999 }, known), room = save(stored(2, 197), { name: 'w300', t: T + 999 }, known);
  yes('a log of 200 with 2 not shown refuses, and says that 2 of them are not shown and where to remove them', !h2.ok && h2.why === `${FULL}. 2 of them are not shown; remove them in the log` && h2.record.log.saved.length === 200, h2.why);
  yes('with 1 not shown it says it of one', !h1.ok && h1.why === `${FULL}. 1 of them is not shown; remove it in the log`, h1.why);
  yes('a log of 199 with 2 not shown still takes one', room.ok && room.record.log.saved.length === 200);
  yes('the reason for a full log names the hidden saved worlds only when there are some', fullWhy(0) === FULL && fullWhy() === FULL && fullWhy(1) === `${FULL}. 1 of them is not shown; remove it in the log` && fullWhy(2) === `${FULL}. 2 of them are not shown; remove them in the log` && fullWhy(1200) === `${FULL}. 1,200 of them are not shown; remove them in the log`);
  const out = unsave(b.record, 'w2');
  yes('a world taken out is gone, the others stay, and taking out a world that is not there changes nothing', out.ok && same(out.record.log.saved.map((e) => e.name), ['w1']) && unsave(b.record, 'w9').record === b.record && same(b.record.log.saved.length, 2));
  const all = saveAll(a.record, ['w1', 'w3', 'w4', 'w601', 'w3'], T + 5, known);
  yes('saving several: those already saved are passed over, those not in the catalogue are counted as left, the rest are added once', all.added === 2 && all.left === 1 && !all.ok && all.why === '1 could not be added' && same(all.record.log.saved.map((e) => e.name), ['w4', 'w3', 'w1']) && all.record.log.saved[0].t === T + 5 && all.record.log.saved[0].view === 'orbit' && all.record.log.saved[1].view === 'orbit');
  const fit = saveAll(a.record, ['w5', 'w6'], T + 5, known), near = saveAll(filled(0, 199), ['w300', 'w301', 'w302'], T + 999, known);
  yes('saving several with room for all is whole; with room for one, one is added and two are left', fit.ok && fit.why === '' && fit.added === 2 && fit.left === 0 && near.added === 1 && near.left === 2 && counts(near.record).saved === 200);
  yes('saving nothing, or something that is no list, adds nothing', saveAll(a.record, [], T, known).record === a.record && [saveAll(a.record, 'w5', T, known), saveAll(a.record, null, T, known), saveAll(a.record, 5, T, known)].every((w) => w.added === 0 && w.left === 0 && w.ok && w.record === a.record));
}

/* ---- the compare bench ---- */
{
  const p1 = pin(empty(), 'w1', known), p2 = pin(p1.record, 'w2', known), p3 = pin(p2.record, 'w3', known), p4 = pin(p3.record, 'w4', known);
  yes('a world pinned goes at the end of the bench', p1.ok && p1.why === '' && same(p1.record.log.pins, ['w1']) && same(p2.record.log.pins, ['w1', 'w2']));
  yes('the third pin is kept with the first two; the fourth drops the first', same(p3.record.log.pins, ['w1', 'w2', 'w3']) && same(p4.record.log.pins, ['w2', 'w3', 'w4']));
  const again = pin(p2.record, 'w1', known);
  yes('pinning a world that is on the bench changes nothing', again.ok && again.record === p2.record);
  const no = [pin(p2.record, 'w601', known), pin(p2.record, '', known), pin(p2.record, ['w3'], known), pin(p2.record, 7, known), pin(p2.record, 'zzz', known)];
  yes('a pin of what is not a world of the catalogue is refused with the reason, and the record handed back is the one given', no.every((w) => !w.ok && w.record === p2.record && w.why === UNKNOWN));
  const u = unpin(p3.record, 'w2');
  yes('a world unpinned leaves the bench and the others stay in their order', u.ok && same(u.record.log.pins, ['w1', 'w3']));
  yes('unpinning a world that is not on the bench changes nothing', unpin(p3.record, 'w9').ok && unpin(p3.record, 'w9').record === p3.record);
  const c = clearPins(p3.record);
  yes('"Unpin all" empties the bench, and on an empty bench changes nothing', c.ok && same(c.record.log.pins, []) && clearPins(c.record).ok && clearPins(c.record).record === c.record && clearPins(empty()).record.log.pins.length === 0);
  yes('a change of the bench does not change the record it was given', same(p2.record.log.pins, ['w1', 'w2']) && same(p3.record.log.pins, ['w1', 'w2', 'w3']));
  const r = setOverdue(filled(3, 2), { planet: 'w9', place: { lat: 1, lon: 2 } }, known).record;
  yes('a change of the bench touches nothing else of the record', [pin(r, 'w5', known), unpin(pin(r, 'w5', known).record, 'w5'), clearPins(pin(r, 'w5', known).record)].every((w) => same(w.record.overdue, r.overdue) && same(w.record.log.saved, r.log.saved) && same(w.record.log.visits, r.log.visits) && w.record.log.dropped === r.log.dropped));
}

/* ---- removing what the page does not show ---- */
{
  const raw = normalise({ overdue: { planet: 'w9', place: null }, log: { saved: [{ name: 'w1', t: T + 2 }, { name: 'gone a', t: T + 1 }], visits: [{ name: 'gone b', t: T + 3, via: 'log' }, { name: 'w2', t: T + 2, via: 'tour', n: 2 }], pins: ['w1', 'gone a'], dropped: 7 } });
  const f = forget(raw, known);
  yes('"Remove them from the log" takes out the saved worlds, visits and pins the catalogue does not have, and keeps the rest', f.ok && same(f.record.log.saved.map((e) => e.name), ['w1']) && same(f.record.log.visits.map((e) => e.name), ['w2']) && same(f.record.log.pins, ['w1']));
  yes('a visit removed this way is not counted as dropped, and the Overdue slice is kept', f.record.log.dropped === 7 && same(f.record.overdue, raw.overdue) && counts(f.record).visited === 8);
  yes('it does not change the record it was given, and with nothing hidden it changes nothing', raw.log.saved.length === 2 && raw.log.visits.length === 2 && raw.log.pins.length === 2 && same(forget(filled(3, 2), known).record, filled(3, 2)));
  const f0 = filled(3, 2);
  yes('with nothing hidden the record handed back is the one given', forget(f0, known).record === f0);
  yes('each of the three lists is cleaned on its own', same(forget(normalise({ log: { saved: [{ name: 'gone', t: T }] } }), known).record.log.saved, []) && same(forget(normalise({ log: { visits: [{ name: 'gone', t: T, via: 'log' }] } }), known).record.log.visits, [])
    && same(forget(normalise({ log: { pins: ['gone'] } }), known).record.log.pins, []));
}

/* ---- the Overdue slice ---- */
{
  const o = setOverdue(filled(2, 1), { planet: 'w9', place: { lat: 10, lon: 20, more: 1 } }, known);
  yes('the Overdue slice is written without touching the log', o.ok && same(o.record.overdue, { planet: 'w9', place: { lat: 10, lon: 20 } }) && same(o.record.log, filled(2, 1).log));
  const before = filled(2, 1), snap = JSON.stringify(before);
  setOverdue(before, { planet: 'w9', place: { lat: 1, lon: 2 } }, known);
  yes('writing the Overdue slice does not change the record it was given', JSON.stringify(before) === snap);
  const sky0 = filled(2, 1);
  const offSky = [setOverdue(sky0, { planet: 7, place: null }, known), setOverdue(sky0, { planet: '', place: null }, known), setOverdue(sky0, { planet: 'w601', place: null }, known), setOverdue(sky0, { planet: 'x'.repeat(81), place: null }, known), setOverdue(sky0, { planet: ['w1'], place: null }, known)];
  yes('a planet the sky\'s catalogue does not have, or that is no name, is refused with the reason, and the record handed back is the one given', offSky.every((w) => !w.ok && w.why === UNKNOWN && w.record === sky0));
  const offGlobe = [{ lat: 91, lon: 0 }, { lat: -90.1, lon: 0 }, { lat: 0, lon: 180.1 }, { lat: 0, lon: -181 }, { lat: '41', lon: 2 }, { lat: 41 }, 'Barcelona', undefined].map((place) => setOverdue(sky0, { planet: 'w1', place }, known));
  yes('a place off the globe, or that is no place, is refused with the reason', offGlobe.every((w) => !w.ok && w.why === OFF_GLOBE && w.why === 'the place is not on the globe' && w.record === sky0));
  yes('no planet and no place are taken as none, and the edges of the globe are on it', same(setOverdue(empty(), { planet: null, place: null }, known).record.overdue, { planet: null, place: null }) && setOverdue(empty(), { planet: null, place: null }, known).ok
    && same(setOverdue(empty(), { planet: 'w1', place: { lat: 90, lon: -180 } }, known).record.overdue.place, { lat: 90, lon: -180 }) && setOverdue(empty(), { planet: 'w1', place: { lat: -90, lon: 180 } }, known).ok);
  yes('a record that comes out of a write shares no part with the one that went in', visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.overdue.place !== o.record.overdue.place && visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.log.saved[0] !== o.record.log.saved[0]
    && save(o.record, { name: 'w3', t: T }, known).record.log.visits[0] !== o.record.log.visits[0] && pin(o.record, 'w1', known).record.log.saved !== o.record.log.saved);
  yes('a write to the log does not touch the Overdue slice', same(visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.overdue, o.record.overdue) && same(save(o.record, { name: 'w3', t: T }, known).record.overdue, o.record.overdue) && same(pin(o.record, 'w1', known).record.overdue, o.record.overdue)
    && same(forget(o.record, known).record.overdue, o.record.overdue));
}

/* ---- what the page prints ---- */
{
  yes('the log line counts the worlds visited and saved', lineWords({ visited: 12, saved: 3 }) === 'Log: 12 visited, 3 saved' && lineWords({ visited: 0, saved: 0 }) === 'Log: 0 visited, 0 saved');
  yes('thousands are marked the same way in every browser', same([0, 7, 999, 1000, 12345, 1234567].map(thousands), ['0', '7', '999', '1,000', '12,345', '1,234,567']));
  yes('one shared world is named on the line, and none is not', lineWords({ visited: 2, saved: 1 }, 1) === 'Log: 2 visited, 1 saved, 1 shared with you' && lineWords({ visited: 2, saved: 1 }, -1) === 'Log: 2 visited, 1 saved');
  yes('thousands are marked, and a shared log is named when there is one', lineWords({ visited: 1234, saved: 200 }) === 'Log: 1,234 visited, 200 saved' && lineWords({ visited: 2, saved: 1 }, 5) === 'Log: 2 visited, 1 saved, 5 shared with you' && lineWords({ visited: 2, saved: 1 }, 0) === 'Log: 2 visited, 1 saved');
  yes('the counts are of the record', same(counts(filled(7, 3)), { visited: 7, saved: 3 }));
  yes('one world, and more', worlds(0) === '0 worlds' && worlds(1) === '1 world' && worlds(2) === '2 worlds' && worlds(1000) === '1,000 worlds');
  yes('a world visited once is said with the way alone', visitWords({ n: 1, via: 'link' }) === 'from a link' && visitWords({ n: 1, via: 'search' }) === 'by name');
  yes('a world visited more than once is said with the count and the way of the last visit, since the earlier ways are not kept', visitWords({ n: 2, via: 'link' }) === '2 visits, the last from a link' && visitWords({ n: 3, via: 'random' }) === '3 visits, the last at random' && visitWords({ n: 1234, via: 'log' }) === '1,234 visits, the last from the log');
  yes('the saved heading says how many are shown of the bound, and how many stored are not shown when there are some', savedWords(198, 2) === '198 of 200, and 2 not shown' && savedWords(200, 0) === '200 of 200' && savedWords(5) === '5 of 200' && savedWords(5, 1) === '5 of 200, and 1 not shown' && savedWords(1, 1200) === '1 of 200, and 1,200 not shown');
  yes('a press that went through says where the world is now', toggleWords('Kepler-4 b', true, { ok: true, why: '' }) === 'Kepler-4 b is in your log.' && toggleWords('Kepler-4 b', false, { ok: true, why: '' }) === 'Kepler-4 b is out of your log.');
  yes('a press that was refused says what was not done and why', toggleWords('Kepler-4 b', true, { ok: false, why: FULL }) === `Kepler-4 b was not added: ${FULL}.` && toggleWords('Kepler-4 b', false, { ok: false, why: NEWER }) === `Kepler-4 b was not taken out: ${NEWER}.`);
  yes('"Add all" says what it added, what was there, and what the bound left out', adoptWords({ added: 2, left: 0 }) === 'Added 2 worlds.' && adoptWords({ added: 0, left: 0 }) === 'All of them were in your log already.'
    && adoptWords({ added: 1, left: 1 }) === `Added 1 world. 1 world could not be added: ${FULL}.` && adoptWords({ added: 0, left: 2 }) === `None could be added: ${FULL}.`);
  yes('and names the saved worlds the page does not show when the bound left some out', adoptWords({ added: 0, left: 2 }, 3) === `None could be added: ${fullWhy(3)}.` && adoptWords({ added: 1, left: 1 }, 1) === `Added 1 world. 1 world could not be added: ${fullWhy(1)}.` && adoptWords({ added: 2, left: 0 }, 3) === 'Added 2 worlds.');
  yes('"Remove them" says how many it removed', forgetWords(3) === 'Removed 3 entries that named worlds this catalogue does not have.' && forgetWords(1) === 'Removed 1 entry that named worlds this catalogue does not have.' && forgetWords(1000) === 'Removed 1,000 entries that named worlds this catalogue does not have.' && forgetWords(0) === 'There was nothing to remove.');
  const USE = 'A visit and a save are also usage events, which are sent to the labs’ backend only where you have allowed it.';
  yes('the footer says the log is kept in this browser only on a store that keeps it', footWords({ persistent: true, recording: true }) === `The log is kept in this browser. ${USE}` && footWords({ persistent: false, recording: true }) === USE);
  yes('with recording off the footer says no usage event is written, and does not name them', footWords({ persistent: true, recording: false }) === 'The log is kept in this browser. With recording off, no usage event is written.' && footWords({ persistent: false, recording: false }) === 'With recording off, no usage event is written.');
  yes('with no store at all the footer says nothing of a store or of events', footWords({ persistent: false, recording: null }) === '');
}

/* ---- a log in a link ---- */
{
  const r = filled(0, 30);
  yes('the link carries the saved worlds, newest first, 24 at most', shareValue(filled(0, 3)) === 'w3|w2|w1' && shareValue(r).split('|').length === 24 && shareValue(r).startsWith('w30|w29|') && shareValue(r).endsWith('|w7') && shareValue(empty()) === '');
  yes('read at the door: the names the catalogue has, each once, in order', same(readShare('w3|w2|w1', known), { names: ['w3', 'w2', 'w1'], refused: 0 }) && same(readShare(' w3 | w2 ', known), { names: ['w3', 'w2'], refused: 0 }));
  yes('a name the catalogue does not have, and a name given twice, are counted as refused', same(readShare('w3|nope|w3|w601|w4', known), { names: ['w3', 'w4'], refused: 3 }));
  const k = (n) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join('|');
  yes('the 24th name is read and the 25th is refused', readShare(k(24), known).names.length === 24 && readShare(k(24), known).refused === 0 && readShare(k(25), known).names.length === 24 && readShare(k(25), known).refused === 1 && readShare(k(25), known).names[23] === 'w24');
  yes('nothing, an empty value, bars alone or a value that is not text is no log', [undefined, null, '', '|||', 42, ['w1']].every((v) => same(readShare(v, known), { names: [], refused: 0 })));
  yes('markup in a link is a name the catalogue does not have', same(readShare('<img src=x onerror=alert(1)>|w1', known), { names: ['w1'], refused: 1 }));
  yes('a value far longer than any log is cut before it is read', same(readShare(('w1|').repeat(1400) + 'w2', known).names, ['w1']) && same(readShare(('w1|').repeat(1300) + 'w2', known).names, ['w1', 'w2']) && readShare('x'.repeat(3998) + '|w2', known).names.length === 0 && readShare('x'.repeat(3996) + '|w2', known).names[0] === 'w2');
  const real = ['PSR B1257+12 c', "Teegarden's Star b", 'Kepler-442 b', 'HD 219134 b'];
  const viaUrl = new URLSearchParams(new URLSearchParams({ log: real.join('|') }).toString()).get('log');
  yes('names with a plus sign, a space and an apostrophe come back whole from a link', same(readShare(viaUrl, (n) => real.includes(n)).names, real));
  const names = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  const all = (Array.isArray(names) ? names : names.rows || names.planets || names.list || Object.values(names).find(Array.isArray) || []).map((p) => (Array.isArray(p) ? p[0] : p.pl_name || p.name)).filter((n) => typeof n === 'string');
  yes('every planet of the catalogue can be saved and shared: no name has a bar in it, and none is longer than 80 characters', all.length > 6000 && all.every((n) => !n.includes('|') && n.length <= 80 && n.trim() === n), `${all.length} names, longest ${Math.max(0, ...all.map((n) => n.length))}`);
}

/* ---- Labs OS: a write is one change to what the store holds at that moment ---- */
{
  const fake = (start, storage = { kind: 'memory', persistent: false, fixture: null }) => { let rec = start; const calls = []; return { calls, storage, get rec() { return rec; }, wipe() { rec = null; }, progress: {
    get: async (o) => { calls.push(['get', o && o.v]); if (rec && o && o.migrate && rec.v < o.v) rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(o.migrate(rec.data, rec.v))) }; return rec; },
    set: async (data, o) => { calls.push(['set', o && o.v]); rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(data)) }; return rec; },
    setResume: async (url, label) => { calls.push(['resume', url]); rec = { ...(rec || { v: 1, data: null }), resume: { url, label } }; return rec; } } }; };
  const sets = (os) => os.calls.filter((c) => c[0] === 'set').length;
  const resumes = (os) => os.calls.filter((c) => c[0] === 'resume').length;
  yes('with nothing stored, the record that loads is empty', same(await load(fake(null)), empty()) && (await read(fake(null))).newer === false);
  const old = fake({ v: 1, data: { planet: 'w5', place: { lat: 1, lon: 2 } } });
  const up = await load(old);
  yes('a stored record of the first shape loads as the Overdue slice and is asked for at version 3', same(up.overdue, { planet: 'w5', place: { lat: 1, lon: 2 } }) && same(up.log, empty().log) && same(old.calls[0], ['get', 3]) && old.rec.v === 3);

  const os = fake({ v: 3, data: setOverdue(empty(), { planet: 'w5', place: { lat: 1, lon: 2 } }, known).record });
  const a = await update(os, (r) => visit(r, { name: 'w1', t: T, via: 'search' }, known));
  yes('a change is applied to the stored record and written at version 3, and what comes back is what is stored', a.ok && a.why === '' && same(a.record, os.rec.data) && a.record.log.visits.length === 1 && same(a.record.overdue, { planet: 'w5', place: { lat: 1, lon: 2 } }) && os.rec.v === 3 && same(os.calls.at(-1), ['set', 3]));
  yes('a change the store made is said to be one', a.changed === true);
  const n0 = sets(os);
  const no = await update(os, (r) => visit(r, { name: 'not a planet', t: T, via: 'search' }, known));
  yes('a change that is refused writes nothing, is no change, and hands back the stored record with the reason', !no.ok && no.why === 'that world is not in the catalogue' && sets(os) === n0 && same(no.record, os.rec.data) && no.changed === false);
  const same1 = await update(os, (r) => unsave(r, 'w9'));
  yes('a change that changes nothing writes nothing, and is said to be none', same1.ok && sets(os) === n0 && same(same1.record, os.rec.data) && same1.changed === false);
  const twice = await update(os, (r) => save(r, { name: 'w1', t: T + 1 }, known)), twice2 = await update(os, (r) => save(r, { name: 'w1', t: T + 2 }, known));
  yes('a second save of the same world is no change, so a page tracks one save', twice.ok && twice.changed === true && twice2.ok && twice2.changed === false && sets(os) === n0 + 1);
  const eq = await update(os, (r) => setOverdue(r, { planet: 'w5', place: { lat: 1, lon: 2 } }, known));
  yes('a change that makes a new record equal to the stored one writes nothing and is no change', eq.ok && eq.changed === false && sets(os) === n0 + 1);

  // another tab saved a world after this page read the record
  const pageCopy = JSON.parse(JSON.stringify(os.rec.data));
  await os.progress.set(save(os.rec.data, { name: 'w7', t: T + 5 }, known).record, { v: 3 });
  const b = await update(os, (r) => visit(r, { name: 'w2', t: T + 6, via: 'random' }, known));
  yes('a save made in another tab since this page read the record is kept by this page\'s next write', isSaved(b.record, 'w7') && isSaved(os.rec.data, 'w7') && !isSaved(pageCopy, 'w7') && b.record.log.visits.length === 2);
  // two tabs pin: the second pin joins the first
  const pa = await update(os, (r) => pin(r, 'w3', known)), pb = await update(os, (r) => pin(r, 'w4', known));
  yes('a pin made in another tab is kept by this page\'s next pin', same(pa.record.log.pins, ['w3']) && same(pb.record.log.pins, ['w3', 'w4']) && same(os.rec.data.log.pins, ['w3', 'w4']));
  // the privacy page erased everything in another tab
  os.wipe();
  const c = await update(os, (r) => visit(r, { name: 'w3', t: T + 7, via: 'random' }, known));
  yes('after an erase made elsewhere the next write holds that one change and nothing of what was erased', same(c.record.log.visits.map((e) => e.name), ['w3']) && c.record.log.saved.length === 0 && c.record.log.pins.length === 0 && c.record.overdue.planet === null && same(os.rec.data, c.record));
  os.wipe();
  const cp = await update(os, (r) => pin(r, 'w5', known));
  yes('after an erase made elsewhere the next pin holds that one pin', same(cp.record.log.pins, ['w5']) && cp.record.log.visits.length === 0);
  // the two pages of the lab
  const d = await update(os, (r) => setOverdue(r, { planet: 'w8', place: null }, known));
  const e = await update(os, (r) => save(r, { name: 'w4', t: T + 8, view: 'surface' }, known));
  yes('Overdue\'s change leaves the log, and the survey\'s change leaves Overdue\'s slice', same(d.record.log, cp.record.log) && d.record.overdue.planet === 'w8' && e.record.overdue.planet === 'w8' && isSaved(e.record, 'w4'));
  const bad = fake({ v: 3, data: { log: { saved: [{ name: 'w1', t: T }, { name: 'w1', t: T + 1 }, { name: '', t: T }] } } });
  const f = await update(bad, (r) => visit(r, { name: 'w2', t: T + 2, via: 'log' }, known));
  yes('the stored record is made sound before a change is applied to it', same(f.record.log.saved, [{ name: 'w1', t: T + 1, view: 'orbit' }]) && same(bad.rec.data.log.saved, [{ name: 'w1', t: T + 1, view: 'orbit' }]));
  let threw = '';
  const broken = { storage: { persistent: false, fixture: null }, progress: { get: async () => null, set: async () => { throw new Error('quota'); }, setResume: async () => null } };
  try { await update(broken, (r) => visit(r, { name: 'w1', t: T, via: 'log' }, known)); } catch (err) { threw = err.message; }
  yes('a write the store refuses is an error the page hears of', threw === 'quota');

  // where the hub leads back to
  const rs = fake({ v: 3, data: empty() }), where = { url: 'exomania-survey.html?p=w1', label: 'w1' };
  await update(rs, (r) => visit(r, { name: 'w1', t: T, via: 'log' }, known), { resume: where });
  yes('an accepted change writes the way back beside it, after the record', resumes(rs) === 1 && same(rs.rec.resume, where) && same(rs.calls.slice(-2).map((x) => x[0]), ['set', 'resume']));
  await update(rs, (r) => visit(r, { name: 'nope', t: T, via: 'log' }, known), { resume: { url: 'x', label: 'x' } });
  yes('a refused change writes no way back', resumes(rs) === 1 && rs.rec.resume.url === where.url);
  await update(rs, (r) => setOverdue(r, { planet: null, place: null }, known), { resume: { url: 'exomania.html?planet=w1', label: 'w1' } });
  yes('an accepted change that changed nothing still writes the way back: the visitor chose that world now', resumes(rs) === 2 && rs.rec.resume.url === 'exomania.html?planet=w1');
  await update(rs, (r) => visit(r, { name: 'w2', t: T + 1, via: 'log' }, known));
  yes('a change with no way back given writes none', resumes(rs) === 2);
  const lost = { calls: [], storage: { persistent: false, fixture: null }, progress: { get: async () => null, set: async () => null, setResume: async () => { throw new Error('the hub is gone'); } } };
  let lostErr = '', lostW = null;
  try { lostW = await update(lost, (r) => visit(r, { name: 'w1', t: T, via: 'log' }, known), { resume: where }); } catch (err) { lostErr = err.message; }
  yes('a way back the store refuses does not make the stored change a failure', lostErr === '' && !!lostW && lostW.ok && lostW.changed === true);

  // a record of a later version
  const later = { overdue: { planet: 'w5', place: null, tz: 'Europe/Madrid' }, log: { saved: [{ name: 'w1', t: T, view: 'orbit', note: 'kept by a later page' }], visits: [], pins: [], dropped: 0, tags: { w1: ['hot'] } }, notes: { a: 1 } };
  const nw = fake({ v: 4, data: JSON.parse(JSON.stringify(later)) });
  const rd = await read(nw);
  yes('a record of a later version is read for display, as far as this version reads it, and said to be newer', rd.newer === true && same(rd.record.log.saved.map((x) => x.name), ['w1']) && rd.record.overdue.planet === 'w5' && same(await load(nw), rd.record));
  const nv = await update(nw, (r) => visit(r, { name: 'w2', t: T, via: 'log' }, known), { resume: where }), no2 = await update(nw, (r) => setOverdue(r, { planet: 'w6', place: null }, known));
  yes('a record of a later version is never written: no change, the reason, the record as read, and no way back', !nv.ok && nv.why === NEWER && nv.changed === false && same(nv.record, rd.record) && !no2.ok && no2.why === NEWER
    && sets(nw) === 0 && resumes(nw) === 0 && nw.rec.v === 4 && same(nw.rec.data, later));
  yes('why a later version\'s record is not written', NEWER === 'this log was written by a newer version of this page');
  const at2 = fake({ v: 3, data: empty() });
  yes('a record of this version is not newer, and one of the first shape is not newer once read', (await read(at2)).newer === false && (await read(fake({ v: 1, data: { planet: 'w5' } }))).newer === false && (await update(at2, (r) => pin(r, 'w1', known))).changed === true);
}

/* ---- version 3: a clock opened on the sky is a visit, with the day the sky was at ---- */
{
  const s = visit(empty(), { name: 'w1', t: T, via: 'sky', at: '2031-03-12' }, known);
  yes('a visit from the sky is written with its way and the day the sky was at', s.ok && same(s.record.log.visits, [{ name: 'w1', t: T, via: 'sky', n: 1, at: '2031-03-12' }]));
  const later = visit(s.record, { name: 'w1', t: T + 1, via: 'search' }, known), again = visit(later.record, { name: 'w1', t: T + 2, via: 'sky', at: '2001-06-30' }, known);
  yes('a later visit of another way keeps the line\'s day on the sky, and a later visit from the sky moves it', same(later.record.log.visits[0], { name: 'w1', t: T + 1, via: 'search', n: 2, at: '2031-03-12' }) && same(again.record.log.visits[0], { name: 'w1', t: T + 2, via: 'sky', n: 3, at: '2001-06-30' }));
  yes('a visit of another way carries no day of its own', same(visit(empty(), { name: 'w2', t: T, via: 'log', at: '2031-03-12' }, known).record.log.visits[0], { name: 'w2', t: T, via: 'log', n: 1 }));
  const edges = ['1999-01-01', '2040-01-01'].map((at) => visit(empty(), { name: 'w1', t: T, via: 'sky', at }, known));
  yes('the first and the last day the sky\'s line shows are days of it (it starts at 06:00 of the first, ends at noon of the last)', edges.every((w) => w.ok && w.record.log.visits[0].at !== undefined));
  const r0 = filled(2);
  const off = ['1998-12-31', '2040-01-02', '2040-12-31', '2041-01-01', '2031-02-30', '2031-3-12', '12 March 2031', '', null, undefined, 20310312].map((at) => visit(r0, { name: 'w1', t: T, via: 'sky', at }, known));
  yes('a sky visit with a day off the line, or no day, is refused with the reason, and the record handed back is the one given', off.every((w) => !w.ok && w.why === OFF_LINE && w.record === r0) && OFF_LINE === 'the day is not one the sky’s line of time has', off.map((w) => w.why).join(' | '));
  yes('a sky visit of a world the catalogue does not have is refused as one', visit(r0, { name: 'w601', t: T, via: 'sky', at: '2031-03-12' }, known).why === UNKNOWN);
  yes('the survey never gives the sky\'s way', viaOf('sky') === null && viaOf('sky', { results: true }) === null);
  const stored = normalise({ log: { visits: [{ name: 'w1', t: T + 3, via: 'sky', at: '2031-03-12' }, { name: 'w2', t: T + 2, via: 'search', at: '2040-01-01' }, { name: 'w3', t: T + 1, via: 'sky', at: '2040-01-02' }, { name: 'w4', t: T, via: 'sky', at: '1999-01-01' }, { name: 'w5', t: T - 1, via: 'sky', at: '1998-12-31' }, { name: 'w6', t: T - 2, via: 'sky', at: 7 }] } });
  yes('a stored visit keeps its day when it is a day of the sky\'s line, and a day that is not one is left out of the line',
    same(stored.log.visits.map((e) => e.at), ['2031-03-12', '2040-01-01', undefined, '1999-01-01', undefined, undefined]) && stored.log.visits.length === 6 && !('at' in stored.log.visits[2]), JSON.stringify(stored.log.visits));
  yes('a line whose clock was opened on the sky links to the sky at its planet and day; one that was not, links nowhere', skyLink({ name: 'HD 209458 b', at: '2031-03-12' }) === 'exomania.html?planet=HD%20209458%20b&date=2031-03-12'
    && skyLink({ name: 'w1' }) === '' && skyLink({ name: "Teegarden's Star b", at: '2001-06-30' }) === "exomania.html?planet=Teegarden's%20Star%20b&date=2001-06-30");
  yes('on a fixture page the link keeps the fixture, so the sky opens on the same store', skyLink({ name: 'KELT-9 b', at: '2031-03-12' }, 'first-visit') === 'exomania.html?planet=KELT-9%20b&date=2031-03-12&os-fixture=first-visit'
    && skyLink({ name: 'KELT-9 b', at: '2031-03-12' }, null) === 'exomania.html?planet=KELT-9%20b&date=2031-03-12' && skyLink({ name: 'w1' }, 'first-visit') === '');
  yes('the link names the day in the kit\'s words for a date of the data', skyWords({ name: 'w1', at: '2031-03-12' }) === 'its clock on 12 March 2031' && skyWords({ name: 'w1', at: '1999-01-01' }) === 'its clock on 1 January 1999');
  yes('the words of a sky visit', visitWords({ n: 1, via: 'sky' }) === 'from the sky' && visitWords({ n: 3, via: 'sky' }) === '3 visits, the last from the sky');
}

/* ---- version 3: the catalogue as the survey last saw it ---- */
{
  const cat = ['w1', 'w2', 'w3'];
  const a = see(empty(), { day: '2026-11-16', names: cat });
  yes('the survey keeps the catalogue it saw, its names joined by bars, with the day', a.ok && same(a.record.seen, { day: '2026-11-16', names: 'w1|w2|w3' }));
  const e0 = empty(), e1 = see(e0, { day: '2026-11-16', names: cat });
  yes('keeping the catalogue does not change the record it was given', e0.seen === null && e1.record !== e0 && same(e1.record.log, e0.log));
  yes('seeing the same catalogue on the same day changes nothing', see(a.record, { day: '2026-11-16', names: cat }).record === a.record && see(a.record, { day: '2026-11-17', names: cat }).record.seen.day === '2026-11-17' && see(a.record, { day: '2026-11-16', names: ['w1'] }).record.seen.names === 'w1');
  yes('names that cannot be a name are left out, and so is a list that is no list', see(empty(), { day: '2026-11-16', names: ['w1', '', 5, 'x'.repeat(81), 'w2'] }).record.seen.names === 'w1|w2' && see(empty(), { day: '2026-11-16', names: 'w1' }).record.seen.names === '');
  const no = ['2026-13-01', '16 November 2026', '', null].map((d) => see(a.record, { day: d, names: cat }));
  yes('a day that is not a date is refused with the reason, and the record handed back is the one given', no.every((w) => !w.ok && w.why === NO_DAY && w.why === 'the day is not a date' && w.record === a.record));
  const fits = Array.from({ length: 15000 }, (_, i) => `n${String(i).padStart(8, '0')}`);   // 15,000 names of 9 characters and 14,999 bars: 149,999 characters
  const over = [...fits, 'x'];
  yes('the catalogue is kept up to 150,000 characters, and refused past them with the reason', see(empty(), { day: '2026-11-16', names: fits }).ok && fits.join('|').length === 149999 && see(empty(), { day: '2026-11-16', names: [...fits.slice(0, -1), 'n0000000xy'] }).ok
    && !see(empty(), { day: '2026-11-16', names: over }).ok && see(empty(), { day: '2026-11-16', names: over }).why === TOO_LONG && TOO_LONG === 'the catalogue\'s names come to more than 150,000 characters, more than the record keeps');
  yes('the worlds new since the last visit are the names the catalogue last seen did not have, in the catalogue\'s order', same(newSince(a.record.seen, ['w4', 'w1', 'w2', 'w3', 'w5']), ['w4', 'w5']) && same(newSince(a.record.seen, cat), []));
  yes('with no catalogue seen before, nothing is new', same(newSince(null, cat), []));
  yes('a stored catalogue is read back as kept, and one that is not sound is none', same(normalise({ seen: { day: '2026-11-16', names: 'w1|w2' } }).seen, { day: '2026-11-16', names: 'w1|w2' }) && normalise({ seen: { day: '2026-11-16', names: ['w1'] } }).seen === null
    && normalise({ seen: { day: 'today', names: 'w1' } }).seen === null && normalise({ seen: { names: 'w1' } }).seen === null && normalise({ seen: 'w1|w2' }).seen === null
    && normalise({ seen: { day: '2026-11-16', names: 'x'.repeat(150000) } }).seen !== null && normalise({ seen: { day: '2026-11-16', names: 'x'.repeat(150001) } }).seen === null
    && same(Object.keys(normalise({ seen: { day: '2026-11-16', names: 'w1', more: 1 } }).seen), ['day', 'names']));
  yes('the catalogue seen passes through what the page shows, a removal and every write of the log', view(a.record, known).record.seen === a.record.seen && same(forget(a.record, known).record.seen, a.record.seen)
    && same(visit(a.record, { name: 'w1', t: T, via: 'log' }, known).record.seen, a.record.seen) && same(setOverdue(a.record, { planet: 'w1', place: null }, known).record.seen, a.record.seen)
    && visit(a.record, { name: 'w1', t: T, via: 'log' }, known).record.seen !== a.record.seen);
  const store = (v) => ({ getItem: (k) => (k === LEGACY_SEEN ? v : null) });
  yes('the survey\'s old local copy is read as the catalogue it saw', LEGACY_SEEN === 'exo:seen:v1' && same(legacySeen(store(JSON.stringify({ date: '2026-11-11', names: ['w1', 'w2', '', 7] }))), { day: '2026-11-11', names: 'w1|w2' }));
  yes('an old copy that is missing, not JSON, or not sound is none', [null, '{', '"w1"', JSON.stringify({ names: ['w1'] }), JSON.stringify({ date: 'yesterday', names: ['w1'] })].every((v) => legacySeen(store(v)) === null) && legacySeen(null) === null && legacySeen(undefined) === null
    && legacySeen({ getItem: () => { throw new Error('denied'); } }) === null);
}

/* ---- version 3: the record of an older version, and the survey's old local copy ---- */
{
  const fake = (start, storage) => { let rec = start; const calls = []; return { calls, storage, get rec() { return rec; }, progress: {
    get: async (o) => { calls.push(['get', o && o.v]); if (rec && o && o.migrate && rec.v < o.v) rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(o.migrate(rec.data, rec.v))) }; return rec; },
    set: async (data, o) => { calls.push(['set', o && o.v]); rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(data)) }; return rec; },
    setResume: async () => rec } }; };
  const OWN = { kind: 'indexeddb', persistent: true, fixture: null }, MEMORY = { kind: 'memory', persistent: false, fixture: null }, FIXTURE = { kind: 'memory', persistent: true, fixture: 'fresh' };
  const local = (v) => { const m = new Map(v === undefined ? [] : [[LEGACY_SEEN, v]]); return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => { m.delete(k); } }; };
  const OLD = JSON.stringify({ date: '2026-11-11', names: ['w1', 'w2'] });
  const v2 = { overdue: { planet: 'w5', place: { lat: 41.39, lon: 2.17 } }, log: { saved: [{ name: 'w1', t: T, view: 'surface' }], visits: [{ name: 'w2', t: T + 1, via: 'tour', n: 3 }], pins: ['w1'], dropped: 4 } };
  const ls = local(OLD), os = fake({ v: 2, data: JSON.parse(JSON.stringify(v2)) }, OWN);
  const r = await read(os, ls);
  yes('a record of version 2 in the visitor\'s own store is read at version 3 with every entry it held', !r.newer && os.rec.v === 3 && same(r.record.overdue, v2.overdue) && same(r.record.log, v2.log));
  yes('and takes in the survey\'s old local copy of the catalogue, which stays in localStorage on the read that upgraded the record', same(r.record.seen, { day: '2026-11-11', names: 'w1|w2' }) && same(os.rec.data.seen, r.record.seen) && ls.map.get(LEGACY_SEEN) === OLD);
  await read(os, ls);
  yes('the next read finds a record of this version holding the catalogue, and removes the copy', !ls.map.has(LEGACY_SEEN) && os.rec.v === 3);
  const ls2 = local(JSON.stringify({ date: '2026-11-12', names: ['w9'] })), r2 = await read(os, ls2);
  yes('a record of version 3 keeps its own catalogue, and an old local copy written since is removed', same(r2.record.seen, { day: '2026-11-11', names: 'w1|w2' }) && !ls2.map.has(LEGACY_SEEN));
  const lsNone = local(OLD), none = fake(null, OWN), rn = await read(none, lsNone);
  yes('with no record (never written, or erased) nothing is taken in, and the copy goes', rn.record.seen === null && none.rec === null && !lsNone.map.has(LEGACY_SEEN));
  const lsBare = local(OLD), bare = fake({ v: 3, data: empty() }, OWN);
  await read(bare, lsBare);
  yes('a record of version 3 that holds no catalogue removes the copy too', !lsBare.map.has(LEGACY_SEEN));
  for (const [name, storage] of [['a fixture', FIXTURE], ['a store in memory', MEMORY]]) {
    const lsF = local(OLD), f = fake({ v: 2, data: JSON.parse(JSON.stringify(v2)) }, storage), rf = await read(f, lsF);
    yes(`on ${name} the old copy is neither taken in nor removed`, rf.record.seen === null && lsF.map.get(LEGACY_SEEN) === OLD && same(rf.record.log, v2.log));
    const lsH = local(OLD), held = fake({ v: 3, data: { ...JSON.parse(JSON.stringify(v2)), seen: { day: '2026-11-12', names: 'w1' } } }, storage);
    await read(held, lsH);
    yes(`on ${name} holding a record of this version with a catalogue, the visitor's copy is left`, lsH.map.get(LEGACY_SEEN) === OLD);
  }
  const v1 = fake({ v: 1, data: { planet: 'w5', place: { lat: 1, lon: 2 } } }, OWN), r1 = await read(v1, local(OLD));
  yes('a record of version 1 is read as the sky\'s slice and takes in the old copy too', same(r1.record.overdue, { planet: 'w5', place: { lat: 1, lon: 2 } }) && same(r1.record.seen, { day: '2026-11-11', names: 'w1|w2' }) && v1.rec.v === 3);
  const noLocal = fake({ v: 2, data: JSON.parse(JSON.stringify(v2)) }, OWN), rl = await read(noLocal, null);
  yes('where localStorage cannot be read the record is upgraded without it', rl.record.seen === null && same(rl.record.log, v2.log) && noLocal.rec.v === 3);
  const stubborn = { getItem: () => OLD, removeItem: () => { throw new Error('denied'); } };
  let err = '';
  let stubbornRead = null;
  try { stubbornRead = await read(fake({ v: 3, data: { ...JSON.parse(JSON.stringify(v2)), seen: { day: '2026-11-11', names: 'w1' } } }, OWN), stubborn); } catch (e) { err = e.message; }
  yes('a localStorage that refuses the removal does not stop the read', err === '' && !!stubbornRead && stubbornRead.record.seen.names === 'w1');
  // the race of the review of 2026-11-16 (S3): a tab of version 2 read the record before the upgrade and writes it back after
  const shared = fake({ v: 2, data: JSON.parse(JSON.stringify(v2)) }, OWN), lsRace = local(OLD);
  const oldTabRead = JSON.parse(JSON.stringify(shared.rec.data));                       // 1. the old tab reads version 2
  await read(shared, lsRace);                                                             // 2. this tab upgrades it, taking the copy in
  const kept1 = lsRace.map.get(LEGACY_SEEN) === OLD && !!shared.rec.data.seen;
  await shared.progress.set({ ...oldTabRead, log: { ...oldTabRead.log, pins: ['w9'] } }, { v: 2 });   // 3. the old tab's write lands, at version 2, with no catalogue
  const again = await read(shared, lsRace);                                               // 4. this tab reads again: upgrades again
  yes('S3: after an old tab writes back version 2 over the upgrade, the next read upgrades again and takes the copy in again', kept1 && shared.rec.v === 3 && same(again.record.seen, { day: '2026-11-11', names: 'w1|w2' }) && same(again.record.log.pins, ['w9']) && lsRace.map.get(LEGACY_SEEN) === OLD);
  await read(shared, lsRace);
  yes('S3: and only the read after it, which finds version 3 holding the catalogue, removes the copy', !lsRace.map.has(LEGACY_SEEN) && !!shared.rec.data.seen);
  yes('the page\'s own read reaches the browser\'s localStorage when none is given', (await read(fake(null, OWN))).record.seen === null);
}

/* ---- version 3: the survey sees its catalogue through the record ---- */
{
  const fake = (start) => { let rec = start; let sets = 0; return { get sets() { return sets; }, get rec() { return rec; }, storage: { kind: 'memory', persistent: false, fixture: null }, progress: {
    get: async () => rec,
    set: async (data, o) => { sets++; rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(data)) }; return rec; },
    setResume: async () => rec } }; };
  const os = fake(null);
  const first = await seeCatalogue(os, ['w1', 'w2'], { day: '2026-11-15', keep: true });
  yes('on a first visit nothing is new, and the catalogue is kept as seen', same(first.fresh, []) && first.changed && same(os.rec.data.seen, { day: '2026-11-15', names: 'w1|w2' }));
  const next = await seeCatalogue(os, ['w1', 'w2', 'w3'], { day: '2026-11-16', keep: true });
  yes('on the next visit the worlds the catalogue gained are new, and the new catalogue is kept', same(next.fresh, ['w3']) && same(os.rec.data.seen, { day: '2026-11-16', names: 'w1|w2|w3' }));
  const n0 = os.sets, off = await seeCatalogue(os, ['w1', 'w2', 'w3', 'w4'], { day: '2026-11-17', keep: false });
  yes('with recording off the new worlds are still found and nothing is written', same(off.fresh, ['w4']) && os.sets === n0 && !off.changed && os.rec.data.seen.day === '2026-11-16');
  const nw = fake({ v: 4, data: { seen: { day: '2026-11-15', names: 'w1' } } }), late = await seeCatalogue(nw, ['w1', 'w2'], { day: '2026-11-16', keep: true });
  yes('on a record of a later version nothing is said to be new and nothing is written', same(late.fresh, []) && nw.sets === 0 && late.why === NEWER);
  // S2: what the new worlds are new since, said from the record
  yes('S2: the new worlds are said to be new since the day of the catalogue they are counted from, with recording on', next.since === '2026-11-15' && sinceWords(next) === 'since 15\u00a0November\u00a02026');
  yes('S2: and with recording off', off.since === '2026-11-16' && sinceWords(off) === 'since 16\u00a0November\u00a02026');
  const gap = fake({ v: 3, data: { ...empty(), seen: { day: '2026-11-12', names: 'w1' } } });
  await seeCatalogue(gap, ['w1', 'w2'], { day: '2026-11-14', keep: false });
  const back = await seeCatalogue(gap, ['w1', 'w2'], { day: '2026-11-16', keep: true });
  yes('S2: recording off on one visit and on again the next: the words name the day counted from, not "your last visit"', same(back.fresh, ['w2']) && back.since === '2026-11-12' && sinceWords(back) === 'since 12\u00a0November\u00a02026');
  const blank = fake(null), offNone = await seeCatalogue(blank, ['w1', 'w2'], { day: '2026-11-16', keep: false });
  yes('S2: with recording off and no catalogue kept, nothing is new and nothing is said', same(offNone.fresh, []) && offNone.since === null && blank.rec === null);
  // N4: a catalogue past the bound
  const fits = Array.from({ length: 15000 }, (_, i) => `n${String(i).padStart(8, '0')}`), atBound = [...fits.slice(0, -1), 'n0000000xy'], past = [...fits, 'x'];
  const big = fake({ v: 3, data: { ...empty(), seen: { day: '2026-11-15', names: 'w1' } } });
  const pastW = await seeCatalogue(big, past, { day: '2026-11-16', keep: true });
  yes('N4: a catalogue past the bound shows nothing as new, keeps nothing, and says why', same(pastW.fresh, []) && pastW.long && !pastW.changed && big.sets === 0 && big.rec.data.seen.day === '2026-11-15'
    && LONG_NOTE === 'This catalogue\'s names come to more than the 150,000 characters the log keeps of them, so no world is shown as new since an earlier visit.');
  const offPast = await seeCatalogue(big, past, { day: '2026-11-17', keep: false });
  yes('N4: with recording off too', same(offPast.fresh, []) && offPast.long);
  const atW = await seeCatalogue(big, atBound, { day: '2026-11-16', keep: true });
  yes('N4: a catalogue at the bound is kept, and its new worlds are counted', !atW.long && atW.changed && atW.fresh.length === 15000 && atBound.join('|').length === 150000);
}

/* ---- B1: past the bound a visit from the sky judges no line by its own catalogue ---- */
{
  // the survey's catalogue: w1..w600; the sky's: only w100..w600 (the survey has worlds the sky lacks, as 1,665 of them)
  const skyKnows = (n) => known(n) && +n.slice(1) >= 100;
  const full = filled(500);   // w1 (oldest) .. w500 (newest), all shown by the survey; w1..w99 are not on the sky
  const shownBefore = counts(view(full, known).record).visited;
  const w = visit(full, { name: 'w600', t: T + 900, via: 'sky', at: '2031-03-12' }, skyKnows);
  yes('B1: a sky visit at the bound drops the oldest line, counts it, and "visited" stays true', w.ok && w.record.log.visits.length === 500 && w.record.log.dropped === 1 && !w.record.log.visits.some((e) => e.name === 'w1')
    && w.record.log.visits.some((e) => e.name === 'w2') && counts(view(w.record, known).record).visited === shownBefore + 1, `dropped ${w.record.log.dropped}, visited ${counts(view(w.record, known).record).visited}`);
  const mid = normalise({ log: { visits: Array.from({ length: 500 }, (_, i) => ({ name: `w${i < 250 ? 200 + i : i === 250 ? 5 : 200 + i}`, t: T + 500 - i, via: 'search' })) } });
  const w2 = visit(mid, { name: 'w150', t: T + 900, via: 'sky', at: '2031-03-12' }, skyKnows);
  yes('B1: a survey line the sky lacks, in the middle of the list, stays', w2.record.log.visits.some((e) => e.name === 'w5') && w2.record.log.dropped === 1 && w2.record.log.visits.length === 500);
  const hidden = normalise({ log: { visits: [...Array.from({ length: 499 }, (_, i) => ({ name: `w${i + 1}`, t: T + 1000 - i, via: 'search' })), { name: 'gone a', t: T, via: 'search' }] } });
  const ws = visit(hidden, { name: 'w600', t: T + 2000, via: 'search' }, known), wk = visit(hidden, { name: 'w600', t: T + 2000, via: 'sky', at: '2031-03-12' }, known);
  yes('B1: the survey keeps its rule for names that have left its own catalogue; the sky does not apply it', ws.record.log.dropped === 0 && !ws.record.log.visits.some((e) => e.name === 'gone a')
    && wk.record.log.dropped === 1 && !wk.record.log.visits.some((e) => e.name === 'gone a'));
}

/* ---- S1 and N1: every write in turn; a refused change stores nothing ---- */
{
  // a store that answers on a later turn of the event loop, as IndexedDB does, so two writes fired at once would interleave
  const slow = () => { let rec = null, sets = 0; const tick = () => new Promise((r) => setImmediate(r)); return { get rec() { return rec; }, get sets() { return sets; }, storage: { kind: 'memory', persistent: false, fixture: null }, progress: {
    get: async () => { await tick(); return rec; }, set: async (d, o) => { await tick(); sets++; rec = { v: o.v, data: JSON.parse(JSON.stringify(d)) }; return rec; }, setResume: async () => rec } }; };
  const opened = (name, t) => (r) => { const w = setOverdue(r, { planet: name, place: null }, known); return w.ok ? visit(w.record, { name, t, via: 'sky', at: '2031-03-12' }, known) : w; };
  const os = slow();
  await Promise.all([update(os, opened('w1', T)), update(os, opened('w2', T + 1))]);
  yes('S1: two writes fired at once both land, in the order asked', same(os.rec.data.log.visits.map((e) => e.name), ['w2', 'w1']) && os.rec.data.overdue.planet === 'w2');
  await Promise.all([update(os, opened('w3', T + 2)), update(os, opened('w3', T + 3))]);
  yes('S1: a clock pressed twice is counted twice', os.rec.data.log.visits[0].name === 'w3' && os.rec.data.log.visits[0].n === 2);
  const bad = update(os, () => { throw new Error('a change that throws'); }).catch((e) => e.message), after = update(os, opened('w4', T + 4));
  yes('S1: a write that fails does not stop the ones after it', (await bad) === 'a change that throws' && (await after).ok && os.rec.data.log.visits[0].name === 'w4');
  const pend = update(os, opened('w5', T + 6)), seenNow = await read(os);
  const w5 = await pend, seenAfter = await read(os);
  yes('S1: a read does not wait for a write in turn: it reports what is stored when it runs, and the read after the write has it', w5.ok && seenNow.record.log.visits[0].name !== 'w5' && seenAfter.record.log.visits[0].name === 'w5');
  const r0 = JSON.stringify(os.rec.data), n0 = os.sets;
  const half = await update(os, (r) => { const w = setOverdue(r, { planet: 'w9', place: null }, known); return w.ok ? visit(w.record, { name: 'w9', t: T + 5, via: 'sky', at: '2041-05-01' }, known) : w; });
  yes('N1: a change of two writes whose second is refused stores nothing, says why, and hands back the stored record', !half.ok && half.why === OFF_LINE && !half.changed && os.sets === n0 && JSON.stringify(os.rec.data) === r0 && same(half.record, os.rec.data));
  const resumes = []; const os2 = slow(); os2.progress.setResume = async (u) => { resumes.push(u); };
  await update(os2, (r) => visit(r, { name: 'nope', t: T, via: 'log' }, known), { resume: { url: 'exomania.html', label: 'x' } });
  yes('N1: and writes no way back', resumes.length === 0);
}

/* ---- the old copy through the page's own localStorage (local()), for the three groups of visitors, over three visits ---- */
{
  const page = new Map();
  globalThis.localStorage = { getItem: (k) => (page.has(k) ? page.get(k) : null), setItem: (k, v) => page.set(k, String(v)), removeItem: (k) => { page.delete(k); } };
  const OLD = JSON.stringify({ date: '2026-11-11', names: ['w1', 'w2'] });
  const shared = (start) => { let rec = start ? JSON.parse(JSON.stringify(start)) : null; return { get rec() { return rec; }, storage: { kind: 'indexeddb', persistent: true, fixture: null }, progress: {
    get: async (o = {}) => { if (rec && o.migrate && rec.v < o.v) rec = { ...rec, v: o.v, data: JSON.parse(JSON.stringify(o.migrate(rec.data, rec.v))) }; return rec; },
    set: async (d, o) => { rec = { ...(rec || {}), v: o.v, data: JSON.parse(JSON.stringify(d)) }; return rec; }, setResume: async () => rec } }; };
  const v2 = { overdue: { planet: 'w5', place: null }, log: { saved: [], visits: [{ name: 'w2', t: T, via: 'tour', n: 1 }], pins: [], dropped: 0 } };
  /* a visit of the survey: its log reads the record, then it sees the catalogue, recording on or off */
  const visit3 = async (os, keep, day) => { await read(os); await seeCatalogue(os, ['w1', 'w2', 'w3'], { day, keep }); return page.has(LEGACY_SEEN); };
  const groups = [
    ['no record, recording off', null, false, OLD],
    ['no record, recording on', null, true, OLD],
    ['a record of version 2 and a copy that cannot be read, recording off', { v: 2, data: v2 }, false, '{not json'],
    ['a record of version 2 and a readable copy, recording on', { v: 2, data: v2 }, true, OLD],
  ];
  for (const [who, start, keep, copy] of groups) {
    page.clear(); page.set(LEGACY_SEEN, copy);
    const os = shared(start), left = [];
    for (const day of ['2026-11-16', '2026-11-17', '2026-11-18']) left.push(await visit3(os, keep, day));
    const seen = os.rec && os.rec.data ? os.rec.data.seen : null;
    const takenIn = !!seen && seen.day === '2026-11-11';
    yes(`the old copy, ${who}: gone after the first visit and on every one after`, same(left, [false, false, false]), JSON.stringify(left));
    yes(`and what the record holds, ${who}`, who.startsWith('no record, recording off') ? os.rec === null
      : who.startsWith('no record, recording on') ? !!seen && seen.day === '2026-11-18' && !takenIn
      : who.includes('cannot be read') ? os.rec.v === 3 && seen === null
      : os.rec.v === 3 && !!seen && seen.day === '2026-11-18', JSON.stringify(seen && seen.day));
  }
  // the read that upgrades keeps the copy, through local(), and the next takes it away
  page.clear(); page.set(LEGACY_SEEN, OLD);
  const up = shared({ v: 2, data: v2 });
  const r1 = await read(up);
  const keptOnUpgrade = page.get(LEGACY_SEEN) === OLD && same(r1.record.seen, { day: '2026-11-11', names: 'w1|w2' });
  await update(up, (r) => pin(r, 'w1', known));
  yes('through the page\'s localStorage: the upgrading read takes the copy in and keeps it, the next write\'s read removes it', keptOnUpgrade && !page.has(LEGACY_SEEN));
  // a localStorage the page may not read
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  let denied = '';
  try { await read(shared({ v: 2, data: v2 })); } catch (e) { denied = e.message; }
  yes('a localStorage the page may not read is no localStorage: the record is still read and upgraded', denied === '');
  delete globalThis.localStorage;
}

/* ---- version 3: the health check ---- */
{
  const os = (rec, storage) => ({ storage, progress: { get: async () => rec } });
  const OWN = { kind: 'indexeddb', persistent: true, fixture: null };
  yes('the health check reports the version this page writes, the version stored, the store and no sync', same(await health(os({ v: 3, data: {} }, OWN)), { version: 3, stored: 3, store: 'indexeddb', persistent: true, fixture: null, synced: false })
    && same(await health(os(null, { kind: 'memory', persistent: false, fixture: 'fresh' })), { version: 3, stored: null, store: 'memory', persistent: false, fixture: 'fresh', synced: false }) && (await health(os({ v: 4 }, OWN))).stored === 4);
  yes('its words say both versions and the sync', healthWords({ stored: 3 }) === 'This page writes version 3 of the record, and the stored record is version 3. No copy is synced to another device.'
    && healthWords({ stored: null }) === 'This page writes version 3 of the record, and nothing is stored yet. No copy is synced to another device.' && healthWords({ stored: 4 }).includes('the stored record is version 4'));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
