/* ============================================================
   The contract of the Exomania lab's record (record.js), for its
   two rooms. Run from the repository root:
     node labs/assets/js/exoplanet/tests/record.contract.test.mjs

   The properties of slice A (tickets 2.02 and 2.08 of the lab's
   road), written before the code. Each must always hold; each
   block below proves one in Node, and tools/drives/record.mjs
   proves the ones a browser must show.

   P1 One door. record.js is the only module of either room that
      reads or writes the lab's record or any browser storage: no
      other file of exoplanet/ or of the two rooms' pages names
      localStorage, sessionStorage, indexedDB, caches, a cookie,
      Labs OS's progress store or its store module.
   P2 Typed. Every record kind the lab's bindings list
      (configuration, observation, prediction, note) is a type in
      record.js, which tsc checks: its first line is // @ts-check,
      labs-src/tsconfig.labs.json includes it, and labs-src's npm
      test (the gates' labs build) runs that config. Every field
      of the record belongs to exactly one kind.
   P3 Checked on arrival. Every write refuses a name its room's
      catalogue does not have and a value past the stated limits,
      says why, and hands back the record it was given.
   P4 Nothing stored is lost. A record of each older shape, as the
      live site wrote it, reads at version 3 with every entry it
      held; the survey's old local copy of the catalogue is taken
      into the visitor's own store and then removed, and nothing
      is taken from it into a fixture, a memory store, or where
      there is no record.
   P5 Reach. What the lab keeps is its one Labs OS record: the
      export holds it whole, and the erase leaves none of it.
   P6 Bounded. A record at every bound fits Labs OS's cap on one
      record, so a full record is never refused by the store.
   P7 Health. The health check reports the version this page
      writes, the version stored, the store and the sync.
   P8 The rooms read each other. A clock opened on the sky is a
      visit "from the sky" that the survey's log shows, with the
      day the sky was at, and its line's link opens the sky on
      that planet at that day. Every planet of the sky can be such
      a visit.

   Stopping rule for this slice's review: it ships when P1 to P8
   hold here and in the drive at 1440 and at 390, and a reviewer
   who did not write it finds no break of them; a finding outside
   them becomes a ticket.
   ============================================================ */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import * as R from '../record.js';
