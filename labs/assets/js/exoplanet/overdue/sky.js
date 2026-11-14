/* ============================================================
   overdue/sky.js — kept light.

   Every transiting planet is a lamp on the real sky, and the lamp
   is only as bright as its clock is kept. A light stands where
   the archive says its star is. Its brightness is the number of
   times the transit fits inside the error of its predicted time
   on the date shown. Nothing is drawn that the two files do not
   hold.

   A lamp comes on when its first clock is published and brightens
   whenever a later paper narrows it. Left alone it dims, because
   the error of a period is multiplied by every orbit. When the
   error is longer than the transit the lamp goes to ash: a grey
   ring where a light was, which is the honest picture of a planet
   nobody can point a telescope at on the right night.

   Time is the only thing a visitor holds. One line runs from the
   first transit ever timed to 2040, and everything on the sheet
   is drawn at the date under it: the sky, the count, the one
   clock being read. Past the present nothing is measured, so
   nothing brightens; the right-hand side of the sheet is what
   happens if nobody looks again.

   Gold is a clock that can be read: a lamp of three or more.
   Paler is fading. Ash is lost. No light is larger than a few
   pixels, so the field reads as a sky first and as a chart
   second, and where lamps crowd they add, so the Kepler field
   glows because it is dense and for no other reason. Two great
   circles, the ecliptic and the plane of the Galaxy, are the only
   construction lines: they explain where the surveys looked.

   The sheet ignites: lamps come on in the order they were found,
   and then the sky holds still except where a planet is crossing
   its star now, which shows as a notch in its light. Under
   reduced motion the finished sky is drawn once.

   This file is the geometry and the history, with no drawing in
   it, so each rule can be tested: the map, the two circles, the
   lens over the Kepler field, which clock was the best one known
   on a date, and the count of lamps through the years.
   ============================================================ */

import { epochAt, sigmaAt, jdOfYear, yearOfJd } from './clock.js';
import { durDays } from './data.js';

const RAD = Math.PI / 180;
export const FIRST_YEAR = 1999, LAST_YEAR = 2040;
export const MAP_CENTRE_RA = 0;                   // the middle of the map: 0h of right ascension, the usual centre of an all-sky chart
export const KEPLER = { ra: 290.667, dec: 44.5, radius: 9 };      // the centre of the Kepler field and the half-width of its lens, degrees
const EPS = 23.4392911 * RAD;                     // obliquity of the ecliptic, J2000
const NGP = { ra: 192.85948 * RAD, dec: 27.12825 * RAD, l: 122.93192 * RAD };      // north galactic pole and the longitude of the celestial pole, J2000

/* ---------------- the map ---------------- */
/* Hammer's equal-area map of the whole sky, seen from inside: right ascension grows to the left. Returns x in
   [-1, 1] and y in [-0.5, 0.5], y up. Equal-area, so a crowd of lamps is a crowd on the sky and not an artefact. */
export function hammer(raDeg, decDeg, centre = MAP_CENTRE_RA) {
  const l = ((raDeg - centre + 540) % 360) - 180;                   // east of the centre, -180 to 180
  const lam = -l * RAD, phi = decDeg * RAD;
  const d = Math.sqrt(1 + Math.cos(phi) * Math.cos(lam / 2));
  return { x: (Math.cos(phi) * Math.sin(lam / 2)) / d, y: Math.sin(phi) / (2 * d) };
}

/* A point of the ecliptic by its longitude, and of the Galaxy by its longitude and latitude, as right ascension
   and declination in degrees (J2000). */
export function eclipticToEquatorial(lonDeg) {
  const l = lonDeg * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(EPS), Math.cos(l)) / RAD;
  return { ra: (ra + 360) % 360, dec: Math.asin(Math.sin(EPS) * Math.sin(l)) / RAD };
}
export function galacticToEquatorial(lDeg, bDeg = 0) {
  const l = lDeg * RAD, b = bDeg * RAD;
  const sinDec = Math.sin(NGP.dec) * Math.sin(b) + Math.cos(NGP.dec) * Math.cos(b) * Math.cos(NGP.l - l);
  const y = Math.cos(b) * Math.sin(NGP.l - l);
  const x = Math.cos(NGP.dec) * Math.sin(b) - Math.sin(NGP.dec) * Math.cos(b) * Math.cos(NGP.l - l);
  return { ra: ((NGP.ra + Math.atan2(y, x)) / RAD + 360) % 360, dec: Math.asin(sinDec) / RAD };
}

