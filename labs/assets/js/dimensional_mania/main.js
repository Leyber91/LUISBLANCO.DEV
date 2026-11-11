/* ============================================================
   dimensional_mania/main.js — the Dimensions instrument (WITNESS).

   State lives here; the engine computes, the views draw:
     engine   linalg.js · polytopes.js · slice.js · project.js
     config   constants.js
     views    stage3d.js (WebGL) · panels.js (2D) · inset.js (second view)
              · controls.js (DOM)
     voice    narrator.js · observer.js (+ one model call per question
              through ai/llm.js)
     keep     share.js (URL state, SVG plate) and the exports below

   The pose is a matrix R in SO(n). Each frame the motion turns it, the
   object is turned (X = R·V), projected, sliced and measured. Coordinate
   plane motions act in world space (R <- G·R); the Hopf flow acts in the
   object's own frame (R <- R·exp(theta G)) so every vertex stays on its own
   Hopf circle. Nothing is pre-baked.
   ============================================================ */

import { CONFIG, RENDER, TIERS, TIER_ORDER, nextTier, PRESETS, FLOW_OMEGA, SEED_TURNS, TOUR, AXES, PALETTE, PROJECTIONS, VIEWS } from './constants.js';
import { eye, mul, leftGivens, orthonormalize, generatorSpeeds, generatorOf, poseAngles, alignRotation, canonicalPlanes, rotationChecks } from './linalg.js';
import { build, catalogue, linkingNumber, fibration, hopfFibre } from './polytopes.js';
import { slice, turn, cubeSection } from './slice.js';
import { projectAll, stereoArcs, applyAll, perspScale, STEREO_CLIP, powers, axisExtremes, shadowLedger } from './project.js';
import { Stage } from './stage3d.js';
import { MatrixView, ProfileView, CountsView, LedgerView, Reticle } from './panels.js';
import { SecondView, cutDirection } from './inset.js';
import { ambientLines, eventLine, answerLocally, SYSTEM, promptFor, validateShow, cleanAnswer, labelLedger, ledgerLine, witnessHotLine } from './narrator.js';
import { Observer, checkNumbers, knownNumbers } from './observer.js';
import { encodeState, decodeState, decodePose, copyText, plateSVG, download, withPngState, stateFromFile } from './share.js';
import { Controls } from './controls.js';
import { resolveMotion, sgn, escapeHTML, fmt } from './dom.js';
import { LLM } from '../ai/llm.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const $ = (id) => document.getElementById(id);
const defaultPlane = (n) => (n >= 4 ? [0, 3] : n === 3 ? [0, 2] : [0, 1]);
const lerp3 = (a, b, t, out, o) => { out[o] = a[0] + (b[0] - a[0]) * t; out[o + 1] = a[1] + (b[1] - a[1]) * t; out[o + 2] = a[2] + (b[2] - a[2]) * t; };

/* a stage that draws nothing, so the instrument still counts, slices and
   speaks when WebGL is unavailable */
class NullStage {
  constructor() {
    const dyn = () => ({ room: (c) => ({ pos: new Float32Array(c * 3), col: new Float32Array(c * 3) }), commit() {}, visible() {}, pos: new Float32Array(0) });
    Object.assign(this, { ok: false, trails: dyn(), sliceFaces: dyn(), sliceLines: dyn(), slicePts: dyn(), arcs: dyn(), facetLines: dyn(), fibres: dyn(), mark: dyn() });
    this.camera = { position: { length: () => 10, x: 3.4, z: 9.4 }, fov: 48 };
  }
  setObject(o) { this.vpos = new Float32Array(o.nv * 3); this.vcol = new Float32Array(o.nv * 3); return { pos: this.vpos, col: this.vcol }; }
  commitShadow() {} shadowVisible() {} setSheet() {} fit() {} setLift() {} resize() {} render() {} setTier() {} resetView() {}
  setLineOpacity() {} setZoom() {} zoom() { return 10.3; }
  async png() { return null; }
  screenOf() { return [0, 0, 0]; }
}

function autoTier() {
  const phone = window.matchMedia('(max-width: 820px)').matches;
  const cores = navigator.hardwareConcurrency || 8;
  return phone || cores <= 4 ? 'lite' : 'full';
}

class App {
  constructor() {
    const m = resolveMotion();
    this.reduced = m.reduced;
    this.still = m.still;
    this.paused = this.reduced;
    const q = new URLSearchParams(location.search);
    this.flags = ['still', 'motion', 'tier'].filter((k) => q.has(k)).map((k) => (q.get(k) ? `${k}=${q.get(k)}` : k));
    this.tierChoice = TIER_ORDER.includes(q.get('tier')) ? q.get('tier') : 'auto';
    this.tierId = this.tierChoice === 'auto' ? autoTier() : this.tierChoice;

    const url = decodeState(location.search);
    const st = CONFIG.start;
    this.s = { n: st.n, obj: st.obj, view: st.view, proj: st.proj, preset: st.preset, plane: st.plane.slice(), sweep: st.sweep, trails: st.trails, h: 0.12, D: CONFIG.foldDistance, speed: CONFIG.speed };
    if (url.n) {
      this.s.n = url.n;
      if (url.n >= CONFIG.orthoFrom) this.s.proj = 'ortho';
      if (url.n !== 4 || !url.obj) this.s.obj = 'cube';
      if (!url.plane) this.s.plane = defaultPlane(url.n);
    }
    for (const k of ['view', 'proj', 'preset', 'h', 'sweep', 'trails', 'D', 'speed']) if (url[k] !== undefined) this.s[k] = url[k];
    if (url.obj && catalogue(this.s.n).some((c) => c.id === url.obj)) this.s.obj = url.obj;
    if (url.plane && url.plane[1] < this.s.n && url.plane[0] < url.plane[1]) this.s.plane = url.plane;
    if (this.s.plane[1] >= this.s.n) this.s.plane = defaultPlane(this.s.n);
    this.s.D = Math.max(CONFIG.foldRange[0], Math.min(CONFIG.foldRange[1], this.s.D));
    if (this.reduced && url.sweep === undefined) this.s.sweep = false;

    const stage = new Stage($('gl'), TIERS[this.tierId]);
    this.stage = stage.ok ? stage : new NullStage();
    if (!stage.ok) { const n = $('nogl'); if (n) n.hidden = false; }

    this.matrix = new MatrixView($('matrix'), $('matnote'));
    this.profileView = new ProfileView($('profile'));
    this.counts = new CountsView($('counts'));
    this.ledger = new LedgerView($('ledger'), $('ledgerHead'));
    this.reticle = new Reticle($('reticle'));
    this.inset = new SecondView($('inset'), this);
    this.obs = new Observer();

    this.R = (url.pose && decodePose(url.pose, this.s.n)) || this._seedPose(this.s.n);
    if (!url.pose && build(this.s.obj, this.s.n).curved) { this.s.n = 4; this.setPose('tilt'); }
    this.turned = 0;
    this.rVersion = 0;
    this.ign = this.reduced ? 1 : 0;
    this.ignFrom = 0;
    this.ignDur = Math.min(CONFIG.ignitionPerAxis * this.s.n, 3.2);
    this.sweepPhase = Math.asin(Math.max(-1, Math.min(1, this.s.h)));
    this.sweepAmp = 1;
    this.tourIdx = -1;
    this.frameNo = 0;
    this.ft = [];
    this.link = null;
    this.prevCtx = null;
    this.eventUntil = 0; this.ambUntil = 0; this.ambIdx = -1; this.ambKey = '';
    this.grab = false;
    this.pick = null;
    this.facetIdx = 0;
    this.matShow = 'R';
    this.poseKind = null;
    this.drawer = null;
    this.scratch = { RA: null, tmp: null, P: null };

    this._rebuild(true);
    this._motion();
    this.ui = new Controls(this);
    this.ui.sync();
    mountRoutePanel($('route'));
    this._layout();
    this._canvasHands();
    window.addEventListener('resize', () => { this._layout(); this.stage.resize(); });
    window.addEventListener('keydown', () => { if (this.ign < 1) this.ign = 1; }, { capture: true });
    if (url.inset) this.inset.mode = url.inset;
    if (url.facet && this.o.facets) { this.facetIdx = Math.min(url.facet, this.o.facets.length - 1); this.showFacet = true; }
    if (url.drawer) this.ui.drawer(url.drawer);
    this.ui.sync();
    if (url.tour !== undefined) this.tour(url.tour);
    this.obs.note(`opened ${this.o.name} in ${this.s.n}D`);
    if (q.has('debug')) {
      window.__dim = this;
      setInterval(() => console.log('dbg ' + JSON.stringify({ f: this.frameNo, ign: +this.ign.toFixed(2), tier: this.tierId, tc: this.tierChoice, nft: this.ft.length, mft: this.ft.length ? +(this.ft.reduce((a, b) => a + b, 0) / this.ft.length).toFixed(3) : null, pn: Math.round(performance.now()), view: this.effView(), prof: this.prof ? this.prof.samples : null, cut: this.cut && this.cut.name, link: this.link && +this.link.value.toFixed(3), h: +this.s.h.toFixed(3), preset: this.s.preset })), 1500);
    }

    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  /* ---------------- derived state ---------------- */

  effProj() {
    const { n, proj } = this.s;
    if (n <= 3) return 'ortho';
    if (proj === 'stereo' && n !== 4) return n >= CONFIG.orthoFrom ? 'ortho' : 'persp';
    return proj;
  }
  sliceAllowed() { return this.s.n >= 2 && !this.o.curved && this.effProj() !== 'stereo'; }
  effView() { return this.sliceAllowed() ? this.s.view : 'shadow'; }
  sliceOn() { return this.effView() !== 'shadow'; }
  trailsAllowed() { return !this.o.curved && this.o.nv <= TIERS[this.tierId].trailVerts && this.s.n >= 2; }
  flowAllowed() { return this.s.n === 4 && !this.o.curved; }

  _seedPose(n) {
    const R = eye(n);
    const turns = SEED_TURNS[n] || (n > 4 ? SEED_TURNS.high : []);
    for (const [i, j, t] of turns) if (j < n) leftGivens(R, n, i, j, t);
    return R;
  }

  setPose(kind) {
    const n = this.s.n;
    if (kind === 'identity') this.R = eye(n);
    else if (kind === 'tilt') { // the standard frame, tipped toward the camera without touching W
      this.R = eye(n);
      if (n >= 3) { leftGivens(this.R, n, 1, 2, 0.55); leftGivens(this.R, n, 0, 2, 0.25); }
    } else if (kind && kind.align) {
      const R = alignRotation(kind.align, n - 1, n);
      // turns that leave the last axis alone: the cut is unchanged, the view reads better
      if (n === 4) { leftGivens(R, 4, 0, 2, 0.42); leftGivens(R, 4, 1, 2, 0.3); }
      if (n === 3) leftGivens(R, 3, 0, 1, 0.3);
      if (n > 4) { leftGivens(R, n, 0, 2, 0.4); leftGivens(R, n, 1, 3, 0.3); }
      this.R = R;
    } else this.R = this._seedPose(n);
    this.poseKind = kind && kind.kind ? kind.kind : null;
    this.turned = 0;
    this.rVersion++;
    this.trailDirty = true;
    this._urlDirty = true;
  }

  /** cut presets: put a vertex, edge, face or cell on the last axis */
  cutPreset(kind) {
    const dir = cutDirection(this.o, kind);
    if (!dir) return;
    this.setPose({ align: Array.from(dir), kind });
    if (this.s.preset !== 'hold') this.set({ preset: 'hold' });
    if (!this.sliceOn()) this.set({ view: 'both' });
    this.set({ sweep: true });
    this.sweepPhase = -Math.PI / 2;
    this.obs.try('slice');
    this.obs.note(`cut ${this.o.name} ${kind} first`);
  }

  _rebuild(snap) {
    const s = this.s;
    this.o = build(s.obj, s.n);
    const o = this.o, n = s.n;
    this.X = new Float64Array(o.V.length);
    this.Xk = new Float64Array(o.V.length);
    this.depth = new Float32Array(o.nv);
    this.stress = new Float64Array(n);
    this.ext = axisExtremes(n);
    this.axisScale = new Float64Array(n).fill(1);
    this.arcMode = this.effProj() === 'stereo';
    this.arcSub = o.curved ? 1 : TIERS[this.tierId].arcSub;
    const b = this.stage.setObject(o, this.arcMode, this.arcSub);
    this.vpos = b.pos; this.vcol = b.col;
    this.fitR = this._sampleFit();
    this.stage.fit(this.fitR, this._fitTarget(), snap !== false);
    this.stage.setLineOpacity(n >= RENDER.highDim ? RENDER.lineOpacityHigh : RENDER.lineOpacity);
    this.ledger.build(n, this.effProj());
    this.counts.render(o);
    this.trailDirty = true;
    this.job = null; this.prof = null;
    this.sides = null;
    this.linkPick = null;
    if (this.pick != null && this.pick >= o.nv) this.pick = null;
    if (!o.facets || this.facetIdx >= o.facets.length) this.facetIdx = 0;
    this.obs.reset();
    this._urlDirty = true;
  }

  /** a rotation-independent framing radius: the largest projected radius over random poses */
  _sampleFit() {
    const o = this.o, n = this.s.n, mode = this.effProj();
    if (n <= 3) return 1;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const X = new Float64Array(o.V.length), P = new Float32Array(o.nv * 3);
    const rs = [];
    const step = Math.max(1, Math.floor(o.nv / 400));
    for (let t = 0; t < 14; t++) {
      const Q = eye(n);
      for (let k = 0; k < 3 * n; k++) { const i = Math.floor(rnd() * n); let j = Math.floor(rnd() * n); if (j === i) j = (i + 1) % n; leftGivens(Q, n, Math.min(i, j), Math.max(i, j), rnd() * 6.283); }
      turn(o, Q, X);
      projectAll(X, n, o.nv, mode, this.s.D, P);
      const r = [];
      for (let v = 0; v < o.nv; v += step) r.push(Math.hypot(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]));
      r.sort((a, b) => a - b);
      rs.push(mode === 'stereo' ? r[Math.floor(r.length * 0.8)] : r[r.length - 1]);
    }
    rs.sort((a, b) => a - b);
    return mode === 'stereo' ? Math.max(1.2, rs[Math.floor(rs.length / 2)]) : rs[Math.floor(rs.length * 0.85)];
  }