import { LabsOS } from '../../os/index.js';
import { MAX_PROGRESS_BYTES } from '../../os/progress.js';
import { FIRST_YEAR, LAST_YEAR } from '../overdue/sky.js';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..'), root = join(here, '../../../../..');
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const stop = (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const T = Date.parse('2026-11-16T20:00:00Z');

/* the two catalogues: the survey's snapshot and weekly roster, and the sky's */
const snap = JSON.parse(read(join(root, 'labs/assets/data/exomania/pscomppars-snapshot.json')));
const surveyNames = snap.rows.map((r) => r[snap.cols.indexOf('pl_name')]);
const rosterRaw = JSON.parse(read(join(root, 'labs/exoplanet_data.json')));
const rosterNames = (Array.isArray(rosterRaw) ? rosterRaw : Object.values(rosterRaw)).map((x) => x && (x.pl_name || x.name)).filter((n) => typeof n === 'string');
const eph = JSON.parse(read(join(root, 'labs/assets/data/exomania/ephemerides.json')));
const skyNames = eph.rows.map((r) => r[eph.cols.indexOf('pl_name')]);
const surveyKnown = ((s) => (n) => s.has(n))(new Set([...surveyNames, ...rosterNames])), skyKnown = ((s) => (n) => s.has(n))(new Set(skyNames));

/* ---- P1 one door ---- */
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'tests') walk(p); } else if (/\.m?js$/.test(f)) files.push(p); } };
  walk(lab);
  const rooms = ['labs/exomania.html', 'labs/exomania-survey.html'].map((p) => join(root, p));
  const STORAGE = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bIDBFactory\b|document\.cookie|\bcaches\.|\.progress\b|os\/store\.js|\bopenStore\b|\bmemoryStore\b/;
  const others = [...files.filter((p) => !p.endsWith(join('exoplanet', 'record.js'))), ...rooms];
  const hits = others.flatMap((p) => read(p).split('\n').map((l, i) => [p, i + 1, l]).filter(([, , l]) => STORAGE.test(l)));
  yes(`P1: no module of either room but record.js names a browser store or Labs OS's progress (${others.length} files read)`, files.length > 20 && hits.length === 0,
    hits.slice(0, 5).map(([p, n, l]) => `${relative(root, p)}:${n} ${l.trim().slice(0, 80)}`).join(' | '));
  const own = read(join(lab, 'record.js'));
  yes('P1: and record.js is where the record is read, written, upgraded and checked', /os\.progress\.get\(/.test(own) && /os\.progress\.set\(/.test(own) && /removeItem\(LEGACY_SEEN\)/.test(own));
  const importers = files.filter((p) => /from '\.\.?\/(\.\.\/)?record\.js'|from '\.\/record\.js'/.test(read(p))).map((p) => relative(lab, p).replace(/\\/g, '/')).sort();
  yes('P1: the rooms reach the record through record.js: the survey\'s log and page, and the sky', same(importers, ['log.js', 'main.js', 'overdue/main.js']), importers.join(', '));
}

/* ---- P2 typed ---- */
{
  const src = read(join(lab, 'record.js'));
  yes('P2: record.js asks tsc to check it (its first line)', src.split('\n')[0] === '// @ts-check');
  const cfg = JSON.parse(read(join(root, 'labs-src/tsconfig.labs.json'))), pkg = JSON.parse(read(join(root, 'labs-src/package.json')));
  yes('P2: labs-src/tsconfig.labs.json checks it, with allowJs, under the strict options of labs-src', cfg.include.includes('../labs/assets/js/exoplanet/record.js') && cfg.compilerOptions.allowJs === true && cfg.extends === './tsconfig.json'
    && JSON.parse(read(join(root, 'labs-src/tsconfig.json'))).compilerOptions.strict === true);
  yes('P2: and the labs build of the gates runs it (npm test in labs-src)', /tsc -p tsconfig\.labs\.json/.test(pkg.scripts.test) && /npm test/.test(read(join(root, '.github/workflows/gates.yml'))));
  const types = ['Place', 'SkyView', 'SavedView', 'Visit', 'Seen', 'Measure', 'Find', 'Observation', 'Configuration', 'Prediction', 'Note', 'ExoRecord', 'Write'];
  const declared = [...src.matchAll(/@typedef \{[^\n]*\} (\w+)/g)].map((m) => m[1]);
  yes('P2: every kind of the bindings, and each of its entries, is a declared type', types.every((t) => declared.includes(t)), types.filter((t) => !declared.includes(t)).join(', '));
  yes('P2: the record kinds are the four the lab\'s bindings list', same(Object.keys(R.KINDS), ['configuration', 'observation', 'prediction', 'note']));
  const r = R.normalise({ overdue: { planet: 'w', place: { lat: 1, lon: 2 } }, log: { saved: [{ name: 'w', t: T }], visits: [{ name: 'w', t: T, via: 'sky', at: '2031-03-12' }], pins: ['w'], dropped: 1 }, seen: { day: '2026-11-16', names: 'w' } });
  const fields = ['overdue', ...Object.keys(r.log).map((k) => `log.${k}`), 'seen'], placed = Object.values(R.KINDS).flat();
  yes('P2: every field of the record belongs to exactly one kind, and no kind names a field the record lacks', same(Object.keys(r), ['overdue', 'log', 'seen']) && fields.every((f) => placed.filter((x) => x === f).length === 1) && placed.every((f) => fields.includes(f)),
    `fields ${fields.join(', ')}; placed ${placed.join(', ')}`);
  yes('P2: prediction and note have no place yet, so no writer', R.KINDS.prediction.length === 0 && R.KINDS.note.length === 0);
}

/* ---- P3 checked on arrival ---- */
{
  const base = R.normalise({ overdue: { planet: 'HD 209458 b', place: null }, log: { saved: [{ name: 'HD 209458 b', t: T }], visits: [], pins: [], dropped: 0 } });
  const bad = { name: 'Not A Planet b', t: T };
  const writes = [
    ['a visit of a world the survey lacks', R.visit(base, { ...bad, via: 'search' }, surveyKnown)],
    ['a visit from the sky of a world the sky lacks', R.visit(base, { ...bad, via: 'sky', at: '2031-03-12' }, skyKnown)],
    ['a visit from the sky off its line of time', R.visit(base, { name: 'HD 209458 b', t: T, via: 'sky', at: '2041-01-01' }, skyKnown)],
    ['a visit with no time', R.visit(base, { name: 'HD 209458 b', t: 0, via: 'search' }, surveyKnown)],
    ['a visit of a way the lab lacks', R.visit(base, { name: 'HD 209458 b', t: T, via: 'warp' }, surveyKnown)],
    ['a save of a world the survey lacks', R.save(base, { ...bad, view: 'orbit' }, surveyKnown)],
    ['a pin of a world the survey lacks', R.pin(base, bad.name, surveyKnown)],
    ['the sky left on a planet it lacks', R.setOverdue(base, { planet: bad.name, place: null }, skyKnown)],
    ['the sky left at a place off the globe', R.setOverdue(base, { planet: 'HD 209458 b', place: { lat: 95, lon: 0 } }, skyKnown)],
    ['a catalogue seen on no day', R.see(base, { day: 'today', names: surveyNames })],
    ['a catalogue past the bound', R.see(base, { day: '2026-11-16', names: [...surveyNames, ...surveyNames.map((n) => `${n} copy`)] })],
  ];
  for (const [what, w] of writes) yes(`P3: ${what} is refused with the reason, and the record handed back is the one given`, !w.ok && w.why.length > 10 && w.record === base, w.why);
  yes('P3: a full log refuses a save with the reason', !R.save(R.normalise({ log: { saved: surveyNames.slice(0, 200).map((name, i) => ({ name, t: T - i })) } }), { name: surveyNames[300], t: T }, surveyKnown).ok);
}

/* ---- P4 nothing stored is lost ---- */
{
  const old = JSON.parse(read(join(here, 'fixtures/record_old.json')));
  const fake = (rec, storage) => { let r = JSON.parse(JSON.stringify(rec)); return { storage, get rec() { return r; }, progress: {
    get: async (o) => { if (r && o && o.migrate && r.v < o.v) r = { ...r, v: o.v, data: JSON.parse(JSON.stringify(o.migrate(r.data, r.v))) }; return r; },
    set: async (data, o) => { r = { ...r, v: o.v, data: JSON.parse(JSON.stringify(data)) }; return r; }, setResume: async () => r } }; };
  const local = () => { const m = new Map([[old.local.key, old.local.value]]); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), removeItem: (k) => { m.delete(k); } }; };
  const OWN = { kind: 'indexeddb', persistent: true, fixture: null };
  const v2 = old.v2.data, ls = local(), os2 = fake(old.v2, OWN), got = await R.read(os2, ls);
  yes('P4: the old record is version 2 and holds entries of every list', old.v2.v === 2 && v2.log.visits.length >= 12 && v2.log.saved.length === 3 && v2.log.pins.length === 2 && v2.log.dropped === 7 && v2.overdue.planet !== null);
  yes('P4: read at version 3, the record of version 2 keeps the sky\'s slice, every saved world, visit and pin, and the count of dropped visits, as they were',
    os2.rec.v === 3 && same(got.record.overdue, v2.overdue) && same(got.record.log, v2.log), JSON.stringify(got.record.log).slice(0, 200));
  const was = JSON.parse(old.local.value);
  yes('P4: and holds the catalogue the survey last saw, taken from its old local copy, which is gone from localStorage', same(got.record.seen, { day: was.date, names: was.names.join('|') }) && !ls.m.has(old.local.key));
  yes('P4: the hidden entry of the old record (a world the catalogue may lose) is kept in the store', got.record.log.visits.some((e) => e.name === 'Gone World c') && !surveyKnown('Gone World c'));
  const os1 = fake(old.v1, OWN), got1 = await R.read(os1, local());
  yes('P4: the record of version 1 keeps its planet and place, as the sky\'s slice', os1.rec.v === 3 && same(got1.record.overdue, { planet: old.v1.data.planet, place: { lat: old.v1.data.place.lat, lon: old.v1.data.place.lon } }));
  const again = await R.read(os2, local());
  yes('P4: a second read changes nothing that was taken in', same(again.record, got.record));
  for (const [name, storage] of [['a fixture', { kind: 'memory', persistent: true, fixture: 'fresh' }], ['memory', { kind: 'memory', persistent: false, fixture: null }]]) {
    const l = local(), r = await R.read(fake(old.v2, storage), l);
    yes(`P4: on ${name} the old local copy stays where it is and is not taken in, and the record is kept`, r.record.seen === null && l.m.get(old.local.key) === old.local.value && same(r.record.log, v2.log));
  }
  const l0 = local(), none = await R.read(fake(null, OWN), l0);
  yes('P4: with no record the old local copy is removed and nothing is taken in', none.record.seen === null && !l0.m.has(old.local.key));
  const full = JSON.stringify({ date: '2026-11-15', names: [...surveyNames, ...rosterNames.filter((n) => !surveyNames.includes(n))] });
  const lf = { getItem: () => full, removeItem: () => {} }, rf = await R.read(fake(old.v2, OWN), lf);
  yes('P4: an old local copy of the whole catalogue (snapshot and roster) fits the record', !!rf.record.seen && rf.record.seen.names.split('|').length >= surveyNames.length, `${rf.record.seen && rf.record.seen.names.length} characters`);
}

