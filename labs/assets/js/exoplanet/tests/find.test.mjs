/* ============================================================
   Finding worlds by what they are like (find.js). Run from the
   repository root:
     node labs/assets/js/exoplanet/tests/find.test.mjs

   The rules the page's filter and its list of results use:
   cold and hot, the kind a world is drawn as, one face to its
   star, and the order of a list. Each bound has a planet just
   inside it and one just outside, built here; then the same
   rules are read on the committed catalogue.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COLD_K, HOT_K, OWN_HEAT, kindOf, tempOf, isCold, isHot, hasKind, isLocked, sortValue, orderFor, sortWords, orderWords, rank, kindLine, hitFact } from '../find.js';
import { classify, LOOKS } from '../data.js';
import { sizeClassOf } from '../science.js';
import { loadSnapshot } from '../catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
/* a check that throws is a failed check, with a line that says so, and the run ends there */
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });

/* a planet in both shapes the page carries: the catalogue's fields and the archive's own names */
let serial = 0;
const mk = (o = {}) => {
  const v = { R: 1, M: 1, a: 1, P: 365.25, Teff: 5772, Rs: 1, Ms: 1, Teq: null, S: null, method: 'Transit', dist: 10, year: 2020, measuredR: true, ...o };
  const name = o.name || `test world ${++serial}`;
  return { name, pl_name: name, host: 'test star', ...v, logL: null,
    pl_rade: v.R, pl_masse: v.M, pl_orbsmax: v.a, pl_orbper: v.P, pl_eqt: v.Teq, st_teff: v.Teff, st_rad: v.Rs, st_mass: v.Ms };
};

/* ---- the temperature a world is found by ---- */
{
  yes('the bounds are 200 K and 1,000 K', COLD_K === 200 && HOT_K === 1000);
  const pub = tempOf(mk({ Teq: 321 }));
  yes('a published temperature is used as it is', pub.T === 321 && pub.published === true);
  const comp = tempOf(mk({ Teq: null }));
  yes('with none published it is computed from the starlight: 254.6 K for an Earth at albedo 0.3', comp.published === false && Math.abs(comp.T - 254.6) < 0.5, comp.T.toFixed(1));
  yes('a world whose star has no temperature and no insolation is given no temperature', tempOf(mk({ Teq: null, Teff: null, st_teff: null })) === null);
  yes('the archive\'s insolation is enough to compute one', Math.abs(tempOf(mk({ Teq: null, Teff: null, S: 1 })).T - 254.6) < 0.5);
}

