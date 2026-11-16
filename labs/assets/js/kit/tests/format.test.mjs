/* ============================================================
   The labs' one convention for numbers and dates (kit/format.js).
   Run from the repository root:
     node labs/assets/js/kit/tests/format.test.mjs

   Every bound has a case just inside it and just outside it, so
   that kit/tests/format.mutants.test.mjs can break each rule and
   see a check fail here.

   A date of the data is the date in UTC, and a visitor's moment
   is in the visitor's zone. The tests run in a zone fourteen
   hours from UTC, so that the two differ on any runner (the
   gate's runner is in UTC, where they would agree).
   ============================================================ */

process.env.TZ = 'Pacific/Kiritimati';   // UTC+14, set before any date is made
const { grouped, int, num, signed, interval, range, plural, day, localDay, fromIso, isoDay, clock, MONTHS, MINUS, isFiniteNumber } = await import('../format.js');

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NB = String.fromCharCode(160), M = MINUS;

yes('the tests run fourteen hours from UTC', new Date(Date.UTC(2026, 10, 14, 12)).getTimezoneOffset() === -840, String(new Date(Date.UTC(2026, 10, 14, 12)).getTimezoneOffset()));

/* ---- numbers ---- */
yes('the minus sign is U+2212', MINUS === '−' && MINUS.length === 1);
yes('digits are grouped by thousands with a comma, from 1,000 up', same([0, 7, 999, 1000, 12345, 1234567].map(grouped), ['0', '7', '999', '1,000', '12,345', '1,234,567']), [0, 7, 999, 1000, 12345, 1234567].map(grouped).join(' '));
yes('a negative value carries the minus sign, zero none, and a fraction keeps its digits', grouped(-1234) === `${M}1,234` && grouped(0) === '0' && grouped(-0.25) === `${M}0.25` && grouped(1234.5) === '1,234.5', `${grouped(-1234)} ${grouped(0)} ${grouped(-0.25)} ${grouped(1234.5)}`);
yes('a whole number is rounded and grouped', int(6464) === '6,464' && int(2.5) === '3' && int(2.4) === '2' && int(-1500.4) === `${M}1,500`, `${int(6464)} ${int(2.5)} ${int(2.4)} ${int(-1500.4)}`);
yes('what is not a finite number is written as the word given for none, and nothing by default', int(NaN) === '' && int('5', 'none') === 'none' && int(Infinity, 'x') === 'x' && int(null, '-') === '-' && num(undefined, 3, 'unknown') === 'unknown' && num(-Infinity) === '' && num('2') === '', `${int('5', 'none')} ${num(undefined, 3, 'unknown')}`);
yes('three significant figures by default', num(1.3421) === '1.34' && num(0.12345) === '0.123' && num(12.345) === '12.3' && num(236.4) === '236', `${num(1.3421)} ${num(0.12345)} ${num(12.345)} ${num(236.4)}`);
yes('as many significant figures as asked', num(1.3421, 2) === '1.3' && num(112.345, 4) === '112.3' && num(0.4095, 3) === '0.409' && num(0.0567, 2) === '0.057', `${num(1.3421, 2)} ${num(112.345, 4)} ${num(0.4095, 3)} ${num(0.0567, 2)}`);
yes('never more than four decimals', num(0.000123) === '0.0001' && num(0.00123) === '0.0012' && num(0.0123) === '0.0123', `${num(0.000123)} ${num(0.00123)} ${num(0.0123)}`);
yes('a value at or above ten keeps no decimal it does not have the figures for', num(123.4) === '123' && num(12345.6, 2) === '12,346' && num(5000, 1) === '5,000', `${num(123.4)} ${num(12345.6, 2)} ${num(5000, 1)}`);
yes('from 1,000 up a value is whole and grouped, and below it keeps its figures', num(1000) === '1,000' && num(1234.56) === '1,235' && num(123456.7) === '123,457' && num(999.4) === '999' && num(999.25, 4) === '999.3', `${num(1000)} ${num(1234.56)} ${num(123456.7)} ${num(999.4)} ${num(999.25, 4)}`);
yes('a value that rounds to a thousand is grouped as one, either sign', num(999.6) === '1,000' && num(-999.7) === `${M}1,000` && num(99.96) === '100.0', `${num(999.6)} ${num(-999.7)} ${num(99.96)}`);
yes('zero is "0" and a negative value carries the minus sign', num(0) === '0' && num(-0.5) === `${M}0.500` && num(-12.34) === `${M}12.3`, `${num(0)} ${num(-0.5)} ${num(-12.34)}`);
yes('a difference carries its sign: plus, or the minus sign', signed(0.11) === '+0.11' && signed(-0.18) === `${M}0.18` && signed(0) === '+0' && signed(NaN) === '' && signed(1.2345, 3) === '+1.23', `${signed(0.11)} ${signed(-0.18)} ${signed(0)}`);
yes('an interval is "+a −b", whatever sign the archive gives each side', interval(0.11, -0.18) === `+0.11 ${M}0.18` && interval(0.11, 0.18) === `+0.11 ${M}0.18` && interval(-0.11, -0.18) === `+0.11 ${M}0.18`, interval(0.11, -0.18));
yes('two sides that agree to 15% are one "±", and 15% itself is two', interval(100, -114, 3) === '±100' && interval(100, -115, 3) === `+100 ${M}115` && interval(0.2, 0.2) === '±0.20' && interval(0, -0.5) === `+0 ${M}0.50` && interval(0, 0) === '±0', `${interval(100, -114, 3)} | ${interval(100, -115, 3)} | ${interval(0, -0.5)}`);
yes('an interval with a missing side is nothing, and keeps the figures asked', interval(0.1, null) === '' && interval(undefined, 0.1) === '' && interval(0.1234, -0.5678, 3) === `+0.123 ${M}0.568`);
yes('a range is "lo to hi", and nothing when an end is missing', range(1.4, 4.04) === '1.4 to 4.0' && range(207.2, 277, 3) === '207 to 277' && range(1, NaN) === '' && range(null, 2) === '', `${range(1.4, 4.04)} ${range(207.2, 277, 3)}`);
yes('a count says its noun once for one and in the plural otherwise', plural(1, 'world') === '1 world' && plural(0, 'world') === '0 worlds' && plural(2, 'world') === '2 worlds' && plural(1000, 'entry', 'entries') === '1,000 entries', `${plural(1, 'world')} ${plural(0, 'world')} ${plural(1000, 'entry', 'entries')}`);
yes('a finite number is told from the rest', isFiniteNumber(0) && isFiniteNumber(-1.5) && !isFiniteNumber(NaN) && !isFiniteNumber('1') && !isFiniteNumber(Infinity));

