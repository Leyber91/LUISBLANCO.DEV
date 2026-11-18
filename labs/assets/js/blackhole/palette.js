/* ============================================================
   blackhole/palette.js — every colour the render draws and the
   copy names, in one place (fix_s2_brief C1 and C4).

   - A mark names the token that draws it (MARKS). Copy names a
     mark's colour by the word INK gives that token (colourWord),
     never by a word of its own, so a sentence cannot call a curve
     gold that the stylesheet draws pale blue (review_s2 P2-1).
   - The render's own diagnostic palettes (photon order, the
     integrator) and its hairlines take their constants from those
     tokens (glslMark), through the inverse of the final pass's tone
     map, so the legend's swatch is the colour on screen. None of
     them is gold: the --accretion family marks only what has
     happened (.claude/rules/labs.md). The integrator's drift above
     its limit is a failure state, drawn in --danger with its words
     beside it in the legend (fix_s2_brief C4, changed from --warn on
     2026-11-16: --warn sits within the gold rule's tolerance of
     --accretion, so a failure would read as "this happened").
   - PHYSICAL holds the colours that show how a well-known thing
     looks (the redshift map, the thin emitter's intensity map, the
     hot spot). They are kept as they were: that look is Luis's
     call (fix_s2_brief C4), and palette.test.mjs names them as the
     only constants allowed near gold.
   Pure: no page. Tests: palette.test.mjs; broken rules:
   tests/palette.mutants.test.mjs.
   ============================================================ */

import { COLOR_MODES } from './config.js';

/** The tokens the render and its legend use: tokens.css's value (palette.test.mjs reads the file and compares)
 *  and the one word copy uses for each. */
export const INK = {
  '--void': { hex: '#06080D', word: 'black' },
  '--text-dim': { hex: '#79828F', word: 'grey' },
  '--text': { hex: '#C5CCD8', word: 'light grey' },
  '--text-bright': { hex: '#EAF0FB', word: 'white' },
  '--horizon': { hex: '#9FB3D6', word: 'pale blue' },
  '--warn': { hex: '#E7B85C', word: 'amber' },
  '--danger': { hex: '#E06C75', word: 'red' },
  '--accretion': { hex: '#D4A24C', word: 'gold' },
};

/** Each mark the page draws, and the token that draws it. */
export const MARKS = {
  curve: '--horizon',        // the analytic critical curve on the telescope view (#bh-overlay .curve)
  order0: '--text-dim',      // photon order: n = 0, the direct image
  order1: '--text-bright',   // photon order: n = 1, light that went round once
  order2: '--horizon',       // photon order: n = 2 and higher
  steps: '--text-bright',    // the integrator: the top of the steps-per-ray ramp
  drift: '--danger',         // the integrator: null-condition drift above DRIFT_LIMIT, a failure
  annulus: '--text-bright',  // the annulus a visitor points at (the profile's hover, a probed disk pixel)
  plate: '--accretion',      // the plate's corner brackets: the one gold mark of the saved image
};

/** The integrator's limit on |H|: the shader draws a drift above it in MARKS.drift. */
export const DRIFT_LIMIT = 1e-4;
/** The exposure of the two diagnostic modes (main.js frameUniforms), so their constants land on their tokens. */
export const DIAG_EXPO = 0.9;

/** Colours that show how a well-known thing looks, kept as they were (not tokens; linear, before the tone map). */
export const PHYSICAL = {
  redshiftWarm: { rgb: [0.95, 0.38, 0.08], word: 'orange' },     // g < 1
  redshiftCold: { rgb: [0.62, 0.76, 1.05], word: 'blue-white' }, // g > 1
  redshiftMid: { rgb: [0.16, 0.17, 0.19], word: 'grey' },        // g = 1
  thin: { rgb: [1.0, 0.58, 0.22], word: 'orange' },              // the thin emitter's intensity map
  thinTop: { rgb: [1.0, 0.92, 0.8], word: 'white' },             // its brightest part
  hotSpot: { rgb: [1.0, 0.86, 0.6], word: 'white' },             // a hot spot in the disk
};

/** The lab's own constants that are not a token's (linear, before the tone map): all ink. */
export const LAB = {
  stepsFloor: [0.05, 0.06, 0.08],   // the integrator: one step per ray
  skyBand: [0.62, 0.68, 0.80],      // the faint band of the sky
};

