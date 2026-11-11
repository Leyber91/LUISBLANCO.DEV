/* ============================================================
   ai-health/models.js — the model registry. Each family is one entry
   with fit (async, yields to the page between chunks so no task runs
   long), predict and explain. Views read MODELS and never name a
   family, so a third family is one more entry here.

   Logistic regression (IRLS / Newton with L2 chosen on a validation
   split). Each vital enters through NEWS2's own band edges, one
   indicator per band with the 0-point band as reference, so it can
   learn "too low or too high"; age and the temporal features enter
   linearly. Its explanation is exact: feature j contributes the sum
   of its terms minus that sum's training mean.

   Gradient-boosted trees (Friedman 2001; second-order leaf values and
   split gain as in XGBoost). Its explanation is the exact Shapley
   value of each feature under the tree-path-dependent value function
   (Lundberg et al. 2020): v(S) is a tree's output when the features
   in S are known and every other split is averaged over the training
   samples that reached it. TreeSHAP computes that same quantity in
   polynomial time; this module enumerates every subset of the
   features each tree uses (at most 7 at depth 3), which is slower
   and plainly checkable. Additivity holds: base + sum(phi) = logit.
   ============================================================ */

import { MODEL, MODEL_FEATURES, LR_BINS } from './config.js';
import { sigmoid } from './rng.js';
import { featureRow } from './features.js';

export const featureKeys = (dropped = new Set()) => MODEL_FEATURES.filter((k) => !dropped.has(k));
const yieldToPage = () => new Promise((r) => setTimeout(r, 0));
const logloss = (p, y) => -(y ? Math.log(Math.max(p, 1e-12)) : Math.log(Math.max(1 - p, 1e-12)));

/* ---------- small dense linear algebra ---------- */
function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

/* ---------- logistic regression on NEWS2-banded vitals ---------- */
export function bandOf(key, v) {
  const e = LR_BINS[key];
  const tenths = key === 'temp';
  for (let i = 0; i < e.length; i++) if (tenths ? Math.round(v * 10) <= Math.round(e[i] * 10) : v <= e[i]) return i;
  return e.length;
}
export function bandLabel(key, i) {
  const e = LR_BINS[key], d = key === 'temp' ? 1 : 0, step = key === 'temp' ? 0.1 : 1;
  if (i === 0) return '≤' + e[0].toFixed(d);
  if (i === e.length) return '≥' + (e[e.length - 1] + step).toFixed(d);
  return (e[i - 1] + step).toFixed(d) + '–' + e[i].toFixed(d);
}

function lrDesign(keys) {
  const cols = [];       // { key, kind: 'bin'|'lin', bin }
  for (const k of keys) {
    if (LR_BINS[k]) { for (let b = 0; b <= LR_BINS[k].length; b++) if (b !== LR_BINS.ref[k]) cols.push({ key: k, kind: 'bin', bin: b }); }
    else cols.push({ key: k, kind: 'lin' });
  }
  return cols;
}

function lrRow(x, keys, cols, mu, sd) {
  const byKey = {};
  keys.forEach((k, j) => { byKey[k] = x[j]; });
  return cols.map((c, i) => (c.kind === 'bin' ? (bandOf(c.key, byKey[c.key]) === c.bin ? 1 : 0) : (byKey[c.key] - mu[i]) / sd[i]));
}

async function irls(Z, y, l2, iters, w0) {
  const n = Z.length, d = Z[0].length;
  let beta = w0 ? w0.slice() : new Array(d).fill(0);
  if (!w0) { const prev = y.reduce((a, b) => a + b, 0) / n; beta[0] = Math.log(prev / (1 - prev)); }
  const lam = l2 * n, trace = [];
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: d }, () => new Float64Array(d));
    const g = new Float64Array(d);
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const z = Z[i];
      let e = 0;
      for (let j = 0; j < d; j++) e += beta[j] * z[j];
      const p = sigmoid(e), w = Math.max(p * (1 - p), 1e-9), r = y[i] - p;
      ll += logloss(p, y[i]);
      for (let j = 0; j < d; j++) {
        if (!z[j]) continue;
        g[j] += r * z[j];
        const wz = w * z[j];
        for (let k = j; k < d; k++) if (z[k]) H[j][k] += wz * z[k];
      }
    }
    for (let j = 0; j < d; j++) for (let k = 0; k < j; k++) H[j][k] = H[k][j];
    for (let j = 1; j < d; j++) { H[j][j] += lam; g[j] -= lam * beta[j]; }
    const step = solve(H.map((r) => Array.from(r)), Array.from(g));
    // backtracking: a Newton step on nearly separated data can overshoot, so
    // halve it until the penalised loss falls
    const f0 = penalised(Z, y, beta, lam);
    let t = 1, next = beta.map((b, j) => b + step[j]);
    while (t > 1e-4 && !(penalised(Z, y, next, lam) <= f0 + 1e-12)) { t /= 2; next = beta.map((b, j) => b + t * step[j]); }
    const moved = Math.max(...step.map((v) => Math.abs(t * v)));
    beta = next;
    trace.push(ll / n);
    if (moved < 1e-7) break;
    await yieldToPage();
  }
  return { beta, trace };
}

