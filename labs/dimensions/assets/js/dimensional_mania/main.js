/* ============================================================
   main.js — WITNESS: the Dimensions instrument.

   One honest hypercube you READ, not a swarm you watch. A single
   2^n-vertex N-cube is rotated in its true coordinate planes, then
   perspective-divided down to 3D. The whole bench is built to make
   that hidden mechanism felt:

     · the Plane Dial   — turn an axis you cannot see, by hand
     · the Shadow Ledger — see which hidden axis is bending the shadow
     · live counts       — dimensionality as a number that climbs
     · the legibility wall (6D+) — where direct vision fails by design

   Consumes tokens.css for every colour. THREE r128 + OrbitControls +
   UnrealBloomPass are loaded as globals by md_animation_page.html.
   ============================================================ */

import {
  HyperCube, AXES, POLY_NAMES,
  faceCount, elementLedger, binomial,
} from './n_dimensional_cube.js';

const params = new URLSearchParams(location.search);
const STILL = params.has('still');
// ?motion forces full motion even when the OS asks to reduce it (some headless
// browsers default to reduce; it is also a genuine opt-in to the animation).
const FORCE_MOTION = params.has('motion');
const reduceMotion = STILL ||
  (!FORCE_MOTION && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
if (STILL) document.documentElement.classList.add('still');

/* ---- palette pulled from the design tokens (rgb 0..1) ---- */
const hexRGB = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];
const WIRE = {
  cold: hexRGB('#5BB0D6'), // horizon — vertex sits in our 3-space
  warm: hexRGB('#F2A93B'), // accretion — vertex pushed deep into a hidden axis
};

/* ---- per-dimension gloss (the one honest line) ---- */
const GLOSS = {
  1: 'a segment — two points, one edge.',
  2: 'a square — a segment dragged sideways.',
  3: 'a cube — a square dragged into depth.',
  4: 'a tesseract — a cube dragged through an axis you cannot point at.',
  5: 'a penteract — perspective still holds, barely.',
  6: 'past here one 3D shadow cannot separate the corners. read the rule, not the shape.',
};
const glossFor = (n) => GLOSS[n] || GLOSS[6];

const CONFIG = {
  startDim: 4,
  minDim: 1,
  maxDim: 10,
  speed: 0.6,        // master multiplier over per-plane omega
  projDistance: 3.2, // perspective fold distance
  size: 1.5,         // object scale
  orthoFrom: 6,      // auto-orthographic at/above this dimension
};

