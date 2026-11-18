/* ============================================================
   The rules of starlight.js, on cases with known answers. Run
   from the repository root:
     node labs/assets/js/exoplanet/tests/starlight.test.mjs
   No browser, no catalogue: starlight.mutants.test.mjs runs this
   file on a copy of the lab with one rule broken at a time, so it
   stays fast. The catalogue-wide test is onesource.test.mjs; the
   views that must read these rules, tests/routes.test.mjs.
   ============================================================ */

import * as L from '../starlight.js';
import { KOPPARAPU, MC } from '../config.js';
import { CIRCUMBINARY } from '../config.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (name, got, want, tol) => yes(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `${got} (want ${want} ± ${tol})`);
const K = KOPPARAPU;
const TABLE = [0.7265527203831077, -0.8918002639076946, 1196.1288533602662];   // the first and last deviates of the table and their sum of squares
const block = (name, f) => { try { f(); } catch (e) { failed++; console.log(`FAIL  ${name} stopped on an error: ${e && e.message}`); } };
const STAR = { label: 'Stassun et al. 2017', url: 'x' }, OTHER = { label: 'Torres et al. 2015', url: 'y' };

/* ---------- the luminosity and the orbit ---------- */
block('the luminosity and the orbit', () => {
  const sun = L.luminosity({ Teff: 5772, Rs: 1, logL: 0.3 });
  yes('the luminosity is the archive\'s wherever it lists one, whatever the radius and temperature give', Math.abs(sun.L - Math.pow(10, 0.3)) < 1e-12 && sun.src === 'archive' && sun.fromStar === 1 && Math.abs(sun.archive - Math.pow(10, 0.3)) < 1e-12);
  yes('with no log L, R² (Teff / 5772 K)⁴', L.luminosity({ Teff: 5772, Rs: 1 }).L === 1 && L.luminosity({ Teff: 5772, Rs: 1 }).src === 'R and Teff' && L.luminosity({ Teff: 5772, Rs: 1 }).archive === null);
  near('a star of half the radius at the same temperature has a quarter of the luminosity', L.luminosity({ Teff: 5772, Rs: 0.5 }).L, 0.25, 1e-12);
  near('a star twice as hot, sixteen times', L.luminosity({ Teff: 11544, Rs: 1 }).L, 16, 1e-12);
  yes('with no radius the archive\'s log L, and nothing from the star', L.luminosity({ Teff: 5772, Rs: null, logL: -1 }).src === 'archive' && Math.abs(L.luminosity({ Teff: 5772, Rs: null, logL: -1 }).L - 0.1) < 1e-12 && L.luminosity({ Teff: 5772, Rs: null, logL: -1 }).fromStar === null);
  yes('a log L of zero is the Sun\'s luminosity, a value', L.luminosity({ logL: 0 }).L === 1 && L.luminosity({ logL: 0 }).src === 'archive');
  yes('a radius or temperature of zero is not a star\'s', L.luminosity({ Teff: 5772, Rs: 0 }).src === 'none' && L.luminosity({ Teff: 0, Rs: 1 }).src === 'none' && L.luminosity({ Teff: 5772, Rs: 0, logL: -1 }).fromStar === null);
  yes('a value given as a string, or not finite, is not a star\'s', L.luminosity({ Teff: '5772', Rs: 1 }).src === 'none' && L.luminosity({ Teff: 5772, Rs: Infinity }).src === 'none' && L.luminosity({ logL: '0' }).src === 'none' && L.starlight({ name: 'str', host: 'Str', Teff: '5772', Rs: 1, a: 1 }).src === 'none');
  yes('with neither there is none', L.luminosity({ Teff: null, Rs: null, logL: null }).L === null && L.luminosity({}).src === 'none');
  yes('the luminosity from the radius and temperature is named when it is more than 1.2 times the archive\'s, either way, and not at 1.2', !L.luminosityDiffers({ L: 1, fromStar: 1.2, src: 'archive' }) && L.luminosityDiffers({ L: 1, fromStar: 1.2001, src: 'archive' })
    && !L.luminosityDiffers({ L: 1.2, fromStar: 1, src: 'archive' }) && L.luminosityDiffers({ L: 1.2001, fromStar: 1, src: 'archive' }) && !L.luminosityDiffers({ L: 1, fromStar: 3, src: 'R and Teff' }) && !L.luminosityDiffers({ L: 1, fromStar: null, src: 'archive' }));
  // the orbit (backtest_orbit.py, 2026-11-17)
  yes('the orbit is Kepler\'s third law from the period and the star\'s mass, whatever the archive lists', L.semiMajor({ a: 0.5, P: 365.25, Ms: 8 }).a === 2 && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8 }).src === "Kepler's third law" && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8 }).archive === 0.5 && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, aErr: 0.1 }).err === 0);
  yes('the archive\'s orbit where the period or the star\'s mass is missing, with its error', L.semiMajor({ a: 0.5, P: null, Ms: 1 }).a === 0.5 && L.semiMajor({ a: 0.5, P: 365.25 }).src === 'archive' && L.semiMajor({ a: 0.5, P: 365.25, Ms: 0 }).src === 'archive' && L.semiMajor({ a: 0.5, aErr: 0.02 }).err === 0.02 && L.semiMajor({ a: 0.5, aErr: -1 }).err === 0 && L.semiMajor({ a: 0.5 }).why === 'missing'
    && L.semiMajor({ a: null, P: 365.25 }).a === null && L.semiMajor({ a: null, Ms: 1 }).src === 'none' && L.semiMajor({}).archive === null && L.semiMajor({ a: 0, P: null }).src === 'none');
  const two = CIRCUMBINARY[0];
  yes('a planet of two stars takes the archive\'s orbit, with its error, though Kepler\'s law could be applied', L.semiMajor({ name: two, a: 0.5, aErr: 0.01, P: 365.25, Ms: 8 }).a === 0.5 && L.semiMajor({ name: two, a: 0.5, P: 365.25, Ms: 8 }).why === 'two stars' && L.semiMajor({ name: two, a: 0.5, aErr: 0.01, P: 365.25, Ms: 8 }).err === 0.01);
  yes('and has none where the archive gives none: never Kepler\'s law on one star\'s mass', L.semiMajor({ name: two, a: null, P: 365.25, Ms: 8 }).a === null && L.semiMajor({ name: two, a: null, P: 365.25, Ms: 8 }).src === 'none' && L.semiMajor({ name: two, a: null, P: 365.25, Ms: 8 }).why === 'two stars');
  yes('the list carries the 53 names of the archive\'s cb_flag, Kepler-16 b and Kepler-47 c among them', CIRCUMBINARY.length === 53 && CIRCUMBINARY.includes('Kepler-16 b') && CIRCUMBINARY.includes('Kepler-47 c'), `${CIRCUMBINARY.length}`);
  yes('a star whose reference is Stassun et al. 2017 takes the archive\'s orbit, by the reference\'s name', L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: { star: STAR } }).a === 0.5 && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: { star: STAR } }).why === 'star mass' && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: { star: { label: ' Stassun et al. 2017 ' } } }).a === 0.5 && L.STASSUN === 'Stassun et al. 2017');
  yes('another reference, or none, keeps Kepler\'s law; and Stassun et al. 2017 with no archive orbit too', L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: { star: OTHER } }).a === 2 && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: {} }).a === 2 && L.semiMajor({ a: 0.5, P: 365.25, Ms: 8, refs: { star: null } }).a === 2 && L.semiMajor({ a: null, P: 365.25, Ms: 8, refs: { star: STAR } }).a === 2);
  near('the planet\'s own measured mass is added to the star\'s: Jupiter around the Sun moves 0.0318% out', L.semiMajor({ P: 365.25, Ms: 1, M: 317.8, Mprov: 'Mass' }).a, Math.cbrt(1 + 317.8 * L.M_EARTH_IN_SUN), 1e-12);
  yes('a minimum mass counts as the planet\'s mass; an estimate or no provenance does not', L.semiMajor({ P: 365.25, Ms: 1, M: 317.8, Mprov: 'Msini' }).a > 1.0003 && L.semiMajor({ P: 365.25, Ms: 1, M: 317.8, Mprov: 'Msin(i)/sin(i)' }).a > 1.0003 && L.semiMajor({ P: 365.25, Ms: 1, M: 317.8, Mprov: 'M-R relationship' }).a === 1 && L.semiMajor({ P: 365.25, Ms: 1, M: 317.8 }).a === 1 && L.semiMajor({ P: 365.25, Ms: 1, M: null, Mprov: 'Mass' }).a === 1);
  near('Earth\'s mass in the Sun\'s is 3.003e-6', L.M_EARTH_IN_SUN, 3.0035e-6, 1e-9);
  const o = (a, archive) => ({ a, archive, src: "Kepler's third law" });
  yes('the archive\'s orbit is named when Kepler\'s is more than 10% of it off, either way, and not inside', !L.orbitDiffers(o(1.0999, 1)) && L.orbitDiffers(o(1.1001, 1)) && !L.orbitDiffers(o(0.9001, 1)) && L.orbitDiffers(o(0.8999, 1)) && !L.orbitDiffers({ a: 1, archive: 2, src: 'archive' }) && !L.orbitDiffers(o(1, null)) && L.ORBIT_DIFF === 0.1);
  const BASE = 'The orbit is derived from the period and the star\'s mass, by Kepler\'s third law.';
  yes('the note says where the orbit comes from, and names the archive\'s where it differs, the share taken of the archive\'s as the threshold is', L.orbitNote(o(0.0827, 0.0649)) === `${BASE} The archive lists 0.0649 AU (NASA Exoplanet Archive, PSCompPars); this orbit is 27% wider.` && L.orbitNote(o(0.1, 0.12)).endsWith('this orbit is 17% narrower.') && L.orbitNote(o(0.1, 0.105)) === BASE && L.orbitNote(o(0.889, 1)).endsWith('11% narrower.'), L.orbitNote(o(0.1, 0.12)));
  yes('the archive\'s orbit says why', L.orbitNote({ a: 1, src: 'archive', why: 'missing' }) === 'The orbit is the archive\'s: it lacks the period or the star\'s mass.'
    && L.orbitNote({ a: 1, src: 'archive', why: 'star mass' }) === 'The orbit is the archive\'s: the star\'s values in the snapshot cite Stassun et al. 2017, whose star masses sit a median 19% from other papers\', so Kepler\'s third law is not applied to them.'
    && L.orbitNote({ a: 1, src: 'archive', why: 'two stars' }) === 'The orbit is the archive\'s: the planet orbits two stars, and Kepler\'s third law on one star\'s mass does not give it.');
  yes('with none, why, or nothing', L.orbitNote({ a: null, src: 'none', why: 'two stars' }) === 'The orbit is unknown: the planet orbits two stars, and the archive gives none.' && L.orbitNote({ a: null, src: 'none', why: 'missing' }) === '');
  const sys = [{ name: 'c', a: 0.3, P: 100, Ms: 1 }, { name: 'n', a: null, P: 5 }, { name: 'b', a: 0.5, P: 10, Ms: 1 }, { name: 'm', a: null, P: 2 }, { name: 'z', a: null }];
  yes('a system in the order of the page\'s orbit, not the archive\'s; those with none after, by period, then those with neither', L.byOrbit(sys).map((p) => p.name).join('') === 'bcmnz' && L.byOrbit(sys) !== sys && sys[0].name === 'c', L.byOrbit(sys).map((p) => p.name).join(''));
});

