/* ============================================================
   heptapod/topo/inkfig.js — F4-ink (BAR_F, order of 2026-11-17: the
   look before the rest of F4): a meaning graph drawn as ink on a ring,
   at the film masters' resolution, with each clause laid along the
   ring and its nodes drawn as filaments.

   Each rule with its reason (research/ip.md rule 9: our own route; the
   film enters only as distributions to land in, or as a calibration
   named in INK_CALIBRATIONS):

   I1 The ring is the speaker (figure.js F1), drawn as one brush stroke
      around a hand-drawn circle: the centreline wanders from a perfect
      circle by a smooth noise (a hand is not a compass). [physics of
      the hand; amplitude a calibration]
   I2 One mass per main clause (figure.js F2), laid along the ring: the
      brush pools the clause's ink where it dwells, and the pool is
      dragged along the stroke, so its arc grows with the clause's
      content (NODE_DEG per node) and its depth is the pool's (DEPTH).
      The pool's profile is a puddle's, skewed along the drag, split
      between the two sides of the ring. [physics: pooling; PLAN M3]
   I3 Every node of a clause other than its main event is a filament
      leaving the mass; a node that hangs from such a node is a branch
      of its filament. The side is the role's class: a core argument
      (actor, undergoer, goal, content) leaves outward, a circumstance
      inward. The angle at which it leaves the normal is the role's
      rank (PLAN L6: role by neck angle). Its length grows with what
      hangs from it. [grammar; F4-P4]
   I4 A filament is a thread of ink: it flares where it leaves the pool,
      tapers along its length and wanders by a smooth turning noise. An
      entity's thread ends in a drop of radius 1.89 times the thread's
      (Rayleigh 1878, after Plateau: one fastest-growing wavelength,
      9.02 a, gathers into one drop; F4-P5); any other node's thread
      ends flat. A drop may shed satellites beyond it, smaller and in
      line, as a breaking thread does. [physics; grammar for which tips]
   I5 The rim of a pool breaks into short spikes spaced as a thin rim's
      fastest-growing wavelength (the same 9.02 a, for a rim of half
      thickness RIM_A): edge roughness, below the length of a filament.
      [physics]
   I6 The carrier between masses is a hairy brush (Strassmann 1986):
      bristles across the stroke, each with its own reservoir, loaded
      where the brush passes a pool and depleting with arc distance from
      it; a bristle whose load falls below its threshold leaves a gap,
      outer bristles first, so the dry stretch shows streaks and specks
      (flying white). The gap sits in the largest free arc, where the
      brush is driest (figure.js F6; F4-P1), and the stroke tapers into
      it. [physics]
   I7 Ink spreads into the surface before it dries: the body (pools,
      threads, drops) is diffused over INK_SPREAD and the bristle layer
      over a third of it, and ink is where the diffused load is at least
      half. Joins become waists and drops round. [physics: capillary
      spreading]
   I8 Order around the ring: the clauses' centre of mass nearest the
      centre (figure.js F4, PLAN 3.4.3), so no position carries
      discourse order; free arcs keep ARC_MIN_DEG and share the rest by
      the neighbours' spans (figure.js F5); the figure is turned by its
      meaning's certificate (figure.js).

   Every random choice is a stream seeded by the graph's canonical
   certificate and a node's canonical index, never by the text. Only
   + - * /, Math.sqrt, exact rounding and trig.js are called (BAR_F
   G5). Reading the inked figure back is the next slice (declared in
   BAR_F before this one ran); what this file reports is how many
   filaments it drew.
   ============================================================ */

import { clausesOf } from './figure.js';
import { edgeClassRank, edgeRoleRank } from './hmr.js';
import { mulberry32, fnv1a } from './rng.js';
import { PI, sinK, cosK } from './trig.js';

const TAU = 2 * PI, DEG = PI / 180;

