/* ============================================================
   dimensional_mania/TrailField.js — the "mania" layer: each corner
   of the cube leaves a fading trace of its 3D path. Under an
   isoclinic rotation those traces are clean great circles (Hopf
   fibres) — the visible proof the rotation is genuinely 4D+.

   This class owns the ring-buffer history, the line-segment mesh,
   the back-simulated seed (so the circles are present on load and
   in screenshots), and the per-frame push/rebuild. The maths it
   needs (projecting a vertex) it borrows from the HyperCube; it
   never duplicates that maths.
   ============================================================ */

import { TRAIL } from './constants.js';

export class TrailField {
  /**
   * @param {THREE.Group} group   scene group to attach the trail mesh to
   * @param {object} ctx          live projection context (see _project)
   */
  constructor(group, ctx) {
    this.group = group;
    this.ctx = ctx;            // { cube, vCount, planes(), angleOf, spinningHas, isoHas, isoOmega, speed, projDistance, unfold, ortho, pos, col }
    this.trail = null;
    this.allowed = false;
  }

  dispose() {
    if (this.trail) {
      this.group.remove(this.trail);
      this.trailGeo.dispose();
      this.trail.material.dispose();
      this.trail = null;
    }
  }

  active() { return !!this.trail; }
  isAllowed() { return this.allowed; }

  /**
   * (Re)build the trail mesh for the current cube. `show` requests trails on;
   * they are only built when `allowed` (cheap/legible) is also true.
   * @param {boolean} allowed
   * @param {boolean} show
   */
  build(allowed, show) {
    this.dispose();
    this.allowed = allowed;
    if (!allowed || !show) { this.trail = null; return; }

    const L = TRAIL.length, V = this.ctx.vCount;
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
      vertexColors: true, transparent: true, opacity: TRAIL.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(this.trail);
    this._seed(); // back-fill the path so the circles are there on load
  }

  // back-simulate each vertex's recent path so trails are full immediately
  // (no one-second build-up, and screenshots show the Hopf circles)
  _seed() {
    const c = this.ctx;
    const L = TRAIL.length, dtF = TRAIL.seedDt, tmp = new Float32Array(c.vCount * 3);
    for (let k = 0; k < L; k++) {
      const framesAgo = L - 1 - k; // k=0 = oldest sample
      const rotations = c.planes().map((p) => {
        const om = c.isoHas(p.id) ? c.isoOmega() : p.omega;
        const back = c.spinningHas(p.id) ? om * c.speed() * dtF * framesAgo : 0;
        return { i: p.i, j: p.j, angle: c.angleOf(p.id) - back };
      });
      c.cube().project(tmp, {
        rotations, projDistance: c.projDistance(), unfold: c.unfold(), ortho: c.ortho(),
      });
      for (let v = 0; v < c.vCount; v++) {
        const o = (v * L + k) * 3, p = v * 3;
        this.trailHist[o] = tmp[p]; this.trailHist[o + 1] = tmp[p + 1]; this.trailHist[o + 2] = tmp[p + 2];
      }
    }
    this.trailHead = 0;
    this.trailFilled = L;
  }

  /** record the current live vertex positions into the ring buffer */
  push() {
    if (!this.trail) return;
    const L = TRAIL.length, head = this.trailHead, pos = this.ctx.pos, hist = this.trailHist, V = this.ctx.vCount;
    for (let v = 0; v < V; v++) {
      const o = (v * L + head) * 3, p = v * 3;
      hist[o] = pos[p]; hist[o + 1] = pos[p + 1]; hist[o + 2] = pos[p + 2];
    }
    this.trailHead = (head + 1) % L;
    if (this.trailFilled < L) this.trailFilled++;
  }

  /** regenerate the segment geometry from the ring buffer */
  rebuild() {
    if (!this.trail) return;
    const L = TRAIL.length, filled = this.trailFilled, V = this.ctx.vCount;
    if (filled < 2) { this.trailGeo.setDrawRange(0, 0); return; }
    const start = (this.trailHead - filled + L) % L; // oldest sample
    const tp = this.trailPos, tc = this.trailCol, hist = this.trailHist;
    const cr = TRAIL.colour.r, cg = TRAIL.colour.g, cb = TRAIL.colour.b, floor = TRAIL.ageFloor;
    let s = 0;
    for (let v = 0; v < V; v++) {
      // trails read as luminous motion-light (warm-white), distinct from the
      // duotone structural edges and amplified by the bloom
      const base = v * L;
      for (let k = 0; k < filled - 1; k++) {
        const oa = (base + (start + k) % L) * 3, ob = (base + (start + k + 1) % L) * 3;
        // age: old tip stays faintly lit (floor) so the comet tail reads,
        // brightening to full colour at the live vertex
        const fa = floor + (1 - floor) * (k / (filled - 1));
        const fb = floor + (1 - floor) * ((k + 1) / (filled - 1));
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
}
