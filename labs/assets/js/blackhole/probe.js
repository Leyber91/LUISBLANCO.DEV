/* ============================================================
   blackhole/probe.js — CPU ray tracing jobs with the same engine
   (kerr.js) the GPU shader mirrors. Pure functions: worker.js runs
   them off the main thread; the page runs the first one inline.
     anchors   a coarse ray grid over the current view: where the
               shadow, the approaching limb, the n = 1 ring and the
               ISCO edge sit on screen (for callouts and labels), and
               the disk's observed spectrum
     subrings  widths of the n = 1, 2, 3 images, face-on
     shadow    far-observer shadow chords by bisection
     probeRay  the one ray under a clicked pixel, traced in the view
               the renderer traces (charge q included)
   Every job takes the view from Store.view(), the object the
   renderer's geometry is built from, so the charge cannot drop out.
   ============================================================ */

import * as K from './kerr.js';
import { tanHalfV, ringGamma } from './physics.js';

const H_ = 6.62607015e-34, KB = 1.380649e-23, C = 299792458;
const planckNu = (nu, T) => {
  const x = H_ * nu / (KB * T);
  if (x > 600) return 0;
  return 2 * H_ * nu ** 3 / (C * C) / Math.expm1(x);
};

export function camFor(v) {
  const pos = K.ksPosition(v.a, v.rcam, v.incl * Math.PI / 180, 0);
  return K.observerFrame(v.a, pos, { q: v.q || 0, observer: v.observer, tilt: (v.tilt || 0) * Math.PI / 180 });
}

/** A key for a traced view: two views with the same key send the same rays through the same
 *  spacetime, so features sit at the same tangent-plane coordinates (the screen's aspect only
 *  changes how far the grid reaches, not where a feature is). Rounded so easing noise in the
 *  last digits does not count. */
export function viewKey(v) {
  return [v.a, v.q || 0, v.incl, v.rcam, v.fov, v.tilt || 0, v.rout].map((x) => (+x).toFixed(4))
    .concat([v.observer, v.emit]).join('|');
}

/** The anchors, only when they were traced for the view the state is in now (the target
 *  of any transition); otherwise null, so no caption or label quotes a previous view. */
export function liveAnchors(an, liveView) {
  return an && an.key === viewKey(liveView) ? an : null;
}

/** CSS pixel (px, py) on a W x H canvas -> tangent-plane screen coordinates, the mapping
 *  the renderer's _screenMap gives the shader (y up, fov on the shorter axis). */
export function screenToTangent(px, py, W, H, fov) {
  const asp = W / H, th = tanHalfV(fov, asp);
  return { sx: ((px / W) * 2 - 1) * th * asp, sy: (1 - (py / H) * 2) * th, th };
}
/** The inverse: the CSS pixel of a place on the image plane, on a W x H canvas. A stored ray opens by its place,
 *  which is the same ray at any window size (review_s3b E); the pixel may fall outside a narrower window. */
export function tangentToScreen(sx, sy, W, H, fov) {
  const asp = W / H, th = tanHalfV(fov, asp);
  return { px: (sx / (th * asp) + 1) / 2 * W, py: (1 - sy / th) / 2 * H };
}

/** The probe: the ray under one pixel, traced with the view's spin, charge, camera and disk,
 *  exactly as the renderer's geometry sets them (horizon and ISCO of Kerr-Newman). */
export function probeRay(view, sx, sy, { k = 0.06, maxSteps = 3000 } = {}) {
  const q = view.q || 0;
  const rIn = K.isco(view.a, 1, q);
  const res = K.traceRay(view.a, camFor(view), sx, sy, 1, { q, k, maxSteps, disk: view.emit === 'thick', rIn, rOut: view.rout, path: true });
  return { ...res, rIn, q };
}