  _motion() {
    const s = this.s, n = s.n;
    this.flow = null;
    if (s.preset === 'fibre') {
      const f = this.flowAllowed() ? fibration(this.o) : null;
      if (f) this.flow = f; else s.preset = 'single';
    }
    this.spin = n >= 2 && !this.flow ? PRESETS[s.preset].build(n, s.plane) : [];
    this.spinScaled = this.spin.map((p) => ({ ...p, omega: p.omega * s.speed }));
    const w = FLOW_OMEGA * s.speed;
    this.A = this.flow ? Float64Array.from(this.flow.G, (x) => x * w) : generatorOf(this.spinScaled, n);
    this.speeds = this.flow ? [w, w] : generatorSpeeds(this.spinScaled, n);
    this.trailDirty = true;
    this.linkPick = null;
    this.flowTrail = null;
  }

  moving() { return this.flow ? this.s.speed > 0 : this.spinScaled.length > 0; }

  /** one step of the motion over dt: world-plane turns, or the flow exp(theta G) */
  _step(dt) {
    const n = this.s.n;
    if (this.flow) {
      const th = FLOW_OMEGA * this.s.speed * dt, c = Math.cos(th), sn = Math.sin(th), G = this.flow.G;
      const M = new Float64Array(16);
      for (let i = 0; i < 16; i++) M[i] = sn * G[i] + (i % 5 === 0 ? c : 0);
      return M;
    }
    const M = eye(n);
    for (const p of this.spinScaled) leftGivens(M, n, p.i, p.j, p.omega * dt);
    return M;
  }

  /* ---------------- setters (the controls call these) ---------------- */

  set(p) {
    const s = this.s;
    let rebuild = false, motion = false;
    if (p.obj !== undefined && p.obj !== s.obj && catalogue(s.n).some((c) => c.id === p.obj)) {
      const was = build(s.obj, s.n).curved;
      s.obj = p.obj;
      const now = build(s.obj, s.n).curved;
      if (now && p.proj === undefined) s.proj = 'stereo';
      if (now) this.setPose('tilt');
      if (was && !now && p.proj === undefined && s.proj === 'stereo') s.proj = 'persp';
      rebuild = true; motion = true;
      if (s.n === 4 && p.preset === undefined && (s.obj === 'c120' || s.obj === 'c600') && s.preset === 'all') s.preset = 'single';
      this.obs.note(`object: ${build(s.obj, s.n).name}`);
      if (s.obj === 'c120') this.obs.try('c120');
      if (s.obj === 'hopf') this.obs.try('hopf');
    }
    if (p.view !== undefined && p.view !== s.view) { s.view = p.view; if (p.view !== 'shadow') this.obs.try('slice'); }
    if (p.proj !== undefined && p.proj !== s.proj) { s.proj = p.proj; rebuild = true; }
    if (p.preset !== undefined && p.preset !== s.preset) {
      s.preset = p.preset; motion = true;
      if (p.preset === 'iso') this.obs.try('iso');
      if (p.preset === 'fibre') this.obs.try('flow');
      this.obs.note(`motion: ${PRESETS[p.preset].label}`);
    }
    if (p.plane && p.plane[1] < s.n && p.plane[0] < p.plane[1]) {
      if (p.plane[0] !== s.plane[0] || p.plane[1] !== s.plane[1]) this.turned = 0;
      s.plane = p.plane.slice(); motion = true;
      if (p.plane[0] >= 3) this.obs.try('hidden2');
    }
    if (p.speed !== undefined) { s.speed = p.speed; motion = true; }
    if (p.D !== undefined) { s.D = Math.max(CONFIG.foldRange[0], Math.min(CONFIG.foldRange[1], p.D)); this._fitSoon = true; this.trailDirty = true; }
    if (p.h !== undefined) s.h = Math.max(-1, Math.min(1, p.h));
    if (p.sweep !== undefined) { s.sweep = p.sweep; if (s.sweep) this.sweepPhase = Math.asin(Math.max(-1, Math.min(1, s.h / (this.sweepAmp || 1)))); }
    if (p.trails !== undefined) { s.trails = p.trails; this.trailDirty = true; }
    if (rebuild) this._rebuild(true);
    if (motion || rebuild) this._motion();
    if (p.proj !== undefined || rebuild) this.ledger.build(s.n, this.effProj());
    this._urlDirty = true;
    this.ui.sync();
  }

  setDim(n) {
    const s = this.s;
    n = Math.max(CONFIG.minDim, Math.min(CONFIG.maxDim, n));
    if (n === s.n) return;
    const old = s.n, Rold = this.R;
    s.n = n;
    if (!catalogue(n).some((c) => c.id === s.obj)) s.obj = 'cube';
    if (s.plane[1] >= n) { s.plane = defaultPlane(n); this.turned = 0; }
    if (old < 4 && n >= 4 && s.plane[1] < 3) { s.plane = defaultPlane(n); this.turned = 0; }
    if (s.proj === 'stereo' && n !== 4) s.proj = n >= CONFIG.orthoFrom ? 'ortho' : 'persp';
    if (old < CONFIG.orthoFrom && n >= CONFIG.orthoFrom && s.proj === 'persp') s.proj = 'ortho';
    if (old >= CONFIG.orthoFrom && n < CONFIG.orthoFrom && s.proj === 'ortho') s.proj = 'persp';
    if (s.preset === 'fibre' && n !== 4) s.preset = 'double';
    if (n > old) {
      // keep the pose and drag the object out along the new axes
      const R = eye(n);
      for (let i = 0; i < old; i++) for (let j = 0; j < old; j++) R[i * n + j] = Rold[i * old + j];
      this.R = R;
      if (!this.reduced) { this.ignFrom = old; this.ign = 0; this.ignDur = Math.min(CONFIG.ignitionPerAxis * (n - old), 2.4); }
    } else {
      this.R = this._seedPose(n);
      this.ign = 1;
    }
    this.poseKind = null;
    this.rVersion++;
    this._rebuild(true);
    this._motion();
    this._urlDirty = true;
    if (n >= 7) this.obs.try('high');
    this.obs.note(`dimension ${n}: ${this.o.name}, ${fmt(this.o.nv)} vertices, ${fmt(this.o.ne)} edges`);
    this.ui.sync();
  }

