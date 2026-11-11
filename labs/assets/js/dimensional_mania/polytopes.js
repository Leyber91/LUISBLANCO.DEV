/* ============================================================
   dimensional_mania/polytopes.js — the objects, built from their
   coordinates and counted from their geometry. Pure maths.

   Every regular convex polytope there is (Schlafli 1852; tabulated in
   H. S. M. Coxeter, Regular Polytopes, 3rd ed., Dover, 1973, Table I):
     · in every dimension n >= 2: the simplex, the cube, the cross-polytope
     · in 2D: a regular p-gon for every p (here 3, 4, 5, 6)
     · in 3D also the dodecahedron and the icosahedron
     · in 4D also the 24-cell, the 600-cell and the 120-cell
   plus two curved objects that live on the 3-sphere: the Clifford torus
   and a bundle of Hopf fibres (Hopf 1931, Mathematische Annalen 104).

   How each count is obtained (shown on the page beside the number):
     f0  vertices: the construction below
     f1  edges: every vertex pair at the shortest distance
     f(n-1) facets: the vertices on each supporting hyperplane, whose
         normals are the vertices of the dual polytope
     f(n-2) ridges: the facet pairs whose shared vertices span n-2 dimensions
     f2  for n >= 5: enumerated from the family's combinatorial definition
     any other rank: the family's closed formula (Coxeter 1973)
   then the Euler-Poincare sum f0 - f1 + f2 - ... = 1 - (-1)^n is checked.
   Every object is scaled to circumradius 1 and centred at the origin.
   ============================================================ */

import { affineDim, binomial } from './linalg.js';

export const PHI = (1 + Math.sqrt(5)) / 2;

/* ---------------- constructions (flat Float64Array, stride n) ---------------- */

function fromList(list, n) {
  const V = new Float64Array(list.length * n);
  list.forEach((p, i) => { for (let k = 0; k < n; k++) V[i * n + k] = p[k]; });
  return V;
}

function toUnitSphere(V, n) {
  let r = 0;
  for (let i = 0; i < V.length; i += n) {
    let s = 0;
    for (let k = 0; k < n; k++) s += V[i + k] * V[i + k];
    r = Math.max(r, Math.sqrt(s));
  }
  if (r > 0) for (let i = 0; i < V.length; i++) V[i] /= r;
  return V;
}

/** Regular n-simplex: the n+1 basis vectors of R^(n+1), written in the
 *  Helmert basis of the hyperplane they span. */
function simplexVerts(n) {
  const list = [];
  for (let i = 0; i <= n; i++) {
    const p = [];
    for (let k = 1; k <= n; k++) {
      const s = 1 / Math.sqrt(k * (k + 1));
      p.push(i < k ? s : i === k ? -k * s : 0);
    }
    list.push(p);
  }
  return toUnitSphere(fromList(list, n), n);
}

/** n-cube: the 2^n corners {-1,+1}^n. Bit j of the index is the sign of x_j. */
function cubeVerts(n) {
  const V = new Float64Array((1 << n) * n);
  for (let i = 0; i < 1 << n; i++) for (let j = 0; j < n; j++) V[i * n + j] = (i >> j) & 1 ? 1 : -1;
  return toUnitSphere(V, n);
}

/** cross-polytope: +-e_i. Index 2i is +e_i, 2i+1 is -e_i. */
function crossVerts(n) {
  const V = new Float64Array(2 * n * n);
  for (let i = 0; i < n; i++) { V[(2 * i) * n + i] = 1; V[(2 * i + 1) * n + i] = -1; }
  return V;
}

function polygonVerts(p, phase = 0) {
  const list = [];
  for (let k = 0; k < p; k++) {
    const a = phase + (2 * Math.PI * k) / p;
    list.push([Math.cos(a), Math.sin(a)]);
  }
  return fromList(list, 2);
}

function cyclic3(list, base) {
  for (const [a, b, c] of base) list.push([a, b, c], [b, c, a], [c, a, b]);
}

function signs(values, mask) {
  // every sign pattern over the non-zero entries listed in mask
  const out = [];
  const idx = mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
  for (let s = 0; s < 1 << idx.length; s++) {
    const v = values.slice();
    idx.forEach((i, t) => { if ((s >> t) & 1) v[i] = -v[i]; });
    out.push(v);
  }
  return out;
}

function icosaVerts() {
  const list = [];
  for (const v of signs([0, 1, PHI], [0, 1, 1])) cyclic3(list, [v]);
  return toUnitSphere(fromList(list, 3), 3);
}

