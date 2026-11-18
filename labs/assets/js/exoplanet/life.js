// @ts-check
/* ============================================================
   exoplanet/life.js — if there were life: what it could look
   like on a planet, by written rules, and the words for it.

   No life is known on any planet but Earth. Everything here is a
   rule applied to the page's numbers, and the page says so.

   The rules (the lab's ledger, render_science.md, "The life
   view", holds each with its source):
   L1 Where surface life is considered: from the picture's own
      look (data.js lookOf).
   L2 The star's light at the surface: the case of Kiang et al.
      2007 (Astrobiology 7, 252, "Spectral signatures of
      photosynthesis II", Table 2a: cloudless, Earth-like air, the
      planet at the distance that gives 288 K) whose star is
      nearest in temperature. The F2V and K2V cases are observed
      stars (sigma Bootis, epsilon Eridani); their temperatures
      are taken from Pecaut and Mamajek 2013 (ApJS 208, 9; F2V
      6,820 K) and the archive (epsilon Eridani 5,020 K, Rosenthal
      et al. 2021); the M cases are the paper's own models.
   L3 Pigments absorb where the surface photon flux peaks (the
      paper's rule, section 2.2.1).
   L4 The colour: a reflectance spectrum with those absorption
      bands, through the CIE 1931 fit (science.js
      reflectanceColour). Two readings for red dwarfs, where the
      literature differs: harvesting 400 to 1,100 nm (the
      paper's conclusion), and visible pigments like Earth's
      (Takizawa et al. 2017, Sci. Rep. 7, 7561).
   L5 How much cover: the case's gross primary productivity
      (Table 3) against the Sun's, times the planet's starlight.
   L6 A sentence for what the numbers say and no rule draws.
   ============================================================ */

import { reflectanceColour, insolation } from './science.js';
import { classify } from './data.js';
import { num, int } from '../kit/format.js';

/** @typedef {{ key: string, star: string, T: number, peak: number, par: number, uvb: number, gppVis: number, gppWide: number | null }} Case */
/** @typedef {{ mu: number, w: number, d: number }} Band */
/** @typedef {{ key: string, words: string, bands: Band[], broad: number, colour: { linear: number[], srgb: number[], hex: string, Y: number }, cover: number }} Scenario */

/** Kiang et al. 2007 II: Table 2a (peak surface photon flux, nm; PAR 400-700 nm and UV-B 280-315 nm at noon,
   1e20 photons m^-2 s^-1) and Table 3 (gross primary productivity, 1e18 quanta m^-2 s^-1, time- and disk-averaged:
   400-700 nm at Earth's quantum requirement, and for the red dwarfs 400-1,100 nm at 1.5 times it).
   @type {readonly Case[]} */
export const CASES = Object.freeze([
  { key: 'F2V', star: 'sigma Bootis', T: 6820, peak: 450.8, par: 16.4, uvb: 0.049, gppVis: 0.85, gppWide: null },
  { key: 'G2V', star: 'the Sun', T: 5772, peak: 668.5, par: 11.0, uvb: 0.018, gppVis: 0.72, gppWide: null },
  { key: 'K2V', star: 'epsilon Eridani', T: 5020, peak: 666.6, par: 11.5, uvb: 0.015, gppVis: 0.61, gppWide: null },
  { key: 'M1V', star: 'a modelled M1 dwarf', T: 3650, peak: 754.3, par: 6.1, uvb: 0.001, gppVis: 0.33, gppWide: 0.81 },
  { key: 'M5V', star: 'a modelled M5 dwarf', T: 3100, peak: 1042.8, par: 1.5, uvb: 0.000, gppVis: 0.08, gppWide: 0.59 },
]);
/** The Sun's case, which Earth's numbers are measured against. */
const SUN = /** @type {Case} */ (CASES[1]);

/** The case whose star is nearest in temperature; extrapolated outside the cases' range.
   @param {number} teff @returns {{ c: Case, extrapolated: boolean }} */
export function caseOf(teff) {
  let best = SUN;
  for (const c of CASES) if (Math.abs(c.T - teff) < Math.abs(best.T - teff)) best = c;
  const hi = /** @type {Case} */ (CASES[0]).T, lo = /** @type {Case} */ (CASES[CASES.length - 1]).T;
  return { c: best, extrapolated: teff > hi || teff < lo };
}

/** L1: where surface life is considered, by the picture's look, and the sentence for a look where it is not.
   @type {Readonly<Record<string, { surface: boolean | 'sparse', why: string }>>} */
export const WHERE = Object.freeze({
  temperate: { surface: true, why: '' },
  desert: { surface: 'sparse', why: 'Its air is thin, so water, and life with it, would keep to the low ground; the picture does not draw it.' },
  ice: { surface: false, why: 'Its surface is frozen. Life, if any, would be under the ice, where none of this would show.' },
  shrouded: { surface: false, why: 'It gets more starlight than the recent-Venus limit of the habitable zone (Kopparapu et al. 2013): under its clouds the surface would be too hot for water.' },
  molten: { surface: false, why: 'Its day side is hot enough to melt rock.' },
  airless: { surface: false, why: 'It keeps no air to hold water at its surface.' },
  fluid: { surface: false, why: 'It is a giant with no surface. What could live in its clouds is beyond these rules.' },
});

/* L4: a leaf's reflectance before its pigments, low in the visible and high past the red edge near 720 nm (the shape
   of Earth's vegetation, Kiang et al. 2007 I), and the pigments' bands taken out of it. [ILLUSTRATIVE] */
