/* ============================================================
   exoplanet/tests/overdue.test.mjs — Overdue's clocks and sky.

     node labs/assets/js/exoplanet/tests/overdue.test.mjs

   The astronomy is checked against worked examples in Jean Meeus,
   Astronomical Algorithms (2nd ed., 1998): the Sun on 1992
   October 13 (example 25.a), sidereal time on 1987 April 10
   (examples 12.a and 12.b), and Venus over Washington the same
   evening (example 13.b). The clock is checked against its own
   formula and against cases with a known answer, each rule with
   a case just inside and just outside its bound. The map is
   checked against the places it must put the galactic centre and
   the solstices. The last block recomputes the numbers the page
   shows from the two committed data files, so a change to the
   data or to a rule that moves a published number fails here
   first.
   ============================================================ */

import { jdOfMs, msOfJd, taiMinusUtc, ttMinusUtc, sun, romerSeconds, toEarthUtc, standardOf, sameStated, gmst, altAz, sunAltitude, skyAt, AU_LIGHT_S } from '../overdue/time.js';
import { solution, usable, contested, epochAt, midAt, sigmaAt, lampAt, lostFrom, phaseAt, bandDegrees, grade, testOf, transitsBetween, tally, blindAt, stateOf, KEPT_LAMP, BLIND_SHARE, yearOfJd, jdOfYear } from '../overdue/clock.js';
import { planetsOf, attachRecord, pairOf, durDays } from '../overdue/data.js';
import { hammer, eclipticToEquatorial, galacticToEquatorial, circleOnMap, lens, knownFrom, historyOf, clockAt, lampOn, inTransit, census, errorLine, smearedDip, isK2, densestField, KEPLER, FIRST_YEAR, LAST_YEAR } from '../overdue/sky.js';
import { pointsFor, notATest, lampMark, skyLayout, lensLayout, onMap, onLens, bandScale, stampOf, dipShape, tallyBin, nightNamed, nightAxis, paperKind, BESIDE, TITLE_ROOM, DIP_APART, SHAPE_APART } from '../overdue/views.js';
import { crossings, span, placeOf, watchable, unwatchable, shownMs, samplesFor, WATCH, EXAMPLE_PLACE } from '../overdue/tonight.js';
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
ok(taiMinusUtc(jdOfMs(Date.UTC(2017, 0, 1))) - taiMinusUtc(jdOfMs(Date.UTC(1999, 6, 1))) === 5, 'five leap seconds were added between the first transit timed and 2017, which is what a UTC clock from before them drifts by');
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
  ok(standardOf('BJD-TDB').slack === 5 && standardOf('BJD-UTC').slack === 10 && standardOf('HJD-UTC').slack === 6 && standardOf('HJD-TDB').slack === 1, 'a barycentric date costs the 5 s of the Sun standing in for the barycentre, a heliocentric one 1 s, and a UTC clock 5 s more for the leap seconds it could not know');
  ok(standardOf('BJD-TCB').slack === 40 && 1.55e-8 * (jdOfYear(2040) - 2443144.5) * 86400 < 35, 'TCB carries 35 s for its drift from TDB, which covers 2040');
  ok(standardOf('BJD').slack === 74 && standardOf('HJD').slack === 75 && standardOf('JD').slack === 577, 'a date that leaves its scale unsaid carries the 69 s between the scales, and a bare JD the whole light-travel term too');
  ok(max + 69.184 <= standardOf('JD').slack, 'the slack of a bare JD covers the worst case found above');
  ok(e.slack === 5 && toEarthUtc(2461358.75, 'JD', 0, 0).slack === 577 && toEarthUtc(2461358.75, 'HJD', 0, 0).slack === 75, 'the slack returned with a time is the standard\'s own, counted once');
  ok(sameStated('BJD-TDB', 'BJD/TDB') && sameStated('BJD-TDB', 'BJD-TT') && sameStated('HJD-UTC', 'HJD-UTC'), 'two papers state the same clock when each names the place and the scale and they agree');
  ok(!sameStated('BJD', 'BJD') && !sameStated('JD', 'JD') && !sameStated('HJD', 'HJD') && !sameStated('not stated', 'not stated'), 'two papers that each leave the scale unsaid have not said the same thing');
  ok(!sameStated('BJD-TDB', 'BJD-UTC') && !sameStated('BJD-TDB', 'HJD-TDB') && !sameStated('BJD-TDB', 'BJD') && !sameStated(undefined, 'BJD-TDB'), 'nor have two that state different clocks, or one that states none');
}

