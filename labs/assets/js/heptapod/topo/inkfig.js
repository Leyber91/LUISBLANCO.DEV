/* ============================================================
   heptapod/topo/inkfig.js — F4-ink (BAR_F, order of 2026-11-17: the
   look before the rest of F4): a meaning graph drawn as ink on a ring,
   at the film masters' resolution, with each clause laid along the
   ring and its nodes drawn as filaments.

   Each rule with its reason (research/ip.md rule 9: our own route; the
   film enters only as distributions to land in, or as a calibration
   named in INK_CALIBRATIONS):

   I1 The ring is the speaker (figure.js F1), drawn as one brush stroke
      around a hand-drawn circle: the centreline wanders from a perfect
      circle by a smooth noise (a hand is not a compass). [physics of
      the hand; amplitude a calibration]
   I2 One mass per main clause (figure.js F2), laid along the ring: the
      brush pools the clause's ink where it dwells, and the pool is
      dragged along the stroke, so its arc grows with the clause's
      content (NODE_DEG per node) and its depth is the pool's (DEPTH).
      The pool's profile is a puddle's, skewed along the drag, split
      between the two sides of the ring. [physics: pooling; PLAN M3]
   I2c A pool carries its clause's concept: the main event's concept is
      1 to 3 radicals (hmr.js), and the pool's outline is one lump per
      radical in the concept's canonical order, each as high as that
      radical's word in the lab's code says (code.js, the radical
      partition: the affirmed word's nine digits summed, 0 to 18, give
      0.55 to 1.1 of the pool's depth), with a waist at 0.3 between
      lumps. So two clauses about different things never pour the same
      pool, and no shape class (one smooth mass) is shared by all.
      [grammar: the concept; the code's words]
   I2d The crown is the code: on the side of the pool holding more ink,
      each radical's affirmed word (nine cells, code.js) is written
      across its lump as a fan, a cell of 2 growing a tendril that ends
      in a drop, a cell of 1 a short stub, a cell of 0 nothing. Every
      tendril is a thread with the legs' physics (I4: SHAFT, FIL_LEN,
      flaring as a branch does, 1.6 shafts, since it leaves the rim and
      not the pool's depth;
      the 1.89 drop), so the crown the film's single masses carry
      (Humanity1: 16 filaments on one mass) is here the concept's code,
      read cell by cell. Where a leg leaves the rim it drains the rim's
      ink, so no cell grows within 1.5 cells of a leg's root. Luis, 2026-11-18: "make sure the feel is like
      number 1, yet everything obeys the rules of the language we
      figured out on our own". [grammar: the code; physics: I4]
   I2e A pool holds its clause's ink (0.6; Luis, 2026-11-18: "ours look
      very similar, why is that?"). A node's ink is its concept's words'
      digits summed over 9 (1 for a node with no concept), so a
      three-radical concept carries more than a one-radical one; a
      clause's ink is its nodes' over C_REF, the stand-in corpus's mean
      node ink, and its pool's arc is NODE_DEG per unit of it, so the
      pool grows with what the clause says, not with how many nodes say
      it. A state (hmr.js aspect) is where the hand rests: its pool is
      gathered, E_STATE of the arc and the depth over E_STATE, the same
      area, with no drag; any other event's pool is dragged along the
      stroke, the drag's direction seeded (the film shows none, F4-P2
      and F4-P3). The pool's ink lies on each side as its threads' ink
      leaves it. [grammar: the code, aspect; physics: area kept]
   I3 Every node joined to a clause's main event is a filament leaving
      the mass where the pool is deepest (a splash's crown); a node
      that hangs from such a node is a branch of its filament. The side
      is the role's class: a core argument (actor, undergoer, goal,
      content) leaves outward, any other role inward, and so does a
      referent that is the speaker (person 1), into the ring that is
      the speaker (figure.js F1). The angle at
      which it leaves the normal is the role's own: each label has one
      angle, spread evenly over LEAN_DEG either side of the normal in
      hmr.js's label order within its side (PLAN L6: role by neck
      angle). Its length grows with what hangs from it. [grammar; F4-P4,
      missed: the suite reads 1 to 7 more filaments than are drawn]
   I4 A filament is a thread of ink: it flares where it leaves the pool,
      tapers along its length and leaves at the role's angle. It is its
      node's word written as a turn (0.6): read from the pool out, each
      cell of each radical's nine-cell word (canonical order) turns the
      thread by TURN_CELL times (cell - 1), so its bend is its concept,
      and the hand adds a small wander (TREMOR) that starts at zero; a
      node with no concept wanders by the noise alone. A thread keeps
      one slenderness, so its length and its shaft grow with the cube
      root of its node's ink. An entity's
      thread ends in a drop of radius 1.89 times the thread's radius
      where it breaks, its tip (Rayleigh 1878, after Plateau: one
      fastest-growing wavelength, 9.02 a, gathers into one drop; from
      memory, to verify; F4-P5, a post-hoc outcome); any other node's
      thread ends flat. A drop may shed up to two satellites beyond it,
      smaller and in line, as a breaking thread leaves satellite drops
      (Eggers 1997, Rev. Mod. Phys. 69, 865; from memory, to verify);
      their number and spacing are seeded. [physics; grammar for which
      tips]
   I5 The rim of a pool breaks into short spikes spaced as a thin rim's
      fastest-growing wavelength (the same 9.02 a, for a rim of half
      thickness RIM_A): edge roughness, below the length of a filament.
      [physics]
   I5b Spray: a pool throws drops off its rim as the brush leaves it
      (the splash's ejecta; Worthington, A Study of Splashes, 1908, from
      memory, to verify), one per SPRAY_DEG of its arc, more on the side
      holding more ink, within 0.3 R of the rim, radii many small and
      few large. The pool's place is the grammar's; each drop's place
      is seeded. Never in the gap. [physics; positions seeded]
   I6 The carrier between masses is a hairy brush (Strassmann 1986):
      bristles across the stroke, each with its own reservoir. Its load
      is highest beside a pool and falls with arc distance from the
      nearest one, on either side alike (wet ink wicks out of a pool
      along the stroke both ways), to LOAD_FLOOR; a stroke direction is
      not drawn, so the ring shows no start (PLAN V18; the film showed
      none either, F4-P2 and F4-P3 missed). A bristle whose load falls
      below its threshold leaves a gap, outer bristles first, so a dry
      stretch shows streaks and specks (flying white). The gap's arc,
      GAP_DEG, is kept free before the pools share the rest, and goes
      to the largest free arc, where the brush is driest (figure.js F6;
      F4-P1); among equal arcs, the first in drawing order. The stroke
      tapers into it, and nothing else is drawn in it. [physics]
   I7 Ink spreads into the surface before it dries: the body (pools,
      threads, drops) is diffused over INK_SPREAD and the bristle layer
      over a third of it, and ink is where the diffused load is at least
      half. Joins become waists and drops round. [physics: capillary
      spreading]
   I9 Masses: clauses that share a referent (a coreference link
      between them) are one mass, since one referent is one pool of
      ink; a ring holds at most MASS_MAX masses (the film's p90 of
      blot clusters), so while more remain the two masses with the
      most links between them merge (ties: the larger merged mass,
      then the lower clause indices), which grows one dominant mass
      as the film's rings have (detail/masses.js: dominance median
      0.76). Within a mass the clauses' pools overlap by OVERLAP of
      their spans, so they lie as lumps of one pool drawn out along
      the stroke, each clause's threads erupting from its own lump.
      [grammar: coreference; a ring's capacity a calibration]
   I8 Order around the ring: the masses' centre of mass (each mass
      weighed by its span, at its placed centre, free arcs and the gap
      included) nearest the centre (figure.js F4, PLAN 3.4.3), so no
      position carries discourse order: every cyclic order up to 7
      clauses, above that insertion by weight then swaps, as figure.js
      does; free arcs keep ARC_MIN_DEG and share the rest by the
      neighbours' spans (figure.js F5); the figure is turned by its
      meaning's certificate (figure.js).

   Every random choice is a stream seeded by the graph's canonical
   certificate and a node's canonical index, never by the text. Only
   + - * /, Math.sqrt, exact rounding and trig.js are called (BAR_F
   G5). Reading the inked figure back is the next slice (declared in
   BAR_F before this one ran); what this file reports is how many
   filaments it drew.
   ============================================================ */

