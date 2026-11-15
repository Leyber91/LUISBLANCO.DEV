/* ============================================================
   The visitor's record of the Exomania lab (record.js). Run from
   the repository root:
     node labs/assets/js/exoplanet/tests/record.test.mjs

   Each rule has a case just inside it and one just outside: the
   200th saved world is taken and the 201st refused; latitude 90
   is a place and 90.1 is none; the 24th name of a shared log is
   read and the 25th counted as refused. A write that is refused
   must hand back the very record it was given.

   record.mutants.test.mjs breaks each rule in turn and runs this
   file: a rule added here needs an entry there.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { V, LIMITS, VIAS, VIA_WORDS, VIEWS, FULL, empty, normalise, view, visit, save, unsave, saveAll, setPins, setOverdue, isSaved, counts, thousands, lineWords, shareValue, readShare, viaOf, load, update } from '../record.js';

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
  yes('the record is at version 2, and its bounds are 200 saved, 500 visits, 3 pins, 24 shared and a count of dropped visits of a million', V === 2 && same(LIMITS, { saved: 200, visits: 500, pins: 3, shared: 24, dropped: 1000000 }));
  yes('a world is reached in one of eight ways, and each has words', same(VIAS, ['search', 'results', 'tour', 'random', 'diagram', 'system', 'link', 'log'])
    && same(VIAS.map((v) => VIA_WORDS[v]), ['by name', 'from a question', 'on a tour', 'at random', 'on the diagram', 'in its system', 'from a link', 'from the log']));
  yes('a saved world reopens in one of three views', same(VIEWS, ['orbit', 'closeorbit', 'surface']));
  yes('an empty record has both slices, and two of them share nothing', same(empty(), { overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } }) && empty().log !== empty().log && empty().log.saved !== empty().log.saved);
}

/* ---- what comes out of the store is made sound ---- */
{
  yes('nothing, or something that is no record, is an empty record', [null, undefined, 7, 'x', [], [1, 2]].every((d) => same(normalise(d), empty())));
  const v1 = normalise({ planet: 'w5', place: { lat: 41.4, lon: 2.2, name: 'somewhere' } });
  yes('a record of the first shape becomes the Overdue slice, with an empty log', same(v1, { overdue: { planet: 'w5', place: { lat: 41.4, lon: 2.2 } }, log: empty().log }));
  yes('a place keeps its latitude and longitude and nothing else', same(Object.keys(v1.overdue.place), ['lat', 'lon']));
  const place = (lat, lon) => normalise({ planet: 'w1', place: { lat, lon } }).overdue.place;
  yes('latitude 90 and longitude 180 are a place; a step outside is none', place(90, 180) !== null && place(-90, -180) !== null && place(90.1, 0) === null && place(-90.1, 0) === null && place(0, 180.1) === null && place(0, -180.1) === null);
  yes('a place with a number missing, or written as text, is none', place(41, undefined) === null && place(41, null) === null && place(41, '2') === null && place(null, 2) === null && place('41', 2) === null && place(NaN, 2) === null);
  yes('a stored planet that is no name is none', [7, '', 'x'.repeat(81), ['w1'], { name: 'w1' }].every((p) => normalise({ planet: p, place: null }).overdue.planet === null) && normalise({ overdue: { planet: ['w1'] } }).overdue.planet === null);
  yes('a name that is a list holding a name is no name', normalise({ log: { saved: [{ name: ['w1'], t: T }], visits: [{ name: ['w1'], t: T, via: 'log' }], pins: [['w1']] } }).log.saved.length === 0 && normalise({ log: { visits: [{ name: ['w1'], t: T, via: 'log' }] } }).log.visits.length === 0
    && !visit(empty(), { name: ['w1'], t: T, via: 'log' }, known).ok && !save(empty(), { name: ['w1'], t: T }, known).ok && same(setPins(empty(), [['w1']], known).record.log.pins, []));
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
  yes('the Overdue slice and the count of dropped visits are kept, and nothing else at any level', same(n.overdue, { planet: 'w2', place: null }) && n.log.dropped === 6 && same(Object.keys(n), ['overdue', 'log']) && same(Object.keys(n.log), ['saved', 'visits', 'pins', 'dropped']));
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
  yes('and it stays in the record', raw.log.saved.length === 2 && raw.log.visits.length === 3 && same(raw.log.pins, ['w1', 'gone a']));
  yes('the counts of dropped visits and the Overdue slice pass through', v.record.log.dropped === 7 && same(v.record.overdue, raw.overdue) && same(counts(v.record), { visited: 8, saved: 1 }));
  yes('a record of catalogue names alone is shown whole, with nothing hidden', same(view(filled(5, 2), known).record, filled(5, 2)) && view(filled(5, 2), known).hidden === 0 && view(empty(), known).hidden === 0);
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
  yes('every way the page has is taken', VIAS.every((via) => visit(empty(), { name: 'w1', t: T, via }, known).ok));
  const r0 = filled(3);
  const no = [visit(r0, { name: 'w601', t: T, via: 'search' }, known), visit(r0, { name: 'zzz', t: T, via: 'search' }, known), visit(r0, { name: '', t: T, via: 'search' }, known), visit(r0, { name: 5, t: T, via: 'search' }, known),
    visit(r0, { name: 'w1', t: NaN, via: 'search' }, known), visit(r0, { name: 'w1', t: '5', via: 'search' }, known), visit(r0, { name: 'w1', t: 0, via: 'search' }, known), visit(r0, { name: 'w1', t: -1, via: 'search' }, known), visit(r0, { name: 'w1', t: T, via: 'teleport' }, known), visit(r0, { name: 'w1', t: T }, known), visit(r0, { name: 'w1', t: Infinity, via: 'search' }, known)];
  yes('a world that is not in the catalogue, a time that is not a number and a way the page does not have are refused, and the record handed back is the one given', no.every((w) => !w.ok && w.record === r0 && w.why.length > 10));
  yes('each refusal says which of the three it was', no[0].why === 'that world is not in the catalogue' && no[4].why === 'the time is not a number' && no[6].why === 'the time is not a number' && no[10].why === 'the time is not a number' && no[8].why === 'the way the world was reached is not one this page has');
  yes('a write does not change the record it was given', same(r0, filled(3)) && visit(r0, { name: 'w9', t: T, via: 'log' }, known).record !== r0 && visit(r0, { name: 'w9', t: T, via: 'log' }, known).record.log.visits !== r0.log.visits);
  const full = filled(500), over = visit(full, { name: 'w501', t: T + 501, via: 'diagram' }, known), again = visit(over.record, { name: 'w2', t: T + 502, via: 'log' }, known);
  yes('the 500th world is listed and nothing is dropped; the 501st drops the oldest and counts it', full.log.visits.length === 500 && full.log.dropped === 0 && over.record.log.visits.length === 500 && over.record.log.dropped === 1
    && over.record.log.visits[0].name === 'w501' && !over.record.log.visits.some((e) => e.name === 'w1') && over.record.log.visits[499].name === 'w2');
  yes('a world already in a full list moves to the top and drops nothing', again.record.log.visits.length === 500 && again.record.log.dropped === 1 && again.record.log.visits[0].name === 'w2' && again.record.log.visits[0].n === 2);
  yes('the count of worlds visited includes the ones dropped from the list', counts(over.record).visited === 501 && counts(full).visited === 500 && counts(empty()).visited === 0);
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
  const out = unsave(b.record, 'w2');
  yes('a world taken out is gone, the others stay, and taking out a world that is not there changes nothing', out.ok && same(out.record.log.saved.map((e) => e.name), ['w1']) && unsave(b.record, 'w9').record === b.record && same(b.record.log.saved.length, 2));
  const all = saveAll(a.record, ['w1', 'w3', 'w4', 'w601', 'w3'], T + 5, known);
  yes('saving several: those already saved are passed over, those not in the catalogue are counted as left, the rest are added once', all.added === 2 && all.left === 1 && !all.ok && all.why === '1 could not be added' && same(all.record.log.saved.map((e) => e.name), ['w4', 'w3', 'w1']) && all.record.log.saved[0].t === T + 5 && all.record.log.saved[0].view === 'orbit' && all.record.log.saved[1].view === 'orbit');
  const fit = saveAll(a.record, ['w5', 'w6'], T + 5, known), near = saveAll(filled(0, 199), ['w300', 'w301', 'w302'], T + 999, known);
  yes('saving several with room for all is whole; with room for one, one is added and two are left', fit.ok && fit.why === '' && fit.added === 2 && fit.left === 0 && near.added === 1 && near.left === 2 && counts(near.record).saved === 200);
  yes('saving nothing, or something that is no list, adds nothing', saveAll(a.record, [], T, known).record === a.record && [saveAll(a.record, 'w5', T, known), saveAll(a.record, null, T, known), saveAll(a.record, 5, T, known)].every((w) => w.added === 0 && w.left === 0 && w.ok && w.record === a.record));
}

