/* ============================================================
   overdue/tonight.js — which planets cross their stars in the
   coming hours, on the visitor's clock and over their horizon.

   Every working clock is carried to the transits that fall in the
   span, each predicted mid-time is turned from its stated standard
   into UTC at Earth (time.js), and its window is the clock's own
   error plus what the standard leaves unsaid. With a place, the
   star's altitude and the Sun's are taken through the whole span
   an observer needs: half an hour before the transit begins to
   half an hour after it ends, and a window further on each side.

   "Up in the dark" is a design rule of this lab, stated on the
   page: through that whole span the star is at least 20 degrees
   up and the Sun at least 12 degrees down; the transit is three
   times its window or longer; and the clock is not contested
   (most other published clocks agree with it). It says where to
   point and when. It does not say that a telescope can see the
   transit: that depends on the star's brightness and the dip's
   depth, which the row gives.

   Where the rule came from. Two independent reviews on 2026-11-14:
   the first rule looked at the star when the transit began and at
   the Sun in its middle, and passed 72 of 166 transits over a test
   place at 41 degrees north that fail when the whole transit is
   looked at; the
   second looked at five instants whatever the length, right for
   the verdict and wrong by up to 23 degrees for the altitudes
   shown on a transit of many hours, so the span is sampled every
   quarter of an hour. And the tool observers use for this, the
   TESS Transit Finder (astro.swarthmore.edu/transits, read
   2026-11-14), asks for out-of-transit baseline before and after,
   half an hour at least, extended by the ephemeris uncertainty:
   a transit cannot be measured without the star's light on either
   side of it.
   ============================================================ */

import { transitsBetween, contested, stateOf } from './clock.js';
import { toEarthUtc, altAz, sunAltitude, skyAt } from './time.js';
import { durDays } from './data.js';

export { stateOf };
export const WATCH = { minAlt: 20, maxSun: -12, minLamp: 3, baselineH: 0.5, stepMin: 15, minSamples: 5, maxSamples: 240 };
/* The place the night is drawn for until a visitor sets their own: an example, named as one on the page. Greenwich,
   because it is the place clocks are set by, and it is nobody's own place. */
export const EXAMPLE_PLACE = { lat: 51.48, lon: 0, name: 'Greenwich' };

/**
 * Why a transit is not up in the dark at a place, or '' when it is. altMin: the star's lowest altitude over the
 * span, in degrees. sunMax: the Sun's highest. lamp: the transit's length over its window. contested: most other
 * published clocks disagree with this one. Each bound is included. The first reason that applies is given.
 */
export function unwatchable({ altMin, sunMax, lamp, contested: disputed }) {
  if (!Number.isFinite(lamp)) return 'no transit length';
  if (lamp < 1) return 'clock lost';
  if (lamp < WATCH.minLamp) return 'window too wide';
  if (disputed) return 'clock contested';
  if (!Number.isFinite(altMin) || !Number.isFinite(sunMax)) return 'no position';
  if (!(sunMax <= WATCH.maxSun)) return sunMax > -0.833 ? 'daylight' : 'twilight';
  if (!(altMin >= WATCH.minAlt)) return altMin < 0 ? 'star sets' : 'star low';
  return '';
}
export const watchable = (row) => unwatchable(row) === '';

/* How many instants a span of days is looked at: one every quarter of an hour, both ends included. */
export const samplesFor = (days) => Math.max(WATCH.minSamples, Math.min(WATCH.maxSamples, Math.ceil((days * 1440) / WATCH.stepMin) + 1));

/**
 * Transits whose predicted middle, at Earth, falls within `hours` after fromJdUtc. place: { lat, lon } in
 * degrees, east positive, or null. Sorted by time.
 */
