/* ============================================================
   exoplanet/config.js — every constant the survey uses, with its
   source. Nothing here computes; science.js does.

   Values checked at their sources on 2026-11-11.
   ============================================================ */

export const DATA = {
  snapshot: 'assets/data/exomania/pscomppars-snapshot.json',
  roster: 'exoplanet_data.json',
  snapshotLabel: 'NASA Exoplanet Archive, PSCompPars (doi:10.26133/NEA13), snapshot 2026-11-11',
  rosterLabel: 'NASA Exoplanet Archive, PS table, refreshed weekly by this site',
};

/* Physical constants. */
export const PHYS = {
  R_EARTH_KM: 6371.0,
  R_SUN_KM: 695700,          // IAU 2015 nominal solar radius
  AU_KM: 149597870.7,
  T_SUN: 5772,               // IAU 2015 nominal solar effective temperature, K
  SUN_ANG_DEG: 0.533,        // 1919 arcsec at 1 AU (NASA Sun Fact Sheet)
  PC_LY: 3.26156,
};

/* Habitable-zone limits. Kopparapu et al. 2013, ApJ 765, 131, with the corrected
   coefficients of the erratum, ApJ 770, 82 (Table 3). S_eff = S0 + aT + bT^2 + cT^3 + dT^4,
   T = Teff - 5780 K, valid for 2600 <= Teff <= 7200 K; d = sqrt(L / S_eff) AU. */
export const KOPPARAPU = {
  ref: 'Kopparapu et al. 2013, ApJ 765, 131; erratum ApJ 770, 82',
  tRange: [2600, 7200],
  recentVenus: [1.7763, 1.4335e-4, 3.3954e-9, -7.6364e-12, -1.1950e-15],
  runaway:     [1.0385, 1.2456e-4, 1.4612e-8, -7.6345e-12, -1.7511e-15],
  moist:       [1.0146, 8.1884e-5, 1.9394e-9, -4.3618e-12, -6.8260e-16],
  maxGreen:    [0.3507, 5.9578e-5, 1.6707e-9, -3.0058e-12, -5.1925e-16],
  earlyMars:   [0.3207, 5.4471e-5, 1.5275e-9, -2.1709e-12, -3.8282e-16],
};

/* Probabilistic mass-radius relation. Chen & Kipping 2017, ApJ 834, 17, Table 1, in the
   (C, S) form the NASA Exoplanet Archive lists on its pscp_calc page:
   log10 R = C + S log10 M (Earth units), radius scatter sigma in log10 R
   (the paper's "fractional dispersion of radius"). Breaks at 2.04, 132 and 26,600 M_earth. */
export const CHEN_KIPPING = {
  ref: 'Chen & Kipping 2017, ApJ 834, 17',
  segments: [
    { name: 'Terran',    upTo: 2.04,  C: 0.00346, S: 0.2790, sigma: 0.0403 },
    { name: 'Neptunian', upTo: 132,   C: -0.0925, S: 0.589,  sigma: 0.146 },
    { name: 'Jovian',    upTo: 26600, C: 1.25,    S: -0.044, sigma: 0.0737 },
    { name: 'Stellar',   upTo: Infinity, C: -2.85, S: 0.881, sigma: 0.0443 },
  ],
  // the grid the inversion integrates over, log10 M_earth (0.01 M_earth to 0.08 M_sun)
  logMRange: [-2, 4.42],
  prior: 'uniform in log mass',   // a stated choice of this page, not of the paper
};

/* Composition curves for solid planets: Seager, Kuchner, Hier-Majumder & Militzer 2007,
   ApJ 669, 1279, eq. 23 with Table 4: log10(R/r1) = k1 + (1/3) log10(M/m1) - k2 (M/m1)^k3,
   m1 in M_earth, r1 in R_earth. Drawn up to 20 M_earth, inside the paper's stated range. */