/* ---------------- the clock ---------------- */
{
  const s = solution([2455000, 0.001, 3.5, 0.00001, 0, 2010, 0, 1]);
  ok(usable(s) && !usable(solution([55000, 0.001, 3.5, 0.00001])) && !usable(solution([2455000, 0, 3.5, 0.00001])) && !usable(solution([2455000, 0.001, 3.5, null])) && !usable(null), 'a clock needs a full Julian date, a period and both errors');
  const work = (agree, others) => solution([2455000, 0.001, 3.5, 0.00001, 0, 2010, 0, 1, agree, others]);
  ok(s.agree === 0 && s.others === 0 && work(3, 7).agree === 3 && work(3, 7).others === 7, 'a working clock carries how many other clocks agree with it and how many could be compared; a plain solution carries none');
  ok(!contested(s) && !contested(work(0, 0)) && contested(work(0, 1)) && !contested(work(1, 2)) && contested(work(1, 3)) && !contested(work(2, 3)) && !contested(null), 'a clock is contested when fewer than half of the clocks it could be compared with agree: 1 of 2 is not, 1 of 3 is');
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
  ok(stateOf(0.99) === 'lost' && stateOf(1) === 'slipping' && stateOf(11.99) === 'slipping' && stateOf(12) === 'kept' && stateOf(NaN) === 'no transit length', 'a clock is lost below a lamp of 1, slipping below 12, kept from 12');
  ok(KEPT_LAMP === 12, 'kept is an error of a twelfth of the transit or less: the target the people who keep these clocks have set');
  const slip = lostFrom(s, dur / KEPT_LAMP);
  near(lampAt(s, slip, dur), KEPT_LAMP, 0.05, 'the day a clock slips past the target is the day its lamp is twelve');
  ok(slip < lost && stateOf(lampAt(s, slip - 400, dur)) === 'kept' && stateOf(lampAt(s, slip + 400, dur)) === 'slipping', 'it is kept before that day and slipping after, long before it is lost');
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

/* ---------------- a planet's solutions against its first clock: the same definition, and a reason ---------------- */
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
  ok(!pts[4].test && pts[4].why === 'it has no publication date' && Math.abs(pts[4].residual - 0.2) < 1e-9, 'an undated row is placed where it found the transit and tests nothing');
  ok(!pts[5].test && pts[5].why === 'it was published less than two years after this clock', 'a paper a year and a half later: no test');
  ok(!pts[6].test && pts[6].why === 'it was published before this clock', 'an earlier paper: no test');
  ok(pointsFor({ sols }, solution([2455000, 0.001, 3, 0.001, 0, null, 0, 0])).every((p) => !p.test && p.why === 'this clock has no publication date'), 'against an undated clock nothing is a test');
  ok(notATest(solution([2455000, 0.001, 3, 0.001, 0, 2012, 0, 0]), at(20, 1, 2015)) === 'its mid-time is from before this clock was published' && notATest(clock, at(20, 1, 2013)) === '', 'a transit from before the clock\'s paper: no test; the reasons end where a test begins');
  ok(pts.every((p) => p.test === (testOf(clock, p.s) !== null)), 'every point agrees with the definition the tally uses');
}

/* ---------------- the map of the sky ---------------- */
{
  const c = hammer(0, 0);
  near(c.x, 0, 1e-12, 'right ascension 0h on the equator is the middle of the map'); near(c.y, 0, 1e-12, 'and on its horizontal axis');
  near(hammer(90, 0).x, -Math.sin(Math.PI / 4) / Math.sqrt(1 + Math.cos(Math.PI / 4)), 1e-12, 'a point 6h east of the centre lies to the left, where Hammer\'s formula puts it');
  ok(hammer(90, 0).x < 0 && hammer(270, 0).x > 0 && Math.abs(hammer(90, 0).x + hammer(270, 0).x) < 1e-12, 'east is to the left and west to the right, the same distance out: the sky seen from inside');
  near(hammer(123, 90).y, 0.5, 1e-12, 'the north celestial pole is the top of the map'); near(hammer(123, -90).y, -0.5, 1e-12, 'and the south pole its bottom');
  near(Math.abs(hammer(179.999, 0).x), 1, 1e-4, 'the map\'s edge is 12h from its centre');
  let inside = true;
  for (let ra = 0; ra < 360; ra += 7) for (let dec = -90; dec <= 90; dec += 6) { const m = hammer(ra, dec); if (m.x * m.x + 4 * m.y * m.y > 1 + 1e-9) inside = false; }
  ok(inside, 'every place on the sky falls inside the map\'s ellipse');
  // equal-area: a cap of the sky and the same cap elsewhere cover the same share of the map
  const patch = (ra, dec) => { const d = 0.5, a = hammer(ra - d, dec - d), b = hammer(ra + d, dec - d), e = hammer(ra + d, dec + d), f = hammer(ra - d, dec + d); return Math.abs((a.x * b.y - b.x * a.y) + (b.x * e.y - e.x * b.y) + (e.x * f.y - f.x * e.y) + (f.x * a.y - a.x * f.y)) / 2 / Math.cos((dec * Math.PI) / 180); };
  near(patch(40, 60) / patch(0, 0), 1, 0.002, 'a degree of sky at +60 covers the same area of the map as one at the centre: the map is equal-area');
  near(patch(-150, -45) / patch(0, 0), 1, 0.002, 'and so does one near the edge');

  const sol = eclipticToEquatorial(90), eq = eclipticToEquatorial(180), win = eclipticToEquatorial(270);
  near(sol.ra, 90, 1e-9, 'the ecliptic at longitude 90 is at 6h'); near(sol.dec, 23.4392911, 1e-7, 'and 23.44 degrees north: the summer solstice');
  near(eq.ra, 180, 1e-9, 'at longitude 180 it crosses the equator at 12h'); near(eq.dec, 0, 1e-9, 'on the equator');
  near(win.dec, -23.4392911, 1e-7, 'and at 270 it is 23.44 degrees south');
  const gc = galacticToEquatorial(0, 0), ngp = galacticToEquatorial(0, 90), anti = galacticToEquatorial(180, 0);
  near(gc.ra, 266.405, 0.01, 'the galactic centre is at right ascension 17h 45.6m'); near(gc.dec, -28.936, 0.01, 'and declination -28.94');
  near(ngp.ra, 192.85948, 1e-6, 'the north galactic pole is where it was defined'); near(ngp.dec, 27.12825, 1e-6, 'in declination too');
  near(anti.ra, 86.405, 0.01, 'the anticentre is opposite the centre'); near(anti.dec, 28.936, 0.01, 'in declination too');
  const runs = circleOnMap(eclipticToEquatorial);
  ok(runs.length >= 1 && runs.length <= 3 && runs.every((r) => r.every((m, i) => !i || Math.abs(m.x - r[i - 1].x) < 0.5)), 'a great circle is drawn in runs that never jump across the map');
  ok(runs.reduce((n, r) => n + r.length, 0) >= 240, 'and no part of it is dropped');

  const k0 = lens(KEPLER.ra, KEPLER.dec), up = lens(KEPLER.ra, KEPLER.dec + KEPLER.radius), out = lens(KEPLER.ra, KEPLER.dec + KEPLER.radius + 0.5), east = lens(KEPLER.ra + 3, KEPLER.dec);
  ok(k0.inside && Math.abs(k0.x) < 1e-12 && Math.abs(k0.y) < 1e-12, 'the centre of the Kepler field is the centre of the lens');
  near(up.y, 1, 1e-9, 'a star at the lens\'s radius to the north is on its rim'); ok(up.inside && !out.inside, 'the rim is inside the lens and half a degree beyond it is not');
  ok(east.x < 0 && Math.abs(east.y) < 0.05, 'east is to the left under the lens as on the map');
  ok(!lens(KEPLER.ra + 180, -KEPLER.dec).inside, 'the far side of the sky is not under the lens');

  const wide = skyLayout(1348, 504), narrow = skyLayout(358, 361);
  ok(BESIDE === 1150 && skyLayout(BESIDE, 620).cx - skyLayout(BESIDE, 620).rx >= TITLE_ROOM && skyLayout(1348, 620).cx - skyLayout(1348, 620).rx >= TITLE_ROOM, 'from the width where the name stands beside the map, the map leaves it its room however tall the sheet');
  ok(skyLayout(BESIDE - 1, 620).rx > skyLayout(BESIDE, 620).rx && skyLayout(958, 384).wide, 'below that width the name stands above the map, and the map takes the room');
  ok(wide.lens.r < wide.ry && narrow.lens === null, 'the lens is smaller than the map it enlarges a patch of, and a narrow sheet holds the map alone');
  const own = lensLayout(150, 166), top = onLens(own, { x: 0, y: 1 }), side = onLens(own, { x: 1, y: 0 });
  ok(own.x === 75 && own.y - own.r >= 0 && own.x + own.r <= 150 && own.y + own.r + 13 <= 166 && lensLayout(4, 4).r === 10, 'on a canvas of its own the lens fills the width, leaves room for its name under it, and never has no size');
  near(top.y, own.y - own.r, 1e-9, 'north is up under the lens'); near(side.x, own.x + own.r, 1e-9, 'and its edge is the edge of the disc');
  ok(wide.wide && wide.rx === 2 * wide.ry && wide.cx - wide.rx >= 0 && wide.cy + wide.ry <= 504 && wide.cy - wide.ry >= 0, 'on a wide sheet the whole map is on the canvas');
  ok(wide.lens.x + wide.lens.r <= 1348 && wide.lens.y - wide.lens.r >= 0, 'and so is the lens, at its right shoulder');
  const strip = skyLayout(358, 187);
  ok(!narrow.wide && narrow.cx - narrow.rx >= 0 && strip.cy - strip.ry >= 0 && strip.cy + strip.ry <= 187 && strip.cx + strip.rx <= 358, 'on a narrow one the whole map is on a canvas as tall as the stylesheet makes it at 390 px');
  const px = onMap(wide, hammer(0, 90));
  near(px.y, wide.cy - wide.ry, 1e-9, 'the pole is drawn at the top of the ellipse');
  const sc = bandScale(1000, 214);
  near(sc.X(FIRST_YEAR), sc.pad.l, 1e-9, 'the band begins at the first year'); near(sc.X(LAST_YEAR), 1000 - sc.pad.r, 1e-9, 'and ends at the last');
  near(sc.yearAt(sc.X(2020)), 2020, 1e-9, 'a pixel of the band goes back to its year');
  ok(!sc.narrow && bandScale(358, 206).narrow && bandScale(358, 206).X(LAST_YEAR) <= 358 - 60 && sc.X(LAST_YEAR) <= 1000 - 60, 'at every width the line leaves a margin on the right for the names of what its lines reach');
  ok(stampOf(Date.UTC(2026, 10, 14)) === '14 NOV 2026' && stampOf(Date.UTC(1999, 0, 1)) === '1 JAN 1999', 'the date stamped on the line is the day, the month in three letters and the year');
}

