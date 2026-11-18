// @ts-check
/* ============================================================
   exoplanet/life.js — if there were life: what it could look
   like on a planet, by written rules, and the words for it.

   No life is known on any planet but Earth. Everything here is a
   rule applied to the page's numbers, and the page says so.

   The rules (the lab's ledger, render_science.md, "The life
   view", holds each with its source):
   L1 Where surface life is considered: from the picture's own
      look (data.js lookOf, with the visitor's air scenario) and,
      for thin air, the habitable zone (starlight.js hzPosition).
   L2 The star's light at the surface: the case of Kiang et al.
      2007 (Astrobiology 7, 252, "Spectral signatures of
      photosynthesis II", Table 2a: cloudless, Earth-like air, the
      planet at the distance that gives 288 K) whose star is
      nearest in temperature, a tie going to the hotter; the words
      name the star by the spectral type the page gives it
      (science.js spectralType), so a K-type star nearest the M1V
      model says both. The F2V and K2V cases are observed stars
      (sigma Bootis, epsilon Eridani).
   L3 Pigments absorb where the surface photon flux peaks (the
      paper's rule, section 2.2.1).
   L4 The colour: a reflectance spectrum with those absorption
      bands, through the CIE 1931 fit (science.js
      reflectanceColour). Two readings for M dwarfs, where the
      literature differs: harvesting 400 to 1,100 nm (the paper's
      conclusion), and visible pigments with a red edge near 700
      to 760 nm (Takizawa et al. 2017, Sci. Rep. 7, 7561).
   L5 How much cover: the case's gross primary productivity
      (Table 3) against the Sun's, times the planet's starlight.
   L6 A sentence for what the numbers say and no rule draws.
   ============================================================ */

import { reflectanceColour, insolation, spectralType, hzPosition } from './science.js';
import { classify, toParams } from './data.js';
import { num, int } from '../kit/format.js';

/** @typedef {{ key: string, star: string, T: number, peak: number, par: number, uvb: number, gppVis: number, gppWide: number | null }} Case */
/** @typedef {{ mu: number, w: number, d: number }} Band */
/** @typedef {{ key: string, words: string, bands: Band[], broad: number, colour: { linear: number[], srgb: number[], hex: string, Y: number }, cover: number }} Scenario */

/** Kiang et al. 2007 II: Table 2a (peak surface photon flux, nm; PAR 400-700 nm and UV-B 280-315 nm at noon,
   1e20 photons m^-2 s^-1) and Table 3 (gross primary productivity, 1e18 quanta m^-2 s^-1, time- and disk-averaged:
   400-700 nm at Earth's quantum requirement, and for the M dwarfs 400-1,100 nm at 1.5 times it). T: the star's
   temperature (F2V by Pecaut and Mamajek 2013, epsilon Eridani by the archive, the M cases the paper's).
   @type {readonly Case[]} */
export const CASES = Object.freeze([
  { key: 'F2V', star: 'sigma Bootis', T: 6820, peak: 450.8, par: 16.4, uvb: 0.049, gppVis: 0.85, gppWide: null },
  { key: 'G2V', star: 'the Sun', T: 5772, peak: 668.5, par: 11.0, uvb: 0.018, gppVis: 0.72, gppWide: null },
  { key: 'K2V', star: 'epsilon Eridani', T: 5020, peak: 666.6, par: 11.5, uvb: 0.015, gppVis: 0.61, gppWide: null },
  { key: 'M1V', star: 'a modelled M1 dwarf', T: 3650, peak: 754.3, par: 6.1, uvb: 0.001, gppVis: 0.33, gppWide: 0.81 },
  { key: 'M5V', star: 'a modelled M5 dwarf', T: 3100, peak: 1042.8, par: 1.5, uvb: 0.000, gppVis: 0.08, gppWide: 0.59 },
]);
const [F2V, SUN, K2V, , M5V] = /** @type {Case[]} */ ([...CASES]);

/** The case whose star is nearest in temperature (the cases run hot to cool, so a tie keeps the hotter), the spectral
   type the page names the star by, and whether the case is extrapolated (past the cases' 6,820 to 3,100 K).
   @param {number} teff @returns {{ c: Case, type: string, extrapolated: boolean }} */
export function caseOf(teff) {
  let c = F2V;
  for (const x of CASES) if (Math.abs(x.T - teff) < Math.abs(c.T - teff)) c = x;
  return { c, type: spectralType(teff), extrapolated: teff > F2V.T || teff < M5V.T };
}
/** The article before a spectral type's letter: an O, an A, an F, an M, an L; a B, a G, a K. @param {string} type */
export const article = (type) => (['O', 'A', 'F', 'M', 'L'].includes(type) ? 'an' : 'a');

