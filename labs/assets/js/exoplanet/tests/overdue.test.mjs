/* ============================================================
   exoplanet/tests/overdue.test.mjs — Overdue's clocks and sky.

     node labs/assets/js/exoplanet/tests/overdue.test.mjs

   The astronomy is checked against worked examples in Jean Meeus,
   Astronomical Algorithms (2nd ed., 1998): the Sun on 1992
   October 13 (example 25.a), sidereal time on 1987 April 10
   (examples 12.a and 12.b), and Venus over Washington the same
   evening (example 13.b). The clock is checked against its own
   formula and against cases with a known answer, each rule with
   a case just inside and just outside its bound. The last block
   recomputes the numbers the page shows from the two committed
   data files, so a change to the data or to a rule that moves a
   published number fails here first.
   ============================================================ */

import { jdOfMs, msOfJd, taiMinusUtc, ttMinusUtc, sun, romerSeconds, toEarthUtc, standardOf, sameStated, gmst, altAz, sunAltitude, skyAt, AU_LIGHT_S } from '../overdue/time.js';
import { solution, usable, epochAt, midAt, sigmaAt, lampAt, lostFrom, phaseAt, bandDegrees, grade, testOf, transitsBetween, tally, blindAt, BLIND_SHARE, yearOfJd, jdOfYear } from '../overdue/clock.js';
import { planetsOf, attachRecord, pairOf, durDays } from '../overdue/data.js';
import { pointsFor, notATest, recordScale } from '../overdue/views.js';
import { crossings, span, placeOf, watchable, unwatchable, stateOf, shownMs, WATCH } from '../overdue/tonight.js';
import { readFileSync } from 'node:fs';

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
near(yearOfJd(2451545), 2000, 1e-12, 'JD 2451545 is the year 2000.0');
near(jdOfYear(yearOfJd(2460000.25)), 2460000.25, 1e-9, 'a year with a fraction goes back to its Julian date');

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

/* ---------------- light-travel time across Earth's orbit, and the standards ---------------- */
{
  const t = 2461358.5;                              // 2026 November 14
  const s = sun(t);
  // toward the Sun (as seen from Earth): the light passes Earth, then the Sun. Away from it: the reverse.
  near(romerSeconds(t, s.ra, s.dec), -s.R * AU_LIGHT_S, 1.5, 'a star behind the Sun: its light reaches the Sun a full au later than Earth... with the sign of Earth being on the far side');
  near(romerSeconds(t, (s.ra + 180) % 360, -s.dec), s.R * AU_LIGHT_S, 1.5, 'a star opposite the Sun: Earth is 1 au nearer to it than the Sun is');
  near(romerSeconds(t, 270, 66.5607), 0, 2, 'a star at the pole of the ecliptic: no difference');
  let max = 0;
  for (let d = 0; d < 366; d += 3) for (let ra = 0; ra < 360; ra += 30) for (let dec = -80; dec <= 80; dec += 20) max = Math.max(max, Math.abs(romerSeconds(2461000 + d, ra, dec)));
  ok(max > 480 && max < 508, `the correction never exceeds the light time of Earth's greatest distance, 508 s (largest found ${max.toFixed(1)} s)`);
  // a barycentric TDB date becomes an Earth UTC date by both corrections
  const e = toEarthUtc(2461358.75, 'BJD-TDB', 330.795, 18.884);
  near((2461358.75 - e.jdUtc) * 86400, 69.184 + romerSeconds(2461358.75, 330.795, 18.884), 0.05, 'BJD-TDB to UTC at Earth: the scale difference plus the light-travel term');
  near((2461358.75 - toEarthUtc(2461358.75, 'BJD-UTC', 330.795, 18.884).jdUtc) * 86400, romerSeconds(2461358.75, 330.795, 18.884), 0.05, 'BJD-UTC: the light-travel term alone');
  ok(standardOf('bjd_tdb') === standardOf('BJD-TDB') && standardOf('BJD TDB') === standardOf('BJD-TDB') && standardOf(' BJD/TDB ') === standardOf('BJD-TDB'), 'a standard is read whatever its case, spacing or punctuation');
  ok(standardOf('UTC-BJD') === standardOf('BJD-UTC') && standardOf('BJD-TBD') === standardOf('BJD-TDB'), 'the archive\'s own spellings are brought to their standard');
  ok(standardOf('something else') === standardOf('JD') && standardOf('not stated') === standardOf('JD') && standardOf(undefined) === standardOf('JD'), 'an unknown or missing standard is read as a bare JD');
  ok(standardOf('BJD-TDB').slack === 5 && standardOf('BJD-UTC').slack === 5 && standardOf('HJD-UTC').slack === 1 && standardOf('BJD-TCB').slack === 25, 'a barycentric date costs the 5 s of the Sun standing in for the barycentre; a heliocentric one does not; TCB costs 20 s more');
  ok(standardOf('BJD').slack === 74 && standardOf('HJD').slack === 70 && standardOf('JD').slack === 577, 'a date that leaves its scale unsaid carries the 69 s between the scales, and a bare JD the whole light-travel term too');
  ok(max + 69.184 <= standardOf('JD').slack, 'the slack of a bare JD covers the worst case found above');
  ok(e.slack === 5 && toEarthUtc(2461358.75, 'JD', 0, 0).slack === 577 && toEarthUtc(2461358.75, 'HJD', 0, 0).slack === 70, 'the slack returned with a time is the standard\'s own, counted once');
  ok(sameStated('BJD-TDB', 'BJD/TDB') && sameStated('BJD-TDB', 'BJD-TT') && sameStated('HJD-UTC', 'HJD-UTC'), 'two papers state the same clock when each names the place and the scale and they agree');
  ok(!sameStated('BJD', 'BJD') && !sameStated('JD', 'JD') && !sameStated('HJD', 'HJD') && !sameStated('not stated', 'not stated'), 'two papers that each leave the scale unsaid have not said the same thing');
  ok(!sameStated('BJD-TDB', 'BJD-UTC') && !sameStated('BJD-TDB', 'HJD-TDB') && !sameStated('BJD-TDB', 'BJD') && !sameStated(undefined, 'BJD-TDB'), 'nor have two that state different clocks, or one that states none');
}