/* ---------------- which clock was the best one known, and the lamps ---------------- */
{
  const s = (t0, sT, sP, ref, pub) => solution([t0, sT, 3, sP, ref, pub, 0, 0]);
  const a = s(2455000, 0.002, 0.0001, 0, 2010), b = s(2456500, 0.0005, 0.00001, 1, 2014), vague = s(2457000, 0.05, 0.001, 2, 2016), undated = s(2458000, 0.0004, 0.000005, 3, null);
  ok(knownFrom(a) === jdOfYear(2010) && knownFrom(undated) === 2458000, 'a paper is known from the day it appeared; a row without a date, from its own mid-transit time');
  const one = historyOf({ clock: a, sols: [a] });
  ok(one.length === 1 && one[0].s === a && one[0].from === jdOfYear(2010), 'a planet with one solution is read by it from the day it appeared');
  const h = historyOf({ clock: undated, sols: [a, b, vague, undated] });
  ok(h.map((x) => x.s).join() === [a, b, undated].join() && h[1].from === jdOfYear(2014) && h[2].from === 2458000, 'a sharper paper takes over the day it appears; a vaguer one does not; the working clock takes over when it was measured');
  const outlier = s(2457500, 0.00001, 0.0000001, 4, 2017);
  const keep = historyOf({ clock: b, sols: [a, b, outlier] });
  ok(keep.length === 2 && keep[1].s === b, 'once the working clock exists it stays: a later, narrower row the build did not choose does not replace it');
  const before = historyOf({ clock: b, sols: null });
  ok(before.length === 1 && before[0].s === b, 'before the record is loaded a planet is read by its working clock alone');
  ok(historyOf({ clock: s(2455000, 0.001, 0.0001, 0, 2027.5), sols: null }, jdOfYear(2026.87))[0].from === jdOfYear(2026.87), 'a paper dated after the day the archive was read was known that day');
  ok(historyOf({ clock: null, sols: null }).length === 0, 'a planet without a clock has no history');
  ok(clockAt(h, jdOfYear(2009.9)) === null && clockAt(h, jdOfYear(2010)) === a && clockAt(h, jdOfYear(2013.99)) === a && clockAt(h, jdOfYear(2014)) === b && clockAt(h, 2458000) === undated && clockAt(h, jdOfYear(2040)) === undated, 'the clock on a date is the last one that had appeared by then, the day itself included');

  const p = { durH: 3, clock: undated, sols: [a, b, vague, undated] };
  ok(lampOn(p, h, jdOfYear(2009)) === null, 'before its first clock a planet has no lamp');
  near(lampOn(p, h, jdOfYear(2012)), 0.125 / sigmaAt(a, epochAt(a, jdOfYear(2012))), 1e-12, 'its lamp is its transit\'s length over the error of the clock then known');
  ok(Number.isNaN(lampOn({ durH: null }, h, jdOfYear(2012))), 'without a transit length the lamp is not a number');
  ok(lampOn(p, h, jdOfYear(2013.99)) < lampOn(p, h, jdOfYear(2014.01)), 'the lamp brightens the day a sharper paper takes over');
  ok(lampOn(p, h, jdOfYear(2030)) > lampOn(p, h, jdOfYear(2040)), 'and dims when nobody looks again');

  ok(inTransit(a, 2455000 + 3 * 40, 0.125) && inTransit(a, 2455000 + 3 * 40 + 0.0624, 0.125) && !inTransit(a, 2455000 + 3 * 40 + 0.0626, 0.125) && inTransit(a, 2455000 - 0.0624, 0.125), 'a planet is in front of its star within half a transit of a predicted middle, before or after');
  ok(!inTransit(a, 2455000 + 1.5, 0.125) && !inTransit(a, 2455000, null) && !inTransit(null, 2455000, 0.125), 'not half an orbit later, and not without a length or a clock');

  const stars = [{ p: { durH: 3 }, hist: [{ from: jdOfYear(2005), s: s(jdOfYear(2005), 0.001, 0.000005, 0, 2005) }] },
    { p: { durH: 3 }, hist: [{ from: jdOfYear(2010), s: s(jdOfYear(2010), 0.001, 0.002, 1, 2010) }] },
    { p: { durH: null }, hist: [{ from: jdOfYear(2001), s: a }] }];
  const cs = census(stars, 2000, 2040, 1);
  const yr = (y) => cs.years.indexOf(y);
  ok(cs.years.length === 41 && cs.kept.every((_, i) => cs.kept[i] + cs.slipping[i] + cs.lost[i] + cs.unlit[i] === 2), 'the census counts every planet with a transit length once in every year');
  ok(cs.unlit[yr(2004)] === 2 && cs.kept[yr(2005)] === 1 && cs.unlit[yr(2009)] === 1 && cs.kept[yr(2010)] === 2, 'a lamp is counted from the year its clock appears');
  ok(cs.lost[yr(2040)] === 1 && cs.slipping[yr(2040)] === 1 && cs.kept[yr(2040)] === 0 && cs.kept[yr(2020)] === 1, 'by 2040 a clock with a poor period is lost, and one with a good period, still kept in 2020, has slipped past the target');

  const line = errorLine(h, 2000, 2040, 0.5);
  ok(line.length > 40 && line[0].year >= 2010 - 1e-9 && Math.abs(line[line.length - 1].year - 2040) < 1e-9, 'the error line runs from the first clock to the end of the sheet');
  const drops = line.filter((pt, i) => i && pt.s !== line[i - 1].s);
  ok(drops.length === 2 && drops.every((pt) => { const prev = line[line.indexOf(pt) - 1]; return Math.abs(pt.year - prev.year) < 1e-9 && pt.sigma < prev.sigma; }), 'it drops straight down, on the day, each time a sharper clock takes over');
  ok(line.every((pt, i) => !i || pt.s !== line[i - 1].s || pt.sigma >= line[i - 1].sigma - 1e-15), 'and climbs between');
  ok(errorLine([]).length === 0, 'a planet without a clock has no line');

  ok(lampMark(null) === null && lampMark(NaN).kind === 'no transit length' && lampMark(NaN).r === 0 && lampMark(0.99).kind === 'lost' && lampMark(1).kind === 'slipping' && lampMark(11.99).kind === 'slipping' && lampMark(12).kind === 'kept', 'a lamp is drawn by its state, with the same bounds as the words, and a planet with no transit length has no lamp');
  ok(lampMark(12).r < lampMark(120).r && lampMark(120).r < lampMark(12000).r && lampMark(12000).r === lampMark(1e9).r && lampMark(1e9).r < 2.5, 'a kept clock is drawn larger the better it is kept, and never larger than two and a half pixels');
  ok(lampMark(12).a < lampMark(1200).a && lampMark(12000).a === 1 && lampMark(12).a > 0.5 && lampMark(12).r > lampMark(11.99).r, 'and brighter: full at a thousand times the target, never faint, and from the target on larger than a slipping point');
  ok(lampMark(0.5).r > lampMark(1e9).r * 0.9 && lampMark(0.5).a < lampMark(12).a, 'a lost clock is a ring wide enough to be found and quieter than any kept lamp');

  // the dots of the tally: quarter-sigma columns from -6.5 to 6.5, the ends holding everything further out
  ok(tallyBin(-100) === 0 && tallyBin(-6.5) === 0 && tallyBin(-6.2501) === 0 && tallyBin(-6.25) === 1 && tallyBin(6.2499) === 50 && tallyBin(6.25) === 51 && tallyBin(100) === 51, 'a miss of 6.25 sigmas or more falls in an end column, however large');
  ok(tallyBin(-1) === 22 && tallyBin(-0.0001) === 25 && tallyBin(0) === 26 && tallyBin(0.9999) === 29 && tallyBin(1) === 30, 'the eight columns either side of zero hold exactly the misses inside one sigma, the ones drawn gold');

  // the night's axis: only the dark hours, each stretch with an hour of margin, side by side
  {
  const t0 = 2461000, hr = 1 / 24;
  const one = nightAxis([[t0 + 6 * hr, t0 + 16 * hr]], t0, 100, 700);
  ok(one.segs.length === 1 && Math.abs(one.segs[0].a - (t0 + 5 * hr)) < 1e-9 && Math.abs(one.segs[0].b - (t0 + 17 * hr)) < 1e-9, 'one night in the middle of the day is one stretch, an hour wider on each side');
  near(one.X(t0 + 5 * hr), 100, 1e-6, 'it begins at the left edge'); near(one.X(t0 + 17 * hr), 700, 1e-6, 'and ends at the right'); near(one.X(t0 + 11 * hr), 400, 1e-6, 'with its middle in the middle');
  ok(Number.isNaN(one.X(t0 + 2 * hr)) && Number.isNaN(one.X(t0 + 20 * hr)), 'an hour of daylight is not on the drawing');
  const two = nightAxis([[t0, t0 + 5 * hr], [t0 + 17 * hr, t0 + 1]], t0, 100, 700, 20);
  ok(two.segs.length === 2 && two.segs[0].a === t0 && Math.abs(two.segs[0].b - (t0 + 6 * hr)) < 1e-9 && Math.abs(two.segs[1].a - (t0 + 16 * hr)) < 1e-9 && two.segs[1].b === t0 + 1, 'at night now there are two stretches, tonight\'s rest and tomorrow\'s beginning, cut at the edges of the 24 hours');
  near(two.segs[1].x0 - two.segs[0].x1, 20, 1e-9, 'with a gap where the day was cut out'); near(two.segs[1].x1, 700, 1e-6, 'and the last one ends at the right edge');
  near((two.segs[0].x1 - two.segs[0].x0) / (two.segs[1].x1 - two.segs[1].x0), 6 / 8, 1e-9, 'an hour is as wide in one stretch as in the other');
  ok(two.X(t0 + 3 * hr) < two.X(t0 + 20 * hr) && Number.isNaN(two.X(t0 + 11 * hr)), 'time still runs to the right across the gap, and noon is not drawn');
  const joined = nightAxis([[t0 + 2 * hr, t0 + 5 * hr], [t0 + 6.5 * hr, t0 + 9 * hr]], t0, 0, 100);
  ok(joined.segs.length === 1 && Math.abs(joined.segs[0].b - (t0 + 10 * hr)) < 1e-9, 'two dark stretches whose margins touch are drawn as one');
  const none = nightAxis([], t0, 0, 240), polar = nightAxis([[t0, t0 + 1]], t0, 0, 240);
  ok(none.segs.length === 1 && none.X(t0 + 0.5) === 120 && polar.segs.length === 1 && polar.X(t0 + 0.25) === 60, 'with no dark hour, or nothing but dark, the whole day is one stretch');
  }

  // the night names five: of the transits up in the dark, the ones whose stars are brightest
  const row = (name, vmag, watchable) => ({ planet: { name, vmag }, watchable });
  const five = nightNamed([row('a', 9, true), row('b', 7, false), row('c', 12, true), row('d', undefined, true), row('e', 8, true), row('f', 10, true), row('g', 11, true), row('h', 13, true)]);
  ok(five.map((r) => r.planet.name).join('') === 'eafgc', 'five are named, brightest star first; one that is not up in the dark is never named, and one with no magnitude comes last');
  ok(nightNamed([row('a', 9, false)]).length === 0 && nightNamed([row('a', 9, true), row('b', 8, true)]).length === 2, 'fewer than five are all named, and none when none is up');
}

