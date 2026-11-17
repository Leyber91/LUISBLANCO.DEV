/* ============================================================
   The look rules, tested on the worlds whose looks are known.
   Run from the repository root:
     node labs/assets/js/exoplanet/tests/looks.test.mjs

   The eight planets of the Solar System are written as archive
   records (radius and mass in Earth units, orbit in AU and days,
   the Sun as the host) and sent through the pipeline every
   exoplanet goes through. Each must come out as the kind of
   world it is. Then the same rules are checked on exoplanets
   whose kind the literature agrees on, and on the edges of each
   rule.
   ============================================================ */

import { physics, classify, lookOf, toParams, zoneOf, fluidPalette, LOOKS, AIR_THIN, AIR_FULL, lockRadiusAU, TAU_EARTH, SHELL_STRETCH } from '../data.js';
import { photopicFraction, semiMajor } from '../science.js';
import { loadSnapshot } from '../catalog.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (name, got, want, tol) => yes(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `${got} (want ${want} ± ${tol})`);

/* The Solar System as the archive would hold it. Radii, masses, orbits and periods: NASA planetary fact sheets. */
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1, host: 'Sun' };
const sol = (pl_name, pl_rade, pl_masse, pl_orbsmax, pl_orbper) => ({ pl_name, name: pl_name, pl_rade, R: pl_rade, pl_masse, M: pl_masse, pl_orbsmax, a: pl_orbsmax, pl_orbper, P: pl_orbper, pl_eqt: null, ...SUN });
export const SOLAR = [
  sol('Mercury', 0.383, 0.0553, 0.387, 87.97), sol('Venus', 0.949, 0.815, 0.723, 224.7), sol('Earth', 1, 1, 1, 365.25), sol('Mars', 0.532, 0.107, 1.524, 687),
  sol('Jupiter', 11.21, 317.8, 5.204, 4332.6), sol('Saturn', 9.45, 95.2, 9.58, 10759), sol('Uranus', 4.01, 14.5, 19.2, 30687), sol('Neptune', 3.88, 17.1, 30.05, 60190),
];
const by = Object.fromEntries(SOLAR.map((p) => [p.pl_name, p]));

/* ---- the Solar System comes out as itself ---- */
{
  const want = { Mercury: 'airless', Venus: 'shrouded', Earth: 'temperate', Mars: 'desert', Jupiter: 'fluid', Saturn: 'fluid', Uranus: 'fluid', Neptune: 'fluid' };
  for (const [name, look] of Object.entries(want)) yes(`${name} is drawn ${look}`, lookOf(by[name]) === look, lookOf(by[name]));
  yes('Earth has a sea, Mars and Venus have none', toParams(by.Earth).seaY > 0 && toParams(by.Mars).seaY < 0 && toParams(by.Venus).seaY < 0);
  yes('no world is drawn alive: plant cover is 0 for Earth too', SOLAR.every((p) => toParams(p).life === 0));
  yes('Mercury has no air in the picture, Earth has', toParams(by.Mercury).hasAtmo === 0 && toParams(by.Earth).hasAtmo === 1);
  near('the share of air Mars keeps', physics(by.Mars).atmDensity, 0.47, 0.03);
  near('the share of air Earth keeps', physics(by.Earth).atmDensity, 0.97, 0.02);
  near('the share of air Venus keeps', physics(by.Venus).atmDensity, 0.82, 0.03);
  near('the share of air Mercury keeps', physics(by.Mercury).atmDensity, 0, 0.001);
}

