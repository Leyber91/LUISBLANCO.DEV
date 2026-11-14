/* ============================================================
   overdue/views.js — the drawings of the sheet.

   The sky. Every planet a lamp at its star's place on an
   equal-area map; its brightness the lamp of the best clock
   known on the date shown (sky.js says how). Read lamps are
   gold and add where they crowd; fading ones are pale; a lost
   clock is an ash ring; a planet in front of its star at that
   instant wears an arc, as far round as the transit has got.
   The ecliptic and the plane of the Galaxy are the only
   construction lines. A lens stands over the Kepler field.

   The time band. One axis of years for everything: above, how
   many clocks can be read, are fading and are lost; below, the
   error of the one clock being read, which climbs with every
   orbit and drops the day a better paper appears. Right of
   today nothing is measured, and the line is drawn broken.

   The transit as light. What a telescope pointed at the
   predicted time would record on average: the true dip spread
   by the clock's error. A kept clock shows the transit; a lost
   one shows a flat line.

   The night. With a place: each transit of the next 24 hours as
   the path of its star over the horizon. Without one: a stripe
   of the 24 hours, one tick a transit.

   The tally. Where the later papers found the transit, in
   sigmas of the older clock, one tick a test, against the bell
   that honest errors would give.

   No drawing holds a rule: each asks clock.js, sky.js or
   tonight.js, so the page and its tests cannot disagree.
   ============================================================ */

import { tokens, alpha } from '../views/common.js';
import { fluxAt } from '../science.js';
import { epochAt, midAt, sigmaAt, blindAt, testOf, REAL_TEST_ORBITS, MIN_YEARS_APART, yearOfJd, jdOfYear } from './clock.js';
import { durDays } from './data.js';
import { altAz } from './time.js';
import { WATCH, span } from './tonight.js';
import { hammer, lens, circleOnMap, eclipticToEquatorial, galacticToEquatorial, clockAt, inTransit, smearedDip, KEPLER, FIRST_YEAR, LAST_YEAR } from './sky.js';

const TAU = Math.PI * 2;
const SERIF = 'italic 400 15px Fraunces, Georgia, serif';

/* ---------------- the sky ---------------- */
/* Where the map and the lens sit in a canvas of w by h. Wide: the map low, the lens at its right shoulder.
   Narrow: the map on top and the lens under it. */
export function skyLayout(w, h) {
  if (w >= 760) {
    const rx = Math.min(w / 2 - 24, h - 40), ry = rx / 2, r = Math.min(104, h * 0.185);
    return { wide: true, cx: w / 2, cy: h - ry - 24, rx, ry, lens: { x: w - r - 30, y: r + 34, r } };
  }
  const rx = w / 2 - 4, ry = rx / 2, r = Math.min(118, w * 0.3);
  return { wide: false, cx: w / 2, cy: ry + 6, rx, ry, lens: { x: w - r - 10, y: 2 * ry + 30 + r, r } };
}
export const onMap = (L, m) => ({ x: L.cx + m.x * L.rx, y: L.cy - m.y * L.rx });
export const onLens = (L, q) => ({ x: L.lens.x + q.x * L.lens.r, y: L.lens.y - q.y * L.lens.r });

/* How a lamp is drawn. lamp: null (no clock yet), NaN (no transit length), or the number. */
export function lampMark(lamp) {
  if (lamp === null) return null;
  if (!Number.isFinite(lamp)) return { kind: 'unknown', r: 0.8 };
  if (lamp < 1) return { kind: 'lost', r: 2.3 };
  if (lamp < 3) return { kind: 'fading', r: 1.05 };
  return { kind: 'read', r: 0.9 + 0.3 * Math.log10(Math.min(lamp, 3000) / 3) };
}

const GRATICULE = (() => {
  const parallels = [-60, -30, 0, 30, 60].map((d) => ({ dec: d, pts: Array.from({ length: 121 }, (_, i) => hammer(-180 + i * 3 + 1e-6, d)).sort((a, b) => a.x - b.x) }));
  const meridians = [3, 6, 9, 15, 18, 21].map((hh) => ({ ra: hh * 15, pts: Array.from({ length: 61 }, (_, i) => hammer(hh * 15, -90 + i * 3)) }));
  return { parallels, meridians };
})();
const ECLIPTIC = circleOnMap(eclipticToEquatorial), GALAXY = circleOnMap((l) => galacticToEquatorial(l, 0));

