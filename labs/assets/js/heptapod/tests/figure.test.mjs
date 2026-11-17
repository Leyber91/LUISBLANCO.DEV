/* ============================================================
   heptapod/tests/figure.test.mjs — the ring figure (film track F4
   slice 1, topo/figure.js).

     node labs/assets/js/heptapod/tests/figure.test.mjs

   1. trig.js against the engine's sine and cosine; figure.js and
      trig.js call no engine-approximated function (BAR_F G5), read
      from their source with comments removed.
   2. Clauses: on a graph built by hand, a node two clauses reach goes
      to the nearer by role rank; a node reached only by coreference
      joins in the second pass; cross-clause links are counted; two
      speakers are refused.
   3. Gathering: a disk keeps its area; a C whose slot is narrower than
      twice the spreading length closes and its inside fills (one
      disk); a wider slot stays open.
   4. On 30 random texts of 1 to 6 clauses (none may fail): one ink
      component and no enclosed background, counted here on the raster
      by its own flood fill; one gap, in a largest free arc;
      neighbouring clusters at least E1's dMin apart along the ring;
      no cluster deeper than RHO of R; the canonically first clause has
      no fixed angle; gathering grew most clusters and covered rim.
      4b. The clearance where it binds: rings as small as the clusters
      allow keep dMin between neighbours and stay one piece.
   5. The order rule, by an independent method: for texts of 4 and 5
      clauses every cyclic order is placed again here, and none puts
      the centre of mass nearer the ring's centre than the chosen one.
   6. The same text gives the same bytes; a copy with fresh node ids in
      another order gives the same bytes.
   Exits 1 on any failure, and on a run that laid out nothing (G2).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, fnv1a } from '../topo/rng.js';
import { TOPO } from '../topo/config.js';
import { permuteGraph } from '../topo/hmr.js';
import { sinK, cosK, PI } from '../topo/trig.js';
import { FIG, clausesOf, gather, layoutFigure, rasterFigure, randomText } from '../topo/figure.js';

let checks = 0, failures = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.log('FAIL ' + what); } };
const here = path.dirname(fileURLToPath(import.meta.url));

/* 1. trigonometry */
{
  let worst = 0;
  for (let x = -100; x <= 100; x += 0.00731) worst = Math.max(worst, Math.abs(sinK(x) - Math.sin(x)), Math.abs(cosK(x) - Math.cos(x)));
  ok(worst < 1e-13, `trig: worst difference from the engine on [-100, 100] is ${worst}`);
  ok(sinK(0) === 0 && cosK(0) === 1 && Math.abs(sinK(PI / 2) - 1) < 1e-16 && Math.abs(cosK(PI)) - 1 < 1e-16, 'trig: values at 0, pi/2, pi');
  const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b|\*\*/;
  for (const f of ['../topo/figure.js', '../topo/trig.js']) {
    const src = fs.readFileSync(path.join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const m = src.match(banned);
    ok(!m, `G5: ${f} calls ${m ? m[0] : ''}, which each engine approximates its own way`);
  }
}

/* 2. clauses */
{
  const A = (f) => ({ ...f });
  const g = {
    v: 'hmr-0.1',
    nodes: {
      o: { k: 'origo', f: { speaker: 'visitor' } },
      e1: { k: 'event', c: ['GIVE'], f: { aspect: 'state', strength: 'AFF' } },
      e2: { k: 'event', c: ['SEE'], f: { aspect: 'process', strength: 'NEG' } },
      x: { k: 'entity', c: ['PERSON'], f: { person: '3', num: 'sg', quant: 'def' } },
      y: { k: 'entity', c: ['THING'], f: { person: '3', num: 'pl', quant: 'indef' } },
      z: { k: 'entity', c: ['ANIMAL'], f: { person: '3', num: 'sg', quant: 'indef' } },
    },
    edges: [
      ['o', 'anchor', 'e1', A({ mode: 'decl', temp: 'before', evid: 'visual' })],
      ['o', 'anchor', 'e2', A({ mode: 'decl', temp: 'after', evid: 'hearsay' })],
      ['e1', 'actor', 'x', { inv: 'direct' }],      // x: actor of e1 (role rank 0) ...
      ['e2', 'undergoer', 'x', { inv: 'direct' }],  // ... and undergoer of e2 (role rank 1): x goes with e1
      ['e2', 'goal', 'y', { inv: 'direct' }],
      ['y', 'same-entity', 'z', {}],                // z only by coreference: the second pass puts it with y
      ['e1', 'disc', 'e2', { rel: 'contingency' }],
    ],
  };
  const cl = clausesOf(g);
  ok(cl.ok, 'clauses: the hand graph is accepted' + (cl.ok ? '' : ': ' + cl.reason));
  if (cl.ok) {
    const at = (id) => cl.cg.nodes.indexOf(g.nodes[id]);
    ok(cl.mains.length === 2, `clauses: ${cl.mains.length} main clauses, 2 expected`);
    ok(cl.member[at('x')] === cl.member[at('e1')], 'clauses: the shared participant goes to the clause where its role ranks first');
    ok(cl.member[at('y')] === cl.member[at('e2')] && cl.member[at('z')] === cl.member[at('e2')], 'clauses: a node reached only by coreference joins its partner\'s clause');
    ok(cl.cross.length === 2, `clauses: ${cl.cross.length} links between clauses, 2 expected (undergoer, disc)`);
  }
  const two = JSON.parse(JSON.stringify(g));
  two.nodes.o2 = { k: 'origo', f: { speaker: 'far' } };
  two.edges.push(['o', 'address', 'o2', {}]);
  ok(!clausesOf(two).ok, 'clauses: two speakers are refused in slice 1');
}

/* 3. gathering */
{
  const area = (P) => { let a = 0; const m = P.length / 2; for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; } return Math.abs(a) / 2; };
  const disk = (r) => { const n = 400, P = new Float64Array(2 * n); for (let i = 0; i < n; i++) { P[2 * i] = r * cosK((2 * PI * i) / n); P[2 * i + 1] = r * sinK((2 * PI * i) / n); } return P; };
  const cShape = (slot) => { // outer radius 20, inner 12, a slot of width `slot` at the middle radius
    const a = slot / 32, n = 300, P = [];
    for (let i = 0; i <= n; i++) { const t = a + ((2 * PI - 2 * a) * i) / n; P.push(20 * cosK(t), 20 * sinK(t)); }
    for (let i = n; i >= 0; i--) { const t = a + ((2 * PI - 2 * a) * i) / n; P.push(12 * cosK(t), 12 * sinK(t)); }
    return Float64Array.from(P);
  };
  const s = 3;
  const share = (r, full) => (r.ok ? (area(r.pts) / full).toFixed(3) : 'no single outline: ' + r.why);
  const d = gather(disk(10), s);
  ok(d.ok && Math.abs(area(d.pts) / (PI * 100) - 1) < 0.02, `gather: a disk keeps its area (${share(d, PI * 100)})`);
  const narrow = gather(cShape(2), s);
  ok(narrow.ok && Math.abs(area(narrow.pts) / (PI * 400) - 1) < 0.03 && narrow.pockets > 0, `gather: a slot of 2 under a spread of 3 closes and the inside fills (${share(narrow, PI * 400)} of the full disk, ${narrow.ok ? narrow.pockets : 0} nodes filled)`);
  const wide = gather(cShape(9), s);
  ok(wide.ok && area(wide.pts) / (PI * 400) < 0.75 && wide.pockets === 0, `gather: a slot of 9 under a spread of 3 stays open (${share(wide, PI * 400)} of the full disk)`);
}

