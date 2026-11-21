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

   Ink is conserved: it moves, and it never appears or vanishes where
   it lies (Luis, 2026-11-21: "the transitions between logograms have
   to be organic, not disappear and appearing like the ink changing
   itself"). A new ring is made of the ink already in the disc, the
   ring before it and the ink dissolved in the fog, carried to where
   the new ring's ink belongs along a plan of least work: optimal
   transport with the squared distance as its cost, the mass-moving
   solution of the continuity equation (Benamou and Brenier, Numerische
   Mathematik 84, 2000). The plan is made by weighted sliced transport
   on a coarse grid (Rabin, Peyre, Delon and Bernot, SSVM 2011): the
   ink's cells are moved, one direction at a time, onto the target's
   quantiles along that direction. The sliced plan scatters neighbours
   that the true least-work map keeps together, so its displacement is
   smoothed as it is made (MOVE.REG) and once more after (MOVE.SMOOTH).
   Every part of the ink sets off together and arrives together, so
   the ring still forms whole at once, as Chiang's semagrams are
   written. On the way the ink follows a divergence-free swirl and
   spreads, both as sin(pi e) of the move's eased progress e, and in
   the last part of the move (MOVE.SETTLE) it settles into its strokes
   in place, a short local step the tests measure. The fog gives the
   ink a ring lacks (spread over the disc, coming in over the first
   part of the move) and takes the ink it does not need, which stays
   in the fog as dissolved ink. The move lasts TIME.bloom.

   When a ring thins, the ink its thinner strokes no longer hold, and
   at the end the ink of the whole ring, dissolves into the fog: a
   layer of its own (O) that the stirred flow carries and that thins
   out of the disc at MOVE.DISSOLVE. The next ring gathers from what is
   left of it.

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
  FLOW_HOLD: 0.006, // the flow's top speed while a ring hangs, in field sides per second
  FLOW_STIR: 0.02,  // while a ring thins, or its ink leaves the disc
  EDDIES: 4,        // eddies of the flow across the field's side
  DRIFT: 0.09,      // how fast the flow's pattern changes, lattice steps per second
  ABSORB: 0.75,     // optical depth of a fully inked cell: transmittance 0.47 (a calibration, below)
  T_MIN: 0.45,      // the least transmittance drawn (a calibration, below)
  SETTLED: 0.03,    // the largest |target - ink| at which the ink counts as settled
});