/* ---------------- a paper against a clock: what its colour says ---------------- */
{
  const clock = solution([2455000, 0.001, 3, 0.00002, 0, 2010, 0, 0]), dur = 3 / 24;
  const at = (n, z, blind = false) => ({ n, z, blind });
  ok(paperKind(at(100, 0.99), clock, dur) === 'inside' && paperKind(at(100, -0.99), clock, dur) === 'inside', 'a paper within the two errors of a clock whose window is shorter than the transit landed inside');
  ok(paperKind(at(100, 1), clock, dur) === 'outside' && paperKind(at(100, -3), clock, dur) === 'outside', 'one a full sigma or more away is outside, early or late');
  const wideAt = Math.ceil(Math.sqrt(dur * dur - 0.001 * 0.001) / 0.00002) + 1;
  ok(sigmaAt(clock, wideAt) >= dur && sigmaAt(clock, wideAt - 2) < dur && paperKind(at(wideAt, 0.2), clock, dur) === 'wide' && paperKind(at(wideAt - 2, 0.2), clock, dur) === 'inside', 'once the clock\'s window at that orbit is as long as the transit, landing inside it says nothing and is not drawn gold');
  ok(paperKind(at(100, 0.2, true), clock, dur) === 'wide' && paperKind(at(100, 0.2), clock, null) === 'wide' && paperKind(at(wideAt, 2), clock, dur) === 'outside', 'nor is a paper that could not have missed, or one of a planet with no transit length; a miss is still a miss');
  ok(DIP_APART > 0.9 && DIP_APART < 1 && SHAPE_APART > 0 && SHAPE_APART < 1 - DIP_APART + 0.02, 'the transit itself is named beside the dip a clock lets through once the two lines differ by a few percent of the depth, and the dip is given a number of its own once it is shallower');
}

