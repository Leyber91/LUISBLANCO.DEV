/* ============================================================
   heptapod/tests/inked.test.mjs — the inked script in the pod
   (pod/inked.js), behind its switch (pod/switch.js).

     node labs/assets/js/heptapod/tests/inked.test.mjs

   1. The switch: while SWITCH.published is false, a page served from
      anywhere but this machine writes in the ring script whatever its
      link says; on 127.0.0.1 or localhost ?script=inked turns the
      inked script on and nothing else does. The keys are described by
      side only for the ring script.
   1b. The flip is tied to rule 6: while SWITCH.published is true this
      test fails unless labs/assets/data/heptapod/g4-pod.json records a
      corpus run of the gate on every figure the pod can write (every
      ring and every concept alone of the three species) for the
      current inkfig version, with no figure at or above the film's own
      copied-part floor on the fine grid (0.786; rule 6 as amended
      2026-11-18), a coarse median under the film's own nearest-match
      median (0.712), and a named review of every figure from 0.65 on
      the coarse grid (those at 0.80 or above included).
   2. A species' concepts get distinct radical sets, the same ones on
      every call.
   3. Every ring of the three species (42 scenes and the greeting) and
      every concept alone is a valid one-clause graph that inkfig.js
      draws, with the act traced as a pool and each present party and
      thing as a thread.
   4. A crop of one part's rectangle (the key's) keeps that part and no
      other; a crop of an empty corner keeps nothing and counts no ink;
      a crop of the whole figure keeps every part.
   5. Thinning only takes away: over ten steps to ERODE_MAX the parts a
      whole crop keeps never grow back, and at ERODE_MAX the threads are
      gone.
   6. The distance field, in thirds of a pixel: on a 9 x 9 square the
      centre pixel is 15 (5 pixels) from the paper and an edge pixel 3.
   7. The trace option draws nothing: with and without it, every ring
      and concept alone of one species gives the same raster bytes and
      the same report.
   8. The cache the chamber and the notebook share holds at most
      INKFIG.CACHE figures and gives back the same figure for a ring.
   Exits 1 on any failure, and on a run that checked nothing.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SWITCH, scriptOf, keysHelp } from '../pod/switch.js';
import { INKFIG, radicalsOf, ringGraph, soloGraph, podFigure, figureOf, recogniseInked, sectorRectInked, distanceIn, inkedTarget } from '../pod/inked.js';
import { inkFigure, INK as FIG } from '../topo/inkfig.js';
import { GATE_SPECIES, makeSpecies } from '../pod/species.js';
import { INK } from '../pod/ring.js';
import { clausesOf } from '../topo/figure.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => { checks++; if (!cond) { failures++; console.log('FAIL ' + what + (detail ? ' :: ' + detail : '')); } };
const S = 600;

/* 1. the switch */
{
  const at = (host, search) => ({ hostname: host, search });
  if (!SWITCH.published) {
    ok(scriptOf(at('luisblanco.dev', '?script=inked')) === 'ring', 'public: a link cannot turn the inked script on');
    ok(scriptOf(at('luisblanco.dev', '')) === 'ring', 'public: the ring script by default');
    ok(scriptOf(at('127.0.0.1', '')) === 'ring', 'local: the ring script by default');
    ok(scriptOf(at('127.0.0.1', '?script=inked')) === 'inked', 'local: ?script=inked turns it on');
    ok(scriptOf(at('localhost', '?at=mid&script=inked')) === 'inked', 'local: with other parameters too');
    ok(scriptOf(at('127.0.0.1', '?script=ink')) === 'ring', 'local: only the exact word');
  } else {
    ok(scriptOf(at('luisblanco.dev', '')) === 'inked', 'published: the inked script by default');
    ok(scriptOf(at('luisblanco.dev', '?script=ring')) === 'ring', 'published: ?script=ring brings the ring back');
  }
  ok(/top, right, bottom and left/.test(keysHelp('ring').hint) && !/top|right|bottom|left/.test(keysHelp('inked').hint.split('. ').pop()), 'the keys are named by side for the ring script only');
}

