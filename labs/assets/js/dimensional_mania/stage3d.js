/* ============================================================
   dimensional_mania/stage3d.js — the WebGL view (Three.js r128, loaded
   as globals by md_animation_page.html). It owns the scene, the camera,
   the orbit controls, the restrained bloom of the full tier, and the
   GPU buffers the engine writes into each frame:
     shadow (indexed edges, or arc segments in stereographic mode),
     vertex points, trails, the slice (faces, edges, points) and the
     slicing sheet for 2D and 3D objects.
   It performs no projection maths of its own.
   ============================================================ */

import { PALETTE, RENDER } from './constants.js';

const T = () => window.THREE;

/** a line or mesh buffer that grows when the engine writes more than fits */
class Dyn {
  constructor(group, kind, material, stride = 3) {
    this.group = group; this.kind = kind; this.material = material; this.stride = stride;
    this.cap = 0; this.obj = null;
  }
  _alloc(cap) {
    const THREE = T();
    if (this.obj) { this.group.remove(this.obj); this.obj.geometry.dispose(); }
    this.cap = cap;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    const pa = new THREE.BufferAttribute(this.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.col, 3); ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa); g.setAttribute('color', ca);
    g.setDrawRange(0, 0);
    this.obj = this.kind === 'lines' ? new THREE.LineSegments(g, this.material)
      : this.kind === 'points' ? new THREE.Points(g, this.material) : new THREE.Mesh(g, this.material);
    this.obj.frustumCulled = false;
    this.group.add(this.obj);
  }
  /** ensure room for count vertices; returns the writable arrays */
  room(count) {
    if (count > this.cap) { let c = 256; while (c < count) c *= 2; this._alloc(c); }
    return { pos: this.pos, col: this.col };
  }
  commit(count) {
    if (!this.obj) { if (!count) return; this.room(count); }
    const g = this.obj.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, count);
  }
  visible(v) { if (this.obj) this.obj.visible = v; }
}

