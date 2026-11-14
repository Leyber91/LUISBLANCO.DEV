/* ============================================================
   overdue/time.js — when a transit happens on the visitor's own
   clock, and where its star then stands in their sky.

   A published mid-transit time is a Julian date in a time
   standard. Turning it into a clock time on Earth takes two
   corrections, and leaving either out makes every window narrower
   than a few minutes false:

   1. The light-travel time across Earth's orbit. A barycentric
      or heliocentric date is the moment the light passes the
      Sun; it reaches Earth up to 8.3 minutes earlier or later,
      depending on where Earth is on its orbit and where the star
      is in the sky.
   2. The time scale. Barycentric Dynamical Time runs ahead of
      UTC by 32.184 s plus the leap seconds (69.184 s since 2017).

   Accuracy of this file, stated so the page can state it:
   - Earth's position is the low-precision solar theory of Meeus,
     Astronomical Algorithms (2nd ed., 1998), chapter 25, good to
     about 0.01 degree: under half a second of light time.
   - The Sun stands in for the solar system's barycentre. They
     are up to 0.0099 au apart, so a barycentric date is turned
     into Earth time to within about 5 seconds.
   - TDB minus TT (under 2 milliseconds) is ignored.
   - After 2017 no leap second has been announced; the table's
     last value is used for every later date.
   - Altitude ignores refraction and the precession of the star's
     coordinates since 2000 (about a third of a degree in 2026).
   [REAL: formulas and constants from the sources named beside
   each; tests/overdue.test.mjs checks them against the worked
   examples of the same book]
   ============================================================ */

const RAD = Math.PI / 180;
export const DAY_MS = 86400000;
export const AU_LIGHT_S = 499.004784;          // light time for 1 au, seconds (IAU 2012 au, c exact)
export const SUN_BARYCENTRE_S = 5;             // the most the Sun-for-barycentre stand-in can cost, seconds
export const LEAP_DRIFT_S = 5;                 // leap seconds added from 2006 to 2017: what a UTC clock from before them drifts by

/* Julian date (UTC) of a JavaScript time in milliseconds, and back. */
export const jdOfMs = (ms) => ms / DAY_MS + 2440587.5;
export const msOfJd = (jd) => (jd - 2440587.5) * DAY_MS;

/* TAI minus UTC in seconds from 1972, by the date each leap second took effect (IERS Bulletin C). */
const LEAPS = [
  [1972, 1, 10], [1972, 7, 11], [1973, 1, 12], [1974, 1, 13], [1975, 1, 14], [1976, 1, 15], [1977, 1, 16], [1978, 1, 17],
  [1979, 1, 18], [1980, 1, 19], [1981, 7, 20], [1982, 7, 21], [1983, 7, 22], [1985, 7, 23], [1988, 1, 24], [1990, 1, 25],
  [1991, 1, 26], [1992, 7, 27], [1993, 7, 28], [1994, 7, 29], [1996, 1, 30], [1997, 7, 31], [1999, 1, 32], [2006, 1, 33],
  [2009, 1, 34], [2012, 7, 35], [2015, 7, 36], [2017, 1, 37],
].map(([y, m, s]) => [jdOfMs(Date.UTC(y, m - 1, 1)), s]);
export function taiMinusUtc(jdUtc) {
  let s = 10;
  for (const [jd, v] of LEAPS) { if (jdUtc >= jd) s = v; else break; }
  return s;
}
/* Terrestrial Time (and, to 2 ms, Barycentric Dynamical Time) minus UTC, seconds. */
export const ttMinusUtc = (jdUtc) => 32.184 + taiMinusUtc(jdUtc);

const norm360 = (d) => ((d % 360) + 360) % 360;

/**
 * The Sun as seen from Earth at a Julian date in TT (Meeus ch. 25, low precision).
 * lon: geometric longitude, mean equinox of date; lonJ2000: the same referred to J2000;
 * R: distance in au; ra, dec: apparent, of date, degrees.
 */
export function sun(jdTT) {
  const T = (jdTT - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const Mr = M * RAD;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const lon = L0 + C, nu = (M + C) * RAD;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));
  const omega = (125.04 - 1934.136 * T) * RAD;
  const lam = (lon - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;                       // apparent longitude
  const eps0 = 23 + (26 + 21.448 / 60) / 60 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * RAD;
  return {
    lon: norm360(lon), lonJ2000: norm360(lon - 0.01397 * (T * 100)), R,
    ra: norm360(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD),
    dec: Math.asin(Math.sin(eps) * Math.sin(lam)) / RAD,
  };
}

const EPS_J2000 = 23.4392911 * RAD;

/**
 * Seconds by which light from a star at (ra, dec), J2000 degrees, reaches the Sun later than it reaches
 * Earth: positive when Earth is on the star's side of the Sun. Add it to a time at Earth to get the
 * heliocentric time; subtract it from a heliocentric time to get the time at Earth.
 */
export function romerSeconds(jdTT, raDeg, decDeg) {
  const s = sun(jdTT);
  const l = s.lonJ2000 * RAD;
  // Earth from the Sun, equatorial J2000, in au: the opposite of the Sun from Earth
  const ex = -s.R * Math.cos(l), ey = -s.R * Math.sin(l) * Math.cos(EPS_J2000), ez = -s.R * Math.sin(l) * Math.sin(EPS_J2000);
  const a = raDeg * RAD, d = decDeg * RAD;
  return (ex * Math.cos(d) * Math.cos(a) + ey * Math.cos(d) * Math.sin(a) + ez * Math.sin(d)) * AU_LIGHT_S;
}