export function anchors({ view, aspect, nx = 72, ny = 44, tpeakK = 0, fcol = 1.7, edge: withEdge = false }) {
  const key = viewKey(view);
  const a = view.a, q = view.q || 0;
  const cam = camFor(view);
  const th = tanHalfV(view.fov, aspect);
  const rIn = K.isco(a, 1, q), rOut = view.rout;
  const disk = view.emit === 'thick';
  const opts = { q, k: 0.1, maxSteps: 900, disk, rIn, rOut };
  const cells = [];
  let capMinX = Infinity, capMaxX = -Infinity, capMinY = Infinity, capMaxY = -Infinity, nCap = 0;
  let limb = null, ring = null, isco = null;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const sx = ((i + 0.5) / nx * 2 - 1) * th * aspect, sy = ((j + 0.5) / ny * 2 - 1) * th;
      const res = K.traceRay(a, cam, sx, sy, 1, opts);
      const c = { sx, sy, fate: res.fate };
      if (res.fate === 'captured') {
        nCap++; capMinX = Math.min(capMinX, sx); capMaxX = Math.max(capMaxX, sx); capMinY = Math.min(capMinY, sy); capMaxY = Math.max(capMaxY, sy);
      } else if (res.fate === 'disk') {
        const h = res.hits[0];
        c.r = h.r; c.n = h.n; c.g = res.g;
        if (h.n === 0 && (!limb || res.g > limb.g)) limb = { sx, sy, g: res.g, r: h.r };
        if (h.n === 1 && (!ring || sy > ring.sy)) ring = { sx, sy, r: h.r, g: res.g };
        if (h.n === 0 && h.r < rIn * 1.25 && (!isco || sy > isco.sy)) isco = { sx, sy, r: h.r };
      }
      cells.push(c);
    }
  }
  // refine the shadow box along its centre lines
  let shadow = null, edge = null;
  if (nCap) {
    const cx = 0.5 * (capMinX + capMaxX), cy = 0.5 * (capMinY + capMaxY);
    const bis = (dirOf, tIn, tOut) => K.bisectEdge(a, cam, dirOf, tIn, tOut, 14, 0.1, q);
    const left = bis((t) => [t, cy, 1], cx, capMinX - 2 * th / nx * aspect);
    const right = bis((t) => [t, cy, 1], cx, capMaxX + 2 * th / nx * aspect);
    const top = bis((t) => [cx, t, 1], cy, capMaxY + 2 * th / ny);
    const bot = bis((t) => [cx, t, 1], cy, capMinY - 2 * th / ny);
    shadow = { cx, cy, left, right, top, bot };
    if (withEdge) edge = outline({ a, cam, opts: edgeOpts(view), X: th * aspect, Y: th, cx, cy, r0: right - cx });
    // the n = 1 ring is thinner than a grid cell: search the column above the shadow finely
    const span = Math.max(0.02, (top - cy) * 0.35);
    for (let k = 0; k < 220; k++) {
      const sy = top + span * (k + 0.5) / 220;
      const res = K.traceRay(a, cam, cx, sy, 1, opts);
      if (res.fate === 'disk' && res.hits[0].n === 1) { ring = { sx: cx, sy, r: res.hits[0].r, g: res.g }; break; }
    }
  }
  // observed spectrum of the visible disk: nu F_nu summed over the grid (equal solid angle cells)
  let spectrum = null;
  if (disk && tpeakK > 0) {
    const tab = K.ntFluxTable(a, rOut, 256, q);
    const prof = K.temperatureProfile(tab, 256);
    const Tof = (r) => {
      const u = Math.sqrt(Math.max(0, Math.min(1, (r - tab.rIn) / (tab.rOut - tab.rIn))));
      const x = u * 255, i0 = Math.floor(x), t = x - i0;
      return prof[i0] + (prof[Math.min(255, i0 + 1)] - prof[i0]) * t;
    };
    const nus = [], out = [];
    for (let k = 0; k < 80; k++) nus.push(Math.pow(10, 12 + k * (8.5 / 79)));
    for (const nu of nus) {
      let s = 0;
      for (const c of cells) {
        if (c.fate !== 'disk') continue;
        const T = Tof(c.r) * tpeakK;
        if (T <= 0) continue;
        // I_nu,obs = g^3 I_nu,em(nu/g); I_em = f^-4 B_nu(f T) (colour-corrected blackbody)
        s += c.g ** 3 * planckNu(nu / c.g, fcol * T) / fcol ** 4;
      }
      out.push(nu * s);
    }
    const mx = Math.max(...out, 1e-300);
    spectrum = nus.map((nu, k) => [nu * H_ / 1.602176634e-19, out[k] / mx]);   // [eV, normalised nu F_nu]
  }
  const g = cells.filter((c) => c.fate === 'disk').map((c) => c.g);
  return {
    key, shadow, edge, edgeTraced: withEdge, limb, ring, isco, spectrum, th, aspect,
    gmin: g.length ? Math.min(...g) : null, gmax: g.length ? Math.max(...g) : null,
    grid: { nx, ny, fates: cells.map((c) => (c.fate === 'captured' ? -1 : c.fate === 'disk' ? c.n : -2)) },
  };
}

/** How many directions the traced edge is found in: 3 deg apart, so on the telescope view's shadow at 1440 px the
 *  ticks stand 11.3 to 11.6 px apart (edge.test.mjs holds them between 9 and 16 px). */
export const OUTLINE_N = 120;

/** The rays the traced edge is found with: the disk switched off, as kerr.js bisectEdge and the renderer's
 *  measureStrip measure the shadow (unlike bisectEdge, a ray that ran out of steps is not counted inside: inShadow),
 *  at a finer step than the anchors' grid (0.08 against 0.1, 2400 steps). With the disk on, the outermost black
 *  edge jumped between the shadow above the disk and a sliver below it (edge.test.mjs, 2026-11-18). */
export function edgeOpts(view) {
  return { q: view.q || 0, k: 0.08, maxSteps: 2400 };
}
/** A ray inside the shadow: captured, and not one that ran out of steps (kerr.js traceRay counts those captured). */
export const inShadow = (res) => res.fate === 'captured' && !res.maxed;

