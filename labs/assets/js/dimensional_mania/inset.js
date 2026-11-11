/* ============================================================
   dimensional_mania/inset.js — the second view, linked to the first.

   Four drawings on a 2D canvas, each computed from the same engine:
     down      the same experiment one dimension down: the tesseract's
               shadow beside the cube's shadow on a plane, a 4D cut beside
               a cube passing through Flatland (Abbott 1884)
     schlegel  the Schlegel diagram: the polytope projected from just
               outside the picked facet onto that facet's hyperplane, so
               the facet is the frame and every other cell sits inside it
     base      for the Hopf fibres: the base 2-sphere, one point per fibre;
               dragging the gold point moves its fibre in the main view
     net       for the Clifford torus: its flat square net, opposite sides glued
   ============================================================ */

import { build } from './polytopes.js';
import { slice, turn } from './slice.js';
import { projectAll } from './project.js';
import { eye, alignRotation, leftGivens, orthonormalize } from './linalg.js';
import { HOPF_RINGS, hopfBase } from './polytopes.js';
import { PALETTE, AXES } from './constants.js';

const C = PALETTE.css;

/** the object one dimension down, and why it is the analogue */
export function downOf(o) {
  const n = o.n;
  if (n <= 1) return null;
  if (o.family === 'simplex' || o.family === 'cube' || o.family === 'cross') {
    const id = n - 1 === 1 ? 'cube' : o.family;
    return { id, n: n - 1, why: 'the same family, one dimension down' };
  }
  const cell = { c24: ['cross', 3, 'its cell, the octahedron'], c600: ['simplex', 3, 'its cell, the tetrahedron'], c120: ['dodeca', 3, 'its cell, the dodecahedron'],
    dodeca: ['p5', 2, 'its face, the pentagon'], icosa: ['simplex', 2, 'its face, the triangle'], p5: ['cube', 1, 'its edge'], p6: ['cube', 1, 'its edge'] }[o.id];
  return cell ? { id: cell[0], n: cell[1], why: cell[2] } : null;
}

/** the direction a cut preset puts on the last axis, for any polytope */
export function cutDirection(o, kind) {
  const n = o.n, V = o.V;
  const mean = (idx) => { const m = new Float64Array(n); for (const v of idx) for (let k = 0; k < n; k++) m[k] += V[v * n + k] / idx.length; return m; };
  if (kind === 'vertex') return V.slice(0, n);
  if (kind === 'edge') return mean([o.edges[0], o.edges[1]]);
  if (kind === 'face' && o.faces2) return mean(o.faces2[0].verts);
  if (kind === 'cell' && o.facets) return mean(o.facets[0]);
  return null;
}

export class SecondView {
  constructor(canvas, app) {
    this.cv = canvas;
    this.app = app;
    this.mode = 'down';
    this.probe = { e: 0.2 * Math.PI, x: 0.9, far: false };
    this._down = null;
    this._pointer();
  }

  modesFor(o) {
    if (o.id === 'hopf') return ['base'];
    if (o.id === 'torus') return ['net'];
    const m = [];
    if (o.n >= 2) m.push('down');
    if (o.n >= 3 && o.facets) m.push('schlegel');
    return m;
  }

  _pointer() {
    let drag = false;
    const at = (ev) => {
      const r = this.cv.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2, R = Math.min(r.width, r.height) * 0.42;
      let x = (ev.clientX - r.left - cx) / R, y = -(ev.clientY - r.top - cy) / R;
      const len = Math.hypot(x, y);
      if (len > 0.999) { x /= len / 0.999; y /= len / 0.999; }
      const polar = Math.asin(Math.min(1, Math.hypot(x, y)));
      this.probe.e = (this.probe.far ? Math.PI - polar : polar) / 2;
      this.probe.x = Math.atan2(y, x);
      this.app.probeMoved();
    };
    this.cv.addEventListener('pointerdown', (ev) => { if (this.mode !== 'base') return; drag = true; this.cv.setPointerCapture(ev.pointerId); at(ev); });
    this.cv.addEventListener('pointermove', (ev) => { if (drag) at(ev); });
    const up = () => { drag = false; };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
  }

