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
yes('TRAPPIST-1 h with its published Teq withheld is drawn frozen', classify(th).label === 'Frozen world');
let nFb = 0, okFb = 0;
for (const p of list) {
  if (p.pl_eqt !== null) continue;
  const plate = S.equilibriumTemp(p, 0.3); if (!plate) continue;
  nFb++; if (Math.abs(physics(p).Teq / plate - 1) <= 0.2) okFb++;
}
yes(`with no published Teq, the render's Teq is within 20% of the plate's for ${okFb} of ${nFb} worlds`, nFb > 200 && okFb / nFb > 0.97);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
