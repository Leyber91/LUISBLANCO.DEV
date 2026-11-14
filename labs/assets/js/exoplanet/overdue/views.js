/* ============================================================
   overdue/views.js — the drawings of the sheet.

   One warm colour and two cold ones (sky.js says why). The sky
   is a deep blue. A clock that is kept is gold, and the better it
   is kept the brighter; a clock that is slipping is an ice-blue
   point; a clock that is lost is an ice-blue ring. Gold never
   fills an area and never marks anything but a kept clock, a
   transit chosen to be named, or a paper that landed inside.

   The sky. Every planet a lamp at its star's place on an
   equal-area map, in the state of the best clock known on the
   date shown. On today's sky a planet in front of its star wears
   an arc, as far round as the transit has got. The ecliptic and
   the plane of the Galaxy are the only construction lines. A
   lens stands over the Kepler field.

   The line of time. One axis of years, and the sheet's only
   control. Above, how many clocks are lost, from zero. Below, the
   error of the one clock being read, which climbs with every
   orbit and drops the day a better paper appears, against the
   two lengths that decide its state. Right of today nothing is
   measured, and the lines are drawn broken.

   The transit as light. What a telescope pointed at the
   predicted time would record on average: the true dip spread by
   the clock's error.

   Where the papers found it. Each published clock's mid-time
   against the clock in use, in time early or late: the chart the
   people who keep these clocks draw.

   The night. Each transit of the next 24 hours that is up in the
   dark, as the path of its star over the horizon.

   The tally. One dot a planet: where a later paper found the
   transit, in sigmas of the older clock, against the bell that
   honest errors would give.

   No drawing holds a rule: each asks clock.js, sky.js or
   tonight.js, so the page and its tests cannot disagree.
   ============================================================ */

import { tokens, alpha } from '../views/common.js';
import { fluxAt } from '../science.js';
import { epochAt, midAt, sigmaAt, blindAt, testOf, stateOf, KEPT_LAMP, REAL_TEST_ORBITS, MIN_YEARS_APART, yearOfJd, jdOfYear } from './clock.js';
import { durDays } from './data.js';
import { altAz } from './time.js';
import { WATCH, span } from './tonight.js';
import { hammer, circleOnMap, eclipticToEquatorial, galacticToEquatorial, clockAt, inTransit, smearedDip, KEPLER, FIRST_YEAR, LAST_YEAR } from './sky.js';

const TAU = Math.PI * 2;
const NAME = '400 15px Fraunces, Georgia, serif';                       // upright: in the italic a planet's letter b reads as a 6
const STAMP = '500 12px "IBM Plex Mono", ui-monospace, Consolas, monospace';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* ---------------- the sky ---------------- */
/* Where the map and the lens sit in a canvas of w by h. Wide: the map low, the lens at its right shoulder, and
   from BESIDE up the map leaves the sheet's upper left to the name and the count (overdue.css puts them above
   the map below that width). Narrow: the map on top and a smaller lens under its right half, so the key can
   stand beside it. */
export const BESIDE = 1150, TITLE_ROOM = 205;
export function skyLayout(w, h) {
  if (w >= 760) {
    const rx = Math.min(w / 2 - 24, h - 46, w >= BESIDE ? w / 2 - TITLE_ROOM : Infinity), ry = rx / 2, r = Math.min(104, h * 0.185);
    return { wide: true, cx: w / 2, cy: h - ry - 30, rx, ry, lens: { x: w - r - 30, y: r + 34, r } };
  }
  const rx = w / 2 - 2, ry = rx / 2, r = Math.min(74, w * 0.2);
  return { wide: false, cx: w / 2, cy: ry + 4, rx, ry, lens: { x: w - r - 4, y: 2 * ry + 18 + r, r } };
}
export const onMap = (L, m) => ({ x: L.cx + m.x * L.rx, y: L.cy - m.y * L.rx });
export const onLens = (L, q) => ({ x: L.lens.x + q.x * L.lens.r, y: L.lens.y - q.y * L.lens.r });

/* The steps of brightness a kept clock is drawn in: lamps of one step are one path, so 4,700 lamps are a few fills. */
const STEPS = 6;
const keptAlpha = (step) => 0.62 + 0.38 * (step / (STEPS - 1));
/**
 * How a lamp is drawn. lamp: null (no clock yet), NaN (no transit length), or the number. The bounds are
 * clock.js stateOf's. A kept lamp grows and brightens with the logarithm of its lamp, from the target (12) to a
 * thousand times it: kind, radius in pixels, opacity, and the step of brightness.
 */
export function lampMark(lamp) {
  if (lamp === null) return null;
  const kind = stateOf(lamp);
  if (kind === 'no transit length') return { kind, r: 0, a: 0, step: 0 };
  if (kind === 'lost') return { kind, r: 2.2, a: 0.55, step: 0 };
  if (kind === 'slipping') return { kind, r: 0.95, a: 0.72, step: 0 };
  const step = Math.min(STEPS - 1, Math.floor((Math.log10(lamp / KEPT_LAMP) / 3) * STEPS));
  return { kind, r: 1.25 + 0.95 * (step / (STEPS - 1)), a: keptAlpha(step), step };
}