  _ctx() {
    const W = Math.max(200, Math.floor(this.cv.parentElement.clientWidth - 24));
    const H = 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv._w !== W || this.cv._d !== dpr) {
      this.cv.width = W * dpr; this.cv.height = H * dpr;
      this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
      this.cv._w = W; this.cv._d = dpr;
    }
    const g = this.cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    return { g, W, H };
  }

  /** draw a set of n-vectors as 2D: perspective down to `to` dims, then an oblique view of up to 3 */
  _flat(P, n, count, yaw) {
    const out = new Float32Array(count * 2);
    const tilt = 0.42, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < count; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (n <= 2) { out[i * 2] = x; out[i * 2 + 1] = y; continue; }
      const xr = x * cy - z * sy, zr = x * sy + z * cy;
      out[i * 2] = xr; out[i * 2 + 1] = y * Math.cos(tilt) - zr * Math.sin(tilt);
    }
    return out;
  }

  draw() {
    const app = this.app, o = app.o;
    const modes = this.modesFor(o);
    if (!modes.includes(this.mode)) this.mode = modes[0] || 'down';
    const { g, W, H } = this._ctx();
    if (this.mode === 'down') this._drawDown(g, W, H);
    else if (this.mode === 'schlegel') this._drawSchlegel(g, W, H);
    else if (this.mode === 'base') this._drawBase(g, W, H);
    else if (this.mode === 'net') this._drawNet(g, W, H);
  }

  _caption(g, W, H, text) {
    g.font = '500 11px "IBM Plex Mono", monospace';
    g.fillStyle = C.dim; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(text, 2, H - 2);
  }

  _segments(g, F, edges, color, width, scale, ox, oy) {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath();
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      g.moveTo(ox + F[a * 2] * scale, oy - F[a * 2 + 1] * scale);
      g.lineTo(ox + F[b * 2] * scale, oy - F[b * 2 + 1] * scale);
    }
    g.stroke();
  }

  _drawDown(g, W, H) {
    const app = this.app, o = app.o, s = app.s, n = s.n;
    const d = downOf(o);
    if (!d) { this._caption(g, W, H, 'nothing below 1D'); return; }
    const od = build(d.id, d.n), nd = d.n;
    // the pose: the same cut preset if one is active, else the top-left block of R
    let R;
    if (app.poseKind && nd >= 2) {
      const dir = cutDirection(od, app.poseKind) || od.V.slice(0, nd);
      R = alignRotation(dir, nd - 1, nd);
      if (nd === 3) leftGivens(R, 3, 0, 1, 0.3);
    } else {
      R = eye(nd);
      for (let i = 0; i < nd; i++) for (let j = 0; j < nd; j++) R[i * nd + j] = app.R[i * n + j];
      orthonormalize(R, nd);
    }
    const X = turn(od, R);
    // its shadow one dimension further down: perspective along its own last axis
    const P = new Float32Array(od.nv * 3);
    const Y = new Float64Array(od.V.length);
    for (let v = 0; v < od.nv; v++) {
      const w = X[v * nd + nd - 1];
      const sc = nd >= 2 ? s.D / Math.max(s.D - w, 0.3) : 1;
      for (let k = 0; k < nd; k++) Y[v * nd + k] = k < nd - 1 ? X[v * nd + k] * sc : 0;
    }
    projectAll(Y, nd, od.nv, 'ortho', s.D, P);
    const flatDim = Math.max(1, nd - 1);
    const yaw = app.stage.camera && app.stage.camera.position ? Math.atan2(app.stage.camera.position.x, app.stage.camera.position.z) : 0;
    const F = this._flat(P, flatDim, od.nv, yaw);
    let r = 0;
    for (let i = 0; i < od.nv; i++) r = Math.max(r, Math.hypot(F[i * 2], F[i * 2 + 1]));
    const scale = (Math.min(W * 0.5, H) * 0.4) / Math.max(r, 1e-6);
    const ox = W * 0.3, oy = H * 0.46;
    // the plane the shadow lands on, as a hairline
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(8, oy + 0.5); g.lineTo(W * 0.58, oy + 0.5); g.stroke();
    const sliceOn = app.sliceOn() && nd >= 2;
    this._segments(g, F, od.edges, sliceOn ? 'rgba(159,179,214,.45)' : 'rgba(197,204,216,.85)', 1, scale, ox, oy);
    // and its cut at the same relative height
    if (sliceOn) {
      let hm = 0, hmo = 0;
      for (let v = 0; v < od.nv; v++) hm = Math.max(hm, Math.abs(X[v * nd + nd - 1]));
      for (let v = 0; v < o.nv; v++) hmo = Math.max(hmo, Math.abs(app.X[v * n + n - 1]));
      const h = hmo > 1e-9 ? (s.h / hmo) * hm : 0;
      const c = slice(od, X, h);
      if (c.np) {
        const Pc = new Float32Array(c.np * 3), Yc = new Float64Array(c.pts.length);
        for (let i = 0; i < c.np; i++) {
          const w = c.pts[i * nd + nd - 1], sc = s.D / Math.max(s.D - w, 0.3);
          for (let k = 0; k < nd; k++) Yc[i * nd + k] = k < nd - 1 ? c.pts[i * nd + k] * sc : 0;
        }
        projectAll(Yc, nd, c.np, 'ortho', s.D, Pc);
        const Fc = this._flat(Pc, flatDim, c.np, yaw);
        this._segments(g, Fc, c.edges, C.goldSoft, 1.6, scale, ox, oy);
        g.fillStyle = C.goldSoft;
        for (let i = 0; i < c.np; i++) { g.beginPath(); g.arc(ox + Fc[i * 2] * scale, oy - Fc[i * 2 + 1] * scale, 1.8, 0, 6.3); g.fill(); }
        // the cut as the creature below sees it: true shape, laid flat on the right
        const Ft = new Float32Array(c.np * 2);
        let rr = 0;
        for (let i = 0; i < c.np; i++) { Ft[i * 2] = c.pts[i * nd]; Ft[i * 2 + 1] = nd >= 3 ? c.pts[i * nd + 1] : 0; rr = Math.max(rr, Math.hypot(Ft[i * 2], Ft[i * 2 + 1])); }
        const sc2 = (Math.min(W * 0.3, H) * 0.36) / Math.max(rr, 0.35);
        this._segments(g, Ft, c.edges, C.gold, 1.4, sc2, W * 0.8, oy);
        g.font = '500 11px "IBM Plex Mono", monospace'; g.fillStyle = C.dim; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(nd === 3 ? 'what Flatland sees' : nd === 2 ? 'what Lineland sees' : 'the cut', W * 0.8, 6);
        g.fillStyle = C.goldSoft; g.textBaseline = 'bottom';
        g.fillText(c.name, W * 0.8, H - 16);
      }
    }
    const what = nd === 3 ? 'a cube’s shadow on a plane' : nd === 2 ? 'a square’s shadow on a line' : nd === 1 ? 'a segment' : `the ${od.name}’s shadow`;
    this._caption(g, W, H, d.why.startsWith('the same family') ? `one down: ${what}` : `one down: ${d.why}`);
  }

  _drawSchlegel(g, W, H) {
    const app = this.app, o = app.o, n = o.n;
    const fi = Math.min(app.facetIdx || 0, o.facets.length - 1);
    const f = o.facets[fi];
    const c = new Float64Array(n);
    for (const v of f) for (let k = 0; k < n; k++) c[k] += o.V[v * n + k] / f.length;
    const d = Math.hypot(...c);
    const u = c.map((x) => x / d);
    const eye = d * 1.12;
    // an orthonormal basis of the facet's hyperplane
    const basis = [];
    for (let a = 0; a < n && basis.length < n - 1; a++) {
      const b = new Float64Array(n); b[a] = 1;
      let p = 0; for (let k = 0; k < n; k++) p += b[k] * u[k];
      for (let k = 0; k < n; k++) b[k] -= p * u[k];
      for (const q of basis) { let t = 0; for (let k = 0; k < n; k++) t += b[k] * q[k]; for (let k = 0; k < n; k++) b[k] -= t * q[k]; }
      const l = Math.hypot(...b);
      if (l > 1e-6) basis.push(b.map((x) => x / l));
    }
    const m = n - 1;
    const Q = new Float64Array(o.nv * m);
    for (let v = 0; v < o.nv; v++) {
      let ux = 0; for (let k = 0; k < n; k++) ux += u[k] * o.V[v * n + k];
      const t = (d - eye) / (ux - eye);
      const y = new Float64Array(n);
      for (let k = 0; k < n; k++) y[k] = eye * u[k] + t * (o.V[v * n + k] - eye * u[k]);
      for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < n; k++) s += basis[j][k] * y[k]; Q[v * m + j] = s; }
    }
    const P = new Float32Array(o.nv * 3);
    projectAll(Q, m, o.nv, 'ortho', 2.4, P);
    const yaw = app.stage.camera && app.stage.camera.position ? Math.atan2(app.stage.camera.position.x, app.stage.camera.position.z) : 0;
    const F = this._flat(P, m, o.nv, yaw + 0.3);
    let r = 0;
    for (let i = 0; i < o.nv; i++) r = Math.max(r, Math.hypot(F[i * 2], F[i * 2 + 1]));
    const scale = (Math.min(W, H) * 0.44) / Math.max(r, 1e-6);
    const ox = W / 2, oy = H * 0.47;
    const inF = new Set(f);
    const rest = [], frame = [];
    for (let e = 0; e < o.ne; e++) {
      const a = o.edges[2 * e], b = o.edges[2 * e + 1];
      (inF.has(a) && inF.has(b) ? frame : rest).push(a, b);
    }
    this._segments(g, F, rest, 'rgba(159,179,214,.6)', 0.8, scale, ox, oy);
    this._segments(g, F, frame, C.goldSoft, 1.5, scale, ox, oy);
    if (app.pick != null && app.pick < o.nv) {
      g.fillStyle = C.gold; g.beginPath(); g.arc(ox + F[app.pick * 2] * scale, oy - F[app.pick * 2 + 1] * scale, 3, 0, 6.3); g.fill();
    }
    const cellName = n === 4 ? 'cell' : n === 3 ? 'face' : 'facet';
    this._caption(g, W, H, `Schlegel diagram from ${cellName} ${fi + 1} of ${o.facets.length} (gold frame)`);
  }

  _drawBase(g, W, H) {
    const app = this.app, o = app.o;
    const cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) * 0.42;
    g.strokeStyle = C.lineB; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.stroke();
    // latitude rings: a fibre ring at e sits at polar angle 2e; the far side is dashed
    const ringK = [1, 0.9, 0.72, 0.55];
    HOPF_RINGS.forEach((rg, i) => {
      const r = Math.sin(2 * rg.e) * R;
      const far = 2 * rg.e > Math.PI / 2;
      g.setLineDash(far ? [2, 3] : []);
      g.strokeStyle = `rgba(159,179,214,${0.25 * ringK[i]})`;
      g.beginPath(); g.arc(cx, cy, Math.max(0.5, r), 0, 6.3); g.stroke();
    });
    g.setLineDash([]);
    const [A, B] = app._hopfPair();
    for (const f of o.fibres) {
      const p = hopfBase(f.e, f.x);
      const far = p[2] < 0;
      const hot = f === A || f === B;
      g.fillStyle = hot ? (f === A ? C.goldSoft : C.gold) : `rgba(197,204,216,${(far ? 0.35 : 0.9) * ringK[f.ring]})`;
      g.beginPath(); g.arc(cx + p[0] * R, cy - p[1] * R, hot ? 3.2 : 2, 0, 6.3); g.fill();
    }
    const pr = hopfBase(this.probe.e, this.probe.x);
    g.strokeStyle = C.goldSoft; g.lineWidth = 1.4;
    g.beginPath(); g.arc(cx + pr[0] * R, cy - pr[1] * R, 6, 0, 6.3); g.stroke();
    g.fillStyle = C.goldSoft; g.beginPath(); g.arc(cx + pr[0] * R, cy - pr[1] * R, 2.4, 0, 6.3); g.fill();
    this._caption(g, W, H, `base 2-sphere, ${this.probe.far ? 'far' : 'near'} side up: drag the ring`);
  }

  _drawNet(g, W, H) {
    const app = this.app, o = app.o;
    const M = o.grid, side = Math.min(W, H) * 0.78, x0 = (W - side) / 2, y0 = (H - side) / 2 - 6;
    g.strokeStyle = 'rgba(159,179,214,.28)'; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= M; i++) {
      const t = (i / M) * side;
      g.moveTo(x0 + t, y0); g.lineTo(x0 + t, y0 + side);
      g.moveTo(x0, y0 + t); g.lineTo(x0 + side, y0 + t);
    }
    g.stroke();
    g.strokeStyle = C.gold; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + side, y0); g.moveTo(x0, y0 + side); g.lineTo(x0 + side, y0 + side); g.stroke();
    g.strokeStyle = C.horizon;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 + side); g.moveTo(x0 + side, y0); g.lineTo(x0 + side, y0 + side); g.stroke();
    this._caption(g, W, H, `flat net: ${M} × ${M} squares, gold edges glued, blue edges glued`);
  }
}

export const axisName = (k) => AXES[k];
