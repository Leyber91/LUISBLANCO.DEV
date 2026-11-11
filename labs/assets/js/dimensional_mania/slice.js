/* ============================================================
   dimensional_mania/slice.js — the cross-section engine.

   The object, already turned by R, is cut by the hyperplane x_(n-1) = h
   (the last axis, the one the shadow cascade divides by first). The cut
   is computed exactly from the object's faces:
     · slice vertices: where edges cross the hyperplane, plus any
       vertex lying on it
     · slice edges: each 2-face that crosses contributes one segment
     · slice faces (n = 3, 4): each 3-face that crosses contributes one
       polygon
   then measured: length (n = 2), area (n = 3), 3-volume (n = 4).

   For the n-cube the measure has a closed form to check against. If x is
   uniform in the cube [-L/2, L/2]^n and u is the unit normal, the section
   (n-1)-volume at height t is L^n times the density of u·x at t, and that
   density is an inclusion-exclusion sum over the cube's 2^n corners (for
   equal weights it is the Irwin-Hall density: Irwin 1927, Hall 1927,
   Biometrika 19). cubeSection() evaluates it independently of the
   geometry, so the page can print the difference.
   ============================================================ */

const ON = 1e-9; // a vertex this close to the hyperplane counts as on it

/** polygon / polyhedron names by combinatorial type (V, E, F + face sizes) */
const POLYGON = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
const POLYHEDRA = [
  { sig: '4,6,4|3:4', name: 'tetrahedron' },
  { sig: '5,8,5|3:4,4:1', name: 'square pyramid' },
  { sig: '6,9,5|3:2,4:3', name: 'triangular prism' },
  { sig: '6,12,8|3:8', name: 'octahedron' },
  { sig: '8,12,6|4:6', name: 'hexahedron (cube type)' },
  { sig: '12,18,8|3:4,6:4', name: 'truncated tetrahedron' },
  { sig: '12,18,8|4:6,6:2', name: 'hexagonal prism' },
  { sig: '10,15,7|4:5,5:2', name: 'pentagonal prism' },
  { sig: '12,24,14|3:8,4:6', name: 'cuboctahedron' },
  { sig: '24,36,14|4:6,6:8', name: 'truncated octahedron' },
  { sig: '20,30,12|5:12', name: 'dodecahedron type' },
  { sig: '12,30,20|3:20', name: 'icosahedron type' },
  { sig: '5,9,6|3:6', name: 'triangular bipyramid' },
  { sig: '7,15,10|3:10', name: 'pentagonal bipyramid' },
  { sig: '9,16,9|3:4,4:4,6:1', name: 'polyhedron' },
  { sig: '30,60,32|3:20,5:12', name: 'icosidodecahedron' },
  { sig: '18,27,11|4:9,9:2', name: 'enneagonal prism' },
  { sig: '16,24,10|4:8,8:2', name: 'octagonal prism' },
];

/**
 * Cut the turned object at x_(n-1) = h.
 * @param {object} o   an object from polytopes.build()
 * @param {Float64Array} X  turned vertex coordinates, stride n (R·v for each v)
 * @param {number} h
 * @returns {{pts: Float64Array, np: number, edges: number[], polys: number[][], measure: number|null, kind: string, name: string, counts: number[], faceSizes: object}}
 */
