/* ============================================================
   exoplanet/tests/overdue.test.mjs — Overdue's clocks and sky.

     node labs/assets/js/exoplanet/tests/overdue.test.mjs

   The astronomy is checked against worked examples in Jean Meeus,
   Astronomical Algorithms (2nd ed., 1998): the Sun on 1992
   October 13 (example 25.a), sidereal time on 1987 April 10
   (examples 12.a and 12.b), and Venus over Washington the same
   evening (example 13.b). The clock is checked against its own
   formula and against cases with a known answer.
   ============================================================ */

import { jdOfMs, msOfJd, taiMinusUtc, ttMinusUtc, sun, romerSeconds, toEarthUtc, standardOf, gmst, altAz, sunAltitude, skyAt, AU_LIGHT_S } from '../overdue/time.js';
import { solution, usable, epochAt, midAt, sigmaAt, lampAt, lostFrom, phaseAt, bandDegrees, grade, transitsBetween, tally } from '../overdue/clock.js';

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} within ${tol}`);

/* ---------------- Julian dates and time scales ---------------- */
near(jdOfMs(Date.UTC(2000, 0, 1, 12)), 2451545.0, 1e-9, 'J2000.0 is JD 2451545.0');
near(jdOfMs(Date.UTC(1987, 3, 10)), 2446895.5, 1e-9, '1987 April 10, 0h UT (Meeus 12.a)');
near(msOfJd(jdOfMs(1234567890123)), 1234567890123, 0.1, 'a time survives the round trip through a Julian date to a tenth of a millisecond (a Julian date held as a double resolves about 0.05 ms)');
ok(taiMinusUtc(jdOfMs(Date.UTC(1972, 0, 1))) === 10 && taiMinusUtc(jdOfMs(Date.UTC(1999, 0, 1))) === 32 && taiMinusUtc(jdOfMs(Date.UTC(1998, 11, 31))) === 31, 'leap seconds: 10 in 1972, 31 then 32 across the start of 1999');
ok(taiMinusUtc(jdOfMs(Date.UTC(2016, 11, 31))) === 36 && taiMinusUtc(jdOfMs(Date.UTC(2017, 0, 1))) === 37 && taiMinusUtc(jdOfMs(Date.UTC(2039, 0, 1))) === 37, 'leap seconds: 37 from 2017, and held for later dates');
near(ttMinusUtc(jdOfMs(Date.UTC(2026, 10, 14))), 69.184, 1e-9, 'TT minus UTC in 2026');

/* ---------------- the Sun (Meeus 25.a) ---------------- */
{
  const s = sun(2448908.5);
  near(s.lon, 199.90988, 2e-4, 'the Sun\'s true longitude on 1992 October 13');
  near(s.R, 0.99766, 2e-5, 'its distance in au');
  near(s.ra, 198.38083, 3e-4, 'its apparent right ascension');
  near(s.dec, -7.78507, 3e-4, 'its apparent declination');
  near(s.lonJ2000, 199.90988 + 0.01397 * 7.2183436, 3e-4, 'its longitude referred to J2000, 7.2 years earlier than 2000');
}

/* ---------------- sidereal time and altitude (Meeus 12.a, 12.b, 13.b) ---------------- */
near(gmst(2446895.5), (13 + 10 / 60 + 46.3668 / 3600) * 15, 1e-5, 'mean sidereal time at Greenwich, 1987 April 10, 0h UT');
near(gmst(jdOfMs(Date.UTC(1987, 3, 10, 19, 21, 0))), (8 + 34 / 60 + 57.0896 / 3600) * 15, 1e-5, 'the same at 19h21m UT');
{
  const ra = (23 + 9 / 60 + 16.641 / 3600) * 15, dec = -(6 + 43 / 60 + 11.61 / 3600);
  const lat = 38 + 55 / 60 + 17 / 3600, lon = -(77 + 3 / 60 + 56 / 3600);
  const v = altAz(jdOfMs(Date.UTC(1987, 3, 10, 19, 21, 0)), ra, dec, lat, lon);
  near(v.alt, 15.1249, 0.003, 'Venus over Washington: altitude');     // the book uses apparent sidereal time, a 0.001 degree difference
  near(v.az, 68.0337 + 180, 0.003, 'Venus over Washington: azimuth, turned from the book\'s south-westward count');
  near(v.hourAngle, 64.352133, 0.003, 'its hour angle');
}
{ // a star on the meridian is at altitude 90 - |lat - dec|; a circumpolar star never sets
  const t = jdOfMs(Date.UTC(2026, 10, 14, 22));
  const lst = gmst(t) + 2.17;                       // Barcelona's longitude
  near(altAz(t, lst, 20, 41.39, 2.17).alt, 90 - (41.39 - 20), 1e-6, 'a star crossing the meridian stands at 90 minus the gap between latitude and declination');
  let low = 90;
  for (let h = 0; h < 24; h += 0.5) low = Math.min(low, altAz(t + h / 24, 0, 80, 41.39, 2.17).alt);
  ok(low > 30, 'a star at declination +80 never sets from latitude 41');
  ok(sunAltitude(jdOfMs(Date.UTC(2026, 5, 21, 12, 0)), 41.39, 2.17) > 70, 'the Sun stands high over Barcelona at midsummer noon');
  ok(sunAltitude(jdOfMs(Date.UTC(2026, 5, 21, 0, 0)), 41.39, 2.17) < -20, 'and far below it at midnight');
  ok(skyAt(5) === 'day' && skyAt(-3) === 'civil twilight' && skyAt(-9) === 'nautical twilight' && skyAt(-15) === 'astronomical twilight' && skyAt(-30) === 'night', 'the sky is named by the Sun\'s altitude');
}

/* ---------------- light-travel time across Earth's orbit ---------------- */
{
  const t = 2461358.5;                              // 2026 November 14
  const s = sun(t);
  // toward the Sun (as seen from Earth): the light passes Earth, then the Sun. Away from it: the reverse.
  near(romerSeconds(t, s.ra, s.dec), -s.R * AU_LIGHT_S, 1.5, 'a star behind the Sun: its light reaches the Sun a full au later than Earth... with the sign of Earth being on the far side');
  near(romerSeconds(t, (s.ra + 180) % 360, -s.dec), s.R * AU_LIGHT_S, 1.5, 'a star opposite the Sun: Earth is 1 au nearer to it than the Sun is');
  near(romerSeconds(t, 270, 66.5607), 0, 2, 'a star at the pole of the ecliptic: no difference');
  let max = 0;
  for (let d = 0; d < 366; d += 3) for (let ra = 0; ra < 360; ra += 30) for (let dec = -80; dec <= 80; dec += 20) max = Math.max(max, Math.abs(romerSeconds(2461000 + d, ra, dec)));
  ok(max > 480 && max < 510, `the correction never exceeds the light time of Earth's orbit radius (largest found ${max.toFixed(1)} s)`);
  // a barycentric TDB date becomes an Earth UTC date by both corrections
  const e = toEarthUtc(2461358.75, 'BJD-TDB', 330.795, 18.884);
  near((2461358.75 - e.jdUtc) * 86400, 69.184 + romerSeconds(2461358.75, 330.795, 18.884), 0.05, 'BJD-TDB to UTC at Earth: the scale difference plus the light-travel term');
  near((2461358.75 - toEarthUtc(2461358.75, 'BJD-UTC', 330.795, 18.884).jdUtc) * 86400, romerSeconds(2461358.75, 330.795, 18.884), 0.05, 'BJD-UTC: the light-travel term alone');
  ok(standardOf('bjd_tdb') === standardOf('BJD-TDB') && standardOf('BJD TDB').slack === 0, 'a standard is read whatever its punctuation');
  ok(standardOf('BJD').slack === 69 && standardOf('JD').slack > 500 && standardOf('something else') === standardOf('JD'), 'what a standard leaves unsaid is carried as slack; an unknown one is read as a bare JD');
  ok(e.slack === 5 && toEarthUtc(2461358.75, 'JD', 0, 0).slack === 573, 'the slack includes this file\'s own 5 seconds');
}

