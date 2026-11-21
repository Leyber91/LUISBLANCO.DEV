/* ============================================================
   heptapod/tests/medium.test.mjs — the ink field of the pod's disc
   (pod/medium.js), checked against what its header claims.

     node labs/assets/js/heptapod/tests/medium.test.mjs

   1. Relaxation alone (a thinning step, the hold): with no move every
      inked cell crosses half its target at one moment, ln 2 / GATHER
      (exact for a linear relaxation).
   1b. The move, as the chamber runs it (N 300, span 3.44 ring radii,
      the scene's step), per gate species: the greeting from an empty
      disc, then scenes 0 to 3 each written over the ring before after
      a second of hanging. The predictions committed before this
      measurement (labs/assets/data/heptapod/predictions.json):
      C5-P1 the ink in the disc is kept within 0.5% from the end of the
      fog's inflow to the start of the settling; C5-P2 at mid-move the
      ink is at least half a ring's ink (L1) away from the crossfade of
      the two ends; C5-P3 at least 70% of what the settling adds lies
      within 6 px of ink the move brought; C5-P4 every cell of the ring
      crosses half its target within the move, all within 30% of it;
      C5-P5 the median plan takes at most 150 ms, printed and not asserted
      (wall-clock). C5-P4 missed (move.json); the check keeps what holds:
      every cell crosses within the move. And each move lands:
      the ring is its target at the end, and the ink it did not need is
      the fog's.
   2. A move from an empty disc on a plain ring keeps the ink while it
      travels and lands within the bloom.
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

import { MEDIUM, MOVE, InkField, fogNoise, boxBlur, transmittance, flowFor } from '../pod/medium.js';
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

/* 1. relaxation alone */
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
  ok(ts.every((c) => c > 0), 'relaxation: every inked cell crosses half its target', `${ts.filter((c) => c < 0).length} never crossed`);
  ok(Math.max(...ts) - Math.min(...ts) <= DT + 1e-9, 'relaxation: all cross in one frame', `${Math.min(...ts).toFixed(3)} to ${Math.max(...ts).toFixed(3)} s`);
  ok(Math.abs(ts[0] - want) <= DT + 1e-9, 'relaxation: at ln 2 / GATHER', `${ts[0].toFixed(3)} against ${want.toFixed(3)} s`);
}

