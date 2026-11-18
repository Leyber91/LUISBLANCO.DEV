/* ============================================================
   blackhole/palette.test.mjs — the colours the render draws and
   the words the copy names them by.
   Run:  node labs/assets/js/blackhole/palette.test.mjs
   Exit 0 when every check passes. No dependencies.

   Written 2026-11-16 after review_s2.md P2-1 (copy called a curve
   gold that the stylesheet draws pale blue) and P3-1 (the render's
   own palettes painted gold for nothing that happened). It reads
   tokens.css, black_hole.css and the GLSL shaders.js builds, and
   fails on any colour constant of the render near the gold tokens,
   except the physical ones palette.js names (fix_s2_brief C4).
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as C from './palette.js';
import * as S from './shaders.js';
import { COLOR_MODES } from './config.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
/* gold-like by hue, the band review_s2 measured the render with: red the largest channel, hue 26 to 52 deg
   (--accretion is 38), saturation 0.45 or more, 110 or brighter */
const goldHue = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 110 || mx !== r || (mx - mn) / mx < 0.45) return false;
  const h = 60 * ((g - b) / (mx - mn));
  return h >= 26 && h <= 52;
};
const gold = (rgb) => C.goldPixel(...rgb) || goldHue(...rgb);
/* the render scales a colour by brightness (temperature, limb, mixing, exposure), and a pale yellow at full
   strength is gold at half: a constant is gold if it is gold at any of these strengths */
const STRENGTHS = [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 1, 1.4, 2];
const goldAt = (c) => STRENGTHS.find((k) => gold(C.displayRgb(c.map((v) => v * k))));

