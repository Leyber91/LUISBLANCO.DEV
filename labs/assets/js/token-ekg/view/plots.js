/* ============================================================
   token-ekg/view/plots.js — three views of the interval series.
     tachogram    interval before each chunk, by chunk number
     distribution log-spaced histogram with p50, p90, p99
     poincare     each interval against the next, with SD1 and SD2
     periodogram  Lomb-Scargle power of the intervals against time, Hz
   A is the trace playing; B, when pinned, is drawn behind it in a
   dimmer ink. The newest interval of A is marked, and the chunk under
   the pointer on the strip is ringed in every view.
   ============================================================ */

import { colors, alpha, fit, fmtAxis } from './canvas.js';
import { histogram, quantile, lombScargle } from '../engine/stats.js';

const PAD = { l: 34, r: 8, t: 8, b: 18 };

function logRange(...series) {
  let lo = Infinity, hi = 0;
  for (const s of series) for (const x of s) if (x > 0) { if (x < lo) lo = x; if (x > hi) hi = x; }
  if (!Number.isFinite(lo)) return [1, 100];
  lo = 10 ** Math.floor(Math.log10(lo * 0.8));
  hi = 10 ** Math.ceil(Math.log10(hi * 1.25));
  if (hi / lo < 100) hi = lo * 100;
  return [lo, hi];
}

function decades(lo, hi) {
  const out = [];
  for (let e = Math.round(Math.log10(lo)); 10 ** e <= hi * 1.0001; e++) out.push(10 ** e);
  return out;
}

function frame(ctx, w, h, P) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = `9.5px ${P.font}`;
  ctx.lineWidth = 1;
}

function empty(ctx, w, h, P, msg) {
  ctx.fillStyle = P.faint;
  ctx.font = `10.5px ${P.font}`;
  ctx.fillText(msg, PAD.l, h / 2);
}

export function drawTachogram(canvas, A, B, hover = -1) {
  const P = colors();
  const { ctx, w, h } = fit(canvas);
  frame(ctx, w, h, P);
  if (!A || A.iti.length < 2) return empty(ctx, w, h, P, A && A.n ? 'one chunk: no intervals' : 'no intervals yet');
  const [lo, hi] = logRange(A.iti, B ? B.iti : []);
  const n = Math.max(A.iti.length, B ? B.iti.length : 0);
  const X = (i) => PAD.l + (i / Math.max(1, n - 1)) * (w - PAD.l - PAD.r);
  const Y = (v) => PAD.t + (1 - (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (h - PAD.t - PAD.b);
  for (const d of decades(lo, hi)) {
    const y = Math.round(Y(d)) + 0.5;
    ctx.strokeStyle = alpha(P.horizon, 0.07);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
    ctx.fillStyle = P.faint; ctx.fillText(fmtAxis(d), 0, y + 3);
  }
  ctx.fillStyle = P.faint;
  ctx.fillText('chunk ' + n, w - PAD.r - ctx.measureText('chunk ' + n).width, h - 4);
  ctx.fillText('1', PAD.l, h - 4);
  const series = (s, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    s.forEach((v, i) => { const xx = X(i), yy = Y(v > 0 ? v : lo); if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); });
    ctx.stroke();
  };
  if (B && B.iti.length > 1) series(B.iti, alpha(P.horizon, 0.35), 1);
  // median of A
  if (Number.isFinite(A.median)) {
    const y = Math.round(Y(A.median)) + 0.5;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(P.horizon, 0.45);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke(); ctx.setLineDash([]);
  }
  series(A.iti, alpha(P.bright, 0.75), 1);
  // stalls ringed
  const stallSet = new Set((A.stalls || []).map((s) => s.index - 1));
  ctx.strokeStyle = alpha(P.horizon, 0.8);
  for (const i of stallSet) { if (i < A.iti.length) { ctx.beginPath(); ctx.arc(X(i), Y(A.iti[i]), 3.2, 0, 7); ctx.stroke(); } }
  const k = A.iti.length - 1;
  ctx.fillStyle = P.bright;
  ctx.beginPath(); ctx.arc(X(k), Y(A.iti[k] > 0 ? A.iti[k] : lo), 2.6, 0, 7); ctx.fill();
  if (hover > 0 && hover - 1 < A.iti.length) {
    ctx.strokeStyle = P.bright; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(hover - 1), Y(A.iti[hover - 1] > 0 ? A.iti[hover - 1] : lo), 5, 0, 7); ctx.stroke();
  }
}

