/* ============================================================
   heptapod/tests/inked.test.mjs — the inked script in the pod
   (pod/inked.js), behind its switch.

     node labs/assets/js/heptapod/tests/inked.test.mjs

   1. The switch: while INKED.published is false, a page served from
      anywhere but this machine writes in the ring script whatever its
      link says; on 127.0.0.1 or localhost ?script=inked turns the
      inked script on and nothing else does.
   2. A species' concepts get distinct radical sets, the same ones on
      every call.
   3. Every ring of the three species (42 scenes and the greeting) and
      every concept alone is a valid one-clause graph that inkfig.js
      draws, with the act traced as a pool and each present party and
      thing as a thread.
   4. A crop of one part's rectangle keeps that part's radical with no
      thinning; a crop of an empty corner keeps nothing and counts no
      ink; a crop of the whole figure keeps every part.
   5. Thinning only takes away: over ten steps to ERODE_MAX the parts a
      whole crop keeps never grow back, and at ERODE_MAX the threads are
      gone.
   6. The distance field: on a 9 x 9 square the centre pixel is 5 pixels
      from the paper and an edge pixel 1.
   Exits 1 on any failure, and on a run that checked nothing.
   ============================================================ */

import { INKED, scriptOf, radicalsOf, ringGraph, soloGraph, podFigure, recogniseInked, sectorRectInked, distanceIn, inkedTarget } from '../pod/inked.js';
import { GATE_SPECIES, makeSpecies } from '../pod/species.js';
import { INK } from '../pod/ring.js';
import { clausesOf } from '../topo/figure.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => { checks++; if (!cond) { failures++; console.log('FAIL ' + what + (detail ? ' :: ' + detail : '')); } };
const S = 600;

/* 1. the switch */
{
  const at = (host, search) => ({ hostname: host, search });
  if (!INKED.published) {
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
      if (k.roles.includes(role)) cropOk++;
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
  ok(cropOk === cropN, `species ${a}/${s}: a crop of a part's rectangle keeps it`, `${cropOk} of ${cropN}`);
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
  ok(Math.abs(D[5 * W + 5] - 5) < 1e-6, 'the centre of a 9 x 9 square is 5 pixels from the paper', String(D[5 * W + 5]));
  ok(Math.abs(D[1 * W + 5] - 1) < 1e-6 && D[0] === 0, 'an edge pixel is 1, the paper 0', `${D[W + 5]}, ${D[0]}`);
}

console.log(`inked: ${checks} checks, ${failures} failed`);
if (!checks || failures) process.exit(1);
