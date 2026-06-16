/* ============================================================
   hero-blackhole.js — the hub hero.

   A Schwarzschild black hole in Canvas2D (no WebGL, so it paints
   reliably everywhere and degrades to a clean still): a lensing-
   warped starfield, an inclined doppler-asymmetric accretion disk,
   the far side lensed over the shadow (the Interstellar "halo"), a
   true-black shadow + a thin photon ring.

   All palette + tuning now come from hub/constants.js (PALETTE,
   HERO_CONFIG) so the hero is art-directed in one place.
   Honours reduced motion / ?still. DPR + resize aware.
   ============================================================ */

import { PALETTE, HERO_CONFIG as H } from './constants.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export class BlackHoleHero {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.__L212_STILL__;
    this.opts = { scale: 1, ...opts };
    this.t0 = performance.now();
    this.phase = 0;
    this.running = false;

    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    window.addEventListener('resize', this._resize, { passive: true });
    this._resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.reduced) { this._render(0); return; }
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; }
  destroy() { this.stop(); window.removeEventListener('resize', this._resize); }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this.cx = w * H.centerX;
    this.cy = h * H.centerY;
    this.rs = Math.min(w, h) * H.shadowFrac * this.opts.scale;
    this._seedStars();
    if (this.reduced || !this.running) this._render(0);
  }

  _seedStars() {
    const n = Math.round((this.w * this.h) / H.starDivisor);
    this.stars = [];
    let s = 1234567;                              // deterministic so resizes don't reshuffle
    const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const mag = rnd();
      this.stars.push({
        x: rnd() * this.w, y: rnd() * this.h,
        r: 0.4 + mag * mag * 1.6,
        a: 0.18 + mag * 0.6,
        tw: rnd() * TAU,
        warm: rnd() > 0.82,
      });
    }
  }

  _frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.phase += dt;
    this._render((now - this.t0) / 1000);
    requestAnimationFrame(this._frame);
  }

  _render(t) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this._drawStars(ctx, t);
    this._drawEinsteinRing(ctx, t);
    this._drawDisk(ctx, t, true);    // far side, lensed over the top
    this._drawShadow(ctx);           // black disc + photon ring
    this._drawDisk(ctx, t, false);   // near side, in front
    this._drawGlow(ctx, t);
  }

  _drawStars(ctx, t) {
    const { cx, cy, rs } = this;
    const lensR = rs * H.lensReach;
    for (const st of this.stars) {
      const dx = st.x - cx, dy = st.y - cy;
      const r = Math.hypot(dx, dy) || 0.0001;
      if (r < rs * 1.02) continue;                 // swallowed by the shadow
      const deflect = (rs * rs * H.lensStrength) / r;
      const k = (r + deflect) / r;
      const x = cx + dx * k, y = cy + dy * k;
      const near = clamp((r - rs) / (lensR - rs), 0, 1);
      const tw = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 2 + st.tw);
      const a = st.a * lerp(0.25, 1, near) * tw;
      ctx.fillStyle = st.warm ? rgba(PALETTE.warmSoft, a) : rgba(PALETTE.star, a);
      ctx.beginPath(); ctx.arc(x, y, st.r, 0, TAU); ctx.fill();
    }
  }

  _drawEinsteinRing(ctx, t) {
    const { cx, cy, rs } = this;
    const r = rs * H.einsteinRing;
    const pulse = this.reduced ? 0 : Math.sin(t * 0.7) * 0.04;
    const g = ctx.createRadialGradient(cx, cy, r * 0.86, cx, cy, r * 1.16);
    g.addColorStop(0, rgba(PALETTE.hot, 0));
    g.addColorStop(0.5, rgba(PALETTE.ring, 0.10 + pulse));
    g.addColorStop(1, rgba(PALETTE.hot, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.16, 0, TAU); ctx.fill();
  }

  _drawDisk(ctx, t, back) {
    const { cx, cy, rs } = this;
    const d = H.disk;
    const inner = rs * d.innerRs, outer = rs * d.outerRs;
    const spin = this.reduced ? 0 : t * d.spin;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    if (back) ctx.rect(-this.w, -this.h, this.w * 2, this.h);
    else      ctx.rect(-this.w, 0, this.w * 2, this.h);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < d.rings; i++) {
      const f = i / (d.rings - 1);
      const rr = lerp(inner, outer, f);
      const ry = rr * d.inc;
      const fall = Math.pow(1 - f, 1.7);
      const lift = back ? rs * d.liftRs * (1 - f) : 0;
      const a0 = back ? Math.PI : 0;
      for (let sIdx = 0; sIdx < d.segs; sIdx++) {
        const ang = a0 + (sIdx / d.segs) * Math.PI;
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * ry - lift;
        const approach = -Math.cos(ang + spin);
        const beam = clamp(0.45 + approach * 0.9, 0.05, 1.6);
        const a = fall * 0.5 * beam;
        if (a < 0.012) continue;
        let col;
        if (approach > 0.35 && f < 0.45) col = PALETTE.hot;
        else if (approach < -0.2) col = PALETTE.red;
        else col = f < 0.5 ? PALETTE.warmSoft : PALETTE.warm;
        const size = lerp(2.6, 1.1, f) * (1 + beam * 0.3);
        ctx.fillStyle = rgba(col, clamp(a, 0, 0.9));
        ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawShadow(ctx) {
    const { cx, cy, rs } = this;
    const halo = ctx.createRadialGradient(cx, cy, rs * 0.9, cx, cy, rs * 1.5);
    halo.addColorStop(0, 'rgba(0,0,0,1)');
    halo.addColorStop(0.7, 'rgba(0,0,0,0.55)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, rs * 1.5, 0, TAU); ctx.fill();

    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, rs, 0, TAU); ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(cx - rs, cy, cx + rs, cy);
    grad.addColorStop(0, rgba(PALETTE.hot, 0.95));
    grad.addColorStop(0.5, rgba(PALETTE.ring, 0.6));
    grad.addColorStop(1, rgba(PALETTE.warm, 0.4));
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1.4, rs * H.photonRing.widthFrac);
    ctx.beginPath(); ctx.arc(cx, cy, rs * H.photonRing.radiusRs, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  _drawGlow(ctx, t) {
    const { cx, cy, rs } = this;
    const pulse = this.reduced ? 0 : Math.sin(t * 0.5) * 0.02;
    const g = ctx.createRadialGradient(cx, cy, rs * 1.4, cx, cy, rs * 6);
    g.addColorStop(0, rgba(PALETTE.warm, 0.05 + pulse));
    g.addColorStop(1, rgba(PALETTE.warm, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
