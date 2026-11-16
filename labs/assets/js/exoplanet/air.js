/* ============================================================
   air.js: whether a rocky world keeps air, given as three
   scenarios, each with its status and its reason.

   Pure: no page, no storage. data.js asks it which scenario to
   draw; the survey line and labs/exomania-air.html say why.

   The rule (decided by Luis, 2026-11-16: "if we cannot rule it
   out, we will keep it as options"):
     1. Observed first. A rocky planet with its own published
        observation carries that paper's findings as data: what
        it observed, the bounds it set (a range of surface
        pressure, the gases it covers, a quote and where it is),
        and the scenario its own conclusion names. The status of
        each scenario is derived from those bounds (statusOf),
        never typed by hand.
     2. Extrapolated for the rest. The fit of Berta-Thompson,
        Wachiraphan & Murray (2026) gives the probability that a
        rocky planet hosts a detectable atmosphere, averaged over
        the paper's posterior (shoreline.js). Its "no atmosphere"
        means, in the paper's words, "probably <~10 bar CO2", so
        the remainder is bare rock or thin air.
     3. The picture draws one scenario: an observed one; else the
        one the observing paper concludes for; else, by the fit,
        bare rock when P < 0.5 (thin air looks like bare rock from
        outside) and air otherwise, its thickness from data.js
        (illustrative). An allowed scenario ranks above a
        disfavoured one. Every scenario that is not excluded can
        be drawn instead.

   The three scenarios, defined by what an eclipse can tell:
     bare   no atmosphere.
     thin   an atmosphere too thin to carry the day side's heat
            away, under THICK_FROM bar (Koll 2022 puts the change
            near 1 bar).
     thick  THICK_FROM bar or more: one that carries heat to the
            night side, or a deck of cloud.

   Statuses: observed; excluded (a bound covers the whole band
   for every composition); disfavoured (a bound covers part of
   the band, or only some gases: the scenario stays drawable);
   allowed (no bound reaches it).

   Every entry of OBSERVED was read in its paper on 2026-11-16;
   each quote is from the abstract unless its place says else.
   ============================================================ */

import { DRAWS } from './shoreline.js';

export const SCENARIOS = ['bare', 'thin', 'thick'];
export const SCENARIO_LABEL = { bare: 'bare rock', thin: 'thin air', thick: 'thick air' };
export const STATUSES = ['observed', 'allowed', 'disfavoured', 'excluded'];
/* The pressure, in bar, from which an atmosphere counts as thick (Koll 2022, ApJ 924, 134: heat redistribution
   becomes efficient once the surface pressure exceeds about 1 bar). */
export const THICK_FROM = 1;
/* Earth's escape speed, km/s (NASA Earth fact sheet). One constant for the drawing and the fit: the fit's own
   normalisation is Earth's escape speed, which the paper rounds to 11.18 km/s. */
export const V_ESC_EARTH = 11.186;

/* The fit: Berta-Thompson, Wachiraphan & Murray 2026, ApJ 1011, 123, doi:10.3847/1538-4357/ae77fd (arXiv:2507.02136
   v2), eqs. 1 to 4:
     f_shore / f_earth = f0 (v_esc / v_esc,earth)^p (L / L_sun)^q,   Delta = log10(f / f_shore),
     P = 1 / (1 + e^(Delta / w)).
   P is averaged over 2,000 draws of the paper's posterior (shoreline.js), as its Table 1 is ("sampling from the
   parameter posterior distribution"). The medians, kept for the article: log10 f0 2.62, p 5.9, q 1.17, w 0.247 dex.
   The main fit left out planets above 1,400 times Earth's flux (magma oceans); for those the fit is carried past
   its sample, and the line says so. */
export const SHORELINE = { logF0: 2.62, p: 5.9, q: 1.17, w: 0.247, fluxMax: 1400 };

const fin = (x) => Number.isFinite(x);   // false for anything not a number: no coercion
const cache = new Map();

/* f in Earth's flux, L in solar luminosities, vEsc in km/s. Null when an input is missing.
   P: the posterior mean; lo and hi: its 16th and 84th percentiles; delta and fShore at the medians. */
export function airProbability({ S, L, vEsc }) {
  if (!fin(S) || !fin(L) || !fin(vEsc) || S <= 0 || L <= 0 || vEsc <= 0) return null;
  const key = `${S}|${L}|${vEsc}`;
  if (cache.has(key)) return cache.get(key);
  const lf = Math.log10(S), lv = Math.log10(vEsc / V_ESC_EARTH), lL = Math.log10(L);
  const ps = new Float64Array(DRAWS.n);
  let sum = 0;
  for (let i = 0; i < DRAWS.n; i++) {
    const d = lf - (DRAWS.logF0[i] + DRAWS.p[i] * lv + DRAWS.q[i] * lL);
    ps[i] = 1 / (1 + Math.exp(d / DRAWS.w[i]));   // Math.exp overflows to Infinity, which gives 0: no clamp needed
    sum += ps[i];
  }
  ps.sort();
  const K = SHORELINE;
  const fShore = Math.pow(10, K.logF0 + K.p * lv + K.q * lL);
  const out = { P: sum / DRAWS.n, lo: ps[Math.floor(0.16 * DRAWS.n)], hi: ps[Math.floor(0.84 * DRAWS.n)], delta: lf - Math.log10(fShore), fShore, outside: S > K.fluxMax };
  cache.set(key, out);
  return out;
}