import { clausesOf } from './figure.js';
import { edgeClassRank, edgeRoleRank, EDGE_LABELS } from './hmr.js';
const classOf = (label) => (EDGE_LABELS[label] ? EDGE_LABELS[label].cls : null);
import { mulberry32, fnv1a } from './rng.js';
import { PI, sinK, cosK } from './trig.js';
import { buildCode, partition, digits, CODE_SEED } from './code.js';
import { RADICALS } from './hmr.js';

const TAU = 2 * PI, DEG = PI / 180;

export const INK = Object.freeze({
  version: 'inkfig-0.6',
  S: 3300,            // raster side, the film masks' size
  R_CANVAS: 0.365,    // R over the raster side (figure.js)
  NODE_DEG: 7.0,      // I2: arc of a clause's pool per node, degrees
  CORE: 0.65,         // I2b: the share of the pool's depth laid as its solid core
  DEPOSITS: 1.2,      // I2b: strokes laid per degree of the pool's arc
  ARC_MIN_DEG: 6,     // I8: clearance between neighbouring masses, degrees
  MASS_MAX: 4,        // I9: the most masses a ring holds
  MASS_ARC: 98,       // I9: the most arc a ring's masses cover together, degrees
  OVERLAP: 0.3,       // I9: neighbouring clauses of one mass overlap by this share of their spans
  GAP_DEG: 26.5,      // I6: the gap's arc, degrees
  TAPER_DEG: 10,      // I6: the stroke thins into the gap over this arc
  DEPTH: 0.33,        // I2: a pool's peak depth across the ring, over R
  WOBBLE: 0.11,       // I1: centreline wander, over R
  W_RING: 0.09,       // I6: the carrier's width at full load, over R
  LOAD_ARC: 0.3,      // I6: arc (over R) at which the carrier's load has fallen to half
  LOAD_FLOOR: 0.7,   // I6: the share of a full load the brush keeps however far from a pool (it is redipped by the writer's hand, not only by the pools)
  BRISTLES: 28,       // I6
  SHAFT: 0.02,        // I4: a thread's shaft width, over R
  FIL_LEN: 0.15,      // I3: a filament's length with nothing hanging from it, over R
  RIM_A: 0.005,       // I5: rim half thickness, over R
  SPRAY_DEG: 5,       // I5b: one drop per this many degrees of a pool's arc
  LEAN_DEG: 30,       // I3: the role angles spread over this many degrees either side of the normal
  INK_SPREAD: 0.006,  // I7: diffusion length of the body, over R
  C_REF: 1.511,       // I2e: the unit of a clause's ink, the stand-in corpus's mean node ink
  E_STATE: 0.6,       // I2e: a state's pool, gathered: this share of the arc, the depth over it
  TURN_CELL: 0.17,    // I4: the turn of a thread per unit of its word's cells (cell - 1), radians
  TREMOR: 0.15,       // I4: the hand's wander along a thread that carries a word, radians
  CORE_ROLES: Object.freeze(['actor', 'undergoer', 'goal', 'content']),
});

export const INK_CALIBRATIONS = Object.freeze([
  { name: 'NODE_DEG', value: INK.NODE_DEG, source: 'first value: a 6-node clause drawn about 24 degrees, the film\'s cluster spans having median 15 and widest-per-master median 32 degrees (film suite, 2026-11-17)' },
  { name: 'GAP_DEG', value: INK.GAP_DEG, source: 'film suite 2026-11-17: main gap median 26.5 degrees over the 18 masters' },
  { name: 'DEPTH', value: INK.DEPTH, source: 'film suite 2026-11-17: blot peak width median 0.325 R' },
  { name: 'WOBBLE', value: INK.WOBBLE, source: 'film suite 2026-11-17: centreline deviation median 0.043 R (first value set below it, the pools add their own)' },
  { name: 'W_RING', value: INK.W_RING, source: 'film suite 2026-11-17: carrier w_med median 0.066 R, w_p25 median 0.035 R' },
  { name: 'SHAFT', value: INK.SHAFT, source: 'film suite 2026-11-17: filament shaft median 0.0172 R' },
  { name: 'FIL_LEN', value: INK.FIL_LEN, source: 'film suite 2026-11-17: filament length median 0.143 R' },
  { name: 'WOBBLE bounded', value: INK.WOBBLE, source: "v0.2 raised it to 0.10 on a 30-degree lattice and the 12-clause carrier left the suite's carrier band (closure 0.75, below the film's p10 0.81; the coordinating session saw straight chords between knots); 0.06 on a 45-degree lattice gives 0.92 (4 and 12 clauses, 2026-11-17)" },
  { name: 'v0.3.1: W_RING, WOBBLE, thread turning', value: INK.W_RING, source: "after 0.3's measurement (49ffc98) and the coordinating session's read: the carrier thin on 1 and 4 clauses (w_med 0.0338 and 0.0438 against the film's p10 0.0441), the wander overcorrected (0.0094 to 0.0187 against p10 0.0189), the threads straight (turning 48.6 and 49.5 against p10 55.9). W_RING 0.06 to 0.09, WOBBLE 0.06 on 45 degrees to 0.11 on 60, the threads' turning noise 4 octaves at 4 cycles and amplitude 0.55 to 1.1 radians: on the three figures w_med 0.046, 0.064, 0.075; wobble 0.016, 0.021, 0.046; turning 57, 62, 66 (2026-11-17)" },
  { name: 'MASS_MAX', value: INK.MASS_MAX, source: 'film suite 2026-11-17: blot clusters per master p90 4.3' },
  { name: 'MASS_ARC', value: INK.MASS_ARC, source: 'film suite 2026-11-17: the sum of a master s cluster spans, p50 45, p90 98.1 degrees' },
  { name: 'R_CANVAS', value: INK.R_CANVAS, source: 'film.md 5.2: R over canvas median 0.365 (the measuring frame; figure.js)' },
  { name: 'v0.2 after the first measurement (bb8f228)', value: 0, source: 'NODE_DEG 4 to 7, WOBBLE 0.03 to 0.10, LOAD_FLOOR 0.45 to 0.7, W_RING 0.05 to 0.06, SHAFT 0.017 to 0.02, INK_SPREAD 0.0035 to 0.006, depth by clause size, the crown, more turning: set by eye against the film master and by the suite after F4-P4 had run; F4-P4 keeps its first outcome' },
  { name: 'LOAD_ARC, LOAD_FLOOR, BRISTLES, RIM_A, INK_SPREAD, TAPER_DEG, CORE, DEPOSITS, ARC_MIN_DEG, SPRAY_DEG, LEAN_DEG', value: 0, source: 'first values, not compared with any film measure of their own' },
]);