/* 1b. the flip waits for its corpus run */
if (SWITCH.published) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../data/heptapod/g4-pod.json');
  let g = null;
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { g = null; }
  const want = GATE_SPECIES.reduce((n, [a, s]) => { const sp = makeSpecies(a, s); return n + sp.rings.length + 1 + sp.trits.size; }, 0);
  ok(!!g, 'published: g4-pod.json, the corpus run on the figures of the pod, is committed');
  if (g) {
    ok(g.inkVersion === FIG.version, 'published: it measured the inkfig version the pod draws', `${g.inkVersion} against ${FIG.version}`);
    ok(g.figures === want, 'published: it measured every figure the pod can write', `${g.figures} of ${want}`);
    // rule 6 as amended by Luis on 2026-11-17 (the median like for like) and 2026-11-18 (two scales): a figure fails
    // at or above the film's own copied-part floor on the fine grid (0.786); one at 0.80 or above on the coarse grid
    // and under that floor goes to his review, as the 0.65 to 0.80 band does
    ok(typeof g.fineMax === 'number' && g.fineMax < 0.786 && g.median < 0.712, 'published: no figure at the fine floor (0.786), the coarse median under 0.712', `fine max ${g.fineMax}, median ${g.median}`);
    ok(Array.isArray(g.reviewed) && g.reviewed.length === g.toReview, 'published: every figure at 0.65 or above on the coarse grid was reviewed', `${(g.reviewed || []).length} of ${g.toReview}`);
    ok(typeof g.reviewedBy === 'string' && g.reviewedBy.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(g.reviewedOn || ''), 'published: the pairs from 0.65 were reviewed, by whom and when');
  }
}

/* 2 to 5, per species */
const t0 = Date.now();
for (const [a, s] of GATE_SPECIES) {
  const sp = makeSpecies(a, s);
  const rad = radicalsOf(sp);
  const keys = [...rad.values()].map((r) => r.join('+'));
  ok(new Set(keys).size === keys.length, `species ${a}/${s}: every concept has its own radical set`);
  ok(rad === radicalsOf(sp) && [...radicalsOf(makeSpecies(a, s)).values()].map((r) => r.join('+')).join() === keys.join(), `species ${a}/${s}: the same sets on every call`);

  const rings = [...sp.rings.map((r) => r.ids), sp.greeting.ids];
  let drawn = 0, partsOk = 0, cropOk = 0, cropN = 0, empty = 0, whole = 0, shrink = 0, gone = 0, valid = 0;
  for (const ids of rings) {
    const g = ringGraph(sp, ids);
    if (clausesOf(g).ok && clausesOf(g).mains.length === 1) valid++;
    const fig = podFigure(g, S);
    if (!fig.ok) continue;
    drawn++;
    const want = ['pred', ...['agent', 'patient', 'recipient'].filter((r) => ids[r === 'recipient' ? 'recip' : r])];
    if (want.every((r) => fig.parts[r] && fig.parts[r].length) && Object.keys(fig.parts).length === want.length) partsOk++;
    for (const role of want) {
      const k = recogniseInked(fig, sectorRectInked(fig, role), 0);
      cropN++;
      if (k.roles.length === 1 && k.roles[0] === role) cropOk++;
    }
    const corner = recogniseInked(fig, { x0: 1.55, y0: 1.55, x1: 1.7, y1: 1.7 }, 0);
    if (!corner.roles.length && corner.cells === 0) empty++;
    const all = { x0: -2, y0: -2, x1: 2, y1: 2 };
    if (want.every((r) => recogniseInked(fig, all, 0).roles.includes(r))) whole++;
    let prev = Infinity, mono = true;
    for (let i = 0; i <= 10; i++) {
      const n = recogniseInked(fig, all, (INK.ERODE_MAX * i) / 10).roles.length;
      if (n > prev) mono = false;
      prev = n;
    }
    if (mono) shrink++;
    const last = recogniseInked(fig, all, INK.ERODE_MAX);
    if (!['agent', 'patient', 'recipient'].some((r) => last.roles.includes(r))) gone++;
  }
  const n = rings.length;
  ok(valid === n, `species ${a}/${s}: every ring is one valid clause`, `${valid} of ${n}`);
  ok(drawn === n, `species ${a}/${s}: every ring is drawn`, `${drawn} of ${n}`);
  ok(partsOk === n, `species ${a}/${s}: the act traced as a pool, each party and thing as a thread`, `${partsOk} of ${n}`);
  ok(cropOk === cropN, `species ${a}/${s}: a key's crop of a part keeps that part and no other`, `${cropOk} of ${cropN}`);
  ok(empty === n, `species ${a}/${s}: a crop of an empty corner keeps nothing`, `${empty} of ${n}`);
  ok(whole === n, `species ${a}/${s}: a crop of the whole keeps every part`, `${whole} of ${n}`);
  ok(shrink === n, `species ${a}/${s}: thinning only takes parts away`, `${shrink} of ${n}`);
  ok(gone === n, `species ${a}/${s}: at the end of the thinning no thread is left to keep`, `${gone} of ${n}`);

  let solos = 0;
  for (const id of sp.trits.keys()) { const f = podFigure(soloGraph(sp, id), S); if (f.ok && f.parts.pred && Object.keys(f.parts).length === 1) solos++; }
  ok(solos === sp.trits.size, `species ${a}/${s}: a concept alone is one pool`, `${solos} of ${sp.trits.size}`);

  // the target the medium receives has ink where the figure has it
  const fig = podFigure(ringGraph(sp, sp.greeting.ids), S);
  const T = inkedTarget(fig, 120, 3.44, 0);
  const mass = T.reduce((x, y) => x + y, 0);
  ok(mass > 50 && mass < 0.4 * 120 * 120, `species ${a}/${s}: the field target holds the figure's ink`, `${mass.toFixed(0)} cells`);
}
console.log(`  three species drawn and cropped in ${Date.now() - t0} ms at ${S} px`);