/* ---- Earth's ice begins near 65 degrees; Mars carries small caps; nothing else has a cap line ---- */
{
  const lat = (s) => Math.asin(Math.min(1, s)) * 180 / Math.PI;
  near('Earth: latitude where ice begins (deg)', lat(toParams(by.Earth).iceCap), 64, 4);
  near('Mars: latitude where frost begins (deg)', lat(toParams(by.Mars).iceCap), 75, 3);
  yes('Venus and Mercury have no ice line', toParams(by.Venus).iceCap > 1 && toParams(by.Mercury).iceCap > 1);
  // a colder twin of Earth carries more ice, a warmer one less, and none above 298 K
  const twin = (a) => ({ ...by.Earth, pl_name: `Earth at ${a}`, pl_orbsmax: a, a, pl_orbper: 365.25 * Math.pow(a, 1.5), P: 365.25 * Math.pow(a, 1.5) });
  yes('ice reaches lower latitudes as an Earth twin moves out', toParams(twin(1.15)).iceCap < toParams(twin(1.0)).iceCap && toParams(twin(1.0)).iceCap < toParams(twin(0.9)).iceCap);
}

/* ---- cloud tops by temperature ---- */
{
  const J = toParams(by.Jupiter), S = toParams(by.Saturn), U = toParams(by.Uranus), N = toParams(by.Neptune);
  const blue = (c) => c[2] > c[0] * 1.2, warm = (c) => c[0] > c[2] * 1.2;
  yes('Uranus and Neptune are blue', blue(U.colA) && blue(N.colA), `${U.colA.map((x) => x.toFixed(2))} ${N.colA.map((x) => x.toFixed(2))}`);
  yes('Jupiter and Saturn are warm', warm(J.colA) && warm(S.colA));
  yes('Jupiter is banded hardest, Saturn softer, Neptune barely', J.bandContrast > S.bandContrast && S.bandContrast > N.bandContrast && N.bandContrast <= 0.15, `${J.bandContrast.toFixed(2)} ${S.bandContrast.toFixed(2)} ${N.bandContrast.toFixed(2)}`);
  yes('only Jupiter-like cloud carries a great storm', J.storm > 0.8 && N.storm === 0);
  yes('Neptune, a sub-Neptune by radius, is coloured by its temperature and not by its class', lookOf(by.Neptune) === 'fluid' && physics(by.Neptune).domClass === 2 && blue(N.colA));
  // the palette is continuous: no jump across any anchor
  let worst = 0;
  for (let T = 40; T < 2500; T *= 1.01) { const a = fluidPalette(T).a, b = fluidPalette(T * 1.01).a; worst = Math.max(worst, ...a.map((x, i) => Math.abs(x - b[i]))); }
  yes('the cloud-top colour never jumps as temperature rises 1%', worst < 0.02, worst.toFixed(4));
  yes('past the hottest anchor the palette holds', fluidPalette(5000).a[0] === fluidPalette(1800).a[0] && fluidPalette(10).a[0] === fluidPalette(50).a[0]);
}

