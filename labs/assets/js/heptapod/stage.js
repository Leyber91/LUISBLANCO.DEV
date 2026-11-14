/* ============================================================
   heptapod/stage.js — a canvas that holds one living semagram.

   set(spec, how): 'grow' draws it from nothing (all strokes at once,
   or one pen when order is 'tq'); 'morph' re-solves from the shape
   on screen to the new one, every stroke moving together; 'none'
   swaps it. At rest the ink is cached and only the reader's head
   and the labels redraw. Reduced motion gets the finished frame.
   ============================================================ */

import { MOTION } from './config.js';
import { specStrokes, tweenSpec } from './geometry.js';
import { InkLayer, fitCanvas, fitXf, viewBounds, drawGuides, drawHead, prefersReduced, palette } from './render.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);

/* Performance tiers. While strokes grow or morph, render times are sampled; when the median
   of 60 frames exceeds 20 ms the page drops the three-pass feathered glow for a single pass,
   and says so. ?tier=lite forces the cheaper tier. */
export const Tier = {
  name: /[?&]tier=lite\b/.test(globalThis.location?.search || '') ? 'lite' : 'full',
  glow: /[?&]tier=lite\b/.test(globalThis.location?.search || '') ? 0.35 : 1,
  times: [],
  listeners: new Set(),
  sample(ms) {
    if (this.name === 'lite') return;
    this.times.push(ms);
    if (this.times.length < 60) return;
    const t = this.times.slice().sort((a, b) => a - b)[30];
    this.times = [];
    if (t > 20) { this.name = 'lite'; this.glow = 0.35; this.listeners.forEach((f) => f(this.name, t)); }
  },
  onChange(f) { this.listeners.add(f); f(this.name, 0); },
};

export class SemaStage {
  constructor(canvas, { labels = true, order = 'ts', head = true, growMs = MOTION.grow, onSettle = null, bounds = null } = {}) {
    this.cv = canvas;
    this.labels = labels;
    this.order = order;
    this.head = head && !prefersReduced();
    this.growMs = growMs;
    this.onSettle = onSettle;
    this.fixedBounds = bounds;
    this.layer = new InkLayer();
    this.cache = document.createElement('canvas');
    this.spec = null; this.from = null; this.shown = null;
    this.anim = null; // { kind, t0, ms }
    this.active = null;
    this.headDeg = 0;
    this.headLeft = 0;   // degrees of reading left: one lap after each settle or touch, then the loop stops
    this.visible = true;
    this.dirty = true;
    this._raf = 0;
    this._last = 0;
    const ro = new ResizeObserver(() => { this.dirty = true; this.kick(); });
    ro.observe(canvas);
    const io = new IntersectionObserver((es) => { this.visible = es.some((e) => e.isIntersecting); if (this.visible) this.kick(); });
    io.observe(canvas);
  }

  set(spec, how = 'morph') {
    const reduce = prefersReduced();
    this.from = this.shown || null;
    this.spec = spec;
    if (reduce) how = 'none';
    else if (how === 'morph' && !this.from) how = 'grow';
    this.anim = how === 'none' ? null : { kind: how, t0: performance.now(), ms: how === 'grow' ? this.growMs : MOTION.morph };
    if (!this.anim) { this.shown = spec; this.dirty = true; this.onSettle?.(spec); this.headLeft = 360; }
    this.kick();
  }

  /** Wake the reader's head for one more lap. */
  wake() { if (this.head && this.headLeft <= 0) { this.headLeft = 360; this.kick(); } }

