/* ============================================================
   The test of the finding tests, second list. find.mutants.test.mjs
   reached 114 s of the gates' 120 s a file on 2026-11-17, so the
   rules of the line of results are here. Run from the repository
   root:
     node labs/assets/js/exoplanet/tests/find.mutants2.test.mjs

   The line of results: its units, figures and words, and the
   rules of ticket 2.14 there: a world passed over for its own
   heat says so, and not that it has no temperature, since its
   sheet prints the one its starlight gives. Each broken rule must fail a check of find.test.mjs on a
   copy of the lab (kit/tests/mutants.mjs).
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const EARTH = '⊕';   // the Earth sign after R and S

const MUTANTS = [
  /* ---- what a line of results says ---- */
  ['a calculated radius not said to be one', `(p.measuredR ? '' : ', radius not measured')`, `''`],
  ['a measured radius said to be calculated', `(p.measuredR ? '' : ', radius not measured')`, `', radius not measured'`],
  ['a world with no radius left blank', `'no radius known'`, `''`],
  ['a radius bound not said to be one', '`${sc.label.toLowerCase()} by its radius bound`', '`${sc.label.toLowerCase()}`'],
  ['a radius bound ignored', 'return sc ? `${sc.label.toLowerCase()} by its radius bound` : \'no radius known\';', 'return \'no radius known\';'],
  ['a published temperature not named as the archive\'s', '${t.published ? \' published\' : \'\'}`', '`'],
  ['every temperature named as the archive\'s', '${t.published ? \' published\' : \'\'}`', ' published`'],
  ['a distance printed in parsecs', `p.dist * PHYS.PC_LY`, `p.dist`],
  ['a distance with no unit', '`${fmtInt(p.dist * PHYS.PC_LY)} ly`', '`${fmtInt(p.dist * PHYS.PC_LY)}`'],
  ['a temperature with no unit', '`${fmtInt(t.T)} K${', '`${fmtInt(t.T)}${'],
  ['a radius with no unit', '`${fmt(p.R, 3)} R' + EARTH + '`', '`${fmt(p.R, 3)}`'],
  ['a period with no unit', '`${fmt(p.P, 3)} d`', '`${fmt(p.P, 3)}`'],
  ['the starlight with no unit', '`${fmt(insolation(p).S, 3)} S' + EARTH + '`', '`${fmt(insolation(p).S, 3)}`'],
  ['an unknown distance left blank', `'distance unknown'`, `''`],
  ['a missing temperature left blank', `: 'no equilibrium temperature')`, `: '')`],
  ['a missing insolation left blank', `: 'no insolation')`, `: '')`],
  ['a missing year printed as it is stored', `key === 'year' ? (p.year ? String(p.year) : '')`, `key === 'year' ? String(p.year)`],
  ['a value over 100 printed with a decimal', `a >= 100 ? fmtInt(v)`, `a >= 1000 ? fmtInt(v)`],
  ['a value from 10 to 100 printed to two places', `a >= 10 ? v.toFixed(1)`, `a >= 10 ? v.toFixed(2)`],
  ['a value from 1 to 10 printed to one place', `a >= 1 ? v.toFixed(2)`, `a >= 1 ? v.toFixed(1)`],
  ['a value under 1 printed to two places', `: v.toPrecision(d); };`, `: v.toFixed(2); };`],
  ['a radius printed to two figures', '`${fmt(p.R, 3)} R', '`${fmt(p.R, 2)} R'],
  ['a period printed to two figures', '`${fmt(p.P, 3)} d`', '`${fmt(p.P, 2)} d`'],
  ['the starlight printed to two figures', '`${fmt(insolation(p).S, 3)} S', '`${fmt(insolation(p).S, 2)} S'],
  ['worlds with no value put in another order', `isNum(x) ? -1 : isNum(y) ? 1 : 0`, `isNum(x) ? -1 : isNum(y) ? 1 : -1`],
  ['a missing radius left blank', `: 'no radius')`, `: '')`],
  ['a missing period left blank', `: 'no period')`, `: '')`],
  ['the year left out of the line', `key === 'year' ? (p.year ? String(p.year) : '')`, `key === 'year' ? ''`],
  ['the likeness printed with no word', '`likeness ${earthLikeness(p).toFixed(2)}`', '`${earthLikeness(p).toFixed(2)}`'],
  ['the line without the kind', 'return v ? `${k}, ${v}` : k;', 'return v ? v : k;'],
  ['the line without the value', 'return v ? `${k}, ${v}` : k;', 'return k;'],
  ['a world passed over for its own heat said to have no temperature', `: p.method === 'Imaging' || isNum(p.Teq) ? 'seen by its own heat' :`, `:`],
  ['an imaged world with no published temperature said to have none', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `isNum(p.Teq) ? 'seen by`],
  ['a published temperature passed over said to have none', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Imaging' ? 'seen by`],
  ['own heat said without its words', `'seen by its own heat'`, `''`],
  ['own heat said of a world found by transit instead', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Transit' || isNum(p.Teq) ? 'seen by`],
  ['own heat said only of an imaged world with a published temperature', `p.method === 'Imaging' || isNum(p.Teq) ? 'seen by`, `p.method === 'Imaging' && isNum(p.Teq) ? 'seen by`],
];

process.exit(await runMutants({ here, file: 'find.js', test: 'find.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
