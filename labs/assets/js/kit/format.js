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
   - A value that is not a finite number is written with the word
     the caller gives for "none", never as NaN or Infinity.

   The date convention
   - A date a person reads is the day, the month in words and the
     year, held together by no-break spaces: 14 November 2026. It
     is the date in UTC, because the catalogue and the clocks are
     dated in UTC.
   - A moment of the visitor's own (a world saved, a visit) under
     two weeks old is said as how long ago it was; an older one is
     its date.
   - An address or a file name carries the ISO 8601 day
     (2026-11-14), which a machine reads; it is never shown as text.
   - A time of day is the visitor's own clock, hours and minutes.

   Pure: no page, no storage. Tests: kit/tests/format.test.mjs,
   broken rules: kit/tests/format.mutants.test.mjs.
   ============================================================ */

/* ---------------- numbers ---------------- */

export const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/* 12345 -> "12,345"; 1234.5 -> "1,234.5". Digits are grouped by a rule of this module, not by the browser's locale. */
export function grouped(v) {
  const neg = v < 0, s = String(Math.abs(v));
  const [whole, frac] = s.split('.');
  const g = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + g + (frac !== undefined ? '.' + frac : '');
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
  const s = v.toFixed(Math.min(d, 4));
  return Math.abs(Number(s)) >= 1000 ? grouped(Math.round(v)) : s;   // 999.6 rounds to a thousand, and is grouped as one
}

/* A count of things with its noun: plural(1, 'world') -> "1 world", plural(2, 'world') -> "2 worlds". */
export const plural = (n, noun, many = noun + 's') => `${int(n)} ${n === 1 ? noun : many}`;

/* ---------------- dates ---------------- */

export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const NBSP = String.fromCharCode(160);   // a no-break space
const MIN = 60000, HOUR = 60 * MIN, DAYMS = 24 * HOUR;

/* A date a person reads: "14 November 2026", in UTC, never broken across lines. */
export function day(ms, none = '') {
  if (!isFiniteNumber(ms)) return none;
  const d = new Date(ms);
  return `${d.getUTCDate()}${NBSP}${MONTHS[d.getUTCMonth()]}${NBSP}${d.getUTCFullYear()}`;
}

/* "2026-11-11" (from a file or an address) as the milliseconds of that day's start in UTC; NaN when it is not one. */
export function fromIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}

/* The ISO 8601 day, for an address or a file name only. */
export function isoDay(ms) {
  return isFiniteNumber(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}

/* How long ago a moment of the visitor's own was, under two weeks; its date after that. */
export function ago(then, now) {
  if (!isFiniteNumber(then) || !isFiniteNumber(now)) return '';
  const d = now - then;
  if (d < 45000) return 'just now';   // a moment ahead of the clock too
  const m = Math.max(1, Math.round(d / MIN));
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.round(d / HOUR);
  if (h < 24) return `${plural(h, 'hour')} ago`;
  const days = Math.round(d / DAYMS);
  if (days < 14) return `${plural(days, 'day')} ago`;
  return day(then);
}

/* A time of day on the visitor's own clock: "21:40"; with its weekday "Mon 21:40"; with seconds "21:40:05". */
export function clock(ms, { weekday = false, seconds = false } = {}) {
  if (!isFiniteNumber(ms)) return '';
  return new Date(ms).toLocaleString([], { ...(weekday ? { weekday: 'short' } : {}), hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}
