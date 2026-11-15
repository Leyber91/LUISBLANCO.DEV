/* ============================================================
   The test of the record tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/record.mutants.test.mjs

   Each entry breaks one rule of record.js: a bound moved to
   either side, a check on a write removed, a change applied to
   the page's copy and not to the store's, a name let through
   that the catalogue does not have, a word of the log line
   changed. The broken file is written to a copy of this lab in
   the system's temp folder and record.test.mjs is run on the
   copy (mutants.mjs). Every broken rule must fail a check there.

   Add an entry here with every new rule in record.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WORDS = { search: 'by name', results: 'from a question', tour: 'on a tour', random: 'at random', diagram: 'on the diagram', system: 'in its system', link: 'from a link', log: 'from the log' };
const FROM = { search: 'search', random: 'random', plot: 'diagram', system: 'system', link: 'link', log: 'log' };
const TIME = `const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;`;
const SAVED = `.filter((e) => isName(e.name) && isTime(e.t)).sort(newest))`;
const VISITS = `isName(e.name) && isTime(e.t) && VIAS.includes(e.via)).sort(newest));`;
const WAS = `const was = Number.isInteger(log.dropped) && log.dropped >= 0 ? log.dropped : 0;`;
const DROPPED = `out.log.dropped = Math.min(LIMITS.dropped, was + Math.max(0, visits.length - LIMITS.visits));`;
const CUT = `if (r.log.visits.length > LIMITS.visits) { r.log.dropped = Math.min(LIMITS.dropped, r.log.dropped + r.log.visits.length - LIMITS.visits); r.log.visits.length = LIMITS.visits; }`;
const TWICE = `  if (isSaved(record, name)) return done(record);\n  if (record.log.saved.length >= LIMITS.saved) return refused(record, FULL);`;
const PUT = `r.log.saved.unshift({ name, t, view: VIEWS.includes(v) ? v : 'orbit' });`;
const LINE = '`Your log · ${thousands(c.visited)} visited · ${thousands(c.saved)} saved';
const SHARED = '${shared > 0 ? ` · ${thousands(shared)} shared with you` : \'\'}';
const HIDDEN = `hidden: (record.log.saved.length - saved.length) + (record.log.visits.length - visits.length),`;

const MUTANTS = [
  /* ---- the shape and its bounds ---- */
  ['the record at version 3', `export const V = 2;`, `export const V = 3;`],
  ['201 saved worlds taken', `saved: 200, visits: 500`, `saved: 201, visits: 500`],
  ['199 saved worlds taken', `saved: 200, visits: 500`, `saved: 199, visits: 500`],
  ['501 visits listed', `visits: 500, pins: 3`, `visits: 501, pins: 3`],
  ['499 visits listed', `visits: 500, pins: 3`, `visits: 499, pins: 3`],
  ['four pins', `pins: 3, shared: 24`, `pins: 4, shared: 24`],
  ['two pins', `pins: 3, shared: 24`, `pins: 2, shared: 24`],
  ['25 names read from a link', `shared: 24, dropped`, `shared: 25, dropped`],
  ['23 names read from a link', `shared: 24, dropped`, `shared: 23, dropped`],
  ['a count of dropped visits up to a million and one', `dropped: 1000000 });`, `dropped: 1000001 });`],
  ['a count of dropped visits up to a million less one', `dropped: 1000000 });`, `dropped: 999999 });`],
  ...Object.entries(WORDS).map(([w, words]) => [`the way "${w}" not known`, `${w}: '${words}',`, ``]),
  ['the words for a way changed', `tour: 'on a tour'`, `tour: 'a tour'`],
  ['a fourth view', `['orbit', 'closeorbit', 'surface']`, `['orbit', 'closeorbit', 'surface', 'sideways']`],
  ['the surface view not known', `['orbit', 'closeorbit', 'surface']`, `['orbit', 'closeorbit']`],
  ['the low pass not known', `['orbit', 'closeorbit', 'surface']`, `['orbit', 'surface']`],
  ['a name of 81 characters taken', `const NAME_MAX = 80;`, `const NAME_MAX = 81;`],
  ['a name of 80 characters refused', `const NAME_MAX = 80;`, `const NAME_MAX = 79;`],
  ['an empty name taken', `typeof v === 'string' && v.length > 0 && v.length <= NAME_MAX`, `typeof v === 'string' && v.length <= NAME_MAX`],
  ['a name that is not text taken', `const isName = (v) => typeof v === 'string' && v.length > 0`, `const isName = (v) => v != null && v.length > 0`],
  ['a time of zero taken', TIME, `const isTime = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;`],
  ['a time below zero taken', TIME, `const isTime = (v) => typeof v === 'number' && Number.isFinite(v);`],
  ['a time without end taken', TIME, `const isTime = (v) => typeof v === 'number' && v > 0;`],
  ['a time written as text taken', TIME, `const isTime = (v) => Number.isFinite(Number(v)) && Number(v) > 0;`],
  ['two empty records share their lists', `export const empty = () => ({ overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } });`,
    `const EMPTY = { overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } };\nexport const empty = () => ({ overdue: EMPTY.overdue, log: EMPTY.log });`],

  /* ---- a place ---- */
  ['latitude 91 is a place', `o.lat >= -90 && o.lat <= 90`, `o.lat >= -90 && o.lat <= 91`],
  ['latitude 90 is no place', `o.lat >= -90 && o.lat <= 90`, `o.lat >= -90 && o.lat < 90`],
  ['latitude -91 is a place', `o.lat >= -90 && o.lat <= 90`, `o.lat >= -91 && o.lat <= 90`],
  ['latitude -90 is no place', `o.lat >= -90 && o.lat <= 90`, `o.lat > -90 && o.lat <= 90`],
  ['longitude 181 is a place', `o.lon >= -180 && o.lon <= 180`, `o.lon >= -180 && o.lon <= 181`],
  ['longitude 180 is no place', `o.lon >= -180 && o.lon <= 180`, `o.lon >= -180 && o.lon < 180`],
  ['longitude -181 is a place', `o.lon >= -180 && o.lon <= 180`, `o.lon >= -181 && o.lon <= 180`],
  ['longitude -180 is no place', `o.lon >= -180 && o.lon <= 180`, `o.lon > -180 && o.lon <= 180`],
  ['a place with no longitude taken', `return isNum(o.lat) && isNum(o.lon) && o.lat`, `return isNum(o.lat) && o.lat`],
  ['a place with no latitude taken', `return isNum(o.lat) && isNum(o.lon) && o.lat`, `return isNum(o.lon) && o.lat`],
  ['a place kept with every field it came with', `? { lat: o.lat, lon: o.lon } : null;`, `? o : null;`],

  /* ---- what comes out of the store ---- */
  ['a record of the first shape read as empty', `const od = 'overdue' in d || 'log' in d ? obj(d.overdue) : d;`, `const od = obj(d.overdue);`],
  ['the top level of a record of the second shape read as the first', `const od = 'overdue' in d || 'log' in d ? obj(d.overdue) : d;`, `const od = 'overdue' in d ? obj(d.overdue) : d;`],
  ['a record with a log and no Overdue slice read as the first shape', `const od = 'overdue' in d || 'log' in d ? obj(d.overdue) : d;`, `const od = 'log' in d ? obj(d.overdue) : d;`],
  ['a stored planet that is no name kept', `out.overdue = { planet: isName(od.planet) ? od.planet : null, place: placeOf(od.place) };`, `out.overdue = { planet: od.planet ?? null, place: placeOf(od.place) };`],
  ['a stored place kept unchecked', `out.overdue = { planet: isName(od.planet) ? od.planet : null, place: placeOf(od.place) };`, `out.overdue = { planet: isName(od.planet) ? od.planet : null, place: od.place ?? null };`],
  ['stored lists left in the order they came in', `const newest = (a, b) => b.t - a.t;`, `const newest = () => 0;`],
  ['stored lists put oldest first', `const newest = (a, b) => b.t - a.t;`, `const newest = (a, b) => a.t - b.t;`],
  ['a world stored twice kept twice', `return entries.filter((e) => !seen.has(e.name) && seen.add(e.name)); };`, `return entries; };`],
  ['a saved entry with no time kept', SAVED, `.filter((e) => isName(e.name)).sort(newest))`],
  ['a saved entry with no name kept', SAVED, `.filter((e) => isTime(e.t)).sort(newest))`],
  ['of two saved entries for a world the one stored first is kept', `out.log.saved = once(list(log.saved).map(obj)${SAVED}`, `out.log.saved = once(list(log.saved).map(obj).filter((e) => isName(e.name) && isTime(e.t))).sort(newest)`],
  ['a stored list of saved worlds never cut', `    .slice(0, LIMITS.saved).map(`, `    .map(`],
  ['a stored view kept whatever it says', `.map((e) => ({ name: e.name, t: e.t, view: VIEWS.includes(e.view) ? e.view : 'orbit' }));\n  const visits`, `.map((e) => ({ name: e.name, t: e.t, view: e.view }));\n  const visits`],
  ['a stored view always read as orbit', `.map((e) => ({ name: e.name, t: e.t, view: VIEWS.includes(e.view) ? e.view : 'orbit' }));\n  const visits`, `.map((e) => ({ name: e.name, t: e.t, view: 'orbit' }));\n  const visits`],
  ['a stored saved entry kept with every field it came with', `.map((e) => ({ name: e.name, t: e.t, view: VIEWS.includes(e.view) ? e.view : 'orbit' }));\n  const visits`, `.map((e) => ({ ...e, view: VIEWS.includes(e.view) ? e.view : 'orbit' }));\n  const visits`],
  ['a stored visit with a way the page does not have kept', VISITS, `isName(e.name) && isTime(e.t)).sort(newest));`],
  ['a stored visit with no time kept', VISITS, `isName(e.name) && VIAS.includes(e.via)).sort(newest));`],
  ['of two stored visits to a world the one stored first is kept', `const visits = once(list(log.visits).map(obj).filter((e) => ${VISITS}`, `const visits = once(list(log.visits).map(obj).filter((e) => isName(e.name) && isTime(e.t) && VIAS.includes(e.via))).sort(newest);`],
  ['a stored list of visits never cut', `out.log.visits = visits.slice(0, LIMITS.visits).map(`, `out.log.visits = visits.map(`],
  ['a stored count kept whatever it is', `n: Number.isInteger(e.n) && e.n >= 1 ? e.n : 1 }));`, `n: e.n }));`],
  ['a stored count of zero kept', `n: Number.isInteger(e.n) && e.n >= 1 ? e.n : 1 }));`, `n: Number.isInteger(e.n) && e.n >= 0 ? e.n : 1 }));`],
  ['a stored count that is not whole kept', `n: Number.isInteger(e.n) && e.n >= 1 ? e.n : 1 }));`, `n: e.n >= 1 ? e.n : 1 }));`],
  ['a pin stored twice kept twice', `out.log.pins = [...new Set(list(log.pins).filter(isName))].slice(0, LIMITS.pins);`, `out.log.pins = list(log.pins).filter(isName).slice(0, LIMITS.pins);`],
  ['a stored pin that is no name kept', `out.log.pins = [...new Set(list(log.pins).filter(isName))].slice(0, LIMITS.pins);`, `out.log.pins = [...new Set(list(log.pins))].slice(0, LIMITS.pins);`],
  ['stored pins never cut', `out.log.pins = [...new Set(list(log.pins).filter(isName))].slice(0, LIMITS.pins);`, `out.log.pins = [...new Set(list(log.pins).filter(isName))];`],
  ['the stored count of dropped visits lost', WAS, `const was = 0;`],
  ['a negative count of dropped visits kept', WAS, `const was = Number.isInteger(log.dropped) ? log.dropped : 0;`],
  ['a count of dropped visits that is not whole kept', WAS, `const was = log.dropped >= 0 ? log.dropped : 0;`],
  ['a stored count of dropped visits with no bound', DROPPED, `out.log.dropped = was + Math.max(0, visits.length - LIMITS.visits);`],
  ['stored visits cut off the list are not counted', DROPPED, `out.log.dropped = Math.min(LIMITS.dropped, was);`],
  ['stored visits that fail their checks counted as dropped', DROPPED, `out.log.dropped = Math.min(LIMITS.dropped, was + Math.max(0, list(log.visits).length - LIMITS.visits));`],

  /* ---- one door: what the page shows ---- */
  ['a saved world the catalogue does not have shown', `const saved = record.log.saved.filter((e) => known(e.name)),`, `const saved = record.log.saved,`],
  ['a visit to a world the catalogue does not have shown', `visits = record.log.visits.filter((e) => known(e.name));`, `visits = record.log.visits;`],
  ['a pin the catalogue does not have shown', `pins: record.log.pins.filter(known),`, `pins: record.log.pins,`],
  ['hidden entries not counted', HIDDEN, `hidden: 0,`],
  ['hidden visits not counted', HIDDEN, `hidden: (record.log.saved.length - saved.length),`],
  ['hidden saved worlds not counted', HIDDEN, `hidden: (record.log.visits.length - visits.length),`],
  ['the count of dropped visits lost from what the page shows', `pins: record.log.pins.filter(known), dropped: record.log.dropped } },`, `pins: record.log.pins.filter(known), dropped: 0 } },`],
  ['the Overdue slice lost from what the page shows', `record: { overdue: record.overdue, log: { saved, visits,`, `record: { overdue: { planet: null, place: null }, log: { saved, visits,`],
  ['what the page shows takes the hidden entries out of the record', `const saved = record.log.saved.filter((e) => known(e.name)),`, `const saved = (record.log.saved = record.log.saved.filter((e) => known(e.name))),`],

  /* ---- how the page opened a world ---- */
  ['a world the page opened by itself written as a visit', `  if (self) return null;\n`, ``],
  ['a question\'s list written as a tour', `tour: results ? 'results' : 'tour' };`, `tour: 'tour' };`],
  ['every tour written as a question\'s list', `tour: results ? 'results' : 'tour' };`, `tour: 'results' };`],
  ['a place the list does not have read off the object itself', `return Object.prototype.hasOwnProperty.call(ways, from) ? ways[from] : null;`, `return ways[from] || null;`],
  ...Object.entries(FROM).map(([from, via]) => [`a world opened from "${from}" is no visit`, `${from}: '${via}', `, ``]),
  ['a world opened from the diagram written as from its system', `plot: 'diagram', system: 'system'`, `plot: 'system', system: 'system'`],

  /* ---- a visit ---- */
  ['a visit to a world not in the catalogue written', `const wrong = (name, t, known) => (!isName(name) || !known(name) ? 'that world is not in the catalogue'`, `const wrong = (name, t, known) => (!isName(name) ? 'that world is not in the catalogue'`],
  ['a write with a time that is not a number written', ` : !isTime(t) ? 'the time is not a number' : '');`, ` : '');`],
  ['the reason for a world not in the catalogue changed', `'that world is not in the catalogue' :`, `'unknown world' :`],
  ['the reason for a bad time changed', `? 'the time is not a number' : '');`, `? 'bad time' : '');`],
  ['a visit by a way the page does not have written', `const bad = wrong(name, t, known) || (VIAS.includes(via) ? '' : 'the way the world was reached is not one this page has');`, `const bad = wrong(name, t, known);`],
  ['the reason for an unknown way changed', `'the way the world was reached is not one this page has'`, `'unknown way'`],
  ['a refused write hands back a copy', `const refused = (record, why) => ({ ok: false, why, record });`, `const refused = (record, why) => ({ ok: false, why, record: copy(record) });`],
  ['a refused write says it went through', `const refused = (record, why) => ({ ok: false, why, record });`, `const refused = (record, why) => ({ ok: true, why, record });`],
  ['a write changes the record it was given', `const r = copy(record), i = r.log.visits.findIndex((e) => e.name === name);`, `const r = record, i = r.log.visits.findIndex((e) => e.name === name);`],
  ['a world visited again is listed twice', `const n = i >= 0 ? r.log.visits.splice(i, 1)[0].n + 1 : 1;`, `const n = i >= 0 ? r.log.visits[i].n + 1 : 1;`],
  ['a world visited again is counted once', `const n = i >= 0 ? r.log.visits.splice(i, 1)[0].n + 1 : 1;`, `const n = i >= 0 ? r.log.visits.splice(i, 1)[0].n : 1;`],
  ['a new visit goes to the end of the list', `r.log.visits.unshift({ name, t, via, n });`, `r.log.visits.push({ name, t, via, n });`],
  ['a visit written with no way', `r.log.visits.unshift({ name, t, via, n });`, `r.log.visits.unshift({ name, t, n });`],
  ['the list of visits never cut', CUT, ``],
  ['a dropped visit not counted', CUT, `if (r.log.visits.length > LIMITS.visits) { r.log.visits.length = LIMITS.visits; }`],
  ['a write counts dropped visits past the bound', CUT, `if (r.log.visits.length > LIMITS.visits) { r.log.dropped = r.log.dropped + r.log.visits.length - LIMITS.visits; r.log.visits.length = LIMITS.visits; }`],
  ['the worlds dropped from the list not counted as visited', `visited: record.log.visits.length + record.log.dropped,`, `visited: record.log.visits.length,`],

  /* ---- saving ---- */
  ['a world saved twice is listed twice', TWICE, `  if (record.log.saved.length >= LIMITS.saved) return refused(record, FULL);`],
  ['a world saved twice hands back a copy', TWICE, `  if (isSaved(record, name)) return done(copy(record));\n  if (record.log.saved.length >= LIMITS.saved) return refused(record, FULL);`],
  ['the log never full', TWICE, `  if (isSaved(record, name)) return done(record);`],
  ['the 200th saved world refused', `if (record.log.saved.length >= LIMITS.saved) return refused(`, `if (record.log.saved.length >= LIMITS.saved - 1) return refused(`],
  ['a world already in a full log refused', TWICE, `  if (record.log.saved.length >= LIMITS.saved) return refused(record, FULL);\n  if (isSaved(record, name)) return done(record);`],
  ['the reason for a full log changed', `which is all it takes; take one out first`, `which is its limit`],
  ['a full log refused with no reason', `return refused(record, FULL);`, `return refused(record, '');`],
  ['a saved world goes to the end of the list', PUT, `r.log.saved.push({ name, t, view: VIEWS.includes(v) ? v : 'orbit' });`],
  ['a world saved in whatever view it says', PUT, `r.log.saved.unshift({ name, t, view: v });`],
  ['a world always saved in orbit', PUT, `r.log.saved.unshift({ name, t, view: 'orbit' });`],
  ['saving changes the record it was given', `  const r = copy(record);\n  r.log.saved.unshift(`, `  const r = record;\n  r.log.saved.unshift(`],
  ['taking a world out takes them all out', `r.log.saved = r.log.saved.filter((e) => e.name !== name);`, `r.log.saved = [];`],
  ['taking a world out takes nothing out', `r.log.saved = r.log.saved.filter((e) => e.name !== name);`, `r.log.saved = r.log.saved.filter(() => true);`],
  ['taking out a world that is not there hands back a copy', `  if (!isSaved(record, name)) return done(record);\n`, ``],
  ['saving several saves the ones already saved again', `    if (isSaved(r, name)) continue;\n`, ``],
  ['saving several saves them in the surface view', `const w = save(r, { name, t, view: 'orbit' }, known);`, `const w = save(r, { name, t, view: 'surface' }, known);`],
  ['saving several reads a text as a list of letters', `for (const name of list(names)) {`, `for (const name of (names || [])) {`],
  ['saving several stops at the first that is refused', `if (w.ok) { r = w.record; added++; } else left++;`, `if (w.ok) { r = w.record; added++; } else { left++; break; }`],
  ['saving several does not count what was added', `if (w.ok) { r = w.record; added++; } else left++;`, `if (w.ok) { r = w.record; } else left++;`],
  ['saving several does not count what was left', `if (w.ok) { r = w.record; added++; } else left++;`, `if (w.ok) { r = w.record; added++; }`],
  ['saving several says it is whole when some were left', `return { ok: left === 0, why: left`, `return { ok: true, why: left`],
  ['saving several gives no reason for what was left', `why: left ? \`\${left} could not be added\` : '',`, `why: '',`],
  ['a world is saved wherever a world with a name is', `export const isSaved = (record, name) => record.log.saved.some((e) => e.name === name);`, `export const isSaved = (record, name) => record.log.saved.length > 0;`],

  /* ---- pins and the Overdue slice ---- */
  ['the first three pins kept, not the last', `.slice(-LIMITS.pins);`, `.slice(0, LIMITS.pins);`],
  ['a pin not in the catalogue kept', `r.log.pins = [...new Set(list(names).filter((n) => isName(n) && known(n)))].slice(-LIMITS.pins);`, `r.log.pins = [...new Set(list(names).filter((n) => isName(n)))].slice(-LIMITS.pins);`],
  ['a pin given twice kept twice', `r.log.pins = [...new Set(list(names).filter((n) => isName(n) && known(n)))].slice(-LIMITS.pins);`, `r.log.pins = list(names).filter((n) => isName(n) && known(n)).slice(-LIMITS.pins);`],
  ['the Overdue planet written whatever it is', `r.overdue = { planet: isName(planet) ? planet : null, place: placeOf(place) };`, `r.overdue = { planet: planet, place: placeOf(place) };`],
  ['the Overdue place written unchecked', `r.overdue = { planet: isName(planet) ? planet : null, place: placeOf(place) };`, `r.overdue = { planet: isName(planet) ? planet : null, place: place };`],
  ['writing the Overdue slice changes the record it was given', `  const r = copy(record);\n  r.overdue = {`, `  const r = record;\n  r.overdue = {`],
  ['a copy shares the place', `place: r.overdue.place ? { ...r.overdue.place } : null },`, `place: r.overdue.place },`],
  ['a copy shares the saved entries', `saved: r.log.saved.map((e) => ({ ...e })),`, `saved: r.log.saved,`],
  ['a copy shares the visits', `visits: r.log.visits.map((e) => ({ ...e })),`, `visits: r.log.visits,`],

  /* ---- what the page prints ---- */
  ['numbers printed with no thousands mark', `export const thousands = (n) => String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');`, `export const thousands = (n) => String(n);`],
  ['numbers marked every two figures', `(\\d{3})+(?!\\d)`, `(\\d{2})+(?!\\d)`],
  ['numbers marked with a point', `(?!\\d))/g, ',');`, `(?!\\d))/g, '.');`],
  ['the log line names a shared log when there is none', SHARED, '${` · ${thousands(shared)} shared with you`}'],
  ['the log line never names a shared log', SHARED, ``],
  ['the log line does not name one shared world', SHARED, '${shared > 1 ? ` · ${thousands(shared)} shared with you` : \'\'}'],
  ['the log line counts saved for visited', LINE, '`Your log · ${thousands(c.saved)} visited · ${thousands(c.visited)} saved'],
  ['the words of the log line changed', LINE, '`Log · ${thousands(c.visited)} visited · ${thousands(c.saved)} saved'],

  /* ---- a log in a link ---- */
  ['the link carries every saved world', `record.log.saved.slice(0, LIMITS.shared).map((e) => e.name).join('|');`, `record.log.saved.map((e) => e.name).join('|');`],
  ['the link carries the oldest saved worlds', `record.log.saved.slice(0, LIMITS.shared).map((e) => e.name).join('|');`, `record.log.saved.slice(-LIMITS.shared).map((e) => e.name).join('|');`],
  ['the link joins names with a comma', `.map((e) => e.name).join('|');`, `.map((e) => e.name).join(',');`],
  ['a link read without its bound', `if (names.length < LIMITS.shared && isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;`, `if (isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;`],
  ['a name the catalogue does not have read from a link', `if (names.length < LIMITS.shared && isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;`, `if (names.length < LIMITS.shared && isName(piece) && !names.includes(piece)) names.push(piece); else no++;`],
  ['a name given twice in a link read twice', `if (names.length < LIMITS.shared && isName(piece) && known(piece) && !names.includes(piece)) names.push(piece); else no++;`, `if (names.length < LIMITS.shared && isName(piece) && known(piece)) names.push(piece); else no++;`],
  ['what a link carried and was refused is not counted', `names.push(piece); else no++;`, `names.push(piece);`],
  ['a link read whatever its length', `(typeof value === 'string' ? value.slice(0, 4000) : '')`, `(typeof value === 'string' ? value : '')`],
  ['a link cut at 3,000 characters', `value.slice(0, 4000)`, `value.slice(0, 3000)`],
  ['a link cut at 4,001 characters', `value.slice(0, 4000)`, `value.slice(0, 4001)`],
  ['a link that is not text read', `(typeof value === 'string' ? value.slice(0, 4000) : '')`, `String(value ?? '').slice(0, 4000)`],
  ['names in a link not trimmed', `.split('|').map((s) => s.trim()).filter(Boolean)`, `.split('|').filter(Boolean)`],
  ['an empty piece of a link counted as refused', `.split('|').map((s) => s.trim()).filter(Boolean)`, `.split('|').map((s) => s.trim())`],

  /* ---- Labs OS: one change to what the store holds ---- */
  ['the record asked for at version 1', `const rec = await os.progress.get({ v: V, migrate: (d) => normalise(d) });`, `const rec = await os.progress.get({ v: 1, migrate: (d) => normalise(d) });`],
  ['what loads is not made sound', `  return normalise(rec ? rec.data : null);\n}`, `  return rec ? rec.data : null;\n}`],
  ['a change applied to an empty record and not to the stored one', `  const w = change(cur);`, `  const w = change(empty());`],
  ['a change that changes nothing is written', `  if (w.record !== cur) await os.progress.set(w.record, { v: V });`, `  await os.progress.set(w.record, { v: V });`],
  ['a change is never written', `  if (w.record !== cur) await os.progress.set(w.record, { v: V });\n`, ``],
  ['a write at version 1', `await os.progress.set(w.record, { v: V });`, `await os.progress.set(w.record, { v: 1 });`],
  ['what comes back from a change is the record before it', `  return w;\n}`, `  return { ...w, record: cur };\n}`],
];

process.exit(await runMutants({ here, file: 'record.js', test: 'record.test.mjs', mutants: MUTANTS, data: ['data/exomania/pscomppars-snapshot.json'] }));
