/* ============================================================
   token-ekg/view/strip.js — the strip and its overview.

   A chart recorder. The pen travels in from the left, then the paper
   moves under it; every chunk is drawn at x = its arrival time. The
   grid is the paper: ten major divisions across, five minor in each,
   as on electrocardiograph paper, with the ms per division printed.
     x        real: the chunk's measured arrival time
     height   real: the interval before the chunk, on a log scale from
              0.5 ms to 10 s (the first chunk's height is its wait from
              the request). Labelled on the left edge.
     shape    drawn: a fixed spike glyph marks the event
     colour   gold only while a live stream is being measured; a replay
              of a recording or a saved run draws in ink
   B, when pinned, is drawn behind A on the same time axis.
   ============================================================ */

import { colors, alpha, fit, fmtAxis } from './canvas.js';
import { SWEEP, ANALYSIS } from '../config.js';
import { fmtMs } from '../engine/stats.js';

const HEAD = 0.88;           // pen position, fraction of width
const LEAD = 0.035;          // room left of the request mark, fraction of the window
const GLOW_MS = 160;         // how long a fresh spike stays lit (stream time)
const Y_LO = 0.5, Y_HI = 10000; // ms, the height scale
const LOG_LO = Math.log10(Y_LO), LOG_SPAN = Math.log10(Y_HI) - LOG_LO;
const GUTTER = 44;           // px kept for the height labels

export class Strip {
  constructor(canvas, overview, { onSeek, onHover } = {}) {
    this.c = canvas;
    this.o = overview;
    this.onSeek = onSeek;
    this.onHover = onHover;
    this.trace = null;
    this.a = null;
    this.B = null;
    this.live = false;
    this.div = SWEEP.initial;
    this.tau = 0;
    this.hover = -1;
    this.reveal = 1;
    this.glow = true;
    this.dprCap = 2;
    this._geom = null;
    this._bindOverview();
    this._bindHover();
  }

  setTrace(trace, analysis) { this.trace = trace; this.a = analysis; this.hover = -1; }
  setAnalysis(analysis) { this.a = analysis; }
  setB(trace) { this.B = trace; }
  setDiv(ms) { this.div = ms; }

  end() {
    const t = this.trace;
    if (!t) return 0;
    const last = t.chunks.length ? t.chunks[t.chunks.length - 1].t : 0;
    const e = Math.max(last, t.tDone || 0, t.contention?.endMs || 0);
    return this.live && t.tDone == null ? Math.max(e, this.tau) : e;
  }

  leftEdge(tau) {
    const D = this.div * SWEEP.divisions;
    return Math.max(-LEAD * D, tau - HEAD * D);
  }

  autoDiv(trace, a) {
    if (trace.kind === 'oneshot' || !Number.isFinite(a.median)) {
      const T = Math.max(1000, trace.tDone || 1000);
      return [100, 250, 1000, 2500, 5000].find((d) => d * SWEEP.divisions * HEAD >= T * 1.05) || 5000;
    }
    const ideal = (a.median * 60) / SWEEP.divisions;
    const steps = [5, 10, 25, 50, 100, 250, 500, 1000];
    return steps.reduce((best, s) => (Math.abs(Math.log(s / ideal)) < Math.abs(Math.log(best / ideal)) ? s : best), 250);
  }

  static yOf(ms, y0, amp) {
    const v = Math.max(Y_LO, Math.min(Y_HI, ms));
    return y0 - ((Math.log10(v) - LOG_LO) / LOG_SPAN) * amp;
  }

