/* ============================================================
   dimensional_mania/narrator.js — the Witness, the lab's own voice.

   Every sentence it says is assembled from numbers the engine has just
   computed (the ledger, the cut, the rotation spectrum, the counts), so
   it can be wrong only if the engine is. Three jobs:
     · ambient lines while the visitor watches, rotated slowly
     · event lines when something changes type (the cut, the motion)
     · answers to typed questions: a deterministic engine that is good
       on its own, and the prompt + validation for the one model call
       a question may make (labs/assets/js/ai/llm.js)
   ============================================================ */

import { AXES, PRESETS } from './constants.js';
import { catalogue, regularCount } from './polytopes.js';
import { fmt, sgn } from './dom.js';

const ax = (d) => AXES[d];
const planeName = (p) => `${AXES[p.i]}–${AXES[p.j]}`;
const unitOf = (n) => (n === 2 ? 'units' : n === 3 ? 'square units' : 'cubic units');
const measureName = (n) => (n === 2 ? 'length' : n === 3 ? 'area' : '3-volume');

export function fvecText(o) {
  return o.fvec.map((f) => fmt(f.count)).join(', ');
}

/* ---------------- ambient and event lines ---------------- */

export function ambientLines(c) {
  const out = [];
  const o = c.obj;
  if (c.n >= 4 && c.hot && c.hot.axis >= 0 && c.proj === 'persp' && c.hot.vertex) {
    out.push(`${ax(c.hot.axis)} bends the shadow most: ${c.hot.vertex.label} sits at ${ax(c.hot.axis)} = ${sgn(c.hot.vertex.depth)}, so perspective draws it ${c.hot.vertex.scale.toFixed(2)} times its size.`);
  }
  if (c.n >= 4 && c.proj === 'ortho') {
    out.push(`Orthographic: the screen keeps rows X, Y, Z of the matrix and drops the rest. ${c.hidden} hidden ${c.hidden === 1 ? 'axis is' : 'axes are'} flattened onto the picture without a trace.`);
  }
  if (c.proj === 'stereo') {
    out.push(`Stereographic: the 3-sphere is unrolled from its pole at W = 1. Points near the pole fly outward, and every great circle lands as a circle.`);
  }
  if (c.flow) {
    const f = c.flow;
    out.push(`Hopf flow: the ${o.name}’s ${o.nv} vertices lie on ${f.count} great circles${f.perCircle ? ` of ${f.perCircle}` : ''}. Left multiplication by a unit quaternion moves every vertex along its own circle${f.perCircle ? `, and after a turn of 360/${f.perCircle} degrees the polytope lands on itself` : ''}.`);
  }
  if (c.spin.length) {
    const sp = c.speeds.filter((s) => s > 1e-6);
    const k = c.spin.length;
    if (k >= 2 || sp.length >= 2) {
      const iso = sp.length >= 2 && Math.abs(sp[0] - sp[1]) < 1e-6;
      out.push(`${k} ${k === 1 ? 'plane is' : 'planes are'} turning. Read as a matrix, the motion is ${sp.length} ${sp.length === 1 ? 'spin' : 'spins'} in perpendicular planes at ${sp.map((s) => s.toFixed(2)).join(' and ')} rad/s${iso ? '. The speeds are equal: an isoclinic rotation' : ''}.`);
    } else {
      out.push(`One plane is turning, ${planeName(c.spin[0])}. Every axis outside it stays put; in ${c.n}D that leaves ${c.n - 2} still ${c.n - 2 === 1 ? 'axis' : 'axes'}.`);
    }
  }
  if (c.slice && c.slice.kind !== 'empty' && c.n >= 2) {
    const s = c.slice;
    const m = s.measure != null && s.measure > 0 ? ` Its ${measureName(c.n)} is ${s.measure.toFixed(3)} ${unitOf(c.n)}.` : '';
    if (c.n === 4 && s.kind === 'polyhedron') {
      out.push(`The cut at W = ${sgn(s.h)} is ${article(s.name)}: ${s.counts[0]} vertices, ${s.counts[1]} edges, ${s.counts[2]} faces, and ${s.counts[0]} − ${s.counts[1]} + ${s.counts[2]} = ${s.counts[0] - s.counts[1] + s.counts[2]}.${m}`);
      if (c.proj === 'persp') out.push(`Every point of the cut sits at W = ${sgn(s.h)}, so perspective draws all of it at one scale, ${s.scale.toFixed(2)} times. It is the one part of the shadow with true proportions.`);
    } else if (c.n === 3) {
      out.push(`A Flatlander in the plane Z = ${sgn(s.h)} sees ${article(s.name)}.${m}`);
    } else if (c.n >= 5) {
      out.push(`The cut of a ${c.n}D object is ${c.n - 1}-dimensional, so the view can show only its shadow: ${s.counts[0]} vertices and ${s.counts[1]} edges at ${ax(c.n - 1)} = ${sgn(s.h)}.`);
    }
  }
  if (c.check && c.check.maxDev != null) {
    out.push(`The measured ${measureName(c.n)} curve and the cube’s closed formula differ by at most ${c.check.maxDev.toExponential(1)} over ${c.check.samples} heights.`);
  }
  if (c.link) out.push(`The two bright gold paths link ${c.link.value.toFixed(3)} times by Gauss’s integral over ${c.link.segs} × ${c.link.segs} segments. A linking number is an integer; the remainder is discretisation.`);
  if (!o.curved && o.euler) {
    out.push(`${capital(o.name)}, ${o.schlafli}: ${fvecText(o)}. The alternating sum is ${o.euler.chi}, as Euler-Poincaré requires in ${c.n}D.`);
  }
  if (o.id === 'torus') out.push('The Clifford torus is flat inside the 3-sphere: its two circles have equal radius 1/√2. Stereographic projection bends it into a ring, and a 4D turn rolls it inside out.');
  if (o.id === 'hopf') out.push(`${o.fibres.length} Hopf fibres, each a great circle of the 3-sphere. Circles on one ring lie on one torus, and any two fibres link exactly once.`);
  if (c.n >= 6) out.push(`${fmt(o.nv)} corners in one 3D picture: many must fall on top of each other. From here the counts and the ledger say more than the image.`);
  if (c.n <= 3 && !c.slice) out.push(`${capital(o.name)} in ${c.n}D: nothing is hidden, the picture is the object. Turn on the slice to meet the Flatlander.`);
  return out;
}

