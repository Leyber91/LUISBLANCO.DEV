/* ============================================================
   heptapod/detail/ring.js — the film-detail suite, part 1 (film track
   F2, experiment E7a): a binary ink mask, the ring fitted to it, and the
   carrier stroke read along that ring.

   The method is research/film.md section 4, ported from
   film-tools/measure.py so that one function holds each rule for the
   film's masters and for the lab's own renders:
     1. fit the ring by the Kasa method on thin ink (blots removed by an
        opening on a 4x subsample), rejecting outliers over 8 rounds;
     2. unwrap to 1440 angles x 1200 radii from 0.3 R to 1.8 R;
     3. at each angle the ink run nearest R, within 0.12 R, is the
        carrier stroke.
   Every length comes back in units of the fitted radius R. Part 1
   reproduces film.md 5.1; the detail measures of PLAN E7a (masses,
   filaments, striations, edge anisotropy, roughness at width-tied
   scales, wobble, the code-period spectrum, breath taper, symmetry,
   the start mark) are built on it in the parts that follow.

   A mask is { W, H, d } with d a Uint8Array of W * H, 1 = ink.
   ============================================================ */

/* ---------------- masks ---------------- */

/* A PBM file (P4, binary) as a mask. Rows are padded to whole bytes, most significant bit first. */
export function readPBM(buf) {
  let i = 0;
  const token = () => {
    for (;;) {
      while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++;
      if (buf[i] === 0x23) { while (i < buf.length && buf[i] !== 0x0a) i++; continue; }
      break;
    }
    const s = i;
    while (i < buf.length && !/\s/.test(String.fromCharCode(buf[i]))) i++;
    return String.fromCharCode(...buf.subarray(s, i));
  };
  if (token() !== 'P4') throw new Error('not a binary PBM (P4)');
  const W = +token(), H = +token();
  if (!(W > 0 && H > 0)) throw new Error('PBM: bad size');
  i++; // the single whitespace byte before the raster
  const rb = Math.ceil(W / 8);
  if (buf.length - i < rb * H) throw new Error('PBM: raster cut short');
  const d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = i + y * rb;
    for (let x = 0; x < W; x++) d[y * W + x] = (buf[row + (x >> 3)] >> (7 - (x & 7))) & 1;
  }
  return { W, H, d };
}

/* every f-th pixel of every f-th row, from (0, 0) */
export function subsample(m, f) {
  const W = Math.ceil(m.W / f), H = Math.ceil(m.H / f), d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = m.d[y * f * m.W + x * f];
  return { W, H, d };
}

/* binary erosion and dilation with a 3 x 3 square (cross = false) or a 4-neighbour cross; outside the mask is
   background, as in scipy's defaults */
export function erode(m, cross = false) {
  const { W, H, d } = m, o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!d[y * W + x]) continue;
    let all = 1;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (cross && dx && dy) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H || !d[Y * W + X]) { all = 0; break; }
    }
    o[y * W + x] = all;
  }
  return { W, H, d: o };
}
export function dilate(m) {
  const { W, H, d } = m, o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let any = 0;
    for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H && d[Y * W + X]) { any = 1; break; }
    }
    o[y * W + x] = any;
  }
  return { W, H, d: o };
}
export function opening(m, iterations) {
  let a = m;
  for (let k = 0; k < iterations; k++) a = erode(a);
  for (let k = 0; k < iterations; k++) a = dilate(a);
  return a;
}

/* ---------------- the ring ---------------- */

