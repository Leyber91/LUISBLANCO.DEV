/* ============================================================
   If there were life (life.js). Run from the repository root:
     node labs/assets/js/exoplanet/tests/life.test.mjs

   The cases are Kiang et al. 2007 II's tables, value by value;
   the boundaries between cases have a star one kelvin each side;
   the Solar System comes out as itself (Earth green and fully
   covered, Mars sparse, Venus too hot, Mercury bare, Jupiter no
   surface); then every planet of the catalogue is described.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CASES, caseOf, WHERE, lifeOf, scenariosOf, reflectance, NO_STAR, NO_LIGHT } from '../life.js';
import { reflectanceColour } from '../science.js';
import { loadSnapshot, provisionalMeasured } from '../catalog.js';
import { LOOKS } from '../data.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });

/* ---- the cases are the paper's tables ---- */
{
  const by = Object.fromEntries(CASES.map((c) => [c.key, c]));
  const row = (k) => [by[k].T, by[k].peak, by[k].par, by[k].uvb, by[k].gppVis, by[k].gppWide].join(' ');
  yes('F2V: 6,820 K, peak 450.8 nm, PAR 16.4, UV-B 0.049, GPP 0.85', row('F2V') === '6820 450.8 16.4 0.049 0.85 ', row('F2V'));
  yes('G2V: the Sun, 5,772 K, peak 668.5 nm, PAR 11.0, UV-B 0.018, GPP 0.72', row('G2V') === '5772 668.5 11 0.018 0.72 ', row('G2V'));
  yes('K2V: epsilon Eridani at the archive\'s 5,020 K, peak 666.6 nm, PAR 11.5, UV-B 0.015, GPP 0.61', row('K2V') === '5020 666.6 11.5 0.015 0.61 ', row('K2V'));
  yes('M1V: 3,650 K, peak 754.3 nm, PAR 6.1, UV-B 0.001, GPP 0.33, and 0.81 over 400 to 1,100 nm', row('M1V') === '3650 754.3 6.1 0.001 0.33 0.81', row('M1V'));
  yes('M5V: 3,100 K, peak 1,042.8 nm, PAR 1.5, UV-B 0, GPP 0.08, and 0.59 over 400 to 1,100 nm', row('M5V') === '3100 1042.8 1.5 0 0.08 0.59', row('M5V'));
}

/* ---- the nearest case, one kelvin each side of every boundary; a tie goes to the hotter star ---- */
{
  const k = (t) => caseOf(t).c.key;
  yes('6,297 K is F2V, 6,296 K (halfway) and 6,295 K are G2V', k(6297) === 'F2V' && k(6296) === 'G2V' && k(6295) === 'G2V', `${k(6297)} ${k(6296)} ${k(6295)}`);
  yes('5,397 K and 5,396 K (halfway) are G2V, 5,395 K is K2V', k(5397) === 'G2V' && k(5396) === 'G2V' && k(5395) === 'K2V', `${k(5397)} ${k(5396)} ${k(5395)}`);
  yes('4,336 K and 4,335 K (halfway) are K2V, 4,334 K is M1V', k(4336) === 'K2V' && k(4335) === 'K2V' && k(4334) === 'M1V', `${k(4336)} ${k(4335)} ${k(4334)}`);
  yes('3,376 K and 3,375 K (halfway) are M1V, 3,374 K is M5V', k(3376) === 'M1V' && k(3375) === 'M1V' && k(3374) === 'M5V', `${k(3376)} ${k(3375)} ${k(3374)}`);
  yes('past 6,820 K or under 3,100 K the case is extrapolated, at either end not', caseOf(6821).extrapolated && !caseOf(6820).extrapolated && !caseOf(3100).extrapolated && caseOf(3099).extrapolated);
}

yes('every look of the picture has its place in the rule of where life is considered', Object.keys(LOOKS).every((k) => k in WHERE) && Object.keys(WHERE).length === Object.keys(LOOKS).length);

/* ---- the colour ---- */
{
  const white = reflectanceColour(() => 1), black = reflectanceColour(() => 0);
  yes('a surface that returns all light is white, one that returns none black', white.linear.every((c) => Math.abs(c - 1) < 1e-9) && Math.abs(white.Y - 1) < 1e-9 && black.linear.every((c) => c === 0) && black.Y === 0, white.hex + ' ' + black.hex);
  const [g] = scenariosOf(CASES[1], 1), [f] = scenariosOf(CASES[0], 1), [a, b] = scenariosOf(CASES[4], 1);
  const green = (s) => s.colour.linear[1] > s.colour.linear[0] && s.colour.linear[1] > s.colour.linear[2];
  yes('under a Sun the cover is green: plants much like Earth\'s', green(g), g.colour.hex);
  const Rg = reflectance(g.bands, g.broad);
  yes('and it absorbs the red where the Sun\'s light peaks, and the blue: under a third of its green at both', Rg(668.5) < Rg(550) / 3 && Rg(440) < Rg(550) / 3, `${Rg(440).toFixed(3)} ${Rg(550).toFixed(3)} ${Rg(668.5).toFixed(3)}`);
  yes('under an F star it returns less blue than green or red: darker in the blue', f.colour.linear[2] < f.colour.linear[1] && f.colour.linear[2] < f.colour.linear[0], f.colour.hex);
  yes('a red dwarf has two readings: a, harvesting to 1,100 nm, darker than b, green as Earth\'s', a.key === 'a' && b.key === 'b' && a.colour.Y < b.colour.Y / 3 && green(b), `${a.colour.hex} Y ${a.colour.Y.toFixed(3)}, ${b.colour.hex} Y ${b.colour.Y.toFixed(3)}`);
  yes('a leaf returns more past its red edge than in the visible', reflectance([], 0)(900) > 3 * reflectance([], 0)(550));
  yes('the cover: the case\'s productivity against the Sun\'s, times the starlight, at most all', g.cover === 1 && Math.abs(scenariosOf(CASES[1], 0.5)[0].cover - 0.5) < 1e-12 && scenariosOf(CASES[0], 3)[0].cover === 1
    && Math.abs(a.cover - Math.min(1, 0.59 / 0.72)) < 1e-12 && Math.abs(b.cover - 0.08 / 0.72) < 1e-12, `${a.cover} ${b.cover}`);
}