/* Each constant's kind (Luis, 2026-11-18: "we don't want handwaved, it will be generated obeying mathematical
   equations"). derived: an equation from physics or the grammar. calibrated: set to a named film measure (the
   film enters as a distribution, ip.md rule 9). frame: the measuring frame. chosen: set by eye or a first value,
   debt to be derived or fitted by a stated objective on held-out sentences. tools/dev/heptapod_equations.mjs
   writes the sheet from this, with the numeric literals still inline in the drawing code. */
export const INK_KIND = Object.freeze({
  S: ['frame', 'the film masks are 3300 px; the suite measures ours at the same size'],
  R_CANVAS: ['calibrated', 'film.md 5.2: R over canvas, median 0.365'],
  NODE_DEG: ['chosen', 'first 4, then 6 and 7 by eye on 2026-11-17 against the film cluster spans (median 15, widest median 32)'],
  CORE: ['chosen', 'first value'],
  DEPOSITS: ['chosen', 'first value'],
  ARC_MIN_DEG: ['chosen', 'first value'],
  MASS_MAX: ['calibrated', 'film suite: blot clusters per master p90 4.3'],
  MASS_ARC: ['calibrated', 'film suite: total cluster arc per master p90 98.1 degrees'],
  OVERLAP: ['chosen', 'first value'],
  GAP_DEG: ['calibrated', 'film suite: main gap median 26.5 degrees'],
  TAPER_DEG: ['chosen', 'first value'],
  DEPTH: ['calibrated', 'film suite: blot peak width median 0.325 R'],
  WOBBLE: ['chosen', 'by eye with the suite column in view (0.03, 0.10, 0.06, 0.11); film centreline deviation median 0.043 R'],
  W_RING: ['chosen', 'by eye with the suite column in view (0.05, 0.06, 0.09); film carrier w_med median 0.066 R'],
  LOAD_ARC: ['chosen', 'first value'],
  LOAD_FLOOR: ['chosen', 'raised by eye (0.45, 0.7) when the 1-clause ring dried away'],
  BRISTLES: ['chosen', 'first value'],
  SHAFT: ['chosen', 'film filament shaft median 0.0172 R, raised by eye to 0.02'],
  FIL_LEN: ['calibrated', 'film suite: filament length median 0.143 R'],
  RIM_A: ['chosen', 'first value'],
  SPRAY_DEG: ['chosen', 'first value'],
  LEAN_DEG: ['chosen', 'first value'],
  INK_SPREAD: ['chosen', 'raised by eye (0.0035, 0.006) to close gaps between strokes'],
  CORE_ROLES: ['derived', 'the grammar: hmr.js core participant roles'],
  C_REF: ['frame', "the unit of a clause's ink: corpus B's mean node ink, 1.511 over 632 nodes (2026-11-18), so a clause of mean nodes keeps NODE_DEG per node"],
  E_STATE: ['chosen', 'first value: a resting hand gathers the pool to 0.6 of its arc, the area kept'],
  TURN_CELL: ['chosen', "first value: a radical's word turns a thread at most 3 units, 0.5 radians; three radicals up to about 1.5, the range 0.3.1's turning noise spanned"],
  TREMOR: ['chosen', 'first value, a quarter of the turning noise it replaces on threads that carry a word'],
});

/* ---------------- I2c: the radicals' words in the lab's code ---------------- */

let LUMP = null;
/** radical -> the lump's height (0.55 to 1.1 of the pool's depth): its affirmed word's digits summed over 18. */
/** radical -> its affirmed word's nine cells (0, 1 or 2), the crown it writes (I2d). */
export function lumpWord(radical) {
  lumpHeight(radical);
  return WORDS.get(radical) || null;
}
const WORDS = new Map();
export function lumpHeight(radical) {
  if (!LUMP) {
    const rad = partition(buildCode({ seed: CODE_SEED })).parts.radical;
    LUMP = new Map(RADICALS.map((r, i) => [r, 0.55 + (0.55 * digits(rad[i][0]).reduce((a, b) => a + b, 0)) / 18]));
    RADICALS.forEach((r, i) => WORDS.set(r, Array.from(digits(rad[i][0]))));
  }
  return LUMP.get(radical) ?? 0.8;
}

/* ---------------- I2e, I4: a node's ink, its word, its side ---------------- */

