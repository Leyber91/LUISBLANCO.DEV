/* ============================================================
   overdue/views.js — the drawings of the sheet.

   One warm colour and two cold ones (sky.js says why). The sky
   is a deep blue. A clock that is kept is gold, and the better it
   is kept the brighter; a clock that is slipping is an ice-blue
   point; a clock that is lost is an ice-blue ring. Gold marks a
   kept clock and a paper that landed inside a window that could
   have missed, and nothing else: it never fills an area and never
   means "chosen". Ice marks a state too, so the map's own lines
   are drawn in the labs' cold ink and not in ice.

   Words on a drawing stand on a ground of their own, so no lamp
   and no line runs through them, and a drawing is named by labels
   on it, not by a sentence under it.

   The sky. Every planet a lamp at its star's place on an
   equal-area map, in the state of the best clock known on the
   date shown. On today's sky a planet in front of its star wears
   an arc in bright ink, as far round as the transit has got. The ecliptic and the plane of the Galaxy are the only
   construction lines. A lens enlarges the Kepler field, where the
   map itself can only show a crowd.

   The line of time. One axis of years, and the sheet's only
   control. Above, how many clocks are lost, from zero. Below, the
   error of the one clock being read, which climbs with every
   orbit and drops the day a better paper appears, against the
   two lengths that decide its state. Right of today nothing is
   measured, and the lines are drawn broken.

   The transit as light. What a telescope pointed at the
   predicted time would record on average: the true dip spread by
   the clock's error.

   Each paper against the clock. Every other published mid-time
   minus what the clock in use predicts for that orbit: the chart
   the people who keep these clocks draw.

   The night. Each transit of the next 24 hours that is up in the
   dark, as the height of its star through the transit. Only the
   dark hours are drawn.

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
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/* Words on a drawing, on a ground of their own: a box of the ground's colour under them, so no mark and no line
   shows between the letters. tall: the height of the type, in pixels. */
function words(ctx, text, x, y, ink, ground, tall = 9) {
  const tw = ctx.measureText(text).width, x0 = ctx.textAlign === 'right' ? x - tw : ctx.textAlign === 'center' ? x - tw / 2 : x;
  ctx.fillStyle = ground; ctx.fillRect(x0 - 3, y - tall, tw + 6, tall + 4);
  ctx.fillStyle = ink; ctx.fillText(text, x, y);
}

/* ---------------- the sky ---------------- */
/* Where the map and the lens sit in a canvas of w by h. Wide: the map low, the lens at its right shoulder, and
   from BESIDE up the map leaves the sheet's upper left to the name and the count (overdue.css puts them above
   the map below that width). Narrow: the map alone; the lens has a canvas of its own under the line of time
   (lensLayout), so the map and the line that sets its date share the first screen. */
export const BESIDE = 1150, TITLE_ROOM = 205;
export function skyLayout(w, h) {
  if (w >= 760) {
    const rx = Math.min(w / 2 - 24, h - 46, w >= BESIDE ? w / 2 - TITLE_ROOM : Infinity), ry = rx / 2, r = Math.min(104, h * 0.185);
    return { wide: true, cx: w / 2, cy: h - ry - 30, rx, ry, lens: { x: w - r - 30, y: r + 34, r } };
  }
  const rx = w / 2 - 2, ry = rx / 2;
  return { wide: false, cx: w / 2, cy: ry + 3, rx, ry, lens: null };
}
/* The lens on a canvas of its own: as large as the canvas allows, with room under it for its name. */
export function lensLayout(w, h) { const r = Math.max(10, Math.min(w / 2 - 2, (h - 20) / 2)); return { x: w / 2, y: r + 2, r }; }
export const onMap = (L, m) => ({ x: L.cx + m.x * L.rx, y: L.cy - m.y * L.rx });
export const onLens = (Z, q) => ({ x: Z.x + q.x * Z.r, y: Z.y - q.y * Z.r });

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
  return { kind, r: 1.4 + 1.0 * (step / (STEPS - 1)), a: keptAlpha(step), step };
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

/* The planets that have a lamp on a date, each with the clock then in use and how its lamp is drawn. */
function litOf(stars, jd) {
  const lit = [];
  for (const s of stars) {
    const c = clockAt(s.hist, jd);
    if (!c) continue;
    const dur = durDays(s.p), mark = lampMark(dur ? dur / sigmaAt(c, epochAt(c, jd)) : NaN);
    if (mark.r) lit.push({ s, c, dur, mark });                          // no transit length: no lamp to draw, and the count leaves it out too
  }
  return lit;
}

/**
 * The lamps of a list, where `place` puts them. inLens: only those under the lens. packed(x): this lamp stands
 * in a crowd the drawing cannot resolve (the Kepler field on the all-sky map), so it is drawn small, with no
 * halo and no arc; the lens shows it properly. halo: kept lamps wear one (only where lamps are sparse: stacked
 * halos would turn a field into a slab of gold). Every lamp's place goes into `spots` for the pointer.
 */
