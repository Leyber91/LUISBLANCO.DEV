/* ============================================================
   heptapod/topo/contour.js — the region U and its boundary (plan
   3.4.4 steps 1 and 2).

   U is the union of the lobe disks and the neck capsules. Its boundary
   is extracted by marching squares on a signed distance field (the
   union's field is the minimum of the primitives' fields), with linear
   interpolation on grid edges for sub-cell accuracy and the saddle
   cells resolved by the cell-centre value, then resampled by arc
   length. Two independent views of the topology are reported:
   - the number of boundary loops marching squares closes;
   - connected components of the grid's inside nodes (8-connected) and
     outside nodes (4-connected), the method of the research check 4.
   One closed curve with no holes means: 1 loop, 1 inside, 1 outside.
   ============================================================ */

import { TOPO } from './config.js';
import { motifAt } from './rim.js';

/* ---------------- signed distance grid (sparse tiles) ---------------- */
/* Nodes (i, j) sit at (x0 + i h, y0 + j h). Only 32 x 32 tiles that some
   primitive's box (plus a band of 2h) touches are stored; every other
   node is far outside and reads as +1e9. A node next to a crossing is
   always within the band of the primitive that makes it, so the sparse
   grid gives the same contour as the dense one. */
const TS = 32, TSH = 5, TM = 31, TK = 4096;
const FAR = 1e9;

export function sdfGrid(disks, caps, h, pad = 3) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of disks) { x0 = Math.min(x0, d.x - d.r); y0 = Math.min(y0, d.y - d.r); x1 = Math.max(x1, d.x + d.r); y1 = Math.max(y1, d.y + d.r); }
  for (const c of caps) {
    x0 = Math.min(x0, c.ax - c.hw, c.bx - c.hw); y0 = Math.min(y0, c.ay - c.hw, c.by - c.hw);
    x1 = Math.max(x1, c.ax + c.hw, c.bx + c.hw); y1 = Math.max(y1, c.ay + c.hw, c.by + c.hw);
  }
  x0 -= pad * h; y0 -= pad * h; x1 += pad * h; y1 += pad * h;
  const W = Math.ceil((x1 - x0) / h) + 1, H = Math.ceil((y1 - y0) / h) + 1;
  const tiles = new Map();
  const band = 2 * h;
  const tileDiag = TS * h * Math.SQRT2;
  /* skipTile(tx, ty) is true when a whole tile (centre tx, ty) lies beyond
     the primitive's band: such a tile is not created for it. */
  const stamp = (bx0, by0, bx1, by1, f, skipTile) => {
    const i0 = Math.max(0, Math.floor((bx0 - band - x0) / h)), i1 = Math.min(W - 1, Math.ceil((bx1 + band - x0) / h));
    const j0 = Math.max(0, Math.floor((by0 - band - y0) / h)), j1 = Math.min(H - 1, Math.ceil((by1 + band - y0) / h));
    for (let tj = j0 >> TSH; tj <= j1 >> TSH; tj++) {
      for (let ti = i0 >> TSH; ti <= i1 >> TSH; ti++) {
        if (skipTile && skipTile(x0 + ((ti << TSH) + TS / 2) * h, y0 + ((tj << TSH) + TS / 2) * h)) continue;
        const key = ti * TK + tj;
        let t = tiles.get(key);
        if (!t) { t = new Float32Array(TS * TS).fill(FAR); tiles.set(key, t); }
        const ja = Math.max(j0, tj << TSH), jb = Math.min(j1, (tj << TSH) + TM);
        const ia = Math.max(i0, ti << TSH), ib = Math.min(i1, (ti << TSH) + TM);
        for (let j = ja; j <= jb; j++) {
          const py = y0 + j * h;
          const row = (j & TM) << TSH;
          for (let i = ia; i <= ib; i++) {
            const s = f(x0 + i * h, py);
            const k = row | (i & TM);
            if (s < t[k]) t[k] = s;
          }
        }
      }
    }
  };
  for (const d of disks) {
    const cx = d.x, cy = d.y, rr = d.r;
    stamp(cx - rr, cy - rr, cx + rr, cy + rr, (px, py) => { const dx = px - cx, dy = py - cy; return Math.sqrt(dx * dx + dy * dy) - rr; },
      (tx, ty) => { const dx = tx - cx, dy = ty - cy; return Math.sqrt(dx * dx + dy * dy) - rr > band + tileDiag / 2; });
  }
  for (const c of caps) {
    const ax = c.ax, ay = c.ay, vx = c.bx - c.ax, vy = c.by - c.ay, hw = c.hw;
    const L2 = vx * vx + vy * vy || 1e-12;
    const segDist = (px, py) => {
      let t = ((px - ax) * vx + (py - ay) * vy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = ax + t * vx - px, dy = ay + t * vy - py;
      return Math.sqrt(dx * dx + dy * dy);
    };
    stamp(Math.min(c.ax, c.bx) - hw, Math.min(c.ay, c.by) - hw, Math.max(c.ax, c.bx) + hw, Math.max(c.ay, c.by) + hw,
      (px, py) => segDist(px, py) - hw, (tx, ty) => segDist(tx, ty) - hw > band + tileDiag / 2);
  }
  return { W, H, x0, y0, h, tiles };
}