export const SEAGER = {
  ref: 'Seager et al. 2007, ApJ 669, 1279',
  maxM: 20,
  materials: [
    { key: 'Fe', label: 'IRON', m1: 5.80, r1: 2.52, k1: -0.209490, k2: 0.0804, k3: 0.394 },
    { key: 'MgSiO3', label: 'ROCK', m1: 10.55, r1: 3.90, k1: -0.209594, k2: 0.0799, k3: 0.413 },
    { key: 'H2O', label: 'WATER', m1: 5.52, r1: 4.43, k1: -0.209396, k2: 0.0807, k3: 0.375 },
  ],
};

/* Radial-velocity semi-amplitude, Lovis & Fischer 2010 (in Exoplanets, ed. Seager), eq. 14:
   K = 28.4329 m/s / sqrt(1-e^2) * (Mp sin i / M_jup) * ((M* + Mp)/M_sun)^(-2/3) * (P / 1 yr)^(-1/3). */
export const RV = { k0: 28.4329, mJupEarth: 317.83, mSunEarth: 332946, ref: 'Lovis & Fischer 2010, eq. 14' };

/* Selection effects drawn on the radius-period diagram. Illustrative assumptions, stated on
   screen: a Sun-like star, Kepler's 4-year baseline, 30 ppm noise per 6.5 h, a detection at
   signal-to-noise 7.1 with at least 3 transits; and a 1 m/s radial-velocity floor. */
export const LIMITS = { baselineDays: 1460, cdppPpm: 30, snr: 7.1, minTransits: 3, rvFloor: 1.0, rSunEarth: 109.1 };

/* Monte Carlo propagation of catalogue uncertainties. */
export const MC = { draws: 400, muEnvelope: 2.3, muSecondary: 29 };

/* Quadratic limb darkening, Kepler band, Teff 5750 K, log g 4.5, [M/H] 0.
   Claret & Bloemen 2011, A&A 529, A75 (table-af, ATLAS, least-squares fit).
   Used for every star here: a stated simplification. */
export const LIMB = { u1: 0.4035, u2: 0.2622, ref: 'Claret & Bloemen 2011, A&A 529, A75' };

/* CIE 1931 2-degree colour matching functions, the multi-lobe piecewise-Gaussian fit of
   Wyman, Sloan & Shirley 2013, JCGT 2(2), 1-11, Table 1. Each lobe: [weight, mu (nm),
   inverse sigma left of mu, inverse sigma right of mu]. */
export const CIE_FIT = {
  ref: 'Wyman, Sloan & Shirley 2013, JCGT 2(2)',
  x: [[0.362, 442.0, 0.0624, 0.0374], [1.056, 599.8, 0.0264, 0.0323], [-0.065, 501.1, 0.0490, 0.0382]],
  y: [[0.821, 568.8, 0.0213, 0.0247], [0.286, 530.9, 0.0613, 0.0322]],
  z: [[1.217, 437.0, 0.0845, 0.0278], [0.681, 459.0, 0.0385, 0.0725]],
};
/* XYZ -> linear sRGB (D65), IEC 61966-2-1. */
export const XYZ_TO_SRGB = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.2040, 1.0570],
];

/* The radius valley. Fulton et al. 2017, AJ 154, 109: "a factor of >=2 deficit in the
   occurrence rate distribution at 1.5-2.0 R_earth". */
export const VALLEY = { lo: 1.5, hi: 2.0, ref: 'Fulton et al. 2017, AJ 154, 109' };

/* Equilibrium temperature assumption shown on screen (Earth's Bond albedo is about 0.3). */
export const TEQ = { albedo: 0.30, redistribution: 0.25 };