function dodecaVerts() {
  const list = signs([1, 1, 1], [1, 1, 1]);
  for (const v of signs([0, 1 / PHI, PHI], [0, 1, 1])) cyclic3(list, [v]);
  return toUnitSphere(fromList(list, 3), 3);
}

/* the duals in dual position (face centres), the other chirality of the
   cyclic permutations: the icosahedron's faces point at cube + (0, phi, 1/phi),
   the dodecahedron's faces point at (0, phi, 1) */
function icosaDual() {
  const list = signs([1, 1, 1], [1, 1, 1]);
  for (const v of signs([0, PHI, 1 / PHI], [0, 1, 1])) cyclic3(list, [v]);
  return toUnitSphere(fromList(list, 3), 3);
}
function dodecaDual() {
  const list = [];
  for (const v of signs([0, PHI, 1], [0, 1, 1])) cyclic3(list, [v]);
  return toUnitSphere(fromList(list, 3), 3);
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([x, ...rest]);
  });
  return out;
}

function parity(p) {
  let inv = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  return inv % 2;
}

function uniquePoints(list, n) {
  const seen = new Set(), out = [];
  for (const p of list) {
    const key = p.map((x) => x.toFixed(6)).join(',');
    if (!seen.has(key)) { seen.add(key); out.push(p); }
  }
  return out;
}

/** 24-cell {3,4,3}: all permutations of (+-1, +-1, 0, 0). */
function cell24Verts() {
  const list = [];
  for (const v of signs([1, 1, 0, 0], [1, 1, 0, 0])) for (const p of permutations([0, 1, 2, 3])) list.push(p.map((k) => v[k]));
  return toUnitSphere(fromList(uniquePoints(list, 4), 4), 4);
}

/** The 24-cell's dual (its facet normals): (+-1,0,0,0) and (+-1/2)^4. */
function cell24DualVerts() {
  const list = [];
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const p = [0, 0, 0, 0]; p[i] = s; list.push(p); }
  for (const v of signs([0.5, 0.5, 0.5, 0.5], [1, 1, 1, 1])) list.push(v);
  return toUnitSphere(fromList(list, 4), 4);
}

/** 600-cell {3,3,5}: 8 of (+-1,0,0,0), 16 of (+-1/2)^4, and 96 even
 *  permutations of (+-phi, +-1, +-1/phi, 0)/2 (Coxeter 1973). */
function cell600Verts() {
  const list = [];
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const p = [0, 0, 0, 0]; p[i] = s; list.push(p); }
  for (const v of signs([0.5, 0.5, 0.5, 0.5], [1, 1, 1, 1])) list.push(v);
  const even = permutations([0, 1, 2, 3]).filter((p) => parity(p) === 0);
  for (const v of signs([PHI / 2, 0.5, 1 / (2 * PHI), 0], [1, 1, 1, 0])) {
    for (const p of even) list.push(p.map((k) => v[k]));
  }
  return toUnitSphere(fromList(uniquePoints(list, 4), 4), 4);
}

/* ---------------- edges: every pair at the shortest distance ---------------- */

export function shortestEdges(V, n) {
  const nv = V.length / n;
  let best = Infinity;
  for (let a = 0; a < nv; a++) for (let b = a + 1; b < nv; b++) {
    let s = 0;
    for (let k = 0; k < n; k++) { const d = V[a * n + k] - V[b * n + k]; s += d * d; }
    if (s > 1e-12 && s < best) best = s;
  }
  const lim = best * (1 + 1e-6);
  const out = [];
  for (let a = 0; a < nv; a++) for (let b = a + 1; b < nv; b++) {
    let s = 0;
    for (let k = 0; k < n; k++) { const d = V[a * n + k] - V[b * n + k]; s += d * d; }
    if (s <= lim) out.push(a, b);
  }
  return { edges: Uint32Array.from(out), edgeLength: Math.sqrt(best) };
}

/** 120-cell {5,3,3} as the dual of the 600-cell: one vertex at the centre
 *  of each of the 600-cell's tetrahedra (its 4-cliques). */