/* ---- the edges of the look rule ----
   Each bound is written here as a number, not read from data.js, with a case just inside it and a case
   just outside, built so that no other rule gives the same answer. A review on 2026-11-15 broke eight of
   these rules one at a time and the earlier form of this block still passed every time. */
{
  const rock = (m, a, extra = {}) => { const P = 365.25 * Math.pow(a, 1.5); return { pl_name: `rock ${m.toFixed(4)} at ${a}`, name: `rock ${m.toFixed(4)} at ${a}`, pl_masse: m, M: m, pl_rade: Math.pow(m, 0.27), R: Math.pow(m, 0.27), pl_orbsmax: a, a, pl_orbper: P, P, pl_eqt: null, ...SUN, ...extra }; };
  // the mass at which a rock at this orbit keeps a given share of its air (the share rises with mass). The share is
  // the illustrative amount; whether the rock has air at all is the fit's (air.js), and every case here keeps air by it.
  const massFor = (air, a) => { let lo = 0.003, hi = 3; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (physics(rock(m, a)).share < air) lo = m; else hi = m; } return hi; };
  const withAir = (air, a) => { const p = rock(massFor(air, a), a), ph = physics(p); return { p, share: ph.share, air: ph.atmDensity, key: ph.airKey, P: ph.air.fit.P, look: lookOf(p) }; };
  const show = (x) => `${x.share.toFixed(3)}>${x.air.toFixed(3)}:${x.look}`;

  // thin air and full air: the bounds are 0.15 and 0.6 of the air kept
  const a10 = withAir(0.10, 1), a16 = withAir(0.16, 1), a59 = withAir(0.59, 1), a61 = withAir(0.61, 1);
  yes('the cases keep the share they were built to keep, and the fit gives each of them air', [[a10, 0.10], [a16, 0.16], [a59, 0.59], [a61, 0.61]].every(([x, t]) => Math.abs(x.share - t) < 0.004 && x.P >= 0.5), [a10, a16, a59, a61].map((x) => `${show(x)} P ${x.P.toFixed(2)}`).join(' '));
  yes('a rock the fit gives air keeps at least 0.15 of it: a share of 0.10 is drawn at 0.15, and 0.16 at 0.16', a10.key === 'thin' && a10.air === 0.15 && a10.look === 'desert' && Math.abs(a16.air - a16.share) < 1e-12, `${show(a10)} ${show(a16)}`);
  yes('at Earth\'s orbit, a share of 0.59 is thin air (a desert) and 0.61 thick air (seas)', a59.key === 'thin' && a59.look === 'desert' && a61.key === 'thick' && a61.look === 'temperate', `${show(a59)} ${show(a61)}`);
  yes('thin air never reaches the full-air bound: a share of 0.9 drawn thin is held at 0.59', physics(rock(massFor(0.9, 1), 1), { air: 'thin' }).atmDensity === 0.59 && physics(rock(massFor(0.9, 1), 1), { air: 'thin' }).airKey === 'thin');
  yes('thick air is never under the full-air bound: a share of 0.3 drawn thick is held at 0.6', physics(rock(massFor(0.3, 1), 1), { air: 'thick' }).atmDensity === 0.6);
  yes('bare rock has none, whatever the share', physics(rock(massFor(0.9, 1), 1), { air: 'bare' }).atmDensity === 0 && lookOf(rock(massFor(0.9, 1), 1), physics(rock(massFor(0.9, 1), 1), { air: 'bare' })) === 'airless');
  yes('the bounds data.js exports are those two numbers', AIR_THIN === 0.15 && AIR_FULL === 0.6);

  // the habitable-zone limits, by flux
  const earthAt = (a) => ({ ...by.Earth, pl_name: `Earth at ${a} AU`, pl_orbsmax: a, a, pl_orbper: 365.25 * Math.pow(a, 1.5), P: 365.25 * Math.pow(a, 1.5) });
  const z = zoneOf(by.Earth);
  near('recent-Venus limit for the Sun (S_earth)', z.sInnerOpt, 1.776, 0.01);
  near('early-Mars limit for the Sun (S_earth)', z.sOuterOpt, 0.320, 0.005);
  // the picture reads the zone the sheets print (starlight.js hzPosition): with the star's radius missing, the archive's
  // insolation against the star's own edges, not the picture's stand-in radius
  const noRadius = { ...by.Earth, pl_name: 'an Earth whose star has no radius', name: 'an Earth whose star has no radius', st_rad: null, Rs: null, S: 0.2 };
  yes('a world whose star has no radius is placed by the archive\'s starlight, as its sheet is', zoneOf(noRadius).S === 0.2 && Math.abs(zoneOf(noRadius).sOuterOpt - z.sOuterOpt) < 1e-12, `${zoneOf(noRadius).S}`);
  // the picture draws the orbit every sheet prints (starlight.js semiMajor): Kepler's law from the period and the star's
  // mass, where the archive's orbit belongs to another solution (backtest_orbit.py)
  const offOrbit = { ...by.Earth, pl_name: 'an Earth the archive puts at 0.8 AU', name: 'an Earth the archive puts at 0.8 AU', pl_orbsmax: 0.8, a: 0.8 };
  yes('the picture draws the orbit the sheets print, not the archive\'s', Math.abs(physics(offOrbit).a - 1) < 1e-9 && physics(offOrbit).a === semiMajor(offOrbit).a, `${physics(offOrbit).a}`);
  const aIn = 1 / Math.sqrt(z.sInnerOpt), aOut = 1 / Math.sqrt(z.sOuterOpt);
  yes('just inside the recent-Venus distance an Earth is shrouded, just outside it keeps seas', lookOf(earthAt(aIn * 0.99)) === 'shrouded' && lookOf(earthAt(aIn * 1.01)) === 'temperate', `${lookOf(earthAt(aIn * 0.99))} / ${lookOf(earthAt(aIn * 1.01))}`);
  // the cold limit, on a world with thin air: its temperature alone would leave it a desert, so only the flux rule makes it ice
  const inside = withAir(0.35, aOut * 0.99), outside = withAir(0.35, aOut * 1.01);
  yes('a thin-air rock is a desert just inside the early-Mars distance and ice just outside it', inside.look === 'desert' && outside.look === 'ice' && inside.air > 0.15 && inside.air < 0.6 && outside.air > 0.15 && outside.air < 0.6, `${show(inside)} / ${show(outside)}`);
  yes('an Earth with full air whose mean surface is under 245 K is ice inside the zone, and has seas at 246 K', lookOf(earthAt(1.45)) === 'ice' && physics(earthAt(1.45)).Tsurf < 245 && lookOf(earthAt(1.42)) === 'temperate' && physics(earthAt(1.42)).Tsurf > 245, `${physics(earthAt(1.45)).Tsurf.toFixed(1)} K ${lookOf(earthAt(1.45))} / ${physics(earthAt(1.42)).Tsurf.toFixed(1)} K ${lookOf(earthAt(1.42))}`);

  // molten at 1,200 K, with the temperature given outright so the test does not lean on the rule's own variable.
  // A world with air: 2 Earth masses at 1.206 Earth radii keeps air by the fit at these orbits, and its illustrative
  // share is under 0.15, so it is drawn with thin air at 0.15 of Earth's: its mean surface is Teq + 33 x 0.15 K.
  const aired = (Teq, a) => rock(2, a, { pl_eqt: Teq - 33 * 0.15 });
  const hot = (Teq, a) => lookOf(aired(Teq, a));
  yes('the rock built to keep air keeps thin air at 0.15 at 0.05, 0.099, 0.101 and 0.2 AU', [0.05, 0.099, 0.101, 0.2].every((a) => { const ph = physics(aired(1100, a)); return ph.airKey === 'thin' && ph.atmDensity === 0.15; }));
  yes('beyond 0.1 AU a rock with air whose mean surface is 1,199 K is not molten and one at 1,201 K is', hot(1199, 0.2) !== 'molten' && hot(1201, 0.2) === 'molten', `${hot(1199, 0.2)} / ${hot(1201, 0.2)}`);
  // inside 0.1 AU the day side counts: 1.18921 times the surface, so 1,010 K reaches 1,201 K and 1,008 K only 1,199 K
  yes('inside 0.1 AU a rock with air at 1,010 K is molten by its day side and one at 1,008 K is not', hot(1010, 0.05) === 'molten' && hot(1008, 0.05) !== 'molten', `${hot(1010, 0.05)} / ${hot(1008, 0.05)}`);
  yes('the same 1,010 K beyond 0.1 AU is not molten', hot(1010, 0.2) !== 'molten', hot(1010, 0.2));
  yes('the day-side rule changes at 0.1 AU: 1,010 K is molten at 0.099 AU and not at 0.101 AU', hot(1010, 0.099) === 'molten' && hot(1010, 0.101) !== 'molten');
  // A locked bare rock melts by its own day side: Teff sqrt(R_star / a) (0.9 x 2/3)^(1/4), with no greenhouse and
  // whatever the archive's Teq. Around the Sun that is 5,772 x 0.880 x sqrt(0.00465047 / a) K, which is 1,200 K at
  // a = 0.00465047 (5,772 x 0.88011 / 1,200)^2 AU.
  const bareAt = (T) => { const a = 0.00465047 * Math.pow(5772 * Math.pow(0.9 * 2 / 3, 0.25) / T, 2); return { pl_name: `bare rock at ${T} K`, pl_rade: 0.45, pl_masse: 0.05, st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, pl_orbsmax: a, a, pl_orbper: 365.25 * Math.pow(a, 1.5), pl_eqt: 300 }; };
  yes('the locked bare rocks are bare by the fit and locked', [1199, 1201].every((T) => { const ph = physics(bareAt(T)); return ph.airKey === 'bare' && ph.air.by === 'fit' && ph.locked && ph.bare; }));
  // beyond the lock radius a bare rock turns, and the mean surface decides: no greenhouse, so the archive's Teq itself
  const turning = (Teq) => ({ pl_name: `turning bare rock at ${Teq} K`, pl_rade: 0.45, pl_masse: 0.05, st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, pl_orbsmax: 0.5, a: 0.5, pl_orbper: 129.1, pl_eqt: Teq });
  yes('a bare rock beyond the lock radius is bare and not locked', physics(turning(1201)).airKey === 'bare' && physics(turning(1201)).air.by === 'fit' && !physics(turning(1201)).locked && physics(turning(1201)).bare === null);
  yes('beyond the lock radius a bare rock at 1,199 K is not molten and one at 1,201 K is', lookOf(turning(1199)) === 'airless' && lookOf(turning(1201)) === 'molten', `${lookOf(turning(1199))} / ${lookOf(turning(1201))}`);
  yes('a locked bare rock whose day side is 1,199 K is not molten and one at 1,201 K is, though the archive says 300 K', lookOf(bareAt(1199)) === 'airless' && lookOf(bareAt(1201)) === 'molten', `${lookOf(bareAt(1199))} / ${lookOf(bareAt(1201))}`);

  // a cold airless body of low density is an ice shell; a dense one is rock. The bound is 0.6 of Earth's density.
  const small = (rho) => { const m = 0.008, R = Math.cbrt(m / rho); return { ...rock(m, 3), pl_rade: R, R }; };
  const icy = small(0.58), stony = small(0.62);
  yes('both small bodies are airless and beyond the early-Mars limit', physics(icy).atmDensity < 0.15 && physics(stony).atmDensity < 0.15 && zoneOf(icy).S < zoneOf(icy).sOuterOpt);
  yes('a cold airless body at 0.58 of Earth\'s density is an ice shell and one at 0.62 is bare rock', lookOf(icy) === 'ice' && lookOf(stony) === 'airless', `${lookOf(icy)} / ${lookOf(stony)}`);
  yes('the same light body inside the zone is bare rock: ice needs the cold', lookOf({ ...icy, pl_orbsmax: 1, a: 1, pl_orbper: 365.25, P: 365.25 }) === 'airless');

  // the waterline
  yes('the waterline of a temperate world of Earth\'s class is 0.55, and 0.72 for the larger rocky class', toParams(by.Earth).seaLevel === 0.55 && toParams({ ...by.Earth, pl_name: 'a larger rock', pl_rade: 1.95, R: 1.95, pl_masse: 6, M: 6 }).seaLevel === 0.72 && toParams({ ...by.Earth, pl_name: 'a larger rock', pl_rade: 1.95, R: 1.95, pl_masse: 6, M: 6 }).look === 'temperate');
}

