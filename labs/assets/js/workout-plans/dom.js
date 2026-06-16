/* ============================================================
   workout-plans/dom.js — tiny shared DOM utilities.

   NOTE: el() sets textContent (the 3rd arg), NOT innerHTML. This
   is deliberate and load-bearing: every node this page builds is
   filled with model- or user-derived strings (plan names, notes,
   caveats), so they must never be parsed as HTML. (This is the one
   intentional divergence from hub/dom.js, which builds trusted
   markup from site config and so uses innerHTML.)
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, cls, txt) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt != null) node.textContent = txt;
  return node;
}

export const setText = (sel, value, root = document) => {
  const n = $(sel, root);
  if (n) n.textContent = value;
};

export const setValue = (sel, value, root = document) => {
  const n = $(sel, root);
  if (n) n.value = value;
};
