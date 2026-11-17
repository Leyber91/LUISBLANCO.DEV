/* ============================================================
   Sheet B's rows for the orbit, the starlight, the star and the
   equilibrium temperature (views/target.js sheetRows), on built
   cases. Run from the repository root:
     node labs/assets/js/exoplanet/tests/sheet.test.mjs

   What it holds: the archive's orbit and insolation stand in the
   measured group and the page's own in the inferred group (review
   of pull request 50, S3); a value with no range says it is a point
   value; the star's note names the luminosity's source; and the
   table createTarget draws holds those rows, under a heading taken
   from them (a minimal stand-in for the page's DOM below: on
   bcb5b88 a comment swallowed the call that drew the inferred rows
   and no test saw it). No catalogue, so sheet.mutants.test.mjs can
   run it many times; the catalogue-wide reading of the sheet is
   onesource.test.mjs.
   ============================================================ */

import { sheetRows, createTarget, inferredHeading, ARCHIVE_HEADING } from '../views/target.js';
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

block('the radius', () => {
  // the archive's radius calculated from a mass (1,540 planets on 2026-11-17) is an estimate, and its row says so where a
  // measured radius gives its error; a measured one gives its error
  const est = where(mk({ method: 'Radial Velocity', measuredR: false, R: 11.2, Rerr1: 1.4, Rerr2: -1.1 }), 'R'), mea = where(mk({}), 'R');
  yes('an estimated radius says "estimated" in its own row, is marked an estimate, and says from what', est.row && est.row.pm === 'estimated' && est.row.kind === 'e' && /estimate from the mass/.test(est.row.note), JSON.stringify(est.row && { pm: est.row.pm, kind: est.row.kind }));
  yes('a measured radius gives its error and is marked measured', mea.row && mea.row.pm !== 'estimated' && mea.row.pm !== '' && mea.row.kind === 'm', JSON.stringify(mea.row && { pm: mea.row.pm, kind: mea.row.kind }));
  // a flag not yet set (science.js radiusEstimated): not an estimate; the page sets it before the first draw
  // (catalog.js provisionalMeasured, tests/counts.test.mjs)
  const open = where(mk({ measuredR: null }), 'R');
  yes('a radius not yet marked either way gives its error, is drawn measured, and is not noted as an estimate', open.row && open.row.pm === mea.row.pm && open.row.kind === 'm' && !/estimate/.test(open.row.note), JSON.stringify(open.row && { pm: open.row.pm, kind: open.row.kind, note: open.row.note }));
});

block('an open range', () => {
  // a radius whose lower error reaches it (ticket 2.20): gravity, density and scale height print no 68% range, and the
  // gravity's note says which value and why; a bounded radius prints its range as before
  const open = sheetRows(mk({ R: 2, Rerr1: 0.5, Rerr2: -2.5, Rerr: 1.5 }), 0.3).inferred, shut = sheetRows(mk({}), 0.3).inferred;
  const at = (rows, k) => rows.find((r) => r.key === k);
  yes('every derived range of an open radius says "no 68% range"', ['g', 'rho', 'H'].every((k) => !at(open, k) || at(open, k).pm === 'no 68% range') && !!at(open, 'g'), ['g', 'rho', 'H'].map((k) => at(open, k) && at(open, k).pm).join(' | '));
  yes('and the gravity\'s note names the radius and its error', /^The radius's lower error \(2.5 on 2 R⊕\) reaches zero/.test(at(open, 'g').note || ''), at(open, 'g').note);
  yes('a bounded radius prints its gravity range and no such note', /\d to \d/.test(at(shut, 'g').pm) && !at(shut, 'g').note, `${at(shut, 'g').pm} | ${at(shut, 'g').note}`);
});

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
  // st: the archive's orbit with its error and no luminosity in the archive, so all three inputs carry an error
  const kep = mk({ P: 10, a: 0.5 }), st = mk({ P: 30, a: 0.2, aErr: 0.01, logL: null, refs: { star: { label: 'Stassun et al. 2017', url: 'x' } } }), arch = mk({ P: null, a: null, logL: null, S: 3 });
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

/* ---------- the table on the page, through a stand-in for the DOM ---------- */
class Text { constructor(t) { this.t = String(t); } get textContent() { return this.t; } }
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {} }; this.own = ''; }
  append(...xs) { for (const x of xs) this.children.push(typeof x === 'string' || typeof x === 'number' ? new Text(x) : x); }
  replaceChildren(...xs) { this.children = []; this.own = ''; this.append(...xs); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
  get clientWidth() { return 800; }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this.own = String(v); }
  all(tag) { const out = []; const walk = (n) => { for (const c of n.children || []) { if (c.tagName === tag) out.push(c); walk(c); } }; walk(this); return out; }
}
block('the table on the page', () => {
  const keep = globalThis.document;
  globalThis.document = { createElement: (t) => new Node(t), createElementNS: (ns, t) => new Node(t), getElementById: () => null };
  try {
    const host = new Node('div'), view = createTarget(host, { state: { sel: null } }, { exportAs() {} });
    for (const p of [mk({ P: 10, a: 0.5 }), mk({ P: 30, a: 0.2, aErr: 0.01, logL: null }), mk({ P: null, a: null, logL: null, S: 3 })]) {
      view.update(p);
      const [meas, inf] = host.all('tbody'), rows = sheetRows(p, view.albedo());
      const keys = (tb) => tb.all('tr').filter((tr) => tr.dataset.row).map((tr) => tr.dataset.row).join();
      const head = (tb) => { const g = tb.all('tr').find((tr) => tr.className === 'g'); return g ? g.textContent : null; };
      yes(`${p.name}: the measured group holds every measured row, under its heading`, keys(meas) === rows.measured.map((r) => r.key).join() && rows.measured.length > 0 && head(meas) === ARCHIVE_HEADING && ARCHIVE_HEADING === 'From the archive', `${keys(meas)} | ${head(meas)}`);
      yes(`${p.name}: the inferred group holds every inferred row, under the heading its rows give`, keys(inf) === rows.inferred.map((r) => r.key).join() && rows.inferred.length > 0 && head(inf) === inferredHeading(rows.inferred), `${keys(inf)} | ${head(inf)}`);
    }
  } finally { globalThis.document = keep; }
});

block('the inferred group\'s heading', () => {
  const r = (lo, hi, pm) => ({ iv: { value: 1, lo, hi }, pm });
  yes('ranges and point values both named where the group holds both', inferredHeading([r(0.9, 1.1, '0.9 to 1.1'), r(null, null, 'point value')]) === 'Inferred: 68% ranges and point values');
  yes('ranges alone, with the draws they come from', inferredHeading([r(0.9, 1.1, ''), { iv: false }]) === 'Inferred: 68% ranges from 400 draws');
  yes('point values alone never promise a range; a value with no range is one, whatever its words', inferredHeading([r(null, null, 'point value'), { iv: false, pm: 'needs the starlight' }]) === 'Inferred: point values' && inferredHeading([{ iv: { value: 0.08 }, pm: 'e 0' }]) === 'Inferred: point values');
  yes('half a range is a point value; a row with no value is neither; with no rows, the bare word', inferredHeading([r(0.9, null, '')]) === 'Inferred: point values' && inferredHeading([{ iv: false }]) === 'Inferred' && inferredHeading([]) === 'Inferred');
  yes('every heading fits a phone: 38 characters at most', ['Inferred: 68% ranges and point values', 'Inferred: 68% ranges from 400 draws'].every((h) => h.length <= 38));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
