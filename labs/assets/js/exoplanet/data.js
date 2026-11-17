/* ============================================================
   data.js — the physics that turns an archive record into a
   world the shader can draw.

   Every shader input is DERIVED here and is deterministic; the
   only randomness is seeded by the planet's name and places
   features (continents, craters, bands), never decides a kind.

   Two steps:
     physics(p)   numbers: class by radius and density, Teq,
                  gravity, escape speed, the share of air kept
                  (cosmic shoreline), true scale height.
     lookOf(p)    which kind of surface those numbers imply.
                  One of seven looks, each with its own material
                  in exoplanet.js. The rule is below, at LOOKS.

   Records come from catalog.js. When a mass is missing or only
   an upper limit, the Chen & Kipping 2017 forecaster (science.js)
   supplies the median; stellar radius and mass come from the
   archive when it has them.

   The test of this file is the Solar System: its eight planets,
   written as archive records, must come out as themselves
   (tests/looks.test.mjs).
   ============================================================ */

import { forecastFor, starColour, sizeClassOf, limitOf, limitKind, habitableZone, hzPosition, insolation, luminosity, seff, photopicFraction, semiMajor } from './science.js';
import { CHEN_KIPPING, KOPPARAPU } from './config.js';
import { scenariosFor, bareDay, tsubForDay, fitMass, BARE, V_ESC_EARTH } from './air.js';

