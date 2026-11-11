/* ============================================================
   dimensional_mania/linalg.js — the small dense linear algebra the
   instrument runs on. Pure functions, no DOM, no THREE. Matrices are
   row-major Float64Array(n*n), n <= 10.

   What lives here:
     · rotation state: identity, left Givens turns, re-orthonormalising
     · reading a rotation: the symmetric Jacobi eigen-solver, used for
       the canonical form (every rotation of R^n is floor(n/2) turns in
       mutually perpendicular planes; standard linear algebra, the real
       normal form of an orthogonal matrix)
     · alignment: the rotation that carries a direction onto an axis
     · the Givens decomposition: any R in SO(n) as C(n,2) plane turns,
       which is how a pose fits in a URL
   ============================================================ */

export const eye = (n) => {
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  return M;
};

export const copy = (M) => new Float64Array(M);

/** out = A·B (out may not alias A or B) */
export function mul(A, B, n, out = new Float64Array(n * n)) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i * n + k] * B[k * n + j];
      out[i * n + j] = s;
    }
  }
  return out;
}

export function transpose(M, n, out = new Float64Array(n * n)) {
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j * n + i] = M[i * n + j];
  return out;
}

/**
 * M <- G(i,j,theta)·M. G turns the (i,j) plane of world space by theta:
 * x_i' = x_i cos - x_j sin, x_j' = x_i sin + x_j cos. Rows i and j mix.
 */
export function leftGivens(M, n, i, j, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const ri = i * n, rj = j * n;
  for (let k = 0; k < n; k++) {
    const a = M[ri + k], b = M[rj + k];
    M[ri + k] = a * c - b * s;
    M[rj + k] = a * s + b * c;
  }
  return M;
}

/** Gram-Schmidt on the rows: pulls a drifting product back into SO(n). */
export function orthonormalize(M, n) {
  for (let i = 0; i < n; i++) {
    const ri = i * n;
    for (let p = 0; p < i; p++) {
      const rp = p * n;
      let d = 0;
      for (let k = 0; k < n; k++) d += M[ri + k] * M[rp + k];
      for (let k = 0; k < n; k++) M[ri + k] -= d * M[rp + k];
    }
    let len = 0;
    for (let k = 0; k < n; k++) len += M[ri + k] * M[ri + k];
    len = Math.sqrt(len) || 1;
    for (let k = 0; k < n; k++) M[ri + k] /= len;
  }
  return M;
}

/** out = M·x */
export function apply(M, n, x, out = new Float64Array(n)) {
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += M[i * n + k] * x[k];
    out[i] = s;
  }
  return out;
}

/**
 * Eigenvalues of a symmetric matrix by cyclic Jacobi rotations.
 * Exact to ~1e-12 for n <= 10 in a handful of sweeps.
 * @returns {number[]} eigenvalues, ascending
 */
export function eigSym(S, n) {
  const A = new Float64Array(S);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p * n + p], aqq = A[q * n + q];
        const tau = (aqq - app) / (2 * apq);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(A[i * n + i]);
  return ev.sort((a, b) => a - b);
}

/**
 * The angular speeds of a motion. A = sum of omega_p over the spinning
 * planes is a skew-symmetric generator; -A^2 is symmetric with eigenvalues
 * omega_k^2, each twice. So however many planes you set turning, the motion
 * is floor(n/2) independent spins in perpendicular planes.
 * @param {{i:number,j:number,omega:number}[]} planes
 * @returns {number[]} floor(n/2) speeds, descending (rad/s)
 */
export function generatorSpeeds(planes, n) {
  const A = new Float64Array(n * n);
  for (const p of planes) {
    A[p.i * n + p.j] -= p.omega;
    A[p.j * n + p.i] += p.omega;
  }
  const N = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s -= A[i * n + k] * A[k * n + j];
    N[i * n + j] = s;
  }
  const ev = eigSym(N, n).sort((a, b) => b - a);
  const out = [];
  for (let k = 0; k < Math.floor(n / 2); k++) {
    out.push(Math.sqrt(Math.max(0, (ev[2 * k] + ev[2 * k + 1]) / 2)));
  }
  return out;
}