/* The mass the fit is given for a world without a measured mass: the paper's own relation, valid for rocky planets
   up to 1.8 Earth radii (Berta-Thompson et al. 2026, Figure 1 and Section II.1): M = e^-0.025 R^3.37. Null past
   it: data.js then gives the forecast it uses everywhere else. */
export const MR = { a: -0.025, b: 3.37, upTo: 1.8 };
export const fitMass = (R) => (fin(R) && R > 0 && R < MR.upTo ? Math.exp(MR.a) * Math.pow(R, MR.b) : null);

/* The day side of a bare rock (data.js draws every bare, locked rock with it).
   Hottest point, under the star, in radiative equilibrium: T_ss = Teff sqrt(R_star / a) (1 - A_B)^(1/4).
   The day side's mean brightness temperature: T_day = T_ss f^(1/4) with f = 2/3 for a rock with no atmosphere
   (Koll 2022, ApJ 924, 134, eq. 1: f runs from 2/3 for no atmosphere to 1/4 for full redistribution).
   A_B = 0.1: a dark basalt-like surface. GJ 367 b's spectrum fits a blackbody at A_B about 0.1 (Zhang et al. 2024);
   LHS 3844 b's A_B is 0.14 (+0.13, -0.14) with granite excluded at 5.1 σ (Zieba et al. 2026).
   The open melt: inside an angle arccos[(T_lo / T_ss)^4] of the substellar point, with T_lo = 1,673 K, the
   temperature at which magma reaches 40% melt and stops flowing (Kite et al. 2016, ApJ 828, 80, eq. 1).
   The night side of a bare rock: 50 K (Kite et al. 2016, Table 1, after Leger et al. 2011, who give 50 to 75 K). */
export const BARE = { albedo: 0.1, f: 2 / 3, Tlock: 1673, Tnight: 50 };
const RSUN_AU = 0.00465047;
export function bareDay(Teff, Rstar, a) {
  if (!fin(Teff) || !fin(Rstar) || !fin(a) || a <= 0) return null;
  const Tss = Teff * Math.sqrt(Rstar * RSUN_AU / a) * Math.pow(1 - BARE.albedo, 0.25);
  return { Tss, Tday: Tss * Math.pow(BARE.f, 0.25), pond: pondAngle(Tss) };
}
/* Angular radius of the open melt around the substellar point, in degrees (0 when the hottest point is below T_lo). */
export function pondAngle(Tss) {
  if (!fin(Tss) || Tss <= BARE.Tlock) return 0;
  return Math.acos(Math.pow(BARE.Tlock / Tss, 4)) * 180 / Math.PI;
}

/* The day side's brightness temperature of a temperature map like the shader's for a locked world,
   T(c) = max(Tsub c^(1/4), Tnight) with c the cosine from the substellar point, seen from above the substellar
   point: (integral of T^4 c over the day hemisphere / integral of c)^(1/4). With Tnight under the day side this
   is Tsub (2/3)^(1/4). */
export function mapDay(Tsub, Tnight) {
  let num = 0, den = 0;
  for (let i = 0; i < 400; i++) {
    const c = (i + 0.5) / 400;                // the day hemisphere in equal steps of cosine (equal solid angle)
    const T = Math.max(Tsub * Math.pow(c, 0.25), Tnight);
    num += T ** 4 * c; den += c;
  }
  return Math.pow(num / den, 0.25);
}
/* The hottest point that makes mapDay come out at a measured day side. The search starts at the night floor: when the
   floor alone already gives a day side at or above the measurement, the map is flat at the floor and the search
   ends there. */
export function tsubForDay(Tday, Tnight) {
  let lo = Tnight, hi = Tday * 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mapDay(m, Tnight) < Tday) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/* ---- the observed table ---- */
