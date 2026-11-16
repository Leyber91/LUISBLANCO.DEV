/* ============================================================
   heptapod/detail/filaments.js — the film-detail suite, part 2a (film
   track F2, E7a): filaments as branches of the ink's skeleton.

   PLAN E7a measures filaments "as skeleton branches (length, shaft
   width, tip ratio, turning angle, branching, tip type)". Under H5
   (Luis, 2026-11-16: "a figure without artificial lines") the film's
   filament distribution is also the reference of BAR_F G9: a thin
   stretch of our ink passes only if it falls inside it.

     1. thickness: the exact Euclidean distance transform of the ink
        (Felzenszwalb and Huttenlocher 2012), so 2 * d is the diameter
        of the largest disc inside the ink at a pixel;
     2. skeleton: Zhang-Suen thinning (Zhang and Suen 1984), then one
        pass that removes simple points, so the skeleton is one pixel
        thin and 8-connected and a junction is a pixel with 3 or more
        skeleton neighbours;
     3. a filament is the part of a terminal branch (a free tip to the
        first junction) that is thin and long: walking from the tip,
        it ends where the width first exceeds MASS_W times the shaft
        width or at the junction, and it is kept when its length is at
        least MIN_ELONG shaft widths. A stub inside a blob is short for
        its width and is dropped.
   Lengths come back in pixels; the caller divides by R or w_med.
   ============================================================ */

import { CARRIER_BAND } from './ring.js';

export const MASS_W = 2.5;    // the width at which a filament has reached the body it grows from, in shaft widths
export const JUNCTION_W = 1.5;  // or a junction at least this many shaft widths wide
export const MIN_ELONG = 3;   // a kept filament is at least this many shaft widths long
export const TIP_SPAN = 2;     // the tip is the last TIP_SPAN shaft widths of the filament

/* squared Euclidean distance from each ink pixel to the nearest background pixel (outside the mask is background) */
export function edt2(m) {
  const { W, H, d } = m, INF = 1e20;
  const f = new Float64Array(Math.max(W, H) + 2), out = new Float64Array(W * H);
  const v = new Int32Array(Math.max(W, H) + 2), z = new Float64Array(Math.max(W, H) + 3), g = new Float64Array(Math.max(W, H) + 2);
  // the 1D squared distance transform of f[0 .. n+1] (Felzenszwalb and Huttenlocher, the lower envelope of
  // parabolas); f[0] and f[n+1] are background samples just outside the row, so every row has background
  const pass = (n) => {
    const N = n + 2;
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < N; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < N; q++) { while (z[k + 1] < q) k++; g[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < W; x++) {
    f[0] = 0; f[H + 1] = 0;
    for (let y = 0; y < H; y++) f[y + 1] = d[y * W + x] ? INF : 0;
    pass(H);
    for (let y = 0; y < H; y++) out[y * W + x] = g[y + 1];
  }
  for (let y = 0; y < H; y++) {
    f[0] = 0; f[W + 1] = 0;
    for (let x = 0; x < W; x++) f[x + 1] = out[y * W + x];
    pass(W);
    for (let x = 0; x < W; x++) out[y * W + x] = d[y * W + x] ? g[x + 1] : 0;
  }
  return out;
}

const DX = [0, 1, 1, 1, 0, -1, -1, -1], DY = [-1, -1, 0, 1, 1, 1, 0, -1]; // P2..P9: N, NE, E, SE, S, SW, W, NW

/* Zhang-Suen thinning, visiting only pixels next to a deletion, then simple points removed */
export function skeletonize(m) {
  const { W, H } = m;
  const P = Uint8Array.from(m.d);
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? P[y * W + x] : 0);
  const buf = new Uint8Array(8); // one buffer for every read: the neighbours of i are consumed before the next read
  const nb = (i) => { const x = i % W, y = (i / W) | 0; for (let k = 0; k < 8; k++) buf[k] = at(x + DX[k], y + DY[k]); return buf; };
  const mark = new Uint8Array(W * H);
  let cand = [];
  for (let i = 0; i < W * H; i++) if (P[i]) { const n = nb(i); if (n.includes(0)) { cand.push(i); mark[i] = 1; } }
  for (let guard = 0; guard < 100000; guard++) {
    let changed = false;
    for (const sub of [0, 1]) {
      const del = [];
      for (const i of cand) {
        if (!P[i]) continue;
        const n = nb(i);
        let B = 0, A = 0;
        for (let k = 0; k < 8; k++) { B += n[k]; if (!n[k] && n[(k + 1) % 8]) A++; }
        if (B < 2 || B > 6 || A !== 1) continue;
        if (sub === 0 ? (n[0] && n[2] && n[4]) || (n[2] && n[4] && n[6]) : (n[0] && n[2] && n[6]) || (n[0] && n[4] && n[6])) continue;
        del.push(i);
      }
      if (!del.length) continue;
      changed = true;
      for (const i of del) P[i] = 0;
      const next = [];
      for (const i of cand) mark[i] = 0;
      const add = (j) => { if (P[j] && !mark[j]) { mark[j] = 1; next.push(j); } };
      for (const i of cand) add(i);
      for (const i of del) { const x = i % W, y = (i / W) | 0; for (let k = 0; k < 8; k++) { const X = x + DX[k], Y = y + DY[k]; if (X >= 0 && Y >= 0 && X < W && Y < H) add(Y * W + X); } }
      cand = next;
    }
    if (!changed) break;
  }
  // remove simple points that are not tips (staircase pixels), in raster order
  for (let i = 0; i < W * H; i++) {
    if (!P[i]) continue;
    const n = nb(i);
    let B = 0;
    for (let k = 0; k < 8; k++) B += n[k];
    if (B < 2) continue;
    // 8-connected groups among the ink neighbours, around the ring of 8 (a corner joins its two sides)
    let groups = 0;
    const seen = new Uint8Array(8);
    for (let k = 0; k < 8; k++) {
      if (!n[k] || seen[k]) continue;
      groups++;
      const st = [k]; seen[k] = 1;
      while (st.length) {
        const a = st.pop();
        for (let b = 0; b < 8; b++) {
          if (!n[b] || seen[b]) continue;
          if (Math.abs(DX[a] - DX[b]) <= 1 && Math.abs(DY[a] - DY[b]) <= 1) { seen[b] = 1; st.push(b); }
        }
      }
    }
    if (groups === 1) P[i] = 0;
  }
  return { W, H, d: P };
}

