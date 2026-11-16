/* ============================================================
   The test of the counts tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/counts.mutants.test.mjs

   Each entry breaks one rule of the code that writes the survey's
   numbers about the whole catalogue: the title block's count
   (catalog.js countLine) and the words of the histogram of radii
   (views/bands.js radiusBins and histWords). The broken file is
   written to a copy of the lab in the system's temp folder, with
   the snapshot and the weekly roster, and counts.test.mjs is run
   on the copy (the runner is kit/tests/mutants.mjs). Every broken
   rule must fail a check there.

   Which conditions no entry breaks is counted from the code by
   tools/dev/conditions.mjs. The drawing and the controls of
   bands.js (drawHist, bandsHTML, bindEdges, classTable) need a
   page, and the survey's drives check them.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = ['data/exomania/pscomppars-snapshot.json', '../exoplanet_data.json'];

const MEASURED = 'const measured = list.filter((p) => p.measuredR === true && Number.isFinite(p.R)).length;';
const CATALOG = [
  ['the planets said before the roster as measured too', "  if (!rosterJoined) return planets;\n", ''],
  ['a radius the roster does not list counted as measured', MEASURED, MEASURED.replace('p.measuredR === true', 'p.measuredR !== false')],
  ['a planet with no radius counted as measured', MEASURED, MEASURED.replace(' && Number.isFinite(p.R)', '')],
  ['a radius of infinity counted as measured', MEASURED, MEASURED.replace('Number.isFinite(p.R)', "typeof p.R === 'number'")],
  ['the planets said in the plural for one', "const planets = plural(list.length, 'planet');", "const planets = `${int(list.length)} planets`;"],
  ['the measured radii not grouped by thousands', 'return `${planets}, ${int(measured)} with a measured radius`;', 'return `${planets}, ${measured} with a measured radius`;'],
];

const NL = String.fromCharCode(10);
const SKIP = 'if (p.R < R_LO || p.R >= R_HI || p.measuredR === false) continue;';
const TOP = 'const top = n.indexOf(Math.max(...n));';
const BANDS = [
  ['a radius below the axis drawn', SKIP, SKIP.replace('p.R < R_LO || ', '')],
  ['a radius that is not a number read', `if (!isNum(p.R)) continue;${NL}    if (p.R < R_LO`, `if (false) continue;${NL}    if (p.R < R_LO`],
  ['the axis\'s first radius not drawn', SKIP, SKIP.replace('p.R < R_LO', 'p.R <= R_LO')],
  ['a radius at the axis\'s end drawn', SKIP, SKIP.replace('p.R >= R_HI', 'p.R > R_HI')],
  ['a radius the roster says is not measured drawn', SKIP, SKIP.replace(' || p.measuredR === false', '')],
  ['a radius not yet known either way left out', SKIP, SKIP.replace('p.measuredR === false', 'p.measuredR !== true')],
  ['the bins a 40th of the axis by default', 'export const BINS = 48;', 'export const BINS = 40;'],
  ['nothing drawn said as a count', "  if (total === 0) return `${head}: none drawn yet.`;\n", ''],
  ['the bin with the fewest named as the one with the most', TOP, 'const top = n.indexOf(Math.min(...n));'],
  ['the count of the bin with the most said as the total', 'the most, ${fmtInt(n[top])}, between', 'the most, ${fmtInt(total)}, between'],
  ['the bin\'s edges read one bin off', 'between ${fmt(xr(top / n.length), 2)} and ${fmt(xr((top + 1) / n.length), 2)}', 'between ${fmt(xr((top + 1) / n.length), 2)} and ${fmt(xr((top + 2) / n.length), 2)}'],
  ['the whole catalogue said to show the valley', 'shows in the Kepler sample that the radius against insolation diagram draws.', 'shows here, the fewest between 1.5 and 2.'],
  ['the axis said to start at 0.50', 'from ${fmt(R_LO, 1)} to', 'from ${fmt(R_LO, 2)} to'],
];

const a = await runMutants({ here, file: 'catalog.js', test: 'counts.test.mjs', mutants: CATALOG, also: ['kit'], data });
const b = await runMutants({ here, file: 'views/bands.js', test: 'counts.test.mjs', mutants: BANDS, also: ['kit'], data });
process.exit(a || b);
