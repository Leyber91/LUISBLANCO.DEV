/* ============================================================
   dimensional_mania/dom.js — tiny shared helpers: element
   construction, number/angle formatting, and the reduced-motion
   resolution (the ?still / ?motion / OS-preference rule, decided
   once). Mirrors hub/dom.js.
   ============================================================ */

import { PARAMS } from './constants.js';

/** build an element with optional class + innerHTML (matches the hub idiom) */
export const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
};

/** thousands-separated integer */
export const fmt = (v) => v.toLocaleString('en-US');

/** radians -> integer degrees in [0,360) */
export const deg = (rad) =>
  Math.round(((rad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI);

/**
 * Resolve the motion policy from the URL + OS preference, once.
 * ?still  -> frozen (also tags <html> with .still for CSS)
 * ?motion -> force full motion even when the OS asks to reduce it
 * otherwise -> follow prefers-reduced-motion
 * @returns {{ still: boolean, forceMotion: boolean, reduced: boolean }}
 */
export const resolveMotion = () => {
  const params = new URLSearchParams(location.search);
  const still = params.has(PARAMS.still);
  const forceMotion = params.has(PARAMS.motion);
  const reduced = still ||
    (!forceMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (still) document.documentElement.classList.add('still');
  return { still, forceMotion, reduced };
};
