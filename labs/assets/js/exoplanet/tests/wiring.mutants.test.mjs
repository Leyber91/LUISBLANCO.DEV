/* ============================================================
   The test of main.js's lines that hand starlight.js's answers to
   the page. Run from the repository root:
     node labs/assets/js/exoplanet/tests/wiring.mutants.test.mjs

   Each entry breaks one of them, and wiring.test.mjs is run on the
   copy (kit/tests/mutants.mjs). Every entry must fail a check there.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SYS = 'st.system = byOrbit(st.list.filter((q) => q.host === p.host));';
const MUTANTS = [
  ['the system kept in the catalogue\'s order', SYS, 'st.system = st.list.filter((q) => q.host === p.host);'],
  ['the system sorted by the archive\'s orbits', SYS, 'st.system = st.list.filter((q) => q.host === p.host).sort((a, b) => (a.a ?? a.P ?? 0) - (b.a ?? b.P ?? 0));'],
  ['the system taken from every host', SYS, 'st.system = byOrbit(st.list);'],
  ['the call left in a comment', SYS, '// ' + SYS],
  ['byOrbit not imported', "import { byOrbit, starlightCensus } from './starlight.js';", "import { starlightCensus } from './starlight.js';"],
  ['the method without the census at load', 'hold: withholdingTest(st.list), census: starlightCensus(st.list),', 'hold: withholdingTest(st.list),'],
  ['the method without the census once the roster joins', 'valley: valleyHistogram(st.list), census: starlightCensus(st.list), rosterNote: note', 'valley: valleyHistogram(st.list), rosterNote: note'],
];

process.exit(await runMutants({ here, file: 'main.js', test: 'wiring.test.mjs', mutants: MUTANTS, also: ['kit', 'ai'] }));