/* least-squares circle through points (Kasa 1976), in centred coordinates for conditioning */
export function kasa(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let k = 0; k < n; k++) { mx += xs[k]; my += ys[k]; }
  mx /= n; my /= n;
  // normal equations of [2u 2v 1] c = u^2 + v^2
  let Suu = 0, Suv = 0, Svv = 0, Su = 0, Sv = 0, Sb = 0, Sub = 0, Svb = 0;
  for (let k = 0; k < n; k++) {
    const u = xs[k] - mx, v = ys[k] - my, b = u * u + v * v;
    Suu += u * u; Suv += u * v; Svv += v * v; Su += u; Sv += v; Sb += b; Sub += u * b; Svb += v * b;
  }
  const M = [[4 * Suu, 4 * Suv, 2 * Su], [4 * Suv, 4 * Svv, 2 * Sv], [2 * Su, 2 * Sv, n]];
  const r = [2 * Sub, 2 * Svb, Sb];
  const c = solve3(M, r);
  return { cx: c[0] + mx, cy: c[1] + my, R: Math.sqrt(c[2] + c[0] * c[0] + c[1] * c[1]) };
}
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let p = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[p][col])) p = r;
    [M[col], M[p]] = [M[p], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/* the ring of a mask: Kasa on thin ink of a 4x subsample, outliers rejected over 8 rounds */
export function fitRing(m) {
  const s = subsample(m, 4);
  const op = opening(s, 6);
  const xs = [], ys = [];
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) if (s.d[y * s.W + x] && !op.d[y * s.W + x]) { xs.push(x); ys.push(y); }
  if (xs.length < 3) return null;
  let c = kasa(xs, ys);
  for (let it = 0; it < 8; it++) {
    const tol = (it < 3 ? 0.08 : 0.04) * c.R, kx = [], ky = [];
    for (let k = 0; k < xs.length; k++) if (Math.abs(Math.hypot(xs[k] - c.cx, ys[k] - c.cy) - c.R) < tol) { kx.push(xs[k]); ky.push(ys[k]); }
    if (kx.length < 3) break;
    c = kasa(kx, ky);
  }
  return { cx: c.cx * 4 + 1.5, cy: c.cy * 4 + 1.5, R: c.R * 4 };
}

/* ---------------- the unwrap and the carrier ---------------- */

export const NA = 1440, NR = 1200, R0 = 0.3, R1 = 1.8;
/* the carrier band: ink within this many R of the fitted ring, at an angle, is the carrier stroke there */
export const CARRIER_BAND = 0.12;

/* ink sampled bilinearly at NA angles x NR radii (outside the mask is background), thresholded at 0.5 */
export function unwrap(m, ring) {
  const { W, H, d } = m, { cx, cy, R } = ring;
  const P = new Uint8Array(NA * NR);
  const rr = new Float64Array(NR);
  for (let j = 0; j < NR; j++) rr[j] = R0 * R + ((R1 - R0) * R * j) / (NR - 1);
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? d[y * W + x] : 0);
  for (let a = 0; a < NA; a++) {
    const th = (2 * Math.PI * a) / NA, c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < NR; j++) {
      const X = cx + rr[j] * c, Y = cy + rr[j] * s;
      const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
      const v = (1 - fx) * (1 - fy) * at(x0, y0) + fx * (1 - fy) * at(x0 + 1, y0) + (1 - fx) * fy * at(x0, y0 + 1) + fx * fy * at(x0 + 1, y0 + 1);
      P[a * NR + j] = v > 0.5 ? 1 : 0;
    }
  }
  return { P, rr, dr: rr[1] - rr[0] };
}

/* inclusive runs of 1 in v[from .. from + n) */
export function runs(v, from = 0, n = v.length) {
  const out = [];
  let s = -1;
  for (let k = 0; k < n; k++) {
    const on = v[from + k];
    if (on && s < 0) s = k;
    if (!on && s >= 0) { out.push([s, k - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, n - 1]);
  return out;
}
/* runs on a circle of n: a run touching both ends is one run (start may be negative) */
export function circularRuns(flags) {
  const r = runs(flags);
  const n = flags.length;
  if (r.length > 1 && r[0][0] === 0 && r[r.length - 1][1] === n - 1) { r[0] = [r[r.length - 1][0] - n, r[0][1]]; r.pop(); }
  return r;
}

/* per angle: carrier width, inner and outer edge of the carrier, outermost and innermost ink */
export function carrier(U, R) {
  const { P, rr, dr } = U;
  let iR = 0;
  for (let j = 1; j < NR; j++) if (Math.abs(rr[j] - R) < Math.abs(rr[iR] - R)) iR = j;
  const w = new Float64Array(NA).fill(NaN), ri = new Float64Array(NA).fill(NaN), ro = new Float64Array(NA).fill(NaN);
  const outerMax = new Float64Array(NA), innerMin = new Float64Array(NA).fill(NaN);
  for (let a = 0; a < NA; a++) {
    const rs = runs(P, a * NR, NR);
    if (!rs.length) continue;
    let best = null, bd = Infinity;
    for (const [s, e] of rs) {
      const dd = s <= iR && iR <= e ? 0 : Math.min(Math.abs(s - iR), Math.abs(e - iR));
      if (dd < bd) { bd = dd; best = [s, e]; }
    }
    if (bd * dr <= CARRIER_BAND * R) { w[a] = (best[1] - best[0] + 1) * dr; ri[a] = rr[best[0]]; ro[a] = rr[best[1]]; }
    outerMax[a] = rr[rs[rs.length - 1][1]];
    innerMin[a] = rr[rs[0][0]];
  }
  return { w, ri, ro, outerMax, innerMin };
}

/* ---------------- statistics ---------------- */

/* numpy's default percentile: linear between closest ranks */
export function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * (q / 100), lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
const sortNum = (a) => Float64Array.from(a).sort();
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); };

