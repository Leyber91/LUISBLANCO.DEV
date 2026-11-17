/* ============================================================
   heptapod/topo/figure.js — F4 slice 1 (E3 under H5 reversed, Luis
   2026-11-16: "Ring and blots, like film"): a meaning graph becomes a
   ring carrying one blot cluster per main clause, broken by one gap.

   Each placement rule with its reason (research/ip.md rule 9: our own
   route to the film's results; the film's numbers enter only as ranges
   to land in, or as a calibration named below):

   F1 The ring is the origo. Every main clause is anchored to the
      speaker's here and now (an `anchor` edge, hmr.js), and the origo
      carries no concept (NODE_CLASSES.origo), so it is drawn as a
      frame only: a rim with nothing inside. [semantics]
   F2 One cluster per main clause: the anchored event and what hangs
      from it by participant edges (its participants, its embedded and
      relative clauses, junctions, names), never another main clause.
      A node two main clauses reach goes to the nearer by hops, then by
      the plan's edge priority (3.4.1), then by the lower canonical
      cluster. Each cluster is drawn by E1 (encode.js): one closed shape
      carrying its own rim code. [semantics; E1]
   F2b The clause's lobes are gathered into one mass: wet ink bridges
      any gap narrower than twice SPREAD between two lobes and fills a
      pocket it closes around (capillary coalescence), which is the
      morphological closing of the shape by a disk of radius SPREAD,
      pockets filled. The outer rims keep their place; the code on rims
      facing into the mass is covered, about a quarter of it (slice 2
      must carry the code on the gathered outline). [physics; SPREAD is
      a calibration, below]
   F3A cluster straddles the ring with its long axis along it, warped
      to follow the ring: the brush pools ink where it dwells to lay a
      clause's code while it travels along the ring, so the pool is
      centred on the stroke and drawn out along it (PLAN M3). [physics]
   F4 Order around the ring carries no meaning: direction lives in
      collars, never in position (PLAN L13 and 3.5). The order is the
      one that puts the clusters' centre of mass nearest the ring's
      centre (the plan's centring term, 3.4.3). [plan]
   F5 Free arcs: at least E1's clearance dMin between neighbours, the
      rest shared in proportion to the neighbours' lengths along the
      ring, so a large mass has the room its appendages need (PLAN
      material contract 4). [plan]
   F6 One gap, centred in the largest free arc: the brush is driest
      farthest from where ink pooled (Strassmann 1986; F4-P1, confirmed
      on 5 of 6 film masters). Always exactly one: a closed ring would
      enclose a hole and break E1's one region with one boundary (the
      film closes 5 of its 18). [physics; E1]
   F7 The ring's size: the deepest cluster reaches RHO of R, unless the
      clusters and their clearances need a longer ring. [calibration]
   A pocket of background narrower than the carrier, closed where the
   carrier meets a cluster, is filled: ink fills a narrow pocket by
   capillarity. The count is reported.

   Calibrations (BAR_F G13: a tuned value is recorded as one) are FIG's
   RHO, GAP_DEG, W_RING, R_CANVAS and SPREAD, each with its source in
   CALIBRATIONS. The carrier has constant width here: this is a
   skeleton, and the width's profile is F5's (the brush).

   Not yet: links between clauses (disc, trel, coreference) are
   counted, not drawn, and the reader of a ring figure is F4 slice 2.
   The cluster shapes come from E1, whose layout still calls the
   engine's trigonometry (G5 is owed there); this file calls trig.js.
   ============================================================ */

import { TOPO } from './config.js';
import { canonicalGraph } from './tree.js';
import { encode } from './encode.js';
import { edgeClassRank, edgeRoleRank, randomHMR, validateHMR, EDGE_LABELS } from './hmr.js';
import { fnv1a, pick } from './rng.js';
import { PI, sinK, cosK } from './trig.js';
import { marchLoops, gridFromDense } from './contour.js';
import { edt2 } from '../detail/filaments.js';

const TAU = 2 * PI;

