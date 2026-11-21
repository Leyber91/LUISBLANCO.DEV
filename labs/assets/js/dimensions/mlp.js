// mlp.mjs: a small ReLU network in plain JavaScript, with no library.
// Pure: no clock, no Math.random; every random draw comes from a generator passed in.
// Written so the page can later import it unchanged (a worker trains with trainStep).
//
// The network: sizes [784, 64, 64, 10], ReLU after each hidden layer, softmax cross-entropy at the end.
// W[l] is row-major, out rows by in columns; b[l] has out entries.
//
// Methods taken, not invented:
// - backpropagation of the softmax cross-entropy (the standard derivation);
// - Adam (Kingma and Ba, ICLR 2015), with its default constants;
// - He-normal initialisation (He et al., ICCV 2015): weights N(0, 2 / fan_in), biases 0;
// - the fast gradient sign step and the adversarial objective with alpha = 0.5
//   (Goodfellow, Shlens and Szegedy, ICLR 2015, section 6).

import { normalFrom } from '../kit/rng.js';

export function createNet(sizes, rng) {
  const W = [], b = [];
  const normal = normalFrom(rng); // the kit returns a sampler (mean, sd) -> number bound to rng
  for (let l = 0; l + 1 < sizes.length; l++) {
    const nin = sizes[l], nout = sizes[l + 1];
    const w = new Float64Array(nout * nin);
    const sd = Math.sqrt(2 / nin);
    for (let i = 0; i < w.length; i++) w[i] = normal(0, sd);
    W.push(w);
    b.push(new Float64Array(nout));
  }
  return { sizes: sizes.slice(), W, b };
}

export function cloneNet(net) {
  return { sizes: net.sizes.slice(), W: net.W.map((w) => new Float64Array(w)), b: net.b.map((v) => new Float64Array(v)) };
}

export function netToJSON(net) {
  return { sizes: net.sizes, W: net.W.map((w) => Array.from(w)), b: net.b.map((v) => Array.from(v)) };
}

export function netFromJSON(o) {
  return { sizes: o.sizes.slice(), W: o.W.map((w) => Float64Array.from(w)), b: o.b.map((v) => Float64Array.from(v)) };
}

// Scratch buffers per network shape, reused across calls.
function scratch(net) {
  if (!net._s) {
    const L = net.W.length;
    net._s = {
      pre: net.sizes.slice(1).map((n) => new Float64Array(n)),
      act: net.sizes.slice(1).map((n) => new Float64Array(n)),
      dpre: net.sizes.slice(1).map((n) => new Float64Array(n)),
      dx: new Float64Array(net.sizes[0]),
      L,
    };
  }
  return net._s;
}

// Forward pass. Fills s.pre[l] and s.act[l]; the last act is the logits (no ReLU).
export function forward(net, x) {
  const s = scratch(net);
  let inp = x;
  for (let l = 0; l < s.L; l++) {
    const w = net.W[l], bb = net.b[l], nin = net.sizes[l], nout = net.sizes[l + 1];
    const pre = s.pre[l], act = s.act[l];
    const last = l === s.L - 1;
    for (let j = 0; j < nout; j++) {
      let z = bb[j];
      const o = j * nin;
      for (let i = 0; i < nin; i++) z += w[o + i] * inp[i];
      pre[j] = z;
      act[j] = last ? z : (z > 0 ? z : 0);
    }
    inp = act;
  }
  return s.act[s.L - 1];
}

export function argmax(v) {
  let k = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[k]) k = i;
  return k;
}

// The activation pattern of the hidden layers at x, as arrays of 0 and 1.
export function pattern(net, x) {
  forward(net, x);
  const s = scratch(net);
  return s.pre.slice(0, s.L - 1).map((p) => Array.from(p, (z) => (z > 0 ? 1 : 0)));
}

// Backward pass of the cross-entropy for label y, after forward(net, x).
// Adds coef times the parameter gradients into G (same shapes as W and b).
// If wantDx, also returns dLoss/dx (in s.dx). Returns the loss.
function backward(net, x, y, G, coef, wantDx) {
  const s = scratch(net);
  const L = s.L;
  const logits = s.act[L - 1];
  let mx = -Infinity;
  for (let k = 0; k < logits.length; k++) if (logits[k] > mx) mx = logits[k];
  let sum = 0;
  for (let k = 0; k < logits.length; k++) sum += Math.exp(logits[k] - mx);
  const dz = s.dpre[L - 1];
  for (let k = 0; k < logits.length; k++) dz[k] = Math.exp(logits[k] - mx) / sum - (k === y ? 1 : 0);
  const loss = -(logits[y] - mx - Math.log(sum));
  for (let l = L - 1; l >= 0; l--) {
    const nin = net.sizes[l], nout = net.sizes[l + 1];
    const inp = l === 0 ? x : s.act[l - 1];
    const d = s.dpre[l];
    const w = net.W[l];
    if (G) {
      const gw = G.W[l], gb = G.b[l];
      for (let j = 0; j < nout; j++) {
        const dj = d[j] * coef;
        if (dj === 0) continue;
        gb[j] += dj;
        const o = j * nin;
        for (let i = 0; i < nin; i++) {
          const v = inp[i];
          if (v !== 0) gw[o + i] += dj * v;
        }
      }
    }
    if (l > 0) {
      const dprev = s.dpre[l - 1], prePrev = s.pre[l - 1];
      for (let i = 0; i < nin; i++) {
        if (prePrev[i] <= 0) { dprev[i] = 0; continue; }
        let a = 0;
        for (let j = 0; j < nout; j++) a += w[j * nin + i] * d[j];
        dprev[i] = a;
      }
    } else if (wantDx) {
      const dx = s.dx;
      for (let i = 0; i < nin; i++) {
        let a = 0;
        for (let j = 0; j < nout; j++) a += w[j * nin + i] * d[j];
        dx[i] = a;
      }
    }
  }
  return loss;
}

