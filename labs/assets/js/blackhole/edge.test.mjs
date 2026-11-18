/* ============================================================
   blackhole/edge.test.mjs — the traced shadow edge the telescope
   view draws as ticks across the theory curve (probe.js outline,
   ui.js drawOverlay edgeTicks).
   Run:  node labs/assets/js/blackhole/edge.test.mjs
   Exit 0 when every check passes. No dependencies.

   The edge was a per-texel test in the shading shader: drawn on
   the G-buffer's grid, it was a staircase several pixels thick at
   the low tiers, dashed by angle around the screen centre
   (2026-11-18). It is now traced: points where rays change fate,
   found along directions from the shadow's centre. These checks
   hold each point against a converged trace (not against the
   rule that found it), the line's runs and closure against the
   directions that gave points, the outline against the screen,
   and the telescope's edge against the theory curve, at views
   that put the disk across the shadow, take it away, look from
   far away, charge the hole, tilt the camera, run the shadow off
   the frame and fall to the camera's floor.
   ============================================================ */

import * as K from './kerr.js';
import { Store } from './state.js';
import { anchors, edgeOpts, inShadow, camFor, outline } from './probe.js';
import { shadowFor } from './physics.js';
import * as S from './shaders.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

// A converged trace: a step 8 times finer than the edge's and 16 times its budget. Against it the edge's points sat
// within 0.09 px at every view below, and the budgets and charges that put them 7.6 px (900 steps at the camera's
// floor) and 29 px (the charge dropped, Q/M 0.8) away were seen (2026-11-18).
const REF = { k: 0.01, maxSteps: 40000 };
const TOL_PX = 0.5;

// name, the state patch (or a function of the store giving one), what the view must then carry (a patch that did not
// apply once left a "telescope" case in the cinematic view, and its comparison never ran), the screen, whether the
// whole shadow is on it, and whether the theory curve is compared (the telescope view's mapping of the far-observer
// curve holds for a static camera far away without tilt; a tilted or near camera is queued, ROAD 2026-11-18)
const tel = (extra = {}) => (st) => ({ ...st.viewPatch('telescope'), ...extra });
const VIEWS = [
  { name: 'the page as it opens (M87*, i 84, 46 M, disk on)', patch: {}, want: { rcam: 46, incl: 84, emit: 'thick' }, W: 1440, H: 900, whole: true },
  { name: 'the same at 390 px', patch: {}, want: { rcam: 46, incl: 84 }, W: 390, H: 844, whole: true },
  { name: 'no disk', patch: { emit: 'off' }, want: { emit: 'off' }, W: 1440, H: 900, whole: true },
  { name: 'seen from far away (telescope, M87* at 17 deg)', patch: tel(), want: { incl: 17, emit: 'thin', rcam: 1000 }, W: 1440, H: 900, whole: true, theory: true },
  { name: 'the telescope at 390 px', patch: tel(), want: { incl: 17, emit: 'thin', rcam: 1000 }, W: 390, H: 844, whole: true, theory: true },
  { name: 'the telescope, a charged hole (a 0, Q/M 0.8)', patch: tel({ obj: 'custom', a: 0, q: 0.8 }), want: { a: 0, q: 0.8, incl: 17 }, W: 1440, H: 900, whole: true, theory: true },
  { name: 'the telescope, a 0.5 and Q/M 0.5 (no theory curve)', patch: tel({ obj: 'custom', a: 0.5, q: 0.5 }), want: { a: 0.5, q: 0.5 }, W: 1440, H: 900, whole: true },
  { name: 'the telescope tilted 0.3 deg, the shadow cut by the frame', patch: tel({ tilt: 0.3 }), want: { tilt: 0.3 }, W: 1440, H: 900, whole: false },
  { name: 'the telescope at 12 M, fov 40, the shadow cut by the frame', patch: tel({ rcam: 12, fov: 40 }), want: { rcam: 12, fov: 40 }, W: 1440, H: 900, whole: false },
  { name: 'edge-on, the disk across the shadow', patch: { obj: 'custom', a: 0.94, incl: 90 }, want: { incl: 90, a: 0.94 }, W: 1440, H: 900, whole: true },
  { name: 'nearly face-on, a 0.998', patch: { obj: 'custom', a: 0.998, incl: 17 }, want: { incl: 17, a: 0.998 }, W: 1440, H: 900, whole: true },
  { name: 'a faller at the camera floor, 3 M, fov 70', patch: { observer: 'faller', rcam: 3, fov: 70 }, want: { observer: 'faller', rcam: 3, fov: 70 }, W: 1440, H: 900, whole: false },
];