export const FIG = Object.freeze({
  version: 'figure-f4-0.1',
  RHO: 0.40,          // peak blot depth over R
  GAP_DEG: 28.8,      // the gap's arc, in degrees
  GAP_SHARE: 0.6,     // a gap takes at most this share of its free arc, so both carrier ends reach a cluster
  W_RING: 0.06,       // carrier width over R
  R_CANVAS: 0.365,    // R over the canvas width, for rasters only
  ARC_MIN: TOPO.dMin, // clearance between neighbouring clusters along the ring, in l
  STEP: 0.25,         // polygon step along the carrier, in l
  SPREAD: 1.0 * TOPO.dMin, // F2b: ink bridges a gap narrower than twice this between wet lobes, in l
  GATHER_H: 0.5,      // grid step of the gathering, in l (finer than a pixel of the 1100 px raster, where l is about 0.9 to 1.3 px)
  EXACT_ORDER: 7,     // up to this many clusters every cyclic order is tried; above it, insertion then swaps
});

export const CALIBRATIONS = Object.freeze([
  { name: 'RHO', value: FIG.RHO, source: 'film.md 5.2: peak blot depth 0.26 to 0.71 R, median 0.40 R' },
  { name: 'GAP_DEG', value: FIG.GAP_DEG, source: 'median main gap of the 13 film rings with a gap (predictions.results.json, F4-P3 rows)' },
  { name: 'W_RING', value: FIG.W_RING, source: 'film.md 5.2: median carrier width about 0.06 R for single concepts' },
  { name: 'R_CANVAS', value: FIG.R_CANVAS, source: 'film.md 5.2: R over canvas 0.351 to 0.391, median 0.365 (the measuring frame only)' },
  { name: 'SPREAD', value: FIG.SPREAD, source: 'the smallest of 0, 0.6, 1, 1.5, 2 and 3 times dMin at which the detail suite (ring.js, film.md\'s blot rule) counts as many blot clusters as were drawn on at least 90% of 16 test texts (8 of one clause, 8 of four; randomText seeds 300 to 307 and 400 to 407): 15 of 16 at 1.0; 75% of the rim code stays on the outline (68% at worst), against 100% ungathered with 8 of 16 read as drawn (2026-11-17, gathering grid 0.5 l)' },
]);

/* ---------------- F1 and F2: the origo and the clauses ---------------- */

export function clausesOf(g) {
  const val = validateHMR(g);
  if (!val.ok) return { ok: false, reason: 'invalid graph: ' + val.errors[0] };
  const cg = canonicalGraph(g);
  const origos = [];
  for (let i = 0; i < cg.n; i++) if (cg.nodes[i].k === 'origo') origos.push(i);
  if (origos.length !== 1) return { ok: false, reason: `${origos.length} origos: slice 1 draws one ring for one speaker` };
  const o = origos[0];
  const mains = [...new Set(cg.edges.filter((e) => e.label === 'anchor' && e.h === o).map((e) => e.d))].sort((a, b) => a - b);
  if (!mains.length) return { ok: false, reason: 'no main clause' };
  const member = new Int32Array(cg.n).fill(-1);
  mains.forEach((m, c) => { member[m] = c; });
  const inc = Array.from({ length: cg.n }, () => []);
  cg.edges.forEach((e, i) => { inc[e.h].push(i); inc[e.d].push(i); });
  const isMain = new Uint8Array(cg.n);
  for (const m of mains) isMain[m] = 1;

  // level by level from every assigned node at once; a node reached at one level by several
  // clusters takes the least (edge class, role rank, cluster)
  const grow = (allowed) => {
    let front = [];
    for (let i = 0; i < cg.n; i++) if (member[i] >= 0) front.push(i);
    while (front.length) {
      const best = new Map();
      for (const u of front) for (const ei of inc[u]) {
        const e = cg.edges[ei];
        if (!allowed(e)) continue;
        const w = e.h === u ? e.d : e.h;
        if (w === o || isMain[w] || member[w] >= 0) continue;
        const key = [edgeClassRank(e.label), edgeRoleRank(e.label), member[u]];
        const cur = best.get(w);
        if (!cur || key[0] < cur[0] || (key[0] === cur[0] && (key[1] < cur[1] || (key[1] === cur[1] && key[2] < cur[2])))) best.set(w, key);
      }
      front = [];
      for (const [w, key] of [...best.entries()].sort((a, b) => a[0] - b[0])) { member[w] = key[2]; front.push(w); }
    }
  };
  grow((e) => edgeClassRank(e.label) === 0);
  grow((e) => e.label !== 'anchor' && e.label !== 'address');
  for (let i = 0; i < cg.n; i++) if (i !== o && member[i] < 0) return { ok: false, reason: `node ${i} reaches no main clause` };
  const cross = cg.edges.filter((e) => e.h !== o && e.d !== o && member[e.h] !== member[e.d]).map((e) => ({ a: member[e.h], b: member[e.d], label: e.label }));
  return { ok: true, cg, origo: o, mains, member, cross };
}

