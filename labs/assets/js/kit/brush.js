/* ============================================================
   kit/brush.js: a brushed, tapered ink stroke along a centreline,
   as filled outlines, for every lab of the Contact world (ink in
   fog). Written on 2026-11-21 with its first caller, the
   Orthogonal plate (Alternate Reality); a second Contact lab that
   draws a line by hand takes it from here.

   The stroke is a brush pen's, read from how one moves (from
   memory, not from a measured stroke): it lands as a blot wider
   than its body, where the brush pressed and the ink pooled
   (LANDED, and a round blot under the start), settles to its body
   (LAND), runs with a slow swell, and lifts toward a point (LIFT,
   TIP). So a stroke has a direction, heavy where it began. Dry, it
   parts into bristle tracks toward its end: each bristle is its own
   outline with its own density (alphas), the bristles overlap
   where the brush lands, part from PART on, and the outer ones run
   dry before the end.

   Every variation (the swell, the wobble of the line, how dry each
   bristle runs) comes from one seed, so a stroke seeded by the ids
   it joins draws the same picture on every load. The two ends of
   the centreline are kept: the wobble is zero there.

   Pure geometry: no DOM. Tests: kit/tests/brush.test.mjs.
   ============================================================ */
import { noise3 } from './fog.js';

export const BRUSH = Object.freeze({
  LAND: 0.08,      // share of the length over which the blot settles to the body
  LANDED: 1.35,    // the width it lands at, as a share of its body's: the blot
  LIFT: 0.3,       // share of the length over which it lifts
  TIP: 0.3,        // the width left at the end, as a share of the body's, so a stroke still reaches what it joins
  SWELL: 0.14,     // the body's width varies by up to this share
  WOBBLE: 0.6,     // px: the most the line strays from its centreline, mid-stroke
  BRISTLES: 4,
  PART: 0.3,       // where the bristles start to part, as a share of the length
  STEP: 5,         // px between samples along the line
});

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* The stroke's width at t (0 where it lands, 1 where it lifts), as a share of its body's width, before the swell. */
export function profile(t, B = BRUSH) {
  const land = B.LANDED + (1 - B.LANDED) * smooth(0, B.LAND, t);
  const lift = 1 - (1 - B.TIP) * smooth(1 - B.LIFT, 1, t);
  return land * lift;
}

/* Points every `step` px along a polyline, by arc length, with each point's t (0 to 1) and unit normal. */
export function resample(points, step = BRUSH.STEP) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const L = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    seg.push(L);
    total += L;
  }
  if (!(total > 0)) return { total: 0, pts: [] };
  const n = Math.max(4, Math.ceil(total / step));
  const pts = [];
  let k = 0, acc = 0;
  for (let j = 0; j <= n; j++) {
    const at = (total * j) / n;
    while (k < seg.length - 1 && acc + seg[k] < at) { acc += seg[k]; k++; }
    const f = seg[k] > 0 ? (at - acc) / seg[k] : 0;
    const a = points[k], b = points[k + 1];
    pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, t: j / n });
  }
  for (let j = 0; j < pts.length; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    pts[j].nx = -dy / L;
    pts[j].ny = dx / L;
  }
  return { total, pts };
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * A stroke `width` px wide along `points` ([[x, y], ...], from where it lands to where it lifts), seeded by `seed`.
 * Returns { paths: one SVG path (a closed outline) per bristle, alphas: each bristle's density (0.55 to 1), blot: a
 * closed round path under where it lands, total: the centreline's length, halfWidth(t): the stroke's half-width at t,
 * swell included, for the tests }.
 */
export function brushStroke(points, { width, seed, bristles = BRUSH.BRISTLES, B = BRUSH } = {}) {
  const { total, pts } = resample(points, B.STEP);
  if (!pts.length || !(width > 0)) return { paths: [], alphas: [], blot: '', total: 0, halfWidth: () => 0 };
  const s = seed >>> 0;
  const freq = Math.max(1.5, total / 90);   // about one swell every 90 px, and at least a slow one on a short stroke
  const swell = (t) => 1 + B.SWELL * noise3(s, t * freq, 0.5, 0);
  const halfWidth = (t) => (width / 2) * profile(t, B) * swell(t);
  const wobble = (t) => B.WOBBLE * noise3(s + 1, t * freq * 1.7, 2.5, 0) * Math.sin(Math.PI * t);
  const paths = [], alphas = [];
  for (let k = 0; k < bristles; k++) {
    const dry = 0.45 + 0.55 * (0.5 + 0.5 * noise3(s + 2, k * 3.1, 7.7, 0));       // how fast this bristle runs dry
    const c = bristles > 1 ? (2 * k - (bristles - 1)) / (bristles - 1) : 0;         // -1 at one edge, 1 at the other
    const end = 1 - 0.22 * Math.max(0, (Math.abs(c) - 0.4) / 0.6) * (0.5 + 0.5 * noise3(s + 3, k * 1.3, 4.1, 0)); // the outer ones end early; the middle ones reach the lift
    const left = [], right = [];
    for (const p of pts) {
      if (p.t > end + 1e-9) break;
      const hw = halfWidth(p.t);
      const part = smooth(B.PART, 1, p.t) * dry;
      // a bristle's own half-width: wide enough where the brush lands that the bristles overlap into one mark, then
      // narrower as it runs dry, and thinning over the last stretch before its own end
      const own = Math.min(hw, (hw / bristles) * (2.1 - 1.7 * part)) * (p.t > end - 0.06 ? smooth(end, end - 0.06, p.t) * 0.7 + 0.3 : 1);
      const centre = c * Math.max(0, hw - own);   // the outer bristles' outer edges run on the stroke's edge
      const w = wobble(p.t);
      const cx = p.x + p.nx * (centre + w), cy = p.y + p.ny * (centre + w);
      left.push(`${r1(cx + p.nx * own)} ${r1(cy + p.ny * own)}`);
      right.push(`${r1(cx - p.nx * own)} ${r1(cy - p.ny * own)}`);
    }
    if (left.length < 2) continue;
    paths.push(`M${left.join(' L')} L${right.reverse().join(' L')} Z`);
    alphas.push(Math.round((0.55 + 0.45 * (0.5 + 0.5 * noise3(s + 4, k * 2.3, 1.9, 0))) * 100) / 100);
  }
  // the blot: a round pool of ink under where the brush landed, as wide as the stroke there
  const r0 = halfWidth(0), o = pts[0], ring = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * Math.PI; ring.push(`${r1(o.x + r0 * Math.cos(a))} ${r1(o.y + r0 * Math.sin(a))}`); }
  const blot = `M${ring.join(' L')} Z`;
  return { paths, alphas, blot, total, halfWidth };
}