export function eventLine(prev, c) {
  if (!prev) return null;
  if (c.slice && prev.slice && c.slice.name !== prev.slice.name && c.n >= 3 && prev.n === c.n && prev.objId === c.obj.id) {
    const crossed = c.crossed != null ? ` It crossed a vertex at ${ax(c.n - 1)} = ${sgn(c.crossed)}.` : '';
    return `The cut changed from ${article(prev.slice.name)} to ${article(c.slice.name)}.${crossed}`;
  }
  if (prev.preset !== c.preset && c.spin.length) {
    const sp = c.speeds.filter((s) => s > 1e-6);
    if (c.preset === 'iso') return `Isoclinic: two perpendicular planes at the same speed. Every corner now travels a great circle${c.proj === 'stereo' ? ', and the gold paths are Hopf circles' : ''}.`;
    if (c.preset === 'all') return `All ${c.spin.length} planes turning, yet the motion is ${sp.length} independent ${sp.length === 1 ? 'spin' : 'spins'}: every rotation of R${c.n} reduces to at most ${Math.floor(c.n / 2)}.`;
  }
  return null;
}

function article(name) {
  if (/^(a|an|nothing) /.test(name) || name === 'nothing') return name;
  return (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------- the deterministic answer engine ---------------- */

const TOPICS = [
  {
    test: /120/,
    run: () => ({ answer: 'The 120-cell {5,3,3} has 600 vertices, 1200 edges, 720 pentagons and 120 dodecahedral cells; this page computes it as the dual of the 600-cell, one vertex at the centre of each of its 600 tetrahedra. Showing it under stereographic projection, where its cells read as soap bubbles.', show: { n: 4, obj: 'c120', proj: 'stereo', view: 'shadow' } }),
  },
  {
    test: /600/,
    run: () => ({ answer: 'The 600-cell {3,3,5} has 120 vertices, 720 edges, 1200 triangles and 600 tetrahedral cells. Its vertices are the 120 unit quaternions of the binary icosahedral group. Showing it under stereographic projection.', show: { n: 4, obj: 'c600', proj: 'stereo', view: 'shadow' } }),
  },
  {
    test: /24[\s-]*cell|icositetrachoron/i,
    run: () => ({ answer: 'The 24-cell {3,4,3} has 24 vertices, 96 edges, 96 triangles and 24 octahedral cells. It is its own dual and has no analogue in any other dimension. Its equatorial cut, vertex first, is a cuboctahedron.', show: { n: 4, obj: 'c24', view: 'both', proj: 'persp', sweep: true } }),
  },
  {
    test: /hopf|fib(re|er)|link/i,
    run: () => ({ answer: 'The Hopf fibration fills the 3-sphere with great circles, one over each point of the ordinary sphere, and any two of them link exactly once (Hopf 1931). Shown under stereographic projection; the two gold circles carry the measured linking number.', show: { n: 4, obj: 'hopf', proj: 'stereo', view: 'shadow', preset: 'single' } }),
  },
  {
    test: /torus|clifford/i,
    run: () => ({ answer: 'The Clifford torus is the set of points of the 3-sphere with both circle radii 1/√2. Inside the 3-sphere it is flat. Stereographic projection bends it into a ring, and turning the X–W plane rolls that ring through itself.', show: { n: 4, obj: 'torus', proj: 'stereo', view: 'shadow', preset: 'single' } }),
  },
  {
    test: /isoclinic|double rotation|two planes|clifford (translation|parallel)/i,
    run: (q, c) => ({ answer: `In 4D, two perpendicular planes can turn at once. At equal speeds the turn is isoclinic: every point moves along a great circle at the same rate, and the circles are Hopf fibres that link in pairs. ${c.n === 4 ? 'Switching it on with stereographic projection and trails.' : 'Moving to 4D to show it.'}`, show: { n: 4, preset: 'iso', proj: 'stereo', trails: true, view: 'shadow' } }),
  },
  {
    test: /slice|cut|cross[\s-]?section|flatland|pass(es|ing)? through/i,
    run: (q, c) => {
      const n = c.n >= 3 && c.n <= 4 ? c.n : 4;
      const s = c.slice;
      const now = s && c.n === n && s.kind !== 'empty' ? ` Right now the cut at ${ax(n - 1)} = ${sgn(s.h)} is ${article(s.name)}.` : '';
      return {
        answer: `A slice keeps the points of the object at one height along the last axis, the way a Flatlander sees a cube only where it crosses the plane. The cut changes type only when the hyperplane crosses a vertex, marked as ticks on the profile.${now} Sweeping it now.`,
        show: { n, view: 'both', sweep: true, proj: 'persp' },
      };
    },
  },
  {
    test: /inside[\s-]?out|inner cube|smaller cube|cube inside/i,
    run: () => ({ answer: 'The inner cube is the far half of the tesseract along W. Perspective divides by the distance in W, so the far half is drawn smaller. Turning the X–W plane trades the near and far halves, which looks like the object turning inside out. Only the shadow does.', show: { n: 4, obj: 'cube', preset: 'single', proj: 'persp', view: 'shadow' } }),
  },
  {
    test: /euler|chi\b|χ|alternating/i,
    run: (q, c) => ({ answer: c.obj.euler && !c.obj.curved
      ? `For a convex polytope in nD, f0 − f1 + f2 − ... = 1 − (−1)^n: 2 in odd dimensions, 0 in even ones (Schläfli 1852; proved by Poincaré 1893). For the ${c.obj.name} the counts ${fvecText(c.obj)} alternate to ${c.obj.euler.chi}; the table says how each count was obtained.`
      : 'For a convex polytope in nD, f0 − f1 + f2 − ... = 1 − (−1)^n. The Clifford torus on its grid gives V − E + F = 0, the Euler characteristic of a torus.', show: null }),
  },
  {
    test: /how many|regular|platonic|only three|why.*(three|3)/i,
    run: () => ({ answer: 'Regular convex polytopes: infinitely many polygons in 2D, 5 solids in 3D, 6 in 4D, and from 5D up only the simplex, the cube and the cross-polytope (Schläfli 1852). The count is an angle argument: the facets meeting around each face of dimension n − 3 must have dihedral angles summing to less than a full turn, and above four dimensions only the three families can.', show: { n: 4, obj: 'c24' } }),
  },
  {
    test: /matrix|rotation|rotate|plane|so\(n\)|spin/i,
    run: (q, c) => ({ answer: `In ${c.n}D there are ${c.n * (c.n - 1) / 2} coordinate planes to turn in, one per pair of axes. The matrix shows where each axis has gone; the screen sees its top three rows. However many planes turn, the motion is at most ${Math.floor(c.n / 2)} independent spins in perpendicular planes, and the spectrum line reads them off the generator.`, show: { preset: 'all' } }),
  },
  {
    test: /stereo/i,
    run: () => ({ answer: 'Stereographic projection maps the 3-sphere to our space from its pole, x -> xyz / (1 − w). It keeps angles and sends circles to circles, so the edges of a 4D polytope inscribed in the sphere arrive as arcs.', show: { n: 4, proj: 'stereo', view: 'shadow' } }),
  },
  {
    test: /simplex|5-cell|tetrahedron|pentachoron/i,
    run: (q, c) => ({ answer: `The simplex is the smallest polytope in each dimension: n + 1 vertices, all at the same distance from each other. Its k-faces number C(n+1, k+1). In ${Math.max(2, c.n)}D that is ${Array.from({ length: Math.max(2, c.n) }, (_, k) => binom(Math.max(2, c.n) + 1, k + 1)).join(', ')}.`, show: { obj: 'simplex', n: Math.max(2, c.n) } }),
  },
  {
    test: /cross|orthoplex|octahedron|16[\s-]*cell/i,
    run: (q, c) => ({ answer: `The cross-polytope has its 2n vertices at plus and minus each unit axis; in 3D it is the octahedron, in 4D the 16-cell. It is the dual of the cube: each vertex of one sits at the centre of a facet of the other.`, show: { obj: 'cross', n: Math.max(2, c.n) } }),
  },
  {
    test: /\btime\b|fourth dimension|what is (the )?4d|is (this|it) real/i,
    run: () => ({ answer: 'Here the fourth axis is a direction in space like the other three, perpendicular to all of them, not time. Nothing on screen is the 4D object itself: you see either a shadow, which distorts, or a slice, which is exact but partial.', show: { n: 4, obj: 'cube', view: 'both', sweep: true } }),
  },
  {
    test: /\b(\d{1,2})\s*-?\s*(d\b|dim|dimension)/i,
    run: (q, c) => {
      const n = Math.max(1, Math.min(10, parseInt(q.match(/(\d{1,2})\s*-?\s*(d\b|dim|dimension)/i)[1], 10)));
      return {
        answer: `In ${n}D there ${n === 2 ? 'are infinitely many regular polygons' : `${regularCount(n) === 1 ? 'is 1 regular polytope' : `are ${regularCount(n)} regular polytopes`}`}. The ${n}-cube has ${fmt(2 ** n)} vertices and ${fmt(n * 2 ** (n - 1))} edges, and there are ${n * (n - 1) / 2} planes to turn in. Showing it now.`,
        show: { n, obj: 'cube', proj: n >= 6 ? 'ortho' : 'persp' },
      };
    },
  },
];

function binom(n, k) { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return Math.round(c); }

export function answerLocally(q, c) {
  for (const t of TOPICS) if (t.test.test(q)) return t.run(q, c);
  const o = c.obj;
  const s = c.slice && c.slice.kind !== 'empty' ? ` The current cut is ${article(c.slice.name)}.` : '';
  return {
    answer: `On screen: the ${o.name}${o.schlafli ? ' ' + o.schlafli : ''} in ${c.n}D, ${fvecText(o)} by rank.${s} Try asking about slices, the 120-cell, isoclinic rotation, the Hopf fibres, Euler's formula or why only three regular polytopes exist above 4D.`,
    show: null,
  };
}

/* ---------------- the model call: prompt and validation ---------------- */

export const SYSTEM = [
  'You are the Witness, the voice of an interactive geometry instrument that shows objects of 1 to 10 dimensions as shadows (projections) and slices (cross-sections).',
  'Answer the visitor in at most 90 words, in plain sentences, no markdown. Use the numbers in the live state as ground truth. Never invent a citation. Do not guess geometry: if the facts and the state do not settle the question, say which view on the instrument would show it.',
  'Facts you may use: regular convex polytopes number infinitely many in 2D, 5 in 3D, 6 in 4D, 3 in each dimension from 5 up (Schläfli 1852). Euler-Poincaré: f0 - f1 + f2 - ... = 1 - (-1)^n. A rotation of R^n is at most floor(n/2) spins in perpendicular planes. An isoclinic rotation turns two perpendicular planes at equal speed; its orbits are Hopf circles that link once (Hopf 1931). A slice of a 4D object at constant W is drawn by perspective at a single scale.',
  'If a different view would answer better, add "show" using only: n (1-10), obj (cube for n=1; simplex, cube, cross for n>=2; p5, p6 when n=2; dodeca, icosa when n=3; c24, c600, c120, torus, hopf when n=4), view (shadow, both, slice), proj (persp, ortho, stereo; stereo only when n=4), preset (hold, single, double, iso, all), sweep (true/false), trails (true/false).',
  'Reply as JSON: {"answer": "...", "show": {...}} and omit show when not needed.',
].join('\n');

export function promptFor(q, c) {
  const state = {
    n: c.n, object: c.obj.name, schlafli: c.obj.schlafli || null, f_vector: c.obj.fvec.map((f) => f.count),
    euler: c.obj.euler ? c.obj.euler.chi : null, view: c.view, projection: c.proj, motion: PRESETS[c.preset].label,
    spinning_planes: c.spin.map(planeName), spin_speeds_rad_s: c.speeds.map((s) => +s.toFixed(3)),
    slice: c.slice ? { at: +c.slice.h.toFixed(3), shape: c.slice.name, counts: c.slice.counts, measure: c.slice.measure != null ? +c.slice.measure.toFixed(4) : null } : null,
    ledger_hottest_axis: c.hot && c.hot.axis >= 0 ? AXES[c.hot.axis] : null,
  };
  return `Live state: ${JSON.stringify(state)}\nVisitor asks: ${q}`;
}

const VIEWS = new Set(['shadow', 'both', 'slice']);
const PROJS = new Set(['persp', 'ortho', 'stereo']);

/** keep only keys and values the instrument accepts */
export function validateShow(show, current) {
  if (!show || typeof show !== 'object') return null;
  const out = {};
  let n = current.n;
  if (Number.isInteger(show.n) && show.n >= 1 && show.n <= 10) { out.n = show.n; n = show.n; }
  if (typeof show.obj === 'string' && catalogue(n).some((c) => c.id === show.obj)) out.obj = show.obj;
  if (VIEWS.has(show.view)) out.view = show.view;
  if (PROJS.has(show.proj) && (show.proj !== 'stereo' || n === 4)) out.proj = show.proj;
  if (typeof show.preset === 'string' && PRESETS[show.preset]) out.preset = show.preset;
  if (typeof show.sweep === 'boolean') out.sweep = show.sweep;
  if (typeof show.trails === 'boolean') out.trails = show.trails;
  return Object.keys(out).length ? out : null;
}

export function cleanAnswer(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 640);
}