const deg = (S, i) => {
  const { W, H, d } = S, x = i % W, y = (i / W) | 0;
  let c = 0;
  for (let k = 0; k < 8; k++) { const X = x + DX[k], Y = y + DY[k]; if (X >= 0 && Y >= 0 && X < W && Y < H && d[Y * W + X]) c++; }
  return c;
};

/* the terminal branches of a skeleton: from each tip to the first junction or other tip, as pixel paths */
export function terminalBranches(S) {
  const { W, H, d } = S, out = [];
  for (let i = 0; i < W * H; i++) {
    if (!d[i] || deg(S, i) !== 1) continue;
    const path = [i];
    let prev = -1, cur = i;
    for (;;) {
      const x = cur % W, y = (cur / W) | 0;
      let next = -1, n = 0;
      for (let k = 0; k < 8; k++) {
        const X = x + DX[k], Y = y + DY[k];
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X;
        if (!d[j] || j === prev) continue;
        n++; if (next < 0) next = j;
      }
      if (n !== 1) { path.junction = n > 1; break; } // a junction (or the far tip of an isolated piece)
      prev = cur; cur = next; path.push(cur);
      const dc = deg(S, cur);
      if (dc !== 2) { path.junction = dc > 2; break; }
      if (path.length > W + H + 4 * Math.max(W, H)) break;
    }
    out.push(path);
  }
  return out;
}

const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const h = (s.length - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; };

/* One filament from a terminal branch (tip first), or null. `width` is 2 * the distance transform's root.
   `minLen` is the shortest filament in pixels: the caller passes the line's width unit (w_med for the film),
   because detail shorter than the line is wide is edge roughness, which the suite measures apart (E7a: roughness
   at width-tied scales); without it, every bump of a rough edge is a spur of the skeleton and reads as a filament. */
