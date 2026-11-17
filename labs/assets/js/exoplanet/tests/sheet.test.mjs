/* ============================================================
   Sheet B's rows for the orbit, the starlight, the star and the
   equilibrium temperature (views/target.js sheetRows), on built
   cases. Run from the repository root:
     node labs/assets/js/exoplanet/tests/sheet.test.mjs

   What it holds: the archive's orbit and insolation stand in the
   measured group and the page's own in the inferred group (review
   of pull request 50, S3); a value with no range says it is a point
   value; the star's note names the luminosity's source. No
   catalogue, so sheet.mutants.test.mjs can run it many times; the
   catalogue-wide reading of the sheet is onesource.test.mjs.
   ============================================================ */

import { sheetRows } from '../views/target.js';
import { semiMajor, starlight, starNum, teqOf, teqText } from '../starlight.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const block = (name, f) => { try { f(); } catch (e) { failed++; console.log(`FAIL  ${name} stopped on an error: ${e && e.message}`); } };

const base = { host: 'Sh', method: 'Transit', year: 2020, facility: 'test', R: 1.2, Rerr: 0.1, Rerr1: 0.1, Rerr2: -0.1, M: 2, Merr1: 0.2, Merr2: -0.2, Mprov: 'Mass', Mlim: 0,
  ecc: 0, S: null, Teq: null, b: 0.3, depth: null, dur: null, Teff: 5000, Rs: 0.8, Ms: 0.8, logL: -0.4, dist: 20, aErr: 0.002, TeffErr: 80, RsErr: 0.04,
  refs: {}, lim: {}, measuredR: true };
let n = 0;
const mk = (o) => ({ ...base, name: `Sh ${++n}`, host: `Sh ${n}`, ...o });
const where = (p, k) => { const r = sheetRows(p, 0.3); const m = r.measured.find((x) => x.key === k), i = r.inferred.find((x) => x.key === k); return { group: m ? 'measured' : i ? 'inferred' : 'none', row: m || i || null }; };

block('the orbit', () => {
  const kep = mk({ P: 10, a: 0.5 }), arch = mk({ P: null, a: 0.3 }), none = mk({ P: null, a: null }), two = mk({ name: 'Kepler-451 c', P: 1800, a: null });
  const wk = where(kep, 'a'), wa = where(arch, 'a'), wn = where(none, 'a'), w2 = where(two, 'a');
  yes('Kepler\'s orbit stands in the inferred group, derived', wk.group === 'inferred' && wk.row.kind === 'd' && wk.row.v === '0.0843', JSON.stringify(wk.row && { v: wk.row.v, kind: wk.row.kind }));
  yes('the archive\'s orbit in the measured group, measured, with its source', wa.group === 'measured' && wa.row.kind === 'm' && wa.row.v === '0.300' && wa.row.refs.length === 1);
  yes('no orbit: one row in the measured group that says so', wn.group === 'measured' && wn.row.v === 'none' && where(none, 'a').row.iv === false);
  yes('a planet of two stars with no archive orbit says why it has none', w2.row && w2.row.v === 'none' && w2.row.note === 'The orbit is unknown: the planet orbits two stars, and the archive gives none.', w2.row && w2.row.note);
  yes('Kepler\'s orbit names the archive\'s where they differ, with its source', /The archive lists 0.500 AU/.test(wk.row.note) && wk.row.refs.length === 1 && semiMajor(kep).src === "Kepler's third law");
  const bound = mk({ P: 10, a: null, lim: { a: { v: 0.1, dir: 1 } } }), wb = where(bound, 'a');
  yes('an archive orbit that is only a bound gives way to Kepler\'s, and is not shown as a second orbit', wb.group === 'inferred' && wb.row.v === '0.0843' && sheetRows(bound, 0.3).measured.filter((x) => x.key === 'a').length === 0);
  const boundOnly = mk({ P: null, a: null, lim: { a: { v: 0.1, dir: 1 } } }), wo = where(boundOnly, 'a');
  yes('with no period, the bound is shown as one', wo.group === 'measured' && wo.row.v === '< 0.1' && wo.row.pm === 'upper limit', JSON.stringify(wo.row && { v: wo.row.v, pm: wo.row.pm }));
  yes('and only once: no orbit row in the other group', sheetRows(kep, 0.3).measured.filter((x) => x.key === 'a').length === 0 && sheetRows(arch, 0.3).inferred.filter((x) => x.key === 'a').length === 0);
});

