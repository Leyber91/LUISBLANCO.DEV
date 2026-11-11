/* ============================================================
   timeline/view-draw.js — the drawing passes of the branch line.
   Each pass takes the view (geometry, colours, state) and draws
   one layer. Colours come only from tokens.css, read by the view;
   transparency is applied by appending an alpha byte, so no colour
   value is written in this file.

   One label pass for everything: event labels, era names and
   calendar ticks all claim a box in view.boxes and skip if the
   box is taken, so no two labels overlap at any zoom.
   ============================================================ */

import { NOW, WORLDS } from './config.js';
import {
  VIS, byId, ERAS, divergence, rungsOf, parallelOf, causesOf, consequencesOf, charsVisible, worldName,
} from './engine.js';
import { fmtCE, fmtTick, fmtSince, tickStep, intervalOf, fmtDay } from './chronology.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** A token colour with an alpha byte appended. */
export const al = (hex, a) => hex + Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');

/* ---------------- labels without overlap ---------------- */

function claim(v, x, y, w, h, pad = 3) {
  const b = [x - pad, y - pad, x + w + pad, y + h + pad];
  for (const o of v.boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
  v.boxes.push(b);
  return true;
}
function text(v, s, x, y, { size = 10.5, weight = 500, color, align = 'left', force = false } = {}) {
  const { ctx } = v;
  ctx.font = `${weight} ${size}px ${v.font}`;
  const w = ctx.measureText(s).width;
  const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (!force && !claim(v, lx, y - size, w, size + 2)) return false;
  if (force) v.boxes.push([lx - 3, y - size - 3, lx + w + 3, y + 5]);
  ctx.fillStyle = color; ctx.textAlign = 'left';
  ctx.fillText(s, lx, y);
  return true;
}

/* ---------------- frame furniture ---------------- */

export function grid(v) {
  const { ctx, C } = v;
  const step = tickStep(v.span, v.narrow ? 4 : 8);
  ctx.strokeStyle = al(C.lineB, 0.32); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = Math.ceil(v.t0 / step) * step; t <= v.t1; t += step) {
    const x = Math.round(v.x(t)) + 0.5;
    ctx.moveTo(x, v.y.cursorTop + 8); ctx.lineTo(x, v.y.core + 6);
  }
  ctx.stroke();
}

export function future(v) {
  if (v.align) return;
  const { ctx, C } = v;
  const xs = v.x(NOW + 1), xe = v.W - v.padR;
  if (xs >= xe) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(xs, v.y.cursorTop + 6, xe - xs, v.y.core - v.y.cursorTop); ctx.clip();
  ctx.strokeStyle = al(C.hzDim, 0.16); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = xs - 160; x < xe + 160; x += 9) { ctx.moveTo(x, v.y.cursorTop); ctx.lineTo(x + 140, v.y.core + 140); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = al(C.hz, 0.35);
  ctx.beginPath(); ctx.moveTo(Math.round(xs) + 0.5, v.y.cursorTop + 6); ctx.lineTo(Math.round(xs) + 0.5, v.y.core + 6); ctx.stroke();
  if (xe - xs > 130) {
    text(v, 'AFTER THE STORY PRESENT', xs + 10, v.y.cursorTop + 24, { size: 11, color: C.dim });
    text(v, 'held for the books', xs + 10, v.y.cursorTop + 39, { size: 11, color: C.faint });
  }
}

