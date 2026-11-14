/* ============================================================
   overdue/views.js — the two drawings of one clock.

   The orbit. The system from above, Earth toward the bottom of
   the drawing. The planet stands where its clock puts it on the
   date shown, and it is drawn as sharp as that clock: a disc
   while the window is narrow, then an arc along the orbit that
   lengthens as the uncertainty grows (one sigma bright, two
   sigma faint). The same ink is spread over the arc, so a planet
   nobody can time fades as it spreads.

   The record. Time runs left to right from the clock's own
   epoch to 2040. The funnel is what the clock allows itself: one
   and two sigma of its prediction, widening with every orbit.
   Two hairlines stand at plus and minus the transit's duration:
   where the funnel's one-sigma edge crosses them, the planet is
   lost. Every other published solution of the planet is a point
   at its own mid-time, as early or late as it found the transit
   against this clock's prediction. Gold is a later measurement
   that landed inside the one-sigma window: the prediction held.

   The vertical scale is linear inside one minute and logarithmic
   beyond, so seconds and days fit one drawing.
   ============================================================ */

import { tokens, alpha } from '../views/common.js';
import { epochAt, midAt, sigmaAt, phaseAt, bandDegrees, lampAt, lostFrom } from './clock.js';
import { yearOfJd, jdOfYear, durDays } from './data.js';

const TAU = Math.PI * 2;
export const END_YEAR = 2040;

/* ---------------- the orbit ---------------- */
export function drawOrbit(ctx, w, h, { planet, clock, jd, starRgb }) {
  const T = tokens();
  const cx = w / 2, cy = h * 0.47, R = Math.min(w, h) * 0.36;
  const dur = durDays(planet);
  // the line of sight
  ctx.strokeStyle = alpha(T.text, 0.22); ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, h - 16); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'center'; ctx.fillText('TO EARTH', cx, h - 5);
  // the orbit, and on it the stretch where the planet is in front of the star
  ctx.strokeStyle = alpha(T.text, 0.3); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  if (dur) {
    const half = Math.min(Math.PI / 2, (dur / clock.P) * Math.PI);
    ctx.strokeStyle = alpha(T.bright, 0.75); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI / 2 - half, Math.PI / 2 + half); ctx.stroke(); ctx.lineWidth = 1;
  }
  // the star, to the orbit's scale where the archive gives it
  const starPx = Math.max(3, Math.min(R * 0.5, planet.aOverRs ? R / planet.aOverRs : 6));
  const [r, g, b] = starRgb;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(16, starPx * 2.6));
  glow.addColorStop(0, `rgba(${r},${g},${b},0.9)`); glow.addColorStop(0.3, `rgba(${r},${g},${b},0.22)`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, Math.max(16, starPx * 2.6), 0, TAU); ctx.fill();
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath(); ctx.arc(cx, cy, starPx, 0, TAU); ctx.fill();
  // the planet: mid-transit is at the bottom, and it goes round anticlockwise
  const ang = Math.PI / 2 - phaseAt(clock, jd) * TAU;                 // canvas angle, 0 to the right, positive downward
  const lamp = dur ? lampAt(clock, jd, dur) : NaN;
  const lost = lamp < 1;
  const pr = Math.max(2.6, Math.min(7, starPx * (planet.rEarth && planet.stRad ? (planet.rEarth * 6371) / (planet.stRad * 695700) : 0.1)));
  const arc1 = (bandDegrees(clock, jd, 1) * Math.PI) / 180, arc2 = (bandDegrees(clock, jd, 2) * Math.PI) / 180;
  const ink = lost ? T.dim : T.gold;                                  // gold while the clock still says when; grey once it cannot
  const spread = Math.max(1, (arc1 * R) / (2 * pr));                  // how many planet widths the one-sigma arc covers
  ctx.lineCap = 'round';
  if (arc2 * R > 2 * pr) {
    ctx.strokeStyle = alpha(ink, Math.max(0.1, 0.45 / spread)); ctx.lineWidth = 2 * pr;
    ctx.beginPath(); if (arc2 >= TAU - 1e-6) ctx.arc(cx, cy, R, 0, TAU); else ctx.arc(cx, cy, R, ang - arc2 / 2, ang + arc2 / 2); ctx.stroke();
  }
  if (arc1 * R > 2 * pr) {
    ctx.strokeStyle = alpha(ink, Math.max(0.22, 0.95 / spread)); ctx.lineWidth = 2 * pr;
    ctx.beginPath(); if (arc1 >= TAU - 1e-6) ctx.arc(cx, cy, R, 0, TAU); else ctx.arc(cx, cy, R, ang - arc1 / 2, ang + arc1 / 2); ctx.stroke();
  } else {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx + R * Math.cos(ang), cy + R * Math.sin(ang), pr, 0, TAU); ctx.fill();
    ctx.strokeStyle = alpha(ink, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + R * Math.cos(ang), cy + R * Math.sin(ang), pr + 4, 0, TAU); ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineWidth = 1;
  return { lamp, lost, arc1Deg: bandDegrees(clock, jd, 1) };
}