/* ---------------- the clock ---------------- */
{
  const s = solution([2455000, 0.001, 3.5, 0.00001, 0, 2010, 0, 1]);
  ok(usable(s) && !usable(solution([55000, 0.001, 3.5, 0.00001])) && !usable(solution([2455000, 0, 3.5, 0.00001])) && !usable(solution([2455000, 0.001, 3.5, null])) && !usable(null), 'a clock needs a full Julian date, a period and both errors');
  ok(s.disputes === 0 && solution([2455000, 0.001, 3.5, 0.00001, 0, 2010, 0, 1, 4]).disputes === 4, 'a working clock carries how many other solutions contradict it; a plain solution carries none');
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
  ok(lostFrom(solution([2455000, 0.2, 3.5, 0.00001]), dur) === 2455000, 'a clock whose mid-time error is longer than the transit was lost at its own epoch');
  ok(stateOf(0.99) === 'lost' && stateOf(1) === 'fading' && stateOf(2.99) === 'fading' && stateOf(3) === 'read' && stateOf(NaN) === 'no transit length', 'a clock is lost below a lamp of 1, fading below 3, read from 3');
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
    { older, newer: solution([2455000 + 3.5 * 500 + 4 * g.sigma, 0.0005, 3.5, 0.000001, 1]), sameStandard: true }]);
  ok(t.pairs === 4 && t.real === 3 && t.inside1 === 1 && t.beyond3 === 1 && t.same === 2 && t.sameInside1 === 1 && t.sameBeyond3 === 1, 'the tally counts real tests, those inside one sigma and those beyond three, and the same for pairs in one standard');
  ok(t.topRef === 1 && t.topCount === 3, 'and names the paper that is the newer one most often, with its count');
  ok(tally([]).topRef === null && tally([]).topCount === 0, 'an empty tally names no paper');
}