/* L1: the reasons a world has no surface life, by the picture's look and, for thin air, the zone */
export const WHY = Object.freeze({
  shrouded: 'It gets more starlight than the recent-Venus limit of the habitable zone (Kopparapu et al. 2013): under its clouds the surface would be too hot for water.',
  molten: 'Its day side is hot enough to melt rock.',
  airless: 'It keeps no air to hold water at its surface.',
  ice: 'Its surface is frozen. Life, if any, would be under the ice, where none of this would show.',
  subNeptune: 'It is a sub-Neptune: a deep envelope of gas, with no surface these rules can reach.',
  iceGiant: 'It is an ice giant, with no surface these rules can reach.',
  gasGiant: 'It is a gas giant with no surface. What could live in its clouds is beyond these rules.',
  noRadius: 'Its radius is not measured, and the page draws it as a world of gas: these rules say nothing of a surface.',
  desertHot: 'Its air is thin and it gets more starlight than the habitable zone\'s inner edge (Kopparapu et al. 2013): what water it had would be gone.',
  desertCold: 'Its air is thin and it is colder than the habitable zone\'s outer edge: its water would be frozen.',
  desertUnknown: 'Its air is thin, and its place against the habitable zone cannot be computed: these rules draw nothing.',
  desertSparse: 'Its air is thin, so water, and life with it, would keep to the low ground; the picture does not draw it.',
});

/** Where surface life is considered on this world: true, 'sparse' (thin air inside the zone, described, not drawn) or
   false, with the reason. @param {{ Teff: number | null }} p @param {ReturnType<typeof classify>} k
   @returns {{ surface: true | 'sparse' | false, why: string }} */
export function whereOf(p, k) {
  if (k.look === 'temperate') return { surface: true, why: '' };
  if (k.look === 'desert') {
    const zone = hzPosition(p).key;
    if (zone === 'cons' || zone === 'opt') return { surface: 'sparse', why: WHY.desertSparse };
    return { surface: false, why: zone === 'hot' ? WHY.desertHot : zone === 'cold' ? WHY.desertCold : WHY.desertUnknown };
  }
  if (k.look === 'fluid') return { surface: false, why: !k.physics.radiusKnown ? WHY.noRadius : k.klass === 2 ? WHY.subNeptune : k.klass === 3 ? WHY.iceGiant : WHY.gasGiant };
  if (k.look === 'shrouded' || k.look === 'molten' || k.look === 'airless' || k.look === 'ice') return { surface: false, why: WHY[k.look] };
  return { surface: false, why: WHY.airless };
}

/* L4: a leaf's reflectance before its pigments, low in the visible and high past a red edge near 720 nm (the "red edge"
   of Earth's vegetation, Kiang et al. 2007 II), with the pigments' bands taken out of it. [ILLUSTRATIVE] */
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

/** L4 and L5: the readings of a case, each with its colour and its cover at the planet's starlight S. type: the
   spectral type the page names the star by, so a star of another type nearest an M case is said to be so.
   @param {Case} c @param {number} S @param {string} [type] @returns {Scenario[]} */