/**
 * The angles of a pose R (how far it sits from the identity): the
 * eigenvalues of (R + R^T)/2 are cos(theta_k), each twice, plus a 1 for odd n.
 * @returns {number[]} floor(n/2) angles in [0, pi], descending
 */
export function poseAngles(R, n) {
  const S = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i * n + j] = (R[i * n + j] + R[j * n + i]) / 2;
  const ev = eigSym(S, n); // ascending: largest angles first
  const out = [];
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const c = Math.max(-1, Math.min(1, (ev[2 * k] + ev[2 * k + 1]) / 2));
    out.push(Math.acos(c));
  }
  return out;
}

/** The rotation in the plane of u and e_k that carries unit u onto e_k. */
export function alignRotation(u, k, n) {
  const a = new Float64Array(n);
  let len = 0;
  for (let i = 0; i < n; i++) len += u[i] * u[i];
  len = Math.sqrt(len) || 1;
  for (let i = 0; i < n; i++) a[i] = u[i] / len;
  const R = eye(n);
  const cos = a[k];
  if (cos > 1 - 1e-12) return R;
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) b[i] = (i === k ? 1 : 0) - cos * a[i];
  let bl = 0;
  for (let i = 0; i < n; i++) bl += b[i] * b[i];
  bl = Math.sqrt(bl);
  if (bl < 1e-12) { // u = -e_k: a half turn in (k, k+1)
    return leftGivens(R, n, k, (k + 1) % n, Math.PI);
  }
  for (let i = 0; i < n; i++) b[i] /= bl;
  const th = Math.acos(Math.max(-1, Math.min(1, cos)));
  const c1 = Math.cos(th) - 1, s = Math.sin(th);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    R[i * n + j] += c1 * (a[i] * a[j] + b[i] * b[j]) + s * (b[i] * a[j] - a[i] * b[j]);
  }
  return R;
}

/** The fixed plane order of the Givens decomposition for dimension n. */
export function givensPlanes(n) {
  const out = [];
  for (let c = 0; c < n - 1; c++) for (let r = n - 1; r > c; r--) out.push([c, r]);
  return out;
}

/**
 * R = G(p1,t1)·G(p2,t2)···G(pm,tm) over givensPlanes(n). Zeroes the lower
 * triangle column by column with left turns, recording each angle.
 * @returns {number[]} C(n,2) angles in (-pi, pi]
 */
export function givensDecompose(R, n) {
  const Q = new Float64Array(R);
  const angles = [];
  for (const [c, r] of givensPlanes(n)) {
    const a = Q[c * n + c], b = Q[r * n + c];
    const th = Math.atan2(b, a);
    leftGivens(Q, n, c, r, -th);
    angles.push(th);
  }
  return angles;
}

export function givensCompose(angles, n) {
  const planes = givensPlanes(n);
  const M = eye(n);
  for (let k = planes.length - 1; k >= 0; k--) leftGivens(M, n, planes[k][0], planes[k][1], angles[k] || 0);
  return M;
}

/**
 * Affine dimension of a point set (rank of the differences to the first
 * point), by Gram-Schmidt with a tolerance.
 * @param {Float64Array} V flat coordinates, stride n
 * @param {number[]} idx vertex indices
 */
export function affineDim(V, n, idx, tol = 1e-7) {
  if (idx.length < 2) return 0;
  const o = idx[0] * n;
  const basis = [];
  for (let t = 1; t < idx.length && basis.length < n; t++) {
    const p = idx[t] * n;
    const v = new Float64Array(n);
    for (let k = 0; k < n; k++) v[k] = V[p + k] - V[o + k];
    for (const b of basis) {
      let d = 0;
      for (let k = 0; k < n; k++) d += v[k] * b[k];
      for (let k = 0; k < n; k++) v[k] -= d * b[k];
    }
    let len = 0;
    for (let k = 0; k < n; k++) len += v[k] * v[k];
    len = Math.sqrt(len);
    if (len > tol) {
      for (let k = 0; k < n; k++) v[k] /= len;
      basis.push(v);
    }
  }
  return basis.length;
}

