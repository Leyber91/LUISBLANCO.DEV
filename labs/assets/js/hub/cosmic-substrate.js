/* ============================================================
   cosmic-substrate.js — the living background behind the whole
   hub. ONE fixed full-viewport canvas that draws, in depth order:

     - drifting nebula clouds (warm + cold, theme-locked)
     - three parallax starfields (far/mid/near), twinkling
     - occasional shooting stars

   This is the "atmosphere" layer — rich but cheap (a few hundred
   points, soft-light nebula). Scroll moves the layers at
   different rates (parallax). Honours reduced motion (still).
   ============================================================ */

const TAU = Math.PI * 2;
const rand = (() => { let s = 99991; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();

const NEBULAE = [
  { x: 0.18, y: 0.22, r: 0.55, col: [43, 106, 135], a: 0.16, drift: 0.012 },  // cold
  { x: 0.82, y: 0.30, r: 0.50, col: [151, 104, 31], a: 0.13, drift: -0.009 }, // warm
  { x: 0.55, y: 0.85, r: 0.65, col: [60, 40, 90],  a: 0.12, drift: 0.007 },   // violet deep
  { x: 0.30, y: 0.65, r: 0.40, col: [40, 70, 90],  a: 0.10, drift: -0.014 },
];

export class CosmicSubstrate {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.__L212_STILL__;
    this.t0 = performance.now();
    this.scrollY = 0;
    this.shooters = [];
    this.shootTimer = 2 + rand() * 3;
    this.running = false;

    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    this._scroll = () => { this.scrollY = window.scrollY || 0; };
    window.addEventListener('resize', this._resize, { passive: true });
    window.addEventListener('scroll', this._scroll, { passive: true });
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
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('scroll', this._scroll);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    this._seed();
    if (this.reduced || !this.running) this._render(0);
  }

  _seed() {
    // three layers: far (small/dim/slow) -> near (big/bright/fast parallax)
    const layers = [
      { n: this.w * this.h / 9000, size: [0.4, 1.0], alpha: [0.12, 0.4], par: 0.02 },
      { n: this.w * this.h / 16000, size: [0.7, 1.6], alpha: [0.25, 0.6], par: 0.06 },
      { n: this.w * this.h / 34000, size: [1.0, 2.4], alpha: [0.4, 0.9],  par: 0.12 },
    ];
    this.layers = layers.map((L) => {
      const stars = [];
      const count = Math.round(L.n);
      for (let i = 0; i < count; i++) {
        const warm = rand() > 0.86;
        stars.push({
          x: rand() * this.w,
          y: rand() * this.h * 1.3,        // taller than viewport for parallax headroom
          s: L.size[0] + rand() * (L.size[1] - L.size[0]),
          a: L.alpha[0] + rand() * (L.alpha[1] - L.alpha[0]),
          tw: rand() * TAU,
          warm,
        });
      }
      return { stars, par: L.par };
    });
  }

  _frame(now) {
    if (!this.running) return;
    this.last = now;
    this._render((now - this.t0) / 1000);
    requestAnimationFrame(this._frame);
  }

  _render(t) {
    const ctx = this.ctx, { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this._drawNebula(ctx, t);

    // parallax starfields
    for (const L of this.layers) {
      const off = (this.scrollY * L.par) % (h * 1.3);
      for (const st of L.stars) {
        let y = st.y - off;
        if (y < -2) y += h * 1.3;
        const tw = this.reduced ? 1 : 0.65 + 0.35 * Math.sin(t * 1.6 + st.tw);
        ctx.globalAlpha = st.a * tw;
        ctx.fillStyle = st.warm ? '#f6c271' : '#cdd6e4';
        ctx.beginPath(); ctx.arc(st.x, y, st.s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    this._drawShooters(ctx, t);
  }

  _drawNebula(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const n of NEBULAE) {
      const dx = this.reduced ? 0 : Math.sin(t * n.drift * 6) * this.w * 0.03;
      const dy = this.reduced ? 0 : Math.cos(t * n.drift * 5) * this.h * 0.03;
      const cx = n.x * this.w + dx;
      const cy = n.y * this.h + dy - this.scrollY * 0.03;
      const r = n.r * Math.max(this.w, this.h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${n.col[0]},${n.col[1]},${n.col[2]},${n.a})`);
      g.addColorStop(0.5, `rgba(${n.col[0]},${n.col[1]},${n.col[2]},${n.a * 0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _drawShooters(ctx, t) {
    if (this.reduced) return;
    const dt = 1 / 60;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 3.5 + rand() * 5;
      const edge = rand();
      this.shooters.push({
        x: rand() * this.w,
        y: -10 + rand() * this.h * 0.4,
        vx: (edge > 0.5 ? -1 : 1) * (260 + rand() * 220),
        vy: 120 + rand() * 160,
        life: 0, max: 0.7 + rand() * 0.5,
        len: 90 + rand() * 80,
      });
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.shooters) {
      s.life += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const k = s.life / s.max;
      const a = Math.sin(Math.min(1, k) * Math.PI);     // fade in/out
      const ang = Math.atan2(s.vy, s.vx);
      const tx = s.x - Math.cos(ang) * s.len, ty = s.y - Math.sin(ang) * s.len;
      const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
      grad.addColorStop(0, `rgba(246,194,113,${0.9 * a})`);
      grad.addColorStop(1, 'rgba(246,194,113,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    this.shooters = this.shooters.filter((s) => s.life < s.max && s.x > -120 && s.x < this.w + 120 && s.y < this.h + 60);
    ctx.restore();
  }
}