/* ---- one face to the star ---- */
{
  // Kasting, Whitmire & Reynolds 1993, eq. 10, at 4.5 Gyr with P0 = 13.5 h and Q = 100
  near('tidal-lock radius for one solar mass (AU)', lockRadiusAU(1), 0.460, 0.003);
  near('tidal-lock radius for half a solar mass (AU)', lockRadiusAU(0.5), 0.365, 0.003);
  const at = (a, Ms = 1) => ({ ...by.Earth, pl_name: `a ${a} M ${Ms}`, pl_orbsmax: a, a, pl_orbper: 365.25 * Math.sqrt(a * a * a / Ms), P: 365.25 * Math.sqrt(a * a * a / Ms), st_mass: Ms, Ms });
  yes('just inside the lock radius a world is drawn locked, just outside it is not', classify(at(lockRadiusAU(1) * 0.99)).locked === true && classify(at(lockRadiusAU(1) * 1.01)).locked === false);
  yes('the radius follows the star\'s mass: 0.40 AU is free around the Sun\'s twin at half the mass and locked at full mass', classify(at(0.40, 0.5)).locked === false && classify(at(0.40, 1)).locked === true);
  yes('a locked world does not turn under its star', toParams(at(0.1)).spin === 0 && toParams(by.Earth).spin > 0);
  yes('Venus, Earth, Mars and Jupiter are not locked; Mercury lies inside the radius, as the paper notes', !classify(by.Venus).locked && !classify(by.Earth).locked && !classify(by.Mars).locked && !classify(by.Jupiter).locked && classify(by.Mercury).locked);
}