  /** The role under a point in CSS pixels, or null. */
  pick(clientX, clientY) {
    if (!this.xf || !this.ink) return null;
    const r = this.cv.getBoundingClientRect();
    const k = this.cv.width / r.width;
    const X = (clientX - r.left) * k, Y = (clientY - r.top) * k;
    const x = (X - this.xf.ox) / this.xf.s, y = (Y - this.xf.oy) / this.xf.s;
    let best = null, bd = 0.09 * 0.09;
    for (const st of this.ink.strokes) {
      if ((st.alpha ?? 1) < 0.5) continue;
      for (const q of st.pts) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = st.role; } }
    }
    for (const d of this.ink.dots) { const dd = (d.x - x) ** 2 + (d.y - y) ** 2; if (dd < bd) { bd = dd; best = d.role; } }
    return best && !/ring$/.test(best) ? best : null;
  }

  replay() { if (this.spec) { this.shown = null; this.set(this.spec, prefersReduced() ? 'none' : 'grow'); } }

  setActive(role) { if (role !== this.active) { this.active = role; this.dirty = true; this.kick(); } }

  kick() { if (!this._raf) this._raf = requestAnimationFrame((t) => this.frame(t)); }

  goldOf() {
    const a = this.active;
    if (!a) return () => false;
    return (role) => {
      if (!role) return false;
      if (role === a) return true;
      // a clause-holding patient lights its nested ring too
      if (a.endsWith('patient') && role.startsWith(a.replace(/patient$/, '') + 'sub.')) return true;
      return false;
    };
  }

  frame(now) {
    this._raf = 0;
    if (!this.spec) return;
    const { w, h } = fitCanvas(this.cv);
    const ctx = this.cv.getContext('2d');
    let p = 1, spec = this.spec, animating = false;
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.t0) / this.anim.ms);
      animating = t < 1;
      if (this.anim.kind === 'grow') p = this.order === 'tq' ? t : ease(t);
      else spec = tweenSpec(this.from, this.spec, ease(t));
      if (!animating) { this.anim = null; this.shown = this.spec; this.dirty = true; this.onSettle?.(this.spec); this.headLeft = 360; }
      else this.shown = spec;
    }
    const b = this.fixedBounds || viewBounds(spec, this.labels);
    const xf = fitXf(b, w, h, 0.02);
    this.xf = xf;
    if (animating || this.dirty) {
      const ink = specStrokes(spec);
      this.ink = ink;
      const c = this.cache;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      c.getContext('2d').clearRect(0, 0, w, h);
      const tr0 = performance.now();
      this.layer.render(c, ink, xf, { p, order: this.anim?.kind === 'grow' ? this.order : 'ts', gold: this.goldOf(), glow: Tier.glow });
      if (animating) Tier.sample(performance.now() - tr0);
      this.dirty = false;
    }
    ctx.clearRect(0, 0, w, h);
    const small = this.cv.getBoundingClientRect().width < 520;
    // in a composite, labels that would sit on the bridge step above or below it
    const nudge = spec.type === 'rel' ? (x, y) => (Math.abs(x) < 0.45 && Math.abs(y) < 0.5 ? [x, y < 0.05 && x < 0 ? -0.55 : 0.55] : [x, y]) : null;
    const guidesFor = (s, prefix) => drawGuides(ctx, s, xf, { labels: this.labels, short: small || s.type !== 'prop' || prefix, active: this.active || this.headRole, prefix, nudge, alpha: this.anim?.kind === 'grow' ? Math.min(1, p * 1.6) : 1 });
    if (spec.type === 'rel') {
      guidesFor(spec.a, 'a.'); guidesFor(spec.b, 'b.');
      // coreference: a participant written once, its second mention a reference linked back to it
      const P = palette();
      for (const [rb, ra] of Object.entries(spec.b.refs || {})) {
        const sa = spec.a.lay.items[ra], sb = spec.b.lay.items[rb];
        if (!sa || !sb) continue;
        const pa = [spec.a.frame.cx + Math.sin(sa.center * Math.PI / 180) * 1.12, -Math.cos(sa.center * Math.PI / 180) * 1.12];
        const pb = [spec.b.frame.cx + Math.sin(sb.center * Math.PI / 180) * 1.12, -Math.cos(sb.center * Math.PI / 180) * 1.12];
        const lift = (pa[1] + pb[1]) / 2 > 0 ? 1.75 : -1.75;
        ctx.save();
        ctx.strokeStyle = (this.active || '').endsWith(rb) || (this.active || '').endsWith(ra) ? P.goldSoft : P.horizonDim;
        ctx.lineWidth = Math.max(1, xf.s * 0.006);
        ctx.setLineDash([xf.s * 0.02, xf.s * 0.025]);
        ctx.beginPath();
        ctx.moveTo(xf.ox + xf.s * pb[0], xf.oy + xf.s * pb[1]);
        ctx.quadraticCurveTo(xf.ox + xf.s * (pa[0] + pb[0]) / 2, xf.oy + xf.s * lift, xf.ox + xf.s * pa[0], xf.oy + xf.s * pa[1]);
        ctx.stroke();
        ctx.restore();
      }
    }
    else guidesFor(spec, '');
    ctx.drawImage(this.cache, 0, 0);
    // the reader's head: one lap round the ring after each settle or touch, then it parks at the crown
    const reading = this.head && !animating && spec.type === 'prop' && this.visible && this.headLeft > 0;
    if (reading) {
      const dt = this._last ? Math.min(100, now - this._last) : 16;
      const step = Math.min(this.headLeft, dt * 0.2); // one sweep in 1.8 s
      this.headDeg = (this.headDeg + step) % 360;
      this.headLeft -= step;
      drawHead(ctx, spec, xf, this.headDeg, 0.9);
      const lay = spec.lay;
      const k = lay.keys.find((key) => { const s = lay.items[key]; const d = ((this.headDeg - s.start) % 360 + 360) % 360; return d < s.width; });
      this.headRole = this.active ? null : k || null;
    } else this.headRole = null;
    this._last = now;
    if (animating || reading) {
      // the head runs at about 30 frames a second; growth and morphs at full rate
      if (animating) this.kick();
      else setTimeout(() => this.kick(), 33);
    }
  }
}

export { palette };
