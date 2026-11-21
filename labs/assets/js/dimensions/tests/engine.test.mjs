// engine.test.mjs: the kill test's selftest, lifted with the engine (ticket 1.01). Its section on the kill test's
// verdict (rules.mjs) stays with the kill test in _reference; everything else runs on the lab's own modules.
// selftest.mjs: the code of the kill test, checked on small synthetic networks with answers known in advance.
// It reads no MNIST file and computes no outcome measure. Run: node selftest.mjs (exit 1 on any failure).

import { createNet, forward, template, createAdam, trainStep, fgsm, pattern, zeroGrads, cosine } from '../mlp.js';
import { planeFrame, pointAt, mosaic, layerOneCountByFormula, inPoly, patternKey, polyArea, certify } from '../split.js';
import { mulberry32 } from '../../kit/rng.js';

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

const rng = mulberry32(7);
const rand = (k) => Float64Array.from({ length: k }, () => rng());

// 1. Parameter gradients of trainStep against central differences (tiny net, one example, clean mode).
{
  const net = createNet([6, 5, 4, 3], mulberry32(1));
  const x = rand(6), y = 2;
  const loss = (nt) => {
    const z = forward(nt, x);
    const mx = Math.max(...z);
    const lse = mx + Math.log(z.reduce((s, v) => s + Math.exp(v - mx), 0));
    return lse - z[y];
  };
  // Capture the gradient: an Adam step with lr 0 leaves the weights and keeps g.
  const opt = createAdam(net, 0);
  trainStep(net, opt, [0], (i, buf) => { buf.set(x); return y; }, 'clean');
  let worst = 0;
  for (let l = 0; l < 3; l++) {
    for (let i = 0; i < net.W[l].length; i++) {
      const h = 1e-6, w0 = net.W[l][i];
      net.W[l][i] = w0 + h; const lp = loss(net);
      net.W[l][i] = w0 - h; const lm = loss(net);
      net.W[l][i] = w0;
      worst = Math.max(worst, Math.abs((lp - lm) / (2 * h) - opt.g.W[l][i]));
    }
  }
  ok(worst < 1e-6, `parameter gradient vs central difference, worst ${worst}`);
}

// 2. The template equals the gradient of z_a - z_b by central differences, and is a cell's linear map.
{
  const net = createNet([8, 6, 6, 4], mulberry32(2));
  for (let r = 0; r < 20; r++) {
    const x = rand(8);
    const t = template(net, x, 3, 1);
    const pat = JSON.stringify(pattern(net, x));
    for (let p = 0; p < 8; p++) {
      const h = 1e-7, xp = Float64Array.from(x), xm = Float64Array.from(x);
      xp[p] += h; xm[p] -= h;
      if (JSON.stringify(pattern(net, xp)) !== pat || JSON.stringify(pattern(net, xm)) !== pat) continue;
      const zp = forward(net, xp), fp = zp[3] - zp[1];
      const zm = forward(net, xm), fm = zm[3] - zm[1];
      ok(Math.abs((fp - fm) / (2 * h) - t[p]) < 1e-6, `template entry ${p} at draw ${r}`);
    }
  }
}

// 3. The fast gradient sign step moves every coordinate by eps or to the box edge, and raises the loss of a linear model.
{
  const net = createNet([5, 4, 4, 3], mulberry32(3));
  const x = Float64Array.from([0, 0.5, 1, 0.2, 0.95]);
  const xa = fgsm(net, x, 1, 0.1);
  for (let p = 0; p < 5; p++) {
    const d = Math.abs(xa[p] - x[p]);
    ok(xa[p] >= 0 && xa[p] <= 1 && (Math.abs(d - 0.1) < 1e-12 || xa[p] === 0 || xa[p] === 1 || d === 0), `fgsm coordinate ${p}`);
  }
}

// 4. Training lowers the loss on a separable toy problem (the training step works end to end, both modes).
{
  for (const mode of ['clean', 'adv']) {
    const net = createNet([4, 8, 8, 2], mulberry32(4));
    const opt = createAdam(net, 1e-2);
    const r2 = mulberry32(5);
    const X = Array.from({ length: 64 }, () => Float64Array.from({ length: 4 }, () => r2()));
    const Y = X.map((x) => (x[0] + x[1] > 1 ? 1 : 0));
    const get = (i, buf) => { buf.set(X[i]); return Y[i]; };
    const all = X.map((_, i) => i);
    const first = trainStep(net, opt, all, get, mode, 0.02);
    let last = first;
    for (let s = 0; s < 300; s++) last = trainStep(net, opt, all, get, mode, 0.02);
    ok(last < first * 0.5, `${mode} training lowers the loss (${first.toFixed(3)} to ${last.toFixed(3)})`);
  }
}