  dual() {
    const d = this.o.dual;
    if (!d || d === this.s.obj) { this.obs.note(`${this.o.name} is its own dual`); this.ui.witness(`The ${this.o.name} is its own dual: the centres of its facets are the vertices of a copy of it.`, 'event'); this.eventUntil = performance.now() + CONFIG.eventHold; return; }
    const was = this.o;
    this.set({ obj: d });
    const rev = was.fvec.map((f) => f.count).reverse().join(', ');
    this.ui.witness(`The dual of the ${was.name} is the ${this.o.name}: one vertex at the centre of each facet. Its f-vector ${this.o.fvec.map((f) => f.count).join(', ')} is the old one reversed (${rev}).`, 'event');
    this.eventUntil = performance.now() + CONFIG.eventHold;
  }

  togglePause() { if (this.reduced) return; this.paused = !this.paused; this.ui.sync(); }
  dialGrab(on) { this.grab = on; }
  turn(d, plane) {
    const s = this.s;
    if (s.n < 2) return;
    const p = plane || s.plane;
    leftGivens(this.R, s.n, p[0], p[1], d);
    if (!plane || (plane[0] === s.plane[0] && plane[1] === s.plane[1])) this.turned += d;
    this.poseKind = null;
    this.rVersion++;
    this.trailDirty = true;
    this._urlDirty = true;
  }

  nextFacet(d) {
    const f = this.o.facets;
    if (!f || !f.length) return;
    this.facetIdx = (this.facetIdx + d + f.length) % f.length;
    this.showFacet = true;
    this.obs.try('facet');
    this.ui.sync();
  }

  probeMoved() { this.obs.try('hopf'); }

  setTier(choice) {
    this.tierChoice = choice;
    this._applyTier(choice === 'auto' ? autoTier() : choice);
  }
  _applyTier(id) {
    if (id === this.tierId && this.o) { this.ui && this.ui.sync(); return; }
    this.tierId = id;
    this.stage.setTier(TIERS[id]);
    this._rebuild(false);
    this.ui.sync();
    this.obs.note(`tier: ${id}`);
  }