export class Stage {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier;
    this.ok = this._init();
  }

  _init() {
    const THREE = T();
    if (!THREE) return false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, preserveDrawingBuffer: false });
    } catch (e) { return false; }
    if (!this.renderer.getContext()) return false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.void);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.camera.position.set(3.4, 2.5, 9.4);
    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.65, enablePan: false, minDistance: 4.5, maxDistance: 30 });
    this.controls.target.set(0, 0, 0);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const add = THREE.AdditiveBlending;
    this.lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: add, depthWrite: false });
    this.ptMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.95, blending: add, depthWrite: false, sizeAttenuation: true });
    this.trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: add, depthWrite: false });
    this.sliceFaceMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: RENDER.sliceFaceOpacity, blending: add, depthWrite: false, side: THREE.DoubleSide });
    this.sliceLineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: add, depthWrite: false });
    this.slicePtMat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 1, blending: add, depthWrite: false });

    this.trails = new Dyn(this.group, 'lines', this.trailMat);
    this.sliceFaces = new Dyn(this.group, 'mesh', this.sliceFaceMat);
    this.sliceLines = new Dyn(this.group, 'lines', this.sliceLineMat);
    this.slicePts = new Dyn(this.group, 'points', this.slicePtMat);
    this.arcs = new Dyn(this.group, 'lines', this.lineMat);
    // overlays: the picked facet, the Hopf circles of a flow or a probe, the picked vertex
    this.overMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: add, depthWrite: false });
    this.facetLines = new Dyn(this.group, 'lines', this.overMat);
    this.fibres = new Dyn(this.group, 'lines', this.overMat);
    this.markMat = new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 1, blending: add, depthWrite: false });
    this.mark = new Dyn(this.group, 'points', this.markMat);

    // the slicing sheet for 2D and 3D objects: a hairline square / line at x_(n-1) = h
    const sheetGeo = new THREE.BufferGeometry();
    sheetGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.sheet = new THREE.LineSegments(sheetGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(...PALETTE.goldDim), transparent: true, opacity: 0.85, blending: add, depthWrite: false }));
    this.sheet.visible = false;
    this.group.add(this.sheet);
    const fillGeo = new THREE.PlaneGeometry(1, 1);
    this.sheetFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...PALETTE.mid), transparent: true, opacity: 0.035, blending: add, depthWrite: false, side: THREE.DoubleSide }));
    this.sheetFill.visible = false;
    this.group.add(this.sheetFill);

    this._post();
    this.resize();
    return true;
  }

  _post() {
    const THREE = T();
    this.composer = null;
    if (!this.tier.bloom || !THREE.EffectComposer || !THREE.UnrealBloomPass) return;
    try {
      this.composer = new THREE.EffectComposer(this.renderer);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), ...RENDER.bloom);
      this.composer.addPass(this.bloom);
    } catch (e) { this.composer = null; }
  }

  setTier(tier) {
    this.tier = tier;
    if (this.composer) { this.composer = null; this.bloom = null; }
    this._post();
    this.resize();
  }

  /**
   * (Re)build the shadow mesh. arcMode: stereographic edges as segments.
   * @returns {{pos: Float32Array, col: Float32Array}} buffers to write each frame
   */
  setObject(o, arcMode, sub) {
    const THREE = T();
    if (this.shadow) { this.group.remove(this.shadow); this.shadow.geometry.dispose(); this.shadow = null; }
    if (this.points) { this.group.remove(this.points); this.points = null; }
    this.arcMode = arcMode;
    this.arcs.visible(arcMode);
    if (arcMode) {
      const need = o.ne * sub * 2;
      this.arcs.room(need);
      this.vpos = new Float32Array(o.nv * 3);
      this.vcol = new Float32Array(o.nv * 3);
    } else {
      const g = new THREE.BufferGeometry();
      this.vpos = new Float32Array(o.nv * 3);
      this.vcol = new Float32Array(o.nv * 3);
      const pa = new THREE.BufferAttribute(this.vpos, 3); pa.setUsage(THREE.DynamicDrawUsage);
      const ca = new THREE.BufferAttribute(this.vcol, 3); ca.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', pa); g.setAttribute('color', ca);
      g.setIndex(new THREE.BufferAttribute(o.edges, 1));
      this.shadow = new THREE.LineSegments(g, this.lineMat);
      this.shadow.frustumCulled = false;
      this.group.add(this.shadow);
    }
    // vertex points, for polytopes small enough to read as points
    if (!o.curved && o.nv <= 1100) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.vpos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.vcol, 3));
      this.points = new THREE.Points(g, this.ptMat);
      this.points.frustumCulled = false;
      this.ptMat.size = o.nv > 300 ? 0.03 : o.nv > 60 ? 0.045 : 0.06;
      this.group.add(this.points);
    }
    return { pos: this.vpos, col: this.vcol };
  }

  commitShadow(arcCount) {
    if (this.arcMode) { this.arcs.commit(arcCount); }
    else if (this.shadow) {
      this.shadow.geometry.attributes.position.needsUpdate = true;
      this.shadow.geometry.attributes.color.needsUpdate = true;
    }
    if (this.points) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }

  shadowVisible(v) {
    if (this.shadow) this.shadow.visible = v;
    this.arcs.visible(v && this.arcMode);
    if (this.points) this.points.visible = v;
  }

  /** the sheet for n = 2 (a line y = h) and n = 3 (a square z = h) */
  setSheet(n, h, size, visible) {
    const on = visible && (n === 2 || n === 3);
    this.sheet.visible = on;
    this.sheetFill.visible = on && n === 3;
    if (!on) return;
    const p = this.sheet.geometry.attributes.position.array;
    const s = size;
    if (n === 3) {
      const c = [[-s, -s], [s, -s], [s, s], [-s, s]];
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4];
        p.set([a[0], a[1], h, b[0], b[1], h], i * 6);
      }
      this.sheet.geometry.setDrawRange(0, 8);
      this.sheetFill.position.set(0, 0, h);
      this.sheetFill.scale.set(2 * s, 2 * s, 1);
      this.sheetFill.rotation.set(0, 0, 0);
    } else {
      p.set([-s, h, 0, s, h, 0], 0);
      this.sheet.geometry.setDrawRange(0, 2);
    }
    this.sheet.geometry.attributes.position.needsUpdate = true;
  }

  /** scale the group so the projected radius r sits at the fit radius */
  fit(r, target, snap) {
    const want = r > 1e-6 ? target / r : 1;
    const cur = this.group.scale.x;
    const next = snap ? want : cur + (want - cur) * 0.06;
    this.group.scale.setScalar(next);
  }

  /** past 6D the wireframe drops to half opacity so a still frame stays readable */
  setLineOpacity(a) { this.lineMat.opacity = a; }

  setZoom(d) { this.camera.position.setLength(d); this.controls.update(); }
  zoom() { return this.camera.position.length(); }

  /** the current frame as a PNG at `scale` times the CSS size */
  async png(scale = 2) {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h);
    if (this.composer) { if (this.composer.setPixelRatio) this.composer.setPixelRatio(scale); this.composer.setSize(w, h); }
    this.render();
    const blob = await new Promise((res) => this.canvas.toBlob(res, 'image/png'));
    this.resize();
    return blob;
  }

  /** shift the image up by px (phone: the object sits in the first screen) */
  setLift(px) { this.lift = px; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.tier.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.lift) this.camera.setViewOffset(w, h, 0, this.lift, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      if (this.composer.setPixelRatio) this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
  }

  render() {
    this.controls.update();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  /** CSS-pixel screen position of a group-space point (for the SVG plate) */
  screenOf(x, y, z, v3) {
    const THREE = T();
    const p = v3 || new THREE.Vector3();
    p.set(x, y, z).applyMatrix4(this.group.matrixWorld).project(this.camera);
    return [(p.x + 1) / 2 * window.innerWidth, (1 - p.y) / 2 * window.innerHeight, p.z];
  }

  resetView() {
    this.camera.position.set(3.4, 2.5, 9.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
}
