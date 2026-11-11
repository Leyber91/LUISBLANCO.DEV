/* ============================================================
   altverse/physics.js — the quantities a divergence moves.

   Every row: ours, theirs, unit, how it was computed, a tag
   (REAL = a published value or a textbook formula evaluated here;
   ILLUSTRATIVE = an assumption or scaling chosen to show the
   mechanism) and a source key from sources.js.

   The fine-structure section is the one place the engine reaches
   into nuclei. It shifts real binding energies by the change in
   the Coulomb term of a uniform-sphere nucleus and asks whether
   each nucleus is still more bound than the alpha particles it
   could break into. First order only: a real nucleus would
   rearrange. The test is checked against our world, where it
   finds beryllium-8 unbound, as it is.
   ============================================================ */

import { EARTH } from './config.js';

/* Binding energies in MeV from AME2020 (Wang et al. 2021), to 0.01 MeV.
   Entered from the evaluation as remembered; uncertain in the last digit. */
export const NUCLIDES = [
  ['H', 1, 2, 2.2246], ['H', 1, 3, 8.4818], ['He', 2, 3, 7.7180], ['He', 2, 4, 28.2957],
  ['Li', 3, 6, 31.9940], ['Li', 3, 7, 39.2446], ['Be', 4, 8, 56.4995], ['Be', 4, 9, 58.1649],
  ['B', 5, 10, 64.7507], ['B', 5, 11, 76.2048], ['C', 6, 12, 92.1617], ['C', 6, 13, 97.1080],
  ['N', 7, 14, 104.6587], ['N', 7, 15, 115.4919], ['O', 8, 16, 127.6193], ['O', 8, 18, 139.8070],
  ['F', 9, 19, 147.8013], ['Ne', 10, 20, 160.6448], ['Na', 11, 23, 186.5642], ['Mg', 12, 24, 198.2569],
  ['Al', 13, 27, 224.9517], ['Si', 14, 28, 236.5368], ['P', 15, 31, 262.9166], ['S', 16, 32, 271.7808],
  ['Cl', 17, 35, 298.2101], ['K', 19, 39, 333.7240], ['Ca', 20, 40, 342.0521], ['Fe', 26, 56, 492.2539],
  ['Ni', 28, 58, 506.4590], ['Cu', 29, 63, 551.3846], ['Zn', 30, 64, 559.0953], ['Sn', 50, 120, 1020.546],
  ['Au', 79, 197, 1559.402], ['Pb', 82, 208, 1636.430], ['U', 92, 238, 1801.695],
];

const E_C = (Z, A) => 0.72 * Z * (Z - 1) / Math.cbrt(A);     // MeV; (3/5) Z(Z-1) e^2/(4 pi eps0 r0 A^1/3), r0 = 1.2 fm

export function nuclideSurvival(alphaFactor) {
  const k = alphaFactor - 1;
  const Bp = (Z, A, B) => B - k * E_C(Z, A);
  const he4 = Bp(2, 4, 28.2957);
  const d = Bp(1, 2, 2.2246);
  return NUCLIDES.map(([sym, Z, A, B]) => {
    const b = Bp(Z, A, B);
    const N = A - Z;
    const nAlpha = A > 4 ? Math.min(Math.floor(Z / 2), Math.floor(N / 2)) : 0;
    const frag = nAlpha * he4 + (A > 4 ? Math.max(0, Math.min(Z - 2 * nAlpha, N - 2 * nAlpha)) * Math.max(0, d) : (A === 3 ? Math.max(0, d) : 0));
    const bound = b > 0 && (A <= 2 || b > frag);
    return { sym, Z, A, N, B, Bp: b, frag, bound, margin: b - frag };
  });
}

const q = (id, name, ours, theirs, unit, how, tag, src, digits = 3) => ({ id, name, ours, theirs, unit, how, tag, src, digits });