/** The shadow's edge, for the telescope view's ticks on the theory curve (ui.js drawOverlay). Along OUTLINE_N directions from (cx, cy), a point inside the
 *  shadow, it brackets the change of fate near the radius the previous direction found (captured inside, not
 *  outside), widening the bracket until it holds, and bisects it 10 times (to a thousandth of the bracket). A
 *  direction gives no point where the edge lies beyond the screen (the shadow runs off the frame) or no bracket is
 *  found, and the line breaks there.
 *  Returns the runs of [sx, sy, direction] in direction order (closed when every direction gave a point), the rays
 *  traced and the centre the directions start from. */
export function outline({ a, cam, opts, X, Y, cx, cy, r0, n = OUTLINE_N, iters = 10 }) {
  const trace = (x, y) => inShadow(K.traceRay(a, cam, x, y, 1, opts));
  if (!(r0 > 0) || !trace(cx, cy)) return null;
  let rays = 1, r = r0;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const psi = 2 * Math.PI * k / n, dx = Math.cos(psi), dy = Math.sin(psi);
    const cap = (t) => { rays++; return trace(cx + t * dx, cy + t * dy); };
    // how far this direction runs on the screen
    const tMax = Math.min(dx ? (Math.sign(dx) * X - cx) / dx : Infinity, dy ? (Math.sign(dy) * Y - cy) / dy : Infinity);
    let pt = null;
    if (tMax > 0) {
      let lo = Math.min(0.9 * r, 0.9 * tMax), hi = Math.min(1.1 * r, tMax), inLo = cap(lo), inHi = cap(hi);
      for (let s = 0; !inLo && s < 8; s++) { hi = lo; inHi = false; lo *= 0.6; inLo = cap(lo); }
      for (let s = 0; inLo && inHi && hi < tMax && s < 12; s++) { lo = hi; hi = Math.min(1.3 * hi, tMax); inHi = cap(hi); }
      if (inLo && !inHi) {
        for (let s = 0; s < iters; s++) { const m = 0.5 * (lo + hi); if (cap(m)) lo = m; else hi = m; }
        r = 0.5 * (lo + hi);
        // only a point on the screen: from a centre off it, a direction runs off the screen before it enters
        const x = cx + r * dx, y = cy + r * dy;
        if (Math.abs(x) <= X && Math.abs(y) <= Y) pt = [x, y, k];
      }
    }
    pts.push(pt);
  }
  const runs = [];
  let cur = null;
  for (const p of pts) { if (p) { if (!cur) runs.push(cur = []); cur.push(p); } else cur = null; }
  const closed = pts.every(Boolean);
  // a run that ends at the last direction continues into the one that starts at the first
  if (!closed && runs.length > 1 && pts[0] && pts[n - 1]) runs[0] = runs.pop().concat(runs[0]);
  return { runs, closed, n, rays, cx, cy };
}

/** The traced edge's ticks on the screen: from the runs of points [x, y, direction] in screen px, the centre (ox, oy)
 *  in px and whether the line is closed, short marks across the line, 8 px long. A tick stands at every direction
 *  that is a multiple of the spacing, the smallest that keeps every tick at least gap px from the next, measured on
 *  the screen and on a closed line where its last tick meets its first (a spacing estimated from a mean radius
 *  doubled a tick there, 1.2 px apart, review_edge N1).
 *  Returns [[x0, y0, x1, y1, xc, yc], ...]. */
export function ticksOf(runs, ox, oy, n, closed, gap = 9) {
  if (!runs.flat().length) return [];
  const keep = (every) => runs.flat().filter((p) => p[2] % every === 0);
  const close = (kept) => {
    for (let i = 1; i < kept.length; i++) if (Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][1] - kept[i - 1][1]) < gap) return true;
    const [f, l] = [kept[0], kept[kept.length - 1]];
    return closed && kept.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) < gap;
  };
  let kept = keep(n);
  for (let every = 1; every <= n; every++) {
    const k = keep(every);
    if (k.length && !close(k)) { kept = k; break; }
  }
  return kept.map(([x, y]) => {
    const d = Math.hypot(x - ox, y - oy) || 1, ux = (x - ox) / d, uy = (y - oy) / d;
    return [x - 4 * ux, y - 4 * uy, x + 4 * ux, y + 4 * uy, x, y];
  });
}

/** Sub-ring widths traced with the charge; the Lyapunov comparison (Johnson et al. 2020)
 *  is the Kerr formula, so it is returned only at q = 0. */
/** The sub-ring measurement's rays: how many, and the annulus of the face-on disk they are aimed at (in M). The
 *  Measure card's note quotes these, so it cannot name another count. */
export const SUBRING = { samples: 2400, r0: 6, r1: 8 };

export function subrings({ a, q = 0 }) {
  const w = K.subringWidths(a, 0.001, SUBRING.r0, SUBRING.r1, { q, samples: SUBRING.samples, k: 0.035 });
  // e^-gamma by the one function every sentence about the sub-rings quotes (physics.js ringGamma)
  const gamma = ringGamma(a, q);
  return { w, gamma, q, rPolar: q ? null : K.polarPhotonOrbit(a) };
}

export function shadow({ a, incl, q = 0 }) {
  return K.measureShadow(a, incl * Math.PI / 180, { q, k: 0.08, iters: 24 });
}

