/* ============================================================
   overdue/tonight.js — which planets cross their stars in the
   coming hours, on the visitor's clock and over their horizon.

   Every working clock is carried to the transits that fall in the
   span, each predicted mid-time is turned from its stated standard
   into UTC at Earth (time.js), and its window is the clock's own
   blur plus what the standard leaves unsaid. With a place, the
   star's altitude and the Sun's are taken through the whole
   transit, from its beginning to its end, and the row says
   whether anybody there could watch all of it.

   "Watchable" is a design rule of this lab, stated on the page:
   through the whole transit the star is at least 20 degrees up
   and the Sun at least 12 degrees down; the clock has a lamp of 3
   or more (the window is a third of the transit or less); and no
   other published solution contradicts it. An independent review
   on 2026-11-14 found that the first rule, which looked at the
   star when the transit began and at the Sun in its middle,
   passed 72 of 166 transits over Barcelona that fail when the
   whole transit is looked at.
   ============================================================ */

import { transitsBetween } from './clock.js';
import { toEarthUtc, altAz, sunAltitude, skyAt } from './time.js';
import { durDays } from './data.js';

export const WATCH = { minAlt: 20, maxSun: -12, minLamp: 3, samples: 5 };

/* The state of a clock by its lamp (duration over blur): read, fading below 3, lost below 1. */
export const stateOf = (lamp) => (!Number.isFinite(lamp) ? 'no transit length' : lamp < 1 ? 'lost' : lamp < WATCH.minLamp ? 'fading' : 'read');

/**
 * Why a transit cannot be watched from a place, or '' when it can. altMin: the star's lowest altitude during
 * the transit, in degrees. sunMax: the Sun's highest. lamp: the clock's. disputes: other published solutions
 * that contradict the clock. Each bound is included in "can". The first reason that applies is given.
 */
export function unwatchable({ altMin, sunMax, lamp, disputes }) {
  if (!Number.isFinite(lamp)) return 'no transit length';
  if (lamp < 1) return 'clock lost';
  if (lamp < WATCH.minLamp) return 'clock fading';
  if (disputes > 0) return 'clock disputed';
  if (!Number.isFinite(altMin) || !Number.isFinite(sunMax)) return 'no position';
  if (!(sunMax <= WATCH.maxSun)) return sunMax > -0.833 ? 'daylight' : 'twilight';
  if (!(altMin >= WATCH.minAlt)) return altMin < 0 ? 'star sets' : 'star low';
  return '';
}
export const watchable = (row) => unwatchable(row) === '';

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
      const lamp = dur ? dur / t.sigma : NaN;
      const row = { planet: p, n: t.n, mid: e.jdUtc, sigmaS: t.sigma * 86400, slackS: e.slack, windowS: t.sigma * 86400 + e.slack, lamp, state: stateOf(lamp), disputes: c.disputes || 0 };
      if (place && Number.isFinite(p.ra) && Number.isFinite(p.dec)) {
        // the star's lowest and the Sun's highest from the transit's beginning to its end (its middle alone when the archive gives no length)
        const half = (dur || 0) / 2, k = dur ? WATCH.samples : 1;
        let altMin = Infinity, altMax = -Infinity, sunMax = -Infinity;
        for (let i = 0; i < k; i++) {
          const at = e.jdUtc + (k === 1 ? 0 : -half + (2 * half * i) / (k - 1));
          const alt = altAz(at, p.ra, p.dec, place.lat, place.lon).alt;
          altMin = Math.min(altMin, alt); altMax = Math.max(altMax, alt);
          sunMax = Math.max(sunMax, sunAltitude(at, place.lat, place.lon));
        }
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
    const t = String(v ?? '').trim().replace(',', '.');
    return DECIMAL.test(t) ? Number(t) : NaN;
  };
  const a = read(lat), o = read(lon);
  if (!Number.isFinite(a) || !Number.isFinite(o)) return null;
  if (a < -90 || a > 90 || o < -180 || o > 180) return null;
  return { lat: Math.round(a * 100) / 100, lon: Math.round(o * 100) / 100 };       // a hundredth of a degree is about a kilometre: enough for an altitude, and no finer than needed
}