/* ---------------- a test that could not fail ---------------- */
{
  // a 3-day orbit whose period error is 0.001 d: the carried blur reaches a sixth of the period (0.5 d) at orbit 500
  const older = solution([2455000, 0.001, 3, 0.001, 0, 2010, 0, 0]);
  const at = (n, off = 0) => solution([2455000 + 3 * n + off, 0.0005, 3, 0.000001, 1, 2016, 0, 0]);
  ok(blindAt(older, 0.5) && !blindAt(older, 0.4999) && BLIND_SHARE === 1 / 6, 'an uncertainty of a sixth of the period is blind, and one just under it is not');
  ok(!grade(older, at(499)).blind && grade(older, at(500)).blind && grade(older, at(501)).blind, 'a test is blind from the orbit where the combined uncertainty reaches a sixth of the period');
  ok(Math.abs(grade(older, at(499, 1.49)).z) < 3 && Math.abs(grade(older, at(499, 1.51)).residual) < 1.5, 'no later mid-time is more than half a period from the nearest predicted transit, so a blind test has no three-sigma miss to show');
  const t = tally([{ older, newer: at(499), sameStandard: true }, { older, newer: at(501), sameStandard: true }, { older, newer: at(2000, 1.2), sameStandard: false }]);
  ok(t.pairs === 3 && t.real === 1 && t.blind === 2 && t.inside1 === 1 && t.beyond3 === 0 && t.same === 1 && t.sameInside1 === 1, 'the tally sets blind tests apart: they are in no other count');
}

/* ---------------- what a test is: one definition, each bound from both sides ---------------- */
{
  // JD 2455000 is 2009 June 17 (2009.46). The older paper appears a few weeks later; 3.5-day orbit.
  const sol = (t0, ref, pub, P = 3.5, std = 0) => solution([t0, 0.001, P, 0.00001, ref, pub, std, 0]);
  const clock = sol(2455000, 0, 2009.55);
  const on = (n) => 2455000 + 3.5 * n;                   // orbit 10 is 35 days on: 2009.56, after the paper
  ok(testOf(clock, sol(on(10), 1, 2012)) !== null && testOf(clock, sol(on(500), 1, 2016)).n === 500, 'a different paper, two years on, timing a transit ten orbits on and after the first paper appeared, is a test');
  ok(testOf(clock, sol(on(9), 1, 2012)) === null, 'nine orbits on is the same transits again');
  ok(testOf(clock, sol(on(500), 1, 2011.54)) === null && testOf(clock, sol(on(500), 1, 2011.55)) !== null, 'the newer paper is two years later or more: 1.99 years is no test, 2.00 is');
  ok(testOf(clock, sol(on(500), 0, 2016)) === null, 'a paper does not test itself');
  ok(testOf(clock, sol(on(500), 1, null)) === null && testOf(sol(2455000, 0, null), sol(on(500), 1, 2016)) === null, 'a solution without a publication date takes no part, as the clock or as its test');
  ok(testOf(clock, sol(on(500), null, 2016)) === null, 'nor does one whose paper is not known');
  const late = sol(2455000, 0, 2010.0);                  // the paper appears half a year after its epoch
  ok(testOf(late, sol(on(54), 1, 2013)) === null && testOf(late, sol(on(57), 1, 2013)) !== null, 'a mid-time from before the day the older paper appeared is no test (orbit 54 is 2009.98), and one from after it is (orbit 57 is 2010.01)');
  ok(testOf(null, clock) === null && testOf(clock, null) === null, 'nothing tests nothing');

  const planet = (...sols) => { for (const s of sols) s.stdName = ['BJD-TDB', 'BJD', 'BJD-UTC'][s.std]; return { sols }; };
  ok(pairOf(planet(clock)) === null && pairOf({ sols: null }) === null, 'one dated solution is no pair');
  ok(pairOf(planet(clock, sol(on(500), 0, 2016))) === null && pairOf(planet(clock, sol(on(500), 1, 2011.5))) === null && pairOf(planet(clock, sol(on(500), 1, null))) === null, 'no pair without a different dated paper two years or more later');
  const pr = pairOf(planet(clock, sol(on(300), 1, 2013), sol(on(600), 2, 2016, 3.5, 1)));
  ok(pr && pr.older === clock && pr.newer.ref === 2 && pr.real && !pr.blind && pr.n === 600, 'the pair is the earliest dated solution and the latest paper that tests it');
  ok(!pr.sameStandard && pairOf(planet(clock, sol(on(600), 2, 2016, 3.5, 0))).sameStandard, 'both in BJD-TDB is the same standard; BJD-TDB against a bare BJD is not');
  const skip = pairOf(planet(clock, sol(on(300), 1, 2013), sol(on(5), 2, 2016)));
  ok(skip.real && skip.newer.ref === 1 && skip.n === 300, 'when the latest paper quotes an old transit, the latest paper that does test the clock is taken');
  const none = pairOf(planet(clock, sol(on(5), 1, 2013)));
  ok(none && !none.real && !none.blind && none.newer.ref === 1, 'a later paper that tests nothing is a pair and not a real test');
  ok(pairOf(planet(sol(2455000, 0, 2009.55, 3), solution([2455000 + 3 * 5000, 0.6, 3, 0.00001, 1, 2016, 0, 0]))).blind, 'a pair whose combined uncertainty is a sixth of the period is marked blind');
  ok(durDays({ durH: 3 }) === 0.125 && durDays({ durH: 0 }) === null && durDays({ durH: null }) === null && durDays({}) === null, 'a duration in hours becomes days; none, zero or missing is null');
}