/* One cluster as its own HMR graph, for E1. The main event's node object is kept so its lobe can be found. */
function clusterGraph(cg, member, c, mainIdx) {
  const g = { v: 'hmr-0.1', nodes: {}, edges: [] };
  let mainObj = null;
  for (let i = 0; i < cg.n; i++) if (member[i] === c) {
    const nd = JSON.parse(JSON.stringify(cg.nodes[i]));
    g.nodes['n' + i] = nd;
    if (i === mainIdx) mainObj = nd;
  }
  for (const e of cg.edges) if (member[e.h] === c && member[e.d] === c) g.edges.push(['n' + e.h, e.label, 'n' + e.d, { ...e.f }]);
  return { g, mainObj };
}

/* ---------------- F2b: gathering ---------------- */

/* Equal arc-length resampling of a closed polygon (Math.sqrt only, BAR_F G5). */
function resample(pts, ds) {
  const n = pts.length / 2, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, dx = pts[2 * j] - pts[2 * i], dy = pts[2 * j + 1] - pts[2 * i + 1]; cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy); }
  const L = cum[n], m = Math.max(8, Math.round(L / ds)), out = new Float64Array(2 * m);
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const s = (k * L) / m;
    while (seg < n - 1 && cum[seg + 1] <= s) seg++;
    const i = seg, j = (seg + 1) % n, L0 = cum[seg + 1] - cum[seg], t = L0 > 0 ? (s - cum[seg]) / L0 : 0;
    out[2 * k] = pts[2 * i] + t * (pts[2 * j] - pts[2 * i]);
    out[2 * k + 1] = pts[2 * i + 1] + t * (pts[2 * j + 1] - pts[2 * i + 1]);
  }
  return out;
}

/* Background not 4-connected to the grid's border becomes ink; returns how many nodes. */
function fillPockets(d, W, H) {
  const seen = new Uint8Array(W * H), st = [];
  const seed = (p) => { if (!d[p] && !seen[p]) { seen[p] = 1; st.push(p); } };
  for (let i = 0; i < W; i++) { seed(i); seed((H - 1) * W + i); }
  for (let j = 0; j < H; j++) { seed(j * W); seed(j * W + W - 1); }
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p - x) / W;
    if (x > 0) seed(p - 1); if (x < W - 1) seed(p + 1); if (y > 0) seed(p - W); if (y < H - 1) seed(p + W);
  }
  let n = 0;
  for (let p = 0; p < W * H; p++) if (!d[p] && !seen[p]) { d[p] = 1; n++; }
  return n;
}