export function scenariosOf(c, S, type = 'M') {
  const cover = (/** @type {number} */ gpp) => Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S));
  /** @param {string} key @param {string} words @param {Band[]} bands @param {number} broad @param {number} gpp @returns {Scenario} */
  const mk = (key, words, bands, broad, gpp) => ({ key, words, bands, broad, colour: reflectanceColour(reflectance(bands, broad)), cover: cover(gpp) });
  if (c === F2V) return [mk('one', 'Pigments tuned to a light that peaks in the violet would absorb the blue most: a cover darker in the blue than Earth\'s.', [{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];
  if (c === SUN || c === K2V) return [mk('one', 'Pigments tuned to a light that peaks in the red would absorb red and blue and return green: plants much like Earth\'s.', [SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, c.gppVis)];
  return [
    mk('a', `Reading a: harvesting all its light from 400 to 1,100 nm, as Kiang et al. expect under a star like their ${c.key}, a cover would return little visible light and look dark; its main band, at ${int(c.peak)} nm, is past what eyes see.`, [{ mu: c.peak, w: 40, d: 0.9 }], 0.8, /** @type {number} */ (c.gppWide)),
    mk('b', `Reading b: or, as Takizawa et al. 2017 argue for M dwarfs${type === 'M' ? '' : `, whose light this ${type}-type star's is nearest`}, the first plants would use visible light, with a red edge near 700 to 760 nm as Earth's; drawn here in Earth's colour, with less light to grow on.`, [SORET, { mu: CHL_A, w: 20, d: 0.85 }], 0, c.gppVis),
  ];
}

/** Where a light peaks, in words. @param {number} nm */
export const band = (nm) => (nm < 495 ? 'in the violet' : nm < 700 ? 'in the red' : 'in the near infrared, past what eyes see');
/** A ratio to Earth's, in words: two figures, and under 0.01 said so. @param {number} v */
export const timesEarth = (v) => (v < 0.01 ? 'under 0.01 times' : `${num(v, 2)} times`);

/** The words for a star the archive gives no temperature. */
export const NO_STAR = 'The archive gives no temperature for its star, so these rules cannot say what its light would be at the surface.';
/** The words for a planet with no starlight to grow on. */
export const NO_LIGHT = 'The page has no starlight for it (no orbit, or no star to compute one from), so these rules cannot say how much would grow.';
/** The words for the ice the picture draws on a world with one face to its star: it begins this many degrees from the
   point under the star (the shader's sin(angle / 2) against iceCap), on the day side under 90 degrees.
   @param {number} deg */
export const iceLocked = (deg) => `In the picture its ice begins about ${int(deg)}° from the point under its star, ${deg < 90 ? 'on its day side' : 'past the ring of twilight'}; any cover farther out lies under the ice.`;
/** @param {number} deg */
export const iceLine = (deg) => `In the picture its ice reaches down to about ${int(deg)}° of latitude; any cover nearer its poles lies under the ice.`;
/** The words for a world with one face to its star. */
export const LOCKED = 'One face is always to its star: life, if any, would keep to the day side and the ring of twilight.';
/** The words for an ocean world. */
export const OCEAN = 'It is mostly sea: life, if any, would be mostly in the water, where the colour above would tint the shallows.';

/** If there were life on this planet: the case, where, the readings, and the words. `k` is the planet as the picture
   draws it, the visitor's air scenario included (main.js passes classify(p, { air })). The star's temperature is the
   archive's (p.Teff; data.js puts a stand-in where it is missing, which no rule here uses); the starlight is the one
   the sheets print (starlight.js, through science.js insolation).
   @param {{ Teff: number | null }} p @param {ReturnType<typeof classify>} [k] @param {{ air?: string | null }} [opts] */
export function lifeOf(p, k = classify(p), opts = {}) {
  const ph = k.physics, where = whereOf(p, k);
  /** @type {string[]} */
  const words = [];
  const T = typeof p.Teff === 'number' && p.Teff > 0 ? p.Teff : null;
  if (!where.surface) {
    // no surface life: the reason alone, and no words of light at a surface it does not have
    words.push(where.why);
    return { case: null, type: null, extrapolated: false, where, scenarios: [], light: null, uvb: null, words, phys: ph };
  }
  if (T === null) {
    words.push(NO_STAR);
    return { case: null, type: null, extrapolated: false, where, scenarios: [], light: null, uvb: null, words, phys: ph };
  }
  const { c, type, extrapolated } = caseOf(T);
  const s0 = insolation(p).S, S = typeof s0 === 'number' && s0 > 0 ? s0 : null;
  const sparse = where.surface === 'sparse';
  // a sparse cover is described and not drawn: its cover is 0
  const scenarios = S === null ? [] : scenariosOf(c, S, type).map((s) => (sparse ? { ...s, cover: 0 } : s));
  const light = S === null ? null : (c.par / SUN.par) * S, uvb = S === null ? null : (c.uvb / SUN.uvb) * S;
  words.push(`Its star, ${article(type)} ${type}-type at ${int(T)} K, is nearest the ${c.key} case of Kiang et al. 2007 (${c.star})${extrapolated ? ', extrapolated past the cases\' range' : ''}. Under air like Earth's, its light at the surface would peak at ${int(c.peak)} nm, ${band(c.peak)}.`);
  if (S === null || light === null || uvb === null) words.push(NO_LIGHT);
  else {
    for (const s of scenarios) words.push(s.words);
    words.push(`At noon it would get ${timesEarth(light)} Earth's visible light and ${timesEarth(uvb)} Earth's UV-B.`);
  }
  if (sparse) words.push(where.why);
  if (k.label === 'Ocean world') words.push(OCEAN);
  if (k.look === 'temperate') {
    // the picture's own ice (data.js toParams iceCap, the sine of the latitude where ice begins on a turning world;
    // on a world with one face to its star the ice is drawn on the night side)
    const ice = toParams(p, { air: opts.air ?? null }).iceCap;
    if (ice < 1) words.push(ph.locked ? iceLocked(2 * Math.asin(ice) * 180 / Math.PI) : iceLine(Math.asin(ice) * 180 / Math.PI));
  }
  if (ph.locked) words.push(LOCKED);
  return { case: c, type, extrapolated, where, scenarios, light, uvb, words, phys: ph };
}