/* The ink's move from one ring to the next (see the header). */
export const MOVE = Object.freeze({
  DURATION: 2.2,    // s: TIME.bloom in scene.js (frame)
  COARSE: 72,       // the plan's grid, cells a side (frame: the plan's cost, 80 to 130 ms at N 300 in Node)
  ITER: 200,        // directions the sliced plan takes (chosen)
  REG: 0.8,         // the plan's displacement smoothed every REG_EVERY directions, sd in coarse cells (chosen)
  REG_EVERY: 10,
  SMOOTH: 0.8,      // the displacement the ink follows, smoothed once more, sd in coarse cells (chosen)
  POOL_R: 0.9,      // the fog that gives and takes ink: the disc inside this share of its radius (frame: the
                    // figures reach 0.902 of it at most, 0.864 at p95, over the 129 rings of the three gate species)
  INFLOW: 0.2,      // the fog's ink comes in over this first share of the move (chosen)
  SWIRL: 0.03,      // the swirl's displacement at mid-move, field sides (chosen)
  SPREAD: 2.5,      // the ink's spread at mid-move, cells at N 300 (chosen)
  SPREAD_MIN: 1.5,  // the least spread while it moves, so ink stretched thin stays whole (chosen)
  SETTLE: 0.82,     // the share of the move after which the ink settles into its strokes (chosen)
  DISSOLVE: 0.15,   // 1/s: dissolved ink thins out of the disc, half of it in 4.6 s (chosen)
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

/* ---------------- seeded smooth noise ---------------- */
function hash3(seed, x, y, z) {
  let h = (seed ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);
/** Value noise in [-1, 1] at (x, y, z), on an integer lattice. */
export function noise3(seed, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    v += w * hash3(seed, xi + dx, yi + dy, zi + dz);
  }
  return 2 * v - 1;
}

/**
 * A tileable grey fog texture, n x n, values 0..255: fractal value noise whose lattice wraps at the edges, so
 * a pattern of it repeats without a seam. Seeded, so one being's fog is always the same fog.
 */
export function fogNoise(seed, n = 256, cells = 4, octaves = 5) {
  const out = new Uint8ClampedArray(n * n);
  const val = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
    const w = (a) => ((a % period) + period) % period;
    const h = (a, b) => hash3(seed + period, w(a), w(b), 0);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0, amp = 1, norm = 0, p = cells;
    for (let o = 0; o < octaves; o++) { v += amp * val((i / n) * p, (j / n) * p, p); norm += amp; amp *= 0.55; p *= 2; }
    out[j * n + i] = Math.round(255 * Math.min(1, Math.max(0, (v / norm - 0.5) * 1.9 + 0.5)));
  }
  return out;
}

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

/* ---------------- the move: a plan of least work ---------------- */
const GOLD = Math.PI * (3 - Math.sqrt(5));           // the golden angle: directions that cover the circle evenly
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/* A Gaussian blur of standard deviation sd cells on an M x M grid (separable, truncated at 3 sd), in place. */
function gauss(F, M, sd) {
  const r = Math.ceil(3 * sd), w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * sd * sd)));
  const t = new Float64Array(M * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < M) s += w[k + r] * F[y * M + xx]; }
    t[y * M + x] = s;
  }
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < M) s += w[k + r] * t[yy * M + x]; }
    F[y * M + x] = s;
  }
}
/* A displacement made smooth over the coarse grid, weighted by the ink each cell carries. */
function smoothDisp(disp, P, a, M, sd) {
  const mx = new Float64Array(M * M), my = new Float64Array(M * M), mm = new Float64Array(M * M);
  for (const c of P) { mx[c] = a[c] * disp[2 * c]; my[c] = a[c] * disp[2 * c + 1]; mm[c] = a[c]; }
  gauss(mx, M, sd); gauss(my, M, sd); gauss(mm, M, sd);
  for (let c = 0; c < M * M; c++) if (mm[c] > 1e-12) { disp[2 * c] = mx[c] / mm[c]; disp[2 * c + 1] = my[c] / mm[c]; }
}

/* The order of n projections by a two-pass radix sort of 16-bit keys over [lo, hi]: linear in n, no comparisons, and
   stable (ties keep the index order). A comparator sort, and then a native sort of keys carrying their index, cost a
   plan 470 ms on 2026-11-21, measured by a profile; this costs it a few. Resolution (hi - lo) / 65535 of a cell. */
function orderOf(proj, n, out, lo, hi, buf) {
  const { key, tmp, count } = buf, k = 65535 / (hi - lo);
  for (let i = 0; i < n; i++) { const v = Math.round((proj[i] - lo) * k); key[i] = v < 0 ? 0 : v > 65535 ? 65535 : v; }
  count.fill(0);
  for (let i = 0; i < n; i++) count[key[i] & 255]++;
  for (let c = 0, acc = 0; c < 256; c++) { const t = count[c]; count[c] = acc; acc += t; }
  for (let i = 0; i < n; i++) tmp[count[key[i] & 255]++] = i;
  count.fill(0);
  for (let i = 0; i < n; i++) count[key[i] >> 8]++;
  for (let c = 0, acc = 0; c < 256; c++) { const t = count[c]; count[c] = acc; acc += t; }
  for (let j = 0; j < n; j++) { const i = tmp[j]; out[count[key[i] >> 8]++] = i; }
}

/* One direction of weighted transport on a line: each source's share of the sorted mass is matched to the same share
   of the target's, and the source moves to the mean of what it was matched to. */
