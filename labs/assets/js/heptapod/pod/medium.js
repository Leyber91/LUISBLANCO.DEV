/* ============================================================
   heptapod/pod/medium.js — the ink in the disc of fog, as a field.

   The fog gives light and the ink takes it away: each cell of the
   field holds a density of ink, and the fog behind it shows through
   by Beer-Lambert absorption (the ordinary physics of a dye in lit
   air). How dark the densest ink gets is not derived here: T_MIN and
   ABSORB are calibrations to a number measured on film stills, the
   only film number this file uses, and MEDIUM_CALIBRATIONS records
   them (research/ip.md rule 9: a film number enters as a range to
   land in, recorded as a calibration).

   A ring does not draw. It arrives as a haze: the target (where the
   ring's ink belongs) blurred wide, with the same total ink, and every
   cell then relaxes toward the target at one rate. Relaxation is
   linear and its rate is the same everywhere, so with no haze every
   part of the ring reaches half its darkness at the same moment; the
   haze puts a little ink everywhere first, so a lighter stroke gets
   there a little sooner (measured by the test: within a tenth of the
   bloom). While the ink gathers its total stays the target's (the
   sum of a linear relaxation toward a target of equal sum does not
   change). The rate is set so that 95% of the way is done in
   TIME.bloom. A ring written while another is still in the disc does
   not gather from the old one's ink: that ink moves to a layer of its
   own and leaves at the same rate on the stirred flow, so every part
   of the new ring starts level.

   The flow is still while a ring gathers (flowFor below), so the
   claim above holds as the scene runs it; the tests check it on the
   pod's own figures at the scene's field size.

   A slow flow carries the ink while it hangs: a divergence-free
   velocity, the curl of a smooth noise (Bridson, Hourihan and
   Nordenstam, "Curl-noise for procedural fluid flow", ACM
   Transactions on Graphics 26(3), 2007), applied by semi-Lagrangian
   advection (Stam, "Stable Fluids", SIGGRAPH 1999). Against the
   pull back to the target the edges breathe and the ring keeps its
   shape. When the target thins, the ink that no longer belongs
   anywhere is carried and fades into the fog.

   Pure computation: typed arrays in, typed arrays out, no DOM, so
   tests/medium.test.mjs runs it in Node.
   [ILLUSTRATIVE: the medium is designed for this lab; the absorption
   law and the two methods are published]
   ============================================================ */

export const MEDIUM = Object.freeze({
  GATHER: 1.3617,   // 1/s: ln(20) / 2.2 s, so 95% of the way in TIME.bloom (scene.js)
  HAZE: 0.3,        // the haze's blur radius, as a share of the field's side. A calibration: the test's bound (a
                    // tenth of the bloom) was written first; 0.07, 0.1, 0.15 and 0.22 spread the crossings over 15%,
                    // 17%, 14% and 11% of it, 0.3 over 9% (2026-11-17)
  FLOW_HOLD: 0.006, // the flow's top speed while a ring hangs, in field sides per second
  FLOW_STIR: 0.02,  // while a ring thins, or its ink leaves the disc
  EDDIES: 4,        // eddies of the flow across the field's side
  DRIFT: 0.09,      // how fast the flow's pattern changes, lattice steps per second
  ABSORB: 0.75,     // optical depth of a fully inked cell: transmittance 0.47 (a calibration, below)
  T_MIN: 0.45,      // the least transmittance drawn (a calibration, below)
  SETTLED: 0.03,    // the largest |target - ink| at which the ink counts as settled
});

/* The values set to land in a film measurement, each with its source (research/ip.md rule 9). */
export const MEDIUM_CALIBRATIONS = Object.freeze([
  { name: 'T_MIN', value: MEDIUM.T_MIN, source: 'research/film.md 7 (2026-11-11): the ink on three film stills lets through 0.49 to 0.51 of the light of the fog behind it at its densest (p1); set just under that range' },
  { name: 'ABSORB', value: MEDIUM.ABSORB, source: 'research/film.md 7: read as Beer-Lambert, an optical depth below about 0.7 at the densest; a fully inked cell is set to 0.75, transmittance 0.47' },
]);

/** The flow for the moment of a ring: still while it gathers, slow while it hangs, stirred while it thins or leaves. */
export function flowFor(phase) {
  if (phase === 'forming') return 0;
  if (phase === 'hanging') return MEDIUM.FLOW_HOLD;
  return MEDIUM.FLOW_STIR;
}

