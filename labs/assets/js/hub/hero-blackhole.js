/* ============================================================
   hero-blackhole.js — the hub hero.

   A Schwarzschild black hole rendered in Canvas2D (no WebGL, so
   it paints reliably everywhere and degrades to a clean still):

     - a lensing-warped starfield  (background light bent outward,
       an Einstein ring where it piles up)
     - an inclined accretion disk, doppler-asymmetric (approaching
       limb bright/blue-white, receding limb dim/red)
     - the disk's far side lensed up and over the shadow (the
       Interstellar "halo")
     - a true-black shadow + a thin photon ring

   Honours prefers-reduced-motion: renders one composed still.
   DPR + resize aware. Pure module, small API: start/stop/destroy.
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// theme (kept in sync with tokens.css; canvas can't read CSS vars cheaply)
const COL = {
  star:      [197, 204, 216],
  warm:      [242, 169, 59],   // accretion
  warmSoft:  [246, 194, 113],
  hot:       [186, 220, 255],  // doppler-boosted inner edge
  red:       [150, 70, 40],    // receding limb
  ring:      [255, 238, 200],  // photon ring
};
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
    this.cx = w * 0.5;
    this.cy = h * 0.46;
    // shadow radius scales with the smaller dimension
    this.rs = Math.min(w, h) * 0.12 * this.opts.scale;
    this._seedStars();
    if (this.reduced || !this.running) this._render(0);
  }

  _seedStars() {
    const n = Math.round((this.w * this.h) / 5200);
    this.stars = [];
    // deterministic PRNG so resizes don't reshuffle the sky
    let s = 1234567;
    const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const mag = rnd();
      this.stars.push({
        x: rnd() * this.w,
        y: rnd() * this.h,
        r: 0.4 + mag * mag * 1.6,
        a: 0.18 + mag * 0.6,
        tw: rnd() * TAU,         // twinkle phase
        warm: rnd() > 0.82,      // a few warm stars
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
    const { cx, cy, rs } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawStars(ctx, t);
    this._drawEinsteinRing(ctx, t);
    this._drawDisk(ctx, t, /*back*/ true);   // far side, lensed over the top
    this._drawShadow(ctx);                    // black disc + photon ring
    this._drawDisk(ctx, t, /*back*/ false);   // near side, in front
    this._drawGlow(ctx, t);
  }

  /* background sky, gravitationally lensed away from the shadow */
  _drawStars(ctx, t) {
    const { cx, cy, rs } = this;
    const lensR = rs * 7;             // radius of noticeable bending
    for (const st of this.stars) {
      let dx = st.x - cx, dy = st.y - cy;
      const r = Math.hypot(dx, dy) || 0.0001;
      if (r < rs * 1.02) continue;    // swallowed by the shadow
      // deflection: push outward, strongest near the hole (~ rs^2 / r)
      const deflect = (rs * rs * 1.55) / r;
      const k = (r + deflect) / r;
      const x = cx + dx * k;
      const y = cy + dy * k;
      // dim stars as they approach the rim (light stretched/redshifted)
      const near = clamp((r - rs) / (lensR - rs), 0, 1);
      const tw = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 2 + st.tw);
      const a = st.a * lerp(0.25, 1, near) * tw;
      ctx.fillStyle = st.warm ? rgba(COL.warmSoft, a) : rgba(COL.star, a);
      ctx.beginPath();
      ctx.arc(x, y, st.r, 0, TAU);
      ctx.fill();
    }
  }

  /* faint bright ring where lensed background light concentrates */
  _drawEinsteinRing(ctx, t) {
    const { cx, cy, rs } = this;
    const r = rs * 1.92;
    const pulse = this.reduced ? 0 : Math.sin(t * 0.7) * 0.04;
    const g = ctx.createRadialGradient(cx, cy, r * 0.86, cx, cy, r * 1.16);
    g.addColorStop(0, rgba(COL.hot, 0));
    g.addColorStop(0.5, rgba(COL.ring, 0.10 + pulse));
    g.addColorStop(1, rgba(COL.hot, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.16, 0, TAU);
    ctx.fill();
  }

  /* the accretion disk — drawn as many thin inclined rings.
     back=true draws the half that is lensed up over the shadow
     (y above centre); back=false the near half in front. */
  _drawDisk(ctx, t, back) {
    const { cx, cy, rs } = this;
    const inc = 0.30;                  // inclination (vertical squash)
    const inner = rs * 1.28;
    const outer = rs * 4.6;
    const rings = 46;
    const spin = this.reduced ? 0 : t * 0.45;

    ctx.save();
    ctx.translate(cx, cy);
    // clip to the half we're drawing so front/back layer correctly
    ctx.beginPath();
    if (back) ctx.rect(-this.w, -this.h, this.w * 2, this.h);          // top half
    else      ctx.rect(-this.w, 0, this.w * 2, this.h);               // bottom half
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < rings; i++) {
      const f = i / (rings - 1);
      const rr = lerp(inner, outer, f);
      const ry = rr * inc;
      // radial falloff: bright at the inner edge, fading out
      const fall = Math.pow(1 - f, 1.7);
      // the far side is lensed up: lift the top arc a little extra
      const lift = back ? rs * 0.42 * (1 - f) : 0;

      // sample the ring as an arc so we can doppler-shade per angle
      const segs = 60;
      const a0 = back ? Math.PI : 0;
      for (let s = 0; s < segs; s++) {
        const ang = a0 + (s / segs) * Math.PI;
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * ry - lift;
        // doppler: left limb (cos<0) approaches -> bright/blue, right recedes -> dim/red
        const approach = -Math.cos(ang + spin);
        const beam = clamp(0.45 + approach * 0.9, 0.05, 1.6);
        const a = fall * 0.5 * beam;
        if (a < 0.012) continue;
        // colour: hot blue-white near inner approaching edge -> warm -> red
        let col;
        if (approach > 0.35 && f < 0.45) col = COL.hot;
        else if (approach < -0.2) col = COL.red;
        else col = f < 0.5 ? COL.warmSoft : COL.warm;
        const size = lerp(2.6, 1.1, f) * (1 + beam * 0.3);
        ctx.fillStyle = rgba(col, clamp(a, 0, 0.9));
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* the event-horizon shadow + the thin photon ring around it */
  _drawShadow(ctx) {
    const { cx, cy, rs } = this;
    // soft gravitational-darkening halo just outside the shadow
    const halo = ctx.createRadialGradient(cx, cy, rs * 0.9, cx, cy, rs * 1.5);
    halo.addColorStop(0, 'rgba(0,0,0,1)');
    halo.addColorStop(0.7, 'rgba(0,0,0,0.55)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, rs * 1.5, 0, TAU); ctx.fill();

    // pure-black shadow
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, rs, 0, TAU); ctx.fill();

    // photon ring: thin, hot, slightly brighter on the approaching side
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(cx - rs, cy, cx + rs, cy);
    grad.addColorStop(0, rgba(COL.hot, 0.95));     // approaching (left)
    grad.addColorStop(0.5, rgba(COL.ring, 0.6));
    grad.addColorStop(1, rgba(COL.warm, 0.4));     // receding (right)
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1.4, rs * 0.045);
    ctx.beginPath(); ctx.arc(cx, cy, rs * 1.045, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* outer atmospheric glow tying it together */
  _drawGlow(ctx, t) {
    const { cx, cy, rs } = this;
    const pulse = this.reduced ? 0 : Math.sin(t * 0.5) * 0.02;
    const g = ctx.createRadialGradient(cx, cy, rs * 1.4, cx, cy, rs * 6);
    g.addColorStop(0, rgba(COL.warm, 0.05 + pulse));
    g.addColorStop(1, rgba(COL.warm, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