/* ---------- the starlight ---------- */
const earth = { name: 'Earth', host: 'Sun', Teff: 5772, Rs: 1, a: 1, S: null };
block('the starlight', () => {
  const s = L.starlight(earth);
  yes('Earth receives 1 S⊕, from its star where the archive gives no luminosity, with no range when nothing has an error', s.S === 1 && s.src === 'star' && s.lo === null && s.hi === null && s.archive === null && s.ratio === null && s.inputs.join() === 'Teff,Rs,a' && s.drawn.length === 0);
  yes('the same record gives the same answer, once computed', L.starlight(earth) === s && L.insolation === L.starlight);
  const lum = L.starlight({ name: 'l1', host: 'L1', Teff: 5772, Rs: 2, a: 1, logL: 0 });
  yes('the archive\'s luminosity over the square of the orbit wherever the archive gives one: a star the radius would make four times brighter', lum.S === 1 && lum.src === 'luminosity' && lum.inputs.join() === 'L,a', JSON.stringify(lum));
  near('half the distance, four times the starlight', L.starlight({ name: 'x', host: 'L2', a: 0.5, logL: 0 }).S, 4, 1e-12);
  near('ten times the luminosity, ten times the starlight', L.starlight({ name: 'x', host: 'L3', a: 1, logL: 1 }).S, 10, 1e-12);
  near('from the star: half the distance, four times', L.starlight({ name: 'x', host: 'Sun', Teff: 5772, Rs: 1, a: 0.5 }).S, 4, 1e-12);
  near('twice the radius, four times the starlight', L.starlight({ name: 'x', host: 'Big', Teff: 5772, Rs: 2, a: 1 }).S, 4, 1e-12);
  near('a star twice as hot, sixteen times', L.starlight({ name: 'x', host: 'Hot', Teff: 11544, Rs: 1, a: 1 }).S, 16, 1e-12);
  near('the orbit from Kepler\'s law serves when the archive has none', L.starlight({ name: 'x', host: 'K', Teff: 5772, Rs: 1, a: null, P: 365.25, Ms: 8 }).S, 0.25, 1e-12);
  const hd = L.starlight({ name: 'HD-like b', host: 'HD-like', Teff: 5772, Rs: 1, a: 0.5, S: 0.9 });
  yes('the archive\'s insolation is kept beside the computed one, and its ratio', hd.src === 'star' && hd.S === 4 && hd.archive === 0.9 && Math.abs(hd.ratio - 0.225) < 1e-12);
  const noR = L.starlight({ name: 'x', host: 'noR', Teff: 5772, Rs: null, a: 1, S: 0.7 });
  yes('with no luminosity and the star\'s radius missing, the archive\'s insolation', noR.src === 'archive' && noR.S === 0.7 && noR.ratio === 1 && noR.lo === null && noR.inputs.join() === 'S');
  yes('with the temperature or the orbit missing too; with the orbit missing, though the archive gives a luminosity', L.starlight({ name: 'x', host: 'noT', Teff: null, Rs: 1, a: 1, S: 0.7 }).src === 'archive' && L.starlight({ name: 'x', host: 'noA', Teff: 5772, Rs: 1, a: null, S: 0.7 }).src === 'archive' && L.starlight({ name: 'x', host: 'noA2', a: null, logL: 0, S: 0.7 }).src === 'archive');
  yes('an insolation of zero in the archive is no value', L.starlight({ name: 'x', host: 'z', Teff: null, Rs: null, a: null, S: 0 }).src === 'none' && L.starlight({ name: 'x', host: 'z2', Teff: 5772, Rs: 1, a: 1, S: 0 }).archive === null);
  yes('a luminosity with no orbit gives no starlight', L.starlight({ name: 'x', host: 'lo', Teff: null, Rs: null, a: null, logL: 0 }).src === 'none');
  yes('with nothing, none', L.starlight({ name: 'x', host: 'n' }).S === null && L.starlight({ name: 'x', host: 'n2', a: 1 }).src === 'none' && L.starlight({ name: 'x', host: 'n3' }).inputs.length === 0);
  yes('the archive\'s value is shown beside the computed one past 1.2 times either way, and not at 1.2', !L.archiveDiffers({ src: 'star', ratio: 1.2 }) && L.archiveDiffers({ src: 'star', ratio: 1.2001 }) && !L.archiveDiffers({ src: 'star', ratio: 1 / 1.2 }) && L.archiveDiffers({ src: 'star', ratio: 1 / 1.2001 })
    && L.archiveDiffers({ src: 'luminosity', ratio: 1.5 }) && !L.archiveDiffers({ src: 'archive', ratio: 3 }) && !L.archiveDiffers({ src: 'star', ratio: null }) && L.ARCHIVE_DIFF === 1.2);
  const c = L.starlightCensus([earth, { name: 'c1', host: 'C1', a: 1, aErr: 0.1, logL: 0 }, { name: 'c2', host: 'C2', a: 1, P: 365.25, Ms: 1, logL: 0 }, { name: 'c3', host: 'C3', S: 2 }, { name: 'c4', host: 'C4' }, { name: 'c5', host: 'C5', Teff: 5772, TeffErr: 50, Rs: 1, a: 1 }, { name: 'c6', host: 'C6', Teff: 5772, Rs: 1, RsErr: 0.1, a: 1 }, { name: 'c7', host: 'C7', Teff: 5772, TeffErr: 50, Rs: 1, RsErr: 0.1, a: 1, aErr: 0.01 }]);
  yes('the method\'s numbers: how each planet\'s starlight is computed and which carry a range', c.n === 7 && c.luminosity === 2 && c.star === 4 && c.archive === 1 && c.ranged === 1 && c.point === 5 && c.partial === 3, JSON.stringify(c));
});