function path(ctx, L, pts) {
  ctx.beginPath();
  pts.forEach((m, i) => { const q = onMap(L, m); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  ctx.stroke();
}

/**
 * The sky on a date. stars: [{ p, hist, m: map point, q: lens point }]. jd: the date shown. marks: lamps to
 * label [{ star, text, dx, dy }]. Returns the pixel place of every lamp drawn, for the pointer: [{ x, y, star, lens }].
 */
export function drawSky(ctx, w, h, { L, stars, jd, selected, hover, marks = [] }) {
  const T = tokens();
  const spots = [];
  ctx.lineWidth = 1; ctx.font = T.fontSm;
  // the map's ground and frame
  ctx.fillStyle = alpha(T.horizon, 0.022);
  ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = alpha(T.lineBright, 0.9); ctx.stroke();
  ctx.strokeStyle = alpha(T.line, 0.75);
  for (const g of GRATICULE.parallels) path(ctx, L, g.pts);
  for (const g of GRATICULE.meridians) path(ctx, L, g.pts);
  ctx.beginPath(); ctx.moveTo(L.cx, L.cy - L.ry); ctx.lineTo(L.cx, L.cy + L.ry); ctx.stroke();
  // the two great circles, and their names where the map is emptiest
  ctx.strokeStyle = alpha(T.horizon, 0.34); for (const run of ECLIPTIC) path(ctx, L, run);
  ctx.strokeStyle = alpha(T.horizon, 0.2); ctx.setLineDash([1, 4]); for (const run of GALAXY) path(ctx, L, run); ctx.setLineDash([]);
  if (L.wide) {
    ctx.fillStyle = T.dim; ctx.textAlign = 'left';
    const ep = eclipticToEquatorial(318), e = onMap(L, hammer(ep.ra, ep.dec)); ctx.fillText('ECLIPTIC', e.x + 4, e.y + 13);
    const gp = galacticToEquatorial(232, 0), g = onMap(L, hammer(gp.ra, gp.dec)); ctx.fillText('PLANE OF THE GALAXY', g.x + 8, g.y + 12);
    ctx.textAlign = 'center';
    for (const [ra, label] of [[0, '0h'], [90, '6h'], [270, '18h']]) { const q = onMap(L, hammer(ra, 0)); ctx.fillText(label, q.x + (ra ? 0 : 12), q.y + 12); }
    for (const d of [-60, -30, 30, 60]) { const q = onMap(L, hammer(0, d)); ctx.fillText(`${d > 0 ? '+' : '−'}${Math.abs(d)}°`, q.x + 16, q.y + 3); }
  }

  // every lamp, on the map and again under the lens: ash first, then the pale, then the gold, which adds
  const lit = [];
  for (const s of stars) {
    const c = clockAt(s.hist, jd);
    if (!c) continue;
    const dur = durDays(s.p);
    const mark = lampMark(dur ? dur / sigmaAt(c, epochAt(c, jd)) : NaN);
    lit.push({ s, c, mark, crossing: mark.kind !== 'lost' && inTransit(c, jd, dur) ? (((jd - c.t0) / c.P) % 1 + 1.5) % 1 : -1 });
  }
  const layer = (kind, place, scale, inLens) => {
    for (const x of lit) {
      if (x.mark.kind !== kind || (inLens && !x.s.q.inside)) continue;
      const q = place(x.s), r = x.mark.r * scale;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU);
      if (kind === 'lost') ctx.stroke(); else ctx.fill();
      spots.push({ x: q.x, y: q.y, star: x.s, lens: inLens });
    }
  };
  const lamps = (place, scale, inLens) => {
    ctx.fillStyle = alpha(T.horizon, 0.4); layer('unknown', place, scale, inLens);
    ctx.fillStyle = alpha(T.goldDim, 0.9); layer('fading', place, scale, inLens);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = alpha(T.gold, inLens ? 0.4 : 0.46); layer('read', place, scale, inLens); ctx.globalCompositeOperation = 'source-over';
    // the lost go on last: an ash ring is the thing to find, and it must not be buried under its neighbours
    ctx.lineWidth = 1; ctx.strokeStyle = alpha(T.text, 0.78); layer('lost', place, scale, inLens);
    // a planet crossing its star at this instant: an arc as far round as the transit has got
    ctx.lineWidth = 1; ctx.strokeStyle = alpha(T.horizon, 0.7);
    for (const x of lit) {
      if (x.crossing < 0 || (inLens && !x.s.q.inside)) continue;
      const dur = durDays(x.s.p), q = place(x.s);
      const done = Math.min(1, Math.max(0.04, (x.crossing - 0.5) * x.c.P / dur + 0.5));
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.4, -Math.PI / 2, -Math.PI / 2 + done * TAU); ctx.stroke();
    }
  };
  ctx.save(); ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); ctx.clip();
  lamps((s) => onMap(L, s.m), Math.max(0.55, Math.min(1, L.rx / 440)), false);      // on a small map the lamps shrink with it, so the sky stays a sky
  ctx.restore();

  // the lens over the Kepler field, and the two lines that tie it to its patch of the map
  const k = onMap(L, hammer(KEPLER.ra, KEPLER.dec)), edge = onMap(L, hammer(KEPLER.ra, KEPLER.dec + KEPLER.radius));
  const kr = Math.hypot(edge.x - k.x, edge.y - k.y), Z = L.lens;
  ctx.strokeStyle = alpha(T.horizon, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(k.x, k.y, kr, 0, TAU); ctx.stroke();
  const ang = Math.atan2(Z.y - k.y, Z.x - k.x);
  ctx.strokeStyle = alpha(T.horizon, 0.3);
  for (const sgn of [1, -1]) {
    const a = ang + sgn * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(k.x + kr * Math.cos(a), k.y + kr * Math.sin(a)); ctx.lineTo(Z.x + Z.r * Math.cos(a), Z.y + Z.r * Math.sin(a)); ctx.stroke();
  }
  ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.fill();
  ctx.fillStyle = alpha(T.horizon, 0.03); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.clip();
  lamps((s) => onLens(L, s.q), 1, true);
  ctx.restore();
  ctx.strokeStyle = alpha(T.horizon, 0.6); ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.font = T.fontSm;
  ctx.fillText(`KEPLER FIELD · ${2 * KEPLER.radius}° ACROSS`, Z.x, Z.y + Z.r + 14);

  // lamps the sheet names, the one under the pointer, and the one being read
  const at = (s) => (s.q.inside && (!L.wide || Math.hypot(onMap(L, s.m).x - k.x, onMap(L, s.m).y - k.y) < kr) ? onLens(L, s.q) : onMap(L, s.m));
  ctx.textAlign = 'left';
  for (const mk of marks) {
    if (!mk.star || !clockAt(mk.star.hist, jd)) continue;
    const q = at(mk.star), tx = q.x + mk.dx, ty = q.y + mk.dy;
    ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath(); ctx.moveTo(q.x + Math.sign(mk.dx) * 4, q.y + Math.sign(mk.dy) * 4); ctx.lineTo(tx, ty); ctx.stroke();
    mk.x = tx; mk.y = ty;                                       // the page puts a real button here
  }
  if (hover && hover !== selected && clockAt(hover.hist, jd)) { const q = at(hover); ctx.strokeStyle = alpha(T.bright, 0.7); ctx.beginPath(); ctx.arc(q.x, q.y, 6.5, 0, TAU); ctx.stroke(); }
  if (selected) {
    const q = at(selected);
    ctx.strokeStyle = T.bright; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(q.x + 7 * Math.cos(a), q.y + 7 * Math.sin(a)); ctx.lineTo(q.x + 14 * Math.cos(a), q.y + 14 * Math.sin(a)); ctx.stroke(); }
    if (!marks.some((mk) => mk.star === selected && L.wide)) {
      ctx.font = SERIF; ctx.fillStyle = T.bright; ctx.textAlign = q.x > w - 170 ? 'right' : 'left';
      ctx.fillText(selected.p.name, q.x + (q.x > w - 170 ? -18 : 18), q.y - 10);
    }
  }
  return spots;
}