export const INK = Object.freeze({
  version: 'inkfig-0.1',
  S: 3300,            // raster side, the film masks' size
  R_CANVAS: 0.365,    // R over the raster side (figure.js)
  NODE_DEG: 7.0,      // I2: arc of a clause's pool per node, degrees
  CORE: 0.65,         // I2b: the share of the pool's depth laid as its solid core
  DEPOSITS: 1.2,      // I2b: strokes laid per degree of the pool's arc
  ARC_MIN_DEG: 6,     // I8: clearance between neighbouring pools, degrees
  GAP_DEG: 26.5,      // I6: the gap's arc, degrees
  GAP_SHARE: 0.6,     // a gap takes at most this share of its free arc
  TAPER_DEG: 10,      // I6: the stroke thins into the gap over this arc
  DEPTH: 0.33,        // I2: a pool's peak depth across the ring, over R
  WOBBLE: 0.07,       // I1: centreline wander, over R
  W_RING: 0.06,       // I6: the carrier's width at full load, over R
  LOAD_ARC: 0.3,      // I6: arc (over R) at which the carrier's load has fallen to half
  LOAD_FLOOR: 0.45,   // I6: the share of a full load the brush keeps however far from a pool (it is redipped by the writer's hand, not only by the pools)
  BRISTLES: 28,       // I6
  SHAFT: 0.017,       // I4: a thread's shaft width, over R
  FIL_LEN: 0.15,      // I3: a filament's length with nothing hanging from it, over R
  RIM_A: 0.005,       // I5: rim half thickness, over R
  INK_SPREAD: 0.0035, // I7: diffusion length of the body, over R
  CORE_ROLES: Object.freeze(['actor', 'undergoer', 'goal', 'content']),
});

export const INK_CALIBRATIONS = Object.freeze([
  { name: 'NODE_DEG', value: INK.NODE_DEG, source: 'first value: a 6-node clause drawn about 24 degrees, the film\'s cluster spans having median 15 and widest-per-master median 32 degrees (film suite, 2026-11-17)' },
  { name: 'GAP_DEG', value: INK.GAP_DEG, source: 'film suite 2026-11-17: main gap median 26.5 degrees over the 18 masters' },
  { name: 'DEPTH', value: INK.DEPTH, source: 'film suite 2026-11-17: blot peak width median 0.325 R' },
  { name: 'WOBBLE', value: INK.WOBBLE, source: 'film suite 2026-11-17: centreline deviation median 0.043 R (first value set below it, the pools add their own)' },
  { name: 'W_RING', value: INK.W_RING, source: 'film suite 2026-11-17: carrier w_med median 0.066 R, w_p25 median 0.035 R' },
  { name: 'SHAFT', value: INK.SHAFT, source: 'film suite 2026-11-17: filament shaft median 0.0172 R' },
  { name: 'FIL_LEN', value: INK.FIL_LEN, source: 'film suite 2026-11-17: filament length median 0.143 R' },
  { name: 'LOAD_ARC, LOAD_FLOOR, BRISTLES, RIM_A, INK_SPREAD, TAPER_DEG, CORE, DEPOSITS', value: 0, source: 'first values, not yet compared with any film measure' },
]);

/* ---------------- seeded noise (exact operations only) ---------------- */

function hash01(seed, i) {
  let x = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967295;
}
/* value noise in [-1, 1]; with period > 0 the lattice wraps, so a noise of the angle is continuous at 2 pi */
function noise1(seed, t, period = 0) {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  const i0 = period ? ((i % period) + period) % period : i, i1 = period ? (i0 + 1) % period : i + 1;
  const a = 2 * hash01(seed, i0) - 1, b = 2 * hash01(seed, i1) - 1;
  return a + (b - a) * s;
}
function fbm1(seed, t, oct, period = 0) {
  let v = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) { v += amp * noise1(seed + 7919 * o, t * f, period ? period * f : 0); norm += amp; amp *= 0.5; f *= 2; }
  return v / norm;
}
const streamOf = (cert, i, tag) => mulberry32(fnv1a(`${cert}:${i}:${tag}`));

/* ---------------- the raster ---------------- */