/* Solar system reference, NASA Planetary Fact Sheet (ratio to Earth). */
export const SOLAR = [
  { name: 'Mercury', short: 'Me', R: 0.383, M: 0.0553, a: 0.387, P: 88.0, S: 6.68 },
  { name: 'Venus',   short: 'V',  R: 0.949, M: 0.815,  a: 0.723, P: 224.7, S: 1.91 },
  { name: 'Earth',   short: 'E',  R: 1.0,   M: 1.0,    a: 1.0,   P: 365.25, S: 1.0 },
  { name: 'Mars',    short: 'Ma', R: 0.532, M: 0.107,  a: 1.52,  P: 687.0, S: 0.433 },
  { name: 'Jupiter', short: 'J',  R: 11.21, M: 317.8,  a: 5.20,  P: 4331,  S: 0.037 },
  { name: 'Saturn',  short: 'S',  R: 9.45,  M: 95.2,   a: 9.57,  P: 10747, S: 0.0109 },
  { name: 'Uranus',  short: 'U',  R: 4.01,  M: 14.5,   a: 19.17, P: 30589, S: 0.00272 },
  { name: 'Neptune', short: 'N',  R: 3.88,  M: 17.1,   a: 30.18, P: 59800, S: 0.0011 },
];
// R, M, a: the sheet's ratio table. P in days: the sheet's main table. S = 1 / a^2.

/* Archive limit flags (PSCompPars <col>lim = 1 upper, -1 lower): the fields catalog.js
   moves into p.lim, with the name and unit the page writes for each bound. */
export const LIMIT_FIELDS = {
  M: ['mass', ' M⊕'], R: ['radius', ' R⊕'], P: ['period', ' d'], a: ['orbit', ' AU'], ecc: ['eccentricity', ''],
  S: ['insolation', ' S⊕'], Teq: ['published Teq', ' K'], b: ['impact parameter', ''], depth: ['transit depth', '%'],
  dur: ['transit duration', ' h'], Teff: ['star Teff', ' K'], Rs: ['star radius', ' R☉'], Ms: ['star mass', ' M☉'],
  logL: ['star log L', ''],
};

/* Size classes used for filtering and labels. Radius bounds in R_earth. */
export const SIZE_CLASSES = [
  { key: 'rocky', label: 'Earth-size', max: 1.5 },
  { key: 'super', label: 'Super-Earth', max: 2.0 },
  { key: 'subnep', label: 'Sub-Neptune', max: 4.0 },
  { key: 'nep', label: 'Neptune-size', max: 8.0 },
  { key: 'giant', label: 'Giant', max: Infinity },
];

/* Catalogue diagrams. */
export const PLOTS = {
  valley: { label: 'Valley', x: 'S', y: 'R', xLabel: 'insolation  S⊕', yLabel: 'radius  R⊕', xRange: [0.1, 30000], yRange: [0.3, 30], xRev: true },
  rp:     { label: 'Radius-period', x: 'P', y: 'R', xLabel: 'orbital period  days', yLabel: 'radius  R⊕', xRange: [0.15, 1e5], yRange: [0.3, 30] },
  mr:     { label: 'Mass-radius', x: 'M', y: 'R', xLabel: 'mass  M⊕', yLabel: 'radius  R⊕', xRange: [0.02, 20000], yRange: [0.3, 30] },
  time:   { label: 'Discoveries', x: 'year', y: 'count', xLabel: 'discovery year', yLabel: 'planets per year' },
  sky:    { label: 'Sky', x: 'ra', y: 'dec', xLabel: 'right ascension', yLabel: 'declination' },
};
export const PLOT_ORDER = ['valley', 'rp', 'mr', 'time', 'sky'];

/* Discovery-method groups for the timeline (ink ladder, no extra hues). */
export const METHOD_GROUPS = [
  { key: 'Transit', label: 'Transit', ink: 'rgba(234,240,251,0.92)' },
  { key: 'Radial Velocity', label: 'Radial velocity', ink: 'rgba(159,179,214,0.85)' },
  { key: 'Microlensing', label: 'Microlensing', ink: 'rgba(121,130,143,0.9)' },
  { key: 'Imaging', label: 'Imaging', ink: 'rgba(86,93,114,0.95)' },
  { key: 'other', label: 'Other', ink: 'rgba(66,75,87,0.95)' },
];