/* 4. random texts */
const holesOf = (m) => { // background nodes not 4-connected to the border, counted by a flood fill of this test's own
  const { W, H, d } = m, seen = new Uint8Array(W * H), st = [];
  const push = (p) => { if (!d[p] && !seen[p]) { seen[p] = 1; st.push(p); } };
  for (let i = 0; i < W; i++) { push(i); push((H - 1) * W + i); }
  for (let j = 0; j < H; j++) { push(j * W); push(j * W + W - 1); }
  while (st.length) { const p = st.pop(), x = p % W; if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < (H - 1) * W) push(p + W); }
  let n = 0; for (let p = 0; p < W * H; p++) if (!d[p] && !seen[p]) n++; return n;
};
const TAU = 2 * PI, md = (x) => ((x % TAU) + TAU) % TAU;
const figs = [];
{
  let laid = 0, comp1 = 0, noHole = 0, oneGap = 0, gapMax = 0, clear = 0, deep = 0;
  const quads = new Set();
  for (let i = 0; i < 30; i++) {
    const k = 1 + (i % 6), g = randomText(mulberry32(500 + i), k);
    const f = layoutFigure(g);
    if (!f.ok) { ok(false, `text ${i} (${k} clauses) not laid out: ${f.reason}`); continue; }
    laid++;
    figs.push({ g, f, k });
    const m = rasterFigure(f, 500);
    if (m.components === 1) comp1++;
    if (holesOf(m) === 0) noHole++;
    if (f.gap && f.pieces.length === k + 1) oneGap++;
    const big = Math.max(...f.arcsDeg);
    const gapArc = f.order.length === 1 ? big : (() => { // the free arc the gap sits in, found from the angles
      for (let j = 0; j < k; j++) { const a = f.clusters[j], lo = a.theta + a.uMax / f.R; if (md(f.gap.mid - lo) < (f.arcsDeg[j] * PI) / 180) return f.arcsDeg[j]; }
      return -1;
    })();
    if (Math.abs(gapArc - big) < 1e-9) gapMax++;
    let c = true;
    for (let j = 0; j < k && k > 1; j++) { const a = f.clusters[j], b = f.clusters[(j + 1) % k]; if (md(b.theta + b.uMin / f.R - (a.theta + a.uMax / f.R)) * f.R < TOPO.dMin - 1e-6) c = false; }
    if (c) clear++;
    if (f.clusters.every((cl) => cl.D <= FIG.RHO * f.R + 1e-9)) deep++;
    // the canonically first clause: without the turn by the meaning it would always sit at angle 0
    quads.add(Math.floor(md(f.clusters[0].theta) / (PI / 2)));
  }
  ok(laid >= 30, `random texts: ${laid} of 30 laid out (a run that lays out nothing tests nothing)`);
  ok(comp1 === laid, `random texts: ${comp1} of ${laid} rasters are one piece of ink`);
  ok(noHole === laid, `random texts: ${noHole} of ${laid} rasters enclose no background`);
  ok(oneGap === laid, `random texts: ${oneGap} of ${laid} have exactly one gap`);
  ok(gapMax === laid, `random texts: the gap sits in a largest free arc in ${gapMax} of ${laid}`);
  ok(clear === laid, `random texts: neighbours at least dMin apart along the ring in ${clear} of ${laid}`);
  ok(deep === laid, `random texts: no cluster deeper than RHO of R in ${deep} of ${laid}`);
  ok(quads.size >= 3, `random texts: the canonically first clause falls in ${quads.size} of 4 quadrants (the figure is turned by the meaning, so no clause has a fixed place)`);
  const all = figs.flatMap((x) => x.f.clusters);
  const covered = all.filter((c) => c.codeKept < 1 && c.areaGain > 1).length;
  ok(covered >= all.length / 2, `gathering: ${covered} of ${all.length} clusters grew and covered part of their rim`);
}

