/* ============================================================
   The page's starlight against the papers, on named worlds. Run
   from the repository root:
     node labs/assets/js/exoplanet/tests/papers.test.mjs

   Each row names a world, a paper with its arXiv id, and the
   value the paper gives. A value is tested only where it is in the
   paper's abstract, opened on 2026-11-17 (export.arxiv.org); a
   value from a table inside the paper, or from the archive's row
   for the paper, is listed and not tested, with that reason. Where
   the abstract gives an error, the page's value must lie within two
   of its sigma; the page's value is what sheet B prints
   (starlight.js starlight), on the committed snapshot.

   The rule this checks was chosen by
   labs/assets/data/exomania/backtest_starlight.py (2026-11-17):
   the archive's luminosity over the square of the orbit.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSnapshot } from '../catalog.js';
import { starlight, teqOf } from '../starlight.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
const by = new Map(list.map((p) => [p.name, p]));

/* what: 'S' (the starlight, in Earth's) or 'Teq0' (the equilibrium temperature at zero albedo, in kelvin).
   abstract: the words of the abstract that give the value, or null where the abstract gives none. */
const PAPERS = [
  { world: 'Kepler-1649 c', paper: 'Vanderburg et al. 2020', arxiv: '2004.06725', what: 'S', value: 0.74, sigma: 0.03,
    abstract: 'It receives 74 +/- 3 % the incident flux of Earth' },
  { world: "Teegarden's Star b", paper: 'Zechmeister et al. 2019', arxiv: '1906.07196', what: 'S', value: 1.15, sigma: 0.08, abstract: null },
  { world: "Teegarden's Star b", paper: 'Dreizler et al. 2024', arxiv: '2402.00923', what: 'S', value: 1.08, sigma: 0.08, abstract: null },
  { world: 'Proxima Cen b', paper: 'Anglada-Escudé et al. 2016', arxiv: '1609.03449', what: 'S', value: 0.65, sigma: null, abstract: null },
  { world: 'Proxima Cen b', paper: 'Suárez Mascareño et al. 2025', arxiv: '2507.21751', what: 'S', value: 0.641, sigma: 0.065, abstract: null },
  { world: 'HD 28109 b', paper: 'Dransfield et al. 2022', arxiv: '2205.09046', what: 'Teq0', value: 881.2, sigma: 7.5, abstract: null },
  { world: 'Kepler-438 b', paper: 'Torres et al. 2015', arxiv: '1501.01101', what: 'S', value: 1.40, sigma: 0.67, abstract: null },
  { world: 'Kepler-442 b', paper: 'Torres et al. 2015', arxiv: '1501.01101', what: 'S', value: 0.66, sigma: 0.23, abstract: null },
];

const page = (p, what) => (what === 'S' ? starlight(p).S : teqOf(p, 0).med);
for (const r of PAPERS) {
  const p = by.get(r.world);
  const v = p ? page(p, r.what) : null;
  if (!r.abstract) { console.log(`not tested  ${r.world}, ${r.paper} (arXiv:${r.arxiv}): ${r.value}${r.sigma ? ` +- ${r.sigma}` : ''} is not in the abstract; the page gives ${v === null ? 'none' : v.toPrecision(3)}`); continue; }
  yes(`${r.world} within two sigma of ${r.paper} (arXiv:${r.arxiv}, "${r.abstract}")`, p && Number.isFinite(v) && Math.abs(v - r.value) <= 2 * r.sigma, `the page ${v === null ? 'none' : v.toPrecision(3)}, the paper ${r.value} +- ${r.sigma}`);
}
// unresolved: the composite's radius (Morton et al. 2016, 0.26 R_sun) and its luminosity describe two stars
const k1646 = by.get('Kepler-1646 b');
console.log(`unresolved  Kepler-1646 b: the page gives ${starlight(k1646).S.toPrecision(3)} S_earth from the archive's luminosity; Morton et al. 2016 gives no insolation, the DR25 KOI table 4.2, Berger et al. 2018 15.6. Not tested.`);
yes('every world named is in the snapshot', PAPERS.every((r) => by.has(r.world)) && !!k1646);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