/* ---- cold and hot ---- */
{
  yes('199 K is cold and 200 K is not', isCold(mk({ Teq: 199 })) && !isCold(mk({ Teq: 200 })));
  const near = { a: 0.05, P: 4.1 };   // close in: the starlight gives about 1,140 K
  yes('1,000 K is hot and 999 K is not', isHot(mk({ Teq: 1000, ...near })) && !isHot(mk({ Teq: 999, ...near })));
  yes('a world is not both', !isCold(mk({ Teq: 1500, ...near })) && isHot(mk({ Teq: 1500, ...near })) && !isHot(mk({ Teq: 100 })) && isCold(mk({ Teq: 100 })));
  yes('a computed temperature counts: an Earth at 3 AU is cold, at 1 AU it is not', isCold(mk({ a: 3, P: 1898 })) && !isCold(mk({ a: 1 })));
  yes('a computed temperature counts for hot: an Earth at 0.05 AU is hot', isHot(mk({ a: 0.05, P: 4.1 })) && !isHot(mk({ a: 1 })));
  yes('a world with no temperature at all is neither cold nor hot', !isCold(mk({ Teq: null, Teff: null })) && !isHot(mk({ Teq: null, Teff: null })));
  yes('a planet found by imaging has no equilibrium temperature to be found by, whatever the archive lists for it', tempOf(mk({ Teq: 20, method: 'Imaging' })) === null && tempOf(mk({ Teq: null, method: 'Imaging' })) === null && tempOf(mk({ Teq: 20, method: 'Radial Velocity' })).T === 20);
  yes('so it is not cold, where the same numbers found another way are', !isCold(mk({ Teq: 20, method: 'Imaging' })) && !isCold(mk({ a: 30, P: 60000, method: 'Imaging' })) && isCold(mk({ Teq: 20, method: 'Radial Velocity' })) && isCold(mk({ a: 30, P: 60000, method: 'Transit' })));
  yes('and it is not hot, where the same numbers found another way are', !isHot(mk({ Teq: 1600, a: 0.03, P: 2, method: 'Imaging' })) && isHot(mk({ Teq: 1600, a: 0.03, P: 2, method: 'Transit' })));
  yes('the exception is for imaging alone: a planet found by astrometry or by pulsar timing keeps its temperature', tempOf(mk({ Teq: 150, method: 'Astrometry' })).T === 150 && tempOf(mk({ Teq: 150, method: 'Pulsar Timing' })).T === 150 && tempOf(mk({ Teq: 150, method: 'Microlensing' })).T === 150);
  const light = tempOf(mk({ Teq: null })).T;   // what the starlight gives an Earth: 254.6 K
  yes('a published temperature more than twice what the starlight gives is the planet\'s own heat, and is no equilibrium temperature', OWN_HEAT === 2 && tempOf(mk({ Teq: Math.floor(2 * light) })).T === Math.floor(2 * light) && tempOf(mk({ Teq: Math.ceil(2 * light) + 1 })) === null
    && !isHot(mk({ Teq: 1250 })) && !isCold(mk({ Teq: 1250 })), `${Math.floor(2 * light)} K kept, ${Math.ceil(2 * light) + 1} K not`);
  yes('exactly twice is kept, and a published temperature stands when the starlight is not known', tempOf(mk({ Teq: OWN_HEAT * light })).T === OWN_HEAT * light && tempOf(mk({ Teq: 321, Teff: null })).T === 321 && tempOf(mk({ Teq: 321, Teff: null })).published === true);
  yes('a published temperature below what the starlight gives is kept', tempOf(mk({ Teq: 100 })).T === 100 && tempOf(mk({ Teq: 100 })).published === true);
  yes('a published temperature that is not a number is passed over for the computed one', tempOf(mk({ Teq: NaN })).published === false && Math.abs(tempOf(mk({ Teq: NaN })).T - 254.6) < 0.5);
}

/* ---- the kind, and one face to the star ---- */
{
  const earth = mk();
  yes('an Earth is found as the kind drawn with seas, and as no other', hasKind(earth, ['temperate']) && !hasKind(earth, ['desert', 'ice', 'airless', 'molten', 'shrouded', 'fluid']));
  yes('any of the kinds asked for is enough', hasKind(earth, ['molten', 'temperate']));
  yes('the kind is the picture\'s own', kindOf(earth).look === classify(earth).look && kindOf(earth).label === classify(earth).label);
  const unmeasured = mk({ measuredR: false });
  yes('a radius the archive calculated still gives a kind, because the picture draws it', hasKind(unmeasured, ['temperate']) && kindOf(unmeasured).drawn === true);
  const none = mk({ R: null, measuredR: false });
  yes('a world with no radius in the archive has no kind to be found by', kindOf(none).drawn === false && Object.keys(LOOKS).every((k) => !hasKind(none, [k])));
  yes('one face to the star needs no radius: 0.05 AU is locked, 1 AU is not', isLocked(mk({ R: null, measuredR: false, a: 0.05, P: 4.1 })) && !isLocked(mk({ R: null, measuredR: false, a: 1 })));
  yes('the lock follows the picture', isLocked(mk({ a: 0.3, P: 60 })) === classify(mk({ a: 0.3, P: 60 })).locked && isLocked(mk({ a: 0.6, P: 170 })) === false);
}