/* ---- air in the picture ---- */
{
  near('Rayleigh optical depth of Earth\'s air at 550 nm', TAU_EARTH[1], 0.097, 0.003);
  yes('blue scatters about three times more than red', TAU_EARTH[2] / TAU_EARTH[0] > 2.8 && TAU_EARTH[2] / TAU_EARTH[0] < 3.3, (TAU_EARTH[2] / TAU_EARTH[0]).toFixed(2));
  const E = toParams(by.Earth), ph = physics(by.Earth);
  near('Earth\'s drawn scale height over its true one', E.hvis / ph.Hr, 4, 0.01);
  yes('data.js exports that stretch', SHELL_STRETCH === 4);
  near('Earth\'s true scale height (km, at Teq)', ph.Hr * 6371, 7.45, 0.3);
  yes('Earth\'s blue optical depth in the picture is its real one times the air it keeps', Math.abs(E.tauR[2] - TAU_EARTH[2] * ph.atmDensity) < 1e-9);
  yes('Mars has far less gas than Earth and more dust', toParams(by.Mars).tauR[2] < E.tauR[2] * 0.1 && toParams(by.Mars).tauM > E.tauM);
  yes('the shell top sits seven drawn scale heights up', Math.abs(E.atmR - (1 + 7 * E.hvis)) < 1e-9);
  const world = (o) => ({ pl_name: 'a giant', st_teff: 6000, st_rad: 1.2, st_mass: 1.1, pl_orbsmax: 0.05, pl_orbper: 3.9, ...o });
  const mild = world({ pl_rade: 12, pl_masse: 150, pl_eqt: 1500 }), puffy = world({ pl_rade: 12, pl_masse: 30, pl_eqt: 1700 });
  const Hmild = physics(mild).Hr, Hpuffy = physics(puffy).Hr, Hjup = physics(by.Jupiter).Hr;
  yes('the three shells are where the test needs them: one between 0.006 and 0.03 radii, one above 0.03, one under 0.000625', Hmild > 0.006 && Hmild < 0.03 && Hpuffy > 0.03 && Hjup * 4 < 0.0025, `${Hmild.toFixed(4)} ${Hpuffy.toFixed(4)} ${Hjup.toFixed(5)}`);
  yes('a shell whose true scale height is past the stretch limit is drawn at exactly its true height', Math.abs(toParams(mild).hvis - Hmild) < 1e-12, `${toParams(mild).hvis.toFixed(5)} against ${Hmild.toFixed(5)}`);
  yes('a shell taller than 0.03 radii is capped there, thinner than true', toParams(puffy).hvis === 0.03);
  yes('Jupiter\'s shell is raised to the floor of 0.0025 radii, 11 times its true height', toParams(by.Jupiter).hvis === 0.0025 && Math.round(0.0025 / Hjup) === 11, (0.0025 / Hjup).toFixed(1));
  yes('no drawn scale height leaves 0.0025 to 0.03 planet radii', SOLAR.concat([mild, puffy]).every((p) => { const h = toParams(p).hvis; return h >= 0.0025 && h <= 0.03; }));
}