function val(G, i, j) {
  if (i < 0 || j < 0 || i >= G.W || j >= G.H) return FAR;
  const t = G.tiles.get((i >> TSH) * TK + (j >> TSH));
  return t ? t[((j & TM) << TSH) | (i & TM)] : FAR;
}

export function gridNodes(G) {
  return G.tiles.size * TS * TS;
}

/* ---------------- marching squares ---------------- */
/* Cell corners counter-clockwise c0 (i,j), c1 (i+1,j), c2 (i+1,j+1), c3 (i,j+1);
   edges e0 c0-c1, e1 c1-c2, e2 c2-c3, e3 c3-c0. Each segment is oriented
   so the inside lies on its left: walking a loop keeps U on the left. */
const SEGS = {
  1: [[0, 3]], 2: [[1, 0]], 4: [[2, 1]], 8: [[3, 2]],
  14: [[3, 0]], 13: [[0, 1]], 11: [[1, 2]], 7: [[2, 3]],
  3: [[1, 3]], 6: [[2, 0]], 12: [[3, 1]], 9: [[0, 2]],
};
const SADDLE = {
  5: { in: [[0, 1], [2, 3]], out: [[0, 3], [2, 1]] },
  10: { in: [[3, 0], [1, 2]], out: [[1, 0], [3, 2]] },
};

export function marchLoops(G) {
  const { W, H } = G;
  const next = new Map();
  const edgeId = (i, j, e) => {
    switch (e) {
      case 0: return (j * W + i) * 2;
      case 1: return (j * W + i + 1) * 2 + 1;
      case 2: return ((j + 1) * W + i) * 2;
      default: return (j * W + i) * 2 + 1;
    }
  };
  let saddles = 0;
  for (const [key, t] of G.tiles) {
    const ti = Math.floor(key / TK), tj = key - ti * TK;
    for (let lj = 0; lj < TS; lj++) {
      const j = (tj << TSH) + lj;
      if (j >= H - 1) break;
      for (let li = 0; li < TS; li++) {
        const i = (ti << TSH) + li;
        if (i >= W - 1) break;
        let a, b, c, d;
        if (li < TM && lj < TM) {
          const k = (lj << TSH) | li;
          a = t[k]; b = t[k + 1]; c = t[k + TS + 1]; d = t[k + TS];
        } else {
          a = t[(lj << TSH) | li]; b = val(G, i + 1, j); c = val(G, i + 1, j + 1); d = val(G, i, j + 1);
        }
        const cs = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
        if (cs === 0 || cs === 15) continue;
        let segs = SEGS[cs];
        if (!segs) { saddles++; segs = (a + b + c + d) / 4 < 0 ? SADDLE[cs].in : SADDLE[cs].out; }
        for (const [ea, eb] of segs) next.set(edgeId(i, j, ea), edgeId(i, j, eb));
      }
    }
  }
  const point = (id) => {
    const node = Math.floor(id / 2);
    const i = node % W, j = (node - i) / W;
    const horiz = id % 2 === 0;
    const a = val(G, i, j);
    const b = horiz ? val(G, i + 1, j) : val(G, i, j + 1);
    const tt = a / (a - b);
    return horiz ? [G.x0 + (i + tt) * G.h, G.y0 + j * G.h] : [G.x0 + i * G.h, G.y0 + (j + tt) * G.h];
  };
  const seen = new Set();
  const loops = [];
  let broken = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const pts = [];
    let id = start;
    while (!seen.has(id)) {
      seen.add(id);
      const p = point(id);
      pts.push(p[0], p[1]);
      const nx = next.get(id);
      if (nx === undefined) { broken++; break; }
      id = nx;
    }
    if (id !== start) broken++;
    loops.push(Float64Array.from(pts));
  }
  return { loops, broken, saddles };
}

export function signedArea(pts) {
  let s = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  return s / 2;
}

/* ---------------- raster topology (research check 4's method) ---------------- */
/* Components of inside nodes (8-connected) and of outside nodes
   (4-connected) over the stored tiles. The outside nodes kept form a
   band at least 2 nodes wide around U, connected along each boundary
   loop, so the outside count is 1 plus the number of holes. */
