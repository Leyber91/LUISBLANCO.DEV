// split.mjs: the exact mosaic of a ReLU network's cells on a plane through three inputs.
// Pure; written so the page can import it unchanged (it will run in a worker).
//
// Method (Hanin and Rolnick, ICML 2019, section 3.3, "Regions within a 2D plane"): start with one region,
// the square, and subdivide it neuron by neuron. Inside a region every neuron of the next layer is an affine
// function of the plane's two coordinates, so its wall there is a straight line, and the region is cut by it
// exactly. The plane and its square follow the same paper: the plane through three inputs, a square centred
// at their circumcentre. Nothing is sampled.
//
// The plane: x(u, v) = c + u e1 + v e2, with c the circumcentre of the three points and (e1, e2) an
// orthonormal basis of their span. The square: |u|, |v| <= H, H = HALF_SIDE_FACTOR * R, R the circumradius.

export const HALF_SIDE_FACTOR = 1.2;

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// The frame of the plane through p0, p1, p2 (arrays of equal length).
export function planeFrame(p0, p1, p2) {
  const n = p0.length;
  const a = new Float64Array(n), bq = new Float64Array(n);
  for (let i = 0; i < n; i++) { a[i] = p1[i] - p0[i]; bq[i] = p2[i] - p0[i]; }
  const na = Math.sqrt(dot(a, a));
  const e1 = a.map((v) => v / na);
  const pb = dot(bq, e1);
  const e2 = new Float64Array(n);
  for (let i = 0; i < n; i++) e2[i] = bq[i] - pb * e1[i];
  const ne2 = Math.sqrt(dot(e2, e2));
  if (!(ne2 > 1e-9 * na)) throw new Error('the three points are on one line');
  for (let i = 0; i < n; i++) e2[i] /= ne2;
  // The three points in the frame with p0 at the origin.
  const P = [[0, 0], [na, 0], [pb, ne2]];
  // Circumcentre of P (2D formula).
  const [ax, ay] = P[0], [bx, by] = P[1], [cx, cy] = P[2];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const R = Math.hypot(ax - ux, ay - uy);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) c[i] = p0[i] + ux * e1[i] + uy * e2[i];
  const pts = P.map(([x, y]) => [x - ux, y - uy]);
  return { c, e1, e2, R, H: HALF_SIDE_FACTOR * R, pts };
}

export function pointAt(frame, u, v, out = new Float64Array(frame.c.length)) {
  const { c, e1, e2 } = frame;
  for (let i = 0; i < c.length; i++) out[i] = c[i] + u * e1[i] + v * e2[i];
  return out;
}

// Area and centroid of a convex polygon (array of [u, v], counter-clockwise or not).
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polyCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

// Cut a convex polygon by the line g0 + gu u + gv v = 0. Returns [positive part, negative part];
// either may be null. A vertex within tol of the line counts as on it (it goes to both parts).
function cut(poly, g0, gu, gv, tol) {
  const n = poly.length;
  const val = new Array(n);
  let pos = false, neg = false;
  for (let i = 0; i < n; i++) {
    const f = g0 + gu * poly[i][0] + gv * poly[i][1];
    val[i] = f > tol ? 1 : f < -tol ? -1 : 0;
    if (val[i] > 0) pos = true;
    if (val[i] < 0) neg = true;
    poly[i].f = f;
  }
  if (!neg) return [poly, null];
  if (!pos) return [null, poly];
  const P = [], N = [];
  for (let i = 0; i < n; i++) {
    const A = poly[i], B = poly[(i + 1) % n];
    const sa = val[i], sb = val[(i + 1) % n];
    if (sa >= 0) P.push(A);
    if (sa <= 0) N.push(A);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) {
      const t = A.f / (A.f - B.f);
      const X = [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];
      P.push(X); N.push(X);
    }
  }
  return [P.length >= 3 ? P : null, N.length >= 3 ? N : null];
}