function stampDisc(F, S, x, y, r) {
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(S - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(S - 1, Math.ceil(y + r));
  const r2 = r * r;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - y, dy2 = dy * dy;
    if (dy2 > r2) continue;
    for (let px = x0; px <= x1; px++) { const dx = px + 0.5 - x; if (dx * dx + dy2 <= r2) F[py * S + px] = 1; }
  }
}
function fillPolygon(F, S, P) {
  const m = P.length / 2;
  let ya = Infinity, yb = -Infinity;
  for (let k = 0; k < m; k++) { ya = Math.min(ya, P[2 * k + 1]); yb = Math.max(yb, P[2 * k + 1]); }
  const ys = Math.max(0, Math.floor(ya)), ye = Math.min(S - 1, Math.ceil(yb));
  const xs = [];
  for (let y = ys; y <= ye; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m, y0 = P[2 * k + 1], y1 = P[2 * j + 1];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(P[2 * k] + ((P[2 * j] - P[2 * k]) * (yc - y0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5)), xb = Math.min(S - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let x = xa; x <= xb; x++) F[y * S + x] = 1;
    }
  }
}
/* three box passes each way approximate a Gaussian (a sliding sum: exact operations only) */
function boxBlur(F, S, r, tmp) {
  if (r < 1) return;
  const n = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < S; y++) {
      const o = y * S;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += F[o + Math.min(S - 1, Math.max(0, x))];
      for (let x = 0; x < S; x++) {
        tmp[o + x] = acc / n;
        acc += F[o + Math.min(S - 1, x + r + 1)] - F[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < S; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(S - 1, Math.max(0, y)) * S + x];
      for (let y = 0; y < S; y++) {
        F[y * S + x] = acc / n;
        acc += tmp[Math.min(S - 1, y + r + 1) * S + x] - tmp[Math.max(0, y - r) * S + x];
      }
    }
  }
}

/* ---------------- I2, I8: the layout along the ring ---------------- */

function clauseTrees(cl) {
  const { cg, mains, member, origo } = cl;
  const inc = Array.from({ length: cg.n }, () => []);
  cg.edges.forEach((e) => { if (e.h !== origo && e.d !== origo && member[e.h] === member[e.d]) { inc[e.h].push(e); inc[e.d].push(e); } });
  return mains.map((m, c) => {
    const parent = new Map([[m, null]]), kids = new Map([[m, []]]), order = [m];
    for (let q = 0; q < order.length; q++) {
      const u = order[q];
      const next = inc[u].map((e) => ({ e, w: e.h === u ? e.d : e.h })).filter((x) => !parent.has(x.w))
        .sort((a, b) => edgeClassRank(a.e.label) - edgeClassRank(b.e.label) || edgeRoleRank(a.e.label) - edgeRoleRank(b.e.label) || a.w - b.w);
      for (const { e, w } of next) {
        if (parent.has(w)) continue;
        parent.set(w, { u, label: e.label }); kids.set(w, []); kids.get(u).push(w); order.push(w);
      }
    }
    const size = new Map();
    for (let q = order.length - 1; q >= 0; q--) { const u = order[q]; size.set(u, 1 + kids.get(u).reduce((a, w) => a + size.get(w), 0)); }
    return { c, main: m, parent, kids, size, n: order.length };
  });
}

