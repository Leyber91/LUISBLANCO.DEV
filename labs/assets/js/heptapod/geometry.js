/* ============================================================
   heptapod/geometry.js — from a semantic graph to the shape of
   one semagram.

   1. Layout. Every proposition owns the whole ring. Its elements
      sit clockwise from the top in a fixed order:
        predicate, mood, patient, negation, recipient,
        evidentiality, agent, aspect
      Roles that are absent take no arc, and the arc they free is
      shared out by one constrained minimisation (stiff roles,
      soft slots), so adding a recipient moves every element.

   2. The ring. Each role writes its six-cell code as targets for
      the ring's radius. The ring is then the single closed curve
      that minimises
          beta * sum (r[i-1] - 2 r[i] + r[i+1])^2      (bending)
        + mu   * sum (r[i] - 1)^2                       (stay round)
        + sum  lambda[i] (r[i] - target[i])^2           (say the codes)
      solved all at once (a 360 x 360 symmetric system). No point
      of it can be drawn before every constraint is known: the
      script's version of a variational principle.

   3. The sequential pen. For contrast, the same targets followed
      by a pen that moves clockwise and commits as it goes, seeing
      only a few degrees ahead. It does not meet itself.

   4. Marks: the time tendril, branches inward and outward, the
      negation cut, the socket of a clause-holding patient, the
      nested ring of the embedded clause, and the bridge of a
      composite. Shapes are original to this lab. [ILLUSTRATIVE]
   ============================================================ */

import { GEOM, COMPOSE } from './config.js';
import { NOUN, VERB } from './lexicon.js';
import { markFor, mod, layoutFor, cellCenters, nib, strokeScale, REF, SLOT_KEYS, unmarked } from './script.js';

export { mod, layoutFor, cellCenters, nib, strokeScale };

const M = GEOM.M;
const D2R = Math.PI / 180;
const isRole = (k) => k === 'pred' || k === 'agent' || k === 'patient' || k === 'recipient';

/* ---------------- 2. the variational ring ---------------- */

/* Solve (beta D + diag(mu + lam)) r = mu + lam * t, D the periodic second-difference
   energy. The matrix is pentadiagonal plus periodic corners, so its Cholesky factor
   is a band of width 2 plus two dense last rows: O(n) work. */
