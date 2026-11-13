/* ============================================================
   tests/engine.test.mjs — the Dimensions engine, checked without a browser.

     node labs/assets/js/dimensional_mania/tests/engine.test.mjs

   Covers: every catalogue f-vector against Coxeter (1973, Table I) and the
   Euler-Poincare relation; metric values (circumradius/edge, dihedral angle)
   against their closed forms; Hopf fibrations of the 4D polytopes; rotation
   matrices (R·R^T = I, det R = +1, Givens round trip, canonical planes);
   projection of known points; slices against the cube's closed form and the
   named corner-first sequence; the Hopf linking number; the URL state;
   the shadow ledger, its sentence and the Witness quoting the same numbers.
   Exit code 1 on any failure.
   ============================================================ */

import * as P from '../polytopes.js';
import * as L from '../linalg.js';
import * as S from '../slice.js';
import * as J from '../project.js';
import { encodeState, decodeState, encodePose, decodePose } from '../share.js';
import { validateShow, labelLedger, ledgerValue, ledgerLine, witnessHotLine, ambientLines } from '../narrator.js';
import { nextTier } from '../constants.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); }
};
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const randomRotation = (n, turns = 3 * n) => {
  const R = L.eye(n);
  for (let k = 0; k < turns; k++) {
    const i = Math.floor(rnd() * n); let j = Math.floor(rnd() * n); if (j === i) j = (i + 1) % n;
    L.leftGivens(R, n, Math.min(i, j), Math.max(i, j), (rnd() - 0.5) * 6.2);
  }
  return R;
};

/* ---- the catalogue ----
   G1 defect: a rank whose count is the closed formula (ranks 3 to n-3, from 6D up) was compared
   with that same formula, and a polygon's vertex count with itself, so those checks could not
   fail. A formula rank is now marked unchecked and is not counted as a test; a polygon is
   checked against the p of its Schlafli symbol {p}. */
let objects = 0, unchecked = 0, mislabelled = 0, noMetrics = 0;
for (let n = 1; n <= 10; n++) {
  for (const c of P.catalogue(n)) {
    const o = P.build(c.id, n);
    if (o.curved) continue;
    objects++;
    for (const f of o.fvec) {
      if (f.checked !== (f.how !== 'formula')) mislabelled++;
      if (f.checked) check(`f-vector ${c.id} ${n}D rank ${f.k}`, f.count === f.ref, `${f.count} vs ${f.ref}`);
      else unchecked++;
    }
    check(`Euler-Poincare ${c.id} ${n}D`, o.euler.ok, `${o.euler.chi} vs ${o.euler.expected}`);
    if (!o.ref || !o.metrics) { noMetrics++; continue; }
    check(`circumradius/edge ${c.id} ${n}D`, Math.abs(o.metrics.re - o.ref.re) < 1e-9, `${o.metrics.re} vs ${o.ref.re}`);
    if (o.ref.dihedral != null) check(`dihedral ${c.id} ${n}D`, Math.abs(o.metrics.dihedral - o.ref.dihedral) < 1e-7, `${o.metrics.dihedral} vs ${o.ref.dihedral}`);
  }
}
check('catalogue size: 3 families x 9 dims + segment + 2 polygons + 2 solids + 3 cells', objects === 27 + 1 + 2 + 2 + 3, String(objects));
check('f-vector: the only unchecked ranks are the 45 formula ranks (3 to n-3, 6D-10D, 3 families)', unchecked === 45 && mislabelled === 0, `${unchecked} unchecked, ${mislabelled} mislabelled`);
check('metrics: every catalogue polytope, the segment included, has measured and closed-form values', noMetrics === 0, `${noMetrics} without`);
{
  const seg = P.build('cube', 1);
  check('segment: ends at -1 and +1 (circumradius 1), edge 2, so R/e = 1/2', seg.V[0] === -1 && seg.V[1] === 1 && seg.edgeLength === 2 && Math.abs(seg.metrics.re - 0.5) < 1e-12, `${Array.from(seg.V)}, ${seg.edgeLength}, ${seg.metrics.re}`);
  const sidesOK = [['p5', 5], ['p6', 6]].every(([id, p]) => P.build(id, 2).fvec.every((f) => f.ref === p && f.checked));
  check('polygons: vertices and edges are checked against the p of {p}', sidesOK);
}
const counts = { 3: 5, 4: 6, 5: 3, 10: 3 };
for (const n in counts) check(`regular polytopes in ${n}D`, P.catalogue(+n).filter((c) => !c.curved).length === counts[n]);
const t = P.build('torus', 4);
check('Clifford torus grid: V - E + F = 0', t.euler.chi === 0);