function cell120Verts(c600) {
  const nv = c600.V.length / 4;
  const adj = Array.from({ length: nv }, () => new Set());
  for (let e = 0; e < c600.edges.length; e += 2) { adj[c600.edges[e]].add(c600.edges[e + 1]); adj[c600.edges[e + 1]].add(c600.edges[e]); }
  const list = [];
  let tetra = 0;
  for (let a = 0; a < nv; a++) for (const b of adj[a]) {
    if (b <= a) continue;
    for (const c of adj[a]) {
      if (c <= b || !adj[b].has(c)) continue;
      for (const d of adj[a]) {
        if (d <= c || !adj[b].has(d) || !adj[c].has(d)) continue;
        tetra++;
        const p = [0, 0, 0, 0];
        for (const v of [a, b, c, d]) for (let k = 0; k < 4; k++) p[k] += c600.V[v * 4 + k] / 4;
        list.push(p);
      }
    }
  }
  return { V: toUnitSphere(fromList(list, 4), 4), tetra };
}

/* ---------------- faces from supporting hyperplanes ---------------- */

const words = (nv) => Math.ceil(nv / 32);

function bitset(idx, nv) {
  const b = new Uint32Array(words(nv));
  for (const i of idx) b[i >> 5] |= 1 << (i & 31);
  return b;
}

function popAnd(a, b, out) {
  let c = 0;
  for (let w = 0; w < a.length; w++) {
    let x = a[w] & b[w];
    out[w] = x;
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    c += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return c;
}

function bitsToIdx(b) {
  const out = [];
  for (let w = 0; w < b.length; w++) {
    let x = b[w];
    while (x) { const t = x & -x; out.push(w * 32 + 31 - Math.clz32(t)); x ^= t; }
  }
  return out;
}

/** facets: for each dual direction u, the vertices maximising u·v */
function facetsFrom(V, n, D) {
  const nv = V.length / n, nd = D.length / n, out = [];
  for (let f = 0; f < nd; f++) {
    let best = -Infinity;
    const dots = new Float64Array(nv);
    for (let v = 0; v < nv; v++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += V[v * n + k] * D[f * n + k];
      dots[v] = s;
      if (s > best) best = s;
    }
    const idx = [];
    for (let v = 0; v < nv; v++) if (dots[v] > best - 1e-7) idx.push(v);
    // a facet must span n-1 dimensions: a wrong dual would give points or edges
    if (idx.length >= n && affineDim(V, n, idx) === n - 1) out.push(idx);
  }
  return out;
}

/** ridges: facet pairs whose shared vertices span n-2 dimensions */
function ridgesFrom(V, n, facets) {
  const nv = V.length / n;
  const bs = facets.map((f) => bitset(f, nv));
  const tmp = new Uint32Array(words(nv));
  const out = [];
  for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) {
    const c = popAnd(bs[a], bs[b], tmp);
    if (c < n - 1) continue;
    const idx = bitsToIdx(tmp);
    if (affineDim(V, n, idx) === n - 2) out.push(idx);
  }
  return out;
}

function edgeLookup(edges, nv) {
  const m = new Map();
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    m.set(Math.min(a, b) * nv + Math.max(a, b), e / 2);
  }
  return m;
}

/** a face as its vertex list plus the edges that lie inside it */
function withEdges(faces, edges, nv) {
  const look = edgeLookup(edges, nv);
  return faces.map((verts) => {
    const es = [];
    for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
      const a = Math.min(verts[i], verts[j]), b = Math.max(verts[i], verts[j]);
      const e = look.get(a * nv + b);
      if (e !== undefined) es.push(e);
    }
    return { verts, edges: es };
  });
}

/* the 2-faces of the three families in any dimension, by definition */
function family2Faces(family, n) {
  const out = [];
  if (family === 'cube') {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      for (let base = 0; base < 1 << n; base++) {
        if ((base >> a) & 1 || (base >> b) & 1) continue;
        out.push([base, base | (1 << a), base | (1 << b), base | (1 << a) | (1 << b)]);
      }
    }
  } else if (family === 'simplex') {
    for (let a = 0; a <= n; a++) for (let b = a + 1; b <= n; b++) for (let c = b + 1; c <= n; c++) out.push([a, b, c]);
  } else if (family === 'cross') {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
      for (let s = 0; s < 8; s++) out.push([2 * a + (s & 1), 2 * b + ((s >> 1) & 1), 2 * c + ((s >> 2) & 1)]);
    }
  }
  return out;
}

/* ---------------- closed formulas and the reference table ---------------- */

/** k-face count by the family's closed formula (Coxeter 1973, Table I) */
export function familyCount(family, n, k) {
  if (family === 'simplex') return binomial(n + 1, k + 1);
  if (family === 'cube') return binomial(n, k) * 2 ** (n - k);
  if (family === 'cross') return 2 ** (k + 1) * binomial(n, k + 1);
  return null;
}