/* ---------------- the clock ---------------- */
{
  const s = solution([2455000, 0.001, 3.5, 0.00001, 0, 2010, 0, 1]);
  ok(usable(s) && !usable(solution([55000, 0.001, 3.5, 0.00001])) && !usable(solution([2455000, 0, 3.5, 0.00001])) && !usable(solution([2455000, 0.001, 3.5, null])) && !usable(null), 'a clock needs a full Julian date, a period and both errors');
  ok(epochAt(s, 2455000 + 3.5 * 100 + 1) === 100 && epochAt(s, 2455000 - 3.5 * 7 - 1.7) === -7, 'the nearest transit to a time');
  near(midAt(s, 100), 2455350, 1e-9, 'transit 100 is a hundred periods on');
  near(sigmaAt(s, 0), 0.001, 1e-15, 'at its own epoch the blur is the mid-time error');
  near(sigmaAt(s, 1000), Math.sqrt(0.001 ** 2 + (1000 * 0.00001) ** 2), 1e-15, 'after n orbits: the root of the two terms squared');
  ok(sigmaAt(s, -1000) === sigmaAt(s, 1000), 'the blur grows the same way backward in time');
  const dur = 3 / 24;
  near(lampAt(s, 2455000, dur), dur / 0.001, 1e-9, 'the lamp is duration over blur');
  const lost = lostFrom(s, dur);
  near(lampAt(s, lost, dur), 1, 2e-3, 'on the day it is lost the lamp is one');
  ok(lampAt(s, lost - 400, dur) > 1 && lampAt(s, lost + 400, dur) < 1, 'before that day the lamp is above one, after it below');
  ok(lostFrom(solution([2455000, 0.2, 3.5, 0.00001]), dur) === 2455000, 'a clock whose mid-time error is longer than the transit was lost when it was published');
  near(phaseAt(s, 2455000 + 3.5 * 12.25), 0.25, 1e-9, 'a quarter of an orbit after a transit');
  near(phaseAt(s, 2455000 - 3.5 * 0.25), 0.75, 1e-9, 'and a quarter before one');
  near(bandDegrees(s, 2455000, 1), (2 * 0.001 / 3.5) * 360, 1e-12, 'the band is two sigma wide at one sigma each side, as a share of the orbit');
  ok(bandDegrees(solution([2455000, 0.001, 3.5, 0.1]), 2455000 + 3.5 * 5000, 1) === 360, 'and closes at a full turn');
  const tr = transitsBetween(s, 2455000 + 0.1, 2455000 + 10.6);
  ok(tr.length === 3 && tr[0].n === 1 && tr[2].n === 3 && Math.abs(tr[1].mid - 2455007) < 1e-9, 'three transits fall in ten and a half days of a 3.5-day orbit');
  ok(transitsBetween(s, 2455000, 2455000).length === 1 && transitsBetween(s, 2455000.1, 2455003.4).length === 0, 'the ends of the span are included; a span between two transits is empty');
}