/* ---------- its range, and two planets of one star ---------- */
block('its range', () => {
  const p = { name: 'e1', host: 'Err', Teff: 5772, TeffErr: 100, Rs: 1, RsErr: 0.05, a: 1, aErr: 0.01 };
  const s = L.starlight(p);
  yes('with errors, the median and a 68% range that holds it, over the errors drawn', s.lo < s.S && s.S < s.hi && Math.abs(s.S - 1) < 0.02 && s.drawn.join() === 'Teff,Rs,a', `${s.lo} ${s.S} ${s.hi}`);
  // the range of S = R² T⁴ / a² from 1.7% in T, 5% in R and 1% in a: about 12% either side
  near('the range is about 12% either side for 1.7% in T, 5% in R and 1% in a (lower)', (s.S - s.lo) / s.S, 0.12, 0.02);
  near('(upper)', (s.hi - s.S) / s.S, 0.125, 0.02);
  yes('one error alone gives no range: a range over some of the errors is narrower than the truth; the others are named as missing', ['TeffErr', 'RsErr', 'aErr'].every((k) => { const q = L.starlight({ name: 'e2', host: `Err ${k}`, Teff: 5772, Rs: 1, a: 1, [k]: k === 'TeffErr' ? 100 : 0.05 }); const w = { TeffErr: 'Teff', RsErr: 'Rs', aErr: 'a' }[k]; return q.lo === null && q.drawn.length === 0 && q.have.join() === w && !L.errorWords(q).missing.includes({ Teff: 'temperature', Rs: 'radius', a: 'orbit' }[w]); }));
  yes('two of the three give none either', L.starlight({ name: 'e2b', host: 'Err two', Teff: 5772, TeffErr: 100, Rs: 1, RsErr: 0.05, a: 1 }).lo === null && L.starlight({ name: 'e2c', host: 'Err two b', Teff: 5772, Rs: 1, RsErr: 0.05, a: 1, aErr: 0.01 }).lo === null);
  yes('an error on an orbit from Kepler\'s law is not drawn', L.starlight({ name: 'e3', host: 'Kep', Teff: 5772, Rs: 1, a: null, P: 365.25, Ms: 1, aErr: 0.5 }).lo === null && L.starlight({ name: 'e3b', host: 'Kep2', Teff: 5772, Rs: 1, a: 1.2, P: 365.25, Ms: 1, aErr: 0.5 }).lo === null);
  yes('a negative or zero error is none', L.starlight({ name: 'e4', host: 'Neg', Teff: 5772, Rs: 1, a: 1, TeffErr: -5, RsErr: 0, aErr: null }).lo === null);
  // the archive's luminosity carries no error in the snapshot, so its starlight is never drawn; the orbit's error is named as had
  const lo = L.starlight({ name: 'lo1', host: 'Lo1', logL: 0, a: 1, aErr: 0.05, Teff: 5772, TeffErr: 300, Rs: 1, RsErr: 0.3 });
  yes('on the archive\'s luminosity no range, though the orbit has an error, and the luminosity named as the missing one', lo.src === 'luminosity' && lo.lo === null && lo.drawn.length === 0 && lo.have.join() === 'a' && L.errorWords(lo).missing === 'the snapshot carries no error on the star\'s luminosity', JSON.stringify(lo));
  const kp = L.starlight({ name: 'lo2', host: 'Lo2', logL: 0, a: 1, aErr: 0.05, P: 365.25, Ms: 1, TeffErr: 300 });
  yes('and on Kepler\'s orbit none: a point value', kp.src === 'luminosity' && kp.lo === null && kp.hi === null && kp.drawn.length === 0 && kp.S === 1);
  const b = { name: 'b', host: 'Two', Teff: 5000, TeffErr: 80, Rs: 0.8, RsErr: 0.04, a: 0.1, aErr: 0.002 }, c = { ...b, name: 'c', a: 0.4, aErr: 0.008 };
  const sb = L.starlight(b), sc = L.starlight(c);
  near('two planets of one star, the orbit\'s error the same share of each: their starlight keeps the ratio of the squares of their orbits', sb.S / sc.S, 16, 1e-9);
  near('and so do their ranges', sb.lo / sc.lo + sb.hi / sc.hi, 32, 1e-9);
  const d = { ...b, name: 'd', host: 'Other', Teff: 10000, TeffErr: 160, Rs: 1.6, RsErr: 0.08, a: 0.2, aErr: 0.004 };
  yes('every star is drawn with the one table of deviates: a star with the same share of error in each input keeps the same range around its value', Math.abs(L.starlight(d).S / sb.S - 16) < 1e-9 && Math.abs(L.starlight(d).lo / sb.lo - 16) < 1e-9 && Math.abs(L.starlight(d).hi / sb.hi - 16) < 1e-9, `${L.starlight(d).S / sb.S}`);
  const Z = L.DEVIATES(), n = MC.draws;
  yes('the table is made once, three deviates a draw', Z === L.DEVIATES() && Z.length === 3 * n);
  const want = Array.from({ length: n }, (_, i) => L.normalQuantile((i + 0.5) / n)), bad = [];
  for (let col = 0; col < 3; col++) { const got = Array.from({ length: n }, (_, k) => Z[3 * k + col]).sort((x, y) => x - y); if (got.some((x, i) => x !== want[i])) bad.push(col); }
  yes('each column holds the normal\'s quantiles at (i + 0.5) / n, each once: its median and 68% range are the normal\'s', bad.length === 0, bad.join());
  const cols = [0, 1, 2].map((col) => Array.from({ length: n }, (_, k) => Z[3 * k + col]).join());
  yes('in three different orders', cols[0] !== cols[1] && cols[1] !== cols[2] && cols[0] !== cols[2] && cols[0] !== want.join());
  const wild = L.starlight({ name: 'w', host: 'Wild', Teff: 3000, TeffErr: 4000, Rs: 0.1, RsErr: 0.5, a: 0.01, aErr: 0.05 });
  yes('draws below zero are left out, and the rest still give a value', Number.isFinite(wild.S) && wild.S > 0 && wild.lo > 0, `${wild.lo} ${wild.S} ${wild.hi}`);
  const neg = L.starlight({ name: 'w2', host: 'Wild2', logL: 0, a: 0.01, aErr: 0.05 });
  yes('on the luminosity\'s path nothing is drawn, whatever the orbit\'s error', neg.lo === null && neg.S === 10000 && L.starlightDraws({ name: 'w3', host: 'Wild3', logL: 0, a: 0.01, aErr: 0.05 }) === null, JSON.stringify(neg));
  const dw2 = L.starlightDraws({ name: 'w4', host: 'Wild4', Teff: 3000, TeffErr: 4000, Rs: 0.1, RsErr: 0.5, a: 0.01, aErr: 0.05 });
  yes('the draws kept are those above zero, and no more: 92 of 400 on that star', dw2.length === 92 && Array.from(dw2).every((x) => x > 0), `${dw2.length}`);
  yes(`the draws are the page's ${MC.draws}`, MC.draws === 400);
  const dr = L.starlightDraws(p), drK = L.starlightDraws({ name: 'lo3', host: 'Lo3', logL: 0, a: 1, P: 365.25, Ms: 1 }) || L.starlightDraws({ name: 'lo4', host: 'Lo4', Teff: 5772, Rs: 1, a: 1 });
  const sorted = Array.from(dr).sort((x, y) => x - y);
  yes('the draws themselves, for a quantity drawn with the starlight: those its median and range are taken from; none without errors', dr.length === n && sorted[Math.floor(0.5 * n)] === s.S && sorted[Math.floor(0.16 * n)] === s.lo && sorted[Math.floor(0.84 * n)] === s.hi && drK === null);
  // the draws themselves are fixed: a change to the seed, the order of the deviates, their number or the draws kept moves these
  const pin = (x, w) => Math.abs(x / w - 1) < 1e-12;
  yes('the draws are the same on every machine: a star of 5,772 +- 100 K, 1 +- 0.05 R and 1 +- 0.01 AU', pin(s.S, 1.0051098025699796) && pin(s.lo, 0.8808704437515993) && pin(s.hi, 1.1312798177903396), `${s.S} ${s.lo} ${s.hi}`);
  yes('and with most draws below zero left out', pin(wild.S, 37.62950399892173) && pin(wild.lo, 0.1164114505645139) && pin(wild.hi, 748.6488751102337), `${wild.S} ${wild.lo} ${wild.hi}`);
});