/** The directions that gave points, from the points themselves (each sits on its direction from the edge's centre). */
const directionOf = (e, [x, y]) => ((Math.round(Math.atan2(y - e.cy, x - e.cx) / (2 * Math.PI / e.n)) % e.n) + e.n) % e.n;

/** The runs the placed directions make: maximal blocks of consecutive directions, a block that reaches the last
 *  direction continuing into the one that starts at the first. */
function blocksOf(placed, n) {
  if (placed.every(Boolean)) return 1;
  let b = 0;
  for (let k = 0; k < n; k++) if (placed[k] && !placed[(k + n - 1) % n]) b++;
  return b;
}

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

  // the runs: each one consecutive directions in order, as many as the placed directions make, closed exactly when
  // every direction gave a point
  const placed = new Array(e.n).fill(false);
  let order = 0;
  for (const r of e.runs) {
    r.forEach((p, i) => { placed[directionOf(e, p)] = true; if (i && directionOf(e, p) !== (directionOf(e, r[i - 1]) + 1) % e.n) order++; });
  }
  const nPlaced = placed.filter(Boolean).length;
  ok(`${name}: every run is consecutive directions in order`, order === 0 && nPlaced === pts.length, `${order} steps out of order; ${nPlaced} directions for ${pts.length} points`);
  ok(`${name}: the runs are the blocks the placed directions make, and the line is closed exactly when every direction gave a point`,
    e.runs.length === blocksOf(placed, e.n) && e.closed === (nPlaced === e.n), `${e.runs.length} runs, ${blocksOf(placed, e.n)} blocks, closed ${e.closed}, ${nPlaced} of ${e.n}`);
  if (whole) ok(`${name}: the whole shadow on screen gives a closed line`, e.closed === true, `closed ${e.closed}`);

  const a = view.a, cam = camFor(view), q = view.q || 0;
  const cap = (x, y) => inShadow(K.traceRay(a, cam, x, y, 1, edgeOpts(view)));
  const ref = (x, y) => inShadow(K.traceRay(a, cam, x, y, 1, { q, ...REF }));
  const px = 2 * an.th / H;                                  // one screen pixel in tangent-plane units
  const { cx, cy } = e;
  const unit = (x, y) => { const d = Math.hypot(x - cx, y - cy); return [(x - cx) / d, (y - cy) / d, d]; };

  // every fourth point against the converged trace: the change of fate bisected within 40 px of it, along its direction
  let worst = 0, missed = 0, sampled = 0;
  for (const [x, y] of pts.filter((_, i) => i % 4 === 0)) {
    const [ux, uy, d] = unit(x, y);
    let lo = d - 40 * px, hi = d + 40 * px;
    sampled++;
    if (!ref(cx + lo * ux, cy + lo * uy) || ref(cx + hi * ux, cy + hi * uy)) { missed++; continue; }
    for (let i = 0; i < 16; i++) { const m = 0.5 * (lo + hi); if (ref(cx + m * ux, cy + m * uy)) lo = m; else hi = m; }
    worst = Math.max(worst, Math.abs(0.5 * (lo + hi) - d) / px);
  }
  ok(`${name}: every sampled point is within ${TOL_PX} px of the converged edge`, missed === 0 && worst <= TOL_PX, `worst ${worst.toFixed(2)} px over ${sampled} points, ${missed} with no converged edge within 40 px`);

  // on the screen, and the outline: no ray of the shadow between a point and the screen's edge along its direction
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
  ok(`${name}: the edge is the outline, no ray of the shadow beyond any point toward the screen's edge`, beyond === 0, `${beyond} of ${pts.length}`);

  // each segment between neighbouring points stays on the edge: its midpoint within 3 px of the change of fate
  let chord = 0, chordAt = '';
  const segs = [];
  for (const r of e.runs) for (let i = 0; i + 1 < r.length + (e.closed ? 1 : 0); i++) segs.push([r[i], r[(i + 1) % r.length]]);
  for (const [[x0, y0], [x1, y1]] of segs) {
    const mx = 0.5 * (x0 + x1), my = 0.5 * (y0 + y1), [ux, uy] = unit(mx, my);
    if (!cap(mx - 3 * px * ux, my - 3 * px * uy) || cap(mx + 3 * px * ux, my + 3 * px * uy)) { chord++; chordAt ||= `${mx.toFixed(4)},${my.toFixed(4)}`; }
  }
  ok(`${name}: every segment between neighbouring points stays within 3 px of the edge`, chord === 0, `${chord} of ${segs.length}${chordAt ? ', first at ' + chordAt : ''}`);

  // the cost: the radius found in one direction starts the next, so a direction costs a bracket and 10 bisections
  ok(`${name}: the edge costs at most 13 rays a direction`, e.rays <= 13 * e.n, `${(e.rays / e.n).toFixed(2)} a direction`);

  // seen from far away the overlay draws the theory curve, mapped as ui.js drawOverlay maps it, and the edge's ticks
  // on it: every point within 1 px of the curve
  const th = theory ? shadowFor(view.a, view.incl, q) : null;
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
    const w = Math.max(...pts.map(([x, y]) => dist(x, y))) / px;
    ok(`${name}: the traced edge lies within 1 px of the theory curve the overlay draws`, w < 1, `worst ${w.toFixed(2)} px over ${pts.length} points`);
  }
}