/* ---------------- grading one clock against a later one ---------------- */
{
  const older = solution([2455000, 0.001, 3.5, 0.00002, 0, 2010, 0, 0]);
  const exact = solution([2455000 + 3.5 * 500, 0.0005, 3.5, 0.000001, 1, 2016, 0, 0]);
  const g = grade(older, exact);
  ok(g.n === 500 && Math.abs(g.residual) < 1e-9 && Math.abs(g.z) < 1e-6 && g.real, 'a later mid-time exactly on the prediction has z of zero');
  near(g.sigma, Math.hypot(Math.hypot(0.001, 500 * 0.00002), 0.0005), 1e-15, 'the combined uncertainty is the carried blur and the newer mid-time error together');
  const late = solution([2455000 + 3.5 * 500 + 3 * g.sigma, 0.0005, 3.5, 0.000001, 1, 2016, 0, 0]);
  near(grade(older, late).z, 3, 1e-6, 'a mid-time three combined sigmas late has z of three');
  const quoted = solution([2455000 + 3.5 * 2, 0.001, 3.5, 0.00002, 2, 2013, 0, 0]);
  ok(!grade(older, quoted).real, 'a later paper that quotes a transit two orbits on is no test');
  const t = tally([{ older, newer: exact, sameStandard: true }, { older, newer: late, sameStandard: false }, { older, newer: quoted, sameStandard: true },
    { older, newer: solution([2455000 + 3.5 * 500 + 4 * g.sigma, 0.0005, 3.5, 0.000001]), sameStandard: true }]);
  ok(t.pairs === 4 && t.real === 3 && t.inside1 === 1 && t.beyond3 === 1 && t.same === 2 && t.sameInside1 === 1 && t.sameBeyond3 === 1, 'the tally counts real tests, those inside one sigma and those beyond three, and the same for pairs in one standard');
}

if (fails.length) { console.log(`overdue tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`overdue tests: ${passed} passed, 0 failed`);