function penalised(Z, y, beta, lam) {
  let f = 0;
  for (let i = 0; i < Z.length; i++) {
    const z = Z[i];
    let e = 0;
    for (let j = 0; j < beta.length; j++) e += beta[j] * z[j];
    f += logloss(sigmoid(e), y[i]);
  }
  for (let j = 1; j < beta.length; j++) f += 0.5 * lam * beta[j] * beta[j];
  return f;
}

async function fitLR(train, valid, { dropped } = {}) {
  const keys = featureKeys(dropped);
  const cols = lrDesign(keys);
  const Xtr = train.map((p) => featureRow(p, keys));
  await yieldToPage();
  const Xva = valid.map((p) => featureRow(p, keys));
  const mu = cols.map((c) => (c.kind === 'lin' ? Xtr.reduce((s, r) => s + r[keys.indexOf(c.key)], 0) / Xtr.length : 0));
  const sd = cols.map((c, i) => (c.kind === 'lin' ? Math.sqrt(Xtr.reduce((s, r) => s + (r[keys.indexOf(c.key)] - mu[i]) ** 2, 0) / Xtr.length) || 1 : 1));
  const Ztr = Xtr.map((x) => [1, ...lrRow(x, keys, cols, mu, sd)]);
  const Zva = Xva.map((x) => [1, ...lrRow(x, keys, cols, mu, sd)]);
  const ytr = train.map((p) => p.y), yva = valid.map((p) => p.y);
  // choose the L2 strength on the validation split
  const grid = [];
  let best = null;
  for (const l2 of MODEL.lr.l2Grid) {
    const fit = await irls(Ztr, ytr, l2, MODEL.lr.iters, best?.beta);
    let vl = 0;
    for (let i = 0; i < Zva.length; i++) { let e = 0; for (let j = 0; j < fit.beta.length; j++) e += fit.beta[j] * Zva[i][j]; vl += logloss(sigmoid(e), yva[i]); }
    vl /= Zva.length;
    grid.push({ l2, valLoss: vl, iters: fit.trace.length });
    if (!best || vl < best.valLoss) best = { ...fit, l2, valLoss: vl };
    await yieldToPage();
  }
  const beta = best.beta;
  // per-feature centring so contributions are relative to the average training patient
  const keyTerm = (z, k) => cols.reduce((s, c, i) => (c.key === k ? s + beta[i + 1] * z[i + 1] : s), 0);
  const center = Object.fromEntries(keys.map((k) => [k, Ztr.reduce((s, z) => s + keyTerm(z, k), 0) / Ztr.length]));
  const base = beta[0] + keys.reduce((s, k) => s + center[k], 0);
  const design = (p) => [1, ...lrRow(featureRow(p, keys), keys, cols, mu, sd)];
  return {
    kind: 'lr', keys, cols, beta, base, trace: best.trace, l2: best.l2, grid, valLoss: best.valLoss,
    logit(p) { const z = design(p); let e = 0; for (let j = 0; j < z.length; j++) e += beta[j] * z[j]; return e; },
    predict(p) { return sigmoid(this.logit(p)); },
    explain(p) {
      const z = design(p), x = featureRow(p, keys);
      const phi = keys.map((k, j) => ({ key: k, value: x[j], c: keyTerm(z, k) - center[k] }));
      return { base, phi, logit: this.logit(p), method: 'exact decomposition of the regression' };
    },
    /* the fitted terms: log-odds per NEWS2 band (reference band 0), per unit for linear features */
    terms() {
      return keys.map((k) => {
        if (LR_BINS[k]) {
          const bands = [];
          for (let b = 0; b <= LR_BINS[k].length; b++) {
            const i = cols.findIndex((c) => c.key === k && c.bin === b);
            bands.push({ band: b, label: bandLabel(k, b), w: i < 0 ? 0 : beta[i + 1], ref: b === LR_BINS.ref[k] });
          }
          return { key: k, kind: 'bin', bands };
        }
        const i = cols.findIndex((c) => c.key === k);
        return { key: k, kind: 'lin', perUnit: beta[i + 1] / sd[i], mean: mu[i] };
      });
    },
  };
}