/* The closing of a closed polygon by a disk of radius s, pockets filled, as one resampled outline. */
export function gather(P, s) {
  const h = FIG.GATHER_H, pad = 2 * s + 4 * h, m = P.length / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < m; k++) { x0 = Math.min(x0, P[2 * k]); x1 = Math.max(x1, P[2 * k]); y0 = Math.min(y0, P[2 * k + 1]); y1 = Math.max(y1, P[2 * k + 1]); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.ceil((x1 - x0) / h) + 1, H = Math.ceil((y1 - y0) / h) + 1, N = W * H;
  // the polygon's inside at the nodes, row by row; each edge visits only the rows it crosses
  const ins = new Uint8Array(N), rows = Array.from({ length: H }, () => []);
  for (let k = 0; k < m; k++) {
    const q = (k + 1) % m, ya = P[2 * k + 1], yb = P[2 * q + 1];
    if (ya === yb) continue;
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    for (let j = Math.max(0, Math.ceil((lo - y0) / h)); j < H; j++) {
      const yc = y0 + j * h;
      if (yc >= hi) break;
      if (yc < lo) continue;
      rows[j].push(P[2 * k] + ((P[2 * q] - P[2 * k]) * (yc - ya)) / (yb - ya));
    }
  }
  for (let j = 0; j < H; j++) {
    const xs = rows[j].sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) for (let i = Math.max(0, Math.ceil((xs[t] - x0) / h)); i < W && x0 + i * h < xs[t + 1]; i++) ins[j * W + i] = 1;
  }
  const r2 = (s / h) * (s / h);
  const toInk = edt2({ W, H, d: ins.map((v) => 1 - v) });            // background node: squared distance to the nearest ink
  const dil = Uint8Array.from(ins, (v, p) => (v || toInk[p] <= r2 ? 1 : 0));
  const toOut = edt2({ W, H, d: dil });                              // dilated node: squared distance to the nearest node outside
  const closed = Uint8Array.from(ins, (v, p) => (v || (dil[p] && toOut[p] > r2) ? 1 : 0));
  // two nodes of ink touching only at a corner are bridged (the narrowest gap of all), so the outline
  // never pinches into two loops; then pockets are filled, and again until neither changes anything
  let pockets = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let j = 0; j + 1 < H; j++) for (let i = 0; i + 1 < W; i++) {
      const p = j * W + i, a = closed[p], b = closed[p + 1], c = closed[p + W], d = closed[p + W + 1];
      if (a && d && !b && !c) { closed[p + 1] = closed[p + W] = 1; changed = true; }
      else if (b && c && !a && !d) { closed[p] = closed[p + W + 1] = 1; changed = true; }
    }
    const n = fillPockets(closed, W, H);
    pockets += n;
    if (n) changed = true;
  }
  // a lone node left where the grid sampled a spike tip of the outline is not ink: keep the largest
  // 8-connected piece, and count what is dropped
  const lab = new Int32Array(N), sizes = [0], st = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (!closed[p0] || lab[p0]) continue;
    const id = sizes.length; let sz = 0;
    lab[p0] = id; st.push(p0);
    while (st.length) {
      const p = st.pop(), x = p % W, y = (p - x) / W; sz++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (closed[q] && !lab[q]) { lab[q] = id; st.push(q); }
      }
    }
    sizes.push(sz);
  }
  let keep = 1;
  for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[keep]) keep = i;
  let dropped = 0;
  for (let p = 0; p < N; p++) if (closed[p] && lab[p] !== keep) { closed[p] = 0; dropped++; }
  const eIn = edt2({ W, H, d: closed }), eOut = edt2({ W, H, d: closed.map((v) => 1 - v) });
  const f = new Float64Array(N);
  for (let p = 0; p < N; p++) f[p] = closed[p] ? -(Math.sqrt(eIn[p]) - 0.5) * h : (Math.sqrt(eOut[p]) - 0.5) * h;
  const ms = marchLoops(gridFromDense(W, H, x0, y0, h, f));
  if (ms.loops.length !== 1 || ms.broken) {
    const areas = ms.loops.map((L) => { let a = 0; const n = L.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += L[2 * i] * L[2 * j + 1] - L[2 * j] * L[2 * i + 1]; } return +(a / 2).toFixed(2); });
    return { ok: false, why: `${ms.loops.length} outlines (signed areas ${areas.join(', ')}), ${ms.broken} broken` };
  }
  // how deep inside the gathered mass a point of the old outline lies, in l (0 on the new outline)
  const depthAt = (x, y) => { const i = Math.round((x - x0) / h), j = Math.round((y - y0) / h); return closed[j * W + i] ? Math.max(0, Math.sqrt(eIn[j * W + i]) - 0.5) * h : 0; };
  return { ok: true, pts: resample(ms.loops[0], TOPO.ds), pockets, dropped, depthAt };
}