/** Published f-vectors of the exceptional regular polytopes (Coxeter 1973, Table I). */
export const REFERENCE = {
  dodeca: [20, 30, 12],
  icosa: [12, 30, 20],
  c24: [24, 96, 96, 24],
  c600: [120, 720, 1200, 600],
  c120: [600, 1200, 720, 120],
};

/* ---------------- the catalogue ---------------- */

const CUBE_NAMES = { 1: 'segment', 2: 'square', 3: 'cube', 4: 'tesseract', 5: 'penteract', 6: 'hexeract', 7: 'hepteract', 8: 'octeract', 9: 'enneract', 10: 'dekeract' };
const SIMPLEX_NAMES = { 2: 'triangle', 3: 'tetrahedron', 4: '5-cell' };
const CROSS_NAMES = { 2: 'square (as cross)', 3: 'octahedron', 4: '16-cell' };

export const schlafli = (family, n) => {
  if (n < 2) return '{ }';
  const threes = (m) => Array(m).fill(3);
  if (family === 'simplex') return `{${threes(n - 1).join(',')}}`;
  if (family === 'cube') return `{${[4, ...threes(n - 2)].join(',')}}`;
  if (family === 'cross') return `{${[...threes(n - 2), 4].join(',')}}`;
  return '';
};

/* ---------------- the registry ----------------
   One row per object: the dimensions it exists in, its chip label, its
   symmetry group, its dual, and a geometry() returning its coordinates and
   the directions of its facet normals (its dual's vertices). The engine
   below turns any row into the same interface {V, edges, faces2, faces3,
   facets, fvec, euler, metrics}, so a new object is one geometry function
   and one row. */

const factorial = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
const neg = (V) => { const D = new Float64Array(V.length); for (let i = 0; i < V.length; i++) D[i] = -V[i]; return D; };
let c600Memo = null;
function c600Pair() {
  if (!c600Memo) {
    const v600 = cell600Verts();
    const e600 = shortestEdges(v600, 4);
    c600Memo = { v600, c120: cell120Verts({ V: v600, edges: e600.edges }) };
  }
  return c600Memo;
}

export const REGISTRY = {
  simplex: {
    dims: [2, 10], label: (n) => (n === 2 ? 'triangle' : 'simplex'), dual: 'simplex',
    group: (n) => ({ name: `A${n}`, order: factorial(n + 1) }),
    geometry: (n) => { const V = simplexVerts(n); return { V, D: neg(V), name: SIMPLEX_NAMES[n] || `${n}-simplex` }; },
  },
  cube: {
    dims: [1, 10], label: (n) => (n === 1 ? 'segment' : n === 2 ? 'square' : 'cube'), dual: 'cross',
    group: (n) => ({ name: n === 1 ? 'A1' : `B${n}`, order: 2 ** n * factorial(n) }),
    geometry: (n) => ({ V: cubeVerts(n), D: crossVerts(n), name: CUBE_NAMES[n] }),
  },
  cross: {
    dims: [2, 10], label: () => 'cross', dual: 'cube',
    group: (n) => ({ name: `B${n}`, order: 2 ** n * factorial(n) }),
    geometry: (n) => ({ V: n === 2 ? polygonVerts(4, 0) : crossVerts(n), D: cubeVerts(n), name: CROSS_NAMES[n] || `${n}-orthoplex` }),
  },
  p5: {
    dims: [2, 2], label: () => 'pentagon', family: 'polygon', schlafli: '{5}', dual: 'p5',
    group: () => ({ name: 'I2(5)', order: 10 }),
    geometry: () => ({ V: polygonVerts(5, Math.PI / 2), D: null, name: 'pentagon' }),
  },
  p6: {
    dims: [2, 2], label: () => 'hexagon', family: 'polygon', schlafli: '{6}', dual: 'p6',
    group: () => ({ name: 'I2(6)', order: 12 }),
    geometry: () => ({ V: polygonVerts(6, Math.PI / 2), D: null, name: 'hexagon' }),
  },
  dodeca: {
    dims: [3, 3], label: () => 'dodeca', schlafli: '{5,3}', dual: 'icosa',
    group: () => ({ name: 'H3', order: 120 }),
    geometry: () => ({ V: dodecaVerts(), D: dodecaDual(), name: 'dodecahedron' }),
  },
  icosa: {
    dims: [3, 3], label: () => 'icosa', schlafli: '{3,5}', dual: 'dodeca',
    group: () => ({ name: 'H3', order: 120 }),
    geometry: () => ({ V: icosaVerts(), D: icosaDual(), name: 'icosahedron' }),
  },
  c24: {
    dims: [4, 4], label: () => '24-cell', schlafli: '{3,4,3}', dual: 'c24',
    group: () => ({ name: 'F4', order: 1152 }),
    geometry: () => ({ V: cell24Verts(), D: cell24DualVerts(), name: '24-cell' }),
  },
  c600: {
    dims: [4, 4], label: () => '600-cell', schlafli: '{3,3,5}', dual: 'c120',
    group: () => ({ name: 'H4', order: 14400 }),
    geometry: () => { const m = c600Pair(); return { V: m.v600, D: m.c120.V, name: '600-cell' }; },
  },
  c120: {
    dims: [4, 4], label: () => '120-cell', schlafli: '{5,3,3}', dual: 'c600',
    group: () => ({ name: 'H4', order: 14400 }),
    geometry: () => { const m = c600Pair(); return { V: m.c120.V, D: m.v600, name: '120-cell', extra: { dualTetra: m.c120.tetra } }; },
  },
  torus: { dims: [4, 4], label: () => 'torus', curved: true, make: () => cliffordTorus() },
  hopf: { dims: [4, 4], label: () => 'hopf', curved: true, make: () => hopfFibres() },
};