/* ---------------- the time band ---------------- */
const DAY = 86400;
const ERR_TICKS = [[1 / DAY, '1 s'], [60 / DAY, '1 min'], [3600 / DAY, '1 h'], [1, '1 d']];

export function bandScale(w, h) {
  const pad = { l: 46, r: 58, t: 22, b: 20 }, censusH = Math.max(38, Math.min(56, h * 0.25)), gap = 18;
  const X = (year) => pad.l + ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * (w - pad.l - pad.r);
  return { pad, censusH, top: pad.t + censusH + gap, X, yearAt: (px) => FIRST_YEAR + ((px - pad.l) / (w - pad.l - pad.r)) * (LAST_YEAR - FIRST_YEAR) };
}

/**
 * census: sky.js census(). line: sky.js errorLine() of the planet being read, hist its history, dur its transit
 * length in days (or null). jd: the date shown. label(s): a solution's paper, in words. Returns the takeovers
 * drawn, for the pointer: [{ x, y, s }].
 */
export function drawBand(ctx, w, h, { sc, census, line, hist, dur, jd, nowJd, label }) {
  const T = tokens();
  const { pad, censusH, top, X } = sc, bottom = h - pad.b, yearNow = yearOfJd(nowJd), year = yearOfJd(jd);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // years
  ctx.strokeStyle = alpha(T.line, 0.9); ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  for (let y = 2000; y <= LAST_YEAR; y += 5) { ctx.beginPath(); ctx.moveTo(X(y) + 0.5, pad.t); ctx.lineTo(X(y) + 0.5, bottom); ctx.stroke(); ctx.fillText(String(y), X(y), h - 6); }
  // what has not been measured yet
  ctx.fillStyle = alpha(T.void, 0.55); ctx.fillRect(X(yearNow), pad.t, w - pad.r - X(yearNow), bottom - pad.t);
  ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath(); ctx.moveTo(X(yearNow) + 0.5, pad.t - 4); ctx.lineTo(X(yearNow) + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText('IF NOBODY LOOKS AGAIN', X(yearNow) + 6, pad.t + 8);
  ctx.textAlign = 'right'; ctx.fillText('MEASURED', X(yearNow) - 6, pad.t + 8);

  // the catalogue: how many clocks can be read, are fading, are lost
  if (census) {
    const max = Math.max(1, ...census.years.map((_, i) => census.read[i] + census.fading[i] + census.lost[i]));
    const Y = (v) => pad.t + censusH - (v / max) * (censusH - 12);
    const run = (vals, colour, width) => {
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.beginPath();
      census.years.forEach((y, i) => { if (i) ctx.lineTo(X(y), Y(vals[i])); else ctx.moveTo(X(y), Y(vals[i])); });
      ctx.stroke();
    };
    ctx.fillStyle = alpha(T.gold, 0.08); ctx.beginPath(); ctx.moveTo(X(FIRST_YEAR), Y(0));
    census.years.forEach((y, i) => ctx.lineTo(X(y), Y(census.read[i]))); ctx.lineTo(X(LAST_YEAR), Y(0)); ctx.closePath(); ctx.fill();
    run(census.lost, alpha(T.dim, 0.95), 2); run(census.fading, alpha(T.goldDim, 0.9), 1.25); run(census.read, T.gold, 2);
    ctx.lineWidth = 1;
    const last = census.years.length - 1, ends = [['read', census.read[last], T.text], ['lost', census.lost[last], T.dim]];
    ctx.textAlign = 'left';
    for (const [name, v, colour] of ends) { ctx.fillStyle = colour; ctx.fillText(name, w - pad.r + 6, Y(v) + 3); }
  }

  // the one clock: the error of the best clock known, year by year
  const hits = [];
  if (line && line.length) {
    const lo = Math.log10(0.5 / DAY), hi = Math.log10(Math.max(3, dur ? dur * 4 : 0, ...line.map((p) => p.sigma * 1.4)));
    const Y = (days) => bottom - ((Math.log10(Math.max(days, 0.5 / DAY)) - lo) / (hi - lo)) * (bottom - top);
    ctx.textAlign = 'right'; ctx.fillStyle = T.dim;
    for (const [d, text] of ERR_TICKS) {
      if (Math.log10(d) > hi) continue;
      ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(pad.l, Y(d) + 0.5); ctx.lineTo(w - pad.r, Y(d) + 0.5); ctx.stroke();
      ctx.fillText(text, pad.l - 6, Y(d) + 3);
    }
    if (dur) {
      // above the transit's own length the clock is lost
      ctx.fillStyle = alpha(T.dim, 0.07); ctx.fillRect(pad.l, top, w - pad.l - pad.r, Math.max(0, Y(dur) - top));
      ctx.strokeStyle = alpha(T.bright, 0.55); ctx.beginPath(); ctx.moveTo(pad.l, Y(dur) + 0.5); ctx.lineTo(w - pad.r, Y(dur) + 0.5); ctx.stroke();
      ctx.fillStyle = T.text; ctx.textAlign = 'left'; ctx.fillText('transit', w - pad.r + 6, Y(dur) + 3);
      if (Y(dur) - top > 14) { ctx.fillStyle = T.dim; ctx.fillText('lost', w - pad.r + 6, Y(dur) - 9); }
    }
    const ink = (sigma) => (!dur ? T.horizon : sigma > dur ? alpha(T.dim, 0.95) : sigma > dur / 3 ? T.goldDim : T.gold);
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], drop = a.s !== b.s, ahead = b.year > yearNow + 1e-6;
      ctx.strokeStyle = drop ? alpha(T.text, 0.35) : ink(b.sigma); ctx.lineWidth = drop ? 1 : 2;
      ctx.setLineDash(ahead && !drop ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(X(a.year), Y(a.sigma)); ctx.lineTo(X(b.year), Y(b.sigma)); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
    // the day each paper took over: a dot with a ring of the ground, and a name on the first and the last
    hist.forEach((hh, i) => {
      const y0 = Math.max(FIRST_YEAR, yearOfJd(hh.from));
      if (y0 > LAST_YEAR) return;
      const x = X(y0), y = Y(sigmaAt(hh.s, epochAt(hh.s, Math.max(hh.from, jdOfYear(FIRST_YEAR)))));
      ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      hits.push({ x, y, s: hh.s });
      if (i === 0 || i === hist.length - 1) {
        const right = x > w - pad.r - 150;
        ctx.fillStyle = T.text; ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(label(hh.s), x + (right ? -9 : 9), i === 0 && hist.length > 1 ? Math.max(top + 9, y - 9) : Math.min(bottom - 4, y + 14));
      }
    });
  }

  // the date shown
  const x = X(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year)));
  ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t - 6); ctx.lineTo(x + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.bright; ctx.beginPath(); ctx.moveTo(x - 4, pad.t - 10); ctx.lineTo(x + 5, pad.t - 10); ctx.lineTo(x + 0.5, pad.t - 4); ctx.closePath(); ctx.fill();
  return hits;
}