/* A great circle as runs of map points, broken where it leaves one edge of the map and enters the other. */
export function circleOnMap(pointAt, steps = 240) {
  const runs = [[]];
  let last = null;
  for (let i = 0; i <= steps; i++) {
    const q = pointAt((360 * i) / steps), m = hammer(q.ra, q.dec);
    if (last && Math.abs(m.x - last.x) > 0.5) runs.push([]);
    runs[runs.length - 1].push(m);
    last = m;
  }
  return runs.filter((r) => r.length > 1);
}

/* The lens: a flat patch of sky around a centre (gnomonic), east to the left. Returns x and y in units of the
   lens's radius, and whether the point is inside it. */
export function lens(raDeg, decDeg, centre = KEPLER) {
  const a = (raDeg - centre.ra) * RAD, d = decDeg * RAD, d0 = centre.dec * RAD;
  const D = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  if (D <= 0) return { x: 0, y: 0, inside: false };
  const xi = (Math.cos(d) * Math.sin(a)) / D, eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / D;
  const R = Math.tan(centre.radius * RAD);
  const x = -xi / R, y = eta / R;
  return { x, y, inside: x * x + y * y <= 1 };
}

/* ---------------- which clock was the best one known ---------------- */
/* The Julian date from which a solution was there to be used: the day its paper appeared. A row with no true
   date (an archive row, an ExoFOP row) is taken as known from its own mid-transit time, the earliest it can
   have been measured; the page says so. */
export const knownFrom = (s) => (s.pub != null ? jdOfYear(s.pub) : s.t0);

/**
 * The clocks a planet has been read by, in order: [{ from, s }], each the best one known from that Julian date
 * until the next. A later solution takes over when its error, on the day it appears, is smaller than the error
 * of the one in use. The working clock (the one the build chose, with the other papers in mind) takes over from
 * the day it appears and stays: what is known today is not second-guessed by a narrower outlier.
 * asOf: the Julian date the archive was read. A paper it lists was known by then, whatever date it carries
 * (a journal issue is sometimes dated ahead), so no clock is dated later than that.
 */
export function historyOf(p, asOf = Infinity) {
  const working = p.clock;
  const sols = (p.sols && p.sols.length ? p.sols : working ? [working] : []).map((s) => ({ from: Math.min(asOf, knownFrom(s)), s })).sort((a, b) => a.from - b.from);
  const out = [];
  for (const c of sols) {
    const best = out[out.length - 1];
    if (!best || sigmaAt(c.s, epochAt(c.s, c.from)) < sigmaAt(best.s, epochAt(best.s, c.from))) out.push(c);
  }
  if (working) {
    const same = sols.find((c) => c.s.t0 === working.t0 && c.s.P === working.P);
    const from = same ? same.from : Math.min(asOf, knownFrom(working));
    while (out.length && out[out.length - 1].from >= from) out.pop();
    out.push({ from, s: working });
  }
  return out;
}

/* The clock a planet is read by on a date, or null before its first one. hist is historyOf(p). */
export function clockAt(hist, jd) {
  let best = null;
  for (const h of hist) { if (h.from <= jd) best = h.s; else break; }
  return best;
}

/* The lamp of a planet on a date: its transit's length over the error of the best clock known. NaN when the
   archive gives no transit length, null before the planet has a clock. */
export function lampOn(p, hist, jd) {
  const s = clockAt(hist, jd);
  if (!s) return null;
  const dur = durDays(p);
  return dur ? dur / sigmaAt(s, epochAt(s, jd)) : NaN;
}

/* Whether a planet is in front of its star at an instant, by a clock: within half a transit of a predicted middle. */
export function inTransit(s, jd, dur) {
  if (!s || !dur) return false;
  const f = ((jd - s.t0) / s.P) % 1, phase = f < 0 ? f + 1 : f;
  return Math.min(phase, 1 - phase) * s.P <= dur / 2;
}

