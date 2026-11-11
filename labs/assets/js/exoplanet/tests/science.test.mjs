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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
