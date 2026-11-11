/* ============================================================
   dimensional_mania/project.js — from n dimensions to the screen's 3.

   Three projections, each a real map:
     · perspective: the cascade x_k -> x_k · D / (D - x_d), dividing by the
       highest axis first, down to 3. A projective map, so straight edges
       stay straight.
     · orthographic: the hidden coordinates are dropped.
     · stereographic (4D, objects on the unit 3-sphere): x -> xyz / (1 - w)
       from the pole w = 1. Great circles become circles, so each edge is
       drawn as a subdivided arc.
   Plus the paths the vertices travel (trails), computed from the motion
   itself: the past path of a vertex is M_k·x with M_k the k-th power of
   the inverse frame step, so a trail is exact from the first frame and
   needs no history buffer.
   ============================================================ */

import { eye, leftGivens, mul } from './linalg.js';
import { RENDER } from './constants.js';

const CLAMP = RENDER.perspClamp;
const STEREO_MIN = RENDER.stereoMin;
export const STEREO_CLIP = RENDER.stereoClip;

/**
 * Project count turned points (stride n) into out (stride 3).
 * stress[d] collects, per hidden axis d, the largest |scale - 1| it applies
 * (perspective, stereographic) or the largest |x_d| it drops (orthographic).
 * depth[v] in 0..1 says how far along the deepest axis a point sits.
 */
const scratch = new Float64Array(16);
export function projectAll(X, n, count, mode, D, out, stress = null, depth = null) {
  if (stress) stress.fill(0);
  const t = scratch; // no allocation per frame
  for (let v = 0; v < count; v++) {
    const o = v * n;
    for (let k = 0; k < n; k++) t[k] = X[o + k];
    for (let k = n; k < 3; k++) t[k] = 0;
    if (mode === 'stereo' && n === 4) {
      const s = 1 / Math.max(1 - t[3], STEREO_MIN);
      if (stress) stress[3] = Math.max(stress[3], Math.abs(s - 1));
      t[0] *= s; t[1] *= s; t[2] *= s;
    } else {
      for (let d = n - 1; d >= 3; d--) {
        if (mode === 'ortho') { if (stress) stress[d] = Math.max(stress[d], Math.abs(t[d])); continue; }
        const s = D / Math.max(D - t[d], CLAMP);
        if (stress) stress[d] = Math.max(stress[d], Math.abs(s - 1));
        for (let k = 0; k < d; k++) t[k] *= s;
      }
    }
    out[v * 3] = t[0]; out[v * 3 + 1] = t[1]; out[v * 3 + 2] = t[2];
    if (depth) depth[v] = n >= 4 ? 0.5 + 0.5 * X[o + n - 1] : n === 3 ? 0.5 + 0.5 * X[o + 2] : 0.8;
  }
}

/** the scale perspective gives a point at depth w on the last axis (4D) */
export const perspScale = (D, w) => D / Math.max(D - w, CLAMP);

/**
 * Stereographic edges as arcs: each edge is split into `sub` pieces along
 * its great arc (normalised interpolation), projected, and written as line
 * segments. Pieces that run off past the clip radius collapse to a point.
 * @returns {number} the number of segment vertices written
 */
export function stereoArcs(X, o, sub, pos, col, depthCol, fadeR = Infinity, clip = STEREO_CLIP) {
  const E = o.edges, n = 4;
  let w = 0;
  const p = [0, 0, 0, 0];
  const put = (a, b, t, at) => {
    let s2 = 0;
    for (let k = 0; k < 4; k++) { p[k] = X[a * n + k] * (1 - t) + X[b * n + k] * t; s2 += p[k] * p[k]; }
    const len = Math.sqrt(s2) || 1;
    for (let k = 0; k < 4; k++) p[k] /= len;
    const s = 1 / Math.max(1 - p[3], STEREO_MIN);
    pos[at] = p[0] * s; pos[at + 1] = p[1] * s; pos[at + 2] = p[2] * s;
    return Math.hypot(pos[at], pos[at + 1], pos[at + 2]);
  };
  for (let e = 0; e < o.ne; e++) {
    const a = E[2 * e], b = E[2 * e + 1];
    for (let s = 0; s < sub; s++) {
      const r0 = put(a, b, s / sub, w * 3);
      const r1 = put(a, b, (s + 1) / sub, w * 3 + 3);
      if (r0 > clip || r1 > clip) {
        pos[w * 3 + 3] = pos[w * 3]; pos[w * 3 + 4] = pos[w * 3 + 1]; pos[w * 3 + 5] = pos[w * 3 + 2];
      }
      depthCol(a, b, s / sub, col, w * 3);
      depthCol(a, b, (s + 1) / sub, col, w * 3 + 3);
      // arcs far from the pole's antipode fade as 1/r^2: the core reads, the outer shells recede
      const r = Math.max(r0, r1);
      if (r > fadeR) {
        const f = (fadeR / r) ** 2;
        for (let k = 0; k < 6; k++) col[w * 3 + k] *= f;
      }
      w += 2;
    }
  }
  return w;
}

/**
 * The inverse frame step as a sequence of matrices. The frame update is
 * R <- G_m(t_m)···G_1(t_1)·R; its inverse applies G_m(-t_m) first and
 * G_1(-t_1) last. Returns M_0 = I, M_1 = B, ..., M_L = B^L.
 */
export function backSteps(planes, n, dt, L) {
  const B = eye(n);
  for (let p = planes.length - 1; p >= 0; p--) leftGivens(B, n, planes[p].i, planes[p].j, -planes[p].omega * dt);
  const out = [eye(n)];
  for (let k = 1; k <= L; k++) out.push(mul(B, out[k - 1], n));
  return out;
}

/** M·x for every point (stride n), into out */
export function applyAll(M, X, n, count, out) {
  for (let v = 0; v < count; v++) {
    const o = v * n;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += M[i * n + k] * X[o + k];
      out[o + i] = s;
    }
  }
  return out;
}

/** powers of one step matrix: out[k] = M^k, k = 0..L */
export function powers(M, n, L) {
  const out = [eye(n)];
  for (let k = 1; k <= L; k++) out.push(mul(M, out[k - 1], n));
  return out;
}
