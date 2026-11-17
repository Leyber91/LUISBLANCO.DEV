/* ============================================================
   The page's starlight and equilibrium temperature against the
   papers, on named worlds. Run from the repository root:
     node labs/assets/js/exoplanet/tests/papers.test.mjs

   Each row names a world, a paper with its arXiv id and the table
   the value is in, read in the paper's full text (the second review
   of pull request 50, 2026-11-17, through ar5iv). Where the paper
   gives an error, the page's value must lie within two of its sigma
   (on the side of the page's value, where the error is uneven). The
   page's value is what sheet B prints (starlight.js), on the
   committed snapshot. papers.mutants.test.mjs puts R^2 Teff^4 first
   again, as at ebf969b, and this file must fail on it.

   Not tested, and why:
   - Anglada-Escude et al. 2016 (arXiv:1609.03449), Table 1: Proxima
     b's irradiance, 65% of Earth's, has no error.
   - The papers' Teq at albedo 0.3 for Proxima b (Suarez Mascareno
     et al. 2025, 218 +- 18 K) and Teegarden's Star b (Dreizler et
     al. 2024, 277 +- 5 K) come from their radius and temperature,
     not their flux, so they are not the page's quantity; the ledger
     (render_science.md) records them as a known difference.
   - Dransfield et al. 2022's 881.2 K for HD 28109 b is not at zero
     albedo and rests on an orbit Barone et al. 2025 correct.
   - Kepler-1646 b is unresolved: its composite radius and its
     luminosity describe two stars.
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

/* what: 'S', the starlight in Earth's; 'Teq', the equilibrium temperature in kelvin at the albedo given. up and down: the
   paper's errors above and below its value. */
const PAPERS = [
  { world: "Teegarden's Star b", paper: 'Zechmeister et al. 2019', arxiv: '1906.07196', table: 'Table 2, F', what: 'S', value: 1.15, up: 0.08, down: 0.08 },
  { world: "Teegarden's Star b", paper: 'Dreizler et al. 2024', arxiv: '2402.00923', table: 'Table 4, S', what: 'S', value: 1.08, up: 0.08, down: 0.08 },
  { world: 'Proxima Cen b', paper: 'Suárez Mascareño et al. 2025', arxiv: '2507.21751', table: 'Table 3, incident flux', what: 'S', value: 0.641, up: 0.065, down: 0.065 },
  { world: 'Kepler-438 b', paper: 'Torres et al. 2015', arxiv: '1501.01101', table: 'Table 8, S_eff', what: 'S', value: 1.40, up: 0.67, down: 0.77 },
  { world: 'Kepler-442 b', paper: 'Torres et al. 2015', arxiv: '1501.01101', table: 'Table 9, S_eff', what: 'S', value: 0.66, up: 0.23, down: 0.41 },
  { world: 'Kepler-1649 c', paper: 'Vanderburg et al. 2020', arxiv: '2004.06725', table: 'Table 1, incident flux', what: 'S', value: 0.750, up: 0.032, down: 0.032 },
  // the paper draws the albedo uniformly between 0 and 0.7; the page's Teq is taken at its middle, 0.35
  { world: 'Kepler-1649 c', paper: 'Vanderburg et al. 2020', arxiv: '2004.06725', table: 'Table 1, Teq', what: 'Teq', albedo: 0.35, value: 234, up: 20, down: 20 },
  { world: 'HD 28109 b', paper: 'Barone et al. 2025', arxiv: '2511.05147', table: 'Table 2, Teq at zero albedo', what: 'Teq', albedo: 0, value: 867, up: 16, down: 16 },
];

const page = (p, r) => (r.what === 'S' ? starlight(p).S : (teqOf(p, r.albedo) || {}).med);
for (const r of PAPERS) {
  const p = by.get(r.world), v = p ? page(p, r) : null;
  const sigma = v >= r.value ? r.up : r.down;
  const z = Number.isFinite(v) ? Math.abs(v - r.value) / sigma : Infinity;
  yes(`${r.world}: the page's ${r.what === 'S' ? 'starlight' : `Teq at albedo ${r.albedo}`} within two sigma of ${r.paper} (arXiv:${r.arxiv}, ${r.table}, ${r.value})`, z <= 2, `the page ${Number.isFinite(v) ? v.toPrecision(3) : 'none'}, ${z.toFixed(2)} sigma`);
}
yes('every world named is in the snapshot', PAPERS.every((r) => by.has(r.world)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
