/* ============================================================
   dimensional_mania/PlaneSet.js — the rotation-plane model.

   For an n-cube there are C(n,2) coordinate planes you can rotate
   in. This class owns:
     · building those planes for the current dimension (preserving
       accumulated angles across a dimension change),
     · which plane the Plane Dial is bound to (the selection),
     · which planes are auto-spinning (and which are isoclinic),
     · applying a rotation PRESET via the strategy map in constants.

   Dimension handling is data, not branches: a higher dimension
   just yields more planes from the same loop, and a new preset is
   a row in PRESETS — this class exposes the spin()/disjointOf()
   primitives those preset builders call.

   No rendering and no maths beyond plane enumeration live here.
   ============================================================ */

import { AXES } from './n_dimensional_cube.js';
import { PLANE, SEED, ISO, PRESETS, DEFAULT_PRESET } from './constants.js';

export class PlaneSet {
  constructor() {
    this.dim = 0;
    this.planes = [];          // all C(n,2) planes for current dim
    this.selectorPlanes = [];  // subset offered in the plane selector UI
    this.angle = {};           // id -> accumulated radians
    this.spinning = new Set(); // ids currently auto-rotating
    this.isoSet = new Set();   // ids locked to the isoclinic speed
    this.selected = null;      // id bound to the Plane Dial
    this.preset = DEFAULT_PRESET;
  }

  /**
   * Rebuild the plane list for `dim`, preserving accumulated angles.
   * @param {number} dim
   * @param {boolean} initial seed a flattering opening pose + iso spin
   */
  rebuild(dim, initial) {
    this.dim = dim;
    const n = dim;
    const prevAngle = this.angle;
    const planes = [];
    let idx = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const id = `${i}-${j}`;
        const hidden = j >= PLANE.hiddenFrom;          // involves an unseeable axis
        const base = hidden ? PLANE.omegaHidden : PLANE.omegaVisible;
        const spread = PLANE.spreadBase + PLANE.spreadRange * (((idx + 1) * PLANE.golden) % 1);
        planes.push({ i, j, id, hidden, label: `${AXES[i]}–${AXES[j]}`, omega: base * spread });
        idx++;
      }
    }
    this.planes = planes;

    // preserve accumulated angles across dimension changes
    const angle = {};
    planes.forEach((p) => {
      angle[p.id] = prevAngle && prevAngle[p.id] != null ? prevAngle[p.id] : 0;
    });
    this.angle = angle;

    // selector subset: spatial planes + visible x hidden fold planes
    this.selectorPlanes = planes.filter((p) => !p.hidden || p.i < PLANE.hiddenFrom);

    // keep / pick a dial plane
    if (!this.selected || !Object.prototype.hasOwnProperty.call(angle, this.selected)) {
      const firstFold = planes.find((p) => p.hidden && p.i < PLANE.hiddenFrom);
      this.selected = firstFold ? firstFold.id : (planes[0] ? planes[0].id : null);
    }

    if (initial) {
      // seed a flattering pose so the first frame (and ?still shots) read as
      // a real folded tesseract, not an axis-aligned shadow
      if (this.selected && angle[this.selected] === 0) angle[this.selected] = SEED.selectedAngle;
      const disjoint = planes.find((p) =>
        p.id !== this.selected && p.hidden &&
        !(`${p.i}` === `${this.selected.split('-')[0]}`) && angle[p.id] === 0);
      if (disjoint) angle[disjoint.id] = SEED.disjointAngle;
      // open alive: 4D+ starts in an isoclinic spin so the Hopf circles form
      this.applyPreset(this.dim >= 4 ? 'iso' : 'single');
    }
  }

  selectedPlane() { return this.planes.find((p) => p.id === this.selected); }
  selectedAngle() { return this.selected ? this.angle[this.selected] : 0; }
  hasAngle(id) { return Object.prototype.hasOwnProperty.call(this.angle, id); }

  /** a plane sharing no axis with `sel` (its true double-rotation partner) */
  disjointOf(sel) {
    return this.planes.find((p) =>
      p.id !== sel.id && p.i !== sel.i && p.i !== sel.j && p.j !== sel.i && p.j !== sel.j);
  }

  /** mark a plane as auto-spinning; iso=true also locks it to the iso speed */
  spin(id, iso = false) {
    this.spinning.add(id);
    if (iso) this.isoSet.add(id);
  }

  /** angular velocity for a plane id (isoclinic planes share ONE omega) */
  omegaOf(id) {
    if (this.isoSet.has(id)) return ISO.omega;
    const p = this.planes.find((q) => q.id === id);
    return p ? p.omega : 0;
  }

  /**
   * Apply a rotation preset by id, dispatching through the PRESETS strategy
   * map (no switch chain). Unknown ids fall back to the default preset.
   */
  applyPreset(which) {
    this.spinning = new Set();
    this.isoSet = new Set();
    const preset = PRESETS[which] || PRESETS[DEFAULT_PRESET];
    preset.build(this);
    this.preset = PRESETS[which] ? which : DEFAULT_PRESET;
  }

  select(id) {
    if (!this.hasAngle(id)) return false;
    this.selected = id;
    // re-seat the active preset around the new plane
    this.applyPreset(this.preset);
    return true;
  }

  setSelectedAngle(rad) {
    if (!this.selected) return;
    this.angle[this.selected] = rad;
  }
}