  draw() {
    const P = colors();
    const { ctx, w, h } = fit(this.c, this.dprCap);
    ctx.clearRect(0, 0, w, h);
    const D = this.div * SWEEP.divisions;
    const tau = this.tau;
    const tL = this.leftEdge(tau);
    const pw = w - GUTTER;
    const x = (t) => GUTTER + ((t - tL) / D) * pw;
    const headX = x(tau);
    const tMin = tL, tMax = tL + D;
    const y0 = Math.round(h - 36) + 0.5;
    const amp = y0 - 12;
    const Y = (ms) => Strip.yOf(ms, y0, amp);
    this._geom = { x, tL, D, w, pw, y0, amp };
    const live = this.live;
    const hot = live ? P.goldSoft : P.bright;

    // paper: minor and major time divisions, printed in from the left on load
    const minor = this.div / SWEEP.minorPerMajor;
    const k0 = Math.floor(tMin / minor), k1 = Math.ceil(tMax / minor);
    const revealX = w * this.reveal;
    const labelEvery = Math.max(1, Math.ceil(52 / ((this.div / D) * pw)));
    ctx.lineWidth = 1;
    ctx.font = `10px ${P.font}`;
    for (let k = k0; k <= k1; k++) {
      const t = k * minor;
      const xx = Math.round(x(t)) + 0.5;
      if (xx > revealX || xx < GUTTER) continue;
      const major = k % SWEEP.minorPerMajor === 0;
      ctx.strokeStyle = alpha(P.horizon, major ? (t < 0 ? 0.05 : 0.11) : 0.035);
      ctx.beginPath(); ctx.moveTo(xx, 4); ctx.lineTo(xx, y0 + 4); ctx.stroke();
      if (major && t >= 0 && Math.round(t / this.div) % labelEvery === 0) {
        ctx.fillStyle = P.faint;
        ctx.fillText(fmtAxis(t), xx + 4, h - 3);
      }
    }
    // height scale: decades of interval, labelled at the left edge
    for (const d of [1, 10, 100, 1000, 10000]) {
      const yy = Math.round(Y(d)) + 0.5;
      ctx.strokeStyle = alpha(P.horizon, 0.045);
      ctx.beginPath(); ctx.moveTo(GUTTER, yy); ctx.lineTo(Math.min(w, revealX), yy); ctx.stroke();
      ctx.fillStyle = P.faint;
      ctx.fillText(fmtAxis(d), 2, yy + 3);
    }

    const t = this.trace;
    if (!t) return;
    const a = this.a || {};
    const chunks = t.chunks;

    if (t.contention) {
      const xa = Math.max(GUTTER, x(t.contention.startMs)), xb = Math.min(headX, x(Math.min(t.contention.endMs, tau)));
      if (xb > xa) {
        ctx.fillStyle = alpha(P.horizon, 0.05);
        ctx.fillRect(xa, 0, xb - xa, y0);
        ctx.fillStyle = P.dim;
        ctx.fillText('another request is running', Math.max(xa + 6, 40), 14);
      }
    }

    // B behind A, same clock
    if (this.B && this.B !== t) {
      const bc = this.B.chunks;
      ctx.strokeStyle = alpha(P.horizon, 0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < bc.length; i++) {
        const c = bc[i];
        if (c.t > tau || c.t < tMin - 10) continue;
        const xx = x(c.t);
        const ms = i ? c.t - bc[i - 1].t : c.t;
        ctx.moveTo(xx, y0); ctx.lineTo(xx, Y(ms));
      }
      ctx.stroke();
    }

    // request sent: the trigger
    const xs = x(0);
    if (xs >= GUTTER - 4 && xs <= w) {
      ctx.strokeStyle = alpha(P.horizon, 0.5);
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(Math.round(xs) + 0.5, 6); ctx.lineTo(Math.round(xs) + 0.5, y0 + 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.dim;
      ctx.fillText('sent', xs + 5, 16);
    }

    // baseline: dotted while waiting for the first chunk, solid once the stream is flowing
    const bx0 = Math.max(GUTTER, xs), bx1 = Math.min(headX, x(Math.min(tau, this.end())));
    const firstT = chunks.length ? chunks[0].t : Infinity;
    const xFirst = Math.min(bx1, x(firstT));
    ctx.strokeStyle = alpha(P.horizon, 0.42);
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(bx0, y0); ctx.lineTo(Math.max(bx0, xFirst), y0); ctx.stroke();
    ctx.setLineDash([]);
    if (bx1 > xFirst) { ctx.beginPath(); ctx.moveTo(Math.max(bx0, xFirst), y0); ctx.lineTo(bx1, y0); ctx.stroke(); }

    // spikes
    const i0 = lowerBound(chunks, tMin - 20);
    const nNow = lowerBound(chunks, tau + 1e-9);
    const g = Math.max(1.2, Math.min(3.2, (Number.isFinite(a.median) ? (a.median / D) * pw : 6) * 0.35));
    for (let i = i0; i < nNow; i++) {
      const c = chunks[i];
      const xx = x(c.t);
      if (xx < GUTTER - 2) continue;
      const ms = i ? c.t - chunks[i - 1].t : c.t;
      const yTop = Y(ms);
      const A = y0 - yTop;
      const age = tau - c.t;
      const fresh = age < GLOW_MS ? 1 - age / GLOW_MS : 0;
      const think = c.kind === 't';
      ctx.lineWidth = fresh > 0 ? 1.6 : 1.1;
      ctx.strokeStyle = fresh > 0 ? alpha(hot, 0.4 + 0.6 * fresh) : think ? alpha(P.horizon, 0.5) : alpha(P.bright, 0.78);
      if (fresh > 0.15 && this.glow && live) { ctx.shadowColor = P.goldGlow; ctx.shadowBlur = 10 * fresh; }
      ctx.beginPath();
      ctx.moveTo(xx - g * 1.6, y0);
      ctx.lineTo(xx - g * 0.9, y0 + Math.min(4, A * 0.06));
      ctx.lineTo(xx - g * 0.2, yTop);
      ctx.lineTo(xx + g * 0.5, y0 + Math.min(8, A * 0.12));
      ctx.lineTo(xx + g * 1.2, y0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (i > 0 && ms < ANALYSIS.BUFFER_MS) {
        ctx.fillStyle = P.horizon;
        ctx.fillRect(xx - 1, y0 + 4, 2, 2); // buffered arrival
      }
      if (i === this.hover) {
        ctx.strokeStyle = hot; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(xx - g * 0.2, yTop, 4.5, 0, 7); ctx.stroke();
      }
    }

    // first token: bracket under the baseline once the first chunk has landed
    if (chunks.length && tau >= chunks[0].t) {
      const xa = x(0), xb = x(chunks[0].t);
      if (xb > GUTTER && xb - xa > 18) bracket(ctx, Math.max(GUTTER, xa), xb, y0 + 10, alpha(P.horizon, 0.55), `first token ${fmtMs(chunks[0].t)}`, P.dim);
    } else if (chunks.length || t.kind === 'oneshot' || live) {
      ctx.fillStyle = live ? P.goldSoft : P.text;
      ctx.fillText(`waiting ${fmtMs(Math.max(0, tau))}`, Math.min(headX + 10, w - 100), y0 - 10);
    } else if ((t.stopped || t.failed) && Number.isFinite(t.tDone) && tau >= t.tDone) {
      // a run that ended before its first chunk: the dotted wait ends here, in ink
      const msg = `${t.failed ? 'failed' : 'stopped'} at ${fmtMs(t.tDone)}, no token arrived`;
      ctx.fillStyle = P.text;
      ctx.fillText(msg, Math.max(GUTTER + 4, Math.min(x(t.tDone) + 10, w - ctx.measureText(msg).width - 6)), y0 - 10);
    }
    if (Number.isFinite(a.ttfa) && tau >= a.ttfa) {
      const xp = x(a.ttfa);
      if (xp > 0 && xp < headX) {
        ctx.strokeStyle = alpha(P.horizon, 0.45); ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(xp + 0.5, 22); ctx.lineTo(xp + 0.5, y0 - 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = P.dim; ctx.fillText('answer begins', xp + 5, 30);
        ctx.fillStyle = P.faint; ctx.fillText('thinking', Math.max(40, xp - 62), 30);
      }
    }
    if (a.stallList) {
      for (const st of a.stallList) {
        if (st.at + st.ms > tau) continue;
        const xa = x(st.at), xb = x(st.at + st.ms);
        if (xb < GUTTER || xa > headX) continue;
        bracket(ctx, Math.max(GUTTER, xa), xb, y0 + 10, alpha(P.horizon, 0.45), `stall ${fmtMs(st.ms)}`, P.dim, true);
      }
    }

    // the pen
    ctx.strokeStyle = alpha(live ? P.gold : P.horizon, 0.3);
    ctx.beginPath(); ctx.moveTo(Math.round(headX) + 0.5, 6); ctx.lineTo(Math.round(headX) + 0.5, y0 + 6); ctx.stroke();
    const last = nNow > 0 ? chunks[nNow - 1] : null;
    const penFresh = last ? Math.max(0, 1 - (tau - last.t) / 160) : 0;
    ctx.fillStyle = live ? P.goldSoft : P.bright;
    if (this.glow && live) { ctx.shadowColor = P.goldGlow; ctx.shadowBlur = 8 + 10 * penFresh; }
    ctx.beginPath(); ctx.arc(headX, y0, 2.2 + 1.4 * penFresh, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  /** The whole run, with the server's phases laid end to end above it. */
  drawOverview() {
    const P = colors();
    const { ctx, w, h } = fit(this.o, this.dprCap);
    ctx.clearRect(0, 0, w, h);
    const t = this.trace;
    if (!t) return;
    const T = Math.max(1, this.end());
    const x = (ms) => (ms / T) * (w - 2) + 1;
    const mid = h - 6;
    const top = 16;
    const chunks = t.chunks;
    ctx.font = `9.5px ${P.font}`;

    // phase track (server counters): load, prefill, decode, the rest of the server's time, then network
    const a = this.a;
    const s = a && a.server && this.tau >= (t.tDone || 0) ? a.server : null;
    if (s) {
      const segs = [['load', s.loadMs], ['prefill', s.promptMs], ['decode', s.evalMs], ['other', Math.max(0, s.totalMs - s.loadMs - s.promptMs - s.evalMs)], ['network', Math.max(0, (t.tDone || 0) - s.totalMs)]];
      let at = 0;
      segs.forEach(([name, ms], i) => {
        if (!(ms > 0)) return;
        const xa = x(at), xb = x(at + ms);
        ctx.fillStyle = alpha(P.horizon, [0.22, 0.34, 0.12, 0.06, 0.04][i]);
        ctx.fillRect(xa, 2, Math.max(1, xb - xa), 10);
        if (xb - xa > ctx.measureText(name).width + 6) { ctx.fillStyle = P.text; ctx.fillText(name, xa + 3, 10.5); }
        at += ms;
      });
    } else {
      ctx.fillStyle = P.faint;
      ctx.fillText(t.kind === 'oneshot' ? 'no server phases for a one-piece reply' : 'server phases arrive with the last line', 2, 10.5);
    }

    if (chunks.length) {
      ctx.fillStyle = alpha(P.horizon, 0.045);
      ctx.fillRect(x(0), top, x(chunks[0].t) - x(0), mid - top);
    }
    if (t.contention) {
      ctx.fillStyle = alpha(P.horizon, 0.06);
      ctx.fillRect(x(Math.max(0, t.contention.startMs)), top, x(t.contention.endMs) - x(Math.max(0, t.contention.startMs)), mid - top);
    }
    ctx.strokeStyle = alpha(P.horizon, 0.3);
    ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(w, mid + 0.5); ctx.stroke();
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const xx = Math.round(x(c.t)) + 0.5;
      const ms = i ? c.t - chunks[i - 1].t : c.t;
      const hh = 3 + ((Math.log10(Math.max(Y_LO, Math.min(Y_HI, ms))) - LOG_LO) / LOG_SPAN) * (mid - top - 3);
      ctx.strokeStyle = c.t <= this.tau ? (c.kind === 't' ? alpha(P.horizon, 0.55) : alpha(P.bright, 0.7)) : alpha(P.horizon, 0.18);
      ctx.beginPath(); ctx.moveTo(xx, mid); ctx.lineTo(xx, mid - hh); ctx.stroke();
    }
    const D = this.div * SWEEP.divisions;
    const tL = this.leftEdge(this.tau);
    const wa = x(tL), wb = x(tL + D);
    ctx.strokeStyle = alpha(P.horizon, 0.5);
    ctx.strokeRect(Math.max(0.5, wa), top - 1.5, Math.min(w - 1, wb) - Math.max(0.5, wa), mid - top + 4);
    const px = Math.round(x(Math.min(this.tau, T))) + 0.5;
    ctx.strokeStyle = this.live ? P.gold : P.bright;
    ctx.beginPath(); ctx.moveTo(px, top - 2); ctx.lineTo(px, h); ctx.stroke();
    this.o.setAttribute('aria-valuenow', String(Math.round((Math.min(this.tau, T) / T) * 100)));
    this.o.setAttribute('aria-valuetext', `${fmtMs(Math.min(this.tau, T))} of ${fmtMs(T)}`);
  }

  _bindOverview() {
    const seek = (ev) => {
      const r = this.o.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      this.onSeek?.(f * this.end());
    };
    let down = false;
    this.o.addEventListener('pointerdown', (e) => { down = true; this.o.setPointerCapture(e.pointerId); seek(e); });
    this.o.addEventListener('pointermove', (e) => { if (down) seek(e); });
    this.o.addEventListener('pointerup', () => { down = false; });
    this.o.addEventListener('keydown', (e) => {
      const T = this.end();
      const step = e.shiftKey ? T / 10 : T / 50;
      if (e.key === 'ArrowRight') { this.onSeek?.(Math.min(T, this.tau + step)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { this.onSeek?.(Math.max(0, this.tau - step)); e.preventDefault(); }
      if (e.key === 'Home') { this.onSeek?.(0); e.preventDefault(); }
      if (e.key === 'End') { this.onSeek?.(T); e.preventDefault(); }
    });
  }

  /** Point at a spike: the nearest drawn chunk within 10 px becomes the hover. */
  _bindHover() {
    const pick = (ev) => {
      const g = this._geom, t = this.trace;
      if (!g || !t) return;
      const r = this.c.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const tAt = g.tL + ((px - GUTTER) / g.pw) * g.D;
      const n = lowerBound(t.chunks, this.tau + 1e-9);
      let i = Math.min(n - 1, lowerBound(t.chunks, tAt));
      if (i < 0) { this.setHover(-1); return; }
      if (i > 0 && Math.abs(t.chunks[i - 1].t - tAt) < Math.abs(t.chunks[i].t - tAt)) i--;
      this.setHover(Math.abs(g.x(t.chunks[i].t) - px) <= 10 ? i : -1);
    };
    this.c.addEventListener('pointermove', pick);
    this.c.addEventListener('pointerdown', pick);
    this.c.addEventListener('pointerleave', () => this.setHover(-1));
  }

  setHover(i) {
    if (i === this.hover) return;
    this.hover = i;
    this.onHover?.(i);
  }
}

export function lowerBound(chunks, t) {
  let lo = 0, hi = chunks.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (chunks[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

function bracket(ctx, xa, xb, y, stroke, label, fill, dashed) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  if (dashed) ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(xa + 0.5, y - 4); ctx.lineTo(xa + 0.5, y); ctx.lineTo(xb - 0.5, y); ctx.lineTo(xb - 0.5, y - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = fill;
  const tw = ctx.measureText(label).width;
  const lx = Math.max(xa + 2, Math.min((xa + xb) / 2 - tw / 2, xb - tw - 2));
  ctx.fillText(label, xb - xa > tw + 6 ? lx : xa + 2, y + 11);
}