export const PAPERS = {
  greene23: { cite: 'Greene et al. 2023', venue: 'Nature 618, 39', doi: '10.1038/s41586-023-05951-7', what: 'JWST MIRI, five eclipses at 15 µm' },
  ducrot25: { cite: 'Ducrot et al. 2025', venue: 'Nature Astronomy 9, 358', doi: '10.1038/s41550-024-02428-z', what: 'JWST MIRI, ten eclipses at 12.8 and 15 µm' },
  gillon25: { cite: 'Gillon et al. 2025', venue: 'arXiv:2509.02128, a preprint accepted by Nature Astronomy', doi: '10.48550/arXiv.2509.02128', what: 'JWST MIRI, phase curves at 15 µm', preprint: true },
  zieba23: { cite: 'Zieba et al. 2023', venue: 'Nature 620, 746', doi: '10.1038/s41586-023-06232-z', what: 'JWST MIRI, eclipses at 15 µm' },
  piaulet25: { cite: 'Piaulet-Ghorayeb et al. 2025', venue: 'ApJ 989, 181', doi: '10.3847/1538-4357/adf207', what: 'JWST NIRSpec PRISM, two transits' },
  espinoza25: { cite: 'Espinoza et al. 2025', venue: 'ApJL 990, L52', doi: '10.3847/2041-8213/adf42e', what: 'JWST NIRSpec PRISM, four transits' },
  glidden25: { cite: 'Glidden et al. 2025', venue: 'ApJL 990, L53', doi: '10.3847/2041-8213/adf62e', what: 'the same four transits, secondary atmospheres' },
  kreidberg19: { cite: 'Kreidberg et al. 2019', venue: 'Nature 573, 87', doi: '10.1038/s41586-019-1497-4', what: 'Spitzer, phase curve at 4.5 µm' },
  zieba26: { cite: 'Zieba et al. 2026', venue: 'Nature Astronomy 10, 1129', doi: '10.1038/s41550-026-02860-3', what: 'JWST MIRI LRS, emission at 5 to 12 µm' },
  zhang24: { cite: 'Zhang et al. 2024', venue: 'ApJL 961, L44', doi: '10.3847/2041-8213/ad1a07', what: 'JWST MIRI LRS, phase curve at 5 to 12 µm' },
  luque25: { cite: 'Luque et al. 2025', venue: 'AJ 170, 49', doi: '10.3847/1538-3881/addb40', what: 'JWST NIRSpec G395H, phase curve' },
  crossfield22: { cite: 'Crossfield et al. 2022', venue: 'ApJL 937, L17', doi: '10.3847/2041-8213/ac886b', what: 'Spitzer, ten eclipses at 4.5 µm' },
  meier25: { cite: 'Meier Valdés et al. 2025', venue: 'A&A 698, A68', doi: '10.1051/0004-6361/202453449', what: 'JWST MIRI, three eclipses at 15 µm' },
  fortune25: { cite: 'Fortune et al. 2025', venue: 'A&A 701, A25', doi: '10.1051/0004-6361/202554198', what: 'JWST MIRI, three eclipses at 15 µm' },
  allen25: { cite: 'Allen et al. 2025', venue: 'AJ 170, 240', doi: '10.3847/1538-3881/adfc51', what: 'JWST MIRI, two eclipses at 15 µm' },
  xue25: { cite: 'Xue et al. 2025', venue: 'ApJL 995, L52', doi: '10.3847/2041-8213/ae2098', what: 'JWST MIRI, two eclipses at 15 µm' },
  weiner24: { cite: 'Weiner Mansfield et al. 2024', venue: 'ApJL 975, L22', doi: '10.3847/2041-8213/ad8161', what: 'JWST MIRI LRS, two eclipses at 5 to 12 µm' },
  xue24: { cite: 'Xue et al. 2024', venue: 'ApJL 973, L8', doi: '10.3847/2041-8213/ad72e9', what: 'JWST MIRI LRS, emission at 5 to 12 µm' },
  wachiraphan25: { cite: 'Wachiraphan et al. 2025', venue: 'AJ 169, 311', doi: '10.3847/1538-3881/adc990', what: 'JWST MIRI LRS, emission at 5 to 12 µm' },
  hu24: { cite: 'Hu et al. 2024', venue: 'Nature 630, 609', doi: '10.1038/s41586-024-07432-x', what: 'JWST NIRCam and MIRI, emission at 4 to 12 µm' },
  teske25: { cite: 'Teske et al. 2025', venue: 'ApJL 995, L39', doi: '10.3847/2041-8213/ae0a4c', what: 'JWST NIRSpec, four eclipses at 3 to 5 µm' },
};

/* An entry: name (as the catalogue names it); papers; found (what was found, in short); day (the measured day-side
   brightness temperature, K, with its errors) or null; observed ({ scenario, paper, quote, where }) or null;
   concludes ({ scenario, paper, quote, where }) or null; bounds, each one of:
     { kind: 'bare', paper, says, quote, where }                 the paper excludes a planet with no atmosphere;
     { kind: 'pressure', lo, hi, gases, paper, says, quote, where }  it excludes atmospheres whose surface pressure
        is between lo and hi bar (hi may be Infinity), made of gases: 'all' (every composition it calls plausible)
        or a list of the compositions it covers.
   Hydrogen-dominated (primordial) atmospheres are not among the scenarios, so their exclusions are not bounds. */
const pressure = (paper, lo, hi, gases, says, quote, where = 'abstract') => ({ kind: 'pressure', paper, lo, hi, gases, says, quote, where });
const noBare = (paper, says, quote, where = 'abstract') => ({ kind: 'bare', paper, says, quote, where });
const said = (scenario, paper, quote, where = 'abstract') => ({ scenario, paper, quote, where });
const GILLON = (planets) => pressure('gillon25', 1, Infinity, ['with an efficient greenhouse effect'], `Atmospheres of 1 bar or more with an efficient greenhouse effect are strongly disfavoured (Gillon 2025, a preprint).`,
  'Atmosphere models with surface pressures ≥1 bar and efficient greenhouse effects are strongly disfavoured for both planets.');