/** A node's word: its concept's radicals in canonical order, each radical's nine cells (code.js), concatenated. */
export function wordOf(node) {
  if (!node || !node.c) return [];
  return [...node.c].sort().flatMap((r) => lumpWord(r) || []);
}
/** A node's ink: its word's cells summed over 9 (a radical's share), 1 for a node with no concept. */
export function inkOf(node) {
  if (!node || !node.c) return 1;
  return wordOf(node).reduce((a, b) => a + b, 0) / 9;
}
/** The cube root by Newton's method (exact operations only, BAR_F G5). */
export function cbrt(x) {
  if (!(x > 0)) return 0;
  let y = x > 1 ? x / 2 : 1;
  for (let i = 0; i < 40; i++) y -= (y * y * y - x) / (3 * y * y);
  return y;
}
/** I3: does the node a role leads to leave outward? A core role does, unless its referent is the speaker. */
export const leavesOutward = (label, node) => INK.CORE_ROLES.includes(label) && !(node && node.f && node.f.person === '1');
/** I2e: is the event a state (its pool gathered, undragged)? */
export const isState = (node) => !!(node && node.f && node.f.aspect === 'state');

/* ---------------- seeded noise (exact operations only) ---------------- */

function hash01(seed, i) {
  let x = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967295;
}
/* value noise in [-1, 1]; with period > 0 the lattice wraps, so a noise of the angle is continuous at 2 pi */
function noise1(seed, t, period = 0) {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  const i0 = period ? ((i % period) + period) % period : i, i1 = period ? (i0 + 1) % period : i + 1;
  const a = 2 * hash01(seed, i0) - 1, b = 2 * hash01(seed, i1) - 1;
  return a + (b - a) * s;
}
function fbm1(seed, t, oct, period = 0) {
  let v = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) { v += amp * noise1(seed + 7919 * o, t * f, period ? period * f : 0); norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
}
const streamOf = (cert, i, tag) => mulberry32(fnv1a(`${cert}:${i}:${tag}`));

/* I3: one angle per role label, spread evenly over LEAN_DEG either side of the normal, in hmr.js's label order
   within its side (core roles outward, every other label inward) */
const LEANS = (() => {
  const all = Object.keys(EDGE_LABELS);
  const m = new Map();
  for (const side of [all.filter((l) => INK.CORE_ROLES.includes(l)), all.filter((l) => !INK.CORE_ROLES.includes(l))])
    side.forEach((l, i) => m.set(l, side.length === 1 ? 0 : -INK.LEAN_DEG + (2 * INK.LEAN_DEG * i) / (side.length - 1)));
  return m;
})();
export const leanOf = (label) => LEANS.get(label) ?? 0;

/* ---------------- the raster ---------------- */

function stampDisc(F, S, x, y, r) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(S - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(S - 1, Math.ceil(y + r));
  const r2 = r * r;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy;
    if (dy2 > r2) continue;
    for (let px = x0; px <= x1; px++) { const dx = px + 0.5 - x; if (dx * dx + dy2 <= r2) F[py * S + px] = 1; }
  }
}
function fillPolygon(F, S, P) {
  const m = P.length / 2;
  let ya = Infinity, yb = -Infinity;
  for (let k = 0; k < m; k++) { ya = Math.min(ya, P[2 * k + 1]); yb = Math.max(yb, P[2 * k + 1]); }
  const ys = Math.max(0, Math.floor(ya)), ye = Math.min(S - 1, Math.ceil(yb));
  const xs = [];
  for (let y = ys; y <= ye; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m, y0 = P[2 * k + 1], y1 = P[2 * j + 1];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(P[2 * k] + ((P[2 * j] - P[2 * k]) * (yc - y0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(S - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) F[y * S + x] = 1;
    }
  }
}
/* three box passes each way approximate a Gaussian (a sliding sum: exact operations only) */
function boxBlur(F, S, r, tmp) {
  if (r < 1) return;
  const n = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < S; y++) {
      const o = y * S;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += F[o + Math.min(S - 1, Math.max(0, x))];
      for (let x = 0; x < S; x++) {
        tmp[o + x] = acc / n;
        acc += F[o + Math.min(S - 1, x + r + 1)] - F[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(S - 1, Math.max(0, y)) * S + x];
      for (let y = 0; y < S; y++) {
        F[y * S + x] = acc / n;
        acc += tmp[Math.min(S - 1, y + r + 1) * S + x] - tmp[Math.max(0, y - r) * S + x];
      }
    }
  }
}

/* ---------------- I2, I8: the layout along the ring ---------------- */

function clauseTrees(cl) {
  const { cg, mains, member, origo } = cl;
  const inc = Array.from({ length: cg.n }, () => []);
  cg.edges.forEach((e) => { if (e.h !== origo && e.d !== origo && member[e.h] === member[e.d]) { inc[e.h].push(e); inc[e.d].push(e); } });
  return mains.map((m, c) => {
    const parent = new Map([[m, null]]), kids = new Map([[m, []]]), order = [m];
    for (let q = 0; q < order.length; q++) {
      const u = order[q];
      const next = inc[u].map((e) => ({ e, w: e.h === u ? e.d : e.h })).filter((x) => !parent.has(x.w))
        .sort((a, b) => edgeClassRank(a.e.label) - edgeClassRank(b.e.label) || edgeRoleRank(a.e.label) - edgeRoleRank(b.e.label) || a.w - b.w);
      for (const { e, w } of next) {
        if (parent.has(w)) continue;
        parent.set(w, { u, label: e.label }); kids.set(w, []); kids.get(u).push(w); order.push(w);
      }
    }
    const size = new Map(), ink = new Map();
    for (let q = order.length - 1; q >= 0; q--) {
      const u = order[q];
      size.set(u, 1 + kids.get(u).reduce((a, w) => a + size.get(w), 0));
      ink.set(u, inkOf(cg.nodes[u]) + kids.get(u).reduce((a, w) => a + ink.get(w), 0));
    }
    // I2e: the clause's ink in units of C_REF
    return { c, main: m, parent, kids, size, ink, n: order.length, V: ink.get(m) / INK.C_REF };
  });
}

/* I9: the masses, as lists of clause indices. Coreference joins first; then, while more than MASS_MAX remain,
   the pair with the most links between them merges (ties: the larger merged node count, then the lower first
   indices). A mass lists its clauses by index. */
export function massesOf(k, cross, sizes) {
  let G = [...Array(k).keys()].map((c) => [c]);
  const find = (c) => G.findIndex((g) => g.includes(c));
  const join = (i, j) => { const [a, b] = i < j ? [i, j] : [j, i]; G[a] = G[a].concat(G[b]).sort((x, y) => x - y); G.splice(b, 1); };
  for (const e of cross) if (e.label === 'same-entity' || classOf(e.label) === 'coreference') { const i = find(e.a), j = find(e.b); if (i !== j) join(i, j); }
  while (G.length > INK.MASS_MAX) {
    let best = null;
    for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
      let links = 0;
      for (const e of cross) if ((G[i].includes(e.a) && G[j].includes(e.b)) || (G[i].includes(e.b) && G[j].includes(e.a))) links++;
      const size = G[i].concat(G[j]).reduce((a, c) => a + sizes[c], 0);
      const key = [links, size, -G[i][0], -G[j][0]];
      if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && (key[2] > best.key[2] || (key[2] === best.key[2] && key[3] > best.key[3])))))) best = { i, j, key };
    }
    join(best.i, best.j);
  }
  return G;
}

