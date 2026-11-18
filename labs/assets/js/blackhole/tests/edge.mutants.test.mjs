/* ============================================================
   The test of the traced edge's checks (probe.js outline,
   edge.test.mjs). Run from the repository root:
     node labs/assets/js/blackhole/tests/edge.mutants.test.mjs

   Each entry breaks one rule of the line the overlay draws at the
   shadow's edge. The broken probe.js is written to a copy of this
   lab in the system's temp folder and edge.test.mjs is run on the
   copy. The first entry is the rule the shader's edge had: the
   frame's black edge, traced with the disk on.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['the edge traced with the disk on', `  return { q: view.q || 0, k: 0.08, maxSteps: 2400 };`, `  return { q: view.q || 0, k: 0.08, maxSteps: 2400, disk: view.emit === 'thick', rIn: K.isco(view.a, 1, view.q || 0), rOut: view.rout };`],
  ['a ray out of steps counted inside the shadow', `export const inShadow = (res) => res.fate === 'captured' && !res.maxed;`, `export const inShadow = (res) => res.fate === 'captured';`],
  ['three bisections', `n = OUTLINE_N, iters = 10 }) {`, `n = OUTLINE_N, iters = 3 }) {`],
  ['the edge followed past the screen', `hi = Math.min(1.3 * hi, tMax); inHi = cap(hi); }`, `hi = 1.3 * hi; inHi = cap(hi); }`],
  ['the last run joined to the first across a gap', `if (!closed && runs.length > 1 && pts[0] && pts[n - 1])`, `if (!closed && runs.length > 1)`],
  ['closed although a direction gave no point', `const closed = pts.every(Boolean);`, `const closed = pts.some(Boolean);`],
  ['the first direction starts from no radius', `r0: right - cx });`, `r0: 0 });`],
  ['the edge traced although not asked', `edge: withEdge = false }) {`, `edge: withEdge = true }) {`],
  ['the edge never traced', `    if (withEdge) edge = outline(`, `    if (!withEdge) edge = outline(`],
];

process.exit(await runMutants({ here, file: 'probe.js', test: '../edge.test.mjs', mutants: MUTANTS }));