const SLIPPING = lampMark(2), LOST = lampMark(0.5);
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
 * The sky on a date. stars: [{ p, hist, m: map point, q: lens point }]. jd: the date shown. live: the date
 * shown is this instant, so planets in front of their stars are marked. note: { ra, dec, lines: [text] } a
 * label with a leader to one place on the map, drawn where the page is wide enough to hold it (note.drawn says
 * whether it was). Returns the pixel place of every lamp drawn, for the pointer: [{ x, y, star, lens }].
 */
export function drawSky(ctx, w, h, { L, stars, jd, selected, hover, live = false, note = null }) {
  const T = tokens();
  const spots = [];
  ctx.lineWidth = 1; ctx.font = T.fontSm;
  // the sky: the one large coloured field of the sheet
  ctx.fillStyle = T.sky;
  ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = alpha(T.ice, 0.1);
  for (const g of GRATICULE.parallels) path(ctx, L, g.pts);
  for (const g of GRATICULE.meridians) path(ctx, L, g.pts);
  ctx.beginPath(); ctx.moveTo(L.cx, L.cy - L.ry); ctx.lineTo(L.cx, L.cy + L.ry); ctx.stroke();
  // the two great circles, and their names where the map is emptiest
  ctx.strokeStyle = alpha(T.ice, 0.4); for (const run of ECLIPTIC) path(ctx, L, run);
  ctx.strokeStyle = alpha(T.ice, 0.2); for (const run of GALAXY) path(ctx, L, run);
  ctx.strokeStyle = alpha(T.ice, 0.34); ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); ctx.stroke();
  if (L.wide) {
    ctx.fillStyle = alpha(T.text, 0.72); ctx.textAlign = 'left';
    const ep = eclipticToEquatorial(318), e = onMap(L, hammer(ep.ra, ep.dec)); ctx.fillText('ECLIPTIC', e.x + 4, e.y + 13);
    const gp = galacticToEquatorial(232, 0), g = onMap(L, hammer(gp.ra, gp.dec)); ctx.fillText('PLANE OF THE GALAXY', g.x + 8, g.y + 12);
    ctx.textAlign = 'center';
    for (const [ra, label] of [[0, '0h'], [90, '6h'], [270, '18h']]) { const q = onMap(L, hammer(ra, 0)); ctx.fillText(label, q.x + (ra ? 0 : 12), q.y + 12); }
  }

  // every lamp, on the map and again under the lens
  const lit = [];
  for (const s of stars) {
    const c = clockAt(s.hist, jd);
    if (!c) continue;
    const dur = durDays(s.p);
    const mark = lampMark(dur ? dur / sigmaAt(c, epochAt(c, jd)) : NaN);
    if (!mark.r) continue;                                              // no transit length: no lamp to draw, and the count leaves it out too
    lit.push({ s, c, dur, mark });
  }
  const dots = (pick, place, scale, inLens, stroke, grow = 1) => {
    ctx.beginPath();
    for (const x of lit) {
      if (!pick(x.mark) || (inLens && !x.s.q.inside)) continue;
      const q = place(x.s), r = Math.max(stroke ? 1.6 : 0, x.mark.r * scale * grow);
      ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, TAU);
    }
    if (stroke) ctx.stroke(); else ctx.fill();
  };
  const lamps = (place, scale, inLens) => {
    for (const x of lit) { if (inLens && !x.s.q.inside) continue; const q = place(x.s); spots.push({ x: q.x, y: q.y, star: x.s, lens: inLens }); }
    // cold first, then gold over it. Nothing adds: where lamps crowd the field goes gold, never white.
    ctx.fillStyle = alpha(T.ice, SLIPPING.a); dots((m) => m.kind === 'slipping', place, scale, inLens, false);
    ctx.fillStyle = alpha(T.gold, 0.1); dots((m) => m.kind === 'kept', place, scale, inLens, false, 2.6);
    for (let step = 0; step < STEPS; step++) {
      ctx.fillStyle = alpha(step >= STEPS - 2 ? T.goldSoft : T.gold, keptAlpha(step));
      dots((m) => m.kind === 'kept' && m.step === step, place, scale, inLens, false);
    }
    // a lost clock is a hairline ring: found by its shape, and quieter than any kept lamp
    ctx.lineWidth = 0.9; ctx.strokeStyle = alpha(T.ice, LOST.a); dots((m) => m.kind === 'lost', place, scale, inLens, true); ctx.lineWidth = 1;
    if (!live) return;
    // a planet crossing its star at this instant: an arc as far round as the transit has got
    ctx.strokeStyle = alpha(T.bright, 0.8);
    for (const x of lit) {
      if (x.mark.kind === 'lost' || (inLens && !x.s.q.inside) || !inTransit(x.c, jd, x.dur)) continue;
      const q = place(x.s), turn = (((jd - x.c.t0) / x.c.P) % 1 + 1.5) % 1;
      const done = Math.min(1, Math.max(0.04, (turn - 0.5) * x.c.P / x.dur + 0.5));
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.6, -Math.PI / 2, -Math.PI / 2 + done * TAU); ctx.stroke();
    }
  };
  ctx.save(); ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); ctx.clip();
  lamps((s) => onMap(L, s.m), Math.max(0.45, Math.min(1, L.rx / 460)), false);
  ctx.restore();

  // one label for the survey whose clocks are lost: a leader from its densest field to words outside the map
  if (note) {
    note.drawn = false;
    const q = onMap(L, hammer(note.ra, note.dec)), wide = Math.max(...note.lines.map((t) => ctx.measureText(t).width));
    const ex = q.x - 44, ey = q.y + 40;
    if (L.wide && ex - 6 - wide > 2) {
      ctx.strokeStyle = alpha(T.text, 0.55); ctx.beginPath(); ctx.moveTo(q.x - 9, q.y + 8); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = T.text; ctx.textAlign = 'right';
      note.lines.forEach((t, i) => ctx.fillText(t, ex - 6, ey + 3 + i * 12));
      note.drawn = true;
    }
  }

  // the lens over the Kepler field, and the two lines that tie it to its patch of the map
  const k = onMap(L, hammer(KEPLER.ra, KEPLER.dec)), edge = onMap(L, hammer(KEPLER.ra, KEPLER.dec + KEPLER.radius));
  const kr = Math.hypot(edge.x - k.x, edge.y - k.y), Z = L.lens;
  ctx.strokeStyle = alpha(T.ice, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(k.x, k.y, kr, 0, TAU); ctx.stroke();
  const ang = Math.atan2(Z.y - k.y, Z.x - k.x);
  ctx.strokeStyle = alpha(T.ice, 0.28);
  for (const sgn of [1, -1]) {
    const a = ang + sgn * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(k.x + kr * Math.cos(a), k.y + kr * Math.sin(a)); ctx.lineTo(Z.x + Z.r * Math.cos(a), Z.y + Z.r * Math.sin(a)); ctx.stroke();
  }
  ctx.fillStyle = T.sky; ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.clip();
  lamps((s) => onLens(L, s.q), Math.max(0.55, Math.min(1, Z.r / 100)), true);
  ctx.restore();
  ctx.strokeStyle = alpha(T.ice, 0.55); ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.font = T.fontSm;
  ctx.fillText(`KEPLER FIELD · ${2 * KEPLER.radius}° ACROSS`, Z.x, L.wide ? Z.y - Z.r - 8 : Z.y + Z.r + 14);

  // the lamp under the pointer, and the one being read: the only name on the map
  const at = (s) => (s.q.inside && (!L.wide || Math.hypot(onMap(L, s.m).x - k.x, onMap(L, s.m).y - k.y) < kr) ? onLens(L, s.q) : onMap(L, s.m));
  if (hover && hover !== selected && clockAt(hover.hist, jd)) { const q = at(hover); ctx.strokeStyle = alpha(T.bright, 0.7); ctx.beginPath(); ctx.arc(q.x, q.y, 6.5, 0, TAU); ctx.stroke(); }
  if (selected) {
    const q = at(selected);
    ctx.strokeStyle = T.bright; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(q.x + 7 * Math.cos(a), q.y + 7 * Math.sin(a)); ctx.lineTo(q.x + 14 * Math.cos(a), q.y + 14 * Math.sin(a)); ctx.stroke(); }
    const left = q.x > w - 170;
    ctx.font = NAME; ctx.fillStyle = T.bright; ctx.textAlign = left ? 'right' : 'left';
    ctx.fillText(selected.p.name, q.x + (left ? -18 : 18), q.y - 10);
  }
  return spots;
}

