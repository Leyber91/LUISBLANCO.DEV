/* ============================================================
   air.js — whether a rocky world keeps air, given as two or
   three scenarios, each with its status and its reason.

   Pure: no page, no storage. data.js asks it which scenario to
   draw; the survey line and labs/exomania-air.html say why.

   The rule (decided by Luis, 2026-11-16):
     1. Observed first. A rocky planet with its own published
        observation (JWST eclipse, phase curve or transmission;
        Spitzer for LHS 3844 b and GJ 1252 b) has each scenario
        set by that paper: excluded, allowed, or observed.
     2. Extrapolated for the rest. The fit of Berta-Thompson,
        Wachiraphan & Murray (2026) gives the probability that a
        rocky planet has an atmosphere at all. Bare rock takes
        1 - P; thin and thick air share P, which the fit does not
        split.
     3. The picture draws one scenario: an observed one if there
        is one; else the one the observing paper concludes for;
        else the more probable of bare rock and air by the fit,
        with the thickness of the air from data.js (illustrative).
        Every scenario that is not excluded can be drawn instead.

   The three scenarios, defined by what an eclipse can tell:
     bare   no atmosphere.
     thin   an atmosphere too thin to carry the day side's heat
            away: from outside it looks like bare rock unless it
            holds a gas with a strong band (CO2 at 15 µm). Koll
            (2022) puts the change near 1 bar.
     thick  an atmosphere that carries heat to the night side,
            about 1 bar or more, or a deck of cloud.

   Every entry of OBSERVED was read in its paper on 2026-11-16
   (abstract, and the numbers quoted from the text where named).
   ============================================================ */

export const SCENARIOS = ['bare', 'thin', 'thick'];
export const SCENARIO_LABEL = { bare: 'bare rock', thin: 'thin air', thick: 'thick air' };

/* The fit: Berta-Thompson, Wachiraphan & Murray 2026, ApJ 1011, 123, doi:10.3847/1538-4357/ae77fd (arXiv:2507.02136,
   v2 of 2026-03-19), eqs. 1 to 4, median values of the main fit ("no magma ocean" sample):
     f_shore / f_earth = 10^2.62 (v_esc / 11.18 km/s)^5.9 (L / L_sun)^1.17
     Delta = log10(f / f_shore),   P(atmosphere) = 1 / (1 + e^(Delta / w)),   w = 0.247 dex (ln w = -1.40)
   Their 68% intervals: log10 f0 2.62 -0.31 +0.45; p 5.9 -0.43 +0.61; q 1.17 -0.20 +0.28; ln w -1.40 -0.30 +0.32.
   [ILLUSTRATIVE] The survey uses the medians alone, so its probabilities are sharper than the paper's posterior.
   The main fit left out planets above 1,400 times Earth's flux (magma oceans); for those the fit is carried past
   its sample, and the line says so. */
export const SHORELINE = { logF0: 2.62, p: 5.9, q: 1.17, w: 0.247, vEscEarth: 11.18, fluxMax: 1400 };