  /* ---------------- hands on the canvas ----------------
     click: pick the nearest vertex · shift-drag, or two fingers: turn the
     selected plane · any press during the opening: skip it */
  _canvasHands() {
    const cv = $('gl');
    const pts = new Map();
    let shiftDrag = null, down = null;
    cv.addEventListener('pointerdown', (ev) => {
      if (this.ign < 1) this.ign = 1;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      if ((ev.shiftKey && ev.pointerType === 'mouse') || pts.size === 2 || this.handTurn) {
        shiftDrag = { x: avgX() };
        if (this.stage.controls) this.stage.controls.enabled = false;
      }
    }, { capture: true });
    const avgX = () => { let s = 0; for (const p of pts.values()) s += p.x; return s / Math.max(1, pts.size); };
    cv.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (shiftDrag) {
        const x = avgX();
        this.turn((x - shiftDrag.x) * 0.008);
        shiftDrag.x = x;
        this.obs.try('hands');
      }
    });
    const up = (ev) => {
      pts.delete(ev.pointerId);
      if (shiftDrag && pts.size < 2 && !(ev.shiftKey && ev.pointerType === 'mouse' && pts.size) && !(this.handTurn && pts.size)) {
        shiftDrag = null;
        if (this.stage.controls) this.stage.controls.enabled = true;
      }
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4 && performance.now() - down.t < 400) this._pickAt(ev.clientX, ev.clientY);
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  _pickAt(x, y) {
    const o = this.o;
    if (o.curved || !this.stage.ok) return;
    let best = -1, bd = RENDER.pickPx * RENDER.pickPx;
    for (let v = 0; v < o.nv; v++) {
      const [sx, sy] = this.stage.screenOf(this.vpos[v * 3], this.vpos[v * 3 + 1], this.vpos[v * 3 + 2]);
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    this.pick = best >= 0 ? best : null;
    if (best >= 0) { this.obs.try('pick'); this.obs.note(`picked ${this._vertexLabel(best)}`); }
  }

  /* ---------------- the ladder ---------------- */

  tour(k) {
    if (k < 0) k = 0;
    if (k >= TOUR.length) { this.tourEnd(); return; }
    this.tourIdx = k;
    this.obs.try('tour');
    const st = TOUR[k].state;
    if (st.n !== undefined) this.setDim(st.n);
    const p = {};
    for (const key of ['obj', 'view', 'proj', 'preset', 'plane', 'trails']) if (st[key] !== undefined) p[key] = st[key];
    if (st.sweep !== undefined) p.sweep = st.sweep;
    this.set(p);
    if (st.pose) this.setPose(st.pose);
    if (st.sweep) this.sweepPhase = -Math.PI / 2;
    else if (st.n >= 3 && st.view && st.view !== 'shadow') this.s.h = 0;
    this.paused = this.reduced;
    this.ui.showTour(k);
    this.ui.sync();
    this.ambUntil = 0;
    this.obs.note(`ladder step ${k + 1}: ${TOUR[k].title}`);
  }
  tourEnd(quiz) { this.tourIdx = -1; this.ui.hideTour(); if (quiz) this.ui.showQuiz(); }

  /* the three questions after the ladder, checked against the live engine */
  quizAnswer(i, raw) {
    const a = String(raw).trim().toLowerCase();
    const c5 = build('cube', 5);
    const qs = [
      { want: c5.fvec[3].count, why: `The 5-cube’s 3-faces number C(5,3) · 2² = ${c5.fvec[3].count}: choose 3 free axes out of 5 and fix the other 2 at ±1. The counts table shows the same for the penteract.` },
      { want: 15, why: 'Every pair of axes spans a plane: 6 · 5 / 2 = 15 in 6D. The plane grid shows them.' },
      { want: 'octahedron', why: (() => { const R = alignRotation([1, 1, 1, 1], 3, 4), o = build('cube', 4); return `The engine cuts the tesseract corner first at its centre and counts ${slice(o, turn(o, R), 0).counts.join(', ')} vertices, edges, faces: an ${slice(o, turn(o, R), 0).name}.`; })() },
    ];
    const q = qs[i];
    const ok = typeof q.want === 'number' ? parseFloat(a) === q.want : a.includes(q.want);
    this.obs.note(`quiz ${i + 1}: answered "${raw}", ${ok ? 'right' : 'wrong'}`);
    return { ok, text: ok ? `Right. ${q.why}` : `Not quite. ${q.why}` };
  }

  /* ---------------- the frame ---------------- */

  _frame(now) {
    requestAnimationFrame(this._frame);
    if (document.hidden) { this._last = 0; return; }
    const raw = this._last ? (now - this._last) / 1000 : 0;
    const dt = Math.min(0.05, raw);
    this._last = now;
    this.frameNo++;
    this._perf(raw);
    const s = this.s, n = s.n, o = this.o;

    // the opening extrusion runs on wall time, so a slow device still finishes it
    const wasIgniting = this.ign < 1;
    if (this.ign < 1) this.ign = Math.min(1, this.ign + Math.min(raw, 0.25) / this.ignDur);
    for (let k = 0; k < n; k++) {
      const span = n - this.ignFrom;
      const t = k < this.ignFrom ? 1 : Math.max(0, Math.min(1, this.ign * span - (k - this.ignFrom)));
      this.axisScale[k] = t * t * (3 - 2 * t);
    }
    const igniting = this.ign < 1;
    if (wasIgniting) this._ignitionCounts(igniting);

    const moving = !this.paused && !this.reduced && !this.grab && !igniting;
    if (moving && this.moving() && dt > 0) {
      const M = this._step(dt);
      this.R = this.flow ? mul(this.R, M, n) : mul(M, this.R, n);
      if (!this.flow) for (const p of this.spinScaled) if (p.i === s.plane[0] && p.j === s.plane[1]) this.turned += p.omega * dt;
      this.rVersion++;
      this.poseKind = null;
      if (this.frameNo % 120 === 0) orthonormalize(this.R, n);
    }

    // the turned object: X = R · diag(axis scale) · V
    let RA = this.R;
    if (igniting) {
      if (!this.scratch.RA || this.scratch.RA.length !== n * n) this.scratch.RA = new Float64Array(n * n);
      RA = this.scratch.RA;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) RA[i * n + j] = this.R[i * n + j] * this.axisScale[j];
    }
    turn(o, RA, this.X);

    if (s.sweep && this.sliceOn() && moving) {
      let hmax = 0;
      for (let v = 0; v < o.nv; v++) hmax = Math.max(hmax, Math.abs(this.X[v * n + n - 1]));
      this.sweepAmp += (Math.min(1, hmax + 0.05) - this.sweepAmp) * 0.05;
      this.sweepPhase += (dt * 2 * Math.PI) / CONFIG.sweepPeriod;
      s.h = this.sweepAmp * Math.sin(this.sweepPhase);
    }

    this._shadow();
    this._slice(igniting);
    this._trails(moving, igniting);
    this._overlays();
    if (this.frameNo % 20 === 1) this._linking();

    if (this._fitSoon && this.frameNo % 10 === 0) { this._fitSoon = false; this.fitR = this._sampleFit(); }
    this.stage.fit(this.fitR, this._fitTarget(), false);
    this._reticle();
    this.stage.render();
    this._pickTag();

    if (this.frameNo % 3 === 0) this.matrix.draw(this.matShow === 'A' ? this.A : this.R, n, n >= 2 ? s.plane : null, this.matShow);
    this._profileTick(igniting);
    if (this.frameNo % 2 === 0 && this.sliceOn()) this.profileView.draw(this.prof, s.h, n, this.cut && this.cut.measure);
    if (this.frameNo % 3 === 0) this._ledgerTick();
    if (this.frameNo % 3 === 1) this.inset.draw();
    if (this.frameNo % 6 === 0) this._readouts();
    if (this.drawer === 'mech' && this.frameNo % 6 === 3) this.ui.drawerText(this.mechanismText());
    if (now - (this._narrT || 0) > CONFIG.narrateEvery) { this._narrT = now; this._narrate(now); }
    if (now - (this._srT || 0) > 1000) { this._srT = now; this._summary(); }
    if (this._urlDirty && now - (this._urlT || 0) > 500) { this._urlT = now; this._urlDirty = false; this._writeURL(); }

    if (this.frameNo === 2) { const v = $('loading'); if (v) { v.classList.add('gone'); setTimeout(() => v.remove(), 700); } }
  }

  /** during the opening, the counts tick with the extrusion: point, segment, square, cube ... */
  _ignitionCounts(igniting) {
    const o = this.o, n = this.s.n;
    if (!igniting) { this.counts.render(o); this._ignK = null; return; }
    if (o.family !== 'cube') return;
    const k = Math.min(n, Math.floor(this.ign * (n - this.ignFrom)) + this.ignFrom + 1);
    if (k !== this._ignK && k >= 1) { this._ignK = k; this.counts.render(build('cube', k)); }
  }

  _ramp(t, k, out, o) {
    const P = PALETTE;
    if (t < 0.5) lerp3(P.far, P.mid, t * 2, out, o); else lerp3(P.mid, P.near, (t - 0.5) * 2, out, o);
    out[o] *= k; out[o + 1] *= k; out[o + 2] *= k;
  }

  _shadow() {
    const s = this.s, n = s.n, o = this.o, mode = this.effProj();
    projectAll(this.X, n, o.nv, mode, s.D, this.vpos, this.stress, this.depth, this.ext);
    const view = this.effView();
    const k = view === 'both' ? RENDER.bothDim : this.flow ? RENDER.flowDim : 1;
    const col = this.vcol;
    if (o.id === 'hopf') {
      const ringK = [1, 0.9, 0.72, 0.55];
      const hi = this._hopfPair();
      for (let v = 0; v < o.nv; v++) this._ramp(0.35 + 0.65 * this.depth[v], ringK[o.ring[v]] * 0.9, col, v * 3);
      for (const [f, c] of [[hi[0], PALETTE.goldSoft], [hi[1], PALETTE.gold]]) {
        for (let v = f.start; v < f.start + f.count; v++) { col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; }
      }
    } else {
      const lift = n <= 3 ? 0.35 : 0;
      for (let v = 0; v < o.nv; v++) this._ramp(lift + (1 - lift) * this.depth[v], k, col, v * 3);
    }
    if (this.arcMode) {
      const room = this.stage.arcs.room(o.ne * this.arcSub * 2);
      const vc = this.vcol;
      const count = stereoArcs(this.X, o, this.arcSub, room.pos, room.col, (a, b, t, out, at) => {
        out[at] = vc[a * 3] + (vc[b * 3] - vc[a * 3]) * t;
        out[at + 1] = vc[a * 3 + 1] + (vc[b * 3 + 1] - vc[a * 3 + 1]) * t;
        out[at + 2] = vc[a * 3 + 2] + (vc[b * 3 + 2] - vc[a * 3 + 2]) * t;
      }, this.fitR * RENDER.stereoFade, Math.min(STEREO_CLIP, this.fitR * RENDER.stereoClipFit));
      this.arcCount = count;
      this.stage.commitShadow(count);
    } else this.stage.commitShadow();
    this.stage.shadowVisible(view !== 'slice');
  }

  _hopfPair() {
    const f = this.o.fibres;
    return [f.find((x) => x.ring === 2), f.find((x) => x.ring === 1)];
  }

  /** project points (stride 4, on the unit sphere) and write them as a closed polyline of segments */
  _circleSegs(P4, count, room, w, color, k = 1) {
    const mode = this.effProj();
    if (!this.scratch.P || this.scratch.P.length < count * 3) this.scratch.P = new Float32Array(count * 3);
    const P = this.scratch.P;
    projectAll(P4, 4, count, mode, this.s.D, P);
    const clip = Math.min(STEREO_CLIP, this.fitR * 2.4);
    for (let i = 0; i < count; i++) {
      const a = i, b = (i + 1) % count;
      const ra = Math.hypot(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), rb = Math.hypot(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
      const off = ra > clip || rb > clip;
      for (const [q, at] of [[a, w], [off ? a : b, w + 1]]) {
        room.pos[at * 3] = P[q * 3]; room.pos[at * 3 + 1] = P[q * 3 + 1]; room.pos[at * 3 + 2] = P[q * 3 + 2];
        room.col[at * 3] = color[0] * k; room.col[at * 3 + 1] = color[1] * k; room.col[at * 3 + 2] = color[2] * k;
      }
      w += 2;
    }
    return w;
  }

  /** the picked facet, the Hopf circles of the flow, the probe fibre, the picked vertex */
  _overlays() {
    const s = this.s, n = s.n, o = this.o, st = this.stage;
    // the facet the Schlegel view frames
    const showFacet = o.facets && n >= 3 && (this.inset.mode === 'schlegel' || this.showFacet) && this.effView() !== 'slice';
    if (showFacet) {
      const f = new Set(o.facets[this.facetIdx]);
      const list = [];
      for (let e = 0; e < o.ne; e++) if (f.has(o.edges[2 * e]) && f.has(o.edges[2 * e + 1])) list.push(e);
      const sub = this.arcMode ? this.arcSub : 1;
      const room = st.facetLines.room(list.length * sub * 2);
      let w = 0;
      const G = PALETTE.goldSoft;
      if (this.arcMode) {
        const tmp = { ...o, edges: Uint32Array.from(list.flatMap((e) => [o.edges[2 * e], o.edges[2 * e + 1]])), ne: list.length };
        w = stereoArcs(this.X, tmp, sub, room.pos, room.col, (a, b, t, out, at) => { out[at] = G[0]; out[at + 1] = G[1]; out[at + 2] = G[2]; }, Infinity, Math.min(STEREO_CLIP, this.fitR * 2.2));
      } else {
        for (const e of list) for (const v of [o.edges[2 * e], o.edges[2 * e + 1]]) {
          room.pos[w * 3] = this.vpos[v * 3]; room.pos[w * 3 + 1] = this.vpos[v * 3 + 1]; room.pos[w * 3 + 2] = this.vpos[v * 3 + 2];
          room.col[w * 3] = G[0]; room.col[w * 3 + 1] = G[1]; room.col[w * 3 + 2] = G[2]; w++;
        }
      }
      st.facetLines.commit(w);
    } else st.facetLines.commit(0);

    // Hopf circles: every fibre of the flow, or the probe's fibre on the Hopf object
    let wf = 0;
    if (this.flow && this.effView() !== 'slice') {
      const S = 72, circles = this.flow.circles;
      const room = st.fibres.room(circles.length * S * 2);
      const P4 = new Float64Array(S * 4), Y = new Float64Array(4);
      for (const c of circles) {
        for (let k = 0; k < S; k++) {
          const t = (2 * Math.PI * k) / S, ct = Math.cos(t), sn = Math.sin(t);
          for (let i = 0; i < 4; i++) Y[i] = ct * c.x[i] + sn * c.y[i];
          for (let i = 0; i < 4; i++) { let v = 0; for (let j = 0; j < 4; j++) v += this.R[i * 4 + j] * Y[j]; P4[k * 4 + i] = v; }
        }
        wf = this._circleSegs(P4, S, room, wf, PALETTE.goldDim, 0.7);
      }
    } else if (o.id === 'hopf') {
      const S = 96, pr = this.inset.probe;
      const F = hopfFibre(pr.e, pr.x, S), P4 = new Float64Array(S * 4);
      for (let k = 0; k < S; k++) for (let i = 0; i < 4; i++) { let v = 0; for (let j = 0; j < 4; j++) v += this.R[i * 4 + j] * F[k * 4 + j]; P4[k * 4 + i] = v; }
      const room = st.fibres.room(S * 2);
      wf = this._circleSegs(P4, S, room, 0, PALETTE.goldSoft, 1.3);
    }
    st.fibres.commit(wf);

    // the picked vertex
    if (this.pick != null && this.pick < o.nv && this.effView() !== 'slice') {
      const r = st.mark.room(1), v = this.pick;
      r.pos[0] = this.vpos[v * 3]; r.pos[1] = this.vpos[v * 3 + 1]; r.pos[2] = this.vpos[v * 3 + 2];
      r.col[0] = PALETTE.goldSoft[0]; r.col[1] = PALETTE.goldSoft[1]; r.col[2] = PALETTE.goldSoft[2];
      st.mark.commit(1);
    } else st.mark.commit(0);
  }

  _pickTag() {
    const tag = $('picktag');
    if (this.pick == null || this.pick >= this.o.nv || !this.stage.ok || this.effView() === 'slice') { tag.hidden = true; return; }
    const v = this.pick, n = this.s.n, o = this.o;
    const [x, y] = this.stage.screenOf(this.vpos[v * 3], this.vpos[v * 3 + 1], this.vpos[v * 3 + 2]);
    tag.hidden = false;
    tag.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y - 10)}px)`;
    if (this.frameNo % 4 === 0) {
      const f = (a) => (a < 0 ? '−' : '') + Math.abs(a).toFixed(2);
      const orig = Array.from({ length: n }, (_, k) => f(o.V[v * n + k])).join(', ');
      const now = Array.from({ length: n }, (_, k) => f(this.X[v * n + k])).join(', ');
      tag.innerHTML = `<b>${escapeHTML(this._vertexLabel(v))}</b><span>object (${orig})</span><span>turned (${now})</span>`;
    }
  }

  _slice(igniting) {
    const s = this.s, n = s.n, st = this.stage;
    if (!this.sliceOn() || igniting) {
      st.sliceFaces.commit(0); st.sliceLines.commit(0); st.slicePts.commit(0);
      st.setSheet(n, 0, 0, false);
      this.cut = null;
      return;
    }
    const c = slice(this.o, this.X, s.h);
    this.cut = c;
    c.scale = n >= 4 && this.effProj() === 'persp' ? perspScale(s.D, s.h) : 1;
    if (!this.scratch.P || this.scratch.P.length < Math.max(1, c.np) * 3) this.scratch.P = new Float32Array(Math.max(64, c.np) * 3);
    const P = this.scratch.P;
    projectAll(c.pts, n, c.np, this.effProj(), s.D, P);
    const G = PALETTE.gold, GS = PALETTE.goldSoft;
    let tris = 0;
    for (const p of c.polys) tris += p.length - 2;
    const F = st.sliceFaces.room(tris * 3);
    let w = 0;
    const L = [0.35, 0.8, 0.48];
    for (const p of c.polys) {
      const a = p[0] * 3, b = p[1] * 3, d = p[2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const lit = 0.35 + 0.65 * Math.abs((nx * L[0] + ny * L[1] + nz * L[2]) / nl);
      for (let i = 1; i + 1 < p.length; i++) {
        for (const q of [p[0], p[i], p[i + 1]]) {
          F.pos[w * 3] = P[q * 3]; F.pos[w * 3 + 1] = P[q * 3 + 1]; F.pos[w * 3 + 2] = P[q * 3 + 2];
          F.col[w * 3] = G[0] * lit; F.col[w * 3 + 1] = G[1] * lit; F.col[w * 3 + 2] = G[2] * lit;
          w++;
        }
      }
    }
    st.sliceFaces.commit(w);
    const E = st.sliceLines.room(c.edges.length);
    for (let i = 0; i < c.edges.length; i++) {
      const q = c.edges[i];
      E.pos[i * 3] = P[q * 3]; E.pos[i * 3 + 1] = P[q * 3 + 1]; E.pos[i * 3 + 2] = P[q * 3 + 2];
      E.col[i * 3] = GS[0]; E.col[i * 3 + 1] = GS[1]; E.col[i * 3 + 2] = GS[2];
    }
    st.sliceLines.commit(c.edges.length);
    const Q = st.slicePts.room(c.np);
    Q.pos.set(P.subarray(0, c.np * 3));
    for (let i = 0; i < c.np; i++) { Q.col[i * 3] = GS[0]; Q.col[i * 3 + 1] = GS[1]; Q.col[i * 3 + 2] = GS[2]; }
    st.slicePts.commit(c.np);
    st.setSheet(n, s.h, n === 3 ? 1.15 : 1.25, n <= 3);
  }

  _trails(moving, igniting) {
    const s = this.s, n = s.n, o = this.o;
    const on = s.trails && this.trailsAllowed() && this.moving() && !igniting && this.effView() !== 'slice';
    if (!on) { this.stage.trails.commit(0); this.trailCount = 0; return; }
    if (!moving && !this.trailDirty && this.trailCount) return;
    this.trailDirty = false;
    const wmax = Math.max(...this.speeds, 1e-6);
    const L = this.reduced ? 120 : CONFIG.trailSamples;
    const span = (this.reduced ? 2 * Math.PI : CONFIG.trailArc) / wmax;
    const key = `${n}|${o.id}|${s.preset}|${s.plane}|${s.speed}|${L}`;
    const nv = o.nv, mode = this.effProj();
    if (!this.trailP || this.trailP.length !== (L + 1) * nv * 3) this.trailP = new Float32Array((L + 1) * nv * 3);
    if (!this.scratch.tmp || this.scratch.tmp.length !== nv * 3) this.scratch.tmp = new Float32Array(nv * 3);
    const TP = this.trailP, tmp = this.scratch.tmp;
    TP.set(this.vpos.subarray(0, nv * 3), 0);
    if (this.flow) {
      // the flow acts in the object's frame: past points are R·exp(-k d G)·V, the object-frame part fixed
      if (key !== this.flowKey) {
        const th = -FLOW_OMEGA * s.speed * (span / L), c = Math.cos(th), sn = Math.sin(th);
        const M = new Float64Array(16);
        for (let i = 0; i < 16; i++) M[i] = sn * this.flow.G[i] + (i % 5 === 0 ? c : 0);
        const Mk = powers(M, 4, L);
        this.flowTrail = Mk.map((m) => applyAll(m, o.V, 4, nv, new Float64Array(o.V.length)));
        this.flowKey = key;
      }
      for (let k = 1; k <= L; k++) {
        turn({ V: this.flowTrail[k], n, nv }, this.R, this.Xk);
        projectAll(this.Xk, n, nv, mode, s.D, tmp);
        TP.set(tmp, k * nv * 3);
      }
    } else {
      if (key !== this.backKey) {
        this.back = powers(this._step(-span / L), n, L);
        this.backKey = key;
      }
      for (let k = 1; k <= L; k++) {
        applyAll(this.back[k], this.X, n, nv, this.Xk);
        projectAll(this.Xk, n, nv, mode, s.D, tmp);
        TP.set(tmp, k * nv * 3);
      }
    }
    const B = this.stage.trails.room(nv * L * 2);
    const G = PALETTE.gold, GS = PALETTE.goldSoft;
    const hi = this.linkPick;
    let w = 0;
    for (let v = 0; v < nv; v++) {
      const bright = hi && (v === hi[0] || v === hi[1]);
      const c = bright ? GS : G, kk = bright ? 1.25 : 0.8;
      for (let k = 1; k <= L; k++) {
        const a = ((k - 1) * nv + v) * 3, b = (k * nv + v) * 3;
        let x1 = TP[a], y1 = TP[a + 1], z1 = TP[a + 2], x2 = TP[b], y2 = TP[b + 1], z2 = TP[b + 2];
        if (mode === 'stereo' && (Math.hypot(x1, y1, z1) > STEREO_CLIP || Math.hypot(x2, y2, z2) > STEREO_CLIP)) { x2 = x1; y2 = y1; z2 = z1; }
        const f1 = kk * Math.pow(1 - (k - 1) / L, RENDER.trailFade), f2 = kk * Math.pow(1 - k / L, RENDER.trailFade);
        B.pos[w * 3] = x1; B.pos[w * 3 + 1] = y1; B.pos[w * 3 + 2] = z1;
        B.col[w * 3] = c[0] * f1; B.col[w * 3 + 1] = c[1] * f1; B.col[w * 3 + 2] = c[2] * f1; w++;
        B.pos[w * 3] = x2; B.pos[w * 3 + 1] = y2; B.pos[w * 3 + 2] = z2;
        B.col[w * 3] = c[0] * f2; B.col[w * 3 + 1] = c[1] * f2; B.col[w * 3 + 2] = c[2] * f2; w++;
      }
    }
    this.stage.trails.commit(w);
    this.trailCount = w;
  }

  /** linking number of two closed paths, in stereographic projection only */
  _linking() {
    const s = this.s, o = this.o;
    this.link = null;
    if (this.effProj() !== 'stereo' || s.n !== 4) return;
    const Q = 96;
    const lk = (A4, B4, segs) => {
      const a = new Float32Array(segs * 3), b = new Float32Array(segs * 3);
      projectAll(A4, 4, segs, 'stereo', 0, a); projectAll(B4, 4, segs, 'stereo', 0, b);
      return linkingNumber(a, b);
    };
    if (o.id === 'hopf') {
      const [A, B] = this._hopfPair();
      const a = this.vpos.slice(A.start * 3, (A.start + A.count) * 3), b = this.vpos.slice(B.start * 3, (B.start + B.count) * 3);
      this.link = { value: linkingNumber(a, b), segs: A.count, what: 'the two gold Hopf fibres' };
      return;
    }
    if (o.curved || !this.moving()) return;
    if (this.flow) {
      // two of the polytope's own Hopf circles, turned into the world
      const circ = (c) => {
        const P4 = new Float64Array(Q * 4), Y = new Float64Array(4);
        let top = -1;
        for (let k = 0; k < Q; k++) {
          const t = (2 * Math.PI * k) / Q;
          for (let i = 0; i < 4; i++) Y[i] = Math.cos(t) * c.x[i] + Math.sin(t) * c.y[i];
          for (let i = 0; i < 4; i++) { let v = 0; for (let j = 0; j < 4; j++) v += this.R[i * 4 + j] * Y[j]; P4[k * 4 + i] = v; }
          top = Math.max(top, P4[k * 4 + 3]);
        }
        return { P4, top };
      };
      const cs = this.flow.circles.map(circ).filter((c) => c.top < 0.93);
      if (cs.length >= 2) this.link = { value: lk(cs[0].P4, cs[1].P4, Q), segs: Q, what: `two of the ${this.flow.count} Hopf circles` };
      return;
    }
    if (s.preset !== 'iso' || !s.trails) return;
    if (this.orbitKey !== this.backKey || !this.orbit) {
      this.orbit = powers(this._step(-(2 * Math.PI) / this.speeds[0] / Q), 4, Q - 1);
      this.orbitKey = this.backKey;
    }
    const orbitOf = (v) => {
      const pts = new Float64Array(Q * 4);
      const x = this.X.subarray(v * 4, v * 4 + 4);
      let top = -1;
      for (let k = 0; k < Q; k++) {
        const M = this.orbit[k];
        for (let i = 0; i < 4; i++) pts[k * 4 + i] = M[i * 4] * x[0] + M[i * 4 + 1] * x[1] + M[i * 4 + 2] * x[2] + M[i * 4 + 3] * x[3];
        top = Math.max(top, pts[k * 4 + 3]);
      }
      return { pts, top };
    };
    if (!this.linkPick || this.frameNo % 120 === 1) {
      let pick = null;
      for (let v0 = 0; v0 < o.nv && !pick; v0++) {
        const A = orbitOf(v0);
        if (A.top > 0.93) continue;
        for (let v1 = v0 + 1; v1 < o.nv; v1++) {
          let dmin = Infinity;
          for (let k = 0; k < Q; k++) {
            let d = 0;
            for (let i = 0; i < 4; i++) { const e = A.pts[k * 4 + i] - this.X[v1 * 4 + i]; d += e * e; }
            dmin = Math.min(dmin, d);
          }
          if (dmin > 0.04 && orbitOf(v1).top <= 0.93) { pick = [v0, v1]; break; }
        }
      }
      this.linkPick = pick;
      this.trailDirty = true;
    }
    if (!this.linkPick) return;
    this.link = { value: lk(orbitOf(this.linkPick[0]).pts, orbitOf(this.linkPick[1]).pts, Q), segs: Q, what: 'the two bright gold paths' };
  }

  _profileTick(igniting) {
    const s = this.s, n = s.n, o = this.o;
    if (!this.sliceOn() || n < 2 || n > 4 || igniting || o.curved) { this.prof = null; this.job = null; return; }
    if (!this.job) {
      if (this.prof && this.prof.version === this.rVersion) return;
      const isCube = o.family === 'cube';
      this.job = {
        X: Float64Array.from(this.X), version: this.rVersion, i: 0, hs: [], vals: [], refs: isCube ? [] : null, maxDev: 0, peak: 0,
        u: isCube ? Array.from({ length: n }, (_, k) => this.R[(n - 1) * n + k]) : null,
      };
    }
    const j = this.job, S = CONFIG.profileSamples, chunk = TIERS[this.tierId].profileChunk;
    const L = 2 / Math.sqrt(n);
    for (let c = 0; c < chunk && j.i < S; c++, j.i++) {
      const h = -1 + (2 * j.i + 1) / S;
      const m = slice(o, j.X, h).measure || 0;
      j.hs.push(h); j.vals.push(m); j.peak = Math.max(j.peak, m);
      if (j.refs) { const r = cubeSection(j.u, L, h); j.refs.push(r); j.maxDev = Math.max(j.maxDev, Math.abs(r - m)); }
    }
    if (j.i >= S) {
      const heights = [];
      for (let v = 0; v < o.nv; v++) heights.push(j.X[v * n + n - 1]);
      this.prof = { hs: j.hs, vals: j.vals, refs: j.refs, maxDev: j.refs ? j.maxDev : null, peak: j.peak, heights, version: j.version, samples: S };
      this.job = null;
    }
  }

  _reticle() {
    const s = this.s;
    const cam = this.stage.camera;
    const dist = cam.position.length();
    const H = window.innerHeight;
    const rpx = (this._fitTarget() * 1.1 / (dist * Math.tan(((cam.fov || 48) * Math.PI) / 360))) * (H / 2);
    this.reticle.layout(window.innerWidth / 2, H / 2 - (this.lift || 0), Math.min(rpx, Math.min(window.innerWidth, H) * (this.phone ? 0.38 : 0.46)));
    if (this.frameNo % 15 === 1) this.reticle.guard = $('hint').getBoundingClientRect(); // the plane label keeps off the hint line
    const on = s.n >= 2 && !this.flow;
    this.reticle.set(this.turned, `${AXES[s.plane[0]]}–${AXES[s.plane[1]]} ${Math.round((this.turned * 180) / Math.PI)}°`, on);
    if (this.frameNo % 3 === 0 && s.n >= 2) this.ui.dial(this.turned, s.plane);
  }

  _readouts() {
    const s = this.s, n = s.n, o = this.o;
    const c = this.cut;
    let html = '';
    if (!this.sliceOn()) {
      html = `<p class="off">${o.curved ? 'Curved objects have no faces to cut.' : this.effProj() === 'stereo' ? 'A slice needs a flat projection: choose perspective or orthographic.' : n < 2 ? 'Nothing to cut in 1D.' : 'Choose shadow + slice, or a cut preset, to cut the object.'}</p>`;
    } else if (c) {
      const ax = AXES[n - 1];
      const unit = n === 2 ? 'length' : n === 3 ? 'area' : n === 4 ? '3-volume' : '';
      html += `<div class="sname"><span class="k">at <i class="mth">${ax}</i> = ${sgn(s.h, 3)}</span> <b>${escapeHTML(c.name)}</b></div>`;
      if (c.np) {
        html += `<div class="snum">${n === 4 ? `${c.counts[0]} vertices · ${c.counts[1]} edges · ${c.counts[2]} faces` : `${c.counts[0]} vertices · ${c.counts[1]} edges`}</div>`;
        if (c.measure != null && n <= 4) html += `<div class="snum">${unit} <b>${c.measure.toFixed(6)}</b>${n === 4 && this.effProj() === 'persp' ? ` · drawn ${c.scale.toFixed(2)}×` : ''}</div>`;
      }
      if (this.prof && this.prof.maxDev != null) html += `<div class="check">closed form agrees to <b>${this.prof.maxDev.toExponential(1)}</b> at ${this.prof.samples} heights</div>`;
      else if (this.prof) html += `<div class="check">${this.prof.samples} exact cuts; ticks are vertex heights</div>`;
      else if (n >= 5) html += `<div class="check">the cut is ${n - 1}-dimensional, so the view shows its shadow; no measure above 4D</div>`;
    }
    $('sliceinfo').innerHTML = html;
    this.ui.liveH(s.h);

    // rotation: spectrum, class, canonical planes, the checks
    if (n >= 2) {
      const sp = this.speeds.filter((x) => x > 1e-6);
      const iso = sp.length >= 2 && Math.abs(sp[0] - sp[1]) < 1e-6;
      const cls = !sp.length ? 'at rest' : sp.length === 1 ? 'simple' : iso ? 'isoclinic (equal)' : sp.length === 2 ? 'double (unequal)' : `${sp.length} unequal spins`;
      const planes = canonicalPlanes(this.R, n);
      const chk = rotationChecks(this.R, n);
      const pl = planes.map((p) => `${Math.round((p.angle * 180) / Math.PI)}°${p.shared ? '' : ` ≈ <i class="mth">${AXES[p.i]}–${AXES[p.j]}</i>${p.weight < 0.995 ? ` (${p.weight.toFixed(2)})` : ''}`}`).join(', ');
      $('spectrum').innerHTML =
        `<div><span class="k">motion</span> ${sp.length ? `${sp.map((x) => x.toFixed(2)).join(', ')} rad/s` : 'none'} · <b>${cls}</b></div>` +
        `<div><span class="k">pose</span> ${pl}${planes.some((p) => p.shared) ? ' · equal angles, planes not unique' : ''}</div>` +
        `<div class="chk"><span class="k">check</span> max|RRᵀ − I| ${chk.err.toExponential(1)} · |det R − 1| ${Math.abs(chk.det - 1).toExponential(1)}</div>`;
    } else $('spectrum').innerHTML = '';

    const ll = $('linkline');
    if (this.link) {
      ll.hidden = false;
      ll.innerHTML = `<span class="k">linking number</span> <b>${this.link.value.toFixed(3)}</b> of ${this.link.what} · Gauss integral over ${this.link.segs} × ${this.link.segs} segments <span class="tg">[real]</span>`;
    } else if (this.flow) {
      ll.hidden = false;
      ll.innerHTML = `<span class="k">hopf flow</span> the ${o.name}’s ${o.nv} vertices lie on <b>${this.flow.count}</b> great circles of ${this.flow.perCircle || 'unequal numbers of'} vertices each; every vertex moves along its own <span class="tg">[real]</span>`;
    } else ll.hidden = true;

    const vname = (VIEWS.find((v) => v.id === this.effView()) || VIEWS[0]);
    const pname = (PROJECTIONS.find((p) => p.id === this.effProj()) || PROJECTIONS[0]).label;
    $('caption').innerHTML = `<b>${escapeHTML(o.name)}</b>${o.schlafli ? ` <span class="mth">${escapeHTML(o.schlafli)}</span>` : ''} <span>· ${n}D</span><em>${n <= 3 ? vname.low : vname.label}${n >= 4 ? ` · ${pname}` : ''} · ${PRESETS[s.preset].label}</em>`;
    $('gl').setAttribute('aria-label', `${n <= 3 ? 'The' : 'Shadow of the'} ${o.name} in ${n}D${n >= 4 ? `, ${pname} projection` : ''}${c && c.np ? `, cut at ${AXES[n - 1]} = ${s.h.toFixed(2)}: ${c.name}` : ''}.`);

    const sug = this.obs.suggestion(this);
    this.ui.suggest(sug && this.tourIdx < 0 ? sug : null);
  }

  /** one ledger report per tick: the bars, their numbers, the ledger sentence and the Witness all read it */
  _ledgerTick() {
    const n = this.s.n, mode = this.effProj();
    const L = labelLedger(shadowLedger(this.ext, n, mode), (v) => this._vertexLabel(v), this.o.curved ? 'point' : 'corner');
    this.hot = this.ledger.tick(L);
    const line = n <= 3 ? '' : ledgerLine(L);
    const ll = $('ledgerline');
    if (ll.textContent !== line) ll.textContent = line;
    // a Witness line about the hot axis follows the same report, without re-announcing itself
    if (this._hotSaid && $('witness').textContent === this._hotSaid) {
      const w = witnessHotLine({ n, proj: mode, hot: L });
      if (w && w !== this._hotSaid) { this.ui.witness(w, 'ambient', true); this._hotSaid = w; }
    }
  }

  _vertexLabel(v) {
    const o = this.o, n = this.s.n;
    if (o.family === 'cube') { let s = ''; for (let k = 0; k < n; k++) s += o.V[v * n + k] > 0 ? '+' : '−'; return `corner (${s})`; }
    if (o.family === 'cross') { for (let k = 0; k < n; k++) if (Math.abs(o.V[v * n + k]) > 0.5) return `the vertex ${o.V[v * n + k] > 0 ? '+' : '−'}${AXES[k]}`; }
    return `vertex ${v + 1} of ${o.nv}`;
  }

  _ctx() {
    const s = this.s, n = s.n, o = this.o;
    // the same report the ledger shows (built in _ledgerTick), never a second computation
    const hot = this.hot && this.hot.n === n && this.hot.mode === this.effProj() ? this.hot : null;
    let crossed = null;
    if (this.cut) {
      const side = new Int8Array(o.nv);
      for (let v = 0; v < o.nv; v++) side[v] = this.X[v * n + n - 1] > s.h ? 1 : -1;
      if (this.sides && this.sides.length === side.length) {
        let bd = Infinity;
        for (let v = 0; v < o.nv; v++) if (side[v] !== this.sides[v]) { const w = this.X[v * n + n - 1]; if (Math.abs(w - s.h) < bd) { bd = Math.abs(w - s.h); crossed = w; } }
      }
      this.sides = side;
    }
    return {
      n, obj: o, objId: o.id, view: this.effView(), proj: this.effProj(), preset: s.preset, spin: this.spin, speeds: this.speeds,
      hidden: Math.max(0, n - 3), hot, flow: this.flow,
      slice: this.cut ? { name: this.cut.name, counts: this.cut.counts, measure: this.cut.measure, h: s.h, kind: this.cut.kind, scale: this.cut.scale || 1 } : null,
      check: this.prof && this.prof.maxDev != null ? { maxDev: this.prof.maxDev, samples: this.prof.samples } : null,
      link: this.link, crossed, ledger: Array.from(this.stress).slice(3).map((x) => +x.toFixed(3)),
      key: `${n}|${o.id}|${this.effView()}|${this.effProj()}|${s.preset}`,
    };
  }

  _narrate(now) {
    const s = this.s;
    if (this.ign < 1) {
      const k = Math.min(s.n - 1, Math.floor(this.ign * (s.n - this.ignFrom)) + this.ignFrom);
      const cube = this.o.family === 'cube';
      const lines = ['A point, dragged along X, traces a segment.', 'The segment, dragged along Y, sweeps a square.', 'The square, dragged along Z, sweeps a cube.', 'The cube, dragged along W, sweeps a tesseract. W is the one direction you cannot point at.'];
      this.ui.witness(cube && k < 4 ? lines[k] : cube ? `Dragged along ${AXES[k]}, the ${k}-cube sweeps the ${k + 1}-cube: ${fmt(2 ** (k + 1))} corners.` : `Assembling the ${this.o.name} axis by axis: ${AXES[k]}.`, 'ignite');
      this.prevCtx = null;
      return;
    }
    const c = this._ctx();
    const geo = this.obs.events(this);
    const ev = eventLine(this.prevCtx, c) || geo[0] || null;
    if (ev) {
      if (now > this.eventUntil - CONFIG.eventHold + 1800) { this.ui.witness(ev, 'event'); this.eventUntil = now + CONFIG.eventHold; }
      this.obs.note(ev);
    } else if (now > this.eventUntil) {
      const lines = ambientLines(c);
      if (lines.length) {
        if (now > this.ambUntil || c.key !== this.ambKey) {
          this.ambIdx = c.key !== this.ambKey ? 0 : (this.ambIdx + 1) % lines.length;
          this.ambUntil = now + CONFIG.ambientHold;
          this.ambKey = c.key;
        }
        const line = lines[this.ambIdx % lines.length];
        const isHot = line === witnessHotLine(c);
        // a hot-axis line whose numbers moved is updated in place, not re-announced
        this.ui.witness(line, 'ambient', isHot && !!this._hotSaid && $('witness').textContent === this._hotSaid);
        this._hotSaid = isHot ? line : null;
      }
    }
    this.prevCtx = c;
  }

  /** the screen-reader summary, at most once a second, only when it changes */
  _summary() {
    const s = this.s, o = this.o;
    const step = Math.round((this.turned * 180) / Math.PI / 15) * 15;
    const hot = this.hot && this.hot.hot >= 0 ? `, hidden axis ${AXES[this.hot.hot]} bends the shadow most` : '';
    const t = `${o.name}, ${s.n} dimensions, ${this.effView()}, ${this.effProj()} projection, ${PRESETS[s.preset].label}; plane ${AXES[s.plane[0]]} ${AXES[s.plane[1]]} turned about ${step} degrees${hot}${this.cut && this.cut.np ? `; the cut is ${this.cut.name}` : ''}.`;
    const el = $('sr');
    if (el.textContent !== t) el.textContent = t;
  }

  /** frame time: auto steps down one tier (bloom, then trails, then resolution) while under TIER_FPS */
  _perf(raw) {
    if (!raw) return;
    this.ft.push(raw);
    if (this.ft.length > 120) this.ft.shift();
    if (this.frameNo % 30 === 0) {
      const mean = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
      const fps = 1 / mean;
      this.ui && this.ui.fps(`${TIERS[this.tierId].label} · ${Math.round(fps)} fps`);
      const now = performance.now();
      const next = nextTier(this.tierChoice, this.tierId, fps, now, this._tierT);
      if (next) { this._tierT = now; this.ft.length = 0; this._applyTier(next); }
    }
  }

  _shareState() { return { ...this.s, inset: this.inset.mode !== 'down' ? this.inset.mode : null, facet: this.showFacet ? this.facetIdx : 0 }; }

  _writeURL() {
    const qs = encodeState(this._shareState(), this.R) + (this.flags.length ? '&' + this.flags.join('&') : '');
    try { history.replaceState(null, '', `${location.pathname}?${qs}`); } catch { /* sandboxed */ }
  }

  shareURL() { return `${location.origin}${location.pathname}?${encodeState(this._shareState(), this.R)}`; }

  async copyLink() {
    const url = this.shareURL();
    const ok = await copyText(url);
    const b = $('copyLink');
    b.textContent = ok ? 'link copied' : 'copy failed: see address bar';
    this._writeURL();
    this.obs.note('copied the link to this state');
    setTimeout(() => { b.textContent = 'copy link'; }, 2200);
  }

  /* ---------------- the mechanism, with live numbers ---------------- */

  mechanismText() {
    const s = this.s, n = s.n, o = this.o;
    const f = (a, d = 3) => (a < 0 ? '−' : '') + Math.abs(a).toFixed(d);
    const vec = (arr) => `(${Array.from(arr).map((x) => f(x, 2)).join(', ')})`;
    let v = this.pick;
    if (v == null) { let bw = -Infinity; for (let i = 0; i < o.nv; i++) if (this.X[i * n + n - 1] > bw) { bw = this.X[i * n + n - 1]; v = i; } }
    const x = o.V.subarray(v * n, v * n + n), X = this.X.subarray(v * n, v * n + n);
    const out = [];
    out.push(['turn', 'x′ = R · x', `${this._vertexLabel(v)}: ${vec(x)} → ${vec(X)}`]);
    const mode = this.effProj();
    if (n >= 4 && mode === 'persp') {
      const w = X[n - 1], sc = perspScale(s.D, w);
      out.push(['shadow', 's = D / (D − w)', `${f(s.D, 2)} / (${f(s.D, 2)} − ${f(w)}) = ${f(sc)}${n > 4 ? `, then once more per hidden axis down to ${AXES[3]}` : ''}`]);
    } else if (mode === 'stereo') {
      const w = X[3];
      out.push(['shadow', 's = 1 / (1 − w)', `1 / (1 − ${f(w)}) = ${f(1 / Math.max(1 - w, 0.035))}`]);
    } else if (n >= 4) out.push(['shadow', '(x, y, z, w, …) → (x, y, z)', `drops ${n - 3} hidden ${n - 3 === 1 ? 'coordinate' : 'coordinates'}`]);
    const P = this.vpos;
    out.push(['screen', '(x, y, z)', vec([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]])]);
    if (this.flow) out.push(['motion', 'R ← R · exp(θG),  θ = ω·dt', `ω = ${f(FLOW_OMEGA * s.speed)} rad/s; G multiplies by the unit quaternion u = ${vec(this.flow.u)}`]);
    else if (this.spinScaled.length) out.push(['motion', 'R ← Gₘ(ωₘ dt) ··· G₁(ω₁ dt) · R', this.spinScaled.slice(0, 4).map((p) => `${AXES[p.i]}–${AXES[p.j]} ${f(p.omega)}`).join(', ') + (this.spinScaled.length > 4 ? ', …' : '') + ' rad/s']);
    const chk = rotationChecks(this.R, n);
    out.push(['check', 'R · Rᵀ = I,  det R = +1', `max error ${chk.err.toExponential(1)}, det ${chk.det.toFixed(9)}`]);
    if (this.cut && this.cut.np && n >= 2) {
      const h = s.h, E = o.edges;
      for (let e = 0; e < o.ne; e++) {
        const a = E[2 * e], b = E[2 * e + 1], wa = this.X[a * n + n - 1], wb = this.X[b * n + n - 1];
        if ((wa - h) * (wb - h) < 0) {
          out.push(['slice', 't = (w₁ − h) / (w₁ − w₂)', `edge ${a + 1}→${b + 1}: (${f(wa)} − ${f(h)}) / (${f(wa)} − ${f(wb)}) = ${f((wa - h) / (wa - wb))}`]);
          break;
        }
      }
    }
    return out;
  }

  /* ---------------- ask the witness ---------------- */

  async ask(q) {
    if (this._asking) return;
    this._asking = true;
    this.obs.try('ask');
    const ctx = this._ctx();
    const local = answerLocally(q, ctx);
    let changed = false;
    if (local.show) { this._applyShow(local.show); changed = true; }
    const engine = `<p class="a-engine">${escapeHTML(local.answer)}</p><p class="a-src">the lab’s engine · computed from the page’s own numbers</p>`;
    const wait = LLM.publicReadyIn();
    const route = LLM.status().route;
    if (route === 'pollinations' && wait > 8) {
      this.ui.answer(engine + `<p class="a-src">the public model is busy for ${wait} s more; the engine answered alone</p>`);
      this.obs.note(`asked "${q}": engine (public model busy)`);
      this._asking = false;
      return;
    }
    this.ui.answer(engine + '<p class="a-model pending">asking the model…</p>', true);
    const prompt = promptFor(q, ctx);
    try {
      const r = await LLM.complete({
        system: SYSTEM, prompt, json: true, temperature: 0.3, timeoutMs: 60000, maxWaitMs: 8000,
        fallback: () => ({ answer: local.answer, show: local.show }),
      });
      if (r.source === 'offline') {
        this.ui.answer(engine + `<p class="a-src">no model route answered; the engine’s answer stands</p>`);
        this.obs.note(`asked "${q}": engine only`);
      } else {
        const text = cleanAnswer(r.json && r.json.answer);
        // every number the model quotes must be within 1% of a live value
        const o = this.o;
        const extra = [...o.fvec.map((f) => f.count), o.nv, o.ne, this.s.n, (this.s.n * (this.s.n - 1)) / 2, 2 ** this.s.n, o.group ? o.group.order : 0,
          o.metrics ? o.metrics.re : 0, o.metrics && o.metrics.dihedral ? o.metrics.dihedral : 0, this.flow ? this.flow.count : 0, 120, 600, 720, 1200, 24, 96, 14400, 1152];
        const chk = checkNumbers(text, knownNumbers(prompt, extra));
        if (text && !chk.ok) {
          this.ui.answer(engine + `<p class="a-src">the model (${escapeHTML(r.model || 'model')} via ${escapeHTML(r.source)}) quoted ${chk.bad.slice(0, 3).join(', ')}, which no live value supports within 1%; its reply was set aside and the engine’s answer stands</p>`);
          this.obs.note(`asked "${q}": model reply rejected (numbers ${chk.bad.join(', ')})`);
        } else {
          const show = validateShow(r.json && r.json.show, this.s);
          if (show && !changed) this._applyShow(show);
          this.ui.answer(engine + (text ? `<p class="a-model">${escapeHTML(text)}</p><p class="a-src">${escapeHTML(r.model || 'model')} via ${escapeHTML(r.source)} · every number checked against the live state${show && !changed ? ' · it changed the view' : ''}</p>` : `<p class="a-src">the model’s reply was empty; the engine’s answer stands</p>`));
          this.obs.note(`asked "${q}": answered by ${r.model} via ${r.source}`);
        }
      }
    } catch (e) {
      this.ui.answer(engine + `<p class="a-src">the model call stopped (${escapeHTML(e.message || 'error')}); the engine’s answer stands</p>`);
    }
    this._asking = false;
  }

  /** reopen any saved file: JSON, SVG, OBJ or PNG each carry the state URL */
  async importFile(file) {
    const url = await stateFromFile(file);
    if (!url) { this.ui.answer(`<p class="a-src">no saved state found in ${escapeHTML(file.name)}</p>`); return; }
    this.obs.note(`opened the state saved in ${file.name}`);
    location.href = `${location.pathname}?${url.split('?')[1] || ''}`;
  }

  _applyShow(show) {
    if (show.n !== undefined && show.n !== this.s.n) this.setDim(show.n);
    const p = { ...show };
    delete p.n;
    if (Object.keys(p).length) this.set(p);
  }

  /* ---------------- exports ---------------- */

  async savePNG() {
    const raw = await this.stage.png(2);
    if (!raw) return;
    const blob = await withPngState(raw, this.shareURL());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dimensions-${this.o.id}-${this.s.n}d.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.obs.note('saved a PNG at 2x');
  }

  saveJSON() {
    const o = this.o, n = this.s.n, r6 = (x) => Math.round(x * 1e6) / 1e6;
    const data = {
      schema: 'luisblanco.dev/labs/dimensions/object@1',
      source: 'computed on the page; coordinates and counts as in Coxeter, Regular Polytopes, 3rd ed., 1973',
      id: o.id, name: o.name, n, schlafli: o.schlafli || null, group: o.group || null,
      fvector: o.fvec.map((f) => ({ rank: f.k, count: f.count, how: f.how })),
      metrics: o.metrics || null,
      vertices: Array.from({ length: o.nv }, (_, v) => Array.from(o.V.subarray(v * n, v * n + n), r6)),
      edges: Array.from({ length: o.ne }, (_, e) => [o.edges[2 * e], o.edges[2 * e + 1]]),
      facets: o.facets || null,
      pose: Array.from({ length: n }, (_, i) => Array.from(this.R.subarray(i * n, i * n + n), r6)),
      turned: Array.from({ length: o.nv }, (_, v) => Array.from(this.X.subarray(v * n, v * n + n), r6)),
      state: this.shareURL(),
    };
    download(`dimensions-${o.id}-${n}d.json`, JSON.stringify(data), 'application/json');
    this.obs.note('saved the coordinates as JSON');
  }

  saveOBJ() {
    const o = this.o, lines = ['# Dimensions: the 3D shadow and the cut, as drawn', `# ${o.name} in ${this.s.n}D, ${this.effProj()} projection`, `# state ${this.shareURL()}`, 'g shadow'];
    for (let v = 0; v < o.nv; v++) lines.push(`v ${this.vpos[v * 3].toFixed(6)} ${this.vpos[v * 3 + 1].toFixed(6)} ${this.vpos[v * 3 + 2].toFixed(6)}`);
    for (let e = 0; e < o.ne; e++) lines.push(`l ${o.edges[2 * e] + 1} ${o.edges[2 * e + 1] + 1}`);
    const c = this.cut;
    if (c && c.np) {
      lines.push('g cut');
      const P = new Float32Array(c.np * 3);
      projectAll(c.pts, this.s.n, c.np, this.effProj(), this.s.D, P);
      const base = o.nv;
      for (let i = 0; i < c.np; i++) lines.push(`v ${P[i * 3].toFixed(6)} ${P[i * 3 + 1].toFixed(6)} ${P[i * 3 + 2].toFixed(6)}`);
      for (const p of c.polys) lines.push('f ' + p.map((q) => q + 1 + base).join(' '));
      if (!c.polys.length) for (let i = 0; i + 1 < c.edges.length; i += 2) lines.push(`l ${c.edges[i] + 1 + base} ${c.edges[i + 1] + 1 + base}`);
    }
    download(`dimensions-${o.id}-${this.s.n}d.obj`, lines.join('\n') + '\n', 'text/plain');
    this.obs.note('saved the shadow and the cut as OBJ');
  }

  savePlate() {
    const s = this.s, o = this.o, n = s.n, st = this.stage;
    const v3 = window.THREE ? new window.THREE.Vector3() : null;
    const scr = (x, y, z) => st.screenOf(x, y, z, v3);
    const hexOf = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 15) * 17).map((x) => x.toString(16).padStart(2, '0')).join('');
    const segs = [];
    const view = this.effView();
    if (view !== 'slice') {
      if (this.arcMode) {
        const P = st.arcs.pos, C = st.arcs.col;
        for (let i = 0; i + 1 < this.arcCount; i += 2) {
          const a = scr(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), b = scr(P[i * 3 + 3], P[i * 3 + 4], P[i * 3 + 5]);
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) continue;
          segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], c: hexOf(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]) });
        }
      } else {
        const sc = new Array(o.nv);
        for (let v = 0; v < o.nv; v++) sc[v] = scr(this.vpos[v * 3], this.vpos[v * 3 + 1], this.vpos[v * 3 + 2]);
        for (let e = 0; e < o.ne; e++) {
          const a = o.edges[2 * e], b = o.edges[2 * e + 1], c = this.vcol;
          segs.push({ x1: sc[a][0], y1: sc[a][1], x2: sc[b][0], y2: sc[b][1], c: hexOf((c[a * 3] + c[b * 3]) / 2, (c[a * 3 + 1] + c[b * 3 + 1]) / 2, (c[a * 3 + 2] + c[b * 3 + 2]) / 2) });
        }
      }
    }
    const trails = [];
    if (this.trailCount) {
      const P = st.trails.pos;
      for (let i = 0; i + 1 < this.trailCount; i += 4) {
        const a = scr(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), b = scr(P[i * 3 + 3], P[i * 3 + 4], P[i * 3 + 5]);
        trails.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      }
    }
    const cut = [], polys = [];
    if (this.cut && this.cut.np) {
      const P = new Float32Array(this.cut.np * 3);
      projectAll(this.cut.pts, n, this.cut.np, this.effProj(), s.D, P);
      const sp = Array.from({ length: this.cut.np }, (_, i) => scr(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
      for (let i = 0; i + 1 < this.cut.edges.length; i += 2) { const a = sp[this.cut.edges[i]], b = sp[this.cut.edges[i + 1]]; cut.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }
      for (const p of this.cut.polys) polys.push(p.map((q) => [sp[q][0], sp[q][1]]));
    }
    const RANKS = ['vertices', 'edges', 'faces', 'cells', '4-faces', '5-faces', '6-faces', '7-faces', '8-faces', '9-faces'];
    const fvec = o.fvec.map((f) => ({ rank: o.curved ? ['vertices', 'edges', 'faces'][f.k] : RANKS[f.k], count: f.count, how: f.how + (f.ref != null ? (f.ref === f.count ? ' · matches Table I' : ' · DIFFERS from Table I') : '') }));
    const euler = o.euler ? `Euler-Poincaré: alternating sum ${o.euler.chi}, expected ${o.euler.expected}: ${o.euler.ok ? 'holds' : 'fails'}` : '';
    const sp = this.speeds.filter((x) => x > 1e-6);
    const c = this.cut;
    const sliceLines = c && c.np ? [`at ${AXES[n - 1]} = ${sgn(s.h, 3)}: ${c.name}`, n === 4 ? `${c.counts[0]} vertices, ${c.counts[1]} edges, ${c.counts[2]} faces` : `${c.counts[0]} vertices, ${c.counts[1]} edges`]
      .concat(c.measure != null && n <= 4 ? [`measure ${c.measure.toFixed(5)}`] : [])
      .concat(this.prof && this.prof.maxDev != null ? [`closed form agrees to ${this.prof.maxDev.toExponential(1)}`] : []) : ['no cut shown'];
    const svg = plateSVG({
      title: `${o.name}${o.schlafli ? ' ' + o.schlafli : ''} · ${n}D`,
      sub: `${(VIEWS.find((v) => v.id === view) || VIEWS[0]).label} · ${(PROJECTIONS.find((p) => p.id === this.effProj()) || PROJECTIONS[0]).label} · ${PRESETS[s.preset].label}`,
      segs, trails, cut, polys, fvec, euler, R: this.R, n,
      spectrum: n >= 2 ? `motion: ${sp.length ? sp.map((x) => x.toFixed(3)).join(', ') + ' rad/s' : 'at rest'}` : '',
      slice: sliceLines,
      link: this.link ? `linking number ${this.link.value.toFixed(3)} (Gauss integral)` : '',
      witness: $('witness').textContent || '',
      url: this.shareURL(),
      date: new Date().toISOString().slice(0, 10),
    });
    download(`dimensions-${o.id}-${n}d.svg`, svg);
    this.obs.note('saved the plate (SVG)');
  }

  /** world radius the object is scaled to: narrower screens get a smaller one */
  _fitTarget() {
    const half = 10.3 * Math.tan((48 * Math.PI) / 360); // the default camera's half height at the origin
    const aspect = window.innerWidth / window.innerHeight;
    return Math.min(this.phone ? CONFIG.fitRadius : 2.12, 0.8 * half * aspect);
  }

  _layout() {
    const phone = window.matchMedia('(max-width: 820px)').matches;
    this.phone = phone;
    if (phone) {
      // centre the object on the empty band the page leaves for it
      const sp = document.querySelector('.spacer').getBoundingClientRect();
      const y = sp.top + window.scrollY + sp.height / 2;
      this.lift = Math.round(window.innerHeight / 2 - y);
    } else this.lift = Math.round(window.innerHeight * 0.065);
    this.stage.setLift(this.lift);
  }
}

function boot() {
  try { new App(); } catch (e) {
    const v = $('loading');
    if (v) v.textContent = 'the instrument failed to start: ' + (e && e.message ? e.message : e);
    throw e;
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
