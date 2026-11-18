/* ============================================================
   The test of the life tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/life.mutants.test.mjs

   Each entry breaks one rule of life.js: a value of the paper's
   tables, a boundary between cases moved or its tie turned, an
   end of the cases' range, a look given or denied surface life,
   a reading of a red dwarf dropped, a band taken out of a colour,
   the cover unbounded or blind to the starlight, a sentence said
   of a world it does not fit. The broken file is written to a
   copy of this lab in the system's temp folder and
   life.test.mjs is run on the copy (mutants.mjs). Every broken
   rule must fail a check there. The colour's own rule, in
   science.js, is broken in life.mutants2.test.mjs.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  /* ---- the paper's tables ---- */
  ['the F2V peak in the blue moved', `T: 6820, peak: 450.8,`, `T: 6820, peak: 470.8,`],
  ['the Sun\'s visible light changed', `peak: 668.5, par: 11.0,`, `peak: 668.5, par: 12.0,`],
  ['epsilon Eridani at the Pecaut and Mamajek K2V temperature instead of the archive\'s', `T: 5020,`, `T: 5100,`],
  ['the M1V productivity over the wide band changed', `gppVis: 0.33, gppWide: 0.81`, `gppVis: 0.33, gppWide: 0.33`],
  ['the M5V UV-B given a value', `peak: 1042.8, par: 1.5, uvb: 0.000,`, `peak: 1042.8, par: 1.5, uvb: 0.001,`],

  /* ---- the nearest case ---- */
  ['a tie between two cases given to the cooler star', `if (Math.abs(c.T - teff) < Math.abs(best.T - teff)) best = c;`, `if (Math.abs(c.T - teff) <= Math.abs(best.T - teff)) best = c;`],
  ['the first case always taken', `if (Math.abs(c.T - teff) < Math.abs(best.T - teff)) best = c;`, `if (false) best = c;`],
  ['the hot end itself extrapolated', `extrapolated: teff > hi || teff < lo`, `extrapolated: teff >= hi || teff < lo`],
  ['the cool end itself extrapolated', `extrapolated: teff > hi || teff < lo`, `extrapolated: teff > hi || teff <= lo`],
  ['nothing ever extrapolated', `extrapolated: teff > hi || teff < lo`, `extrapolated: false`],

  /* ---- where surface life is considered ---- */
  ['a temperate world given no surface life', `temperate: { surface: true, why: '' },`, `temperate: { surface: false, why: '' },`],
  ['a thin-air desert taken as fully covered', `desert: { surface: 'sparse',`, `desert: { surface: true,`],
  ['a cloud-shrouded world given surface life', `shrouded: { surface: false,`, `shrouded: { surface: true,`],
  ['an airless world given surface life', `airless: { surface: false,`, `airless: { surface: true,`],

  /* ---- the readings and their colours ---- */
  ['a red dwarf given one reading', `  return [\n    mk('a',`, `  return [mk('b', '', [SORET, { mu: CHL_A, w: 20, d: 0.85 }], 0, c.gppVis)];\n  return [\n    mk('a',`],
  ['the dark reading not harvesting the visible', `}], 0.8, /** @type {number} */ (c.gppWide)),`, `}], 0, /** @type {number} */ (c.gppWide)),`],
  ['the F star\'s blue band left out', `[{ mu: c.peak, w: 40, d: 0.9 }, { mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];`, `[{ mu: CHL_A, w: 20, d: 0.6 }], 0, c.gppVis)];`],
  ['the Sun\'s red band left out', `[SORET, { mu: c.peak, w: 20, d: 0.85 }], 0, c.gppVis)];`, `[SORET], 0, c.gppVis)];`],
  ['no red edge on a leaf', `const VIS = 0.14, NIR = 0.5;`, `const VIS = 0.14, NIR = 0.14;`],
  ['the cover above all', `Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S))`, `Math.max(0, (gpp / SUN.gppVis) * S)`],
  ['the cover blind to the starlight', `Math.max(0, Math.min(1, (gpp / SUN.gppVis) * S))`, `Math.max(0, Math.min(1, gpp / SUN.gppVis))`],

  /* ---- the words ---- */
  ['a star with no temperature given a stand-in case', `if (!(typeof p.Teff === 'number' && p.Teff > 0)) {`, `if (false) {`],
  ['a surface world with no starlight drawn anyway', `const scenarios = where.surface && S !== null ? scenariosOf(c, S) : [];`, `const scenarios = where.surface ? scenariosOf(c, S || 1) : [];`],
  ['the day side said of a world with no surface life', `if (where.surface && ph.locked)`, `if (ph.locked)`],
  ['a surface gravity said of a giant', `if (where.surface && ph.radiusKnown && ph.gRel > 0)`, `if (ph.radiusKnown && ph.gRel > 0)`],
  ['the reason a desert is sparse not said', `    if (where.surface === 'sparse') words.push(where.why);\n`, ``],
  ['the ice line never said', `    if (ice < 1) words.push(`, `    if (false) words.push(`],
  ['the ice line said of a world with no ice', `    if (ice < 1) words.push(`, `    if (ice < 2.5) words.push(`],
  ['the case not named', ` is nearest the \${c.key} case of Kiang`, ` is nearest a case of Kiang`],
];

process.exit(await runMutants({ here, file: 'life.js', test: 'life.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
