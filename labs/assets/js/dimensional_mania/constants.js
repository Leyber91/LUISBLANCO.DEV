/* ============================================================
   dimensional_mania/constants.js — configuration and data for the
   Dimensions instrument. Tuning, palette, the motion presets, the
   guided ladder, the fallback knowledge and the sources all live here;
   the engine (linalg, polytopes, slice, project) and the views read it.
   A new preset, tour step or answer topic is a row here.
   ============================================================ */

export const AXES = ['X', 'Y', 'Z', 'W', 'V', 'U', 'T', 'S', 'R', 'Q'];

export const CONFIG = {
  minDim: 1,
  maxDim: 10,
  start: { n: 4, obj: 'cube', view: 'both', proj: 'persp', preset: 'double', plane: [0, 3], sweep: true, trails: true },
  foldDistance: 2.4,      // D in the perspective cascade x -> x·D/(D - w), circumradius 1
  foldRange: [1.35, 6],
  speed: 1,
  ignitionPerAxis: 0.62,  // seconds per axis of the opening extrusion
  fitRadius: 2.35,        // world radius the projected object is scaled to
  sweepPeriod: 11,        // seconds for one pass of the slicing hyperplane
  orthoFrom: 6,           // perspective is offered but ortho is the default from here up
  trailArc: 2.4,          // radians of the fastest spin a trail shows
  trailSamples: 56,
  profileSamples: 121,
  profileChunk: 18,       // profile samples computed per frame
  narrateEvery: 450,      // ms between witness updates
  ambientHold: 7000,      // ms an ambient witness line stays
  eventHold: 6500,        // ms an event line holds priority
};

/* performance tiers; auto picks one from the device, then from frame time */
export const TIERS = {
  full: { label: 'full', bloom: true, pixelRatio: 1.5, trailVerts: 128, arcSub: 10, profileChunk: 18 },
  lean: { label: 'lean', bloom: false, pixelRatio: 1.5, trailVerts: 128, arcSub: 8, profileChunk: 14 },
  lite: { label: 'lite', bloom: false, pixelRatio: 1.25, trailVerts: 40, arcSub: 5, profileChunk: 9 },
  min: { label: 'min', bloom: false, pixelRatio: 1, trailVerts: 0, arcSub: 4, profileChunk: 6 },
};
/* auto steps down one tier at a time: bloom first, then trails, then resolution */
export const TIER_ORDER = ['full', 'lean', 'lite', 'min'];

/* render thresholds, opacities and clamps (nothing below hard-codes them) */
export const RENDER = {
  perspClamp: 0.3,        // smallest perspective denominator D - w
  stereoMin: 0.035,       // smallest stereographic denominator 1 - w
  stereoClip: 14,         // projected radius past which an arc is dropped
  stereoFade: 1.15,       // arcs fade as (fade/r)^2 beyond this many framing radii
  stereoClipFit: 2.2,     // and are dropped beyond this many framing radii
  lineOpacity: 0.95,
  lineOpacityHigh: 0.5,   // from highDim up the wireframe drops to half opacity
  highDim: 7,
  bothDim: 0.42,          // shadow brightness when the cut is drawn inside it
  flowDim: 0.55,          // shadow brightness under the Hopf flow
  trailFade: 1.5,         // trail brightness falls as (1 - age)^trailFade
  sliceFaceOpacity: 0.085,
  bloom: [0.62, 0.45, 0.2], // strength, radius, threshold
  coincide: 0.012,        // two vertices closer than this (in framing radii) land on one point
  pickPx: 16,             // click radius for picking a vertex
};
export const TIER_FPS = 45;     // below this over a 2 s window, auto steps down

/**
 * The auto tier decision, pure so it can be tested: after the first 2 s, and
 * at most once per 2 s, a mean frame rate under TIER_FPS steps down one tier.
 * @returns {string|null} the tier to switch to, or null to stay
 */
export function nextTier(choice, current, fps, nowMs, lastStepMs) {
  if (choice !== 'auto' || !(fps > 0) || nowMs < 2000 || nowMs - (lastStepMs || 0) < 2000 || fps >= TIER_FPS) return null;
  const i = TIER_ORDER.indexOf(current);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
}