/* ---- Hopf fibrations of the 4D polytopes ---- */
for (const [id, k, m] of [['c24', 4, 6], ['c600', 12, 10], ['c120', 60, 10], ['cube', 4, 4], ['cross', 2, 4]]) {
  const f = P.fibration(P.build(id, 4));
  check(`fibration ${id}: ${k} circles of ${m}`, f.count === k && f.perCircle === m, `${f.count} x ${f.perCircle}`);
  // the flow exp(tG) carries every vertex along its own circle
  const o = P.build(id, 4);
  const E = L.expSkew(f.G, 4, 0.37);
  let worst = 0;
  for (let v = 0; v < o.nv; v++) {
    const x = L.apply(E, 4, o.V.subarray(v * 4, v * 4 + 4));
    const c = f.circles[f.group[v]];
    const px = x[0] * c.x[0] + x[1] * c.x[1] + x[2] * c.x[2] + x[3] * c.x[3];
    const py = x[0] * c.y[0] + x[1] * c.y[1] + x[2] * c.y[2] + x[3] * c.y[3];
    worst = Math.max(worst, Math.abs(px * px + py * py - 1));
  }
  check(`flow stays on its fibre ${id}`, worst < 1e-9, worst.toExponential(2));
}

/* ---- rotations ---- */
for (let n = 2; n <= 10; n++) {
  let orth = 0, det = 0, trip = 0;
  for (let k = 0; k < 120; k++) {
    const R = randomRotation(n);
    const c = L.rotationChecks(R, n);
    orth = Math.max(orth, c.err); det = Math.max(det, Math.abs(c.det - 1));
    const R2 = L.givensCompose(L.givensDecompose(R, n), n);
    for (let i = 0; i < n * n; i++) trip = Math.max(trip, Math.abs(R[i] - R2[i]));
  }
  check(`R·R^T = I in ${n}D`, orth < 1e-12, orth.toExponential(2));
  check(`det R = +1 in ${n}D`, det < 1e-12, det.toExponential(2));
  check(`Givens round trip in ${n}D`, trip < 1e-12, trip.toExponential(2));
  const enc = decodePose(encodePose(randomRotation(n), n), n);
  check(`URL pose decodes to a rotation in ${n}D`, L.rotationChecks(enc, n).err < 1e-12);
}
{
  const R = L.eye(6);
  L.leftGivens(R, 6, 0, 1, 0.4); L.leftGivens(R, 6, 2, 5, 1.1); L.leftGivens(R, 6, 3, 4, 2.0);
  const cp = L.canonicalPlanes(R, 6).map((p) => [Math.round(p.angle * 1e6) / 1e6, p.i, p.j]);
  check('canonical planes of a 6D rotation', JSON.stringify(cp) === JSON.stringify([[2, 3, 4], [1.1, 2, 5], [0.4, 0, 1]]), JSON.stringify(cp));
  const sp = L.generatorSpeeds([{ i: 0, j: 1, omega: 0.3 }, { i: 0, j: 3, omega: 0.5 }, { i: 1, j: 3, omega: 0.2 }, { i: 2, j: 3, omega: 0.4 }], 4);
  const A = L.generatorOf([{ i: 0, j: 1, omega: 0.3 }, { i: 0, j: 3, omega: 0.5 }, { i: 1, j: 3, omega: 0.2 }, { i: 2, j: 3, omega: 0.4 }], 4);
  const E = L.expSkew(A, 4, 1);
  const ang = L.poseAngles(E, 4);
  check('generator speeds = angles of exp(A)', Math.abs(ang[0] - sp[0]) < 1e-9 && Math.abs(ang[1] - sp[1]) < 1e-9, `${ang} vs ${sp}`);
}

