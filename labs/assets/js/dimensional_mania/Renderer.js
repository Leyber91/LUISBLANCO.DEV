/* ============================================================
   dimensional_mania/Renderer.js — all Three.js render policy for
   the WITNESS instrument. Owns the WebGL context, scene, camera,
   OrbitControls, the restrained UnrealBloom composer, the cube
   mesh (line segments + vertex points), and the resize handling.

   THREE r128 + OrbitControls + UnrealBloomPass are loaded as
   GLOBALS by md_animation_page.html (classic scripts), so this
   module reads them off `window.THREE`. It performs NO n-cube
   maths — it asks a HyperCube to project into the buffers it owns.
   ============================================================ */

import { RENDER } from './constants.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = this._initGL();
  }

  _initGL() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: true, alpha: false,
      });
    } catch (e) { return false; }
    if (!this.renderer || !this.renderer.getContext()) return false;

    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.pixelRatioMax));
    this.renderer.setSize(w, h);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(RENDER.background);

    const cam = RENDER.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, w / h, cam.near, cam.far);
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);

    const c = RENDER.controls;
    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = c.dampingFactor;
    this.controls.rotateSpeed = c.rotateSpeed;
    this.controls.enablePan = false;
    this.controls.minDistance = c.minDistance;
    this.controls.maxDistance = c.maxDistance;
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
      const b = RENDER.bloom;
      this.bloom = new THREE.UnrealBloomPass(
        new THREE.Vector2(w, h), b.strength, b.radius, b.threshold
      );
      this.composer.addPass(this.bloom);
    } catch (e) { this.composer = null; }
  }

  /**
   * (Re)build the line/point mesh for a HyperCube, returning the position
   * and colour buffers so the controller can drive projections into them.
   * @param {import('./n_dimensional_cube.js').HyperCube} cube
   * @param {boolean} showVertices
   * @param {number} size group scale
   * @returns {{ pos: Float32Array, col: Float32Array, geo: THREE.BufferGeometry }}
   */
  buildCube(cube, showVertices, size) {
    if (this.geo) {
      this.group.remove(this.lines);
      if (this.points) this.group.remove(this.points);
      this.geo.dispose();
    }
    const pos = new Float32Array(cube.vCount * 3);
    const col = new Float32Array(cube.vCount * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(cube.edgeIndex, 1));
    this.geo = geo;

    this.lineMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: RENDER.lineOpacity.normal,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, this.lineMat);
    this.group.add(this.lines);

    this.ptMat = new THREE.PointsMaterial({
      size: RENDER.pointSize, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.ptMat);
    this.points.visible = showVertices;
    this.group.add(this.points);

    this.group.scale.setScalar(size);

    this.pos = pos;
    this.col = col;
    return { pos, col, geo };
  }

  setScale(size) { this.group.scale.setScalar(size); }
  setVerticesVisible(v) { if (this.points) this.points.visible = v; }
  setLineFaint(faint) {
    if (this.lineMat) this.lineMat.opacity = faint ? RENDER.lineOpacity.faint : RENDER.lineOpacity.normal;
  }

  /** flush a freshly written projection (position+colour) to the GPU */
  commitProjection() {
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  resetView() {
    const pos = RENDER.camera.pos;
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloom) this.bloom.setSize(w, h);
  }
}