// The mosaic. net: { sizes, W, b } with ReLU hidden layers (the last layer is not cut).
// Returns { cells: [{ poly, pattern: Uint8Array (all hidden neurons), area }], perLayer: [count after layer 1, ...],
//           crossings: [lines of layer 1 that cross the square], domainArea }.
export function mosaic(net, frame, opts = {}) {
  const H = frame.H;
  const hidden = net.W.length - 1;
  const totalHidden = net.sizes.slice(1, 1 + hidden).reduce((a, b) => a + b, 0);
  const square = [[-H, -H], [H, -H], [H, H], [-H, H]];
  // The affine map of the input in the plane: x = c + u e1 + v e2, as three columns.
  const nin0 = net.sizes[0];
  // Layer 0 coefficients: for each input i, (c_i, e1_i, e2_i).
  let regions = [{ poly: square, A: null, pat: new Uint8Array(totalHidden) }];
  const perLayer = [];
  let offset = 0;
  const minArea = (opts.minAreaFrac ?? 1e-14) * (2 * H) * (2 * H);
  for (let l = 0; l < hidden; l++) {
    const w = net.W[l], bb = net.b[l], nin = net.sizes[l], nout = net.sizes[l + 1];
    const next = [];
    for (const R of regions) {
      // Pre-activation coefficients of every neuron of layer l inside R: g[j] = (g0, gu, gv).
      const G0 = new Float64Array(nout), GU = new Float64Array(nout), GV = new Float64Array(nout);
      for (let j = 0; j < nout; j++) {
        let g0 = bb[j], gu = 0, gv = 0;
        const o = j * nin;
        if (l === 0) {
          for (let i = 0; i < nin0; i++) {
            const wi = w[o + i];
            g0 += wi * frame.c[i]; gu += wi * frame.e1[i]; gv += wi * frame.e2[i];
          }
        } else {
          const A = R.A; // A[3 * i + k]: coefficient k of input i (the previous layer's output) in R
          for (let i = 0; i < nin; i++) {
            const wi = w[o + i];
            if (wi === 0) continue;
            g0 += wi * A[3 * i]; gu += wi * A[3 * i + 1]; gv += wi * A[3 * i + 2];
          }
        }
        G0[j] = g0; GU[j] = gu; GV[j] = gv;
      }
      // Cut R by every neuron's line, carrying the sign of each neuron in each piece.
      let pieces = [{ poly: R.poly, sign: new Uint8Array(nout) }];
      for (let j = 0; j < nout; j++) {
        const g0 = G0[j], gu = GU[j], gv = GV[j];
        const tol = 1e-9 * (Math.abs(g0) + H * (Math.abs(gu) + Math.abs(gv)));
        const out = [];
        for (const p of pieces) {
          const [P, N] = cut(p.poly, g0, gu, gv, tol);
          if (P && N) {
            const sp = new Uint8Array(p.sign); sp[j] = 1;
            out.push({ poly: P, sign: sp });
            out.push({ poly: N, sign: p.sign });
          } else if (P) {
            p.sign[j] = 1;
            out.push(p);
          } else {
            out.push(p); // sign 0 (off) already
          }
        }
        pieces = out;
      }
      for (const p of pieces) {
        const area = Math.abs(polyArea(p.poly));
        if (area <= minArea) continue;
        const pat = new Uint8Array(R.pat);
        for (let j = 0; j < nout; j++) pat[offset + j] = p.sign[j];
        let A = null;
        if (l + 1 < hidden) {
          A = new Float64Array(3 * nout);
          for (let j = 0; j < nout; j++) {
            if (!p.sign[j]) continue;
            A[3 * j] = G0[j]; A[3 * j + 1] = GU[j]; A[3 * j + 2] = GV[j];
          }
        }
        next.push({ poly: p.poly, A, pat, area });
      }
    }
    regions = next;
    perLayer.push(regions.length);
    offset += nout;
  }
  return {
    cells: regions.map((r) => ({ poly: r.poly.map((q) => [q[0], q[1]]), pattern: r.pat, area: r.area })),
    perLayer,
    domainArea: (2 * H) * (2 * H),
  };
}