/* 4b. the clearance, where it binds: a ring as small as the clusters allow (rho far above any depth) */
{
  let tight = 0, clear = 0;
  for (let i = 0; i < 6; i++) {
    const k = 3 + i, f = layoutFigure(randomText(mulberry32(700 + i), k), { rho: 100 });
    if (!f.ok) { ok(false, `tight text ${i}: ${f.reason}`); continue; }
    tight++;
    let c = true;
    for (let j = 0; j < k; j++) { const a = f.clusters[j], b = f.clusters[(j + 1) % k]; if (md(b.theta + b.uMin / f.R - (a.theta + a.uMax / f.R)) * f.R < TOPO.dMin - 1e-6) c = false; }
    if (c && rasterFigure(f, 500).components === 1) clear++;
  }
  ok(tight === 6 && clear === 6, `clearance: ${clear} of ${tight} tight rings keep dMin between neighbours and stay one piece`);
}

/* 5. the order rule, placed again by this test */
{
  let tried = 0, worse = 0;
  const com = (order, C, R) => { // F5's arcs and the angles they give, written out again
    const k = order.length;
    let sumT = 0; for (const c of order) sumT += C[c].uMax - C[c].uMin;
    let wsum = 0; for (let j = 0; j < k; j++) wsum += (C[order[j]].uMax - C[order[j]].uMin) + (C[order[(j + 1) % k]].uMax - C[order[(j + 1) % k]].uMin);
    let th = 0, x = 0, y = 0, M = 0;
    for (let j = 0; j < k; j++) {
      const c = C[order[j]];
      x += c.area * Math.cos(th); y += c.area * Math.sin(th); M += c.area;
      const nx = C[order[(j + 1) % k]];
      const arc = TOPO.dMin + ((2 * PI * R - sumT - k * TOPO.dMin) * ((c.uMax - c.uMin) + (nx.uMax - nx.uMin))) / wsum;
      th += (c.uMax + arc - nx.uMin) / R;
    }
    return Math.sqrt(x * x + y * y) / M;
  };
  for (const { f, k } of figs.filter((x) => x.k === 4 || x.k === 5)) {
    const C = []; for (const c of f.clusters) C[c.cluster] = c;
    const chosen = com(f.order, C, f.R);
    const rest = [...Array(k).keys()].slice(1);
    const perm = (pre, left) => {
      if (!left.length) { tried++; if (com([0, ...pre], C, f.R) < chosen - 1e-9) worse++; return; }
      for (let i = 0; i < left.length; i++) perm([...pre, left[i]], [...left.slice(0, i), ...left.slice(i + 1)]);
    };
    perm([], rest);
  }
  ok(tried > 0 && worse === 0, `order: ${worse} of ${tried} other cyclic orders put the centre of mass nearer the centre than the chosen one`);
}

/* 6. determinism and node ids */
{
  let same = 0, perm = 0;
  for (const { g, f } of figs.slice(0, 10)) {
    const h = (m) => fnv1a(Buffer.from(m.d).toString('latin1'));
    const a = h(rasterFigure(f, 400));
    if (h(rasterFigure(layoutFigure(g), 400)) === a) same++;
    const p = layoutFigure(permuteGraph(g, mulberry32(7)));
    if (p.ok && h(rasterFigure(p, 400)) === a) perm++;
  }
  ok(same === 10, `determinism: ${same} of 10 texts give the same bytes twice`);
  ok(perm === 10, `node ids: ${perm} of 10 texts give the same bytes with fresh ids in another order`);
}

console.log(failures ? `figure: ${failures} of ${checks} checks FAILED` : `figure: ${checks} of ${checks} checks pass (${figs.length} texts laid out)`);
process.exit(failures ? 1 : 0);