/** the objects that exist in dimension n, in registry order */
export function catalogue(n) {
  return Object.entries(REGISTRY)
    .filter(([, r]) => n >= r.dims[0] && n <= r.dims[1])
    .map(([id, r]) => ({ id, label: r.label(n), curved: !!r.curved }));
}

/** count of regular convex polytopes in dimension n (Schlafli 1852) */
export const regularCount = (n) => (n === 1 ? 1 : n === 2 ? Infinity : n === 3 ? 5 : n === 4 ? 6 : 3);

/**
 * Closed-form metric values (circumradius over edge, dihedral angle in
 * degrees): the reference the measured values are checked against.
 * Families: R/e from the closed forms of the coordinates; dihedral angles
 * arccos(1/n) (simplex), 90 (cube), arccos(-(n-2)/n) (cross-polytope).
 * Exceptional values as tabulated in Coxeter 1973, Table I.
 */
export function referenceMetrics(id, n) {
  const deg = (r) => (r * 180) / Math.PI;
  switch (id) {
    case 'simplex': return { re: Math.sqrt(n / (2 * (n + 1))), dihedral: deg(Math.acos(1 / n)) };
    case 'cube': return { re: Math.sqrt(n) / 2, dihedral: n >= 2 ? 90 : null };
    case 'cross': return { re: Math.SQRT1_2, dihedral: deg(Math.acos(-(n - 2) / n)) };
    case 'p5': return { re: 1 / (2 * Math.sin(Math.PI / 5)), dihedral: 108 };
    case 'p6': return { re: 1 / (2 * Math.sin(Math.PI / 6)), dihedral: 120 };
    case 'dodeca': return { re: (Math.sqrt(3) * PHI) / 2, dihedral: deg(Math.acos(-1 / Math.sqrt(5))) };
    case 'icosa': return { re: Math.sin((2 * Math.PI) / 5), dihedral: deg(Math.acos(-Math.sqrt(5) / 3)) };
    case 'c24': return { re: 1, dihedral: 120 };
    case 'c600': return { re: PHI, dihedral: deg(Math.acos(-(1 + 3 * Math.sqrt(5)) / 8)) };
    case 'c120': return { re: PHI * PHI * Math.SQRT2, dihedral: 144 };
    default: return null;
  }
}