/* ---------- the normal's quantile ---------- */
block('the normal\'s quantile', () => {
  near('the median is 0', L.normalQuantile(0.5), 0, 1e-15);
  near('the 97.5th percent, 1.959964', L.normalQuantile(0.975), 1.959963985, 1e-8);
  near('the 84.134th, one standard deviation', L.normalQuantile(0.8413447460685429), 1, 1e-8);
  near('the 0.1th, in the low tail, -3.090232', L.normalQuantile(0.001), -3.090232306, 1e-8);
  near('the 99.9th, in the high tail', L.normalQuantile(0.999), 3.090232306, 1e-8);
  near('just inside the low tail, the 2nd', L.normalQuantile(0.02), -2.053748911, 1e-8);
  near('just outside it, the 3rd', L.normalQuantile(0.03), -1.880793608, 1e-8);
  near('just inside the high tail, the 98th', L.normalQuantile(0.98), 2.053748911, 1e-8);
  near('just outside it, the 97th', L.normalQuantile(0.97), 1.880793608, 1e-8);
  near('the 16th, as the ranges take it', L.normalQuantile(0.16), -0.994457883, 1e-8);
  near('the first stratum of 400, the 0.125th', L.normalQuantile(0.00125), -3.023341, 1e-5);
});

/* ---------- the shares, found without sorting ---------- */
block('the selection', () => {
  // arrays of every kind the draws give: random, with ties, sorted either way, of one and two
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cases = [[5], [2, 1], [1, 2], [3, 3, 3], [1, 2, 2, 2, 3], Array.from({ length: 400 }, r), Array.from({ length: 401 }, () => Math.floor(r() * 5)), Array.from({ length: 50 }, (_, i) => i), Array.from({ length: 50 }, (_, i) => 50 - i)];
  const bad = [];
  for (const c of cases) { const sorted = c.slice().sort((x, y) => x - y); for (let k = 0; k < c.length; k++) { const a = Float64Array.from(c); if (L.kth(a, k, 0, c.length - 1) !== sorted[k]) bad.push(`${c.length}:${k}`); } }
  yes('every place of every kind of array is the value a sort puts there', bad.length === 0, bad.slice(0, 6).join(' '));
  const a = Float64Array.from(Array.from({ length: 300 }, r)), sorted = Array.from(a).sort((x, y) => x - y), m = L.kth(a, 150, 0, 299);
  yes('what is left of the place is no larger, what is right of it no smaller', m === sorted[150] && Array.from(a.subarray(0, 150)).every((x) => x <= m) && Array.from(a.subarray(151)).every((x) => x >= m));
  const sh = [], one = L.shares(Float64Array.from([4]), 1);
  for (const n of [2, 3, 7, 50, 399, 400]) for (let rep = 0; rep < 20; rep++) {
    const c = Array.from({ length: n }, () => (rep % 3 ? r() : Math.floor(r() * 4))), s = c.slice().sort((x, y) => x - y), got = L.shares(Float64Array.from(c), n);
    const at = (f) => s[Math.min(n - 1, Math.floor(f * n))];
    if (got.S !== at(0.5) || got.lo !== at(0.16) || got.hi !== at(0.84)) sh.push(`${n}/${rep}`);
  }
  yes('the median and the 68% range are the values a sort puts at the 50th, 16th and 84th percent', sh.length === 0 && one.S === 4 && one.lo === 4 && one.hi === 4, sh.slice(0, 6).join(' '));
  const Z = L.DEVIATES();
  yes('the table is the same on every machine, to its last deviate', Math.abs(Z[0] - TABLE[0]) < 1e-15 && Math.abs(Z[Z.length - 1] - TABLE[1]) < 1e-15 && Math.abs(Z.reduce((x, y) => x + y * y, 0) - TABLE[2]) < 1e-9, `${Z[0]} ${Z[Z.length - 1]} ${Z.reduce((x, y) => x + y * y, 0)}`);
  yes('a place looked for inside a part of the array', L.kth(Float64Array.from([9, 4, 1, 3, 2, 0]), 3, 1, 4) === 3 && L.kth(Float64Array.from([9, 4, 1, 3, 2, 0]), 1, 1, 4) === 1);
});