/* ---- dates of the data: UTC ---- */
const t = Date.UTC(2026, 10, 14, 12, 0, 0);
yes('a date reads day, month in words and year, held by no-break spaces', day(t) === `14${NB}November${NB}2026`, JSON.stringify(day(t)));
yes('the twelve months are named in order', MONTHS.length === 12 && day(Date.UTC(2026, 0, 3)) === `3${NB}January${NB}2026` && day(Date.UTC(2026, 5, 15, 12)) === `15${NB}June${NB}2026`, `${day(Date.UTC(2026, 0, 3))} ${day(Date.UTC(2026, 5, 15, 12))}`);
yes('a date of the data is its date in UTC at both ends of the day, here fourteen hours ahead', day(Date.UTC(2026, 10, 14, 0, 0, 0)) === `14${NB}November${NB}2026` && day(Date.UTC(2026, 10, 14, 23, 59, 59, 999)) === `14${NB}November${NB}2026` && day(Date.UTC(2026, 10, 15)) === `15${NB}November${NB}2026` && day(Date.UTC(2026, 10, 14, 11, 0)) === `14${NB}November${NB}2026`);
yes('the last hours of a month and of a year in UTC stay in that month and that year', day(Date.UTC(2026, 10, 30, 13)) === `30${NB}November${NB}2026` && day(Date.UTC(2026, 11, 31, 23, 30)) === `31${NB}December${NB}2026`, `${day(Date.UTC(2026, 10, 30, 13))} | ${day(Date.UTC(2026, 11, 31, 23, 30))}`);
yes('no date for what is not a time', day(NaN) === '' && day('2026') === '' && day(undefined, 'unknown') === 'unknown');

