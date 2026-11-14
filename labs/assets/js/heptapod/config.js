/* ============================================================
   heptapod/config.js — every constant of the script, the codec,
   the noise model and the page's examples. Nothing downstream
   hard-codes a number that lives here.
   ============================================================ */

/* ---- the semagram (units: one ring radius) ---- */
export const GEOM = {
  M: 360,                 // ring samples, one per degree, clockwise from the top
  A: 0.09,                // lobe amplitude: a +1 cell swells 9% of the radius outward
  CELLS: 6,               // cells per role sector
  ORDER: ['pred', 'mood', 'patient', 'neg', 'recipient', 'evid', 'agent', 'aspect'],
  ROLE_W: 54,             // natural width of a role sector, degrees (six cells of 9)
  FEAT_W: { empty: 34, mark: 46 }, // a slot that carries a mark needs more room than an empty one
  ROLE_K: 4, FEAT_K: 1,   // stiffness: the arc left over (or missing) goes mostly to the slots
  W0: 0.03,               // base stroke weight
  NIB: { angle: 35, min: 0.74, max: 1.3 }, // a broad nib held at 35 degrees: thick and thin by direction
  SUB_WEIGHT: 0.6,        // a nested ring's stroke scales as rho^0.6, heavier than its size alone
  PLURAL_W: 2.0,          // a plural entity doubles the weight of its sector
  SUB_RHO: 0.40,          // an embedded clause is a ring of 0.40 radius, nested at the centre
  TENDRIL_R: 1.42,        // the time tendril reaches this radius
  TIME_TIP: { past: -20, present: 0, future: 20 }, // tendril tip angle in degrees
  GAP_DEG: 14,            // negation cuts the ring over this arc
  SOCKET_SPLIT: 0.03,     // a clause-holding patient sector splits into two lines this far apart
  SOLVE: {
    beta: 2.2,            // bending stiffness (second-difference energy)
    mu: 0.004,            // weak pull of every sample toward the unit circle
    lobe: 1.0,            // weight of a cell's target
    plateau: 1,           // samples either side of a cell centre that carry the target
    free: 0.04,           // weak flat pull inside feature slots
  },
  SEQ: { kp: 0.11, kd: 0.52, look: 4 }, // the sequential pen: gain, damping, lookahead (samples)
};

/* ---- composite: two rings and a bridge (units: one ring radius) ---- */
export const COMPOSE = { d: 1.48, x0: 0.32, col: 0.2 };

/* ---- the codec raster the decoder reads ---- */
export const CODEC = {
  W: 1400, H: 840,
  R1: 270,                // single semagram: ring radius in px
  RC: 210,                // composite: each ring's radius in px
  INK: 0.5,               // threshold for "ink" when reading runs
};

/* ---- the ink-noise model, one knob sigma in [0, 1] ---- */
export const NOISE = {
  tremor: 0.030,          // smooth displacement field amplitude at sigma = 1 (ring radii)
  tremorWave: 0.22,       // its wavelength (ring radii)
  blots: 46,              // ink splats at sigma = 1
  blotR: [0.010, 0.040],  // splat radius range (ring radii), grows with sigma
  erosion: 120,           // erased holes at sigma = 1
  erosionR: [0.006, 0.024],
  salt: 0.030,            // probability a background pixel turns to ink at sigma = 1
  pepper: 0.14,           // probability an ink pixel drops out at sigma = 1
};

export const SWEEP = {
  levels: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  trials: 6,
};

/* ---- the page's examples ---- */
export const HERO = 'We did not understand that they were offering a gift.';

export const PRESETS = [
  'We did not understand that they were offering a gift.',
  'The visitors gave us a language.',
  'Did they give us a weapon?',
  'Apparently, the heptapods know the future.',
  'Give them the book.',
  'We can learn a language.',
  'The linguist has written a letter to the physicist.',
  'Reportedly, the ship will leave.',
  'They told us that the ship had arrived.',
];

export const COMPOSE_PRESETS = [
  { a: 'The visitors gave us a language.', rel: 'because', b: 'They knew the future.' },
  { a: 'We trusted them.', rel: 'despite', b: 'We feared the ship.' },
  { a: 'The child woke.', rel: 'after', b: 'The ship arrived.' },
  { a: 'We learned the language.', rel: 'before', b: 'The ship left.' },
];

/* ---- display timing (ms) ---- */
export const MOTION = { grow: 2600, seq: 4200, morph: 820 };