/* ---- thermal light ---- */
{
  near('the eye\'s share of sunlight (a 5,772 K blackbody)', photopicFraction(5772), 0.136, 0.012);
  yes('a 2,800 K blackbody gives the eye several times less', photopicFraction(2800) < photopicFraction(5772) / 4 && photopicFraction(2800) > 0.01, photopicFraction(2800).toFixed(4));
  yes('cool worlds do not glow', SOLAR.every((p) => toParams(p).glowT === 0));
  const lava = toParams({ pl_name: 'a lava world', pl_rade: 1.88, pl_masse: 8.0, st_teff: 5172, st_rad: 0.94, st_mass: 0.9, pl_orbsmax: 0.0154, pl_orbper: 0.737, pl_eqt: 1950 });
  yes('a lava world is molten, locked, and glows', lava.look === 'molten' && lava.locked === 1 && lava.glowT > 2500, `${lava.look} ${lava.glowT.toFixed(0)} K`);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  yes('its glow under the star is of the order of the starlight a dark rock reflects', lum(lava.glow) > 0.03 && lum(lava.glow) < 0.6, lum(lava.glow).toFixed(3));
  yes('its glow is red before it is blue', lava.glow[0] > lava.glow[1] && lava.glow[1] > lava.glow[2]);
  const bare = (a) => { const P = 365.25 * Math.pow(a, 1.5); return toParams({ pl_name: `bare rock at ${a}`, pl_rade: 0.45, pl_masse: 0.05, st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, pl_orbsmax: a, a, pl_orbper: P, pl_eqt: null }); };
  // hottest points of 760 K and 740 K: a locked bare rock around the Sun has 5,772 x 0.9^(1/4) x sqrt(0.00465047 / a) K
  const warm = bare(0.2545), cool = bare(0.2684);
  yes('a bare rock whose hottest point is 760 K glows and one at 740 K does not: the bound is 750 K', warm.look === 'airless' && Math.abs(warm.tsub - 760) < 2 && warm.glowT > 0 && cool.look === 'airless' && Math.abs(cool.tsub - 740) < 2 && cool.glowT === 0, `${warm.tsub.toFixed(0)} K glows, ${cool.tsub.toFixed(0)} K does not`);
  const dusty = toParams({ pl_name: 'a hot rock that keeps its air', pl_rade: 1.5, pl_masse: 5.0, st_teff: 5772, st_rad: 1, st_mass: 1, pl_orbsmax: 0.12, pl_orbper: 15.2, pl_eqt: null });
  yes('only molten and airless rock and fluid worlds are given a glow: a hot world with air has none', (dusty.look === 'desert' || dusty.look === 'shrouded') && dusty.tsub > 750 && dusty.glowT === 0, `${dusty.look} ${dusty.tsub.toFixed(0)} K`);
}