/* I6, I8: the placement of an order. The gap's arc is kept before the free arcs are shared; it goes to the
   largest shared arc (the first in drawing order among equals). Centres in degrees from the first pool's. */
export function placeOrder(sp) {
  const k = sp.length;
  const free = 360 - sp.reduce((a, b) => a + b, 0) - INK.GAP_DEG;
  const arcs = new Float64Array(k);
  if (k === 1) arcs[0] = free;
  else {
    let wsum = 0;
    for (let j = 0; j < k; j++) wsum += sp[j] + sp[(j + 1) % k];
    for (let j = 0; j < k; j++) arcs[j] = INK.ARC_MIN_DEG + ((free - k * INK.ARC_MIN_DEG) * (sp[j] + sp[(j + 1) % k])) / wsum;
  }
  let jg = 0;
  for (let j = 1; j < k; j++) if (arcs[j] > arcs[jg] + 1e-9) jg = j;
  arcs[jg] += INK.GAP_DEG;
  const centres = new Float64Array(k);
  for (let j = 1; j < k; j++) centres[j] = centres[j - 1] + sp[j - 1] / 2 + arcs[j - 1] + sp[j] / 2;
  return { arcs, jg, centres };
}
function centreOfMass(sp) {
  const { centres } = placeOrder(sp);
  let x = 0, y = 0, M = 0;
  for (let j = 0; j < sp.length; j++) { x += sp[j] * cosK(centres[j] * DEG); y += sp[j] * sinK(centres[j] * DEG); M += sp[j]; }
  return Math.sqrt(x * x + y * y) / M;
}
const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const better = (s, o, sb, ob) => s < sb - 1e-12 || (Math.abs(s - sb) <= 1e-12 && lexLess(o, ob));
function orderByCentre(span) {
  const k = span.length;
  const score = (o) => centreOfMass(o.map((c) => span[c]));
  if (k <= 2) return [...Array(k).keys()];
  let best = null, bs = Infinity;
  if (k <= 7) {
    const perm = (pre, left) => {
      if (!left.length) { const o = [0, ...pre], s = score(o); if (better(s, o, bs, best)) { bs = s; best = o; } return; }
      for (let i = 0; i < left.length; i++) perm([...pre, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    };
    perm([], [...Array(k).keys()].slice(1));
    return best;
  }
  // more than 7: insertion, heaviest first, then pairwise swaps while the centre of mass improves (figure.js)
  const byMass = [...Array(k).keys()].sort((a, b) => span[b] - span[a] || a - b);
  let o = [byMass[0]];
  for (const c of byMass.slice(1)) {
    let bo = null, s0 = Infinity;
    for (let j = 0; j <= o.length; j++) { const t = [...o.slice(0, j), c, ...o.slice(j)]; const s = score(t); if (better(s, t, s0, bo)) { s0 = s; bo = t; } }
    o = bo;
  }
  const i0 = o.indexOf(0);
  o = [...o.slice(i0), ...o.slice(0, i0)];
  bs = score(o);
  for (let pass = 0, moved = true; moved && pass < 20; pass++) {
    moved = false;
    for (let i = 1; i < k; i++) for (let j = i + 1; j < k; j++) {
      const t = o.slice(); [t[i], t[j]] = [t[j], t[i]];
      const s = score(t);
      if (better(s, t, bs, o)) { o = t; bs = s; moved = true; }
    }
  }
  return o;
}

/* ---------------- the figure ---------------- */

export function inkFigure(g, opts = {}) {
  const S = opts.S ?? INK.S;
  const cl = clausesOf(g);
  if (!cl.ok) return cl;
  const { cg } = cl;
  const cert = cg.cert;
  const trees = clauseTrees(cl);
  const k = trees.length;
  const R = INK.R_CANVAS * S, c0 = S / 2;
  const toX = (X) => c0 + X, toY = (Y) => c0 - Y;

  // I9: masses
  const groups = massesOf(k, cl.cross, trees.map((t) => t.n));
  // I2: spans, compressed when the ring is too short for its masses
  // I2e: a pool's arc is NODE_DEG per unit of its clause's ink; a state's is gathered to E_STATE of it
  const eOf = (t) => (isState(cg.nodes[t.main]) ? INK.E_STATE : 1);
  let span = trees.map((t) => INK.NODE_DEG * t.V * eOf(t));
  const massLen = (sps) => sps.reduce((a, b) => a + b, 0) - INK.OVERLAP * sps.slice(1).reduce((a, b, i) => a + (sps[i] + b) / 2, 0);
  // a ring holds at most MASS_ARC of mass (the film's p90): a longer text is written denser, never wider
  const room = Math.min(INK.MASS_ARC, 360 - INK.GAP_DEG - groups.length * INK.ARC_MIN_DEG);
  const sumMass = groups.reduce((a, g) => a + massLen(g.map((c) => span[c])), 0);
  const squeeze = sumMass > room ? room / sumMass : 1;
  span = span.map((s) => s * squeeze);
  const mspan = groups.map((g) => massLen(g.map((c) => span[c])));
  // I8: order of the masses, free arcs, centres; each clause's centre inside its mass
  const gorder = orderByCentre(mspan);
  const msp = gorder.map((gi) => mspan[gi]);
  const { arcs, jg, centres } = placeOrder(msp);
  const rot = (fnv1a(cert) % 3600) / 10;
  const massCentreDeg = centres.map((c) => c + rot);
  const order = [], centreDeg = [];
  gorder.forEach((gi, m) => {
    let at = massCentreDeg[m] - msp[m] / 2;
    groups[gi].forEach((c, i) => {
      if (i) at += ((span[groups[gi][i - 1]] + span[c]) / 2) * (1 - INK.OVERLAP);
      else at += span[c] / 2;
      order.push(c); centreDeg.push(at);
    });
  });
  const sp = order.map((c) => span[c]);
  const gapLen = INK.GAP_DEG;
  const gapMid = massCentreDeg[jg] + msp[jg] / 2 + arcs[jg] / 2;
  // I6: nothing but the carrier's tapered ends is drawn within the gap and its tapers
  const wrap0 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const inGap = (phi) => Math.abs(wrap0(phi - gapMid)) < gapLen / 2 + INK.TAPER_DEG;

  // I1: the centreline
  const wobSeed = fnv1a(`${cert}:wobble`);
  const rc = (phiDeg) => R * (1 + INK.WOBBLE * fbm1(wobSeed, (((phiDeg % 360) + 360) % 360) / 60, 3, 6));

  const body = new Float32Array(S * S), bristle = new Float32Array(S * S);
  const report = { pools: [], filamentsDrawn: 0, threads: 0, bulbs: 0, satellites: 0, spikes: 0, outward: 0, crownTendrils: 0, crownStubs: 0 };
  // opts.trace: where each pool and each thread was laid, in raster pixels, for a reader of crops (the pod's
  // notebook). It records what was drawn and changes nothing that is drawn.
  const trace = opts.trace ? { pools: [], threads: [] } : null;

  // the angular distance (deg, signed into [-180, 180))
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  // ---------- I2, I3, I4, I5: pools and their threads ----------
  const pools = [];
  for (let j = 0; j < order.length; j++) {
    const t = trees[order[j]];
    const rnd = streamOf(cert, t.main, 'pool');
    const half = sp[j] / 2, th = centreDeg[j];
    // I2e: a state's pool is not dragged; any other is, by 0.6 of its half span, the direction seeded
    const st = isState(cg.nodes[t.main]);
    const skew = st ? 0 : rnd() < 0.5 ? -0.6 : 0.6;
    // I2e: the pool's ink lies on each side as its threads' ink leaves it (a pool with no thread, evenly)
    const kidsI = t.kids.get(t.main);
    const inkAll = kidsI.reduce((a, w) => a + t.ink.get(w), 0);
    const inkOut = kidsI.reduce((a, w) => a + (leavesOutward(t.parent.get(w).label, cg.nodes[w]) ? t.ink.get(w) : 0), 0);
    const fOut = inkAll > 0 ? 0.15 + (0.7 * inkOut) / inkAll : 0.5;
    // a pool's ink grows with its clause's (I2e), up to what one stroke can hold (1.3 times the median pool); a
    // state's is gathered, deeper by 1 over E_STATE; on a squeezed ring the same ink is laid shorter and shallower
    // alike (depth with the square root of the squeeze)
    const depth = INK.DEPTH * R * (0.9 + 0.2 * rnd()) * Math.min(1.3, Math.sqrt(t.V / 6)) * (st ? 1 / INK.E_STATE : 1) * Math.sqrt(squeeze);
    const nSeed = fnv1a(`${cert}:${t.main}:rim`);
    // a puddle dragged along the stroke: a steep front, a long tail (the skew's sign is the drag's direction)
    const prof = (x) => { const b = 1 - x * x; if (b <= 0) return 0; const y = (x - skew) / (1 + (x > skew ? -skew : skew)); const c = 1 - y * y; return c <= 0 ? 0 : c * Math.sqrt(c * b); };
    // I2c: one lump per radical of the main event's concept, as high as its word in the code
    const rads = [...(cg.nodes[t.main].c || [])].sort(), nr = Math.max(1, rads.length), lw = (1.6 / nr) * 0.62;
    const lumpEnv = (x) => {
      if (!rads.length) return 1;
      let m = 0;
      rads.forEach((r, q) => { const u = (x - (nr === 1 ? 0 : -0.55 + (1.1 * q) / (nr - 1))) / lw; if (u * u < 1) m = Math.max(m, lumpHeight(r) * (1 - u * u) * (1 - u * u)); });
      return 0.3 + 0.7 * m;
    };
    const hOut = (phi) => { const x = wrap(phi - th) / half; return Math.abs(x) >= 1 ? 0 : depth * fOut * prof(x) * lumpEnv(x) * (1 + 0.4 * fbm1(nSeed, x * 6, 5)); };
    const hIn = (phi) => { const x = wrap(phi - th) / half; return Math.abs(x) >= 1 ? 0 : depth * (1 - fOut) * prof(x) * lumpEnv(x) * (1 + 0.4 * fbm1(nSeed + 1, x * 6, 5)); };
    const wr = INK.W_RING * R / 2;
    const n = Math.max(16, Math.ceil(((2 * half * DEG) * R) / 2));
    const P = new Float64Array(4 * n);
    for (let i = 0; i < n; i++) {
      const phi = th - half + (2 * half * i) / (n - 1), r0 = rc(phi), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const ro = r0 + Math.max(wr, INK.CORE * hOut(phi)), ri = r0 - Math.max(wr, INK.CORE * hIn(phi));
      P[2 * i] = toX(ro * cs); P[2 * i + 1] = toY(ro * sn);
      P[2 * (2 * n - 1 - i)] = toX(ri * cs); P[2 * (2 * n - 1 - i) + 1] = toY(ri * sn);
    }
    fillPolygon(body, S, P);
    // I2b: the rest of the pool is laid by brush strokes along the drag, never as one filled shape (the method of
    // stevequinn/heptapod, MIT, research/SOURCES.md 1): each stroke runs along the ring at a fixed share of the
    // pool's depth on one side, pointed at both ends, shifted toward the pool's tail; past the pool's end it
    // follows the depth down to the carrier, so the pool streams out along the stroke.
    const drnd = streamOf(cert, t.main, 'deposit');
    const tail = skew >= 0 ? -1 : 1;
    const nDep = Math.round(INK.DEPOSITS * 2 * half);
    for (let i = 0; i < nDep; i++) {
      const side = drnd() < fOut ? 1 : -1, share = Math.sqrt(drnd());
      const len = 2 * half * (0.2 + 0.6 * drnd());
      const mid = th + (drnd() * 2 - 1) * half + tail * len * 0.3 * drnd();
      const ws = R * (0.006 + 0.028 * drnd() * drnd());
      const nS = Math.max(8, Math.ceil(((len * DEG) * R) / Math.max(1, ws / 3)));
      for (let q = 0; q <= nS; q++) {
        const u = q / nS, phi = mid - len / 2 + len * u;
        if (Math.abs(wrap(phi - th)) > 1.5 * half || inGap(phi)) continue;
        const env = Math.max(wr, side > 0 ? hOut(phi) : hIn(phi));
        const r = rc(phi) + side * share * env, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
        const wq = ws * Math.sqrt(4 * u * (1 - u));
        if (wq >= 1) stampDisc(body, S, toX(r * cs), toY(r * sn), wq / 2);
      }
    }
    pools.push({ j, th, half, hOut, hIn });
    report.pools.push({ spanDeg: +(2 * half).toFixed(2), depthR: +(depth / R).toFixed(3), nodes: t.n });
    if (trace) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const phi = th - half + (2 * half * i) / 8, r0 = rc(phi); pts.push([toX(r0 * cosK(phi * DEG)), toY(r0 * sinK(phi * DEG))]); }
      trace.pools.push({ node: t.main, pts });
    }

    // I5: rim spikes, spaced by the rim's fastest-growing wavelength
    const lam = 9.02 * INK.RIM_A * R;
    const srnd = streamOf(cert, t.main, 'spikes');
    for (const side of [1, -1]) {
      const arcLen = 2 * half * DEG * R;
      const m = Math.floor(arcLen / lam);
      for (let i = 0; i < m; i++) {
        const phi = th - half + ((i + 0.5 + 0.4 * (srnd() - 0.5)) * 2 * half) / m;
        const h = side > 0 ? hOut(phi) : hIn(phi);
        if (h < wr) continue;
        const r0 = rc(phi) + side * h, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
        const len = R * (0.01 + 0.025 * srnd() * srnd()), w = R * (0.006 + 0.008 * srnd());
        const head = phi * DEG + (side > 0 ? 0 : PI) + (srnd() - 0.5) * 0.9;
        thread(body, S, toX(r0 * cs), toY(r0 * sn), head, len, w, { flare: 1.2, end: 0.35, turn: 0.2, seed: srnd() * 4294967296 >>> 0 });
        report.spikes++;
      }
    }

    // I2d: the crown is the code, a fan across each radical's lump on the side holding more ink
    {
      const crnd = streamOf(cert, t.main, 'crown');
      const side = fOut >= 0.5 ? 1 : -1;
      // where a leg leaves the rim its thread drains the rim's ink, so no crown cell grows within DRAIN of its root
      const legsAt = t.kids.get(t.main).map((w, i, all) => skew + (all.length === 1 ? 0 : -0.35 + (0.7 * i) / (all.length - 1)));
      const drain = (lw * 0.85) / 4.5;
      rads.forEach((r, q) => {
        const w = lumpWord(r);
        if (!w) return;
        const xc = nr === 1 ? 0 : -0.55 + (1.1 * q) / (nr - 1);
        for (let c = 0; c < 9; c++) {
          if (w[c] === 0) continue;
          const xx = xc + ((c - 4) * lw * 0.85) / 4.5, phi = th + xx * half;
          if (legsAt.some((xl) => Math.abs(xl - xx) < 1.5 * drain)) continue;
          const h = Math.max(wr, side > 0 ? hOut(phi) : hIn(phi));
          const r0 = rc(phi) + side * h * 0.85, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
          const head = phi * DEG + (side > 0 ? 0 : PI) + (c - 4) * 0.13 + (crnd() - 0.5) * 0.15;
          const len = R * INK.FIL_LEN * (w[c] === 2 ? 0.75 + 0.5 * crnd() : 0.3 + 0.1 * crnd());
          thread(body, S, toX(r0 * cs), toY(r0 * sn), head, len, R * INK.SHAFT * (0.7 + 0.3 * crnd()), { flare: 1.6, end: 0.75, turn: 1, seed: (crnd() * 4294967296) >>> 0, bulb: w[c] === 2, rnd: crnd });
          if (w[c] === 2) report.crownTendrils++; else report.crownStubs++;
        }
      });
    }

    // I5b: spray. Drops thrown off the pool's rim as the brush leaves it, more on the side it holds more
    // ink on; radii from a power law (many small, few large), within 0.3 R of the rim.
    const prnd = streamOf(cert, t.main, 'spray');
    const nSpray = Math.round((2 * half) / INK.SPRAY_DEG);
    for (let i = 0; i < nSpray; i++) {
      const phi = th + (prnd() * 2 - 1) * half * 1.1, side = prnd() < fOut ? 1 : -1;
      if (inGap(phi)) { prnd(); prnd(); continue; }
      const h = Math.max(wr, side > 0 ? hOut(phi) : hIn(phi));
      const u = prnd(), off = R * (0.02 + 0.28 * u * u);
      const r0 = rc(phi) + side * (h + off), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const v = prnd();
      stampDisc(body, S, toX(r0 * cs), toY(r0 * sn), R * (0.003 + 0.012 * v * v * v));
      report.satellites++;
    }

    // I3, I4: the threads
    const kids0 = t.kids.get(t.main);
    const nk = kids0.length;
    kids0.forEach((w, i) => {
      const lab = t.parent.get(w).label;
      const out = leavesOutward(lab, cg.nodes[w]);
      // the crown: threads erupt where the pool is deepest (a splash's rim fingers), spread over 0.7 of its half span
      const x = skew + (nk === 1 ? 0 : -0.35 + (0.7 * i) / (nk - 1));
      const phi = th + x * half;
      const h = out ? Math.max(wr, hOut(phi)) : Math.max(wr, hIn(phi));
      const side = out ? 1 : -1;
      const r0 = rc(phi) + side * 0.75 * h, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const frnd = streamOf(cert, w, 'thread');
      const lean = leanOf(lab) * DEG;
      const head = phi * DEG + (out ? 0 : PI) + side * lean;
      drawNode(t, w, toX(r0 * cs), toY(r0 * sn), head, 1, frnd, 0);
      report.filamentsDrawn++;
      if (out) report.outward++;
    });
  }

  function drawNode(t, w, x, y, head, scale, rnd, depthLevel) {
    const sub = t.size.get(w);
    // I4: one slenderness, so length and shaft grow with the cube root of the node's ink; the hand varies both a little
    const g3 = cbrt(inkOf(cg.nodes[w]) / INK.C_REF);
    const len = INK.FIL_LEN * R * scale * (1 + 0.35 * (sub - 1)) * g3 * (0.87 + 0.3 * rnd());
    const shaft = INK.SHAFT * R * scale * g3 * (1.1 + 0.25 * rnd()) * (1 + 0.1 * (sub - 1));
    const isEntity = cg.nodes[w].k === 'entity';
    const tip = thread(body, S, x, y, head, len, shaft, { flare: depthLevel ? 1.6 : 3.4, end: 0.75, turn: 1, seed: (rnd() * 4294967296) >>> 0, bulb: isEntity, rnd, report, word: wordOf(cg.nodes[w]) });
    report.threads++;
    if (trace) trace.threads.push({ node: w, label: t.parent.get(w).label, pts: tip.path.map((q) => [q[0], q[1]]) });
    const kids = t.kids.get(w);
    kids.forEach((u, i) => {
      const at = 0.15 + (0.3 * (i + 1)) / (kids.length + 1);
      const p = tip.path[Math.min(tip.path.length - 1, Math.floor(at * (tip.path.length - 1)))];
      const sideB = i % 2 ? -1 : 1;
      drawNode(t, u, p[0], p[1], p[2] + sideB * (0.3 + 0.25 * rnd()), scale * 0.75, streamOf(cert, u, 'thread'), depthLevel + 1);
    });
  }

  // ---------- I6: the carrier, a hairy brush ----------
  const poolNear = (phi) => {
    let d = Infinity;
    for (const p of pools) { const x = Math.abs(wrap(phi - p.th)) - p.half; d = Math.min(d, Math.max(0, x)); }
    return d * DEG; // radians of arc beyond the nearest pool
  };
  const gap1 = gapMid + gapLen / 2;
  const NB = INK.BRISTLES;
  const brnd = mulberry32(fnv1a(`${cert}:bristles`));
  const thr = Array.from({ length: NB }, () => 0.08 + 0.5 * brnd());
  const bSeed = Array.from({ length: NB }, () => (brnd() * 4294967296) >>> 0);
  const steps = Math.ceil(TAU * R);
  const strokeDeg = 360 - gapLen;
  for (let s = 0; s < steps; s++) {
    const a = (strokeDeg * s) / steps, phi = gap1 + a;
    const taper = Math.min(1, Math.min(a, strokeDeg - a) / INK.TAPER_DEG);
    const d = poolNear(phi) * R;
    const Kd = INK.LOAD_ARC * R;
    const q = INK.LOAD_FLOOR + ((1 - INK.LOAD_FLOOR) * Kd * Kd) / (Kd * Kd + d * d);
    // pressure: the hand presses and lifts along the stroke
    const press = 0.55 + 0.45 * fbm1(wobSeed + 11, phi / 12, 4, 30);
    const w = INK.W_RING * R * (0.25 + 0.75 * q) * (0.5 + 0.5 * taper) * (0.45 + press);
    const r0 = rc(phi), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
    for (let b = 0; b < NB; b++) {
      const u = -1 + (2 * (b + 0.5)) / NB;
      const load = q * taper * press * (1 + 0.7 * fbm1(bSeed[b], phi / 2, 4));
      if (load < thr[b] * (0.5 + 1.1 * Math.abs(u))) continue;
      const rr = r0 + (u * w) / 2;
      stampDisc(bristle, S, toX(rr * cs), toY(rr * sn), Math.max(1.2, w / NB));
    }
  }

  // ---------- I7: spreading, then drying ----------
  const tmp = new Float32Array(S * S);
  boxBlur(body, S, Math.max(1, Math.round(INK.INK_SPREAD * R / 1.7)), tmp);
  boxBlur(bristle, S, Math.max(1, Math.round(INK.INK_SPREAD * R / 5)), tmp);
  const d = new Uint8Array(S * S);
  let ink = 0;
  for (let i = 0; i < S * S; i++) if (body[i] >= 0.5 || bristle[i] >= 0.5) { d[i] = 1; ink++; }
  return {
    ok: true, version: INK.version, W: S, H: S, d, R, cx: c0, cy: c0, clauses: k, nodes: cg.n,
    spansDeg: Array.from(sp, (x) => +x.toFixed(2)), arcsDeg: Array.from(arcs, (x) => +x.toFixed(2)), centresDeg: Array.from(centreDeg, (x) => +(((x % 360) + 360) % 360).toFixed(3)),
    masses: gorder.map((gi) => groups[gi].slice()), massSpansDeg: Array.from(msp, (x) => +x.toFixed(3)), massCentresDeg: Array.from(massCentreDeg, (x) => +(((x % 360) + 360) % 360).toFixed(3)), gapDeg: +gapLen.toFixed(2), gapMidDeg: +(((gapMid % 360) + 360) % 360).toFixed(3), squeeze: +squeeze.toFixed(3),
    ink, ...report, ...(trace ? { trace } : {}),
  };
}

