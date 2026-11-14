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