export function substrate(v) {
  const { ctx, C, W } = v;
  const xs = v.padL, xe = W - v.padR, y = v.y;
  ctx.strokeStyle = C.lineB; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xs, Math.round(y.sub) + 0.5); ctx.lineTo(xe, Math.round(y.sub) + 0.5); ctx.stroke();
  // Vortex: chaotic filaments where something lives, flat before about four billion years ago
  const xInh = v.align ? xs : clamp(v.x(-4.0e9), xs, xe);
  const tt = v.time;
  const lines = v.tier === 'minimal' ? 2 : 3, step = v.tier === 'full' ? 3 : 6;
  for (let k = 0; k < lines; k++) {
    ctx.strokeStyle = al(C.hz, 0.12 + 0.07 * k);
    ctx.lineWidth = k === lines - 1 ? 1 : 0.8;
    ctx.beginPath();
    for (let x = xs; x <= xe; x += step) {
      const live = x >= xInh ? clamp((x - xInh) / 30, 0, 1) : 0;
      const n = Math.sin(x * 0.013 + tt * 0.42 + k * 1.7) * 0.5 + Math.sin(x * 0.031 - tt * 0.27 + k * 2.9) * 0.3 + Math.sin(x * 0.077 + tt * 0.63 + k * 4.1) * 0.2;
      const yy = y.vortex + n * 9 * live + (k - 1) * 2.2 * live;
      if (x === xs) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Haven: perfectly still
  ctx.strokeStyle = al(C.hz, 0.36); ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(xs, y.haven - 2); ctx.lineTo(xe, y.haven - 2);
  ctx.moveTo(xs, y.haven + 2); ctx.lineTo(xe, y.haven + 2);
  ctx.stroke();
  // Core: the steady foundation, breathing slowly
  const br = 0.82 + 0.18 * Math.sin(tt * 0.5);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = al(C.bright, 0.05 * br); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(xs, y.core); ctx.lineTo(xe, y.core); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = al(C.bright, 0.58 * br); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(xs, y.core); ctx.lineTo(xe, y.core); ctx.stroke();
}

export function minimap(v) {
  const { ctx, C } = v;
  const yb = v.y.mini, xs = v.padL, xe = v.W - v.padR;
  ctx.strokeStyle = C.lineB; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xs, yb + 0.5); ctx.lineTo(xe, yb + 0.5); ctx.stroke();
  const marks = v.narrow
    ? [[4e9, '4 Ga'], [1e6, '1 Ma'], [1e4, '10 ka'], [100, '100 y'], [1, '1 y']]
    : [[4e9, '4 Ga'], [1e8, '100 Ma'], [1e6, '1 Ma'], [1e5, '100 ka'], [1e4, '10 ka'], [1e3, '1 ka'], [100, '100 y'], [10, '10 y'], [1, '1 y']];
  ctx.strokeStyle = al(C.hzDim, 0.7);
  for (const [L, lab] of marks) {
    const x = v._mx(L);
    ctx.beginPath(); ctx.moveTo(x, yb - 3); ctx.lineTo(x, yb + 3); ctx.stroke();
    text(v, lab, x, yb - 7, { size: 11, color: C.faint, align: 'center', force: true });
  }
  ctx.strokeStyle = al(C.hz, 0.55);
  ctx.beginPath();
  for (const e of VIS) { const x = v._mx(v._L(e.y)); ctx.moveTo(x, yb + 1); ctx.lineTo(x, yb + 5); }
  ctx.stroke();
  if (v.sel && byId.has(v.sel)) { const x = v._mx(v._L(byId.get(v.sel).y)); ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.moveTo(x, yb - 2); ctx.lineTo(x, yb + 7); ctx.stroke(); }
  if (!v.align) {
    const xa = v._mx(v._L(v.t0)), xb = v._mx(v._L(Math.min(v.t1, NOW + 0.99)));
    const a = Math.min(xa, xb), b = Math.max(xa, xb, a + 3);
    ctx.strokeStyle = C.hz; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(a, yb + 8); ctx.lineTo(a, yb + 10); ctx.lineTo(b, yb + 10); ctx.lineTo(b, yb + 8); ctx.stroke();
    const xc = v._mx(v._L(v.cursor));
    ctx.fillStyle = C.goldSoft; ctx.beginPath(); ctx.arc(xc, yb + 0.5, 2, 0, TAU); ctx.fill();
  }
  if (!v.narrow) {
    text(v, 'ALL OF TIME', 14, yb - 6, { size: 11, color: C.faint, force: true });
    text(v, v.align ? 'off while aligned' : 'log lookback', 14, yb + 8, { size: 11, color: C.faint, force: true });
  }
}

export function axis(v) {
  const { ctx, C } = v;
  const step = tickStep(v.span, v.narrow ? 4 : 8);
  const y = v.y.axis;
  ctx.strokeStyle = C.lineB; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(v.padL, y + 0.5); ctx.lineTo(v.W - v.padR, y + 0.5); ctx.stroke();
  ctx.strokeStyle = al(C.hzDim, 0.8);
  let lastX = -1e9;
  ctx.font = `500 11px ${v.font}`;
  for (let t = Math.ceil(v.t0 / step) * step; t <= v.t1 + 1e-9; t += step) {
    const x = v.x(t);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 4); ctx.stroke();
    const lab = v.align ? fmtSince(t) : fmtTick(t, v.span);
    const w = ctx.measureText(lab).width;
    if (x - lastX > w + 12 && x > v.padL + w / 2 - 4 && x < v.W - v.padR - w / 2 + 4) {
      text(v, lab, x, y + 16, { size: 11, color: C.dim, align: 'center', force: true });
      lastX = x;
    }
  }
  if (!v.narrow) text(v, v.align ? 'YEARS SINCE EACH WORLD’S DISCOVERY' : (v.span < 2.5 ? 'EARTH CLOCK, DAYS' : 'EARTH CLOCK'), v.padL, y - 5, { size: 11, color: C.faint, force: true });
}