// outline() itself, where the anchors never take it: a centre outside the shadow gives no line; a first radius three
// times too large or five times too small still gives the whole line (the bracket shrinks and widens); a centre off
// the screen gives points on the screen only
{
  const st = new Store();
  const view = st.view(), aspect = 1.6, an = anchors({ view, aspect });
  const base = { a: view.a, cam: camFor(view), opts: edgeOpts(view), X: an.th * aspect, Y: an.th, cx: an.shadow.cx, cy: an.shadow.cy };
  const r = an.shadow.right - an.shadow.cx;
  ok('outline: a centre outside the shadow gives no line', outline({ ...base, cx: 0.9 * base.X, cy: 0.9 * base.Y, r0: r }) === null);
  const big = outline({ ...base, r0: 3 * r }), small = outline({ ...base, r0: 0.2 * r });
  const count = (e) => (e ? e.runs.flat().length : 0);
  ok('outline: a first radius three times too large still gives every direction a point', count(big) === big?.n, `${count(big)}`);
  ok('outline: a first radius five times too small still gives every direction a point', count(small) === small?.n, `${count(small)}`);
  const Xs = 0.5 * Math.abs(base.cx) || 0.01;
  const off = outline({ ...base, X: Xs, r0: r });
  const outside = off ? off.runs.flat().filter(([x, y]) => Math.abs(x) > Xs * (1 + 1e-9) || Math.abs(y) > base.Y * (1 + 1e-9)).length : -1;
  ok('outline: with the centre off the screen every point is on it', outside === 0, `${outside} off, centre x ${base.cx.toFixed(4)} against a half width ${Xs.toFixed(4)}`);
  // and each point lies along its own direction from the centre (a bracket on the far side of the centre would put
  // it in the opposite direction)
  let wrongWay = 0;
  if (off) for (const run of off.runs) run.forEach((p, i) => { if (i && directionOf(off, p) !== (directionOf(off, run[i - 1]) + 1) % off.n) wrongWay++; });
  ok('outline: with the centre off the screen every run is still consecutive directions in order', !!off && off.runs.length > 0 && wrongWay === 0, off ? `${wrongWay} out of order in ${off.runs.flat().length} points` : 'no line');
}

// the edge is drawn in the telescope view only (ui.js drawOverlay), so the anchors trace it only when asked: the
// other views' anchors cost what they did
{
  const st = new Store();
  const an = anchors({ view: st.view(), aspect: 1.6 });
  ok('the anchors trace no edge unless asked', an.edge === null, an.edge ? `${an.edge.rays} rays` : 'none');
}

// a ray that ran out of steps is not inside the shadow: kerr.js traceRay calls it captured, and at the camera's
// floor with 900 steps such rays put the edge 7.6 px off (2026-11-18)
{
  const st = new Store();
  const view = st.view(), res = K.traceRay(view.a, camFor(view), 0.3, 0.3, 1, { ...edgeOpts(view), maxSteps: 4 });
  ok('a ray stopped after 4 steps is called captured by the tracer and is not inside the shadow', res.fate === 'captured' && res.maxed === true && inShadow(res) === false, JSON.stringify({ fate: res.fate, maxed: res.maxed }));
}

// the shading shader draws neither per-texel line on the black's rim any more (a check on the source; the drive's
// EDGE_STEP holds the frame: the same pixels with the notes on and off)
const shade = S.shadeProgram();
ok('the shading shader has no per-texel ISCO line', !/uRin\) < dr/.test(shade), 'searched for the old test');
ok('the shading shader has no per-texel shadow edge', !/capx|LAB\.edge|atan\(rel\.y/.test(shade) && !/0\.6200, 0\.7000, 0\.8400/.test(shade), 'searched for the old test and its colour');

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
