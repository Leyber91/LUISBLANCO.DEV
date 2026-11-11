/* ============================================================
   timeline/chronology.js — the date engine. Pure functions.

   One clock underneath: Earth CE as a real number (negative is
   BCE, no year-zero correction, as the codex writes its dates).
   Terra and Kha-Ren dates are computed from the codex's own
   conversions (CODEX/CHRONOLOGY/CALENDAR_SYSTEMS.md):
     A.T.  = CE + 3537
     CE    = 75 * Cycle + Year - 4750      (Cycle 1, Year 0 = 4675 BCE)
   Ages and elapsed spans use each calendar's year length
   (Earth 365.25 days, Terra about 400, Kha-Ren about 365).
   ============================================================ */

import { NOW, CALENDARS } from './config.js';

const AT = CALENDARS.at, CY = CALENDARS.cycle;
export const grp = (n) => Math.round(n).toLocaleString('en-US');
const yr = (n) => (Math.abs(n) >= 10000 ? grp(n) : String(Math.round(n)));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------- conversions ---------------- */

export const ceToAT = (y) => Math.floor(y + 1e-9) + AT.offset;
export const atToCE = (at) => at - AT.offset;

export function ceToCycle(y) {
  const n = Math.floor(y + 1e-9) + CY.offset;
  if (n < CY.cycleLen) return null;                         // before Cycle 1
  const c = Math.floor(n / CY.cycleLen);
  return { cycle: c, year: n - c * CY.cycleLen };
}
export const cycleToCE = (c, y = 0) => c * CY.cycleLen + y - CY.offset;

/** An age in one calendar's years expressed in another's, by the codex age rule
    (CALENDAR_SYSTEMS, Age adjustment): Terran years = Earth years x 365/400; Earth and
    Kha-Ren years are taken as equal. Dates and spans never use this: they convert by offset. */
export function convertYears(n, from = 'ce', to = 'at') {
  const f = (c) => (c === 'at' ? 400 : 365);
  return (n * f(from)) / f(to);
}

/** The span between two dates in each calendar: the difference of the native date numbers. */
export function nativeSpan(a, b) {
  const d = Math.abs(Math.floor(b) - Math.floor(a));
  return { earth: d, terra: d, cycles: Math.floor(d / CY.cycleLen), years: d % CY.cycleLen };
}

/* ---------------- formatting ---------------- */

export function fmtAgo(y) {
  const L = NOW - y;
  if (L >= 1e9) return `${(L / 1e9).toFixed(L >= 1e10 ? 0 : 1)} billion years ago`;
  if (L >= 1e6) return `${(L / 1e6).toFixed(L >= 1e7 ? 0 : 1)} million years ago`;
  return `${grp(L)} years ago`;
}

export function fmtCE(y, circa = false) {
  if (y < -50000) return fmtAgo(y);
  const r = Math.floor(y + 1e-9);
  const pre = circa ? 'c. ' : '';
  return r < 0 ? `${pre}${yr(-r)} BCE` : `${pre}${r === 0 ? 1 : r} CE`;
}

/** A date inside a year, for the week-scale views. */
export function fmtDay(y) {
  const r = Math.floor(y), f = y - r;
  const d = Math.floor(f * 365.25);
  const mDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 0, left = d;
  while (m < 11 && left >= mDays[m]) { left -= mDays[m]; m++; }
  return `${left + 1} ${MONTHS[m]} ${r}`;
}

export function fmtAT(y) {
  if (y < -50000) return 'before Terra’s calendar';
  const at = ceToAT(y);
  return at < 0 ? `${grp(-at)} years before 0 A.T.` : `${at} A.T.`;
}

export function fmtCycle(y) {
  if (y < -50000) return 'before Kha-Ren’s calendar';
  const cy = ceToCycle(y);
  if (!cy) return `pre-calendar (${grp(cycleToCE(1, 0) - Math.floor(y))} years before Cycle 1)`;
  return `Cycle ${cy.cycle}, Year ${cy.year}`;
}

