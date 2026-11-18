/* ============================================================
   If there were life (life.js). Run from the repository root:
     node labs/assets/js/exoplanet/tests/life.test.mjs

   The cases are Kiang et al. 2007 II's tables, value by value;
   the case is the nearest in temperature, a tie to the hotter,
   with a star one kelvin each side of every boundary; every look
   has its
   reason; the Solar System comes out as itself; then the
   catalogue: the air scenario the visitor chose, the deserts
   against the zone, the sub-Neptunes, the ice the picture draws,
   and every planet described.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CASES, caseOf, article, WHY, whereOf, lifeOf, scenariosOf, reflectance, band, BANDS, colourSource, timesEarth, iceLocked, NO_STAR, NO_LIGHT, LOCKED, LOCKED_NEAR, OCEAN } from '../life.js';
import { reflectanceColour, hzPosition } from '../science.js';
import { loadSnapshot, provisionalMeasured } from '../catalog.js';
import { classify } from '../data.js';
import { KOPPARAPU } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const by = Object.fromEntries(CASES.map((c) => [c.key, c]));

/* ---- the cases are the paper's tables ---- */
{
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
  yes('6,297 K and 6,296 K (halfway) are F2V, 6,295 K is G2V', k(6297) === 'F2V' && k(6296) === 'F2V' && k(6295) === 'G2V', `${k(6297)} ${k(6296)} ${k(6295)}`);
  yes('5,397 K and 5,396 K (halfway) are G2V, 5,395 K is K2V', k(5397) === 'G2V' && k(5396) === 'G2V' && k(5395) === 'K2V', `${k(5397)} ${k(5396)} ${k(5395)}`);
  yes('4,336 K and 4,335 K (halfway) are K2V, 4,334 K is M1V', k(4336) === 'K2V' && k(4335) === 'K2V' && k(4334) === 'M1V', `${k(4336)} ${k(4335)} ${k(4334)}`);
  yes('3,376 K and 3,375 K (halfway) are M1V, 3,374 K is M5V', k(3376) === 'M1V' && k(3375) === 'M1V' && k(3374) === 'M5V', `${k(3376)} ${k(3375)} ${k(3374)}`);
  yes('the type is the page\'s: a 3,844 K star is K-type and nearest M1V; 12,000 K is B-type and F2V', caseOf(3844).type === 'K' && k(3844) === 'M1V' && caseOf(12000).type === 'B' && k(12000) === 'F2V');
  yes('past 6,820 K or under 3,100 K the case is extrapolated, at either end not', caseOf(6821).extrapolated && !caseOf(6820).extrapolated && !caseOf(3100).extrapolated && caseOf(3099).extrapolated);
  yes('an O, an A, an F, an M, an L; a B, a G, a K', ['O', 'A', 'F', 'M', 'L'].every((t) => article(t) === 'an') && ['B', 'G', 'K'].every((t) => article(t) === 'a'));
}