export function drawHistogram(canvas, A, B, hover = -1) {
  const P = colors();
  const { ctx, w, h } = fit(canvas);
  frame(ctx, w, h, P);
  if (!A || A.iti.length < 2) return empty(ctx, w, h, P, 'no intervals yet');
  const [lo, hi] = logRange(A.iti, B ? B.iti : []);
  const bins = 30;
  const HA = histogram(A.iti, bins, lo, hi);
  const HB = B && B.iti.length > 1 ? histogram(B.iti, bins, lo, hi) : null;
  const fA = HA.counts.map((c) => c / A.iti.length);
  const fB = HB ? HB.counts.map((c) => c / B.iti.length) : null;
  const top = Math.max(...fA, ...(fB || [0])) * 1.12 || 1;
  const X = (v) => PAD.l + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (w - PAD.l - PAD.r);
  const Y = (f) => PAD.t + (1 - f / top) * (h - PAD.t - PAD.b);
  for (const d of decades(lo, hi)) {
    const xx = Math.round(X(d)) + 0.5;
    ctx.strokeStyle = alpha(P.horizon, 0.07);
    ctx.beginPath(); ctx.moveTo(xx, PAD.t); ctx.lineTo(xx, h - PAD.b); ctx.stroke();
    ctx.fillStyle = P.faint;
    const lab = fmtAxis(d);
    ctx.fillText(lab, Math.min(w - ctx.measureText(lab).width - 2, xx - ctx.measureText(lab).width / 2), h - 4);
  }
  ctx.fillStyle = P.faint;
  ctx.fillText(Math.round(top * 100) + '%', 0, PAD.t + 8);
  const steps = (f, color, width, fill) => {
    ctx.beginPath();
    ctx.moveTo(X(HA.edges[0]), Y(0));
    f.forEach((v, i) => { ctx.lineTo(X(HA.edges[i]), Y(v)); ctx.lineTo(X(HA.edges[i + 1]), Y(v)); });
    ctx.lineTo(X(HA.edges[bins]), Y(0));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  if (fB) steps(fB, alpha(P.horizon, 0.4), 1);
  steps(fA, alpha(P.bright, 0.8), 1, alpha(P.horizon, 0.06));
  // quantile ticks
  const marks = [['p50', A.median], ['p90', A.p90], ['p99', A.p99]];
  marks.forEach(([lab, v], j) => {
    if (!Number.isFinite(v)) return;
    const xx = Math.round(X(v)) + 0.5;
    ctx.strokeStyle = alpha(P.horizon, 0.6);
    ctx.beginPath(); ctx.moveTo(xx, PAD.t + 10 + j * 11); ctx.lineTo(xx, h - PAD.b); ctx.stroke();
    ctx.fillStyle = P.dim; ctx.fillText(lab, Math.min(xx + 3, w - 24), PAD.t + 18 + j * 11);
  });
  // the hovered chunk's bin
  if (hover > 0 && hover - 1 < A.iti.length && A.iti[hover - 1] > 0) {
    const v = A.iti[hover - 1];
    const b = Math.max(0, Math.min(bins - 1, Math.floor(((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * bins)));
    ctx.strokeStyle = P.bright; ctx.lineWidth = 1.5;
    ctx.strokeRect(X(HA.edges[b]), Y(fA[b]), X(HA.edges[b + 1]) - X(HA.edges[b]), Y(0) - Y(fA[b]));
  }
  // newest interval
  const last = A.iti[A.iti.length - 1];
  if (last > 0) {
    const xx = X(last);
    ctx.fillStyle = P.bright;
    ctx.beginPath(); ctx.moveTo(xx, h - PAD.b - 1); ctx.lineTo(xx - 3.5, h - PAD.b + 5); ctx.lineTo(xx + 3.5, h - PAD.b + 5); ctx.closePath(); ctx.fill();
  }
}

export function drawPoincare(canvas, A, B) {
  const P = colors();
  const { ctx, w, h } = fit(canvas);
  frame(ctx, w, h, P);
  if (!A || A.iti.length < 3) return empty(ctx, w, h, P, 'needs three or more intervals');
  // linear axes from 0.8 x the 1st percentile to 1.3 x the 99th; anything outside is pinned to the edge
  const pos = A.iti.filter((x) => x > 0).sort((a, b) => a - b);
  let max = quantile(pos, 0.99) * 1.3, min = quantile(pos, 0.01) * 0.8;
  if (B && B.iti.length > 2) {
    const pb = B.iti.filter((x) => x > 0).sort((a, b) => a - b);
    max = Math.max(max, quantile(pb, 0.99) * 1.3); min = Math.min(min, quantile(pb, 0.01) * 0.8);
  }
  if (max - min < 1) { min = Math.max(0, min - 0.5); max = min + 1; }
  const side = Math.min(w - PAD.l - PAD.r, h - PAD.t - PAD.b);
  const ox = PAD.l, oy = PAD.t + side;
  const S = (v) => Math.max(0, Math.min(1, (v - min) / (max - min))) * side;
  const L = (v) => Math.max(0, Math.min(1, v / (max - min))) * side; // a length, for SD1 and SD2
  ctx.strokeStyle = alpha(P.horizon, 0.12);
  ctx.strokeRect(ox + 0.5, PAD.t + 0.5, side, side);
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + side, oy - side); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = P.faint;
  ctx.fillText(fmtAxis(min), 0, oy + 3);
  ctx.fillText(fmtAxis(max), ox + side - ctx.measureText(fmtAxis(max)).width, oy + 13);
  ctx.save();
  ctx.translate(10, oy - side / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('next', -10, 0);
  ctx.restore();
  const dots = (s, color, r) => {
    ctx.fillStyle = color;
    for (let i = 0; i + 1 < s.length; i++) {
      const xx = ox + S(s[i]), yy = oy - S(s[i + 1]);
      ctx.fillRect(xx - r / 2, yy - r / 2, r, r);
    }
  };
  if (B && B.iti.length > 2) dots(B.iti, alpha(P.horizon, 0.35), 2);
  dots(A.iti, alpha(P.bright, 0.55), 2);
  // SD1 / SD2 ellipse about the mean, axes along and across the diagonal
  if (Number.isFinite(A.sd1) && Number.isFinite(A.sd2)) {
    const m = A.mean;
    const cx = ox + S(m), cy = oy - S(m);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = alpha(P.horizon, 0.75);
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, L(A.sd2)), Math.max(1, L(A.sd1)), 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const k = A.iti.length - 2;
  ctx.fillStyle = P.bright;
  ctx.beginPath(); ctx.arc(ox + S(A.iti[k]), oy - S(A.iti[k + 1]), 2.8, 0, 7); ctx.fill();
}

/**
 * Lomb-Scargle periodogram of the interval series against arrival time, in Hz.
 * A peak means the intervals rise and fall on a regular period (for example a batch
 * scheduler or a periodic flush); a flat floor means no rhythm beyond noise.
 */
export function drawPeriodogram(canvas, A, trace) {
  const P = colors();
  const { ctx, w, h } = fit(canvas);
  frame(ctx, w, h, P);
  if (!A || A.iti.length < 16 || !trace) return empty(ctx, w, h, P, 'needs 16 or more intervals');
  const ts = [], ys = [];
  for (let i = 0; i < A.iti.length; i++) {
    if (A.iti[i] < 2) continue;
    ts.push(trace.chunks[i + 1].t / 1000);
    ys.push(A.iti[i]);
  }
  if (ts.length < 16) return empty(ctx, w, h, P, 'too few unbuffered intervals');
  const T = ts[ts.length - 1] - ts[0];
  const nyq = ts.length / (2 * T);
  const key = `${trace.id}|${ts.length}`;
  let ls = cache.get(key);
  if (!ls) { ls = lombScargle(ts, ys, { fmin: 1 / T, fmax: nyq, n: 160 }); cache.set(key, ls); if (cache.size > 40) cache.delete(cache.keys().next().value); }
  const top = Math.max(...ls.power) * 1.1 || 1;
  const X = (f) => PAD.l + ((f - ls.freq[0]) / (ls.freq[ls.freq.length - 1] - ls.freq[0])) * (w - PAD.l - PAD.r);
  const Y = (p) => PAD.t + (1 - p / top) * (h - PAD.t - PAD.b);
  ctx.strokeStyle = alpha(P.horizon, 0.07);
  for (let k = 0; k <= 4; k++) {
    const f = ls.freq[0] + ((ls.freq[ls.freq.length - 1] - ls.freq[0]) * k) / 4;
    const xx = Math.round(X(f)) + 0.5;
    ctx.beginPath(); ctx.moveTo(xx, PAD.t); ctx.lineTo(xx, h - PAD.b); ctx.stroke();
    ctx.fillStyle = P.faint;
    const lab = f >= 10 ? f.toFixed(0) + ' Hz' : f.toFixed(1) + ' Hz';
    ctx.fillText(lab, Math.max(PAD.l, Math.min(w - ctx.measureText(lab).width - 2, xx - ctx.measureText(lab).width / 2)), h - 4);
  }
  ctx.fillStyle = P.faint;
  ctx.fillText('power', 0, PAD.t + 8);
  ctx.beginPath();
  ls.freq.forEach((f, i) => { const xx = X(f), yy = Y(ls.power[i]); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); });
  ctx.strokeStyle = alpha(P.bright, 0.75); ctx.lineWidth = 1; ctx.stroke();
  const k = ls.power.indexOf(Math.max(...ls.power));
  const fx = X(ls.freq[k]);
  ctx.strokeStyle = alpha(P.horizon, 0.6); ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(fx, PAD.t); ctx.lineTo(fx, h - PAD.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = P.dim;
  const fap = 1 - (1 - Math.exp(-ls.power[k])) ** ts.length; // Scargle 1982, M taken as N
  const lab = `peak ${ls.freq[k].toFixed(2)} Hz, false-alarm p ${fap < 0.001 ? '< 0.001' : fap.toFixed(3)}`;
  ctx.fillText(lab, Math.min(fx + 4, w - ctx.measureText(lab).width - 2), PAD.t + 10);
  canvas.dataset.peak = ls.freq[k].toFixed(2);
  canvas.dataset.power = ls.power[k].toFixed(1);
  canvas.dataset.fap = String(fap);
}
const cache = new Map();