/* palette, rgb 0..1, kept in step with tokens.css */
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const PALETTE = {
  void: '#06080D',
  far: hex('#3A4254'),    // ink, deep along the hidden axis
  mid: hex('#9FB3D6'),    // --horizon
  near: hex('#EAF0FB'),   // --text-bright
  gold: hex('#D4A24C'),   // --accretion
  goldSoft: hex('#F0C674'),
  goldDim: hex('#97681F'),
  css: { text: '#C5CCD8', dim: '#79828F', faint: '#424B57', bright: '#EAF0FB', horizon: '#9FB3D6', hdim: '#565D72', line: '#1C232F', lineB: '#2C3744', gold: '#D4A24C', goldSoft: '#F0C674', goldDim: '#97681F', void: '#06080D' },
};

export const VIEWS = [
  { id: 'shadow', label: 'shadow', low: 'object' },
  { id: 'both', label: 'shadow + slice', low: 'object + slice' },
  { id: 'slice', label: 'slice', low: 'slice' },
];
export const PROJECTIONS = [
  { id: 'persp', label: 'perspective' },
  { id: 'ortho', label: 'orthographic' },
  { id: 'stereo', label: 'stereographic', only4: true },
];

/* the plane disjoint from (i, j) with the smallest indices, or null */
export function disjointPlane(n, [i, j]) {
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (a !== i && a !== j && b !== i && b !== j) return [a, b];
  }
  return null;
}

const GOLDEN = 0.6180339887;

/**
 * Motion presets: each returns the spinning planes as {i, j, omega} (rad/s
 * at speed 1). The speeds are chosen for legibility [ILLUSTRATIVE].
 */
export const PRESETS = {
  hold: { label: 'hold', build: () => [] },
  single: { label: 'single', build: (n, p) => (n >= 2 ? [{ i: p[0], j: p[1], omega: 0.42 }] : []) },
  double: {
    label: 'double',
    build: (n, p) => {
      const d = disjointPlane(n, p);
      return d ? [{ i: p[0], j: p[1], omega: 0.42 }, { i: d[0], j: d[1], omega: 0.42 * GOLDEN }] : [{ i: p[0], j: p[1], omega: 0.42 }];
    },
  },
  iso: {
    label: 'isoclinic',
    // all floor(n/2) mutually disjoint planes at one speed: the chosen plane, then disjoint pairs of the rest
    build: (n, p) => {
      const used = new Set(p), out = [{ i: p[0], j: p[1], omega: 0.36 }];
      const free = Array.from({ length: n }, (_, k) => k).filter((k) => !used.has(k));
      for (let k = 0; k + 1 < free.length; k += 2) out.push({ i: free[k], j: free[k + 1], omega: 0.36 });
      return out;
    },
  },
  all: {
    label: 'all planes',
    build: (n) => {
      const out = [];
      let k = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const hidden = j >= 3;
        const spread = 0.55 + 0.45 * (((k + 1) * GOLDEN) % 1);
        out.push({ i, j, omega: (hidden ? 0.34 : 0.1) * spread });
        k++;
      }
      return out;
    },
  },
};
PRESETS.fibre = {
  label: 'hopf flow',
  only4: true,
  // no coordinate planes: the motion is left multiplication by e^(t u), built by the app from polytopes.fibration()
  build: () => [],
};
export const FLOW_OMEGA = 0.3;
export const PRESET_ORDER = ['hold', 'single', 'double', 'iso', 'all', 'fibre'];

