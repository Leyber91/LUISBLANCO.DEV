/* ============================================================
   The labs' one convention for numbers and dates (kit/format.js).
   Run from the repository root:
     node labs/assets/js/kit/tests/format.test.mjs

   Every bound has a case just inside it and just outside it, so
   that kit/tests/format.mutants.test.mjs can break each rule and
   see a check fail here.
   ============================================================ */

// A date is the date in UTC whatever the machine's zone. The tests run in a zone fourteen hours from UTC, so that a
// date read in the machine's own zone shows on any runner (the gate's runner is in UTC, where the two agree).
process.env.TZ = 'Pacific/Kiritimati';
import { grouped, int, num, plural, day, fromIso, isoDay, ago, clock, MONTHS, isFiniteNumber } from '../format.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NB = ' ';

/* ---- numbers ---- */
yes('digits are grouped by thousands with a comma, from 1,000 up', same([0, 7, 999, 1000, 12345, 1234567].map(grouped), ['0', '7', '999', '1,000', '12,345', '1,234,567']), [0, 7, 999, 1000, 12345, 1234567].map(grouped).join(' '));
yes('a negative value keeps its sign, and a fraction its digits', grouped(-1234) === '-1,234' && grouped(1234.5) === '1,234.5' && grouped(-0.25) === '-0.25', `${grouped(-1234)} ${grouped(1234.5)} ${grouped(-0.25)}`);
yes('a whole number is rounded and grouped', int(6464) === '6,464' && int(2.5) === '3' && int(2.4) === '2' && int(-1500.4) === '-1,500', `${int(6464)} ${int(2.5)} ${int(2.4)} ${int(-1500.4)}`);
yes('what is not a finite number is written as the word given for none', int(NaN) === '' && int('5', 'none') === 'none' && int(Infinity, 'x') === 'x' && int(null, '-') === '-' && num(undefined, 3, 'unknown') === 'unknown' && num(-Infinity) === '', `${int('5', 'none')} ${num(undefined, 3, 'unknown')}`);
yes('three significant figures by default', num(1.3421) === '1.34' && num(0.12345) === '0.123' && num(12.345) === '12.3' && num(236.4) === '236', `${num(1.3421)} ${num(0.12345)} ${num(12.345)} ${num(236.4)}`);
yes('as many significant figures as asked', num(1.3421, 2) === '1.3' && num(112.345, 4) === '112.3' && num(0.4095, 3) === '0.409' && num(0.0567, 2) === '0.057', `${num(1.3421, 2)} ${num(112.345, 4)} ${num(0.4095, 3)} ${num(0.0567, 2)}`);
yes('never more than four decimals', num(0.000123) === '0.0001' && num(0.00123) === '0.0012' && num(0.0123) === '0.0123', `${num(0.000123)} ${num(0.00123)} ${num(0.0123)}`);
yes('from 1,000 up a value is whole and grouped', num(1000) === '1,000' && num(1234.56) === '1,235' && num(123456.7) === '123,457' && num(999.4) === '999', `${num(1000)} ${num(1234.56)} ${num(123456.7)} ${num(999.4)}`);
yes('a value that rounds to a thousand is grouped as one', num(999.6) === '1,000' && num(-999.7) === '-1,000' && num(99.96) === '100.0', `${num(999.6)} ${num(-999.7)} ${num(99.96)}`);
yes('zero is "0" and a negative value keeps its sign', num(0) === '0' && num(-0.5) === '-0.500' && num(-12.34) === '-12.3', `${num(0)} ${num(-0.5)} ${num(-12.34)}`);
yes('a count says its noun once for one and in the plural otherwise', plural(1, 'world') === '1 world' && plural(0, 'world') === '0 worlds' && plural(2, 'world') === '2 worlds' && plural(1000, 'entry', 'entries') === '1,000 entries', `${plural(1, 'world')} ${plural(0, 'world')} ${plural(1000, 'entry', 'entries')}`);
yes('a finite number is told from the rest', isFiniteNumber(0) && isFiniteNumber(-1.5) && !isFiniteNumber(NaN) && !isFiniteNumber('1') && !isFiniteNumber(Infinity));

