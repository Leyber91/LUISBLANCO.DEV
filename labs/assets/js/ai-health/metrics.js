/* ============================================================
   ai-health/metrics.js — the scorecard, computed live on the test
   cohort. ROC and AUROC (with ties handled exactly), the Hanley and
   McNeil (1982) standard error, precision-recall and average
   precision (Saito and Rehmsmeier 2015 on why PR matters when events
   are rare), reliability bins with Wilson (1927) intervals, Brier
   score, expected calibration error, confusion at a threshold, NEWS2
   mapped to risk, decision curves (Vickers and Elkin 2006) and the
   weighted sweeps the percentile bootstrap uses (Efron and
   Tibshirani 1993).
   ============================================================ */

/* Group by distinct score, descending, so tied scores move together. */
function sweep(scores, labels) {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const P = labels.reduce((a, b) => a + b, 0), N = labels.length - P;
  const pts = [{ thr: Infinity, tp: 0, fp: 0 }];
  let tp = 0, fp = 0;
  for (let k = 0; k < idx.length;) {
    const s = scores[idx[k]];
    while (k < idx.length && scores[idx[k]] === s) { if (labels[idx[k]]) tp++; else fp++; k++; }
    pts.push({ thr: s, tp, fp });
  }
  return { pts, P, N };
}

export function roc(scores, labels) {
  const { pts, P, N } = sweep(scores, labels);
  const curve = pts.map((q) => ({ thr: q.thr, tpr: P ? q.tp / P : 0, fpr: N ? q.fp / N : 0 }));
  let auc = 0;
  for (let i = 1; i < curve.length; i++) auc += (curve[i].fpr - curve[i - 1].fpr) * (curve[i].tpr + curve[i - 1].tpr) / 2;
  return { curve, auc, P, N, se: hanleySE(auc, P, N) };
}

export function hanleySE(A, nPos, nNeg) {
  if (!nPos || !nNeg) return NaN;
  const Q1 = A / (2 - A), Q2 = (2 * A * A) / (1 + A);
  return Math.sqrt((A * (1 - A) + (nPos - 1) * (Q1 - A * A) + (nNeg - 1) * (Q2 - A * A)) / (nPos * nNeg));
}

export function pr(scores, labels) {
  const { pts, P } = sweep(scores, labels);
  const curve = [];
  let ap = 0, prevR = 0;
  for (const q of pts.slice(1)) {
    const r = P ? q.tp / P : 0;
    const p = q.tp + q.fp ? q.tp / (q.tp + q.fp) : 1;
    curve.push({ thr: q.thr, recall: r, precision: p });
    ap += (r - prevR) * p;
    prevR = r;
  }
  return { curve, ap, prevalence: P / labels.length };
}

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/* Equal-count bins of predicted risk. */
export function calibration(probs, labels, bins = 10) {
  const idx = probs.map((p, i) => i).sort((a, b) => probs[a] - probs[b]);
  const out = [];
  for (let b = 0; b < bins; b++) {
    const lo = Math.floor((b * idx.length) / bins), hi = Math.floor(((b + 1) * idx.length) / bins);
    if (hi <= lo) continue;
    let sp = 0, sy = 0;
    for (let k = lo; k < hi; k++) { sp += probs[idx[k]]; sy += labels[idx[k]]; }
    const n = hi - lo;
    const [cl, ch] = wilson(sy, n);
    out.push({ pred: sp / n, obs: sy / n, n, lo: cl, hi: ch });
  }
  const ece = out.reduce((s, b) => s + (b.n / probs.length) * Math.abs(b.pred - b.obs), 0);
  const brier = probs.reduce((s, p, i) => s + (p - labels[i]) ** 2, 0) / probs.length;
  const meanP = probs.reduce((a, b) => a + b, 0) / probs.length;
  const meanY = labels.reduce((a, b) => a + b, 0) / labels.length;
  return { bins: out, ece, brier, meanP, meanY };
}

/* Flag when score >= thr. */
export function confusion(scores, labels, thr) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < scores.length; i++) {
    const f = scores[i] >= thr;
    if (labels[i]) { if (f) tp++; else fn++; } else if (f) fp++; else tn++;
  }
  const n = scores.length;
  return {
    tp, fp, tn, fn, n,
    sens: tp + fn ? tp / (tp + fn) : NaN,
    spec: tn + fp ? tn / (tn + fp) : NaN,
    ppv: tp + fp ? tp / (tp + fp) : NaN,
    npv: tn + fn ? tn / (tn + fn) : NaN,
    alertRate: (tp + fp) / n,
  };
}