/* what each control does, mathematically: the explain drawer and every title */
export const EXPLAIN = [
  ['dims', 'dimension', 'The object lives in R^n; the screen shows three of its axes and the rest are hidden.'],
  ['objs', 'object', 'Its vertices come from a construction; its edges are the vertex pairs at the shortest distance.'],
  ['dual', 'dual', 'The polytope whose vertices sit at the centres of this one’s facets; its f-vector is this one’s reversed.'],
  ['views', 'view', 'Shadow projects R^n to R^3. Slice keeps the points with x_(n−1) = h. Both draws the slice inside the shadow.'],
  ['projs', 'projection', 'Perspective scales each point by s = D/(D − w), axis by axis; orthographic drops the hidden axes; stereographic maps the 3-sphere from its pole, s = 1/(1 − w).'],
  ['fold', 'fold D', 'The distance of the projection centre along each hidden axis. Smaller D, stronger distortion.'],
  ['zoom', 'zoom', 'The camera distance in our three dimensions. It changes nothing in R^n.'],
  ['presets', 'motion', 'Which planes turn and how fast. Isoclinic: two perpendicular planes at equal speed. Hopf flow: left multiplication by a unit quaternion, which carries every vertex along one Hopf circle.'],
  ['planes', 'planes', 'Every pair of axes spans a plane, n(n−1)/2 in all. The gold square is the plane the dial turns.'],
  ['dial', 'dial', 'Turns the chosen plane of world space: R ← G(θ)·R.'],
  ['pad', 'pad', 'Turns X–W left and right and Y–W up and down, two hidden planes at once.'],
  ['matrix', 'matrix', 'R: column k says where the object’s axis k now points. The screen sees the rows above the dashed line. A is the generator of the motion, an element of so(n).'],
  ['speed', 'speed', 'Multiplies every angular speed.'],
  ['hslide', 'height', 'h, the position of the cutting hyperplane x_(n−1) = h.'],
  ['sweep', 'sweep', 'Moves h through the object and back.'],
  ['cuts', 'cut presets', 'Turns the object so a vertex, an edge, a face or a cell points along the last axis, then cuts across that direction.'],
  ['insetModes', 'second view', 'The same moment one dimension down, or the Schlegel diagram: the polytope projected from just outside the picked facet onto it.'],
];

/** the opening pose per dimension: a few small turns so no edge hides behind another */
export const SEED_TURNS = {
  2: [[0, 1, 0.32]],
  3: [[0, 2, 0.62], [1, 2, 0.44], [0, 1, 0.2]],
  4: [[0, 3, 0.52], [1, 2, 0.31], [1, 3, 0.27], [0, 1, 0.18], [2, 3, 0.12]],
  high: [[0, 3, 0.5], [1, 4, 0.37], [2, 3, 0.22], [0, 1, 0.16], [1, 2, 0.28]],
};

/* ---------------- the guided ladder ----------------
   Each step sets a state (only the keys it names) and says one thing.
   pose: 'seed' | 'identity' | { align: [..] } (that direction onto the last axis) */
