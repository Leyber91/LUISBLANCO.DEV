/* ============================================================
   last-witness/config.js — constants, presets, sources and copy.
   Nothing here computes; engine files read from it.
   ============================================================ */

export const LAB = {
  id: 'last-witness',
  title: 'Time-Slip: The Last Witness',
  mindName: 'TALLY',
  // The figure the story was written for. It is never used as a result:
  // home's elapsed time is computed from the crossing (physics.js), and
  // the page compares the two out loud when they differ.
  storyYears: 10000,
  // The span of outside time the generated world is written for [ILLUSTRATIVE]:
  // below it no era has time to happen; above it the deep-time facts stop holding.
  spanYears: [2500, 100000],
  heartHz: 64 / 60,             // the pilot's resting heart, carried in the beacon [ILLUSTRATIVE]
  carrierHz: 8.42e9,            // deep-space X-band downlink, inside the 8400-8450 MHz allocation
  bitRate: 1000,                // beacon text channel, bit/s [ILLUSTRATIVE]
  bodyL: 2,                     // m, head to foot
  craftKg: 1e5,                 // 100 tonnes [ILLUSTRATIVE]
  maxShipYears: 50,             // longer than this and the pilot does not live to return [ILLUSTRATIVE]
  worldEnergyJ: 6.2e20,         // J/yr, world primary energy 2023 (Energy Institute 2024)
  sunJperYear: 3.828e26 * 365.25 * 86400, // IAU 2015 nominal solar luminosity times a year
  earthMassKg: 5.972e24,
  defaultMessage: 'Tell them the sky down here is full of light. I will be home before the tea goes cold.',
};

/* Tolerance bands. The page labels these [ILLUSTRATIVE]: there is no
   human data for sustained loads above about 1 g over months. */
export const BODY = {
  accel: [                      // sustained proper acceleration, in g
    { max: 1.25, verdict: 'ok', text: 'like standing on a planet' },
    { max: 3, verdict: 'risk', text: 'no person has lived under this for months' },
    { max: Infinity, verdict: 'lethal', text: 'lethal over hours' },
  ],
  tidal: [                      // head-to-foot stretch, in g
    { max: 0.1, verdict: 'ok', text: 'below what you can feel' },
    { max: 1, verdict: 'risk', text: 'a pull you feel in every joint' },
    { max: Infinity, verdict: 'lethal', text: 'it pulls a body apart' },
  ],
};

/* The planner's three crossings and their slider ranges. */
export const MODES = {
  orbit: {
    label: 'Orbit',
    blurb: 'Fall into the last stable circular orbit of a spinning hole and let it carry you.',
    params: {
      logM: { label: 'mass', min: 1, max: 10.5, step: 0.001, value: Math.log10(4.0e6), unit: 'Msun' },
      logDelta: { label: 'spin', min: -26, max: 0, step: 0.1, value: -20, unit: '1 - a*' },
      logStay: { label: 'stay', min: 2, max: 9.19, step: 0.01, value: 4.67, unit: 'log10 s, your clock' },
    },
  },
  hover: {
    label: 'Hover',
    blurb: 'Hold station above the horizon on your engines and let the well slow you.',
    params: {
      logM: { label: 'mass', min: 1, max: 10.5, step: 0.001, value: Math.log10(6.5e9), unit: 'Msun' },
      logF: { label: 'height', min: -6, max: 1, step: 0.05, value: -3, unit: 'r/rs - 1' },
      logStay: { label: 'stay', min: 2, max: 9.19, step: 0.01, value: 4.67, unit: 'log10 s, your clock' },
    },
  },
  flight: {
    label: 'Flight',
    blurb: 'Accelerate away, turn, and come back. Nothing to fall into; everything to burn.',
    params: {
      aG: { label: 'thrust', min: 0.5, max: 3, step: 0.05, value: 1, unit: 'g' },
      shipY: { label: 'time aboard', min: 1, max: 50, step: 0.1, value: 33.1, unit: 'years, your clock' },
    },
  },
};