export function solveRing(lam, tgt, { beta = GEOM.SOLVE.beta, mu = GEOM.SOLVE.mu } = {}) {
  const n = lam.length;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  const st = [[-2, 1], [-1, -4], [0, 6], [1, -4], [2, 1]];
  for (let i = 0; i < n; i++) {
    for (const [o, c] of st) A[i * n + mod(i + o, n)] += beta * c;
    A[i * n + i] += mu + lam[i];
    b[i] = mu + lam[i] * tgt[i];
  }
  const dense = (i) => i >= n - 2;
  const lo = (i) => (dense(i) ? 0 : Math.max(0, i - 2)); // first nonzero column of row i of L
  for (let j = 0; j < n; j++) {
    let s = A[j * n + j];
    for (let k = lo(j); k < j; k++) s -= A[j * n + k] * A[j * n + k];
    const d = Math.sqrt(s);
    A[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      if (lo(i) > j) continue;
      let t = A[i * n + j];
      const k0 = Math.max(lo(i), lo(j));
      for (let k = k0; k < j; k++) t -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = t / d;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let t = b[i];
    for (let k = lo(i); k < i; k++) t -= A[i * n + k] * y[k];
    y[i] = t / A[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let t = y[i];
    for (let k = i + 1; k < n; k++) { if (lo(k) <= i) t -= A[k * n + i] * x[k]; }
    x[i] = t / A[i * n + i];
  }
  return x;
}

export function bendingEnergy(r, closed = true) {
  let e = 0;
  const n = r.length;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const d = r[mod(i - 1, n)] - 2 * r[i] + r[mod(i + 1, n)];
    e += d * d;
  }
  return e;
}

/* ---------------- 3. the sequential pen ---------------- */

export function sequentialRing(lam, tgt, startDeg) {
  const { kp, kd, look } = GEOM.SEQ;
  const i0 = mod(Math.round(startDeg), M);
  const out = new Float64Array(M + 1);
  let r = 1, v = 0;
  for (let s = 0; s <= M; s++) {
    const i = mod(i0 + s, M);
    let wsum = 0, tsum = 0;
    for (let k = 0; k <= look; k++) {
      const j = mod(i + k, M);
      const w = lam[j] * (1 - k / (look + 1));
      wsum += w; tsum += w * tgt[j];
    }
    const t = wsum > 0.05 ? tsum / wsum : 1;
    v += kp * (t - r) - kd * v;
    r += v;
    out[s] = r;
  }
  // energy of the open stroke, and how far it misses its own start
  let e = 0;
  for (let s = 1; s < M; s++) { const d = out[s - 1] - 2 * out[s] + out[s + 1]; e += d * d; }
  return { r: out, start: i0, seam: out[M] - 1, energy: e };
}

/* ---------------- 4. a proposition's spec ---------------- */

/* codeOf(role, concept): a writer with its own lexicon (the pod's species) supplies the six cells
   of each sector itself; without it the codes come from this lab's lexicon. */
function ringTargets(p, lay, refs = {}, codeOf = null) {
  const lam = new Float64Array(M), tgt = new Float64Array(M).fill(1), wmul = new Float64Array(M).fill(1);
  const cells = [];
  const P = GEOM.SOLVE.plateau;
  for (const role of ['pred', 'agent', 'patient', 'recipient']) {
    const sec = lay.items[role];
    if (!sec) continue;
    const ent = role === 'pred' ? null : p[role];
    const clause = ent && ent.type === 'prop';
    const ref = !clause && refs[role];
    const code = codeOf ? codeOf(role, role === 'pred' ? p.pred : ent)
      : role === 'pred' ? VERB[p.pred].code : clause ? new Array(GEOM.CELLS).fill(0) : ref ? REF[ref].code : NOUN[ent.c].code;
    cellCenters(sec).forEach((c, j) => {
      for (let d = -P; d <= P; d++) {
        const i = mod(Math.round(c) + d, M);
        lam[i] = GEOM.SOLVE.lobe; tgt[i] = 1 + GEOM.A * code[j];
      }
      cells.push({ role, j, theta: c, trit: code[j] });
    });
    if (clause) { // the socket is flat all along
      for (let a = Math.ceil(sec.start); a <= sec.start + sec.width; a++) {
        const i = mod(a, M); lam[i] = GEOM.SOLVE.lobe; tgt[i] = 1;
      }
    }
    if (ent && !clause && !ref && ent.num === 'pl') {
      for (let a = Math.floor(sec.start) - 4; a <= sec.start + sec.width + 4; a++) {
        const d = Math.min(a - sec.start, sec.start + sec.width - a); // inside distance
        const k = Math.max(0, Math.min(1, (d + 2) / 5));
        const i = mod(a, M);
        wmul[i] = Math.max(wmul[i], 1 + (GEOM.PLURAL_W - 1) * (0.5 - 0.5 * Math.cos(Math.PI * k)));
      }
    }
  }
  for (const k of lay.keys) {
    const sec = lay.items[k];
    if (sec.role) continue;
    for (let a = Math.ceil(sec.start + 3); a <= sec.start + sec.width - 3; a++) {
      const i = mod(a, M); lam[i] = GEOM.SOLVE.free; tgt[i] = 1;
    }
  }
  return { lam, tgt, wmul, cells };
}

export const occupancy = (p) => ({ ...Object.fromEntries(SLOT_KEYS.map((k) => [k, p[k] !== unmarked(k)])), neg: !!p.neg });

/** Build the spec of one proposition inside a frame { cx, cy, rho }.
    opts.sequential: the same proposition written by the sequential pen (natural arcs, causal stroke). */
export function propSpec(p, frame = { cx: 0, cy: 0, rho: 1 }, depth = 0, opts = {}) {
  const present = { agent: !!p.agent, patient: !!p.patient, recipient: !!p.recipient };
  const lay = layoutFor(present, occupancy(p), { natural: !!opts.sequential });
  const refs = opts.refs || {};
  const { lam, tgt, wmul, cells } = ringTargets(p, lay, refs, opts.codeOf || null);
  let r, seq = null;
  if (opts.sequential) {
    seq = sequentialRing(lam, tgt, lay.items.pred.start);
    r = new Float64Array(M);
    for (let k = 0; k < M; k++) r[mod(seq.start + k, M)] = seq.r[k];
    const last = lay.items[lay.keys[lay.keys.length - 1]];
    seq.leftover = 360 - (last.start + last.width - lay.items.pred.start);
  } else r = solveRing(lam, tgt);
  const marks = [];
  marks.push({ key: 'time', kind: 'tendril', theta: 0, tip: GEOM.TIME_TIP[p.time], value: p.time, role: 'time' });
  const slot = (k) => lay.items[k].center;
  for (const k of SLOT_KEYS) if (p[k] !== unmarked(k)) marks.push({ key: k, kind: k + '-' + p[k], theta: slot(k), value: p[k], role: k });
  const gap = p.neg ? { theta: slot('neg'), open: 1 } : { theta: slot('neg'), open: 0 };
  const clause = p.patient && p.patient.type === 'prop';
  const socket = clause ? { start: lay.items.patient.start, end: lay.items.patient.start + lay.items.patient.width, open: 1 }
    : { start: 0, end: 0, open: 0 };
  const sub = clause && depth === 0
    ? propSpec(p.patient, { cx: frame.cx, cy: frame.cy, rho: frame.rho * GEOM.SUB_RHO }, depth + 1, opts) : null;
  return { type: 'prop', prop: p, frame, lay, lam, tgt, r, wmul, cells, marks, gap, socket, sub, depth, seq, refs };
}

export function graphSpec(g, opts = {}) {
  if (g.type === 'rel') {
    const d = COMPOSE.d;
    return {
      type: 'rel', rel: g.rel, graph: g,
      a: propSpec(g.a, { cx: -d, cy: 0, rho: 1 }, 0, opts),
      b: propSpec(g.b, { cx: d, cy: 0, rho: 1 }, 0, { ...opts, refs: corefs(g.a, g.b) }),
    };
  }
  return propSpec(g, undefined, 0, opts);
}

/* Which roles of b repeat a participant of a: b role -> a role. */
export function corefs(a, b) {
  const out = {};
  const same = (x, y) => x && y && x.type !== 'prop' && y.type !== 'prop' && x.c === y.c && x.num === y.num;
  for (const rb of ['agent', 'patient', 'recipient']) {
    const ra = ['agent', 'patient', 'recipient'].find((r) => same(a[r], b[rb]));
    if (ra) out[rb] = ra;
  }
  return out;
}

/** The functional the variational ring minimises, evaluated on any ring. */
export function functional(spec) {
  const { lam, tgt, r } = spec;
  const { beta, mu } = GEOM.SOLVE;
  let e = 0;
  for (let i = 0; i < M; i++) {
    const d = r[mod(i - 1, M)] - 2 * r[i] + r[mod(i + 1, M)];
    e += beta * d * d + mu * (r[i] - 1) ** 2 + lam[i] * (r[i] - tgt[i]) ** 2;
  }
  return e;
}

/* ---------------- interpolation between two specs (the reflow) ---------------- */

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = lerp(a[i], b[i], t); return o; };
const lerpAng = (a, b, t) => a + (((b - a + 540) % 360) - 180) * t;