/* ---------------- one transit as light ---------------- */
/* The share of the star's light a planet hides, by hours from the middle of its transit: limb-darkened, central
   crossing, from the transit's depth and length (science.js fluxAt). Sampled once and read by interpolation. */
export function dipShape(depth, durH) {
  const k = Math.sqrt(Math.max(1e-6, depth)), N = 40, half = durH / 2;
  const raw = Array.from({ length: N + 1 }, (_, i) => 1 - fluxAt(((i / N) * (1 + k)), k));
  const samples = raw.map((v) => (v * depth) / raw[0]);       // the archive's depth is the deepest point as measured, so the shape is held to it
  return (t) => { const u = (Math.abs(t) / half) * N; if (u >= N) return 0; const i = Math.floor(u); return samples[i] + (samples[i + 1] - samples[i]) * (u - i); };
}

/** planet, clock (the one in use on the date), jd. Returns { expected, depth } for the words beside it. */
export function drawCurve(ctx, w, h, { planet, clock, jd }) {
  const T = tokens();
  const durH = planet.durH, depth = Number.isFinite(planet.depthPct) && planet.depthPct > 0 ? planet.depthPct / 100
    : (planet.rEarth && planet.stRad ? ((planet.rEarth * 6371) / (planet.stRad * 695700)) ** 2 : 0.01);
  const pad = { l: 8, r: 8, t: 14, b: 30 };
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  if (!clock || !Number.isFinite(durH) || durH <= 0) {
    ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText(clock ? 'THE ARCHIVE GIVES NO TRANSIT LENGTH' : 'NO CLOCK PUBLISHED YET', w / 2, h / 2);
    return { expected: NaN, depth };
  }
  const sigmaH = sigmaAt(clock, epochAt(clock, jd)) * 24, periodH = clock.P * 24;
  const reach = Math.min(periodH / 2, Math.max(durH * 1.15, sigmaH * 3.2));
  const n = 161, ts = Array.from({ length: n }, (_, i) => -reach + (2 * reach * i) / (n - 1));
  const shape = dipShape(depth, durH), smear = smearedDip(shape, durH, sigmaH, periodH, ts);
  const floor = Math.max(depth * 1.18, 1e-6);
  const X = (t) => pad.l + ((t + reach) / (2 * reach)) * (w - pad.l - pad.r);
  const Y = (def) => pad.t + (def / floor) * (h - pad.t - pad.b);
  const lamp = durH / sigmaH, ink = lamp < 1 ? alpha(T.dim, 0.95) : lamp < 3 ? T.goldDim : T.gold;
  // the star's own light
  ctx.strokeStyle = alpha(T.line, 0.95); ctx.beginPath(); ctx.moveTo(pad.l, Y(0) + 0.5); ctx.lineTo(w - pad.r, Y(0) + 0.5); ctx.stroke();
  // the transit as it is
  ctx.strokeStyle = alpha(T.text, 0.42); ctx.beginPath();
  ts.forEach((t, i) => { const y = Y(shape(t)); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }); ctx.stroke();
  // the transit as this clock lets it be seen
  ctx.fillStyle = alpha(lamp < 1 ? T.dim : T.gold, 0.1); ctx.beginPath(); ctx.moveTo(X(-reach), Y(0));
  ts.forEach((t, i) => ctx.lineTo(X(t), Y(smear[i]))); ctx.lineTo(X(reach), Y(0)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
  ts.forEach((t, i) => { const y = Y(smear[i]); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }); ctx.stroke(); ctx.lineWidth = 1;
  // one sigma either side of the predicted middle
  const yb = h - pad.b + 8, a = Math.max(-reach, -sigmaH), b = Math.min(reach, sigmaH);
  ctx.strokeStyle = alpha(T.text, 0.8); ctx.beginPath();
  ctx.moveTo(X(a), yb - 3); ctx.lineTo(X(a), yb + 3); ctx.moveTo(X(a), yb); ctx.lineTo(X(b), yb); ctx.moveTo(X(b), yb - 3); ctx.lineTo(X(b), yb + 3); ctx.stroke();
  ctx.fillStyle = T.text; ctx.textAlign = 'center';
  ctx.fillText(`± ${span(sigmaH * 3600)}${sigmaH > reach ? ', wider than this drawing' : ''}`, w / 2, yb + 15);
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(`−${span(reach * 3600)}`, pad.l, yb + 15);
  ctx.textAlign = 'right'; ctx.fillText(`+${span(reach * 3600)}`, w - pad.r, yb + 15);
  return { expected: Math.max(...smear), depth };
}

/* ---------------- the night ---------------- */
/**
 * rows: tonight.js crossings(). place or null. fromJd: now. night: [[jdFrom, jdTo]] where the Sun is 12 degrees
 * down or more at the place. clock(jd): the hour of a Julian date on the visitor's clock, as words.
 * Returns what the pointer can reach: [{ x, y, row }].
 */
export function drawNight(ctx, w, h, { rows, place, fromJd, night, clock }) {
  const T = tokens();
  const pad = { l: place ? 34 : 8, r: 10, t: 12, b: 20 };
  const X = (jd) => pad.l + (jd - fromJd) * (w - pad.l - pad.r);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  const hits = [];
  // the hours
  ctx.textAlign = 'center';
  for (let t = Math.ceil((fromJd + 0.5) * 8) / 8 - 0.5; t <= fromJd + 1; t += 1 / 8) {          // every three hours of UTC, named on the visitor's clock
    ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(X(t) + 0.5, pad.t); ctx.lineTo(X(t) + 0.5, h - pad.b); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(clock(t), X(t), h - 6);
  }
  if (!place) {
    // no place: the 24 hours as a stripe, one tick a transit, as tall as its clock is kept
    const base = h - pad.b, tall = base - pad.t;
    for (const r of rows) {
      const k = r.state === 'read' ? 1 : r.state === 'fading' ? 0.55 : 0.28;
      // thin and faint, so that where transits crowd the stripe darkens by their number and not into a block
      ctx.strokeStyle = r.state === 'read' ? alpha(T.gold, 0.3) : r.state === 'fading' ? alpha(T.goldDim, 0.55) : alpha(T.text, 0.5);
      ctx.beginPath(); ctx.moveTo(X(r.mid) + 0.5, base); ctx.lineTo(X(r.mid) + 0.5, base - tall * k); ctx.stroke();
    }
    return hits;
  }
  const Y = (alt) => h - pad.b - (Math.max(0, alt) / 90) * (h - pad.t - pad.b);
  // the night at this place, and the height a star must keep
  ctx.fillStyle = alpha(T.horizon, 0.07);
  for (const [a, b] of night) ctx.fillRect(X(a), pad.t, X(b) - X(a), h - pad.t - pad.b);
  ctx.fillStyle = T.dim; ctx.textAlign = 'left';
  for (const [a] of night) ctx.fillText('NIGHT', X(a) + 5, pad.t + 9);
  ctx.textAlign = 'right';
  for (const alt of [0, WATCH.minAlt, 60, 90]) {
    ctx.strokeStyle = alt === WATCH.minAlt ? alpha(T.bright, 0.45) : alpha(T.line, 0.9);
    ctx.beginPath(); ctx.moveTo(pad.l, Y(alt) + 0.5); ctx.lineTo(w - pad.r, Y(alt) + 0.5); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(`${alt}°`, pad.l - 6, Y(alt) + 3);
  }
  // each transit as the path of its star from its beginning to its end
  const trace = (r, colour, width) => {
    const dur = durDays(r.planet); if (!dur) return;
    const a = r.mid - dur / 2, b = r.mid + dur / 2, n = Math.max(3, Math.ceil((b - a) * 48));
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n, alt = altAz(t, r.planet.ra, r.planet.dec, place.lat, place.lon).alt;
      if (alt < 0 || t < fromJd || t > fromJd + 1) { pen = false; continue; }
      if (pen) ctx.lineTo(X(t), Y(alt)); else ctx.moveTo(X(t), Y(alt));
      pen = true;
    }
    ctx.stroke(); ctx.lineWidth = 1;
  };
  for (const r of rows) if (!r.watchable && r.altMax > 0 && r.state !== 'lost') trace(r, alpha(T.horizon, 0.16), 1);
  const named = rows.filter((r) => r.watchable).sort((a, b) => (a.planet.vmag ?? 99) - (b.planet.vmag ?? 99)).slice(0, 5);
  for (const r of rows) {
    if (!r.watchable) continue;
    trace(r, T.gold, 2);
    const alt = altAz(r.mid, r.planet.ra, r.planet.dec, place.lat, place.lon).alt;
    hits.push({ x: X(r.mid), y: Y(alt), row: r });
    if (named.includes(r)) { ctx.fillStyle = T.text; ctx.textAlign = X(r.mid) > w - 120 ? 'right' : 'left'; ctx.fillText(r.planet.name, X(r.mid) + (X(r.mid) > w - 120 ? -6 : 6), Y(alt) - 7); }
  }
  return hits;
}

