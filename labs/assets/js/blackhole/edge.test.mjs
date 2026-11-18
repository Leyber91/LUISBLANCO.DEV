/* ============================================================
   blackhole/edge.test.mjs — the traced shadow edge the overlay
   draws (probe.js outline, ui.js drawOverlay).
   Run:  node labs/assets/js/blackhole/edge.test.mjs
   Exit 0 when every check passes. No dependencies.

   The edge was a per-texel test in the shading shader: drawn on
   the G-buffer's grid, it was a staircase several pixels thick at
   the low tiers, dashed by angle around the screen centre, and on
   two sides of the shadow it sat outside the black, on the other
   two inside (2026-11-18). It is now a line through points where
   the frame's own rays change fate. These checks hold each point
   and each segment to that, at a 1440 x 900 and a 390 x 844
   screen, for views that put the disk across the shadow, take the
   disk away, look from far away and fall to the camera's floor.
   ============================================================ */

import * as K from './kerr.js';
import { Store } from './state.js';
import { anchors, edgeOpts, inShadow, camFor } from './probe.js';
import { shadowFor } from './physics.js';
import * as S from './shaders.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

// name, the state patch (or the store's own patch for a view), what the view must then carry (a patch that did not
// apply once left the "telescope" case in the cinematic view, and its comparison never ran), the screen, whether the
// whole shadow is on it, and whether the overlay draws the theory curve beside the edge
const VIEWS = [
  { name: 'the page as it opens (M87*, i 84, 46 M, disk on)', patch: {}, want: { rcam: 46, incl: 84, emit: 'thick' }, W: 1440, H: 900, whole: true },
  { name: 'the same at 390 px', patch: {}, want: { rcam: 46, incl: 84 }, W: 390, H: 844, whole: true },
  { name: 'no disk', patch: { emit: 'off' }, want: { emit: 'off' }, W: 1440, H: 900, whole: true },
  { name: 'seen from far away (telescope, M87* at 17 deg)', patch: (st) => st.viewPatch('telescope'), want: { incl: 17, emit: 'thin' }, W: 1440, H: 900, whole: true, theory: true },
  { name: 'the telescope at 390 px', patch: (st) => st.viewPatch('telescope'), want: { incl: 17, emit: 'thin' }, W: 390, H: 844, whole: true, theory: true },
  { name: 'edge-on, the disk across the shadow', patch: { obj: 'custom', a: 0.94, incl: 90 }, want: { incl: 90, a: 0.94 }, W: 1440, H: 900, whole: true },
  { name: 'nearly face-on, a 0.998', patch: { obj: 'custom', a: 0.998, incl: 17 }, want: { incl: 17, a: 0.998 }, W: 1440, H: 900, whole: true },
  { name: 'a faller at the camera floor, 3 M, fov 70', patch: { observer: 'faller', rcam: 3, fov: 70 }, want: { observer: 'faller', rcam: 3, fov: 70 }, W: 1440, H: 900, whole: false },
];