const VIS = 0.14, NIR = 0.5;
const gauss = (/** @type {number} */ lam, /** @type {Band} */ b) => Math.exp(-0.5 * ((lam - b.mu) / b.w) ** 2);
/** @param {number} lam */
const leaf = (lam) => VIS + (NIR - VIS) / (1 + Math.exp(-(lam - 720) / 12));
/** The reflectance with the bands taken out, and `broad` the share taken out from 400 to 1,100 nm.
   @param {Band[]} bands @param {number} broad @returns {(lam: number) => number} */
export const reflectance = (bands, broad) => (lam) => {
  let r = leaf(lam) * (lam >= 400 && lam <= 1100 ? 1 - broad : 1);
  for (const b of bands) r *= 1 - b.d * gauss(lam, b);
  return r;
};
/** The blue band every chlorophyll-like pigment keeps, and Earth's chlorophyll a in the red. */
const SORET = { mu: 440, w: 22, d: 0.8 }, CHL_A = 680;

/** L4 and L5: the readings of a case, each with its colour and its cover at the planet's starlight S.
   @param {Case} c @param {number} S @returns {Scenario[]} */
export function scenariosOf(c, S) {
  const cover = (/** @type {number} */ gpp) => Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S));
  /** @param {string} key @param {string} words @param {Band[]} bands @param {number} broad @param {number} gpp @returns {Scenario} */
  const mk = (key, words, bands, broad, gpp) => ({ key, words, bands, broad, colour: reflectanceColour(reflectance(bands, broad)), cover: cover(gpp) });
  if (c.key === 'F2V') return [mk('one', 'Pigments tuned to a light that peaks in the violet would absorb the blue most: a cover darker in the blue than Earth\'s.', [{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];
  if (c.key === 'G2V' || c.key === 'K2V') return [mk('one', 'Pigments tuned to a light that peaks in the red would absorb red and blue and return green: plants much like Earth\'s.', [SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, c.gppVis)];
  return [
    mk('a', `Harvesting all its light from 400 to 1,100 nm, as Kiang et al. expect of a red dwarf's plants, a cover would return little visible light and look dark; its main band, at ${int(c.peak)} nm, is past what eyes see.`, [{ mu: c.peak, w: 40, d: 0.9 }], 0.8, /** @type {number} */ (c.gppWide)),
    mk('b', 'Or, as Takizawa et al. 2017 argue, the first plants of a red dwarf would use visible light as Earth\'s do, and look green, with less light to grow on.', [SORET, { mu: CHL_A, w: 20, d: 0.85 }], 0, c.gppVis),
  ];
}

/** Where a light peaks, in words. @param {number} nm */
const band = (nm) => (nm < 495 ? 'in the violet' : nm < 700 ? 'in the red' : 'in the near infrared, past what eyes see');

/** The words for a star the archive gives no temperature. */
export const NO_STAR = 'The archive gives no temperature for its star, so these rules cannot say what its light would be at the surface.';
/** The words for a planet with no starlight to grow on. */
export const NO_LIGHT = 'The page has no starlight for it (no orbit, or no star to compute one from), so these rules cannot say how much would grow.';

/** If there were life on this planet: the case, where, the readings, and the words. The star's temperature is the
   archive's (p.Teff; data.js puts a stand-in where it is missing, which no rule here uses); the starlight is the one
   the sheets print (starlight.js, through science.js insolation).
   @param {{ Teff: number | null }} p @param {ReturnType<typeof classify>} [k] */
export function lifeOf(p, k = classify(p)) {
  const ph = k.physics, where = WHERE[k.look] || WHERE.fluid;
  /** @type {string[]} */
  const words = [];
  if (!(typeof p.Teff === 'number' && p.Teff > 0)) {
    words.push(NO_STAR);
    if (!where.surface) words.push(where.why);
    return { case: null, extrapolated: false, where, scenarios: [], light: null, uvb: null, words };
  }
  const { c, extrapolated } = caseOf(p.Teff);
  const s0 = insolation(p).S, S = typeof s0 === 'number' && s0 > 0 ? s0 : null;
  const scenarios = where.surface && S !== null ? scenariosOf(c, S) : [];
  const light = S === null ? null : (c.par / SUN.par) * S, uvb = S === null ? null : (c.uvb / SUN.uvb) * S;
  words.push(`Its star, at ${int(p.Teff)} K, is nearest the ${c.key} case of Kiang et al. 2007 (${c.star})${extrapolated ? ', extrapolated past the cases\' range' : ''}. Under air like Earth's, its light at the surface would peak at ${int(c.peak)} nm, ${band(c.peak)}.`);
  if (!where.surface) words.push(where.why);
  else if (S === null) words.push(NO_LIGHT);
  else {
    for (const s of scenarios) words.push(s.words);
    words.push(`At noon it would get ${num(/** @type {number} */ (light), 2)} times Earth's visible light and ${num(/** @type {number} */ (uvb), 2)} times Earth's UV-B.`);
    if (where.surface === 'sparse') words.push(where.why);
    if (k.label === 'Ocean world') words.push('It is mostly sea: life, if any, would be mostly in the water, where the colour above would tint the shallows.');
  }
  // the day side and the ground's gravity are said only of a world where surface life is considered at all
  if (where.surface && ph.locked) words.push('One face is always to its star: life, if any, would keep to the day side and the ring of twilight.');
  if (where.surface && ph.radiusKnown && ph.gRel > 0) words.push(`Its surface gravity is ${num(ph.gRel, 2)} times Earth's. No published rule says what that would do to a living form.`);
  return { case: c, extrapolated, where, scenarios, light, uvb, words };
}
