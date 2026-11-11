/* ============================================================
   timeline/view-canvas.js — the branch line's view: geometry,
   flights, gestures and the frame loop. Drawing passes live in
   view-draw.js. Holds no application state beyond what it needs
   to draw; emits intents to main.js through callbacks.

   Geometry is illustrative: the three expression worlds are three
   separate strands (the codex: separate branes, not one past that
   splits) that run in step and pull apart from each discovery by
   the engine's divergence curve.
   ============================================================ */

import { NOW, WORLDS, LAYERS, MOTION } from './config.js';
import {
  VIS, byId, divergence, worldName, T_MIN, T_MAX, SPAN_MIN, SPAN_MAX,
} from './engine.js';
import { fmtCE, fmtDay } from './chronology.js';
import * as D from './view-draw.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const RHO = Math.SQRT2;                       // van Wijk & Nuij's recommended rho

function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function ms(name, fallbackMs) { const v = token(name); const n = parseFloat(v); return Number.isFinite(n) ? (v.endsWith('ms') ? n : n * 1000) : fallbackMs; }

export class TimelineView {
  constructor(canvas, wrap, cb = {}) {
    this.cv = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    this.cb = cb;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still/.test(location.search);
    const T = (n) => token(n);
    this.C = {
      void: T('--void'), text: T('--text'), dim: T('--text-dim'), faint: T('--text-faint'), bright: T('--text-bright'),
      hz: T('--horizon'), hzDim: T('--horizon-dim'), gold: T('--accretion'), goldSoft: T('--accretion-soft'),
      line: T('--line'), lineB: T('--line-bright'),
    };
    this.motion = { slow: ms(MOTION.slow, 560), mid: ms(MOTION.mid, 320) };
    this.font = T('--font-mono') || 'monospace';
    this.t0 = -9200; this.t1 = 2300;
    this.anim = null;
    this.cursor = -3537; this.cursorTo = -3537;
    this.pin = null;
    this.sel = null; this.hi = new Set(); this.lens = null; this.hover = null; this.follow = null;
    this.align = false;
    this.hits = []; this.boxes = [];
    this.time = 0; this.last = 0;
    this.ign = this.reduced ? 1 : 0; this.ignStart = 0;
    this.tier = 'full'; this.drawMs = []; this.frames = 0;
    this.beads = WORLDS.map((w, i) => Array.from({ length: 6 }, (_, k) => ({ u: (k + i * 0.37) / 6 })));
    this.threadPulse = 0;
    this.dirty = true;
    this._labels();
    this._bind();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(wrap);
    if (/[?&]stress=/.test(location.search)) window.__timelineView = this;   // test mode: let a harness time draw()
  }

  /* ---------------- geometry ---------------- */

  resize() {
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier === 'full' ? 2 : 1);
    this.W = Math.max(280, r.width); this.H = Math.max(300, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    const H = this.H;
    this.narrow = this.W < 640;
    this.gutter = this.narrow ? 0 : 150;
    this.padL = this.narrow ? 14 : 28 + this.gutter;
    this.padR = this.narrow ? 14 : 28;
    this.y = {
      mini: 22, cursorTop: 40,
      kharen: H * 0.245, earth: H * 0.385, terra: H * 0.525,
      sub: H * 0.615, vortex: H * 0.69, haven: H * 0.795, core: H * 0.885, axis: H - 24,
    };
    this.bundle = this.narrow ? 4 : 5;            // strand spacing while in step
    this._placeLabels();
    this.dirty = true;
  }

  get span() { return this.t1 - this.t0; }
  get plotW() { return this.W - this.padL - this.padR; }
  x(t) { return this.padL + ((t - this.t0) / (this.t1 - this.t0)) * this.plotW; }
  tAt(x) { return this.t0 + ((x - this.padL) / this.plotW) * (this.t1 - this.t0); }

