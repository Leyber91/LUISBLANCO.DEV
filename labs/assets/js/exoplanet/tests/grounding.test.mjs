/* ============================================================
   Exomania grounding tests: the check that a model's survey note
   uses only the fact sheet's numbers. Run from anywhere:
     node labs/assets/js/exoplanet/tests/grounding.test.mjs
   Before 2026-11-11 the check skipped "900K", "40km", "7x" and
   "-40" (0 of 0 checked) and read "3.7g" as 3. Every figure is
   now read with its unit and checked after unit conversion.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { groundingCheck, figures } from '../grounding.js';
import { facts, deterministicNote } from '../report.js';
import { loadSnapshot } from '../catalog.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond) => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}`); };
const check = (text, f) => groundingCheck(text, f);
const one = (text, f) => { const c = check(text, f); return c.total === 1 ? c.nums[0] : null; };

// a fact sheet with none of the figures below
const F0 = { name: 'Test-1 b', host: 'Test-1', radius_Rearth: 1.5, period_days: 10.2, orbit_AU: 0.09, teq_this_page_K: 455, star_teff_K: 5200 };

// 1. unit-bearing figures that are not in the data are checked and fail (they were 0 of 0)
for (const t of ['900K', '40km', '7x', '-40', '3.7g', '40xyz', '-40 °C', '2.2 g/cm³', '12 km/s']) {
  const c = check(t, F0);
  yes(`"${t}" is one figure and fails against a sheet without it (${c.traced} of ${c.total}${c.total ? ': ' + c.nums[0].why : ''})`, c.total === 1 && c.traced === 0);
}
// 2. numbers are read with their units, not truncated
const g37 = one('3.7g', F0);
yes(`"3.7g" reads as 3.7 in Earth gravities, not 3 (${g37 && g37.v} ${g37 && g37.unit})`, g37 && g37.v === 3.7 && g37.unit === 'g');
const k900 = one('900K', F0);
yes('"900K" reads as 900 kelvin', k900 && k900.v === 900 && k900.unit === 'K');
const m40 = one('-40', F0);
yes('"-40" reads as minus 40', m40 && m40.v === -40 && m40.unit === null);
const x7 = one('7x', F0);
yes('"7x" reads as a ratio of 7', x7 && x7.v === 7 && x7.unit === 'x');
yes('"40xyz" is unreadable and fails', one('40xyz', F0).bad === true);

// 3. matching after unit conversion
const F1 = { name: 'Test-2 b', host: 'Test-2', teq_this_page_K: 900, period_days: 1.4583, orbit_AU: 0.05, distance_ly: 1206,
  radius_Rearth: 1.34, insolation_Searth: 0.7, transit_depth_ppm: 5000, star_size_vs_sun_from_earth: 7, mass_forecast_68: [1.2, 3.4] };
const pass = (t) => { const c = check(t, F1); return c.total > 0 && c.traced === c.total; };
yes('"900K" and "900 K" trace to Teq 900 K', pass('900K') && pass('900 K') && pass('a 900-kelvin day side'));
yes('"627 °C" and "1,160 °F" trace to 900 K after conversion', pass('627 °C') && pass('1,160 °F'));
yes('"-40 °C" fails against 900 K', !pass('-40 °C'));
yes('"35 hours" traces to a 1.4583-day period; "35 days" does not', pass('35 hours') && !pass('35 days'));
yes('"7.5 million km" traces to 0.05 AU', pass('7.5 million km'));
yes('"370 pc" traces to 1,206 light-years', pass('370 pc') && pass('1,206 light-years'));
yes('"0.5%" traces to 5,000 ppm', pass('0.5%') && pass('5,000 ppm'));
yes('"7x" and "7 times" trace to a 7x ratio fact', pass('7x') && pass('7 times'));
yes('"1.34 times Earth\'s radius" and "1.34 Earth radii" trace to 1.34 R_earth', pass("1.34 times Earth's radius") && pass('1.34 Earth radii'));
yes('rounding the text states is allowed: "1.3 R⊕" for 1.34; "1.2 R⊕" is not', pass('1.3 R⊕') && !pass('1.2 R⊕'));
yes('"40km" fails against every length on the sheet', !pass('40km'));
yes('"the 68% range of 1.2 to 3.4" traces', pass('the 68% range of 1.2 to 3.4'));

// 4. digits in names are not figures; ranges carry their unit
yes('names are not figures: TRAPPIST-1, CO2, K2-18, TOI-700', check('TRAPPIST-1 and CO2 and K2-18 near TOI-700', F1).total === 0);
const rng = figures('between 900-1000 K and 0.04 to 0.06 AU');
yes(`a range's unit applies to both ends (${rng.map((g) => g.v + (g.unit || '')).join(', ')})`,
  rng.length === 4 && rng.every((g, i) => g.unit === ['K', 'K', 'AU', 'AU'][i]) && rng[1].v === 1000);
yes('the planet\'s own name is blanked: "Test-2 b orbits" has no figure', check('Test-2 b orbits', F1).total === 0);

// 5. the engine's own note never fails its own check, on every world in the snapshot
const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
let bad = 0, figs = 0;
const badNames = [];
for (const p of list) {
  const f = facts(p, 0.3);
  const c = groundingCheck(deterministicNote(p, f), f);
  figs += c.total;
  if (c.traced < c.total) { bad++; if (badNames.length < 3) badNames.push(p.name); }
}
yes(`the deterministic note traces fully for all ${list.length} worlds (${figs} figures; failures: ${badNames.join(', ') || 'none'})`, bad === 0 && figs > list.length * 5);
// and a note that slips a unit-bearing figure in is caught
const p0 = list.find((p) => p.name === 'Kepler-442 b'), f0 = facts(p0, 0.3);
// (-40 °C would be 233 K, which is this world's own Teq at albedo 0.3, so it would rightly pass)
const slipped = deterministicNote(p0, f0) + ' Its surface gravity is 3.7g and nights fall to -120 °C.';
const cs = groundingCheck(slipped, f0);
yes(`two invented figures appended to a true note are both caught (${cs.total - cs.traced} of ${cs.total} untraced)`, cs.total - cs.traced === 2);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