const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/* f in Earth's flux, L in solar luminosities, vEsc in km/s. Null when an input is missing. */
export function airProbability({ S, L, vEsc }) {
  if (!fin(S) || !fin(L) || !fin(vEsc) || S <= 0 || L <= 0 || vEsc <= 0) return null;
  const K = SHORELINE;
  const fShore = Math.pow(10, K.logF0) * Math.pow(vEsc / K.vEscEarth, K.p) * Math.pow(L, K.q);
  const delta = Math.log10(S / fShore);
  return { P: 1 / (1 + Math.exp(delta / K.w)), delta, fShore, outside: S > K.fluxMax };
}

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
/* The hottest point that makes mapDay come out at a measured day side. */
export function tsubForDay(Tday, Tnight) {
  let lo = Tday * 0.5, hi = Tday * 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (mapDay(m, Tnight) < Tday) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/* ---- the observed table ----
   One entry per planet, named as the catalogue names it. For each scenario: s ('excluded', 'allowed' or
   'observed') and why, a sentence written from the paper. concludes: the scenario the paper's own conclusion
   names, when it names one. day: the day side's measured brightness temperature, K, with its errors. */
const ex = (why) => ({ s: 'excluded', why }), ok = (why) => ({ s: 'allowed', why }), seen = (why) => ({ s: 'observed', why });

export const PAPERS = {
  greene23: { cite: 'Greene et al. 2023', venue: 'Nature 618, 39', doi: '10.1038/s41586-023-05951-7', what: 'JWST MIRI, five eclipses at 15 µm' },
  ducrot25: { cite: 'Ducrot et al. 2025', venue: 'Nature Astronomy 9, 358', doi: '10.1038/s41550-024-02428-z', what: 'JWST MIRI, ten eclipses at 12.8 and 15 µm' },
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

export const OBSERVED = [
  { name: 'TRAPPIST-1 b', papers: ['greene23', 'ducrot25'], concludes: 'bare', day: null,
    found: 'The day side re-emits the starlight it takes in, with no CO2 band seen; the simplest reading is little or no atmosphere (Greene 2023). With a second filter, an airless planet with a fresh dark surface fits, and so does a thick pure-CO2 atmosphere whose haze inverts its temperature (Ducrot 2025).',
    bare: ok('An airless planet with a fresh ultramafic surface fits both eclipses (Ducrot 2025).'),
    thin: ok('Not excluded by either paper.'),
    thick: ok('Allowed in one form: pure CO2 with a photochemical haze that inverts its temperature (Ducrot 2025).') },
  { name: 'TRAPPIST-1 c', papers: ['zieba23'], concludes: null, day: { T: 380, lo: 31, hi: 31, src: 'zieba23' },
    found: 'A day side of 380 ± 31 K at 15 µm. Cloud-free O2 and CO2 mixtures from 10 bar (with 10 ppm CO2) down to 0.1 bar of pure CO2 are excluded; a Venus-like atmosphere with sulphuric-acid cloud is disfavoured at 2.6 σ; thinner air or bare rock fit.',
    bare: ok('Consistent with the measured day side (Zieba 2023).'),
    thin: ok('Thinner atmospheres are consistent (Zieba 2023), if they hold less CO2 than 0.1 bar.'),
    thick: ex('Cloud-free thick O2 and CO2 mixtures are excluded; a cloudy Venus-like one is disfavoured at 2.6 σ (Zieba 2023).') },
  { name: 'TRAPPIST-1 d', papers: ['piaulet25'], concludes: null, day: null,
    found: 'A flat transmission spectrum within 100 to 150 ppm. Clear hydrogen atmospheres are excluded at more than 3 σ; a haze-free Titan, a cloud-free Venus, early Mars and a cloud-free Archean or modern Earth are rejected at more than 95% confidence. Any atmosphere is extremely thin or carries aerosols high up.',
    bare: ok('If it is airless, the paper bounds the water the inner three planets formed with (Piaulet-Ghorayeb 2025).'),
    thin: ok('An extremely thin atmosphere is consistent (Piaulet-Ghorayeb 2025).'),
    thick: ok('Allowed only under high cloud or haze: the clear Earth, Venus and early-Mars cases are rejected at more than 95% confidence (Piaulet-Ghorayeb 2025).') },
  { name: 'TRAPPIST-1 e', papers: ['espinoza25', 'glidden25'], concludes: null, day: null,
    found: 'Four transits with strong contamination from the star itself, which varied between visits. Cloudy hydrogen atmospheres (80% or more by volume) are excluded at more than 3 σ (Espinoza 2025). There is no strong evidence for or against an atmosphere: CO2-rich ones at the pressures of Venus and Mars are weakly disfavoured at 2 σ, and N2-rich ones with traces of CO2 and CH4 are permitted; a bare rock and an N2 atmosphere both fit (Glidden 2025).',
    bare: ok('A bare rock fits the transits (Glidden 2025).'),
    thin: ok('Not excluded (Glidden 2025).'),
    thick: ok('An N2-rich atmosphere with traces of CO2 and CH4 is permitted; CO2-rich ones are weakly disfavoured at 2 σ (Glidden 2025).') },
  { name: 'LHS 3844 b', papers: ['kreidberg19', 'zieba26'], concludes: 'bare', day: { T: 985, lo: 17, hi: 16, src: 'zieba26' },
    found: 'A day side of 1,040 ± 40 K and a night side consistent with 0 K; atmospheres above 10 bar are excluded at 3 σ and the best fit is airless rock with Bond albedo under 0.2 (Kreidberg 2019). JWST gives 985 (+16, −17) K, a dark low-silica surface such as basalt, granite excluded at 5.1 σ, CO2 under about 100 mbar and SO2 under about 10 microbar (Zieba 2026).',
    bare: ok('The best fit of both papers: a dark, low-silica rock (Zieba 2026).'),
    thin: ok('Not excluded if it holds less than about 100 mbar of CO2 and 10 microbar of SO2 (Zieba 2026).'),
    thick: ex('Atmospheres above 10 bar are excluded at 3 σ (Kreidberg 2019).') },
  { name: 'GJ 367 b', papers: ['zhang24'], concludes: 'bare', day: { T: 1709, lo: 92, hi: 92, src: 'zhang24' },
    found: 'A day side of 1,709 ± 92 K against 1,720 ± 40 K for a black rock with no redistribution, and a night side consistent with zero. A CO2 atmosphere above about 1 bar is excluded, and 1-bar atmospheres for a wide range of compositions; about 0.1 bar remains consistent.',
    bare: ok('A blackbody with no redistribution and Bond albedo about 0.1 fits (Zhang 2024).'),
    thin: ok('Atmospheres near 0.1 bar remain consistent (Zhang 2024).'),
    thick: ex('1-bar atmospheres are excluded for a wide range of compositions, CO2 above about 1 bar outright (Zhang 2024).') },
  { name: 'TOI-1685 b', papers: ['luque25'], concludes: 'bare', day: null,
    found: 'Clear hydrogen atmospheres are excluded by the transits; the emission is featureless and close to a blackbody, which argues against thick atmospheres of heavy molecules; the best description is a dark bare rock with no redistribution.',
    bare: ok('A dark bare rock with no redistribution and a low albedo (Luque 2025).'),
    thin: ok('Secondary atmospheres cannot be told from a flat line in transmission (Luque 2025).'),
    thick: ex('The near-blackbody emission argues against thick atmospheres of heavy molecules (Luque 2025).') },
  { name: 'GJ 1252 b', papers: ['crossfield22'], concludes: 'bare', day: { T: 1410, lo: 125, hi: 91, src: 'crossfield22' },
    found: 'A day side of 1,410 (+91, −125) K at 4.5 µm, as predicted for no atmosphere; the surface pressure is under about 10 bar. The authors conclude no significant atmosphere, because even 100 bar would escape in under 1 Myr.',
    bare: ok('The eclipse matches the prediction for no atmosphere (Crossfield 2022).'),
    thin: ok('Not excluded by the eclipse (Crossfield 2022).'),
    thick: ok('Only below about 10 bar: the eclipse excludes Venus-like pressures, and the paper argues from escape that none survives (Crossfield 2022).') },
  { name: 'TOI-1468 b', papers: ['meier25'], concludes: 'bare', day: { T: 1024, lo: 78, hi: 78, src: 'meier25' },
    found: 'A brightness temperature of 1,024 ± 78 K at 15 µm, consistent with no atmosphere and zero Bond albedo at 1.65 σ. Pure CO2 or H2O atmospheres above 1 bar are excluded at more than 3 σ. The surface is marginally hotter than expected.',
    bare: ok('Consistent with no atmosphere and zero Bond albedo (Meier Valdés 2025).'),
    thin: ok('Not excluded (Meier Valdés 2025).'),
    thick: ex('Pure CO2 or H2O above 1 bar is excluded at more than 3 σ (Meier Valdés 2025).') },
  { name: 'LHS 1140 c', papers: ['fortune25'], concludes: 'bare', day: { T: 561, lo: 44, hi: 44, src: 'fortune25' },
    found: 'A day side of 561 ± 44 K, close to the 537 ± 9 K maximum of a bare rock. Pure CO2 atmospheres of 10 mbar or more and pure H2O atmospheres of 1 bar or more are excluded at more than 3 σ.',
    bare: ok('Highly consistent with a low-albedo bare rock (Fortune 2025).'),
    thin: ok('Not excluded unless it is pure CO2 at 10 mbar or more (Fortune 2025).'),
    thick: ex('Pure H2O of 1 bar or more and pure CO2 of 10 mbar or more are excluded at more than 3 σ (Fortune 2025).') },
  { name: 'LTT 3780 b', papers: ['allen25'], concludes: 'bare', day: { T: 1143, lo: 99, hi: 104, src: 'allen25' },
    found: 'A day side of 1,143 (+104, −99) K, 98 ± 9% of a black rock with no redistribution. CO2 atmospheres down to 0.01 bar are excluded at more than 3 σ; a pure H2O atmosphere of 1 bar and O2 atmospheres are not excluded.',
    bare: ok('Consistent with a bare rock surface (Allen 2025).'),
    thin: ok('Not excluded unless it holds CO2 (Allen 2025).'),
    thick: ok('Not excluded for pure H2O at 1 bar or for O2, which the 15 µm band cannot see; CO2 is excluded down to 0.01 bar (Allen 2025).') },
  { name: 'GJ 3929 b', papers: ['xue25'], concludes: 'bare', day: { T: 782, lo: 79, hi: 79, src: 'xue25' },
    found: 'A day side of 782 ± 79 K against a 737 ± 14 K maximum for a black rock. CO2-rich atmospheres thicker than 100 mbar are excluded at more than 3 σ; the planet is likely a bare rock.',
    bare: ok('Likely a bare rock (Xue 2025).'),
    thin: ok('Not excluded if thinner than 100 mbar or poor in CO2 (Xue 2025).'),
    thick: ex('CO2-rich atmospheres thicker than 100 mbar are excluded at more than 3 σ (Xue 2025).') },
  { name: 'GJ 486 b', papers: ['weiner24'], concludes: 'bare', day: { T: 865, lo: 14, hi: 14, src: 'weiner24' },
    found: 'A day side of 865 ± 14 K, 0.97 ± 0.01 of the bare-rock maximum. Consistent with an airless body of slight albedo or a thin atmosphere with under 1% H2O or under 1 ppm CO2; inconsistent with an Earth-like or Venus-like atmosphere.',
    bare: ok('Best explained by an airless planet (Weiner Mansfield 2024).'),
    thin: ok('A thin atmosphere with under 1% H2O or under 1 ppm CO2 is consistent (Weiner Mansfield 2024).'),
    thick: ex('Inconsistent with an Earth-like or Venus-like atmosphere (Weiner Mansfield 2024).') },
  { name: 'GJ 1132 b', papers: ['xue24'], concludes: 'bare', day: { T: 709, lo: 31, hi: 31, src: 'xue24' },
    found: 'A day side of 709 ± 31 K against a 746 (+14, −11) K maximum for a black rock. Excluded: 1-bar atmospheres with 1% H2O or more, atmospheres of any modelled thickness (0.0001 to 100 bar) with 1% CO2 or more, and Venus-like ones (about 100 bar) with 1 ppm CO2 or H2O.',
    bare: ok('Likely no significant atmosphere (Xue 2024).'),
    thin: ok('Not excluded if it holds under 1% CO2 (Xue 2024).'),
    thick: ex('Earth-thick atmospheres with 1% H2O and Venus-like ones are excluded (Xue 2024).') },
  { name: 'LTT 1445 A b', papers: ['wachiraphan25'], concludes: null, day: { T: 525, lo: 15, hi: 15, src: 'wachiraphan25' },
    found: 'A day side of 525 ± 15 K, 0.952 ± 0.057 of the bare-rock maximum, consistent with a dark rocky surface. Atmospheres of about 100 bar with Bond albedo above 0.08 are excluded at 3 σ, and pure CO2 at 1, 10 and 100 bar at 4.2, 6.6 and 6.8 σ. A moderately thin atmosphere like that of Mars, Titan or Earth remains uncertain.',
    bare: ok('Consistent with emission from a dark rocky surface (Wachiraphan 2025).'),
    thin: ok('A moderately thin atmosphere like that of Mars, Titan or Earth remains uncertain (Wachiraphan 2025).'),
    thick: ex('About 100 bar with Bond albedo above 0.08 is excluded at 3 σ; pure CO2 at 1 to 100 bar at 4.2 σ or more (Wachiraphan 2025).') },
  { name: '55 Cnc e', papers: ['hu24'], concludes: 'thick', day: { T: 1796, lo: 88, hi: 88, src: 'hu24' },
    found: 'A day side of 1,796 ± 88 K at 5 to 12 µm, 8 σ below the 2,511 ± 26 K of a black rock with no redistribution. A lava world with a thin rock-vapour atmosphere is ruled out; heat is carried by a substantial atmosphere, best fit by 0.01 to 100 bar of CO or N2 holding CO2.',
    bare: ex('The day side is 8 σ cooler than a black rock with no redistribution (Hu 2024).'),
    thin: ex('A lava world with a thin rock-vapour atmosphere is ruled out (Hu 2024).'),
    thick: seen('A volatile atmosphere, possibly rich in CO2 or CO, carries heat from the day side (Hu 2024).') },
  { name: 'TOI-561 b', papers: ['teske25'], concludes: 'thick', day: { T: 1800, lo: 60, hi: 130, src: 'teske25' },
    found: 'A day side of 1,800 (+130, −60) K at 3 to 5 µm in one reduction (1,870 and 2,150 K in two others), against 2,950 K for a bare rock. The day side is inconsistent with a bare rock at high significance and is cooled well below the about 3,000 K of bare rock or thin air.',
    bare: ex('Inconsistent with a bare-rock surface at high statistical significance (Teske 2025).'),
    thin: ex('The day side is well below the about 3,000 K a thin atmosphere would leave (Teske 2025).'),
    thick: seen('A thick volatile envelope cools the day side (Teske 2025).') },
];
const BY_NAME = new Map(OBSERVED.map((e) => [e.name, e]));
export const observedOf = (name) => BY_NAME.get(name) || null;

/* The scenarios of one rocky world.
   name: the catalogue name. S, L, vEsc: the fit's inputs. wantThick: the illustrative amount of air in data.js
   reaches full air (used only to choose the thickness when the fit says air). wantAir: the same amount reaches
   thin air (used only when the fit has no inputs).
   Returns { list, drawn, by, fit, observed }: list holds the three scenarios in order, each { key, status, p, why };
   p is the fit's probability (bare 1 - P, thin and thick share P) or null without a fit; by says what chose the
   drawn one: 'observed', 'paper', 'fit' or 'amount'. observed: an entry in the form of OBSERVED, for tests; by
   default the table's entry for the name. */
export function scenariosFor({ name, S, L, vEsc, wantThick = false, wantAir = true, observed = observedOf(name) }) {
  const fit = airProbability({ S, L, vEsc });
  const obs = observed;
  const pOf = (key) => (fit ? (key === 'bare' ? 1 - fit.P : fit.P) : null);
  const list = SCENARIOS.map((key) => {
    const o = obs ? obs[key] : null;
    const status = o ? o.s : 'allowed';
    return { key, status, p: status === 'allowed' ? pOf(key) : null, why: o ? o.why : null };
  });
  const open = (k) => list.find((x) => x.key === k).status !== 'excluded';
  let drawn = null, by = null;
  const seenOne = list.find((x) => x.status === 'observed');
  if (seenOne) { drawn = seenOne.key; by = 'observed'; }
  else if (obs && obs.concludes && open(obs.concludes)) { drawn = obs.concludes; by = 'paper'; }
  else {
    const air = fit ? fit.P >= 0.5 : wantAir;
    by = fit ? 'fit' : 'amount';
    const order = air ? (wantThick ? ['thick', 'thin', 'bare'] : ['thin', 'thick', 'bare']) : ['bare', 'thin', 'thick'];
    drawn = order.find(open) || null;
  }
  return { list, drawn, by, fit, observed: obs };
}

/* The scenarios the picture can be switched to: every one that is not excluded. */
export const drawable = (sc) => sc.list.filter((x) => x.status !== 'excluded').map((x) => x.key);

/* ---- words for the survey line ---- */
const pct = (x) => {
  if (x === null) return '';
  const v = x * 100;
  if (v >= 99.95) return 'over 99.9%';
  if (v < 0.05) return 'under 0.1%';
  return `${v < 1 || v > 99 ? v.toFixed(1) : Math.round(v)}%`;
};
export { pct as percent };

/* The line under the planet's name, as parts: { t } is text; { t, air } names a scenario the picture can be switched
   to. shown is the scenario drawn now (the default unless the visitor chose another). Plain sentences: what is
   drawn, then the other scenarios grouped by status, then who observed it, then the fit's probabilities whenever an
   allowed scenario has one. */
const DRAWN_AS = { bare: 'Drawn as bare rock', thin: 'Drawn with thin air', thick: 'Drawn with thick air' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const both = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export function airParts(sc, shown = sc.drawn) {
  const L = SCENARIO_LABEL, out = [];
  const lead = sc.list.find((x) => x.key === shown);
  out.push({ t: `${DRAWN_AS[shown]}${lead.status === 'observed' ? ', as observed' : ''}${shown !== sc.drawn ? `, by your choice; the survey draws ${L[sc.drawn]}` : ''}.` });
  for (const status of ['observed', 'allowed', 'excluded']) {
    const xs = sc.list.filter((x) => x.key !== shown && x.status === status);
    xs.forEach((x, i) => {
      out.push({ t: i === 0 ? ' ' : i === xs.length - 1 ? ' and ' : ', ' });
      const t = i === 0 ? cap(L[x.key]) : L[x.key];
      out.push(status === 'excluded' ? { t } : { t, air: x.key });
    });
    if (xs.length) out.push({ t: ` ${status}.` });
  }
  out.push({ t: sc.observed ? ` Observed by ${both(sc.observed.papers.map((k) => PAPERS[k].cite.replace(' et al.', '')))}.` : ' Not observed.' });
  const bare = sc.list[0], air = sc.list.filter((x) => x.key !== 'bare' && x.status === 'allowed');
  if (sc.fit && (bare.status === 'allowed' || air.length)) {
    const said = [];
    if (bare.status === 'allowed') said.push(`bare rock ${pct(bare.p)}`);
    if (air.length) said.push(`air ${pct(sc.fit.P)}${air.length === 1 ? `, of which only ${L[air[0].key]} is allowed` : ''}`);
    out.push({ t: ` The 2026 fit, extrapolated${sc.fit.outside ? ' past its sample' : ''}: ${said.join(', ')}.` });
  } else if (!sc.fit) out.push({ t: ' No fit: the flux or the luminosity is missing.' });
  return out;
}
export const airLine = (sc, shown) => airParts(sc, shown).map((x) => x.t).join('');
