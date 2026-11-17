/* ============================================================
   The views that must read the page's one orbit, starlight and
   albedo (starlight.js), on cases built so that any other source
   gives another answer. Run from the repository root:
     node labs/assets/js/exoplanet/tests/routes.test.mjs

   The review of pull request 50 (2026-11-17) found six places that
   read the one orbit by their code and that no test held there: the
   tour of extreme orbits (tours.js), the order of a system
   (main.js, now starlight.js byOrbit), sheet A's inset
   (views/system.js, now insetModel), the CSV (export.js, now
   csvText), the scale height's temperature (science.js monteCarlo)
   and the bench's albedo (panels.js compareHTML). Each is read here
   on a system whose archive orbits are in the other order from
   Kepler's law, and routes.mutants.test.mjs breaks each one.
   No catalogue: fast, so the mutants can run it many times.
   ============================================================ */

import { semiMajor, starlight, teqOf, teqText, byOrbit, habitableZone, starNum } from '../starlight.js';
import { monteCarlo } from '../science.js';
import { insetModel } from '../views/system.js';
import { csvText } from '../export.js';
import { tourStops } from '../tours.js';
import { compareHTML, chainHTML, methodHTML } from '../panels.js';
import { MC } from '../config.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const block = (name, f) => { try { f(); } catch (e) { failed++; console.log(`FAIL  ${name} stopped on an error: ${e && e.message}`); } };

// one star, two planets: the archive lists b outside c, Kepler's law puts b inside (0.084 against 0.391 AU)
const base = { host: 'Fix', method: 'Transit', year: 2020, facility: 'test', R: 1.2, Rerr: 0, Rerr1: 0, Rerr2: 0, M: 2, Merr1: 0, Merr2: 0, Mprov: 'Mass', Mlim: 0,
  ecc: 0, S: null, Teq: null, b: 0.3, depth: null, dur: null, Teff: 5000, Rs: 0.8, Ms: 0.8, logL: -0.4, dist: 20, aErr: 0.002, TeffErr: 80, RsErr: 0.04,
  refs: {}, lim: {}, measuredR: true };
const mk = (o) => ({ ...base, ...o });
const b = mk({ name: 'Fix b', P: 10, a: 0.5 }), c = mk({ name: 'Fix c', P: 100, a: 0.3 });
// a star whose values cite Stassun et al. 2017: the archive's orbit, with its error; with no luminosity in the archive the
// starlight comes from the star's radius and temperature, and with an error on all three inputs it has draws
const st = mk({ name: 'Fix d', host: 'Fix2', P: 30, a: 0.2, aErr: 0.01, logL: null, refs: { star: { label: 'Stassun et al. 2017', url: 'x' } } });
// the same on the archive's luminosity: the orbit's error alone, so a point value
const stL = mk({ name: 'Fix d2', host: 'Fix2b', P: 30, a: 0.2, aErr: 0.01, refs: { star: { label: 'Stassun et al. 2017', url: 'x' } } });
const EARTH = { name: 'Earth', host: 'Sun', idx: -1, R: 1, Rerr: 0, M: 1, Mprov: 'Mass', Mlim: 0, P: 365.25, a: 1, ecc: 0.0167, S: 1, Teq: 255,
  Teff: 5772, Rs: 1, Ms: 1, logL: 0, dist: null, method: null, year: null, refs: {}, measuredR: true, lim: {} };

block('the fixtures', () => {
  yes('the archive and Kepler\'s law put the two planets in opposite orders', b.a > c.a && semiMajor(b).a < semiMajor(c).a && semiMajor(b).src === "Kepler's third law" && semiMajor(st).src === 'archive', `${semiMajor(b).a} ${semiMajor(c).a}`);
});

block('the order of a system', () => {
  const e = mk({ name: 'Fix e', P: null, a: 0.2 });   // no period: the archive's orbit, between the two
  const o = byOrbit([c, e, b]);
  yes('a system is kept in the order of the page\'s orbit (main.js keeps st.system by byOrbit)', o[0] === b && o[1] === e && o[2] === c, o.map((p) => p.name).join());
});

block('the tour of extreme orbits', () => {
  const stops = tourStops('extreme', [b, c]), wide = stops.find((s) => /widest orbit/.test(s.cap));
  yes('its widest orbit is the widest by the page\'s orbit, printed as sheet B prints it', wide && wide.p === c && wide.cap === `The widest orbit with a measured radius: ${starNum(semiMajor(c).a, 3)} AU.`, wide ? wide.cap : 'none');
});