/* ---------------- the record's points: the same definition, and a reason when it is no test ---------------- */
{
  const clock = solution([2455000, 0.001, 3, 0.001, 0, 2009.55, 0, 0]);
  const at = (n, ref, pub, off = 0) => solution([2455000 + 3 * n + off, 0.0005, 3, 0.00001, ref, pub, 0, 0]);
  const sols = [clock, at(9, 1, 2013), at(20, 1, 2013), at(300, 0, 2013), at(600, 2, 2016, 0.4), at(300, 3, null, 0.2), at(300, 4, 2011.0), at(300, 5, 2008)];
  const pts = pointsFor({ sols }, clock);
  ok(pts.length === 7, 'the clock itself is not one of its own points');
  ok(!pts[0].test && pts[0].why === 'its mid-time is fewer than ten orbits on', 'nine orbits on: no test, and why');
  ok(pts[1].test && pts[1].why === '' && !pts[1].blind, 'twenty orbits on, another paper, two years later: a test');
  ok(!pts[2].test && pts[2].why === 'it is from the same paper', 'the clock\'s own paper: no test');
  ok(pts[3].test && pts[3].blind && Math.abs(pts[3].z) < 1, 'a test made after the uncertainty reached a sixth of the orbit is blind, however well it lands');
  ok(!pts[4].test && pts[4].why === 'it has no publication date' && Math.abs(pts[4].residual - 0.2) < 1e-9, 'an undated row is drawn where it found the transit and tests nothing');
  ok(!pts[5].test && pts[5].why === 'it was published less than two years after this clock', 'a paper a year and a half later: no test');
  ok(!pts[6].test && pts[6].why === 'it was published before this clock', 'an earlier paper: no test');
  ok(pointsFor({ sols }, solution([2455000, 0.001, 3, 0.001, 0, null, 0, 0])).every((p) => !p.test && p.why === 'this clock has no publication date'), 'against an undated clock nothing is a test');
  ok(notATest(solution([2455000, 0.001, 3, 0.001, 0, 2012, 0, 0]), at(20, 1, 2015)) === 'its mid-time is from before this clock was published' && notATest(clock, at(20, 1, 2013)) === '', 'a transit from before the clock\'s paper: no test; the reasons end where a test begins');
  ok(pts.every((p) => p.test === (testOf(clock, p.s) !== null)), 'every point agrees with the definition the tally uses');
  const sc = recordScale(600, 300, clock, pts, 0.1);
  ok(sc.half === 1.5 && sc.far === 1.5, 'the record ends at half an orbit however wide the window grows');
  near(sc.yearAt(sc.X(2020)), 2020, 1e-9, 'a pixel on the record goes back to its year');
  ok(sc.Y(0.5) < sc.Y(0) && sc.Y(0) < sc.Y(-0.5), 'a transit found late is drawn above the line, an early one below');
}