/* ---------------- the line of time ---------------- */
const DAY = 86400;
const ERR_TICKS = [[1 / DAY, '1 s'], [60 / DAY, '1 min'], [3600 / DAY, '1 h'], [1, '1 d']];

export function bandScale(w, h) {
  const narrow = w < 620;
  const pad = { l: narrow ? 36 : 46, r: narrow ? 16 : 104, t: 30, b: 20 }, lostH = Math.max(38, Math.min(54, h * 0.24)), gap = 30;
  const X = (year) => pad.l + ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * (w - pad.l - pad.r);
  return { narrow, pad, lostH, top: pad.t + lostH + gap, X, yearAt: (px) => FIRST_YEAR + ((px - pad.l) / (w - pad.l - pad.r)) * (LAST_YEAR - FIRST_YEAR) };
}
/* A date as the stamp on the line: 14 NOV 2026. */
export const stampOf = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/**
 * census: sky.js census(). line: sky.js errorLine() of the planet being read, hist its history, dur its transit
 * length in days (or null), name its name. jd: the date shown, stamp its words. label(s): a solution's paper, in
 * words. Returns the takeovers drawn, for the pointer: [{ x, y, s }].
 */
export function drawBand(ctx, w, h, { sc, census, line, hist, dur, name, jd, nowJd, stamp, label }) {
  const T = tokens();
  const { narrow, pad, lostH, top, X } = sc, bottom = h - pad.b, right = w - pad.r, yearNow = yearOfJd(nowJd), year = yearOfJd(jd);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // years
  ctx.textAlign = 'center';
  for (let y = 2000; y <= LAST_YEAR; y += 5) {
    ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(X(y) + 0.5, pad.t); ctx.lineTo(X(y) + 0.5, bottom); ctx.stroke();
    if (!narrow || y % 10 === 0) { ctx.fillStyle = T.dim; ctx.fillText(String(y), X(y), h - 6); }
  }
  // what has not been measured yet
  ctx.fillStyle = alpha(T.void, 0.5); ctx.fillRect(X(yearNow), pad.t, right - X(yearNow), bottom - pad.t);
  ctx.strokeStyle = alpha(T.text, 0.45); ctx.beginPath(); ctx.moveTo(X(yearNow) + 0.5, pad.t); ctx.lineTo(X(yearNow) + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(narrow ? 'IF LEFT ALONE' : 'IF NOBODY LOOKS AGAIN', X(yearNow) + 6, top - 10);

  // a line that is drawn broken where nothing has been measured
  const run = (pts, colour, width) => {
    const cut = pts.findIndex((q) => q.year > yearNow);                 // the first point past today, or -1
    const parts = cut < 0 ? [[pts, false]] : [[pts.slice(0, cut), false], [pts.slice(Math.max(0, cut - 1)), true]];
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineJoin = 'round';
    for (const [part, ahead] of parts) {
      if (part.length < 2) continue;
      ctx.setLineDash(ahead ? [5, 4] : []); ctx.beginPath();
      part.forEach((q, i) => { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
  };

  // the catalogue: how many clocks are lost, from zero
  if (census) {
    const max = Math.max(1, ...census.lost), base = pad.t + lostH;
    const Y = (v) => base - (v / max) * (lostH - 6);
    ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, base + 0.5); ctx.lineTo(right, base + 0.5); ctx.stroke();
    const pts = census.years.map((y, i) => ({ year: y, x: X(y), y: Y(census.lost[i]) }));
    ctx.fillStyle = alpha(T.ice, 0.1); ctx.beginPath(); ctx.moveTo(X(FIRST_YEAR), base);
    for (const q of pts) if (q.year <= yearNow) ctx.lineTo(q.x, q.y);
    ctx.lineTo(X(Math.min(yearNow, LAST_YEAR)), base); ctx.closePath(); ctx.fill();
    run(pts, T.ice, 1.5);
    ctx.fillStyle = T.dim; ctx.textAlign = 'right';
    ctx.fillText('0', pad.l - 6, base + 3); ctx.fillText(String(max), pad.l - 6, Y(max) + 3);
    ctx.textAlign = 'left'; ctx.fillText('CLOCKS LOST', pad.l + 4, pad.t + 8);
    const last = census.years.length - 1;
    ctx.fillStyle = T.text;
    if (narrow) { ctx.textAlign = 'right'; ctx.fillText(String(census.lost[last]), right - 2, Y(census.lost[last]) - 5); }
    else ctx.fillText(`${census.lost[last]} in ${Math.round(census.years[last])}`, right + 6, Y(census.lost[last]) + 3);
    // the count on the date shown: a point on its line
    const yr = Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year)), i = Math.min(last, Math.max(0, Math.round((yr - census.years[0]) / (census.years[1] - census.years[0]))));
    ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(X(yr), Y(census.lost[i]), 5, 0, TAU); ctx.fill();
    ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(X(yr), Y(census.lost[i]), 3, 0, TAU); ctx.fill();
  }

  // the one clock: the error of the best clock known, year by year, against the two lengths that decide its state
  const hits = [];
  ctx.fillStyle = T.dim; ctx.textAlign = 'left';
  if (name) ctx.fillText(narrow ? 'ERROR OF THIS CLOCK' : `ERROR OF THE BEST CLOCK KNOWN FOR ${name.toUpperCase().replace(/ ([B-Z])$/, (m) => m.toLowerCase())}`, pad.l + 4, top - 10);
  if (line && line.length) {
    const lo = Math.log10(0.5 / DAY), hi = Math.log10(Math.max(3, dur ? dur * 4 : 0, ...line.map((p) => p.sigma * 1.4)));
    const Y = (days) => bottom - ((Math.log10(Math.max(days, 0.5 / DAY)) - lo) / (hi - lo)) * (bottom - top);
    ctx.textAlign = 'right'; ctx.fillStyle = T.dim;
    for (const [d, text] of ERR_TICKS) {
      if (Math.log10(d) > hi) continue;
      ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(pad.l, Y(d) + 0.5); ctx.lineTo(right, Y(d) + 0.5); ctx.stroke();
      ctx.fillText(text, pad.l - 6, Y(d) + 3);
    }
    if (dur) {
      // the transit's own length, above which the clock is lost, and a twelfth of it, below which it is kept
      for (const [len, text, ink] of [[dur, 'TRANSIT', alpha(T.bright, 0.55)], [dur / KEPT_LAMP, 'A TWELFTH', alpha(T.text, 0.34)]]) {
        ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(pad.l, Y(len) + 0.5); ctx.lineTo(right, Y(len) + 0.5); ctx.stroke();
        ctx.fillStyle = T.text;
        if (narrow) { ctx.textAlign = 'right'; ctx.fillText(text, right - 2, Y(len) - 4); } else { ctx.textAlign = 'left'; ctx.fillText(text, right + 6, Y(len) + 3); }
      }
    }
    // gold while the clock is kept, ice blue once it is not, thinner once it is lost
    const inkOf = (sigma) => (!dur ? [alpha(T.text, 0.8), 1.5] : sigma > dur ? [alpha(T.ice, 0.75), 1.25] : sigma > dur / KEPT_LAMP ? [T.ice, 2] : [T.gold, 2]);
    ctx.lineJoin = 'round';
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], drop = a.s !== b.s, ahead = b.year > yearNow + 1e-6, [ink, wide] = inkOf(b.sigma);
      ctx.strokeStyle = drop ? alpha(T.text, 0.35) : ink; ctx.lineWidth = drop ? 1 : wide;
      ctx.setLineDash(ahead && !drop ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(X(a.year), Y(a.sigma)); ctx.lineTo(X(b.year), Y(b.sigma)); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
    // the day each paper took over: a dot with a ring of the ground, and a name on the last (and the first, where there is room)
    hist.forEach((hh, i) => {
      const y0 = Math.max(FIRST_YEAR, yearOfJd(hh.from));
      if (y0 > LAST_YEAR) return;
      const x = X(y0), y = Y(sigmaAt(hh.s, epochAt(hh.s, Math.max(hh.from, jdOfYear(FIRST_YEAR)))));
      ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
      hits.push({ x, y, s: hh.s });
      const lastOne = i === hist.length - 1;
      if (lastOne || (i === 0 && !narrow)) {
        const flip = x > right - 150;
        ctx.fillStyle = T.text; ctx.textAlign = flip ? 'right' : 'left';
        ctx.fillText(label(hh.s), x + (flip ? -9 : 9), Math.min(bottom - 4, y + 14));
      }
    });
  }

  // today, and the date shown: the line a visitor holds, with its date stamped on it
  const x = X(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year))), atNow = Math.abs(jd - nowJd) < 0.5;
  ctx.font = T.font;
  const words = atNow ? `TODAY · ${stamp}` : stamp, half = ctx.measureText(words).width / 2;
  const tx = Math.max(pad.l + half, Math.min(w - 4 - half, x));
  if (!atNow && Math.abs(X(yearNow) - tx) > half + 30) { ctx.font = T.fontSm; ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('TODAY', X(yearNow), 12); ctx.font = T.font; }
  ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.moveTo(x + 0.5, 18); ctx.lineTo(x + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.bright; ctx.fillRect(x - 3, 16, 7, 3);                                    // the grip
  ctx.textAlign = 'center'; ctx.fillText(words, tx, 11);
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
const pct = (share) => `${(share * 100).toPrecision(2)} %`;

/** planet, clock (the one in use on the date), jd. Returns { expected, depth } for the words that say the same. */
export function drawCurve(ctx, w, h, { planet, clock, jd }) {
  const T = tokens();
  const durH = planet.durH, depth = Number.isFinite(planet.depthPct) && planet.depthPct > 0 ? planet.depthPct / 100
    : (planet.rEarth && planet.stRad ? ((planet.rEarth * 6371) / (planet.stRad * 695700)) ** 2 : 0.01);
  const pad = { l: 8, r: 8, t: 38, b: 30 };
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  if (!clock || !Number.isFinite(durH) || durH <= 0) {
    ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText(clock ? 'THE ARCHIVE GIVES NO TRANSIT LENGTH' : 'NO CLOCK PUBLISHED YET', w / 2, h / 2);
    return { expected: NaN, depth };
  }
  const sigmaH = sigmaAt(clock, epochAt(clock, jd)) * 24, periodH = clock.P * 24;
  const reach = Math.min(periodH / 2, Math.max(durH * 1.15, sigmaH * 3.2));
  const n = 161, ts = Array.from({ length: n }, (_, i) => -reach + (2 * reach * i) / (n - 1));
  const shape = dipShape(depth, durH), smear = smearedDip(shape, durH, sigmaH, periodH, ts), expected = Math.max(...smear);
  const floor = Math.max(depth * 1.18, 1e-6);
  const X = (t) => pad.l + ((t + reach) / (2 * reach)) * (w - pad.l - pad.r);
  const Y = (def) => pad.t + (def / floor) * (h - pad.t - pad.b);
  const state = stateOf(durH / sigmaH), ink = state === 'kept' ? T.gold : state === 'lost' ? alpha(T.ice, 0.8) : T.ice, heavy = state === 'lost' ? 1.5 : 2;
  // the two lines, named where they are drawn
  ctx.textAlign = 'left';
  ctx.strokeStyle = ink; ctx.lineWidth = heavy; ctx.beginPath(); ctx.moveTo(pad.l, 9.5); ctx.lineTo(pad.l + 18, 9.5); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = T.text; ctx.fillText(`THROUGH THIS CLOCK · A DIP OF ${pct(expected)}`, pad.l + 26, 12.5);
  ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath(); ctx.moveTo(pad.l, 22.5); ctx.lineTo(pad.l + 18, 22.5); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.fillText(`THE TRANSIT ITSELF · ${pct(depth)} DEEP`, pad.l + 26, 25.5);
  // the star's own light
  ctx.strokeStyle = alpha(T.line, 0.95); ctx.beginPath(); ctx.moveTo(pad.l, Y(0) + 0.5); ctx.lineTo(w - pad.r, Y(0) + 0.5); ctx.stroke();
  // the transit as it is
  ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath();
  ts.forEach((t, i) => { const y = Y(shape(t)); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }); ctx.stroke();
  // the transit as this clock lets it be seen
  ctx.strokeStyle = ink; ctx.lineWidth = heavy; ctx.lineJoin = 'round'; ctx.beginPath();
  ts.forEach((t, i) => { const y = Y(smear[i]); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }); ctx.stroke(); ctx.lineWidth = 1;
  // one sigma either side of the predicted middle: a bar where it has a width to show, a tick where it has none
  const yb = h - pad.b + 8, a = Math.max(-reach, -sigmaH), b = Math.min(reach, sigmaH);
  ctx.strokeStyle = alpha(T.text, 0.8); ctx.beginPath();
  if (X(b) - X(a) >= 10) { ctx.moveTo(X(a), yb - 3); ctx.lineTo(X(a), yb + 3); ctx.moveTo(X(a), yb); ctx.lineTo(X(b), yb); ctx.moveTo(X(b), yb - 3); ctx.lineTo(X(b), yb + 3); }
  else { ctx.moveTo(X(0) + 0.5, yb - 4); ctx.lineTo(X(0) + 0.5, yb + 3); }
  ctx.stroke();
  ctx.fillStyle = T.text; ctx.textAlign = 'center';
  ctx.fillText(`PREDICTED ± ${span(sigmaH * 3600)}${sigmaH > reach ? ', WIDER THAN THIS DRAWING' : ''}`, w / 2, yb + 15);
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(`−${span(reach * 3600)}`, pad.l, yb + 15);
  ctx.textAlign = 'right'; ctx.fillText(`+${span(reach * 3600)}`, w - pad.r, yb + 15);
  return { expected, depth };
}

/* ---------------- where the papers found it ---------------- */
/**
 * Every other published clock of a planet against the clock in use: its mid-time minus what the clock in use
 * predicts for that orbit, by the year of the mid-time. The two curves are the clock's own 1-sigma error. A
 * paper inside its own and the clock's error together is gold; one outside is ice blue. label(s): a paper, in
 * words. Returns what the pointer can reach: [{ x, y, pt }].
 */
export function drawOC(ctx, w, h, { planet, clock, label }) {
  const T = tokens();
  const narrow = w < 520, pad = { l: narrow ? 8 : 92, r: 10, t: 18, b: 18 };
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  ctx.fillStyle = T.dim; ctx.textAlign = 'left';
  ctx.fillText(narrow ? 'EACH PAPER AGAINST THIS CLOCK' : 'WHERE EACH PAPER FOUND THE TRANSIT, AGAINST THIS CLOCK', narrow ? pad.l : 0, 9);
  const pts = clock ? pointsFor(planet, clock) : [];
  if (!pts.length) {
    ctx.textAlign = 'center'; ctx.fillText(clock ? 'NO OTHER PUBLISHED CLOCK TO HOLD THIS ONE AGAINST' : 'NO CLOCK PUBLISHED YET', w / 2, h / 2 + 6);
    return [];
  }
  const y0 = yearOfJd(clock.t0), years = [y0, ...pts.map((q) => q.year)];
  const lo = Math.min(...years) - 0.6, hi = Math.max(...years) + 0.6;
  const mags = pts.map((q) => Math.abs(q.residual) + q.sT).sort((a, b) => a - b), mid = mags[Math.floor((mags.length - 1) / 2)];
  const env = Math.max(...pts.map((q) => sigmaAt(clock, q.n)), clock.sT);
  const R = Math.min(mags[mags.length - 1], Math.max(env * 3, mid * 6)) * 1.18 || env * 3;      // one far miss does not flatten the rest: it is drawn at the edge
  const X = (yr) => pad.l + ((yr - lo) / (hi - lo)) * (w - pad.l - pad.r), zero = (pad.t + h - pad.b) / 2;
  const Y = (days) => zero - (Math.max(-1, Math.min(1, days / R))) * (zero - pad.t - 2);
  // the clock's own error either side of its prediction, widening with every orbit from its own epoch
  ctx.fillStyle = alpha(T.text, 0.05); ctx.beginPath();
  const N = 60, at = (i) => lo + ((hi - lo) * i) / N, sig = (yr) => sigmaAt(clock, epochAt(clock, jdOfYear(yr)));
  for (let i = 0; i <= N; i++) { const yr = at(i); if (i) ctx.lineTo(X(yr), Y(sig(yr))); else ctx.moveTo(X(yr), Y(sig(yr))); }
  for (let i = N; i >= 0; i--) ctx.lineTo(X(at(i)), Y(-sig(at(i))));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, zero + 0.5); ctx.lineTo(w - pad.r, zero + 0.5); ctx.stroke();
  ctx.fillStyle = T.dim;
  if (narrow) { ctx.textAlign = 'right'; ctx.fillText(`LATE BY ${span(R * DAY).toUpperCase()}`, w - pad.r, pad.t + 8); ctx.fillText(`EARLY BY ${span(R * DAY).toUpperCase()}`, w - pad.r, h - pad.b - 3); }
  else { ctx.textAlign = 'right'; ctx.fillText(`${span(R * DAY)} late`, pad.l - 8, pad.t + 8); ctx.fillText('as predicted', pad.l - 8, zero + 3); ctx.fillText(`${span(R * DAY)} early`, pad.l - 8, h - pad.b - 1); }
  ctx.textAlign = 'center';
  const stepY = hi - lo > 12 ? 5 : hi - lo > 4 ? 2 : 1;
  for (let yr = Math.ceil(lo / stepY) * stepY; yr <= hi; yr += stepY) ctx.fillText(String(yr), X(yr), h - 4);
  // the clock in use, at its own epoch
  ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.moveTo(X(y0) - 4, zero); ctx.lineTo(X(y0), zero - 4); ctx.lineTo(X(y0) + 4, zero); ctx.lineTo(X(y0), zero + 4); ctx.closePath(); ctx.stroke();
  // each paper: its mid-time's own error as a bar, the paper as a dot ringed with the ground
  const hits = [];
  for (const q of pts) {
    const x = X(q.year), y = Y(q.residual), inside = Math.abs(q.z) < 1, off = Math.abs(q.residual) > R, ink = inside ? T.gold : T.ice;
    if (!off) { ctx.strokeStyle = alpha(ink, 0.6); ctx.beginPath(); ctx.moveTo(x + 0.5, Y(q.residual - q.sT)); ctx.lineTo(x + 0.5, Y(q.residual + q.sT)); ctx.stroke(); }
    ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath();
    if (off) { const up = q.residual > 0 ? -1 : 1; ctx.moveTo(x - 4, y - up * 3); ctx.lineTo(x + 4, y - up * 3); ctx.lineTo(x, y + up * 4); ctx.closePath(); } else ctx.arc(x, y, 3, 0, TAU);
    ctx.fill();
    hits.push({ x, y, pt: q, label: label(q.s) });
  }
  return hits;
}

