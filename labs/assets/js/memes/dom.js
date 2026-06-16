/* ============================================================
   memes/dom.js — tiny shared DOM utilities for the meme lab.
   `el` sets textContent (not innerHTML): the slate is built from
   model output, so it must never be parsed as markup.
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls, txt) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt != null) node.textContent = txt;
  return node;
}
