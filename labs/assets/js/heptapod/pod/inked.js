/* ============================================================
   heptapod/pod/inked.js — the inked script (topo/inkfig.js) in the
   pod, behind a switch.

   The switch. research/ip.md rule 6 keeps a figure off the public
   site until its similarity to the film's logograms has been checked:
   Luis looks at every pair in the review band (0.65 to 0.80) and a
   corpus run of the gate passes. Until then INKED.published is false,
   and the pod writes in the codec's ring script for everyone. On a
   page served from this machine (127.0.0.1 or localhost) the link
   ?script=inked shows the inked figure, so it can be judged in the
   chamber before it is published. Turning it on for everyone is the
   one line `published: true` below; then ?script=ring brings the
   codec's ring back.

   A ring as a meaning graph. A pod ring is one clause: the act is the
   event, and whoever acts, what is handled and whoever receives are
   its actor, undergoer and goal (topo/hmr.js labels). A species'
   concepts are not the graph's radicals, so each concept is given one
   set of 1 to 3 of hmr.js's eight radicals, distinct within the
   species, in a seeded order: the same concept is the same lobe in
   every ring. A ring that shows one concept alone (the being's
   reading of a mark) is one pool with nothing hanging from it.

   What a crop keeps. The figure is drawn with a trace of where each
   pool and thread was laid (inkfig.js opts.trace). A crop keeps a
   radical when it holds at least KEEP of that thread's traced points
   (or of its pool's, for the act) with ink still there at that moment
   of the thinning; the thinning removes the same width from every
   stroke, read from a distance transform of the raster.

   Not drawn by this script yet: the being's press on one concept (the
   ring script widens that sector; inkfig.js has no weight channel), so
   under the switch the news is not the last thing on the disc.
   [ILLUSTRATIVE: the mapping is designed for this lab]
   ============================================================ */

import { RADICALS } from '../topo/hmr.js';
import { inkFigure } from '../topo/inkfig.js';
import { mulberry32, seedOf, shuffle } from '../../kit/rng.js';
import { ROLES } from './ring.js';

export const INKED = Object.freeze({
  published: false,   // rule 6 (research/ip.md): the one place to turn the inked script on for everyone
  S: 1000,            // the raster side the figure is drawn at, pixels
  KEEP: 0.6,          // share of a thread's traced points a crop must hold, with ink left, to keep its radical
});

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/** Which script the pod writes in: 'inked' or 'ring'. */
export function scriptOf(loc = globalThis.location) {
  let q = null;
  try { q = new URLSearchParams(loc.search).get('script'); } catch { q = null; }
  if (INKED.published) return q === 'ring' ? 'ring' : 'inked';
  return loc && LOCAL.test(loc.hostname || '') && q === 'inked' ? 'inked' : 'ring';
}

/* ---------------- a species' concepts as radical sets ---------------- */
const COMBOS = (() => {
  const n = RADICALS.length, out = [];
  for (let a = 0; a < n; a++) out.push([RADICALS[a]]);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) out.push([RADICALS[a], RADICALS[b]]);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) out.push([RADICALS[a], RADICALS[b], RADICALS[c]]);
  return out;
})();
const radCache = new WeakMap();
/** concept id -> its radicals, distinct within the species (92 sets for at most a few dozen concepts). */
export function radicalsOf(sp) {
  if (radCache.has(sp)) return radCache.get(sp);
  const ids = [...sp.trits.keys()].sort();
  if (ids.length > COMBOS.length) throw new Error(`inked: ${ids.length} concepts, ${COMBOS.length} radical sets`);
  const order = shuffle(COMBOS, mulberry32(seedOf('inked', sp.target, sp.seed)));
  const m = new Map(ids.map((id, i) => [id, order[i]]));
  radCache.set(sp, m);
  return m;
}

/* ---------------- graphs ---------------- */
const LABEL = { agent: 'actor', patient: 'undergoer', recipient: 'goal' };
const ROLE_OF = { actor: 'agent', undergoer: 'patient', goal: 'recipient' };
const ORIGO = { k: 'origo', f: { speaker: 'far' } };
const ANCHOR = { mode: 'decl', temp: 'unspec', evid: 'visual' };
const EVENT_F = { aspect: 'performance', strength: 'AFF' };
const ENTITY_F = { person: '3', num: 'sg', quant: 'def' };

