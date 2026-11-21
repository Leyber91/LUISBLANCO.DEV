// call.test.mjs: the call (call.js) and the plate (plate.js), on the lab's own network and digits, and on hand-made
// cells whose answer is known. Run: node labs/assets/js/dimensions/tests/call.test.mjs (exit 1 on any failure).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { forward, argmax } from '../mlp.js';
import { netFromFile, digitFrom, candidates, verdict, tally, softmax, answerAndRival, stepTo, KINDS, smallestFlip, signsFor } from '../call.js';
import { frameAlong, clipRun, run } from '../plate.js';
import { mosaic, certify } from '../split.js';

let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const data = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../data/dimensions/${f}`, import.meta.url)), 'utf8'));

const nj = data('net.json'), dj = data('digits.json');
const net = netFromFile(nj);
const eps = nj.source.eps_by_rule;
const xs = dj.items.map(digitFrom);

// 1. The file decodes to the trained network: its shapes, and every digit of the set read as its label.
ok(JSON.stringify(net.sizes) === '[784,64,64,10]' && net.W[0].length === 784 * 64 && net.b[2].length === 10, 'the network has its shapes');
ok(eps === 0.1, `the corner size is the kill test's, ${eps}`);
const read = xs.map((x) => argmax(forward(net, x)));
ok(read.every((r, i) => r === dj.items[i].label), `each digit is read as its label: ${read.join('')}`);

// 2. The answer and its rival.
for (const x of xs) {
  const { answer, rival, z } = answerAndRival(net, x);
  const rest = z.filter((_, k) => k !== answer);
  ok(rival !== answer && z[rival] === Math.max(...rest) && answer === argmax(z), 'the rival is the next largest score');
}
ok(Math.abs(softmax([1, 2, 3]).reduce((a, b) => a + b, 0) - 1) < 1e-12 && softmax([1000, 0])[0] > 0.999, 'softmax sums to 1 and does not overflow');

// 3. The candidates: three kinds, each a corner of the cube of size eps inside the pixel range, read by the network.
let templateFirst = 0, templateChanges = 0;
for (let i = 0; i < xs.length; i++) {
  const c = candidates(net, xs[i], eps, dj.items[i].index);
  ok(c.list.length === 3 && KINDS.every((k) => c.list.filter((q) => q.kind === k).length === 1), 'one candidate of each kind');
  for (const q of c.list) {
    let corner = true;
    for (let p = 0; p < 784; p++) {
      const d = q.xc[p] - xs[i][p];
      if (q.xc[p] < 0 || q.xc[p] > 1) corner = false;
      if (!(Math.abs(Math.abs(d) - eps) < 1e-12 || q.xc[p] === 0 || q.xc[p] === 1)) corner = false;
    }
    ok(corner, `${q.kind} of digit ${i} is a corner of the cube, clipped to the pixel range`);
    ok(q.read === argmax(forward(net, q.xc)) && q.changes === (q.read !== c.answer), `${q.kind} of digit ${i} is read by the network`);
  }
  if (c.list[0].kind === 'template') templateFirst++;
  if (c.list.find((q) => q.kind === 'template').changes) templateChanges++;
  const again = candidates(net, xs[i], eps, dj.items[i].index);
  ok(again.list.map((q) => q.kind).join() === c.list.map((q) => q.kind).join(), 'the order is the same for the same drawing');
}
ok(templateFirst < xs.length, `the template is not always first (${templateFirst} of ${xs.length})`);
ok(templateChanges >= 8, `the template's corner changes the answer on most digits (${templateChanges} of ${xs.length})`);
const four = dj.items.findIndex((d) => d.label === 4);
const c4 = candidates(net, xs[four], eps, dj.items[four].index);
ok(c4.list.find((q) => q.kind === 'template').read === 9, 'the first 4 is read as 9 at its sharpest corner, as on the bar sheet');
ok(c4.list.filter((q) => q.kind !== 'template').every((q) => q.read === 4), 'and as 4 at the two other corners');

// 4. The verdict and the tally, on hand-made candidates.
const mk = (changes) => ({ answer: 4, list: changes.map((ch) => ({ changes: ch, read: ch ? 9 : 4 })) });
ok(verdict(mk([false, true, false]), 1).right === true, 'picking the one that changes is right');
ok(verdict(mk([false, true, false]), 0).right === false && verdict(mk([false, true, false]), 0).counted, 'picking one that does not is wrong and counted');
ok(verdict(mk([true, true, false]), 0).right && verdict(mk([true, true, false]), 1).right, 'any corner that changes it is right');
const none = verdict(mk([false, false, false]), 2);
ok(!none.counted && !none.right, 'when none changes it the call is not counted');
let t = { made: 0, right: 0 };
t = tally(t, verdict(mk([false, true, false]), 1));
t = tally(t, verdict(mk([false, true, false]), 2));
t = tally(t, none);
ok(t.made === 2 && t.right === 1, `the tally counts calls made and right (${t.right} of ${t.made})`);