/* ---------------- one transit as light ---------------- */
{
  const depth = 0.0146, durH = 3.1, shape = dipShape(depth, durH);
  near(shape(0), depth, 1e-12, 'the transit is as deep at its middle as the archive says');
  ok(shape(durH / 2) === 0 && shape(-durH / 2 - 0.01) === 0 && shape(durH / 2 - 0.02) > 0, 'and hides nothing outside its length');
  ok([0.2, 0.6, 1.0, 1.4].every((t) => shape(t) <= shape(t - 0.2) + 1e-12 && Math.abs(shape(t) - shape(-t)) < 1e-12), 'it is deepest in the middle and the same either side');
  const ts = Array.from({ length: 2001 }, (_, i) => -100 + i * 0.1), area = (ys) => ys.reduce((a, y) => a + y * 0.1, 0);
  const sharp = smearedDip(shape, durH, 0, 84.6, ts), true0 = area(sharp);
  ok(sharp.every((y, i) => y === shape(ts[i])), 'with no error the dip is the transit itself');
  let never = true;
  for (const sigmaH of [0.001, 0.0136, 0.1, 0.38, 0.39, 1, 5, 13.1, 30, 41]) {
    const y = smearedDip(shape, durH, sigmaH, 84.6, ts);
    if (Math.max(...y) > depth * 1.0001 || Math.min(...y) < 0) never = false;
    if (sigmaH <= 13.1) near(area(y) / true0, 1, 0.03, `the dip keeps its area when it is spread by ${sigmaH} h: the light hidden is the same, at other hours`);
  }
  ok(never, 'however the transit is spread, the dip is never deeper than the transit and never a brightening');
  ok(Math.max(...smearedDip(shape, durH, 0.0136, 84.6, ts)) > depth * 0.99, 'a clock good to 49 seconds shows the transit almost as it is');
  ok(Math.max(...smearedDip(shape, durH, 13.1, 84.6, ts)) < depth * 0.12, 'a clock good to 13 hours shows less than an eighth of it');
  const flat = smearedDip(shape, durH, 50, 84.6, ts);
  ok(flat.every((y) => y === flat[0]) && Math.abs(flat[0] / (true0 / 84.6) - 1) < 0.02, 'an error of half an orbit or more hides the same share at every hour: the transit\'s light, spread over the orbit');
}

