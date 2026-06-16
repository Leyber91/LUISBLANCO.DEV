/* ============================================================
   dimensional_mania/Witness.js — the instrument controller.

   One honest hypercube you READ, not a swarm you watch. A single
   2^n-vertex N-cube is rotated in its true coordinate planes, then
   perspective-divided down to 3D. This controller composes the
   pieces and owns the policy + main loop:

     · PlaneSet   — which planes exist / spin / are isoclinic (dimension model)
     · Renderer   — Three.js scene, mesh, bloom, resize (render policy)
     · TrailField — the Hopf-fibre vertex trails (the "mania" layer)
     · HyperCube  — pure n-cube maths (projection/rotation) — untouched

   Public methods (setDim/select/setSelectedAngle/applyPreset/...) are
   the surface the Console drives; onState/onDim/onDial/onTick are the
   callbacks the Console wires for its readouts.
   ============================================================ */

import { HyperCube } from './n_dimensional_cube.js';
import {
  SEL, CONFIG, WIRE, PROJECTION, DEFAULT_PROJ_MODE,
  TRAIL, LOOP, VEIL, ISO,
} from './constants.js';
import { Renderer } from './Renderer.js';
import { PlaneSet } from './PlaneSet.js';
import { TrailField } from './TrailField.js';

export class Witness {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {boolean} reduceMotion frozen-motion policy (?still / reduced-motion)
   */
  constructor(canvas, reduceMotion) {
    this.reduceMotion = reduceMotion;
    this.dim = CONFIG.startDim;
    this.speed = CONFIG.speed;
    this.projDistance = CONFIG.projDistance;
    this.size = CONFIG.size;
    this.projMode = DEFAULT_PROJ_MODE; // 'auto' | 'perspective' | 'orthographic'
    this.showVertices = true;
    this.paused = reduceMotion;
    this.dragging = false;             // dial being driven by hand

    // rotation-plane model
    this.planeSet = new PlaneSet();

    // morph
    this.unfold = 1;
    this.unfoldTarget = 1;

    // isoclinic speed + trail visibility (resolved per dimension)
    this.isoOmega = ISO.omega;
    this.showTrails = undefined;

    this._last = 0;
    this._frame = 0;

    this.renderer = new Renderer(canvas);
    this.ok_ = this.renderer.ok;
    if (!this.ok_) return;

    this.trails = new TrailField(this.renderer.group, this._trailCtx());

    this.planeSet.rebuild(this.dim, true);
    this._buildCube();
  }

  ok() { return this.ok_; }

  /* ---- the live context the TrailField borrows (no maths duplicated).
     vCount/pos/col are live getters (they change on every _buildCube). ---- */
  _trailCtx() {
    const w = this;
    return {
      get vCount() { return w.vCount; },
      get pos() { return w.pos; },
      get col() { return w.col; },
      cube: () => w.cube,
      planes: () => w.planeSet.planes,
      angleOf: (id) => w.planeSet.angle[id],
      spinningHas: (id) => w.planeSet.spinning.has(id),
      isoHas: (id) => w.planeSet.isoSet.has(id),
      isoOmega: () => w.isoOmega,
      speed: () => w.speed,
      projDistance: () => w.projDistance,
      unfold: () => w.unfold,
      ortho: () => w.isOrtho(),
    };
  }

  /* ---- geometry ---- */
  _buildCube() {
    const cube = new HyperCube(this.dim);
    this.cube = cube;
    this.vCount = cube.vCount;
    this.stress = new Float32Array(this.dim);

    const { pos, col } = this.renderer.buildCube(cube, this.showVertices, this.size);
    this.pos = pos;
    this.col = col;

    // morph the new hidden axes in from a 3-cube (skip on first paint / still)
    this.unfold = (this.dim > 3 && !this.reduceMotion) ? 0 : 1;
    this.unfoldTarget = 1;

    this._initTrail(); // seeds the trail using the unfold just set
    this._project();
  }

  _initTrail() {
    // trails are legible (and cheap) up to ~6D; off in reduced motion
    const allowed = this.vCount <= TRAIL.maxVerts && !this.reduceMotion;
    if (this.showTrails === undefined) {
      this.showTrails = this.dim <= TRAIL.legibleDim && !this.reduceMotion;
    }
    this.trails.build(allowed, this.showTrails);
  }

  toggleTrails() {
    if (!this.trails.isAllowed()) return;
    this.showTrails = !this.showTrails;
    this.trails.build(this.trails.isAllowed(), this.showTrails);
  }

  /* projection mode -> ortho is a pure lookup (the legibility wall lives in
     the PROJECTION map). isOrtho() decides whether to perspective-divide. */
  isOrtho() {
    return (PROJECTION[this.projMode] || PROJECTION[DEFAULT_PROJ_MODE]).ortho(this.dim);
  }

