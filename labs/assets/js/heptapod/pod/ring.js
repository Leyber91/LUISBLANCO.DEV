/* ============================================================
   heptapod/pod/ring.js — the being's rings, on the lab's script.

   A ring about a scene is one proposition of the script (who acts
   in the west sector, the act at the crown, the thing in the east
   sector, and whoever receives it in the south), with the species'
   own radicals in place of the lab's lexicon. The ring is solved
   as one curve by the script's own solver.

   The being presses harder on one sector: the concept it has
   written least often so far. Weight is therefore the news, and
   since the ink thins by weight, the news is the last thing on
   the glass.

   A crop is a rectangle of the glass. It keeps a radical when at
   least four of that sector's six cells are inside it and still
   carry ink at that moment.
   [ILLUSTRATIVE: the script, the emphasis and the ink are designed
   for this lab]
   ============================================================ */

import { GEOM } from '../config.js';
import { propSpec, specStrokes, ringR, ringW, mod } from '../geometry.js';
import { nib } from '../script.js';

const D2R = Math.PI / 180;
const ZERO = [0, 0, 0, 0, 0, 0];
const BASE = { time: 'present', mood: 'indicative', neg: false, evid: 'direct', aspect: 'simple' };

export const INK = {
  EMPH: 1.6,          // the pressed sector's weight, as a multiple
  ERODE_MAX: 0.072,   // ring radii of width the thinning removes by its end: more than the heaviest stroke
  KEEP: 4,            // cells of six a crop needs to keep a radical
  LEFT: 0.004,        // a cell still carries ink while its stroke is wider than the erosion by this much
};
/* sector name in a ring spec -> field name in a species ring */
export const FIELD = { agent: 'agent', pred: 'pred', patient: 'patient', recipient: 'recip' };
export const ROLES = ['pred', 'patient', 'recipient', 'agent'];

/* Press harder on one sector: the same raised-cosine shoulder the script uses for a plural. */
export function emphasise(spec, role, k = INK.EMPH) {
  const sec = spec.lay.items[role];
  if (!sec) return spec;
  for (let a = Math.floor(sec.start) - 4; a <= sec.start + sec.width + 4; a++) {
    const d = Math.min(a - sec.start, sec.start + sec.width - a);
    const t = Math.max(0, Math.min(1, (d + 2) / 5));
    const i = mod(a, GEOM.M);
    spec.wmul[i] = Math.max(spec.wmul[i], 1 + (k - 1) * (0.5 - 0.5 * Math.cos(Math.PI * t)));
  }
  return spec;
}

/** The ring the being writes about scene type sceneIdx (or -1, its greeting), pressing on sector emph (or none). */
export function ringSpec(sp, sceneIdx, emph = null) {
  const ids = (sceneIdx < 0 ? sp.greeting : sp.rings[sceneIdx]).ids;
  const ent = (id) => (id ? { c: id, num: 'sg' } : null);
  const p = { ...BASE, pred: ids.pred, agent: ent(ids.agent), patient: ent(ids.patient), recipient: ent(ids.recip) };
  const spec = propSpec(p, undefined, 0, { codeOf: (role, x) => sp.trits.get(role === 'pred' ? x : x.c) });
  if (emph) emphasise(spec, emph);
  spec.pod = { scene: sceneIdx, emph };
  return spec;
}

/** A ring that carries one radical and nothing else: how the being shows a single concept. */
export function soloSpec(sp, id) {
  const cls = sp.cls.get(id);
  const role = cls === 'act' ? 'pred' : cls === 'obj' ? 'patient' : 'agent';
  const p = { ...BASE, pred: role === 'pred' ? id : null, agent: null, patient: null, recipient: null };
  if (role !== 'pred') p[role] = { c: id, num: 'sg' };
  const spec = propSpec(p, undefined, 0, { codeOf: (r, x) => (r === 'pred' ? (x ? sp.trits.get(x) : ZERO) : sp.trits.get(x.c)) });
  spec.pod = { solo: id, role };
  return spec;
}

/* The strokes of a pod ring. The being writes its time mark lightly (0.6 of the script's weight), so
   that what outlasts the thinning is the pressed sector and not the tendril every ring shares. */
export function podStrokes(spec) {
  const ink = specStrokes(spec);
  for (const st of ink.strokes) if (st.role === 'time') for (const q of st.pts) q[2] *= 0.6;
  for (const d of ink.dots) if (d.role === 'time') d.rad *= 0.8;
  return ink;
}

/* The rectangle (ring radii) that holds one sector's six cells, with a margin: a crop of that sector. */
export function sectorRect(spec, role, pad = 0.2) {
  const cs = cellInk(spec).filter((c) => c.role === role);
  if (!cs.length) return null;
  return { x0: Math.min(...cs.map((c) => c.x)) - pad, y0: Math.min(...cs.map((c) => c.y)) - pad, x1: Math.max(...cs.map((c) => c.x)) + pad, y1: Math.max(...cs.map((c) => c.y)) + pad };
}

/** Each cell of each sector: where it sits (ring radii from the centre) and how wide its stroke is. */
export function cellInk(spec) {
  return spec.cells.map((c) => {
    const r = ringR(spec.r, c.theta), a = c.theta * D2R;
    return { role: c.role, j: c.j, trit: c.trit, x: r * Math.sin(a), y: -r * Math.cos(a), w: GEOM.W0 * nib(c.theta) * ringW(spec.wmul, c.theta) };
  });
}

/**
 * What a crop keeps: rect in ring radii { x0, y0, x1, y1 }, erode the thinning at that moment.
 * roles: the sectors with at least four cells still carrying ink; cells: every cell in the rectangle
 * with any ink left at all, so a crop of hairlines is a scrap and not nothing.
 */
export function recognise(spec, rect, erode = 0) {
  const counts = {};
  let cells = 0;
  for (const c of cellInk(spec)) {
    if (c.x < rect.x0 || c.x > rect.x1 || c.y < rect.y0 || c.y > rect.y1) continue;
    if (c.w - erode <= 0) continue;
    cells++;
    if (c.w - erode > INK.LEFT) counts[c.role] = (counts[c.role] || 0) + 1;
  }
  return { roles: ROLES.filter((r) => (counts[r] || 0) >= INK.KEEP), counts, cells };
}