const EARTH_R = 6.371e6;
const kB = 1.380649e-23, mH = 1.6726e-27;
const RSUN_AU = 0.00465047;     // 1 solar radius in AU

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// ---- deterministic per-planet randomness (a world looks identical every visit) ----
function hashName(name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ============================================================
//  PHYSICS — one canonical pass; returns everything downstream needs
// ============================================================
const A_CLASS = [0.30, 0.20, 0.30, 0.40, 0.20];   // provisional Bond albedo per class for Teq fallback

/* [ILLUSTRATIVE] A world with no measured radius still has to be drawn at some size. The
   drawing uses a stand-in radius, never shown as a number and never fed to a derived value:
   the class a bound implies (a radius limit that fixes the class, or a mass lower limit in
   Chen & Kipping's Jovian regime, above 132 M_earth), else a featureless haze at 3 R_earth,
   the least specific surface the renderer has. */
const STAND_IN_R = { rocky: 1.0, super: 1.75, subnep: 3.0, nep: 6.0, giant: 11.2 };
export function radiusStandIn(p) {
  const c = sizeClassOf(p);
  if (c) return { R: STAND_IN_R[c.key], why: `${c.key === 'giant' ? 'a giant' : 'an Earth-size world'} by its radius ${limitKind(limitOf(p, 'R'))}` };
  const L = limitOf(p, 'M');
  if (L && L.dir < 0 && L.v >= CHEN_KIPPING.segments[1].upTo) return { R: STAND_IN_R.giant, why: 'a giant by its mass lower limit' };
  return { R: STAND_IN_R.subnep, why: 'a featureless haze' };
}

/* opts.air: a scenario to draw instead of the default one ('bare', 'thin' or 'thick'; see air.js). A scenario
   an observation excludes is never drawn. */
export function physics(p, opts = {}) {
  const radiusKnown = typeof p.pl_rade === 'number' && isFinite(p.pl_rade) && p.pl_rade > 0;
  const standIn = radiusKnown ? null : radiusStandIn(p);
  const R = radiusKnown ? p.pl_rade : standIn.R;
  const estMass = p.pl_masse == null;
  const fc = p.pl_masse == null ? forecastFor(p) : null;
  const M = p.pl_masse != null ? p.pl_masse : (fc ? fc.median : Math.pow(R, 2.06));
  const Teff = p.st_teff ?? 5600;
  const Mstar = p.st_mass ?? clamp(Math.pow(Teff / 5772, 1.7), 0.1, 1.6);
  const Rstar = p.st_rad ?? clamp(Math.pow(Mstar, 0.8), 0.1, 4.0);  // solar radii (for star angular size)
  // the page's one orbit (starlight.js semiMajor); a stand-in from the stand-in star only where the archive gives neither
  const a = semiMajor(p).a ?? p.pl_orbsmax ?? (p.pl_orbper ? Math.cbrt(Math.pow(p.pl_orbper / 365.25, 2) * Mstar) : 1);
  const P = p.pl_orbper ?? 365.25 * Math.sqrt(a * a * a / Mstar);   // days

  // radius soft-membership (single tiling scheme)
  let w = [
    1 - smooth(1.4, 1.8, R),                                       // rocky
    smooth(1.4, 1.8, R) * (1 - smooth(1.9, 2.3, R)),              // water/super-Earth
    smooth(1.9, 2.3, R) * (1 - smooth(3.6, 4.2, R)),             // sub-Neptune
    smooth(3.6, 4.2, R) * (1 - smooth(5.6, 6.4, R)),            // ice giant
    smooth(5.6, 6.4, R),                                          // gas giant
  ];
  // density refinement (only with a real mass)
  let rhoRel = null;
  if (!estMass && radiusKnown) {
    rhoRel = clamp(M / Math.pow(R, 3), 0, 1.6);                  // Earth=1, clamp to iron line
    if (R < 2.0 && rhoRel < 0.55) w[1] += 0.4;
    if (R > 2.0 && R < 4.0 && rhoRel > 0.8) { w[1] += 0.3; w[2] -= 0.2; }
  }
  let s = w.reduce((x, y) => x + Math.max(y, 0), 0) + 1e-4;
  w = w.map((x) => Math.max(x, 0) / s);
  const domClass = w.indexOf(Math.max(...w));

  // equilibrium temperature: trust pl_eqt; else Teq = Teff sqrt(R* / 2a) (1 - A)^(1/4), the relation
  // science.js equilibriumTemp() uses. 278.3 K = 5772 K * sqrt(1 R_sun / 2 AU); Rstar is in solar radii.
  const A = A_CLASS[domClass];
  const Teq = p.pl_eqt ?? clamp(278.3 * (Teff / 5772) * Math.sqrt(Rstar / a) * Math.pow(1 - A, 0.25), 30, 4000);

  // gravity / escape
  const gRel = M / (R * R);
  const vEscKms = Math.sqrt(M / R) * V_ESC_EARTH;
  const isGiant = domClass >= 2;

  // insolation and luminosity, as the page states them
  const Lrel = Rstar * Rstar * Math.pow(Teff / 5772, 4);
  const S = Lrel / (a * a);

  /* Whether a rock has air at all is decided in air.js: its own observation first, else the 2026 fit of
     Berta-Thompson, Wachiraphan & Murray, with the flux and luminosity the page shows. [ILLUSTRATIVE] How much
     air it has is not known for any exoplanet. The amount drawn is the share of air kept by escape speed against
     insolation (a 7 km/s anchor, smooth over 0.6 dex; Mercury 0, Mars 0.47, Venus 0.82, Earth 0.97), held inside
     the band of the scenario drawn: 0 for bare rock, AIR_THIN to just under AIR_FULL for thin air, AIR_FULL or more
     for thick air. */
  let atmDensity, share = 1, air = null, airKey = null;
  if (isGiant) atmDensity = 1.0;
  else {
    const Iinsol = Math.pow(Teq / 278.5, 4);
    const margin = Math.log10(vEscKms) - (Math.log10(7.0) + 0.25 * Math.log10(Math.max(Iinsol, 1e-6)));
    share = smooth(-0.3, 0.3, margin);
    // The fit takes the archive's values or none: no flux or luminosity, or no radius, and there is no fit,
    // so the amount of air decides, illustrative. Its mass: the archive's (a minimum mass for most planets found by
    // radial velocity); else the paper's own relation below 1.8 Earth radii (air.js fitMass); else the forecast above.
    const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;
    const vFit = radiusKnown ? Math.sqrt(Mfit / R) * V_ESC_EARTH : null;
    const Sfit = insolation(p).S, Lfit = luminosity(p).L;
    const lacks = [Lfit == null && 'the star\'s luminosity', Sfit == null && 'the flux', vFit == null && 'a radius'].filter(Boolean);
    air = scenariosFor({ name: p.pl_name, S: Sfit, L: Lfit, vEsc: vFit, wantThick: share >= AIR_FULL, wantAir: share >= AIR_THIN, minMass: p.pl_masse != null && p.Mprov === 'Msini', inZone: ['cons', 'opt'].includes(hzPosition(p).key), lacks, starStandIn: p.st_teff == null || p.st_rad == null });
    const can = air.list.find((x) => x.key === opts.air);
    airKey = can && can.status !== 'excluded' ? opts.air : air.drawn;
    atmDensity = airKey === 'thick' ? Math.max(share, AIR_FULL) : airKey === 'thin' ? clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;
  }
  const locked = a < lockRadiusAU(Mstar);
  // a bare rock with one face to its star: its day side by radiative equilibrium, A_B 0.1, f = 2/3 (air.js)
  const bare = !isGiant && atmDensity < AIR_THIN && locked ? bareDay(Teff, Rstar, a) : null;

  // greenhouse-corrected surface temp — Teq omits the greenhouse, so Earth's own
  // Teq (~255K) sits below freezing. Add an Earth-calibrated offset scaled by how
  // much atmosphere the world actually keeps, then decide the surface state.
  const Tsurf = Teq + (isGiant ? 0 : 33 * atmDensity);
  // the day side that decides melt: a measured one (air.js OBSERVED); else a locked bare rock's own (above);
  // else, inside 0.1 AU, 2^(1/4) times the mean
  const dayMeasured = air && air.observed && air.observed.day && locked ? air.observed.day.T : null;
  const Ttest = dayMeasured ?? (bare ? bare.Tday : (a < 0.1) ? Tsurf * 1.18921 : Tsurf);
  let state = 'temperate';
  if (Ttest >= 1700) state = 'lava';
  else if (Ttest >= 1200) state = 'partial';
  else if (Tsurf < 245) state = 'ice';                   // genuine snowball (greenhouse already applied)

  // mean molecular weight by regime -> true scale height
  let mu;
  if (isGiant) mu = 2.3;
  else if (state === 'ice') mu = 26;
  else if (state === 'lava' || state === 'partial') mu = 40;
  else if (Teq > 400 && Teq < 1000) mu = 44;                     // CO2 (Venus-like)
  else mu = 29;
  const gSI = 9.80665 * gRel;
  const Hm = kB * Teq / (mu * mH * gSI);                         // metres
  const Hr = Hm / (R * EARTH_R);                                 // in planet radii (tiny, e.g. Earth ~0.0012)

  // insolation -> exposure multiplier (compressive)
  const lightMul = Math.pow(clamp(S, 0.05, 50), 0.25);

  // star angular radius as seen from the planet (rad); huge for close-in worlds
  const starAngle = clamp((Rstar * RSUN_AU) / a, 0.004, 0.5);

  // stellar magnetic activity by spectral type — drives flares/spots/prominences.
  // Cool dwarfs (deep convection) are violently active; hot radiative stars are calm.
  const starActivity = Teff < 3900 ? 0.95 : Teff < 5300 ? 0.6 : Teff < 6000 ? 0.4 : Teff < 7500 ? 0.22 : 0.07;
  const starSpots    = Teff < 3900 ? 0.5  : Teff < 5300 ? 0.35 : Teff < 6000 ? 0.25 : Teff < 7500 ? 0.12 : 0.03;

  return {
    R, M, estMass, Teff, Mstar, Rstar, a, P, S, Teq, Tsurf, Ttest, gRel, vEscKms,
    rhoRel, domClass, isGiant, state, atmDensity, Hr, lightMul, starAngle,
    starActivity, starSpots, radiusKnown, standIn, share, air, airKey, locked, bare,
  };
}

// ============================================================
//  LOOKS — which kind of surface the numbers imply
// ============================================================
/* The shader's uType. Each look is one material in exoplanet.js. */
export const LOOKS = { temperate: 0, fluid: 1, ice: 2, molten: 3, airless: 4, desert: 5, shrouded: 6 };

/* Shares of air kept (physics().atmDensity, 0 to 1) that separate bare rock from thin air and
   thin air from a full atmosphere. Mercury keeps 0, Mars 0.47, Venus 0.82, Earth 0.97. */
export const AIR_THIN = 0.15, AIR_FULL = 0.6;

/* A world inside this distance is drawn with one face always to its star: no day, a hot spot
   under the star, ice or cold crust on the far side. The distance is the tidal-lock radius of
   Kasting, Whitmire & Reynolds (1993, Icarus 101, 108, eq. 10, after Peale 1977):
   r_T = 0.027 (P0 t / Q)^(1/6) M^(1/3) in CGS units, with their P0 = 13.5 h and Q = 100.
   [ILLUSTRATIVE] the age t: every system is taken as 4.5 Gyr old, which gives 0.46 AU for one
   solar mass. No rotation has been measured for these planets. */
const lockCm = (Msun) => 0.027 * Math.pow(13.5 * 3600 * 4.5e9 * 3.15576e7 / 100, 1 / 6) * Math.cbrt(Msun * 1.98847e33);
export const lockRadiusAU = (Msun) => lockCm(Msun) / 1.495978707e13;

/* Where the planet's sunlight sits against the habitable-zone limits (Kopparapu et al. 2013),
   by flux. The page's own zone line uses the same functions, so the picture and the text agree. */
export function zoneOf(p, ph = physics(p)) {
  const pos = hzPosition(p), e = pos.edges;
  if (pos.key !== 'unknown') return { S: pos.S, sInner: e.sInner, sInnerOpt: e.sInnerOpt, sOuter: e.sOuter, sOuterOpt: e.sOuterOpt };
  const K = KOPPARAPU;
  return { S: ph.S, sInner: seff(ph.Teff, K.runaway), sInnerOpt: seff(ph.Teff, K.recentVenus), sOuter: seff(ph.Teff, K.maxGreen), sOuterOpt: seff(ph.Teff, K.earlyMars) };
}

/* The rule, in order:
     fluid      radius class sub-Neptune or larger: no surface, cloud tops coloured by temperature
     molten     rock whose day side reaches 1,200 K
     airless    rock that keeps under AIR_THIN of its air (ice instead, if cold and of low density)
     ice        colder than the optimistic outer edge of the habitable zone, or a mean surface under 245 K with full air
     desert     thin air (AIR_THIN to AIR_FULL): dust, frost caps, no standing water
     shrouded   full air and more sunlight than the recent-Venus limit: one unbroken cloud deck
     temperate  full air inside the optimistic habitable zone: seas, cloud, ice at the cold end */
export function lookOf(p, ph = physics(p)) {
  if (ph.isGiant) return 'fluid';
  if (ph.state === 'lava' || ph.state === 'partial') return 'molten';
  const z = zoneOf(p, ph);
  const cold = z.S < z.sOuterOpt, hot = z.S > z.sInnerOpt;
  if (ph.atmDensity < AIR_THIN) return (cold && ph.rhoRel !== null && ph.rhoRel < 0.6) ? 'ice' : 'airless';
  if (cold) return 'ice';
  if (ph.atmDensity < AIR_FULL) return 'desert';
  if (hot) return 'shrouded';
  return ph.state === 'ice' ? 'ice' : 'temperate';
}

// ---- classification label for UI / narrative ----
const LOOK_LABEL = {
  airless: ['Airless rock', 'Airless rock'],
  desert: ['Thin-air desert', 'Thin-air desert'],
  shrouded: ['Cloud-shrouded world', 'Cloud-shrouded world'],
  temperate: ['Temperate world with seas', 'Ocean world'],
  ice: ['Frozen world', 'Frozen world'],             // nothing in the archive shows an ocean under the ice
};
export function classify(p, opts = {}) {
  const ph = physics(p, opts);
  const look = lookOf(p, ph);
  let label;
  if (look === 'fluid') {
    label = ['Sub-Neptune', 'Ice giant', 'Gas giant'][ph.domClass - 2];
    if (ph.domClass >= 4) label = ph.Teq > 1200 ? 'Hot Jupiter' : ph.Teq > 800 ? 'Warm gas giant' : ph.Teq < 150 ? 'Cold gas giant' : 'Gas giant';
  } else if (look === 'molten') {
    label = ph.state === 'lava' ? 'Lava world' : 'Molten-surface world';
  } else {
    label = LOOK_LABEL[look][ph.domClass === 1 ? 1 : 0];
  }
  // no measured radius: say so, and say what the drawing stands in with
  if (!ph.radiusKnown) label = `Radius not measured, drawn as ${ph.standIn.why}`;
  return { type: LOOKS[look], look, klass: ph.domClass, state: ph.state, label, atmDensity: ph.atmDensity, locked: ph.locked, physics: ph, air: ph.air, airKey: ph.airKey };
}

// ---- star colour: Planck spectrum through the CIE 1931 observer to sRGB (science.js) ----
function blackbodySRGB(kelvin) { return starColour(kelvin).srgb.slice(); }
const toLinear = (c) => c.map((x) => Math.pow(x, 2.2));
export function starColor(teff) { return toLinear(blackbodySRGB(teff ?? 5600)); }
/* [ILLUSTRATIVE] The light a world is drawn in: its star's colour as an eye three-quarters
   adapted to it would see it. Unadapted, sunlight itself reads warm against a screen's white, a
   grey rock turns pink and cloud turns to sand; fully adapted, a red dwarf's light would read
   white and its worlds would lose the one thing that light does to them. */
export const ADAPTATION = 0.75;
export function lightColor(teff) {
  const c = mix3(starColor(teff), [1, 1, 1], ADAPTATION), k = Math.max(...c);
  return c.map((x) => x / k);
}
// a saturation-boosted version for the star disk itself, so type reads at a glance
function vividStar(teff) {
  const c = toLinear(blackbodySRGB(teff ?? 5600));
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return c.map((x) => clamp(l + (x - l) * 1.5, 0, 1.6));
}

// ============================================================
//  MATERIALS — the colours each look is drawn in (linear reflectance)
// ============================================================

/* [ILLUSTRATIVE] Cloud tops of a world with no surface, by equilibrium temperature. The order
   follows the classes of Sudarsky, Burrows & Pinto (2000, ApJ 538, 885): ammonia cloud below
   150 K (reflective), water cloud near 250 K (the brightest), clear and dark above 350 K, and
   the darkest air from 900 to 1,500 K where sodium and potassium absorb. Three anchors are
   planets we have seen: 50, 85 and 115 K are Neptune, Saturn and Jupiter, and Neptune is drawn
   only slightly bluer than Uranus (Irwin et al. 2024, MNRAS 527, 11521). Two are measurements:
   near 1,200 K the one hot Jupiter with a measured colour is deep blue (HD 189733 b, geometric
   albedo 0.40 at 290-450 nm and under 0.12 at 450-570 nm; Evans et al. 2013, ApJ 772, L16), and
   above 1,500 K, where the 2000 model expected bright silicate cloud, the measured one is nearly
   black (WASP-12 b, under 0.064; Bell et al. 2017, ApJ 847, L2). Columns: Teq (K), the bright
   zones, the dark belts, an accent for storms, band contrast, storm strength. */
const FLUID = [
  { T: 50,   a: [0.50, 0.70, 0.80], b: [0.42, 0.64, 0.78], c: [0.82, 0.90, 0.92], k: 0.10, storm: 0 },
  { T: 62,   a: [0.55, 0.74, 0.76], b: [0.47, 0.68, 0.72], c: [0.84, 0.90, 0.90], k: 0.08, storm: 0 },
  { T: 85,   a: [0.80, 0.70, 0.48], b: [0.66, 0.55, 0.36], c: [0.86, 0.80, 0.62], k: 0.35, storm: 0 },
  { T: 115,  a: [0.92, 0.86, 0.74], b: [0.60, 0.42, 0.28], c: [0.66, 0.29, 0.16], k: 1.00, storm: 1 },
  { T: 200,  a: [0.86, 0.88, 0.90], b: [0.66, 0.72, 0.80], c: [0.95, 0.96, 0.97], k: 0.40, storm: 0.5 },
  { T: 500,  a: [0.10, 0.18, 0.42], b: [0.06, 0.11, 0.30], c: [0.16, 0.26, 0.50], k: 0.30, storm: 0 },
  { T: 1200, a: [0.050, 0.075, 0.200], b: [0.030, 0.045, 0.130], c: [0.09, 0.12, 0.26], k: 0.35, storm: 0 },
  { T: 1800, a: [0.060, 0.052, 0.050], b: [0.035, 0.030, 0.028], c: [0.10, 0.085, 0.08], k: 0.40, storm: 0 },
];
export function fluidPalette(Teq) {
  const F = FLUID;
  if (Teq <= F[0].T) return { ...F[0] };
  if (Teq >= F[F.length - 1].T) return { ...F[F.length - 1] };
  let i = 0; while (Teq > F[i + 1].T) i++;
  const t = Math.log(Teq / F[i].T) / Math.log(F[i + 1].T / F[i].T), lo = F[i], hi = F[i + 1];
  return { T: Teq, a: mix3(lo.a, hi.a, t), b: mix3(lo.b, hi.b, t), c: mix3(lo.c, hi.c, t), k: lo.k + (hi.k - lo.k) * t, storm: lo.storm + (hi.storm - lo.storm) * t };
}

function palette(look, ph, rand) {
  const { domClass, Teq, Tsurf, rhoRel, atmDensity } = ph;
  const k = 0.94 + rand() * 0.12;                               // a few percent of seeded variation in brightness, the same in every channel
  if (look === 'fluid') {
    const f = fluidPalette(Teq);
    // photochemical haze veils a sub-Neptune between about 300 and 900 K and flattens its bands
    const haze = domClass === 2 ? smooth(150, 300, Teq) * (1 - smooth(900, 1100, Teq)) * 0.85 : 0;
    const hazeCol = Teq < 400 ? [0.62, 0.66, 0.70] : [0.62, 0.50, 0.34];
    return {
      colA: mix3(f.a, hazeCol, haze).map((x) => x * k), colB: mix3(f.b, hazeCol.map((x) => x * 0.9), haze), colC: f.c,
      bandContrast: f.k * (1 - 0.8 * haze), storm: f.storm * (1 - haze), haze, hazeCol,
    };
  }
  if (look === 'airless') {
    const dark = smooth(700, 1100, Teq);                        // baked basalt on the hottest bare rocks
    const hi = mix3([0.180, 0.171, 0.162], [0.095, 0.088, 0.084], dark), lo = mix3([0.078, 0.073, 0.070], [0.045, 0.042, 0.040], dark);
    return { colA: hi.map((x) => x * k), colB: lo, colC: [0.34, 0.33, 0.32] };
  }
  if (look === 'desert') {
    const ochre = rand();                                       // rust to ochre
    const hot = smooth(330, 600, Tsurf);                        // hot dry ground greys toward bare rock
    const dust = mix3(mix3([0.58, 0.32, 0.15], [0.58, 0.40, 0.20], ochre), [0.44, 0.38, 0.30], hot);
    return { colA: dust, colB: mix3([0.24, 0.135, 0.09], [0.16, 0.14, 0.12], hot), colC: [0.80, 0.80, 0.79] };
  }
  if (look === 'ice') {
    if (atmDensity < AIR_THIN) return { colA: [0.70, 0.68, 0.62], colB: [0.50, 0.46, 0.38], colC: [0.30, 0.17, 0.10] };   // bare ice shell, stained fractures
    return { colA: [0.78, 0.81, 0.84], colB: [0.50, 0.59, 0.68], colC: [0.10, 0.15, 0.22] };                             // snow, bare blue ice, dark leads
  }
  if (look === 'molten') return { colA: [0.045, 0.038, 0.036], colB: [0.085, 0.062, 0.052], colC: [0.03, 0.025, 0.025] };
  if (look === 'shrouded') {
    const hot = smooth(350, 800, Teq);                          // sulphur-pale deck, greyer and darker as it heats
    return { colA: mix3([0.98, 0.93, 0.72], [0.62, 0.58, 0.52], hot), colB: mix3([0.90, 0.84, 0.62], [0.48, 0.44, 0.40], hot), colC: [0.9, 0.86, 0.72] };
  }
  // temperate: bare land. Sand and rock; iron-rich worlds (dense) run redder and darker.
  const fIron = rhoRel !== null ? clamp((rhoRel * 5.513 - 4) / 3, 0, 1) : 0.35;
  const sand = mix3([0.30, 0.225, 0.135], [0.28, 0.165, 0.10], fIron), rock = mix3([0.15, 0.125, 0.105], [0.12, 0.085, 0.07], fIron);
  return { colA: sand.map((x) => x * k), colB: rock, colC: [0.82, 0.84, 0.86] };
}

/* Vertical Rayleigh optical depth of Earth's air at 610, 550 and 465 nm (the wavelengths this
   page takes for the red, green and blue channels), from Hansen & Travis (1974):
   tau = 0.008569 lambda^-4 (1 + 0.0113 lambda^-2 + 0.00013 lambda^-4), lambda in micrometres. */
const tauRayleigh = (um) => 0.008569 * Math.pow(um, -4) * (1 + 0.0113 * Math.pow(um, -2) + 0.00013 * Math.pow(um, -4));
export const TAU_EARTH = [0.610, 0.550, 0.465].map(tauRayleigh);

/* [ILLUSTRATIVE] The shell of air is not drawn to scale. Its e-folding height on screen is the
   true scale height times SHELL_STRETCH, but never stretched past SHELL_STRETCH_TO planet radii,
   and then held between 0.0025 and 0.03 radii: Earth's is drawn 4 times its height, Jupiter's 11
   (the floor), a puffy world's at true scale, and the 77 puffiest in the catalogue thinner than
   true (the cap). At true scale a thin shell is a fraction of a pixel from orbit. The vertical
   optical depth is not stretched (the shader divides it by the drawn height); slant paths are
   shorter than true ones, by the square root of the stretch. */
export const SHELL_STRETCH = 4, SHELL_STRETCH_TO = 0.006;

/* [ILLUSTRATIVE] How much air the picture gives each look, as multiples of Earth's Rayleigh
   column, and how much haze (vertical optical depth). The archive holds no surface pressure. */
function air(look, ph, pal) {
  const { atmDensity, Hr, Teq } = ph;
  const none = { hasAtmo: 0, tauR: [0, 0, 0], tauM: 0, hazeCol: [1, 1, 1], mieG: 0.76 };
  let col = 0, tauM = 0, hazeCol = [0.96, 0.97, 1.0], mieG = 0.76;
  if (look === 'airless') return { ...none, hvis: 0.004, atmR: 1.03 };
  if (look === 'temperate') { col = atmDensity; tauM = 0.07; }
  else if (look === 'desert') { col = 0.03 * atmDensity / 0.47; tauM = 0.18 * atmDensity / 0.47; hazeCol = pal.colA.map((x) => clamp(x * 2.1, 0, 1)); mieG = 0.7; }
  else if (look === 'shrouded') { col = 0.08; tauM = 0.04; hazeCol = pal.colC; mieG = 0.8; }
  else if (look === 'ice') { if (atmDensity < AIR_THIN) return { ...none, hvis: 0.004, atmR: 1.03 }; col = 0.8 * atmDensity; tauM = 0.04; }
  else if (look === 'molten') { if (atmDensity < AIR_THIN) return { ...none, hvis: 0.004, atmR: 1.03 }; col = 0.1; tauM = 0.2; hazeCol = [0.92, 0.72, 0.52]; }
  else {   // fluid: only the thin air above the level the colour comes from; a thicker layer would rim the disc with light
    col = 0.12;
    tauM = 0.02 + 0.05 * pal.haze;
    hazeCol = pal.haze > 0.05 ? pal.hazeCol.map((x) => clamp(x * 1.4, 0, 1)) : [0.95, 0.96, 1.0];
    mieG = 0.8;
  }
  const hvis = clamp(Math.max(Hr, Math.min(SHELL_STRETCH * Hr, SHELL_STRETCH_TO)), 0.0025, 0.03);
  return { hasAtmo: 1, tauR: TAU_EARTH.map((t) => t * col), tauM, hazeCol, mieG, hvis, atmR: 1 + 7 * hvis };
}

/* The glow of a hot surface, in the picture's own unit (a white surface square-on to the star
   reads 1). A surface in equilibrium with its star gives back what it absorbs, so its light
   relative to the starlight it would reflect is (1 - A) (Tsub / (sqrt2 Teq))^4, times the ratio
   of the eye's share of each spectrum (photopicFraction). (1 - A) is taken as 0.9. The albedo
   inside a Teq is not known per planet (the archive's is often for A = 0, this file's fallback
   uses 0.2 to 0.4), so the glow is uncertain by about 1.3 times. Only molten and airless rock
   and fluid worlds are given a glow, and only when the hottest point is above 750 K. */
const WIEN_LUMA = [0.2126, 0.7152, 0.0722];
/* A locked bare rock (ph.bare) is drawn by air.js bareDay: its hottest point from the star with A_B 0.1, a night
   side of 50 K, and a glow at the substellar point of (1 - A_B) times the starlight in the eye's share of each
   spectrum. A locked world with a measured day side (air.js OBSERVED: 55 Cnc e, LHS 3844 b and eleven more) is
   drawn as measured: the hottest point that gives that day side (air.js tsubForDay), whether it has air or not. */
function thermal(look, ph, locked) {
  const hotLook = look === 'molten' || look === 'fluid' || look === 'airless';
  const hasAir = look === 'fluid' || ph.atmDensity >= AIR_THIN;
  const obs = ph.air && ph.air.observed, measured = !!(obs && obs.day && locked);
  let k = locked ? (look === 'fluid' ? 1.25 : Math.SQRT2) : 1.18921;        // hottest point over Teq
  const Tnight = ph.bare ? BARE.Tnight : Math.max(locked ? (look === 'fluid' ? 0.75 : hasAir ? 0.6 : 0.15) * ph.Teq : 0.95 * ph.Teq, 40);
  const Tsub = measured ? tsubForDay(obs.day.T, Tnight) : ph.bare ? ph.bare.Tss : k * ph.Teq;
  k = Tsub / ph.Teq;
  if (!hotLook || Tsub < 750) return { tsub: Tsub, tnight: Tnight, glowT: 0, glow: [0, 0, 0] };
  const Lt = (ph.bare ? (1 - BARE.albedo) * Math.pow(Tsub / ph.bare.Tss, 4) : 0.9 * Math.pow(k / Math.SQRT2, 4)) * photopicFraction(Tsub) / photopicFraction(ph.Teff);
  const lin = starColour(Tsub).linear, lum = lin.reduce((s, x, i) => s + x * WIEN_LUMA[i], 0);
  return { tsub: Tsub, tnight: Tnight, glowT: Tsub, glow: lin.map((x) => x * Lt / lum) };
}

// ---- the full shader uniform bundle ----
export function toParams(p, opts = {}) {
  const c = classify(p, opts), ph = c.physics, look = c.look;
  const seedInt = hashName(p.pl_name);
  const rand = rng(seedInt);
  const { domClass, Teq, isGiant, atmDensity, Tsurf, gRel } = ph;
  const z = zoneOf(p, ph);
  const locked = c.locked;

  const seed = (seedInt % 997) + rand() * 3.0;
  const spin = locked ? 0 : 0.03 + rand() * 0.06;
  const contFreq = 1.6 + rand() * 0.9, mtnFreq = 5.0 + rand() * 4.0;
  const bandFreq = 10 + Math.floor(rand() * 16);
  // [ILLUSTRATIVE] The waterline, as a level of the continent noise. The archive holds no water inventory.
  // 0.55 floods 70% of the median world, as on Earth; the field differs from seed to seed, so the share runs
  // from about 55% to 88% (10th to 90th percentile of 120 seeds, on a float64 copy of the shader's noise).
  // 0.72, for the larger rocky class, floods 96% or more.
  const wet = domClass === 1 ? 0.72 : 0.55;
  // deterministic unit spin axis for the star's corona morphology
  const _z = rand() * 2 - 1, _a = rand() * 6.2831, _s = Math.sqrt(Math.max(0, 1 - _z * _z));
  const starSpin = [_s * Math.cos(_a), _z, _s * Math.sin(_a)];

  const pal = palette(look, ph, rand);
  const atm = air(look, ph, pal);
  const th = thermal(look, ph, locked);

  // where ice begins, as the sine of latitude (or, on a locked world, of half the angle from the
  // point under the star). A mean surface of 288 K puts it near 65 degrees, as on Earth: the local
  // temperature is taken as Tsurf + 12 - 55 sin^2, and ice holds below 255 K. Above 1 there is none.
  let iceCap = 2;
  if (look === 'temperate') iceCap = Math.sqrt(clamp((Tsurf + 12 - 255) / 55, 0, 1.3));
  else if (look === 'desert') iceCap = clamp(0.966 + (Tsurf - 221.7) / 300, 0.86, 1.05);   // frost caps: thin air carries little vapour

  // cloud cover [ILLUSTRATIVE pattern]: more as the world nears the inner edge of the zone
  let cloud = 0;
  if (look === 'temperate') cloud = clamp(0.70 + 0.20 * smooth(z.sInner, z.sInnerOpt, z.S), 0, 0.9);
  else if (look === 'desert') cloud = 0.04;
  else if (look === 'ice' && atmDensity >= AIR_THIN) cloud = 0.25;

  // ---- procedural explorable surface (radially-displaced unit sphere) ----
  // relief amplitude (planet radii): art-directed exaggeration (~4x physical Everest) so the
  // surface reads as a landscape from the just-above-the-peak-line eye; gravity flattens it in the shader.
  const amp = look === 'molten' ? 0.010 : look === 'ice' ? 0.006 : domClass === 1 ? 0.007 : 0.011;
  // morphology (frame-constant int -> uniform branch, no per-pixel divergence)
  const terrStyle = look === 'molten' ? 3 : look === 'ice' ? 2 : look === 'airless' ? 4
                  : (look === 'desert' && Tsurf > 330) ? 1 : 0;
  const hasSea = look === 'temperate';
  const seaY = hasSea ? clamp(0.14 + (wet - 0.5) * 0.5, 0.05, 0.85) : -1.0;  // SPECULATIVE waterline: a coast where you land
  // altitude snow-line driver: colder worlds carry more high snow
  const tfreeze = (look === 'temperate' || look === 'ice' || look === 'desert') ? clamp((273 - Tsurf) / 60 + 0.2, 0, 1) : 0;

  return {
    type: c.type, look, klass: domClass, isGasGiant: isGiant ? 1 : 0, locked: locked ? 1 : 0,
    seed, spin,
    // surface
    seaLevel: wet, tempBias: clamp((Tsurf - 240) / 130, 0.05, 1.0), iceCap, cloud,
    life: 0.0,                                                  // nothing in the archive says a world is alive
    bump: isGiant || look === 'shrouded' ? 0.0 : 0.14,
    crater: look === 'airless' ? 1.0 : look === 'desert' ? 0.4 : (look === 'ice' && atmDensity < AIR_THIN) ? 0.3 : 0.0,
    // procedural explorable surface
    amp, terrStyle, seaY, tfreeze, gRel,
    contFreq, mtnFreq, bandFreq,
    bandContrast: pal.bandContrast ?? 0, storm: pal.storm ?? 0,
    colA: pal.colA, colB: pal.colB, colC: pal.colC,
    // thermal light
    tsub: th.tsub, tnight: th.tnight, glowT: th.glowT, glow: th.glow,
    // star + light
    starColor: lightColor(ph.Teff), starSurf: vividStar(ph.Teff), lightMul: ph.lightMul,
    starAngle: ph.starAngle, starActivity: ph.starActivity, starSpots: ph.starSpots,
    starTeff: ph.Teff, starSpin,
    // atmosphere
    hasAtmo: atm.hasAtmo, tauR: atm.tauR, tauM: atm.tauM, hazeCol: atm.hazeCol, mieG: atm.mieG, hvis: atm.hvis, atmR: atm.atmR,
  };
}