function matchLine(ps, ws, os, pt, wt, ot, out) {
  const nT = ot.length;
  let j = 0, tEnd = wt[ot[0]], a = 0;
  for (let k = 0; k < os.length; k++) {
    const i = os[k], w = ws[i];
    let rem = w, s = 0, pos = a;
    while (rem > 1e-14) {
      const take = Math.min(rem, Math.max(0, tEnd - pos));
      s += take * pt[ot[j]];
      rem -= take; pos += take;
      if (rem > 1e-14) { if (j < nT - 1) { j++; tEnd += wt[ot[j]]; } else { s += rem * pt[ot[j]]; rem = 0; } }
    }
    out[i] = w > 0 ? s / w : ps[i];
    a += w;
  }
}

/**
 * The plan that moves ink S to target T (both N x N over the disc's square, the disc inscribed): the displacement of
 * each coarse cell's ink, in field cells. The fog's part of the disc (POOL_R) gives the ink T lacks and takes the ink
 * it does not need, spread evenly. Deterministic: the directions are the golden angle's.
 */
export function movePlan(S, T, N) {
  const M = MOVE.COARSE, half = M / 2;
  const cOf = (x, y) => Math.floor((y * M) / N) * M + Math.floor((x * M) / N);
  const a = new Float64Array(M * M), b = new Float64Array(M * M);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = cOf(x, y), i = y * N + x; a[c] += S[i]; b[c] += T[i]; }
  let mS = 0, mT = 0;
  for (let c = 0; c < M * M; c++) { mS += a[c]; mT += b[c]; }
  const pool = [];
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (Math.hypot(i + 0.5 - half, j + 0.5 - half) / half <= MOVE.POOL_R) pool.push(j * M + i);
  const inPool = new Uint8Array(M * M);
  for (const c of pool) inPool[c] = 1;
  const add = Math.abs(mT - mS) / pool.length;
  if (mT > mS) for (const c of pool) a[c] += add; else for (const c of pool) b[c] += add;
  const tot = Math.max(mS, mT, 1e-12), k = N / M;
  const P = [], Q = [];
  for (let c = 0; c < M * M; c++) { if (a[c] > 1e-9) P.push(c); if (b[c] > 1e-9) Q.push(c); }
  const disp = new Float32Array(2 * M * M);
  const poolFine = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inPool[cOf(x, y)]) poolFine.push(y * N + x);
  const plan = { M, disp, inflow: Math.max(0, mT - mS), outflow: Math.max(0, mS - mT), poolFine };
  if (!P.length || !Q.length) return plan;
  const X = new Float64Array(P.length), Y = new Float64Array(P.length), wa = new Float64Array(P.length);
  P.forEach((c, n) => { X[n] = ((c % M) + 0.5) * k; Y[n] = (Math.floor(c / M) + 0.5) * k; wa[n] = a[c] / tot; });
  const qx = new Float64Array(Q.length), qy = new Float64Array(Q.length), wb = new Float64Array(Q.length);
  Q.forEach((c, n) => { qx[n] = ((c % M) + 0.5) * k; qy[n] = (Math.floor(c / M) + 0.5) * k; wb[n] = b[c] / tot; });
  const X0 = X.slice(), Y0 = Y.slice();
  const ps = new Float64Array(P.length), pt = new Float64Array(Q.length), out = new Float64Array(P.length);
  const os = new Int32Array(P.length), ot = new Int32Array(Q.length), most = Math.max(P.length, Q.length);
  const buf = { key: new Uint16Array(most), tmp: new Int32Array(most), count: new Int32Array(256) }, lo = -1.5 * N, hi = 1.5 * N;
  for (let it = 0; it < MOVE.ITER; it++) {
    const th = it * GOLD, cs = Math.cos(th), sn = Math.sin(th);
    for (let i = 0; i < P.length; i++) ps[i] = X[i] * cs + Y[i] * sn;
    for (let j = 0; j < Q.length; j++) pt[j] = qx[j] * cs + qy[j] * sn;
    orderOf(ps, P.length, os, lo, hi, buf); orderOf(pt, Q.length, ot, lo, hi, buf);
    matchLine(ps, wa, os, pt, wb, ot, out);
    for (let i = 0; i < P.length; i++) { const d = out[i] - ps[i]; X[i] += d * cs; Y[i] += d * sn; }
    if ((it + 1) % MOVE.REG_EVERY === 0 && it + 1 < MOVE.ITER) {
      P.forEach((c, n) => { disp[2 * c] = X[n] - X0[n]; disp[2 * c + 1] = Y[n] - Y0[n]; });
      smoothDisp(disp, P, a, M, MOVE.REG);
      P.forEach((c, n) => { X[n] = X0[n] + disp[2 * c]; Y[n] = Y0[n] + disp[2 * c + 1]; });
    }
  }
  P.forEach((c, n) => { disp[2 * c] = X[n] - X0[n]; disp[2 * c + 1] = Y[n] - Y0[n]; });
  smoothDisp(disp, P, a, M, MOVE.SMOOTH);
  return plan;
}

