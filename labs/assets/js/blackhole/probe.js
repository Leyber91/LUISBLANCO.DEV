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

/** The probe: the ray under one pixel, traced with the view's spin, charge, camera and disk,
 *  exactly as the renderer's geometry sets them (horizon and ISCO of Kerr-Newman). */
export function probeRay(view, sx, sy, { k = 0.06, maxSteps = 3000 } = {}) {
  const q = view.q || 0;
  const rIn = K.isco(view.a, 1, q);
  const res = K.traceRay(view.a, camFor(view), sx, sy, 1, { q, k, maxSteps, disk: view.emit === 'thick', rIn, rOut: view.rout, path: true });
  return { ...res, rIn, q };
}

export function anchors({ view, aspect, nx = 72, ny = 44, tpeakK = 0, fcol = 1.7 }) {
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
  let shadow = null;
  if (nCap) {
    const cx = 0.5 * (capMinX + capMaxX), cy = 0.5 * (capMinY + capMaxY);
    const bis = (dirOf, tIn, tOut) => K.bisectEdge(a, cam, dirOf, tIn, tOut, 14, 0.1, q);
    const left = bis((t) => [t, cy, 1], cx, capMinX - 2 * th / nx * aspect);
    const right = bis((t) => [t, cy, 1], cx, capMaxX + 2 * th / nx * aspect);
    const top = bis((t) => [cx, t, 1], cy, capMaxY + 2 * th / ny);
    const bot = bis((t) => [cx, t, 1], cy, capMinY - 2 * th / ny);
    shadow = { cx, cy, left, right, top, bot };
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
    key, shadow, limb, ring, isco, spectrum, th, aspect,
    gmin: g.length ? Math.min(...g) : null, gmax: g.length ? Math.max(...g) : null,
    grid: { nx, ny, fates: cells.map((c) => (c.fate === 'captured' ? -1 : c.fate === 'disk' ? c.n : -2)) },
  };
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

