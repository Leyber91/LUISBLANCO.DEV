/* ============================================================
   heptapod/tests/medium.test.mjs — the ink field of the pod's disc
   (pod/medium.js), checked against what its header claims.

     node labs/assets/js/heptapod/tests/medium.test.mjs

   1. Whole at once. With no haze every inked cell crosses half its
      target at one moment, ln 2 / GATHER (exact for a linear
      relaxation). With the haze, the crossings are measured and their
      spread is held under a tenth of the bloom (2.2 s).
   1b. As the chamber runs it: the flow the scene uses while a ring
      gathers (flowFor('forming')), at the scene's field size (N 300,
      span 3.44 ring radii), on the pod's own inked figures (each
      species' greeting, and a ring written over the settled ink of
      another, whose ink then leaves in its own layer): every cell of
      the new ring's ink crosses half its target within the bloom, all
      within a tenth of it.
      (The independent review of 2026-11-17 found 87.9% with the flow
      stirring while the ring gathered.)
   2. Ink is conserved while it gathers: the haze carries the target's
      total, and the relaxation keeps it (no flow: within 0.5%; with the
      forming flow, over the whole bloom: within 5%).
   3. It settles: 95% of the way in 2.2 s (residual at most 0.05 with no
      flow).
   4. It breathes and keeps its shape: at hold with the flow on, the ink
      keeps moving (the mean change of the target's edge cells between
      frames a second apart is above 0.002) while its correlation with
      the target stays above 0.9 for 20 seconds and more than 85% of
      the target's ink is in place at the end (fit()).
   5. The flow is close to divergence-free: a field of uniform ink well
      inside the grid stays uniform within 3% after 3 s of the forming
      flow with no pull to a target.
   6. The transmittance floor: no painted pixel absorbs more than
      1 - T_MIN.
   7. The fog texture tiles: its first and last columns and rows differ
      no more than neighbouring columns do; and it is seeded.
   8. The same seed gives the same ink, byte for byte.
   Exits 1 on any failure, and on a run that checked nothing.
   ============================================================ */

import { MEDIUM, InkField, fogNoise, boxBlur, transmittance, flowFor } from '../pod/medium.js';
import { figureOf, inkedTarget } from '../pod/inked.js';
import { GATE_SPECIES, makeSpecies } from '../pod/species.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => { checks++; if (!cond) { failures++; console.log('FAIL ' + what + (detail ? ' :: ' + detail : '')); } };
const BLOOM = 2.2, DT = 1 / 30;

function ringTarget(N, R = 0.32, w = 0.045, blobs = true) {
  const T = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5, r = Math.hypot(dx, dy);
    let v = Math.abs(r - R) < w / 2 ? 1 : 0;
    if (blobs && Math.hypot(dx - R, dy) < 0.07) v = 1;            // a pool on the ring
    if (blobs && Math.abs(r - R) < w && dy < -0.2) v = Math.max(v, 0.5);  // a lighter stroke
    T[y * N + x] = v;
  }
  return T;
}
const total = (A) => A.reduce((a, b) => a + b, 0);
function corr(A, B) {
  const n = A.length, ma = total(A) / n, mb = total(B) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const a = A[i] - ma, b = B[i] - mb; sab += a * b; saa += a * a; sbb += b * b; }
  return sab / Math.sqrt(saa * sbb);
}

/* 1. whole at once */
{
  const N = 96, T = ringTarget(N);
  const f = new InkField(N, 3);
  f.setTarget(T, false);
  const cross = new Float64Array(N * N).fill(-1);
  for (let t = 0; t < BLOOM; t += DT) {
    f.step(DT, 0);
    for (let i = 0; i < T.length; i++) if (T[i] > 0.25 && cross[i] < 0 && f.D[i] >= T[i] / 2) cross[i] = t + DT;
  }
  const ts = [...cross].filter((c, i) => T[i] > 0.25);
  const want = Math.LN2 / MEDIUM.GATHER;
  ok(ts.every((c) => c > 0), 'no haze: every inked cell crosses half its target', `${ts.filter((c) => c < 0).length} never crossed`);
  ok(Math.max(...ts) - Math.min(...ts) <= DT + 1e-9, 'no haze: all cross in one frame', `${Math.min(...ts).toFixed(3)} to ${Math.max(...ts).toFixed(3)} s`);
  ok(Math.abs(ts[0] - want) <= DT + 1e-9, 'no haze: at ln 2 / GATHER', `${ts[0].toFixed(3)} against ${want.toFixed(3)} s`);

  const g = new InkField(N, 3);
  g.setTarget(T, true);
  cross.fill(-1);
  for (let t = 0; t < BLOOM; t += DT) {
    g.step(DT, 0);
    for (let i = 0; i < T.length; i++) if (T[i] > 0.25 && cross[i] < 0 && g.D[i] >= T[i] / 2) cross[i] = t + DT;
  }
  const hs = [...cross].filter((c, i) => T[i] > 0.25);
  const spread = Math.max(...hs) - Math.min(...hs);
  ok(hs.every((c) => c > 0), 'haze: every inked cell crosses half its target within the bloom');
  ok(spread <= 0.1 * BLOOM, 'haze: the crossings spread over less than a tenth of the bloom', `${spread.toFixed(3)} s of ${BLOOM}`);
  console.log(`  whole at once: no haze ${ts[0].toFixed(3)} s for every cell; with haze ${Math.min(...hs).toFixed(3)} to ${Math.max(...hs).toFixed(3)} s (spread ${(100 * spread / BLOOM).toFixed(1)}% of the bloom)`);
}