/* Share of the coded points of E1's outline (those carrying a motif cell) still on the gathered outline. */
function codeKept(dw, gt) {
  const { pts, sym } = dw.contour;
  let n = 0, kept = 0;
  for (let k = 0; k < sym.length; k++) if (sym[k]) { n++; if (gt.depthAt(pts[2 * k], pts[2 * k + 1]) <= 0.5) kept++; }
  return n ? kept / n : 1;
}

/* ---------------- F3: a cluster's frame ---------------- */

/* Area, centroid and central second moments of a closed polygon (flat [x0, y0, x1, y1, ...]). */
function moments(P) {
  const m = P.length / 2;
  let A = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const x0 = P[2 * i], y0 = P[2 * i + 1], x1 = P[2 * j], y1 = P[2 * j + 1];
    const c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    xy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A; xx /= 12; yy /= 12; xy /= 24;
  const s = A < 0 ? -1 : 1;
  const a = Math.abs(A);
  return { A: a, cx, cy, sxx: s * xx - a * cx * cx, syy: s * yy - a * cy * cy, sxy: s * xy - a * cx * cy };
}

function frameOf(P, dw, mainObj) {
  const M = moments(P);
  const hd = (M.sxx - M.syy) / 2;
  const lam = (M.sxx + M.syy) / 2 + Math.sqrt(hd * hd + M.sxy * M.sxy);
  let ex, ey;
  if (Math.abs(M.sxy) > 1e-12 * (Math.abs(M.sxx) + Math.abs(M.syy))) { ex = lam - M.syy; ey = M.sxy; } else if (M.sxx >= M.syy) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  const L = Math.sqrt(ex * ex + ey * ey); ex /= L; ey /= L;
  const lobe = dw.lobes.find((Lb) => Lb.node >= 0 && dw.cg.nodes[Lb.node] === mainObj);
  if (lobe && (lobe.x - M.cx) * ex + (lobe.y - M.cy) * ey < 0) { ex = -ex; ey = -ey; }
  const m = P.length / 2;
  const uv = new Float64Array(2 * m);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let k = 0; k < m; k++) {
    const dx = P[2 * k] - M.cx, dy = P[2 * k + 1] - M.cy;
    const u = dx * ex + dy * ey, v = -dx * ey + dy * ex; // (e1, e2 = e1 turned a quarter left): a proper rotation
    uv[2 * k] = u; uv[2 * k + 1] = v;
    if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
  }
  // where the long axis (v = 0) crosses the outline: the carrier joins the cluster there
  let uFirst = Infinity, uLast = -Infinity;
  for (let k = 0; k < m; k++) {
    const j = (k + 1) % m, v0 = uv[2 * k + 1], v1 = uv[2 * j + 1];
    if ((v0 <= 0 && v1 > 0) || (v1 <= 0 && v0 > 0)) {
      const u = uv[2 * k] + ((uv[2 * j] - uv[2 * k]) * (0 - v0)) / (v1 - v0);
      if (u < uFirst) uFirst = u; if (u > uLast) uLast = u;
    }
  }
  return { uv, area: M.A, uMin, uMax, vMin, vMax, uFirst, uLast, T: uMax - uMin, D: vMax - vMin };
}

/* ---------------- F4 to F7: the ring ---------------- */