/* ---------------- the tally ---------------- */
/** zs: the miss of every real test, in sigmas of the older clock (later than predicted is positive). */
export function drawTally(ctx, w, h, { zs }) {
  const T = tokens();
  const pad = { l: 10, r: 10, t: 16, b: 34 }, EDGE = 6, BIN = 0.5;
  const X = (z) => pad.l + ((Math.max(-EDGE - BIN, Math.min(EDGE + BIN, z)) + EDGE + BIN) / (2 * (EDGE + BIN))) * (w - pad.l - pad.r);
  const bins = new Array(Math.round((2 * (EDGE + BIN)) / BIN)).fill(0);
  for (const z of zs) bins[Math.max(0, Math.min(bins.length - 1, Math.floor((Math.max(-EDGE - BIN, Math.min(EDGE + BIN - 1e-9, z)) + EDGE + BIN) / BIN)))]++;
  const bell = (z) => zs.length * BIN * Math.exp(-0.5 * z * z) / Math.sqrt(TAU);
  const top = Math.max(1, ...bins, bell(0)), base = h - pad.b;
  const Y = (n) => base - (n / top) * (base - pad.t);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // one sigma either side: where honest errors would put two tests in three
  ctx.fillStyle = alpha(T.gold, 0.05); ctx.fillRect(X(-1), pad.t, X(1) - X(-1), base - pad.t);
  // the tests, in half-sigma steps
  const bw = Math.min(24, X(BIN) - X(0) - 2);
  bins.forEach((n, i) => {
    if (!n) return;
    const z0 = -EDGE - BIN + i * BIN, mid = (X(z0) + X(z0 + BIN)) / 2, inside = z0 >= -1 && z0 < 1;
    ctx.fillStyle = inside ? alpha(T.gold, 0.9) : alpha(T.horizon, 0.75);
    const y = Y(n), r = Math.min(3, (base - y) / 2);
    ctx.beginPath(); ctx.moveTo(mid - bw / 2, base); ctx.lineTo(mid - bw / 2, y + r); ctx.quadraticCurveTo(mid - bw / 2, y, mid - bw / 2 + r, y);
    ctx.lineTo(mid + bw / 2 - r, y); ctx.quadraticCurveTo(mid + bw / 2, y, mid + bw / 2, y + r); ctx.lineTo(mid + bw / 2, base); ctx.closePath(); ctx.fill();
  });
  // what honest errors would give
  ctx.strokeStyle = alpha(T.bright, 0.7); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const z = -EDGE + (2 * EDGE * i) / 120; if (i) ctx.lineTo(X(z), Y(bell(z))); else ctx.moveTo(X(z), Y(bell(z))); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = T.text; ctx.textAlign = 'left'; ctx.fillText('HONEST ERRORS', X(0.9) + 8, Y(bell(0.9)) - 6);
  // one tick a test
  for (const z of zs) { ctx.strokeStyle = Math.abs(z) < 1 ? alpha(T.gold, 0.7) : alpha(T.horizon, 0.55); ctx.beginPath(); ctx.moveTo(X(z) + 0.5, base + 3); ctx.lineTo(X(z) + 0.5, base + 9); ctx.stroke(); }
  ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, base + 0.5); ctx.lineTo(w - pad.r, base + 0.5); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  for (const z of [-6, -3, -1, 0, 1, 3, 6]) ctx.fillText(z === 0 ? 'on time' : `${z > 0 ? '+' : '−'}${Math.abs(z)}σ`, X(z), h - 8);
  ctx.textAlign = 'left'; ctx.fillText('FOUND EARLIER', pad.l, pad.t + 2); ctx.textAlign = 'right'; ctx.fillText('FOUND LATER', w - pad.r, pad.t + 2);
}