/* ---- the colour, the cover and the words of a light ---- */
{
  const white = reflectanceColour(() => 1), black = reflectanceColour(() => 0), over = reflectanceColour(() => 1.5);
  yes('a surface that returns all light is white, one that returns none black, and none is brighter than white', white.linear.every((c) => Math.abs(c - 1) < 1e-9) && Math.abs(white.Y - 1) < 1e-9 && black.linear.every((c) => c === 0) && black.Y === 0 && over.linear.every((c) => c <= 1), white.hex + ' ' + black.hex);
  const blue = reflectanceColour((lam) => (lam < 500 ? 1 : 0)), narrow = reflectanceColour((lam) => (Math.abs(lam - 555) <= 3 ? 1 : 0));
  yes('a surface returning only the light under 500 nm is blue; a band 6 nm wide at 555 nm is seen, so the eye\'s curves are sampled finely', blue.linear[2] > blue.linear[1] && blue.linear[2] > blue.linear[0] && narrow.Y > 0.005, `${blue.hex} ${narrow.Y.toFixed(4)}`);
  const [g] = scenariosOf(by.G2V, 1), [f] = scenariosOf(by.F2V, 1), [kk] = scenariosOf(by.K2V, 1), [a, b] = scenariosOf(by.M5V, 1);
  const green = (s) => s.colour.linear[1] > s.colour.linear[0] && s.colour.linear[1] > s.colour.linear[2];
  yes('under a Sun the cover is green: plants much like Earth\'s', green(g), g.colour.hex);
  const Rg = reflectance(g.bands, g.broad), Rb = reflectance(b.bands, b.broad);
  yes('and it absorbs the red where the Sun\'s light peaks, and the blue: under a third of its green at both', Rg(668.5) < Rg(550) / 3 && Rg(440) < Rg(550) / 3, `${Rg(440).toFixed(3)} ${Rg(550).toFixed(3)} ${Rg(668.5).toFixed(3)}`);
  yes('under an F star it returns less blue than green or red: darker in the blue', f.colour.linear[2] < f.colour.linear[1] && f.colour.linear[2] < f.colour.linear[0], f.colour.hex);
  yes('an M dwarf has two readings: a, harvesting to 1,100 nm, darker than b, which keeps Earth\'s red band', a.key === 'a' && b.key === 'b' && a.colour.Y < b.colour.Y / 3 && Rb(680) < Rb(550) / 3 && /^Reading a: /.test(a.words) && /^Reading b: /.test(b.words), `${a.colour.hex} ${b.colour.hex}`);
  yes('a K or F star has one reading', scenariosOf(by.K2V, 1).length === 1 && scenariosOf(by.F2V, 1).length === 1);
  yes('a leaf returns more past its red edge than in the visible', reflectance([], 0)(900) > 3 * reflectance([], 0)(550));
  yes('the cover: each case\'s productivity against the Sun\'s, times the starlight, at most all', g.cover === 1 && Math.abs(scenariosOf(by.G2V, 0.5)[0].cover - 0.5) < 1e-12 && scenariosOf(by.F2V, 3)[0].cover === 1
    && Math.abs(kk.cover - 0.61 / 0.72) < 1e-12 && Math.abs(scenariosOf(by.F2V, 0.5)[0].cover - 0.85 / 0.72 * 0.5) < 1e-12 && Math.abs(a.cover - Math.min(1, 0.59 / 0.72)) < 1e-12 && Math.abs(b.cover - 0.08 / 0.72) < 1e-12, `${kk.cover} ${a.cover} ${b.cover}`);
  const edges = [[449, 'violet'], [450, 'blue'], [494, 'blue'], [495, 'green'], [569, 'green'], [570, 'yellow'], [589, 'yellow'], [590, 'orange'], [619, 'orange'], [620, 'red'], [699, 'red'], [700, 'near infrared']];
  yes('the colour of a wavelength, one nanometre each side of every band\'s edge; the F2V peak, 450.8 nm, is blue, as the paper says of its pigments', edges.every(([nm, w]) => (w === 'near infrared' ? /^in the near infrared/.test(band(nm)) : band(nm) === `in the ${w}`)) && BANDS.length === 6 && band(450.8) === 'in the blue' && band(668.5) === 'in the red' && /near infrared/.test(band(754.3)), edges.filter(([nm, w]) => !(w === 'near infrared' ? /^in the near infrared/.test(band(nm)) : band(nm) === `in the ${w}`)).map(([nm]) => nm).join(' '));
  yes('on a locked world ice from 89.9 degrees is on the day side, from 90 on the night side', /on its day side/.test(iceLocked(89.9)) && /on its night side/.test(iceLocked(90)) && /on its night side/.test(iceLocked(90.1)));
  yes('reading b names a star of another type nearest an M case by its temperature, and an M dwarf by nothing more', !/whose temperature/.test(scenariosOf(by.M5V, 1, 'M')[1].words) && /whose temperature this L-type star's is nearest/.test(scenariosOf(by.M5V, 1, 'L')[1].words) && /whose temperature this K-type star's is nearest/.test(scenariosOf(by.M1V, 1, 'K')[1].words));
  yes('each sentence names its light by the one band rule: an F star\'s in the blue, a Sun\'s and a K star\'s in the red', /peaks in the blue would absorb/.test(f.words) && /peaks in the red would absorb/.test(g.words) && /peaks in the red would absorb/.test(kk.words), `${f.words.slice(0, 50)} | ${g.words.slice(0, 50)}`);
  yes('the zone\'s reasons cite it in full, journal and volume', WHY.shrouded.includes(KOPPARAPU.ref) && WHY.desertHot.includes(KOPPARAPU.ref) && /ApJ 765, 131/.test(KOPPARAPU.ref));
  yes('which band is the paper\'s, by the readings drawn: one reading its peak and Earth\'s other band; an M dwarf\'s a and b each their own; none where nothing is drawn', /at the star's peak; the other band drawn, Earth's chlorophyll's, is this page's/.test(colourSource({ scenarios: [g] })) && /^reading a takes the paper's band at the star's peak and this page's absorption across 400 to 1,100 nm; reading b draws Earth's chlorophyll bands/.test(colourSource({ scenarios: [a, b] })) && colourSource({ scenarios: [] }) === null);
  yes('a ratio under 0.01 is said so, from 0.01 in two figures', timesEarth(0.009) === 'under 0.01 times' && timesEarth(0.01) === '0.010 times' && timesEarth(1.234) === '1.2 times');
}