/* ---- projections of known points ---- */
{
  const out = new Float32Array(3), st = new Float64Array(4);
  J.projectAll(Float64Array.from([1, 0, 0, 0.5]), 4, 1, 'persp', 2, out, st);
  check('perspective: (1,0,0,0.5), D = 2 -> x = 4/3', Math.abs(out[0] - 4 / 3) < 1e-6 && Math.abs(st[3] - 1 / 3) < 1e-9);
  J.projectAll(Float64Array.from([0.6, 0, 0.8, 0]), 4, 1, 'stereo', 0, out);
  check('stereographic: a point on the equator stays put', Math.abs(out[0] - 0.6) < 1e-6 && Math.abs(out[2] - 0.8) < 1e-6);
  J.projectAll(Float64Array.from([0, 0, 0.6, 0.8]), 4, 1, 'stereo', 0, out);
  check('stereographic: (0,0,0.6,0.8) -> z = 3', Math.abs(out[2] - 3) < 1e-5);
  J.projectAll(Float64Array.from([0.3, -0.2, 0.1, 0.9, 0.4]), 5, 1, 'ortho', 0, out);
  check('orthographic drops the hidden axes', Math.abs(out[0] - 0.3) < 1e-6 && Math.abs(out[1] + 0.2) < 1e-6 && Math.abs(out[2] - 0.1) < 1e-6);
}

/* ---- the shadow ledger and the Witness read one report ----
   G1 defect: on the identity-pose 4D simplex the ledger printed (1 + max|s - 1|)
   = 1.29x "on its nearest corner" while the Witness said 1.12x; the 0.294 came
   from the far corner, drawn 0.71x. Both now quote shadowLedger(). */
{
  const nums = (text, re) => [...String(text || '').matchAll(re)].map((m) => m[1]);
  const TIMES = /(\d+\.\d\d)×/g, SAYS = /(\d+\.\d\d) times/g, AT = /= ([−+]\d+\.\d\d)/g;
  const label = (o) => (v) => `vertex ${v + 1} of ${o.nv}`;
  const report = (o, X, n, mode, D) => {
    const ext = J.axisExtremes(n), st = new Float64Array(n), out = new Float32Array(o.nv * 3);
    J.projectAll(X, n, o.nv, mode, D, out, st, null, ext);
    return { R: labelLedger(J.shadowLedger(ext, n, mode), label(o)), st };
  };

  // the rater's case, D = 2.4 (the page's default fold distance)
  const o = P.build('simplex', 4), D = 2.4;
  const X = S.turn(o, L.eye(4));
  const { R, st } = report(o, X, 4, 'persp', D);
  let wmin = Infinity, wmax = -Infinity;
  for (let v = 0; v < o.nv; v++) { wmin = Math.min(wmin, X[v * 4 + 3]); wmax = Math.max(wmax, X[v * 4 + 3]); }
  const a = R.entry(3);
  check('ledger far end is D/(D - w_min)', Math.abs(a.far.s - D / (D - wmin)) < 1e-12 && a.far.w === wmin, `${a.far.s} at ${a.far.w}`);
  check('ledger near end is D/(D - w_max)', Math.abs(a.near.s - D / (D - wmax)) < 1e-12 && a.near.w === wmax, `${a.near.s} at ${a.near.w}`);
  check('ledger distortion equals the stress bar', a.dev === st[3] && a.worst === 'far', `${a.dev} vs ${st[3]}, ${a.worst}`);
  const row = ledgerValue(a, 'persp'), line = ledgerLine(R), wit = witnessHotLine({ n: 4, proj: 'persp', hot: R });
  check('simplex 4D: the ledger row prints the far corner, 0.71x', row === '0.71×', row);
  check('simplex 4D: the ledger sentence says 0.71x then 1.12x', nums(line, TIMES).join() === '0.71,1.12', line);
  check('simplex 4D: the Witness says 0.71 then 1.12 times', nums(wit, SAYS).join() === '0.71,1.12', wit);
  check('simplex 4D: both name the same coordinates, W = -1.00 and +0.25', nums(line, AT).join() === '−1.00,+0.25' && nums(wit, AT).join() === nums(line, AT).join(), `${line} | ${wit}`);
  check('simplex 4D: no 1.29 anywhere', !/1\.29/.test(row + line + wit));
  const ctx = { n: 4, obj: o, proj: 'persp', hot: R, spin: [], speeds: [], slice: null, check: null, link: null, flow: null, hidden: 1 };
  check('the Witness ambient line is the one built from the report', ambientLines(ctx)[0] === wit, ambientLines(ctx)[0]);

  // every dimension, every projection, random poses and fold distances
  let frames = 0, badHot = 0, badDev = 0, badDirect = 0, badRow = 0, badAgree = 0, badAt = 0, badLabel = 0;
  for (let n = 4; n <= 10; n++) {
    for (const id of ['simplex', 'cube', 'cross']) {
      const ob = P.build(id, n);
      for (const mode of n === 4 ? ['persp', 'ortho', 'stereo'] : ['persp', 'ortho']) {
        for (let k = 0; k < 12; k++) {
          const Dk = 1.35 + rnd() * 4.65;
          const Xk = S.turn(ob, randomRotation(n));
          const { R: Rk, st: sk } = report(ob, Xk, n, mode, Dk);
          frames++;
          const axes = mode === 'stereo' ? [3] : Array.from({ length: n - 3 }, (_, i) => 3 + i);
          const top = Math.max(...axes.map((d) => sk[d]));
          if (Rk.hot < 0 || Rk.value !== top || sk[Rk.hot] !== top) badHot++;
          if (Rk.axes.some((e) => e.dev !== sk[e.axis])) badDev++;
          // the top axis divides the raw coordinate: its ends are checkable by hand
          const e = Rk.entry(n - 1 === 3 || mode !== 'stereo' ? n - 1 : 3);
          let lo = Infinity, hi = -Infinity;
          for (let v = 0; v < ob.nv; v++) { const w = Xk[v * n + n - 1]; lo = Math.min(lo, w); hi = Math.max(hi, w); }
          const f = (w) => (mode === 'ortho' ? w : mode === 'stereo' ? 1 / Math.max(1 - w, 0.035) : Dk / Math.max(Dk - w, 0.3));
          if (Math.abs(e.far.w - lo) > 1e-12 || Math.abs(e.near.w - hi) > 1e-12 || Math.abs(e.far.s - f(lo)) > 1e-9 || Math.abs(e.near.s - f(hi)) > 1e-9) badDirect++;
          const h = Rk.entry(Rk.hot);
          const rowK = ledgerValue(h, mode), lineK = ledgerLine(Rk);
          if (mode === 'ortho') {
            const at = nums(lineK, AT)[0];
            if (!at || at.slice(1) !== rowK) badRow++;
          } else {
            if (nums(lineK, TIMES)[0] + '×' !== rowK) badRow++;
          }
          if (mode === 'persp') {
            const w = witnessHotLine({ n, proj: 'persp', hot: Rk });
            if (!w || nums(w, SAYS).join() !== nums(lineK, TIMES).join()) badAgree++;
            if (nums(w, AT).join() !== nums(lineK, AT).join()) badAt++;
            const [k1, k2] = h.worst === 'far' ? ['far', 'near'] : ['near', 'far'];
            if (!w.includes(Rk.labels[k1]) || (h.far.v !== h.near.v && !w.includes(Rk.labels[k2]))) badLabel++;
          }
        }
      }
    }
  }
  check(`ledger: hot axis is the largest over every hidden axis (${frames} frames, 4D-10D)`, badHot === 0, `${badHot} bad`);
  check('ledger: every axis distortion equals the stress bar', badDev === 0, `${badDev} bad`);
  check('ledger: the top axis ends match the projection formula by hand', badDirect === 0, `${badDirect} bad`);
  check('ledger: the hot row and the ledger sentence print the same number', badRow === 0, `${badRow} bad`);
  check('ledger and Witness quote the same two factors in perspective', badAgree === 0, `${badAgree} bad`);
  check('ledger and Witness quote the same coordinates in perspective', badAt === 0, `${badAt} bad`);
  check('the Witness names the vertices at both ends', badLabel === 0, `${badLabel} bad`);
}

