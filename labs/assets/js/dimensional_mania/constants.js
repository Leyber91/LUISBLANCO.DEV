/* ============================================================
   dimensional_mania/constants.js — the single home for every
   reusable constant of the Dimensions (WITNESS) instrument.
   Nothing downstream hard-codes a selector, a colour, a magic
   number or a label: it lives here, so the instrument is tuned
   in ONE place. Pure geometry (vertex/edge/projection maths)
   stays in n_dimensional_cube.js; this file is behaviour +
   theme + tuning + DOM contract.

   Mirrors the hub/constants.js idiom: maps over branches, so a
   higher dimension, a new projection or a new rotation preset is
   DATA added here, not a new code path.
   ============================================================ */

/* ---- DOM selectors (ids/classes in md_animation_page.html) ---- */
export const SEL = {
  canvas:   '#dx-canvas',
  loading:  '#dx-loading',
  ledger:   '#dx-ledger',
  controls: '#dx-controls',
  title:    '.dx-title',
  caption:  '.dx-caption',
};

/* ---- query-param flags ---- */
export const PARAMS = {
  still:  'still',   // ?still  — freeze to one composed frame (screenshots)
  motion: 'motion',  // ?motion — force full motion even under reduce
  dim:    'd',       // ?d=4    — deep-link a starting dimension
};

/* ---- master instrument tuning ---- */
export const CONFIG = {
  startDim: 4,
  minDim: 1,
  maxDim: 10,
  speed: 0.6,        // master multiplier over per-plane omega
  projDistance: 3.2, // perspective fold distance
  size: 1.5,         // object scale
  orthoFrom: 6,      // auto-orthographic at/above this dimension (legibility wall)
};

/* ---- per-plane angular-velocity model (preserved exactly from the
   original inline _buildPlanes; hidden planes carry the 4D+ motion).
   spread uses the golden ratio so "All" tumbles richly, not in lockstep. ---- */
export const PLANE = {
  omegaHidden: 0.42,
  omegaVisible: 0.12,
  spreadBase: 0.55,
  spreadRange: 0.45,
  golden: 0.6180339887,
  hiddenFrom: 3,     // axis index at/above which an axis is "hidden" (W onward)
};

/* ---- opening pose seeds so the first frame / ?still reads as a real
   folded tesseract rather than an axis-aligned shadow ---- */
export const SEED = {
  selectedAngle: 0.62,
  disjointAngle: 0.33,
};

/* ---- isoclinic ("mania") layer: equal-speed disjoint planes -> Hopf circles ---- */
export const ISO = { omega: 0.4 };

/* ---- vertex-trail (Hopf-fibre trace) tuning ---- */
export const TRAIL = {
  length: 130,            // samples kept per vertex
  maxVerts: 64,           // trails legible/cheap up to this vertex count (~6D)
  legibleDim: 5,          // default-on at/below this dimension
  seedDt: 1 / 60,         // back-fill timestep (matches a 60fps history)
  opacity: 0.6,
  // trail colour: luminous warm-white motion-light, distinct from the
  // duotone structural edges and amplified by the bloom
  colour: { r: 1.0, g: 0.9, b: 0.72 },
  ageFloor: 0.14,         // oldest tip stays faintly lit so the comet tail reads
};

/* ---- WebGL renderer / camera / post tuning ---- */
export const RENDER = {
  pixelRatioMax: 1.5,
  background: '#080A0C',
  camera: { fov: 55, near: 0.1, far: 100, pos: [4.2, 3.0, 8.5] },
  controls: {
    dampingFactor: 0.08,
    rotateSpeed: 0.7,
    minDistance: 4,
    maxDistance: 24,
  },
  // UnrealBloomPass — restrained: only the brightest edge crossings glow.
  // Bloom is a static look, not motion, so it stays on under reduced motion.
  bloom: { strength: 0.95, radius: 0.55, threshold: 0.16 },
  // wireframe opacity: full normally, faint past the legibility wall
  lineOpacity: { normal: 0.92, faint: 0.5 },
  pointSize: 0.05,
};

/* ---- render-loop tuning ---- */
export const LOOP = {
  maxDt: 0.05,            // clamp per-frame dt so a tab-switch can't jump the spin
  unfoldEase: 0.12,       // morph time-constant for hidden axes rising in
  unfoldSnap: 0.002,      // snap-to-target threshold
  readoutEvery: 2,        // throttle instrument readouts to every Nth frame
};