export function crossings(planets, standards, fromJdUtc, hours = 24, place = null) {
  const to = fromJdUtc + hours / 24;
  const out = [];
  for (const p of planets) {
    const c = p.clock;
    if (!c) continue;
    const dur = durDays(p);
    for (const t of transitsBetween(c, fromJdUtc - 0.02, to + 0.02)) {            // a margin wider than any correction
      const e = toEarthUtc(t.mid, standards[c.std], p.ra ?? 0, p.dec ?? 0);
      if (e.jdUtc < fromJdUtc || e.jdUtc > to) continue;
      const windowS = t.sigma * 86400 + e.slack;
      const lamp = dur ? (dur * 86400) / windowS : NaN;                            // against the window as it is shown: the error and the slack
      const row = { planet: p, n: t.n, mid: e.jdUtc, sigmaS: t.sigma * 86400, slackS: e.slack, windowS, lamp, state: stateOf(lamp), contested: contested(c) };
      if (place && Number.isFinite(p.ra) && Number.isFinite(p.dec)) {
        // from half an hour before the transit begins to half an hour after it ends, and a window further each
        // side (no further than one transit: a clock with a wider window is out whatever the sky does)
        const half = (dur || 0) / 2, pad = dur ? WATCH.baselineH / 24 + Math.min(windowS / 86400, dur) : 0;
        const a = e.jdUtc - half - pad, b = e.jdUtc + half + pad;
        const k = dur ? samplesFor(b - a) : 1;
        let altMin = Infinity, altMax = -Infinity, sunMax = -Infinity;
        for (let i = 0; i < k; i++) {
          const at = k === 1 ? e.jdUtc : a + ((b - a) * i) / (k - 1);
          const alt = altAz(at, p.ra, p.dec, place.lat, place.lon).alt;
          altMin = Math.min(altMin, alt); altMax = Math.max(altMax, alt);
          sunMax = Math.max(sunMax, sunAltitude(at, place.lat, place.lon));
        }
        row.from = a; row.to = b;
        row.altMin = altMin; row.altMax = altMax; row.sunMax = sunMax; row.sky = skyAt(sunMax);
        row.why = unwatchable(row);
        row.watchable = row.why === '';
      }
      out.push(row);
    }
  }
  return out.sort((a, b) => a.mid - b.mid);
}

/* A span of seconds in the unit a person would say it in. */
export function span(seconds) {
  const s = Math.abs(seconds);
  if (!Number.isFinite(s)) return 'not known';
  if (s < 0.95) return `${s < 0.0095 ? (s * 1000).toFixed(1) : Math.round(s * 1000)} ms`;      // a period known to milliseconds is said in milliseconds
  if (s < 90) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  if (s < 5400) return `${(s / 60).toFixed(s < 600 ? 1 : 0)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  if (s < 86400 * 730) return `${(s / 86400).toFixed(s < 864000 ? 1 : 0)} d`;
  return `${(s / (86400 * 365.25)).toFixed(1)} yr`;
}

/* The instant to print for a predicted time, in milliseconds: rounded to the nearest minute, or to the nearest
   second when the window is under a minute, so a time is never shown earlier than it is by more than half a unit. */
export function shownMs(ms, windowS) {
  const unit = windowS < 60 ? 1000 : 60000;
  return { ms: Math.round(ms / unit) * unit, seconds: unit === 1000 };
}

/* A place typed by a visitor: two plain decimal numbers in range, or null. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;
export function placeOf(lat, lon) {
  const read = (v) => {
    if (typeof v === 'number') return v;
    const t = String(v ?? '').trim().replace(',', '.').replace('\u2212', '-');   // the minus sign the page prints (kit/format.js)
    return DECIMAL.test(t) ? Number(t) : NaN;
  };
  const a = read(lat), o = read(lon);
  if (!Number.isFinite(a) || !Number.isFinite(o)) return null;
  if (a < -90 || a > 90 || o < -180 || o > 180) return null;
  return { lat: Math.round(a * 100) / 100, lon: Math.round(o * 100) / 100 };       // a hundredth of a degree is about a kilometre: enough for an altitude, and no finer than needed
}