/* ---------------- seeded smooth noise ----------------
   Lifted to kit/fog.js on 2026-11-21, unchanged, when the Orthogonal plate became its second caller; imported
   and re-exported here so this file's callers and tests read it as before. */
import { noise3, fogNoise } from '../../kit/fog.js';
export { noise3, fogNoise };

/* ---------------- box blur (three passes approximate a Gaussian) ---------------- */
export function boxBlur(F, N, r, tmp = new Float32Array(N * N)) {
  if (r < 1) return F;
  const n = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < N; y++) {
      const o = y * N;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += x >= 0 && x < N ? F[o + x] : 0;
      for (let x = 0; x < N; x++) {
        tmp[o + x] = acc / n;
        const add = x + r + 1, sub = x - r;
        acc += (add < N ? F[o + add] : 0) - (sub >= 0 ? F[o + sub] : 0);
      }
    }
    for (let x = 0; x < N; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += y >= 0 && y < N ? tmp[y * N + x] : 0;
      for (let y = 0; y < N; y++) {
        F[y * N + x] = acc / n;
        const add = y + r + 1, sub = y - r;
        acc += (add < N ? tmp[add * N + x] : 0) - (sub >= 0 ? tmp[sub * N + x] : 0);
      }
    }
  }
  return F;
}

const sum = (A) => { let s = 0; for (let i = 0; i < A.length; i++) s += A[i]; return s; };

/* ---------------- the field ---------------- */
export class InkField {
  /** N cells a side over the disc's square; seed picks the flow. */
  constructor(N, seed = 1) {
    this.N = N;
    this.seed = seed >>> 0;
    this.D = new Float32Array(N * N);     // the ink of the ring now written
    this.O = new Float32Array(N * N);     // the ink of the rings before it, leaving the disc
    this.T = new Float32Array(N * N);     // where the ink belongs
    this.B = new Float32Array(N * N);     // scratch
    this.G = 2 * MEDIUM.EDDIES + 2;       // the flow's lattice, nodes a side
    this.u = new Float32Array(this.G * this.G);
    this.v = new Float32Array(this.G * this.G);
    this.time = 0;
    this.residual = 0;
    this.oldLive = false;
  }

  /**
   * A new target (values 0..1). With haze, a new ring: its ink arrives spread wide around it, its total kept, and the
   * ink already in the disc becomes the old ring's, which leaves on its own (O), so the new ring gathers from its
   * haze alone and every part of it starts level. Without haze, the same ring at another moment of its thinning.
   */
  setTarget(T, haze = false) {
    this.T.set(T);
    if (haze) {
      const B = this.B, D = this.D, O = this.O;
      let live = false;
      for (let i = 0; i < D.length; i++) { O[i] += D[i]; if (O[i] > 0.002) live = true; }
      this.oldLive = live;
      B.set(T);
      boxBlur(B, this.N, Math.max(1, Math.round(MEDIUM.HAZE * this.N)));
      const k = sum(T) / Math.max(1e-9, sum(B));
      for (let i = 0; i < B.length; i++) D[i] = B[i] * k;
    }
    this.residual = this.gap();
  }
  clear() { this.T.fill(0); this.residual = this.gap(); }
  /** The ink where it belongs at once (reduced motion). */
  snap() { this.D.set(this.T); this.O.fill(0); this.oldLive = false; this.residual = 0; }
  gap() { let m = 0; for (let i = 0; i < this.D.length; i++) { const d = Math.abs(this.T[i] - this.D[i]); if (d > m) m = d; } return m; }
  mass() { return sum(this.D); }
  /** The share of the target's ink that is in place: the sum of min(target, ink) over the target's sum. */
  fit() {
    let a = 0, b = 0;
    for (let i = 0; i < this.T.length; i++) { const t = this.T[i]; if (t > 0) { b += t; a += Math.min(t, this.D[i]); } }
    return b > 0 ? a / b : 1;
  }
  get settled() { return this.residual <= MEDIUM.SETTLED; }

