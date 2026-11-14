/* ============================================================
   heptapod/script.js — the script's grammar, as data.

   One row per category: where it is written (a role sector, a
   slot, the crown, the ring's weight), the morphological parameter
   that carries it, and for each value the stroke operator and the
   reason for its shape. The renderer draws slot marks from
   `mark`, the reader turns the ink it finds in a slot's bands
   ('in', 'out', both or neither) back into a value through `band`,
   and the page's key and its pinned readouts quote `reason`.
   Adding a value to a slot category is a row here plus a shape in
   MARKS. [ILLUSTRATIVE: the design is original to this lab]
   ============================================================ */

import { GEOM } from './config.js';
import { PRONOUNS, THING_PRONOUNS, BEINGS, THINGS, ABSTRACT, MOTION, MIND, CHANGE } from './lexicon-data.js';

const D2R = Math.PI / 180;

export const SCRIPT_VERSION = '1.0.0';

/* ---------------- shared conventions: layout, cells, the nib, the codes ---------------- */

export const mod = (a, n) => ((a % n) + n) % n;
const isRole = (k) => k === 'pred' || k === 'agent' || k === 'patient' || k === 'recipient';

/* ---------------- 1. layout ---------------- */

/* present: which of agent / patient / recipient exist; occ: which slots carry a mark
   (mood, neg, evid, aspect). One quadratic minimisation with one constraint:
   min sum k_i (w_i - n_i)^2  subject to  sum w_i = 360, solved in closed form. */
export function layoutFor(present, occ = {}, { natural = false } = {}) {
  const keys = GEOM.ORDER.filter((k) => !isRole(k) || k === 'pred' || present[k]);
  const nat = keys.map((k) => (isRole(k) ? GEOM.ROLE_W : occ[k] ? GEOM.FEAT_W.mark : GEOM.FEAT_W.empty));
  const stiff = keys.map((k) => (isRole(k) ? GEOM.ROLE_K : GEOM.FEAT_K));
  // a writer who does not know the rest of the sentence gives each element its natural arc
  const delta = natural ? 0 : 360 - nat.reduce((a, b) => a + b, 0);
  const inv = stiff.reduce((a, k) => a + 1 / k, 0);
  const items = {};
  let start = -(nat[0] + delta / stiff[0] / inv) / 2;
  keys.forEach((k, i) => {
    const width = nat[i] + (delta / stiff[i]) / inv;
    items[k] = { key: k, start, width, center: start + width / 2, role: isRole(k) };
    start += width;
  });
  return { keys, items };
}

export const cellCenters = (sec) => Array.from({ length: GEOM.CELLS }, (_, j) => sec.start + (j + 0.5) * sec.width / GEOM.CELLS);

/* The broad nib: a stroke moving in direction phi (deg, the ring's tangent at angle phi)
   is widest across the nib's edge. Shared with the reader, which expects it. */
export function nib(deg) {
  const { angle, min, max } = GEOM.NIB;
  return min + (max - min) * Math.abs(Math.sin((deg - angle) * D2R)) ** 1.2;
}
export const strokeScale = (rho) => Math.pow(rho, GEOM.SUB_WEIGHT);

/* ---- codes ---- */
const toTrit = (d) => (d === 2 ? -1 : d); // base-3 digit -> -1/0/+1
const mod3 = (n) => ((n % 3) + 3) % 3;

/** Six-cell code for the index-th member (1-based, up to 80) of a class. */
export function makeCode(classTrit, index) {
  if (index < 1 || index > 80) throw new Error('a class holds at most 80 concepts');
  const d = [Math.floor(index / 27) % 3, Math.floor(index / 9) % 3, Math.floor(index / 3) % 3, index % 3].map(toTrit);
  const s = mod3(classTrit + d[0] + d[1] + d[2] + d[3]);
  const check = toTrit((3 - s) % 3);
  return [classTrit, ...d, check];
}

export const codeValid = (c) => c.length === 6 && mod3(c.reduce((a, b) => a + b, 0)) === 0 && c.some((v) => v !== 0);


/* The codebook: every concept's code, in the order lexicon-data.js fixes. A reader needs
   only this to read words; it never sees the parser's lookup tables. */