export function nativeDate(calendar, y) {
  return calendar === 'at' ? fmtAT(y) : calendar === 'cycle' ? fmtCycle(y) : fmtCE(y);
}

/* ---------------- uncertainty ---------------- */

/** The uncertainty rule, read from the data file (data/events.json: uncertainty). */
let RULE = { tilde: { percentOfLookback: 1, minYears: 1 } };
export function setUncertainty(rule) { if (rule?.tilde) RULE = rule; }

/** The interval behind a date: a codex range keeps its stated endpoints; a rounded "~"
    date is uncertain by the data file's percentage of its distance from the story present. */
export function intervalOf(e) {
  if (e.y0 != null && e.y1 != null) return [e.y0, e.y1];
  if (!e.c) return [e.y, e.y];
  const half = Math.max(RULE.tilde.minYears, (Math.abs(NOW - e.y) * RULE.tilde.percentOfLookback) / 100);
  return [e.y - half, e.y + half];
}

export function fmtInterval(e) {
  const [a, b] = intervalOf(e);
  if (a === b) return fmtCE(e.y, e.c);
  if (e.y < -50000) return `${fmtAgo(e.y)}, give or take ${fmtSpanLoose(b - a)}`;
  return `${fmtCE(a)} to ${fmtCE(b)}`;
}
const fmtSpanLoose = (s) => (s >= 1e9 ? `${(s / 2e9).toFixed(1)} billion years` : s >= 1e6 ? `${(s / 2e6).toFixed(1)} million years` : `${grp(s / 2)} years`);

/** All three calendars for a date or an interval. */
export function threeDates(e) {
  const [a, b] = intervalOf(e);
  const one = (f) => (a === b ? f(e.y) : (f(a) === f(b) ? f(a) : `${f(a)} to ${f(b)}`));
  return { ce: a === b ? fmtCE(e.y, e.c) : fmtInterval(e), at: one(fmtAT), cycle: one(fmtCycle) };
}

/* ---------------- parsing: a date or an age in any calendar ---------------- */

/**
 * Parse "3537 BCE", "250 bc", "1500 A.T.", "Cycle 16, Year 13", "C90.Y68", "2068",
 * "4 Ga", "300 ka", "300,000 years ago". Returns { ce, read } or null.
 */
export function parseDate(s) {
  const t = String(s || '').toLowerCase().replace(/,(\d{3})/g, '$1').trim();
  if (!t) return null;
  let m = t.match(/(?:cycle|c)\s*\.?\s*(\d{1,3})\s*(?:[,.\s]*(?:year|y)\s*\.?\s*(\d{1,2}))?/);
  if (m && /cycle|c\d|c\s*\d/.test(t)) {
    const c = Number(m[1]), y = Number(m[2] || 0);
    if (y < CY.cycleLen) return { ce: cycleToCE(c, y), read: `Cycle ${c}, Year ${y}` };
  }
  m = t.match(/(-?\d+(?:\.\d+)?)\s*(ga|gya|billion years ago|ma|mya|million years ago|ka|kya|thousand years ago|years ago)/);
  if (m) {
    const k = { ga: 1e9, gya: 1e9, 'billion years ago': 1e9, ma: 1e6, mya: 1e6, 'million years ago': 1e6, ka: 1e3, kya: 1e3, 'thousand years ago': 1e3, 'years ago': 1 }[m[2]];
    const ago = Number(m[1]) * k;
    return { ce: NOW - ago, read: `${grp(ago)} years before 2068` };
  }
  m = t.match(/(-?\d{1,5})\s*(a\.?\s?t\.?|after terra)/);
  if (m) return { ce: atToCE(Number(m[1])), read: `${m[1]} A.T.` };
  m = t.match(/(-?\d{1,5})\s*(b\.?c\.?e?\.?|before common era)/);
  if (m) return { ce: -Math.abs(Number(m[1])), read: `${Math.abs(Number(m[1]))} BCE` };
  m = t.match(/(-?\d{1,5})\s*(c\.?e\.?|a\.?d\.?)?/);
  if (m) { const n = Number(m[1]); return { ce: n, read: n < 0 ? `${-n} BCE` : `${n} CE` }; }
  return null;
}