/** n choose k, exact for the sizes used here. */
export function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return Math.round(c);
}

/**
 * Symmetric eigen-decomposition with vectors (cyclic Jacobi).
 * @returns {{values:number[], vectors:Float64Array[]}} ascending, unit vectors
 */
export function eigSymVec(S, n) {
  const A = new Float64Array(S);
  const Q = eye(n);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off < 1e-26) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q];
      if (Math.abs(apq) < 1e-300) continue;
      const tau = (A[q * n + q] - A[p * n + p]) / (2 * apq);
      const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = A[k * n + p], akq = A[k * n + q];
        A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = A[p * n + k], aqk = A[q * n + k];
        A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const qkp = Q[k * n + p], qkq = Q[k * n + q];
        Q[k * n + p] = c * qkp - s * qkq; Q[k * n + q] = s * qkp + c * qkq;
      }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[a * n + a] - A[b * n + b]);
  return {
    values: idx.map((i) => A[i * n + i]),
    vectors: idx.map((i) => Float64Array.from({ length: n }, (_, k) => Q[k * n + i])),
  };
}

/**
 * The canonical form of a pose R in SO(n): floor(n/2) angles, each with its
 * invariant plane, described by the coordinate plane it lies closest to
 * (the largest Pluecker coordinate a_i b_j - a_j b_i of an orthonormal
 * basis a, b of the plane; 1 means exactly that coordinate plane).
 */
export function canonicalPlanes(R, n) {
  const S = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i * n + j] = (R[i * n + j] + R[j * n + i]) / 2;
  const { values, vectors } = eigSymVec(S, n);
  const out = [];
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const c = Math.max(-1, Math.min(1, (values[2 * k] + values[2 * k + 1]) / 2));
    const a = vectors[2 * k], b = vectors[2 * k + 1];
    let best = 0, bi = 0, bj = 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const p = Math.abs(a[i] * b[j] - a[j] * b[i]);
      if (p > best) { best = p; bi = i; bj = j; }
    }
    out.push({ angle: Math.acos(c), i: bi, j: bj, weight: best });
  }
  // equal angles: the invariant planes are not unique (isoclinic in that block)
  for (let k = 1; k < out.length; k++) if (Math.abs(out[k].angle - out[k - 1].angle) < 1e-6) { out[k].shared = true; out[k - 1].shared = true; }
  return out;
}

/** max |R·R^T - I| entry and det R, the checks that R is a rotation */
export function rotationChecks(R, n) {
  let err = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += R[i * n + k] * R[j * n + k];
    err = Math.max(err, Math.abs(s - (i === j ? 1 : 0)));
  }
  // determinant by Gaussian elimination with partial pivoting
  const M = new Float64Array(R);
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
    if (Math.abs(M[p * n + c]) < 1e-300) return { err, det: 0 };
    if (p !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[p * n + k]; M[p * n + k] = t; } det = -det; }
    det *= M[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / M[c * n + c];
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
    }
  }
  return { err, det };
}

/** exp(t·A) for a skew-symmetric A, by scaling and squaring a Taylor series */
export function expSkew(A, n, t) {
  let norm = 0;
  for (let i = 0; i < n * n; i++) norm = Math.max(norm, Math.abs(A[i] * t));
  let sq = 0;
  while (norm * n > 0.25 && sq < 30) { norm /= 2; sq++; }
  const s = t / 2 ** sq;
  const X = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) X[i] = A[i] * s;
  let E = eye(n), term = eye(n);
  for (let k = 1; k <= 12; k++) {
    term = mul(term, X, n);
    for (let i = 0; i < n * n; i++) term[i] /= k;
    for (let i = 0; i < n * n; i++) E[i] += term[i];
  }
  for (let k = 0; k < sq; k++) E = mul(E, E, n);
  return E;
}

/** the generator matrix A = sum of omega over the given planes (A_ij = -omega, A_ji = +omega) */
export function generatorOf(planes, n) {
  const A = new Float64Array(n * n);
  for (const p of planes) { A[p.i * n + p.j] -= p.omega; A[p.j * n + p.i] += p.omega; }
  return A;
}