/* ---- P5 reach, through Labs OS itself ---- */
{
  const os = await LabsOS.init({ lab: 'exomania', idb: null, fixture: null, ui: false, lifecycle: false });
  const name = skyNames.find((n) => surveyKnown(n));
  await R.update(os, (r) => R.setOverdue(r, { planet: name, place: { lat: 41.39, lon: 2.17 } }, skyKnown));
  await R.update(os, (r) => R.visit(r, { name, t: T, via: 'sky', at: '2031-03-12' }, skyKnown));
  await R.update(os, (r) => R.save(r, { name, t: T + 1, view: 'surface' }, surveyKnown));
  await R.seeCatalogue(os, surveyNames.slice(0, 50), { day: '2026-11-16', keep: true });
  const mine = await R.load(os), ex = await os.privacy.exportAll();
  const kept = ex.progress.filter((p) => p.lab === 'exomania');
  yes('P5: the export holds the lab\'s one record whole, at version 3: the sky\'s slice, the log and the catalogue seen', kept.length === 1 && kept[0].v === 3 && same(kept[0].data, mine) && mine.log.visits[0].via === 'sky' && !!mine.seen && mine.overdue.place !== null);
  const del = await os.privacy.deleteAll();
  yes('P5: the erase leaves none of it', del.ok && (await os.progress.get()) === null && same(await R.load(os), R.empty()) && (await os.privacy.exportAll()).progress.length === 0);
  os.close(); LabsOS.reset();
}