/* ---------------- the night ---------------- */
/**
 * rows: tonight.js crossings() at a place. fromJd: now. night: [[jdFrom, jdTo]] where the Sun is 12 degrees
 * down or more at the place. clock(jd): the hour of a Julian date on the visitor's clock, as words. Only the
 * transits that are up in the dark are drawn; the five whose stars are brightest are gold and named.
 * Returns what the pointer can reach: [{ x, y, row }].
 */
export function drawNight(ctx, w, h, { rows, place, fromJd, night, clock }) {
  const T = tokens();
  const pad = { l: 34, r: 10, t: 12, b: 20 };
  const X = (jd) => pad.l + (jd - fromJd) * (w - pad.l - pad.r);
  const Y = (alt) => h - pad.b - (Math.max(0, alt) / 90) * (h - pad.t - pad.b);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  const hits = [];
  // the night at this place: the sheet's blue again
  ctx.fillStyle = alpha(T.sky, 0.9);
  for (const [a, b] of night) ctx.fillRect(X(a), pad.t, X(b) - X(a), h - pad.t - pad.b);
  // the hours
  ctx.textAlign = 'center';
  let mark = 0;
  for (let t = Math.ceil((fromJd + 0.5) * 8) / 8 - 0.5; t <= fromJd + 1; t += 1 / 8) {          // every three hours of UTC, named on the visitor's clock
    ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(X(t) + 0.5, pad.t); ctx.lineTo(X(t) + 0.5, h - pad.b); ctx.stroke();
    if (w < 620 && mark++ % 2) continue;
    const last = X(t) > w - pad.r - 26;
    ctx.fillStyle = T.dim; ctx.textAlign = last ? 'right' : 'center'; ctx.fillText(clock(t), last ? w - 2 : X(t), h - 6);
  }
  ctx.fillStyle = T.dim; ctx.textAlign = 'left';
  for (const [a] of night) ctx.fillText('NIGHT · SUN 12° DOWN', X(a) + 5, pad.t + 9);
  // the height of a star, and the height it must keep
  ctx.textAlign = 'right';
  for (const alt of [0, WATCH.minAlt, 60, 90]) {
    ctx.strokeStyle = alt === WATCH.minAlt ? alpha(T.bright, 0.45) : alpha(T.line, 0.9);
    ctx.beginPath(); ctx.moveTo(pad.l, Y(alt) + 0.5); ctx.lineTo(w - pad.r, Y(alt) + 0.5); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(`${alt}°`, pad.l - 6, Y(alt) + 3);
  }
  ctx.fillStyle = T.text; ctx.fillText('NO LOWER THAN THIS', w - pad.r - 2, Y(WATCH.minAlt) + 11);
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
  const up = rows.filter((r) => r.watchable);
  if (!up.length) { ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('NO TRANSIT IS UP IN THE DARK HERE IN THE NEXT 24 HOURS', (pad.l + w - pad.r) / 2, pad.t + 30); return hits; }
  const named = nightNamed(rows);
  for (const r of up) if (!named.includes(r)) trace(r, alpha(T.ice, 0.5), 1);
  const taken = [];
  for (const r of up) {
    const alt = altAz(r.mid, r.planet.ra, r.planet.dec, place.lat, place.lon).alt;
    hits.push({ x: X(r.mid), y: Y(alt), row: r });
    if (!named.includes(r)) continue;
    trace(r, T.gold, 2);
    // its name beside its middle, lifted clear of a name already written
    const flip = X(r.mid) > w - 120, tw = ctx.measureText(r.planet.name).width, x0 = flip ? X(r.mid) - 6 - tw : X(r.mid) + 6;
    let y = Y(alt) - 7;
    for (let k = 0; k < 4 && taken.some((b) => x0 < b.x + b.w + 4 && x0 + tw + 4 > b.x && Math.abs(y - b.y) < 10); k++) y -= 11;
    y = Math.max(pad.t + 20, y);
    taken.push({ x: x0, y, w: tw });
    ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = T.sky; ctx.strokeText(r.planet.name, x0, y); ctx.lineWidth = 1;
    ctx.fillStyle = T.bright; ctx.fillText(r.planet.name, x0, y);
  }
  return hits;
}
/* The transits a night's drawing names: of those up in the dark, the five whose stars are brightest. */
export const nightNamed = (rows) => rows.filter((r) => r.watchable).sort((a, b) => (a.planet.vmag ?? 99) - (b.planet.vmag ?? 99)).slice(0, 5);