function lamps(ctx, T, lit, { place, scale, inLens, packed = () => false, halo, live, jd, spots }) {
  const each = (pick, grow, stroke) => {
    ctx.beginPath();
    for (const x of lit) {
      if (!pick(x) || (inLens && !x.s.q.inside)) continue;
      const q = place(x.s), r = Math.max(stroke ? 1.6 : 0, x.mark.r * scale * grow * (packed(x) ? 0.6 : 1));
      ctx.moveTo(q.x + r, q.y); ctx.arc(q.x, q.y, r, 0, TAU);
    }
    if (stroke) ctx.stroke(); else ctx.fill();
  };
  for (const x of lit) { if (inLens && !x.s.q.inside) continue; const q = place(x.s); spots.push({ x: q.x, y: q.y, star: x.s, lens: inLens }); }
  // cold first, then gold over it. Nothing adds: where lamps crowd the field goes gold, never white.
  ctx.fillStyle = alpha(T.ice, SLIPPING.a); each((x) => x.mark.kind === 'slipping', 1, false);
  if (halo) { ctx.fillStyle = alpha(T.gold, 0.1); each((x) => x.mark.kind === 'kept' && !packed(x), 2.6, false); }
  for (let step = 0; step < STEPS; step++) {
    ctx.fillStyle = alpha(step >= STEPS - 2 ? T.goldSoft : T.gold, keptAlpha(step));
    each((x) => x.mark.kind === 'kept' && x.mark.step === step, 1, false);
  }
  // a lost clock is a hairline ring: found by its shape, and quieter than any kept lamp
  ctx.lineWidth = 0.9; ctx.strokeStyle = alpha(T.ice, LOST.a); each((x) => x.mark.kind === 'lost', 1, true); ctx.lineWidth = 1;
  if (!live) return;
  // a planet crossing its star at this instant: an arc in bright ink, clear of its lamp, as far round as the transit has got
  ctx.strokeStyle = alpha(T.bright, 0.6); ctx.beginPath();
  for (const x of lit) {
    if (x.mark.kind === 'lost' || packed(x) || (inLens && !x.s.q.inside) || !inTransit(x.c, jd, x.dur)) continue;
    const q = place(x.s), turn = (((jd - x.c.t0) / x.c.P) % 1 + 1.5) % 1, done = Math.min(1, Math.max(0.04, (turn - 0.5) * x.c.P / x.dur + 0.5));
    const r = x.mark.r * scale + (inLens ? 1.8 : 2.5);
    ctx.moveTo(q.x, q.y - r); ctx.arc(q.x, q.y, r, -Math.PI / 2, -Math.PI / 2 + done * TAU);
  }
  ctx.stroke();
}

/* The lens: its ground, the lamps under it, its ring. Z: { x, y, r }. */
function lensDisc(ctx, T, lit, Z, { live, jd, spots }) {
  ctx.fillStyle = T.sky; ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.clip();
  lamps(ctx, T, lit, { place: (s) => onLens(Z, s.q), scale: Math.max(0.55, Math.min(1, Z.r / 100)), inLens: true, halo: false, live, jd, spots });
  ctx.restore();
  ctx.strokeStyle = alpha(T.horizon, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(Z.x, Z.y, Z.r, 0, TAU); ctx.stroke();
}
const LENS_NAME = `KEPLER FIELD, ${2 * KEPLER.radius}° ACROSS`;
function crosshair(ctx, T, q) {
  ctx.strokeStyle = T.bright; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(q.x + 7 * Math.cos(a), q.y + 7 * Math.sin(a)); ctx.lineTo(q.x + 14 * Math.cos(a), q.y + 14 * Math.sin(a)); ctx.stroke(); }
}

/**
 * The sky on a date. stars: [{ p, hist, m: map point, q: lens point }]. jd: the date shown. live: the date
 * shown is this instant, so planets in front of their stars are marked. note: { ra, dec, lines: [text],
 * sample: [text] } a label with a leader to one place on the map; it is drawn where the sheet has room for the
 * widest it can ever be (sample), and note.fits says whether it has, so the page can say the same in a line of
 * text where it has not. Returns the pixel place of every lamp drawn, for the pointer: [{ x, y, star, lens }].
 */
