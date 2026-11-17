/* ============================================================
   heptapod/pod/inked.js — the inked script (topo/inkfig.js) in the
   pod. Loaded only when pod/switch.js turns it on (pod/main.js), so a
   public visit never fetches it while it is unpublished.

   A ring as a meaning graph. A pod ring is one clause: the act is the
   event, and whoever acts, what is handled and whoever receives are
   its actor, undergoer and goal (topo/hmr.js labels). A species'
   concepts are not the graph's radicals, so each concept is given one
   set of 1 to 3 of hmr.js's eight radicals, distinct within the
   species, in a seeded order: the same concept is the same lobe in
   every ring. A ring that shows one concept alone (the being's
   reading of a mark) is one pool with nothing hanging from it.

   What a crop keeps. The figure is drawn with a trace of where each
   pool and thread was laid (inkfig.js opts.trace). A thread's first
   quarter rises out of the act's pool, so it is not read as the
   thread's own: a crop keeps a radical when it holds at least KEEP of
   that thread's other traced points (or of its pool's, for the act)
   with ink still there at that moment of the thinning; the thinning
   removes the same width from every stroke, read from a distance
   transform of the raster.

   One figure per ring and species is drawn at one size and kept in
   one bounded cache that the chamber and the notebook share, so a
   crop is drawn from the raster it was read on.

   Not drawn by this script yet: the being's press on one concept (the
   ring script widens that sector; inkfig.js has no weight channel), so
   under the switch the news is not the last thing on the disc.
   [ILLUSTRATIVE: the mapping is designed for this lab]
   ============================================================ */

import { RADICALS } from '../topo/hmr.js';
import { inkFigure } from '../topo/inkfig.js';
import { mulberry32, seedOf, shuffle } from '../../kit/rng.js';
import { ROLES } from './ring.js';

export const INKFIG = Object.freeze({
  S: 800,             // the raster side the figure is drawn at, pixels (R 292 px, about 2.5 raster pixels a field cell)
  KEEP: 0.6,          // share of a part's traced points a crop must hold, with ink left, to keep its radical
  ROOT: 0.25,         // the share of a thread, from its root in the pool, that is not read as the thread's own
  CACHE: 16,          // figures kept at once (each about 0.6 MB)
});

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

/* Chamfer distance (3-4) from each ink pixel to the nearest pixel without ink, in thirds of a pixel and clamped at
   255 (85 pixels, deeper than any stroke's half width at INKFIG.S): one byte a pixel. */
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
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.min(255, D[i]);
  return out;
}
/* The distance (thirds of a pixel) a pixel must exceed to keep ink after a thinning of `erode` ring radii of width. */
const keepAbove = (fig, erode) => 3 * ((erode / 2) * fig.R + 0.5);

/**
 * The inked figure of a graph, ready for the pod: { ok, S, R, c, dist, parts }, where parts maps a role
 * ('pred', 'agent', 'patient', 'recipient') to its traced points in ring radii (x right, y down, from the
 * centre), and dist is each pixel's distance to the paper, in raster pixels.
 */
export function podFigure(g, S = INKFIG.S) {
  const f = inkFigure(g, { S, trace: true });
  if (!f.ok) return { ok: false, reason: f.reason };
  const R = f.R, c = f.cx;
  const toRing = ([x, y]) => [(x - c) / R, (y - c) / R];
  const parts = {};
  for (const p of f.trace.pools) parts.pred = (parts.pred || []).concat(p.pts.map(toRing));
  for (const t of f.trace.threads) {
    const role = ROLE_OF[t.label];
    if (role) parts[role] = (parts[role] || []).concat(t.pts.slice(Math.floor(INKFIG.ROOT * t.pts.length)).map(toRing));
  }
  return { ok: true, S, R, c, dist: distanceIn(f.d, S, S), parts, version: f.version };
}

/* One bounded cache of figures, shared by the chamber and the notebook: the oldest used goes first. */
const cache = new Map();
/** The figure of a pod ring: spec.pod is { scene } (or -1, the greeting) or { solo }. */
export function figureOf(sp, pod) {
  const key = `${sp.target}|${sp.seed}|${pod.solo ? 's:' + pod.solo : 'r:' + pod.scene}`;
  if (cache.has(key)) { const f = cache.get(key); cache.delete(key); cache.set(key, f); return f; }
  const g = pod.solo ? soloGraph(sp, pod.solo) : ringGraph(sp, pod.scene < 0 ? sp.greeting.ids : sp.rings[pod.scene].ids);
  const f = podFigure(g);
  cache.set(key, f);
  while (cache.size > INKFIG.CACHE) cache.delete(cache.keys().next().value);
  return f;
}

/** Is there ink at ring point (x, y) after a thinning of `erode` ring radii of width? */
export function inkAt(fig, x, y, erode = 0) {
  const px = Math.round(fig.c + x * fig.R - 0.5), py = Math.round(fig.c + y * fig.R - 0.5);
  if (px < 0 || py < 0 || px >= fig.S || py >= fig.S) return false;
  return fig.dist[py * fig.S + px] > keepAbove(fig, erode);
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
    if (held >= INKFIG.KEEP * pts.length) roles.push(role);
  }
  return { roles, counts, cells };
}

/**
 * The rectangle (ring radii) a key keeps for one role: the box around its traced points, with a margin, or, where
 * that box also holds enough of another part to keep it, the box around the longest run of its points that holds it
 * alone (a run, in the order the part was drawn, of at least KEEP of its points). Null when the ring has no such part.
 */
export function sectorRectInked(fig, role, pad = 0.04) {
  const own = fig.parts[role];
  if (!own || !own.length) return null;
  const box = (pts, m = pad) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  };
  const alone = (r) => { const k = recogniseInked(fig, r, 0); return k.roles.length === 1 && k.roles[0] === role; };
  const whole = box(own);
  if (alone(whole)) return whole;
  const n = own.length, need = Math.ceil(INKFIG.KEEP * n);
  for (const m of [pad, pad / 4]) for (let k = n; k >= need; k--) for (let a = 0; a + k <= n; a++) { const r = box(own.slice(a, a + k), m); if (alone(r)) return r; }
  return whole;
}

/**
 * The figure's ink at a thinning, area-sampled into an N x N field over a square of `span` ring radii centred on
 * the ring: values 0..1, for the medium's target.
 */
export function inkedTarget(fig, N, span, erode = 0) {
  const T = new Float32Array(N * N);
  const thr = keepAbove(fig, erode);
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