export const OBSERVED = [
  { name: 'TRAPPIST-1 b', papers: ['greene23', 'ducrot25', 'gillon25'], day: { T: 490, lo: 17, hi: 17, src: 'gillon25' },
    found: 'The day side re-emits the starlight it takes in, with no CO2 band seen; the simplest reading is little or no atmosphere (Greene 2023). With a second filter, an airless planet with a fresh dark surface fits, and so does a thick pure-CO2 atmosphere whose haze inverts its temperature (Ducrot 2025). The phase curve gives a day side of 490 ± 17 K, no night side detected, and disfavours atmospheres of 1 bar or more with an efficient greenhouse effect (Gillon 2025, a preprint).',
    observed: null,
    concludes: said('bare', 'greene23', 'The most straightforward interpretation is that there is little or no planetary atmosphere redistributing radiation from the host star'),
    bounds: [GILLON()] },
  { name: 'TRAPPIST-1 c', papers: ['zieba23', 'gillon25'], day: { T: 380, lo: 31, hi: 31, src: 'zieba23' },
    found: 'A day side of 380 ± 31 K at 15 µm. Cloud-free O2 and CO2 mixtures from 10 bar (with 10 ppm CO2) down to 0.1 bar of pure CO2 are ruled out; a Venus-like atmosphere with sulphuric-acid cloud is disfavoured at 2.6 σ; thinner air or bare rock fit (Zieba 2023). The phase curve disfavours atmospheres of 1 bar or more with an efficient greenhouse effect, and leaves a tenuous O2-dominated atmosphere possible (Gillon 2025, a preprint).',
    observed: null, concludes: null,
    bounds: [
      pressure('zieba23', 0.1, 10, ['cloud-free O2 and CO2 mixtures'], 'Cloud-free O2 and CO2 mixtures from 0.1 bar of pure CO2 to 10 bar with 10 ppm CO2 are ruled out (Zieba 2023).',
        'The data rule out cloud-free O2/CO2 mixtures with surface pressures ranging from 10 bar (with 10 ppm CO2) to 0.1 bar (pure CO2).'),
      pressure('zieba23', 92, Infinity, ['Venus-like, with sulphuric-acid cloud'], 'A Venus-like atmosphere with sulphuric-acid cloud is disfavoured at 2.6 σ (Zieba 2023).',
        'A Venus-analogue atmosphere with sulfuric acid clouds is also disfavoured at 2.6 sigma confidence.'),
      GILLON()] },
  { name: 'TRAPPIST-1 d', papers: ['piaulet25'], day: null,
    found: 'A flat transmission spectrum within 100 to 150 ppm. Clear hydrogen atmospheres are excluded at more than 3 σ; analogues of a haze-free Titan, a cloud-free Venus, early Mars and a cloud-free Archean or modern Earth are rejected at more than 95% confidence. Any atmosphere is extremely thin or carries aerosols high up.',
    observed: null, concludes: null,
    bounds: [pressure('piaulet25', THICK_FROM, Infinity, ['clear analogues of Titan, Venus, early Mars and Earth'], 'Clear analogues of a haze-free Titan, a cloud-free Venus, early Mars and a cloud-free Earth are rejected at more than 95% confidence (Piaulet-Ghorayeb 2025).',
      'further reject high mean molecular weight compositions analogous to a haze-free Titan, a cloud-free Venus, early Mars, and both Archean Earth and a cloud-free modern Earth scenario (>95% confidence)')] },
  { name: 'TRAPPIST-1 e', papers: ['espinoza25', 'glidden25'], day: null,
    found: 'Four transits with strong contamination from the star itself, which varied between visits. Cloudy hydrogen atmospheres (80% or more by volume) are excluded at more than 3 σ (Espinoza 2025). There is no strong evidence for or against an atmosphere: CO2-rich ones at the pressures of Venus and Mars are weakly disfavoured at 2 σ, and N2-rich ones with traces of CO2 and CH4 are permitted; a bare rock and an N2 atmosphere both fit (Glidden 2025).',
    observed: null, concludes: null,
    bounds: [pressure('glidden25', 0.006, 92, ['CO2-rich'], 'CO2-rich atmospheres at the surface pressures of Mars and Venus (about 0.006 and 92 bar) are weakly disfavoured at 2 σ (Glidden 2025).',
      'Our results weakly disfavor CO 2 -rich atmospheres for pressures corresponding to the surface of Venus and Mars and the cloud tops of Venus at 2 σ .')] },
  { name: 'LHS 3844 b', papers: ['kreidberg19', 'zieba26'], day: { T: 985, lo: 17, hi: 16, src: 'zieba26' },
    found: 'A day side of 1,040 ± 40 K and a night side consistent with 0 K; atmospheres above 10 bar are excluded at 3 σ and the best fit is airless rock with Bond albedo under 0.2 (Kreidberg 2019). JWST gives 985 (+16, −17) K, a dark low-silica surface such as basalt, granite excluded at 5.1 σ, CO2 under about 100 mbar and SO2 under about 10 microbar (Zieba 2026).',
    observed: null,
    concludes: said('bare', 'kreidberg19', 'The data are well fitted by a bare rock model with a low Bond albedo'),
    bounds: [
      pressure('kreidberg19', 10, Infinity, 'all', 'Atmospheres above 10 bar are ruled out at 3 σ (Kreidberg 2019).', 'Thick atmospheres with surface pressures above 10 bar are ruled out by the data (at three standard deviations)'),
      pressure('zieba26', 0.1, Infinity, ['CO2'], 'CO2 above about 100 mbar is disfavoured at 5 σ (Zieba 2026).', 'The data also disfavor trace concentrations of CO2 or SO2 gas (with 5-sigma and 3-sigma upper limits of 100 mbar and 10 microbar, respectively).'),
      pressure('zieba26', 1e-5, Infinity, ['SO2'], 'SO2 above about 10 microbar is disfavoured at 3 σ (Zieba 2026).', 'The data also disfavor trace concentrations of CO2 or SO2 gas (with 5-sigma and 3-sigma upper limits of 100 mbar and 10 microbar, respectively).')] },
  { name: 'GJ 367 b', papers: ['zhang24'], day: { T: 1709, lo: 92, hi: 92, src: 'zhang24' },
    found: 'A day side of 1,709 ± 92 K against 1,720 ± 40 K for a black rock with no redistribution, and a night side consistent with zero. A CO2 atmosphere above about 1 bar is ruled out, and 1-bar atmospheres for a wide range of compositions; about 0.1 bar remains consistent.',
    observed: null,
    concludes: said('bare', 'zhang24', 'our JWST observations suggest the planet must have lost the vast majority of its initial inventory of volatiles'),
    bounds: [
      pressure('zhang24', 1, Infinity, 'all', '1-bar atmospheres are ruled out for a wide range of compositions (Zhang 2024).', 'The lack of day-night heat recirculation implies that 1 bar atmospheres are ruled out for a wide range of compositions, while 0.1 bar atmospheres are consistent with the data.'),
      pressure('zhang24', 0.01, Infinity, ['outgassed, under reducing conditions'], 'An outgassed atmosphere above about 10 mbar is ruled out under reducing conditions (Zhang 2024).', 'rules out a CO2 atmosphere >~ 1 bar, an outgassed atmosphere >~10 mbar (under heavily reducing conditions), or an outgassed atmosphere >~0.01 mbar (under heavily oxidizing conditions)'),
      pressure('zhang24', 1e-5, Infinity, ['outgassed, under oxidizing conditions'], 'An outgassed atmosphere above about 0.01 mbar is ruled out under oxidizing conditions (Zhang 2024).', 'rules out a CO2 atmosphere >~ 1 bar, an outgassed atmosphere >~10 mbar (under heavily reducing conditions), or an outgassed atmosphere >~0.01 mbar (under heavily oxidizing conditions)')] },
  { name: 'TOI-1685 b', papers: ['luque25'], day: null,
    found: 'Clear hydrogen atmospheres are ruled out by the transits; the emission is featureless and close to a blackbody, ruling out CO2-, SO2- or CH4-dominated atmospheres thicker than 100 mbar; the planet is described as seemingly airless.',
    observed: null,
    concludes: said('bare', 'luque25', 'Our results add to the growing number of seemingly airless M-star rocky planets'),
    bounds: [pressure('luque25', 0.1, Infinity, ['CO2-, SO2- or CH4-dominated'], 'CO2-, SO2- or CH4-dominated atmospheres thicker than 100 mbar are ruled out (Luque 2025).', 'ruling out carbon dioxide-, sulfur dioxide-, or methane-dominated atmospheres thicker than 100 mbar')] },
  { name: 'GJ 1252 b', papers: ['crossfield22'], day: { T: 1410, lo: 125, hi: 91, src: 'crossfield22' },
    found: 'A day side of 1,410 (+91, −125) K at 4.5 µm, as predicted for no atmosphere; the surface pressure is under about 10 bar. The authors conclude no significant atmosphere, because even 100 bar would escape in under 1 Myr.',
    observed: null,
    concludes: said('bare', 'crossfield22', 'We therefore conclude that GJ 1252b has no significant atmosphere.'),
    bounds: [pressure('crossfield22', 10, Infinity, 'all', 'The surface pressure is under about 10 bar (Crossfield 2022).', 'indicates that GJ 1252b has a surface pressure of ≲10 bar, i.e., substantially thinner than the atmosphere of Venus')] },
  { name: 'TOI-1468 b', papers: ['meier25'], day: { T: 1024, lo: 78, hi: 78, src: 'meier25' },
    found: 'A brightness temperature of 1,024 ± 78 K at 15 µm, consistent with no atmosphere and zero Bond albedo at 1.65 σ. Pure CO2 or H2O atmospheres above 1 bar are ruled out at more than 3 σ. The surface is marginally hotter than expected.',
    observed: null,
    concludes: said('bare', 'meier25', 'The thermal emission of TOI-1468 b reveals a hot bare rock', 'title'),
    bounds: [pressure('meier25', 1, Infinity, ['pure CO2', 'pure H2O'], 'Pure CO2 or H2O atmospheres above 1 bar are ruled out at more than 3 σ (Meier Valdés 2025).', 'A pure CO 2 or H 2 O atmosphere with a surface pressure above 1 bar is ruled out at higher than 3 σ .')] },
  { name: 'LHS 1140 c', papers: ['fortune25'], day: { T: 561, lo: 44, hi: 44, src: 'fortune25' },
    found: 'A day side of 561 ± 44 K, close to the 537 ± 9 K maximum of a bare rock. Pure CO2 atmospheres of 10 mbar or more and pure H2O atmospheres of 1 bar or more are ruled out at more than 3 σ.',
    observed: null,
    concludes: said('bare', 'fortune25', 'recovering an eclipse depth consistent with a low-albedo bare rock'),
    bounds: [
      pressure('fortune25', 0.01, Infinity, ['pure CO2'], 'Pure CO2 atmospheres of 10 mbar or more are ruled out at more than 3 σ (Fortune 2025).', 'including pure CO 2 atmospheres with surface pressure ≥10 mbar and pure H 2 O atmospheres with surface pressure ≥1 bar'),
      pressure('fortune25', 1, Infinity, ['pure H2O'], 'Pure H2O atmospheres of 1 bar or more are ruled out at more than 3 σ (Fortune 2025).', 'including pure CO 2 atmospheres with surface pressure ≥10 mbar and pure H 2 O atmospheres with surface pressure ≥1 bar')] },
  { name: 'LTT 3780 b', papers: ['allen25'], day: { T: 1143, lo: 99, hi: 104, src: 'allen25' },
    found: 'A day side of 1,143 (+104, −99) K, 98 ± 9% of a black rock with no redistribution. CO2 atmospheres down to 0.01 bar are ruled out at more than 3 σ; a pure H2O atmosphere of 1 bar and O2 atmospheres are not.',
    observed: null,
    concludes: said('bare', 'allen25', 'This eclipse depth is consistent with the thermal emission from a bare rock surface'),
    bounds: [pressure('allen25', 0.01, Infinity, ['CO2-based'], 'CO2-based atmospheres down to 0.01 bar are ruled out at more than 3 σ (Allen 2025).', 'We are able to confidently rule out CO 2 -based atmospheres down to a 0.01 bar surface pressure to greater than 3 σ')] },
  { name: 'GJ 3929 b', papers: ['xue25'], day: { T: 782, lo: 79, hi: 79, src: 'xue25' },
    found: 'A day side of 782 ± 79 K against a 737 ± 14 K maximum for a black rock. CO2-rich atmospheres thicker than 100 mbar are ruled out at more than 3 σ; the planet is likely a bare rock.',
    observed: null,
    concludes: said('bare', 'xue25', 'suggesting that GJ 3929b has lost any significant secondary atmosphere'),
    bounds: [pressure('xue25', 0.1, Infinity, ['CO2-rich'], 'CO2-rich atmospheres thicker than 100 mbar are ruled out at more than 3 σ (Xue 2025).', 'These results rule out CO 2 -rich atmospheres thicker than 100 mbar at >3 σ')] },
  { name: 'GJ 486 b', papers: ['weiner24'], day: { T: 865, lo: 14, hi: 14, src: 'weiner24' },
    found: 'A day side of 865 ± 14 K, 0.97 ± 0.01 of the bare-rock maximum. Consistent with an airless body of slight albedo or a thin atmosphere with under 1% H2O or under 1 ppm CO2; inconsistent with an Earth-like or Venus-like atmosphere.',
    observed: null,
    concludes: said('bare', 'weiner24', 'we conclude that the observations are likely best explained by an airless planet'),
    bounds: [
      pressure('weiner24', 1, Infinity, 'all', 'The day side is 0.97 ± 0.01 of a bare rock\'s, inconsistent with an Earth-like or Venus-like atmosphere (Weiner Mansfield 2024).', 'However, it is inconsistent with an Earth- or Venus-like atmosphere'),
      pressure('weiner24', 0, THICK_FROM, ['1% H2O or more', '1 ppm CO2 or more'], 'A thin atmosphere fits only with under 1% H2O and under 1 ppm CO2 (Weiner Mansfield 2024).', 'This value is consistent with an airless body with a slight nonzero albedo or a thin atmosphere with <1% H 2 O or <1 ppm CO 2 .')] },
  { name: 'GJ 1132 b', papers: ['xue24'], day: { T: 709, lo: 31, hi: 31, src: 'xue24' },
    found: 'A day side of 709 ± 31 K against a 746 (+14, −11) K maximum for a black rock. Ruled out: 1-bar atmospheres with 1% H2O or more, atmospheres of any modelled thickness (0.0001 to 100 bar) with 1% CO2 or more, and Venus-like ones (about 100 bar) with 1 ppm CO2 or H2O.',
    observed: null,
    concludes: said('bare', 'xue24', 'We therefore conclude that GJ 1132b likely does not have a significant atmosphere.'),
    bounds: [
      pressure('xue24', 1, 1, ['1% H2O or more'], 'Earth-thick (about 1 bar) atmospheres with 1% H2O or more are ruled out (Xue 2024).', 'we rule out Earth-thickness ( P ∼ 1 bar) atmospheres with at least 1% H 2 O'),
      pressure('xue24', 1e-4, 100, ['1% CO2 or more'], 'Atmospheres of 0.0001 to 100 bar with 1% CO2 or more are ruled out (Xue 2024).', 'atmospheres of any modeled thickness (10 −4 to 10 2 bars) that contain at least 1% CO 2'),
      pressure('xue24', 100, Infinity, ['1 ppm CO2 or H2O or more'], 'Venus-like atmospheres (about 100 bar or more) with 1 ppm CO2 or H2O are ruled out (Xue 2024).', 'thick, Venus-like atmospheres ( P ≳ 100 bars) with at least 1 ppm CO 2 or H 2 O')] },
  { name: 'LTT 1445 A b', papers: ['wachiraphan25'], day: { T: 525, lo: 15, hi: 15, src: 'wachiraphan25' },
    found: 'A day side of 525 ± 15 K, 0.952 ± 0.057 of the bare-rock maximum, consistent with a dark rocky surface. Atmospheres of about 100 bar with Bond albedo above 0.08 are excluded at 3 σ, and pure CO2 at 1, 10 and 100 bar disfavoured at 4.2, 6.6 and 6.8 σ. A moderately thin atmosphere like that of Mars, Titan or Earth remains uncertain.',
    observed: null,
    concludes: said('bare', 'wachiraphan25', 'consistent with emission from a dark rocky surface'),
    bounds: [
      pressure('wachiraphan25', 100, Infinity, ['with Bond albedo above 0.08'], 'Atmospheres of about 100 bar with Bond albedo above 0.08 are excluded at 3 σ (Wachiraphan 2025).', 'excluding ∼100 bar atmospheres with Bond albedo >0.08 at the 3 σ level'),
      pressure('wachiraphan25', 1, Infinity, ['pure CO2'], 'Pure CO2 atmospheres of 1, 10 and 100 bar are disfavoured at 4.2 σ and more (Wachiraphan 2025).', 'disfavor simple 100% CO 2 atmospheres with surface pressures of 1, 10, and 100 bar at 4.2 σ , 6.6 σ , and 6.8 σ confidence, respectively')] },
  { name: '55 Cnc e', papers: ['hu24'], day: { T: 1796, lo: 88, hi: 88, src: 'hu24' },
    found: 'A day side of 1,796 ± 88 K at 5 to 12 µm, 8 σ below the 2,511 ± 26 K of a black rock with no redistribution. A lava world with a tenuous rock-vapour atmosphere is ruled out; heat is carried by a substantial atmosphere, best fit by 0.01 to 100 bar of CO or N2 holding CO2. In the Methods, the authors find that such an atmosphere needs more than about 10 bar to carry heat well, and that the emitting layer may sit far above the surface.',
    observed: said('thick', 'hu24', 'indicate a bona fide volatile atmosphere likely rich in CO2 or CO'),
    concludes: null,
    bounds: [
      noBare('hu24', 'The day side is 8 σ cooler than a black rock with no redistribution, 1,796 ± 88 K against 2,511 ± 26 K (Hu 2024, p. 3).', 'This brightness temperature is by 8σ lower than the temperature for zero albedo and zero heat redistribution (2511±26 K)', 'text, p. 3'),
      pressure('hu24', 0, THICK_FROM, ['vaporized rock'], 'A lava world with a tenuous rock-vapour atmosphere is ruled out (Hu 2024).', 'The measurements rule out the scenario where the planet is a lava world shrouded by a tenuous atmosphere made of vaporized rock')] },
  { name: 'TOI-561 b', papers: ['teske25'], day: { T: 1800, lo: 60, hi: 130, src: 'teske25' },
    found: 'A day side of 1,800 (+130, −60) K at 3 to 5 µm in one reduction (1,870 and 2,150 K in two others), against 2,950 K for a bare rock. The day side is inconsistent with a bare rock at high significance and is cooled well below the about 3,000 K of bare rock or thin air.',
    observed: said('thick', 'teske25', 'suggesting instead a thick volatile envelope that is cooling the dayside'),
    concludes: null,
    bounds: [
      noBare('teske25', 'The day side is inconsistent with a bare-rock surface at high statistical significance (Teske 2025).', 'the dayside of TOI-561 b is inconsistent with a bare-rock surface at high statistical significance'),
      pressure('teske25', 0, THICK_FROM, 'all', 'The day side is well below the about 3,000 K a thin atmosphere would leave (Teske 2025).', 'cooling the dayside to well below the ∼3000 K expected in the bare-rock or thin-atmosphere case')] },
];
const BY_NAME = new Map(OBSERVED.map((e) => [e.name, e]));
export const observedOf = (name) => BY_NAME.get(name) || null;

