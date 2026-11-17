/* ============================================================
   The test of the starlight against the papers. Run from the
   repository root:
     node labs/assets/js/exoplanet/tests/papers.mutants.test.mjs

   Each entry puts back a rule the papers refuse, and papers.test.mjs
   is run on the copy (kit/tests/mutants.mjs): it must fail.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ARCH = "  if (archive !== null) return { L: archive, src: 'archive', archive, fromStar };\n";
const STAR = "  if (fromStar !== null) return { L: fromStar, src: 'R and Teff', archive, fromStar };\n";
const MUTANTS = [
  ['R² Teff⁴ first, as at ebf969b', ARCH + STAR, STAR + ARCH],
  ['the archive\'s luminosity never used', ARCH, ''],
];

process.exit(await runMutants({ here, file: 'starlight.js', test: 'papers.test.mjs', mutants: MUTANTS, also: ['kit'], data: ['data/exomania/pscomppars-snapshot.json'] }));
