/* ============================================================
   overdue/data.js — the two data files as planets with clocks.

   ephemerides.json         one row per transiting planet: its
                            star, its transit and its working clock
   ephemerides-record.json  every published solution, row for row,
                            and the references

   The working clock is the best one anybody has published: the
   narrowest window on the day the data was retrieved (chosen by
   the build script, which says how).

   The test of a planet's oldest clock, as this lab defines it after
   two independent checks of its first definitions:
     older   the earliest-published dated solution;
     newer   the latest-published solution that tests it (clock.js
             testOf: dated, from another paper, two years or more
             later, its mid-time ten or more orbits on and after the
             day the older paper appeared);
     real    there is such a solution;
     blind   a real pair whose combined uncertainty is a sixth of
             the period or more (clock.js): it could not have
             shown a miss, and the tally counts it apart.
   Rows without a publication date take no part: the archive gives
   one date (July 2017) to every ExoFOP row, whose mid-times run
   to 2026, and counting that as "older" had made the first tally
   look better than the clocks are. "The same standard" means that
   both papers name the place and the scale of their dates and the
   two agree (time.js sameStated): two papers that each say only
   "BJD" have not said the same thing.
   ============================================================ */

import { solution, usable, testOf, MIN_YEARS_APART, yearOfJd, jdOfYear } from './clock.js';
import { sameStated } from './time.js';

const HERE = new URL('../../../data/exomania/', import.meta.url);
export const DATA_URLS = { clocks: new URL('ephemerides.json', HERE).href, record: new URL('ephemerides-record.json', HERE).href };
export { MIN_YEARS_APART, yearOfJd, jdOfYear };

/** Planets from the parsed ephemerides.json. */
export function planetsOf(doc) {
  const ix = Object.fromEntries(doc.cols.map((c, i) => [c, i]));
  const planets = doc.rows.map((r, i) => {
    const name = r[ix.pl_name];
    const clock = solution(r[ix.clock]);
    return {
      i, name, host: r[ix.host] === 0 ? name.replace(/\s+\S+$/, '') : r[ix.host], ra: r[ix.ra], dec: r[ix.dec], vmag: r[ix.vmag], dist: r[ix.dist],
      pnum: r[ix.pnum], discYear: r[ix.disc_year], durH: r[ix.dur_h], depthPct: r[ix.depth_pct], aOverRs: r[ix.a_over_rs], aAu: r[ix.a_au],
      rEarth: r[ix.r_earth], ecc: r[ix.ecc], stRad: r[ix.st_rad], stTeff: r[ix.st_teff],
      clock: usable(clock) ? clock : null, sols: null,
    };
  });
  return { meta: doc.meta, standards: doc.standards, planets, byName: new Map(planets.map((p) => [p.name, p])) };
}

/** Attach every published solution to its planet, from the parsed ephemerides-record.json. A record that is
 * not the shape this page was built for is refused, so a broken file never shows as a count of zero. */
export function attachRecord(cat, rec) {
  if (!rec || !Array.isArray(rec.refs) || !Array.isArray(rec.sols) || rec.sols.length !== cat.planets.length || !rec.sols.every(Array.isArray)) {
    throw new Error('the published record is not in the shape this page reads');
  }
  cat.refs = rec.refs;
  cat.planets.forEach((p, i) => {
    p.sols = rec.sols[i].map(solution).filter(usable);
    for (const s of p.sols) s.stdName = cat.standards[s.std];
  });
  return cat;
}

/** The transit's duration in days, or null. */
export const durDays = (p) => (Number.isFinite(p.durH) && p.durH > 0 ? p.durH / 24 : null);

/**
 * The pair that tests this planet's oldest clock. null when no other paper appeared two years or more after
 * the oldest dated one. real: one of those papers tests it (clock.js testOf), and newer is the latest that
 * does; when none does, newer is the latest of them and real is false. blind: by then the two uncertainties
 * together had reached a sixth of the orbit, so that nothing could miss. sameStandard: both state the same
 * clock in full.
 */
export function pairOf(p) {
  const dated = (p.sols || []).filter((s) => s.pub != null);
  if (dated.length < 2) return null;
  const older = dated[0];
  const later = dated.filter((s) => s.ref !== older.ref && s.pub - older.pub >= MIN_YEARS_APART);
  if (!later.length) return null;
  let newer = null, g = null;
  for (let k = later.length - 1; k >= 0 && !g; k--) { g = testOf(older, later[k]); if (g) newer = later[k]; }
  if (!g) return { older, newer: later[later.length - 1], n: 0, real: false, blind: false, sameStandard: false };
  return { older, newer, n: g.n, real: true, blind: g.blind, sameStandard: sameStated(older.stdName, newer.stdName) };
}

/** Fetch both files. onClocks fires when the light one is ready; the promise resolves with the record attached. */
export async function load(onClocks) {
  const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: http ${r.status}`); return r.json(); };
  const recP = get(DATA_URLS.record);
  recP.catch(() => {});                         // reported where it is awaited, never as an unhandled rejection
  const cat = planetsOf(await get(DATA_URLS.clocks));
  if (onClocks) onClocks(cat);
  return attachRecord(cat, await recP);
}
