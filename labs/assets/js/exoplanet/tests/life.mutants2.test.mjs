/* ============================================================
   The test of the colour a surface returns (science.js
   reflectanceColour, used by life.js). Run from the repository
   root:
     node labs/assets/js/exoplanet/tests/life.mutants2.test.mjs
   Each entry breaks the scaling that makes a surface returning
   all light white, or the share of light the eye sees it return;
   life.test.mjs must fail on each.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['a white surface not scaled to white', `const linear = c.rgb.map((v, i) => clamp(v / whiteRGB.rgb[i], 0, 1));`, `const linear = c.rgb.map((v) => clamp(v, 0, 1));`],
  ['the share of light not against a white surface', `Y: c.Y / whiteRGB.Y }`, `Y: c.Y }`],
  ['the green curve of the eye read as red', `Y += r * cmf(lam, CIE_FIT.y); Z += r * cmf(lam, CIE_FIT.z); }`, `Y += r * cmf(lam, CIE_FIT.x); Z += r * cmf(lam, CIE_FIT.z); }`],
  ['a surface brighter than white allowed', `clamp(v / whiteRGB.rgb[i], 0, 1)`, `clamp(v / whiteRGB.rgb[i], 0, 2)`],
  ['the curves of the eye sampled every 10 nm', `lam += 5) { const r = f(lam);`, `lam += 10) { const r = f(lam);`],
];

process.exit(await runMutants({ here, file: 'science.js', test: 'life.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