/* ---- the Solar System as the archive would hold it ---- */
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1, host: 'Sun', hostname: 'Sun', method: 'Transit' };
const sol = (name, R, M, a, P, o = {}) => ({ pl_name: name, name, pl_rade: R, R, pl_masse: M, M, pl_orbsmax: a, a, pl_orbper: P, P, pl_eqt: null, Teq: null, S: null, measuredR: true, ...SUN, ...o });
const SS = { Mercury: sol('Mercury', 0.383, 0.0553, 0.387, 87.97), Venus: sol('Venus', 0.949, 0.815, 0.723, 224.7), Earth: sol('Earth', 1, 1, 1, 365.25), Mars: sol('Mars', 0.532, 0.107, 1.524, 687), Jupiter: sol('Jupiter', 11.21, 317.8, 5.204, 4332.6) };
const at = (a, name) => sol(name, 1, 1, a, 365.25 * Math.pow(a, 1.5), { host: name });
{
  const E = lifeOf(SS.Earth);
  yes('Earth: a G-type nearest the Sun\'s case, surface life, one green reading, all its cover', E.case.key === 'G2V' && E.type === 'G' && E.where.surface === true && E.scenarios.length === 1 && E.scenarios[0].cover === 1 && /^Its star, a G-type at 5,772 K, is nearest the G2V case/.test(E.words[0]), E.words[0]);
  yes('Earth gets Earth\'s light and UV-B, and the words say so', Math.abs(E.light - 1) < 0.01 && Math.abs(E.uvb - 1) < 0.01 && E.words.some((w) => /1\.0 times Earth's visible light and 1\.0 times Earth's UV-B/.test(w)), `${E.light} ${E.uvb}`);
  yes('Earth\'s words say where its ice begins in the picture, about 63 degrees, and not that it is locked', E.words.some((w) => /ice reaches down to about 6[2-4]° of latitude/.test(w)) && !E.words.includes(LOCKED), E.words.join(' | '));
  const warm = lifeOf(at(0.9, 'Earth at 0.9 AU'));
  yes('a twin at 0.9 AU gets 1.23 times the light and the UV-B, and has no ice in the picture', Math.abs(warm.light - 1 / 0.81) < 0.01 && Math.abs(warm.uvb - 1 / 0.81) < 0.01 && warm.where.surface === true && !warm.words.some((w) => /ice/.test(w)), `${warm.light} ${warm.uvb}`);
  const M = lifeOf(SS.Mars), V = lifeOf(SS.Venus), Me = lifeOf(SS.Mercury), J = lifeOf(SS.Jupiter);
  yes('Mars: thin air inside the zone, sparse, described with its reason, its cover not drawn', M.where.surface === 'sparse' && M.words.includes(WHY.desertSparse) && M.scenarios.length === 1 && M.scenarios[0].cover === 0 && !M.words.some((w) => /ice (lies|reaches)/.test(w)), M.words.join(' | '));
  yes('Venus: too hot under its clouds, the reason alone', V.where.surface === false && V.words.length === 1 && V.words[0] === WHY.shrouded && V.scenarios.length === 0);
  yes('Mercury: no air, the reason alone, and, though one face is to the Sun, no day side to keep to', Me.where.surface === false && Me.words.length === 1 && Me.words[0] === WHY.airless, Me.words.join(' | '));
  yes('Jupiter: a gas giant, the reason alone', J.words.length === 1 && J.words[0] === WHY.gasGiant);
  const iced = lifeOf(at(3, 'Earth at 3 AU')), molten = lifeOf(at(0.02, 'Earth at 0.02 AU'));
  yes('an Earth at 3 AU is ice and an Earth at 0.02 AU molten, neither with surface life', classify(at(3, 'x3')).look === 'ice' && iced.words[0] === WHY.ice && iced.scenarios.length === 0 && classify(at(0.02, 'x002')).look === 'molten' && molten.words[0] === WHY.molten && molten.scenarios.length === 0, `${iced.words[0]} | ${molten.words[0]}`);
}