/* Angles of the cluster centroids for a cyclic order, and the free arcs (in l). */
function place(order, C, R) {
  const k = order.length;
  let sumT = 0;
  for (const c of order) sumT += C[c].T;
  const free = TAU * R - sumT;
  const arcs = new Float64Array(k);
  if (k === 1) arcs[0] = free;
  else {
    let wsum = 0;
    for (let j = 0; j < k; j++) wsum += C[order[j]].T + C[order[(j + 1) % k]].T;
    const extra = free - k * FIG.ARC_MIN;
    for (let j = 0; j < k; j++) arcs[j] = FIG.ARC_MIN + (extra * (C[order[j]].T + C[order[(j + 1) % k]].T)) / wsum;
  }
  const theta = new Float64Array(k);
  for (let j = 1; j < k; j++) theta[j] = theta[j - 1] + (C[order[j - 1]].uMax + arcs[j - 1] - C[order[j]].uMin) / R;
  return { theta, arcs };
}

function comOf(order, C, R) {
  const { theta } = place(order, C, R);
  let x = 0, y = 0, M = 0;
  for (let j = 0; j < order.length; j++) { const m = C[order[j]].area; x += m * cosK(theta[j]); y += m * sinK(theta[j]); M += m; }
  return Math.sqrt(x * x + y * y) / M;
}

const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
const better = (s, o, sb, ob) => s < sb - 1e-12 || (Math.abs(s - sb) <= 1e-12 && lexLess(o, ob));