/* Real holes on the mass slider, each with its measured mass and source. */
export const HOLES = [
  { id: 'cygx1', name: 'Cygnus X-1', mSun: 21.2, distLy: 7240, src: 'Miller-Jones et al. 2021, Science 371, 1046 (21.2 Msun, 2.22 kpc)' },
  { id: 'sgra', name: 'Sgr A*', mSun: 4.0e6, distLy: 26670, src: 'EHT Collaboration 2022, ApJL 930, L12 (mass); GRAVITY Collaboration 2019, A&A 625, L10 (8.178 kpc)' },
  { id: 'm87', name: 'M87*', mSun: 6.5e9, distLy: 5.48e7, src: 'EHT Collaboration 2019, ApJL 875, L1 (6.5e9 Msun, 16.8 Mpc)' },
];
export const MASS_MARKS = HOLES.map((h) => ({ logM: Math.log10(h.mSun), label: h.name, hole: h }));

/* Constants, each with its source. physics.js uses the same values. */
export const CONSTANTS = [
  { k: 'c', v: '299 792 458 m/s', src: 'SI definition (exact)' },
  { k: 'GM_sun', v: '1.32712440018e20 m³/s²', src: 'IAU 2015 Resolution B3, nominal' },
  { k: 'G', v: '6.67430e-11 m³/(kg s²)', src: 'CODATA 2018 (shown for reference; GM_sun is used directly)' },
  { k: 'g', v: '9.80665 m/s²', src: '3rd CGPM 1901, standard gravity (exact)' },
  { k: 'year', v: '365.25 d', src: 'Julian year, IAU' },
  { k: 'L_sun', v: '3.828e26 W', src: 'IAU 2015 Resolution B3, nominal' },
  { k: 'half-lives', v: 'C-14 5,730 yr; Pu-239 24,110 yr; Cs-137 30.08 yr', src: 'NNDC chart of nuclides' },
  { k: 'precession', v: '25,772 yr', src: "Earth's axial precession period, applied to home [illustrative]" },
  { k: "Barnard's star", v: '10.39 arcsec/yr', src: 'Gaia DR3 proper motion' },
];

/* The voices and their prose rules. test.mjs lints every story string
   against TALLY's; the narration rules bind the endings and captions. */
export const VOICES = {
  tally: { face: 'IBM Plex Mono 400, text-bright, 13 px', tense: 'past for what happened, present for what is',
    maxSentenceWords: 48, banned: ['as an ai', 'language model', '!', '\u2014', '\u2013', 'suddenly', 'amazing', 'incredible'] },
  narration: { face: 'IBM Plex Mono 400, text, 13.5 px, endings and captions', tense: 'second person, present',
    maxSentenceWords: 52, banned: ['!', '\u2014', '\u2013', 'suddenly'] },
  visitor: { face: 'IBM Plex Mono 400, text-dim, ruled left', tense: 'free', maxSentenceWords: Infinity, banned: [] },
};

/* TALLY's character. The engine and the model prompt both read this. */
export const PROFILE = {
  wants: 'to tell one person, in order, what the pulse was',
  fears: 'that the truth will make you hate the people who forgot you, or hate it for what it chose',
  hides: ['that it stopped telling them the pulse was you', 'what became of the people', 'the answer it sent you', 'why it is still awake'],
  speech: ['plain, exact sentences', 'numbers carry their units', 'no exclamation marks, no emoji, no dashes', 'it counts things when it is moved'],
  behaviours: {
    deflect: 'asked a locked thing, it gives the nearest true thing it may say',
    refuse: 'it says not yet, and says that something is withheld',
    confess: 'caught in a protective lie, or when the truth comes due, it admits it',
  },
  lies: ['early, it says it never answered you', 'early, it says the people always knew the pulse was you'],
};

/* What the page corrects, each tagged. */
export const MISCONCEPTIONS = [
  ['You cross the horizon and come back.', 'No path leaves the inside of a horizon. Every crossing here stays outside it: an orbit, a hover or a flight [real].'],
  ['Your clock stops near a black hole.', 'It never stops for you. Your clock ticks at one second per second; only the comparison with home diverges [real].'],
  ['A black hole sucks things in.', 'Far from the horizon an orbit around it is as stable as an orbit around a star of the same mass [real].'],
  ['The singularity is a door.', 'Nothing here goes near a singularity. The time-slip is made entirely outside the horizon [real].'],
  ['Time dilation is an illusion of signals.', 'Both clocks are right. The traveller is younger on return; the GPS check below measures the same effect every day [real].'],
  ['Any black hole would do.', 'A stellar-mass hole tears a body apart at the last stable orbit; it takes a hole of about a million suns to survive the tides [real].'],
];