/* ---- P6 bounded ---- */
{
  const longest = Math.max(...[...surveyNames, ...rosterNames, ...skyNames].map((n) => n.length));
  yes('P6: every planet name of both catalogues is plain ASCII and far under the 80 characters a name may have', [...surveyNames, ...rosterNames, ...skyNames].every((n) => /^[\x20-\x7e]+$/.test(n)) && longest <= 40, `longest ${longest}`);
  const nm = (i, k = 80) => `${'x'.repeat(k - 8)}${String(i).padStart(8, '0')}`;
  const worst = R.empty();
  worst.overdue = { planet: nm(0), place: { lat: -89.123456789012345, lon: -179.12345678901234 } };
  worst.log.visits = Array.from({ length: R.LIMITS.visits }, (_, i) => ({ name: nm(i), t: 1e13 + i, via: 'results', n: 1e15, at: '2031-03-12' }));
  worst.log.saved = Array.from({ length: R.LIMITS.saved }, (_, i) => ({ name: nm(i), t: 1e13 + i, view: 'closeorbit' }));
  worst.log.pins = [nm(1), nm(2), nm(3)];
  worst.log.dropped = R.LIMITS.dropped;
  worst.seen = { day: '2026-11-16', names: 'x'.repeat(R.LIMITS.seen) };
  const sound = R.normalise(worst), bytes = Buffer.byteLength(JSON.stringify(sound));
  yes('P6: a record at every bound, with every name 80 characters long, is read whole', sound.log.visits.length === 500 && sound.log.saved.length === 200 && sound.log.pins.length === 3 && !!sound.seen && sound.seen.names.length === 150000);
  yes(`P6: and is ${bytes} bytes, under Labs OS's cap of ${MAX_PROGRESS_BYTES}`, bytes < MAX_PROGRESS_BYTES);
  const os = await LabsOS.init({ lab: 'exomania', idb: null, fixture: null, ui: false, lifecycle: false });
  let err = '';
  try { await os.progress.set(sound, { v: R.V }); } catch (e) { err = e.message; }
  yes('P6: Labs OS stores it', err === '', err);
  os.close(); LabsOS.reset();
  // room for the catalogue to grow: when it is spent, see() refuses and the survey says nothing is new (TOO_LONG)
  const today = [...new Set([...surveyNames, ...rosterNames])].join('|').length, room = Math.floor((R.LIMITS.seen - today) / (longest + 1));
  yes(`P6: the catalogue of today (${today} characters) leaves room for ${room} more names as long as its longest, over 2,000`, room > 2000);
}

