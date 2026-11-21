/* ============================================================
   dimensions/plate.js: the plate's geometry (BAR_L1 parts 04 to 06). Pure.

   The plane is laid through a drawing a, its corner b and a third drawing c, centred on the step from a to b, so the
   step is the segment from (-L/2, 0) to (L/2, 0) in the plane's frame. The square's half-side is `half` times L / 2.
   `run` finds, exactly, the cells the step passes through and the places where it crosses a wall, by clipping the
   segment to each convex cell (Cyrus and Beck's line clipping). Nothing is sampled.
   ============================================================ */

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export function frameAlong(a, b, c, half = 1.5) {
  const d = Float64Array.from(a, (v, i) => b[i] - v);
  const L = Math.sqrt(dot(d, d));
  if (!(L > 0)) throw new Error('the corner equals the drawing');
  const e1 = d.map((v) => v / L);
  const w = Float64Array.from(a, (v, i) => c[i] - v);
  const pw = dot(w, e1);
  const e2 = Float64Array.from(w, (v, i) => v - pw * e1[i]);
  const n2 = Math.sqrt(dot(e2, e2));
  if (!(n2 > 1e-9 * L)) throw new Error('the third drawing lies on the step');
  for (let i = 0; i < e2.length; i++) e2[i] /= n2;
  return { c: Float64Array.from(a, (v, i) => (v + b[i]) / 2), e1, e2, H: (half * L) / 2, L };
}

/** The part [t0, t1] of the segment from (-L/2, 0) to (L/2, 0) inside a convex polygon, or null. */
export function clipRun(poly, L) {
  let t0 = 0, t1 = 1;
  const Ax = -L / 2, Ay = 0, Dx = L, Dy = 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const q = poly[i], r = poly[(i + 1) % poly.length]; area += q[0] * r[1] - r[0] * q[1]; }
  const sg = area > 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const Ex = x2 - x1, Ey = y2 - y1;
    const a = sg * (Ex * (Ay - y1) - Ey * (Ax - x1)), b = sg * (Ex * Dy - Ey * Dx);
    if (Math.abs(b) < 1e-15) { if (a < 0) return null; continue; }
    const t = -a / b;
    if (b > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t1 - t0 > 1e-12 ? [t0, t1] : null;
}

/** The cells the step passes through, and the wall crossings as fractions of the step, in order. */
export function run(cells, L) {
  const passed = [];
  for (const c of cells) { const s = clipRun(c.poly, L); if (s) passed.push({ cell: c, s }); }
  passed.sort((p, q) => p.s[0] - q.s[0]);
  const ticks = [];
  for (let i = 1; i < passed.length; i++) ticks.push(passed[i].s[0]);
  return { passed, ticks };
}