/** The graph of a ring: ids is a species ring's { agent, pred, patient, recip } (an id or null each). */
export function ringGraph(sp, ids) {
  const rad = radicalsOf(sp);
  const g = { v: 'hmr-0.1', nodes: { o: ORIGO, e: { k: 'event', c: rad.get(ids.pred), f: EVENT_F } }, edges: [['o', 'anchor', 'e', ANCHOR]] };
  for (const [role, key] of [['agent', 'agent'], ['patient', 'patient'], ['recipient', 'recip']]) {
    if (!ids[key]) continue;
    g.nodes[role] = { k: 'entity', c: rad.get(ids[key]), f: ENTITY_F };
    g.edges.push(['e', LABEL[role], role, { inv: 'direct' }]);
  }
  return g;
}
/** One concept alone: one pool. */
export function soloGraph(sp, id) {
  return { v: 'hmr-0.1', nodes: { o: ORIGO, e: { k: 'event', c: radicalsOf(sp).get(id), f: EVENT_F } }, edges: [['o', 'anchor', 'e', ANCHOR]] };
}

/* ---------------- the figure, its distance field, its trace ---------------- */

/* Chamfer distance (3-4, divided by 3) from each ink pixel to the nearest pixel without ink. */
export function distanceIn(d, W, H) {
  const BIG = 1e9, D = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) D[i] = d[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!D[i]) continue;
    let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, D[i - W] + 3); if (x > 0) v = Math.min(v, D[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, D[i - W + 1] + 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!D[i]) continue;
    let v = D[i];
    if (x < W - 1) v = Math.min(v, D[i + 1] + 3); else v = Math.min(v, 3);
    if (y < H - 1) { v = Math.min(v, D[i + W] + 3); if (x < W - 1) v = Math.min(v, D[i + W + 1] + 4); if (x > 0) v = Math.min(v, D[i + W - 1] + 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  for (let i = 0; i < W * H; i++) D[i] /= 3;
  return D;
}

/**
 * The inked figure of a graph, ready for the pod: { ok, S, R, c, dist, parts }, where parts maps a role
 * ('pred', 'agent', 'patient', 'recipient') to its traced points in ring radii (x right, y down, from the
 * centre), and dist is each pixel's distance to the paper, in raster pixels.
 */
export function podFigure(g, S = INKED.S) {
  const f = inkFigure(g, { S, trace: true });
  if (!f.ok) return { ok: false, reason: f.reason };
  const R = f.R, c = f.cx;
  const toRing = ([x, y]) => [(x - c) / R, (y - c) / R];
  const parts = {};
  for (const p of f.trace.pools) parts.pred = (parts.pred || []).concat(p.pts.map(toRing));
  for (const t of f.trace.threads) { const role = ROLE_OF[t.label]; if (role) parts[role] = (parts[role] || []).concat(t.pts.map(toRing)); }
  return { ok: true, S, R, c, dist: distanceIn(f.d, S, S), parts, version: f.version };
}

/** Is there ink at ring point (x, y) after a thinning of `erode` ring radii of width? */
export function inkAt(fig, x, y, erode = 0) {
  const px = Math.round(fig.c + x * fig.R - 0.5), py = Math.round(fig.c + y * fig.R - 0.5);
  if (px < 0 || py < 0 || px >= fig.S || py >= fig.S) return false;
  return fig.dist[py * fig.S + px] > (erode / 2) * fig.R + 0.5;
}

/**
 * What a crop keeps, in the shape ring.js's recognise() returns: rect in ring radii, erode the thinning then.
 * cells counts the traced points inside with ink, so a crop of a bare corner keeps nothing and is not a scrap.
 */
export function recogniseInked(fig, rect, erode = 0) {
  const counts = {};
  let cells = 0;
  const roles = [];
  for (const role of ROLES) {
    const pts = fig.parts[role];
    if (!pts || !pts.length) continue;
    let held = 0;
    for (const [x, y] of pts) if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1 && inkAt(fig, x, y, erode)) held++;
    counts[role] = held;
    cells += held;
    if (held >= INKED.KEEP * pts.length) roles.push(role);
  }
  return { roles, counts, cells };
}

/** The rectangle (ring radii) around one role's traced points, with a margin. */
export function sectorRectInked(fig, role, pad = 0.12) {
  const pts = fig.parts[role];
  if (!pts || !pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

/**
 * The figure's ink at a thinning, area-sampled into an N x N field over a square of `span` ring radii centred on
 * the ring: values 0..1, for the medium's target.
 */
export function inkedTarget(fig, N, span, erode = 0) {
  const T = new Float32Array(N * N);
  const thr = (erode / 2) * fig.R + 0.5;
  const k = (span * fig.R) / N;                 // raster pixels per field cell
  const x0 = fig.c - (span / 2) * fig.R;
  const sub = Math.max(1, Math.min(4, Math.round(k)));
  const step = k / sub, w = 1 / (sub * sub);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 0;
    for (let b = 0; b < sub; b++) for (let a = 0; a < sub; a++) {
      const px = Math.floor(x0 + i * k + (a + 0.5) * step), py = Math.floor(x0 + j * k + (b + 0.5) * step);
      if (px >= 0 && py >= 0 && px < fig.S && py < fig.S && fig.dist[py * fig.S + px] > thr) v += w;
    }
    T[j * N + i] = v;
  }
  return T;
}