/* connected components of ink, 8-connected, as areas (largest first) and centres of mass */
export function components(m) {
  const { W, H, d } = m, n = W * H;
  const parent = new Int32Array(n).fill(-1);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    parent[i] = i;
    if (x > 0 && d[i - 1]) unite(i, i - 1);
    if (y > 0) {
      if (d[i - W]) unite(i, i - W);
      if (x > 0 && d[i - W - 1]) unite(i, i - W - 1);
      if (x < W - 1 && d[i - W + 1]) unite(i, i - W + 1);
    }
  }
  const acc = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    const r = find(i);
    let c = acc.get(r);
    if (!c) { c = { area: 0, sx: 0, sy: 0 }; acc.set(r, c); }
    c.area++; c.sx += x; c.sy += y;
  }
  return [...acc.values()].map((c) => ({ area: c.area, x: c.sx / c.area, y: c.sy / c.area })).sort((a, b) => b.area - a.area);
}

/* box-counting dimension of the ink boundary (ink with a 4-neighbour background or the edge), boxes 2 to 256 px */
export function boxDimension(m) {
  const er = erode(m, true);
  const { W, H, d } = m;
  const N = Math.min(W, H);
  const sizes = [2, 4, 8, 16, 32, 64, 128, 256], counts = [];
  let perim = 0;
  for (let i = 0; i < W * H; i++) if (d[i] && !er.d[i]) perim++;
  for (const s of sizes) {
    const nb = Math.floor(N / s);
    let c = 0;
    for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) {
      let hit = 0;
      for (let y = by * s; y < by * s + s && !hit; y++) for (let x = bx * s; x < bx * s + s; x++) {
        const i = y * W + x;
        if (d[i] && !er.d[i]) { hit = 1; break; }
      }
      c += hit;
    }
    counts.push(c);
  }
  // slope of log(count) on log(size), least squares
  const X = sizes.map(Math.log), Y = counts.map((c) => Math.log(c));
  const mx = mean(X), my = mean(Y);
  let sxy = 0, sxx = 0;
  for (let k = 0; k < X.length; k++) { sxy += (X[k] - mx) * (Y[k] - my); sxx += (X[k] - mx) ** 2; }
  return { D: -sxy / sxx, perim };
}

/* Blots merged into clusters: sorted by centre, a blot whose start lies within 10 degrees of the open cluster's
   end joins it, and the last cluster joins the first across 360 under the same rule (film-tools/table.py, the
   "blot clusters" column of film.md 5.1). Returns each cluster's [start, end] in degrees. */
export function blotClusters(blots) {
  const b = [...blots].sort((p, q) => p.at - q.at), cl = [];
  for (const { at, span } of b) {
    const lo = at - span / 2, hi = at + span / 2;
    if (cl.length && lo - cl[cl.length - 1][1] < 10) cl[cl.length - 1][1] = Math.max(cl[cl.length - 1][1], hi);
    else cl.push([lo, hi]);
  }
  if (cl.length > 1 && cl[0][0] + 360 - cl[cl.length - 1][1] < 10) { cl[0][0] = cl[cl.length - 1][0] - 360; cl.pop(); }
  return cl;
}