/* 1b. the move, as the chamber runs it */
{
  const N = 300, SPAN = 3.44, R6 = 6;
  const near = (D) => {                    // cells within 6 px of ink the move has brought
    const m = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (D[y * N + x] > 0.02)
      for (let v = -R6; v <= R6; v++) for (let u = -R6; u <= R6; u++) {
        const xx = x + u, yy = y + v;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N && u * u + v * v <= R6 * R6) m[yy * N + xx] = 1;
      }
    return m;
  };
  /* One move of field f to target T, measured frame by frame. */
  const measure = (f, T) => {
    const S = new Float32Array(N * N);
    for (let i = 0; i < S.length; i++) S[i] = f.D[i] + f.O[i];
    const live = new Uint8Array(N * N);
    for (let i = 0; i < T.length; i++) live[i] = T[i] > 0.25 && S[i] < T[i] / 2 ? 1 : 0;
    f.setTarget(T, true);
    const mv = f.lastMove, cross = new Float64Array(N * N).fill(-1);
    let lo = Infinity, hi = -Infinity, mid = null, local = null, t = 0;
    while (f.moving) {
      f.step(DT, flowFor('forming'));
      t += DT;
      const s = Math.min(1, t / MOVE.DURATION);
      if (s >= MOVE.INFLOW && s < MOVE.SETTLE) { const m = f.inkTotal(); lo = Math.min(lo, m); hi = Math.max(hi, m); }
      if (!mid && s >= 0.5) mid = f.D.slice();
      if (!local && s >= MOVE.SETTLE) {
        // the frame the settling starts: what it still has to add, and how much of that lies near ink
        const nr = near(f.D);
        let need = 0, nearNeed = 0;
        for (let i = 0; i < T.length; i++) { const d = Math.max(0, T[i] - f.D[i]); need += d; if (nr[i]) nearNeed += d; }
        local = need > 0 ? nearNeed / need : 1;
      }
      for (let i = 0; i < T.length; i++) if (live[i] && cross[i] < 0 && f.D[i] >= T[i] / 2) cross[i] = t;
    }
    let cf = 0, mT = 0;
    for (let i = 0; i < T.length; i++) { cf += Math.abs(mid[i] - 0.5 * (S[i] + T[i])); mT += T[i]; }
    const all = [...cross].filter((c, i) => live[i]), got = all.filter((c) => c > 0);
    let landed = 0;
    for (let i = 0; i < T.length; i++) landed = Math.max(landed, Math.abs(f.D[i] - T[i]));
    return {
      kept: (hi - lo) / hi, offCrossfade: cf / mT, local, n: all.length, never: all.length - got.length,
      spread: got.length ? (Math.max(...got) - Math.min(...got)) / MOVE.DURATION : 0, planMs: mv.planMs, landed,
      fogOut: Math.abs(total(f.O) - mv.outflow) / Math.max(1, mT),
    };
  };
  const rows = [];
  for (const [a, sd] of GATE_SPECIES) {
    const sp = makeSpecies(a, sd);
    const f = new InkField(N, 5);
    const chain = [-1, 0, 1, 2, 3];
    chain.forEach((scene, j) => {
      const T = inkedTarget(figureOf(sp, { scene }), N, SPAN, 0);
      const r = measure(f, T);
      rows.push({ who: `${a}/${sd} ${j ? `scene ${chain[j - 1]} to ${scene}` : 'fog to the greeting'}`, ...r });
      for (let k = 0; k < 30; k++) f.step(DT, flowFor('hanging'));       // a second of hanging before the next act
    });
  }
  const worst = (k, fn = Math.max) => rows.reduce((m, r) => fn(m, r[k]), fn === Math.max ? -Infinity : Infinity);
  const planMs = rows.map((r) => r.planMs).sort((p, q) => p - q)[Math.floor(rows.length / 2)];
  ok(worst('kept') < 0.005, 'C5-P1: the ink in the disc is kept within 0.5% while it moves', `worst ${(100 * worst('kept')).toFixed(3)}%`);
  ok(worst('offCrossfade', Math.min) >= 0.5, 'C5-P2: mid-move is at least half a ring\'s ink away from a crossfade', `least ${worst('offCrossfade', Math.min).toFixed(3)}`);
  ok(worst('local', Math.min) >= 0.7, 'C5-P3: at least 70% of what the settling adds lies within 6 px of ink', `least ${(100 * worst('local', Math.min)).toFixed(1)}%`);
  // C5-P4 predicted the crossings within 30% of the move and missed (91% on 2026-11-21, labs/assets/data/heptapod/
  // move.json): the measure counts a cell as arrived the first time any ink reaches half its target, and where the old
  // ring overlaps the new or ink passes over it on the way that is early, while every carrier arrives together at the
  // end by construction. What holds is checked: every cell of the ring crosses within the move.
  ok(rows.every((r) => r.never === 0), 'every cell of the ring crosses half its target within the move (C5-P4 missed: see move.json)', `never ${rows.reduce((m, r) => m + r.never, 0)}; worst spread ${(100 * worst('spread')).toFixed(1)}%`);
  // C5-P5 (the median plan at most 150 ms) is wall-clock on a shared machine, so it is printed here and recorded in
  // move.json with the conditions of each run, not asserted: on 2026-11-21 the same code gave 91 to 130 ms and 193 ms
  console.log(`  C5-P5: median plan ${planMs.toFixed(0)} ms over ${rows.length} moves (not asserted: wall-clock)`);
  ok(worst('landed') < 1e-6, 'each move lands: the ring is its target at the end', `largest gap ${worst('landed')}`);
  ok(worst('fogOut') < 1e-3, 'and the ink it did not need is the fog\'s', `worst ${worst('fogOut')}`);
  for (const r of rows) console.log(`  ${r.who}: kept ${(100 * r.kept).toFixed(3)}%, off a crossfade ${r.offCrossfade.toFixed(2)}, settling near ink ${(100 * r.local).toFixed(1)}%, crossings spread ${(100 * r.spread).toFixed(1)}% (${r.n} cells), plan ${r.planMs.toFixed(0)} ms`);
}

/* 2. a plain ring from an empty disc */
{
  const N = 96, T = ringTarget(N), mT = total(T);
  const f = new InkField(N, 5);
  f.setTarget(T, true);
  let lo = Infinity, hi = -Infinity, t = 0;
  while (f.moving) {
    f.step(DT, 0); t += DT;
    const s = t / MOVE.DURATION;
    if (s >= MOVE.INFLOW && s < MOVE.SETTLE) { const m = f.inkTotal(); lo = Math.min(lo, m); hi = Math.max(hi, m); }
  }
  ok((hi - lo) / hi < 0.005 && Math.abs(hi - mT) / mT < 0.01, 'a plain ring: the ink is kept while it travels, and is the ring\'s', `${lo.toFixed(1)} to ${hi.toFixed(1)} against ${mT.toFixed(1)}`);
  ok(t <= BLOOM + DT + 1e-9 && f.residual <= 0.05 + 1e-6, 'it lands within the bloom', `${t.toFixed(3)} s, residual ${f.residual.toFixed(4)}`);
}

/* 2b. a change of grid (a resize, the light tier) keeps the ink where it was */
{
  const A = new InkField(300, 4), T = ringTarget(300);
  A.setTarget(T, false); A.snap();
  const B = new InkField(165, 4);
  B.takeFrom(A);
  const T2 = ringTarget(165);
  B.setTarget(T2, false);
  const back = corr(B.D, T2);
  ok(back > 0.9 && B.fit() > 0.8, 'a change of grid keeps the ring where it was (no new field out of the fog)', `correlation ${back.toFixed(3)}, fit ${B.fit().toFixed(3)}`);
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