/* ---------- the equilibrium temperature from the same draws ---------- */
block('the equilibrium temperature', () => {
  near('T_ZERO is 278.3 K', L.T_ZERO, 278.33, 0.01);
  near('Earth at albedo 0.3: 254.6 K', L.equilibriumTemp(earth, 0.3), 254.6, 0.05);
  near('Earth at albedo 0: 278.3 K', L.equilibriumTemp(earth, 0), 278.33, 0.01);
  near('the default albedo is 0.3', L.equilibriumTemp(earth), 254.6, 0.05);
  near('for the range too', L.teqOf(earth).med, 254.6, 0.05);
  const p = { name: 't', host: 'T', Teff: 4000, TeffErr: 120, Rs: 0.7, RsErr: 0.05, a: 0.05, aErr: 0.001 };
  const s = L.starlight(p), t = L.teqOf(p, 0.3);
  const f = (x) => L.T_ZERO * Math.pow(x * 0.7, 0.25);
  yes('the median and range of Teq are those of S, in kelvin, over the same errors', Math.abs(t.med - f(s.S)) < 0.01 && Math.abs(t.lo - f(s.lo)) < 0.01 && Math.abs(t.hi - f(s.hi)) < 0.01 && t.src === 'star' && t.drawn.join() === 'Teff,Rs,a');
  near('and the same as Teff (R / 2a)^½ (1 - A)^¼ with no errors', L.equilibriumTemp({ name: 't2', host: 'T2', Teff: 4000, Rs: 0.7, a: 0.05 }, 0.3), 4000 * Math.sqrt(0.7 * 695700 / 149597870.7 / 0.1) * Math.pow(0.7, 0.25), 1e-6);
  yes('from the archive\'s insolation where the star cannot give one, with no range', L.teqOf({ name: 'x', host: 'tA', Teff: null, S: 1 }, 0.3).src === 'archive' && Math.abs(L.teqOf({ name: 'x', host: 'tA2', Teff: null, S: 1 }, 0.3).med - 254.6) < 0.05 && L.teqOf({ name: 'x', host: 'tA3', S: 1 }).lo === null);
  yes('with no starlight, none', L.teqOf({ name: 'x', host: 'tN' }) === null && L.equilibriumTemp({ name: 'x', host: 'tN2' }) === null);
});

/* ---------- a planet's own heat ---------- */
block('a planet\'s own heat', () => {
  const light = L.equilibriumTemp(earth, 0.3);   // 254.6 K: twice is 509.2 K
  let n = 0;
  const mk = (o) => { n++; return { name: `own ${n}`, host: `Own host ${n}`, Teff: 5772, Rs: 1, a: 1, S: null, method: 'Transit', ...o }; };
  yes('the bound is twice the starlight', L.OWN_HEAT === 2);
  yes('a planet found by imaging is seen by its own heat, with or without a listed temperature', L.ownHeat(mk({ method: 'Imaging', Teq: 20 })) && L.ownHeat(mk({ method: 'Imaging', Teq: null })));
  yes('the method alone counts only for imaging', ['Transit', 'Radial Velocity', 'Astrometry', 'Microlensing'].every((m) => !L.ownHeat(mk({ method: m, Teq: 250 }))));
  yes('a listed temperature over twice the starlight is its own heat; exactly twice, or under, is not', L.ownHeat(mk({ Teq: Math.ceil(2 * light) + 1 })) && !L.ownHeat(mk({ Teq: 2 * light })) && !L.ownHeat(mk({ Teq: Math.floor(2 * light) })), `${Math.ceil(2 * light) + 1} K, ${2 * light} K, ${Math.floor(2 * light)} K`);
  yes('the starlight is taken at albedo 0.3: 530 K is over twice 254.6 K, though under twice the 278.3 K of albedo 0', L.ownHeat(mk({ Teq: 530 })));
  yes('with no starlight to hold it against, a listed temperature is not its own heat', !L.ownHeat(mk({ Teq: 900, Teff: null, Rs: null })));
  yes('with no listed temperature, a planet not imaged is not', !L.ownHeat(mk({ Teq: null })) && !L.ownHeat(mk({})));
  yes('nor with a listed value that is no finite number', !L.ownHeat(mk({ Teq: Infinity })) && !L.ownHeat(mk({ Teq: NaN })));
  // the archive's own insolation at albedo 0.3: S 2 gives 302.8 K, twice is 605.5 K; S 1 gives 254.6 K, twice 509.2 K
  yes('a listed value at its own paper\'s equilibrium is not its own heat, however far this page\'s starlight is from it', !L.ownHeat(mk({ Teq: 600, S: 2 })) && L.ownHeat(mk({ Teq: 600 })));
  yes('over twice both, it is; exactly twice the archive\'s, it is not', L.ownHeat(mk({ Teq: 606, S: 2 })) && !L.ownHeat(mk({ Teq: 2 * L.teqFromS(2, 0.3), S: 2 })));
  yes('an archive insolation that is no positive finite number is not held against it', L.ownHeat(mk({ Teq: 600, S: -1 })) && L.ownHeat(mk({ Teq: 600, S: Infinity })) && L.ownHeat(mk({ Teq: 600, S: 0 })));
  yes('the archive\'s insolation is one formula with the sheet\'s: Earth\'s 1 gives 254.6 K', Math.abs(L.teqFromS(1, 0.3) - L.equilibriumTemp(earth, 0.3)) < 1e-9);
  yes('the archive\'s insolation is read at albedo 0.3 too: 530 K is over twice its 254.6 K at S 1', L.ownHeat(mk({ Teq: 530, S: 1 })));
});