export function filamentOf(path, W, width, minLen = 0) {
  const n = path.length;
  if (n < 3) return null;
  const xs = path.map((i) => i % W), ys = path.map((i) => (i / W) | 0), ws = path.map((i) => width[i]);
  // arc length along the path
  const s = new Float64Array(n);
  for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  // shaft width: the median over the branch's middle half; the filament ends where the width passes MASS_W shafts
  let shaft = median(ws.slice(Math.floor(n / 4), Math.max(Math.floor(n / 4) + 1, Math.ceil((3 * n) / 4))));
  // a filament grows from a body: walking from the tip, the width must pass MASS_W shafts before the branch ends.
  // A branch that reaches a junction or another tip without meeting a body is a strand of equal weight (a stroke
  // ending at a gap, one side of a fork, a piece lying alone) and is not a filament; BAR_F G9 judges such strokes
  // apart, so a free straight line is still caught.
  // A tendril as thick as the line it grows from never passes MASS_W; it joins a body when the branch ends at a
  // junction whose width is at least JUNCTION_W shafts (a stroke end or one side of a fork meets the line at about
  // its own width). Seen on the F2 overlay: Abbott's two tall tendrils, the long ones of OfferWeapon and Weapon.
  let end = -1;
  for (let k = 1; k < n; k++) if (ws[k] > MASS_W * shaft && s[k] > TIP_SPAN * shaft) { end = k; break; }
  if (end < 0 && path.junction && ws[n - 1] >= JUNCTION_W * shaft) end = n - 1;
  if (end < 0) return null;
  shaft = median(ws.slice(Math.floor(end / 4), Math.max(Math.floor(end / 4) + 1, Math.ceil((3 * end) / 4))));
  const L = s[end];
  if (!(shaft > 0) || L < MIN_ELONG * shaft || L < minLen) return null;
  const mid = ws.slice(Math.floor(end / 4), Math.max(Math.floor(end / 4) + 1, Math.ceil((3 * end) / 4)));
  const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
  const cv = Math.sqrt(mid.reduce((a, b) => a + (b - mean) ** 2, 0) / mid.length) / mean;
  // the knob: the widest point within one shaft width of the tip; its neck: the narrowest point from 1 to
  // 1 + TIP_SPAN shaft widths behind it (film.md 5.2: "rounded knobs about twice the shaft width" behind them)
  let tipMax = 0, neck = Infinity;
  for (let k = 0; k <= end; k++) {
    if (s[k] <= shaft) tipMax = Math.max(tipMax, ws[k]);
    else if (s[k] <= (1 + TIP_SPAN) * shaft) neck = Math.min(neck, ws[k]);
    else break;
  }
  if (!Number.isFinite(neck)) neck = shaft;
  // turning: direction sampled every shaft width of arc, total absolute change of heading
  const step = Math.max(2, shaft);
  const pts = [[xs[0], ys[0]]];
  for (let k = 1, nextS = step; k <= end; k++) if (s[k] >= nextS) { pts.push([xs[k], ys[k]]); nextS += step; }
  if (pts.length < 2 || pts[pts.length - 1][0] !== xs[end] || pts[pts.length - 1][1] !== ys[end]) pts.push([xs[end], ys[end]]);
  let turn = 0, prevA = null;
  for (let k = 1; k < pts.length; k++) {
    const a = Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]);
    if (prevA !== null) { let da = a - prevA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turn += Math.abs(da); }
    prevA = a;
  }
  const chord = Math.hypot(xs[end] - xs[0], ys[end] - ys[0]);
  const tipRatio = tipMax / neck, taper = tipMax / shaft;
  return {
    length: L, shaft, shaftCV: cv, tipRatio, taper, straightness: chord / L, turnDeg: (turn * 180) / Math.PI,
    tip: tipRatio >= 1.5 ? 'bulb' : taper <= 0.5 ? 'pointed' : 'flat',
    tipXY: [xs[0], ys[0]], baseXY: [xs[end], ys[end]], path: path.slice(0, end + 1),
  };
}

/* every filament of a mask at least minLen pixels long. With `ring` ({ cx, cy, R, w }: the film's fitted ring and
   its median carrier width in pixels), a branch that lies at least CARRIER_SHARE of its length inside the carrier
   band of ring.js and is at least CARRIER_W of the carrier's width thick is the carrier stroke itself and is
   dropped: on Ian a hairline strand ends and its branch follows the thin ring to the blot. A tendril near the
   ring is thinner than the ring (the film's median shaft is a quarter of w_med), so the band alone would drop
   short tendrils too (it dropped 56 of 136). Our own figures have no carrier (H5, BAR_F G10): no ring passed. */
export const CARRIER_SHARE = 0.8, CARRIER_W = 0.5;
export function filaments(m, { minLen = 0, ring = null } = {}) {
  const D2 = edt2(m);
  const width = new Float64Array(D2.length);
  for (let i = 0; i < D2.length; i++) width[i] = 2 * Math.sqrt(D2[i]);
  const S = skeletonize(m);
  const out = [];
  for (const p of terminalBranches(S)) {
    const f = filamentOf(p, m.W, width, minLen);
    if (!f) continue;
    if (ring && f.shaft >= CARRIER_W * ring.w) {
      let inBand = 0;
      for (const i of f.path) if (Math.abs(Math.hypot((i % m.W) - ring.cx, ((i / m.W) | 0) - ring.cy) - ring.R) <= CARRIER_BAND * ring.R) inBand++;
      if (inBand >= CARRIER_SHARE * f.path.length) continue;
    }
    out.push(f);
  }
  return { filaments: out, skeleton: S };
}