/* ---- a desert by its side of the zone ---- */
{
  const desert = { look: 'desert', klass: 0, physics: { radiusKnown: true } };
  const w = (p) => whereOf(p, desert);
  yes('thin air inside the zone is sparse; past its inner edge the water is gone; past its outer edge frozen; with no zone, nothing', w(SS.Mars).surface === 'sparse' && w(at(0.5, 'd05')).why === WHY.desertHot && w(at(3, 'd3')).why === WHY.desertCold && w({ name: 'no zone', host: 'nozone' }).why === WHY.desertUnknown,
    `${w(at(0.5, 'd05')).why.slice(0, 40)} | ${w(at(3, 'd3')).why.slice(0, 40)}`);
}

/* ---- what the rules cannot place ---- */
{
  const noStar = lifeOf({ ...SS.Earth, name: 'no star', pl_name: 'no star', host: 'nostar', Teff: null });
  yes('a surface world whose star has no temperature in the archive: no case, and the words say why', noStar.case === null && noStar.words[0] === NO_STAR && noStar.scenarios.length === 0);
  const noStarGiant = lifeOf({ ...SS.Jupiter, name: 'no star giant', pl_name: 'no star giant', host: 'nostar2', Teff: null });
  yes('a giant whose star has no temperature: its reason, not the missing star', noStarGiant.words.length === 1 && noStarGiant.words[0] === WHY.gasGiant);
  const noLight = lifeOf({ ...SS.Earth, name: 'no light', pl_name: 'no light', host: 'nolight', a: null, pl_orbsmax: null, P: null, pl_orbper: null, Ms: null });
  yes('a surface world with no starlight: a case, no cover, and the words say why', noLight.case !== null && noLight.scenarios.length === 0 && noLight.words.includes(NO_LIGHT), noLight.words.join(' | '));
}