  /** A world's own time on the axis: in align mode the axis is years since its discovery. */
  wOff(worldId) { const w = WORLDS.find((x) => x.id === worldId); return this.align && w ? w.found : 0; }
  tx(worldId, t) { return this.x(t - this.wOff(worldId)); }

  /** The y of a world's strand at its own time t: in step near the Earth line, then out to its lane. */
  laneY(worldId, t) {
    const yE = this.y.earth;
    const w = WORLDS.find((x) => x.id === worldId);
    if (!w) return this.y[worldId] ?? yE;
    if (worldId === 'earth') return yE;
    const home = yE + w.offset * this.bundle;
    return home + (this.y[worldId] - home) * divergence(worldId, t);
  }

  /* ---------------- DOM lane labels ---------------- */

  _labels() {
    const host = document.createElement('div');
    host.className = 'tl-lanes';
    const rows = [
      ...WORLDS.map((w) => ({ key: w.id, name: w.name, role: w.role + (w.id === 'earth' ? ', unaltered' : ''), sel: w.id === 'earth' ? 'ea-access' : w.id === 'kharen' ? 'kr-disc' : 'te-disc' })),
      ...LAYERS.filter((l) => l.id !== 'expression').map((l) => ({ key: l.id, name: l.name, role: l.role, sel: l.id })),
    ];
    this.laneEls = {};
    for (const r of rows) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tl-lane'; b.dataset.key = r.key;
      b.innerHTML = `<b>${r.name}</b><span>${r.role}</span>`;
      b.setAttribute('aria-label', `${r.name}, ${r.role}. Show details.`);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onInteract?.(); this.cb.onSelect?.(r.sel, { from: 'lane' }); });
      host.appendChild(b);
      this.laneEls[r.key] = b;
    }
    const sub = document.createElement('span');
    sub.className = 'tl-lane-sub'; sub.textContent = 'what they hang on';
    host.appendChild(sub);
    this.subEl = sub;
    this.wrap.appendChild(host);
    this.tip = document.createElement('div');
    this.tip.className = 'tl-tip'; this.tip.hidden = true;
    this.wrap.appendChild(this.tip);
  }

  _placeLabels() {
    if (!this.laneEls) return;
    this.wrap.classList.toggle('gutter', !this.narrow);
    for (const [k, el] of Object.entries(this.laneEls)) {
      const yy = this.y[k];
      el.style.top = this.narrow ? `${Math.round(yy - (k === 'terra' ? -6 : 22))}px` : `${Math.round(yy - 14)}px`;
      el.style.left = this.narrow ? `${this.padL - 4}px` : '14px';
    }
    this.subEl.style.top = `${Math.round(this.y.sub + (this.narrow ? -15 : 4))}px`;
    this.subEl.style.left = this.narrow ? `${this.padL - 4}px` : '14px';
  }

  /* ---------------- view control: flights ---------------- */

  clampView(t0, t1) {
    const span = clamp(t1 - t0, SPAN_MIN, SPAN_MAX);
    const c = (t0 + t1) / 2;
    t0 = c - span / 2; t1 = c + span / 2;
    const tmax = this.align ? NOW + 9000 : T_MAX;     // aligned: years since discovery, Kha-Ren reaches +10,068
    if (t1 > tmax) { t0 -= t1 - tmax; t1 = tmax; }
    if (t0 < T_MIN) { t1 += T_MIN - t0; t0 = T_MIN; }
    return [t0, Math.min(t1, tmax)];
  }

  /** Fly to a window along van Wijk & Nuij's smooth zoom-pan path (IEEE InfoVis 2003). */
  setView(t0, t1, { animate = true, maxMs = MOTION.flightMax } = {}) {
    [t0, t1] = this.clampView(t0, t1);
    if (!animate || this.reduced) { this.anim = null; this.t0 = t0; this.t1 = t1; this._viewChanged(); return; }
    const u0 = (this.t0 + this.t1) / 2, w0 = this.span, u1 = (t0 + t1) / 2, w1 = t1 - t0;
    const d = Math.abs(u1 - u0), dir = Math.sign(u1 - u0) || 1;
    let S, at;
    if (d < 1e-9 * Math.max(w0, w1)) {
      const k = Math.sign(Math.log(w1 / w0)) || 1;
      S = Math.abs(Math.log(w1 / w0)) / RHO;
      at = (s) => ({ u: u0, w: w0 * Math.exp(k * RHO * s) });
    } else {
      const r2 = RHO * RHO, r4 = r2 * r2;
      const b0 = (w1 * w1 - w0 * w0 + r4 * d * d) / (2 * w0 * r2 * d);
      const b1 = (w1 * w1 - w0 * w0 - r4 * d * d) / (2 * w1 * r2 * d);
      const r0 = Math.log(-b0 + Math.sqrt(b0 * b0 + 1)), r1 = Math.log(-b1 + Math.sqrt(b1 * b1 + 1));
      S = (r1 - r0) / RHO;
      at = (s) => ({ u: u0 + dir * (w0 / r2) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0)), w: w0 * Math.cosh(r0) / Math.cosh(RHO * s + r0) });
    }
    if (!Number.isFinite(S) || S <= 0) { this.anim = null; this.t0 = t0; this.t1 = t1; this._viewChanged(); return; }
    const dur = clamp(S * 120, this.motion.slow * 0.8, maxMs);
    this.anim = { S, at, start: performance.now(), dur, end: [t0, t1] };
  }

  _stepView(now) {
    const A = this.anim;
    if (!A) return;
    const u = clamp((now - A.start) / A.dur, 0, 1);
    if (u >= 1) { [this.t0, this.t1] = A.end; this.anim = null; }
    else {
      const p = A.at(A.S * ease(u));
      if (Number.isFinite(p.u) && Number.isFinite(p.w) && p.w > 0) { this.t0 = p.u - p.w / 2; this.t1 = p.u + p.w / 2; }
    }
    this._viewChanged();
  }

  _viewChanged() { this.dirty = true; this.cb.onView?.(this.t0, this.t1); }

  zoomAt(t, factor) {
    const s0 = this.span, s1 = clamp(s0 * factor, SPAN_MIN, SPAN_MAX);
    const t0 = t - (t - this.t0) * (s1 / s0);
    this.anim = null;
    [this.t0, this.t1] = this.clampView(t0, t0 + s1);
    this._viewChanged();
  }
  panBy(dt) { this.anim = null; [this.t0, this.t1] = this.clampView(this.t0 + dt, this.t1 + dt); this._viewChanged(); }
  zoomWin(t, k) { const s = this.span * k; const f = (t - this.t0) / this.span; return [t - f * s, t - f * s + s]; }

  setCursor(t, { animate = true } = {}) {
    this.cursorTo = clamp(t, T_MIN, this.align ? NOW + 10000 : NOW + 0.99);
    if (!animate || this.reduced) this.cursor = this.cursorTo;
    this.dirty = true;
  }
  setPin(t) { this.pin = t; this.dirty = true; }
  select(id) { this.sel = id; this.dirty = true; }
  setHighlights(ids) { this.hi = new Set(ids || []); this.dirty = true; }
  setLens(rung) { this.lens = rung; this.dirty = true; }
  setFollow(id) { this.follow = id; this.dirty = true; }
  setAlign(on) { this.align = !!on; this.dirty = true; }
  refresh() { this.dirty = true; }

  /** A window that frames an event in its context. */
  fitFor(ev) {
    if (this.align) { const t = ev.y - this.wOff(ev.world); return [t - Math.max(this.span, 400) * 0.5, t + Math.max(this.span, 400) * 0.5]; }
    if (ev.view) return ev.view;
    const inView = ev.y >= this.t0 + this.span * 0.06 && ev.y <= this.t1 - this.span * 0.06;
    if (inView && this.span <= 20000 && this.span >= 1500) return [this.t0, this.t1];
    if (ev.y > -9500 && ev.y < 2300) return [-9200, 2300];
    const span = clamp(this.span, 2500, 13000);
    return [ev.y - span * 0.5, ev.y + span * 0.5];
  }

  /* ---------------- gestures ---------------- */

  _bind() {
    const cv = this.cv;
    this.ptrs = new Map();
    this.g = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture?.(e.pointerId);
      this.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.cb.onInteract?.();
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        this.g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: this.span, tm: this.tAt((a.x + b.x) / 2) };
        return;
      }
      const xc = this.x(this.cursor);
      let mode = 'pan';
      if (e.offsetY < this.y.mini + 10) mode = 'mini';
      else if (Math.abs(e.offsetX - xc) < (e.pointerType === 'touch' ? 18 : 9) && e.offsetY < this.y.cursorTop + 20) mode = 'scrub';
      this.g = { mode, x0: e.offsetX, y0: e.offsetY, t0: this.t0, t1: this.t1, moved: 0 };
      if (mode === 'mini') this._miniJump(e.offsetX);
      if (mode === 'scrub') this._scrubTo(e.offsetX);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId);
      if (p) { p.x = e.offsetX; p.y = e.offsetY; }
      const g = this.g;
      if (g?.mode === 'pinch' && this.ptrs.size >= 2) {
        const [a, b] = [...this.ptrs.values()];
        const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
        const s1 = clamp(g.s0 * (g.d0 / d), SPAN_MIN, SPAN_MAX);
        const fx = ((a.x + b.x) / 2 - this.padL) / this.plotW;
        this.anim = null;
        [this.t0, this.t1] = this.clampView(g.tm - fx * s1, g.tm - fx * s1 + s1);
        this._viewChanged();
        return;
      }
      if (g && p) {
        const dx = e.offsetX - g.x0;
        g.moved = Math.max(g.moved, Math.abs(dx), Math.abs(e.offsetY - g.y0));
        if (g.mode === 'pan' && g.moved > 4) {
          const dt = -(dx / this.plotW) * (g.t1 - g.t0);
          this.anim = null;
          [this.t0, this.t1] = this.clampView(g.t0 + dt, g.t1 + dt);
          this._viewChanged();
          this.cv.style.cursor = 'grabbing';
        } else if (g.mode === 'scrub') this._scrubTo(e.offsetX);
        else if (g.mode === 'mini') this._miniJump(e.offsetX);
        return;
      }
      if (e.pointerType !== 'touch') this._hoverAt(e.offsetX, e.offsetY);
    });
    const end = (e) => {
      const g = this.g;
      this.ptrs.delete(e.pointerId);
      this.cv.style.cursor = '';
      if (!g) return;
      if (g.mode === 'pinch') { if (this.ptrs.size < 2) this.g = null; return; }
      if (g.mode === 'pan' && g.moved <= 5 && e.type === 'pointerup') {
        const hit = this._hitAt(g.x0, g.y0, e.pointerType === 'touch' ? 20 : 11);
        if (hit?.cluster) {
          const pad = (hit.hi - hit.lo) * 1.2 + this.span * 0.004;
          this.setView(hit.lo - pad, hit.hi + pad);
          this.cb.onSelect?.(hit.id, { from: 'canvas', fit: false });
        } else if (hit) this.cb.onSelect?.(hit.id, { from: 'canvas' });
        else if (g.y0 > this.y.cursorTop) { this.setCursor(this.tAt(g.x0)); this.cb.onCursor?.(this.cursorTo, { user: true }); }
      }
      this.g = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.g) { this.hover = null; this.tip.hidden = true; this.dirty = true; } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cb.onInteract?.();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (Math.abs(e.deltaX) > Math.abs(dy) && !e.ctrlKey) { this.panBy((e.deltaX / this.plotW) * this.span); return; }
      this.zoomAt(this.tAt(e.offsetX), Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0016)));
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { this.cb.onInteract?.(); this.setView(...this.zoomWin(this.tAt(e.offsetX), e.shiftKey ? 3 : 0.33)); });
    cv.addEventListener('keydown', (e) => this._key(e));
  }

  /** Scrubbing snaps to an event when the pointer is within 6 px of one. */
  _scrubTo(x) {
    let t = this.tAt(clamp(x, this.padL, this.W - this.padR));
    let best = null, bd = 6;
    for (const h of this.hits) { const d = Math.abs(h.x - x); if (d < bd && !h.cluster) { bd = d; best = h; } }
    if (best) { const ev = byId.get(best.id); t = ev.y - this.wOff(ev.world); }
    this.setCursor(t, { animate: false });
    this.cb.onCursor?.(this.cursorTo, { user: true, scrub: true, snapped: best?.id || null });
  }

  _key(e) {
    const k = e.key;
    const step = this.span / 100;
    let used = true;
    this.cb.onInteract?.();
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.shiftKey) this.panBy((k === 'ArrowLeft' ? -1 : 1) * this.span * (e.altKey ? 0.5 : 0.1));
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      this.setCursor(this.cursorTo + (k === 'ArrowLeft' ? -step : step), { animate: false });
      const xc = this.x(this.cursorTo);
      if (xc < this.padL || xc > this.W - this.padR) this.panBy(k === 'ArrowLeft' ? -step * 4 : step * 4);
      this.cb.onCursor?.(this.cursorTo, { user: true });
    } else if (k === 'ArrowUp' || k === '+' || k === '=') this.setView(...this.zoomWin(this.cursorTo, 0.5), { maxMs: this.motion.slow });
    else if (k === 'ArrowDown' || k === '-' || k === '_') this.setView(...this.zoomWin(this.cursorTo, 2), { maxMs: this.motion.slow });
    else if (k === ']' || k === '[') this.cb.onStep?.(k === ']' ? 1 : -1);
    else if (k === 'Enter') { const n = this._nearestEvent(this.cursorTo); if (n) this.cb.onSelect?.(n.id, { from: 'key' }); }
    else if (k === 'Home') { this.setCursor(this.t0 + this.span * 0.02); this.cb.onCursor?.(this.cursorTo, { user: true }); }
    else if (k === 'End') { this.setCursor(Math.min(NOW + 0.5, this.t1 - this.span * 0.02)); this.cb.onCursor?.(this.cursorTo, { user: true }); }
    else used = false;
    if (used) e.preventDefault();
  }

  _nearestEvent(t) {
    let best = null, bd = Infinity;
    for (const ev of VIS) { const tt = ev.y - this.wOff(ev.world); const d = Math.abs(tt - t); if (d < bd && tt >= this.t0 && tt <= this.t1) { bd = d; best = ev; } }
    return best;
  }

  _hitAt(x, y, r = 11) {
    let best = null, bd = r * r;
    for (const h of this.hits) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h; } }
    return best;
  }

  _hoverAt(x, y) {
    const h = this._hitAt(x, y, 11);
    const id = h ? h.id + (h.cluster ? '+' : '') : null;
    this.cv.style.cursor = h ? (h.cluster ? 'zoom-in' : 'pointer') : (y < this.y.mini + 10 ? 'pointer' : Math.abs(x - this.x(this.cursor)) < 9 && y < this.y.cursorTop + 20 ? 'ew-resize' : '');
    if (id !== this.hover) {
      this.hover = id; this.dirty = true;
      if (h) {
        const ev = byId.get(h.id);
        const when = this.span < 2 ? fmtDay(ev.y) : fmtCE(ev.y, ev.c);
        this.tip.innerHTML = h.cluster
          ? `<b>${h.n + 1} events here</b><span>click to zoom in and split them</span>`
          : `<b>${ev.title}</b><span>${when} · ${worldName(ev.world)}</span>`;
        this.tip.hidden = false;
      } else this.tip.hidden = true;
    }
    if (h) {
      const tw = this.tip.offsetWidth || 180;
      this.tip.style.left = `${clamp(h.x - tw / 2, 6, this.W - tw - 6)}px`;
      this.tip.style.top = `${Math.max(46, h.y - 52)}px`;
    }
  }

  /* ---------------- minimap: all of time, lookback on a log scale ---------------- */

  _L(t) { return Math.max(0.5, NOW + 1 - t); }
  _mx(L) { const lo = -0.4, hi = Math.log10(4.8e9); return this.padL + (1 - (Math.log10(Math.max(L, 0.4)) - lo) / (hi - lo)) * this.plotW; }
  _mL(x) { const lo = -0.4, hi = Math.log10(4.8e9); return Math.pow(10, lo + (1 - (x - this.padL) / this.plotW) * (hi - lo)); }
  _miniJump(x) {
    if (this.align) return;
    const L = this._mL(clamp(x, this.padL, this.W - this.padR));
    const t = NOW + 1 - L;
    const span = clamp(L * 1.6, 8, SPAN_MAX);
    this.setView(t - span * 0.55, t + span * 0.45);
    this.setCursor(t);
    this.cb.onCursor?.(t, { user: true });
  }

  /* ---------------- frame ---------------- */

  start() {
    this.ignStart = performance.now();
    const loop = () => {
      const now = performance.now();     // one clock: rAF timestamps can run on another timebase
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      if (!this.reduced) this.time += dt;
      if (this.ign < 1) { this.ign = clamp((now - this.ignStart) / this.motion.slow, 0, 1); this.dirty = true; if (this.ign >= 1) this.cb.onIgnited?.(); }
      this._stepView(now);
      const dc = this.cursorTo - this.cursor;
      if (Math.abs(dc) > 1e-9) {
        const k = 1 - Math.exp(-dt * 7);
        // glide only within reach of the view; across a larger gap, arrive at once
        this.cursor = Math.abs(dc) < this.span * 0.0005 || Math.abs(dc) > this.span * 1.5 ? this.cursorTo : this.cursor + dc * k;
        this.dirty = true;
      }
      if (!this.reduced || this.dirty) {
        const t0 = performance.now();
        this.draw(dt);
        this._measure(performance.now() - t0);
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _measure(msDraw) {
    if (this.reduced || this.ign < 1) return;
    this.frames++;
    if (this.frames < 30 || this.frames > 150) return;
    this.drawMs.push(msDraw);
    if (this.drawMs.length === 120) {
      const med = [...this.drawMs].sort((a, b) => a - b)[60];
      const next = med > 14 ? 'minimal' : med > 7 ? 'lite' : 'full';
      if (next !== this.tier) { this.tier = next; this.resize(); }
      this.cb.onTier?.(this.tier, med);
    }
  }

  draw(dt) {
    const { ctx, W, H, C } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, W, H);
    this.hits = []; this.boxes = [];
    const ign = ease(this.ign);
    const front = this.padL + ign * (this.plotW + 40);

    D.grid(this);
    D.future(this);
    ctx.save(); ctx.globalAlpha = clamp(this.ign * 2.2, 0, 1); D.substrate(this); ctx.restore();
    D.minimap(this);
    D.axis(this);
    ctx.save();
    if (this.ign < 1) { ctx.beginPath(); ctx.rect(0, 0, front, H); ctx.clip(); }
    D.guides(this);
    D.artifacts(this, ign);
    D.strands(this, dt);
    D.characters(this);
    D.links(this);
    const la = clamp((this.ign - 0.72) / 0.28, 0, 1);
    D.events(this, la);
    D.eras(this, la);
    D.clocks(this, la);
    ctx.restore();
    if (this.ign < 1) D.front(this, front);
    else D.cursors(this);
  }
}
