/* ============================================================
   n_dimensional_cube.js — the geometry core of the Dimensions
   instrument. Pure maths, no rendering policy.

   A measure polytope (n-cube) lives in R^n: 2^n vertices at the
   corners {-1,+1}^n, edges between corners that differ in exactly
   one coordinate. We rotate it in R^n with accumulated per-plane
   angles, then project it down to R^3 one axis at a time by
   perspective division — the same fold that turns a tesseract
   inside-out. Colour encodes how deep a vertex sits in the
   hidden axes (cold horizon = in our space, warm accretion =
   pushed into a dimension we cannot see).

   Replaces the old recursive child-embedding (a combinatorial
   blow-up that did NOT represent higher dimensions) and the
   fabricated polytope names.
   ============================================================ */

/** Axis letters, in fold order. X Y Z are visible; W onward are hidden. */
export const AXES = ['X', 'Y', 'Z', 'W', 'V', 'U', 'T', 'S', 'R', 'Q'];

/** Correct names of the measure polytopes (the "-eract" series). */
export const POLY_NAMES = {
  1: 'segment', 2: 'square', 3: 'cube', 4: 'tesseract',
  5: 'penteract', 6: 'hexeract', 7: 'hepteract', 8: 'octeract',
  9: 'enneract', 10: 'dekeract',
};

/** n choose k. */
export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

/**
 * Number of k-faces of an n-cube: C(n,k) * 2^(n-k).
 * k=0 vertices, k=1 edges, k=2 squares, k=3 cells, ...
 */
export function faceCount(n, k) {
  return binomial(n, k) * Math.pow(2, n - k);
}

/** Human element ledger for dimension n (only the ranks that exist). */
export function elementLedger(n) {
  const ranks = [
    { k: 0, label: 'vertices' },
    { k: 1, label: 'edges' },
    { k: 2, label: 'faces' },
    { k: 3, label: 'cells' },
    { k: 4, label: '4-faces' },
    { k: 5, label: '5-faces' },
    { k: 6, label: '6-faces' },
    { k: 7, label: '7-faces' },
    { k: 8, label: '8-faces' },
    { k: 9, label: '9-faces' },
  ];
  return ranks
    .filter((r) => r.k < n)
    .map((r) => ({ ...r, count: faceCount(n, r.k) }));
}

/**
 * The list of "fold planes" for dimension n: every coordinate plane
 * that involves at least one hidden axis (index >= 3), paired with a
 * visible axis (0,1,2). These are the rotations that actually fold a
 * higher dimension into view; rotating purely among X/Y/Z just spins
 * the shadow, which the camera already does.
 * @returns {{i:number,j:number,id:string,label:string,omega:number}[]}
 */
export function foldPlanes(n) {
  const planes = [];
  let idx = 0;
  for (let h = 3; h < n; h++) {
    for (let v = 0; v < 3; v++) {
      // golden-ratio spread so "all planes on" tumbles richly, not in lockstep
      const omega = 0.55 + 0.45 * (((idx + 1) * 0.6180339887) % 1);
      planes.push({
        i: v,
        j: h,
        id: `${v}-${h}`,
        label: `${AXES[v]}–${AXES[h]}`,
        omega,
      });
      idx++;
    }
  }
  return planes;
}

/** The three pure-spatial spin planes (for the optional 3D tumble). */
export const SPATIAL_PLANES = [
  { i: 0, j: 1, omega: 0.7 },
  { i: 1, j: 2, omega: 0.5 },
  { i: 0, j: 2, omega: 0.3 },
];

export class HyperCube {
  /** @param {number} dimension 1..10 */
  constructor(dimension) {
    this.dimension = dimension;
    this._buildTopology();
  }

  _buildTopology() {
    const n = this.dimension;
    const vCount = Math.pow(2, n);
    this.vCount = vCount;

    // vertex coordinates, flat: [v0_x0, v0_x1, ..., v1_x0, ...]
    const coords = new Float32Array(vCount * n);
    for (let i = 0; i < vCount; i++) {
      for (let j = 0; j < n; j++) {
        coords[i * n + j] = (i & (1 << j)) ? 1 : -1;
      }
    }
    this.coords = coords;

    // edges: vertex pairs differing in exactly one coordinate (one set bit
    // of the XOR). Index buffer for THREE.LineSegments.
    const edges = [];
    for (let i = 0; i < vCount; i++) {
      for (let b = 0; b < n; b++) {
        const j = i ^ (1 << b);
        if (j > i) edges.push(i, j); // j>i avoids duplicates
      }
    }
    this.edgeIndex = new Uint32Array(edges);
    this.edgeCount = edges.length / 2;

    // scratch buffer reused each projection
    this._tmp = new Float64Array(n);
  }