/* What moves: every inked cell of the ring's ink D, one carrier each; and the fog's ink, the dissolved ink O and the
   inflow the ring lacks, one carrier per block of BLOCK x BLOCK cells (it is faint and spread, and the move's spread
   is wider than a block), its inflow part coming in over the first part of the move. Each takes its displacement
   from the plan's grid between cell centres. */
function moveCarriers(D, O, N, pl) {
  const { M, disp } = pl, k = M / N, B = Math.max(1, Math.round(N / 150));
  const dAt = (x, y, e) => {
    const gx = Math.min(M - 1.001, Math.max(0, x * k - 0.5)), gy = Math.min(M - 1.001, Math.max(0, y * k - 0.5));
    const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0, c = j0 * M + i0;
    return disp[2 * c + e] * (1 - fx) * (1 - fy) + disp[2 * (c + 1) + e] * fx * (1 - fy) + disp[2 * (c + M) + e] * (1 - fx) * fy + disp[2 * (c + M + 1) + e] * fx * fy;
  };
  const inPoolFine = new Uint8Array(N * N);
  for (const i of pl.poolFine) inPoolFine[i] = 1;
  const inEach = pl.inflow > 0 ? pl.inflow / pl.poolFine.length : 0;
  const xs = [], ys = [], ms = [], ins = [];
  for (let i = 0; i < D.length; i++) if (D[i] > 1e-6) { const x = i % N; xs.push(x + 0.5); ys.push((i - x) / N + 0.5); ms.push(D[i]); ins.push(0); }
  const fog0 = xs.length;
  for (let by = 0; by < N; by += B) for (let bx = 0; bx < N; bx += B) {
    let m = 0, mi = 0, w = 0, cx = 0, cy = 0;
    for (let y = by; y < Math.min(N, by + B); y++) for (let x = bx; x < Math.min(N, bx + B); x++) {
      const i = y * N + x, a = O[i] + (inPoolFine[i] ? inEach : 0);
      m += O[i]; if (inPoolFine[i]) mi += inEach;
      cx += (x + 0.5) * a; cy += (y + 0.5) * a; w += a;
    }
    if (w > 1e-7) { xs.push(cx / w); ys.push(cy / w); ms.push(m); ins.push(mi); }
  }
  const n = xs.length, car = { n, fog0, x: Float32Array.from(xs), y: Float32Array.from(ys), m: Float32Array.from(ms), mIn: Float32Array.from(ins), dx: new Float32Array(n), dy: new Float32Array(n) };
  for (let q = 0; q < n; q++) { car.dx[q] = dAt(car.x[q], car.y[q], 0); car.dy[q] = dAt(car.x[q], car.y[q], 1); }
  return car;
}

