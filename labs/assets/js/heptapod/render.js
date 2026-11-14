/* ============================================================
   heptapod/render.js — drawing semagrams on a display canvas.

   Strokes come from geometry.specStrokes(), each point carrying
   the moment it is reached in the simultaneous drawing (ts) and in
   the sequential one (tq). A frame at progress p draws every piece
   of every stroke whose moment has come; in the simultaneous order
   that is many fronts at once, in the sequential order one pen.
   Ink is the token ladder's luminous white; gold marks only what
   is active (the role under the pointer, the reader's head).
   ============================================================ */

import { GEOM } from './config.js';
import { cellCenters, specBounds } from './geometry.js';

const D2R = Math.PI / 180;

const cssVar = (n, fb) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch { return fb; }
};
let PAL = null;
export function palette() {
  if (PAL) return PAL;
  PAL = {
    void: cssVar('--void', '#06080D'), surface: cssVar('--surface', '#0B0E13'),
    ink: cssVar('--text-bright', '#EAF0FB'), text: cssVar('--text', '#C5CCD8'), dim: cssVar('--text-dim', '#79828F'),
    faint: cssVar('--text-faint', '#424B57'), line: cssVar('--line', '#1C232F'), lineB: cssVar('--line-bright', '#2C3744'),
    gold: cssVar('--accretion', '#D4A24C'), goldSoft: cssVar('--accretion-soft', '#F0C674'), goldDim: cssVar('--accretion-dim', '#97681F'),
    horizon: cssVar('--horizon', '#9FB3D6'), horizonDim: cssVar('--horizon-dim', '#565D72'),
  };
  return PAL;
}

export const prefersReduced = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still\b/.test(location.search); } catch { return false; }
};

/** The device pixel ratio, capped: small canvases drawn off screen use the same cap as the ones on it. */
export const cappedDpr = (max = 2) => Math.min(globalThis.devicePixelRatio || 1, max);

/** Size a canvas to its CSS box at a capped device pixel ratio. */
export function fitCanvas(cv, maxDpr = 2) {
  const dpr = cappedDpr(maxDpr);
  const r = cv.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w, h, dpr, cssW: r.width, cssH: r.height };
}

/** A transform that fits frame-unit bounds into a w x h canvas with padding. */
export function fitXf(bounds, w, h, pad = 0.04) {
  const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
  const s = Math.min(w * (1 - 2 * pad) / bw, h * (1 - 2 * pad) / bh);
  return { s, ox: w / 2 - s * (bounds.x0 + bw / 2), oy: h / 2 - s * (bounds.y0 + bh / 2) };
}

const smooth = (t) => t * t * (3 - 2 * t);

/* Fill one brush stroke: the outline of a centre line whose width varies point by point
   (left edge forward, right edge back, round ends). pts: [[x, y, w], ...] in px. */
function fillStroke(ctx, pts) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const h = pts[i][2] / 2;
    L.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
    R.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  const e = pts[n - 1], s = pts[0];
  const ae = Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]);
  ctx.arc(e[0], e[1], e[2] / 2, ae, ae - Math.PI, true);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  const as = Math.atan2(R[0][1] - s[1], R[0][0] - s[0]);
  ctx.arc(s[0], s[1], s[2] / 2, as, as - Math.PI, true);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw ink as filled brush outlines. opts: p (0..1 progress), order ('ts' | 'tq'),
 * gold (role -> bool), widthScale, color, goldColor, minW (px).
 */