const idOf = (row) => (typeof row === 'string' ? row.split('|')[0] : row.id);
const book = (classes) => classes.flatMap(([trit, rows]) => rows.map((row, i) => ({
  id: idOf(row), code: makeCode(trit, i + 1), num: typeof row === 'string' ? null : row.num,
})));
export const CODEBOOK = {
  nouns: book([[-1, [...PRONOUNS, ...BEINGS]], [0, [...THING_PRONOUNS, ...THINGS]], [1, ABSTRACT]]),
  verbs: book([[-1, MOTION], [0, MIND], [1, CHANGE]]),
};
export const FIXED_NUMBER = Object.fromEntries(CODEBOOK.nouns.filter((e) => e.num).map((e) => [e.id, e.num]));

/* Coreference. In a composite, a participant of the second proposition that is also in the
   first is not written again: its sector holds a reference code naming the first ring's role
   (three codes reserved at the end of the thing class, indices 78 to 80). */
export const REF = {
  agent: { id: '@agent', code: makeCode(0, 78) },
  patient: { id: '@patient', code: makeCode(0, 79) },
  recipient: { id: '@recipient', code: makeCode(0, 80) },
};
CODEBOOK.nouns.push(...Object.values(REF).map((r) => ({ id: r.id, code: r.code, num: null })));
export const REF_ROLE = Object.fromEntries(Object.entries(REF).map(([role, r]) => [r.id, role]));


export const CATEGORIES = {
  pred: {
    name: 'predicate', where: 'the crown sector, top of the ring', param: 'six cells of curvature',
    reason: 'The predicate is the proposition\'s centre of gravity, so it sits at the crown, the point every reading starts from.',
  },
  agent: {
    name: 'agent', where: 'the west sector', param: 'six cells of curvature; stroke weight for number',
    reason: 'The agent is written where the stroke arrives at the crown from: the doer comes before the deed in the ring\'s clockwise flow.',
  },
  patient: {
    name: 'patient', where: 'the east sector', param: 'six cells of curvature, or a split line holding a nested ring',
    reason: 'The patient is written where the stroke leaves the crown: what the deed reaches. A whole clause cannot fit six cells, so the sector splits and holds it.',
  },
  recipient: {
    name: 'recipient', where: 'the south sector', param: 'six cells of curvature',
    reason: 'The recipient sits opposite the predicate: where what is given ends up.',
  },
  time: {
    name: 'time', where: 'the crown tendril', param: 'the lean of the tendril',
    values: {
      past: { op: 'leans back, toward the agent', reason: 'Back is where the stroke came from.' },
      present: { op: 'stands straight', reason: 'Neither behind nor ahead.' },
      future: { op: 'leans forward, toward the patient', reason: 'Forward is where the stroke is going.' },
    },
  },
  mood: {
    name: 'mood', where: 'the slot between predicate and patient', param: 'a branch out, in, or through',
    values: {
      indicative: { band: 'none', mark: null, op: 'nothing', reason: 'A plain statement needs no mark.' },
      interrogative: { band: 'out', mark: 'hook', op: 'a hook curling outward', reason: 'A question reaches out toward the reader for its answer.' },
      imperative: { band: 'in', mark: 'spear', op: 'a spear pointing inward', reason: 'A command presses in on the proposition itself.' },
      potential: { band: 'both', mark: 'through', op: 'a stroke through the ring with beads at both ends', reason: 'What can happen is open both ways.' },
    },
  },
  neg: {
    name: 'negation', where: 'the slot after the patient', param: 'a cut in the ring',
    values: {
      false: { op: 'the ring is whole', reason: 'An affirmed proposition closes on itself.' },
      true: { op: 'the ring is cut over 14 degrees', reason: 'A denied proposition does not close.' },
    },
  },
  evid: {
    name: 'evidence', where: 'the slot before the agent', param: 'a branch in or out',
    values: {
      direct: { band: 'none', mark: null, op: 'nothing', reason: 'What the writer saw needs no warrant.' },
      inferred: { band: 'in', mark: 'dots', op: 'a chain of three dots inward', reason: 'Inference is steps taken inside the writer\'s own mind.' },
      reported: { band: 'out', mark: 'double', op: 'a doubled line outward', reason: 'A report comes from another voice outside.' },
    },
  },
  aspect: {
    name: 'aspect', where: 'the slot before the crown', param: 'a branch in or out',
    values: {
      simple: { band: 'none', mark: null, op: 'nothing', reason: 'An event taken whole needs no mark.' },
      progressive: { band: 'in', mark: 'spiral', op: 'a spiral winding inward', reason: 'An action still going on keeps turning.' },
      perfect: { band: 'out', mark: 'loop', op: 'a closed loop outward', reason: 'A completed action is closed and set aside.' },
    },
  },
  num: {
    name: 'number', where: 'the weight of an entity\'s sector', param: 'stroke weight',
    values: {
      sg: { op: 'the base weight', reason: 'One takes one measure of ink.' },
      pl: { op: 'double weight', reason: 'Many take more ink.' },
    },
  },
  embed: {
    name: 'embedded clause', where: 'a ring nested at 0.40 of the radius', param: 'a nested loop',
    reason: 'A clause is a proposition, so it is written as a whole ring, inside the one that holds it.',
  },
  rel: {
    name: 'relation', where: 'the bridge between two rings', param: 'the bridge\'s shape',
    values: {
      because: { op: 'one stroke flowing from the cause into the effect', reason: 'A cause runs into what it causes.' },
      despite: { op: 'two strokes crossing', reason: 'Two propositions pulling against each other.' },
      after: { op: 'an arch over', reason: 'Time passes over from the earlier to the later.' },
      before: { op: 'an arch under', reason: 'The mirror of after.' },
    },
  },
};