export function tweenSpec(A, B, t) {
  if (!A || A.type !== B.type) return B;
  if (B.type === 'rel') {
    return { ...B, a: tweenSpec(A.a, B.a, t), b: tweenSpec(A.b, B.b, t), relFrom: A.rel, relT: A.rel === B.rel ? 1 : t };
  }
  const marks = [];
  const keyOf = (m) => m.key + ':' + m.kind;
  const am = new Map(A.marks.map((m) => [keyOf(m), m]));
  const bm = new Map(B.marks.map((m) => [keyOf(m), m]));
  for (const m of B.marks) {
    const o = am.get(keyOf(m));
    if (o) marks.push({ ...m, theta: lerpAng(o.theta, m.theta, t), tip: lerp(o.tip ?? 0, m.tip ?? 0, t), grow: 1 });
    else marks.push({ ...m, grow: t });
  }
  for (const m of A.marks) if (!bm.has(keyOf(m))) marks.push({ ...m, grow: 1 - t });
  const sub = A.sub && B.sub ? tweenSpec(A.sub, B.sub, t)
    : B.sub ? { ...B.sub, fade: t } : A.sub ? { ...A.sub, fade: 1 - t } : null;
  return {
    ...B,
    r: lerpArr(A.r, B.r, t),
    wmul: lerpArr(A.wmul, B.wmul, t),
    marks,
    gap: { theta: lerpAng(A.gap.theta, B.gap.theta, t), open: lerp(A.gap.open, B.gap.open, t) },
    socket: {
      start: B.socket.open ? (A.socket.open ? lerpAng(A.socket.start, B.socket.start, t) : B.socket.start) : A.socket.start,
      end: B.socket.open ? (A.socket.open ? lerpAng(A.socket.end, B.socket.end, t) : B.socket.end) : A.socket.end,
      open: lerp(A.socket.open, B.socket.open, t),
    },
    sub,
  };
}