  /* The flow at time t: the curl of a noise stream function on a G x G lattice, scaled so its fastest node moves
     `speed` cells per second. */
  flow(speed) {
    const G = this.G, u = this.u, v = this.v, z = this.time * MEDIUM.DRIFT, s = MEDIUM.EDDIES / (G - 1);
    const psi = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) psi[j * G + i] = noise3(this.seed, i * s * 1.7, j * s * 1.7, z);
    let top = 1e-9;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const at = (a, b) => psi[Math.min(G - 1, Math.max(0, b)) * G + Math.min(G - 1, Math.max(0, a))];
      const dpdy = (at(i, j + 1) - at(i, j - 1)) / 2, dpdx = (at(i + 1, j) - at(i - 1, j)) / 2;
      u[j * G + i] = dpdy; v[j * G + i] = -dpdx;
      top = Math.max(top, Math.hypot(dpdy, dpdx));
    }
    const k = speed / top;
    for (let i = 0; i < G * G; i++) { u[i] *= k; v[i] *= k; }
  }

  /** Advance dt seconds with the flow at `flowShare` field sides per second; returns the residual. */
  step(dt, flowShare = MEDIUM.FLOW_HOLD) {
    this.advect(dt, flowShare);
    return this.relax(dt);
  }

  /** Carry the ink along the flow for dt seconds (and move the flow's clock). The old ink is carried by the flow
      the scene uses for ink that leaves, whatever the new ring's moment. */
  advect(dt, flowShare) {
    this.time += dt;
    if (this.oldLive) this.carry(this.O, dt, MEDIUM.FLOW_STIR);
    if (flowShare > 0) this.carry(this.D, dt, flowShare);
  }
  /* One semi-Lagrangian step of one layer along the flow at flowShare field sides per second. */
  carry(D, dt, flowShare) {
    const N = this.N, B = this.B, G = this.G, u = this.u, v = this.v;
    {
      this.flow(flowShare * N);
      const gs = (G - 1) / (N - 1);
      for (let y = 0; y < N; y++) {
        const gy = y * gs, j0 = Math.min(G - 2, Math.floor(gy)), fy = gy - j0;
        for (let x = 0; x < N; x++) {
          const gx = x * gs, i0 = Math.min(G - 2, Math.floor(gx)), fx = gx - i0;
          const a = j0 * G + i0, b = a + 1, c = a + G, d = c + 1;
          const vx = u[a] + (u[b] - u[a]) * fx + (u[c] - u[a]) * fy + (u[a] - u[b] - u[c] + u[d]) * fx * fy;
          const vy = v[a] + (v[b] - v[a]) * fx + (v[c] - v[a]) * fy + (v[a] - v[b] - v[c] + v[d]) * fx * fy;
          // where this cell's ink was dt ago, read by bilinear interpolation (outside the field: no ink)
          const sx = x - vx * dt, sy = y - vy * dt;
          const xi = Math.floor(sx), yi = Math.floor(sy), tx = sx - xi, ty = sy - yi;
          let s = 0;
          if (xi >= 0 && yi >= 0 && xi + 1 < N && yi + 1 < N) {
            const p = yi * N + xi;
            s = D[p] * (1 - tx) * (1 - ty) + D[p + 1] * tx * (1 - ty) + D[p + N] * (1 - tx) * ty + D[p + N + 1] * tx * ty;
          }
          B[y * N + x] = s;
        }
      }
      D.set(B);
    }
  }

  /** Pull every cell toward the target at one rate for dt seconds, and the old ink toward none; returns the residual. */
  relax(dt) {
    const D = this.D, T = this.T, O = this.O;
    const k = 1 - Math.exp(-MEDIUM.GATHER * dt);
    if (this.oldLive) {
      let live = false;
      for (let i = 0; i < O.length; i++) { O[i] -= O[i] * k; if (O[i] > 0.002) live = true; }
      if (!live) O.fill(0);
      this.oldLive = live;
    }
    let m = 0;
    for (let i = 0; i < D.length; i++) {
      const d = D[i] + (T[i] - D[i]) * k;
      D[i] = d;
      const r = Math.abs(T[i] - d);
      if (r > m) m = r;
    }
    this.residual = m;
    return m;
  }

  /** The ink as RGBA pixels (a Uint32Array over an ImageData's buffer): rgb the ink's colour, alpha what it absorbs. */
  paint(px, rgb) {
    const D = this.D, O = this.O, base = (rgb[0] | (rgb[1] << 8) | (rgb[2] << 16)) >>> 0;
    for (let i = 0; i < D.length; i++) {
      const d = D[i] + O[i];
      if (d <= 0.004) { px[i] = 0; continue; }
      const tr = Math.max(MEDIUM.T_MIN, Math.exp(-MEDIUM.ABSORB * d));
      px[i] = (base | (Math.round(255 * (1 - tr)) << 24)) >>> 0;
    }
  }
}

/** The transmittance a density of ink lets through: what the fog behind it keeps of its light. */
export const transmittance = (d) => Math.max(MEDIUM.T_MIN, Math.exp(-MEDIUM.ABSORB * d));