/* ---- the matrix prints its numbers at every n ----
   G1 defect: MatrixView set nums = n <= 6, so 7D-10D showed shaded cells only. */
{
  const { matrixLayout, matrixEntry } = await import('../panels.js');
  const charPx = 0.6 * 9; // IBM Plex Mono advance, 600/1000 em, at the 9 px matrix font
  let worstFit = Infinity, badEntry = 0, badOver = 0;
  for (let n = 1; n <= 10; n++) {
    for (const box of [160, 252, 290, 336]) { // the floor, the mid-width rail, the desk rail, a 390 px phone
      const m = matrixLayout(box, n);
      worstFit = Math.min(worstFit, m.cell - 2 - 5 * charPx); // a 5-character entry inside the cell's fill
      if (m.over !== (m.pad + m.cell * n + 2 > box) || m.W < m.pad + m.cell * n + 2) badOver++;
    }
    const R = randomRotation(n);
    for (let i = 0; i < n * n; i++) {
      const t = matrixEntry(R[i]);
      if (!(t === '0' || /^−?\.\d{3}$/.test(t) || /^−?1\.000$/.test(t))) badEntry++;
      if (t !== '0' && Math.abs(Number(t.replace('−', '-')) - R[i]) > 5e-4 + 1e-12) badEntry++;
    }
  }
  check('matrix: a 3-decimal entry fits its cell at every n, 1D-10D', worstFit >= 0, `${worstFit.toFixed(2)} px`);
  check('matrix: wider than its box means it scrolls, never shrinks', badOver === 0, `${badOver} bad`);
  check('matrix: every entry printed to 3 decimals and within 5e-4 of R', badEntry === 0, `${badEntry} bad`);
  check('matrix: 10D fits a 390 px phone without scrolling, scrolls on the 290 px desk rail', !matrixLayout(336, 10).over && matrixLayout(290, 10).over);

  // no entry is read clipped: a column the gutter or the box edge would cut is not drawn, and
  // every column is whole at some scroll offset (the desk rail at 10D showed "1.00" for "1.000")
  const { matrixColumns, MATRIX_CELL, MATRIX_PAD } = await import('../panels.js');
  let cut = 0, unreachable = 0, lost = 0;
  for (let n = 1; n <= 10; n++) {
    for (const box of [160, 252, 290, 336]) {
      const m = matrixLayout(box, n), max = m.W - box, seen = new Set();
      for (let sx = 0; sx <= max; sx++) {
        const { first, end } = matrixColumns(box, n, sx);
        for (let j = first; j < end; j++) {
          seen.add(j);
          const left = MATRIX_PAD + MATRIX_CELL * j, right = left + MATRIX_CELL;
          if (left < sx + (sx > 0 ? MATRIX_PAD : 0) || right > sx + box) cut++;
        }
        if (end - first < 1) lost++;
      }
      if (seen.size !== n) unreachable++;
      if (!m.over && (matrixColumns(box, n, 0).first !== 0 || matrixColumns(box, n, 0).end !== n)) lost++;
    }
  }
  check('matrix: no column is drawn cut at either edge of its box', cut === 0, `${cut} cut`);
  check('matrix: every column is whole at some scroll offset, and a matrix that fits shows all of them', unreachable === 0 && lost === 0, `${unreachable} unreachable, ${lost} lost`);
  const d10 = matrixColumns(290, 10, 0), d10end = matrixColumns(290, 10, matrixLayout(290, 10).W - 290);
  check('matrix: 10D on the desk rail shows X to S at rest and Z to Q scrolled to the end', d10.first === 0 && d10.end === 8 && d10end.first === 2 && d10end.end === 10, JSON.stringify([d10, d10end]));
}