/* ---------- gradient-boosted trees ---------- */
function makeBins(values, maxBins) {
  const sorted = Float64Array.from(values).sort();
  const uniq = [];
  for (let i = 0; i < sorted.length; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) uniq.push(sorted[i]);
  let edges;
  if (uniq.length <= maxBins) edges = uniq;
  else {
    edges = [];
    for (let b = 1; b <= maxBins; b++) {
      const v = sorted[Math.min(sorted.length - 1, Math.floor((b / maxBins) * sorted.length) - 1)];
      if (!edges.length || v > edges[edges.length - 1]) edges.push(v);
    }
    if (edges[edges.length - 1] < uniq[uniq.length - 1]) edges.push(uniq[uniq.length - 1]);
  }
  const thr = edges.slice(0, -1).map((e, k) => {
    const next = uniq.find((u) => u > e) ?? edges[k + 1];
    return (e + next) / 2;
  });
  return { edges, thr };
}

function binIndex(v, edges) {
  let lo = 0, hi = edges.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (v <= edges[m]) hi = m; else lo = m + 1; }
  return lo;
}

function evalTreeRow(node, x) {
  while (!node.leaf) node = x[node.f] <= node.thr ? node.left : node.right;
  return node.value;
}

function prepTree(root) {
  const used = [];
  (function walk(nd) { if (nd.leaf) return; if (!used.includes(nd.f)) used.push(nd.f); walk(nd.left); walk(nd.right); })(root);
  const m = used.length, fact = [1];
  for (let i = 1; i <= m; i++) fact[i] = fact[i - 1] * i;
  const weight = [];
  for (let s = 0; s < m; s++) weight[s] = (fact[s] * fact[m - s - 1]) / fact[m];
  const bit = {};
  used.forEach((f, i) => { bit[f] = 1 << i; });
  const pop = new Uint8Array(1 << m);
  for (let mask = 1; mask < 1 << m; mask++) pop[mask] = pop[mask >> 1] + (mask & 1);
  return { root, used, m, weight, bit, pop };
}

function vPath(node, x, mask, bit) {
  if (node.leaf) return node.value;
  if (mask & bit[node.f]) return vPath(x[node.f] <= node.thr ? node.left : node.right, x, mask, bit);
  return (node.left.n * vPath(node.left, x, mask, bit) + node.right.n * vPath(node.right, x, mask, bit)) / node.n;
}

