/* ============================================================
   hub/dom.js — tiny shared DOM utilities used by every component.
   ============================================================ */

import { STILL } from './constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $all = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

export const setText = (sel, value, root = document) => {
  const n = $(sel, root);
  if (n) n.textContent = value;
};

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isStill = () => !!window[STILL.flagKey];
/** true when motion should be frozen (reduced-motion users OR ?still) */
export const reduced = () => prefersReducedMotion() || isStill();