/* 6. the distance field */
{
  const W = 11, d = new Uint8Array(W * W);
  for (let y = 1; y < 10; y++) for (let x = 1; x < 10; x++) d[y * W + x] = 1;
  const D = distanceIn(d, W, W);
  ok(D[5 * W + 5] === 15, 'the centre of a 9 x 9 square is 5 pixels (15 thirds) from the paper', String(D[5 * W + 5]));
  ok(D[1 * W + 5] === 3 && D[0] === 0, 'an edge pixel is 1 pixel (3 thirds), the paper 0', `${D[W + 5]}, ${D[0]}`);
}

/* 7. the trace draws nothing */
{
  const sp = makeSpecies(...GATE_SPECIES[0]);
  const graphs = [...sp.rings.map((r) => ringGraph(sp, r.ids)), ringGraph(sp, sp.greeting.ids), ...[...sp.trits.keys()].map((id) => soloGraph(sp, id))];
  let same = 0;
  for (const g of graphs) {
    const a = inkFigure(g, { S: 400 }), b = inkFigure(g, { S: 400, trace: true });
    let eq = a.ok && b.ok && a.d.length === b.d.length;
    for (let i = 0; eq && i < a.d.length; i++) if (a.d[i] !== b.d[i]) eq = false;
    if (eq && JSON.stringify({ ...a, d: undefined }) === JSON.stringify({ ...b, d: undefined, trace: undefined })) same++;
  }
  ok(same === graphs.length, 'the trace option changes no raster and no report', `${same} of ${graphs.length}`);
}

/* 8. the shared cache */
{
  const sp = makeSpecies(...GATE_SPECIES[1]);
  const f1 = figureOf(sp, { scene: 3 });
  for (let i = 4; i < 4 + INKFIG.CACHE + 3; i++) figureOf(sp, { scene: i % 42 });
  const f2 = figureOf(sp, { scene: 3 });
  ok(f2 !== f1 && f2.dist.length === f1.dist.length && f2.dist.every((v, i) => v === f1.dist[i]), 'the cache lets the oldest figure go and draws it again the same');
  ok(figureOf(sp, { scene: 3 }) === f2, 'and gives back the same figure while it is kept');
}

console.log(`inked: ${checks} checks, ${failures} failed`);
if (!checks || failures) process.exit(1);