  _project() {
    const rotations = this.planeSet.planes.map(
      (p) => ({ i: p.i, j: p.j, angle: this.planeSet.angle[p.id] }));
    this.cube.project(this.pos, {
      colors: this.col,
      rotations,
      projDistance: this.projDistance,
      unfold: this.unfold,
      palette: WIRE,
      ortho: this.isOrtho(),
      stress: this.stress,
    });
    this.renderer.commitProjection();
    // past the wall the wireframe deliberately reads faint
    const faint = this.isOrtho() && this.dim >= CONFIG.orthoFrom;
    this.renderer.setLineFaint(faint);
  }

  /* ---- public API (driven by the Console) ---- */
  applyPreset(which, silent) {
    this.planeSet.applyPreset(which);
    if (!silent && this.onState) this.onState();
  }

  setDim(n) {
    n = Math.max(CONFIG.minDim, Math.min(CONFIG.maxDim, n));
    if (n === this.dim) return;
    this.dim = n;
    this.planeSet.rebuild(n, false);
    this.planeSet.applyPreset(this.planeSet.preset);
    this._buildCube();
    if (this.onDim) this.onDim();
    if (this.reduceMotion) this._project();
  }

  select(id) {
    if (!this.planeSet.select(id)) return;
    if (this.onState) this.onState();
  }

  setSelectedAngle(rad) {
    if (!this.planeSet.selected) return;
    this.planeSet.setSelectedAngle(rad);
    if (this.reduceMotion || this.paused) this._project();
    if (this.onDial) this.onDial();
  }

  selectedAngle() { return this.planeSet.selectedAngle(); }
  selectedPlane() { return this.planeSet.selectedPlane(); }

  /** force a re-projection now (used by the Console when paused/still) */
  project() { this._project(); }

  /* console-facing accessors that used to be direct field reads */
  get selectorPlanes() { return this.planeSet.selectorPlanes; }
  get selected() { return this.planeSet.selected; }
  get preset() { return this.planeSet.preset; }
  get controls() { return this.renderer.controls; }
  get camera() { return this.renderer.camera; }
  get group() { return this.renderer.group; }
  get trail() { return this.trails.active() ? this.trails : null; }
  get trailAllowed() { return this.trails.isAllowed(); }

  setVerticesVisible(v) {
    this.showVertices = v;
    this.renderer.setVerticesVisible(v);
  }
  setScale(v) {
    this.size = v;
    this.renderer.setScale(v);
  }
  resetView() { this.renderer.resetView(); }

  /* ---- main loop ---- */
  start() {
    if (!this.ok_) return;
    this._render = this._render.bind(this);
    requestAnimationFrame(this._render);
  }

  _render(now) {
    requestAnimationFrame(this._render);
    const dt = this._last ? Math.min((now - this._last) / 1000, LOOP.maxDt) : 0;
    this._last = now;
    this._frame++;

    // drop the loading veil as soon as the first real frame is up
    if (this._frame === 1) {
      const veil = document.getElementById(SEL.loading.slice(1));
      if (veil) { veil.classList.add('hidden'); setTimeout(() => veil.remove(), VEIL.removeDelay); }
    }

    // ease the dimension morph in
    if (this.unfold < this.unfoldTarget) {
      this.unfold = Math.min(
        this.unfoldTarget,
        this.unfold + (1 - this.unfold) * Math.min(1, dt / LOOP.unfoldEase));
      if (this.unfoldTarget - this.unfold < LOOP.unfoldSnap) this.unfold = this.unfoldTarget;
    }

    // accumulate per-plane rotation (held planes stay put)
    if (!this.paused && !this.reduceMotion) {
      this.planeSet.spinning.forEach((id) => {
        if (this.dragging && id === this.planeSet.selected) return; // hand owns it
        if (!this.planeSet.planes.find((q) => q.id === id)) return;
        // isoclinic planes share ONE angular velocity (equal speed = great circles)
        const om = this.planeSet.omegaOf(id);
        this.planeSet.angle[id] = (this.planeSet.angle[id] + om * dt * this.speed) % (Math.PI * 2);
      });
    }

    if (!this.paused || this.unfold < 1 || this.reduceMotion) this._project();

    // advance the vertex trails after the fresh projection
    if (this.trails.active() && !this.paused && !this.reduceMotion) {
      this.trails.push();
      this.trails.rebuild();
    }

    this.renderer.controls.update();
    this.renderer.render();

    // instrument readouts (throttled)
    if (this._frame % LOOP.readoutEvery === 0 && this.onTick) this.onTick(this.stress);
  }

  pause(p) { this.paused = p; }
  resize() { this.renderer.resize(); }
}
