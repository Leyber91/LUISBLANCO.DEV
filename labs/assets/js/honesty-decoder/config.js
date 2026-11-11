/* ============================================================
   honesty-decoder/config.js — constants of the decoder.

   Nothing here is a grade. Verdict values, basis labels, the
   formula text, the type vocabulary and the published values the
   reference checks compare against all live here, so the engine
   and the view read one source.
   ============================================================ */

export const SCHEMA_VERSION = '1.0';
export const METHOD_VERSION = '1.0';
export const METHOD_DATE = '2026-11-11';

/* A verdict's value in the figure. Unverified has no value: it is kept
   out of the point figure and spans the whole interval. */
export const VERDICTS = {
  supported:   { value: 1,   label: 'supported',   rule: 'the code does what the phrase says, read literally' },
  partial:     { value: 0.5, label: 'partial',     rule: 'the code does a weaker, narrower or conditional version' },
  unsupported: { value: 0,   label: 'unsupported', rule: 'the code does not do it, or does the opposite' },
  unverified:  { value: null, label: 'unverified', rule: 'no check backs it: an author assertion, or a check that failed or could not run' },
};

/* What a verdict rests on. Author assertions never enter the figure. */
export const BASES = {
  reference:  { label: 'reference', long: 'measurement against a published value', checked: true },
  state:      { label: 'lab state', long: 'runtime check: the lab loaded in a hidden frame, a value read from it', checked: true },
  route:      { label: 'route', long: 'runtime check: model calls per run against what the answering route allows', checked: true },
  code:       { label: 'code', long: 'runtime check: the cited lines fetched from the deployed file', checked: true },
  self:       { label: 'self', long: 'runtime check: the decoder measures its own state', checked: true },
  inspection: { label: 'inspection', long: 'code inspection: a file the site does not serve, verified by the repository test', checked: true },
  author:     { label: 'author', long: 'author assertion: nothing on this page can check it', checked: false },
};

/* Sub-claim types. Framing is never scored. */
export const TYPES = {
  capability: 'what the visitor or the system can do',
  mechanism:  'how it works: an algorithm, a structure, a formula',
  quantity:   'a number, a rate, a frequency or a scope (every, all, daily, three)',
  provenance: 'where the output or the data comes from (a live model, an archive, the open web)',
  framing:    'metaphor, persona or evaluation: not checkable, never scored',
};
export const TYPE_ORDER = ['capability', 'mechanism', 'quantity', 'provenance', 'framing'];

export const FORMULA = {
  point: 'figure = sum(w x v) / sum(w), over checked sub-claims; v = 1 supported, 0.5 partial, 0 unsupported',
  low: 'low = supported weight / all weight (partial and unverified count as unsupported)',
  high: 'high = (supported + partial + unverified weight) / all weight (partial and unverified count as supported)',
  factscore: 'FActScore = supported checked sub-claims / all sub-claims, unweighted (Min et al., EMNLP 2023)',
};

/* The public model route as measured on 2026-11-11 (llm.js header, LABS_LEVELS.md):
   HTTP 402 FREE_LIMIT, "1 reply every 45 seconds per IP". */
export const ROUTE_CAPACITY = {
  pollinations: { calls: 1, windowS: 45, source: 'measured 2026-11-11, labs/assets/js/ai/llm.js' },
  ollama: { calls: Infinity, windowS: 45, source: 'the visitor\'s own machine' },
  'own-key': { calls: Infinity, windowS: 45, source: 'the visitor\'s own key' },
  worker: { calls: Infinity, windowS: 45, source: 'a deployed worker' },
  offline: { calls: 0, windowS: 45, source: 'no route answered' },
};
export const ROUTE_CACHE_KEY = 'lb.hd.route';
export const ROUTE_CACHE_MS = 10 * 60 * 1000;

/* Published values the reference checks compare against. Each is cited on the page. */
export const REFERENCES = {
  bcrit: {
    value: 3 * Math.sqrt(3) / 2, unit: 'r_s', tol: 0.02,
    what: 'Schwarzschild critical impact parameter 3*sqrt(3) GM/c^2',
    cite: 'Misner, Thorne & Wheeler, Gravitation (1973), chapter 25',
  },
  isco0: {
    value: 3, unit: 'r_s', tol: 0.01,
    what: 'innermost stable circular orbit of a non-rotating hole, 6 GM/c^2',
    cite: 'Bardeen, Press & Teukolsky, ApJ 178, 347 (1972)',
  },
  betaIsco: {
    value: 0.5, unit: 'c', tol: 0.05,
    what: 'orbital speed at the ISCO measured by a static observer, c/2',
    cite: 'Bardeen, Press & Teukolsky, ApJ 178, 347 (1972)',
  },
  earthVesc: {
    value: 11.186, unit: 'km/s', tol: 0.01,
    what: 'Earth escape velocity',
    cite: 'NASA GSFC Earth Fact Sheet (Williams)',
  },
  earthTbb: {
    value: 254.0, unit: 'K', tol: 0.01,
    what: 'Earth black-body (equilibrium) temperature',
    cite: 'NASA GSFC Earth Fact Sheet (Williams)',
  },
  kepler62e: {
    value: { R: 1.61, P: 122.3874 }, unit: 'R_earth, d', tol: 0.01,
    what: 'Kepler-62 e radius and orbital period',
    cite: 'Borucki et al., Science 340, 587 (2013)',
  },
  hypercube: {
    what: 'an n-cube has 2^n vertices and n 2^(n-1) edges',
    cite: 'Coxeter, Regular Polytopes (1973), the measure polytope',
  },
  shannon: {
    what: 'self-information -log2 p summed over tokens',
    cite: 'Shannon, Bell System Technical Journal 27 (1948)',
  },
};

export const CITATIONS = [
  'Min, Krishna, Lyu, Lewis, Yih, Koh, Iyyer, Zettlemoyer & Hajishirzi, FActScore: fine-grained atomic evaluation of factual precision in long form text generation, EMNLP 2023.',
  'Wang, Wang, Athiwaratkun, Zhang & Zou, Mixture-of-Agents enhances large language model capabilities, arXiv 2406.04692 (2024).',
  'Bardeen, Press & Teukolsky, Rotating black holes: locally nonrotating frames, energy extraction, and scalar synchrotron radiation, ApJ 178, 347 (1972).',
  'Misner, Thorne & Wheeler, Gravitation, Freeman (1973).',
  'Borucki et al., Kepler-62: a five-planet system with planets of 1.4 and 1.6 Earth radii in the habitable zone, Science 340, 587 (2013).',
  'Coxeter, Regular Polytopes, 3rd ed., Dover (1973).',
  'Shannon, A mathematical theory of communication, Bell System Technical Journal 27 (1948).',
  'Williams, Earth Fact Sheet, NASA Goddard Space Flight Center (nssdc.gsfc.nasa.gov).',
];

export const REPO = { owner: 'Leyber91', name: 'LUISBLANCO.DEV' };

/* Checks: how long a hidden-frame probe may take before it counts as not run. */
export const PROBE_TIMEOUT_MS = 9000;
/* Probes that load WebGL or large data run on wide screens only, unless asked. */
export const HEAVY_MIN_WIDTH = 1100;