export function slice(o, X, h) {
  const n = o.n, ax = n - 1, nv = o.nv, E = o.edges;
  const ptsList = [];
  const vertPt = new Int32Array(nv).fill(-1);
  const edgePt = new Int32Array(o.ne).fill(-1);
  const w = new Float64Array(nv);
  for (let v = 0; v < nv; v++) w[v] = X[v * n + ax] - h;

  const addVertex = (v) => {
    if (vertPt[v] < 0) {
      vertPt[v] = ptsList.length / n;
      for (let k = 0; k < n; k++) ptsList.push(X[v * n + k]);
      ptsList[ptsList.length - n + ax] = h;
    }
    return vertPt[v];
  };

  const sliceEdges = new Set();
  const edgeKey = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
  for (let e = 0; e < o.ne; e++) {
    const a = E[2 * e], b = E[2 * e + 1];
    const wa = w[a], wb = w[b];
    const aOn = Math.abs(wa) < ON, bOn = Math.abs(wb) < ON;
    if (aOn && bOn) { sliceEdges.add(edgeKey(addVertex(a), addVertex(b))); edgePt[e] = -2; continue; }
    if (aOn) { edgePt[e] = addVertex(a); continue; }
    if (bOn) { edgePt[e] = addVertex(b); continue; }
    if (wa * wb < 0) {
      const t = wa / (wa - wb);
      edgePt[e] = ptsList.length / n;
      for (let k = 0; k < n; k++) ptsList.push(X[a * n + k] + t * (X[b * n + k] - X[a * n + k]));
      ptsList[ptsList.length - n + ax] = h;
    }
  }
  const np = ptsList.length / n;
  const pts = Float64Array.from(ptsList);

  const facePoints = (f) => {
    const s = new Set();
    for (const e of f.edges) { const p = edgePt[e]; if (p >= 0) s.add(p); }
    return [...s];
  };

  // slice edges: a crossing 2-face gives exactly two points
  if (o.faces2) {
    for (const f of o.faces2) {
      const ps = facePoints(f);
      if (ps.length === 2) sliceEdges.add(edgeKey(ps[0], ps[1]));
    }
  }

  // slice polygons (n = 3: the one polygon; n = 4: one per crossing cell)
  const polys = [];
  if ((n === 3 || n === 4) && o.faces3) {
    const seen = new Set();
    for (const f of o.faces3) {
      const ps = facePoints(f);
      if (ps.length < 3) continue;
      const ordered = orderPolygon(pts, n, ps);
      if (!ordered) continue;
      const key = ordered.slice().sort((a, b) => a - b).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      polys.push(ordered);
    }
  }

  const edges = [];
  for (const k of sliceEdges) edges.push(Math.floor(k / 65536), k % 65536);
  if (n === 3 && polys.length === 1) { // the polygon's own boundary is the truth in 3D
    edges.length = 0;
    const p = polys[0];
    for (let i = 0; i < p.length; i++) edges.push(p[i], p[(i + 1) % p.length]);
  }

  let measure = null, kind = 'empty', name = 'nothing', faceSizes = {};
  const nE = edges.length / 2;
  if (np === 0) { measure = 0; }
  else if (n === 1) { kind = 'point'; name = 'a point'; measure = null; }
  else if (n === 2) {
    kind = np >= 2 ? 'segment' : 'point'; name = np >= 2 ? 'a segment' : 'a point';
    measure = np >= 2 ? dist(pts, n, 0, 1, 1) : 0;
  } else if (n === 3) {
    if (polys.length) { measure = polygonArea(pts, polys[0]); kind = 'polygon'; name = POLYGON[polys[0].length] || `${polys[0].length}-gon`; }
    else { measure = 0; kind = np === 1 ? 'point' : 'segment'; name = np === 1 ? 'a point' : 'a segment'; }
  } else if (n === 4) {
    polys.forEach((p) => { faceSizes[p.length] = (faceSizes[p.length] || 0) + 1; });
    if (polys.length >= 4) {
      measure = polyVolume(pts, polys);
      kind = 'polyhedron';
      const sig = `${np},${nE},${polys.length}|` + Object.keys(faceSizes).sort((a, b) => a - b).map((k) => `${k}:${faceSizes[k]}`).join(',');
      const hit = POLYHEDRA.find((q) => q.sig === sig);
      name = hit ? hit.name : 'polyhedron';
    } else {
      measure = 0;
      kind = np === 1 ? 'point' : np === 2 ? 'segment' : 'flat';
      name = np === 1 ? 'a point' : np === 2 ? 'a segment' : polys.length === 1 ? (POLYGON[polys[0].length] || 'a polygon') : 'a flat piece';
    }
  } else {
    kind = `${n - 1}-polytope`;
    name = `a ${n - 1}-dimensional section`;
  }
  const counts = n === 4 ? [np, nE, polys.length] : n === 3 ? [np, nE] : [np, nE];
  return { pts, np, edges, polys, measure, kind, name, counts, faceSizes, h };
}

function dist(pts, n, a, b) {
  let s = 0;
  for (let k = 0; k < n; k++) { const d = pts[a * n + k] - pts[b * n + k]; s += d * d; }
  return Math.sqrt(s);
}

/** order coplanar points around their centroid; null if they are not a polygon */
function orderPolygon(pts, n, ids) {
  const m = ids.length;
  const c = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) c[k] += (k < n ? pts[i * n + k] : 0) / m;
  if (n === 3) { // the cut lives in the plane x2 = h: order by angle in (x0, x1)
    return ids.slice().sort((a, b) =>
      Math.atan2(pts[a * n + 1] - c[1], pts[a * n] - c[0]) - Math.atan2(pts[b * n + 1] - c[1], pts[b * n] - c[0]));
  }
  const P = (i) => [pts[i * n] - c[0], pts[i * n + 1] - c[1], pts[i * n + 2] - c[2]];
  let far = ids[0], fd = -1;
  for (const i of ids) { const p = P(i); const d = p[0] * p[0] + p[1] * p[1] + p[2] * p[2]; if (d > fd) { fd = d; far = i; } }
  if (fd < 1e-18) return null;
  const a = P(far);
  let nrm = null, best = 0;
  for (const i of ids) {
    const b = P(i);
    const x = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(x[0], x[1], x[2]);
    if (l > best) { best = l; nrm = x; }
  }
  if (!nrm || best < 1e-10 * fd) return null;
  // planarity: a 3-face lying inside the hyperplane is not a polygon
  const nl = Math.hypot(nrm[0], nrm[1], nrm[2]);
  const N = nrm.map((x) => x / nl);
  for (const i of ids) { const p = P(i); if (Math.abs(p[0] * N[0] + p[1] * N[1] + p[2] * N[2]) > 1e-6) return null; }
  const al = Math.sqrt(fd);
  const U = a.map((x) => x / al);
  const W = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
  const ang = (i) => { const p = P(i); return Math.atan2(p[0] * W[0] + p[1] * W[1] + p[2] * W[2], p[0] * U[0] + p[1] * U[1] + p[2] * U[2]); };
  return ids.slice().sort((x, y) => ang(x) - ang(y));
}