/* ---- the order of a list ---- */
{
  const A = mk({ name: 'A', dist: 30, Teq: 150, R: 2 }), B = mk({ name: 'B', dist: 10, Teq: 900, R: 1, a: 0.08, P: 8 }), C = mk({ name: 'C', dist: null, Teq: null, Teff: null, R: 3 }), D = mk({ name: 'D', dist: 20, Teq: 400, R: 0.5 });
  const list = [A, B, C, D], all = () => true, names = (r) => r.hits.map((p) => p.name).join('');
  yes('nearest first, with the world of unknown distance last', names(rank(list, all, { key: 'dist', dir: 1 }, 8)) === 'BDAC');
  yes('farthest first keeps the unknown last', names(rank(list, all, { key: 'dist', dir: -1 }, 8)) === 'ADBC');
  yes('coldest first by the found temperature, the world with none last', names(rank(list, all, { key: 'T', dir: 1 }, 8)) === 'ADBC');
  yes('largest first', names(rank(list, all, { key: 'R', dir: -1 }, 8)) === 'CABD');
  const I = mk({ name: 'I', Teq: 5, method: 'Imaging' });
  yes('an imaged planet comes last in an order by temperature, in either direction', names(rank([I, A, B], all, { key: 'T', dir: 1 }, 8)) === 'ABI' && names(rank([I, A, B], all, { key: 'T', dir: -1 }, 8)) === 'BAI');
  const X = mk({ name: 'X', dist: null }), Y = mk({ name: 'Y', dist: NaN }), Z = mk({ name: 'Z', dist: undefined });
  yes('worlds with no value keep the catalogue\'s order among themselves, and a value that is not a number is no value', names(rank([X, A, Y, B, Z], all, { key: 'dist', dir: 1 }, 8)) === 'BAXYZ' && names(rank([Z, Y, B, X, A], all, { key: 'dist', dir: -1 }, 8)) === 'ABZYX');
  const none = rank([I, mk({ name: 'J', Teq: 1250 })], all, { key: 'T', dir: -1 }, 8), some = rank([I, A], all, { key: 'T', dir: -1 }, 8);
  yes('a ranked list says how many of its worlds have the value it is ordered by', none.known === 0 && none.total === 2 && some.known === 1 && rank(list, all, { key: 'dist', dir: 1 }, 2).known === 3 && rank([], all, { key: 'dist', dir: 1 }, 8).known === 0);
  yes('with none, the order is said to be the catalogue\'s; with one or more, or with no world at all, it is the order asked for', orderWords(none) === 'in catalogue order, since none of them has a value to order by' && orderWords(some) === 'hottest first' && orderWords(rank([], all, { key: 'T', dir: 1 }, 8)) === 'coldest first');
  const r = rank(list, (p) => p.name !== 'B', { key: 'dist', dir: 1 }, 2);
  yes('the total counts every world that passes and the list stops at its limit', r.total === 3 && r.hits.length === 2 && names(r) === 'DA');
  yes('with no limit the whole set comes back', rank(list, all, { key: 'dist', dir: 1 }).hits.length === 4);
  yes('the temperature a list is ordered by is the computed one where none is published', Math.abs(sortValue(mk({ Teq: null }), 'T') - 254.6) < 0.5 && sortValue(mk({ Teq: 77 }), 'T') === 77);
  yes('a question orders nearest first unless it says otherwise; the chips alone, most Earth-like first',
    orderFor(null, true).key === 'dist' && orderFor(null, true).dir === 1 && orderFor(null, false).key === 'earthlike' && orderFor(null, false).dir === -1
    && orderFor({ key: 'R', dir: -1 }, true).key === 'R' && orderFor({ key: 'R', dir: -1 }, false).key === 'R');
  yes('distance and likeness have words for both directions', sortWords({ key: 'dist', dir: -1 }) === 'farthest first' && sortWords({ key: 'earthlike', dir: 1 }) === 'least Earth-like first');
  yes('each order has words, and they turn with its direction', sortWords({ key: 'T', dir: 1 }) === 'coldest first' && sortWords({ key: 'T', dir: -1 }) === 'hottest first' && sortWords({ key: 'dist', dir: 1 }) === 'nearest first'
    && sortWords({ key: 'R', dir: 1 }) === 'smallest first' && sortWords({ key: 'R', dir: -1 }) === 'largest first' && sortWords({ key: 'year', dir: -1 }) === 'most recently found first' && sortWords({ key: 'year', dir: 1 }) === 'earliest found first');
  yes('the period, the starlight and the likeness have words too', sortWords({ key: 'P', dir: 1 }) === 'shortest year first' && sortWords({ key: 'P', dir: -1 }) === 'longest year first'
    && sortWords({ key: 'S', dir: 1 }) === 'least starlight first' && sortWords({ key: 'S', dir: -1 }) === 'most starlight first' && sortWords({ key: 'earthlike', dir: -1 }) === 'most Earth-like first');
  const E = mk(), F = mk({ a: 0.5, P: 129 });
  yes('the starlight a list is ordered by is the computed insolation: 1 for an Earth, 4 at half the distance', Math.abs(sortValue(E, 'S') - 1) < 0.01 && Math.abs(sortValue(F, 'S') - 4) < 0.04, `${sortValue(E, 'S')}, ${sortValue(F, 'S')}`);
  yes('an Earth is more Earth-like than a hot Jupiter, and the list can be ordered by it', sortValue(E, 'earthlike') > sortValue(mk({ R: 12, M: 300, a: 0.05, P: 4.1 }), 'earthlike')
    && names(rank([mk({ name: 'J', R: 12, M: 300, a: 0.05, P: 4.1 }), mk({ name: 'E' })], all, { key: 'earthlike', dir: -1 }, 8)) === 'EJ');
  yes('other fields are ordered by their own value', sortValue(E, 'P') === 365.25 && sortValue(E, 'year') === 2020 && sortValue(E, 'R') === 1);
}

