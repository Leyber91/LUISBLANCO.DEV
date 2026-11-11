/* ============================================================
   dimensional_mania/observer.js — what the Witness notices.

     · events: geometric moments detected on the live figure
         a vertex crossing the hyperplane x_(n-1) = 0
         a cell turning inside out in the shadow (4D): its hyperplane
           sweeps through the eye (perspective) or turns edge-on (orthographic)
         two vertices landing on one point of the shadow
     · the session log: what the visitor did and saw, with values
     · the next experiment: the first rule in a table the visitor has not met
     · number checks: every number in a model reply against the live state
   ============================================================ */

import { AXES } from './constants.js';

export class Observer {
  constructor() {
    this.t0 = Date.now();
    this.log = [];
    this.tried = new Set();
    this.wSide = null;
    this.cellSide = null;
    this.together = '';
  }

  note(text) {
    const s = Math.round((Date.now() - this.t0) / 1000);
    const stamp = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    if (this.log.length && this.log[this.log.length - 1].text === text) return;
    this.log.push({ stamp, text });
    if (this.log.length > 400) this.log.shift();
  }

  try(flag) { this.tried.add(flag); }

  reset() { this.wSide = null; this.cellSide = null; this.together = ''; }

  /**
   * Look for events on the current frame.
   * @returns {string[]} sentences, newest first
   */
  events(app) {
    const s = app.s, n = s.n, o = app.o, X = app.X, out = [];
    if (o.curved || n < 2) return out;
    const ax = AXES[n - 1];
    // a vertex crossing x_(n-1) = 0
    if (n >= 4) {
      const side = new Int8Array(o.nv);
      for (let v = 0; v < o.nv; v++) side[v] = X[v * n + n - 1] >= 0 ? 1 : -1;
      if (this.wSide && this.wSide.length === side.length) {
        for (let v = 0; v < o.nv; v++) {
          if (side[v] !== this.wSide[v]) {
            out.push(`${app._vertexLabel(v)} crossed ${ax} = 0, from the ${side[v] > 0 ? 'far' : 'near'} side to the ${side[v] > 0 ? 'near' : 'far'} side of the space the shadow is cast in.`);
            break;
          }
        }
      }
      this.wSide = side;
    }
    // a cell turning inside out in the shadow
    if (n === 4 && o.facets && app.effProj() !== 'stereo') {
      const persp = app.effProj() === 'persp';
      const side = new Int8Array(o.facets.length);
      o.facets.forEach((f, i) => {
        const c = [0, 0, 0, 0];
        for (const v of f) for (let k = 0; k < 4; k++) c[k] += X[v * 4 + k] / f.length;
        const d = Math.hypot(c[0], c[1], c[2], c[3]);
        const uw = c[3] / d;
        side[i] = (persp ? uw * s.D - d : uw) >= 0 ? 1 : -1;
      });
      if (this.cellSide && this.cellSide.length === side.length) {
        for (let i = 0; i < side.length; i++) {
          if (side[i] !== this.cellSide[i]) {
            out.push(persp
              ? `Cell ${i + 1} of ${side.length} turned inside out in the shadow: its hyperplane swept through the eye at W = ${s.D.toFixed(2)}.`
              : `Cell ${i + 1} of ${side.length} went edge-on to the screen and came back mirrored: its orientation in the shadow flipped.`);
            break;
          }
        }
      }
      this.cellSide = side;
    }
    // two vertices on one point of the shadow
    if (o.nv <= 128 && app.vpos) {
      const P = app.vpos, eps = 0.012 * (app.fitR || 1);
      let pair = '';
      for (let a = 0; a < o.nv && !pair; a++) for (let b = a + 1; b < o.nv; b++) {
        const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < eps * eps) { pair = `${a}:${b}`; break; }
      }
      if (pair && pair !== this.together) {
        const [a, b] = pair.split(':').map(Number);
        out.push(`${app._vertexLabel(a)} and ${app._vertexLabel(b)} land on one point of the shadow: distinct in ${n}D, one dot on screen.`);
      }
      this.together = pair;
    }
    return out;
  }

  /** the next experiment the visitor has not met, or null */
  suggestion(app) {
    for (const r of SUGGEST) if (!this.tried.has(r.id) && r.when(app)) return r;
    return null;
  }

  text() {
    return ['Dimensions, session log', ...this.log.map((l) => `[${l.stamp}] ${l.text}`)].join('\n');
  }
}

