/* ============================================================
   The test of the life tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/life.mutants.test.mjs

   Each entry breaks one rule of life.js: a value of the paper's
   tables, the nearest case's tie turned or the first case always
   taken, an article, an end of the cases' range, a look or a zone
   given
   or denied surface life, a reading dropped or a band taken out,
   a cover blind to its case or its starlight, a word of light or
   ratio at the wrong bound, a sentence said where it does not
   fit or never said. The broken file is written to a copy of
   this lab in the system's temp folder and life.test.mjs is run
   on the copy (mutants.mjs). Every broken rule must fail a check
   there. The colour's own rule, in science.js, is broken in
   life.mutants2.test.mjs.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  /* ---- the paper's tables ---- */
  ['the F2V peak in the blue moved', `T: 6820, peak: 450.8,`, `T: 6820, peak: 470.8,`],
  ['the Sun\'s visible light changed', `peak: 668.5, par: 11.0,`, `peak: 668.5, par: 12.0,`],
  ['epsilon Eridani at Pecaut and Mamajek\'s K2V temperature instead of the archive\'s', `T: 5020,`, `T: 5100,`],
  ['the M1V productivity over the wide band changed', `gppVis: 0.33, gppWide: 0.81`, `gppVis: 0.33, gppWide: 0.33`],
  ['the M5V UV-B given a value', `peak: 1042.8, par: 1.5, uvb: 0.000,`, `peak: 1042.8, par: 1.5, uvb: 0.001,`],

  /* ---- the nearest case ---- */
  ['a tie between two cases given to the cooler star', `if (Math.abs(x.T - teff) < Math.abs(c.T - teff)) c = x;`, `if (Math.abs(x.T - teff) <= Math.abs(c.T - teff)) c = x;`],
  ['the first case always taken', `if (Math.abs(x.T - teff) < Math.abs(c.T - teff)) c = x;`, `if (false) c = x;`],
  ['an F without its "an"', `['O', 'A', 'F', 'M', 'L'].includes(type) ? 'an' : 'a'`, `['O', 'A', 'M', 'L'].includes(type) ? 'an' : 'a'`],
  ['an A without its "an"', `['O', 'A', 'F', 'M', 'L'].includes(type) ? 'an' : 'a'`, `['O', 'F', 'M', 'L'].includes(type) ? 'an' : 'a'`],
  ['a G given "an"', `['O', 'A', 'F', 'M', 'L'].includes(type) ? 'an' : 'a'`, `['O', 'A', 'F', 'M', 'L', 'G'].includes(type) ? 'an' : 'a'`],
  ['the hot end itself extrapolated', `extrapolated: teff > F2V.T || teff < M5V.T`, `extrapolated: teff >= F2V.T || teff < M5V.T`],
  ['the cool end itself extrapolated', `extrapolated: teff > F2V.T || teff < M5V.T`, `extrapolated: teff > F2V.T || teff <= M5V.T`],
  ['nothing ever extrapolated', `extrapolated: teff > F2V.T || teff < M5V.T`, `extrapolated: false`],

  /* ---- where surface life is considered ---- */
  ['a temperate world given no surface life', `if (k.look === 'temperate') return { surface: true, why: '' };`, `if (k.look === 'temperate') return { surface: false, why: '' };`],
  ['a thin-air desert in the zone taken as fully covered', `return { surface: 'sparse', why: WHY.desertSparse };`, `return { surface: true, why: WHY.desertSparse };`],
  ['a thin-air desert outside the zone given life', `if (zone === 'cons' || zone === 'opt') return`, `if (zone !== 'unknown') return`],
  ['a desert past the inner edge said to be cold', `why: zone === 'hot' ? WHY.desertHot :`, `why: zone === 'cold' ? WHY.desertHot :`],
  ['the ice and molten looks given surface life', `if (k.look === 'shrouded' || k.look === 'molten' || k.look === 'airless' || k.look === 'ice') return { surface: false, why: WHY[k.look] };`, `if (k.look === 'shrouded' || k.look === 'airless') return { surface: false, why: WHY[k.look] };`],
  ['a sub-Neptune called a gas giant', `: k.klass === 2 ? WHY.subNeptune :`, `: k.klass === 2 ? WHY.gasGiant :`],
  ['a world with no measured radius called a giant', `!k.physics.radiusKnown ? WHY.noRadius :`, `false ? WHY.noRadius :`],

  /* ---- the readings and their colours ---- */
  ['an M dwarf given one reading', `  return [\n    mk('a',`, `  return [mk('b', 'Reading b: x', [SORET, { mu: CHL_A, w: 20, d: 0.85 }], 0, c.gppVis)];\n  return [\n    mk('a',`],
  ['the dark reading not harvesting the visible', `}], 0.8, /** @type {number} */ (c.gppWide)),`, `}], 0, /** @type {number} */ (c.gppWide)),`],
  ['reading b without its chlorophyll band', `with less light to grow on.\`, [SORET, { mu: CHL_A, w: 20, d: 0.85 }], 0, c.gppVis),`, `with less light to grow on.\`, [SORET], 0, c.gppVis),`],
  ['the F star\'s blue band left out', `[{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];`, `[{ mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];`],
  ['the Sun\'s red band left out', `[SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, c.gppVis)];`, `[SORET], 0, c.gppVis)];`],
  ['no red edge on a leaf', `const VIS = 0.14, NIR = 0.5;`, `const VIS = 0.14, NIR = 0.14;`],
  ['the K2V and G2V covers at the Sun\'s productivity', `[SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, c.gppVis)];`, `[SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, SUN.gppVis)];`],
  ['the F2V cover at the Sun\'s productivity', `[{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];`, `[{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, SUN.gppVis)];`],
  ['the cover above all', `Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S))`, `Math.max(0, (gpp / SUN.gppVis) * S)`],
  ['the cover blind to the starlight', `Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S))`, `Math.max(0, Math.min(1, gpp / SUN.gppVis))`],
  ['a sparse cover drawn', `.map((s) => (sparse ? { ...s, cover: 0 } : s));`, `.map((s) => s);`],

  /* ---- the words of light ---- */
  ['the light at noon blind to the starlight', `(c.par / SUN.par) * S`, `(c.par / SUN.par)`],
  ['the UV-B blind to the starlight', `(c.uvb / SUN.uvb) * S`, `(c.uvb / SUN.uvb)`],
  ['violet only under 400 nm', `nm < 495 ? 'in the violet'`, `nm < 400 ? 'in the violet'`],
  ['red up to 800 nm', `: nm < 700 ? 'in the red'`, `: nm < 800 ? 'in the red'`],
  ['0.01 itself said to be under it', `(v < 0.01 ? 'under 0.01 times'`, `(v <= 0.01 ? 'under 0.01 times'`],

  /* ---- the sentences ---- */
  ['a star with no temperature given a stand-in case', `  if (T === null) {\n    words.push(NO_STAR);`, `  if (false) {\n    words.push(NO_STAR);`],
  ['a world with no surface told of its light first', `    words.push(where.why);\n    return { case: null,`, `    words.push('Its light would peak somewhere.', where.why);\n    return { case: null,`],
  ['a surface world with no starlight drawn anyway', `const scenarios = S === null ? [] : scenariosOf(c, S, type)`, `const scenarios = scenariosOf(c, S || 1, type)`],
  ['extrapolation never said', `\${extrapolated ? ', extrapolated past the cases\\' range' : ''}`, ``],
  ['the case not named', ` is nearest the \${c.key} case of Kiang`, ` is nearest a case of Kiang`],
  ['a star of another type nearest an M case not said to be so', `\${type === 'M' ? '' : \`, whose light this \${type}-type star's is nearest\`}`, ``],
  ['the reason a desert is sparse not said', `  if (sparse) words.push(where.why);\n`, ``],
  ['the ocean sentence never said', `  if (k.label === 'Ocean world') words.push(OCEAN);\n`, ``],
  ['the day side never said', `  if (ph.locked) words.push(LOCKED);\n`, ``],
  ['the ice line said of every look', `  if (k.look === 'temperate') {\n    // the picture's own ice`, `  if (true) {\n    // the picture's own ice`],
  ['the ice on a locked world said by latitude', `words.push(ph.locked ? iceLocked(`, `words.push(false ? iceLocked(`],
  ['the ice on a locked world at half its angle', `iceLocked(2 * Math.asin(ice) * 180 / Math.PI)`, `iceLocked(Math.asin(ice) * 180 / Math.PI)`],
  ['the ice on a locked world always past the twilight', `\${deg < 90 ? 'on its day side' : 'past the ring of twilight'}`, `\${false ? 'on its day side' : 'past the ring of twilight'}`],
  ['the ice line read from the archive\'s air, not the visitor\'s', `const ice = toParams(p, { air: opts.air ?? null }).iceCap;`, `const ice = toParams(p).iceCap;`],
  ['the ice line never said', `    if (ice < 1) words.push(`, `    if (false) words.push(`],
  ['the ice line said of a world with no ice', `    if (ice < 1) words.push(`, `    if (ice < 2.5) words.push(`],
];

process.exit(await runMutants({ here, file: 'life.js', test: 'life.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