/* ---- every look has a number, and the catalogue is covered ---- */
{
  yes('seven looks, numbered 0 to 6 without a gap', Object.values(LOOKS).sort().join('') === '0123456');
  const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  const { list } = await loadSnapshot();
  const count = {};
  let bad = 0;
  for (const p of list) {
    const prm = toParams(p);
    count[prm.look] = (count[prm.look] || 0) + 1;
    const nums = [prm.seed, prm.spin, prm.iceCap, prm.cloud, prm.hvis, prm.atmR, prm.tauM, prm.tsub, prm.tnight, prm.glowT, ...prm.colA, ...prm.colB, ...prm.colC, ...prm.tauR, ...prm.glow, ...prm.hazeCol];
    if (!(prm.look in LOOKS) || nums.some((x) => !Number.isFinite(x)) || [...prm.colA, ...prm.colB].some((x) => x < 0 || x > 1)) bad++;
  }
  yes(`every one of the ${list.length} catalogue worlds gets a look and finite numbers`, list.length > 5000 && bad === 0, `${bad} bad`);
  console.log('      looks in the catalogue:', Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  yes('every look occurs in the catalogue or in the Solar System', Object.keys(LOOKS).every((k) => count[k] > 0 || SOLAR.some((p) => lookOf(p) === k)), Object.keys(LOOKS).filter((k) => !count[k]).join(' ') || 'all in the catalogue');
  const named = (n) => list.find((p) => p.name === n);
  // TRAPPIST-1 e was drawn with seas until 2026-11-16: the 2026 fit gives it air at 0.4% and its transits allow bare rock
  const want = { '55 Cnc e': 'molten', 'K2-141 b': 'molten', 'HD 209458 b': 'fluid', 'GJ 1214 b': 'fluid', 'TRAPPIST-1 e': 'airless', 'Kepler-442 b': 'temperate' };
  for (const [n, look] of Object.entries(want)) { const p = named(n); yes(`${n} is drawn ${look}`, !!p && lookOf(p) === look, p ? lookOf(p) : 'not in the catalogue'); }
}

/* ---- the shader holds a material for every look, and builds them apart ---- */
{
  const src = readFileSync(join(here, '../exoplanet.js'), 'utf8');
  const named = new Set([...src.matchAll(/EXO_LOOK == (\d)/g)].map((m) => +m[1]));
  yes('every look number is named in the shader\'s EXO_LOOK branches', Object.values(LOOKS).every((n) => named.has(n)), [...named].sort().join(' '));
  yes('the shader names no look that data.js does not have', [...named].every((n) => Object.values(LOOKS).includes(n)));
  yes('the comment on uType lists the looks in data.js order', /0 temperate · 1 fluid · 2 ice · 3 molten · 4 airless · 5 desert · 6 shrouded/.test(src) && Object.entries(LOOKS).map(([k, v]) => `${v} ${k}`).join(' · ') === '0 temperate · 1 fluid · 2 ice · 3 molten · 4 airless · 5 desert · 6 shrouded');
  yes('each orbit program is built for one look only', /#define EXO_LOOK \$\{key \| 0\}/.test(src) && !/uType == \d/.test(src.slice(src.indexOf('#ifndef EXO_SURFACE'), src.indexOf('// ---------- inside a gas giant'))));
  yes('nothing is drawn, and nothing built, before a world is loaded', /type: -1,/.test(src) && /if \(!\(this\.cfg\.type >= 0\)\) return;/.test(src));
  // these five read the source text: they hold names and numbers in step, and say nothing about behaviour.
  // Behaviour of the build path is checked in a browser by tools/drives/planets.mjs.
  yes('no label claims an ocean under ice', classify({ ...by.Earth, pl_name: 'a larger rock far out', pl_rade: 1.95, R: 1.95, pl_masse: 6, M: 6, pl_orbsmax: 3, a: 3, pl_orbper: 1898, P: 1898 }).label === 'Frozen world');
}

/* ---- the heat of a world that is not bare rock (thermal), for the conditions tool (pull request 43) ---- */
{
  const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  const { list } = await loadSnapshot();
  const hj = list.find((p) => p.name === 'HD 209458 b'), c = classify(hj), prm = toParams(hj);
  yes('a locked fluid world: hottest point 1.25 Teq, night 0.75 Teq (HD 209458 b)', c.look === 'fluid' && c.locked && Math.abs(prm.tsub - 1.25 * c.physics.Teq) < 1e-6 && Math.abs(prm.tnight - 0.75 * c.physics.Teq) < 1e-6, c.look + ' ' + prm.tsub + ' ' + prm.tnight + ' ' + c.physics.Teq);
  const cold = toParams({ ...by.Earth, pl_name: 'a cold Earth', pl_eqt: 30 }), cool = toParams({ ...by.Earth, pl_name: 'a cool Earth', pl_eqt: 100 });
  yes('the night side of a free world is 0.95 Teq with a floor of 40 K: 95 K at Teq 100 K, 40 K at Teq 30 K', Math.abs(cool.tnight - 95) < 1e-6 && cold.tnight === 40, cool.tnight + ' ' + cold.tnight);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