/* ---------------- strokes ---------------- */

/* Sample the ring radius at any angle (periodic Catmull-Rom on the 360 samples). */
export function ringR(r, deg) {
  const x = mod(deg, M);
  const i = Math.floor(x), f = x - i;
  const p0 = r[mod(i - 1, M)], p1 = r[i], p2 = r[mod(i + 1, M)], p3 = r[mod(i + 2, M)];
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}
export function ringW(w, deg) {
  const x = mod(deg, M); const i = Math.floor(x), f = x - i;
  return w[i] * (1 - f) + w[mod(i + 1, M)] * f;
}

const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/* One pen for every stroke: the same broad nib sets the thick and thin of marks, tendril and
   bridge by the direction each point is travelling (the ring gets it from its tangent). */
function applyNib(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    if (a === b) continue;
    pts[i][2] *= nib(Math.atan2(b[1] - a[1], b[0] - a[0]) / D2R);
  }
  return pts;
}

/**
 * Turn a spec into strokes: [{ key, role, pts: [[x, y, w, ts, tq], ...] }] and dots
 * [{ key, role, x, y, rad, ts, tq }], in frame units. ts / tq: when the point is
 * reached in the simultaneous / sequential drawing (0..1).
 * opts.jitter(x, y) -> [dx, dy] displaces every point (the codec's tremor).
 */
export function specStrokes(spec, opts = {}) {
  const out = { strokes: [], dots: [] };
  if (spec.type === 'rel') {
    const a = specStrokes(spec.a, { ...opts, prefix: 'a.', seq: [0, 0.48] });
    const b = specStrokes(spec.b, { ...opts, prefix: 'b.', seq: [0.48, 0.96] });
    out.strokes.push(...a.strokes, ...b.strokes);
    out.dots.push(...a.dots, ...b.dots);
    out.strokes.push(...bridgeStrokes(spec, opts));
    return out;
  }
  propStrokes(spec, opts, out);
  return out;
}