/**
 * The catalogue through the years: for each step, how many planets with a transit length have a clock that can
 * be read (lamp 3 or more), is fading (1 to 3) or is lost (below 1), and how many have no clock yet.
 * planets: [{ p, hist }]. Returns { years, read, fading, lost, unlit }.
 */
export function census(planets, from = FIRST_YEAR, to = LAST_YEAR, step = 0.25) {
  const timed = planets.filter((x) => durDays(x.p));
  const out = { years: [], read: [], fading: [], lost: [], unlit: [] };
  for (let y = from; y <= to + 1e-9; y += step) {
    const jd = jdOfYear(y);
    let read = 0, fading = 0, lost = 0, unlit = 0;
    for (const x of timed) {
      const l = lampOn(x.p, x.hist, jd);
      if (l === null) unlit++; else if (l < 1) lost++; else if (l < 3) fading++; else read++;
    }
    out.years.push(y); out.read.push(read); out.fading.push(fading); out.lost.push(lost); out.unlit.push(unlit);
  }
  return out;
}

/**
 * The error of the best clock known for one planet through the years, as the line the sheet draws: points
 * { year, sigma, s } sampled between `from` and `to`, with a point on each side of every day a new clock takes
 * over, so the line drops straight down there.
 */
export function errorLine(hist, from = FIRST_YEAR, to = LAST_YEAR, step = 0.1) {
  if (!hist.length) return [];
  const pts = [];
  const add = (jd, s) => pts.push({ year: yearOfJd(jd), sigma: sigmaAt(s, epochAt(s, jd)), s });
  const start = Math.max(jdOfYear(from), hist[0].from), end = jdOfYear(to);
  for (let i = 0; i < hist.length; i++) {
    const a = Math.max(start, hist[i].from), b = i + 1 < hist.length ? Math.min(end, hist[i + 1].from) : end;
    if (b <= a) continue;
    const n = Math.max(2, Math.ceil((yearOfJd(b) - yearOfJd(a)) / step) + 1);
    for (let k = 0; k < n; k++) add(a + ((b - a) * k) / (n - 1), hist[i].s);
  }
  return pts;
}

/* ---------------- one transit as light ---------------- */
/**
 * What a transit looks like when its time is uncertain: the dip a telescope would record on average, at times
 * measured from the predicted middle. deficit(t): the share of the star's light the planet hides at hours t from
 * the true middle (0 outside the transit). sigmaH: the 1-sigma error of the predicted time, hours. The dip is the
 * true one spread by that error, so a kept clock shows the transit itself and a lost one shows almost nothing.
 * periodH caps the spread: an error of half an orbit or more hides the same share at every hour.
 */
export function smearedDip(deficit, durH, sigmaH, periodH, tHours) {
  const half = durH / 2;
  if (!(sigmaH > 0)) return tHours.map((t) => deficit(t));
  const N = 60, total = (() => { let a = 0; for (let i = 0; i < N; i++) a += deficit(-half + (durH * (i + 0.5)) / N) * (durH / N); return a; })();
  if (sigmaH >= periodH / 2) return tHours.map(() => total / periodH);
  if (sigmaH < durH / 8) {
    // an error much shorter than the transit: step across the error, where the bell is, and not across the transit
    const M = 41, dz = 8 / (M - 1), w = Array.from({ length: M }, (_, i) => { const z = -4 + i * dz; return Math.exp(-0.5 * z * z); }), sum = w.reduce((a, b) => a + b, 0);
    return tHours.map((t) => { let a = 0; for (let i = 0; i < M; i++) a += deficit(t - (-4 + i * dz) * sigmaH) * w[i]; return a / sum; });
  }
  const norm = 1 / (sigmaH * Math.sqrt(2 * Math.PI));
  return tHours.map((t) => {
    let a = 0;
    for (let i = 0; i < N; i++) { const tau = -half + (durH * (i + 0.5)) / N; a += deficit(tau) * norm * Math.exp(-0.5 * ((t - tau) / sigmaH) ** 2) * (durH / N); }
    return a;
  });
}