/* ---------------- the record ---------------- */
const MINUTE = 1 / 1440;
/* Days early or late to a height: linear inside one minute, logarithmic beyond (asinh), so the sign is kept. */
const squash = (days) => Math.asinh(days / MINUTE);
export const RECORD_TICKS = [[1 / 1440, '1 min'], [10 / 1440, '10 min'], [1 / 24, '1 h'], [6 / 24, '6 h'], [1, '1 d'], [10, '10 d']];

export function recordScale(w, h, clock, points, dur) {
  const pad = { l: 52, r: 12, t: 12, b: 24 };
  const y0 = Math.min(yearOfJd(clock.t0), ...points.map((p) => p.year)) - 0.4, y1 = END_YEAR;
  const far = Math.max(2 * sigmaAt(clock, epochAt(clock, jdOfYear(END_YEAR))), dur || 0, ...points.map((p) => Math.abs(p.residual) + p.sT), 2 * MINUTE);
  const top = squash(far * 1.3);
  const X = (year) => pad.l + ((year - y0) / (y1 - y0)) * (w - pad.l - pad.r);
  const Y = (days) => pad.t + (1 - (squash(days) + top) / (2 * top)) * (h - pad.t - pad.b);
  return { pad, y0, y1, far, X, Y, yearAt: (px) => y0 + ((px - pad.l) / (w - pad.l - pad.r)) * (y1 - y0) };
}