/** measured metrics: circumradius over edge, and the dihedral angle between two adjacent facets */
function measureMetrics(V, n, edgeLength, facets, ridges) {
  const re = 1 / edgeLength;
  let dihedral = null;
  if (n === 2) {
    dihedral = 180 - 360 / (V.length / 2);
  } else if (facets && ridges && ridges.length) {
    // two facets sharing the first ridge; a regular facet's normal points at its centroid
    const r = ridges[0];
    const pair = facets.filter((f) => r.every((v) => f.includes(v))).slice(0, 2);
    if (pair.length === 2) {
      const c = pair.map((f) => {
        const m = new Float64Array(n);
        for (const v of f) for (let k = 0; k < n; k++) m[k] += V[v * n + k];
        let l = 0;
        for (let k = 0; k < n; k++) l += m[k] * m[k];
        l = Math.sqrt(l);
        for (let k = 0; k < n; k++) m[k] /= l;
        return m;
      });
      let d = 0;
      for (let k = 0; k < n; k++) d += c[0][k] * c[1][k];
      dihedral = 180 - (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
    }
  }
  return { re, dihedral };
}

const cache = new Map();

/**
 * Build (once) and return the object `id` in dimension n.
 * @returns {{id, family, n, name, schlafli, group, dual, V, nv, edges, ne, edgeLength,
 *   faces2, faces3, facets, fvec, euler, metrics, ref, curved}}
 */
export function build(id, n) {
  const key = `${id}:${n}`;
  if (cache.has(key)) return cache.get(key);
  const row = REGISTRY[id];
  if (!row) throw new Error('unknown object ' + id);
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const obj = row.curved ? row.make() : polytope(id, n, row);
  obj.buildMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  cache.set(key, obj);
  return obj;
}

function polytope(id, n, row) {
  const g = row.geometry(n);
  const V = g.V, D = g.D, name = g.name, extra = g.extra || {};
  const family = row.family || id;
  const sch = row.schlafli || schlafli(family, n);


  const nv = V.length / n;
  const { edges, edgeLength } = n === 1 ? { edges: Uint32Array.from([0, 1]), edgeLength: 2 } : shortestEdges(V, n);
  const ne = edges.length / 2;
  const allEdges = Array.from({ length: ne }, (_, i) => i);
  const allVerts = Array.from({ length: nv }, (_, i) => i);

  let facets = null, ridges = null, faces2 = null, faces3 = null;
  if (n >= 3 && D) {
    facets = facetsFrom(V, n, D);
    ridges = ridgesFrom(V, n, facets);
  }
  if (n === 2) faces2 = [{ verts: allVerts, edges: allEdges }];
  else if (n === 3) { faces2 = withEdges(facets, edges, nv); faces3 = [{ verts: allVerts, edges: allEdges }]; }
  else if (n === 4) { faces2 = withEdges(ridges, edges, nv); faces3 = withEdges(facets, edges, nv); }
  else if (n >= 5) faces2 = withEdges(family2Faces(family, n), edges, nv);

  // the f-vector, rank by rank, with how each number was obtained
  const fvec = [];
  for (let k = 0; k < n; k++) {
    let count = null, how = 'formula';
    if (k === 0) { count = nv; how = 'built'; }
    else if (k === 1) { count = ne; how = 'measured'; }
    else if (k === n - 1) { count = facets.length; how = 'measured'; }
    else if (k === n - 2) { count = ridges.length; how = 'measured'; }
    else if (k === 2) { count = faces2.length; how = 'enumerated'; }
    else count = familyCount(family, n, k);
    const ref = REFERENCE[family] ? REFERENCE[family][k] : familyCount(family, n, k);
    fvec.push({ k, count, how, ref: family === 'polygon' ? (k === 0 ? nv : nv) : ref });
  }
  const chi = fvec.reduce((s, f) => s + (f.k % 2 ? -f.count : f.count), 0);
  const euler = { chi, expected: 1 - (-1) ** n, ok: chi === 1 - (-1) ** n };
  const check3 = n === 3 ? { edgesTwoWays: ridges.length === ne } : null;

  const metrics = n >= 2 ? measureMetrics(V, n, edgeLength, facets, ridges) : null;
  return {
    id, family, n, name, schlafli: sch, group: row.group(n), dual: row.dual, V, nv, edges, ne, edgeLength,
    faces2, faces3, facets, fvec, euler, check3, metrics, ref: referenceMetrics(id, n), curved: false, ...extra,
  };
}

/* ---------------- curved objects on the 3-sphere ---------------- */

/** Clifford torus: (cos a, sin a, cos b, sin b)/sqrt2, a flat torus in S^3. */
function cliffordTorus(M = 28) {
  const n = 4, nv = M * M, V = new Float64Array(nv * n), edges = [];
  const s = Math.SQRT1_2;
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const a = (2 * Math.PI * i) / M, b = (2 * Math.PI * j) / M, v = i * M + j;
    V[v * 4] = s * Math.cos(a); V[v * 4 + 1] = s * Math.sin(a); V[v * 4 + 2] = s * Math.cos(b); V[v * 4 + 3] = s * Math.sin(b);
    edges.push(v, i * M + ((j + 1) % M), v, ((i + 1) % M) * M + j);
  }
  const F = M * M;
  const ne = edges.length / 2;
  return {
    id: 'torus', family: 'torus', n, name: 'Clifford torus', schlafli: '', V, nv, edges: Uint32Array.from(edges), ne,
    faces2: null, faces3: null, facets: null, curved: true, grid: M,
    fvec: [{ k: 0, count: nv, how: 'built', ref: null }, { k: 1, count: ne, how: 'built', ref: null }, { k: 2, count: F, how: 'built', ref: null }],
    euler: { chi: nv - ne + F, expected: 0, ok: nv - ne + F === 0, surface: 'torus' },
  };
}