/* ---------------- the other solutions of a planet, for the list ---------------- */
/* Why a solution is no test of a clock, in words; '' when it is one. The order is the order of clock.js testOf. */
export function notATest(clock, s) {
  if (clock.pub == null) return 'this clock has no publication date';
  if (s.pub == null) return 'it has no publication date';
  if (clock.ref == null || s.ref == null || s.ref === clock.ref) return 'it is from the same paper';
  if (s.pub < clock.pub) return 'it was published before this clock';
  if (s.pub - clock.pub < MIN_YEARS_APART) return 'it was published less than two years after this clock';
  if (epochAt(clock, s.t0) < REAL_TEST_ORBITS) return 'its mid-time is fewer than ten orbits on';
  if (yearOfJd(s.t0) <= clock.pub) return 'its mid-time is from before this clock was published';
  return '';
}

/**
 * The other published solutions of a planet against one clock: where each found the transit, relative to
 * what the clock predicts for that orbit. test: it tests the clock, by the one definition the tally uses
 * (clock.js testOf). why: when it does not, the reason. blind: by that orbit the combined uncertainty had
 * reached a sixth of the period, so even a test shows nothing.
 */
export function pointsFor(planet, clock) {
  return (planet.sols || []).filter((s) => !(s.t0 === clock.t0 && s.P === clock.P)).map((s) => {
    const n = epochAt(clock, s.t0);
    const residual = s.t0 - midAt(clock, n);
    const sigma = Math.hypot(sigmaAt(clock, n), s.sT);
    const test = testOf(clock, s) !== null;
    return { s, n, year: yearOfJd(s.t0), residual, sT: s.sT, z: residual / sigma, test, why: test ? '' : notATest(clock, s), blind: blindAt(clock, sigma) };
  });
}