/* How each stated standard is read. bary: the date is at the Sun or the barycentre, so the light-travel
   term applies. tdb: the scale is TDB. slack: every second the reading may be off by.
     - A barycentric date costs this file's 5 s, because the Sun stands in for the barycentre. A heliocentric
       date is at the Sun itself, so it costs 1 s (the low-precision Sun).
     - "BJD" and "HJD" without a scale are read as TDB and UTC, the usual meaning in the years each was
       common (Eastman, Siverd and Gaudi 2010, PASP 122, 935, on why the scale must be stated); the 69 s
       between the two scales is added to their slack.
     - TCB runs ahead of TDB by 1.55 parts in a hundred million of the time since 1977: 24 s in 2026 and 31 s in
       2040. It is read as TDB and 35 s is added to its slack.
     - A date in UTC that was carried forward with a fixed period ignores the leap seconds added since its
       mid-time: up to 5 s for a clock from before 2009, and that is added to the slack of the UTC standards.
     - A bare "JD" does not say whether it is at Earth or at the Sun: it is read as barycentric TDB, and the
       whole light-travel term at Earth's greatest distance (508 s) plus the scale difference is its slack.
   stated: the name gives both the place and the scale. key: standards that are the same clock to a second.
   The archive's own spellings ("BJD/TDB", "UTC-BJD", and "BJD-TBD", read here as a slip for TDB) are
   brought to these names; anything else is read as a bare JD. */
export const STANDARDS = {
  'BJD-TDB': { key: 'BJD-TDB', stated: true, bary: true, tdb: true, slack: SUN_BARYCENTRE_S },
  'BJD-TT': { key: 'BJD-TDB', stated: true, bary: true, tdb: true, slack: SUN_BARYCENTRE_S },
  'BJD-TCB': { key: 'BJD-TCB', stated: true, bary: true, tdb: true, slack: SUN_BARYCENTRE_S + 35 },
  'BJD-UTC': { key: 'BJD-UTC', stated: true, bary: true, tdb: false, slack: SUN_BARYCENTRE_S + LEAP_DRIFT_S },
  'HJD-UTC': { key: 'HJD-UTC', stated: true, bary: true, tdb: false, slack: 1 + LEAP_DRIFT_S },
  'HJD-TDB': { key: 'HJD-TDB', stated: true, bary: true, tdb: true, slack: 1 },
  BJD: { key: 'BJD', stated: false, bary: true, tdb: true, slack: SUN_BARYCENTRE_S + 69 },
  HJD: { key: 'HJD', stated: false, bary: true, tdb: false, slack: 1 + 69 + LEAP_DRIFT_S },
  JD: { key: 'JD', stated: false, bary: true, tdb: true, slack: 508 + 69 },
};
const ALIAS = { 'UTC-BJD': 'BJD-UTC', 'BJD-TBD': 'BJD-TDB', 'TDB-BJD': 'BJD-TDB' };
export function standardOf(name) {
  const n = String(name || '').trim().toUpperCase().replace(/[_\s/]+/g, '-');
  return STANDARDS[ALIAS[n] || n] || STANDARDS.JD;
}
/* Two solutions state the same clock: each names its place and its scale, and the two are one standard. */
export const sameStated = (a, b) => { const x = standardOf(a), y = standardOf(b); return x.stated && y.stated && x.key === y.key; };

/**
 * The UTC Julian date, at Earth's centre, of an event whose published time is jd in the named standard,
 * for a star at (ra, dec). Returns { jdUtc, slack } with slack in seconds.
 */
export function toEarthUtc(jd, standard, raDeg, decDeg) {
  const st = standardOf(standard);
  let t = jd;
  if (st.tdb) t -= ttMinusUtc(t) / 86400;                 // now on the UTC scale, still at the Sun
  if (st.bary) t -= romerSeconds(t + ttMinusUtc(t) / 86400, raDeg, decDeg) / 86400;
  return { jdUtc: t, slack: st.slack };
}

/* Greenwich mean sidereal time in degrees for a UT Julian date (Meeus eq. 12.4). UT1 and UTC differ by
   under a second, which is 0.004 degree here. */
export function gmst(jdUt) {
  const T = (jdUt - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jdUt - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000);
}

/**
 * Altitude and azimuth in degrees of a point at (ra, dec) seen from latitude lat and longitude lon
 * (degrees, east positive) at a UT Julian date. Azimuth is measured from north through east.
 * (Meeus ch. 13, with the azimuth turned from his south-westward convention.)
 */
export function altAz(jdUt, raDeg, decDeg, latDeg, lonDeg) {
  const H = (gmst(jdUt) + lonDeg - raDeg) * RAD, phi = latDeg * RAD, d = decDeg * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  return { alt: alt / RAD, az: norm360(az / RAD + 180), hourAngle: norm360(H / RAD) };
}

/* The Sun's altitude from a place, and what the sky is called then. */
export function sunAltitude(jdUtc, latDeg, lonDeg) {
  const s = sun(jdUtc + ttMinusUtc(jdUtc) / 86400);
  return altAz(jdUtc, s.ra, s.dec, latDeg, lonDeg).alt;
}
export const skyAt = (sunAlt) => (sunAlt > -0.833 ? 'day' : sunAlt > -6 ? 'civil twilight' : sunAlt > -12 ? 'nautical twilight' : sunAlt > -18 ? 'astronomical twilight' : 'night');