function orderByCentre(span) {
  const k = span.length;
  const centre = (o) => {
    let x = 0, y = 0, th = 0, M = 0;
    for (let j = 0; j < k; j++) { if (j) th += (span[o[j - 1]] + span[o[j]]) / 2; x += span[o[j]] * cosK(th * DEG); y += span[o[j]] * sinK(th * DEG); M += span[o[j]]; }
    return Math.sqrt(x * x + y * y) / M;
  };
  if (k <= 2) return [...Array(k).keys()];
  let best = null, bs = Infinity;
  if (k <= 7) {
    const perm = (pre, left) => {
      if (!left.length) { const o = [0, ...pre], s = centre(o); if (s < bs - 1e-12) { bs = s; best = o; } return; }
      for (let i = 0; i < left.length; i++) perm([...pre, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    };
    perm([], [...Array(k).keys()].slice(1));
    return best;
  }
  // more than 7: alternate heavy and light around the ring
  const byMass = [...Array(k).keys()].sort((a, b) => span[b] - span[a] || a - b);
  const o = [];
  for (let i = 0, lo = 0, hi = k - 1; lo <= hi; i++) o.push(i % 2 ? byMass[hi--] : byMass[lo++]);
  return o;
}

/* ---------------- the figure ---------------- */

export function inkFigure(g, opts = {}) {
  const S = opts.S ?? INK.S;
  const cl = clausesOf(g);
  if (!cl.ok) return cl;
  const { cg } = cl;
  const cert = cg.cert;
  const trees = clauseTrees(cl);
  const k = trees.length;
  const R = INK.R_CANVAS * S, c0 = S / 2;
  const toX = (X) => c0 + X, toY = (Y) => c0 - Y;

  // I2: spans, compressed when the ring is too short for them
  let span = trees.map((t) => INK.NODE_DEG * t.n);
  const room = 360 - INK.GAP_DEG - k * INK.ARC_MIN_DEG;
  const sumSpan = span.reduce((a, b) => a + b, 0);
  const squeeze = sumSpan > room ? room / sumSpan : 1;
  span = span.map((s) => s * squeeze);
  // I8: order, free arcs, centres
  const order = orderByCentre(span);
  const sp = order.map((c) => span[c]);
  const free = 360 - sp.reduce((a, b) => a + b, 0);
  const arcs = new Float64Array(k);
  if (k === 1) arcs[0] = free;
  else {
    let wsum = 0;
    for (let j = 0; j < k; j++) wsum += sp[j] + sp[(j + 1) % k];
    for (let j = 0; j < k; j++) arcs[j] = INK.ARC_MIN_DEG + ((free - k * INK.ARC_MIN_DEG) * (sp[j] + sp[(j + 1) % k])) / wsum;
  }
  const rot = (fnv1a(cert) % 3600) / 10;
  const centreDeg = new Float64Array(k);
  centreDeg[0] = rot;
  for (let j = 1; j < k; j++) centreDeg[j] = centreDeg[j - 1] + sp[j - 1] / 2 + arcs[j - 1] + sp[j] / 2;
  let jg = 0;
  for (let j = 1; j < k; j++) if (arcs[j] > arcs[jg] + 1e-9) jg = j;
  const gapLen = Math.min(INK.GAP_DEG, INK.GAP_SHARE * arcs[jg]);
  const gapMid = centreDeg[jg] + sp[jg] / 2 + arcs[jg] / 2;

  // I1: the centreline
  const wobSeed = fnv1a(`${cert}:wobble`);
  const rc = (phiDeg) => R * (1 + INK.WOBBLE * fbm1(wobSeed, (((phiDeg % 360) + 360) % 360) / 30, 3, 12));

  const body = new Float32Array(S * S), bristle = new Float32Array(S * S);
  const report = { pools: [], filamentsDrawn: 0, threads: 0, bulbs: 0, satellites: 0, spikes: 0, outward: 0 };

  // the angular distance (deg, signed into [-180, 180))
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  // ---------- I2, I3, I4, I5: pools and their threads ----------
  const pools = [];
  for (let j = 0; j < k; j++) {
    const t = trees[order[j]];
    const rnd = streamOf(cert, t.main, 'pool');
    const half = sp[j] / 2, th = centreDeg[j];
    const skew = (rnd() * 2 - 1) * 0.6, fOut = 0.25 + 0.5 * rnd();
    const depth = INK.DEPTH * R * (0.6 + 0.7 * rnd());
    const nSeed = fnv1a(`${cert}:${t.main}:rim`);
    // a puddle dragged along the stroke: a steep front, a long tail (the skew's sign is the drag's direction)
    const prof = (x) => { const b = 1 - x * x; if (b <= 0) return 0; const y = (x - skew) / (1 + (x > skew ? -skew : skew)); const c = 1 - y * y; return c <= 0 ? 0 : c * c * Math.sqrt(b); };
    const hOut = (phi) => { const x = wrap(phi - th) / half; return Math.abs(x) >= 1 ? 0 : depth * fOut * prof(x) * (1 + 0.4 * fbm1(nSeed, x * 6, 5)); };
    const hIn = (phi) => { const x = wrap(phi - th) / half; return Math.abs(x) >= 1 ? 0 : depth * (1 - fOut) * prof(x) * (1 + 0.4 * fbm1(nSeed + 1, x * 6, 5)); };
    const wr = INK.W_RING * R / 2;
    const n = Math.max(16, Math.ceil(((2 * half * DEG) * R) / 2));
    const P = new Float64Array(4 * n);
    for (let i = 0; i < n; i++) {
      const phi = th - half + (2 * half * i) / (n - 1), r0 = rc(phi), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const ro = r0 + Math.max(wr, INK.CORE * hOut(phi)), ri = r0 - Math.max(wr, INK.CORE * hIn(phi));
      P[2 * i] = toX(ro * cs); P[2 * i + 1] = toY(ro * sn);
      P[2 * (2 * n - 1 - i)] = toX(ri * cs); P[2 * (2 * n - 1 - i) + 1] = toY(ri * sn);
    }
    fillPolygon(body, S, P);
    // I2b: the rest of the pool is laid by brush strokes along the drag, never as one filled shape (the method of
    // stevequinn/heptapod, MIT, research/SOURCES.md 1): each stroke runs along the ring at a fixed share of the
    // pool's depth on one side, pointed at both ends, shifted toward the pool's tail; past the pool's end it
    // follows the depth down to the carrier, so the pool streams out along the stroke.
    const drnd = streamOf(cert, t.main, 'deposit');
    const tail = skew >= 0 ? -1 : 1;
    const nDep = Math.round(INK.DEPOSITS * 2 * half);
    for (let i = 0; i < nDep; i++) {
      const side = drnd() < fOut ? 1 : -1, share = Math.sqrt(drnd());
      const len = 2 * half * (0.2 + 0.6 * drnd());
      const mid = th + (drnd() * 2 - 1) * half + tail * len * 0.3 * drnd();
      const ws = R * (0.006 + 0.028 * drnd() * drnd());
      const nS = Math.max(8, Math.ceil(((len * DEG) * R) / Math.max(1, ws / 3)));
      for (let q = 0; q <= nS; q++) {
        const u = q / nS, phi = mid - len / 2 + len * u;
        const env = Math.max(wr, side > 0 ? hOut(phi) : hIn(phi));
        const r = rc(phi) + side * share * env, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
        const wq = ws * Math.sqrt(4 * u * (1 - u));
        if (wq >= 1) stampDisc(body, S, toX(r * cs), toY(r * sn), wq / 2);
      }
    }
    pools.push({ j, th, half, hOut, hIn });
    report.pools.push({ spanDeg: +(2 * half).toFixed(2), depthR: +(depth / R).toFixed(3), nodes: t.n });

    // I5: rim spikes, spaced by the rim's fastest-growing wavelength
    const lam = 9.02 * INK.RIM_A * R;
    const srnd = streamOf(cert, t.main, 'spikes');
    for (const side of [1, -1]) {
      const arcLen = 2 * half * DEG * R;
      const m = Math.floor(arcLen / lam);
      for (let i = 0; i < m; i++) {
        const phi = th - half + ((i + 0.5 + 0.4 * (srnd() - 0.5)) * 2 * half) / m;
        const h = side > 0 ? hOut(phi) : hIn(phi);
        if (h < wr) continue;
        const r0 = rc(phi) + side * h, cs = cosK(phi * DEG), sn = sinK(phi * DEG);
        const len = R * (0.008 + 0.022 * srnd() * srnd()), w = R * (0.004 + 0.004 * srnd());
        const head = phi * DEG + (side > 0 ? 0 : PI) + (srnd() - 0.5) * 0.9;
        thread(body, S, toX(r0 * cs), toY(r0 * sn), head, len, w, { flare: 1.2, end: 0.35, turn: 0.2, seed: srnd() * 4294967296 >>> 0 });
        report.spikes++;
      }
    }

    // I5b: spray. Drops thrown off the pool's rim as the brush leaves it, more on the side it holds more
    // ink on; radii from a power law (many small, few large), within 0.3 R of the rim.
    const prnd = streamOf(cert, t.main, 'spray');
    const nSpray = Math.round((2 * half) / 5);
    for (let i = 0; i < nSpray; i++) {
      const phi = th + (prnd() * 2 - 1) * half * 1.1, side = prnd() < fOut ? 1 : -1;
      const h = Math.max(wr, side > 0 ? hOut(phi) : hIn(phi));
      const u = prnd(), off = R * (0.02 + 0.28 * u * u);
      const r0 = rc(phi) + side * (h + off), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const v = prnd();
      stampDisc(body, S, toX(r0 * cs), toY(r0 * sn), R * (0.003 + 0.012 * v * v * v));
      report.satellites++;
    }

    // I3, I4: the threads
    const kids0 = t.kids.get(t.main);
    const nk = kids0.length;
    kids0.forEach((w, i) => {
      const lab = t.parent.get(w).label;
      const out = INK.CORE_ROLES.includes(lab);
      const x = nk === 1 ? 0 : -0.75 + (1.5 * i) / (nk - 1);
      const phi = th + x * half;
      const h = out ? Math.max(wr, hOut(phi)) : Math.max(wr, hIn(phi));
      const side = out ? 1 : -1;
      const r0 = rc(phi) + side * (h - INK.SHAFT * R), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
      const frnd = streamOf(cert, w, 'thread');
      const rank = edgeRoleRank(lab);
      const lean = (((rank % 5) - 2) * 14 + (frnd() - 0.5) * 16) * DEG;
      const head = phi * DEG + (out ? 0 : PI) + side * lean;
      drawNode(t, w, toX(r0 * cs), toY(r0 * sn), head, 1, frnd, 0);
      report.filamentsDrawn++;
      if (out) report.outward++;
    });
  }

  function drawNode(t, w, x, y, head, scale, rnd, depthLevel) {
    const sub = t.size.get(w);
    const len = INK.FIL_LEN * R * scale * (1 + 0.35 * (sub - 1)) * (0.6 + 0.8 * rnd() * rnd() + 0.3 * rnd());
    const shaft = INK.SHAFT * R * scale * (0.9 + 1.0 * rnd() * rnd()) * (1 + 0.1 * (sub - 1));
    const isEntity = cg.nodes[w].k === 'entity';
    const tip = thread(body, S, x, y, head, len, shaft, { flare: depthLevel ? 1.6 : 3.4, end: 0.75, turn: 1, seed: (rnd() * 4294967296) >>> 0, bulb: isEntity, rnd, report });
    report.threads++;
    const kids = t.kids.get(w);
    kids.forEach((u, i) => {
      const at = 0.15 + (0.3 * (i + 1)) / (kids.length + 1);
      const p = tip.path[Math.min(tip.path.length - 1, Math.floor(at * (tip.path.length - 1)))];
      const sideB = i % 2 ? -1 : 1;
      drawNode(t, u, p[0], p[1], p[2] + sideB * (0.3 + 0.25 * rnd()), scale * 0.75, streamOf(cert, u, 'thread'), depthLevel + 1);
    });
  }

  // ---------- I6: the carrier, a hairy brush ----------
  const poolNear = (phi) => {
    let d = Infinity;
    for (const p of pools) { const x = Math.abs(wrap(phi - p.th)) - p.half; d = Math.min(d, Math.max(0, x)); }
    return d * DEG; // radians of arc beyond the nearest pool
  };
  const gap1 = gapMid + gapLen / 2;
  const NB = INK.BRISTLES;
  const brnd = mulberry32(fnv1a(`${cert}:bristles`));
  const thr = Array.from({ length: NB }, () => 0.08 + 0.5 * brnd());
  const bSeed = Array.from({ length: NB }, () => (brnd() * 4294967296) >>> 0);
  const steps = Math.ceil(TAU * R);
  const strokeDeg = 360 - gapLen;
  for (let s = 0; s < steps; s++) {
    const a = (strokeDeg * s) / steps, phi = gap1 + a;
    const taper = Math.min(1, Math.min(a, strokeDeg - a) / INK.TAPER_DEG);
    const d = poolNear(phi) * R;
    const Kd = INK.LOAD_ARC * R;
    const q = INK.LOAD_FLOOR + ((1 - INK.LOAD_FLOOR) * Kd * Kd) / (Kd * Kd + d * d);
    // pressure: the hand presses and lifts along the stroke
    const press = 0.55 + 0.45 * fbm1(wobSeed + 11, phi / 12, 4, 30);
    const w = INK.W_RING * R * (0.25 + 0.75 * q) * (0.5 + 0.5 * taper) * (0.45 + press);
    const r0 = rc(phi), cs = cosK(phi * DEG), sn = sinK(phi * DEG);
    for (let b = 0; b < NB; b++) {
      const u = -1 + (2 * (b + 0.5)) / NB;
      const load = q * taper * press * (1 + 0.7 * fbm1(bSeed[b], phi / 2, 4));
      if (load < thr[b] * (0.5 + 1.1 * Math.abs(u))) continue;
      const rr = r0 + (u * w) / 2;
      stampDisc(bristle, S, toX(rr * cs), toY(rr * sn), Math.max(1.2, w / NB));
    }
  }

  // ---------- I7: spreading, then drying ----------
  const tmp = new Float32Array(S * S);
  boxBlur(body, S, Math.max(1, Math.round(INK.INK_SPREAD * R / 1.7)), tmp);
  boxBlur(bristle, S, Math.max(1, Math.round(INK.INK_SPREAD * R / 5)), tmp);
  const d = new Uint8Array(S * S);
  let ink = 0;
  for (let i = 0; i < S * S; i++) if (body[i] >= 0.5 || bristle[i] >= 0.5) { d[i] = 1; ink++; }
  return {
    ok: true, version: INK.version, W: S, H: S, d, R, cx: c0, cy: c0, clauses: k, nodes: cg.n,
    spansDeg: Array.from(sp, (x) => +x.toFixed(2)), arcsDeg: Array.from(arcs, (x) => +x.toFixed(2)), gapDeg: +gapLen.toFixed(2), squeeze: +squeeze.toFixed(3),
    ink, ...report,
  };
}

/* One thread of ink from (x, y), heading `head` (radians, y up), length `len`, shaft width `shaft` (pixels).
   It flares to `flare` shafts at its root, tapers to `end` shafts at its tip, turns by a smooth noise, and with
   o.bulb ends in a drop of radius 1.89 times the tip's (I4), shedding up to two satellites. */
function thread(F, S, x, y, head, len, shaft, o) {
  const rnd = o.rnd || mulberry32(o.seed);
  const n = Math.max(4, Math.ceil(len / Math.max(1, shaft * 0.35)));
  const ds = len / n;
  const curl = (rnd() * 2 - 1) * 0.8 * o.turn, amp = (0.25 + 0.35 * rnd()) * o.turn;
  const seed = o.seed >>> 0;
  const width = (t) => (t < 0.18 ? shaft * (1 + (o.flare - 1) * (1 - t / 0.18) * (1 - t / 0.18)) : shaft * (1.1 - ((1.1 - o.end) * (t - 0.18)) / 0.82)) * (1 + 0.08 * noise1(seed + 3, t * 9));
  const path = [];
  let X = x, Y = y, h = head;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    h = head + curl * t + amp * fbm1(seed, t * 2.5, 3);
    stampDisc(F, S, X, Y, width(t) / 2);
    path.push([X, Y, h]);
    X += ds * cosK(h); Y -= ds * sinK(h);
  }
  if (o.bulb) {
    const rt = width(1) / 2, rb = 1.89 * rt;
    const bx = X + rb * 0.5 * cosK(h), by = Y - rb * 0.5 * sinK(h);
    stampDisc(F, S, bx, by, rb);
    if (o.report) o.report.bulbs++;
    const nSat = rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2;
    let dist = rb;
    for (let i = 0; i < nSat; i++) {
      dist += rb * (1.4 + 1.6 * rnd());
      const rs = rb * (0.35 + 0.35 * rnd());
      const hh = h + (rnd() - 0.5) * 0.3;
      stampDisc(F, S, bx + dist * cosK(hh), by - dist * sinK(hh), rs);
      if (o.report) o.report.satellites++;
    }
  }
  return { path, tip: [X, Y] };
}