/* ---------------- tonight: the rule, the words and the crossings ---------------- */
{
  const fine = { altMin: 20, sunMax: -12, lamp: 3, disputes: 0 };
  ok(watchable(fine) && unwatchable(fine) === '', 'the rule includes each of its bounds');
  ok(unwatchable({ ...fine, altMin: 19.99 }) === 'star low' && unwatchable({ ...fine, altMin: -1 }) === 'star sets', 'a star a hair too low, or below the horizon, fails it');
  ok(unwatchable({ ...fine, sunMax: -11.99 }) === 'twilight' && unwatchable({ ...fine, sunMax: 2 }) === 'daylight', 'a Sun a hair too high, or up, fails it');
  ok(unwatchable({ ...fine, lamp: 2.99 }) === 'clock fading' && unwatchable({ ...fine, lamp: 0.99 }) === 'clock lost' && unwatchable({ ...fine, lamp: NaN }) === 'no transit length', 'a lamp a hair too dim, a lost clock or no transit length fails it');
  ok(unwatchable({ ...fine, disputes: 1 }) === 'clock disputed', 'a clock another solution contradicts fails it');
  ok(unwatchable({ ...fine, altMin: NaN }) === 'no position' && !watchable({ ...fine, sunMax: NaN }), 'a planet with no position is never called watchable');
  ok(WATCH.minAlt === 20 && WATCH.maxSun === -12 && WATCH.minLamp === 3 && WATCH.samples >= 3, 'the rule the page prints is the rule in force');

  ok(span(0.005) === '5.0 ms' && span(0.016) === '16 ms' && span(0.9) === '900 ms', 'under a second is said in milliseconds');
  ok(span(1) === '1.0 s' && span(45) === '45 s' && span(89) === '89 s' && span(90) === '1.5 min', 'seconds up to a minute and a half');
  ok(span(600) === '10 min' && span(5399) === '90 min' && span(5400) === '1.5 h' && span(172799) === '48.0 h', 'minutes up to an hour and a half, hours up to two days');
  ok(span(172800) === '2.0 d' && span(864000) === '10 d' && span(86400 * 730) === '2.0 yr' && span(-45) === '45 s' && span(NaN) === 'not known', 'days up to two years, then years; the sign is dropped and no number is said in words');
  const noon = Date.UTC(2026, 10, 14, 12, 0, 0);
  ok(shownMs(noon + 59900, 600).ms === noon + 60000 && !shownMs(noon + 59900, 600).seconds, 'a time 59.9 seconds past the minute is shown as the next minute');
  ok(shownMs(noon + 29400, 600).ms === noon && shownMs(noon + 30000, 600).ms === noon + 60000, 'it is rounded, at the half minute');
  ok(shownMs(noon + 59900, 59).ms === noon + 60000 && shownMs(noon + 29400, 59).ms === noon + 29000 && shownMs(noon, 59).seconds && !shownMs(noon, 60).seconds, 'a window under a minute is shown to the second, one of a minute or more to the minute');

  const pl = placeOf('41.38617', ' 2,16999 ');
  ok(pl && pl.lat === 41.39 && pl.lon === 2.17, 'a place is read with a comma or a point and kept to a hundredth of a degree');
  ok(placeOf(90, 180) && placeOf(-90, -180) && !placeOf(90.01, 0) && !placeOf(0, -180.01) && !placeOf('941', '2.17'), 'latitude runs to 90 and longitude to 180, both ends included');
  ok(!placeOf('', '2') && !placeOf('41', '') && !placeOf('north', '2') && !placeOf(null, undefined), 'an empty or wordy field is no place');
  ok(!placeOf('0x10', '2') && !placeOf('1e1', '2') && !placeOf('41 N', '2') && placeOf('+41.5', '-.5') && placeOf('41.', '2'), 'only plain decimal numbers are read: no hex, no exponent, no letters');

  const from = 2461358.5;                                   // 2026 November 14, 0h UTC
  const BCN = { lat: 41.39, lon: 2.17 };
  const p = { name: 'x', ra: 100, dec: 20, durH: 3, clock: solution([from + 0.5 - 10 * 100, 0.0002, 10, 0.000002, 0, 2020, 0, 0]) };
  const rows = crossings([p, { name: 'no clock', clock: null }], ['BJD-TDB'], from, 24, BCN);
  ok(rows.length === 1 && rows[0].n === 100, 'one transit of a ten-day orbit falls in the next 24 hours');
  near((from + 0.5 - rows[0].mid) * 86400, 69.184 + romerSeconds(from + 0.5, 100, 20), 0.05, 'its middle is turned from BJD-TDB into UTC at Earth');
  near(rows[0].windowS, Math.hypot(0.0002, 100 * 0.000002) * 86400 + 5, 1e-6, 'its window is the clock\'s blur plus what the standard leaves unsaid');
  ok(Number.isFinite(rows[0].altMin) && rows[0].altMin <= rows[0].altMax && typeof rows[0].sky === 'string' && typeof rows[0].watchable === 'boolean' && rows[0].state === 'read' && rows[0].disputes === 0, 'with a place it carries the star\'s lowest and highest altitude, the sky, the clock\'s state and a verdict');
  ok(rows[0].watchable === (rows[0].why === ''), 'the verdict and its reason agree');
  ok(crossings([p], ['BJD-TDB'], from + 0.51, 24, null).length === 0 && crossings([p], ['BJD-TDB'], from - 0.51, 24, null).length === 0, 'a transit just before the span or just after it is left out');
  const bare = crossings([p], ['BJD-TDB'], from - 0.49, 24, null);
  ok(bare.length === 1 && bare[0].altMin === undefined && bare[0].watchable === undefined && bare[0].state === 'read', 'one just inside it is kept; without a place there is no altitude and no verdict');

  // The whole transit is looked at. A six-hour transit centred two hours after the star crosses the meridian:
  // at its beginning the star is 46 degrees up, at its end 11. The first rule looked at the beginning alone.
  const mid = jdOfMs(Date.UTC(2026, 10, 14, 23, 0, 0)), six = 6 / 24;
  const lst = (t) => gmst(t) + BCN.lon;
  const setting = { name: 'sets', ra: ((lst(mid) - 30) % 360 + 360) % 360, dec: 0, durH: 6, clock: solution([mid - 10 * 50, 0.0002, 10, 0.000002, 0, 2020, 0, 0]) };
  const r1 = crossings([setting], ['BJD-UTC'], mid - 0.5, 24, BCN)[0];
  const startAlt = altAz(r1.mid - six / 2, setting.ra, 0, BCN.lat, BCN.lon).alt;
  ok(startAlt > 40 && r1.altMin < 15 && r1.sunMax < -12 && !r1.watchable && r1.why === 'star low', `a star 46 degrees up when the transit begins and 11 when it ends cannot be watched through it (begins ${startAlt.toFixed(1)}, lowest ${r1.altMin.toFixed(1)})`);
  // A six-hour transit centred at 04:00 UTC ends at 07:00, after sunrise in Barcelona in November, under a star that never sets.
  const dawn = jdOfMs(Date.UTC(2026, 10, 15, 4, 0, 0));
  const morning = { name: 'dawn', ra: 40, dec: 75, durH: 6, clock: solution([dawn - 10 * 50, 0.0002, 10, 0.000002, 0, 2020, 0, 0]) };
  const r2 = crossings([morning], ['BJD-UTC'], dawn - 0.5, 24, BCN)[0];
  ok(sunAltitude(r2.mid, BCN.lat, BCN.lon) < -12 && r2.altMin >= 20 && r2.sunMax > -0.833 && !r2.watchable && r2.why === 'daylight', `a transit whose middle is in the night and whose end is after sunrise cannot be watched through it (Sun at the middle ${sunAltitude(r2.mid, BCN.lat, BCN.lon).toFixed(1)}, highest ${r2.sunMax.toFixed(1)})`);
  // the same star through a three-hour transit at midnight can be watched; with a disputed clock it cannot
  const night = jdOfMs(Date.UTC(2026, 10, 15, 0, 0, 0));
  const good = { name: 'night', ra: 40, dec: 75, durH: 3, clock: solution([night - 10 * 50, 0.0002, 10, 0.000002, 0, 2020, 0, 0]) };
  const r3 = crossings([good], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(r3.watchable && r3.why === '' && r3.sky === 'night', 'a three-hour transit at midnight under a star that never sets can be watched');
  const r4 = crossings([{ ...good, clock: { ...good.clock, disputes: 2 } }], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(!r4.watchable && r4.why === 'clock disputed' && r4.disputes === 2, 'the same transit by a clock that two other solutions contradict cannot');
  const r5 = crossings([{ ...good, durH: null }], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(!r5.watchable && r5.why === 'no transit length' && r5.altMin === r5.altMax, 'a planet with no transit length is looked at in its middle alone and is never called watchable');
}

/* ---------------- the committed data: the page's numbers, recomputed ---------------- */
{
  const dir = new URL('../../../data/exomania/', import.meta.url);
  const cat = planetsOf(JSON.parse(readFileSync(new URL('ephemerides.json', dir), 'utf8')));
  const rec = JSON.parse(readFileSync(new URL('ephemerides-record.json', dir), 'utf8'));
  let refused = 0;
  for (const bad of [null, {}, { refs: [], sols: 5 }, { refs: [], sols: [] }, { refs: 1, sols: rec.sols }, { refs: rec.refs, sols: rec.sols.slice(1) }, { refs: rec.refs, sols: rec.sols.map((x, i) => (i ? x : 5)) }]) {
    try { attachRecord(cat, bad); } catch { refused++; }
  }
  ok(refused === 7 && cat.planets.every((p) => p.sols === null), 'a record that is not the shape this page reads is refused, and nothing is attached');
  attachRecord(cat, rec);
  const P = cat.planets;
  ok(P.length === 4801 && P.every((p) => p.clock) && cat.byName.size === 4801, `4,801 transiting planets, each with a usable working clock and its own name (${P.length}, ${P.filter((p) => p.clock).length}, ${cat.byName.size})`);
  ok(P.every((p) => cat.standards[p.clock.std] && p.sols.every((s) => cat.standards[s.std] && s.stdName === cat.standards[s.std] && (s.ref == null || cat.refs[s.ref]))), 'every clock names a time standard this page knows, and every reference it points at exists');
  ok(P.every((p) => p.sols.filter((s) => s.pub != null).every((s, i, a) => !i || a[i - 1].pub <= s.pub)), 'each planet\'s dated solutions are in order of publication, which the choice of the oldest clock relies on');
  ok(P.every((p) => p.sols.every((s) => s.pub == null || (s.pub > 1995 && s.pub < 2027))), 'every publication date lies between the first transit paper and the day of retrieval');
  ok(cat.refs.every((r) => !/&[a-z]+;|&#\d+;/i.test(r[0])), 'every reference is a name in plain text, with no leftover markup');
  ok(P.every((p) => Number.isInteger(p.clock.disputes) && p.clock.disputes >= 0), 'every working clock says how many other solutions contradict it');
  const timed = P.filter((p) => durDays(p));
  const at = 2461358.5;                                     // 2026 November 14, 0h UTC: the day the page shipped
  const lamps = timed.map((p) => lampAt(p.clock, at, durDays(p)));
  const lost = lamps.filter((l) => l < 1).length, fading = lamps.filter((l) => l >= 1 && l < 3).length;
  const disputed = P.filter((p) => p.clock.disputes > 0).length;
  ok(timed.length === 4729 && lost === 331 && fading === 315, `4,729 have a transit length; on 2026-11-14, 331 are lost and 315 fading (${timed.length}, ${lost}, ${fading})`);
  ok(disputed === 846, `846 working clocks are contradicted by another published solution (${disputed})`);
  const pairs = P.map(pairOf).filter(Boolean);
  const t = tally(pairs.filter((x) => x.real));
  ok(pairs.length === 3601 && t.real === 450 && t.blind === 3, `3,601 planets have a dated paper and another two years or more later; 450 are real tests and 3 more could not fail (${pairs.length}, ${t.real}, ${t.blind})`);
  ok(t.inside1 === 201 && t.beyond3 === 65, `201 later mid-times land inside one sigma and 65 beyond three (${t.inside1}, ${t.beyond3})`);
  ok(t.same === 60 && t.sameInside1 === 18 && t.sameBeyond3 === 10, `of 60 pairs that state the same standard in full, 18 inside and 10 beyond (${t.same}, ${t.sameInside1}, ${t.sameBeyond3})`);
  ok(t.topRef != null && /Kokori/.test(cat.refs[t.topRef][0]) && t.topCount > t.real / 2, `one catalogue is the newer paper in more than half of the tests (${cat.refs[t.topRef] && cat.refs[t.topRef][0]}: ${t.topCount} of ${t.real})`);
  const hd = cat.byName.get('HD 209458 b'), pr = pairOf(hd);
  ok(pr && pr.real && pr.blind && /Charbonneau/.test(cat.refs[pr.older.ref][0]), 'the first transiting planet\'s first clock is one of the three: by its later papers its window had covered the orbit');
  const first = pointsFor(hd, pr.older);
  ok(first.filter((x) => x.test && !x.blind).length === 0 && first.some((x) => /Henry/.test(cat.refs[x.s.ref][0]) && !x.test), 'on plate a nothing tests that clock either: the paper published beside it, timing a transit from before both, is no test');
  ok(/Howard|Bourrier/.test(cat.refs[cat.byName.get('HD 106315 b').clock.ref][0]), 'the working clock of HD 106315 b is one the other papers agree with, where the narrowest error alone picked a row 4.6 days off');
  const now = crossings(P, cat.standards, at, 24, null);
  ok(now.length > 800 && now.length < 1300 && now.every((r, i) => !i || now[i - 1].mid <= r.mid) && now.every((r) => r.mid >= at && r.mid <= at + 1), `about a thousand transits fall in any 24 hours, listed in order of time (${now.length})`);
}

if (fails.length) { console.log(`overdue tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`overdue tests: ${passed} passed, 0 failed`);