/* ---------------- the worlds ---------------- */

export function guides(v) {
  const { ctx, C } = v;
  ctx.strokeStyle = al(C.hzDim, 0.3); ctx.lineWidth = 1;
  ctx.setLineDash([1, 5]);
  ctx.beginPath();
  for (const w of WORLDS) {
    if (w.id === 'earth') continue;
    const xe = Math.min(v.W - v.padR, v.tx(w.id, w.found));
    if (xe > v.padL) { ctx.moveTo(v.padL, v.y[w.id]); ctx.lineTo(xe, v.y[w.id]); }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/* The artifacts: threads that hang each world from the Core. */
export function artifacts(v, ign) {
  const { ctx, C } = v;
  v.threadPulse += v.reduced ? 0 : 0.004;
  for (const w of WORLDS) {
    const x = v.tx(w.id, w.found);
    if (x < v.padL - 30 || x > v.W - v.padR + 30) continue;
    const lit = v.cursor + v.wOff(w.id) >= w.found || v.align;
    const fx = (x - v.padL) / (v.plotW + 40);
    const grow = v.ign >= 1 ? 1 : clamp((ign - fx) / 0.12, 0, 1);
    if (grow <= 0) continue;
    const yTop = v.laneY(w.id, w.found), yBot = yTop + (v.y.core - yTop) * grow;
    ctx.strokeStyle = al(C.hz, lit ? 0.55 : 0.22); ctx.lineWidth = 1;
    if (w.id === 'earth' && !lit) ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); ctx.stroke();
    ctx.setLineDash([]);
    if (grow < 1) continue;
    for (const k of ['vortex', 'haven']) {
      ctx.fillStyle = C.void; ctx.strokeStyle = al(C.hz, lit ? 0.7 : 0.3);
      ctx.beginPath(); ctx.arc(x, v.y[k], 2.2, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = al(C.bright, lit ? 0.9 : 0.4);
    ctx.beginPath(); ctx.arc(x, v.y.core, 2.4, 0, TAU); ctx.fill();
    if (lit && !v.reduced && v.tier !== 'minimal') {
      const ph = (v.threadPulse * (w.id === 'kharen' ? 1 : w.id === 'terra' ? 0.83 : 0.69) + (w.id === 'terra' ? 0.4 : w.id === 'earth' ? 0.7 : 0)) % 1;
      const py = v.y.core - (v.y.core - yTop) * ph;
      const g = ctx.createRadialGradient(x, py, 0, x, py, 7);
      g.addColorStop(0, al(C.bright, 0.55 * Math.sin(ph * Math.PI))); g.addColorStop(1, al(C.bright, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, py, 7, 0, TAU); ctx.fill();
    }
    const sel = v.sel && byId.get(v.sel);
    const active = sel && sel.world === w.id && Math.abs(sel.y - w.found) < 1;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = active ? C.gold : al(C.bright, lit ? 0.85 : 0.45);
    ctx.fillStyle = C.void;
    ctx.beginPath(); ctx.arc(x, yTop, 5.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, yTop, 1.6, 0, TAU); ctx.fillStyle = active ? C.gold : al(C.bright, lit ? 0.9 : 0.5); ctx.fill();
  }
}

function pathOf(v, worldId, xs, xe, step) {
  const pts = [], off = v.wOff(worldId);
  for (let x = xs; x < xe; x += step) pts.push([x, v.laneY(worldId, v.tAt(x) + off)]);
  pts.push([xe, v.laneY(worldId, v.tAt(xe) + off)]);
  return pts;
}
function stroke(v, pts, width, color, glow) {
  const { ctx } = v;
  if (pts.length < 2) return;
  const trace = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  if (glow && v.tier !== 'minimal') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = glow; ctx.lineWidth = width + 6; trace(); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; trace(); ctx.stroke();
}

/* Three strands: in step, then each pulls away from its own discovery.
   Lane textures, each generated here from its world's medium:
   - Kha-Ren: a ripple whose amplitude grows with divergence. Medium: sound. Source:
     CODEX/WORLDS/KHA-REN/00_CORE/KHA_REN_GENESIS.md, PREMISE ("Expression-3 of TRIVERSE, the acoustic path")
     and B. FIVE TECHNOLOGY DERIVATION CHAINS.
   - Terra: two hairlines that open as Terra diverges. Medium: thought held in common. Source:
     CODEX/WORLDS/TERRA/OVERVIEW.md, UNIFIED THOUGHT, What It Is.
   - Earth: one plain line, dashed past the present day. Medium: the electromagnetic path, unaltered by its
     artifact. Source: CODEX/WORLDS/KHA-REN/00_CORE/KHA_REN_GENESIS.md, PREMISE ("Earth took the
     electromagnetic path"), and CODEX/WORLDS/EARTH/OVERVIEW.md, IDENTITY (Divergence Status). */
export function strands(v, dt) {
  const { ctx, C } = v;
  const step = v.tier === 'full' ? 2 : 4;
  const today = new Date().getFullYear();
  for (const w of WORLDS) {
    const xs = Math.max(v.padL, v.tx(w.id, -300000));
    const xe = Math.min(v.W - v.padR, v.tx(w.id, NOW + 0.99));
    if (xe <= xs) continue;
    const off = v.wOff(w.id);
    if (w.id === 'earth') {
      const xT = clamp(v.tx('earth', today), xs, xe);
      stroke(v, pathOf(v, 'earth', xs, xT, step), 1.2, al(C.bright, 0.88), al(C.hz, 0.08));
      if (xe > xT) { ctx.setLineDash([5, 4]); stroke(v, pathOf(v, 'earth', xT, xe, step), 1.2, al(C.text, 0.7), null); ctx.setLineDash([]); }
    } else if (w.id === 'terra') {
      const pts = pathOf(v, 'terra', xs, xe, step);
      const o = (p) => 1.5 * divergence('terra', v.tAt(p[0]) + off);
      stroke(v, pts.map((p) => [p[0], p[1] - o(p)]), 0.9, al(C.text, 0.85), al(C.hz, 0.06));
      stroke(v, pts.map((p) => [p[0], p[1] + o(p)]), 0.9, al(C.text, 0.85), null);
    } else {
      stroke(v, pathOf(v, 'kharen', xs, xe, step), 1.05, al(C.text, 0.88), al(C.hz, 0.06));
      ctx.strokeStyle = al(C.hz, 0.5); ctx.lineWidth = 0.8;
      ctx.beginPath();
      const ph = v.time * 2.4;
      for (let x = xs + 4; x < xe; x += 8) {
        const t = v.tAt(x) + off, d = divergence('kharen', t);
        if (d < 0.02) continue;
        const yy = v.laneY('kharen', t);
        const h = 2.8 * d * (0.3 + 0.7 * Math.abs(Math.sin(ph + x * 0.21)));
        ctx.moveTo(x, yy - h); ctx.lineTo(x, yy + h);
      }
      ctx.stroke();
    }
    if (v.reduced || v.tier === 'minimal') continue;
    const n = v.tier === 'full' ? 5 : 2, len = xe - xs, i = WORLDS.indexOf(w);
    if (len < 40) continue;
    for (let k = 0; k < n; k++) {
      const b = v.beads[i][k];
      b.u = (b.u + (34 * dt) / len) % 1;
      const x = xs + b.u * len, yy = v.laneY(w.id, v.tAt(x) + off);
      const a = Math.sin(b.u * Math.PI) * 0.55;
      const g = ctx.createRadialGradient(x, yy, 0, x, yy, 6);
      g.addColorStop(0, al(C.bright, a)); g.addColorStop(1, al(C.bright, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, yy, 6, 0, TAU); ctx.fill();
    }
  }
}

/* People: lifelines inside their lane, when the view is a lifetime or less. */
export function characters(v) {
  if (v.align || v.span > 170) return;
  const { ctx, C } = v;
  const per = { earth: 0, terra: 0, kharen: 0 };
  for (const c of charsVisible()) {
    const i = per[c.world]++;
    const side = c.world === 'terra' ? -1 : 1;
    const dy = side * (22 + i * 3.6);
    const x0 = Math.max(v.padL, v.x(NOW - c.age)), x1 = Math.min(v.W - v.padR, v.x(NOW));
    if (x1 <= x0) continue;
    const y = v.y[c.world] + dy;
    const on = v.follow === c.id;
    ctx.strokeStyle = on ? C.gold : al(C.hz, 0.42); ctx.lineWidth = on ? 1.2 : 0.8;
    ctx.setLineDash(on ? [] : [1, 2]);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = on ? C.gold : al(C.hz, 0.8);
    ctx.beginPath(); ctx.arc(x0, y, 1.8, 0, TAU); ctx.fill();
    for (const e of VIS) if (e.who?.includes(c.id) && !e.id.startsWith('born-')) {
      const x = v.x(e.y);
      if (x >= x0 - 1 && x <= x1 + 1) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
    }
    text(v, c.name, x0 + 4, y + 4, { size: 11, color: on ? C.goldSoft : C.dim });
  }
}

/* ---------------- links ---------------- */

export function links(v) {
  const ev = v.sel && byId.get(v.sel);
  if (!ev) return;
  const { ctx, C } = v;
  const lo = v.padL, hi = v.W - v.padR;
  const P = (e) => evPos(v, e);
  // causes and consequences: thin ink curves with arrowheads
  const edges = [...causesOf(ev.id).map((c) => [c.e, ev]), ...consequencesOf(ev.id).map((c) => [ev, c.e])];
  ctx.lineWidth = 1;
  for (const [a, b] of edges) {
    let [xa, ya] = P(a), [xb, yb] = P(b);
    if ((xa < lo && xb < lo) || (xa > hi && xb > hi)) continue;
    xa = clamp(xa, lo, hi); xb = clamp(xb, lo, hi);
    const cy = Math.min(ya, yb) - 16 - Math.min(40, Math.abs(xb - xa) * 0.15);
    ctx.strokeStyle = al(C.bright, 0.55);
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.quadraticCurveTo((xa + xb) / 2, cy, xb, yb); ctx.stroke();
    const ang = Math.atan2(yb - cy, xb - (xa + xb) / 2);
    ctx.fillStyle = al(C.bright, 0.7);
    ctx.beginPath(); ctx.moveTo(xb, yb); ctx.lineTo(xb - 6 * Math.cos(ang - 0.4), yb - 6 * Math.sin(ang - 0.4)); ctx.lineTo(xb - 6 * Math.cos(ang + 0.4), yb - 6 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
  }
  // same physics, two clocks
  const par = parallelOf(ev);
  if (!par || v.align) return;
  let [xa, ya] = P(ev), [xb, yb] = P(par.other);
  const offA = xa < lo || xa > hi, offB = xb < lo || xb > hi;
  if (offA && offB) return;
  xa = clamp(xa, lo, hi); xb = clamp(xb, lo, hi);
  const top = Math.max(v.y.cursorTop + 26, Math.min(ya, yb) - 34 - Math.abs(xa - xb) * 0.06);
  ctx.strokeStyle = al(C.gold, 0.85);
  ctx.setLineDash([3, 4]); ctx.lineDashOffset = -v.time * 12;
  ctx.beginPath(); ctx.moveTo(xa, ya); ctx.quadraticCurveTo((xa + xb) / 2, top - 20, xb, yb); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  const label = `same physics, ${Math.round(par.gap).toLocaleString('en-US')} years apart${offA || offB ? ' (off screen)' : ''}`;
  ctx.font = `500 11px ${v.font}`;
  const w = ctx.measureText(label).width;
  const lx = clamp((xa + xb) / 2 - w / 2, lo, hi - w);
  ctx.fillStyle = C.void; ctx.fillRect(lx - 4, top - 19, w + 8, 15);
  text(v, label, lx, top - 7, { size: 11, color: C.goldSoft, force: true });
}

/* ---------------- events ---------------- */

export function evPos(v, e) {
  if (e.world === 'vortex' || e.world === 'haven' || e.world === 'core') return [v.x(e.y), v.y[e.world]];
  const w = e.world === 'shared' ? 'earth' : e.world;
  return [v.tx(w, e.y), v.laneY(w, e.y)];
}

export function events(v, labelAlpha) {
  const { ctx, C } = v;
  const xc = v.x(v.cursor);
  const lensHas = (e) => (v.lens ? rungsOf(e).has(v.lens) : true);
  const pulse = 0.5 + 0.5 * Math.sin(v.time * 3.2);
  const vis = VIS.filter((e) => !(v.align && ['vortex', 'haven', 'core', 'shared'].includes(e.world)))
    .map((e) => ({ e, p: evPos(v, e) }))
    .filter(({ p }) => p[0] >= v.padL - 8 && p[0] <= v.W - v.padR + 8);
  const rank = (e) => (e.id === v.sel ? -3 : v.hi.has(e.id) ? -2 : e.id === v.hover ? -1 : 0) * 10 + e.imp;

  // semantic zoom: marks closer than 8 px on one lane merge into a counted cluster
  const lanes = new Map();
  for (const o of vis) { const k = o.e.world === 'shared' ? 'earth' : o.e.world; (lanes.get(k) || lanes.set(k, []).get(k)).push(o); }
  const clusters = [];
  for (const list of lanes.values()) {
    list.sort((a, b) => a.p[0] - b.p[0]);
    let cur = null;
    for (const o of list) {
      if (cur && o.p[0] - cur.xMax < 8) { cur.items.push(o); cur.xMax = o.p[0]; }
      else { cur = { items: [o], xMax: o.p[0] }; clusters.push(cur); }
    }
  }
  for (const cl of clusters) cl.items.sort((a, b) => rank(a.e) - rank(b.e));

  // interval spans behind the marks: explicit codex ranges always, rounded dates when selected
  for (const { e } of vis) {
    if (!(e.y0 != null || e.id === v.sel)) continue;
    const [a, b] = intervalOf(e);
    const off = v.wOff(e.world === 'shared' ? 'earth' : e.world);
    const xa = v.x(a - off), xb = v.x(b - off);
    if (xb - xa < 3) continue;
    const y = evPos(v, e)[1];
    ctx.strokeStyle = al(e.id === v.sel ? C.gold : C.hz, e.id === v.sel ? 0.55 : 0.32);
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(clamp(xa, v.padL, v.W - v.padR), y); ctx.lineTo(clamp(xb, v.padL, v.W - v.padR), y); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  for (const cl of clusters) {
    const { e, p: [x, y] } = cl.items[0];
    const n = cl.items.length - 1;
    const isSel = e.id === v.sel, isHi = v.hi.has(e.id) || cl.items.some((o) => v.hi.has(o.e.id)), isHov = v.hover === e.id;
    ctx.globalAlpha = v.lens && !cl.items.some((o) => lensHas(o.e)) ? 0.28 : 1;
    const s = e.imp === 1 ? 4.2 : 3.3;
    ctx.beginPath();
    if (e.today) { ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); }
    else { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }
    if (isSel) { ctx.fillStyle = C.gold; ctx.strokeStyle = C.goldSoft; ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); }
    else if (e.today) { ctx.strokeStyle = al(C.bright, 0.8); ctx.lineWidth = 1.2; ctx.stroke(); }
    else { ctx.fillStyle = e.imp === 1 ? C.bright : C.void; ctx.strokeStyle = isHov ? C.bright : al(C.bright, e.imp === 1 ? 0.95 : 0.7); ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); }
    if (n > 0 && !isSel) { ctx.strokeStyle = al(C.hz, 0.6); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.stroke(); }
    if (isSel) {
      ctx.strokeStyle = al(C.gold, 0.85); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22); g.addColorStop(0, al(C.gold, 0.22)); g.addColorStop(1, al(C.gold, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (isHi) {
      ctx.strokeStyle = al(C.gold, 0.5 + 0.4 * pulse); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 7 + 3 * pulse, 0, TAU); ctx.stroke();
    }
    if (v.lens && cl.items.some((o) => lensHas(o.e)) && !isSel) {
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(x, y + (e.world === 'terra' ? -8 : 8), 1.8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const lo = Math.min(...cl.items.map((o) => o.e.y)), hi = Math.max(...cl.items.map((o) => o.e.y));
    v.hits.push(n > 0 ? { id: e.id, x, y, cluster: !isSel || hi - lo > 0, n, lo, hi } : { id: e.id, x, y });
    cl.label = { e, n, x, y };
  }

  if (labelAlpha <= 0) return;
  const order = clusters.map((c) => c.label).filter((l) => l && (l.e.id === v.sel || v.hi.has(l.e.id) || l.e.imp <= 2 || v.span < 2600))
    .sort((a, b) => rank(a.e) - rank(b.e) || Math.abs(a.x - xc) - Math.abs(b.x - xc));
  const size = 11;
  ctx.font = `500 ${size}px ${v.font}`;
  if (v.narrow) for (const k of ['kharen', 'earth', 'terra']) { const el = v.laneEls[k]; if (el) { const r = el.offsetTop; v.boxes.push([0, r - 2, el.offsetLeft + el.offsetWidth + 2, r + el.offsetHeight + 2]); } }
  for (const { e, n, x, y } of order) {
    const side = e.world === 'terra' ? 1 : -1;
    const max = e.id === v.sel ? 60 : e.imp === 1 ? 42 : 28;
    let label = e.title.length > max ? e.title.slice(0, max - 2).trimEnd() + '…' : e.title;
    if (n) label += `  +${n}`;
    if (v.span < 2 && e.id === v.sel) label += `  ·  ${fmtDay(e.y)}`;
    const w = ctx.measureText(label).width;
    const lx = clamp(x - w / 2, v.padL, v.W - v.padR - w);
    const rows = e.id === v.sel || e.imp === 1 ? 2 : 1;
    const dim = v.lens && !lensHas(e);
    ctx.globalAlpha = labelAlpha * (dim ? 0.35 : 1);
    for (let r = 0; r < rows; r++) {
      const ly = y + side * (13 + r * 13) + (side > 0 ? 7 : 0);
      if (!claim(v, lx, ly - size, w, size + 2)) continue;
      if (r > 0) { ctx.strokeStyle = al(C.hzDim, 0.5); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y + side * 6); ctx.lineTo(x, ly - (side > 0 ? 9 : -3)); ctx.stroke(); }
      ctx.fillStyle = e.id === v.sel ? C.goldSoft : v.hi.has(e.id) ? C.gold : e.imp === 1 ? C.text : C.dim;
      ctx.fillText(label, lx, ly);
      break;
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------------- eras and clocks ---------------- */

export function eras(v, alpha) {
  const { ctx, C } = v;
  for (const e of ERAS) {
    const off = v.wOff(e.world);
    const x0 = Math.max(v.padL, v.x(e.y - off)), x1 = Math.min(v.W - v.padR, v.x(e.y2 - off));
    if (x1 - x0 < 22) continue;
    const side = e.world === 'terra' ? -9 : 9;
    const curT = v.cursor + off;
    const live = curT >= e.y && curT < e.y2 + (e.y2 === NOW ? 1 : 0);
    ctx.strokeStyle = al(C.hz, live ? 0.5 : 0.22); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 6) {
      const yy = v.laneY(e.world, v.tAt(x) + off) + side;
      if (x === x0) { ctx.moveTo(x, yy - Math.sign(side) * 3); ctx.lineTo(x, yy); } else ctx.lineTo(x, yy);
    }
    const yEnd = v.laneY(e.world, v.tAt(x1) + off) + side;
    ctx.lineTo(x1, yEnd); ctx.lineTo(x1, yEnd - Math.sign(side) * 3);
    ctx.stroke();
    if (alpha <= 0) continue;
    const label = e.name.toUpperCase();
    ctx.font = `500 11px ${v.font}`;
    const w = ctx.measureText(label).width;
    if (x1 - x0 < w + 16) continue;
    const ly = (xx) => v.laneY(e.world, v.tAt(xx) + off) + side + (side > 0 ? 13 : -5);
    // the level part of the bracket reads best: try the middle, then the right end
    for (const xm of [(x0 + x1) / 2, x1 - w / 2 - 8, x0 + w / 2 + 8]) {
      ctx.globalAlpha = alpha;
      if (text(v, label, xm, ly(xm), { size: 11, color: live ? C.text : C.faint, align: 'center' })) { ctx.globalAlpha = 1; break; }
      ctx.globalAlpha = 1;
    }
  }
}

/* Each world's own clock, when zoomed in far enough to read it. */
export function clocks(v, alpha) {
  const { ctx, C } = v;
  const kOff = v.wOff('kharen'), tOff = v.wOff('terra');
  if (v.span < 3200) {
    const yK = (t) => v.laneY('kharen', t);
    const first = Math.ceil((v.t0 + kOff + 4675) / 75) * 75 - 4675;
    ctx.strokeStyle = al(C.hz, 0.4); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = Math.max(first, -4675); t <= Math.min(v.t1 + kOff, NOW); t += 75) { const x = v.x(t - kOff); ctx.moveTo(x, yK(t) - 3); ctx.lineTo(x, yK(t) + 3); }
    ctx.stroke();
    if (alpha > 0) for (let t = Math.max(first, -4675); t <= Math.min(v.t1 + kOff, NOW); t += 75) {
      ctx.globalAlpha = alpha;
      text(v, `C${Math.round((t + 4750) / 75)}`, v.x(t - kOff), yK(t) - 6, { size: 11, color: C.faint, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
  if (v.span < 4200) {
    const unit = v.span < 30 ? 1 : v.span < 500 ? 10 : v.span < 1500 ? 100 : 500;
    const yT = (t) => v.laneY('terra', t);
    const first = Math.ceil((v.t0 + tOff + 3537) / unit) * unit - 3537;
    ctx.strokeStyle = al(C.hz, 0.4); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = Math.max(first, -3537); t <= Math.min(v.t1 + tOff, NOW); t += unit) { const x = v.x(t - tOff); ctx.moveTo(x, yT(t) - 3); ctx.lineTo(x, yT(t) + 3); }
    ctx.stroke();
    if (alpha > 0) for (let t = Math.max(first, -3537); t <= Math.min(v.t1 + tOff, NOW); t += unit) {
      ctx.globalAlpha = alpha;
      text(v, `${Math.round(t + 3537)} AT`, v.x(t - tOff), yT(t) + 15, { size: 11, color: C.faint, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- the moment ---------------- */

export function cursors(v) {
  const { ctx, C } = v;
  const y0 = v.y.cursorTop + 8, y1 = v.y.core + 8;
  if (v.pin != null) {
    const xp = v.x(v.pin), xc = v.x(v.cursor);
    const a = clamp(Math.min(xp, xc), v.padL, v.W - v.padR), b = clamp(Math.max(xp, xc), v.padL, v.W - v.padR);
    if (b > a) { ctx.fillStyle = al(C.gold, 0.05); ctx.fillRect(a, y0, b - a, y1 - y0); }
    if (xp >= v.padL - 1 && xp <= v.W - v.padR + 1) {
      ctx.strokeStyle = al(C.gold, 0.6); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(Math.round(xp) + 0.5, y0); ctx.lineTo(Math.round(xp) + 0.5, y1); ctx.stroke();
      ctx.setLineDash([]);
      text(v, `pinned · ${v.align ? fmtSince(v.pin) : fmtCE(v.pin)}`, xp + 5, y1 - 4, { size: 11, color: C.goldSoft, force: true });
    }
  }
  const x = v.x(v.cursor);
  if (x < v.padL - 1 || x > v.W - v.padR + 1) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = al(C.gold, 0.12); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = al(C.gold, 0.8); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y0); ctx.lineTo(Math.round(x) + 0.5, y1); ctx.stroke();
  ctx.fillStyle = C.gold;
  for (const w of WORLDS) { const t = v.cursor + v.wOff(w.id); if (t >= -300000 && t <= NOW + 1) { ctx.beginPath(); ctx.arc(x, v.laneY(w.id, t), 2.6, 0, TAU); ctx.fill(); } }
  for (const k of ['vortex', 'haven', 'core']) { ctx.beginPath(); ctx.arc(x, v.y[k], 1.8, 0, TAU); ctx.fill(); }
  const label = v.align ? fmtSince(v.cursor) : v.span < 2 ? fmtDay(v.cursor) : fmtCE(v.cursor);
  ctx.font = `600 11px ${v.font}`;
  const w = ctx.measureText(label).width + 16;
  const hx = clamp(x - w / 2, 2, v.W - w - 2);
  ctx.fillStyle = C.void; ctx.strokeStyle = al(C.gold, 0.9); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.rect(Math.round(hx) + 0.5, v.y.cursorTop - 6.5, Math.round(w), 15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.goldSoft; ctx.textAlign = 'center';
  ctx.fillText(label, hx + w / 2, v.y.cursorTop + 5);
  ctx.textAlign = 'left';
}

export function front(v, fx) {
  const { ctx, C } = v;
  const g = ctx.createLinearGradient(fx - 60, 0, fx + 4, 0);
  g.addColorStop(0, al(C.gold, 0)); g.addColorStop(1, al(C.gold, 0.28));
  ctx.fillStyle = g;
  ctx.fillRect(fx - 60, v.y.cursorTop + 8, 64, v.y.core - v.y.cursorTop);
  ctx.strokeStyle = al(C.goldSoft, 0.9); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fx, v.y.cursorTop + 8); ctx.lineTo(fx, v.y.core + 8); ctx.stroke();
  ctx.fillStyle = C.goldSoft; ctx.font = `600 11px ${v.font}`; ctx.textAlign = 'center';
  ctx.fillText(fmtCE(v.tAt(fx)), clamp(fx, 50, v.W - 50), v.y.cursorTop + 5);
  ctx.textAlign = 'left';
}