/* One thread of ink from (x, y), heading `head` (radians, y up), length `len`, shaft width `shaft` (pixels).
   It flares to `flare` shafts at its root, tapers to `end` shafts at its tip, turns by o.word (a node's word, I4)
   and the hand's small wander or, with no word, by a smooth noise, and with
   o.bulb ends in a drop of radius 1.89 times the tip's (I4), shedding up to two satellites. */
function thread(F, S, x, y, head, len, shaft, o) {
  const rnd = o.rnd || mulberry32(o.seed);
  const n = Math.max(4, Math.ceil(len / Math.max(1, shaft * 0.35)));
  const ds = len / n;
  const seed = o.seed >>> 0;
  const f0 = fbm1(seed, 0, 4);
  // I4: a thread that carries a word turns by it, cell by cell from its root, plus the hand's small wander; any other
  // thread (a crown cell, a rim spike, a node with no concept) turns by the noise alone
  const word = o.word && o.word.length ? o.word : null;
  let curl = 0, amp = INK.TREMOR;
  const turnAt = [0];
  if (word) for (let c = 0; c < word.length; c++) turnAt.push(turnAt[c] + INK.TURN_CELL * (word[c] - 1));
  else { curl = (rnd() * 2 - 1) * 1.3 * o.turn; amp = (0.55 + 0.55 * rnd()) * o.turn; }
  const wordTurn = (t) => {
    if (!word) return 0;
    const x = t * word.length, c = Math.min(word.length - 1, Math.floor(x));
    return turnAt[c] + (x - c) * (turnAt[c + 1] - turnAt[c]);
  };
  const width = (t) => (t < 0.18 ? shaft * (1 + (o.flare - 1) * (1 - t / 0.18) * (1 - t / 0.18)) : shaft * (1.1 - ((1.1 - o.end) * (t - 0.18)) / 0.82)) * (1 + 0.08 * noise1(seed + 3, t * 9));
  const path = [];
  let X = x, Y = y, h = head;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    h = head + curl * t + wordTurn(t) + amp * (fbm1(seed, t * 4, 4) - f0);
    stampDisc(F, S, X, Y, width(t) / 2);
    path.push([X, Y, h]);
    X += ds * cosK(h); Y -= ds * sinK(h);
  }
  if (o.bulb) {
    const rt = width(1) / 2, rb = 1.89 * rt;
    const bx = X + rb * 0.5 * cosK(h), by = Y - rb * 0.5 * sinK(h);
    stampDisc(F, S, bx, by, rb);
    if (o.report) o.report.bulbs++;
    const nSat = rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2;
    let dist = rb;
    for (let i = 0; i < nSat; i++) {
      dist += rb * (1.4 + 1.6 * rnd());
      const rs = rb * (0.35 + 0.35 * rnd());
      const hh = h + (rnd() - 0.5) * 0.3;
      stampDisc(F, S, bx + dist * cosK(hh), by - dist * sinK(hh), rs);
      if (o.report) o.report.satellites++;
    }
  }
  return { path, tip: [X, Y] };
}