/* Spin landmarks. */
export const SPIN_MARKS = [
  { logDelta: Math.log10(0.002), label: 'a* = 0.998, the accretion limit' },
];

export const SOURCES = [
  { id: 'bpt', cite: 'Bardeen, Press & Teukolsky 1972, ApJ 178, 347', use: 'Kerr circular orbits: u^t, E, L, the innermost stable orbit' },
  { id: 'thorne', cite: 'Thorne 1974, ApJ 191, 507', use: 'accretion spins a hole up to a* = 0.998 and no further' },
  { id: 'hartle', cite: 'Hartle 2003, Gravity, Addison-Wesley, ch. 9', use: 'Schwarzschild time dilation, static observers, circular orbits' },
  { id: 'mtw', cite: 'Misner, Thorne & Wheeler 1973, Gravitation, W. H. Freeman, §6.2', use: 'uniformly accelerated (hyperbolic) motion' },
  { id: 'ashby', cite: 'Ashby 2003, Living Rev. Relativity 6, 1', use: 'GPS clock offset, the reference check' },
  { id: 'eht19', cite: 'EHT Collaboration 2019, ApJL 875, L1', use: 'M87* mass 6.5e9 Msun' },
  { id: 'eht22', cite: 'EHT Collaboration 2022, ApJL 930, L12', use: 'Sgr A* mass 4.0e6 Msun' },
  { id: 'iau', cite: 'IAU 2015 Resolution B3', use: 'nominal GM_sun and solar luminosity' },
  { id: 'ei', cite: 'Energy Institute 2024, Statistical Review of World Energy', use: 'world primary energy, about 620 EJ in 2023' },
];

/* Disclosure thresholds on trust (0..1). */
export const DISCLOSE = [0, 0.3, 0.45, 0.6, 0.78];

/* What the visitor must ASK to open each tier above surface. Tier i opens
   only when trust reaches DISCLOSE[i] AND the visitor has asked a question
   on gate i's topics, and on every gate below it. Statements build trust;
   they never open a tier. The intents are mind.js classifier names. */
export const ASK_GATES = [
  { tier: 1, about: 'TALLY', intents: ['who', 'about_mind'] },
  { tier: 2, about: 'the pulse', intents: ['pulse', 'beats', 'called', 'told', 'happened', 'message'] },
  { tier: 3, about: 'the people', intents: ['people', 'feature', 'told'] },
  { tier: 4, about: 'why TALLY is still awake', intents: ['why_awake', 'secret', 'answer'] },
];

/* Fate weights by crossing. The pulse's shape changes how it was read. */
export const FATE_WEIGHTS = {
  orbit: { hush: 0.26, going: 0.26, slowing: 0.3, thinning: 0.18 },
  hover: { hush: 0.3, going: 0.2, slowing: 0.3, thinning: 0.2 },
  flight: { hush: 0.4, going: 0, slowing: 0.25, thinning: 0.35 },
};

/* Syllables for the descendants' word for the pulse. Chosen to stay
   clear of the saga's own invented languages. */
export const PHON = {
  onset: ['m', 'n', 's', 't', 'l', 'd', 'b', 'p', 'h', 'r', ''],
  vowel: ['a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ei'],
  coda: ['', '', 'n', 'm', 'l', 's'],
  banned: ['kha', 'ren', 'kel', 'vael', 'ash', 'thun', 'vosh', 'sera', 'nash', 'kael', 'esh', 'lum', 'val'],
};

export const LAST_NAMES = ['Ines', 'Oda', 'Maren', 'Tavi', 'Selo', 'Ruth', 'Pell', 'Anu', 'Dov', 'Lio', 'Imre', 'Sabe'];