/* ---- pins, and the Overdue slice ---- */
{
  yes('the compare bench is the last three of the names given, each once, each in the catalogue', same(setPins(empty(), ['w1', 'w2', 'w3', 'w4'], known).record.log.pins, ['w2', 'w3', 'w4']) && same(setPins(empty(), ['w1', 'w1', 'w601', 'w2', 7], known).record.log.pins, ['w1', 'w2'])
    && same(setPins(filled(2, 2), [], known).record.log.pins, []) && same(setPins(empty(), 'w1', known).record.log.pins, []));
  const o = setOverdue(filled(2, 1), { planet: 'w9', place: { lat: 10, lon: 20, more: 1 } });
  yes('the Overdue slice is written without touching the log', o.ok && same(o.record.overdue, { planet: 'w9', place: { lat: 10, lon: 20 } }) && same(o.record.log, filled(2, 1).log));
  const before = filled(2, 1), snap = JSON.stringify(before);
  setOverdue(before, { planet: 'w9', place: { lat: 1, lon: 2 } });
  yes('writing the Overdue slice does not change the record it was given', JSON.stringify(before) === snap);
  yes('a planet that is no name and a place outside the globe are written as none', same(setOverdue(empty(), { planet: 7, place: { lat: 91, lon: 0 } }).record.overdue, { planet: null, place: null }) && same(setOverdue(empty(), { planet: null, place: null }).record.overdue, { planet: null, place: null }));
  yes('a record that comes out of a write shares no part with the one that went in', visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.overdue.place !== o.record.overdue.place && visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.log.saved[0] !== o.record.log.saved[0]
    && save(o.record, { name: 'w3', t: T }, known).record.log.visits[0] !== o.record.log.visits[0] && setPins(o.record, ['w1'], known).record.log.saved !== o.record.log.saved);
  yes('a write to the log does not touch the Overdue slice', same(visit(o.record, { name: 'w3', t: T, via: 'link' }, known).record.overdue, o.record.overdue) && same(save(o.record, { name: 'w3', t: T }, known).record.overdue, o.record.overdue) && same(setPins(o.record, ['w1'], known).record.overdue, o.record.overdue));
}

