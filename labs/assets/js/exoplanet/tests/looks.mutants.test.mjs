/* ============================================================
   The test of the look tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/looks.mutants.test.mjs

   Each entry below breaks one rule of data.js: a bound moved to
   either side, a branch removed, a claim reversed. The broken
   file is written to a copy of this lab in the system's temp
   folder and looks.test.mjs is run on the copy (kit/tests/mutants.mjs). Every broken
   rule must fail at least one check there. A rule that can be
   broken with the tests still passing is not tested.

   Why this exists: on 2026-11-15 an independent review broke
   eight of these rules and the look tests of that day passed
   every time. Add an entry here with every new rule in lookOf,
   toParams or the functions they call.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/* name, the text in data.js, what it becomes */
const MUTANTS = [
  ['the cold (early-Mars) rule removed', `  if (cold) return 'ice';\n`, ``],
  ['the day-side factor removed', `(a < 0.1) ? Tsurf * 1.18921 : Tsurf);`, `Tsurf);`],
  ['the day-side gate moved from 0.1 to 0.2 AU', `(a < 0.1) ? Tsurf * 1.18921`, `(a < 0.2) ? Tsurf * 1.18921`],
  ['molten from 1,200 K to 1,100 K', `else if (Ttest >= 1200) state = 'partial';`, `else if (Ttest >= 1100) state = 'partial';`],
  ['molten from 1,200 K to 1,300 K', `else if (Ttest >= 1200) state = 'partial';`, `else if (Ttest >= 1300) state = 'partial';`],
  ['thin air from 0.15 up to 0.25', `export const AIR_THIN = 0.15,`, `export const AIR_THIN = 0.25,`],
  ['thin air from 0.15 down to 0.10', `export const AIR_THIN = 0.15,`, `export const AIR_THIN = 0.10,`],
  ['full air from 0.6 down to 0.5', `AIR_FULL = 0.6;`, `AIR_FULL = 0.5;`],
  ['full air from 0.6 up to 0.7', `AIR_FULL = 0.6;`, `AIR_FULL = 0.7;`],
  ['the icy airless branch removed', `return (cold && ph.rhoRel !== null && ph.rhoRel < 0.6) ? 'ice' : 'airless';`, `return 'airless';`],
  ['the density bound of ice moved to 0.7', `ph.rhoRel < 0.6) ? 'ice' : 'airless'`, `ph.rhoRel < 0.7) ? 'ice' : 'airless'`],
  ['an ice shell without the cold', `return (cold && ph.rhoRel !== null`, `return (ph.rhoRel !== null`],
  ['the shrouded rule removed', `  if (hot) return 'shrouded';\n`, ``],
  ['the 245 K ice rule removed', `return ph.state === 'ice' ? 'ice' : 'temperate';`, `return 'temperate';`],
  ['the 245 K ice rule moved to 255 K', `else if (Tsurf < 245) state = 'ice';`, `else if (Tsurf < 255) state = 'ice';`],
  ['the glow bound moved to 800 K', `if (!hotLook || Tsub < 750)`, `if (!hotLook || Tsub < 800)`],
  ['the glow bound moved to 700 K', `if (!hotLook || Tsub < 750)`, `if (!hotLook || Tsub < 700)`],
  ['a glow given to every look', `const hotLook = look === 'molten' || look === 'fluid' || look === 'airless';`, `const hotLook = true;`],
  ['the waterline moved to 0.35', `const wet = domClass === 1 ? 0.72 : 0.55;`, `const wet = domClass === 1 ? 0.72 : 0.35;`],
  ['the lock radius replaced by 0.3 AU', `const locked = a < lockRadiusAU(Mstar);`, `const locked = a < 0.3;`],
  ['the lock radius without the star\'s mass', `const locked = a < lockRadiusAU(Mstar);`, `const locked = a < lockRadiusAU(1);`],
  ['the stretch limit moved to 0.01', `SHELL_STRETCH_TO = 0.006;`, `SHELL_STRETCH_TO = 0.01;`],
  ['the shell floor moved to 0.002', `SHELL_STRETCH_TO)), 0.0025, 0.03);`, `SHELL_STRETCH_TO)), 0.002, 0.03);`],
  ['the shell cap moved to 0.04', `SHELL_STRETCH_TO)), 0.0025, 0.03);`, `SHELL_STRETCH_TO)), 0.0025, 0.04);`],
  ['the stretch moved from 4 to 3', `export const SHELL_STRETCH = 4,`, `export const SHELL_STRETCH = 3,`],
  ['a world drawn alive', `life: 0.0,`, `life: 0.5,`],
  ['a locked world that spins', `const spin = locked ? 0 : 0.03 + rand() * 0.06;`, `const spin = 0.03 + rand() * 0.06;`],
  ['Earth\'s ice line ten degrees lower', `iceCap = Math.sqrt(clamp((Tsurf + 12 - 255) / 55, 0, 1.3));`, `iceCap = Math.sqrt(clamp((Tsurf + 2 - 255) / 55, 0, 1.3));`],
  ['Rayleigh depth doubled', `const tauRayleigh = (um) => 0.008569 *`, `const tauRayleigh = (um) => 0.017138 *`],
  ['an ocean claimed under ice', `ice: ['Frozen world', 'Frozen world'],`, `ice: ['Frozen world', 'Ice / ocean world'],`],
  // the amount of air each scenario of air.js is drawn with, and the bare rock's day side (2026-11-16)
  ['thick air drawn under the full-air bound', `airKey === 'thick' ? Math.max(share, AIR_FULL) :`, `airKey === 'thick' ? share :`],
  ['thin air allowed to reach the full-air bound', `clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;`, `clamp(share, AIR_THIN, AIR_FULL) : 0;`],
  ['thin air drawn at any share', `clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;`, `share : 0;`],
  ['bare rock drawn with its share of air', `clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;`, `clamp(share, AIR_THIN, AIR_FULL - 0.01) : share;`],
  ['the bare rock\'s own day side on turning rocks too', `atmDensity < AIR_THIN && locked ? bareDay(Teff, Rstar, a) : null;`, `atmDensity < AIR_THIN ? bareDay(Teff, Rstar, a) : null;`],
  ['a locked bare rock melting by its mean surface', `(bare ? bare.Tday : (a < 0.1)`, `(bare ? Tsurf : (a < 0.1)`],
  ["a locked fluid world heated like a rock", `let k = locked ? (look === 'fluid' ? 1.25 : Math.SQRT2) : 1.18921;`, `let k = locked ? (look !== 'fluid' ? 1.25 : Math.SQRT2) : 1.18921;`],
  ["a locked fluid world's night like a rock's with air", `(look === 'fluid' ? 0.75 : hasAir ? 0.6 : 0.15) * ph.Teq`, `(look !== 'fluid' ? 0.75 : hasAir ? 0.6 : 0.15) * ph.Teq`],
  ["no floor under the night", `* ph.Teq : 0.95 * ph.Teq, 40);`, `* ph.Teq : 0.95 * ph.Teq, 0);`],
  ["the night floor at 100 K", `* ph.Teq : 0.95 * ph.Teq, 40);`, `* ph.Teq : 0.95 * ph.Teq, 100);`],
];

process.exit(await runMutants({ here, file: 'data.js', test: 'looks.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
