/* ============================================================
   tools/dev/heptapod_predictions.mjs — tests the committed predictions
   of labs/assets/data/heptapod/predictions.json on the film's masters
   and writes each outcome to predictions.results.json (BAR_F G13).

     node tools/dev/heptapod_predictions.mjs <masks dir> [out.json]

   With no out.json it writes labs/assets/data/heptapod/predictions.results.json;
   give one for a run on anything but the film's masters (the synthetic checks).

   F4-P1: the main gap's centre lies in the largest arc between blot
   clusters, in at least two thirds of the masters with a gap of at
   least 1 degree and at least 2 clusters, and more often than a gap
   centre placed uniformly in the arcs between clusters would.
   F4-P2: the carrier's width outside the blots (at most 2.5 times its
   median) falls with angular distance to the nearest cluster: Spearman
   rho negative in at least two thirds of the masters with a cluster,
   median rho below -0.2.
   F4-P3: with the angles of F4-P2 further kept only beyond 25 degrees of
   every gap edge (a gap: a run without carrier of at least 1 degree), the
   absolute Spearman rho of width against arc position counted from the
   main gap's edge ranks at or above the 75th percentile of the same
   statistic over every distinct origin (each kept angle in turn), in at
   least two thirds of the masters with a main gap of at least 1 degree.
   Only numbers are written (research/ip.md rule 6).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { readPBM, ringTable, blotClusters, circularRuns, NA } from '../../labs/assets/js/heptapod/detail/ring.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: heptapod_predictions.mjs <masks dir>'); process.exit(2); }
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../labs/assets/data/heptapod/predictions.results.json');
const PRED = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../labs/assets/data/heptapod/predictions.json'), 'utf8'));

const mod = (x) => ((x % 360) + 360) % 360;
const inArc = (x, lo, hi) => { const L = mod(hi - lo); return mod(x - lo) <= L; };
const ranks = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (x, y) => { const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

const files = fs.readdirSync(dir).filter((f) => f.startsWith('wolfram_') && f.endsWith('.pbm')).sort();
const p1 = [], p2 = [], p3 = [];
// P(X >= k) for X ~ Binomial(n, p): how often chance alone does at least this well
const binomTail = (k, n, p) => { let s = 0, c = 1; for (let i = 0; i <= n; i++) { if (i > 0) c = (c * (n - i + 1)) / i; if (i >= k) s += c * p ** i * (1 - p) ** (n - i); } return s; };
for (const f of files) {
  const name = f.replace(/^wolfram_|1?\.pbm$/g, '');
  const row = ringTable(readPBM(fs.readFileSync(path.join(dir, f))));
  const w = row._w;
  const clusters = blotClusters(row.blots).map(([lo, hi]) => [mod(lo), mod(hi)]).sort((a, b) => a[0] - b[0]);
  // the main gap: the longest run of angles with no carrier
  const gaps = circularRuns(Uint8Array.from(w, (x) => (Number.isNaN(x) ? 1 : 0))).map(([s, e]) => ({ len: ((e - s + 1) * 360) / NA, mid: mod((((s + e) / 2) * 360) / NA) })).sort((a, b) => b.len - a.len);
  if (gaps.length && gaps[0].len >= 1 && clusters.length >= 2) {
    const arcs = clusters.map((c, i) => { const nx = clusters[(i + 1) % clusters.length]; return { lo: c[1], hi: nx[0], len: mod(nx[0] - c[1]) }; });
    const largest = arcs.reduce((a, b) => (b.len > a.len ? b : a));
    const free = arcs.reduce((s, a) => s + a.len, 0);
    p1.push({ master: name, gapDeg: +gaps[0].len.toFixed(1), gapAt: +gaps[0].mid.toFixed(1), clusters: clusters.length, largestArc: [+largest.lo.toFixed(1), +largest.hi.toFixed(1)], hit: inArc(gaps[0].mid, largest.lo, largest.hi), chance: +(largest.len / free).toFixed(3) });
  }
  if (clusters.length >= 1) {
    const med = (() => { const v = [...w].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); return v[v.length >> 1]; })();
    const W = [], D = [];
    for (let a = 0; a < NA; a++) {
      const x = w[a];
      if (Number.isNaN(x) || x > 2.5 * med) continue;
      const deg = (a * 360) / NA;
      if (clusters.some(([lo, hi]) => inArc(deg, lo, hi))) continue;
      const d = Math.min(...clusters.map(([lo, hi]) => Math.min(mod(lo - deg), mod(deg - hi))));
      W.push(x); D.push(d);
    }
    if (W.length > 20) p2.push({ master: name, clusters: clusters.length, angles: W.length, rho: +pearson(ranks(W), ranks(D)).toFixed(3) });
  }
  // F4-P3: does the width trend start at the main gap?
  const gapRuns = circularRuns(Uint8Array.from(w, (x) => (Number.isNaN(x) ? 1 : 0))).filter(([s, e]) => ((e - s + 1) * 360) / NA >= 1);
  if (gapRuns.length) {
    const main = gapRuns.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    const med = (() => { const v = [...w].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); return v[v.length >> 1]; })();
    const edges = gapRuns.flatMap(([s, e]) => [((s % NA) + NA) % NA, ((e % NA) + NA) % NA]);
    const step = 360 / NA, TAPER = 25;
    const kept = [];
    for (let a = 0; a < NA; a++) {
      const x = w[a];
      if (Number.isNaN(x) || x > 2.5 * med) continue;
      const deg = a * step;
      if (clusters.some(([lo, hi]) => inArc(deg, lo, hi))) continue;
      if (edges.some((g) => Math.min(mod((a - g) * step), mod((g - a) * step)) <= TAPER)) continue;
      kept.push(a);
    }
    const m = kept.length;
    if (m > 20) {
      const rW = ranks(kept.map((a) => w[a]));
      // rotation j: the order of the kept angles starting at kept[j]
      const absRho = (j) => Math.abs(pearson(rW, kept.map((_, i) => (i - j + m) % m)));
      const origin = ((main[1] + 1) % NA + NA) % NA; // the first angle after the main gap, counting up
      let j0 = kept.findIndex((a) => a >= origin); if (j0 < 0) j0 = 0;
      const signed = pearson(rW, kept.map((_, i) => (i - j0 + m) % m));
      const at = Math.abs(signed);
      let less = 0; for (let j = 0; j < m; j++) if (j !== j0 && absRho(j) < at) less++;
      const pct = less / (m - 1);
      p3.push({ master: name, gapDeg: +(((main[1] - main[0] + 1) * 360) / NA).toFixed(1), angles: m, rho: +signed.toFixed(3), percentile: +pct.toFixed(3), hit: pct >= 0.75 });
    }
  }
}
const hits = p1.filter((x) => x.hit).length, chance = p1.reduce((s, x) => s + x.chance, 0) / Math.max(1, p1.length);
const neg = p2.filter((x) => x.rho < 0).length, rhos = p2.map((x) => x.rho).sort((a, b) => a - b), medRho = rhos.length ? (rhos[(rhos.length - 1) >> 1] + rhos[rhos.length >> 1]) / 2 : NaN;
const outcome = {
  'F4-P1': { masters: p1.length, hits, share: +(hits / Math.max(1, p1.length)).toFixed(3), chanceShare: +chance.toFixed(3), confirmed: p1.length > 0 && hits >= (2 / 3) * p1.length && hits / p1.length > chance, rows: p1 },
  'F4-P2': { masters: p2.length, negative: neg, medianRho: +medRho.toFixed(3), confirmed: p2.length > 0 && neg >= (2 / 3) * p2.length && medRho < -0.2, rows: p2 },
  'F4-P3': (() => { const h = p3.filter((x) => x.hit).length; return { masters: p3.length, hits: h, share: +(h / Math.max(1, p3.length)).toFixed(3), chancePerMaster: 0.25, chanceOfThisManyHits: +binomTail(h, p3.length, 0.25).toFixed(4), falling: p3.filter((x) => x.rho < 0).length, confirmed: p3.length > 0 && h >= (2 / 3) * p3.length, rows: p3 }; })(),
};
fs.writeFileSync(OUT, JSON.stringify({ about: 'Outcomes of predictions.json, written by tools/dev/heptapod_predictions.mjs on the 18 film masters (numbers only).', predictionsFile: 'predictions.json', ranOn: new Date().toISOString().slice(0, 10), outcome }, null, 1));
for (const [id, o] of Object.entries(outcome)) {
  const p = PRED.predictions.find((x) => x.id === id);
  console.log(`${id} (${p ? p.feature : '?'}): ${o.confirmed ? 'CONFIRMED' : 'MISSED'}`);
}
console.log(`  P1: gap in the largest inter-cluster arc on ${hits} of ${p1.length} masters (${(100 * hits / Math.max(1, p1.length)).toFixed(0)}%); chance ${(100 * chance).toFixed(0)}%`);
for (const r of p1) console.log(`     ${r.master.padEnd(20)} gap ${r.gapDeg} deg at ${r.gapAt}, ${r.clusters} clusters, largest arc ${r.largestArc.join(' to ')}: ${r.hit ? 'in' : 'out'} (chance ${r.chance})`);
console.log(`  P2: rho negative on ${neg} of ${p2.length} masters; median rho ${medRho.toFixed(3)}`);
console.log('     ' + p2.map((r) => `${r.master} ${r.rho}`).join(', '));
const o3 = outcome['F4-P3'];
console.log(`  P3: gap-anchored trend at or above the 75th percentile on ${o3.hits} of ${o3.masters} masters; chance of at least this many ${o3.chanceOfThisManyHits}; width falling from the gap's upper edge on ${o3.falling}`);
for (const r of p3) console.log(`     ${r.master.padEnd(20)} gap ${r.gapDeg} deg, ${r.angles} angles, rho ${r.rho}, percentile ${r.percentile}: ${r.hit ? 'hit' : 'no'}`);
console.log(`wrote ${OUT}`);