/* ---- the catalogue ---- */
{
  const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  const { list } = await loadSnapshot();
  provisionalMeasured(list);
  const P = (n) => list.find((x) => x.name === n);
  const withAir = (n, air) => { const p = P(n), k = classify(p, { air }); return { k, L: lifeOf(p, k, { air }) }; };
  const d0 = withAir('GJ 1061 d', null), d1 = withAir('GJ 1061 d', 'bare'), b0 = withAir('GJ 1002 b', null), b1 = withAir('GJ 1002 b', 'thick');
  yes('the air the visitor chose decides: GJ 1061 d drawn bare has no surface life, GJ 1002 b drawn thick has', d0.L.where.surface === true && d1.k.look === 'airless' && d1.L.where.surface === false && d1.L.words[0] === WHY.airless
    && b0.L.where.surface === false && b1.k.look === 'temperate' && b1.L.where.surface === true && b1.L.scenarios.length === 2, `${d0.k.look} ${d1.k.look} ${b0.k.look} ${b1.k.look}`);
  yes('GJ 1061 d\'s star, 2,953 K, is nearest M5V, extrapolated, and the words say so', d0.L.extrapolated && /an M-type at 2,953 K, is nearest the M5V case of Kiang et al\. 2007 \(a modelled M5 dwarf\), extrapolated/.test(d0.L.words[0]), d0.L.words[0]);
  const k442 = lifeOf(P('Kepler-442 b')), k23 = lifeOf(P('K2-3 d')), k452 = lifeOf(P('Kepler-452 b')), k1229 = lifeOf(P('Kepler-1229 b'));
  yes('Kepler-442 b, one face to its star: its ice begins about 97 degrees from the point under the star, on its night side', k442.words.some((w) => /ice begins about 97° from the point under its star, on its night side/.test(w)) && k442.words.includes(LOCKED) && !k442.words.some((w) => /latitude/.test(w)), k442.words.slice(1).join(' | '));
  yes('Kepler-1229 b: its ice begins about 22 degrees from the point under the star, on its day side, so its life keeps near that point', k1229.words.some((w) => /ice begins about 22° from the point under its star, on its day side/.test(w)) && k1229.words.includes(LOCKED_NEAR) && !k1229.words.includes(LOCKED), k1229.words.slice(1).join(' | '));
  yes('K2-3 d, a K-type at 3,844 K, is nearest M1V and says both, with two readings, b naming its type', k23.case.key === 'M1V' && k23.type === 'K' && /a K-type at 3,844 K, is nearest the M1V case/.test(k23.words[0]) && k23.scenarios.length === 2 && /whose temperature this K-type star's is nearest/.test(k23.scenarios[1].words), k23.words[0]);
  const k715 = lifeOf(P('TOI-715 b')), k283 = lifeOf(P('Kepler-283 c'));
  yes('at the edges of the day side: TOI-715 b, ice from about 83 degrees, keeps near the point under its star; Kepler-283 c, from about 95, keeps to the day side and twilight; K2-3 d, locked with no ice, too',
    k715.words.some((w) => /ice begins about 83° from the point under its star, on its day side/.test(w)) && k715.words.includes(LOCKED_NEAR)
    && k283.words.some((w) => /ice begins about 95° from the point under its star, on its night side/.test(w)) && k283.words.includes(LOCKED) && !k283.words.includes(LOCKED_NEAR)
    && k23.words.includes(LOCKED) && !k23.words.includes(LOCKED_NEAR) && !k23.words.some((w) => /ice begins/.test(w)), `${k715.words.slice(-2).join(' | ')} || ${k283.words.slice(-2).join(' | ')}`);
  const g2 = withAir('GJ 1002 b', 'thick');
  yes('the ice line follows the scenario the visitor chose: GJ 1002 b drawn thick has its ice begin about 76 degrees from its star', g2.L.words.some((w) => /ice begins about 76° from the point under its star/.test(w)), g2.L.words.slice(1).join(' | '));
  yes('Kepler-452 b, an ocean world, is told its life would be mostly in the water', k452.words.includes(OCEAN));
  let n = 0, errors = 0, unnamed = 0, colourless = 0, desertsDrawn = 0, sparseOutside = 0, subNeptunes = 0, subNeptuneWrong = 0, noSurfacePeak = 0, gravity = 0, iceOff = 0;
  let hotDeserts = 0, hotDesertWrong = 0, noRadius = 0, noRadiusWrong = 0, iceGiants = 0, iceGiantWrong = 0;
  for (const p of list) {
    let k, L;
    try { k = classify(p); L = lifeOf(p, k); } catch { errors++; continue; }
    n++;
    if (L.case && !L.words[0].includes(` ${L.case.key} case `)) unnamed++;
    if (L.scenarios.some((s) => !/^#[0-9a-f]{6}$/.test(s.colour.hex))) colourless++;
    if (k.look === 'desert' && L.scenarios.some((s) => s.cover > 0)) desertsDrawn++;
    if (L.where.surface === 'sparse' && !['cons', 'opt'].includes(hzPosition(p).key)) sparseOutside++;
    if (k.look === 'fluid' && k.klass === 2 && k.physics.radiusKnown) { subNeptunes++; if (L.words[0] !== WHY.subNeptune) subNeptuneWrong++; }
    if (k.look === 'desert' && hzPosition(p).key === 'hot') { hotDeserts++; if (L.words[0] !== WHY.desertHot) hotDesertWrong++; }
    if (k.look === 'fluid' && !k.physics.radiusKnown) { noRadius++; if (L.words[0] !== WHY.noRadius) noRadiusWrong++; }
    if (k.look === 'fluid' && k.klass === 3 && k.physics.radiusKnown) { iceGiants++; if (L.words[0] !== WHY.iceGiant) iceGiantWrong++; }
    if (!L.where.surface && L.words.some((w) => /would peak/.test(w))) noSurfacePeak++;
    if (L.words.some((w) => /gravity/.test(w))) gravity++;
    if (k.look !== 'temperate' && L.words.some((w) => /ice (lies|reaches|begins)/.test(w))) iceOff++;
  }
  yes('every planet in the catalogue is described, its case named, every colour a colour', errors === 0 && unnamed === 0 && colourless === 0 && n === list.length, `${n} described, ${errors} errors, ${unnamed} unnamed, ${colourless} colourless`);
  yes('no desert is drawn with a cover or called sparse outside the zone, and every sub-Neptune is called one', desertsDrawn === 0 && sparseOutside === 0 && subNeptunes > 1000 && subNeptuneWrong === 0, `${desertsDrawn} ${sparseOutside} ${subNeptunes} ${subNeptuneWrong}`);
  yes('a desert past the zone\'s inner edge is told its water would be gone; a world drawn with no measured radius is told so', hotDeserts > 500 && hotDesertWrong === 0 && noRadius > 10 && noRadiusWrong === 0 && iceGiants > 100 && iceGiantWrong === 0, `${hotDeserts} ${hotDesertWrong} ${noRadius} ${noRadiusWrong} ${iceGiants} ${iceGiantWrong}`);
  yes('no world without surface life speaks of the light at its surface, none of gravity, and the ice line only of a temperate world', noSurfacePeak === 0 && gravity === 0 && iceOff === 0, `${noSurfacePeak} ${gravity} ${iceOff}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