/* ---- dates ---- */
const t = Date.UTC(2026, 10, 14, 12, 0, 0);
yes('a date reads day, month in words and year, held by no-break spaces', day(t) === `14${NB}November${NB}2026`, JSON.stringify(day(t)));
yes('the twelve months are named in order', MONTHS.length === 12 && day(Date.UTC(2026, 0, 3)) === `3${NB}January${NB}2026` && day(Date.UTC(2026, 11, 31)) === `31${NB}December${NB}2026`, `${day(Date.UTC(2026, 0, 3))} ${day(Date.UTC(2026, 11, 31))}`);
yes('the date is the date in UTC, at both ends of the day', day(Date.UTC(2026, 10, 14, 0, 0, 0)) === `14${NB}November${NB}2026` && day(Date.UTC(2026, 10, 14, 23, 59, 59, 999)) === `14${NB}November${NB}2026` && day(Date.UTC(2026, 10, 15)) === `15${NB}November${NB}2026` && day(Date.UTC(2026, 10, 14, 23, 30)) === `14${NB}November${NB}2026`);
yes('no date for what is not a time', day(NaN) === '' && day('2026') === '' && day(undefined, 'unknown') === 'unknown');
yes('an ISO day is read as the start of that day in UTC', fromIso('2026-11-11') === Date.UTC(2026, 10, 11) && fromIso('2000-02-29') === Date.UTC(2000, 1, 29), String(fromIso('2026-11-11')));
yes('what is not a day of the calendar is not read', [fromIso('2026-02-30'), fromIso('2026-1-1'), fromIso('2026-13-01'), fromIso('1900-02-29'), fromIso(''), fromIso(null), fromIso('2026-11-11T00:00')].every(Number.isNaN));
yes('the ISO day of a time, for an address, and nothing for what is not a time', isoDay(t) === '2026-11-14' && isoDay(Date.UTC(2035, 5, 1)) === '2035-06-01' && isoDay(NaN) === '', `${isoDay(t)} ${isoDay(Date.UTC(2035, 5, 1))}`);
yes('the day of a file round-trips', isoDay(fromIso('2026-11-11')) === '2026-11-11' && day(fromIso('2026-11-11')) === `11${NB}November${NB}2026`);

/* ---- how long ago ---- */
const now = Date.UTC(2026, 10, 16, 12);
const back = (ms) => ago(now - ms, now);
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
yes('under 45 seconds is "just now", and 45 seconds is a minute', back(0) === 'just now' && back(44999) === 'just now' && back(45000) === '1 minute ago', `${back(44999)} | ${back(45000)}`);
yes('minutes are rounded and counted, to 59', back(89 * S) === '1 minute ago' && back(91 * S) === '2 minutes ago' && back(59 * M + 20 * S) === '59 minutes ago', `${back(89 * S)} | ${back(91 * S)} | ${back(59 * M + 20 * S)}`);
yes('at 60 minutes it is an hour', back(59 * M + 40 * S) === '1 hour ago' && back(90 * M) === '2 hours ago', `${back(59 * M + 40 * S)} | ${back(90 * M)}`);
yes('hours are counted to 23', back(23 * H + 20 * M) === '23 hours ago' && back(23 * H + 40 * M) === '1 day ago', `${back(23 * H + 20 * M)} | ${back(23 * H + 40 * M)}`);
yes('days are counted to 13, and from 14 the moment is its date', back(13 * D + 10 * H) === '13 days ago' && back(13 * D + 14 * H) === day(now - 13 * D - 14 * H) && back(20 * D) === day(now - 20 * D), `${back(13 * D + 10 * H)} | ${back(13 * D + 14 * H)}`);
yes('a moment ahead of the clock is "just now", never a negative time', ago(now + 5 * M, now) === 'just now', ago(now + 5 * M, now));
yes('no time, no words', ago(NaN, now) === '' && ago(now, undefined) === '');

/* ---- the time of day ---- */
const c = clock(Date.UTC(2026, 10, 16, 21, 40, 5)), cs = clock(Date.UTC(2026, 10, 16, 21, 40, 5), { seconds: true }), cw = clock(Date.UTC(2026, 10, 16, 21, 40, 5), { weekday: true });
yes('a time of day has hours and minutes; seconds and the weekday only when asked', /\d{1,2}:\d{2}/.test(c) && !/:\d{2}:\d{2}/.test(c) && /\d{1,2}:\d{2}:\d{2}/.test(cs) && cw.length > c.length && clock(NaN) === '', `${c} | ${cs} | ${cw}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