function propStrokes(spec, opts, out) {
  const { cx, cy, rho } = spec.frame;
  const pre = opts.prefix || '';
  const jit = opts.jitter || null;
  const fade = spec.fade ?? 1;
  const W0 = GEOM.W0 * strokeScale(rho);
  const P = (deg, r) => {
    const a = deg * D2R;
    let x = cx + rho * r * Math.sin(a), y = cy - rho * r * Math.cos(a);
    if (jit) { const d = jit(x, y); x += d[0]; y += d[1]; }
    return [x, y];
  };
  const lay = spec.lay;
  const roleAt = (deg) => {
    for (const k of lay.keys) {
      const s = lay.items[k];
      if (angDist(deg, s.center) <= s.width / 2) return k;
    }
    return null;
  };
  // seeds for the simultaneous growth: every cell centre and every slot centre
  const seeds = [];
  for (const k of lay.keys) {
    const s = lay.items[k];
    if (s.role) cellCenters(s).forEach((c) => seeds.push(mod(c, 360)));
    else seeds.push(mod(s.center, 360));
  }
  seeds.sort((a, b) => a - b);
  const tsAt = (deg) => {
    const x = mod(deg, 360);
    let lo = seeds[seeds.length - 1] - 360, hi = seeds[0];
    for (let i = 0; i < seeds.length; i++) {
      if (seeds[i] <= x) lo = seeds[i];
      if (seeds[i] > x) { hi = seeds[i]; break; }
      if (i === seeds.length - 1) hi = seeds[0] + 360;
    }
    const half = (hi - lo) / 2 || 1;
    return Math.min(1, Math.min(x - lo, hi - x) / half);
  };
  const start = lay.items.pred.start;
  const tqAt = (deg) => mod(deg - start, 360) / 360;
  // sequential order: this ring over [q0, q1] of the drawing; a nested ring takes the second half
  const [q0, q1] = opts.seq || [0, 1];
  const qm = spec.sub ? q0 + (q1 - q0) / 2 : q1;
  const tqMain = (deg) => q0 + (qm - q0) * tqAt(deg);

  // ---- the ring, split at the negation cut and around a socket ----
  const STEP = 0.5;
  const gapHalf = (GEOM.GAP_DEG / 2) * spec.gap.open;
  const sock = spec.socket;
  const inSock = (deg) => sock.open > 0.001 && angDist(deg, (sock.start + sock.end) / 2) <= mod(sock.end - sock.start, 360) / 2;
  const sockEdge = (deg) => Math.min(angDist(deg, sock.start), angDist(deg, sock.end));
  const runs = [];
  let cur = null;
  const startAt = gapHalf > 0.05 ? spec.gap.theta + gapHalf : (sock.open > 0.001 ? sock.end : start);
  for (let s = 0; s < 360 / STEP; s++) {
    const deg = startAt + s * STEP;
    const gd = angDist(deg, spec.gap.theta);
    if (gapHalf > 0.05 && gd < gapHalf) { if (cur) { runs.push(cur); cur = null; } continue; }
    const r = ringR(spec.r, deg);
    let w = W0 * nib(deg) * ringW(spec.wmul, deg);
    if (gapHalf > 0.05 && gd < gapHalf + 4) w *= 0.35 + 0.65 * (gd - gapHalf) / 4;
    const role = roleAt(deg);
    if (inSock(deg)) {
      const e = sockEdge(deg);
      const split = GEOM.SOCKET_SPLIT * sock.open * Math.min(1, e / 4);
      const ww = w * (1 - 0.5 * sock.open * Math.min(1, e / 3));
      if (!cur || cur.kind !== 'sock') { if (cur) runs.push(cur); cur = { kind: 'sock', a: [], b: [], role }; }
      const [x1, y1] = P(deg, r + split), [x2, y2] = P(deg, r - split);
      cur.a.push([x1, y1, ww, tsAt(deg), tqMain(deg)]);
      cur.b.push([x2, y2, ww, tsAt(deg), tqMain(deg)]);
      continue;
    }
    if (!cur || cur.kind !== 'ring') {
      const prev = cur;
      if (cur) runs.push(cur);
      cur = { kind: 'ring', pts: [] };
      if (prev && prev.kind === 'sock') { // join the fork back
        const l = prev.a[prev.a.length - 1];
        cur.pts.push(l.slice());
      }
    }
    const [x, y] = P(deg, r);
    cur.pts.push([x, y, w, tsAt(deg), tqMain(deg), role]);
  }
  if (cur) runs.push(cur);
  // close the loop when nothing cuts it
  if (gapHalf <= 0.05 && runs.length === 1 && runs[0].kind === 'ring') runs[0].pts.push(runs[0].pts[0].slice());
  for (const run of runs) {
    if (run.kind === 'ring') {
      // split by role so each sector can light up on its own
      let seg = null;
      for (const q of run.pts) {
        const role = q[5] || 'ring';
        if (!seg || seg.role !== role) {
          const last = seg ? seg.pts[seg.pts.length - 1] : null;
          if (seg) out.strokes.push(seg);
          seg = { key: pre + 'ring.' + role, role: pre + role, pts: last ? [last.slice(0, 5)] : [], alpha: fade };
        }
        seg.pts.push(q.slice(0, 5));
      }
      if (seg) out.strokes.push(seg);
    } else {
      out.strokes.push({ key: pre + 'socket.a', role: pre + 'patient', pts: run.a, alpha: fade });
      out.strokes.push({ key: pre + 'socket.b', role: pre + 'patient', pts: run.b, alpha: fade });
    }
  }

  // ---- marks ----
  for (const m of spec.marks) {
    const grow = (m.grow ?? 1) * fade;
    if (grow <= 0.001) continue;
    const rs = ringR(spec.r, m.theta);
    const tq0 = tqMain(m.theta);
    if (m.kind === 'tendril') {
      const tip = m.tip ?? 0;
      const pts = [];
      const N = 30;
      const pol = (d, r) => [Math.sin(d * D2R) * r, -Math.cos(d * D2R) * r];
      // the root leaves the ring square to it, so it never leans over the predicate's cells
      const p0 = pol(0, ringR(spec.r, 0)), p1 = pol(0, 1.17), p2 = pol(tip * 0.55, 1.33), p3 = pol(tip, GEOM.TENDRIL_R);
      for (let s = 0; s <= N; s++) {
        const t = s / N, u = 1 - t;
        const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
        const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
        let X = cx + rho * x, Y = cy + rho * y;
        if (jit) { const d = jit(X, Y); X += d[0]; Y += d[1]; }
        pts.push([X, Y, W0 * (1.7 - 1.25 * t), t * grow, tq0 + 0.02 * t]);
      }
      out.strokes.push({ key: pre + 'time', role: pre + 'time', pts: applyNib(pts), alpha: grow });
      const [tx, ty] = (() => { let X = cx + rho * pol(tip, GEOM.TENDRIL_R + 0.03)[0], Y = cy + rho * pol(tip, GEOM.TENDRIL_R + 0.03)[1]; if (jit) { const d = jit(X, Y); X += d[0]; Y += d[1]; } return [X, Y]; })();
      out.dots.push({ key: pre + 'time.dot', role: pre + 'time', x: tx, y: ty, rad: W0 * 1.05, ts: grow, tq: tq0 + 0.02, alpha: grow });
      continue;
    }
    const sh = markFor(m.key, m.value) || { lines: [], dots: [] };
    const a = m.theta * D2R;
    const N = [Math.sin(a), -Math.cos(a)], T = [Math.cos(a), Math.sin(a)];
    const at = (u, v) => {
      let X = cx + rho * ((rs + v) * N[0] + u * T[0]);
      let Y = cy + rho * ((rs + v) * N[1] + u * T[1]);
      if (jit) { const d = jit(X, Y); X += d[0]; Y += d[1]; }
      return [X, Y];
    };
    sh.lines.forEach((ln, li) => {
      const pts = [];
      const n = ln.pts.length;
      ln.pts.forEach(([u, v], i) => {
        const t = n > 1 ? i / (n - 1) : 1;
        const [X, Y] = at(u, v);
        pts.push([X, Y, W0 * (ln.w0 + (ln.w1 - ln.w0) * t), t * grow, tq0 + 0.015 * t]);
      });
      out.strokes.push({ key: pre + m.key + '.' + li, role: pre + m.role, pts: applyNib(pts), alpha: grow });
    });
    sh.dots.forEach(([u, v, rad], di) => {
      const [X, Y] = at(u, v);
      out.dots.push({ key: pre + m.key + '.d' + di, role: pre + m.role, x: X, y: Y, rad: rho * rad * Math.min(1, grow * 1.2), ts: 0.4 + 0.2 * di, tq: tq0 + 0.01 * di, alpha: grow });
    });
  }

  if (spec.sub) propStrokes(spec.sub, { ...opts, prefix: pre + 'sub.', seq: [qm, q1] }, out);
}