/* ---- the Solar System as the archive would hold it ---- */
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1, host: 'Sun', hostname: 'Sun', method: 'Transit' };
const sol = (name, R, M, a, P) => ({ pl_name: name, name, pl_rade: R, R, pl_masse: M, M, pl_orbsmax: a, a, pl_orbper: P, P, pl_eqt: null, Teq: null, S: null, measuredR: true, ...SUN });
const SS = { Mercury: sol('Mercury', 0.383, 0.0553, 0.387, 87.97), Venus: sol('Venus', 0.949, 0.815, 0.723, 224.7), Earth: sol('Earth', 1, 1, 1, 365.25), Mars: sol('Mars', 0.532, 0.107, 1.524, 687), Jupiter: sol('Jupiter', 11.21, 317.8, 5.204, 4332.6) };
{
  const E = lifeOf(SS.Earth);
  yes('Earth: the Sun\'s case, surface life, one green reading, all its cover', E.case.key === 'G2V' && E.where.surface === true && E.scenarios.length === 1 && E.scenarios[0].cover === 1 && E.scenarios[0].colour.linear[1] > E.scenarios[0].colour.linear[0], E.scenarios[0] && E.scenarios[0].colour.hex);
  yes('Earth gets Earth\'s light and UV-B', Math.abs(E.light - 1) < 0.01 && Math.abs(E.uvb - 1) < 0.01, `${E.light} ${E.uvb}`);
  const M = lifeOf(SS.Mars), V = lifeOf(SS.Venus), Me = lifeOf(SS.Mercury), J = lifeOf(SS.Jupiter);
  yes('Mars: sparse, with the reason, and a colour', M.where === WHERE.desert && M.where.surface === 'sparse' && M.words.includes(WHERE.desert.why) && M.scenarios.length === 1);
  yes('Venus: too hot under its clouds, nothing drawn', V.where === WHERE.shrouded && V.scenarios.length === 0 && V.words.includes(WHERE.shrouded.why));
  yes('Mercury: no air to hold water, and though one face is to the Sun, no day side to keep to', Me.where === WHERE.airless && Me.scenarios.length === 0 && !Me.words.some((w) => /day side/.test(w)), Me.words.join(' | '));
  yes('Jupiter: no surface, and so no surface gravity or day side said', J.where === WHERE.fluid && J.scenarios.length === 0 && !J.words.some((w) => /surface gravity|day side/.test(w)), J.words.join(' | '));
  yes('Earth\'s words name its gravity, a world with a surface', E.words.some((w) => /surface gravity is 1\.0 times Earth's/.test(w)), E.words.join(' | '));
}

/* ---- what the rules cannot place ---- */
{
  const noStar = lifeOf({ ...SS.Earth, name: 'no star', pl_name: 'no star', host: 'nostar', Teff: null });
  yes('a star with no temperature in the archive: no case, and the words say why', noStar.case === null && noStar.words[0] === NO_STAR && noStar.scenarios.length === 0);
  const noLight = lifeOf({ ...SS.Earth, name: 'no light', pl_name: 'no light', host: 'nolight', a: null, pl_orbsmax: null, P: null, pl_orbper: null, Ms: null });
  yes('a surface world with no starlight: a case, no cover, and the words say why', noLight.case !== null && noLight.scenarios.length === 0 && noLight.words.includes(NO_LIGHT), noLight.words.join(' | '));
}

/* ---- every planet of the catalogue ---- */
{
  const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  const { list } = await loadSnapshot();
  provisionalMeasured(list);
  let errors = 0, unnamed = 0, colourless = 0, n = 0;
  for (const p of list) {
    let L;
    try { L = lifeOf(p); } catch { errors++; continue; }
    n++;
    if (L.case && !L.words[0].includes(` ${L.case.key} case `)) unnamed++;
    if (L.scenarios.some((s) => !/^#[0-9a-f]{6}$/.test(s.colour.hex))) colourless++;
  }
  yes('every planet in the catalogue is described, its case named, every colour a colour', errors === 0 && unnamed === 0 && colourless === 0 && n === list.length, `${n} described, ${errors} errors, ${unnamed} unnamed, ${colourless} colourless`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