export function drawRecord(ctx, w, h, { clock, points, dur, jd, nowJd, sc }) {
  const T = tokens();
  const { pad, y0, y1, far, X, Y } = sc;
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // the frame: years along the bottom, early and late up the side
  ctx.strokeStyle = T.line; ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  const step = y1 - y0 > 24 ? 5 : 2;
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    ctx.beginPath(); ctx.moveTo(X(y) + 0.5, pad.t); ctx.lineTo(X(y) + 0.5, h - pad.b); ctx.stroke();
    ctx.fillText(String(y), X(y), h - 8);
  }
  ctx.textAlign = 'right';
  for (const [d, label] of RECORD_TICKS) {
    if (d > far * 1.3) break;
    for (const s of [1, -1]) {
      ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(pad.l, Y(s * d) + 0.5); ctx.lineTo(w - pad.r, Y(s * d) + 0.5); ctx.stroke();
      ctx.fillText((s > 0 ? '+' : '−') + label, pad.l - 6, Y(s * d) + 3);
    }
  }
  ctx.fillText('on time', pad.l - 6, Y(0) + 3);
  ctx.save(); ctx.translate(10, pad.t + (h - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = T.faint;
  ctx.fillText('LATE   ·   EARLY', 0, 0); ctx.restore();
  // the funnel: what this clock allows itself, at one and two sigma
  const years = []; for (let i = 0; i <= 160; i++) years.push(y0 + ((y1 - y0) * i) / 160);
  const sig = (year) => sigmaAt(clock, epochAt(clock, jdOfYear(year)));
  for (const [k, a] of [[2, 0.07], [1, 0.13]]) {
    ctx.fillStyle = alpha(T.horizon, a); ctx.beginPath();
    years.forEach((y, i) => { const x = X(y), yy = Y(k * sig(y)); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); });
    for (let i = years.length - 1; i >= 0; i--) ctx.lineTo(X(years[i]), Y(-k * sig(years[i])));
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = alpha(T.horizon, 0.55); ctx.beginPath();
  for (const s of [1, -1]) years.forEach((y, i) => { const x = X(y), yy = Y(s * sig(y)); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); });
  ctx.stroke();
  // the transit's own length: past it, nobody knows which night
  if (dur) {
    ctx.strokeStyle = alpha(T.bright, 0.5); ctx.setLineDash([5, 4]);
    for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(pad.l, Y(s * dur) + 0.5); ctx.lineTo(w - pad.r, Y(s * dur) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText('THE TRANSIT\'S LENGTH', pad.l + 4, Y(dur) - 4);
    const lostYear = yearOfJd(lostFrom(clock, dur));
    if (lostYear > y0 && lostYear < y1) {
      ctx.strokeStyle = alpha(T.bright, 0.6); ctx.beginPath(); ctx.moveTo(X(lostYear) + 0.5, Y(dur)); ctx.lineTo(X(lostYear) + 0.5, Y(-dur)); ctx.stroke();
      ctx.fillStyle = T.bright; ctx.textAlign = lostYear > (y0 + y1) / 2 ? 'right' : 'left';
      ctx.fillText(`LOST FROM ${Math.floor(lostYear)}`, X(lostYear) + (lostYear > (y0 + y1) / 2 ? -5 : 5), Y(-dur) + 12);
    }
  }
  // today, and the date being shown
  ctx.strokeStyle = alpha(T.text, 0.45); ctx.setLineDash([1, 3]);
  ctx.beginPath(); ctx.moveTo(X(yearOfJd(nowJd)) + 0.5, pad.t); ctx.lineTo(X(yearOfJd(nowJd)) + 0.5, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('TODAY', X(yearOfJd(nowJd)), pad.t + 8);
  const xs = X(yearOfJd(jd));
  ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.moveTo(xs + 0.5, pad.t); ctx.lineTo(xs + 0.5, h - pad.b); ctx.stroke();
  ctx.fillStyle = T.bright; ctx.beginPath(); ctx.moveTo(xs - 4, h - pad.b); ctx.lineTo(xs + 4.5, h - pad.b); ctx.lineTo(xs + 0.5, h - pad.b - 6); ctx.closePath(); ctx.fill();
  // the clock's own epoch, and every other published solution
  ctx.fillStyle = T.bright; ctx.fillRect(X(yearOfJd(clock.t0)) - 2.5, Y(0) - 2.5, 5, 5);
  const hits = [];
  for (const p of points) {
    const x = X(p.year), y = Y(p.residual);
    const held = Math.abs(p.z) < 1 && p.later;
    const c = held ? T.gold : p.later ? T.bright : T.dim;
    ctx.strokeStyle = alpha(c, 0.8); ctx.beginPath(); ctx.moveTo(x + 0.5, Y(p.residual + p.sT)); ctx.lineTo(x + 0.5, Y(p.residual - p.sT)); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 0.5, y, 3.2, 0, TAU);
    if (p.dated) { ctx.fillStyle = c; ctx.fill(); } else { ctx.fillStyle = T.void; ctx.fill(); ctx.strokeStyle = c; ctx.stroke(); }
    hits.push({ x, y, p });
  }
  return hits;
}

/**
 * The other published solutions of a planet against one clock: where each found the transit, relative to
 * what the clock predicts for that orbit. later: its mid-time is ten or more orbits after the clock's epoch.
 */
export function pointsFor(planet, clock) {
  return (planet.sols || []).filter((s) => !(s.t0 === clock.t0 && s.P === clock.P)).map((s) => {
    const n = epochAt(clock, s.t0);
    const residual = s.t0 - midAt(clock, n);
    const sigma = Math.hypot(sigmaAt(clock, n), s.sT);
    return { s, n, year: yearOfJd(s.t0), residual, sT: s.sT, z: residual / sigma, later: n >= 10, dated: s.pub != null };
  });
}