// 5. The mosaic on random planes of random networks: layer one matches the formula, the areas tile the square,
//    every cell's pattern is unique and correct at its vertex mean, and a grid finds no cell the mosaic missed.
{
  for (let r = 0; r < 4; r++) {
    const net = createNet([12, 10, 9, 3], mulberry32(10 + r));
    const fr = planeFrame(rand(12), rand(12), rand(12));
    const M = mosaic(net, fr);
    const F = layerOneCountByFormula(net, fr);
    ok(M.perLayer[0] === F.regions, `plane ${r}: layer one ${M.perLayer[0]} cells, formula ${F.regions}`);
    const areaSum = M.cells.reduce((a, c) => a + c.area, 0);
    ok(Math.abs(areaSum - M.domainArea) / M.domainArea < 1e-9, `plane ${r}: areas tile the square`);
    const keys = new Map(M.cells.map((c, i) => [patternKey(c.pattern), i]));
    ok(keys.size === M.cells.length, `plane ${r}: patterns unique (${keys.size} of ${M.cells.length})`);
    let bad = 0;
    for (const c of M.cells) {
      const cx = c.poly.reduce((a, q) => a + q[0], 0) / c.poly.length, cy = c.poly.reduce((a, q) => a + q[1], 0) / c.poly.length;
      if (patternKey(Uint8Array.from(pattern(net, pointAt(fr, cx, cy)).flat())) !== patternKey(c.pattern)) bad++;
    }
    ok(bad === 0, `plane ${r}: pattern at each cell's vertex mean (${bad} wrong)`);
    let notFound = 0, outside = 0;
    const G = 120, H = fr.H;
    for (let a = 0; a < G; a++) for (let b = 0; b < G; b++) {
      const u = -H + (2 * H * (a + 0.5)) / G, v = -H + (2 * H * (b + 0.5)) / G;
      const i = keys.get(patternKey(Uint8Array.from(pattern(net, pointAt(fr, u, v)).flat())));
      if (i === undefined) notFound++;
      else if (!inPoly(M.cells[i].poly, u, v, 1e-7 * H)) outside++;
    }
    ok(notFound === 0 && outside === 0, `plane ${r}: grid ${G}x${G}, ${notFound} points in no cell, ${outside} outside their cell`);
    ok(M.perLayer[1] >= M.perLayer[0], `plane ${r}: layer two only splits (${M.perLayer[0]} then ${M.perLayer[1]})`);
  }
}

// 6. A network whose cells are known by hand: 2 inputs, layer one u > 0 and v > 0, layer two one neuron
//    relu(u) + relu(v) - 1 > 0. In the square [-2, 2]^2 (frame chosen so u, v are the inputs), the cells are:
//    the four quadrants, and the positive quadrant is cut by u + v = 1; the quadrant (u>0, v<0) is cut by u = 1;
//    (u<0, v>0) by v = 1; (u<0, v<0) is not cut. 7 cells.
{
  const net = { sizes: [2, 2, 1, 1], W: [Float64Array.from([1, 0, 0, 1]), Float64Array.from([1, 1]), Float64Array.from([1])], b: [Float64Array.from([0, 0]), Float64Array.from([-1]), Float64Array.from([0])] };
  const fr = { c: Float64Array.from([0, 0]), e1: Float64Array.from([1, 0]), e2: Float64Array.from([0, 1]), H: 2 };
  const M = mosaic(net, fr);
  ok(M.perLayer[0] === 4 && M.cells.length === 7, `hand network: ${M.perLayer.join(', ')} cells (expected 4, 7)`);
  const big = M.cells.filter((c) => c.pattern[0] && c.pattern[1] && c.pattern[2]);
  ok(big.length === 1 && Math.abs(big[0].area - (4 - 0.5)) < 1e-12, 'hand network: the cell u, v > 0, u + v > 1 has area 3.5');
}

// 6b. The vertex certificate: 0 on the true mosaic; it fails a cell whose pattern is wrong in one neuron.
{
  for (let r = 0; r < 3; r++) {
    const net = createNet([12, 10, 9, 3], mulberry32(30 + r));
    const fr = planeFrame(rand(12), rand(12), rand(12));
    const M = mosaic(net, fr);
    ok(certify(net, fr, M.cells) === 0, `plane ${r}: the certificate holds on the true mosaic (${M.cells.length} cells)`);
    const big = M.cells.reduce((a, c) => (c.area > a.area ? c : a));
    const wrong = { ...big, pattern: Uint8Array.from(big.pattern) };
    wrong.pattern[0] ^= 1;
    ok(certify(net, fr, [wrong]) === 1, `plane ${r}: the certificate fails a cell with one wrong neuron`);
    // A merged cell: the union of two neighbours under one pattern fails at the other's vertices.
    const other = M.cells.find((c) => c !== big && c.poly.some((q) => big.poly.some((w) => Math.hypot(q[0] - w[0], q[1] - w[1]) < 1e-12)));
    if (other) ok(certify(net, fr, [{ ...big, poly: big.poly.concat(other.poly) }]) === 1, `plane ${r}: the certificate fails a cell that holds a neighbour's vertices`);
  }
}

// 7. The cosine and its mask.
{
  ok(Math.abs(cosine([1, 0, 5], [1, 0, -5], [1, 1, 0]) - 1) < 1e-15, 'cosine respects the mask');
  ok(cosine([0, 0], [1, 1]) === 0, 'cosine of a zero vector is 0');
}

console.log(`selftest: ${n - fails} of ${n} passed`);
process.exit(fails ? 1 : 0);
