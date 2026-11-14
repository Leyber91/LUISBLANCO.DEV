/* ============================================================
   heptapod/topo/crop.js — cut a drawn contour with a disk, as a camera
   or a "focus" window would: the parts of the line inside the disk,
   each an open piece from where it enters to where it leaves, with the
   rim code it carries. Nothing about lobes or the graph is passed on.
   ============================================================ */

function circleHit(x0, y0, x1, y1, cx, cy, R) {
  // the t in [0, 1] where the segment crosses the circle (one crossing)
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - R * R;
  const disc = Math.max(0, b * b - 4 * a * c);
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const ok = (t) => t >= -1e-9 && t <= 1 + 1e-9;
  const t = ok(t1) && ok(t2) ? (Math.abs(t1 - 0.5) < Math.abs(t2 - 0.5) ? t1 : t2) : ok(t1) ? t1 : t2;
  return Math.min(1, Math.max(0, t));
}

export function cropContour(contour, cx, cy, R) {
  const { pts, sym, cell } = contour;
  const n = pts.length / 2;
  const inn = new Uint8Array(n);
  for (let i = 0; i < n; i++) inn[i] = Math.hypot(pts[2 * i] - cx, pts[2 * i + 1] - cy) < R ? 1 : 0;
  let first = -1;
  for (let i = 0; i < n; i++) if (!inn[i]) { first = i; break; }
  if (first < 0) return { closed: true, pieces: [] };
  const pieces = [];
  for (let s = 0; s < n; s++) {
    const i = (first + s) % n;
    const prev = (i - 1 + n) % n;
    if (!inn[i] || inn[prev]) continue;
    const P = [], S = [], C = [];
    const t0 = circleHit(pts[2 * prev], pts[2 * prev + 1], pts[2 * i], pts[2 * i + 1], cx, cy, R);
    P.push(pts[2 * prev] + t0 * (pts[2 * i] - pts[2 * prev]), pts[2 * prev + 1] + t0 * (pts[2 * i + 1] - pts[2 * prev + 1])); S.push(null); C.push(-1);
    let j = i;
    while (inn[j]) { P.push(pts[2 * j], pts[2 * j + 1]); S.push(sym[j]); C.push(cell[j]); j = (j + 1) % n; }
    const pj = (j - 1 + n) % n;
    const t1 = circleHit(pts[2 * pj], pts[2 * pj + 1], pts[2 * j], pts[2 * j + 1], cx, cy, R);
    P.push(pts[2 * pj] + t1 * (pts[2 * j] - pts[2 * pj]), pts[2 * pj + 1] + t1 * (pts[2 * j + 1] - pts[2 * pj + 1])); S.push(null); C.push(-1);
    pieces.push({ pts: Float64Array.from(P), sym: S, cell: Int8Array.from(C) });
  }
  return { closed: false, pieces };
}