/** "42 years" or "42 earth years" or "38 terran years": an age in all three calendars. */
export function parseAge(s) {
  const t = String(s || '').toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(?:(earth|terran|terra|kha-?ren)\s*)?(?:years?|yrs?)\b/);
  if (!m || /\b(ago|bce|bc|ce|a\.?t\.?)\b/.test(t)) return null;
  const from = /terr/.test(m[2] || '') ? 'at' : /kha/.test(m[2] || '') ? 'cycle' : 'ce';
  const n = Number(m[1]);
  return { from, n, earth: convertYears(n, from, 'ce'), terra: convertYears(n, from, 'at'), kharen: convertYears(n, from, 'cycle') };
}

/* ---------------- ticks ---------------- */

/** Nice tick step: 1, 2 or 5 times a power of ten, or months and days inside a year. */
export function tickStep(span, target = 8) {
  if (span < 2.5) {
    const days = (span * 365.25) / target;
    for (const d of [1, 2, 7, 14, 30.4375, 91.3125, 182.625]) if (days <= d) return d / 365.25;
    return 0.5;
  }
  const raw = span / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** An axis label for a tick at t, given the visible span, in the unit of the range. */
export function fmtTick(t, span) {
  const L = NOW - t;
  if (span > 2e8 || L > 2e8) return L < 1e6 ? 'now' : `${(L / 1e9).toFixed(L % 1e9 === 0 ? 0 : 1)} Ga`;
  if (span > 2e5 || L > 2e5) return L < 1000 ? 'now' : `${grp(L / 1000)} ka`;
  if (span < 0.25) return fmtDay(t).replace(/ \d+$/, '');
  if (span < 2.5) { const d = fmtDay(t).split(' '); return `${d[1]} ${d[2]}`; }
  if (span < 12) { const r = Math.floor(t + 1e-9); return r < 0 ? `${yr(-r)} BCE` : `${r}`; }
  const r = Math.round(t);
  return r < 0 ? `${yr(-r)} BCE` : r === 0 ? '1 CE' : `${r}`;
}

/** Axis label in align-by-discovery mode: years since each world's own discovery. */
export function fmtSince(t) {
  if (Math.abs(t) < 0.5) return 'discovery';
  return `${t > 0 ? '+' : '−'}${grp(Math.abs(t))} y`;
}

/* ---------------- the codex tables against the codex formulas ---------------- */

/** Compare every printed conversion row with the formulas. Returns one entry per disagreement. */
export function checkCalendarRows(rows) {
  const out = [];
  for (const r of rows) {
    if (r.at != null && ceToAT(r.ce) !== r.at) out.push({ ...r, field: 'A.T.', printed: `${r.at} A.T.`, computed: `${ceToAT(r.ce)} A.T.` });
    const cy = ceToCycle(r.ce);
    if (r.cycle) {
      const [c, y] = r.cycle;
      if (!cy || cy.cycle !== c || Math.abs(cy.year - y) > 1) out.push({ ...r, field: 'Cycle', printed: `Cycle ${c}, Year ${y}`, computed: cy ? `Cycle ${cy.cycle}, Year ${cy.year}` : 'before Cycle 1' });
    } else if (r.cycleOnly != null) {
      if (!cy || Math.abs(cy.cycle - r.cycleOnly) > 0) out.push({ ...r, field: 'Cycle', printed: `Cycle ${r.cycleOnly}`, computed: cy ? `Cycle ${cy.cycle}, Year ${cy.year}` : 'before Cycle 1' });
    }
  }
  return out;
}