/* ---- statuses, from the bounds ----
   A bound touches a band when their ranges meet, and covers it when it reaches across the whole band for every
   composition ('all'). bare: only a 'bare' bound. thin: pressures above 0 and under THICK_FROM. thick: THICK_FROM
   and above. */
export function touches(b, key) {
  if (key === 'bare') return b.kind === 'bare';
  if (b.kind !== 'pressure') return false;   // equivalent: a 'bare' bound has no pressures, so the comparisons below are false for it too
  return key === 'thin' ? b.lo < THICK_FROM && b.hi > 0 : b.hi >= THICK_FROM;
}
export function covers(b, key) {
  if (key === 'bare') return b.kind === 'bare';
  if (b.gases !== 'all') return false;   // either range below reaches across its band, so it touches it too
  return key === 'thin' ? b.lo <= 0 && b.hi >= THICK_FROM : b.lo <= THICK_FROM && b.hi === Infinity;
}
const cites = (keys) => keys.map((k) => PAPERS[k].cite.replace(' et al.', '')).join(' and ');
/* The status of one scenario of an entry, with its reason and the bounds behind it. */
export function statusOf(entry, key) {
  if (entry.observed && entry.observed.scenario === key) return { s: 'observed', why: `Observed: “${entry.observed.quote}” (${cites([entry.observed.paper])}).`, bounds: [] };
  const hit = entry.bounds.filter((b) => touches(b, key));
  if (!hit.length) {
    const c = entry.concludes && entry.concludes.scenario === key ? ` The paper concludes: “${entry.concludes.quote}” (${cites([entry.concludes.paper])}).` : '';
    return { s: 'allowed', why: `No bound of ${cites(entry.papers)} reaches it.${c}`, bounds: [] };
  }
  const s = hit.some((b) => covers(b, key)) ? 'excluded' : 'disfavoured';
  return { s, why: hit.map((b) => b.says).join(' '), bounds: hit };
}

