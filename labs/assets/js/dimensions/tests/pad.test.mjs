// pad.test.mjs: the reduction (pad.js) on cases whose answer is known. Each MNIST test digit of the lab's set is
// drawn large on a pad at its own place and size (smooth upscaling, as a pad's strokes are smooth), reduced, and must
// come back close to itself and be read by the network as its label. Run: node .../tests/pad.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { reduce, inkBox, centreOfMass, FIELD } from '../pad.js';
import { netFromFile, digitFrom } from '../call.js';
import { forward, argmax, cosine } from '../mlp.js';

let n = 0, fails = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const data = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../data/dimensions/${f}`, import.meta.url)), 'utf8'));
const net = netFromFile(data('net.json'));
const dj = data('digits.json');

// A 28 by 28 digit drawn on a W by H pad, scaled by k with bilinear interpolation, its top-left at (px, py).
function onPad(x, W, H, k, px, py) {
  const g = new Float64Array(W * H);
  const at = (i, j) => (i < 0 || j < 0 || i >= 28 || j >= 28 ? 0 : x[j * 28 + i]);
  for (let J = 0; J < H; J++) for (let I = 0; I < W; I++) {
    const fx = (I + 0.5 - px) / k - 0.5, fy = (J + 0.5 - py) / k - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    g[J * W + I] = (1 - ty) * ((1 - tx) * at(x0, y0) + tx * at(x0 + 1, y0)) + ty * ((1 - tx) * at(x0, y0 + 1) + tx * at(x0 + 1, y0 + 1));
  }
  return g;
}

ok(reduce(new Float64Array(280 * 280), 280, 280).every((v) => v === 0), 'an empty pad gives an empty digit');
ok(inkBox(new Float64Array(9), 3, 3) === null, 'no ink, no box');

const places = [[10, 4, 10], [7, 60, 30], [9, 0, 0], [6, 100, 90]]; // scale, left, top on a 280 by 280 pad
// Measured 2026-11-21 with the floor at 0: lowest 0.901, median 0.974 over the 40 reductions. The floor sits 0.05
// under the lowest, so it fails a reduction that loses the shape (a transposed or mis-scaled one) and not this one.
const SHAPE_FLOOR = Number(process.env.PAD_SHAPE_FLOOR ?? 0.85);
const shapes = [];
dj.items.forEach((d, i) => {
  const x = digitFrom(d);
  places.forEach(([k, px, py]) => {
    const r = reduce(onPad(x, 280, 280, k, px, py), 280, 280);
    const b = inkBox(r, FIELD, FIELD);
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    ok(side >= 19 && side <= 21, `digit ${d.label} at scale ${k}: the longer side is about 20 (${side})`);
    const [cx, cy] = centreOfMass(r);
    ok(Math.abs(cx - 14) <= 0.5 && Math.abs(cy - 14) <= 0.5, `digit ${d.label} at scale ${k}: the centre of mass is within half a pixel of (14, 14) (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
    // Centring moves by whole pixels (MNIST's "translating the image"), so a reduced digit can sit one pixel off its
    // original, and a thin stroke one pixel off has a low cosine while it is the same shape. The shape is compared
    // at the best of the nine shifts within one pixel. The bound was measured first: before this change the plain
    // cosine fell to 0.634 (the 7), and it is printed with the shifted one on a failure.
    const shifted = (dx, dy) => Float64Array.from({ length: 784 }, (_, p) => { const X = (p % 28) - dx, Y = Math.floor(p / 28) - dy; return X < 0 || Y < 0 || X >= 28 || Y >= 28 ? 0 : x[Y * 28 + X]; });
    let best = -1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, cosine(r, shifted(dx, dy)));
    ok(best > SHAPE_FLOOR, `digit ${d.label} at scale ${k}: it comes back as its own shape within a pixel (cosine ${best.toFixed(3)}; unshifted ${cosine(r, x).toFixed(3)})`);
    shapes.push(best);
    ok(argmax(forward(net, r)) === d.label, `digit ${d.label} at scale ${k} and (${px}, ${py}): read as its label`);
  });
});

// A wide drawing keeps its aspect ratio: a 200 by 50 bar becomes about 20 by 5.
{
  const g = new Float64Array(280 * 280);
  for (let j = 100; j < 150; j++) for (let i = 40; i < 240; i++) g[j * 280 + i] = 1;
  const b = inkBox(reduce(g, 280, 280), FIELD, FIELD);
  ok(b.x1 - b.x0 + 1 === 20 && b.y1 - b.y0 + 1 >= 5 && b.y1 - b.y0 + 1 <= 6, `a 200 by 50 bar becomes ${b.x1 - b.x0 + 1} by ${b.y1 - b.y0 + 1}`);
}

shapes.sort((a, b) => a - b);
console.log(`shape within a pixel, over ${shapes.length} reductions: lowest ${shapes[0].toFixed(3)}, median ${shapes[shapes.length >> 1].toFixed(3)}`);
console.log(`pad.test: ${n - fails} of ${n} passed`);
process.exit(fails ? 1 : 0);
