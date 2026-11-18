/* ============================================================
   The test of the traced edge's checks (probe.js outline,
   edge.test.mjs). Run from the repository root:
     node labs/assets/js/blackhole/tests/edge.mutants.test.mjs

   Each entry breaks one rule of the edge the telescope view draws:
   the first kind silences a rule, the second loosens a condition.
   The broken probe.js is written to a copy of this lab in the
   system's temp folder and edge.test.mjs is run on the copy. The
   list was widened after review_edge (2026-11-18), when 11 of a
   reviewer's 20 loosened conditions passed the first checks.

   Not listed, because no rule the visitor sees breaks (checked
   2026-11-18, the second read's mutants among them):
   - the step factor 0.2: its points stay within 0.17 px of a
     converged trace at every view the test holds;
   - 7 or 8 bisections: 0.39 and 0.20 px, inside the 0.5 px the
     ticks need; 10 keeps a margin;
   - two bounds that keep a bracket on the screen (tMax > 0, the
     low end): a point off the screen is dropped (a listed rule),
     so they only save rays, and tMax > 0 matters only from a
     centre off the screen, which the anchors never give.
   The second list breaks the shader: a line re-added in the
   notes block, in a spelling the first source check did not
   know.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  // the rays
  ['the edge traced with the disk on', `  return { q: view.q || 0, k: 0.08, maxSteps: 2400 };`, `  return { q: view.q || 0, k: 0.08, maxSteps: 2400, disk: view.emit === 'thick', rIn: K.isco(view.a, 1, view.q || 0), rOut: view.rout };`],
  ['the charge dropped from the edge rays', `return { q: view.q || 0, k: 0.08`, `return { q: 0, k: 0.08`],
  ['900 steps', `k: 0.08, maxSteps: 2400 };`, `k: 0.08, maxSteps: 900 };`],
  ['a ray out of steps counted inside the shadow', `export const inShadow = (res) => res.fate === 'captured' && !res.maxed;`, `export const inShadow = (res) => res.fate === 'captured';`],
  // the bracket and the bisection
  ['the centre not checked', `if (!(r0 > 0) || !trace(cx, cy)) return null;`, `if (!(r0 > 0)) return null;`],
  ['the bracket never shrinks', `!inLo && s < 8; s++)`, `!inLo && s < 0; s++)`],
  ['the bracket widens once', `hi < tMax && s < 12; s++)`, `hi < tMax && s < 1; s++)`],
  ['the radius not carried to the next direction', `        r = 0.5 * (lo + hi);`, `        const r = 0.5 * (lo + hi);`],
  ['the widening not stopped at the screen', `inLo && inHi && hi < tMax && s < 12; s++)`, `inLo && inHi && s < 12; s++)`],
  ['the directions started from the screen\'s centre', `X: th * aspect, Y: th, cx, cy, r0: right - cx });`, `X: th * aspect, Y: th, cx: 0, cy: 0, r0: right - cx });`],
  ['the Y bound read as X', `(Math.sign(dy) * Y - cy) / dy`, `(Math.sign(dy) * X - cy) / dy`],
  ['a point off the screen kept', `if (Math.abs(x) <= X && Math.abs(y) <= Y) pt = [x, y, k];`, `pt = [x, y, k];`],
  ['the screen bound in x only', `if (Math.abs(x) <= X && Math.abs(y) <= Y) pt = [x, y, k];`, `if (Math.abs(x) <= X) pt = [x, y, k];`],
  ['three bisections', `n = OUTLINE_N, iters = 10 }) {`, `n = OUTLINE_N, iters = 3 }) {`],
  ['six bisections', `n = OUTLINE_N, iters = 10 }) {`, `n = OUTLINE_N, iters = 6 }) {`],
  ['24 directions', `export const OUTLINE_N = 120;`, `export const OUTLINE_N = 24;`],
  ['60 directions', `export const OUTLINE_N = 120;`, `export const OUTLINE_N = 60;`],
  // the ticks
  ['the gap between the ticks not measured where the line closes', `    return closed && kept.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) < gap;`, `    return false;`],
  ['ticks 4 px apart allowed', `export function ticksOf(runs, ox, oy, n, closed, gap = 9) {`, `export function ticksOf(runs, ox, oy, n, closed, gap = 4) {`],
  ['a tick at every point whatever the spacing', `  const keep = (every) => runs.flat().filter((p) => p[2] % every === 0);`, `  const keep = (every) => runs.flat();`],
  // the runs
  ['never closed', `const closed = pts.every(Boolean);`, `const closed = false;`],
  ['closed although a direction gave no point', `const closed = pts.every(Boolean);`, `const closed = pts.some(Boolean);`],
  ['never joined across the first direction', `if (!closed && runs.length > 1 && pts[0] && pts[n - 1])`, `if (false)`],
  ['the last run joined to the first across a gap', `if (!closed && runs.length > 1 && pts[0] && pts[n - 1])`, `if (!closed && runs.length > 1)`],
  ['joined in the wrong order', `runs[0] = runs.pop().concat(runs[0]);`, `runs[0] = runs[0].concat(runs.pop());`],
  // the anchors
  ['the first direction starts from no radius', `r0: right - cx });`, `r0: 0 });`],
  ['the edge traced although not asked', `edge: withEdge = false }) {`, `edge: withEdge = true }) {`],
  ['the edge never traced', `    if (withEdge) edge = outline(`, `    if (!withEdge) edge = outline(`],
];

const SHADER = [
  ['the ISCO line re-added in another spelling', `      if (uHL > 0.0 && abs(m.x - uHL) < dr*0.9 && dr < 0.6)`, `      if (abs(uRin - m.x) < dr*0.9 && dr < 0.6) col = mix(col, vec3(0.62, 0.70, 0.84), 0.85);\n      if (uHL > 0.0 && abs(m.x - uHL) < dr*0.9 && dr < 0.6)`],
  ['an edge re-added from a neighbour\'s fate', `      if (uHL > 0.0 && abs(m.x - uHL) < dr*0.9 && dr < 0.6)`, `      if ((m.w > -1.5 && m.w < -0.5) != (nx.w > -1.5 && nx.w < -0.5)) col = mix(col, vec3(0.6), 0.4);\n      if (uHL > 0.0 && abs(m.x - uHL) < dr*0.9 && dr < 0.6)`],
];

const a = await runMutants({ here, file: 'probe.js', test: '../edge.test.mjs', mutants: MUTANTS });
const b = await runMutants({ here, file: 'shaders.js', test: '../edge.test.mjs', mutants: SHADER });
process.exit(a || b);