// 5. The plate: a hand-made pair of cells split at u = 0 is crossed once, half way; a cell off the step is not crossed.
const L = 2, cells = [{ poly: [[-2, -2], [0, -2], [0, 2], [-2, 2]] }, { poly: [[0, -2], [2, -2], [2, 2], [0, 2]] }, { poly: [[-2, 1], [2, 1], [2, 2], [-2, 2]] }];
const r = run(cells.slice(0, 2), L);
ok(r.passed.length === 2 && r.ticks.length === 1 && Math.abs(r.ticks[0] - 0.5) < 1e-12, `the step crosses one wall at its middle (${r.ticks})`);
ok(clipRun(cells[2].poly, L) === null, 'a cell the step does not reach is not crossed');
ok(JSON.stringify(clipRun([[0, 2], [2, 2], [2, -2], [0, -2]], L)) === JSON.stringify(clipRun(cells[1].poly, L)), 'the clip does not depend on the polygon’s orientation');

// 6. The plate on the real network: the frame puts the drawing and its corner on the u axis, the mosaic is certified,
//    and the run crosses as many walls as the cells it passes through, less one.
const tmpl = c4.list.find((q) => q.kind === 'template');
const third = xs.find((_, j) => dj.items[j].label === c4.rival);
const fr = frameAlong(xs[four], tmpl.xc, third, 1.5);
const proj = (x) => { let u = 0, v = 0; for (let p = 0; p < 784; p++) { const d = x[p] - fr.c[p]; u += d * fr.e1[p]; v += d * fr.e2[p]; } return [u, v]; };
const [ua, va] = proj(xs[four]), [ub, vb] = proj(tmpl.xc);
ok(Math.abs(ua + fr.L / 2) < 1e-9 && Math.abs(ub - fr.L / 2) < 1e-9 && Math.abs(va) < 1e-9 && Math.abs(vb) < 1e-9, 'the drawing and its corner sit at -L/2 and L/2 on the u axis');
const M = mosaic(net, fr);
ok(certify(net, fr, M.cells) === 0, `the plate's mosaic is certified (${M.cells.length} cells)`);
const R = run(M.cells, fr.L);
ok(R.ticks.length === R.passed.length - 1 && R.ticks.every((v, i) => i === 0 || v > R.ticks[i - 1]), `the run crosses ${R.ticks.length} walls, in order`);
ok(Math.abs(R.passed.reduce((a, p) => a + (p.s[1] - p.s[0]), 0) - 1) < 1e-9, 'the cells it passes through cover the whole step');

// 6b. The flip ledger reproduces the kill test's: the first test 4 on the seed-1 network flips at 0.042236328125
//     (kill_test/out/measure_1.json, base.ledger[0]: the same corner, bisection on [0, 0.5], 12 steps).
ok(smallestFlip(net, xs[four]) === 0.042236328125, `the ledger's entry for the first 4 is the kill test's (${smallestFlip(net, xs[four])})`);
ok(smallestFlip(net, xs[four], 0.01) === null, 'a bound that does not flip it gives null');
{
  const e = smallestFlip(net, xs[four]);
  const { answer, rival } = answerAndRival(net, xs[four]);
  const sg = signsFor('template', net, xs[four], rival, answer, 0);
  ok(argmax(forward(net, stepTo(xs[four], sg, e))) !== 4 && argmax(forward(net, stepTo(xs[four], sg, e - 0.5 / 4096))) === 4, 'the entry flips it and one bisection step less does not');
}

// 7. stepTo keeps every pixel in range.
const st = stepTo(Float64Array.from([0, 0.05, 0.5, 0.95, 1]), [-1, -1, 1, 1, 1], 0.1);
ok(JSON.stringify(Array.from(st, (v) => +v.toFixed(12))) === JSON.stringify([0, 0, 0.6, 1, 1]), `stepTo clips to the pixel range (${Array.from(st)})`);

console.log(`call.test: ${n - fails} of ${n} passed`);
process.exit(fails ? 1 : 0);