/**
 * Hopf fibres. With S^3 as pairs (z1, z2) of complex numbers, the fibre
 * over a point of S^2 is the great circle
 *   (cos e cos(t+x), cos e sin(t+x), sin e cos t, sin e sin t), t in [0, 2pi).
 * Fibres sharing e lie on one torus; e = pi/4 is the Clifford torus.
 */
export const HOPF_RINGS = [
  { e: 0.0, count: 1 },
  { e: 0.14 * Math.PI, count: 8 },
  { e: 0.25 * Math.PI, count: 24 },
  { e: 0.36 * Math.PI, count: 12 },
];

/** the point of the base 2-sphere a fibre lies over: polar angle 2e, azimuth x */
export const hopfBase = (e, x) => [Math.sin(2 * e) * Math.cos(x), Math.sin(2 * e) * Math.sin(x), Math.cos(2 * e)];

/** the fibre over base point (e, x), sampled at P points, into out (stride 4) */
export function hopfFibre(e, x, P, out = new Float64Array(P * 4)) {
  for (let s = 0; s < P; s++) {
    const t = (2 * Math.PI * s) / P;
    out[s * 4] = Math.cos(e) * Math.cos(t + x); out[s * 4 + 1] = Math.cos(e) * Math.sin(t + x);
    out[s * 4 + 2] = Math.sin(e) * Math.cos(t); out[s * 4 + 3] = Math.sin(e) * Math.sin(t);
  }
  return out;
}
export const HOPF_SAMPLES = 72;

function hopfFibres() {
  const n = 4, P = HOPF_SAMPLES;
  const pts = [], edges = [], ring = [], fibres = [];
  HOPF_RINGS.forEach((r, ri) => {
    for (let f = 0; f < r.count; f++) {
      const x = (2 * Math.PI * f) / r.count + ri * 0.37;
      const start = pts.length / 4;
      for (let s = 0; s < P; s++) {
        const t = (2 * Math.PI * s) / P;
        pts.push(Math.cos(r.e) * Math.cos(t + x), Math.cos(r.e) * Math.sin(t + x), Math.sin(r.e) * Math.cos(t), Math.sin(r.e) * Math.sin(t));
        ring.push(ri);
        edges.push(start + s, start + ((s + 1) % P));
      }
      fibres.push({ start, count: P, ring: ri, e: r.e, x });
    }
  });
  const V = Float64Array.from(pts);
  const nv = V.length / 4;
  return {
    id: 'hopf', family: 'hopf', n, name: 'Hopf fibres', schlafli: '', V, nv, edges: Uint32Array.from(edges), ne: edges.length / 2,
    faces2: null, faces3: null, facets: null, curved: true, ring: Uint8Array.from(ring), fibres,
    fvec: [{ k: 0, count: nv, how: 'built', ref: null }, { k: 1, count: edges.length / 2, how: 'built', ref: null }],
    euler: null,
  };
}

/**
 * Gauss linking number of two closed polylines in R^3 (flat xyz arrays):
 * Lk = (1/4pi) sum over segment pairs of (r - s)·(dr x ds) / |r - s|^3.
 * An integer for closed curves; the discretisation error is printed with it.
 */
export function linkingNumber(A, B) {
  const na = A.length / 3, nb = B.length / 3;
  let sum = 0;
  for (let i = 0; i < na; i++) {
    const i2 = (i + 1) % na;
    const rx = (A[i * 3] + A[i2 * 3]) / 2, ry = (A[i * 3 + 1] + A[i2 * 3 + 1]) / 2, rz = (A[i * 3 + 2] + A[i2 * 3 + 2]) / 2;
    const dx = A[i2 * 3] - A[i * 3], dy = A[i2 * 3 + 1] - A[i * 3 + 1], dz = A[i2 * 3 + 2] - A[i * 3 + 2];
    for (let j = 0; j < nb; j++) {
      const j2 = (j + 1) % nb;
      const sx = (B[j * 3] + B[j2 * 3]) / 2, sy = (B[j * 3 + 1] + B[j2 * 3 + 1]) / 2, sz = (B[j * 3 + 2] + B[j2 * 3 + 2]) / 2;
      const ex = B[j2 * 3] - B[j * 3], ey = B[j2 * 3 + 1] - B[j * 3 + 1], ez = B[j2 * 3 + 2] - B[j * 3 + 2];
      const ux = rx - sx, uy = ry - sy, uz = rz - sz;
      const d = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (d < 1e-9) continue;
      const cx = dy * ez - dz * ey, cy = dz * ex - dx * ez, cz = dx * ey - dy * ex;
      sum += (ux * cx + uy * cy + uz * cz) / (d * d * d);
    }
  }
  return sum / (4 * Math.PI);
}