/* A divergence-free swirl on a lattice: the curl of a seeded noise, its fastest node 1. */
function swirlField(seed, G = 10) {
  const psi = new Float64Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) psi[j * G + i] = noise3(seed, i * 0.68, j * 0.68, 3.1);
  const u = new Float64Array(G * G), v = new Float64Array(G * G);
  let top = 1e-9;
  const at = (i, j) => psi[Math.min(G - 1, Math.max(0, j)) * G + Math.min(G - 1, Math.max(0, i))];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const p = (at(i, j + 1) - at(i, j - 1)) / 2, q = (at(i + 1, j) - at(i - 1, j)) / 2;
    u[j * G + i] = p; v[j * G + i] = -q; top = Math.max(top, Math.hypot(p, q));
  }
  for (let i = 0; i < G * G; i++) { u[i] /= top; v[i] /= top; }
  return { G, u, v };
}

/* The ink at progress s of the move, laid into D: each carrier along its displacement (eased), the swirl, and the fog's
   ink coming in over the first part; then the spread. */
function moveSplat(D, N, car, s, sw) {
  D.fill(0);
  const e = 0.5 - 0.5 * Math.cos(Math.PI * s), sin = Math.sin(Math.PI * e);
  const amp = MOVE.SWIRL * N * sin, G = sw.G, gs = (G - 1) / N, fogIn = smooth01(s / MOVE.INFLOW);
  for (let q = 0; q < car.n; q++) {
    let px = car.x[q] + e * car.dx[q], py = car.y[q] + e * car.dy[q];
    if (amp > 0) {
      const gx = Math.min(G - 1.001, Math.max(0, px * gs)), gy = Math.min(G - 1.001, Math.max(0, py * gs));
      const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0, c = j0 * G + i0;
      px += amp * (sw.u[c] * (1 - fx) * (1 - fy) + sw.u[c + 1] * fx * (1 - fy) + sw.u[c + G] * (1 - fx) * fy + sw.u[c + G + 1] * fx * fy);
      py += amp * (sw.v[c] * (1 - fx) * (1 - fy) + sw.v[c + 1] * fx * (1 - fy) + sw.v[c + G] * (1 - fx) * fy + sw.v[c + G + 1] * fx * fy);
    }
    const gx = px - 0.5, gy = py - 0.5, xi = Math.floor(gx), yi = Math.floor(gy), tx = gx - xi, ty = gy - yi;
    if (xi < 0 || yi < 0 || xi + 1 >= N || yi + 1 >= N) continue;
    const m = car.m[q] + car.mIn[q] * fogIn, p = yi * N + xi;
    D[p] += m * (1 - tx) * (1 - ty); D[p + 1] += m * tx * (1 - ty); D[p + N] += m * (1 - tx) * ty; D[p + N + 1] += m * tx * ty;
  }
  const ramp = Math.min(1, e / 0.12, (1 - e) / 0.12);
  const r = Math.round((N / 300) * (MOVE.SPREAD_MIN * Math.max(0, ramp) + MOVE.SPREAD * sin));
  if (r >= 1) boxBlur(D, N, r);
}

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
   * A new target (values 0..1). For a new ring (`fresh`), the ink in the disc moves to it (startMove). Otherwise the
   * same ring at another moment of its thinning: the ink its thinner strokes no longer hold dissolves into the fog.
   */
  setTarget(T, fresh = false) {
    this.T.set(T);
    if (fresh) this.startMove();
    else if (!this.move) this.dissolve((i) => Math.max(0, this.D[i] - T[i]));
    this.residual = this.gap();
  }
  /** The ring is gone: its ink dissolves into the fog. */
  clear() {
    this.move = null;
    this.T.fill(0);
    this.dissolve((i) => this.D[i]);
    this.residual = this.gap();
  }
  /* Move `amount(i)` of each cell's ink from the ring's layer to the fog's. */
  dissolve(amount) {
    const D = this.D, O = this.O;
    let live = this.oldLive;
    for (let i = 0; i < D.length; i++) { const a = amount(i); if (a > 0) { D[i] -= a; O[i] += a; if (O[i] > 0.002) live = true; } }
    this.oldLive = live;
  }
  /** The ink where it belongs at once (reduced motion). */
  snap() { this.move = null; this.D.set(this.T); this.O.fill(0); this.oldLive = false; this.residual = 0; }

  /** A new ring: plan the move of all the ink in the disc (the ring's and the fog's) to the target. */
  startMove() {
    const N = this.N, S = new Float32Array(N * N), D = this.D, O = this.O;
    for (let i = 0; i < S.length; i++) S[i] = D[i] + O[i];
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t0 = now(), pl = movePlan(S, this.T, N), car = moveCarriers(D, O, N, pl);
    // where the move ends: the ring, and the ink it does not need, dissolved through the fog's part of the disc
    O.fill(0); this.oldLive = false;
    const rest = new Float32Array(N * N);
    if (pl.outflow > 0) { const k = pl.outflow / pl.poolFine.length; for (const i of pl.poolFine) rest[i] = k; }
    this.moves = (this.moves || 0) + 1;
    this.move = { car, rest, s: 0, sw: swirlField(this.seed + this.moves), inflow: pl.inflow, outflow: pl.outflow, planMs: now() - t0 };
    this.lastMove = this.move;
  }
  get moving() { return !!this.move; }

  /** The ink of another field (another grid over the same disc: a change of size or of tier), laid on this one's grid by
      bilinear reading at each cell's centre, so a change of grid leaves the ink where it was. */
  takeFrom(old) {
    const N = this.N, M = old.N, k = M / N;
    let live = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = Math.min(M - 1.001, Math.max(0, (x + 0.5) * k - 0.5)), gy = Math.min(M - 1.001, Math.max(0, (y + 0.5) * k - 0.5));
      const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0, c = j0 * M + i0;
      const bl = (F) => F[c] * (1 - fx) * (1 - fy) + F[c + 1] * fx * (1 - fy) + F[c + M] * (1 - fx) * fy + F[c + M + 1] * fx * fy;
      const i = y * N + x;
      this.D[i] = bl(old.D); this.O[i] = bl(old.O);
      if (this.O[i] > 0.002) live = true;
    }
    this.oldLive = live;
    this.time = old.time;
  }
  gap() { let m = 0; for (let i = 0; i < this.D.length; i++) { const d = Math.abs(this.T[i] - this.D[i]); if (d > m) m = d; } return m; }
  mass() { return sum(this.D); }
  /** All the ink in the disc: the ring's and the fog's. */
  inkTotal() { return sum(this.D) + sum(this.O); }
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
    if (this.move) return this.stepMove(dt);
    this.advect(dt, flowShare);
    return this.relax(dt);
  }

  /* One step of a move: the ink at its new progress, settling in its last part; at the end the ring is the target and
     the ink it does not need is the fog's. */
  stepMove(dt) {
    const mv = this.move, D = this.D, T = this.T;
    this.time += dt;
    mv.s = Math.min(1, mv.s + dt / MOVE.DURATION);
    moveSplat(D, this.N, mv.car, mv.s, mv.sw);
    const w = smooth01((mv.s - MOVE.SETTLE) / (1 - MOVE.SETTLE));
    if (w > 0) for (let i = 0; i < D.length; i++) D[i] += (T[i] + mv.rest[i] - D[i]) * w;
    if (mv.s >= 1) {
      D.set(T);
      let live = false;
      for (let i = 0; i < D.length; i++) { this.O[i] = mv.rest[i]; if (mv.rest[i] > 0.002) live = true; }
      this.oldLive = live;
      this.move = null;
    }
    this.residual = this.move ? Math.max(MEDIUM.SETTLED + 1e-6, this.gap()) : this.gap();
    return this.residual;
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

  /** Pull every cell toward the target at one rate for dt seconds, and thin the fog's ink out of the disc; returns the
      residual. */
  relax(dt) {
    const D = this.D, T = this.T, O = this.O;
    const k = 1 - Math.exp(-MEDIUM.GATHER * dt);
    if (this.oldLive) {
      const q = 1 - Math.exp(-MOVE.DISSOLVE * dt);
      let live = false;
      for (let i = 0; i < O.length; i++) { O[i] -= O[i] * q; if (O[i] > 0.002) live = true; }
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
