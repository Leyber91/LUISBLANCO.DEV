/* ============================================================
   dimensions/harden.worker.js: hardening, off the main thread (ticket 1.08, second half; BAR_L1 part 10).

   As the kill test tested it (KILL_TEST.md, "What is fixed"): Adam at 1e-3 with a fresh state, batches of 64 drawn
   in shuffled passes, loss 0.5 CE(x) + 0.5 CE(fgsm(x)) at the page's eps (Goodfellow, Shlens and Szegedy 2015,
   alpha 0.5), for `steps` steps, on the 2,000 shipped digits and the visitor's own drawings with the answers the
   network gave them. Every `every` steps the weights are posted, so the page redraws the walls as they move.
   ============================================================ */

import { createAdam, trainStep } from './mlp.js';
import { mulberry32 } from '../kit/rng.js';

self.onmessage = (e) => {
  const { sizes, W, b, pixels, labels, extra, eps, steps, batch, seed, every } = e.data;
  const net = { sizes, W: W.map((a) => Float64Array.from(a)), b: b.map((a) => Float64Array.from(a)) };
  const opt = createAdam(net, 1e-3);
  const n = labels.length, m = n + extra.length;
  const getX = (i, buf) => {
    if (i < n) { const o = i * 784; for (let p = 0; p < 784; p++) buf[p] = pixels[o + p] / 255; return labels[i]; }
    const d = extra[i - n]; buf.set(d.x); return d.label;
  };
  const rng = mulberry32(seed >>> 0);
  let pool = [], pos = 0;
  const next = () => {
    const out = [];
    while (out.length < batch) {
      if (pos >= pool.length) { pool = Array.from({ length: m }, (_, i) => i); for (let i = m - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } pos = 0; }
      out.push(pool[pos++]);
    }
    return out;
  };
  const t0 = performance.now();
  for (let s = 0; s < steps; s++) {
    const loss = trainStep(net, opt, next(), getX, 'adv', eps);
    if ((s + 1) % every === 0 || s === steps - 1) {
      self.postMessage({ step: s + 1, steps, loss, ms: performance.now() - t0, W: net.W, b: net.b, done: s === steps - 1 });
    }
  }
};