export function drawSky(ctx, w, h, { L, stars, jd, selected, hover, live = false, note = null }) {
  const T = tokens();
  const spots = [], lit = litOf(stars, jd);
  const ellipse = () => { ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); };
  ctx.lineWidth = 1; ctx.font = T.fontSm;
  // the sky: the one large coloured field of the sheet. Its lines are the labs' cold ink; ice is kept for a state.
  ctx.fillStyle = T.sky; ellipse(); ctx.fill();
  ctx.strokeStyle = alpha(T.horizon, 0.1);
  for (const g of GRATICULE.parallels) path(ctx, L, g.pts);
  for (const g of GRATICULE.meridians) path(ctx, L, g.pts);
  ctx.beginPath(); ctx.moveTo(L.cx, L.cy - L.ry); ctx.lineTo(L.cx, L.cy + L.ry); ctx.stroke();
  ctx.strokeStyle = alpha(T.horizon, 0.42); for (const run of ECLIPTIC) path(ctx, L, run);
  ctx.strokeStyle = alpha(T.horizon, 0.22); for (const run of GALAXY) path(ctx, L, run);
  ctx.strokeStyle = alpha(T.horizon, 0.36); ellipse(); ctx.stroke();

  // every lamp on the map; the Kepler field is a crowd here and is drawn as one
  const k = onMap(L, hammer(KEPLER.ra, KEPLER.dec)), edge = onMap(L, hammer(KEPLER.ra, KEPLER.dec + KEPLER.radius));
  const kr = Math.hypot(edge.x - k.x, edge.y - k.y);
  ctx.save(); ellipse(); ctx.clip();
  lamps(ctx, T, lit, { place: (s) => onMap(L, s.m), scale: Math.max(0.45, Math.min(1, L.rx / 460)), inLens: false, packed: (x) => x.s.q.inside, halo: true, live, jd, spots });
  // the names of the two great circles and the hours, on the sky's own ground so no lamp runs through them
  if (L.wide) {
    ctx.textAlign = 'left';
    const ep = eclipticToEquatorial(318), e = onMap(L, hammer(ep.ra, ep.dec)); words(ctx, 'ECLIPTIC', e.x + 4, e.y + 13, alpha(T.text, 0.8), T.sky);
    const gp = galacticToEquatorial(232, 0), g = onMap(L, hammer(gp.ra, gp.dec)); words(ctx, 'PLANE OF THE GALAXY', g.x + 8, g.y + 12, alpha(T.text, 0.8), T.sky);
    ctx.textAlign = 'center';
    for (const [ra, text] of [[0, '0h'], [90, '6h'], [270, '18h']]) { const q = onMap(L, hammer(ra, 0)); words(ctx, text, q.x + (ra ? 0 : 12), q.y + 12, alpha(T.text, 0.8), T.sky); }
  }
  ctx.restore();

  // one label for the survey whose clocks are lost: a leader from its densest field to words outside the map
  if (note) {
    const q = onMap(L, hammer(note.ra, note.dec)), wide = Math.max(...note.sample.map((t) => ctx.measureText(t).width));
    const ex = q.x - 44, ey = q.y + 40;
    note.fits = L.wide && ex - 6 - wide > 2;
    if (note.fits && note.lines.length) {
      ctx.strokeStyle = alpha(T.text, 0.55); ctx.beginPath(); ctx.moveTo(q.x - 9, q.y + 8); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = T.text; ctx.textAlign = 'right';
      note.lines.forEach((t, i) => ctx.fillText(t, ex - 6, ey + 3 + i * 12));
    }
  }

  // where the lens looks, and on a wide sheet the lens itself with the two lines that tie it to its patch
  ctx.strokeStyle = alpha(T.horizon, 0.5); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(k.x, k.y, kr, 0, TAU); ctx.stroke();
  const Z = L.lens;
  if (Z) {
    const ang = Math.atan2(Z.y - k.y, Z.x - k.x);
    ctx.strokeStyle = alpha(T.horizon, 0.3);
    for (const sgn of [1, -1]) {
      const a = ang + sgn * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(k.x + kr * Math.cos(a), k.y + kr * Math.sin(a)); ctx.lineTo(Z.x + Z.r * Math.cos(a), Z.y + Z.r * Math.sin(a)); ctx.stroke();
    }
    lensDisc(ctx, T, lit, Z, { live, jd, spots });
    ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.font = T.fontSm;
    ctx.fillText(LENS_NAME, Z.x, Z.y - Z.r - 8);
  }

  // the lamp under the pointer, and the one being read: the only name on the map
  const at = (s) => (Z && s.q.inside && Math.hypot(onMap(L, s.m).x - k.x, onMap(L, s.m).y - k.y) < kr ? onLens(Z, s.q) : onMap(L, s.m));
  if (hover && hover !== selected && clockAt(hover.hist, jd)) { const q = at(hover); ctx.strokeStyle = alpha(T.bright, 0.7); ctx.beginPath(); ctx.arc(q.x, q.y, 6.5, 0, TAU); ctx.stroke(); }
  if (selected) {
    const q = at(selected), left = q.x > w - 170;
    crosshair(ctx, T, q);
    ctx.font = NAME; ctx.textAlign = left ? 'right' : 'left';
    const tx = q.x + (left ? -18 : 18), ty = q.y - 10;
    const nw = ctx.measureText(selected.p.name).width;
    ctx.save(); ellipse(); ctx.clip(); ctx.fillStyle = T.sky; ctx.fillRect((left ? tx - nw : tx) - 4, ty - 14, nw + 8, 19); ctx.restore();
    ctx.fillStyle = T.bright; ctx.fillText(selected.p.name, tx, ty);
  }
  return spots;
}

/** The lens alone, on its own canvas (a narrow sheet). Returns the lamps drawn, for the pointer. */
export function drawLens(ctx, w, h, { stars, jd, selected, live = false }) {
  const T = tokens(), Z = lensLayout(w, h), spots = [];
  lensDisc(ctx, T, litOf(stars, jd), Z, { live, jd, spots });
  ctx.font = T.fontSm; ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  ctx.fillText(LENS_NAME, Z.x, Z.y + Z.r + 13);
  if (selected && selected.q.inside) crosshair(ctx, T, onLens(Z, selected.q));
  return spots;
}

/* ---------------- the line of time ---------------- */
const DAY = 86400;
const ERR_TICKS = [[1 / DAY, '1 s'], [60 / DAY, '1 min'], [3600 / DAY, '1 h'], [1, '1 d'], [30, '30 d']];

