/* ============================================================
   The test of the palette tests. Run from the repository root:
     node labs/assets/js/blackhole/tests/palette.mutants.test.mjs

   Each entry breaks one rule of palette.js (2026-11-16, after
   review_s2.md P2-1 and P3-1): the tokens and the words copy names
   them by, the marks and the tokens that draw them, the final
   pass's inverse (each branch of sRGB, each clamp), the gold rule's
   tolerance on each channel just inside and just outside, the
   own-colour allowance, the notes and the legends of the colour
   modes, and the values kept as they were. The broken file is
   written to a copy of this lab in the system's temp folder and
   palette.test.mjs is run on the copy (kit/tests/mutants.mjs).
   Every broken rule must fail a check there.

   Add an entry here with every new rule in palette.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/palette.js labs/assets/js/blackhole/tests/palette.mutants.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDPX = 'return GOLD.some((t) => Math.abs(r - t[0]) <= 22 && Math.abs(g - t[1]) <= 22 && Math.abs(b - t[2]) <= 22);';
const NEAR = 'return Math.abs(r - t[0]) <= 28 && Math.abs(g - t[1]) <= 28 && Math.abs(b - t[2]) <= 28;';
const DISPLAY = 'return lin.map((v) => Math.round(255 * toSRGB(Math.min(1, Math.max(0, aces(v * expo))))));';

const MUTANTS = [
  /* ---- the tokens, their words, the marks ---- */
  ['a token\'s value not tokens.css\'s', `'--horizon': { hex: '#9FB3D6'`, `'--horizon': { hex: '#9FB3D7'`],
  ['two tokens share a word', `'--text-bright': { hex: '#EAF0FB', word: 'white' }`, `'--text-bright': { hex: '#EAF0FB', word: 'grey' }`],
  ['the curve marked in gold again', `curve: '--horizon',`, `curve: '--accretion',`],
  ['n = 1 marked in gold', `order1: '--text-bright',`, `order1: '--accretion',`],
  ['n = 0 marked bright', `order0: '--text-dim',`, `order0: '--text-bright',`],
  ['n = 2 marked white', `order2: '--horizon',`, `order2: '--text-bright',`],
  ['the drift marked in gold', `drift: '--danger',`, `drift: '--accretion',`],
  ['the drift marked in amber, within the gold rule\'s tolerance', `drift: '--danger',`, `drift: '--warn',`],
  ['the annulus in gold', `annulus: '--text-bright',`, `annulus: '--accretion',`],
  ['colourWord names another token\'s word', `return INK[t].word;`, `return INK['--warn'].word;`],
  ['the drift\'s limit at 1e-3', `export const DRIFT_LIMIT = 1e-4;`, `export const DRIFT_LIMIT = 1e-3;`],
  ['the diagnostic exposure at 1', `export const DIAG_EXPO = 0.9;`, `export const DIAG_EXPO = 1;`],
  ['a physical colour changed', `redshiftWarm: { rgb: [0.95, 0.38, 0.08]`, `redshiftWarm: { rgb: [0.95, 0.48, 0.08]`],
  ['a lab ink constant changed', `skyBand: [0.62, 0.68, 0.80],`, `skyBand: [0.62, 0.68, 0.90],`],

  /* ---- the final pass and its inverse ---- */
  ['sRGB\'s linear part read up to 0.4 on the way in', `(s <= 0.04045 ? s / 12.92`, `(s <= 0.4 ? s / 12.92`],
  ['sRGB\'s linear part read up to 0.1 on the way out', `(c <= 0.0031308 ? 12.92 * c`, `(c <= 0.1 ? 12.92 * c`],
  ['the inverse takes the other root', `return (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * A);`, `return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);`],
  ['the inverse ignores the exposure', `return rgbOf(hex).map((v) => acesInverse(fromSRGB(v / 255)) / expo);`, `return rgbOf(hex).map((v) => acesInverse(fromSRGB(v / 255)));`],
  ['the display not clamped at white', DISPLAY, DISPLAY.replace(`Math.min(1,`, `Math.min(2,`)],
  ['the display not clamped at black', DISPLAY, DISPLAY.replace(`Math.max(0,`, `Math.max(-1,`)],
  ['the display ignores the exposure', DISPLAY, DISPLAY.replace(`aces(v * expo)`, `aces(v)`)],
  ['rgbOf reads green as red', `return [(n >> 16) & 255, (n >> 8) & 255, n & 255];`, `return [(n >> 8) & 255, (n >> 8) & 255, n & 255];`],
  ['a mark\'s GLSL at exposure 1 whatever is asked', `export function glslMark(mark, expo = 1) { return vec3(linearFor(INK[MARKS[mark]].hex, expo)); }`, `export function glslMark(mark, expo = 1) { return vec3(linearFor(INK[MARKS[mark]].hex, 1)); }`],
  ['GLSL constants to two decimals', 'const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(\', \')})`;', 'const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(2)).join(\', \')})`;'],
  ['glslConst rounds its value', `export function glslConst(rgb) { return vec3(rgb); }`, `export function glslConst(rgb) { return vec3(rgb.map((v) => Math.round(v))); }`],

  /* ---- gold, as the site's rule reads it ---- */
  ['--accretion-dim left out of gold', `const GOLD = ['#D4A24C', '#F0C674', '#97681F'].map(rgbOf);`, `const GOLD = ['#D4A24C', '#F0C674'].map(rgbOf);`],
  ['gold to 23 on red', GOLDPX, GOLDPX.replace(`Math.abs(r - t[0]) <= 22`, `Math.abs(r - t[0]) <= 23`)],
  ['gold to 21 on red', GOLDPX, GOLDPX.replace(`Math.abs(r - t[0]) <= 22`, `Math.abs(r - t[0]) <= 21`)],
  ['gold to 23 on green', GOLDPX, GOLDPX.replace(`Math.abs(g - t[1]) <= 22`, `Math.abs(g - t[1]) <= 23`)],
  ['gold to 21 on green', GOLDPX, GOLDPX.replace(`Math.abs(g - t[1]) <= 22`, `Math.abs(g - t[1]) <= 21`)],
  ['gold to 23 on blue', GOLDPX, GOLDPX.replace(`Math.abs(b - t[2]) <= 22`, `Math.abs(b - t[2]) <= 23`)],
  ['gold to 21 on blue', GOLDPX, GOLDPX.replace(`Math.abs(b - t[2]) <= 22`, `Math.abs(b - t[2]) <= 21`)],
  ['near to 29 on red', NEAR, NEAR.replace(`Math.abs(r - t[0]) <= 28`, `Math.abs(r - t[0]) <= 29`)],
  ['near to 27 on red', NEAR, NEAR.replace(`Math.abs(r - t[0]) <= 28`, `Math.abs(r - t[0]) <= 27`)],
  ['near to 29 on green', NEAR, NEAR.replace(`Math.abs(g - t[1]) <= 28`, `Math.abs(g - t[1]) <= 29`)],
  ['near to 27 on green', NEAR, NEAR.replace(`Math.abs(g - t[1]) <= 28`, `Math.abs(g - t[1]) <= 27`)],
  ['near to 29 on blue', NEAR, NEAR.replace(`Math.abs(b - t[2]) <= 28`, `Math.abs(b - t[2]) <= 29`)],
  ['near to 27 on blue', NEAR, NEAR.replace(`Math.abs(b - t[2]) <= 28`, `Math.abs(b - t[2]) <= 27`)],

  /* ---- the colour modes' notes and legends ---- */
  ['the redshift note from config.js', `if (mode === 'redshift') return`, `if (mode === 'redshiftX') return`],
  ['the order note from config.js', `if (mode === 'order') return \`n = 0`, `if (mode === 'orderX') return \`n = 0`],
  ['the steps note from config.js', `if (mode === 'steps') return \`steps per ray`, `if (mode === 'stepsX') return \`steps per ray`],
  ['the redshift note names its own colours', '`g < 1 ${PHYSICAL.redshiftWarm.word}, g > 1', '`g < 1 amber, g > 1'],
  ['the steps note names no limit', 'above ${limitText()} in ${colourWord(\'drift\')}', 'above the limit in ${colourWord(\'drift\')}'],
  ['the limit written in full', `const limitText = () => DRIFT_LIMIT.toExponential(0);`, `const limitText = () => String(DRIFT_LIMIT);`],
  ['no order legend', `if (mode === 'order') return [sw(`, `if (mode === 'orderX') return [sw(`],
  ['no integrator legend', `if (mode === 'steps') return [sw(`, `if (mode === 'stepsX') return [sw(`],
  ['the legend\'s swatch not its mark\'s token', "const sw = (mark, words) => [`var(${MARKS[mark]})`, words];", "const sw = (mark, words) => ['var(--horizon)', words];"],
];

// the test reads the two stylesheets beside the lab
process.exit(await runMutants({ here, file: 'palette.js', test: '../palette.test.mjs', mutants: MUTANTS, data: ['css/tokens.css', 'css/black_hole.css'] }));