export const SUGGEST = [
  { id: 'tour', when: () => true, text: 'Walk the ladder from a point to the tesseract.', act: (a) => a.tour(0) },
  { id: 'slice', when: () => true, text: 'Cut the tesseract corner first and watch the cut change its name.', act: (a) => { if (a.s.n !== 4) a.setDim(4); a.set({ obj: 'cube', view: 'both', proj: 'persp', preset: 'hold', sweep: true }); a.cutPreset('vertex'); } },
  { id: 'iso', when: () => true, text: 'Turn two planes at equal speed under stereographic projection: the paths link.', act: (a) => { if (a.s.n !== 4) a.setDim(4); a.set({ obj: 'cube', proj: 'stereo', preset: 'iso', trails: true, view: 'shadow' }); } },
  { id: 'flow', when: () => true, text: 'Let the 600-cell flow along its own 12 Hopf circles.', act: (a) => { if (a.s.n !== 4) a.setDim(4); a.set({ obj: 'c600', proj: 'stereo', preset: 'fibre', trails: true, view: 'shadow' }); } },
  { id: 'facet', when: (a) => a.s.n >= 3, text: 'Pick a facet and read the Schlegel diagram beside the shadow.', act: (a) => { a.inset.mode = 'schlegel'; a.nextFacet(1); a.ui.sync(); } },
  { id: 'hidden2', when: (a) => a.s.n >= 5, text: 'Turn a plane between two hidden axes, such as W–V.', act: (a) => a.set({ plane: [3, 4], preset: 'single' }) },
  { id: 'high', when: () => true, text: 'Climb to 7D, where one shadow can no longer keep the corners apart.', act: (a) => a.setDim(7) },
  { id: 'hopf', when: () => true, text: 'Drag a point on the base sphere and watch its Hopf circle move.', act: (a) => { if (a.s.n !== 4) a.setDim(4); a.set({ obj: 'hopf' }); } },
  { id: 'c120', when: () => true, text: 'Open the 120-cell: 600 vertices, 120 dodecahedra.', act: (a) => { if (a.s.n !== 4) a.setDim(4); a.set({ obj: 'c120', proj: 'stereo', preset: 'single' }); } },
  { id: 'ask', when: () => true, text: 'Ask the witness something it was not scripted for.', act: () => document.getElementById('q').focus() },
];

/* ---------------- number checks for model replies ---------------- */

const CITED_YEARS = [1833, 1852, 1884, 1893, 1901, 1927, 1931, 1973, 1990, 2008];

/** every number a reply may quote: those in the live state plus small integers and cited years */
export function knownNumbers(stateJSON, extra = []) {
  const set = new Set(extra);
  for (const m of stateJSON.matchAll(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)) set.add(parseFloat(m[0]));
  for (let k = 0; k <= 10; k++) set.add(k);
  for (const y of CITED_YEARS) set.add(y);
  return [...set];
}

/**
 * @returns {{ok: boolean, bad: number[]}} numbers in text not within 1% of a known number
 */
export function checkNumbers(text, known) {
  const bad = [];
  const cleaned = text.replace(/\b[A-Z]\d+\b/g, ' ').replace(/\{[\d,\s]+\}/g, ' ').replace(/\d+D\b/g, (m) => m.slice(0, -1));
  for (const m of cleaned.matchAll(/-?\d+(?:[.,]\d+)*/g)) {
    const raw = m[0].replace(/,(\d{3})/g, '$1');
    const v = parseFloat(raw);
    if (!isFinite(v)) continue;
    const hit = known.some((k) => (k === 0 ? Math.abs(v) < 1e-3 : Math.abs(v - k) <= 0.01 * Math.abs(k)) || Math.abs(Math.abs(v) - Math.abs(k)) <= 0.01 * Math.abs(k));
    if (!hit) bad.push(v);
  }
  return { ok: bad.length === 0, bad };
}