/* 1b. as the chamber runs it */
{
  const N = 300, SPAN = 3.44;
  const cross = (f, T, from) => {
    const c = new Float64Array(N * N).fill(-1), live = new Uint8Array(N * N);
    for (let i = 0; i < T.length; i++) live[i] = T[i] > 0.25 && from[i] < T[i] / 2 ? 1 : 0;
    for (let t = 0; t < BLOOM; t += DT) {
      f.step(DT, flowFor('forming'));
      for (let i = 0; i < T.length; i++) if (live[i] && c[i] < 0 && f.D[i] >= T[i] / 2) c[i] = t + DT;
    }
    const all = [...c].filter((v, i) => live[i]), got = all.filter((v) => v > 0);
    return { n: all.length, never: all.length - got.length, spread: got.length ? Math.max(...got) - Math.min(...got) : 0 };
  };
  ok(flowFor('forming') === 0 && flowFor('hanging') === MEDIUM.FLOW_HOLD && flowFor('thinning') === MEDIUM.FLOW_STIR, 'the flow is still while a ring gathers, slow while it hangs, stirred while it thins');
  for (const [a, sd] of GATE_SPECIES) {
    const sp = makeSpecies(a, sd);
    const T = inkedTarget(figureOf(sp, { scene: -1 }), N, SPAN, 0);
    const f = new InkField(N, 5);
    const start = f.D.slice();
    f.setTarget(T, true);
    const r = cross(f, T, start);
    ok(r.never === 0 && r.spread <= 0.1 * BLOOM, `species ${a}/${sd}: the greeting gathers whole at once as the chamber runs it`, `${r.never} of ${r.n} never cross; spread ${(100 * r.spread / BLOOM).toFixed(1)}% of the bloom`);
    // a ring written over the settled ink of the one before
    const T2 = inkedTarget(figureOf(sp, { scene: 5 }), N, SPAN, 0);
    const g = new InkField(N, 6);
    g.setTarget(T, false); g.snap();
    for (let i = 0; i < 30; i++) g.step(DT, flowFor('hanging'));
    const before = g.D.slice();
    g.setTarget(T2, true);
    const r2 = cross(g, T2, before);
    ok(r2.never === 0 && r2.spread <= 0.1 * BLOOM, `species ${a}/${sd}: a ring over the ink of another gathers whole at once`, `${r2.never} of ${r2.n} never cross; spread ${(100 * r2.spread / BLOOM).toFixed(1)}% of the bloom`);
    if (a === GATE_SPECIES[0][0] && sd === GATE_SPECIES[0][1]) console.log(`  as the chamber runs it (N ${N}): greeting ${r.n} cells, spread ${(100 * r.spread / BLOOM).toFixed(1)}%; over another ring ${r2.n} cells, spread ${(100 * r2.spread / BLOOM).toFixed(1)}%`);
  }
}

/* 2. conservation, 3. settling */
{
  const N = 96, T = ringTarget(N), mT = total(T);
  const f = new InkField(N, 5);
  f.setTarget(T, true);
  ok(Math.abs(f.mass() - mT) / mT < 0.01, 'the haze carries the target\'s ink', `${f.mass().toFixed(1)} against ${mT.toFixed(1)}`);
  let worst = 0;
  for (let t = 0; t < BLOOM; t += DT) { f.step(DT, 0); worst = Math.max(worst, Math.abs(f.mass() - mT) / mT); }
  ok(worst < 0.005, 'no flow: ink conserved within 0.5% while it gathers', `${(100 * worst).toFixed(3)}%`);
  ok(f.residual <= 0.05 + 1e-6, 'settled to 95% within the bloom', `residual ${f.residual.toFixed(4)}`);

  const g = new InkField(N, 5);
  g.setTarget(T, true);
  worst = 0;
  for (let t = 0; t < BLOOM; t += DT) { g.step(DT, MEDIUM.FLOW_STIR); worst = Math.max(worst, Math.abs(g.mass() - mT) / mT); }
  ok(worst < 0.05, 'forming flow: ink conserved within 5% over the bloom', `${(100 * worst).toFixed(2)}%`);
  console.log(`  conservation with the forming flow: worst ${(100 * worst).toFixed(2)}% over ${BLOOM} s`);
}