/* The slot categories are the rows whose values carry a band: the writer marks them and the
   reader looks for them from this list alone, so a new slot category is a new row here, its
   place in GEOM.ORDER and its shapes in MARKS. */
export const SLOT_KEYS = Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].values && Object.values(CATEGORIES[k].values).some((v) => v.band));
export const unmarked = (k) => Object.keys(CATEGORIES[k].values).find((v) => CATEGORIES[k].values[v].band === 'none');

/* Which band marks a slot value, and back. */
export const slotBand = (slot, value) => CATEGORIES[slot].values[value].band;
export function slotValueFromBands(slot, hasIn, hasOut, inMass = 0, outMass = 0) {
  const vals = CATEGORIES[slot].values;
  let band = hasIn && hasOut ? 'both' : hasIn ? 'in' : hasOut ? 'out' : 'none';
  if (band === 'both' && !Object.values(vals).some((v) => v.band === 'both')) band = inMass > outMass ? 'in' : 'out';
  return Object.keys(vals).find((k) => vals[k].band === band) || Object.keys(vals)[0];
}

/* Mark shapes in (u: along the ring clockwise, v: outward), ring radii; w0 / w1 stroke weights
   as multiples of the base weight; dots as [u, v, radius]. */
export const MARKS = {
  hook: { lines: [{ pts: [[0, 0.02], [0, 0.12], [0.006, 0.2], [0.02, 0.255], [0.045, 0.29], [0.072, 0.298], [0.09, 0.282], [0.092, 0.255]], w0: 1.25, w1: 0.45 }], dots: [] },
  spear: { lines: [{ pts: [[0, -0.01], [0, -0.12], [0, -0.24], [0, -0.335]], w0: 1.7, w1: 0.12 }], dots: [] },
  through: { lines: [{ pts: [[0, -0.29], [0, -0.1], [0, 0.1], [0, 0.29]], w0: 0.75, w1: 0.75 }], dots: [[0, -0.315, 0.02], [0, 0.315, 0.02]] },
  spiral: (() => {
    const pts = [[0, -0.01], [0, -0.06], [0, -0.11]];
    for (let s = 1; s <= 40; s++) {
      const t = s / 40, a = Math.PI / 2 - t * 1.7 * Math.PI, rad = 0.11 * (1 - 0.55 * t);
      pts.push([rad * Math.cos(a), -0.22 + rad * Math.sin(a)]);
    }
    return { lines: [{ pts, w0: 1.1, w1: 0.45 }], dots: [] };
  })(),
  loop: (() => {
    const pts = [[0, 0.01], [0, 0.06], [0, 0.115]];
    for (let s = 1; s <= 40; s++) {
      const a = -Math.PI / 2 + (s / 40) * 2 * Math.PI;
      pts.push([0.095 * Math.cos(a), 0.21 + 0.095 * Math.sin(a)]);
    }
    return { lines: [{ pts, w0: 1.05, w1: 0.8 }], dots: [] };
  })(),
  dots: { lines: [], dots: [[0, -0.155, 0.03], [0, -0.235, 0.025], [0, -0.31, 0.02]] },
  double: { lines: [{ pts: [[-0.018, 0.02], [-0.03, 0.17], [-0.05, 0.33]], w0: 0.6, w1: 0.3 }, { pts: [[0.018, 0.02], [0.03, 0.17], [0.05, 0.33]], w0: 0.6, w1: 0.3 }], dots: [] },
};

export function markFor(slot, value) {
  const v = CATEGORIES[slot]?.values?.[value];
  return v && v.mark ? MARKS[v.mark] : null;
}