  /**
   * Project every vertex from R^n down to R^3 and write xyz into `out`.
   *
   * @param {Float32Array} out          length vCount*3
   * @param {object} opts
   * @param {Float32Array} [opts.colors]  length vCount*3 (depth-coloured)
   * @param {Array<{i:number,j:number,angle:number}>} opts.rotations
   * @param {number} opts.projDistance    perspective distance for each fold
   * @param {number} opts.unfold          0..1 morph: hidden axes scaled in
   * @param {{cold:number[],warm:number[]}} [opts.palette] rgb 0..1 endpoints
   * @param {boolean} [opts.ortho]        orthographic (skip the w-divide)
   * @param {Float32Array} [opts.stress]  length n; filled with per-axis max
   *                                      projective distortion |D/(D-w) - 1|
   *                                      (the Shadow Ledger reads this)
   */
  project(out, opts) {
    const {
      colors = null,
      rotations,
      projDistance,
      unfold,
      palette = null,
      ortho = false,
      stress = null,
    } = opts;

    const n = this.dimension;
    const tmp = this._tmp;
    const hiddenAxes = Math.max(0, n - 3);
    const hiddenNorm = hiddenAxes > 0 ? 1 / Math.sqrt(hiddenAxes) : 0;
    if (stress) stress.fill(0);

    for (let v = 0; v < this.vCount; v++) {
      // load, ramping hidden axes in by `unfold` (the morph / "rise from 3D")
      for (let d = 0; d < n; d++) {
        let c = this.coords[v * n + d];
        if (d >= 3) c *= unfold;
        tmp[d] = c;
      }

      // accumulated per-plane Givens rotations in R^n (fixed order = stable)
      for (let r = 0; r < rotations.length; r++) {
        const { i, j, angle } = rotations[r];
        if (angle === 0) continue;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const a = tmp[i];
        const b = tmp[j];
        tmp[i] = a * ca - b * sa;
        tmp[j] = a * sa + b * ca;
      }

      // depth colour from how far the vertex sits in the hidden axes
      if (colors && palette) {
        let hsum = 0;
        for (let d = 3; d < n; d++) hsum += tmp[d] * tmp[d];
        // 0 (in our 3-space) -> 1 (deep in hidden dims)
        const t = hiddenAxes > 0 ? Math.min(1, Math.sqrt(hsum) * hiddenNorm) : 0;
        const cold = palette.cold;
        const warm = palette.warm;
        colors[v * 3] = cold[0] + (warm[0] - cold[0]) * t;
        colors[v * 3 + 1] = cold[1] + (warm[1] - cold[1]) * t;
        colors[v * 3 + 2] = cold[2] + (warm[2] - cold[2]) * t;
      }

      // collapse the highest axis first, n-1 down to 3
      for (let d = n - 1; d >= 3; d--) {
        const w = tmp[d];
        // denominator hard-clamped so a vertex near the projection point
        // cannot blow up or flip sign
        const denom = Math.max(projDistance - w, 0.3);
        const s = projDistance / denom;
        // the Shadow Ledger reads this distortion in every mode — it is how
        // hard axis d is bending the shadow, whether or not we divide by it
        if (stress) {
          const dist = Math.abs(s - 1);
          if (dist > stress[d]) stress[d] = dist;
        }
        // orthographic just drops the axis (stable once perspective collapse
        // becomes mush past the legibility wall); perspective divides by it
        if (!ortho) {
          for (let k = 0; k < d; k++) tmp[k] *= s;
        }
      }

      out[v * 3] = tmp[0];
      out[v * 3 + 1] = n >= 2 ? tmp[1] : 0;
      out[v * 3 + 2] = n >= 3 ? tmp[2] : 0;
    }
  }
}