/* ---------- how both are printed ---------- */
block('how both are printed', () => {
  const t = L.starlightText({ S: 0.7503, lo: 0.6, hi: 0.91, src: 'star' });
  yes('the starlight to three figures, its range to two as every range of sheet B, and the unit', t.v === '0.750' && t.pm === '0.60 to 0.91' && t.text === '0.750 S⊕ (68%: 0.60 to 0.91)' && !t.point && L.starlightText({ S: 0.0263, lo: 0.02471, hi: 0.02804 }).pm === '0.025 to 0.028', JSON.stringify(t));
  yes('without a range, the value and that it is a point value', L.starlightText({ S: 2658.4, lo: null, hi: null, src: 'luminosity' }).text === '2,658 S⊕, a point value' && L.starlightText({ S: 2658.4, src: 'star' }).pm === '' && L.starlightText({ S: 2658.4, src: 'star' }).point);
  yes('half a range is no range', L.starlightText({ S: 1, lo: 0.9, hi: null, src: 'star' }).pm === '' && L.starlightText({ S: 1, lo: null, hi: 1.1, src: 'star' }).pm === '');
  yes('the archive\'s own insolation is not called a point value', L.starlightText({ S: 2658.4, src: 'archive' }).text === '2,658 S⊕' && !L.starlightText({ S: 2658.4, src: 'archive' }).point);
  yes('with no starlight, nothing', L.starlightText({ S: null }).text === '' && L.starlightText({ S: 0 }).v === '');
  yes('below 0.001, a power of ten, the value to three figures and the range to two', L.starlightText({ S: 2.6e-7, lo: 2.31e-7, hi: 2.94e-7, src: 'star' }).text === '2.60 × 10⁻⁷ S⊕ (68%: 2.3 × 10⁻⁷ to 2.9 × 10⁻⁷)', L.starlightText({ S: 2.6e-7, lo: 2.31e-7, hi: 2.94e-7, src: 'star' }).text);
  yes('the one formatter: at 0.01 the kit\'s three figures, just below it the power, so AB Aur b\'s 0.006459 keeps three; ten thousand and more grouped', L.starNum(0.01) === '0.0100' && L.starNum(0.00999) === '9.99 × 10⁻³' && L.starNum(0.006459) === '6.46 × 10⁻³' && L.starNum(0.001) === '1.00 × 10⁻³' && L.starNum(0.000722, 3) === '7.22 × 10⁻⁴' && L.starNum(12345.6) === '12,346' && L.starNum(1.5e-12, 2) === '1.5 × 10⁻¹²' && L.SMALL === 0.01, `${L.starNum(0.01)} ${L.starNum(0.00999)} ${L.starNum(0.006459)}`);
  yes('nothing for no number; zero and below as the kit writes them', L.starNum(null) === '' && L.starNum(NaN) === '' && L.starNum(0) === '0' && L.starNum(-0.0005) === '−0.0005');
  const parse = (t) => { const m = t.replace(/,/g, '').replace('−', '-').match(/^(-?[\d.]+)(?: × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?$/); const sup = { '⁻': '-', '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 }; return +m[1] * (m[2] ? Math.pow(10, +[...m[2]].map((ch) => sup[ch]).join('')) : 1); };
  const xs = [2.6049e-7, 0.00099, 0.00123, 0.0015, 0.006459, 0.0123, 0.75049, 12345.6, -1.234e-5, 0, -0.25];
  yes('the number it writes is the number written, for values on each side of 0.01 and of zero', xs.every((x) => Object.is(L.starValue(x), parse(L.starNum(x))) || Math.abs(L.starValue(x) - parse(L.starNum(x))) <= 1e-12 * Math.abs(L.starValue(x))), xs.map((x) => `${L.starNum(x)}=${L.starValue(x)}`).join(' '));
  yes('the number it writes, as a number', L.starValue(2.6049e-7) === 2.6e-7 && L.starValue(0.75049) === 0.75 && L.starValue(12345.6) === 12346 && L.starValue(null) === null && L.starValue(0.00099) === 0.00099 && L.starValue(-0.25) === -0.25);
  const q = L.teqText({ med: 702.6, lo: 662.9, hi: 738.2, src: 'star' });
  yes('the temperature in whole kelvin with its range', q.v === '703' && q.pm === '663 to 738' && q.text === '703 K (68%: 663 to 738)', JSON.stringify(q));
  yes('without a range, a point value; from the archive\'s insolation, the value alone; with none, nothing', L.teqText({ med: 1782.6, lo: null, hi: null, src: 'luminosity' }).text === '1,783 K, a point value' && L.teqText({ med: 1782.6, src: 'archive' }).text === '1,783 K' && L.teqText(null).text === '' && L.teqText({ med: 300, lo: 290, hi: null }).pm === '');
  const ew = (inputs, drawn) => L.errorWords({ inputs, drawn });
  yes('what a range carries, in words, from what was drawn', ew(['Teff', 'Rs', 'a'], ['Teff', 'Rs', 'a']).carried === 'the errors of the star\'s temperature, the star\'s radius and the orbit' && ew(['Teff', 'Rs', 'a'], ['Teff', 'Rs', 'a']).missing === '' && ew(['L', 'a'], ['a']).carried === 'the error of the orbit');
  yes('and what it does not', ew(['L', 'a'], ['a']).missing === 'the snapshot carries no error on the star\'s luminosity' && ew(['L', 'a'], []).missing === 'the snapshot carries no error on the star\'s luminosity or the orbit' && ew(['L', 'a'], []).carried === '' && ew(['Teff', 'Rs', 'a'], ['Rs']).missing === 'the snapshot carries no error on the star\'s temperature or the orbit' && L.errorWords({}).carried === '');
});

/* ---------- what the sheet says about the starlight ---------- */
block('the note', () => {
  const lum = { name: 'n0', host: 'N0', a: 1, logL: 0, P: 365.25, Ms: 1, S: 3 };
  yes('the archive\'s luminosity over the orbit says so, with the units, why there is no range, and the archive\'s insolation where it differs', L.starlightNote(lum) === 'The starlight is the star\'s luminosity, the archive\'s, over the square of the orbit: S = L / a², L in L☉ and a in AU. A point value: the snapshot carries no error on the star\'s luminosity or the orbit. The archive lists 3.00 S⊕ (NASA Exoplanet Archive, PSCompPars), 3.0 times more.', L.starlightNote(lum));
  yes('an orbit with an error and a luminosity without: a point value, naming the luminosity\'s error alone as missing', L.starlightNote({ name: 'n01', host: 'N01', a: 1, aErr: 0.05, logL: 0 }).endsWith('A point value: the snapshot carries no error on the star\'s luminosity.'), L.starlightNote({ name: 'n01', host: 'N01', a: 1, aErr: 0.05, logL: 0 }));
  // past LUMINOSITY_SPLIT the sheet names the disagreement, gives it no cause, and says the starlight rests on the luminosity
  const two = (f, o = {}) => L.starlightNote({ name: `split ${f}`, host: `Split ${f}`, Teff: 5772, Rs: 1, a: 1, logL: Math.log10(f), ...o });
  const SPLIT = 'The archive\'s luminosity and the star\'s radius and temperature differ by a factor of';
  yes('a luminosity 2.001 times the radius and temperature\'s is named as a disagreement with no cause given, and the starlight said to rest on it', two(2.001).includes(`${SPLIT} 2.0; the starlight rests on the luminosity.`) && !/solution|paper/.test(two(2.001)) && L.LUMINOSITY_SPLIT === 2, two(2.001));
  yes('and one 1.999 times is not; nor where it is the smaller, just inside', !two(1.999).includes(SPLIT) && !two(1 / 1.999).includes(SPLIT) && two(1 / 2.001).includes(SPLIT) && two(3.4).includes('differ by a factor of 3.4;'), two(1 / 2.001));
  yes('and not where the radius and temperature give the starlight, or one of them is missing', !two(3, { logL: null }).includes(SPLIT) && !two(3, { Rs: null }).includes(SPLIT));
  yes('the factor either way up, and none without both', L.luminosityApart({ src: 'archive', L: 1, fromStar: 4 }) === 4 && L.luminosityApart({ src: 'archive', L: 4, fromStar: 1 }) === 4 && L.luminosityApart({ src: 'archive', L: 1, fromStar: null }) === null && L.luminosityApart({ src: 'R and Teff', L: 1, fromStar: 1 }) === null);
  const base = 'The starlight is computed from the star\'s temperature and radius and the orbit, S = (R★ / a)² (Teff / 5772 K)⁴ with R★ in R☉ and a in AU: the archive gives the star no luminosity.';
  const hd = { name: 'n1', host: 'N1', Teff: 5772, Rs: 1, a: 0.5, S: 0.9 };
  yes('the starlight from the star says where it comes from, and names the archive\'s value where it differs', L.starlightNote(hd) === `${base} A point value: the snapshot carries no error on the star's temperature, the star's radius or the orbit. The archive lists 0.900 S⊕ (NASA Exoplanet Archive, PSCompPars), 4.4 times less.`, L.starlightNote(hd));
  yes('more, where the archive\'s is larger, and whole from ten times', L.starlightNote({ name: 'n2', host: 'N2', Teff: 5772, Rs: 1, a: 1, S: 1.5 }).endsWith('1.50 S⊕ (NASA Exoplanet Archive, PSCompPars), 1.5 times more.') && L.starlightNote({ name: 'n3', host: 'N3', Teff: 5772, Rs: 1, a: 1, S: 33.5 }).endsWith('34 times more.'),
    L.starlightNote({ name: 'n2', host: 'N2', Teff: 5772, Rs: 1, a: 1, S: 1.5 }));
  yes('and not where the two agree within 1.2 times', !/archive lists/.test(L.starlightNote({ name: 'n4', host: 'N4', Teff: 5772, Rs: 1, a: 1, S: 1.1 })));
  yes('a range over every error says so', L.starlightNote({ name: 'n41', host: 'N41', Teff: 5772, TeffErr: 50, Rs: 1, RsErr: 0.02, a: 1, aErr: 0.01 }) === `${base} Its 68% range carries the errors of the star's temperature, the star's radius and the orbit.`);
  yes('the archive\'s value says what is missing', L.starlightNote({ name: 'n5', host: 'N5', Teff: 5772, Rs: null, a: 1, S: 0.7 }) === 'The archive\'s insolation (NASA Exoplanet Archive, PSCompPars): it lacks the star\'s luminosity and its radius or temperature, so the starlight cannot be computed here.'
    && L.starlightNote({ name: 'n6', host: 'N6', logL: 0, a: null, S: 0.7 }) === 'The archive\'s insolation (NASA Exoplanet Archive, PSCompPars): it lacks the orbit, so the starlight cannot be computed here.'
    && /it lacks the orbit and the star's luminosity and its radius or temperature,/.test(L.starlightNote({ name: 'n7', host: 'N7', Teff: null, Rs: 1, a: null, S: 0.7 })), L.starlightNote({ name: 'n6', host: 'N6', logL: 0, a: null, S: 0.7 }));
  yes('no starlight, no note', L.starlightNote({ name: 'n8', host: 'N8' }) === '');
});

/* ---------- the habitable zone ---------- */
block('the habitable zone', () => {
  const e = L.zoneEdges(5780);
  yes('at 5,780 K each edge is its first coefficient', e.sInner === K.runaway[0] && e.sOuter === K.maxGreen[0] && e.sInnerOpt === K.recentVenus[0] && e.sOuterOpt === K.earlyMars[0] && !e.extrapolated);
  yes('a temperature outside the fit takes the nearer end of it', L.seff(2000, K.runaway) === L.seff(2600, K.runaway) && L.seff(9000, K.maxGreen) === L.seff(7200, K.maxGreen) && L.seff(2601, K.runaway) !== L.seff(2600, K.runaway) && L.seff(7199, K.runaway) !== L.seff(7200, K.runaway));
  yes('and is extrapolated: below 2,600 K and above 7,200 K, not at either end', L.zoneEdges(2599.9).extrapolated && !L.zoneEdges(2600).extrapolated && !L.zoneEdges(7200).extrapolated && L.zoneEdges(7200.1).extrapolated);
  const T = 3000 - 5780, poly = (c) => c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T + c[4] * T * T * T * T;
  yes('away from 5,780 K every term of the polynomial counts: the edges at 3,000 K', ['runaway', 'maxGreen', 'recentVenus', 'earlyMars'].every((k) => Math.abs(L.seff(3000, K[k]) - poly(K[k])) < 1e-12) && Math.abs(poly(K.runaway) - (poly(K.runaway) - K.runaway[4] * T * T * T * T)) > 0.05, `${L.seff(3000, K.runaway)}`);
  yes('no temperature, no edges', L.zoneEdges(null) === null && L.zoneEdges(undefined) === null);
  const hz = L.habitableZone(earth);
  near('the Sun\'s runaway edge, 0.981 AU', hz.inner, 0.981, 0.003);
  near('its maximum greenhouse edge, 1.689 AU', hz.outer, 1.689, 0.003);
  near('its recent Venus edge, 0.750 AU', hz.innerOpt, 0.750, 0.003);
  near('its early Mars edge, 1.766 AU', hz.outerOpt, 1.766, 0.003);
  yes('placed by the starlight', hz.by === 'S' && hz.S === 1 && hz.L === 1);
  const far = { name: 'f', host: 'F', Teff: 5772, Rs: 1, a: 2, S: 3 };
  near('in AU an edge lies where the planet\'s own starlight would be its flux, a √(S / S_edge)', L.habitableZone(far).inner, 2 * Math.sqrt(L.starlight(far).S / L.zoneEdges(5772).sInner), 1e-12);
  const noOrbit = { name: 'o', host: 'O', Teff: 5772, Rs: 0.5, a: null, logL: 0 };
  yes('with no orbit, by the luminosity, the archive\'s where it gives one', L.habitableZone(noOrbit).by === 'L' && Math.abs(L.habitableZone(noOrbit).inner - Math.sqrt(1 / L.zoneEdges(5772).sInner)) < 1e-12 && L.habitableZone(noOrbit).S === null && L.habitableZone({ ...noOrbit, name: 'o2', logL: null }).L === 0.25 && Math.abs(L.habitableZone({ ...noOrbit, name: 'o3', logL: null }).inner - Math.sqrt(0.25 / L.zoneEdges(5772).sInner)) < 1e-12);
  yes('with neither, or no temperature, none', L.habitableZone({ name: 'x', host: 'X', Teff: 5772, S: 1 }) === null && L.habitableZone({ name: 'x', host: 'X2', Teff: null, Rs: 1, a: 1 }) === null);
});

/* ---------- where a planet sits ---------- */
block('where a planet sits', () => {
  const at = (S, Teff = 5780) => L.hzPosition({ name: `at ${S}`, host: `H ${S} ${Teff}`, Teff, Rs: null, a: null, S });
  const e = L.zoneEdges(5780);
  yes('on the conservative edges, conservative', at(e.sInner).key === 'cons' && at(e.sOuter).key === 'cons' && at(0.7).key === 'cons');
  yes('just past them, optimistic', at(e.sInner * 1.0001).key === 'opt' && at(e.sOuter * 0.9999).key === 'opt');
  yes('on the optimistic edges, optimistic; past them, hot and cold', at(e.sInnerOpt).key === 'opt' && at(e.sOuterOpt).key === 'opt' && at(e.sInnerOpt * 1.0001).key === 'hot' && at(e.sOuterOpt * 0.9999).key === 'cold');
  yes('the words of each', at(0.7).label === 'inside the conservative habitable zone' && at(1.5).label === 'inside the optimistic habitable zone' && at(e.sInner * 3).label === '3.0x the flux at the zone\'s inner edge' && at(e.sOuter / 4).label === '4.0x below the flux at the zone\'s outer edge');
  yes('the factor to one decimal, whole from ten, grouped from a hundred', at(e.sInner * 12.4).label.startsWith('12x ') && at(e.sInner * 9.96).label.startsWith('10.0x ') && at(e.sInner * 1234).label.startsWith('1,234x '), at(e.sInner * 12.4).label);
  yes('no temperature or no starlight, unknown', L.hzPosition({ name: 'u', host: 'U', Teff: null, S: 1 }).key === 'unknown' && L.hzPosition({ name: 'u2', host: 'U2', Teff: 5780 }).key === 'unknown' && L.hzPosition({ name: 'u3', host: 'U3' }).label === 'not computable');
  const cold = at(0.5, 2566);
  yes('a star outside the fit says so in the label', cold.extrapolated && cold.key === 'cons' && cold.label === 'inside the conservative habitable zone, extrapolated: the star\'s 2,566 K is outside the 2,600 to 7,200 K the zone was fitted on', cold.label);
  yes('and in every form', L.zoneWords(cold, 'word') === 'conservative, extrapolated' && L.zoneWords(cold, 'reticle') === 'in the conservative habitable zone, extrapolated' && L.zoneWords(cold) === cold.label);
  yes('the sheet\'s words', ['cons', 'opt', 'hot', 'cold', 'unknown'].map((k) => L.zoneWords({ key: k, extrapolated: false }, 'word')).join('|') === 'conservative|optimistic|too hot|too cold|unknown');
  yes('the words under the name', ['cons', 'opt', 'hot', 'cold', 'unknown'].map((k) => L.zoneWords({ key: k, extrapolated: false }, 'reticle')).join('|') === 'in the conservative habitable zone|in the optimistic habitable zone|hotter than the habitable zone|colder than the habitable zone|its zone unknown');
  const hz = { inner: 1, outer: 2, innerOpt: 0.8, outerOpt: 2.2 };
  yes('an orbit is drawn inside the band from its inner to its outer edge, both included', L.placedAt(hz, 1) === 'cons' && L.placedAt(hz, 2) === 'cons' && L.placedAt(hz, 1.5) === 'cons');
  yes('inside the dotted rings past them, both included', L.placedAt(hz, 0.8) === 'opt' && L.placedAt(hz, 2.2) === 'opt' && L.placedAt(hz, 0.9999) === 'opt' && L.placedAt(hz, 2.0001) === 'opt');
  yes('inside or outside both', L.placedAt(hz, 0.7999) === 'hot' && L.placedAt(hz, 2.2001) === 'cold');
  yes('no zone or no orbit, unknown', L.placedAt(null, 1) === 'unknown' && L.placedAt(hz, null) === 'unknown' && L.placedAt(hz, 0) === 'unknown');
  const p = { name: 'self', host: 'Self', Teff: 4500, TeffErr: 90, Rs: 0.7, RsErr: 0.03, a: 0.3, aErr: 0.01 };
  yes('a planet is drawn against its own zone where its starlight places it', L.placedAt(L.habitableZone(p), p.a) === L.hzPosition(p).key, `${L.hzPosition(p).key}`);
  yes('extrapolated words name the fit\'s range', L.extrapolatedWords(7500) === 'extrapolated: the star\'s 7,500 K is outside the 2,600 to 7,200 K the zone was fitted on');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