export const TOUR = [
  {
    title: '1D · a segment',
    state: { n: 1, obj: 'cube', view: 'shadow', proj: 'persp', preset: 'hold', pose: 'identity', sweep: false, trails: false },
    text: 'Start with a point and drag it one unit. Its path is a segment: 2 vertices, 1 edge. Each rung of this ladder repeats that move along a new axis at right angles to every axis before it.',
  },
  {
    title: '2D · a square',
    state: { n: 2, obj: 'cube', view: 'shadow', preset: 'single', plane: [0, 1], pose: 'seed', sweep: false, trails: false },
    text: 'Drag the segment sideways. Its two ends trace two new edges, so the vertices double to 4 and the edges become 2 × 1 + 2 = 4. The rule edges(n) = 2 · edges(n − 1) + vertices(n − 1) holds on every rung that follows.',
  },
  {
    title: '3D · a cube',
    state: { n: 3, obj: 'cube', view: 'shadow', preset: 'single', plane: [0, 2], pose: 'seed', sweep: false, trails: true },
    text: 'Drag the square along Z: 8 vertices, 12 edges, 6 faces. This is the last object a hand can hold. From the next rung on, the screen can show only its shadow.',
  },
  {
    title: 'Flatland',
    state: { n: 3, obj: 'cube', view: 'both', preset: 'hold', pose: { align: [1, 1, 1] }, sweep: true, trails: false },
    text: 'A creature living in the plane Z = h sees only the cut. Corner first, the cube arrives as a point, grows into a triangle, becomes a hexagon at the middle and shrinks back. The area curve is measured from the cut and checked against a closed formula (Abbott 1884 told this story in prose).',
  },
  {
    title: '4D · the shadow',
    state: { n: 4, obj: 'cube', view: 'shadow', proj: 'persp', preset: 'hold', pose: 'identity', sweep: false, trails: false },
    text: 'Drag the cube along W, the axis you cannot point at. The copy farther along W is drawn smaller by perspective, so the shadow shows a cube inside a cube. Both copies are the same size. The shadow does not keep sizes.',
  },
  {
    title: 'Turning through W',
    state: { n: 4, obj: 'cube', view: 'shadow', proj: 'persp', preset: 'single', plane: [0, 3], pose: 'identity', trails: true },
    text: 'Turn the X–W plane. The inner cube swells and the outer one shrinks until they trade places. No cube turns inside out; only the shadow does. The shadow ledger shows W bending the picture.',
  },
  {
    title: 'Our space as Flatland',
    state: { n: 4, obj: 'cube', view: 'both', proj: 'persp', preset: 'hold', pose: 'identity', sweep: true, trails: false },
    text: 'Push the tesseract through our space cell first. A cube appears, stays the same cube and vanishes, so the volume curve is flat. Every point of the cut sits at one depth in W, so the shadow draws it at a single scale: its proportions are true.',
  },
  {
    title: 'Corner first',
    state: { n: 4, obj: 'cube', view: 'both', proj: 'persp', preset: 'hold', pose: { align: [1, 1, 1, 1] }, sweep: true, trails: false },
    text: 'Now corner first. The cut is born as a point and grows into a tetrahedron. Its corners are then cut off, it passes through an octahedron at the centre, and it reverses. Each name comes from counting the cut’s vertices, edges and faces as they change.',
  },
  {
    title: 'Two planes at once',
    state: { n: 4, obj: 'cube', view: 'shadow', proj: 'stereo', preset: 'iso', plane: [0, 3], pose: 'seed', sweep: false, trails: true },
    text: 'In four dimensions two perpendicular planes can turn at once. At equal speeds every corner travels a great circle of the 3-sphere, and any two of those circles link once: the Hopf fibration (Hopf 1931). The linking number is computed from the gold paths.',
  },
  {
    title: 'Six regular polytopes',
    state: { n: 4, obj: 'c120', view: 'shadow', proj: 'stereo', preset: 'single', plane: [0, 3], pose: 'identity', sweep: false, trails: false },
    text: 'Four dimensions hold six regular polytopes. This is the 120-cell under stereographic projection: 600 vertices, 1200 edges, 720 pentagons and 120 dodecahedra, each counted on this page from coordinates.',
  },
  {
    title: 'Above four',
    state: { n: 7, obj: 'cube', view: 'shadow', proj: 'ortho', preset: 'all', pose: 'seed', sweep: false, trails: false },
    text: 'From five dimensions up only three regular polytopes remain: the simplex, the cube and the cross-polytope (Schläfli 1852). The 7-cube has 128 corners, and one 3D shadow cannot keep them apart. Read the counts and the ledger instead. The ladder ends here.',
  },
];

/* ---------------- sources (shown in the footer and the plate) ---------------- */
export const SOURCES = [
  { key: 'coxeter', text: 'H. S. M. Coxeter, Regular Polytopes, 3rd ed., Dover, 1973: coordinates and the f-vectors of Table I' },
  { key: 'schlafli', text: 'L. Schläfli, Theorie der vielfachen Kontinuität, written 1852, published 1901: the classification of regular polytopes' },
  { key: 'poincare', text: 'H. Poincaré, Sur la généralisation d’un théorème d’Euler relatif aux polyèdres, Comptes rendus 117, 1893: the Euler-Poincaré relation' },
  { key: 'hopf', text: 'H. Hopf, Über die Abbildungen der dreidimensionalen Sphäre auf die Kugelfläche, Mathematische Annalen 104, 1931' },
  { key: 'irwin', text: 'J. O. Irwin and P. Hall, Biometrika 19, 1927: the density of a sum of uniform variables, used for the cube’s closed-form sections' },
  { key: 'abbott', text: 'E. A. Abbott, Flatland: A Romance of Many Dimensions, 1884' },
  { key: 'banchoff', text: 'T. F. Banchoff, Beyond the Third Dimension, Scientific American Library, 1990: slicing and stereographic pictures of 4D objects' },
];

/* the f-vector rank names */
export const RANK = ['vertices', 'edges', 'faces', 'cells', '4-faces', '5-faces', '6-faces', '7-faces', '8-faces', '9-faces'];
export const HOW = {
  built: 'from the construction',
  measured: 'measured from coordinates',
  enumerated: 'enumerated from the definition',
  formula: 'closed formula (Coxeter 1973)',
};