/* The probability threshold that flags the same share of patients as
   another rule did: the fair comparison at equal alert burden. */
export function thresholdForRate(probs, rate) {
  const s = probs.slice().sort((a, b) => b - a);
  const k = Math.max(1, Math.min(s.length, Math.round(rate * s.length)));
  return s[k - 1];
}

export function summarize(scores, labels, thr) {
  return { roc: roc(scores, labels), pr: pr(scores, labels), conf: confusion(scores, labels, thr) };
}

/* ---------- NEWS2 as a probability ----------
   Observed event rate per aggregate score on the training split, made
   monotone by pooling adjacent violators (isotonic regression), so
   NEWS2 can sit on the calibration plot and the decision curve. */
export function news2RiskMap(scores, labels, maxScore = 20) {
  const n = new Array(maxScore + 1).fill(0), e = new Array(maxScore + 1).fill(0);
  scores.forEach((s, i) => { const k = Math.min(maxScore, s); n[k]++; e[k] += labels[i]; });
  const blocks = [];
  for (let k = 0; k <= maxScore; k++) {
    if (!n[k]) continue;
    blocks.push({ lo: k, hi: k, n: n[k], e: e[k] });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.e / a.n <= b.e / b.n) break;
      blocks.splice(-2, 2, { lo: a.lo, hi: b.hi, n: a.n + b.n, e: a.e + b.e });
    }
  }
  const map = new Array(maxScore + 1).fill(null);
  for (const b of blocks) for (let k = b.lo; k <= b.hi; k++) map[k] = (b.e + 0.5) / (b.n + 1);
  for (let k = 0; k <= maxScore; k++) if (map[k] == null) map[k] = k ? map[k - 1] : 0.01;
  return { map, perScore: n.map((c, k) => ({ score: k, n: c, events: e[k], rate: c ? e[k] / c : null, mapped: map[k] })) };
}

/* ---------- decision curve (Vickers and Elkin 2006) ----------
   Net benefit at threshold probability pt: TP/n - FP/n * pt/(1-pt). */
export function decisionCurve(probs, labels, grid) {
  const n = labels.length, prev = labels.reduce((a, b) => a + b, 0) / n;
  return grid.map((pt) => {
    let tp = 0, fp = 0;
    for (let i = 0; i < n; i++) if (probs[i] >= pt) { if (labels[i]) tp++; else fp++; }
    return { pt, nb: tp / n - (fp / n) * (pt / (1 - pt)), all: prev - (1 - prev) * (pt / (1 - pt)) };
  });
}

/* ---------- weighted statistics for the bootstrap ----------
   A resample is a vector of multiplicities w over the test patients.
   With the patients pre-sorted by score once, AUROC, average precision
   and sensitivity are single O(n) sweeps per resample. */
export function sortedOrder(scores) {
  return Int32Array.from(scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]));
}

export function weightedAUC(order, scores, labels, w) {
  let P = 0, N = 0, auc = 0;
  for (let k = 0; k < order.length;) {
    const s = scores[order[k]];
    let gp = 0, gn = 0;
    while (k < order.length && scores[order[k]] === s) { const i = order[k]; if (labels[i]) gp += w[i]; else gn += w[i]; k++; }
    auc += gn * P + 0.5 * gp * gn;
    P += gp; N += gn;
  }
  return P && N ? auc / (P * N) : NaN;
}

export function weightedAP(order, scores, labels, w) {
  let P = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i]) P += w[i];
  let tp = 0, fp = 0, ap = 0, prevR = 0;
  for (let k = 0; k < order.length;) {
    const s = scores[order[k]];
    while (k < order.length && scores[order[k]] === s) { const i = order[k]; if (labels[i]) tp += w[i]; else fp += w[i]; k++; }
    const r = P ? tp / P : 0;
    ap += (r - prevR) * (tp + fp ? tp / (tp + fp) : 1);
    prevR = r;
  }
  return ap;
}

export function weightedBrier(probs, labels, w) {
  let s = 0, n = 0;
  for (let i = 0; i < probs.length; i++) { s += w[i] * (probs[i] - labels[i]) ** 2; n += w[i]; }
  return s / n;
}

export const percentile = (arr, q) => {
  const s = arr.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