/* 4. breathing at hold */
{
  const N = 128, T = ringTarget(N);
  const f = new InkField(N, 9);
  f.setTarget(T, false); f.snap();
  const edge = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x;
    if (T[i] > 0.5 && (T[i - 1] < 0.5 || T[i + 1] < 0.5 || T[i - N] < 0.5 || T[i + N] < 0.5)) edge.push(i);
  }
  let minCorr = 1, moves = [];
  let prev = f.D.slice();
  for (let s = 1; s <= 20; s++) {
    for (let k = 0; k < 30; k++) f.step(DT, MEDIUM.FLOW_HOLD);
    minCorr = Math.min(minCorr, corr(f.D, T));
    let m = 0; for (const i of edge) m += Math.abs(f.D[i] - prev[i]);
    moves.push(m / edge.length);
    prev = f.D.slice();
  }
  const meanMove = moves.reduce((a, b) => a + b, 0) / moves.length;
  ok(meanMove > 0.002, 'at hold the edges keep moving', `mean change ${meanMove.toFixed(4)} per second`);
  ok(minCorr > 0.9, 'and the ring keeps its shape for 20 s', `least correlation ${minCorr.toFixed(3)}`);
  ok(f.fit() > 0.85, 'and most of its ink stays in place (fit, which the page reports)', `fit ${f.fit().toFixed(3)}`);
  console.log(`  hold: edge change ${meanMove.toFixed(4)} per second, least correlation with the target ${minCorr.toFixed(3)}`);
}

/* 5. divergence */
{
  const N = 96, f = new InkField(N, 11);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f.D[y * N + x] = 1;
  // advection alone: a pull to a target would hide a divergence
  let worst = 0;
  for (let t = 0; t < 3; t += DT) f.advect(DT, MEDIUM.FLOW_STIR);
  for (let y = N / 4; y < (3 * N) / 4; y++) for (let x = N / 4; x < (3 * N) / 4; x++) worst = Math.max(worst, Math.abs(f.D[y * N + x] - 1));
  ok(worst < 0.03, 'the flow neither gathers nor spreads uniform ink', `largest change ${worst.toFixed(4)} after 3 s`);
}

/* 6. the floor */
{
  const N = 32, f = new InkField(N, 1);
  for (let i = 0; i < N * N; i++) f.D[i] = (i % 7) * 3;
  const px = new Uint32Array(N * N);
  f.paint(px, [10, 13, 18]);
  let top = 0; for (const p of px) top = Math.max(top, p >>> 24);
  ok(top <= Math.round(255 * (1 - MEDIUM.T_MIN)), 'no pixel absorbs more than 1 - T_MIN', `alpha ${top}`);
  ok(Math.abs(transmittance(1) - Math.exp(-MEDIUM.ABSORB)) < 1e-12 && transmittance(99) === MEDIUM.T_MIN, 'transmittance is Beer-Lambert above its floor');
}

/* 7. the fog tiles, and is seeded */
{
  const n = 128, a = fogNoise(42, n), b = fogNoise(42, n), c = fogNoise(43, n);
  ok(a.every((v, i) => v === b[i]), 'the fog is the same for the same seed');
  ok(a.some((v, i) => v !== c[i]), 'and another for another seed');
  let seam = 0, inner = 0;
  for (let y = 0; y < n; y++) { seam += Math.abs(a[y * n] - a[y * n + n - 1]); inner += Math.abs(a[y * n + 1] - a[y * n]); }
  ok(seam <= 1.6 * inner + n, 'its first and last columns meet as neighbours do', `seam ${seam}, neighbours ${inner}`);
  let seamR = 0, innerR = 0;
  for (let x = 0; x < n; x++) { seamR += Math.abs(a[x] - a[(n - 1) * n + x]); innerR += Math.abs(a[n + x] - a[x]); }
  ok(seamR <= 1.6 * innerR + n, 'and so do its first and last rows', `seam ${seamR}, neighbours ${innerR}`);
}

/* 8. determinism */
{
  const run = () => { const f = new InkField(80, 77); f.setTarget(ringTarget(80), true); for (let i = 0; i < 40; i++) f.step(DT, MEDIUM.FLOW_STIR); return f.D; };
  const a = run(), b = run();
  ok(a.every((v, i) => v === b[i]), 'the same seed gives the same ink');
  const B = new Float32Array(16 * 16); B[8 * 16 + 8] = 1; boxBlur(B, 16, 2);
  ok(Math.abs(total(B) - 1) < 1e-5, 'the blur keeps a point\'s ink away from the edges');
}

console.log(`medium: ${checks} checks, ${failures} failed`);
if (!checks || failures) process.exit(1);