/* The years' scale. The right margin holds the names of what the lines reach, at every width. */
export function bandScale(w, h) {
  const narrow = w < 620;
  const pad = { l: narrow ? 38 : 46, r: narrow ? 68 : 104, t: 30, b: 20 }, lostH = Math.max(38, Math.min(54, h * 0.24)), gap = 30;
  const X = (year) => pad.l + ((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * (w - pad.l - pad.r);
  return { narrow, pad, lostH, top: pad.t + lostH + gap, X, yearAt: (px) => FIRST_YEAR + ((px - pad.l) / (w - pad.l - pad.r)) * (LAST_YEAR - FIRST_YEAR) };
}
/* A date as the stamp on the line: 14 NOV 2026. */
export const stampOf = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/**
 * census: sky.js census(). line: sky.js errorLine() of the planet being read, hist its history, dur its transit
 * length in days (or null). jd: the date shown, stamp its words. paper(s): a solution's paper, in words.
 * hover: the solution whose takeover is under the pointer, to be named. Returns the takeovers drawn, for the
 * pointer: [{ x, y, s }].
 */
export function drawBand(ctx, w, h, { sc, census, line, hist, dur, jd, nowJd, stamp, paper, hover = null }) {
  const T = tokens();
  const { narrow, pad, lostH, top, X } = sc, bottom = h - pad.b, right = w - pad.r, yearNow = yearOfJd(nowJd), year = yearOfJd(jd);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  // years: a hairline every five, a name every ten
  ctx.textAlign = 'center';
  for (let y = 2000; y <= LAST_YEAR; y += 5) {
    ctx.strokeStyle = alpha(T.line, y % 10 ? 0.55 : 0.95); ctx.beginPath(); ctx.moveTo(X(y) + 0.5, pad.t); ctx.lineTo(X(y) + 0.5, bottom); ctx.stroke();
    if (y % 10 === 0) { ctx.fillStyle = T.dim; ctx.fillText(String(y), X(y), h - 6); }
  }
  // what has not been measured yet
  ctx.fillStyle = alpha(T.void, 0.5); ctx.fillRect(X(yearNow), pad.t, right - X(yearNow), bottom - pad.t);
  ctx.strokeStyle = alpha(T.text, 0.45); ctx.beginPath(); ctx.moveTo(X(yearNow) + 0.5, pad.t); ctx.lineTo(X(yearNow) + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText('IF NOBODY LOOKS AGAIN', X(yearNow) + 6, top - 10);

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
    ctx.fillStyle = T.dim; ctx.textAlign = 'right'; ctx.fillText('0', pad.l - 6, base + 3);
    ctx.textAlign = 'left'; ctx.fillText('CLOCKS LOST', pad.l + 4, pad.t + 8);
    const last = census.years.length - 1;
    ctx.fillStyle = T.text; ctx.fillText(`${census.lost[last]} by ${Math.round(census.years[last])}`, right + 6, Y(census.lost[last]) + 3);
    // the count on the date shown: a point on its line
    const yr = Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year)), i = Math.min(last, Math.max(0, Math.round((yr - census.years[0]) / (census.years[1] - census.years[0]))));
    ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(X(yr), Y(census.lost[i]), 5, 0, TAU); ctx.fill();
    ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(X(yr), Y(census.lost[i]), 3, 0, TAU); ctx.fill();
  }

  // the one clock: the error of the best clock known, year by year, against the two lengths that decide its state
  const hits = [], names = [];
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText('ERROR OF THIS CLOCK', pad.l + 4, top - 10);
  if (line && line.length) {
    const least = Math.min(...line.map((p) => p.sigma), dur ? dur / KEPT_LAMP : Infinity);
    const lo = Math.log10(Math.max(0.2 / DAY, least / 3)), hi = Math.log10(Math.max(3 * Math.pow(10, lo), dur ? dur * 4 : 0, ...line.map((p) => p.sigma * 1.4)));
    const Y = (days) => bottom - ((Math.log10(Math.max(days, Math.pow(10, lo))) - lo) / (hi - lo)) * (bottom - top);
    ctx.textAlign = 'right'; ctx.fillStyle = T.dim;
    for (const [d, text] of ERR_TICKS) {
      if (Math.log10(d) > hi || Math.log10(d) < lo) continue;
      ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(pad.l, Y(d) + 0.5); ctx.lineTo(right, Y(d) + 0.5); ctx.stroke();
      ctx.fillText(text, pad.l - 6, Y(d) + 3);
    }
    if (dur) {
      // the transit's own length, above which the clock is lost, and a twelfth of it, below which it is kept
      ctx.textAlign = 'left';
      for (const [len, text, ink] of [[dur, 'TRANSIT', alpha(T.bright, 0.55)], [dur / KEPT_LAMP, 'A TWELFTH', alpha(T.text, 0.34)]]) {
        ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(pad.l, Y(len) + 0.5); ctx.lineTo(right, Y(len) + 0.5); ctx.stroke();
        ctx.fillStyle = T.text; ctx.fillText(text, right + 6, Y(len) + 3);
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
    // the day each paper took over: a dot with a ring of the ground
    hist.forEach((hh, i) => {
      const y0 = Math.max(FIRST_YEAR, yearOfJd(hh.from));
      if (y0 > LAST_YEAR) return;
      const x = X(y0), y = Y(sigmaAt(hh.s, epochAt(hh.s, Math.max(hh.from, jdOfYear(FIRST_YEAR)))));
      ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(x, y, hh.s === hover ? 4.5 : 3.5, 0, TAU); ctx.fill();
      hits.push({ x, y, s: hh.s });
      if (i === hist.length - 1 || (i === 0 && !narrow) || hh.s === hover) names.push({ x, y, text: paper(hh.s) });
    });
  }

  // today, and the date shown: the line a visitor holds, with its date stamped on it
  const x = X(Math.max(FIRST_YEAR, Math.min(LAST_YEAR, year))), atNow = Math.abs(jd - nowJd) < 0.5;
  ctx.font = T.font;
  const stamped = atNow ? `TODAY, ${stamp}` : stamp, half = ctx.measureText(stamped).width / 2;
  const tx = Math.max(pad.l + half, Math.min(w - 4 - half, x));
  if (!atNow && Math.abs(X(yearNow) - tx) > half + 30) { ctx.font = T.fontSm; ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText('TODAY', X(yearNow), 12); ctx.font = T.font; }
  ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.moveTo(x + 0.5, 21); ctx.lineTo(x + 0.5, bottom); ctx.stroke();
  ctx.fillStyle = T.bright; ctx.fillRect(x - 5, 16, 11, 5);                                   // the grip
  ctx.textAlign = 'center'; ctx.fillText(stamped, tx, 11);
  // the papers' names last, each on a ground of its own, so neither the date's line nor a threshold runs through one
  ctx.font = T.fontSm;
  for (const n of names) {
    const tw = ctx.measureText(n.text).width, roomRight = right - (n.x + 9 + tw), roomLeft = n.x - 9 - tw - (pad.l + 4);
    const flip = roomRight < 0 && roomLeft > roomRight;
    ctx.textAlign = flip ? 'right' : 'left';
    words(ctx, n.text, n.x + (flip ? -9 : 9), Math.min(bottom - 4, n.y + 14), T.text, T.void);
  }
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
/* The dip a clock lets through is shallower than the transit itself, and is said to be, below this share of its
   depth. The two lines are seen apart, and both named, once they differ anywhere by this share of the depth. */
export const DIP_APART = 0.97, SHAPE_APART = 0.04;

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
  const apart = ts.some((t, i) => Math.abs(smear[i] - shape(t)) > depth * SHAPE_APART), shallower = expected < depth * DIP_APART;
  // the lines, named where they are drawn; the transit itself is named only where it can be told from the other
  ctx.textAlign = 'left';
  ctx.strokeStyle = ink; ctx.lineWidth = heavy; ctx.beginPath(); ctx.moveTo(pad.l, 9.5); ctx.lineTo(pad.l + 18, 9.5); ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = T.text; ctx.fillText(!apart ? 'THE TRANSIT, THROUGH THIS CLOCK' : shallower ? `THROUGH THIS CLOCK, A DIP OF ${pct(expected)}` : 'THROUGH THIS CLOCK', pad.l + 26, 12.5);
  if (apart) {
    ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath(); ctx.moveTo(pad.l, 22.5); ctx.lineTo(pad.l + 18, 22.5); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.fillText(shallower ? `THE TRANSIT ITSELF, ${pct(depth)} DEEP` : 'THE TRANSIT ITSELF', pad.l + 26, 25.5);
  }
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

/* ---------------- each paper against the clock ---------------- */
/* How a paper stands to a clock. inside: within its own error and the clock's together, where the clock's
   window at that orbit was narrower than the transit, so it could have missed. wide: within them, but the
   window had grown past the transit (or there is no transit length): landing inside it says nothing.
   same: within them and on the clock's own transit, so it restates the clock and is counted on the clock's
   mark instead of drawn. outside: beyond the two errors, at any orbit. */
export function paperKind(pt, clock, dur) {
  if (Math.abs(pt.z) >= 1) return 'outside';
  if (pt.n === 0) return 'same';                                        // the clock's own transit, timed again and agreeing: a copy, not a test
  return dur && !pt.blind && sigmaAt(clock, pt.n) < dur ? 'inside' : 'wide';
}
const PAPER_NAMES = { inside: 'INSIDE BOTH ERRORS', outside: 'OUTSIDE', wide: 'TOO WIDE TO MISS', off: 'OFF THE SCALE' };

/**
 * Every other published clock of a planet against the clock in use: its mid-time minus what the clock in use
 * predicts for that orbit, by the year of the mid-time. The band is the clock's own 1-sigma error. paper(s): a
 * paper, in words. hover: the solution under the pointer, to be named. Returns what the pointer can reach,
 * [{ x, y, pt }], with .same: how many papers restate the clock's own transit and are counted on its mark.
 */
export function drawOC(ctx, w, h, { planet, clock, paper, hover = null }) {
  const T = tokens();
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  const title = 'EACH PAPER AGAINST THIS CLOCK';
  ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(title, 0, 9);
  const hits = [];
  hits.same = 0;
  const every = clock ? pointsFor(planet, clock) : [];
  if (!every.length) {
    ctx.textAlign = 'center'; ctx.fillText(clock ? 'NO OTHER PUBLISHED CLOCK TO HOLD THIS ONE AGAINST' : 'NO CLOCK PUBLISHED YET', w / 2, h / 2 + 6);
    return hits;
  }
  const dur = durDays(planet), inkOf = { inside: T.gold, outside: T.ice, wide: alpha(T.text, 0.55), off: T.dim };
  const all = every.map((q) => paperKind(q, clock, dur));
  hits.same = all.filter((k) => k === 'same').length;
  const pts = every.filter((_, i) => all[i] !== 'same'), kinds = all.filter((k) => k !== 'same');
  const y0 = yearOfJd(clock.t0), years = [y0, ...pts.map((q) => q.year)];
  const lo = Math.min(...years) - 0.6, hi = Math.max(...years) + 0.6;
  const env = Math.max(...pts.map((q) => sigmaAt(clock, q.n)), clock.sT);
  const mags = pts.map((q) => Math.abs(q.residual) + q.sT).sort((a, b) => a - b), mid = mags.length ? mags[Math.floor((mags.length - 1) / 2)] : env;
  const R = (mags.length ? Math.min(mags[mags.length - 1], Math.max(env * 3, mid * 6)) * 1.18 : 0) || env * 3;      // one far miss does not flatten the rest: it is drawn at the edge
  const offScale = (q) => Math.abs(q.residual) > R;
  // the key: only the marks this drawing holds, beside the title where there is room and under it where there is not
  const present = ['inside', 'outside', 'wide'].filter((k) => kinds.includes(k)).concat(pts.some(offScale) ? ['off'] : []);
  const mark = (k, x, y) => {
    ctx.beginPath();
    if (k === 'off') { ctx.fillStyle = inkOf.off; ctx.moveTo(x - 4, y + 3); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x, y - 4); ctx.closePath(); ctx.fill(); }
    else if (k === 'wide') { ctx.strokeStyle = inkOf.wide; ctx.lineWidth = 1; ctx.arc(x, y, 3, 0, TAU); ctx.stroke(); }
    else { ctx.fillStyle = inkOf[k]; ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  };
  const keyW = present.reduce((a, k) => a + 12 + ctx.measureText(PAPER_NAMES[k]).width + 14, 0) - 14;
  const below = ctx.measureText(title).width + 20 + keyW > w, ky = below ? 21 : 9;
  let kx = below ? 0 : w - keyW;
  for (const k of present) {
    mark(k, kx + 3, ky - 3);
    ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(PAPER_NAMES[k], kx + 12, ky);
    kx += 12 + ctx.measureText(PAPER_NAMES[k]).width + 14;
  }
  const pad = { l: w < 420 ? 84 : 92, r: 10, t: below ? 38 : 26, b: 18 };
  const X = (yr) => pad.l + ((yr - lo) / (hi - lo)) * (w - pad.l - pad.r), zero = (pad.t + h - pad.b) / 2;
  const Y = (days) => zero - (Math.max(-1, Math.min(1, days / R))) * (zero - pad.t - 2);
  // the clock's own error either side of its prediction, widening with every orbit from its own epoch
  ctx.fillStyle = alpha(T.text, 0.06); ctx.beginPath();
  const N = 60, at = (i) => lo + ((hi - lo) * i) / N, sig = (yr) => sigmaAt(clock, epochAt(clock, jdOfYear(yr)));
  for (let i = 0; i <= N; i++) { const yr = at(i); if (i) ctx.lineTo(X(yr), Y(sig(yr))); else ctx.moveTo(X(yr), Y(sig(yr))); }
  for (let i = N; i >= 0; i--) ctx.lineTo(X(at(i)), Y(-sig(at(i))));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, zero + 0.5); ctx.lineTo(w - pad.r, zero + 0.5); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'right';
  ctx.fillText(`${span(R * DAY)} late`, pad.l - 8, pad.t + 8); ctx.fillText('as predicted', pad.l - 8, zero + 3); ctx.fillText(`${span(R * DAY)} early`, pad.l - 8, h - pad.b - 1);
  ctx.textAlign = 'center';
  const stepY = hi - lo > 12 ? 5 : hi - lo > 4 ? 2 : 1;
  for (let yr = Math.ceil(lo / stepY) * stepY; yr <= hi; yr += stepY) ctx.fillText(String(yr), X(yr), h - 4);
  // each paper: its mid-time's own error as a bar, then its mark ringed with the ground. A paper too far off for
  // the scale is a wedge at the edge; one inside a window too wide to miss is a hollow ring.
  let named = null;
  pts.forEach((q, i) => {
    const x = X(q.year), y = Y(q.residual), off = offScale(q), k = kinds[i];
    if (!off) { ctx.strokeStyle = alpha(T.text, 0.45); ctx.beginPath(); ctx.moveTo(x + 0.5, Y(q.residual - q.sT)); ctx.lineTo(x + 0.5, Y(q.residual + q.sT)); ctx.stroke(); }
    ctx.fillStyle = T.void; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    if (off) { const up = q.residual > 0 ? -1 : 1; ctx.fillStyle = k === 'wide' ? inkOf.off : inkOf[k]; ctx.beginPath(); ctx.moveTo(x - 4, y - up * 3); ctx.lineTo(x + 4, y - up * 3); ctx.lineTo(x, y + up * 4); ctx.closePath(); ctx.fill(); }
    else mark(k, x, y);
    hits.push({ x, y, pt: q });
    if (q.s === hover) named = { x, y, q };
  });
  // the clock in use, at its own epoch: drawn last and larger than a paper, so nothing hides it. Its name stands
  // over it, or under the axis where a paper's mark is in the way, with the papers that restate its own transit.
  const cx = X(y0);
  ctx.fillStyle = T.void; ctx.strokeStyle = T.bright; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 6, zero); ctx.lineTo(cx, zero - 6); ctx.lineTo(cx + 6, zero); ctx.lineTo(cx, zero + 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
  const tag = `CLOCK IN USE${hits.same ? `, AND ${hits.same} ${hits.same === 1 ? 'PAPER' : 'PAPERS'} ON THE SAME TRANSIT` : ''}`, tagW = ctx.measureText(tag).width;
  const inside = (x) => Math.max(pad.l + 2, Math.min(w - pad.r - tagW, x));
  const crowded = ([tx, ty]) => hits.some((hh) => hh.x > tx - 7 && hh.x < tx + tagW + 7 && hh.y > ty - 14 && hh.y < ty + 8);
  // over its mark, under it, to its right, to its left: the first place where no paper's mark is under the words
  const places = [[inside(cx - tagW / 2), zero - 11], [inside(cx - tagW / 2), zero + 19], [inside(cx + 11), zero - 11], [inside(cx - 11 - tagW), zero - 11], [inside(cx + 11), zero + 19], [inside(cx - 11 - tagW), zero + 19]];
  const [tagX, tagY] = places.find((pl) => !crowded(pl)) || places[0];
  // the band is named at its wide end, unless the clock's own name reaches that far
  const band = 'ITS OWN ± 1σ', bandW = ctx.measureText(band).width, bandY = Y(sig(hi)) + 9;
  if (zero - Y(sig(hi)) >= 9 && !(tagX + tagW + 8 > w - pad.r - 2 - bandW && Math.abs(tagY - bandY) < 14)) { ctx.textAlign = 'right'; ctx.fillStyle = T.dim; ctx.fillText(band, w - pad.r - 2, bandY); }
  ctx.textAlign = 'left'; words(ctx, tag, tagX, tagY, T.text, T.void);
  if (named) {
    // the paper under the pointer: a ring on its own mark, and its name on the far side of it from the axis
    ctx.strokeStyle = T.bright; ctx.beginPath(); ctx.arc(named.x, named.y, 6.5, 0, TAU); ctx.stroke();
    const text = `${paper(named.q.s)}, ${span(Math.abs(named.q.residual) * DAY)} ${named.q.residual < 0 ? 'early' : 'late'}`, tw = ctx.measureText(text).width;
    ctx.textAlign = 'left';
    words(ctx, text, Math.max(pad.l + 2, Math.min(w - pad.r - tw, named.x - tw / 2)), named.y <= zero ? Math.max(pad.t + 9, named.y - 11) : Math.min(h - pad.b - 4, named.y + 19), T.bright, T.void);
  }
  return hits;
}

/* ---------------- the night ---------------- */
/**
 * The time axis of the night's drawing: only the dark hours of the next day, each stretch of them with an hour
 * of margin either side, side by side with a gap where the day was cut out. night: [[jdFrom, jdTo]] the dark
 * stretches. Returns { segs: [{ a, b, x0, x1 }], X(jd) } where X is NaN for an instant that is not drawn. With
 * no dark hour at all the whole day is one stretch.
 */
export function nightAxis(night, fromJd, x0, x1, gap = 18) {
  const segs = [];
  for (const [a, b] of night) {
    const s = Math.max(fromJd, a - 1 / 24), e = Math.min(fromJd + 1, b + 1 / 24), last = segs[segs.length - 1];
    if (last && s <= last.b) last.b = Math.max(last.b, e); else segs.push({ a: s, b: e });
  }
  if (!segs.length) segs.push({ a: fromJd, b: fromJd + 1 });
  const total = segs.reduce((t, s) => t + (s.b - s.a), 0), room = x1 - x0 - gap * (segs.length - 1);
  let x = x0;
  for (const s of segs) { s.x0 = x; s.x1 = x + (room * (s.b - s.a)) / total; x = s.x1 + gap; }
  const EDGE = 1e-7;                                                 // under a hundredth of a second: an instant at a stretch's own end is on it, whatever the rounding
  const X = (jd) => { for (const s of segs) if (jd >= s.a - EDGE && jd <= s.b + EDGE) return s.x0 + Math.max(0, Math.min(1, (jd - s.a) / (s.b - s.a))) * (s.x1 - s.x0); return NaN; };
  return { segs, X };
}
/* The transits a night's drawing names: of those up in the dark, the few whose stars are brightest (five, or
   three where the drawing is too narrow to hold five names apart). */
export const nightNamed = (rows, count = 5) => rows.filter((r) => r.watchable).sort((a, b) => (a.planet.vmag ?? 99) - (b.planet.vmag ?? 99)).slice(0, count);
/* The trace nearest a point, by its distance to the trace's line and not to its middle, or null beyond reach.
   traces: [{ pts: [{ x, y }] }]. */
export function nearestTrace(traces, x, y, reach = 10) {
  let best = null, bd = reach * reach;
  for (const t of traces) {
    for (let i = 0; i + 1 < t.pts.length || (i === 0 && t.pts.length === 1); i++) {
      const a = t.pts[i], b = t.pts[i + 1] || a, dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const u = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
      const d = (a.x + u * dx - x) ** 2 + (a.y + u * dy - y) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
  }
  return best;
}

/**
 * rows: tonight.js crossings() at a place. fromJd: now. night: [[jdFrom, jdTo]] where the Sun is 12 degrees
 * down or more at the place. clock(jd, withDay): the hour of a Julian date on the visitor's clock, as words,
 * with the day of the week when asked. Only the transits that are up in the dark are drawn, each as the height
 * of its star from its beginning to its end; the few whose stars are brightest are drawn heavier, in bright
 * ink, and named, and the others in the labs' cold ink (ice is kept for a clock's state). hover: the planet
 * under the pointer, to be named with its hour. Returns what the pointer can reach, [{ row, pts }] (nearestTrace
 * reads it), with .named: the names written.
 */
export function drawNight(ctx, w, h, { rows, place, fromJd, night, clock, hover = null }) {
  const T = tokens();
  const pad = { l: 34, r: 10, t: 12, b: 20 };
  const ax = nightAxis(night, fromJd, pad.l, w - pad.r), X = ax.X;
  const Y = (alt) => h - pad.b - (Math.max(0, alt) / 90) * (h - pad.t - pad.b);
  ctx.font = T.fontSm; ctx.lineWidth = 1;
  const hits = [];
  hits.named = [];
  // the dark hours: the sheet's blue again
  ctx.fillStyle = alpha(T.sky, 0.9);
  for (const [a, b] of night) { const xa = X(Math.max(a, fromJd)), xb = X(Math.min(b, fromJd + 1)); if (xb > xa) ctx.fillRect(xa, pad.t, xb - xa, h - pad.t - pad.b); }
  // the hours, named on the visitor's clock
  ax.segs.forEach((s, si) => {
    const perHour = (s.x1 - s.x0) / ((s.b - s.a) * 24), step = perHour >= 22 ? 1 : perHour >= 11 ? 2 : 3, every = perHour * step >= 62 ? 1 : 2;
    let n = 0;
    for (let t = Math.ceil((s.a + 0.5) * 24 / step) * step / 24 - 0.5; t <= s.b + 1e-9; t += step / 24) {
      ctx.strokeStyle = alpha(T.line, 0.9); ctx.beginPath(); ctx.moveTo(X(t) + 0.5, pad.t); ctx.lineTo(X(t) + 0.5, h - pad.b); ctx.stroke();
      if (n++ % every) continue;
      // after the cut the first hour says which day it is
      const text = clock(t, si > 0 && n === 1), half = ctx.measureText(text).width / 2;
      const end = X(t) + half > w - 2, start = X(t) - half < s.x0 - 2;
      ctx.fillStyle = T.dim; ctx.textAlign = end ? 'right' : start ? 'left' : 'center'; ctx.fillText(text, end ? w - 2 : start ? s.x0 : X(t), h - 6);
    }
    // where the day was cut out: two strokes across the foot of the drawing
    if (si > 0) {
      const gx = (ax.segs[si - 1].x1 + s.x0) / 2, gy = h - pad.b;
      ctx.strokeStyle = T.dim; ctx.beginPath();
      for (const dx of [-3, 2]) { ctx.moveTo(gx + dx - 2, gy + 5); ctx.lineTo(gx + dx + 2, gy - 5); }
      ctx.stroke();
    }
  });
  const dark = night.length ? [Math.max(night[0][0], fromJd), Math.min(night[0][1], fromJd + 1)] : null, darkName = 'NIGHT, SUN 12° DOWN';
  if (dark && X(dark[1]) - X(dark[0]) > ctx.measureText(darkName).width + 12) { ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.fillText(darkName, X(dark[0]) + 5, pad.t + 9); }
  // the height of a star, and the height it must keep
  const lastSeg = ax.segs[ax.segs.length - 1];
  for (const alt of [0, WATCH.minAlt, 60, 90]) {
    ctx.strokeStyle = alt === WATCH.minAlt ? alpha(T.bright, 0.45) : alpha(T.line, 0.9);
    for (const s of ax.segs) { ctx.beginPath(); ctx.moveTo(s.x0, Y(alt) + 0.5); ctx.lineTo(s.x1, Y(alt) + 0.5); ctx.stroke(); }
    ctx.fillStyle = T.dim; ctx.textAlign = 'right'; ctx.fillText(`${alt}°`, pad.l - 6, Y(alt) + 3);
  }
  ctx.fillStyle = T.text; ctx.textAlign = 'right'; ctx.fillText('MINIMUM HEIGHT', lastSeg.x1 - 2, Y(WATCH.minAlt) + 11);
  const up = rows.filter((r) => r.watchable);
  if (!up.length) { ctx.fillStyle = T.dim; ctx.textAlign = 'center'; ctx.fillText(night.length ? 'NO TRANSIT IS UP IN THE DARK HERE IN THE NEXT 24 HOURS' : 'NO DARK HOUR HERE IN THE NEXT 24 HOURS', (pad.l + w - pad.r) / 2, pad.t + 30); return hits; }
  // each transit as the height of its star from its beginning to its end; the end of its line is where its name goes
  const trace = (r, colour, width) => {
    const dur = durDays(r.planet); if (!dur) return null;
    const a = r.mid - dur / 2, b = r.mid + dur / 2, n = Math.max(3, Math.ceil((b - a) * 48));
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath();
    let pen = false;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n, alt = altAz(t, r.planet.ra, r.planet.dec, place.lat, place.lon).alt, x = X(t);
      if (alt < 0 || Number.isNaN(x)) { pen = false; continue; }
      if (pen) ctx.lineTo(x, Y(alt)); else ctx.moveTo(x, Y(alt));
      pen = true; pts.push({ x, y: Y(alt) });
    }
    ctx.stroke(); ctx.lineWidth = 1;
    if (pts.length) hits.push({ row: r, pts });
    return pts[pts.length - 1] || null;
  };
  const named = nightNamed(rows, w < 520 ? 3 : 5), held = up.find((r) => r.planet === hover) || null, taken = [];
  const name = (end, text) => {
    if (!end) return;
    hits.named.push(text);
    const tw = ctx.measureText(text).width, flip = end.x + 6 + tw > w - pad.r, x0 = flip ? end.x - 6 - tw : end.x + 6;
    let y = end.y + 3;
    for (let k = 0; k < 5 && taken.some((b) => x0 < b.x + b.w + 4 && x0 + tw + 4 > b.x && Math.abs(y - b.y) < 10); k++) y -= 11;
    y = Math.max(pad.t + 20, y);
    taken.push({ x: x0, y, w: tw });
    ctx.textAlign = 'left'; words(ctx, text, x0, y, T.bright, T.sky);
  };
  for (const r of up) if (!named.includes(r) && r !== held) trace(r, alpha(T.horizon, 0.4), 1);
  const ends = named.filter((r) => r !== held).map((r) => [r, trace(r, alpha(T.bright, 0.9), 2)]);
  for (const [r, end] of ends) name(end, r.planet.name);
  if (held) name(trace(held, T.bright, 2.5), `${held.planet.name}, ${clock(held.mid)}`);
  return hits;
}

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
  ctx.font = T.font;
  const share = (n) => (t && t.real ? `${((100 * n) / t.real).toFixed(0)} %` : '');
  const inside = t && t.real ? `${t.inside1} OF ${t.real} INSIDE 1σ (${share(t.inside1)}, HONEST ERRORS 68 %)` : '';
  const beyond = t && t.real ? `${t.beyond3} BEYOND 3σ, EITHER SIDE (${share(t.beyond3)}, HONEST ERRORS 0.3 %)` : '';
  const wi = ctx.measureText(inside).width, wb = ctx.measureText(beyond).width;
  const narrow = w < 620, stacked = w / 2 + wi / 2 + 20 > w - 10 - wb, pad = { l: 10, r: 10, t: stacked ? 46 : 32, b: 36 };
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
  ctx.fillStyle = T.text; ctx.textAlign = 'center'; ctx.fillText('IF EVERY STATED ERROR WERE HONEST', X(0), base - (bell(0) / cols) * py - 7);
  // the two comparisons, written on the drawing: one line each, in the ink of a label
  if (inside) {
    ctx.font = T.font; ctx.fillStyle = T.bright;
    if (stacked) { ctx.textAlign = 'left'; ctx.fillText(inside, pad.l, 11); ctx.fillText(beyond, pad.l, 26); }
    else { ctx.textAlign = 'center'; ctx.fillText(inside, X(0), 11); ctx.textAlign = 'right'; ctx.fillText(beyond, w - pad.r, 11); }
  }
  ctx.font = T.fontSm;
  ctx.strokeStyle = alpha(T.lineBright, 1); ctx.beginPath(); ctx.moveTo(pad.l, base + 0.5); ctx.lineTo(w - pad.r, base + 0.5); ctx.stroke();
  ctx.fillStyle = T.dim; ctx.textAlign = 'center';
  for (const z of narrow ? [-3, -1, 1, 3] : [-3, -1, 0, 1, 3]) ctx.fillText(z === 0 ? 'on time' : `${z > 0 ? '+' : '−'}${Math.abs(z)}σ`, X(z), base + 13);
  ctx.fillText('ONE DOT A PLANET', X(0), base + 27);
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