/* ---- slices ---- */
{
  const cube4 = P.build('cube', 4);
  const id = S.slice(cube4, S.turn(cube4, L.eye(4)), 0.2);
  check('tesseract cell first: a unit cube', id.name.startsWith('hexahedron') && Math.abs(id.measure - 1) < 1e-12);
  const R = L.alignRotation([1, 1, 1, 1], 3, 4);
  const X = S.turn(cube4, R);
  const seq = [-0.85, -0.4, 0].map((h) => S.slice(cube4, X, h).name);
  check('tesseract corner first: tetrahedron, truncated tetrahedron, octahedron', seq.join('|') === 'tetrahedron|truncated tetrahedron|octahedron', seq.join('|'));
  check('corner-first central cut has volume 4/3', Math.abs(S.slice(cube4, X, 0).measure - 4 / 3) < 1e-12);
  for (const n of [2, 3, 4]) {
    const o = P.build('cube', n);
    let worst = 0;
    for (let k = 0; k < 25; k++) {
      const Rn = randomRotation(n);
      const p = S.profile(o, S.turn(o, Rn), Rn, 61);
      worst = Math.max(worst, p.maxDev);
    }
    check(`${n}-cube cuts match the closed form`, worst < 1e-9, worst.toExponential(2));
  }
  const c24 = P.build('c24', 4);
  check('24-cell equatorial cut is a cuboctahedron', S.slice(c24, S.turn(c24, L.eye(4)), 0).name === 'cuboctahedron');
}

/* ---- the Hopf linking number ---- */
{
  const o = P.build('hopf', 4);
  const A = o.fibres.find((f) => f.ring === 2), B = o.fibres.find((f) => f.ring === 1);
  const pos = new Float32Array(o.nv * 3);
  J.projectAll(o.V, 4, o.nv, 'stereo', 0, pos);
  const lk = P.linkingNumber(pos.slice(A.start * 3, (A.start + A.count) * 3), pos.slice(B.start * 3, (B.start + B.count) * 3));
  check('two Hopf fibres link once', Math.abs(Math.abs(lk) - 1) < 0.01, lk.toFixed(4));
  check('a ring of at least 24 fibres', o.fibres.filter((f) => f.ring === 2).length >= 24);
}