/* ---------------- the film.md 5.1 columns ---------------- */

export function ringTable(m) {
  const ring = fitRing(m);
  if (!ring) return null;
  const { R, cx, cy } = ring;
  const U = unwrap(m, ring);
  const C = carrier(U, R);
  const present = Uint8Array.from(C.w, (x) => (Number.isNaN(x) ? 0 : 1));
  const gaps = circularRuns(present.map((p) => 1 - p)).map(([s, e]) => ((e - s + 1) * 360) / NA).sort((a, b) => b - a).filter((g) => g >= 1);
  const wv = [...C.w].filter((x) => !Number.isNaN(x));
  const ws = sortNum(wv);
  const medw = percentile(ws, 50);
  const thick = Uint8Array.from(C.w, (x) => (!Number.isNaN(x) && x > 2.5 * medw ? 1 : 0));
  const blots = circularRuns(thick).filter(([s, e]) => ((e - s + 1) * 360) / NA >= 2).map(([s, e]) => {
    let mx = 0;
    for (let k = s; k <= e; k++) mx = Math.max(mx, C.w[((k % NA) + NA) % NA]);
    return { at: ((((s + e) / 2) % NA + NA) % NA) * 360 / NA, span: ((e - s + 1) * 360) / NA, wmax: mx / R };
  });
  const crossings = (f) => {
    let j = 0;
    for (let k = 1; k < NR; k++) if (Math.abs(U.rr[k] - f * R) < Math.abs(U.rr[j] - f * R)) j = k;
    let c = 0;
    for (let a = 0; a < NA; a++) { const v = U.P[a * NR + j], u = U.P[((a + NA - 1) % NA) * NR + j]; if (v && !u) c++; }
    return c;
  };
  const probes = {};
  for (const f of [0.6, 0.7, 0.8, 0.9, 1.1, 1.2, 1.35, 1.5, 1.65]) probes[f] = crossings(f);
  const outReach = [], inReach = [], cl = [];
  for (let a = 0; a < NA; a++) {
    if (!present[a]) continue;
    outReach.push((C.outerMax[a] - C.ro[a]) / R);
    inReach.push((C.ri[a] - C.innerMin[a]) / R);
    if (C.w[a] <= 1.5 * medw) cl.push((C.ri[a] + C.ro[a]) / 2);
  }
  let inkSum = 0;
  for (let i = 0; i < m.d.length; i++) inkSum += m.d[i];
  const comps = components(m);
  const unit = (R / 100) ** 2;
  const det = comps.slice(1);
  const box = boxDimension(m);
  return {
    R_over_canvas: R / m.W, cx: cx / m.W, cy: cy / m.H, R_px: R,
    ink_over_disc: inkSum / (Math.PI * R * R),
    ring_closure: mean([...present]),
    gaps_deg: gaps,
    w_p10_R: percentile(ws, 10) / R, w_p25_R: percentile(ws, 25) / R, w_med_R: medw / R, w_p90_R: percentile(ws, 90) / R,
    w_max_R: ws[ws.length - 1] / R, w_cv: std(wv) / mean(wv),
    blots, n_blots: blots.length,
    blot_clusters: blotClusters(blots).map(([lo, hi]) => Math.round(hi - lo)),
    centerline_dev_R: std(cl) / R,
    probes,
    out_reach_max_R: Math.max(...outReach), in_reach_max_R: Math.max(...inReach),
    out_reach_p95_R: percentile(sortNum(outReach), 95), in_reach_p95_R: percentile(sortNum(inReach), 95),
    n_components: comps.length, main_area_share: comps.length ? comps[0].area / inkSum : 0,
    droplets_ge1u: det.filter((c) => c.area >= unit).length,
    droplets_ge10u: det.filter((c) => c.area >= 10 * unit).length,
    perim_over_circ: box.perim / (2 * Math.PI * R), boxdim: box.D,
    // kept for the overlays and the later parts of the suite
    _ring: ring, _w: C.w, _ri: C.ri, _ro: C.ro,
  };
}