function polygonArea(pts, poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += pts[a * 3] * pts[b * 3 + 1] - pts[b * 3] * pts[a * 3 + 1];
  }
  return Math.abs(s) / 2;
}

/** 3-volume of a convex polyhedron: tetrahedra fanned from an interior point */
function polyVolume(pts, polys) {
  const n = 4;
  const g = [0, 0, 0];
  const np = pts.length / n;
  for (let i = 0; i < np; i++) for (let k = 0; k < 3; k++) g[k] += pts[i * n + k] / np;
  let vol = 0;
  for (const p of polys) {
    const q = (i) => [pts[p[i] * n] - g[0], pts[p[i] * n + 1] - g[1], pts[p[i] * n + 2] - g[2]];
    const a = q(0);
    for (let i = 1; i + 1 < p.length; i++) {
      const b = q(i), c = q(i + 1);
      vol += Math.abs(a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

/**
 * Closed-form section measure of the cube [-L/2, L/2]^n by the hyperplane
 * u·x = t (u a unit vector): L^n times the density of u·x at t.
 * Directions with |u_i| < 1e-4 are treated as exactly 0 (their width is
 * below a ten-thousandth of an edge).
 */
export function cubeSection(u, L, t) {
  const n = u.length;
  const a = [];
  for (let i = 0; i < n; i++) if (Math.abs(u[i]) >= 1e-4) a.push(Math.abs(u[i]) * L);
  const m = a.length;
  if (!m) return 0;
  const s = t + a.reduce((x, y) => x + y, 0) / 2; // shift to a sum of U[0, a_i]
  let fact = 1;
  for (let i = 2; i < m; i++) fact *= i;
  let prod = 1;
  for (const x of a) prod *= x;
  let sum = 0;
  for (let e = 0; e < 1 << m; e++) {
    let shift = 0, sign = 1;
    for (let i = 0; i < m; i++) if ((e >> i) & 1) { shift += a[i]; sign = -sign; }
    const z = s - shift;
    if (z > 0) sum += sign * (m === 1 ? 1 : z ** (m - 1));
  }
  const density = Math.max(0, sum / (fact * prod));
  return L ** n * density;
}

/** turned coordinates X = R·V for every vertex */
export function turn(o, R, out = new Float64Array(o.V.length)) {
  const n = o.n, V = o.V;
  for (let v = 0; v < o.nv; v++) {
    const b = v * n;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += R[i * n + k] * V[b + k];
      out[b + i] = s;
    }
  }
  return out;
}

/**
 * The measure as a function of h, sampled on [-1, 1], with the cube's
 * closed form beside it when the object is a cube in 2D-4D.
 */
export function profile(o, X, R, samples = 121) {
  const n = o.n;
  const hs = [], vals = [], refs = [];
  const isCube = o.family === 'cube' && n >= 2 && n <= 4;
  const u = isCube ? Array.from({ length: n }, (_, k) => R[(n - 1) * n + k]) : null;
  const L = 2 / Math.sqrt(n);
  let maxDev = 0, peak = 0;
  for (let s = 0; s < samples; s++) {
    // midpoints: never exactly on a facet height, where the cut is a whole facet
    const h = -1 + (2 * s + 1) / samples;
    const c = slice(o, X, h);
    const m = c.measure || 0;
    hs.push(h); vals.push(m);
    if (m > peak) peak = m;
    if (isCube) {
      const r = cubeSection(u, L, h);
      refs.push(r);
      maxDev = Math.max(maxDev, Math.abs(r - m));
    }
  }
  const heights = [];
  for (let v = 0; v < o.nv; v++) heights.push(X[v * n + n - 1]);
  return { hs, vals, refs: isCube ? refs : null, maxDev: isCube ? maxDev : null, peak, heights };
}