/* The scenarios of one rocky world.
   name: the catalogue name. S, L, vEsc: the fit's inputs, or null when the archive lacks them. wantThick: the
   illustrative amount of air in data.js reaches full air (used only to choose the thickness when the fit says
   air). wantAir: the same amount reaches thin air (used only when there is no fit). minMass: the mass behind
   vEsc is a minimum mass (M sin i). inZone: the world is in its star's habitable zone (the line then says what the
   zone does not tell). observed: an entry in the form of OBSERVED, for tests; by default the table's.
   Returns { list, drawn, by, fit, observed, minMass }: list holds the three scenarios in order, each
   { key, status, p, why }. p is the fit's: P (a detectable atmosphere) for thick air, 1 - P (bare rock or thin
   air) for the other two, null for an observed or excluded scenario or without a fit. by: what chose the drawn
   scenario, 'observed', 'paper', 'fit' or 'amount'. */
export function scenariosFor({ name, S, L, vEsc, wantThick = false, wantAir = true, minMass = false, inZone = false, observed = observedOf(name) }) {
  const fit = airProbability({ S, L, vEsc });
  const obs = observed;
  const pOf = (key) => (fit ? (key === 'thick' ? fit.P : 1 - fit.P) : null);
  const list = SCENARIOS.map((key) => {
    const st = obs ? statusOf(obs, key) : { s: 'allowed', why: null };
    const open = st.s === 'allowed' || st.s === 'disfavoured';
    return { key, status: st.s, p: open ? pOf(key) : null, why: st.why };
  });
  const status = (k) => list.find((x) => x.key === k).status;
  let drawn = null, by = null;
  const seenOne = list.find((x) => x.status === 'observed');
  if (seenOne) { drawn = seenOne.key; by = 'observed'; }
  else if (obs && obs.concludes && status(obs.concludes.scenario) !== 'excluded') { drawn = obs.concludes.scenario; by = 'paper'; }
  else {
    const air = fit ? fit.P >= 0.5 : wantAir;
    by = fit ? 'fit' : 'amount';
    const order = air ? (wantThick ? ['thick', 'thin', 'bare'] : ['thin', 'thick', 'bare']) : ['bare', 'thin', 'thick'];
    drawn = order.find((k) => status(k) === 'allowed') || order.find((k) => status(k) === 'disfavoured') || null;
  }
  return { list, drawn, by, fit, observed: obs, minMass: !!minMass && !!fit, inZone: !!inZone };
}