const el = (t, c, h) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (h != null) n.innerHTML = h;
  return n;
};
const fmt = (v) => v.toLocaleString('en-US');
const deg = (rad) => Math.round(((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI);

/* ============================================================
   The instrument
   ============================================================ */
class Witness {
  constructor(canvas) {
    this.canvas = canvas;
    this.dim = CONFIG.startDim;
    this.speed = CONFIG.speed;
    this.projDistance = CONFIG.projDistance;
    this.size = CONFIG.size;
    this.projMode = 'auto';      // 'auto' | 'perspective' | 'orthographic'
    this.showVertices = true;
    this.paused = reduceMotion;

    // rotation state
    this.planes = [];            // all C(n,2) planes for current dim
    this.angle = {};             // id -> accumulated radians
    this.spinning = new Set();   // ids currently auto-rotating
    this.selected = null;        // id bound to the Plane Dial
    this.dragging = false;       // dial being driven by hand

    // morph
    this.unfold = 1;
    this.unfoldTarget = 1;

    // the "mania" layer — vertex trails (Hopf-fibre traces) + isoclinic lock
    this.trailLen = 130;
    this.isoOmega = 0.4;
    this.isoSet = new Set();
    this.showTrails = undefined; // resolved per dimension in _initTrail

    this._last = 0;
    this._frame = 0;
    this.ok_ = this._initGL();
    if (!this.ok_) return;

    this._buildPlanes(true);
    this._buildCube();
  }

  ok() { return this.ok_; }

  _initGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: true, alpha: false,
      });
    } catch (e) { return false; }
    if (!this.renderer || !this.renderer.getContext()) return false;

    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#080A0C');

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.camera.position.set(4.2, 3.0, 8.5);

    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 24;
    this.controls.autoRotate = false;
    this.controls.target.set(0, 0, 0);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._initPost(w, h);
    return true;
  }

  _initPost(w, h) {
    // Real UnrealBloom — restrained: only the brightest edge crossings glow,
    // so it reads as a luminous instrument, not haze. Bloom is a static look,
    // not motion, so it stays on even under reduced motion / ?still.
    if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.RenderPass) {
      this.composer = null; return;
    }
    try {
      this.composer = new THREE.EffectComposer(this.renderer);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.bloom = new THREE.UnrealBloomPass(
        new THREE.Vector2(w, h), 0.95, 0.55, 0.16 // strength, radius, threshold
      );
      this.composer.addPass(this.bloom);
    } catch (e) { this.composer = null; }
  }

  /* ---- planes ---- */
  _buildPlanes(initial) {
    const n = this.dim;
    const prevAngle = this.angle;
    const planes = [];
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const id = `${i}-${j}`;
        const hidden = j >= 3;               // involves an unseeable axis
        const base = hidden ? 0.42 : 0.12;    // hidden planes carry the 4D+ motion
        const spread = 0.55 + 0.45 * (((idx + 1) * 0.6180339887) % 1);
        planes.push({ i, j, id, hidden, label: `${AXES[i]}–${AXES[j]}`, omega: base * spread });
        idx++;
      }
    }
    this.planes = planes;

    // preserve accumulated angles across dimension changes
    const angle = {};
    planes.forEach((p) => { angle[p.id] = prevAngle && prevAngle[p.id] != null ? prevAngle[p.id] : 0; });
    this.angle = angle;

    // selector subset: spatial planes + visible×hidden fold planes
    this.selectorPlanes = planes.filter((p) => !p.hidden || p.i < 3);

    // keep / pick a dial plane
    if (!this.selected || !angle.hasOwnProperty(this.selected)) {
      const firstFold = planes.find((p) => p.hidden && p.i < 3);
      this.selected = firstFold ? firstFold.id : (planes[0] ? planes[0].id : null);
    }

    if (initial) {
      // seed a flattering pose so the first frame (and ?still shots) read as
      // a real folded tesseract, not an axis-aligned shadow
      if (this.selected && angle[this.selected] === 0) angle[this.selected] = 0.62;
      const disjoint = planes.find((p) =>
        p.id !== this.selected && p.hidden &&
        !(`${p.i}` === `${this.selected.split('-')[0]}`) && angle[p.id] === 0);
      if (disjoint) angle[disjoint.id] = 0.33;
      // open alive: 4D+ starts in an isoclinic spin so the Hopf circles form
      this._applyPreset(this.dim >= 4 ? 'iso' : 'single', true);
    }
  }

  /* ---- geometry ---- */
  _buildCube() {
    if (this.geo) {
      this.group.remove(this.lines);
      if (this.points) this.group.remove(this.points);
      this.geo.dispose();
    }
    const cube = new HyperCube(this.dim);
    this.cube = cube;
    this.vCount = cube.vCount;   // trail code reads this.vCount
    this.pos = new Float32Array(cube.vCount * 3);
    this.col = new Float32Array(cube.vCount * 3);
    this.stress = new Float32Array(this.dim);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(new THREE.BufferAttribute(cube.edgeIndex, 1));
    this.geo = geo;

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.lineMat = lineMat;
    this.lines = new THREE.LineSegments(geo, lineMat);
    this.group.add(this.lines);

    const ptMat = new THREE.PointsMaterial({
      size: 0.05, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.ptMat = ptMat;
    this.points = new THREE.Points(geo, ptMat);
    this.points.visible = this.showVertices;
    this.group.add(this.points);

    this.group.scale.setScalar(this.size);

    // morph the new hidden axes in from a 3-cube (skip on first paint / still)
    this.unfold = (this.dim > 3 && !reduceMotion) ? 0 : 1;
    this.unfoldTarget = 1;

    this._initTrail(); // seeds the trail using the unfold just set

    this._project();
  }

  /* ---- vertex trails: each corner leaves a fading trace of its 3D path.
     under an isoclinic rotation those traces are clean great circles
     (Hopf fibres) — the visible proof the rotation is genuinely 4D+. ---- */
  _initTrail() {
    if (this.trail) { this.group.remove(this.trail); this.trailGeo.dispose(); this.trail.material.dispose(); this.trail = null; }
    // trails are legible (and cheap) up to ~6D; off in reduced motion
    this.trailAllowed = this.vCount <= 64 && !reduceMotion;
    if (this.showTrails === undefined) this.showTrails = this.dim <= 5 && !reduceMotion;
    if (!this.trailAllowed || !this.showTrails) { this.trail = null; return; }

    const L = this.trailLen, V = this.vCount;
    this.trailHist = new Float32Array(V * L * 3);
    this.trailHead = 0;
    this.trailFilled = 0;
    const maxSeg = V * (L - 1);
    this.trailPos = new Float32Array(maxSeg * 2 * 3);
    this.trailCol = new Float32Array(maxSeg * 2 * 3);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    g.setDrawRange(0, 0);
    this.trailGeo = g;
    this.trail = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(this.trail);
    this._seedTrail(); // back-fill the path so the circles are there on load
  }

  // back-simulate each vertex's recent path so trails are full immediately
  // (no one-second build-up, and screenshots show the Hopf circles)
  _seedTrail() {
    const L = this.trailLen, dtF = 1 / 60, tmp = new Float32Array(this.vCount * 3);
    for (let k = 0; k < L; k++) {
      const framesAgo = L - 1 - k; // k=0 = oldest sample
      const rotations = this.planes.map((p) => {
        const om = this.isoSet.has(p.id) ? this.isoOmega : p.omega;
        const back = this.spinning.has(p.id) ? om * this.speed * dtF * framesAgo : 0;
        return { i: p.i, j: p.j, angle: this.angle[p.id] - back };
      });
      this.cube.project(tmp, {
        rotations, projDistance: this.projDistance, unfold: this.unfold, ortho: this.isOrtho(),
      });
      for (let v = 0; v < this.vCount; v++) {
        const o = (v * L + k) * 3, p = v * 3;
        this.trailHist[o] = tmp[p]; this.trailHist[o + 1] = tmp[p + 1]; this.trailHist[o + 2] = tmp[p + 2];
      }
    }
    this.trailHead = 0;
    this.trailFilled = L;
  }

  _pushTrail() {
    const L = this.trailLen, head = this.trailHead, pos = this.pos, hist = this.trailHist;
    for (let v = 0; v < this.vCount; v++) {
      const o = (v * L + head) * 3, p = v * 3;
      hist[o] = pos[p]; hist[o + 1] = pos[p + 1]; hist[o + 2] = pos[p + 2];
    }
    this.trailHead = (head + 1) % L;
    if (this.trailFilled < L) this.trailFilled++;
  }

  _rebuildTrail() {
    const L = this.trailLen, filled = this.trailFilled;
    if (filled < 2) { this.trailGeo.setDrawRange(0, 0); return; }
    const start = (this.trailHead - filled + L) % L; // oldest sample
    const tp = this.trailPos, tc = this.trailCol, hist = this.trailHist, col = this.col;
    let s = 0;
    for (let v = 0; v < this.vCount; v++) {
      // trails read as luminous motion-light (warm-white), distinct from the
      // duotone structural edges and amplified by the bloom
      const base = v * L, cr = 1.0, cg = 0.9, cb = 0.72;
      for (let k = 0; k < filled - 1; k++) {
        const oa = (base + (start + k) % L) * 3, ob = (base + (start + k + 1) % L) * 3;
        // age: old tip stays faintly lit (floor 0.14) so the comet tail reads,
        // brightening to full colour at the live vertex
        const fa = 0.14 + 0.86 * (k / (filled - 1));
        const fb = 0.14 + 0.86 * ((k + 1) / (filled - 1));
        tp[s] = hist[oa]; tp[s + 1] = hist[oa + 1]; tp[s + 2] = hist[oa + 2];
        tc[s] = cr * fa; tc[s + 1] = cg * fa; tc[s + 2] = cb * fa; s += 3;
        tp[s] = hist[ob]; tp[s + 1] = hist[ob + 1]; tp[s + 2] = hist[ob + 2];
        tc[s] = cr * fb; tc[s + 1] = cg * fb; tc[s + 2] = cb * fb; s += 3;
      }
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
    this.trailGeo.setDrawRange(0, s / 3);
  }

  toggleTrails() {
    if (!this.trailAllowed) return;
    this.showTrails = !this.showTrails;
    this._initTrail();
  }

  isOrtho() {
    if (this.projMode === 'orthographic') return true;
    if (this.projMode === 'perspective') return false;
    return this.dim >= CONFIG.orthoFrom; // auto — the legibility wall
  }

  _project() {
    const rotations = this.planes.map((p) => ({ i: p.i, j: p.j, angle: this.angle[p.id] }));
    this.cube.project(this.pos, {
      colors: this.col,
      rotations,
      projDistance: this.projDistance,
      unfold: this.unfold,
      palette: WIRE,
      ortho: this.isOrtho(),
      stress: this.stress,
    });
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeBoundingSphere();
    // past the wall the wireframe deliberately reads faint
    const faint = this.isOrtho() && this.dim >= CONFIG.orthoFrom;
    this.lineMat.opacity = faint ? 0.5 : 0.92;
  }

  /* ---- presets over the rotation planes ---- */
  _disjointOf(sel) {
    return this.planes.find((p) =>
      p.id !== sel.id && p.i !== sel.i && p.i !== sel.j && p.j !== sel.i && p.j !== sel.j);
  }

  _applyPreset(which, silent) {
    const sel = this.planes.find((p) => p.id === this.selected);
    this.spinning = new Set();
    this.isoSet = new Set();
    if (which === 'still') {
      // hold everything where it is
    } else if (which === 'single') {
      if (sel) this.spinning.add(sel.id);
    } else if (which === 'double') {
      if (sel) {
        this.spinning.add(sel.id);
        // a plane disjoint from the selected one -> a true double rotation
        const disjoint = this._disjointOf(sel);
        if (disjoint) this.spinning.add(disjoint.id);
      }
    } else if (which === 'iso') {
      // two disjoint planes locked to EQUAL speed -> isoclinic rotation:
      // every vertex rides a great circle, the turn with no 3D analogue
      if (sel) {
        this.spinning.add(sel.id); this.isoSet.add(sel.id);
        const disjoint = this._disjointOf(sel);
        if (disjoint) { this.spinning.add(disjoint.id); this.isoSet.add(disjoint.id); }
      }
    } else if (which === 'all') {
      this.planes.forEach((p) => { if (p.hidden) this.spinning.add(p.id); });
      const spatial = this.planes.find((p) => !p.hidden);
      if (spatial) this.spinning.add(spatial.id);
      if (!this.spinning.size && sel) this.spinning.add(sel.id);
    }
    this.preset = which;
    if (!silent && this.onState) this.onState();
  }

  setDim(n) {
    n = Math.max(CONFIG.minDim, Math.min(CONFIG.maxDim, n));
    if (n === this.dim) return;
    this.dim = n;
    this._buildPlanes(false);
    this._applyPreset(this.preset || 'single', true);
    this._buildCube();
    if (this.onDim) this.onDim();
    if (reduceMotion) this._project();
  }

  select(id) {
    if (!this.angle.hasOwnProperty(id)) return;
    this.selected = id;
    // re-seat the active preset around the new plane
    this._applyPreset(this.preset || 'single', true);
    if (this.onState) this.onState();
  }

  setSelectedAngle(rad) {
    if (!this.selected) return;
    this.angle[this.selected] = rad;
    if (reduceMotion || this.paused) this._project();
    if (this.onDial) this.onDial();
  }

  selectedAngle() { return this.selected ? this.angle[this.selected] : 0; }
  selectedPlane() { return this.planes.find((p) => p.id === this.selected); }

  /* ---- main loop ---- */
  start() {
    if (!this.ok_) return;
    this._render = this._render.bind(this);
    requestAnimationFrame(this._render);
  }

  _render(now) {
    requestAnimationFrame(this._render);
    const dt = this._last ? Math.min((now - this._last) / 1000, 0.05) : 0;
    this._last = now;
    this._frame++;

    // drop the loading veil as soon as the first real frame is up
    if (this._frame === 1) {
      const veil = document.getElementById('dx-loading');
      if (veil) { veil.classList.add('hidden'); setTimeout(() => veil.remove(), 650); }
    }

    // ease the dimension morph in
    if (this.unfold < this.unfoldTarget) {
      this.unfold = Math.min(this.unfoldTarget, this.unfold + (1 - this.unfold) * Math.min(1, dt / 0.12));
      if (this.unfoldTarget - this.unfold < 0.002) this.unfold = this.unfoldTarget;
    }

    // accumulate per-plane rotation (held planes stay put)
    if (!this.paused && !reduceMotion) {
      this.spinning.forEach((id) => {
        if (this.dragging && id === this.selected) return; // hand owns it
        const p = this.planes.find((q) => q.id === id);
        if (!p) return;
        // isoclinic planes share ONE angular velocity (equal speed = great circles)
        const om = this.isoSet.has(id) ? this.isoOmega : p.omega;
        this.angle[id] = (this.angle[id] + om * dt * this.speed) % (Math.PI * 2);
      });
    }

    if (!this.paused || this.unfold < 1 || reduceMotion) this._project();

    // advance the vertex trails after the fresh projection
    if (this.trail && !this.paused && !reduceMotion) {
      this._pushTrail();
      this._rebuildTrail();
    }

    this.controls.update();

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    // instrument readouts (throttled)
    if (this._frame % 2 === 0 && this.onTick) this.onTick(this.stress);
  }

  pause(p) { this.paused = p; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
  }
}

/* ============================================================
   The control console
   ============================================================ */
function buildConsole(host, w) {
  const titleEl = document.querySelector('.dx-title');
  const captionEl = document.querySelector('.dx-caption');
  const ledgerEl = document.getElementById('dx-ledger');

  const panel = el('div', 'dx-panel');
  const head = el('div', 'dx-panel-head', '<span>Dimensions</span>');
  const collapse = el('button', 'dx-collapse', '–');
  head.appendChild(collapse);
  panel.appendChild(head);
  const body = el('div', 'dx-panel-body');

  /* ---- DIMENSION stepper ---- */
  body.appendChild(el('div', 'dx-section', 'Dimension'));
  const stepper = el('div', 'dx-stepper');
  const minus = el('button', 'dx-step', '−');
  const plus = el('button', 'dx-step', '+');
  const dimReadout = el('div', 'dx-dim-readout',
    `<span class="dx-dim-n"></span><span class="dx-dim-name"></span>`);
  stepper.append(minus, dimReadout, plus);
  body.appendChild(stepper);
  const dots = el('div', 'dx-dots');
  const dotEls = [];
  for (let i = CONFIG.minDim; i <= CONFIG.maxDim; i++) {
    const d = el('span', 'dx-dot'); dots.appendChild(d); dotEls.push(d);
  }
  body.appendChild(dots);

  /* ---- live readout ---- */
  const readout = el('div', 'dx-readout');
  body.appendChild(readout);
  const chain = el('div', 'dx-chain');
  body.appendChild(chain);
  const gloss = el('div', 'dx-gloss');
  body.appendChild(gloss);

  /* ---- ROTATION ---- */
  body.appendChild(el('div', 'dx-section', 'Rotation'));
  const presetRow = el('div', 'dx-presets');
  const PRESETS = [['still', 'Hold'], ['single', 'Single'], ['double', 'Double'], ['iso', 'Iso'], ['all', 'All']];
  const presetBtns = {};
  PRESETS.forEach(([id, label]) => {
    const b = el('button', 'dx-preset', label);
    b.addEventListener('click', () => { w._applyPreset(id); });
    presetBtns[id] = b;
    presetRow.appendChild(b);
  });
  body.appendChild(presetRow);

  // plane selector
  const planesWrap = el('div', 'dx-planes');
  body.appendChild(planesWrap);

  // the Plane Dial
  const dialWrap = el('div', 'dx-dial-wrap');
  const dial = el('div', 'dx-dial');
  const dialMeta = el('div', 'dx-dial-meta',
    `<div class="dx-dial-plane"></div><div class="dx-dial-deg"></div>`);
  const scrub = el('input', 'dx-scrub');
  Object.assign(scrub, { type: 'range', min: -180, max: 180, step: 1, value: 0 });
  dialMeta.appendChild(scrub);
  dialWrap.append(dial, dialMeta);
  body.appendChild(dialWrap);

  /* ---- PROJECTION ---- */
  body.appendChild(el('div', 'dx-section', 'Projection'));
  const projToggles = el('div', 'dx-toggles');
  const PROJ = [['auto', 'Auto'], ['perspective', 'Perspect'], ['orthographic', 'Ortho']];
  const projBtns = {};
  PROJ.forEach(([id, label]) => {
    const b = el('button', 'dx-toggle', label);
    b.addEventListener('click', () => { w.projMode = id; syncProj(); w._project(); });
    projBtns[id] = b; projToggles.appendChild(b);
  });
  body.appendChild(projToggles);

  const sliders = {};
  const mkSlider = (key, label, min, max, step, get, set, fmtv) => {
    const row = el('label', 'dx-row');
    row.appendChild(el('span', 'dx-row-label', label));
    const val = el('span', 'dx-row-val');
    const input = el('input', 'dx-slider');
    Object.assign(input, { type: 'range', min, max, step, value: get() });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value); set(v); val.textContent = fmtv(v);
      if (w.paused || reduceMotion) w._project();
    });
    val.textContent = fmtv(get());
    row.append(input, val);
    sliders[key] = { input, val };
    body.appendChild(row);
  };
  mkSlider('dist', 'Fold distance', 2.2, 6, 0.05,
    () => w.projDistance, (v) => { w.projDistance = v; }, (v) => v.toFixed(2));
  mkSlider('speed', 'Speed', 0, 2, 0.01,
    () => w.speed, (v) => { w.speed = v; }, (v) => v.toFixed(2));
  mkSlider('size', 'Scale', 0.5, 3, 0.01,
    () => w.size, (v) => { w.size = v; w.group.scale.setScalar(v); }, (v) => v.toFixed(2));

  /* ---- VIEW ---- */
  body.appendChild(el('div', 'dx-section', 'View'));
  const viewToggles = el('div', 'dx-toggles');
  const vertsBtn = el('button', 'dx-toggle', 'Vertices');
  vertsBtn.addEventListener('click', () => {
    w.showVertices = !w.showVertices; w.points.visible = w.showVertices;
    vertsBtn.classList.toggle('on', w.showVertices);
  });
  const trailsBtn = el('button', 'dx-toggle', 'Trails');
  trailsBtn.addEventListener('click', () => { w.toggleTrails(); syncView(); });
  const resetBtn = el('button', 'dx-toggle', 'Reset view');
  resetBtn.addEventListener('click', () => {
    w.camera.position.set(4.2, 3.0, 8.5); w.controls.target.set(0, 0, 0); w.controls.update();
  });
  viewToggles.append(vertsBtn, trailsBtn, resetBtn);
  body.appendChild(viewToggles);
  function syncView() {
    vertsBtn.classList.toggle('on', w.showVertices);
    trailsBtn.classList.toggle('on', !!w.trail);
    trailsBtn.disabled = !w.trailAllowed;
  }

  const pause = el('button', 'dx-pause', reduceMotion ? 'Reduced motion' : 'Pause');
  if (reduceMotion) pause.disabled = true;
  let paused = reduceMotion;
  pause.addEventListener('click', () => {
    if (reduceMotion) return;
    paused = !paused; w.pause(paused); pause.textContent = paused ? 'Play' : 'Pause';
  });
  body.appendChild(pause);

  panel.appendChild(body);
  host.appendChild(panel);

  collapse.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    collapse.textContent = hidden ? '–' : '+';
  });

  /* ---- dial interaction ---- */
  let dialBase = 0, dialStart = 0;
  const pointerAngle = (ev) => {
    const r = dial.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
  };
  dial.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    w.dragging = true;
    w._applyPreset('still');            // grabbing the dial stops the idle spin
    dialStart = pointerAngle(ev);
    dialBase = w.selectedAngle();
    dial.setPointerCapture(ev.pointerId);
  });
  dial.addEventListener('pointermove', (ev) => {
    if (!w.dragging) return;
    const delta = pointerAngle(ev) - dialStart;
    w.setSelectedAngle(dialBase + delta);
    syncDial();
  });
  const dialUp = (ev) => {
    if (!w.dragging) return;
    w.dragging = false;
    try { dial.releasePointerCapture(ev.pointerId); } catch (e) {}
  };
  dial.addEventListener('pointerup', dialUp);
  dial.addEventListener('pointercancel', dialUp);
  scrub.addEventListener('input', () => {
    w.setSelectedAngle(parseFloat(scrub.value) * Math.PI / 180);
    syncDial();
  });

  /* ---- steppers ---- */
  minus.addEventListener('click', () => w.setDim(w.dim - 1));
  plus.addEventListener('click', () => w.setDim(w.dim + 1));

  /* ---- sync helpers ---- */
  function syncProj() {
    Object.entries(projBtns).forEach(([id, b]) => b.classList.toggle('on', w.projMode === id));
  }
  function syncPlanes() {
    planesWrap.innerHTML = '';
    if (!w.selectorPlanes.length) {
      planesWrap.appendChild(el('div', 'dx-planes-empty', 'no rotation planes below 2D'));
      return;
    }
    w.selectorPlanes.forEach((p) => {
      const b = el('button', 'dx-plane');
      b.appendChild(el('span', 'dx-plane-dot'));
      b.appendChild(el('span', 'dx-plane-label', p.label));
      b.classList.toggle('on', p.id === w.selected);
      b.addEventListener('click', () => { w.select(p.id); });
      planesWrap.appendChild(b);
    });
  }
  function syncDial() {
    const p = w.selectedPlane();
    const a = w.selectedAngle();
    dial.style.setProperty('--deg', `${a * 180 / Math.PI}deg`);
    dialMeta.querySelector('.dx-dial-plane').innerHTML = p ? `plane <b>${p.label}</b>` : '—';
    dialMeta.querySelector('.dx-dial-deg').textContent = `${deg(a)}°`;
    const sv = ((deg(a) + 180) % 360) - 180;
    if (parseInt(scrub.value, 10) !== sv) scrub.value = sv;
  }
  function syncPresets() {
    Object.entries(presetBtns).forEach(([id, b]) => b.classList.toggle('on', w.preset === id));
  }

  // count-up tween for the felt-dimensionality beat
  const tweens = {};
  function countUp(node, to) {
    const from = tweens[node._k] != null ? tweens[node._k] : 0;
    if (reduceMotion) { tweens[node._k] = to; node.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 340;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      node.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(step); else tweens[node._k] = to;
    };
    requestAnimationFrame(step);
  }

  function syncReadout() {
    const n = w.dim;
    const name = POLY_NAMES[n] || `${n}-cube`;
    dimReadout.querySelector('.dx-dim-n').textContent = `${n}D`;
    dimReadout.querySelector('.dx-dim-name').textContent = name;
    dotEls.forEach((d, i) => d.classList.toggle('on', (i + CONFIG.minDim) <= n));
    if (titleEl) titleEl.innerHTML = `<b>${name}</b> · Dimensions`;

    const ledger = elementLedger(n);
    const V = ledger.find((r) => r.k === 0).count;
    const E = (ledger.find((r) => r.k === 1) || { count: 0 }).count;
    const faces = (ledger.find((r) => r.k === 2) || {}).count;
    const cells = (ledger.find((r) => r.k === 3) || {}).count;
    const facets = faceCount(n, n - 1);     // == 2n
    const planeCount = binomial(n, 2);      // the combinatorial-blowup lesson

    const rows = [
      ['vertices', V, true],
      ['edges', E, true],
    ];
    if (faces != null) rows.push(['faces', faces, false]);
    if (cells != null) rows.push(['cells', cells, false]);
    rows.push(['facets', facets, false]);
    rows.push(['planes', planeCount, false]);

    readout.innerHTML = '';
    rows.forEach(([k, v, tick]) => {
      const r = el('div', 'r', `<k>${k}</k><b></b>`);
      const b = r.querySelector('b');
      b._k = k;
      readout.appendChild(r);
      if (tick) countUp(b, v); else b.textContent = fmt(v);
    });

    chain.textContent = n > 3
      ? Array.from({ length: n - 2 }, (_, i) => `${n - i}D`).join(' → ')
      : `${n}D`;
    gloss.textContent = glossFor(n);

    syncPlanes();
    syncDial();
  }

  /* ---- the Shadow Ledger ---- */
  function buildLedger() {
    ledgerEl.innerHTML = '';
    const hidden = [];
    for (let d = 3; d < w.dim; d++) hidden.push(d);
    if (!hidden.length) { ledgerEl.classList.add('empty'); return; }
    ledgerEl.classList.remove('empty');
    ledgerEl.appendChild(el('div', 'dx-ledger-head', 'Shadow Ledger · hidden-axis distortion'));
    ledgerEl._rows = {};
    // cap visible bars so 8D+ doesn't reproduce the noise it cures
    const show = hidden.slice(0, 6);
    show.forEach((d) => {
      const row = el('div', 'dx-ledger-row',
        `<span class="dx-ledger-axis">${AXES[d]}</span><span class="dx-ledger-track"><span class="dx-ledger-fill"></span></span>`);
      ledgerEl.appendChild(row);
      ledgerEl._rows[d] = row;
    });
    ledgerEl._show = show;
  }
  function tickLedger(stress) {
    if (!ledgerEl._rows || !ledgerEl._show) return;
    let hotAxis = -1, hotVal = 0;
    ledgerEl._show.forEach((d) => {
      const s = stress[d] || 0;
      if (s > hotVal) { hotVal = s; hotAxis = d; }
    });
    ledgerEl._show.forEach((d) => {
      const row = ledgerEl._rows[d];
      const s = stress[d] || 0;
      const pct = Math.min(100, (s / 1.4) * 100); // ~1.4 = strong fold
      row.querySelector('.dx-ledger-fill').style.width = `${pct}%`;
      row.classList.toggle('hot', d === hotAxis && hotVal > 0.02);
    });
  }

  /* ---- caption (the diegetic line) ---- */
  function tickCaption() {
    if (!captionEl) return;
    if (w.unfold < 0.98) {
      captionEl.innerHTML = `extruding into <b>${w.dim}D</b>`;
      return;
    }
    if (w.isOrtho() && w.dim >= CONFIG.orthoFrom) {
      captionEl.innerHTML = `<b>${w.dim}D</b> · legibility wall — one shadow can't hold ${fmt(Math.pow(2, w.dim))} corners apart`;
      return;
    }
    const p = w.selectedPlane();
    captionEl.innerHTML = p
      ? `rotating <b>${p.label}</b> · ${deg(w.selectedAngle())}°`
      : `${w.dim}D`;
  }

  // wire instrument callbacks
  w.onState = () => { syncPresets(); syncPlanes(); syncDial(); };
  w.onDial = () => { syncDial(); tickCaption(); };
  w.onDim = () => { syncReadout(); syncProj(); buildLedger(); syncView(); };
  w.onTick = (stress) => { tickLedger(stress); tickCaption(); };

  // initial paint
  syncReadout(); syncProj(); syncPlanes(); syncDial(); syncPresets(); buildLedger(); syncView();

  return { syncReadout };
}

/* ============================================================
   boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('dx-canvas');
  const w = new Witness(canvas);

  if (!w.ok()) {
    const veil = document.getElementById('dx-loading');
    if (veil) veil.remove();
    const msg = el('div', 'dx-nowebgl',
      'This instrument needs WebGL.<br>Try a current Chrome, Edge, Firefox or Safari.');
    document.body.appendChild(msg);
    return;
  }

  buildConsole(document.getElementById('dx-controls'), w);

  // deep-link a dimension: ?d=4
  if (params.has('d')) {
    const d = parseInt(params.get('d'), 10);
    if (!isNaN(d)) w.setDim(d);
  }

  window.addEventListener('resize', () => w.resize());

  w.start();

  const veil = document.getElementById('dx-loading');
  if (veil) requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('hidden')));
});
