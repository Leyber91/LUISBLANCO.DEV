/* ============================================================
   Exomania engine tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/science.test.mjs
   No browser, no dependencies. Checks the published models on
   reference cases with known answers, then runs the catalogue
   validations on the committed snapshot.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as S from '../science.js';
import { mulberry32 } from '../../kit/rng.js';
import { loadSnapshot } from '../catalog.js';
import { physics, classify } from '../data.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const near = (name, got, want, tol) => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok ? passed++ : failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}: ${got} (want ${want} ± ${tol})`);
};
const yes = (name, cond) => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });

// the Sun-Earth system
const earth = { name: 'Earth', Teff: 5772, Rs: 1, logL: 0, a: 1, P: 365.25, R: 1, Rerr: 0.01, Ms: 1, M: 1, Mprov: 'Mass', Mlim: 0, method: 'Transit' };
near('Earth Teq at Bond albedo 0.3 (K)', S.equilibriumTemp(earth, 0.3), 254.6, 0.5);
const hz = S.habitableZone(earth);
near('Solar runaway-greenhouse edge (AU)', hz.inner, 0.981, 0.003);
near('Solar maximum-greenhouse edge (AU)', hz.outer, 1.689, 0.003);
near('Solar recent-Venus edge (AU)', hz.innerOpt, 0.750, 0.003);
near('Solar early-Mars edge (AU)', hz.outerOpt, 1.766, 0.003);
const g = S.transitGeometry(earth);
near('Earth (Rp/Rs)^2 (ppm)', g.depthUniform * 1e6, 83.9, 0.5);
near('Earth central transit duration (h)', g.T14, 13.1, 0.1);
near('Limb-darkened flux at disc centre, k = 0.1', S.fluxAt(0, 0.1), 1 - 0.01 / (1 - 0.4035 / 3 - 0.2622 / 6), 2e-5);
near('Sun angular diameter from Earth (deg)', S.skyView(earth).angDeg, 0.533, 0.002);
near('Chen & Kipping mean radius at 1 M_earth', S.radiusFromMass(1), 1.008, 0.001);
near('Mean inverse round trip at 5 M_earth', S.massFromRadiusMean(S.radiusFromMass(5)), 5, 1e-6);
near('Seager et al. 2007 pure iron at 1 M_earth (R_earth)', S.seagerRadius(1, S.SEAGER_MATERIALS[0]), 0.789, 0.005);
near('RV semi-amplitude of Earth around the Sun (m/s)', S.rvSemiAmplitude(earth).K, 0.0895, 0.001);
yes('Sun colour is a warm white', S.starColour(5772).hex === '#fff1ea');
yes('An upper limit caps the forecast', S.forecastMass(1.61, 0.05, 2).hi <= 2.0001);

// ---- a positive value with its interval, drawn as a split log-normal (ticket 2.20) ----
{
  // a fixed normal deviate sequence (Box-Muller on a small LCG), so the percentiles below are reproducible
  const u = mulberry32(12345);   // the kit's generator: a period far past the 80,000 numbers these draws use
  const z = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const pct = (sp, n = 40000) => { const d = Array.from({ length: n }, () => S.drawPositive(sp, z())).sort((x, y) => x - y); return { lo: d[Math.floor(0.16 * n)], med: d[Math.floor(0.5 * n)], hi: d[Math.floor(0.84 * n)], min: d[0] }; };
  const lop = S.positiveSpread(2.0, 0.6, -0.3), q = pct(lop);
  near('a lopsided interval 2.0 +0.6 -0.3: the median is the value', q.med, 2.0, 0.02);
  near('and the 16th percentile is the value minus its lower error', q.lo, 1.7, 0.02);
  near('and the 84th percentile is the value plus its upper error', q.hi, 2.6, 0.03);
  yes('and no draw is zero or negative', q.min > 0);
  const wide = pct(S.positiveSpread(1.0, 0.9, -0.9));
  yes(`an error of 90% of the value keeps its 16th percentile at 0.1 and no draw at or below zero (16th ${wide.lo.toFixed(3)}, least ${wide.min.toExponential(2)})`, Math.abs(wide.lo - 0.1) < 0.005 && wide.min > 0);
  const upOnly = S.positiveSpread(3, 0.5, null), downOnly = S.positiveSpread(3, null, -0.5), both = S.positiveSpread(3, 0.5, -0.5);
  yes('one side missing takes the other side\'s size', !!upOnly && !!downOnly && upOnly.sLo === both.sLo && downOnly.sHi === both.sHi);
  yes('no error, or no positive value, is drawn as itself (null)', S.positiveSpread(3, null, null) === null && S.positiveSpread(3, 0, 0) === null && S.positiveSpread(0, 1, -1) === null && S.positiveSpread(null, 1, -1) === null);
  const justIn = S.positiveSpread(1, 0.5, -0.9999), atZero = S.positiveSpread(1, 0.5, -1), past = S.positiveSpread(1, 0.5, -1.2);
  yes('a lower error just short of the value is bounded; one equal to it or past it is open', !justIn.open && atZero.open && past.open);
  yes('an open value draws its lower side as the mirror of its upper in log', atZero.sLo === atZero.sHi && past.sLo === past.sHi);
  // the Monte Carlo draws the radius and a measured mass from both sides of their intervals: g = M / R^2, so with the
  // mass exact the gravity's 16th and 84th percentiles sit at M / (R + up)^2 and M / (R - down)^2, and the other way
  const base = { host: 'X', Teff: 5772, Rs: 1, logL: 0, a: 1, P: 365.25, Ms: 1, Mprov: 'Mass', Mlim: 0, method: 'Transit', lim: {} };
  const rOnly = S.monteCarlo({ ...base, name: 'test 2.20 radius', R: 2, Rerr1: 0.6, Rerr2: -0.3, Rerr: 0.45, M: 8, Merr1: null, Merr2: null }, 0.3);
  near('a lopsided radius, the mass exact: the gravity\'s 16th percentile is M / (R + up)^2', rOnly.g.lo, 8 / (2.6 * 2.6), 0.06 * 8 / (2.6 * 2.6));   // 6%: a percentile of 400 draws
  near('and its 84th percentile is M / (R - down)^2', rOnly.g.hi, 8 / (1.7 * 1.7), 0.06 * 8 / (1.7 * 1.7));
  const mOnly = S.monteCarlo({ ...base, name: 'test 2.20 mass', R: 2, Rerr1: null, Rerr2: null, Rerr: null, M: 10, Merr1: 3, Merr2: -2 }, 0.3);
  near('a lopsided mass, the radius exact: the gravity\'s 16th percentile is (M - down) / R^2', mOnly.g.lo, 8 / 4, 0.06 * 8 / 4);
  near('and its 84th percentile is (M + up) / R^2', mOnly.g.hi, 13 / 4, 0.06 * 13 / 4);
  yes('a draw below the median takes the lower side, one above it the upper', Math.abs(S.drawPositive(lop, -1) - 1.7) < 1e-9 && Math.abs(S.drawPositive(lop, 1) - 2.6) < 1e-9 && S.drawPositive(lop, 0) === 2.0);
}

// the committed snapshot
const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
yes(`snapshot has more than 6000 planets (${list.length})`, list.length > 6000);
const val = S.validateAgainstArchive(list);
yes(`archive relation masses reproduced, median diff ${(val.median * 100).toFixed(3)}%`, val.median < 0.01);
const hold = S.withholdingTest(list);
yes(`withholding: ${(hold.massIn68Small * 100).toFixed(1)}% of small-planet masses inside the 68% band (target about 68%)`, hold.massIn68Small > 0.58 && hold.massIn68Small < 0.78);
const v = S.valleyHistogram(list.map((p) => ({ ...p, measuredR: true })));
yes(`radius valley: emptiest bin ${v.valleyMin} below both peaks (${v.peakBelow}, ${v.peakAbove})`, v.valleyMin < v.peakBelow && v.valleyMin < v.peakAbove);
const t = S.transitValidation(list);
yes(`transit model unbiased: median depth ratio ${t.depth.median.toFixed(3)}, duration ratio ${t.dur.median.toFixed(3)}`, Math.abs(t.depth.median - 1) < 0.05 && Math.abs(t.dur.median - 1) < 0.05);
let bad = 0;
for (const p of list) {
  const vals = [S.forecastFor(p)?.median, S.equilibriumTemp(p, 0.3), S.insolation(p).S, S.skyView(p)?.angDeg, S.transitGeometry(p)?.T14];
  if (vals.some((x) => x !== null && x !== undefined && !Number.isFinite(x))) bad++;
}
yes(`no non-finite derived value across ${list.length} planets`, bad === 0);

// ---- a missing radius has no size class, gravity or density (defect fixed 2026-11-11) ----
yes('sizeClass of a missing radius is null, not Giant', S.sizeClass(null) === null && S.sizeClass(undefined) === null && S.sizeClass(0) === null);
yes('sizeClass of 1.0 R_earth is Earth-size', S.sizeClass(1.0).key === 'rocky');
const byName = new Map(list.map((p) => [p.name, p]));
const bd = byName.get('BD+05 4868 A b');
const bdMc = S.monteCarlo(bd, 0.3);
yes('BD+05 4868 A b: no radius, so no gravity, density, scale height or size class',
  bd.R === null && bdMc.g === null && bdMc.rho === null && bdMc.H === null && bdMc.probs.length === 0 && S.sizeClassOf(bd) === null);
yes('BD+05 4868 A b: its upper-limit mass is a bound, never a value', bd.M === null && bd.lim.M.v === 6.2 && bd.lim.M.dir === 1 && bdMc.massFrom === 'none');
yes('BD+05 4868 A b: Teq still computed (needs no radius)', bdMc.teq !== null && bdMc.teq.med > 1000);
const radiusless = list.filter((p) => !S.hasRadius(p));
const leaks = radiusless.filter((p) => { const m = S.monteCarlo(p, 0.3); return m.g || m.rho || m.H || m.probs.length || S.forecastFor(p); });
yes(`none of the ${radiusless.length} radius-less worlds gets a gravity, density, class or mass forecast (${leaks.map((p) => p.name).join(', ') || 'none'})`, radiusless.length >= 50 && leaks.length === 0);
const tb = byName.get('TOI-2796 b');
yes('a radius lower limit of 17.26 R_earth fixes the class Giant, flagged as from the limit', tb.R === null && S.sizeClassOf(tb).key === 'giant' && S.sizeClassOf(tb).fromLimit === true);
yes('a radius lower limit of 1.61 R_earth fixes no class', S.sizeClassOf(byName.get('HD 219134 d')) === null);

// ---- archive limit flags are bounds, never measurements ----
const I = Object.fromEntries(json.cols.map((c, i) => [c, i]));
let nFlag = 0, nMoved = 0;
for (const r of json.rows) {
  const p = byName.get(r[I.pl_name]);
  const flags = (r[I.lim] || '').split(';').filter(Boolean);
  if (r[I.pl_bmasselim]) { nFlag++; if (p.M === null && p.lim.M && p.lim.M.dir === Math.sign(r[I.pl_bmasselim])) nMoved++; }
  for (const fl of flags) {
    nFlag++;
    const key = { pl_rade: 'R', pl_orbper: 'P', pl_orbsmax: 'a', pl_orbeccen: 'ecc', pl_insol: 'S', pl_eqt: 'Teq', pl_imppar: 'b', pl_trandep: 'depth', pl_trandur: 'dur', st_teff: 'Teff', st_rad: 'Rs', st_mass: 'Ms', st_lum: 'logL' }[fl.split(':')[0]];
    if (p[key] === null && p.lim[key] && p.lim[key].dir === Math.sign(+fl.split(':')[1])) nMoved++;
  }
}
yes(`every archive limit flag (${nFlag}) becomes a bound and leaves its value field empty (${nMoved})`, nFlag > 500 && nMoved === nFlag);
yes('no record with a mass limit counts as having a true mass', list.every((p) => !(p.lim.M && S.hasTrueMass(p))));
const capped = list.filter((p) => p.lim.M && p.lim.M.dir > 0 && S.hasRadius(p));
const capBad = capped.filter((p) => { const f = S.forecastFor(p); return !f || f.bounded !== 'upper' || f.hi > p.lim.M.v * 1.0001; });
yes(`all ${capped.length} upper-limit masses with a radius censor the forecast at the limit`, capped.length > 100 && capBad.length === 0);
const mcCap = capped.filter((p) => { const m = S.monteCarlo(p, 0.3); return m.massFrom !== 'forecast' || m.bounded !== 'upper'; });
yes('the Monte Carlo draws those masses from the censored forecast, never from the limit', mcCap.length === 0);
const lowFc = S.forecastMass(1.61, 0.05, null, 16);
yes(`a lower limit of 16 M_earth cuts the forecast below it (16th percentile ${lowFc.lo.toFixed(2)})`, lowFc.lo >= 16 && lowFc.bounded === 'lower');
const k442 = byName.get('Kepler-442 b'), k442rv = S.rvSemiAmplitude(k442);
yes('an eccentricity lower limit is not used as e (Kepler-442 b: e > 0.04 is a bound; the velocity curve takes e = 0 and says so)',
  k442.ecc === null && k442.lim.ecc.dir === -1 && k442rv && k442rv.e === 0 && k442rv.eLimit === k442.lim.ecc);

// ---- the render's Teq fallback includes the host radius (it assumed 1 solar radius until 2026-11-13) ----
// TRAPPIST-1 h by hand: 2566 K * sqrt(0.1192 R_sun / (2 * 0.06189 AU)) = 171.7 K at zero albedo, 157.1 K at
// the rocky-class albedo 0.30. The old fallback gave 455 K and drew a temperate rocky world.
const th = { ...byName.get('TRAPPIST-1 h'), pl_eqt: null };
near('TRAPPIST-1 h with its published Teq withheld: render Teq (K)', physics(th).Teq, 157.1, 1);
// Since 2026-11-16 the 2026 fit draws it as bare rock (air 0.3%, air.js); the fallback must leave it a cold one.
yes('TRAPPIST-1 h with its published Teq withheld is drawn as cold bare rock, as with its Teq', classify(th).look === 'airless' && physics(th).Tsurf < 200 && classify(byName.get('TRAPPIST-1 h')).look === 'airless', `${classify(th).look} ${physics(th).Tsurf.toFixed(0)} K`);
let nFb = 0, okFb = 0;
for (const p of list) {
  if (p.pl_eqt !== null) continue;
  const plate = S.equilibriumTemp(p, 0.3); if (!plate) continue;
  nFb++; if (Math.abs(physics(p).Teq / plate - 1) <= 0.2) okFb++;
}
yes(`with no published Teq, the render's Teq is within 20% of the plate's for ${okFb} of ${nFb} worlds`, nFb > 200 && okFb / nFb > 0.97);

// ---- ranges that divide by a value not bounded away from zero are open (ticket 2.20) ----
{
  const low = (e1, e2) => (Number.isFinite(e2) && e2 !== 0 ? Math.abs(e2) : Number.isFinite(e1) && e1 !== 0 ? Math.abs(e1) : null);
  const reachesZero = (pl) => (S.hasRadius(pl) && low(pl.Rerr1, pl.Rerr2) !== null && pl.R - low(pl.Rerr1, pl.Rerr2) <= 0)
    || (S.hasRadius(pl) && S.hasTrueMass(pl) && low(pl.Merr1, pl.Merr2) !== null && pl.M - low(pl.Merr1, pl.Merr2) <= 0);
  const wrongOpen = [], badRange = [];
  let nOpen = 0;
  for (const pl of list) {
    const m = S.monteCarlo(pl, 0.3);
    if (!m.hasR) continue;
    if (!!m.open !== reachesZero(pl)) wrongOpen.push(pl.name);
    if (m.open) nOpen++;
    for (const k of ['g', 'rho', 'H']) {
      const x = m[k];
      if (!x) continue;
      if (m.open ? (x.lo !== null || x.hi !== null || x.open !== m.open || !(x.med > 0)) : !(x.lo > 0 && x.lo <= x.med && x.med <= x.hi)) badRange.push(`${pl.name} ${k}`);
    }
  }
  yes(`the ranges are open exactly where the radius or a measured mass has a lower error reaching it (${nOpen} planets; wrong: ${wrongOpen.slice(0, 4).join(', ') || 'none'})`, wrongOpen.length === 0 && nOpen > 0);
  yes(`every range is either open, with a median and no ends, or positive and ordered (${badRange.slice(0, 4).join(', ') || 'all'})`, badRange.length === 0);
  const hat = S.monteCarlo(byName.get('HAT-P-57 b'), 0.3), hd = S.monteCarlo(byName.get('HD 110113 c'), 0.3);
  yes('HAT-P-57 b (mass 448 -480 M_earth) is open by its mass, HD 110113 c (radius 2.11 -4.6 R_earth) by its radius', hat.open === 'mass' && hd.open === 'radius');
  const koi = S.monteCarlo(byName.get('KOI-2513.01'), 0.3);
  yes(`KOI-2513.01's density range no longer reaches 328,558,509 g/cm3 by the clamp (now ${koi.rho.lo.toPrecision(3)} to ${koi.rho.hi.toPrecision(3)})`, koi.rho.hi < 5000 && !koi.open);
  const prox = S.monteCarlo(byName.get('Proxima Cen b'), 0.3);
  yes('Proxima Cen b keeps its ranges', !prox.open && prox.g.lo > 0.9 && prox.g.hi < 1.2);
  // the note on a lopsided open mass names its lower error, not its upper; and the value shown is the one at the radius
  // and mass given, M / R^2, with no assumption about the open side (HAT-P-57 b: 448 / 19.5^2 = 1.18 g)
  const lop = { host: 'X', Teff: 5772, Rs: 1, logL: 0, a: 1, P: 365.25, Ms: 1, Mprov: 'Mass', Mlim: 0, method: 'Transit', lim: {}, name: 'test 2.20 open mass', R: 2, Rerr1: 0.1, Rerr2: -0.1, Rerr: 0.1, M: 5, Merr1: 1, Merr2: -6 };
  const lopMc = S.monteCarlo(lop, 0.3);
  yes('the note of a lopsided open mass names the value and its lower error', S.openRangeNote(lop, lopMc) === 'The mass minus its lower error (5 − 6 M⊕) is zero or less, so nothing that divides by it has a 68% range; each value shown is at the radius and mass given.' && S.openRangeNote(byName.get('Proxima Cen b'), prox) === '', S.openRangeNote(lop, lopMc));
  near('an open range\'s value is at the radius and mass given (HAT-P-57 b, M / R^2 in g)', hat.g.med, 448.1 / (19.5 * 19.5), 0.005);
  const both = S.monteCarlo({ ...lop, name: 'test 2.20 both open', Rerr1: 0.5, Rerr2: -2.5, Rerr: 1.5 }, 0.3);
  yes('a radius and a mass both open is named by the radius, and an open radius gives the size classes no shares', both.open === 'radius' && both.probs.length === 0 && hd.probs.length === 0 && hat.probs.length > 0, `${both.open}; shares ${both.probs.length}, ${hd.probs.length}, ${hat.probs.length}`);
  // an open radius with a forecast mass: the gravity is valued at the forecast's median, the mass every view prints
  const fcOpen = { ...lop, name: 'test 2.20 open forecast', R: 2, Rerr1: 0.5, Rerr2: -2.5, Rerr: 1.5, M: null, Merr1: null, Merr2: null, Mprov: null };
  const fcMc = S.monteCarlo(fcOpen, 0.3), fcf = S.forecastFor(fcOpen);
  near('an open radius\'s gravity is valued at the forecast\'s median over R^2 (the forecast every view prints)', fcMc.g.med, fcf.median / 4, 1e-9);
  // the scale height uses one molecular weight, the radius given's, for every draw: with the mass exact and the radius
  // straddling 1.8 R_earth, H goes as R^2, so its 84th over its 16th percentile is ((R + up) / (R - down))^2
  const strad = S.monteCarlo({ ...lop, name: 'test 2.20 one mu', R: 1.8, Rerr1: 0.4, Rerr2: -0.4, Rerr: 0.4, M: 4, Merr1: null, Merr2: null }, 0.3);
  near('one molecular weight for every draw: the scale height\'s spread is the radius\'s squared', strad.H.hi / strad.H.lo, (2.2 / 1.4) ** 2, 0.06 * (2.2 / 1.4) ** 2);
  yes('the lower error is the archive\'s lower, or its upper where the lower is missing or 0', S.lowerError(1, -2) === 2 && S.lowerError(1, null) === 1 && S.lowerError(1, 0) === 1 && S.lowerError(null, null) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