/* ---------------- Hopf fibres of a 4D polytope ----------------
   Read R^4 as the quaternions x0 + x1 i + x2 j + x3 k. For a unit pure
   quaternion u, left multiplication by e^(t u) moves every point along a
   great circle, and those circles are the fibres of a Hopf fibration.
   For each edge at vertex 0, u is the axis of the turn that carries vertex
   0 to its neighbour; the u that splits the vertices into the fewest equal
   circles is kept. The 600-cell gives 12 great decagons and the 24-cell 4
   great hexagons (each vertex set is a group of unit quaternions, and the
   circles are the cosets of a cyclic subgroup). */

/** the matrix of x -> u·x for a pure unit quaternion u = (0, u1, u2, u3); its square is -I */
export function leftMulMatrix(u1, u2, u3) {
  return Float64Array.from([0, -u1, -u2, -u3, u1, 0, -u3, u2, u2, u3, 0, -u1, u3, -u2, u1, 0]);
}

function qmulConj(a, b) { // a · conj(b)
  const b0 = b[0], b1 = -b[1], b2 = -b[2], b3 = -b[3];
  return [
    a[0] * b0 - a[1] * b1 - a[2] * b2 - a[3] * b3,
    a[0] * b1 + a[1] * b0 + a[2] * b3 - a[3] * b2,
    a[0] * b2 - a[1] * b3 + a[2] * b0 + a[3] * b1,
    a[0] * b3 + a[1] * b2 - a[2] * b1 + a[3] * b0,
  ];
}

/**
 * @returns {{u:number[], G:Float64Array, circles:{members:number[], x:number[], y:number[]}[],
 *   perCircle:number|null, count:number, group:Int32Array}|null}
 */
export function fibration(o) {
  if (o.n !== 4 || o.curved) return null;
  if (o._fib !== undefined) return o._fib;
  const V = o.V, nv = o.nv;
  const vert = (i) => [V[i * 4], V[i * 4 + 1], V[i * 4 + 2], V[i * 4 + 3]];
  const v0 = vert(0);
  let best = null;
  const axes = [];
  for (let e = 0; e < o.ne; e++) {
    const a = o.edges[2 * e], b = o.edges[2 * e + 1];
    if (a !== 0 && b !== 0) continue;
    const q = qmulConj(vert(a === 0 ? b : a), v0);
    const l = Math.hypot(q[1], q[2], q[3]);
    if (l > 1e-9) axes.push([q[1] / l, q[2] / l, q[3] / l]);
  }
  // the 120-cell's vertices are five cosets of the 600-cell's group, so the 600-cell's axis splits them too
  if (o.id === 'c120') axes.push(fibration(build('c600', 4)).u);
  for (const u of axes) {
    const G = leftMulMatrix(u[0], u[1], u[2]);
    const group = new Int32Array(nv).fill(-1);
    const circles = [];
    for (let i = 0; i < nv; i++) {
      if (group[i] >= 0) continue;
      const x = vert(i), y = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) y[r] += G[r * 4 + c] * x[c];
      const members = [];
      for (let j = 0; j < nv; j++) {
        if (group[j] >= 0) continue;
        const z = vert(j);
        const px = z[0] * x[0] + z[1] * x[1] + z[2] * x[2] + z[3] * x[3];
        const py = z[0] * y[0] + z[1] * y[1] + z[2] * y[2] + z[3] * y[3];
        if (Math.abs(px * px + py * py - 1) < 1e-7) { group[j] = circles.length; members.push(j); }
      }
      circles.push({ members, x, y });
    }
    const sizes = circles.map((c) => c.members.length);
    const even = sizes.every((k) => k === sizes[0]);
    const score = (even ? 100000 : 0) - circles.length;
    if (!best || score > best.score) best = { score, u, G, circles, size: even ? sizes[0] : null, group };
  }
  o._fib = best ? { u: best.u, G: best.G, circles: best.circles, perCircle: best.size, count: best.circles.length, group: best.group } : null;
  return o._fib;
}