/* ---- a visitor's moment shown as a date: the visitor's zone ---- */
yes('a moment of the visitor\'s own is dated in the visitor\'s zone, fourteen hours ahead here', localDay(Date.UTC(2026, 10, 14, 12)) === `15${NB}November${NB}2026` && localDay(Date.UTC(2026, 10, 14, 9, 59)) === `14${NB}November${NB}2026`, `${localDay(Date.UTC(2026, 10, 14, 12))} | ${localDay(Date.UTC(2026, 10, 14, 9, 59))}`);
yes('the visitor\'s new month and new year come at the visitor\'s midnight', localDay(Date.UTC(2026, 10, 30, 13)) === `1${NB}December${NB}2026` && localDay(Date.UTC(2026, 11, 31, 11)) === `1${NB}January${NB}2027` && localDay(Date.UTC(2026, 11, 31, 9)) === `31${NB}December${NB}2026`, `${localDay(Date.UTC(2026, 10, 30, 13))} | ${localDay(Date.UTC(2026, 11, 31, 11))}`);
yes('no date for what is not a time, in the visitor\'s zone either', localDay(NaN) === '' && localDay('x', 'none') === 'none');

/* ---- files and addresses ---- */
yes('an ISO day is read as the start of that day in UTC', fromIso('2026-11-11') === Date.UTC(2026, 10, 11) && fromIso('2000-02-29') === Date.UTC(2000, 1, 29), String(fromIso('2026-11-11')));
yes('what is not a day of the calendar is not read', [fromIso('2026-02-30'), fromIso('2026-04-31'), fromIso('2026-1-1'), fromIso('2026-13-01'), fromIso('1900-02-29'), fromIso(''), fromIso(null)].every(Number.isNaN));
yes('a year under 100 is not read as a year of the 1900s', Number.isNaN(fromIso('0050-01-01')) && Number.isNaN(fromIso('0099-12-31')), String(fromIso('0050-01-01')));
yes('a day with anything before or after it is not read', [fromIso('x2026-11-11'), fromIso('12026-11-11'), fromIso('2026-11-11T00:00'), fromIso('2026-11-111'), fromIso(' 2026-11-11')].every(Number.isNaN));
yes('the ISO day of a time, for an address, and nothing for what is not a time', isoDay(t) === '2026-11-14' && isoDay(Date.UTC(2035, 5, 1)) === '2035-06-01' && isoDay(Date.UTC(2026, 10, 14, 23)) === '2026-11-14' && isoDay(NaN) === '' && isoDay('5') === '', `${isoDay(t)} ${isoDay(Date.UTC(2035, 5, 1))}`);
yes('the day of a file round-trips', isoDay(fromIso('2026-11-11')) === '2026-11-11' && day(fromIso('2026-11-11')) === `11${NB}November${NB}2026`);

/* ---- the time of day ---- */
const c = clock(Date.UTC(2026, 10, 16, 21, 40, 5)), cs = clock(Date.UTC(2026, 10, 16, 21, 40, 5), { seconds: true }), cw = clock(Date.UTC(2026, 10, 16, 21, 40, 5), { weekday: true });
yes('a time of day has hours and minutes; seconds and the weekday only when asked', /\d{1,2}:\d{2}/.test(c) && !/:\d{2}:\d{2}/.test(c) && /\d{1,2}:\d{2}:\d{2}/.test(cs) && cw.length > c.length && clock(NaN) === '' && clock('5') === '', `${c} | ${cs} | ${cw}`);
yes('a time of day is the visitor\'s own clock', /11:40/.test(clock(Date.UTC(2026, 10, 16, 21, 40))), clock(Date.UTC(2026, 10, 16, 21, 40)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