export function computePhysics(k) {
  const out = [];
  const notModelled = [];
  let planet = true, chemistry = 'ours', nuclides = null, observersPossible = true;

  /* ---- fine-structure constant ---- */
  if (k.alphaFactor !== 1) {
    const a = k.alphaFactor;
    if (k.cFactor !== 1) out.push(q('q-c', 'speed of light', EARTH.cKms, EARTH.cKms * k.cFactor, 'km/s', 'c x factor, with e, h and eps0 held fixed', 'REAL', 'duff2002', 4));
    out.push(q('q-alpha', 'fine-structure constant 1/alpha', EARTH.alphaInv, EARTH.alphaInv / a, '', 'alpha = e^2 / (4 pi eps0 hbar c)', 'REAL', 'codata2018', 4));
    out.push(q('q-bohr', 'atom size (Bohr radius, fixed electron mass)', 1, 1 / a, 'x ours', 'a0 ~ 1/alpha', 'REAL', 'codata2018'));
    out.push(q('q-ryd', 'atomic binding / electron rest energy', 1, a * a, 'x ours', 'Rydberg / (m_e c^2) = alpha^2 / 2', 'REAL', 'codata2018'));
    out.push(q('q-zcrit', 'charge where Z alpha = 1 (Dirac, point nucleus)', EARTH.alphaInv, EARTH.alphaInv / a, 'Z', 'Z = 1/alpha; finite nuclei push it to about 170 in ours', 'REAL', 'greiner1985', 3));
    out.push(q('q-gold', 'relativistic term for gold (Z alpha)^2', (79 / EARTH.alphaInv) ** 2, (79 * a / EARTH.alphaInv) ** 2, '', 'gold\'s colour and mercury\'s low melting point are relativistic effects of this size', 'REAL', 'pyykko1988'));
    out.push(q('q-gamow', 'Gamow energy of proton-proton fusion', 0.493, 0.493 * a * a, 'MeV', 'E_G = 2 m_r c^2 (pi alpha)^2', 'REAL', 'adams2008'));
    out.push(q('q-ccoul', 'Coulomb share of carbon-12 binding', E_C(6, 12) / 92.1617, a * E_C(6, 12) / 92.1617, '', 'uniform-sphere Coulomb term / binding', 'ILLUSTRATIVE', 'weizsacker1935'));
    nuclides = nuclideSurvival(a);
    const alive = (s, A) => nuclides.find((n) => n.sym === s && n.A === A)?.bound;
    if (!alive('C', 12) || !alive('O', 16)) { chemistry = 'none'; planet = false; observersPossible = false; }
    else if (Math.abs(a - 1) > 0.04) chemistry = 'rescaled';
    notModelled.push('Stellar structure at the new alpha. Whether hydrogen-burning stars exist is not computed (Adams 2008 maps that space).');
    notModelled.push('Big Bang nucleosynthesis at the new alpha.');
    if (chemistry === 'rescaled') notModelled.push('Chemistry itself. Atoms and bond energies rescale; the engine keeps biology but tags every claim downstream SPECULATIVE.');
  }

  /* ---- gravity ---- */
  if (k.gFactor !== 1) {
    const g = k.gFactor, rg = Math.sqrt(g);
    out.push(q('q-g', 'surface gravity', EARTH.g, EARTH.g * g, 'm/s2', 'same radius, mass x factor', 'ILLUSTRATIVE', 'record'));
    out.push(q('q-rho', 'mean density', EARTH.densityGcc, EARTH.densityGcc * g, 'g/cm3', 'M / (4/3 pi R^3)', 'REAL', 'record'));
    out.push(q('q-vesc', 'escape velocity', EARTH.vEscKms, EARTH.vEscKms * rg, 'km/s', 'sqrt(2 g R)', 'REAL', 'record'));
    out.push(q('q-dv', 'delta-v to low orbit', EARTH.dvLeoKms, EARTH.dvLeoKms * rg, 'km/s', 'scaled with orbital speed sqrt(g R)', 'ILLUSTRATIVE', 'hippke2019'));
    out.push(q('q-mr', 'rocket mass ratio to orbit (hydrogen-oxygen)', Math.exp(EARTH.dvLeoKms / EARTH.veKms), Math.exp(EARTH.dvLeoKms * rg / EARTH.veKms), '', 'exp(delta-v / v_e), v_e = 4.4 km/s', 'REAL', 'tsiolkovsky1903'));
    out.push(q('q-h', 'atmospheric scale height', EARTH.scaleHeightKm, EARTH.scaleHeightKm / g, 'km', 'H = R T / (M g)', 'REAL', 'record'));
    out.push(q('q-p', 'surface pressure (same air mass per area)', EARTH.pressureBar, EARTH.pressureBar * g, 'bar', 'p = column mass x g', 'ILLUSTRATIVE', 'record'));
    out.push(q('q-lapse', 'dry adiabatic lapse rate', EARTH.lapseDry, EARTH.lapseDry * g, 'K/km', 'g / c_p', 'REAL', 'record'));
    out.push(q('q-peak', 'tallest possible mountain', EARTH.everestKm, EARTH.everestKm / g, 'km', 'h_max ~ 1/g', 'REAL', 'weisskopf1975'));
    out.push(q('q-tree', 'tallest possible tree', EARTH.treeMaxM, EARTH.treeMaxM / g, 'm', 'hydraulic limit ~ 1/(rho g)', 'REAL', 'koch2004'));
    out.push(q('q-fly', 'power to fly, same wing area', 1, g, 'x ours', 'P ~ W^1.5 / sqrt(rho), with rho ~ g', 'ILLUSTRATIVE', 'haldane1926'));
    out.push(q('q-big', 'largest land animal, same bone stress', 1, 1 / (g * g * g), 'x ours mass', 'stress ~ L g, so L ~ 1/g and mass ~ 1/g^3', 'ILLUSTRATIVE', 'haldane1926'));
    notModelled.push('A different planet history. The engine keeps Earth\'s radius, plate tectonics and continents and scales only what gravity scales.');
  }

  /* ---- ice density ---- */
  if (k.iceDensity > 1.0) {
    const melt = (EARTH.heatFlowMWm2 / 1000) / (k.iceDensity * 1000 * 334000) * 3.156e7 * 1000;   // mm/yr
    out.push(q('q-ice', 'density of ice', EARTH.iceDensity, k.iceDensity, 'g/cm3', 'chosen: ice as much denser than water as ours is lighter', 'ILLUSTRATIVE', 'petrenko1999'));
    out.push(q('q-seawater', 'salinity above which seawater has no 4 C maximum', 24.7, 24.7, 'g/kg', 'already true of our oceans: seawater is densest at its freezing point', 'REAL', 'talley2011', 3));
    out.push(q('q-melt', 'floor ice melted by geothermal heat', 0, melt, 'mm/yr', 'q / (rho_ice L), q = 87 mW/m2, L = 334 kJ/kg', 'REAL', 'davies2010', 2));
    out.push(q('q-fill', 'years to fill a 3.7 km polar basin with sunken ice', Infinity, 3680 / Math.max(0.01, 1.5 - melt / 1000), 'yr', 'depth / (1.5 m of winter ice per year minus geothermal melt)', 'ILLUSTRATIVE', 'davies2010', 3));
    notModelled.push('Ocean circulation. Without a floating lid the engine still uses our heat transport.');
  }

  /* ---- tilt, day, Moon ---- */
  if (k.tiltDeg !== 23.44) {
    out.push(q('q-tilt', 'axial tilt', EARTH.tiltDeg, k.tiltDeg, 'deg', 'given', 'REAL', 'record', 3));
    out.push(q('q-arctic', 'polar circle latitude', 90 - EARTH.tiltDeg, 90 - k.tiltDeg, 'deg', '90 - tilt', 'REAL', 'berger1978', 3));
  }
  if (k.dayHours !== 24) {
    out.push(q('q-day', 'length of day', 24, k.dayHours, 'h', k.moon === 0 ? 'assumed for a Moonless Earth' : 'given', k.moon === 0 ? 'ILLUSTRATIVE' : 'REAL', 'record', 3));
    out.push(q('q-cor', 'Coriolis parameter at 45 degrees', 1.03e-4, 1.03e-4 * 24 / k.dayHours, '1/s', 'f = 2 Omega sin(45)', 'REAL', 'record', 3));
  }
  if (k.moon !== 1 || k.moonDist !== 1) {
    const tide = (k.moon / Math.pow(k.moonDist, 3) + 0.46) / 1.46;
    out.push(q('q-tide', 'tidal range', 1, tide, 'x ours', 'lunar tide ~ M/d^3, plus the solar tide at 0.46 of the lunar', 'REAL', 'record'));
    out.push(q('q-obl', 'swing of the axial tilt over millions of years', 1.3, k.moon === 0 ? 85 : 1.3, 'deg', k.moon === 0 ? 'chaotic from 0 to about 85 degrees without the Moon' : 'kept by the Moon', 'REAL', 'laskar1993', 3));
  }

  /* ---- star and air ---- */
  if (k.solar !== 1) {
    out.push(q('q-sol', 'sunlight at Earth', EARTH.solarWm2, EARTH.solarWm2 * k.solar, 'W/m2', 'S x factor', 'REAL', 'kopp2011', 4));
    out.push(q('q-seff', 'sunlight / runaway greenhouse threshold (3-D models)', 1 / 1.1, k.solar / 1.1, '', 'S_eff / 1.1', 'REAL', 'kopparapu2013'));
  }
  if (k.co2ppm !== EARTH.co2ppm) {
    out.push(q('q-co2', 'carbon dioxide', EARTH.co2ppm, k.co2ppm, 'ppm', 'given', 'REAL', 'record', 3));
    out.push(q('q-forcing', 'radiative forcing', 0, 5.35 * Math.log(k.co2ppm / EARTH.co2ppm), 'W/m2', '5.35 ln(C/C0)', 'REAL', 'myhre1998'));
    out.push(q('q-ecs', 'equilibrium warming at 3 C per doubling', 0, 3 * Math.log2(k.co2ppm / EARTH.co2ppm), 'C', '3 x log2(C/C0)', 'REAL', 'ipcc2021'));
  }
  if (k.o2Frac !== EARTH.o2Frac) {
    out.push(q('q-o2', 'oxygen fraction', EARTH.o2Frac * 100, k.o2Frac * 100, '%', 'given', 'REAL', 'record', 3));
    out.push(q('q-po2', 'oxygen partial pressure at sea level', 21.2, 101.3 * k.o2Frac * k.gFactor, 'kPa', 'fraction x surface pressure', 'REAL', 'record', 3));
    out.push(q('q-fire', 'margin above the 15% wildfire floor', EARTH.o2Frac * 100 - 15, k.o2Frac * 100 - 15, 'points', 'fire cannot spread below about 15% O2', 'REAL', 'belcher2008', 3));
  }

  /* ---- deep-time switches ---- */
  if (!k.impact) out.push(q('q-kpg', 'species lost at the end of the Cretaceous', 75, 0, '%', 'the impact does not happen', 'REAL', 'alvarez1980', 3));
  if (!k.panama) out.push(q('q-pan', 'Atlantic-Pacific seaway', 0, 1, 'open', 'closed 2.8 million years ago in ours', 'REAL', 'odea2016', 2));
  if (!k.medFlood) out.push(q('q-med', 'global sea level from the unfilled Mediterranean', 0, 10, 'm', '3.75 million km3 over 3.6e8 km2 of ocean', 'REAL', 'garcia2009', 3));

  if (!planet) notModelled.push('Any planet. Without carbon and oxygen there is no rock or water to build one; the climate, geography, technology and culture stages are pruned.');
  return { quantities: out, nuclides, planet, chemistry, observersPossible, notModelled };
}
