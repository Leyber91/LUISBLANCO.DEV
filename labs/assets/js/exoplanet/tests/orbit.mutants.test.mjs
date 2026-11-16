/* ============================================================
   The test of the camera tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/orbit.mutants.test.mjs

   Each entry breaks one rule of orbit.js: the limit of the
   pitch moved to either side, the starting view changed, the
   circle left level or turned the other way, a bound dropped
   from one side. The broken file is written to a copy of this
   lab in the system's temp folder and orbit.test.mjs is run on
   the copy (mutants.mjs). Every broken rule must fail a check
   there.

   Add an entry here with every new rule in orbit.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FLOOR = `export const pitchMax = (lightDir) => Math.max(0.35, PITCH_LIMIT - Math.abs(orbitFrame(lightDir).tilt));`;
const CLAMP = `p = Math.max(-most, Math.min(most, pitch)), y = yaw - azimuth;`;

const MUTANTS = [
  /* ---- the limit and the starting view ---- */
  ['the limit back at 1.45, inside the shader\'s change of "up"', `export const PITCH_LIMIT = 1.4;`, `export const PITCH_LIMIT = 1.45;`],
  ['the limit at 1.41', `export const PITCH_LIMIT = 1.4;`, `export const PITCH_LIMIT = 1.41;`],
  ['the limit at 1.39', `export const PITCH_LIMIT = 1.4;`, `export const PITCH_LIMIT = 1.39;`],
  ['a world opens at the pitch of before, with the far star on the picture\'s edge', `pitch: 0.26 });`, `pitch: 0.3 });`],
  ['a world opens at a pitch of 0.25', `pitch: 0.26 });`, `pitch: 0.25 });`],
  ['a world opens at a pitch of 0.27', `pitch: 0.26 });`, `pitch: 0.27 });`],
  ['a world opens at a yaw of 0.8', `Object.freeze({ yaw: 0.7,`, `Object.freeze({ yaw: 0.8,`],
  ['the starting view can be changed by whoever reads it', `export const HOME = Object.freeze({ yaw: 0.7, pitch: 0.26 });`, `export const HOME = { yaw: 0.7, pitch: 0.26 };`],

  /* ---- the frame ---- */
  ['a direction is not brought to unit length', `return [v[0] / l, v[1] / l, v[2] / l]; };`, `return [v[0], v[1], v[2]]; };`],
  ['the cross product with one part\'s sign turned', `const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],`, `const cross = (a, b) => [a[2] * b[1] - a[1] * b[2],`],
  ['the level axis on the other side, so a turn goes the other way round', `let e2 = cross(e1, [0, 1, 0]);`, `let e2 = cross([0, 1, 0], e1);`],
  ['a star straight overhead leaves no level axis', `  if (Math.hypot(e2[0], e2[1], e2[2]) < 1e-3) e2 = [1, 0, 0];   // a star straight overhead: any level axis serves\n`, ``],
  ['every star treated as straight overhead', `if (Math.hypot(e2[0], e2[1], e2[2]) < 1e-3) e2`, `if (Math.hypot(e2[0], e2[1], e2[2]) < 2) e2`],
  ['the level axis not brought to unit length', `  e2 = norm(e2);\n`, ``],
  ['the pole on the lower side', `e3: cross(e2, e1),`, `e3: cross(e1, e2),`],
  ['the pole left as the scene\'s "up": the circle level, as before', `e3: cross(e2, e1),`, `e3: [0, 1, 0],`],
  ['the star\'s bearing read with its two parts exchanged', `azimuth: Math.atan2(e1[2], e1[0]),`, `azimuth: Math.atan2(e1[0], e1[2]),`],
  ['the star\'s bearing lost', `azimuth: Math.atan2(e1[2], e1[0]),`, `azimuth: 0,`],
  ['the star\'s height lost', `tilt: Math.asin(e1[1]) };`, `tilt: 0 };`],
  ['the star\'s height read as its sine', `tilt: Math.asin(e1[1]) };`, `tilt: e1[1] };`],

  /* ---- the pitch's bound ---- */
  ['a star near overhead leaves 0.3 of pitch', FLOOR, FLOOR.replace('Math.max(0.35,', 'Math.max(0.3,')],
  ['a star near overhead leaves 0.4 of pitch', FLOOR, FLOOR.replace('Math.max(0.35,', 'Math.max(0.4,')],
  ['a star near overhead leaves no pitch at all', FLOOR, `export const pitchMax = (lightDir) => PITCH_LIMIT - Math.abs(orbitFrame(lightDir).tilt);`],
  ['a star below the level plane gives more pitch than the limit', FLOOR, FLOOR.replace('Math.abs(orbitFrame(lightDir).tilt)', 'orbitFrame(lightDir).tilt')],
  ['the star\'s height added to the limit', FLOOR, FLOOR.replace('PITCH_LIMIT - ', 'PITCH_LIMIT + ')],
  ['the star\'s height not taken from the limit', FLOOR, `export const pitchMax = (lightDir) => Math.max(0.35, PITCH_LIMIT);`],
  ['a pitch past the bound is taken as it comes', CLAMP, `p = pitch, y = yaw - azimuth;`],
  ['a pitch past the bound is stopped above only', CLAMP, `p = Math.min(most, pitch), y = yaw - azimuth;`],
  ['a pitch past the bound is stopped below only', CLAMP, `p = Math.max(-most, pitch), y = yaw - azimuth;`],

  /* ---- where the camera stands ---- */
  ['the yaw counted from the star, so a stored view turns by the star\'s bearing', CLAMP, CLAMP.replace('y = yaw - azimuth;', 'y = yaw;')],
  ['the star\'s bearing added to the yaw', CLAMP, CLAMP.replace('y = yaw - azimuth;', 'y = yaw + azimuth;')],
  ['the pitch left out of the part toward the star', `const a = Math.cos(p) * Math.cos(y),`, `const a = Math.cos(y),`],
  ['the pitch left out of the level part', `b = Math.cos(p) * Math.sin(y),`, `b = Math.sin(y),`],
  ['a pitch up takes the camera down', `c = Math.sin(p);`, `c = -Math.sin(p);`],
  ['the pole\'s part left out of the camera\'s height', `a * e1[1] + b * e2[1] + c * e3[1],`, `a * e1[1] + b * e2[1],`],
  ['the star\'s part left out of the camera\'s height', `a * e1[1] + b * e2[1] + c * e3[1],`, `b * e2[1] + c * e3[1],`],
  /* ---- whose a touch is ---- */
  ['a touch read after 9 px', `export const TOUCH_SLOP = 8;`, `export const TOUCH_SLOP = 9;`],
  ['a touch read after 7 px', `export const TOUCH_SLOP = 8;`, `export const TOUCH_SLOP = 7;`],
  ['a touch of exactly 8 px not yet read', `if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;`, `if (Math.hypot(dx, dy) <= TOUCH_SLOP) return null;`],
  ['only the sideways travel counted before a touch is read', `if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;`, `if (Math.abs(dx) < TOUCH_SLOP) return null;`],
  ['a touch read at once, before it has travelled', `  if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;\n`, ``],
  ['an up-and-down touch is the page\'s even where the page does not scroll', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return Math.abs(dx) > Math.abs(dy);`],
  ['a scroll of the page turns the view, as before', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return true;`],
  ['every touch is the page\'s where the page scrolls', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return !pagePans;`],
  ['a touch as far up as sideways turns the view', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return !pagePans || Math.abs(dx) >= Math.abs(dy);`],
  ['the up-and-down touch turns the view and the sideways one scrolls', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return !pagePans || Math.abs(dx) < Math.abs(dy);`],
  ['a touch to the left or upward read by its sign', `return !pagePans || Math.abs(dx) > Math.abs(dy);`, `return !pagePans || dx > dy;`],

  ['the far side given as the star\'s side', `export const farSideYaw = (lightDir) => orbitFrame(lightDir).azimuth + Math.PI;`, `export const farSideYaw = (lightDir) => orbitFrame(lightDir).azimuth;`],
  ['the far side given a quarter turn short', `orbitFrame(lightDir).azimuth + Math.PI;`, `orbitFrame(lightDir).azimuth + Math.PI / 2;`],
];

process.exit(await runMutants({ here, file: 'orbit.js', test: 'orbit.test.mjs', mutants: MUTANTS, also: ['kit'] }));