export function zeroGrads(net) {
  return { W: net.W.map((w) => new Float64Array(w.length)), b: net.b.map((v) => new Float64Array(v.length)) };
}

function clearGrads(G) {
  for (const w of G.W) w.fill(0);
  for (const v of G.b) v.fill(0);
}

export function createAdam(net, lr = 1e-3) {
  return { lr, b1: 0.9, b2: 0.999, e: 1e-8, t: 0, m: zeroGrads(net), v: zeroGrads(net), g: zeroGrads(net) };
}

function adamApply(net, opt) {
  opt.t += 1;
  const c1 = 1 - Math.pow(opt.b1, opt.t), c2 = 1 - Math.pow(opt.b2, opt.t);
  const upd = (p, g, m, v) => {
    for (let i = 0; i < p.length; i++) {
      const gi = g[i];
      m[i] = opt.b1 * m[i] + (1 - opt.b1) * gi;
      v[i] = opt.b2 * v[i] + (1 - opt.b2) * gi * gi;
      p[i] -= (opt.lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + opt.e);
    }
  };
  for (let l = 0; l < net.W.length; l++) {
    upd(net.W[l], opt.g.W[l], opt.m.W[l], opt.v.W[l]);
    upd(net.b[l], opt.g.b[l], opt.m.b[l], opt.v.b[l]);
  }
}

// The fast gradient sign step of the cross-entropy at (x, y): clip(x + eps * sign(dL/dx), 0, 1).
export function fgsm(net, x, y, eps, out = new Float64Array(x.length)) {
  forward(net, x);
  backward(net, x, y, null, 0, true);
  const dx = scratch(net).dx;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] + eps * Math.sign(dx[i]);
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

// One step of Adam on a batch. getX(i, buf) writes example i into buf and returns its label.
// mode 'clean': loss = mean CE(x). mode 'adv': loss = mean of 0.5 CE(x) + 0.5 CE(fgsm(x)) (Goodfellow 2015, alpha 0.5).
export function trainStep(net, opt, batch, getX, mode = 'clean', eps = 0) {
  clearGrads(opt.g);
  const n = net.sizes[0];
  const x = (opt._x ||= new Float64Array(n));
  const xa = (opt._xa ||= new Float64Array(n));
  let loss = 0;
  const B = batch.length;
  for (const i of batch) {
    const y = getX(i, x);
    if (mode === 'clean') {
      forward(net, x);
      loss += backward(net, x, y, opt.g, 1 / B, false);
    } else {
      fgsm(net, x, y, eps, xa); // the corner is taken against the weights before this step
      forward(net, x);
      loss += 0.5 * backward(net, x, y, opt.g, 0.5 / B, false);
      forward(net, xa);
      loss += 0.5 * backward(net, xa, y, opt.g, 0.5 / B, false);
    }
  }
  adamApply(net, opt);
  return loss / B;
}

// The template of the cell x sits in, for class a against class b: the gradient of z_a - z_b,
// which inside the cell is the row a minus row b of the cell's one linear map.
// Computed from the activation pattern at x (exact, no finite difference).
export function template(net, x, a, b, out = new Float64Array(net.sizes[0])) {
  forward(net, x);
  const s = scratch(net);
  const L = s.L;
  // v = W_L[a] - W_L[b], then back through each layer with the mask of its pattern.
  let nin = net.sizes[L - 1];
  let v = new Float64Array(nin);
  const wl = net.W[L - 1];
  for (let i = 0; i < nin; i++) v[i] = wl[a * nin + i] - wl[b * nin + i];
  for (let l = L - 2; l >= 0; l--) {
    const pre = s.pre[l];
    for (let i = 0; i < v.length; i++) if (pre[i] <= 0) v[i] = 0;
    const w = net.W[l];
    const ni = net.sizes[l], no = net.sizes[l + 1];
    const u = l === 0 ? out : new Float64Array(ni);
    u.fill(0);
    for (let j = 0; j < no; j++) {
      const vj = v[j];
      if (vj === 0) continue;
      const o = j * ni;
      for (let i = 0; i < ni; i++) u[i] += w[o + i] * vj;
    }
    v = u;
  }
  return out;
}

// Cosine of two vectors over the entries where mask is 1 (mask null: every entry).
export function cosine(a, b, mask = null) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (mask && !mask[i]) continue;
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}