for (const { name, patch, want, W, H, whole, theory } of VIEWS) {
  const st = new Store();
  st.set(typeof patch === 'function' ? patch(st) : patch, { instant: true });
  const view = st.view();
  ok(`${name}: the view is the one named`, Object.entries(want).every(([k, v]) => view[k] === v), JSON.stringify(Object.fromEntries(Object.keys(want).map((k) => [k, view[k]]))));
  const aspect = W / H;
  const an = anchors({ view, aspect, edge: true });
  const e = an.edge;
  ok(`${name}: the anchors carry the traced edge`, !!(e && Array.isArray(e.runs) && e.runs.length), e ? `${e.runs.length} runs` : 'none');
  if (!(e && e.runs && e.runs.length)) continue;
  const pts = e.runs.flat();
  if (whole) ok(`${name}: the edge has a point in at least 90% of its ${e.n} directions`, pts.length >= 0.9 * e.n, `${pts.length} of ${e.n}`);
  const a = view.a, cam = camFor(view), opts = edgeOpts(view);
  const cap = (x, y) => inShadow(K.traceRay(a, cam, x, y, 1, opts));
  const px = 2 * an.th / H;                                  // one screen pixel in tangent-plane units
  const { cx, cy } = an.shadow;
  const unit = (x, y) => { const d = Math.hypot(x - cx, y - cy); return [(x - cx) / d, (y - cy) / d]; };
  // each point: half a pixel toward the centre a ray is captured, half a pixel away it is not
  let off = 0, offAt = '';
  for (const [x, y] of pts) {
    const [ux, uy] = unit(x, y);
    if (!cap(x - 0.5 * px * ux, y - 0.5 * px * uy) || cap(x + 0.5 * px * ux, y + 0.5 * px * uy)) { off++; offAt ||= `${x.toFixed(4)},${y.toFixed(4)}`; }
  }
  ok(`${name}: every point is within half a pixel of a change of fate, captured inside and not outside`, off === 0, `${off} of ${pts.length} off${offAt ? ', first at ' + offAt : ''}`);
  // the outline: no captured ray between a point and the edge of the screen, along its direction
  const X = an.th * aspect, Y = an.th;
  const offScreen = pts.filter(([x, y]) => Math.abs(x) > X * (1 + 1e-9) || Math.abs(y) > Y * (1 + 1e-9)).length;
  ok(`${name}: every point is on the screen`, offScreen === 0, `${offScreen} of ${pts.length} off it`);
  let beyond = 0;
  for (const [x, y] of pts) {
    const [ux, uy] = unit(x, y);
    let tMax = Infinity;
    if (ux) tMax = Math.min(tMax, ((ux > 0 ? X : -X) - x) / ux);
    if (uy) tMax = Math.min(tMax, ((uy > 0 ? Y : -Y) - y) / uy);
    for (let s = 1; s <= 6; s++) {
      const t = px + (tMax - px) * s / 6;
      if (t > 0 && cap(x + t * ux, y + t * uy)) { beyond++; break; }
    }
  }
  ok(`${name}: the edge is the outline, no captured ray beyond any point toward the screen's edge`, beyond === 0, `${beyond} of ${pts.length}`);
  // each segment the overlay draws stays on the edge: its midpoint is within 3 px of the change of fate, so no line
  // is drawn across the disk or across a stretch the shadow does not border
  let chord = 0, chordAt = '';
  const segs = [];
  for (const r of e.runs) for (let i = 0; i + 1 < r.length + (e.closed ? 1 : 0); i++) segs.push([r[i], r[(i + 1) % r.length]]);
  for (const [[x0, y0], [x1, y1]] of segs) {
    const mx = 0.5 * (x0 + x1), my = 0.5 * (y0 + y1), [ux, uy] = unit(mx, my);
    if (!cap(mx - 3 * px * ux, my - 3 * px * uy) || cap(mx + 3 * px * ux, my + 3 * px * uy)) { chord++; chordAt ||= `${mx.toFixed(4)},${my.toFixed(4)}`; }
  }
  ok(`${name}: every drawn segment stays within 3 px of the edge`, chord === 0, `${chord} of ${segs.length}${chordAt ? ', first at ' + chordAt : ''}`);
  // seen from far away the overlay draws the theory curve too, mapped as ui.js drawOverlay maps it: the dashed
  // traced edge must lie on it, the comparison its legend names ("solid: theory, dashes: traced edge")
  const th = theory ? shadowFor(view.a, view.incl, view.q || 0) : null;
  if (theory) ok(`${name}: the theory curve exists to compare with`, !!(th && th.curve), th ? th.how : 'none');
  if (th && th.curve) {
    const ro = view.rcam, f = (b) => Math.tan(Math.asin(b * Math.sqrt(1 - 2 / ro) / ro));
    const C = th.curve.map(([al, be]) => [f(al), f(be)]);
    const dist = (x, y) => {
      let best = Infinity;
      for (let i = 0; i < C.length; i++) {
        const [x0, y0] = C[i], [x1, y1] = C[(i + 1) % C.length], ex = x1 - x0, ey = y1 - y0;
        const u = Math.max(0, Math.min(1, ((x - x0) * ex + (y - y0) * ey) / (ex * ex + ey * ey || 1)));
        best = Math.min(best, Math.hypot(x - x0 - u * ex, y - y0 - u * ey));
      }
      return best;
    };
    const worst = Math.max(...pts.map(([x, y]) => dist(x, y))) / px;
    ok(`${name}: the traced edge lies within 1 px of the theory curve the overlay draws`, worst < 1, `worst ${worst.toFixed(2)} px over ${pts.length} points`);
  }
}

// the edge is drawn in the telescope view only (ui.js drawOverlay), so the anchors trace it only when asked: the
// other views' anchors cost what they did
{
  const st = new Store();
  const an = anchors({ view: st.view(), aspect: 1.6 });
  ok('the anchors trace no edge unless asked', an.edge === null, an.edge ? `${an.edge.rays} rays` : 'none');
}

// a ray that ran out of steps is not inside the shadow: kerr.js traceRay calls it captured, and near the photon
// orbit at the camera's floor such rays sat on the edge (2026-11-18)
{
  const st = new Store();
  const view = st.view(), res = K.traceRay(view.a, camFor(view), 0.3, 0.3, 1, { ...edgeOpts(view), maxSteps: 4 });
  ok('a ray stopped after 4 steps is called captured by the tracer and is not inside the shadow', res.fate === 'captured' && res.maxed === true && inShadow(res) === false, JSON.stringify({ fate: res.fate, maxed: res.maxed }));
}

// the shading shader no longer draws the edge per texel (a check on the source: the test above holds the new line)
const shade = S.shadeProgram();
// nor the ISCO's line: on the black's rim it sat on the same boundary as the edge, in nearly the same blue, and
// was the other half of the staircase (2026-11-18)
ok('the shading shader has no per-texel ISCO line', !/uRin\) < dr/.test(shade), 'searched for the old test');
ok('the shading shader has no per-texel shadow edge', !/capx|LAB\.edge|atan\(rel\.y/.test(shade) && !/0\.6200, 0\.7000, 0\.8400/.test(shade), 'searched for the old test and its colour');

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