function bestOrder(C, R) {
  const k = C.length;
  if (k <= 2) return [...Array(k).keys()];
  let best = null, bs = Infinity;
  if (k <= FIG.EXACT_ORDER) {
    const rest = [...Array(k).keys()].slice(1);
    const perm = (pre, left) => {
      if (!left.length) { const o = [0, ...pre]; const s = comOf(o, C, R); if (better(s, o, bs, best)) { bs = s; best = o; } return; }
      for (let i = 0; i < left.length; i++) perm([...pre, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    };
    perm([], rest);
    return best;
  }
  // insertion, heaviest first, then pairwise swaps while the centre of mass improves
  const byMass = [...Array(k).keys()].sort((a, b) => C[b].area - C[a].area || a - b);
  let o = [byMass[0]];
  for (const c of byMass.slice(1)) {
    let bo = null, s0 = Infinity;
    for (let j = 0; j <= o.length; j++) { const t = [...o.slice(0, j), c, ...o.slice(j)]; const s = comOf(t, C, R); if (better(s, t, s0, bo)) { s0 = s; bo = t; } }
    o = bo;
  }
  const norm = (t) => { const i = t.indexOf(0); return [...t.slice(i), ...t.slice(0, i)]; };
  o = norm(o); bs = comOf(o, C, R);
  for (let pass = 0, moved = true; moved && pass < 20; pass++) {
    moved = false;
    for (let i = 1; i < k; i++) for (let j = i + 1; j < k; j++) {
      const t = o.slice(); [t[i], t[j]] = [t[j], t[i]];
      const s = comOf(t, C, R);
      if (better(s, t, bs, o)) { o = t; bs = s; moved = true; }
    }
  }
  return o;
}

/* opts.spread and opts.rho replace SPREAD and RHO, for the calibration sweep and the tests only. */
export function layoutFigure(g, opts = {}) {
  const spread = opts.spread ?? FIG.SPREAD, rho = opts.rho ?? FIG.RHO;
  const cl = clausesOf(g);
  if (!cl.ok) return cl;
  const { cg, mains, member } = cl;
  const C = [];
  for (let c = 0; c < mains.length; c++) {
    const { g: gc, mainObj } = clusterGraph(cg, member, c, mains[c]);
    const dw = encode(gc);
    if (!dw.ok || !dw.contour) return { ok: false, reason: `cluster ${c}: ${dw.reason || 'no single outline'}` };
    const gt = gather(dw.contour.pts, spread);
    if (!gt.ok) return { ok: false, reason: `cluster ${c}: the gathered mass has ${gt.why}` };
    const ungathered = moments(dw.contour.pts).A;
    C.push({ ...frameOf(gt.pts, dw, mainObj), nodes: Object.keys(gc.nodes).length, lobes: dw.lobes.length, pockets: gt.pockets, dropped: gt.dropped, codeKept: codeKept(dw, gt) });
    C[c].areaGain = C[c].area / ungathered;
  }
  const k = C.length;
  let sumT = 0, Dmax = 0;
  for (const c of C) { sumT += c.T; Dmax = Math.max(Dmax, c.D); }
  const R = Math.max(Dmax / rho, (sumT + k * FIG.ARC_MIN) / TAU);
  const order = bestOrder(C, R);
  const { theta, arcs } = place(order, C, R);
  const rot = ((fnv1a(cg.cert) % 3600) / 3600) * TAU; // turned by the meaning itself, so no angle is a fixed start
  let jg = 0;
  for (let j = 1; j < k; j++) if (arcs[j] > arcs[jg] + 1e-9) jg = j;
  const gapLen = Math.min((FIG.GAP_DEG / 360) * TAU * R, FIG.GAP_SHARE * arcs[jg]);
  const w = FIG.W_RING * R;
  const clusters = order.map((c, j) => ({ ...C[c], cluster: c, theta: theta[j] + rot }));
  // carrier pieces, as angle intervals: from the axis exit of one cluster to the axis entry of the next,
  // reaching one carrier width into each so the joins are solid
  const pieces = [];
  let gap = null;
  for (let j = 0; j < k; j++) {
    const a = clusters[j], b = clusters[(j + 1) % k];
    const s = a.theta + (a.uLast - w) / R;
    let e = b.theta + (b.uFirst + w) / R;
    while (e <= s) e += TAU;
    if (j === jg) {
      const mid = a.theta + (a.uMax + arcs[j] / 2) / R;
      const g0 = mid - gapLen / (2 * R), g1 = mid + gapLen / (2 * R);
      pieces.push([s, g0], [g1, e]);
      gap = { mid, len: gapLen, deg: (gapLen / R) * (180 / PI) };
    } else pieces.push([s, e]);
  }
  return {
    ok: true, version: FIG.version, R, w, clusters, pieces, gap, order,
    arcsDeg: Array.from(arcs, (x) => (x / R) * (180 / PI)),
    crossLinks: cl.cross.length, nodes: cg.n,
  };
}

/* ---------------- raster ---------------- */

function fillPolygon(d, S, P) {
  const m = P.length / 2;
  let y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < m; k++) { y0 = Math.min(y0, P[2 * k + 1]); y1 = Math.max(y1, P[2 * k + 1]); }
  const ys = Math.max(0, Math.floor(y0)), ye = Math.min(S - 1, Math.ceil(y1));
  const xs = [];
  for (let y = ys; y <= ye; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m, ya = P[2 * k + 1], yb = P[2 * j + 1];
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(P[2 * k] + ((P[2 * j] - P[2 * k]) * (yc - ya)) / (yb - ya));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(S - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) d[y * S + x] = 1;
    }
  }
}