block('sheet A\'s inset', () => {
  const m = insetModel(b, [b, c]), hz = habitableZone(b);
  yes('it draws each orbit at the page\'s orbit', m.orbits.length === 2 && m.orbits.every((x) => x.a === semiMajor(x.p).a), m.orbits.map((x) => x.a).join());
  yes('and the zone of the selected world', m.hz && m.hz.inner === hz.inner && m.hz.outer === hz.outer);
  const outer = Math.max(semiMajor(b).a, semiMajor(c).a);
  yes('and reaches past the outer orbit, or past the zone where the zone is near', Math.abs(m.reach - (hz.outer / outer < 6 ? Math.max(outer, hz.outer) * 1.08 : outer * 1.15)) < 1e-12, `${m.reach}`);
  const lone = mk({ name: 'Fix i', host: 'Fix6', a: null, P: null }), ml = insetModel(lone, [lone]);
  yes('a world with no orbit draws no orbit, and the inset reaches its floor of a ten-thousandth of an AU', ml.orbits.length === 0 && Math.abs(ml.reach - 1e-4 * 1.15) < 1e-15, `${ml.orbits.length} ${ml.reach}`);
});

block('the CSV', () => {
  const lines = csvText([b, st], 0.3).trim().split('\n'), head = lines[4].split(',');
  const row = (i) => Object.fromEntries(head.map((h, k) => [h, lines[5 + i].split(',')[k]]));
  const r = row(0), s = row(1);
  const five = (x) => +x.toPrecision(5);
  yes('the page\'s orbit and starlight, and the archive\'s beside them under their own names', +r.a_AU_page === five(semiMajor(b).a) && +r.a_AU_archive === 0.5 && +r.insolation_Searth_page === five(starlight(b).S) && r.insolation_Searth_archive === '', JSON.stringify(r).slice(0, 300));
  yes('the starlight\'s 68% range where it has one, blank where it has none', r.insolation_lo68_page === '' && r.insolation_hi68_page === '' && +s.insolation_lo68_page === five(starlight(st).lo) && +s.insolation_hi68_page === five(starlight(st).hi), `${s.insolation_lo68_page} ${s.insolation_hi68_page}`);
  yes('Teq at the albedo asked for, from the page\'s starlight', +r.teq_this_page_K === five(teqOf(b, 0.3).med) && +csvText([b], 0.1).trim().split('\n')[5].split(',')[head.indexOf('teq_this_page_K')] === five(teqOf(b, 0.1).med));
  yes('the preamble names the page\'s orbit and starlight as inferred and the archive\'s as the archive\'s', /# Inferred columns: a_AU_page, the orbit this page uses .*; insolation_Searth_page, the starlight this page uses/.test(lines[2]) && /The archive's own orbit and insolation are a_AU_archive and insolation_Searth_archive\./.test(lines[1]), lines[2].slice(0, 200));
  const own = mk({ name: 'Fix k', host: 'Fix8', a: null, P: null, logL: null, S: 3 }), own2 = { ...own, name: 'Fix l', host: 'Fix9' };
  yes('the preamble says where the page\'s insolation is the archive\'s own, and how many', /equal to insolation_Searth_archive, the archive's own, for the 0 planets here that lack the orbit or the star;/.test(csvText([b], 0.3)) && /for the 1 planet here that lacks the orbit or the star;/.test(csvText([b, own], 0.3)) && /for the 2 planets here that lack/.test(csvText([own, own2], 0.3)));
  yes('the starlight of a star\'s values that cite Stassun et al. 2017 is named so, as the code reads it', /a star whose values cite Stassun et al\. 2017/.test(lines[2]));
});

block('the scale height\'s temperature', () => {
  const ks = monteCarlo(st, 0.3), t = teqOf(st, 0.3);
  yes('it is the starlight\'s own draws: on a fixed gravity its range is the equilibrium temperature\'s', ks.H && Math.abs(ks.H.lo / ks.H.med - t.lo / t.med) < 1e-9 && Math.abs(ks.H.hi / ks.H.med - t.hi / t.med) < 1e-9, `${ks.H && ks.H.lo / ks.H.med} ${t.lo / t.med}`);
  const kb = monteCarlo(b, 0.3);
  yes('and on Kepler\'s orbit, where the starlight is a point value, it has no spread from the temperature', kb.H && kb.H.lo === kb.H.med && kb.H.hi === kb.H.med, kb.H && `${kb.H.lo} ${kb.H.med} ${kb.H.hi}`);
  const k1 = monteCarlo(b, 0.1);
  yes('at the albedo asked for', k1.H && Math.abs(k1.H.med / kb.H.med - Math.pow(0.9 / 0.7, 0.25)) < 1e-9, k1.H && `${k1.H.med / kb.H.med}`);
});

block('the bench\'s albedo', () => {
  const cell = (A) => { const m = compareHTML([b], EARTH, A).match(/<tr><th>Teq<\/th><td>.*?<\/td><td>(.*?)<\/td><\/tr>/); return m ? m[1] : null; };
  yes('the bench prints Teq at the visitor\'s albedo', cell(0.1) === teqText(teqOf(b, 0.1)).text && cell(0.3) === teqText(teqOf(b, 0.3)).text && cell(0.1) !== cell(0.3), `${cell(0.1)} | ${cell(0.3)}`);
});

block('the chain and the method say what was computed and drawn', () => {
  const step = (html, k) => { const m = html.match(new RegExp(`<li><b>${k}</b> <code>(.*?)</code> <span class="ch-v">(.*?)</span>(?: <span class="ch-s">(.*?)</span>)?</li>`)); return m ? { eq: m[1], v: m[2], src: m[3] || '' } : null; };
  const noLum = mk({ name: 'Fix f', host: 'Fix3', logL: null, P: 10 });   // the star's luminosity: R² Teff⁴
  const far = mk({ name: 'Fix g', host: 'Fix4', logL: 0.3 });           // R² Teff⁴ more than 1.2 times off the archive's
  const arch = mk({ name: 'Fix h', host: 'Fix5', logL: null, Teff: null, a: null, P: null, S: 2 });
  const cb = chainHTML(b, 0.3), cs = chainHTML(st, 0.3), cn = chainHTML(noLum, 0.3), cf = chainHTML(far, 0.3), ca = chainHTML(arch, 0.3);
  yes('the luminosity step names its source: the archive\'s, or the radius and temperature\'s, with the other where it differs', step(cb, 'Luminosity').eq === 'L = 10^log L, the archive\'s' && step(cb, 'Luminosity').src === 'archive' && step(cn, 'Luminosity').eq === 'L = R★² (Teff / 5772 K)⁴, R★ in R☉' && step(cn, 'Luminosity').src === 'the archive gives none' && /^R★² \(Teff \/ 5772 K\)⁴ gives /.test(step(cf, 'Luminosity').src), `${step(cf, 'Luminosity').src}`);
  yes('the starlight step gives the formula with its units, and the draws only where there are some', step(cb, 'Insolation').eq === 'S = L / a², L in L☉ and a in AU' && step(cs, 'Insolation').eq === `S = (R★ / a)² (Teff / 5772 K)⁴, R★ in R☉ and a in AU, ${MC.draws} draws over the errors of the star's temperature, the star's radius and the orbit` && step(cn, 'Insolation').eq === 'S = (R★ / a)² (Teff / 5772 K)⁴, R★ in R☉ and a in AU' && step(chainHTML(stL, 0.3), 'Insolation').eq === 'S = L / a², L in L☉ and a in AU' && step(ca, 'Insolation').eq === 'archive value', `${step(cs, 'Insolation').eq} | ${step(cn, 'Insolation').eq}`);
  yes('and what the snapshot carries no error on, from what was drawn', step(cb, 'Insolation').src === 'the snapshot carries no error on the star&#39;s luminosity or the orbit' || step(cb, 'Insolation').src === 'the snapshot carries no error on the star\'s luminosity or the orbit', step(cb, 'Insolation').src);
  yes('the Teq step says whether it is drawn, and gives Teff √(R★ / 2a) only where the star gives the starlight', /, the same draws$/.test(step(cs, 'Teq').eq) && /, from the point value$/.test(step(cb, 'Teq').eq) && /= Teff √\(R★ \/ 2a\) \(1 − A\)\^¼, R★ and a in one unit/.test(step(cn, 'Teq').eq) && !/Teff √/.test(step(cb, 'Teq').eq), `${step(cb, 'Teq').eq} | ${step(cn, 'Teq').eq}`);
  yes('the archive\'s insolation says in the step what the page lacks to compute it', step(ca, 'Insolation').src.includes('PSCompPars): it lacks the orbit') && !step(cb, 'Insolation').src.includes('it lacks'), step(ca, 'Insolation').src);
  yes('the zone step gives the edge in AU by the starlight', /d = a √\(S \/ S_eff\)/.test(step(cb, 'Habitable zone').eq), step(cb, 'Habitable zone').eq);
  const census = { n: 10, luminosity: 7, star: 2, archive: 1, ranged: 3, point: 6, partial: 4 };
  const m = methodHTML({ meta: { rows: 10 }, val: { n: 1, median: 0, p95: 0 }, valley: {}, transit: { depth: { rate: 1, n: 1, median: 1 }, dur: { rate: 1, n: 1, median: 1 } }, teq: {}, hold: {}, rosterNote: '', census });
  yes('the method\'s numbers are the census of what was computed and drawn', m.includes('L is the archive\'s luminosity for 7 planets and R★² (Teff / 5772 K)⁴ for the 2 whose star the archive gives none; the archive\'s own insolation stands for 1 ') && m.includes('only where the snapshot gives every input an error, since a range over some of them would be narrower than the truth: 3 planets have one. The other 6 print a point value and name the error that is missing (4 of them have an error on some input and not on every one)') && m.includes('chosen for the Gaia parallaxes') && !m.includes('2,283'), m.slice(m.indexOf('[REAL] The starlight and Teq'), m.indexOf('[REAL] The starlight and Teq') + 400));
  const one = methodHTML({ meta: { rows: 10 }, val: { n: 1, median: 0, p95: 0 }, valley: {}, transit: { depth: { rate: 1, n: 1, median: 1 }, dur: { rate: 1, n: 1, median: 1 } }, teq: {}, hold: {}, rosterNote: '', census: { ...census, ranged: 1 } });
  yes('one planet with a range is said in the singular', one.includes(': 1 planet has one.'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