/* ---- what a line of results says ---- */
{
  yes('a measured world is named by the kind it is drawn as', kindLine(mk()) === 'temperate world with seas');
  yes('a calculated radius is said to be one', kindLine(mk({ measuredR: false })) === 'temperate world with seas, radius not measured');
  yes('a world with no radius says so', kindLine(mk({ R: null, measuredR: false })) === 'no radius known');
  const bound = { ...mk({ R: null, measuredR: false }), lim: { R: { v: 15, dir: -1 } } };
  yes('a world with only a lower bound on its radius is named by the size class the bound gives', sizeClassOf(bound) !== null && kindLine(bound) === `${sizeClassOf(bound).label.toLowerCase()} by its radius bound`, kindLine(bound));
  yes('the line carries the value it was ordered by, with its unit', hitFact(mk({ dist: 10 }), 'dist') === 'temperate world with seas, 33 ly' && /, 1\.00 R⊕$/.test(hitFact(mk(), 'R')));
  yes('a computed temperature is marked as computed and a published one is not', /, 255 K computed$/.test(hitFact(mk({ Teq: null }), 'T')) && /, 321 K$/.test(hitFact(mk({ Teq: 321 }), 'T')));
  yes('an unknown distance is said, not left blank', /, distance unknown$/.test(hitFact(mk({ dist: null }), 'dist')));
  yes('a world with no temperature to be found by says so', /, no equilibrium temperature$/.test(hitFact(mk({ Teq: null, Teff: null }), 'T')) && /, no equilibrium temperature$/.test(hitFact(mk({ Teq: 900, method: 'Imaging' }), 'T')));
  yes('a radius is printed to three figures below 100 and whole above', /, 0\.532 R⊕$/.test(hitFact(mk({ R: 0.5321 }), 'R')) && /, 1\.00 R⊕$/.test(hitFact(mk({ R: 1 }), 'R')) && /, 12\.3 R⊕$/.test(hitFact(mk({ R: 12.34, M: 300 }), 'R')) && /, 123 R⊕$/.test(hitFact(mk({ R: 123.4, M: 300 }), 'R')),
    [0.5321, 1, 12.34, 123.4].map((R) => hitFact(mk({ R, M: R > 5 ? 300 : 1 }), 'R')).join(' | '));
  yes('a period is printed the same way', /, 0\.457 d$/.test(hitFact(mk({ P: 0.4567, a: 0.012 }), 'P')) && /, 45\.7 d$/.test(hitFact(mk({ P: 45.67, a: 0.25 }), 'P')) && /, 1,234 d$/.test(hitFact(mk({ P: 1234.4, a: 2.2 }), 'P')));
  yes('the starlight is printed the same way, and a world with none says so', /, 4\.0\d S⊕$/.test(hitFact(mk({ a: 0.5, P: 129 }), 'S')) && /, 0\.25\d S⊕$/.test(hitFact(mk({ a: 2, P: 1033 }), 'S')) && /, no insolation$/.test(hitFact(mk({ Teff: null, Rs: null, a: null, P: null }), 'S')), `${hitFact(mk({ a: 0.5, P: 129 }), 'S')} | ${hitFact(mk({ Teff: null, Rs: null, a: null, P: null }), 'S')}`);
  yes('a world with no year of discovery has a line with the kind alone', hitFact(mk({ year: null }), 'year') === kindLine(mk({ year: null })) && !/null|undefined/.test(hitFact(mk({ year: null }), 'year')));
  yes('the period, the year and the starlight carry their units', /, 365 d$/.test(hitFact(mk(), 'P')) && /, 2020$/.test(hitFact(mk(), 'year')) && /, 1\.00 S⊕$/.test(hitFact(mk(), 'S')), `${hitFact(mk(), 'P')} | ${hitFact(mk(), 'year')} | ${hitFact(mk(), 'S')}`);
  yes('a list ordered by likeness prints the likeness', /, likeness \d\.\d\d$/.test(hitFact(mk(), 'earthlike')), hitFact(mk(), 'earthlike'));
  yes('a missing radius or period is said', /, no radius$/.test(hitFact(mk({ R: null, measuredR: false }), 'R')) && /, no period$/.test(hitFact(mk({ P: null }), 'P')));
}