/* The bridge of a composite, in composite units (x from the cause on the right to the effect on the left). */
export function bridgePaths(rel) {
  const x0 = COMPOSE.x0;
  const N = 40;
  const line = (f) => Array.from({ length: N + 1 }, (_, i) => { const x = x0 - (2 * x0 * i) / N; return [x, f(x)]; });
  switch (rel) {
    case 'because': return [{ pts: line((x) => 0.1 * Math.sin(Math.PI * x / x0)), w0: 1.5, w1: 0.35 }];
    case 'despite': return [
      { pts: line((x) => 0.17 * x / x0 - 0.04 * (1 - (x / x0) ** 2)), w0: 1.0, w1: 1.0 },
      { pts: line((x) => -0.17 * x / x0 - 0.04 * (1 - (x / x0) ** 2)), w0: 1.0, w1: 1.0 },
    ];
    case 'after': return [{ pts: line((x) => -0.06 - 0.3 * (1 - (x / x0) ** 2)), w0: 1.4, w1: 0.4 }];
    case 'before': return [{ pts: line((x) => 0.06 + 0.3 * (1 - (x / x0) ** 2)), w0: 1.4, w1: 0.4 }];
    default: return [];
  }
}

function bridgeStrokes(spec, opts) {
  const jit = opts.jitter || null;
  const W0 = GEOM.W0;
  const out = [];
  const draw = (rel, alpha) => bridgePaths(rel).forEach((b, k) => {
    const n = b.pts.length;
    const pts = b.pts.map(([x, y], i) => {
      const t = i / (n - 1);
      let X = x, Y = y;
      if (jit) { const d = jit(X, Y); X += d[0]; Y += d[1]; }
      return [X, Y, W0 * (b.w0 + (b.w1 - b.w0) * t), Math.abs(2 * t - 1), 0.96 + 0.04 * t];
    });
    out.push({ key: 'bridge.' + rel + '.' + k, role: 'rel', pts: applyNib(pts), alpha });
  });
  const t = spec.relT ?? 1;
  if (spec.relFrom && spec.relFrom !== spec.rel && t < 1) draw(spec.relFrom, 1 - t);
  draw(spec.rel, t);
  return out;
}

/* The bounds of a spec in frame units, for fitting it to a canvas. */
export function specBounds(spec) {
  if (spec.type === 'rel') return { x0: -COMPOSE.d - 1.56, x1: COMPOSE.d + 1.56, y0: -1.56, y1: 1.56 };
  return { x0: -1.56, x1: 1.56, y0: -1.56, y1: 1.56 };
}