block('the starlight and the equilibrium temperature', () => {
  const kep = mk({ P: 10, a: 0.5 }), st = mk({ P: 30, a: 0.2, aErr: 0.01, refs: { star: { label: 'Stassun et al. 2017', url: 'x' } } }), arch = mk({ P: null, a: null, logL: null, S: 3 });
  const sk = where(kep, 'S'), ss = where(st, 'S'), sa = where(arch, 'S');
  yes('the page\'s starlight in the inferred group; a point value says so', sk.group === 'inferred' && sk.row.v === starNum(starlight(kep).S, 3) && sk.row.pm === 'point value', JSON.stringify(sk.row && { v: sk.row.v, pm: sk.row.pm }));
  yes('with a range where the snapshot carries an error', ss.group === 'inferred' && / to /.test(ss.row.pm) && ss.row.pm !== 'point value', ss.row && ss.row.pm);
  yes('the page\'s starlight derived, with no source unless the archive\'s differs', sk.row.kind === 'd' && sk.row.refs.length === 0 && where(mk({ P: 10, a: 0.5, S: 60 }), 'S').row.refs.length === 0 && where(mk({ P: 10, a: 0.5, S: 200 }), 'S').row.refs.length === 1);
  yes('the archive\'s insolation in the measured group, not called a point value', sa.group === 'measured' && sa.row.v === '3.00' && sa.row.pm === '' && sa.row.kind === 'm' && sa.row.refs.length === 1, JSON.stringify(sa.row && { v: sa.row.v, pm: sa.row.pm }));
  const tk = where(kep, 'teq'), ts = where(st, 'teq'), ta = where(arch, 'teq');
  yes('Teq from a point value is one, and says why', tk.row.v === teqText(teqOf(kep, 0.3)).v && tk.row.pm === 'point value' && /has no range because the starlight has none/.test(tk.row.note), `${tk.row.pm} | ${tk.row.note}`);
  yes('Teq with the starlight\'s range has it, and says nothing of a point', / to /.test(ts.row.pm) && !/no range/.test(ts.row.note));
  yes('Teq from the archive\'s insolation says so', /takes the starlight, the archive's, with the albedo/.test(ta.row.note) && ta.row.pm === '', ta.row.note);
  yes('no starlight, no Teq, and why', where(mk({ P: null, a: null, logL: null, S: null }), 'teq').row.pm === 'needs the starlight');
});

block('the star', () => {
  const note = (o) => where(mk(o), 'star').row.note;
  yes('the luminosity is the archive\'s, said so', /Its luminosity is 0.398 L☉, the archive's\./.test(note({ P: 10, a: 0.5 })), note({ P: 10, a: 0.5 }));
  yes('with the radius and temperature\'s named where they differ by more than 1.2 times', /Its luminosity is 2.00 L☉, the archive's; its radius and temperature give 0.360\./.test(note({ P: 10, a: 0.5, logL: Math.log10(2) })), note({ P: 10, a: 0.5, logL: Math.log10(2) }));
  yes('and from the radius and temperature where the archive gives none', /Its luminosity is 0.360 L☉, from its radius and temperature: the archive gives none\./.test(note({ P: 10, a: 0.5, logL: null })), note({ P: 10, a: 0.5, logL: null }));
  yes('below a thousandth of the Sun\'s, with a power of ten', /Its luminosity is 7.22 × 10⁻⁴ L☉/.test(note({ P: 10, a: 0.05, logL: Math.log10(0.000722) })), note({ P: 10, a: 0.05, logL: Math.log10(0.000722) }));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