/* ---- the same rules on the catalogue ---- */
{
  const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  const { list } = await loadSnapshot();
  const cold = list.filter(isCold), hot = list.filter(isHot);
  yes('some worlds are cold and some are hot, and none is both', cold.length > 100 && hot.length > 100 && !cold.some(isHot), `${cold.length} cold, ${hot.length} hot of ${list.length}`);
  yes('no imaged planet is listed as cold or as hot', !cold.some((p) => p.method === 'Imaging') && !hot.some((p) => p.method === 'Imaging') && list.filter((p) => p.method === 'Imaging').length > 50);
  const coldest = rank(list, () => true, { key: 'T', dir: 1 }, 8), hottest = rank(list, () => true, { key: 'T', dir: -1 }, 8);
  yes('the eight coldest and the eight hottest worlds of the whole catalogue are none of them imaged', coldest.hits.length === 8 && hottest.hits.length === 8 && ![...coldest.hits, ...hottest.hits].some((p) => p.method === 'Imaging'), coldest.hits.map((p) => `${p.name} ${Math.round(tempOf(p).T)} K`).join(', '));
  yes('every cold world has a temperature under 200 K, and every hot one 1,000 K or more', cold.every((p) => tempOf(p).T < 200) && hot.every((p) => tempOf(p).T >= 1000));
  const bpc = list.find((p) => p.name === 'bet Pic c');
  yes('bet Pic c, found by radial velocity and listed at its own 1,250 K, has no equilibrium temperature and is not hot', !!bpc && bpc.method === 'Radial Velocity' && bpc.Teq > 1000 && tempOf(bpc) === null && !isHot(bpc), bpc ? `${bpc.method} ${bpc.Teq} K` : 'not in the catalogue');
  const blind = list.filter((p) => tempOf(p) === null);
  yes('the worlds with no temperature at all are in neither set', blind.length > 0 && !blind.some(isCold) && !blind.some(isHot), `${blind.length} with none`);
  for (const k of Object.keys(LOOKS)) {
    const found = list.filter((p) => hasKind(p, [k])), drawn = list.filter((p) => classify(p).physics.radiusKnown && classify(p).look === k);
    yes(`every world drawn as ${k} is found as ${k}, and no other is`, found.length === drawn.length && found.length > 0 && found.every((p) => drawn.includes(p)), `${found.length}`);
  }
  yes('a world is found under one kind only', list.every((p) => Object.keys(LOOKS).filter((k) => hasKind(p, [k])).length <= 1));
  const near = rank(list, isCold, { key: 'dist', dir: 1 }, 8);
  yes('the nearest cold worlds come out in order of distance', near.hits.length === 8 && near.hits.every((p, i) => i === 0 || p.dist >= near.hits[i - 1].dist), near.hits.map((p) => p.name).join(', '));
  console.log(`      cold ${cold.length}, hot ${hot.length}, locked ${list.filter(isLocked).length}, of ${list.length}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