/* ---- P7 health ---- */
{
  const os = await LabsOS.init({ lab: 'exomania', idb: null, fixture: null, ui: false, lifecycle: false });
  const h0 = await R.health(os);
  await R.update(os, (r) => R.pin(r, surveyNames[0], surveyKnown));
  const h1 = await R.health(os);
  yes('P7: the health check reports the version written, the version stored, the store and no sync', h0.version === 3 && h0.stored === null && h1.stored === 3 && h1.store === 'memory' && h1.persistent === false && h1.synced === false);
  yes('P7: and says so', R.healthWords(h1) === 'This page writes version 3 of the record, and the stored record is version 3. No copy is synced to another device.');
  os.close(); LabsOS.reset();
}

/* ---- P8 the rooms read each other ---- */
{
  yes('P8: the sky\'s line of time is the one record.js bounds a sky visit by', R.SKY_YEARS.from === FIRST_YEAR && R.SKY_YEARS.to === LAST_YEAR);
  const all = skyNames.map((name) => [name, R.visit(R.empty(), { name, t: T, via: 'sky', at: '2031-03-12' }, skyKnown)]);
  yes(`P8: every planet of the sky (${skyNames.length}) can be a visit from the sky`, skyNames.length > 4000 && all.every(([, w]) => w.ok));
  const back = all.map(([name, w]) => { const e = w.record.log.visits[0]; const q = new URLSearchParams(R.skyLink(e).split('?')[1]); return [name, R.skyLink(e).startsWith('exomania.html?'), q.get('planet'), q.get('date')]; });
  yes('P8: and its line links to the sky on that planet at that day, read back as the sky reads its address', back.every(([name, page, p, d]) => page && p === name && d === '2031-03-12'), JSON.stringify(back.find(([name, page, p, d]) => !(page && p === name && d === '2031-03-12'))));
  const onSky = R.visit(R.empty(), { name: 'HD 209458 b', t: T, via: 'sky', at: '2031-03-12' }, skyKnown).record;
  const seen = R.view(onSky, surveyKnown).record.log.visits;
  yes('P8: the survey\'s log shows a sky visit with its way and day', seen.length === 1 && R.visitWords(seen[0]) === 'from the sky' && seen[0].at === '2031-03-12' && R.skyWords(seen[0]) === 'its clock on 12 March 2031');
  // Not checked here: that the survey's catalogue has every planet of the sky. On 2026-11-16 it had all 4,801, two of
  // them only through the weekly roster, which the data workflow rewrites; a sky visit of a planet the survey lacks
  // is kept in the store and counted as hidden, as any entry the catalogue lacks.
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
