/* ============================================================
   kit/shapes.js: the geometry of the labs' shared shapes, with no
   page in it. The drawing is in kit/controls.js and the look in
   assets/css/controls.css.

   Lifted on 2026-11-16 with their first caller, the Exomania
   survey (bar sheet BAR_L2, shapes 02, 03, 05, 09):
   - an interval drawn on one shared log axis, as a forest plot
     draws each study: where the value's tick and the two ends of
     its range fall in a strip of a given width;
   - a scale whose options are chosen by the arrow keys, as the
     distance scale of a lens: which option a key moves to;
   - a tally, as an observer's logbook: how many marks fit a strip
     and which of them are the tall ones.

   Tests: kit/tests/shapes.test.mjs; broken rules:
   kit/tests/shapes.mutants.test.mjs.
   ============================================================ */

/* The shared axis reaches a factor of 2.2 either side of the value, so x1/2 and x2 fall inside it. */
export const IV_SPAN = 2.2;
/* Room kept at each end of the strip, so an end cut by the axis is still seen to end there. */
export const IV_PAD = 3;

const positive = (v) => Number.isFinite(v) && v > 0;   // Number.isFinite takes no string, so '2' is not a value

/* Where an interval falls in a strip `width` px wide whose middle is the value: { xc, a, b, ranged, cutLo, cutHi },
   a and b the ends in px (cut to the strip, with the cut said), or null when the value cannot sit on a log axis.
   An interval is drawn only when both ends are positive and lo <= value <= hi; otherwise the value stands alone. */
export function ivGeometry(value, lo, hi, width, span = IV_SPAN) {
  if (!positive(value) || !(width > 2 * IV_PAD) || !(span > 1)) return null;
  const xc = width / 2, k = (xc - IV_PAD) / Math.log(span);
  const x = (v) => xc + k * Math.log(v / value);
  const ranged = positive(lo) && positive(hi) && lo <= value && value <= hi && lo < hi;
  if (!ranged) return { xc, a: xc, b: xc, ranged: false, cutLo: false, cutHi: false };
  const ra = x(lo), rb = x(hi);
  const a = Math.max(IV_PAD, ra), b = Math.min(width - IV_PAD, rb);
  return { xc, a, b, ranged: true, cutLo: ra < IV_PAD, cutHi: rb > width - IV_PAD };
}

/* Where a factor of the value (0.5 for x1/2, 2 for x2) falls on the same strip. */
export function ivAt(factor, width, span = IV_SPAN) {
  const xc = width / 2, k = (xc - IV_PAD) / Math.log(span);
  return xc + k * Math.log(factor);
}

/* The option a key moves a scale of n options to, from option i. The ends stop the scale, as the ends of a lens's
   ring do. Keys the scale does not take give null. */
export function scaleStep(i, n, key) {
  if (!(n > 0)) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(n - 1, i + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, i - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}

/* A tally of `count` things of which `tall` are marked, drawn in a strip `room` px wide with a mark every `pitch` px.
   Returns { marks, tall: [indices of the tall marks], all }: all is false when the strip holds fewer marks than the
   count. When it does hold them all, each tall thing has its own tall mark; when it does not, the tall marks keep
   their share of the strip, and one at least stands for any. */
export function tallyMarks(count, tall, room, pitch = 7) {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const t = Math.max(0, Math.floor(Number.isFinite(tall) ? tall : 0));
  const fit = room > 0 && pitch > 0 ? Math.floor(room / pitch) : 0;
  const marks = Math.min(n, fit);
  const all = marks === n;
  const shown = t === 0 ? 0 : Math.max(1, Math.round((marks * t) / n));   // all shown: each kept thing its own mark; more kept than counted: every mark; no marks: the loop draws none
  const at = [];
  for (let i = 0; i < marks; i++) if (Math.floor(((i + 1) * shown) / marks) > Math.floor((i * shown) / marks)) at.push(i);
  return { marks, tall: at, all };
}