// Layer 1 alone, by formula: in a convex domain, n lines in general position make
// 1 + (lines that cross the domain) + (pairwise crossings inside the domain) regions.
export function layerOneCountByFormula(net, frame) {
  const H = frame.H;
  const w = net.W[0], bb = net.b[0], nin = net.sizes[0], nout = net.sizes[1];
  const lines = [];
  for (let j = 0; j < nout; j++) {
    let g0 = bb[j], gu = 0, gv = 0;
    for (let i = 0; i < nin; i++) {
      const wi = w[j * nin + i];
      g0 += wi * frame.c[i]; gu += wi * frame.e1[i]; gv += wi * frame.e2[i];
    }
    // Does the line cross the open square? Its values at the four corners take both signs.
    const vals = [[-H, -H], [H, -H], [H, H], [-H, H]].map(([u, v]) => g0 + gu * u + gv * v);
    if (Math.min(...vals) < 0 && Math.max(...vals) > 0) lines.push([g0, gu, gv]);
  }
  let inside = 0;
  for (let a = 0; a < lines.length; a++) {
    for (let c = a + 1; c < lines.length; c++) {
      const [a0, au, av] = lines[a], [c0, cu, cv] = lines[c];
      const det = au * cv - av * cu;
      if (Math.abs(det) < 1e-15) continue;
      const u = (-a0 * cv + av * c0) / det;
      const v = (-au * c0 + a0 * cu) / det;
      if (Math.abs(u) < H && Math.abs(v) < H) inside++;
    }
  }
  return { lines: lines.length, inside, regions: 1 + lines.length + inside };
}

// The vertex certificate (the outside reader's, READER.md finding 7): in each cell, the network with its ReLUs
// replaced by the cell's own pattern is affine, so if every neuron's pre-activation has the cell's sign at every
// vertex of the convex cell, it has that sign everywhere inside. Then each cell lies in its pattern's region; with
// unique patterns and areas that sum to the square, no region is missed or merged. Returns the cells that fail.
export function certify(net, frame, cells) {
  const H = frame.H;
  const hidden = net.W.length - 1;
  const nin0 = net.sizes[0], n1 = net.sizes[1];
  const G = new Float64Array(3 * n1);
  for (let j = 0; j < n1; j++) {
    let g0 = net.b[0][j], gu = 0, gv = 0;
    for (let i = 0; i < nin0; i++) {
      const wi = net.W[0][j * nin0 + i];
      g0 += wi * frame.c[i]; gu += wi * frame.e1[i]; gv += wi * frame.e2[i];
    }
    G[3 * j] = g0; G[3 * j + 1] = gu; G[3 * j + 2] = gv;
  }
  let bad = 0;
  const bufs = net.sizes.slice(1, 1 + hidden).map((k) => new Float64Array(k));
  for (const c of cells) {
    let ok = true;
    for (const [u, v] of c.poly) {
      let off = 0;
      for (let l = 0; l < hidden && ok; l++) {
        const nout = net.sizes[l + 1], nin = net.sizes[l];
        const pre = bufs[l];
        for (let j = 0; j < nout; j++) {
          let z, scale;
          if (l === 0) {
            z = G[3 * j] + G[3 * j + 1] * u + G[3 * j + 2] * v;
            scale = Math.abs(G[3 * j]) + H * (Math.abs(G[3 * j + 1]) + Math.abs(G[3 * j + 2]));
          } else {
            z = net.b[l][j]; scale = Math.abs(z);
            const prev = bufs[l - 1];
            for (let i = 0; i < nin; i++) {
              const t = net.W[l][j * nin + i] * (c.pattern[off - nin + i] ? prev[i] : 0);
              z += t; scale += Math.abs(t);
            }
          }
          pre[j] = z;
          const tol = 1e-7 * (scale || 1);
          if (c.pattern[off + j] ? z < -tol : z > tol) { ok = false; break; }
        }
        off += nout;
      }
      if (!ok) break;
    }
    if (!ok) bad++;
  }
  return bad;
}

// Is (u, v) inside the convex polygon (with a small tolerance)?
export function inPoly(poly, u, v, tol = 1e-9) {
  let sgn = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const cr = (x2 - x1) * (v - y1) - (y2 - y1) * (u - x1);
    const scale = Math.hypot(x2 - x1, y2 - y1) || 1;
    if (Math.abs(cr) <= tol * scale) continue;
    const s = cr > 0 ? 1 : -1;
    if (sgn === 0) sgn = s;
    else if (s !== sgn) return false;
  }
  return true;
}

export function patternKey(pat) {
  let s = '';
  for (let i = 0; i < pat.length; i += 8) {
    let byte = 0;
    for (let k = 0; k < 8 && i + k < pat.length; k++) byte |= (pat[i + k] ? 1 : 0) << k;
    s += String.fromCharCode(65 + (byte >> 4), 65 + (byte & 15));
  }
  return s;
}
