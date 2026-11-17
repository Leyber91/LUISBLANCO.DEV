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
   Numeric references, the five of `esc`, and the accented Latin letters by their names: a name like "eacute" is the
   letter and its accent composed (Unicode NFC), so one rule covers all of them. A reference it does not know stays as
   it was, so nothing is guessed. (The first caller is exoplanet/catalog.js, 2026-11-17.) */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', szlig: 'ß', aelig: 'æ', AElig: 'Æ',
  oslash: 'ø', Oslash: 'Ø', eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ', oelig: 'œ', OElig: 'Œ' };
const MARK = { grave: '̀', acute: '́', circ: '̂', tilde: '̃', uml: '̈', ring: '̊', cedil: '̧', caron: '̌' };
function named(name) {
  if (Object.hasOwn(NAMED, name)) return NAMED[name];
  const m = /^([A-Za-z])(grave|acute|circ|tilde|uml|ring|cedil|caron)$/.exec(name);
  if (!m) return null;
  const c = (m[1] + MARK[m[2]]).normalize('NFC');
  return c.length === 1 ? c : null;   // a letter that takes no such accent is no reference
}
export const unesc = (s) => String(s ?? '').replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole, body) => {
  if (body[0] === '#') {
    const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : whole;
  }
  return named(body) ?? whole;
});
