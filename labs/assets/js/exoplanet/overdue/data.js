/* ============================================================
   overdue/data.js — the two data files as planets with clocks.

   ephemerides.json         one row per transiting planet: its
                            star, its transit and its working clock
   ephemerides-record.json  every published solution, row for row,
                            and the references

   The working clock is the best one anybody has published: the
   narrowest window on the day the data was retrieved (chosen by
   the build script, which says how).

   A test of an older clock by a newer one, as this lab defines it
   after an independent check of its first definition:
     older   the earliest-published dated solution;
     newer   the latest-published dated solution from a different
             paper, at least two years later;
     real    the newer mid-time is ten or more orbits after the
             older one, and later than the day the older paper
             was published.
   Rows without a publication date take no part: the archive gives
   one date (July 2017) to every ExoFOP row, whose mid-times run
   to 2026, and counting that as "older" had made the first tally
   look better than the clocks are.
   ============================================================ */

import { solution, usable, epochAt, YEAR_DAYS, REAL_TEST_ORBITS } from './clock.js';

const HERE = new URL('../../../data/exomania/', import.meta.url);
export const DATA_URLS = { clocks: new URL('ephemerides.json', HERE).href, record: new URL('ephemerides-record.json', HERE).href };
export const MIN_YEARS_APART = 2;

/* A Julian date as a year with a fraction, and back. */
export const yearOfJd = (jd) => 2000 + (jd - 2451545.0) / YEAR_DAYS;
export const jdOfYear = (y) => 2451545.0 + (y - 2000) * YEAR_DAYS;

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

/** Attach every published solution to its planet, from the parsed ephemerides-record.json. */
export function attachRecord(cat, rec) {
  cat.refs = rec.refs;
  cat.planets.forEach((p, i) => { p.sols = (rec.sols[i] || []).map(solution).filter(usable); });
  return cat;
}

/** The transit's duration in days, or null. */
export const durDays = (p) => (Number.isFinite(p.durH) && p.durH > 0 ? p.durH / 24 : null);

/**
 * The pair that tests this planet's oldest clock, or null. real says whether it is a test at all.
 * sameStandard: both solutions state the same time standard.
 */
export function pairOf(p) {
  const dated = (p.sols || []).filter((s) => s.pub != null);
  if (dated.length < 2) return null;
  const older = dated[0];
  let newer = null;
  for (let k = dated.length - 1; k > 0 && !newer; k--) if (dated[k].ref !== older.ref && dated[k].pub - older.pub >= MIN_YEARS_APART) newer = dated[k];
  if (!newer) return null;
  const n = epochAt(older, newer.t0);
  return { older, newer, n, sameStandard: older.std === newer.std, real: n >= REAL_TEST_ORBITS && yearOfJd(newer.t0) > older.pub };
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