/* The figure as a binary mask of S x S pixels (1 is ink), R at R_CANVAS of the width. */
export function rasterFigure(fig, S = 1100) {
  const d = new Uint8Array(S * S);
  const sc = (FIG.R_CANVAS * S) / fig.R, c0 = S / 2;
  const toPx = (X, Y, out, i) => { out[i] = c0 + X * sc; out[i + 1] = c0 - Y * sc; };
  const { R, w } = fig;
  for (const cl of fig.clusters) {
    const m = cl.uv.length / 2, P = new Float64Array(2 * m);
    for (let k = 0; k < m; k++) {
      const phi = cl.theta + cl.uv[2 * k] / R, rad = R - cl.uv[2 * k + 1];
      toPx(rad * cosK(phi), rad * sinK(phi), P, 2 * k);
    }
    fillPolygon(d, S, P);
  }
  for (const [a, b] of fig.pieces) {
    const n = Math.max(2, Math.ceil(((b - a) * R) / FIG.STEP) + 1);
    const P = new Float64Array(4 * n);
    for (let i = 0; i < n; i++) {
      const phi = a + ((b - a) * i) / (n - 1), cs = cosK(phi), sn = sinK(phi);
      toPx((R + w / 2) * cs, (R + w / 2) * sn, P, 2 * i);
      toPx((R - w / 2) * cs, (R - w / 2) * sn, P, 2 * (2 * n - 1 - i));
    }
    fillPolygon(d, S, P);
  }
  // pockets: background not reached from the border (4-neighbours) is filled
  const seen = new Uint8Array(S * S), st = [];
  for (let i = 0; i < S; i++) for (const p of [i, (S - 1) * S + i, i * S, i * S + S - 1]) if (!d[p] && !seen[p]) { seen[p] = 1; st.push(p); }
  while (st.length) {
    const p = st.pop(), x = p % S, y = (p - x) / S;
    for (const q of [x > 0 ? p - 1 : -1, x < S - 1 ? p + 1 : -1, y > 0 ? p - S : -1, y < S - 1 ? p + S : -1]) if (q >= 0 && !d[q] && !seen[q]) { seen[q] = 1; st.push(q); }
  }
  let filled = 0;
  for (let p = 0; p < S * S; p++) if (!d[p] && !seen[p]) { d[p] = 1; filled++; }
  // ink components (8-neighbours)
  const lab = new Int32Array(S * S);
  let comps = 0;
  for (let p0 = 0; p0 < S * S; p0++) {
    if (!d[p0] || lab[p0]) continue;
    comps++; lab[p0] = comps; st.push(p0);
    while (st.length) {
      const p = st.pop(), x = p % S, y = (p - x) / S;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const q = yy * S + xx;
        if (d[q] && !lab[q]) { lab[q] = comps; st.push(q); }
      }
    }
  }
  return { W: S, H: S, d, pocketsFilled: filled, components: comps };
}

/* ---------------- test support: a text of k sentences ---------------- */

/* k sentence graphs (randomHMR with one speaker and one main clause each), joined into one text:
   one origo, a chain of discourse links between the main clauses, and a coreference link between
   neighbouring sentences half the time. n may be a list, one size per sentence in turn. Stands in for F8's
   English until F8 is built. */
export function randomText(rnd, k, n = 7) {
  const parts = [];
  for (let guard = 0; parts.length < k && guard < 200 * k; guard++) {
    const g = randomHMR(rnd, { n: Array.isArray(n) ? n[parts.length % n.length] : n });
    const ids = Object.keys(g.nodes);
    const origos = ids.filter((id) => g.nodes[id].k === 'origo');
    const anchors = g.edges.filter((e) => e[1] === 'anchor');
    if (origos.length === 1 && anchors.length === 1) parts.push({ g, origo: origos[0], main: anchors[0][2] });
  }
  if (parts.length < k) throw new Error(`randomText: ${parts.length} of ${k} sentences`);
  const out = { v: parts[0].g.v, nodes: { o: JSON.parse(JSON.stringify(parts[0].g.nodes[parts[0].origo])) }, edges: [] };
  const id = (i, x) => (x === parts[i].origo ? 'o' : `s${i}${x}`);
  parts.forEach((p, i) => {
    for (const [x, nd] of Object.entries(p.g.nodes)) if (x !== p.origo) out.nodes[id(i, x)] = nd;
    for (const [h, l, d, f] of p.g.edges) out.edges.push([id(i, h), l, id(i, d), f]);
  });
  for (let i = 1; i < k; i++) {
    out.edges.push([id(i - 1, parts[i - 1].main), 'disc', id(i, parts[i].main), { rel: pick(rnd, EDGE_LABELS.disc.f.rel) }]);
    if (rnd() < 0.5) {
      const ents = (j) => Object.keys(parts[j].g.nodes).filter((x) => parts[j].g.nodes[x].k === 'entity');
      const a = ents(i - 1), b = ents(i);
      if (a.length && b.length) out.edges.push([id(i - 1, pick(rnd, a)), 'same-entity', id(i, pick(rnd, b)), {}]);
    }
  }
  return out;
}
