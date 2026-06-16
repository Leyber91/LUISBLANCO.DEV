/* ============================================================
   cosmic-substrate.js — the living background behind the whole
   hub: drifting nebula, three parallax starfields, occasional
   shooting stars. Rich but cheap. Honours reduced motion / ?still.

   Palette + tuning come from hub/constants.js (PALETTE,
   SUBSTRATE_CONFIG).
   ============================================================ */

import { PALETTE, SUBSTRATE_CONFIG as S } from './constants.js';

const TAU = Math.PI * 2;
const rand = (() => { let s = 99991; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();

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
    this.layers = S.layers.map((L) => {
      const count = Math.round((this.w * this.h) / L.divisor);
      const stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: rand() * this.w,
          y: rand() * this.h * 1.3,                 // taller than viewport for parallax headroom
          s: L.size[0] + rand() * (L.size[1] - L.size[0]),
          a: L.alpha[0] + rand() * (L.alpha[1] - L.alpha[0]),
          tw: rand() * TAU,
          warm: rand() > S.warmStarChance,
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

    for (const L of this.layers) {
      const off = (this.scrollY * L.par) % (h * 1.3);
      for (const st of L.stars) {
        let y = st.y - off;
        if (y < -2) y += h * 1.3;
        const tw = this.reduced ? 1 : 0.65 + 0.35 * Math.sin(t * 1.6 + st.tw);
        ctx.globalAlpha = st.a * tw;
        ctx.fillStyle = st.warm ? PALETTE.warmHex : PALETTE.starHex;
        ctx.beginPath(); ctx.arc(st.x, y, st.s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    this._drawShooters(ctx, t);
  }

  _drawNebula(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const n of S.nebulae) {
      const dx = this.reduced ? 0 : Math.sin(t * n.drift * 6) * this.w * 0.03;
      const dy = this.reduced ? 0 : Math.cos(t * n.drift * 5) * this.h * 0.03;
      const cx = n.x * this.w + dx;
      const cy = n.y * this.h + dy - this.scrollY * S.nebulaParallax;
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
    const sh = S.shooter;
    const dt = 1 / 60;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = sh.minGap + rand() * sh.gapJitter;
      const edge = rand();
      this.shooters.push({
        x: rand() * this.w,
        y: -10 + rand() * this.h * 0.4,
        vx: (edge > 0.5 ? -1 : 1) * (sh.speed[0] + rand() * sh.speed[1]),
        vy: sh.vy[0] + rand() * sh.vy[1],
        life: 0, max: sh.life[0] + rand() * sh.life[1],
        len: sh.len[0] + rand() * sh.len[1],
      });
    }
    ctx.save();
    ctx.lineCap = 'round';
    const [cr, cg, cb] = PALETTE.warmSoft;
    for (const s of this.shooters) {
      s.life += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const k = s.life / s.max;
      const a = Math.sin(Math.min(1, k) * Math.PI);
      const ang = Math.atan2(s.vy, s.vx);
      const tx = s.x - Math.cos(ang) * s.len, ty = s.y - Math.sin(ang) * s.len;
      const grad = ctx.createLinearGradient(s.x, s.y, tx, ty);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.9 * a})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    this.shooters = this.shooters.filter((s) => s.life < s.max && s.x > -120 && s.x < this.w + 120 && s.y < this.h + 60);
    ctx.restore();
  }
}