/* ---- state ---- */
{
  const st = { n: 6, obj: 'cube', view: 'both', proj: 'ortho', preset: 'iso', plane: [0, 3], h: 0.123, sweep: true, trails: false, D: 2.4, speed: 1.25 };
  const back = decodeState('?' + encodeState(st, randomRotation(6)));
  const same = ['n', 'obj', 'view', 'proj', 'preset', 'h', 'sweep', 'trails', 'D', 'speed'].every((k) => back[k] === st[k]) && back.plane.join() === st.plane.join();
  check('URL state round trip', same, JSON.stringify(back));
  check('model show is validated', JSON.stringify(validateShow({ n: 4, obj: 'c120', proj: 'stereo', view: 'bogus', sweep: 'yes' }, { n: 3 })) === '{"n":4,"obj":"c120","proj":"stereo"}');
}

/* ---- isoclinic presets turn every disjoint plane ---- */
{
  const { PRESETS } = await import('../constants.js');
  for (let n = 4; n <= 10; n++) {
    const sp = PRESETS.iso.build(n, [0, 3]);
    const axes = new Set(sp.flatMap((p) => [p.i, p.j]));
    const speeds = L.generatorSpeeds(sp, n);
    check(`isoclinic in ${n}D: ${Math.floor(n / 2)} disjoint planes at one speed`, sp.length === Math.floor(n / 2) && axes.size === 2 * sp.length && speeds.every((x) => Math.abs(x - speeds[0]) < 1e-12));
  }
  const R = L.eye(4); L.leftGivens(R, 4, 0, 3, Math.PI / 6); L.leftGivens(R, 4, 1, 2, (5 * Math.PI) / 18);
  const cp = L.canonicalPlanes(R, 4).map((p) => `${((p.angle * 180) / Math.PI).toFixed(1)}:${p.i}${p.j}`).sort();
  check('X–W 30 and Y–Z 50 read back as exactly those planes', cp.join() === '30.0:03,50.0:12', cp.join());
}

/* ---- the cube's cut profiles, n = 2..10, against two closed forms ---- */
{
  const ih = (x, n) => { let s = 0; for (let k = 0; k <= n; k++) { const z = x - k; if (z > 0) s += (k % 2 ? -1 : 1) * binom(n, k) * z ** (n - 1); } let f = 1; for (let i = 2; i < n; i++) f *= i; return s / f; };
  function binom(a, b) { let c = 1; for (let i = 0; i < b; i++) c = (c * (a - i)) / (i + 1); return c; }
  let worstA = 0, worstV = 0;
  for (let n = 2; n <= 10; n++) {
    const L2 = 2; // the cube [-1, 1]^n
    for (const h of [-0.7, -0.2, 0, 0.35, 0.9]) {
      const u = Array.from({ length: n }, (_, k) => (k === n - 1 ? 1 : 0));
      worstA = Math.max(worstA, Math.abs(S.cubeSection(u, L2, h) - 2 ** (n - 1)));
      const v = Array(n).fill(1 / Math.sqrt(n));
      const ref = 2 ** (n - 1) * Math.sqrt(n) * ih((n + h * Math.sqrt(n)) / 2, n);
      worstV = Math.max(worstV, Math.abs(S.cubeSection(v, L2, h) - ref));
    }
  }
  check('axis-aligned cut of [-1,1]^n is 2^(n-1), n = 2..10', worstA < 1e-6, worstA.toExponential(2));
  check('vertex-first cut matches 2^(n-1)·sqrt(n)·IrwinHall, n = 2..10', worstV < 1e-6, worstV.toExponential(2));
}

/* ---- the tier ladder ---- */
check('tier: slow frames step full -> lean', nextTier('auto', 'full', 20, 5000, 0) === 'lean');
check('tier: then lean -> lite -> min, and min stays', nextTier('auto', 'lean', 20, 8000, 5000) === 'lite' && nextTier('auto', 'lite', 20, 11000, 8000) === 'min' && nextTier('auto', 'min', 20, 14000, 11000) === null);
check('tier: no step in the first 2 s or within 2 s of the last', nextTier('auto', 'full', 20, 1500, 0) === null && nextTier('auto', 'lean', 20, 6000, 5000) === null);
check('tier: fast frames or a chosen tier never step', nextTier('auto', 'full', 58, 5000, 0) === null && nextTier('full', 'full', 10, 5000, 0) === null);

console.log(`engine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