export function rasterTopology(G) {
  const keys = [...G.tiles.keys()];
  const nt = keys.length;
  const at = new Map(keys.map((k, i) => [k, i]));
  const vals = keys.map((k) => G.tiles.get(k));
  const nb = new Int32Array(nt * 9).fill(-1);
  keys.forEach((key, i) => {
    const ti = Math.floor(key / TK), tj = key - ti * TK;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const k2 = (ti + di) * TK + (tj + dj);
      if (at.has(k2)) nb[i * 9 + (dj + 1) * 3 + (di + 1)] = at.get(k2);
    }
  });
  const lab = new Uint8Array(nt * TS * TS);
  const stack = new Int32Array(nt * TS * TS);
  const count = (inside, eight, mark) => {
    let comps = 0;
    for (let ti0 = 0; ti0 < nt; ti0++) {
      const t0 = vals[ti0];
      for (let k0 = 0; k0 < TS * TS; k0++) {
        const g0 = ti0 * TS * TS + k0;
        if (lab[g0] === mark || (t0[k0] < 0) !== inside) continue;
        comps++;
        lab[g0] = mark;
        let sp = 0;
        stack[sp++] = g0;
        while (sp) {
          const g = stack[--sp];
          const tIdx = (g / (TS * TS)) | 0, k = g - tIdx * TS * TS;
          const li = k & TM, lj = k >> TSH;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              if (!di && !dj) continue;
              if (!eight && di && dj) continue;
              const ni = li + di, nj = lj + dj;
              const dti = ni < 0 ? -1 : ni > TM ? 1 : 0, dtj = nj < 0 ? -1 : nj > TM ? 1 : 0;
              const nIdx = dti || dtj ? nb[tIdx * 9 + (dtj + 1) * 3 + (dti + 1)] : tIdx;
              if (nIdx < 0) continue;
              const nk = ((nj & TM) << TSH) | (ni & TM);
              const ng = nIdx * TS * TS + nk;
              if (lab[ng] === mark || (vals[nIdx][nk] < 0) !== inside) continue;
              lab[ng] = mark;
              stack[sp++] = ng;
            }
          }
        }
      }
    }
    return comps;
  };
  return { inside: count(true, true, 1), outside: count(false, false, 2) };
}
/* ---------------- arc-length resampling ---------------- */
export function resampleLoop(pts, ds) {
  const n = pts.length / 2;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] = cum[i] + Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
  }
  const L = cum[n];
  const m = Math.max(8, Math.round(L / ds));
  const out = new Float64Array(2 * m);
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const s = (k * L) / m;
    while (seg < n - 1 && cum[seg + 1] <= s) seg++;
    const i = seg, j = (seg + 1) % n;
    const L0 = cum[seg + 1] - cum[seg];
    const t = L0 > 0 ? (s - cum[seg]) / L0 : 0;
    out[2 * k] = pts[2 * i] + t * (pts[2 * j] - pts[2 * i]);
    out[2 * k + 1] = pts[2 * i + 1] + t * (pts[2 * j + 1] - pts[2 * i + 1]);
  }
  return out;
}

/* ---------------- reading the rim code onto the contour ---------------- */
/* For each contour point on a lobe rim (within rimTol), the motif and
   cell the allocation put there; points on neck sides and in contact
   zones carry nothing. This is the renderer's step: the decoder gets
   only points, symbols and cell positions, never lobe membership. */
export function attributeRim(pts, lobes) {
  const m = pts.length / 2;
  const sym = new Array(m).fill(null);
  const cell = new Int8Array(m).fill(-1);
  // bucket lobes on a coarse grid for lookup
  let maxR = 0;
  for (const L of lobes) maxR = Math.max(maxR, L.r);
  const B = 2 * maxR + 1;
  const buckets = new Map();
  const key = (bx, by) => bx * 73856093 ^ by * 19349663;
  lobes.forEach((L, li) => {
    const bx = Math.floor(L.x / B), by = Math.floor(L.y / B);
    const k = key(bx, by);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(li);
  });
  for (let k = 0; k < m; k++) {
    const px = pts[2 * k], py = pts[2 * k + 1];
    const bx = Math.floor(px / B), by = Math.floor(py / B);
    let best = -1, bestErr = TOPO.rimTol;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const lst = buckets.get(key(bx + dx, by + dy));
      if (!lst) continue;
      for (const li of lst) {
        const L = lobes[li];
        const ex = px - L.x, ey = py - L.y;
        const err = Math.abs(Math.sqrt(ex * ex + ey * ey) - L.r);
        if (err < bestErr) { bestErr = err; best = li; }
      }
    }
    if (best < 0) continue;
    const L = lobes[best];
    let a = Math.atan2(py - L.y, px - L.x);
    if (a < 0) a += 2 * Math.PI;
    const hit = motifAt(L.placements, L.C, a * L.r);
    if (hit) { sym[k] = hit.sym; cell[k] = hit.cell; }
  }
  return { sym, cell };
}