/* The scenarios the picture can be switched to: every one that is not excluded. */
export const drawable = (sc) => sc.list.filter((x) => x.status !== 'excluded').map((x) => x.key);

/* ---- words for the survey line ---- */
/* A probability as a percentage: one significant figure under 0.1%, two under 1%, whole numbers to 99%, one decimal
   above, and the extremes in words. A range drops the first per-cent sign when both ends are numbers. */
const pct = (x) => {
  const v = x * 100;
  if (v >= 99.95) return 'over 99.9%';
  if (v < 0.01) return 'under 0.01%';
  if (v < 1) return `${+v.toPrecision(v < 0.1 ? 1 : 2)}%`;
  return `${v > 99 ? v.toFixed(1) : Math.round(v)}%`;
};
const range = (lo, hi) => { const a = pct(lo), b = pct(hi); return a === b ? `all ${b}` : `${/^\d/.test(a) ? a.slice(0, -1) : a} to ${b}`; };
export { pct as percent, range as percentRange };

/* The line under the planet's name, as parts: { t } is text; { t, air } names a scenario the picture can be switched
   to. shown is the scenario drawn now (the default unless the visitor chose another). Plain sentences: what is
   drawn, then the other scenarios grouped by status, then who observed it, then the fit, worded as the paper
   defines it. */