async function fitGBT(train, valid, { dropped, onProgress } = {}) {
  const C = MODEL.gbt;
  const keys = featureKeys(dropped);
  const n = train.length, d = keys.length;
  const X = train.map((p) => featureRow(p, keys));
  await yieldToPage();
  const Xv = valid.map((p) => featureRow(p, keys));
  const y = Float64Array.from(train, (p) => p.y), yv = valid.map((p) => p.y);
  const bins = keys.map((_, j) => makeBins(X.map((r) => r[j]), C.bins));
  const B = keys.map((_, j) => Uint8Array.from(X, (r) => binIndex(r[j], bins[j].edges)));
  await yieldToPage();
  const prev = y.reduce((a, b) => a + b, 0) / n;
  const F0 = Math.log(prev / (1 - prev));
  const F = new Float64Array(n).fill(F0), Fv = new Float64Array(Xv.length).fill(F0);
  const g = new Float64Array(n), h = new Float64Array(n);
  const trees = [], trace = [], valTrace = [];
  const lam = C.lambda;

  function build(idx, depth) {
    let G = 0, Hs = 0;
    for (const i of idx) { G += g[i]; Hs += h[i]; }
    const leaf = { leaf: true, value: -G / (Hs + lam) * C.rate, n: idx.length };
    if (depth >= C.depth || idx.length < 2 * C.minLeaf) return leaf;
    const parent = (G * G) / (Hs + lam);
    let best = null;
    for (let j = 0; j < d; j++) {
      const nb = bins[j].edges.length;
      if (nb < 2) continue;
      const gs = new Float64Array(nb), hs = new Float64Array(nb), cs = new Int32Array(nb);
      const bj = B[j];
      for (const i of idx) { const b = bj[i]; gs[b] += g[i]; hs[b] += h[i]; cs[b]++; }
      let gl = 0, hl = 0, cl = 0;
      for (let k = 0; k < nb - 1; k++) {
        gl += gs[k]; hl += hs[k]; cl += cs[k];
        const cr = idx.length - cl;
        if (cl < C.minLeaf || cr < C.minLeaf) continue;
        const gr = G - gl, hr = Hs - hl;
        const gain = (gl * gl) / (hl + lam) + (gr * gr) / (hr + lam) - parent;
        if (!best || gain > best.gain) best = { gain, j, k };
      }
    }
    if (!best || best.gain <= 1e-6) return leaf;
    const L = [], R = [];
    const bj = B[best.j];
    for (const i of idx) (bj[i] <= best.k ? L : R).push(i);
    return { leaf: false, f: best.j, key: keys[best.j], thr: bins[best.j].thr[best.k], n: idx.length, gain: best.gain,
      left: build(L, depth + 1), right: build(R, depth + 1) };
  }

  const all = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < C.trees; t++) {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(F[i]);
      g[i] = p - y[i]; h[i] = Math.max(p * (1 - p), 1e-9);
      ll += logloss(p, y[i]);
    }
    trace.push(ll / n);
    const tree = build(all, 0);
    trees.push(prepTree(tree));
    for (let i = 0; i < n; i++) F[i] += evalTreeRow(tree, X[i]);
    let vl = 0;
    for (let i = 0; i < Xv.length; i++) { Fv[i] += evalTreeRow(tree, Xv[i]); vl += logloss(sigmoid(Fv[i]), yv[i]); }
    valTrace.push(vl / Math.max(1, Xv.length));
    if ((t + 1) % C.chunk === 0) { onProgress?.(t + 1, C.trees); await yieldToPage(); }
  }
  const base = F0 + trees.reduce((s, t) => s + vPath(t.root, [], 0, t.bit), 0);
  return {
    kind: 'gbt', keys, F0, trees, trace, valTrace, base, valLoss: valTrace[valTrace.length - 1],
    logit(p) { const x = featureRow(p, keys); let e = F0; for (const t of trees) e += evalTreeRow(t.root, x); return e; },
    predict(p) { return sigmoid(this.logit(p)); },
    explain(p) {
      const x = featureRow(p, keys);
      const phi = new Float64Array(keys.length);
      for (const t of trees) {
        const { m, used, weight, bit, pop } = t;
        const full = 1 << m;
        const v = new Float64Array(full);
        for (let mask = 0; mask < full; mask++) v[mask] = vPath(t.root, x, mask, bit);
        for (let i = 0; i < m; i++) {
          const bi = 1 << i;
          let acc = 0;
          for (let mask = 0; mask < full; mask++) if (!(mask & bi)) acc += weight[pop[mask]] * (v[mask | bi] - v[mask]);
          phi[used[i]] += acc;
        }
      }
      return { base, logit: this.logit(p), method: 'exact path-dependent Shapley values', phi: keys.map((k, j) => ({ key: k, value: x[j], c: phi[j] })) };
    },
  };
}

/* ---------- the registry ---------- */
export const MODELS = [
  { id: 'lr', name: 'logistic regression', short: 'regression', fit: fitLR,
    method: 'Exact: each feature contributes its fitted terms minus their training mean; the baseline is the average training patient.' },
  { id: 'gbt', name: 'tree ensemble', short: 'trees', fit: fitGBT,
    method: 'Exact path-dependent Shapley values (the quantity TreeSHAP computes; Lundberg et al. 2020), by enumerating every subset of the features each depth-3 tree uses. The baseline is the mean output over training patients.' },
];
export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

/* Mean |contribution| per feature over a sample: what the model leans on. */
export function globalImportance(model, patients) {
  const acc = new Float64Array(model.keys.length);
  for (const p of patients) model.explain(p).phi.forEach((f, j) => { acc[j] += Math.abs(f.c); });
  return model.keys.map((k, j) => ({ key: k, mean: acc[j] / patients.length }));
}
