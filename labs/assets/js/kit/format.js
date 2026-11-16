/* ============================================================
   kit/format.js: the one way the labs write a number and a date.

   Why it exists: on 2026-11-16 the independent rater found the
   Exomania lab writing numbers three ways (views/common.js fmt,
   record.js thousands, toLocaleString in overdue/main.js) and
   dates three ways (a date in words on the sky, the ago of Labs
   OS, ISO slices on the survey). Atlas clause interface.2.4 asks
   for one convention of each, set in a shared module.

   The number convention
   - A measured or computed value keeps as many significant
     figures as asked (three by default) and never more than four
     decimals; from 1,000 up (after rounding) it is a whole number.
   - Digits are grouped by thousands with a comma, as in en-US,
     in every browser and in Node: 12,345.
   - A negative value carries the minus sign U+2212, never the
     hyphen: −0.18.
   - An interval around a value is "+0.11 −0.18", or "±0.11" when
     its two sides agree to 15%; a range is "1.4 to 4.0".
   - A value that is not a finite number is written with the word
     the caller gives for "none", never as NaN or Infinity.

   The date convention: one rule, two kinds of date
   - A date of the data (the archive's retrieval, a clock's epoch)
     is the date in UTC, as the source gives it, written as the
     day, the month in words and the year, held together by
     no-break spaces: 14 November 2026.
   - A moment of the visitor's own (a visit, a save, an export) is
     in the visitor's own zone. In a list it is said as how long ago
     it was, by the one function the labs share for it: Labs OS's
     ago (assets/js/os/util.js, tested in labs-src): "5 minutes
     ago", and after two weeks "on 3 Nov". Shown as a date (an
     export's) it is localDay below, the same words as a date of
     the data.
   - An address or a file name carries the ISO 8601 day
     (2026-11-14), which a machine reads; it is never shown as text.
   - A time of day is the visitor's own clock, hours and minutes.

   Pure: no page, no storage. Tests: kit/tests/format.test.mjs (run
   in a zone fourteen hours from UTC), broken rules:
   kit/tests/format.mutants.test.mjs.
   ============================================================ */

/* ---------------- numbers ---------------- */

export const MINUS = String.fromCharCode(0x2212);   // the minus sign, never the hyphen
export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/* 12345 -> "12,345"; 1234.5 -> "1,234.5"; -1234 -> "−1,234". Grouped by this module's rule, not the browser's locale. */
export function grouped(v) {
  const neg = v < 0, s = String(Math.abs(v));
  const [whole, frac] = s.split('.');
  const g = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? MINUS : '') + g + (frac !== undefined ? '.' + frac : '');
}

/* A whole number, grouped: 6464 -> "6,464". */
export function int(v, none = '') {
  if (!isFiniteNumber(v)) return none;
  return grouped(Math.round(v));
}

/* A value to `sig` significant figures (at most four decimals), whole and grouped from 1,000 up. */
export function num(v, sig = 3, none = '') {
  if (!isFiniteNumber(v)) return none;
  const a = Math.abs(v);
  if (a === 0) return '0';
  const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  let s = a.toFixed(Math.min(d, 4));
  // rounding that carries into the next power of ten (99.96 to 100) takes one decimal fewer, to keep `sig` figures
  const up = Math.max(0, sig - 1 - Math.floor(Math.log10(Number(s))));
  if (up < d) s = a.toFixed(Math.min(up, 4));
  if (Number(s) >= 1000) return grouped(Math.round(v));   // 999.6 rounds to a thousand, and is grouped as one
  return (v < 0 ? MINUS : '') + s;
}

/* A difference with its sign: "+0.11", "−0.18". */
export const signed = (v, sig = 2) => (isFiniteNumber(v) ? (v < 0 ? '' : '+') + num(v, sig) : '');

/* The interval of a value: "+0.11 −0.18", or "±0.11" when the two sides agree to 15%. up and down are the archive's
   errors, either sign; nothing when either is missing. */
export function interval(up, down, sig = 2) {
  if (!isFiniteNumber(up) || !isFiniteNumber(down)) return '';
  const a = Math.abs(up), b = Math.abs(down);
  if (Math.abs(a - b) / Math.max(a, 1e-9) < 0.15) return `±${num(a, sig)}`;
  return `+${num(a, sig)} ${MINUS}${num(b, sig)}`;
}

/* A range: "1.4 to 4.0". */
export const range = (lo, hi, sig = 2) => (isFiniteNumber(lo) && isFiniteNumber(hi) ? `${num(lo, sig)} to ${num(hi, sig)}` : '');

/* A count of things with its noun: plural(1, 'world') -> "1 world", plural(2, 'world') -> "2 worlds". */
export const plural = (n, noun, many = noun + 's') => `${int(n)} ${n === 1 ? noun : many}`;

/* ---------------- dates ---------------- */

export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const NBSP = String.fromCharCode(160);   // a no-break space

/* A date of the data: "14 November 2026", in UTC, never broken across lines. */
export function day(ms, none = '') {
  if (!isFiniteNumber(ms)) return none;
  const d = new Date(ms);
  return `${d.getUTCDate()}${NBSP}${MONTHS[d.getUTCMonth()]}${NBSP}${d.getUTCFullYear()}`;
}

/* A moment of the visitor's own shown as a date (an export's): the same words, in the visitor's own zone. */
export function localDay(ms, none = '') {
  if (!isFiniteNumber(ms)) return none;
  const d = new Date(ms);
  return `${d.getDate()}${NBSP}${MONTHS[d.getMonth()]}${NBSP}${d.getFullYear()}`;
}

/* "2026-11-11" (from a file or an address) as the milliseconds of that day's start in UTC; NaN when it is not one. */
export function fromIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));   // equivalent: String(s) refuses the same, "null" and "undefined" being no day
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);   // a day past its month's end (or 00) moves the month; Date.UTC reads a year under 100 as 19xx, which the year check refuses
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? t : NaN;
}

/* The ISO 8601 day, for an address or a file name only. */
export function isoDay(ms) {
  return isFiniteNumber(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}

/* A time of day on the visitor's own clock: "21:40"; with its weekday "Mon 21:40"; with seconds "21:40:05". */
export function clock(ms, { weekday = false, seconds = false } = {}) {
  if (!isFiniteNumber(ms)) return '';
  return new Date(ms).toLocaleString([], { ...(weekday ? { weekday: 'short' } : {}), hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}
