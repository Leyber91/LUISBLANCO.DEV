/* ============================================================
   kit/dom.js — the two DOM helpers every lab had written for
   itself, in their safe form.

   Why it exists: on 2026-11-14 about 25 files defined an `el`
   helper in three signatures. Several assign `innerHTML`, and in
   one lab that let text from a share link run as script. The
   helper here writes text as text. A lab that needs markup builds
   it from elements, or escapes each piece with `esc` and assigns
   it itself, where a reader can see it.
   ============================================================ */

/* An element with a class and text. The text is never parsed as HTML. (heptapod/views.js.) */
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Text made safe to place inside HTML, in element content or in a quoted attribute.
   (honesty-decoder/view/util.js; the copies that left out the quotes were not safe in attributes.) */
const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITY[c]);

/* Text with HTML's character references read back into the characters they name, for data that arrives escaped
   (the archive's reference labels: "Anglada-Escud&eacute; et al. 2016"). The result is text, to be written as text.
   It reads once: "&amp;eacute;" becomes "&eacute;". It knows what HTML names (WHATWG, named character references):
   - numeric references, decimal or hexadecimal with either x, and 128 to 159 as windows-1252, as HTML reads them;
   - the five of `esc`, the no-break space and the Latin letters below, whose names HTML defines;
   - a letter with one of eight accents by its name ("eacute"), for exactly the letters HTML names with that accent
     (ACCENTED, taken from the HTML5 table on 2026-11-17), composed by Unicode (NFC) rather than listed one by one.
   Any other reference stays as written, so nothing is guessed: one HTML does not define ("&etilde;"), one outside these
   tables ("&xcirc;", a circle), and one HTML would replace with U+FFFD (0, a surrogate, past U+10FFFF).
   Tests: kit/tests/dom.test.mjs, broken rule by rule by dom.mutants.test.mjs. (First caller: exoplanet/catalog.js.) */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', szlig: '\u00df', aelig: '\u00e6', AElig: '\u00c6',
  oslash: '\u00f8', Oslash: '\u00d8', eth: '\u00f0', ETH: '\u00d0', thorn: '\u00fe', THORN: '\u00de', oelig: '\u0153', OElig: '\u0152' };
const ACCENTED = {
  grave: ['\u0300', 'AEIOUaeiou'], acute: ['\u0301', 'ACEILNORSUYZacegilnorsuyz'], circ: ['\u0302', 'ACEGHIJOSUWYaceghijosuwy'],
  tilde: ['\u0303', 'AINOUainou'], uml: ['\u0308', 'AEIOUYaeiouy'], ring: ['\u030a', 'AUau'], cedil: ['\u0327', 'CGKLNRSTcklnrst'],
  caron: ['\u030c', 'CDELNRSTZcdelnrstz'],
};
/* 128 to 159: what HTML reads for each (windows-1252); the five it leaves as they are (129, 141, 143, 144, 157) are 0 */
const CP1252 = [0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178];
function named(name) {
  if (Object.hasOwn(NAMED, name)) return NAMED[name];
  const m = /^([A-Za-z])(grave|acute|circ|tilde|uml|ring|cedil|caron)$/.exec(name);
  if (!m || !ACCENTED[m[2]][1].includes(m[1])) return null;
  return (m[1] + ACCENTED[m[2]][0]).normalize('NFC');
}
function numeric(cp) {
  if (cp >= 0x80 && cp <= 0x9f) return CP1252[cp - 0x80] ? String.fromCodePoint(CP1252[cp - 0x80]) : String.fromCodePoint(cp);
  return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : null;
}
// the quantifiers only keep the scan short: no name of HTML's in these tables is longer than 6 letters, and a longer
// number is refused by the code-point bound
export const unesc = (s) => String(s ?? '').replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole, body) => {
  if (body[0] === '#') return numeric(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)) ?? whole;
  return named(body) ?? whole;
});