/* ---------------- tonight: the rule, the words and the crossings ---------------- */
{
  const fine = { altMin: 20, sunMax: -12, lamp: 3, contested: false };
  ok(watchable(fine) && unwatchable(fine) === '', 'the rule includes each of its bounds');
  ok(unwatchable({ ...fine, altMin: 19.99 }) === 'star low' && unwatchable({ ...fine, altMin: -1 }) === 'star sets', 'a star a hair too low, or below the horizon, fails it');
  ok(unwatchable({ ...fine, sunMax: -11.99 }) === 'twilight' && unwatchable({ ...fine, sunMax: 2 }) === 'daylight', 'a Sun a hair too high, or up, fails it');
  ok(unwatchable({ ...fine, lamp: 2.99 }) === 'window too wide' && unwatchable({ ...fine, lamp: 0.99 }) === 'clock lost' && unwatchable({ ...fine, lamp: NaN }) === 'no transit length', 'a transit a hair under three windows long, a lost clock or no transit length fails it');
  ok(unwatchable({ ...fine, contested: true }) === 'clock contested', 'a clock most other papers disagree with fails it');
  ok(unwatchable({ ...fine, altMin: NaN }) === 'no position' && !watchable({ ...fine, sunMax: NaN }), 'a planet with no position is never called watchable');
  ok(WATCH.minAlt === 20 && WATCH.maxSun === -12 && WATCH.minLamp === 3 && WATCH.stepMin === 15 && WATCH.baselineH === 0.5, 'the rule the page prints is the rule in force');
  const eg = placeOf(EXAMPLE_PLACE.lat, EXAMPLE_PLACE.lon);
  ok(eg && eg.lat === EXAMPLE_PLACE.lat && eg.lon === EXAMPLE_PLACE.lon && EXAMPLE_PLACE.name.length > 0, 'the example place is a place a visitor could have typed, and has a name to be called an example by');
  ok(samplesFor(0) === 5 && samplesFor(1 / 24) === 5 && samplesFor(3 / 24) === 13 && samplesFor(53.6 / 24) === 216 && samplesFor(10) === 240, 'a span is looked at every quarter of an hour, at five instants or more and 240 at most');

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
  near(rows[0].windowS, Math.hypot(0.0002, 100 * 0.000002) * 86400 + 5, 1e-6, 'its window is the clock\'s error plus what the standard leaves unsaid');
  near(rows[0].lamp, (3 * 3600) / rows[0].windowS, 1e-9, 'its lamp is the transit\'s length over that window, the one the row shows');
  ok(Number.isFinite(rows[0].altMin) && rows[0].altMin <= rows[0].altMax && typeof rows[0].sky === 'string' && typeof rows[0].watchable === 'boolean' && rows[0].state === 'kept' && rows[0].contested === false, 'with a place it carries the star\'s lowest and highest altitude, the sky, the clock\'s state and a verdict');
  near(rows[0].from, rows[0].mid - 1.5 / 24 - 0.5 / 24 - rows[0].windowS / 86400, 1e-9, 'the span looked at begins half an hour and a window before the transit does');
  near(rows[0].to, rows[0].mid + 1.5 / 24 + 0.5 / 24 + rows[0].windowS / 86400, 1e-9, 'and ends half an hour and a window after it');
  ok(rows[0].watchable === (rows[0].why === ''), 'the verdict and its reason agree');
  ok(crossings([p], ['BJD-TDB'], from + 0.51, 24, null).length === 0 && crossings([p], ['BJD-TDB'], from - 0.51, 24, null).length === 0, 'a transit just before the span or just after it is left out');
  const bare = crossings([p], ['BJD-TDB'], from - 0.49, 24, null);
  ok(bare.length === 1 && bare[0].altMin === undefined && bare[0].watchable === undefined && bare[0].state === 'kept', 'one just inside it is listed; without a place there is no altitude and no verdict');
  // the slack counts: a clock good to 12 minutes on a bare JD has a window of 21.6 minutes, and a one-hour transit is no longer three times it
  const bareJd = crossings([{ ...p, durH: 1, clock: solution([from + 0.5 - 10 * 100, 12 / 1440, 10, 0.0000001, 0, 2020, 0, 0]) }], ['JD'], from - 0.4, 24, null)[0];
  ok(60 / 12 > 3 && bareJd.lamp < 3 && bareJd.state === 'slipping', `a time standard that leaves ten minutes unsaid dims the lamp of the row (${bareJd.lamp.toFixed(2)})`);
  // the half hour of sky either side counts: a star that is 20 degrees up through the transit and lower just before it fails
  const hour = jdOfMs(Date.UTC(2026, 10, 14, 22, 0, 0));
  const edge = (ra) => crossings([{ name: 'edge', ra, dec: 0, durH: 1, clock: solution([hour - 10 * 50, 0.00002, 10, 0.0000002, 0, 2020, 0, 0]) }], ['BJD-UTC'], hour - 0.5, 24, BCN)[0];
  let found = null;
  for (let ra = 0; ra < 360 && !found; ra += 0.25) {
    const r = edge(ra), through = Math.min(altAz(r.mid - 0.5 / 24, ra, 0, BCN.lat, BCN.lon).alt, altAz(r.mid + 0.5 / 24, ra, 0, BCN.lat, BCN.lon).alt);
    if (through >= 20.5 && r.altMin < 19.5 && r.sunMax <= -12) found = { r, through };
  }
  ok(found && !found.r.watchable && found.r.why === 'star low', `a star ${found ? found.through.toFixed(1) : '?'} degrees up through the transit itself and ${found ? found.r.altMin.toFixed(1) : '?'} at the edge of the half hour beside it is not up in the dark`);

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
  // the same star through a three-hour transit at midnight can be watched; by a contested clock it cannot
  const night = jdOfMs(Date.UTC(2026, 10, 15, 0, 0, 0));
  const good = { name: 'night', ra: 40, dec: 75, durH: 3, clock: solution([night - 10 * 50, 0.0002, 10, 0.000002, 0, 2020, 0, 0]) };
  const r3 = crossings([good], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(r3.watchable && r3.why === '' && r3.sky === 'night', 'a three-hour transit at midnight under a star that never sets can be watched');
  const r4 = crossings([{ ...good, clock: { ...good.clock, agree: 0, others: 2 } }], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(!r4.watchable && r4.why === 'clock contested' && r4.contested, 'the same transit by a clock that neither of two other papers agrees with cannot');
  const r5 = crossings([{ ...good, durH: null }], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  ok(!r5.watchable && r5.why === 'no transit length' && r5.altMin === r5.altMax, 'a planet with no transit length is looked at in its middle alone and is never called watchable');
  // a long transit is looked at often enough for its altitudes: a 30-hour one, under a star that passes below the pole
  const long = crossings([{ ...good, dec: 62, durH: 30 }], ['BJD-UTC'], night - 0.5, 24, BCN)[0];
  let lo = 90, hi = -90;
  for (let t = long.from; t <= long.to; t += 1 / 1440) { const alt = altAz(t, 40, 62, BCN.lat, BCN.lon).alt; lo = Math.min(lo, alt); hi = Math.max(hi, alt); }
  ok(Math.abs(long.altMin - lo) < 0.5 && Math.abs(long.altMax - hi) < 0.5, `the lowest and highest altitude of a star through a 30-hour transit are found to half a degree (${long.altMin.toFixed(2)} against ${lo.toFixed(2)}, ${long.altMax.toFixed(2)} against ${hi.toFixed(2)})`);
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
  ok(P.every((p) => Number.isInteger(p.clock.agree) && Number.isInteger(p.clock.others) && p.clock.agree >= 0 && p.clock.agree <= p.clock.others), 'every working clock says how many other clocks could be compared with it and how many of them agree');
  ok(P.every((p) => !Number.isFinite(p.ra) || (p.ra >= 0 && p.ra < 360 && p.dec >= -90 && p.dec <= 90)), 'every position is a place on the sky');
  const timed = P.filter((p) => durDays(p));
  const at = 2461358.5;                                     // 2026 November 14, 0h UTC: the day the archive was read
  const lamps = timed.map((p) => lampAt(p.clock, at, durDays(p)));
  const count = (state) => lamps.filter((l) => stateOf(l) === state).length;
  const lost = count('lost'), slipping = count('slipping'), kept = count('kept');
  ok(timed.length === 4729 && lost === 388 && slipping === 1910 && kept === 2431, `4,729 have a transit length; on 2026-11-14, 2,431 are kept, 1,910 slipping and 388 lost (${timed.length}, ${kept}, ${slipping}, ${lost})`);
  const k2 = timed.filter((p) => isK2(p.name)), k2lost = k2.filter((p) => lampAt(p.clock, at, durDays(p)) < 1).length;
  ok(k2.length === 461 && k2lost === 312 && !isK2('Kepler-22 b') && isK2('EPIC 201912552 b') && isK2('K2-18 b'), `of 461 K2 planets with a transit length, 312 are lost that day: four in five of the lost clocks (${k2.length}, ${k2lost})`);
  const field = densestField(k2.map((p) => ({ p })));
  ok(field && field.n === 42 && Math.abs(field.ra - 173) < 1 && Math.abs(field.dec - 0.4) < 1, `the field where K2's planets stand closest holds 42 of them, on the ecliptic near 11.5h (${field ? `${field.n} at ${field.ra.toFixed(1)}, ${field.dec.toFixed(1)}` : 'none'})`);
  ok(densestField([]) === null && densestField([{ p: { ra: NaN, dec: 0 } }]) === null && densestField([{ p: { ra: 10, dec: 0 } }, { p: { ra: 11, dec: 1 } }, { p: { ra: 200, dec: 0 } }]).n === 2, 'no planets, or none with a position, have no field; otherwise it is the fullest cell');
  const doubted = P.filter((p) => contested(p.clock)).length, alone = P.filter((p) => p.clock.others === 0).length;
  ok(doubted === 141 && alone === 352, `141 working clocks are contested, and 352 have no other clock to be held against (${doubted}, ${alone})`);

  // the sky tells the same story as the table: on the day of retrieval every lamp is its working clock's
  const stars = P.map((p) => ({ p, hist: historyOf(p, at) }));
  ok(stars.every((s) => s.hist.length >= 1 && s.hist[s.hist.length - 1].s === s.p.clock && s.hist.every((h, i) => !i || s.hist[i - 1].from <= h.from)), 'every planet\'s history is in order of time and ends with its working clock');
  ok(stars.every((s) => clockAt(s.hist, at) === s.p.clock), 'and on the day the archive was read every planet is read by its working clock');
  const skyLost = stars.filter((s) => { const l = lampOn(s.p, s.hist, at); return l !== null && l < 1; }).length;
  ok(skyLost === lost, `the count in the corner of the sky that day is the count in the table (${skyLost}, ${lost})`);
  const first = stars.filter((s) => s.hist[0].from <= jdOfYear(2000.5));
  ok(first.length === 1 && first[0].p.name === 'HD 209458 b' && stars.every((s) => s.hist[0].from > jdOfYear(2000)), `in the middle of 2000 one lamp is lit, the first transit timed, and at its start none (${first.map((s) => s.p.name).join(', ')})`);
  const cs = census(stars, FIRST_YEAR, LAST_YEAR, 0.25), end = cs.years.length - 1, now = cs.years.findIndex((y) => y >= 2026.75);
  ok(cs.kept.every((_, i) => cs.kept[i] + cs.slipping[i] + cs.lost[i] + cs.unlit[i] === 4729), 'the census counts every planet with a transit length in every quarter from 1999 to 2040');
  ok(cs.lost[end] === 494 && cs.slipping[end] === 2506 && cs.kept[end] === 1729 && cs.unlit[end] === 0, `if nobody looks again, in 2040 494 clocks are lost, 2,506 slipping and 1,729 kept: about 700 lamps go from gold to blue under the drag (${cs.lost[end]}, ${cs.slipping[end]}, ${cs.kept[end]})`);
  ok(cs.lost[end] > cs.lost[now] && cs.kept[end] < cs.kept[now], `more are lost then than today and fewer kept (lost ${cs.lost[now]} then ${cs.lost[end]}, kept ${cs.kept[now]} then ${cs.kept[end]})`);

  const pairs = P.map(pairOf).filter(Boolean);
  const t = tally(pairs.filter((x) => x.real));
  ok(pairs.length === 3601 && t.real === 450 && t.blind === 3, `3,601 planets have a dated paper and another two years or more later; 450 are real tests and 3 more could not fail (${pairs.length}, ${t.real}, ${t.blind})`);
  ok(t.inside1 === 201 && t.beyond3 === 65, `201 later mid-times land inside one sigma and 65 beyond three (${t.inside1}, ${t.beyond3})`);
  ok(t.same === 60 && t.sameInside1 === 18 && t.sameBeyond3 === 10, `of 60 pairs that state the same standard in full, 18 inside and 10 beyond (${t.same}, ${t.sameInside1}, ${t.sameBeyond3})`);
  ok(t.topRef != null && /Kokori/.test(cat.refs[t.topRef][0]) && t.topCount === 248, `one catalogue is the newer paper in more than half of the tests (${cat.refs[t.topRef] && cat.refs[t.topRef][0]}: ${t.topCount} of ${t.real})`);
  const hd = cat.byName.get('HD 209458 b'), pr = pairOf(hd);
  ok(pr && pr.real && pr.blind && /Charbonneau/.test(cat.refs[pr.older.ref][0]), 'the first transiting planet\'s first clock is one of the three: by its later papers its window had covered the orbit');
  const against = pointsFor(hd, pr.older);
  ok(against.filter((x) => x.test && !x.blind).length === 0 && against.some((x) => /Henry/.test(cat.refs[x.s.ref][0]) && !x.test), 'in the list nothing tests that clock either: the paper published beside it, timing a transit from before both, is no test');

  // the working clock: the cases two independent reviews found wrong under the earlier rules
  const clockOf = (name) => cat.refs[cat.byName.get(name).clock.ref][0];
  ok(/Howard|Bourrier/.test(clockOf('HD 106315 b')), `HD 106315 b is read by a clock the other papers agree with, where the smallest error alone picked a row 4.6 days off (${clockOf('HD 106315 b')})`);
  ok(/Kokori/.test(clockOf('WASP-24 b')) && lampAt(cat.byName.get('WASP-24 b').clock, at, durDays(cat.byName.get('WASP-24 b'))) > 3, `WASP-24 b is read, by the catalogue five recent papers stand with, where a vote had called it lost (${clockOf('WASP-24 b')})`);
  ok(!/Hebb/.test(clockOf('WASP-12 b')) && cat.byName.get('WASP-12 b').clock.pub > 2018, `WASP-12 b is read by a recent clock, where a vote kept one from 2009 (${clockOf('WASP-12 b')})`);
  ok(/Changeat/.test(clockOf('KELT-11 b')) && /Kokori/.test(clockOf('HAT-P-23 b')) && /Lafarga|Kokori/.test(clockOf('TOI-125 b')), `KELT-11 b, HAT-P-23 b and TOI-125 b are read by the sharp clocks the recent papers agree on (${clockOf('KELT-11 b')}; ${clockOf('HAT-P-23 b')}; ${clockOf('TOI-125 b')})`);

  const tonight = crossings(P, cat.standards, at, 24, null);
  ok(tonight.length > 800 && tonight.length < 1300 && tonight.every((r, i) => !i || tonight[i - 1].mid <= r.mid) && tonight.every((r) => r.mid >= at && r.mid <= at + 1), `about a thousand transits fall in any 24 hours, listed in order of time (${tonight.length})`);
}

if (fails.length) { console.log(`overdue tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`overdue tests: ${passed} passed, 0 failed`);