const DRAWN_AS = { bare: 'Drawn as bare rock', thin: 'Drawn with thin air', thick: 'Drawn with thick air' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export function airParts(sc, shown = sc.drawn) {
  const L = SCENARIO_LABEL, out = [];
  const lead = sc.list.find((x) => x.key === shown);
  out.push({ t: `${DRAWN_AS[shown]}${lead.status === 'observed' ? ', as observed' : ''}${lead.status === 'disfavoured' ? ', though disfavoured' : ''}${shown !== sc.drawn ? `, by your choice; the survey draws ${L[sc.drawn]}` : ''}.` });
  for (const status of ['observed', 'allowed', 'disfavoured', 'excluded']) {
    const xs = sc.list.filter((x) => x.key !== shown && x.status === status);
    xs.forEach((x, i) => {
      out.push({ t: i === 0 ? ' ' : i === xs.length - 1 ? ' and ' : ', ' });
      const t = i === 0 ? cap(L[x.key]) : L[x.key];
      out.push(status === 'excluded' ? { t } : { t, air: x.key });
    });
    if (xs.length) out.push({ t: ` ${status}.` });
  }
  out.push({ t: sc.observed ? ` Observed by ${both(sc.observed.papers.map((k) => PAPERS[k].cite.replace(' et al.', '') + (PAPERS[k].preprint ? ' (a preprint)' : '')))}.` : ' Not observed.' });
  if (sc.fit && sc.list.some((x) => x.p !== null)) {
    // the paper's "no atmosphere" is "probably <~10 bar CO2" and its eclipses constrain "less than about 1-10 bar":
    // the odds are of an atmosphere thicker than that, and what is left of P is bare rock or thin air, as far as allowed
    const rest = sc.list.filter((x) => x.key !== 'thick' && x.p !== null).map((x) => L[x.key]);
    out.push({ t: ` The 2026 fit, extrapolated${sc.fit.outside ? ' past its sample' : ''}: chance it kept an atmosphere the fit counts (thicker than about 1 to 10 bar) ${pct(sc.fit.P)}, 68% range ${range(sc.fit.lo, sc.fit.hi)}.${rest.length ? ` The rest is ${rest.join(' or ')}.` : ''}` });
    if (sc.fit.lo < 0.5 && sc.fit.hi > 0.5) out.push({ t: ' Its range crosses 50%, so the fit cannot decide; the picture takes the more probable side.' });
    if (sc.minMass) out.push({ t: ' The mass is a minimum (M sin i), so the chance is a lower bound.' });
  } else if (!sc.fit) out.push({ t: ' No fit: the archive lacks the star\'s luminosity, the flux or a radius, so the amount of air is the survey\'s own rule, illustrative.' });
  if (sc.inZone) out.push({ t: ' The habitable zone describes the temperature the star gives, and says nothing about whether the planet kept air.' });
  return out;
}
export const airLine = (sc, shown) => airParts(sc, shown).map((x) => x.t).join('');