export function drawInk(ctx, ink, xf, opts = {}) {
  const P = palette();
  const p = opts.p ?? 1;
  const ti = opts.order === 'tq' ? 4 : 3;
  const ws = (opts.widthScale ?? 1) * (opts.order === 'tq' ? 1 : 0.55 + 0.45 * smooth(Math.min(1, p * 1.15)));
  const minW = opts.minW ?? 0.7;
  const goldOf = opts.gold || (() => false);
  const X = (x) => xf.ox + xf.s * x, Y = (y) => xf.oy + xf.s * y;
  // erode (frame units) thins every stroke by the same width, so the lightest parts go first and the
  // line breaks where nothing is left; without it a stroke never draws thinner than minW
  const er = opts.erode || 0;
  const GONE = 0.3;
  const W = (w) => (er > 0 ? Math.max(GONE, (w - er) * xf.s * ws) : Math.max(minW, w * xf.s * ws));
  for (const st of ink.strokes) {
    const a = st.alpha ?? 1;
    if (a <= 0.01) continue;
    ctx.fillStyle = goldOf(st.role) ? (opts.goldColor || P.goldSoft) : (opts.color || P.ink);
    ctx.globalAlpha = Math.min(1, a) * (opts.alpha ?? 1);
    const pts = st.pts;
    let run = [];
    const close = () => { if (run.length > 1) fillStroke(ctx, run); run = []; };
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      const ta = A[ti], tb = B[ti];
      if (ta > p && tb > p) { close(); continue; }
      const pa = [X(A[0]), Y(A[1]), W(A[2])], pb = [X(B[0]), Y(B[1]), W(B[2])];
      if (er > 0 && pa[2] <= GONE && pb[2] <= GONE) { close(); continue; }
      if (ta <= p && tb <= p) {
        if (!run.length) run.push(pa);
        run.push(pb);
      } else if (ta <= p) { // grows from A toward B
        const f = (p - ta) / Math.max(1e-6, tb - ta);
        if (!run.length) run.push(pa);
        run.push([pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, pa[2] + (pb[2] - pa[2]) * f]);
        close();
      } else { // grows from B back toward A
        close();
        const f = (p - tb) / Math.max(1e-6, ta - tb);
        run.push([pb[0] + (pa[0] - pb[0]) * f, pb[1] + (pa[1] - pb[1]) * f, pb[2] + (pa[2] - pb[2]) * f], pb);
      }
    }
    close();
  }
  for (const d of ink.dots) {
    const t = opts.order === 'tq' ? d.tq : d.ts;
    if (t > p || (d.alpha ?? 1) <= 0.01) continue;
    if (er > 0 && d.rad - er / 2 <= 0) continue;
    ctx.globalAlpha = Math.min(1, d.alpha ?? 1) * (opts.alpha ?? 1);
    ctx.fillStyle = goldOf(d.role) ? (opts.goldColor || P.goldSoft) : (opts.color || P.ink);
    ctx.beginPath();
    ctx.arc(X(d.x), Y(d.y), Math.max(0.8, (d.rad - er / 2) * xf.s * Math.min(1, (p - t) * 6 + 0.2)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Ink with a feathered glow: draw sharp ink into a layer, then the layer blurred under itself. */
export class InkLayer {
  constructor() { this.cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; }
  render(target, ink, xf, opts = {}) {
    const ctx = target.getContext('2d');
    const L = this.cv;
    if (L.width !== target.width || L.height !== target.height) { L.width = target.width; L.height = target.height; }
    const lc = L.getContext('2d');
    lc.clearRect(0, 0, L.width, L.height);
    drawInk(lc, ink, xf, opts);
    const glow = opts.glow ?? 1;
    if (glow > 0 && 'filter' in ctx) {
      ctx.save();
      if (glow >= 1) {
        ctx.filter = `blur(${Math.max(1.5, xf.s * 0.012).toFixed(1)}px)`;
        ctx.globalAlpha = 0.7;
        ctx.drawImage(L, 0, 0);
        ctx.filter = `blur(${Math.max(5, xf.s * 0.05).toFixed(1)}px)`;
        ctx.globalAlpha = 0.45;
        ctx.drawImage(L, 0, 0);
        ctx.filter = `blur(${Math.max(14, xf.s * 0.16).toFixed(1)}px)`;
        ctx.globalAlpha = 0.3;
        ctx.drawImage(L, 0, 0);
      } else { // the lite tier: one soft pass
        ctx.filter = `blur(${Math.max(4, xf.s * 0.04).toFixed(1)}px)`;
        ctx.globalAlpha = 0.6;
        ctx.drawImage(L, 0, 0);
      }
      ctx.restore();
    }
    ctx.drawImage(L, 0, 0);
  }
}

const ROLE_NAME = {
  pred: 'predicate', agent: 'agent', patient: 'patient', recipient: 'recipient',
  mood: 'mood', neg: 'negation', evid: 'evidence', aspect: 'aspect',
};
const SHORT = { pred: 'PRED', agent: 'AGT', patient: 'PAT', recipient: 'RCP', mood: 'MOOD', neg: 'NEG', evid: 'EVID', aspect: 'ASP' };

/** Value text for a slot or role, from the proposition. */
export function slotValue(p, k) {
  if (k === 'pred') return p.pred;
  if (k === 'agent' || k === 'patient' || k === 'recipient') {
    const e = p[k];
    if (!e) return '';
    if (e.type === 'prop') return 'clause';
    return e.c + (e.num === 'pl' ? ' (pl)' : '');
  }
  if (k === 'mood') return p.mood === 'indicative' ? '' : p.mood;
  if (k === 'neg') return p.neg ? 'not' : '';
  if (k === 'evid') return p.evid === 'direct' ? '' : p.evid;
  if (k === 'aspect') return p.aspect === 'simple' ? '' : p.aspect;
  return '';
}

/**
 * The quiet schematic around a semagram: reference circles, slot ticks and labels.
 * opts: labels (bool), short (bool), active (role key or null), prefix, alpha.
 */
export function drawGuides(ctx, spec, xf, opts = {}) {
  const P = palette();
  const { cx, cy, rho } = spec.frame;
  const X = (x) => xf.ox + xf.s * x, Y = (y) => xf.oy + xf.s * y;
  const s = xf.s * rho;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.strokeStyle = P.line;
  ctx.lineWidth = 1;
  // reference rings
  ctx.setLineDash([2, 5]);
  for (const r of [1, GEOM.TENDRIL_R + 0.08]) { ctx.beginPath(); ctx.arc(X(cx), Y(cy), s * r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
  // slot boundaries as registration ticks, and labels
  const lay = spec.lay;
  const R1 = 1.5, R2 = 1.58;
  const fs = Math.max(9, Math.min(11.5, s * 0.052));
  ctx.font = `500 ${fs}px 'IBM Plex Mono', ui-monospace, monospace`;
  ctx.textBaseline = 'middle';
  for (const k of lay.keys) {
    const sec = lay.items[k];
    const a = sec.start * D2R;
    ctx.strokeStyle = P.lineB;
    ctx.beginPath();
    ctx.moveTo(X(cx + Math.sin(a) * rho * R1), Y(cy - Math.cos(a) * rho * R1));
    ctx.lineTo(X(cx + Math.sin(a) * rho * (R1 + 0.06)), Y(cy - Math.cos(a) * rho * (R1 + 0.06)));
    ctx.stroke();
    if (sec.role) { // cell ticks
      ctx.strokeStyle = P.line;
      for (const c of cellCenters(sec)) {
        const b = c * D2R;
        ctx.beginPath();
        ctx.moveTo(X(cx + Math.sin(b) * rho * (R1 + 0.01)), Y(cy - Math.cos(b) * rho * (R1 + 0.01)));
        ctx.lineTo(X(cx + Math.sin(b) * rho * (R1 + 0.035)), Y(cy - Math.cos(b) * rho * (R1 + 0.035)));
        ctx.stroke();
      }
    }
    if (!opts.labels) continue;
    const role = (opts.prefix || '') + k;
    const active = opts.active && (opts.active === role || opts.active === (opts.prefix || '') + k);
    const c = sec.center * D2R;
    let lx = X(cx + Math.sin(c) * rho * R2), ly = Y(cy - Math.cos(c) * rho * R2);
    if (opts.nudge) { const q = opts.nudge(cx + Math.sin(c) * rho * R2, cy - Math.cos(c) * rho * R2); lx = X(q[0]); ly = Y(q[1]); }
    const sn = Math.sin(c);
    ctx.textAlign = Math.abs(sn) < 0.25 ? 'center' : sn > 0 ? 'left' : 'right';
    const val = slotValue(spec.prop, k);
    const name = opts.short ? SHORT[k] : ROLE_NAME[k].toUpperCase();
    ctx.fillStyle = active ? P.goldSoft : val ? P.dim : P.faint;
    const yOff = Math.cos(c) > 0.9 ? -fs * 0.4 : Math.cos(c) < -0.9 ? fs * 0.4 : 0;
    if (opts.short || !val) ctx.fillText(name, lx, ly + yOff);
    else {
      ctx.fillText(name, lx, ly + yOff - fs * 0.62);
      ctx.fillStyle = active ? P.goldSoft : P.text;
      ctx.fillText(val, lx, ly + yOff + fs * 0.62);
    }
  }
  ctx.restore();
}

/** Bounds of a spec plus room for labels. */
export function viewBounds(spec, labels = true) {
  const b = specBounds(spec);
  const m = labels ? 0.22 : 0.0;
  return { x0: b.x0 - m, x1: b.x1 + m, y0: b.y0 - m * 0.5, y1: b.y1 + m * 0.5 };
}

/** A tiny gold read-head on the reference circle at angle deg. */
export function drawHead(ctx, spec, xf, deg, alpha = 1) {
  const P = palette();
  const { cx, cy, rho } = spec.frame;
  const a = deg * D2R;
  const X = (r) => xf.ox + xf.s * (cx + Math.sin(a) * rho * r), Y = (r) => xf.oy + xf.s * (cy - Math.cos(a) * rho * r);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = Math.max(1, xf.s * 0.006);
  ctx.shadowColor = P.gold; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(X(1.47), Y(1.47)); ctx.lineTo(X(1.53), Y(1.53)); ctx.stroke();
  ctx.globalAlpha = alpha * 0.35;
  ctx.lineWidth = 1; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(X(0.84), Y(0.84)); ctx.lineTo(X(1.16), Y(1.16)); ctx.stroke();
  ctx.restore();
}