/* ---- what the page prints ---- */
{
  yes('the log line counts the worlds visited and saved', lineWords({ visited: 12, saved: 3 }) === 'Your log · 12 visited · 3 saved' && lineWords({ visited: 0, saved: 0 }) === 'Your log · 0 visited · 0 saved');
  yes('thousands are marked the same way in every browser', same([0, 7, 999, 1000, 12345, 1234567].map(thousands), ['0', '7', '999', '1,000', '12,345', '1,234,567']));
  yes('one shared world is named on the line, and none is not', lineWords({ visited: 2, saved: 1 }, 1) === 'Your log · 2 visited · 1 saved · 1 shared with you' && lineWords({ visited: 2, saved: 1 }, -1) === 'Your log · 2 visited · 1 saved');
  yes('thousands are marked, and a shared log is named when there is one', lineWords({ visited: 1234, saved: 200 }) === 'Your log · 1,234 visited · 200 saved' && lineWords({ visited: 2, saved: 1 }, 5) === 'Your log · 2 visited · 1 saved · 5 shared with you' && lineWords({ visited: 2, saved: 1 }, 0) === 'Your log · 2 visited · 1 saved');
  yes('the counts are of the record', same(counts(filled(7, 3)), { visited: 7, saved: 3 }));
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
  const fake = (start) => { let rec = start; const calls = []; return { calls, get rec() { return rec; }, wipe() { rec = null; }, progress: {
    get: async (o) => { calls.push(['get', o && o.v]); if (rec && o && o.migrate && rec.v < o.v) rec = { v: o.v, data: o.migrate(rec.data, rec.v) }; return rec; },
    set: async (data, o) => { calls.push(['set', o && o.v]); rec = { v: o.v, data: JSON.parse(JSON.stringify(data)) }; return rec; } } }; };
  const sets = (os) => os.calls.filter((c) => c[0] === 'set').length;
  yes('with nothing stored, the record that loads is empty', same(await load(fake(null)), empty()));
  const old = fake({ v: 1, data: { planet: 'w5', place: { lat: 1, lon: 2 } } });
  const up = await load(old);
  yes('a stored record of the first shape loads as the Overdue slice and is asked for at version 2', same(up.overdue, { planet: 'w5', place: { lat: 1, lon: 2 } }) && same(up.log, empty().log) && same(old.calls[0], ['get', 2]) && old.rec.v === 2);

  const os = fake({ v: 2, data: setOverdue(empty(), { planet: 'w5', place: { lat: 1, lon: 2 } }).record });
  const a = await update(os, (r) => visit(r, { name: 'w1', t: T, via: 'search' }, known));
  yes('a change is applied to the stored record and written at version 2, and what comes back is what is stored', a.ok && a.why === '' && same(a.record, os.rec.data) && a.record.log.visits.length === 1 && same(a.record.overdue, { planet: 'w5', place: { lat: 1, lon: 2 } }) && os.rec.v === 2 && same(os.calls.at(-1), ['set', 2]));
  const n0 = sets(os);
  const no = await update(os, (r) => visit(r, { name: 'not a planet', t: T, via: 'search' }, known));
  yes('a change that is refused writes nothing, and hands back the stored record with the reason', !no.ok && no.why === 'that world is not in the catalogue' && sets(os) === n0 && same(no.record, os.rec.data));
  const same1 = await update(os, (r) => unsave(r, 'w9'));
  yes('a change that changes nothing writes nothing', same1.ok && sets(os) === n0 && same(same1.record, os.rec.data));

  // another tab saved a world after this page read the record
  const pageCopy = JSON.parse(JSON.stringify(os.rec.data));
  await os.progress.set(save(os.rec.data, { name: 'w7', t: T + 5 }, known).record, { v: 2 });
  const b = await update(os, (r) => visit(r, { name: 'w2', t: T + 6, via: 'random' }, known));
  yes('a save made in another tab since this page read the record is kept by this page\'s next write', isSaved(b.record, 'w7') && isSaved(os.rec.data, 'w7') && !isSaved(pageCopy, 'w7') && b.record.log.visits.length === 2);
  // the privacy page erased everything in another tab
  os.wipe();
  const c = await update(os, (r) => visit(r, { name: 'w3', t: T + 7, via: 'random' }, known));
  yes('after an erase made elsewhere the next write holds that one change and nothing of what was erased', same(c.record.log.visits.map((e) => e.name), ['w3']) && c.record.log.saved.length === 0 && c.record.overdue.planet === null && same(os.rec.data, c.record));
  // the two pages of the lab
  const d = await update(os, (r) => setOverdue(r, { planet: 'w8', place: null }));
  const e = await update(os, (r) => save(r, { name: 'w4', t: T + 8, view: 'surface' }, known));
  yes('Overdue\'s change leaves the log, and the survey\'s change leaves Overdue\'s slice', same(d.record.log, c.record.log) && d.record.overdue.planet === 'w8' && e.record.overdue.planet === 'w8' && isSaved(e.record, 'w4'));
  const bad = fake({ v: 2, data: { log: { saved: [{ name: 'w1', t: T }, { name: 'w1', t: T + 1 }, { name: '', t: T }] } } });
  const f = await update(bad, (r) => visit(r, { name: 'w2', t: T + 2, via: 'log' }, known));
  yes('the stored record is made sound before a change is applied to it', same(f.record.log.saved, [{ name: 'w1', t: T + 1, view: 'orbit' }]) && same(bad.rec.data.log.saved, [{ name: 'w1', t: T + 1, view: 'orbit' }]));
  let threw = '';
  const broken = { progress: { get: async () => null, set: async () => { throw new Error('quota'); } } };
  try { await update(broken, (r) => visit(r, { name: 'w1', t: T, via: 'log' }, known)); } catch (err) { threw = err.message; }
  yes('a write the store refuses is an error the page hears of', threw === 'quota');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