/* ---------------- the tally ---------------- */
const EDGE = 6.5, BIN = 0.25;
/* Which column of the tally a miss of z sigmas falls in: quarter-sigma columns from -6.5 to 6.5, with the two
   end columns holding everything further out. */
export const tallyBin = (z) => Math.max(0, Math.min(Math.round((2 * EDGE) / BIN) - 1, Math.floor((z + EDGE) / BIN)));

/**
 * zs: the miss of every test, in sigmas of the older clock (later than predicted is positive). t: clock.js
 * tally() of the same tests. One dot a test, stacked in quarter-sigma columns; gold inside one sigma. The line
 * is where the same number of tests would fall if every stated error were honest.
 */
export function drawTally(ctx, w, h, { zs, t }) {
  const T = tokens();
  const narrow = w < 620, pad = { l: 10, r: 10, t: narrow ? 64 : 44, b: 36 };
  const X = (z) => pad.l + ((z + EDGE) / (2 * EDGE)) * (w - pad.l - pad.r);
  const nb = Math.round((2 * EDGE) / BIN), bins = new Array(nb).fill(0);
  for (const z of zs) bins[tallyBin(z)]++;
  const binPx = X(BIN) - X(0), cols = Math.max(1, Math.floor(binPx / 7)), px = binPx / cols, d = Math.min(7, px - 1.2);
  const bell = (z) => zs.length * BIN * Math.exp(-0.5 * z * z) / Math.sqrt(TAU);
  const base = h - pad.b, rows = Math.max(Math.ceil(Math.max(...bins) / cols), bell(0) / cols) + 3;
  const py = Math.min(px, (base - pad.t) / rows), dy = Math.min(d, Math.max(2.5, py - 0.6));
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // one sigma and three sigma either side
  for (const z of [-3, -1, 1, 3]) { ctx.strokeStyle = alpha(T.lineBright, Math.abs(z) === 1 ? 1 : 0.7); ctx.beginPath(); ctx.moveTo(Math.round(X(z)) + 0.5, pad.t - 6); ctx.lineTo(Math.round(X(z)) + 0.5, base); ctx.stroke(); }
  // one dot a test
  const fill = (inside) => {
    ctx.beginPath();
    const seen = new Array(nb).fill(0);
    for (const z of zs) {
      const b = tallyBin(z), i = seen[b]++;
      if ((Math.abs(z) < 1) !== inside) continue;
      const cx = X(-EDGE + b * BIN) + (i % cols + 0.5) * px, cy = base - (Math.floor(i / cols) + 0.5) * py - 1;
      ctx.moveTo(cx + dy / 2, cy); ctx.arc(cx, cy, dy / 2, 0, TAU);
    }
    ctx.fill();
  };
  ctx.fillStyle = alpha(T.ice, 0.85); fill(false);
  ctx.fillStyle = T.gold; fill(true);
  // what honest errors would give
  ctx.strokeStyle = alpha(T.bright, 0.8); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const z = -EDGE + (2 * EDGE * i) / 160, y = base - (bell(z) / cols) * py; if (i) ctx.lineTo(X(z), y); else ctx.moveTo(X(z), y); }
  ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = T.text; ctx.textAlign = 'center'; ctx.fillText(narrow ? 'HONEST ERRORS' : 'IF EVERY STATED ERROR WERE HONEST', X(0), base - (bell(0) / cols) * py - 7);
  // the two comparisons, stamped on the drawing
  if (t && t.real) {
    const share = (n) => `${((100 * n) / t.real).toFixed(0)} %`;
    const stamp = (x, y, align, big, small) => { ctx.textAlign = align; ctx.font = STAMP; ctx.fillStyle = T.bright; ctx.fillText(big, x, y); ctx.font = T.fontSm; ctx.fillStyle = T.dim; ctx.fillText(small, x, y + 13); };
    if (narrow) {
      stamp(pad.l, 12, 'left', `${t.inside1} OF ${t.real} INSIDE 1σ · ${share(t.inside1)}`, 'HONEST ERRORS WOULD PUT 68 % THERE');
      stamp(pad.l, 42, 'left', `${t.beyond3} BEYOND 3σ · ${share(t.beyond3)}`, 'HONEST ERRORS WOULD PUT 0.3 % THERE');
    } else {
      stamp(X(0), 12, 'center', `${t.inside1} OF ${t.real} INSIDE 1σ · ${share(t.inside1)}`, 'HONEST ERRORS WOULD PUT 68 % THERE');
      stamp(w - pad.r, 12, 'right', `${t.beyond3} BEYOND 3σ · ${share(t.beyond3)}`, 'HONEST ERRORS WOULD PUT 0.3 % THERE');
    }
  }
  ctx.font = T.fontSm;
  ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, base + 0.5); ctx.lineTo(w - pad.r, base + 0.5); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  for (const z of narrow ? [-3, -1, 1, 3] : [-3, -1, 0, 1, 3]) ctx.fillText(z === 0 ? 'on time' : `${z > 0 ? '+' : '−'}${Math.abs(z)}σ`, X(z), base + 13);
  ctx.textAlign = 'left'; ctx.fillText('6σ OR MORE', pad.l, base + 13); ctx.fillText('FOUND EARLIER', pad.l, base + 27);
  ctx.textAlign = 'right'; ctx.fillText('6σ OR MORE', w - pad.r, base + 13); ctx.fillText('FOUND LATER', w - pad.r, base + 27);
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