/* ---- Shadow Ledger tuning ---- */
export const LEDGER = {
  fromAxis: 3,            // first hidden axis tracked
  maxRows: 6,             // cap bars so 8D+ doesn't reproduce the noise it cures
  strongFold: 1.4,        // stress value mapped to a full bar
  hotThreshold: 0.02,     // minimum stress to flag the hottest axis
};

/* ---- count-up tween (the felt-dimensionality beat) ---- */
export const TWEEN = { duration: 340 };

/* ---- loading veil fade-out delay (ms) ---- */
export const VEIL = { removeDelay: 650 };

/* ============================================================
   palette pulled from the design tokens (rgb 0..1). Canvas/WebGL
   can't read CSS vars cheaply, so the warm/cold language is
   defined once here, kept in sync with tokens.css.
   ============================================================ */
export const hexRGB = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

export const WIRE = {
  cold: hexRGB('#5BB0D6'), // horizon — vertex sits in our 3-space
  warm: hexRGB('#F2A93B'), // accretion — vertex pushed deep into a hidden axis
};

/* ============================================================
   control-flow data tables — add a row, not a branch.
   ============================================================ */

/* per-dimension gloss (the one honest line). Dimensions past the
   highest explicit key fall through to the wall line via glossFor(). */
export const GLOSS = {
  1: 'a segment — two points, one edge.',
  2: 'a square — a segment dragged sideways.',
  3: 'a cube — a square dragged into depth.',
  4: 'a tesseract — a cube dragged through an axis you cannot point at.',
  5: 'a penteract — perspective still holds, barely.',
  6: 'past here one 3D shadow cannot separate the corners. read the rule, not the shape.',
};
export const glossFor = (n) => GLOSS[n] || GLOSS[6];

/* projection modes — id -> { label, ortho(dim) }. isOrtho is a pure
   lookup: a new mode is a row here, never a new if-branch. */
export const PROJECTION = {
  auto:         { label: 'Auto',     ortho: (dim) => dim >= CONFIG.orthoFrom },
  perspective:  { label: 'Perspect', ortho: () => false },
  orthographic: { label: 'Ortho',    ortho: () => true },
};
export const PROJECTION_ORDER = ['auto', 'perspective', 'orthographic'];
export const DEFAULT_PROJ_MODE = 'auto';

/* rotation presets — id -> { label, build(planeSet) }. build mutates the
   spinning/iso sets; adding a preset is one row, no switch chain. */
export const PRESET_ORDER = ['still', 'single', 'double', 'iso', 'all'];
export const PRESETS = {
  still: {
    label: 'Hold',
    build: () => { /* hold everything where it is */ },
  },
  single: {
    label: 'Single',
    build: (ps) => { if (ps.selectedPlane()) ps.spin(ps.selected); },
  },
  double: {
    label: 'Double',
    build: (ps) => {
      const sel = ps.selectedPlane();
      if (!sel) return;
      ps.spin(sel.id);
      // a plane disjoint from the selected one -> a true double rotation
      const disjoint = ps.disjointOf(sel);
      if (disjoint) ps.spin(disjoint.id);
    },
  },
  iso: {
    label: 'Iso',
    // two disjoint planes locked to EQUAL speed -> isoclinic rotation:
    // every vertex rides a great circle, the turn with no 3D analogue
    build: (ps) => {
      const sel = ps.selectedPlane();
      if (!sel) return;
      ps.spin(sel.id, true);
      const disjoint = ps.disjointOf(sel);
      if (disjoint) ps.spin(disjoint.id, true);
    },
  },
  all: {
    label: 'All',
    build: (ps) => {
      ps.planes.forEach((p) => { if (p.hidden) ps.spin(p.id); });
      const spatial = ps.planes.find((p) => !p.hidden);
      if (spatial) ps.spin(spatial.id);
      if (!ps.spinning.size && ps.selectedPlane()) ps.spin(ps.selected);
    },
  },
};
export const DEFAULT_PRESET = 'single';

/* console slider specs — key -> tuning. A new slider is a row here. */
export const SLIDERS = {
  dist:  { label: 'Fold distance', min: 2.2, max: 6, step: 0.05 },
  speed: { label: 'Speed',         min: 0,   max: 2, step: 0.01 },
  size:  { label: 'Scale',         min: 0.5, max: 3, step: 0.01 },
};

/* dial scrub range (degrees) */
export const DIAL = { scrubMin: -180, scrubMax: 180, scrubStep: 1 };