/* Guided tours. Each picks its stops from the live catalogue by a rule, so a tour
   stays true as the data changes. */
export const TOURS = [
  { key: 'earthlike', label: 'Most Earth-like', n: 6 },
  { key: 'hottest', label: 'The hottest', n: 5 },
  { key: 'extreme', label: 'Extreme orbits', n: 5 },
  { key: 'nearest', label: 'Nearest worlds', n: 5 },
  { key: 'valley', label: 'Across the valley', n: 6 },
];

/* Model route: one call per visitor action. */
/* maxWaitMs 0: when the public route's 45 s window is closed, fall back at once (the route pill
   shows the countdown) instead of making the visitor wait. A local model on a busy machine can
   take a minute, hence the long timeout. */
export const AI = { maxWaitMs: 0, timeoutMs: 90000, temperature: 0.4 };

/* Landing target when the URL names none: a temperate world with a measured radius. */
export const LANDMARKS = ['Kepler-442 b', 'Kepler-62 f', 'TRAPPIST-1 e', 'Kepler-186 f', 'Kepler-62 e'];

export const SOURCES = [
  'NASA Exoplanet Archive (Christiansen et al. 2025, PSJ 6, 186); PSCompPars doi:10.26133/NEA13',
  'Fulton et al. 2017, AJ 154, 109 (radius valley)',
  'Kopparapu et al. 2013, ApJ 765, 131; erratum ApJ 770, 82 (habitable zone)',
  'Chen & Kipping 2017, ApJ 834, 17 (mass-radius forecaster)',
  'Seager & Mallen-Ornelas 2003, ApJ 585, 1038 (transit duration, eq. 3)',
  'Claret & Bloemen 2011, A&A 529, A75 (limb darkening)',
  'Seager et al. 2007, ApJ 669, 1279 (iron, rock and water mass-radius curves)',
  'Lovis & Fischer 2010, in Exoplanets, ed. S. Seager, eq. 14 (radial-velocity semi-amplitude)',
  'Wyman, Sloan & Shirley 2013, JCGT 2(2) (CIE colour matching fit)',
  'NASA Planetary Fact Sheet (solar system reference)',
  'Berta-Thompson, Wachiraphan & Murray 2026, ApJ 1011, 123, doi:10.3847/1538-4357/ae77fd (which rocky planets keep air; the papers of the 17 observed planets are on labs/exomania-air.html)',
  'Koll 2022, ApJ 924, 134, doi:10.3847/1538-4357/ac3b48 (day side of a bare rock, f = 2/3)',
  'Kite, Fegley, Schaefer & Gaidos 2016, ApJ 828, 80, doi:10.3847/0004-637X/828/2/80 (open melt, 50 K night side)',
  'Kasting, Whitmire & Reynolds 1993, Icarus 101, 108 (tidal-lock radius, eq. 10)',
  'Hansen & Travis 1974, Space Sci. Rev. 16, 527 (Rayleigh optical depth, eq. 2.30)',
  'Sudarsky, Burrows & Pinto 2000, ApJ 538, 885 (cloud classes of giant planets)',
  'Irwin et al. 2024, MNRAS 527, 11521 (the colours of Uranus and Neptune)',
  'Evans et al. 2013, ApJ 772, L16 (albedo of HD 189733 b)',
  'Bell et al. 2017, ApJ 847, L2 (albedo of WASP-12 b)',
  'Yang, Cowan & Abbot 2013, ApJ 771, L45 (cloud under the star on tidally locked planets)',
  'Kite, Fegley, Schaefer & Gaidos 2016, ApJ 828, 80 (where rock stops holding a crust: 1,673 K)',
  'Essack, Seager & Pajusalu 2020, ApJ 898, 160 (the temperatures over which rock melts)',
];
