/* ============================================================
   blackhole/state.js — one store, driven by SCHEMA in config.js.
   Serialises to and from the URL, applies objects and views, and
   eases the geometric parameters so a change of spin, inclination
   or object deforms the image on screen instead of cutting.
   ============================================================ */

import { SCHEMA, DEFAULTS, OBJECTS, VIEWS } from './config.js';

const BY_KEY = Object.fromEntries(SCHEMA.map((s) => [s.key, s]));
const EASED = ['a', 'q', 'incl', 'rcam', 'fov', 'tilt', 'rout'];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Store {
  constructor() {
    this.s = { ...DEFAULTS };
    this.listeners = new Set();
    this.anim = null;                 // { from, to, t0, dur }
    this.shown = {};                  // eased values the renderer uses
    EASED.forEach((k) => { this.shown[k] = this.s[k]; });
    this.reduced = false;
  }

  get(k) { return this.s[k]; }
  all() { return { ...this.s }; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(changed, src) { this.listeners.forEach((fn) => fn(changed, this.s, src)); }

  coerce(k, v) {
    const d = BY_KEY[k];
    if (!d) return v;
    if (d.type === 'num') { const n = Number(v); return Number.isFinite(n) ? clamp(n, d.min, d.max) : d.def; }
    if (d.type === 'bool') return v === true || v === 'true' || v === '1' || v === 1;
    if (d.type === 'enum') return d.options.includes(v) ? v : d.def;
    return v;
  }

  /** Set several keys at once. opts.instant skips the easing. */
  set(patch, { instant = false, src = 'ui', dur = 1400 } = {}) {
    const changed = [];
    for (const [k, v0] of Object.entries(patch)) {
      const v = this.coerce(k, v0);
      if (this.s[k] !== v) { this.s[k] = v; changed.push(k); }
    }
    // a hole needs a^2 + q^2 < 1: charge gives way to spin
    if (this.s.a * this.s.a + this.s.q * this.s.q > 0.996) {
      this.s.q = +Math.sqrt(Math.max(0, 0.996 - this.s.a * this.s.a)).toFixed(3);
      if (!changed.includes('q')) changed.push('q');
    }
    if (!changed.length) return changed;
    const easedChanged = changed.filter((k) => EASED.includes(k));
    if (easedChanged.length) {
      if (instant || this.reduced) {
        easedChanged.forEach((k) => { this.shown[k] = this.s[k]; });
        this.anim = null;
      } else {
        const from = {};
        EASED.forEach((k) => { from[k] = this.shown[k]; });
        this.anim = { from, t0: performance.now(), dur };
      }
    }
    this._emit(changed, src);
    return changed;
  }

  /** Advance the easing; returns true while a transition runs. */
  tick(now) {
    if (!this.anim) { EASED.forEach((k) => { this.shown[k] = this.s[k]; }); return false; }
    const t = clamp((now - this.anim.t0) / this.anim.dur, 0, 1), e = ease(t);
    EASED.forEach((k) => {
      const a = this.anim.from[k], b = this.s[k];
      // distance and field of view ease in log space so a zoom feels even
      this.shown[k] = (k === 'rcam' || k === 'fov') ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e) : a + (b - a) * e;
    });
    if (t >= 1) this.anim = null;
    return true;
  }

  /** The light-path geometry: the eased values the renderer traces now, or (target = true)
   *  the values the state is easing toward. The renderer, the probe and the anchors all
   *  read it, so none of them can drop a parameter the others use (the charge q included). */
  view(target = false) {
    const v = target ? this.s : this.shown;
    return { a: v.a, q: v.q, incl: v.incl, rcam: v.rcam, fov: v.fov, tilt: v.tilt, rout: v.rout, observer: this.s.observer, emit: this.s.emit };
  }

  /** Patch for an object preset (mass, distance, spin, inclination, accretion), for the
   *  current view or for the view named (the tour resolves a stop before applying it). */
  objectPatch(id, view = this.s.view) {
    const o = OBJECTS.find((x) => x.id === id);
    if (!o) return { obj: 'custom' };
    const p = {
      obj: id, a: o.spin, q: 0, mass: Math.log10(o.mass), edd: o.edd > 0 ? Math.log10(o.edd) : -9,
      emit: view === 'telescope' ? 'thin' : (o.view?.emit || 'thick'),
    };
    if (o.distPc) p.dist = Math.log10(o.distPc);
    // the object's measured inclination applies where it means something: the telescope view
    if (view === 'telescope') p.incl = o.incl;
    return p;
  }

  /** Patch for a camera view, for the current object or for the object named. keep is the
   *  inclination that stays where the view names none (a custom hole in the telescope view). */
  viewPatch(id, obj = this.s.obj, keep = this.s.incl) {
    const v = VIEWS[id];
    if (!v) return {};
    const p = { view: id, rcam: v.rcam, fov: v.fov, tilt: v.tilt || 0, observer: id === 'journey' ? 'faller' : 'zamo' };
    const o = OBJECTS.find((x) => x.id === obj);
    // the telescope view shows what the EHT sees: an optically thin emitter, whose bright ring
    // sits on the critical curve; the other views show the thin disk (none for the primordial hole)
    p.emit = id === 'telescope' ? 'thin' : (o?.view?.emit || 'thick');
    p.incl = id === 'telescope' ? (o ? o.incl : keep) : (v.incl ?? keep);
    return p;
  }

  /** The state a link starts from: the schema defaults, then the object preset resolved for
   *  the view, then the view preset for the object (the resolution the tour uses for a stop).
   *  It depends on the two names only, never on the live state. Boot applies it before the
   *  link's own keys and toQuery() writes only what differs from it, so a value that happens
   *  to equal a schema default is not lost, and a bare ?v=telescope opens the telescope camera. */
  preset(obj = DEFAULTS.obj, view = DEFAULTS.view) {
    return { ...DEFAULTS, ...this.objectPatch(obj, view), ...this.viewPatch(view, obj, DEFAULTS.incl) };
  }

  /* ---------------- URL ---------------- */
  toQuery() {
    const q = new URLSearchParams();
    // obj and view name the preset boot starts from; every other key is written when it
    // differs from that preset (not from the schema default, which the preset may override)
    const base = this.preset(this.s.obj, this.s.view);
    for (const d of SCHEMA) {
      const v = this.s[d.key];
      if (v === (d.key === 'obj' || d.key === 'view' ? d.def : base[d.key])) continue;
      q.set(d.url, d.type === 'num' ? String(+Number(v).toFixed(Math.max(d.digits ?? 3, 2) + 1)) : d.type === 'bool' ? (v ? '1' : '0') : v);
    }
    return q.toString();
  }

  fromQuery(search) {
    const q = new URLSearchParams(search);
    const patch = {};
    for (const d of SCHEMA) if (q.has(d.url)) patch[d.key] = q.get(d.url);
    // legacy deep links from the first version of this page: ?type=kerr&view=edge
    if (q.has('type') && !q.has('o')) Object.assign(patch, { a: q.get('type') === 'schwarzschild' ? 0 : 0.9 });
    if (q.get('view') === 'edge') patch.incl = 88;
    return patch;
  }

  /** Open a link (the page's boot): the preset of the object and view it names, then its own
   *  keys on top. Returns the keys the link carried. */
  open(search) {
    const patch = this.fromQuery(search);
    this.set(this.preset(this.coerce('obj', patch.obj ?? DEFAULTS.obj), this.coerce('view', patch.view ?? DEFAULTS.view)), { instant: true, src: 'boot' });
    this.set(patch, { instant: true, src: 'boot' });
    return patch;
  }
}