/* ---------- the tokens are tokens.css's ---------- */
guard('the tokens', () => {
  const css = read('../../css/tokens.css');
  for (const [t, { hex }] of Object.entries(C.INK)) {
    const m = new RegExp(`${t}:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
    ok(`${t} is ${hex} as in tokens.css`, m && m[1].toUpperCase() === hex.toUpperCase(), m && m[1]);
  }
  for (const [mark, t] of Object.entries(C.MARKS)) ok(`the mark ${mark} is drawn in a token the table names (${t})`, !!C.INK[t]);
  const words = Object.values(C.INK).map((v) => v.word);
  ok('no two tokens share a word', new Set(words).size === words.length, words.join(', '));
});

/* ---------- P2-1: copy names a mark by the word of the token the stylesheet draws it with ---------- */
guard('the curve', () => {
  ok('the curve is named pale blue', C.colourWord('curve') === 'pale blue');
  const css = read('../../css/black_hole.css');
  const m = /#bh-overlay \.curve \{[^}]*stroke: var\((--[\w-]+)\)/.exec(css);
  ok(`the stylesheet draws the curve in ${C.MARKS.curve}, the token copy names`, m && m[1] === C.MARKS.curve, m && m[1]);
  let threw = false;
  try { C.colourWord('nosuch'); } catch { threw = true; }
  ok('a mark the table does not have is an error, never a word', threw);
});

/* ---------- the tone map and its inverse ---------- */
guard('the inverse of the final pass', () => {
  ok('shaders.js tone maps with the curve palette.js inverts', S.FINAL.includes('(x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14)') && S.FINAL.includes('1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)'));
  for (const [t, { hex }] of Object.entries(C.INK)) for (const e of [1, C.DIAG_EXPO]) {
    const back = C.displayRgb(C.linearFor(hex, e), e), want = C.rgbOf(hex);
    ok(`${t} at exposure ${e}: through the final pass it is ${hex} again`, back.every((v, i) => Math.abs(v - want[i]) <= 1), back.join(','));
  }
  // both roots of the quadratic tone-map back to the token; only the one at or above 0 dims as the render scales it
  ok('the inverse takes the root at or above 0', Object.values(C.INK).every(({ hex }) => C.linearFor(hex).every((v) => v >= 0)), C.linearFor('#9FB3D6').join(','));
  ok('so half of a token\'s linear colour shows darker than the token', C.displayRgb(C.linearFor('#9FB3D6').map((v) => v / 2)).every((v, i) => v < C.rgbOf('#9FB3D6')[i]));
  ok('a very dark colour (#010101) is inverted on the linear part of sRGB', C.displayRgb(C.linearFor('#010101'))[0] === 1, C.displayRgb(C.linearFor('#010101')).join(','));
  ok('beyond the tone map\'s white the colour is clamped to 255', C.displayRgb([10, 10, 10]).every((v) => v === 255) && C.displayRgb([1e6, 1e6, 1e6]).every((v) => v === 255), C.displayRgb([1e6, 1e6, 1e6]).join(','));
  ok('a GLSL constant: four decimals', C.glslConst([0.05, 0.06, 0.08]) === 'vec3(0.0500, 0.0600, 0.0800)', C.glslConst([0.05, 0.06, 0.08]));
  ok('the diagnostic exposure is the 0.9 the two modes had', C.DIAG_EXPO === 0.9);
  ok('the integrator\'s limit is 1e-4, the shader\'s log10 |H| > -4.0', C.DRIFT_LIMIT === 1e-4 && S.shadeProgram().includes('g2.w > -4.0)'));
  ok('the physical colours are the values they had (fix_s2_brief C4: unchanged)', JSON.stringify(Object.fromEntries(Object.entries(C.PHYSICAL).map(([k, v]) => [k, v.rgb]))) === JSON.stringify({ redshiftWarm: [0.95, 0.38, 0.08], redshiftCold: [0.62, 0.76, 1.05], redshiftMid: [0.16, 0.17, 0.19], thin: [1.0, 0.58, 0.22], thinTop: [1.0, 0.92, 0.8], hotSpot: [1.0, 0.86, 0.6] }));
  ok('the lab\'s ink constants are the values they had', JSON.stringify(C.LAB) === JSON.stringify({ stepsFloor: [0.05, 0.06, 0.08], skyBand: [0.62, 0.68, 0.80] }));
  ok('a value the tone map sends below 0 is clamped to 0', C.displayRgb([-0.005, -0.005, -0.005]).every((v) => v === 0), C.displayRgb([-0.005, -0.005, -0.005]).join(','));
  ok('just inside sRGB\'s linear part, 0.003, is 12.92 x', C.displayRgb([C.linearFor('#000000')[0]])[0] === 0);
  ok('the GLSL constant of a mark is its linear colour at the exposure given', C.glslMark('order1', C.DIAG_EXPO) === `vec3(${C.linearFor('#EAF0FB', C.DIAG_EXPO).map((v) => v.toFixed(4)).join(', ')})`, C.glslMark('order1', C.DIAG_EXPO));
  let threw = false;
  try { C.rgbOf('#12345'); } catch { threw = true; }
  ok('a colour that is not #RRGGBB is an error', threw);
});

/* ---------- P3-1: no colour of the render near gold, but the physical ones ---------- */
guard('no gold in the render', () => {
  // every three-number vec3 the shaders build, read as a colour at exposure 1
  const glsl = [S.traceProgram(), S.shadeProgram(), S.FINAL, S.directProgram()].join('\n');
  const consts = [...glsl.matchAll(/vec3\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const physical = Object.values(C.PHYSICAL).map((p) => p.rgb.join(','));
  const near = consts.filter((c) => !physical.includes(c.join(',')) && goldAt(c) !== undefined);
  // the drift is --danger (2026-11-16): a status colour with its words in the legend, and not gold at any strength,
  // which --warn was (within 22 of --accretion on every channel); so no constant of the shaders is excused here
  const left = near;
  ok(`no vec3 constant of the shaders is gold at any strength, but the physical ones (${consts.length} read)`, left.length === 0, [...new Set(left.map((c) => `vec3(${c.join(', ')}) at x${goldAt(c)} shows ${C.displayRgb(c.map((v) => v * goldAt(c))).join(',')}`))].join('; '));
  ok('the drift is drawn in --danger, which is gold at no strength', C.MARKS.drift === '--danger' && glsl.includes(C.glslMark('drift', C.DIAG_EXPO)) && goldAt(C.linearFor(C.INK['--danger'].hex, C.DIAG_EXPO)) === undefined, C.MARKS.drift);
  for (const old of ['vec3(0.85, 0.52, 0.14)', 'vec3(1.0, 0.66, 0.2)', 'vec3(0.83, 0.64, 0.30)', 'vec3(0.94, 0.78, 0.45)'])
    ok(`the gold constant ${old} is gone from the shaders`, !glsl.includes(old));
  for (const mark of ['order0', 'order1', 'order2', 'steps', 'drift']) ok(`the shaders draw ${mark} in its token at the diagnostic exposure`, glsl.includes(C.glslMark(mark, C.DIAG_EXPO)), C.glslMark(mark, C.DIAG_EXPO));
  ok('the shaders draw the annulus hairline in its token', glsl.includes(C.glslMark('annulus')), C.glslMark('annulus'));
  for (const [name, c] of Object.entries(C.LAB)) ok(`the lab constant ${name} is ink, not gold`, !gold(C.displayRgb(c)) && glsl.includes(C.glslConst(c)), C.displayRgb(c).join(','));
  for (const [name, p] of Object.entries(C.PHYSICAL)) ok(`the physical colour ${name} is drawn as it was`, glsl.includes(C.glslConst(p.rgb)), C.glslConst(p.rgb));
  ok('the diagnostic modes are exposed at DIAG_EXPO in main.js', /order: DIAG_EXPO, steps: DIAG_EXPO/.test(read('main.js')));
  ok('and do not bloom: a bloom of a token\'s linear colour glows in its largest channel alone', /bloom: s\.color === 'order' \|\| s\.color === 'steps' \? 0 : 0\.5/.test(read('main.js')));
  ok('the plate draws its brackets from the table, no colour literal of its own', !/#[0-9A-Fa-f]{6}/.test(read('plate.js')));
});

/* ---------- the shared gold rule's tolerance, just inside and just outside ---------- */
guard('goldPixel', () => {
  ok('--accretion itself', C.goldPixel(212, 162, 76));
  ok('22 off on red, green and blue: gold', C.goldPixel(234, 162, 76) && C.goldPixel(212, 140, 76) && C.goldPixel(212, 162, 98));
  ok('23 off on red, green or blue: not', !C.goldPixel(235, 162, 76) && !C.goldPixel(212, 139, 76) && !C.goldPixel(212, 162, 99));
  ok('--accretion-soft and --accretion-dim', C.goldPixel(240, 198, 116) && C.goldPixel(151, 104, 31));
  ok('the ink is not', !C.goldPixel(159, 179, 214) && !C.goldPixel(234, 240, 251) && !C.goldPixel(121, 130, 143));
  ok('nearColour: 28 off is near, 29 off is not, on each channel', C.nearColour([259, 184, 92], '#E7B85C') && C.nearColour([231, 156, 92], '#E7B85C') && C.nearColour([231, 184, 64], '#E7B85C')
    && !C.nearColour([260, 184, 92], '#E7B85C') && !C.nearColour([231, 155, 92], '#E7B85C') && !C.nearColour([231, 184, 63], '#E7B85C'));
});

/* ---------- the colour modes say what the render draws ---------- */
guard('the notes and the legend', () => {
  ok('Photon order names its three tokens\' words', C.modeNote('order') === 'n = 0, the direct image, in grey; n = 1 in white and n = 2 and higher in pale blue: light that circled the hole first', C.modeNote('order'));
  ok('Integrator names its ramp and the drift\'s limit and colour', C.modeNote('steps') === 'steps per ray as brightness, up to white; null-condition drift |H| above 1e-4 in red, where the integrator has failed', C.modeNote('steps'));
  ok('Redshift names the map\'s physical colours', C.modeNote('redshift') === 'g < 1 orange, g > 1 blue-white: gravity and motion together', C.modeNote('redshift'));
  ok('Thermal and True colour keep config.js\'s notes', C.modeNote('thermal') === COLOR_MODES.thermal.note && C.modeNote('true') === COLOR_MODES.true.note);
  for (const m of Object.keys(COLOR_MODES)) ok(`no note says gold (${m})`, !/gold/i.test(C.modeNote(m)), C.modeNote(m));
  ok('config.js keeps no colour words of its own for the three named maps', ['redshift', 'order', 'steps'].every((m) => COLOR_MODES[m].note === undefined));
  ok('the order legend: one swatch per order, each its mark\'s token', JSON.stringify(C.modeKey('order')) === JSON.stringify([['var(--text-dim)', 'n = 0, direct'], ['var(--text-bright)', 'n = 1'], ['var(--horizon)', 'n = 2 and higher']]), JSON.stringify(C.modeKey('order')));
  ok('the integrator legend: the ramp and the drift, labelled with its limit', JSON.stringify(C.modeKey('steps')) === JSON.stringify([['var(--text-bright)', 'more steps'], ['var(--danger)', 'drift above 1e-4']]), JSON.stringify(C.modeKey('steps')));
  ok('the physical maps have no swatches', C.modeKey('thermal').length === 0 && C.modeKey('redshift').length === 0 && C.modeKey('true').length === 0);
});

console.log(fails ? `\n${fails} of ${checks} palette check(s) failed` : `\nall ${checks} palette checks passed`);
process.exit(fails ? 1 : 0);