/** The word copy uses for a mark's colour. */
export function colourWord(mark) {
  const t = MARKS[mark];
  if (!t) throw new Error(`no mark named ${mark}`);
  return INK[t].word;
}

/* ---------- the final pass, and its inverse ---------- */
const aces = (x) => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);   // Narkowicz 2015, as shaders.js
const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const fromSRGB = (s) => (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
/** The tone map's inverse on [0, 1): the root of (2.43 y - 2.51) x^2 + (0.59 y - 0.03) x + 0.14 y = 0 at or
 *  above 0 (the leading coefficient is negative on [0, 1), so exactly one root is). */
function acesInverse(y) {
  const A = 2.43 * y - 2.51, B = 0.59 * y - 0.03, C = 0.14 * y;
  return (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}

/** "#RRGGBB" as [r, g, b] in 0..255. */
export function rgbOf(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) throw new Error(`not a colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** The linear colour the final pass turns into this sRGB colour at this exposure (centre of the screen, no bloom). */
export function linearFor(hex, expo = 1) {
  return rgbOf(hex).map((v) => acesInverse(fromSRGB(v / 255)) / expo);
}
/** What the final pass draws for a linear colour at this exposure, in 0..255. */
export function displayRgb(lin, expo = 1) {
  return lin.map((v) => Math.round(255 * toSRGB(Math.min(1, Math.max(0, aces(v * expo))))));
}
const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`;
/** A mark's colour as a GLSL constant, for the exposure the shader applies before the tone map. */
export function glslMark(mark, expo = 1) { return vec3(linearFor(INK[MARKS[mark]].hex, expo)); }
/** A physical or lab constant as GLSL. */
export function glslConst(rgb) { return vec3(rgb); }

/* ---------- gold, as the site's rule reads it ---------- */
const GOLD = ['#D4A24C', '#F0C674', '#97681F'].map(rgbOf);   // --accretion, -soft, -dim (tokens.css)
/** A pixel of the gold tokens: each channel within 22 of one of them, the tolerance of the shared gold rule
 *  (tools/drives/invariants.mjs, its canvas scan). */
export function goldPixel(r, g, b) {
  return GOLD.some((t) => Math.abs(r - t[0]) <= 22 && Math.abs(g - t[1]) <= 22 && Math.abs(b - t[2]) <= 22);
}
/** Within 28 of a colour on every channel: the shared rule's allowance for a canvas drawn in a colour of its own. */
export function nearColour([r, g, b], hex) {
  const t = rgbOf(hex);
  return Math.abs(r - t[0]) <= 28 && Math.abs(g - t[1]) <= 28 && Math.abs(b - t[2]) <= 28;
}

/* ---------- the colour modes' notes and legends, named from the table ---------- */
const limitText = () => DRIFT_LIMIT.toExponential(0);
/** The note under the colour buttons: thermal and true colour as config.js writes them; the three maps whose
 *  colours copy names, from the table. */
export function modeNote(mode) {
  if (mode === 'redshift') return `g < 1 ${PHYSICAL.redshiftWarm.word}, g > 1 ${PHYSICAL.redshiftCold.word}: gravity and motion together`;
  if (mode === 'order') return `n = 0, the direct image, in ${colourWord('order0')}; n = 1 in ${colourWord('order1')} and n = 2 and higher in ${colourWord('order2')}: light that circled the hole first`;
  if (mode === 'steps') return `steps per ray as brightness, up to ${colourWord('steps')}; null-condition drift |H| above ${limitText()} in ${colourWord('drift')}, where the integrator has failed`;
  return COLOR_MODES[mode].note;
}
/** The legend's swatches for a mode: [the CSS colour, its words], the colour being the token that draws it. */
export function modeKey(mode) {
  const sw = (mark, words) => [`var(${MARKS[mark]})`, words];
  if (mode === 'order') return [sw('order0', 'n = 0, direct'), sw('order1', 'n = 1'), sw('order2', 'n = 2 and higher')];
  if (mode === 'steps') return [sw('steps', 'more steps'), sw('drift', `drift above ${limitText()}`)];
  return [];
}
