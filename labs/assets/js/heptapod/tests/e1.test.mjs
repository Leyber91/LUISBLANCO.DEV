/* ============================================================
   heptapod/tests/e1.test.mjs — experiment E1 of generation G2: the
   topology kernel and canonical form.

     node labs/assets/js/heptapod/tests/e1.test.mjs          gate size (about 30 s of CPU; the gate allows 120 s wall)
     node labs/assets/js/heptapod/tests/e1.test.mjs --full   the binding size of the plan's pass test
     ... --full --shard 2/4                                   one of 4 reproducible shards of the full run

   Sizes: gate 30 graphs (180 drawings), 30 crops, 30 plane trees for
   check 3 at 1 start per tree and both directions, 2,000 + 500 canon
   pairs; full 10,000 graphs (60,000 drawings), 1,000 crops, 300 trees
   for check 3 at every one of the 4(n-1) starts per tree and both
   directions (the research check's own reading count), 20,000 + 5,000
   canon pairs. Every graph and tree has its own seed, so a shard (graphs
   and trees with index = k mod K) reproduces its part exactly; the
   shards' summary lines add up to the full run. Section 1 is not
   sharded: every shard runs all of it. The last line gives wall and CPU
   seconds, so a slow gate log separates the test's own cost from a busy
   machine.

   What is measured, and how the reader is kept from the answer:
   1. Canonical labelling against brute-force isomorphism on small
      graphs (an independent method), so "same certificate" below means
      "isomorphic", not "the labeller agrees with itself"; again on small
      symmetric graphs, where automorphism pruning fires; and its cost
      on symmetric meaning graphs up to 40 nodes (k identical siblings),
      each under 200 ms of CPU.
   2. The research check 4, ported: disks on a triangular lattice, necks
      on a spanning tree only, then the control with necks everywhere.
   3. The research check 3, rerun from geometry only: random plane trees
      whose lobes all carry one identical label, so lobe identity and the
      pairing of neck sides can come from nothing but geometry. The
      reader gets points, motif symbols and cell positions, after a
      random start shift, reading direction, rotation, scale and mirror.
      The plane tree it recovers (rotation system included) must equal
      the drawn one, and every reading of one tree must give the same
      output. The original check handed its decoder node ids and neck
      pairing; that version is not run and not cited.
   4. The pass test: random HMR graphs (with deliberate label
      collisions), each drawn as its canonical master and in 5 form
      synonyms (random spanning tree, random cyclic child order, random
      subtree reflections). Every drawing: exactly one closed curve and
      no holes; the reader, given only the transformed contour, returns
      a graph isomorphic to g (certificate and an independent triple
      multiset) and the writer's lobe graph. Node-id permutations of g
      give byte-identical masters.
   5. Crops: a disk at a random radius, rotation, scale and reading
      direction, centred on a random lobe for half the crops and at a
      random offset of up to 2 radii from it for the other half, so some
      crops hold no whole lobe at all. The reader gets the pieces of line
      inside the disk and the disk; it must return the induced subgraph
      of the lobes fully inside, with cut necks as open contacts (the
      empty graph when no lobe is whole). On top of these, one sliver
      per 4 crops: a small disk at a lobe's rim that holds a few cells of
      line and usually not one complete motif, which must read as the
      empty graph, not as a refusal.
   Exits 1 on any failure.
   ============================================================ */

import { createHash } from 'node:crypto';
import { mulberry32, randInt, shuffle } from '../topo/rng.js';
import { TOPO } from '../topo/config.js';
import { randomHMR, validateHMR, permuteGraph, nodeKey, edgeKey } from '../topo/hmr.js';
import { canonicalLabelling, isoBruteForce } from '../topo/canon.js';
import { canonicalGraph } from '../topo/tree.js';
import { encode, drawTree, masterBytes } from '../topo/encode.js';
import { decodeContour, decodeCrop } from '../topo/decode.js';
import { cropContour } from '../topo/crop.js';
import { sdfGrid, marchLoops, rasterTopology, signedArea } from '../topo/contour.js';

const FULL = process.argv.includes('--full');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? +process.argv[i + 1] : dflt; };
const SIZE = {
  graphs: arg('--graphs', FULL ? 10000 : 30),
  crops: arg('--crops', FULL ? 1000 : 30),
  trees: arg('--trees', FULL ? 300 : 30),
  treeStarts: FULL ? 'all' : 1,
  canonPairs: arg('--canon-pairs', FULL ? 20000 : 2000),
  symPairs: arg('--sym-pairs', FULL ? 5000 : 500),
};
const SEED = arg('--seed', 20261111);
const SHARD = (() => { const i = process.argv.indexOf('--shard'); if (i < 0) return null; const [k, K] = process.argv[i + 1].split('/').map(Number); return { k, K }; })();
const mine = (i) => !SHARD || i % SHARD.K === SHARD.k;
const seedOf = (salt, i) => (Math.imul((SEED ^ salt) >>> 0, 0x9E3779B1) ^ Math.imul(i + 1, 0x85EBCA6B)) >>> 0;
const T0 = Date.now();
let failures = 0;
const SUM = {};
const failLog = new Map();
const fail = (msg) => {
  failures++;
  const cat = msg.startsWith('graph ') ? 'pass test' : msg.split(':')[0];
  if (!failLog.has(cat)) failLog.set(cat, []);
  if (failLog.get(cat).length < 4) failLog.get(cat).push(msg);
};
let tSec = Date.now(), cSec = process.cpuUsage();
const lap = () => {
  const t = ((Date.now() - tSec) / 1000).toFixed(1), c = process.cpuUsage(cSec);
  tSec = Date.now(); cSec = process.cpuUsage();
  return `${t} s wall, ${((c.user + c.system) / 1e6).toFixed(1)} s CPU`;
};
const line = (s) => console.log(s);
const certOf = (G) => canonicalLabelling(G).cert;

line(`E1 topology kernel (${TOPO.version}), ${FULL ? 'full' : 'gate'} size, seed ${SEED}${SHARD ? `, shard ${SHARD.k}/${SHARD.K}` : ''}`);

/* ---------------- transforms the reader must undo ---------------- */
function transformContour(ct, rnd, opts = {}) {
  const n = ct.pts.length / 2;
  const th = rnd() * 2 * Math.PI, s = 0.5 + 1.5 * rnd();
  const tx = (rnd() - 0.5) * 2000, ty = (rnd() - 0.5) * 2000;
  const mir = opts.mirror !== false && rnd() < 0.25;
  const rev = opts.rev != null ? opts.rev : rnd() < 0.5;
  const shift = opts.shift != null ? opts.shift : Math.floor(rnd() * n);
  const c = Math.cos(th), sn = Math.sin(th);
  const pts = new Float64Array(2 * n), sym = new Array(n), cell = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const src = (((shift + (rev ? -k : k)) % n) + n) % n;
    let x = ct.pts[2 * src], y = ct.pts[2 * src + 1];
    if (mir) x = -x;
    pts[2 * k] = s * (x * c - y * sn) + tx;
    pts[2 * k + 1] = s * (x * sn + y * c) + ty;
    sym[k] = ct.sym[src];
    cell[k] = ct.cell[src];
  }
  return { input: { pts, sym, cell }, mir, rev };
}

/* the reader's input carries no node id: only motif symbols of the code */
const SYM_OK = /^(D:[a-z]+|R:[A-Z]+|F:[a-z]+=[A-Za-z0-9]+|L:[a-z]|M:[a-z-]+|I:[a-z]+=[A-Za-z0-9-]+|X:\d+|S:\d+|Z)$/;
function leakCheck(input) {
  const keys = Object.keys(input).sort().join(',');
  if (keys !== 'cell,pts,sym') return 'reader input has extra fields: ' + keys;
  for (const s of input.sym) if (s !== null && !SYM_OK.test(s)) return 'a symbol outside the code: ' + s;
  return null;
}

function triples(g) {
  const nodes = Object.values(g.nodes).map(nodeKey).sort();
  const tr = g.edges.map(([h, l, d, f]) => nodeKey(g.nodes[h]) + ' > ' + edgeKey(l, f) + ' > ' + nodeKey(g.nodes[d])).sort();
  return nodes.join('\n') + '\n--\n' + tr.join('\n');
}

/* ---------------- 1. canonical labelling against brute force ---------------- */
{
  const rnd = mulberry32(SEED ^ 0x1111);
  const smallGraph = () => {
    const n = randInt(rnd, 1, 6);
    const labels = Array.from({ length: n }, () => (rnd() < 0.6 ? 'a' : 'b'));
    const edges = [];
    const seen = new Set();
    const m = randInt(rnd, 0, Math.min(9, n * (n - 1)));
    for (let t = 0; t < m * 3 && edges.length < m; t++) {
      const h = randInt(rnd, 0, n - 1), d = randInt(rnd, 0, n - 1), key = rnd() < 0.7 ? 'x' : 'y';
      if (h === d || seen.has(h + ',' + d + ',' + key)) continue;
      seen.add(h + ',' + d + ',' + key);
      edges.push({ h, d, key });
    }
    return { n, labels, edges };
  };
  let iso = 0, non = 0, bad = 0;
  for (let t = 0; t < SIZE.canonPairs; t++) {
    const A = smallGraph();
    let B;
    if (rnd() < 0.5) {
      const p = shuffle(Array.from({ length: A.n }, (_, i) => i), rnd);
      const labels = new Array(A.n);
      for (let v = 0; v < A.n; v++) labels[p[v]] = A.labels[v];
      B = { n: A.n, labels, edges: shuffle(A.edges.map((e) => ({ h: p[e.h], d: p[e.d], key: e.key })), rnd) };
    } else {
      B = { n: A.n, labels: A.labels.slice(), edges: A.edges.map((e) => ({ ...e })) };
      const r = rnd();
      if (r < 0.4 && B.edges.length) B.edges[randInt(rnd, 0, B.edges.length - 1)].key = rnd() < 0.5 ? 'x' : 'y';
      else if (r < 0.7 && B.edges.length && B.n > 1) { const e = B.edges[randInt(rnd, 0, B.edges.length - 1)]; const d = randInt(rnd, 0, B.n - 1); if (d !== e.h && !B.edges.some((f) => f.h === e.h && f.d === d && f.key === e.key)) e.d = d; }
      else B.labels[randInt(rnd, 0, B.n - 1)] = rnd() < 0.5 ? 'a' : 'b';
      const p = shuffle(Array.from({ length: B.n }, (_, i) => i), rnd);
      const labels = new Array(B.n);
      for (let v = 0; v < B.n; v++) labels[p[v]] = B.labels[v];
      B = { n: B.n, labels, edges: B.edges.map((e) => ({ h: p[e.h], d: p[e.d], key: e.key })) };
    }
    const same = certOf(A) === certOf(B);
    const truth = isoBruteForce(A, B);
    if (truth) iso++; else non++;
    if (same !== truth) { bad++; fail(`canonical labelling: certificate ${same ? 'equal' : 'different'} but brute force says ${truth ? 'isomorphic' : 'not isomorphic'}`); }
  }
  line(`1. canonical labelling vs brute-force isomorphism: ${SIZE.canonPairs} pairs of 1-6 node labelled digraphs (${iso} isomorphic, ${non} not), ${bad} disagreements [${lap()}]`);

  /* 1b. the same against brute force on symmetric graphs, where the
     search's automorphism pruning and jump-back actually fire: c copies
     of a 1-3 node gadget hung from a hub, sometimes a cycle through the
     copies, then 0-2 random edges; up to 8 nodes. */
  const symGraph = () => {
    const m = randInt(rnd, 1, 3), c = randInt(rnd, 2, m === 1 ? 7 : m === 2 ? 3 : 2);
    const gl = Array.from({ length: m }, () => (rnd() < 0.7 ? 'a' : 'b'));
    const ge = [];
    for (let i = 1; i < m; i++) ge.push({ h: randInt(rnd, 0, i - 1), d: i, key: rnd() < 0.7 ? 'x' : 'y' });
    if (m === 3 && rnd() < 0.4) ge.push({ h: 2, d: 0, key: 'x' });
    const labels = ['h'], edges = [];
    for (let t = 0; t < c; t++) {
      const o = labels.length;
      labels.push(...gl);
      for (const e of ge) edges.push({ h: o + e.h, d: o + e.d, key: e.key });
      edges.push({ h: 0, d: o, key: 'x' });
    }
    const seen = new Set(edges.map((e) => e.h + ',' + e.d + ',' + e.key));
    const add = (h, d, key) => { if (h !== d && !seen.has(h + ',' + d + ',' + key)) { seen.add(h + ',' + d + ',' + key); edges.push({ h, d, key }); } };
    if (rnd() < 0.3) for (let t = 1; t < labels.length; t += m) add(t, t + m < labels.length ? t + m : 1, 'y');
    for (let t = randInt(rnd, 0, 2); t > 0; t--) add(randInt(rnd, 0, labels.length - 1), randInt(rnd, 0, labels.length - 1), 'y');
    return { n: labels.length, labels, edges };
  };
  const permuted = (A) => {
    const p = shuffle(Array.from({ length: A.n }, (_, i) => i), rnd);
    const labels = new Array(A.n);
    for (let v = 0; v < A.n; v++) labels[p[v]] = A.labels[v];
    return { n: A.n, labels, edges: shuffle(A.edges.map((e) => ({ h: p[e.h], d: p[e.d], key: e.key })), rnd) };
  };
  let sIso = 0, sNon = 0, sBad = 0, sAutos = 0;
  for (let t = 0; t < SIZE.symPairs; t++) {
    const A = symGraph();
    let B;
    if (rnd() < 0.5) B = permuted(A);
    else {
      B = { n: A.n, labels: A.labels.slice(), edges: A.edges.map((e) => ({ ...e })) };
      const r = rnd();
      if (r < 0.5) { const e = B.edges[randInt(rnd, 0, B.edges.length - 1)]; e.key = e.key === 'x' ? 'y' : 'x'; }
      else if (r < 0.8) { const e = B.edges[randInt(rnd, 0, B.edges.length - 1)]; const d = randInt(rnd, 0, B.n - 1); if (d !== e.h) e.d = d; }
      else { const v = randInt(rnd, 1, B.n - 1); B.labels[v] = B.labels[v] === 'a' ? 'b' : 'a'; }
      B = permuted(B);
    }
    const st = {};
    const same = canonicalLabelling(A, st).cert === canonicalLabelling(B, st).cert;
    sAutos += st.autos;
    const truth = isoBruteForce(A, B);
    if (truth) sIso++; else sNon++;
    if (same !== truth) { sBad++; fail(`canonical labelling: on a symmetric graph the certificate is ${same ? 'equal' : 'different'} but brute force says ${truth ? 'isomorphic' : 'not isomorphic'}`); }
  }
  line(`   symmetric graphs: ${SIZE.symPairs} pairs of up to 8 nodes built from repeated gadgets (${sIso} isomorphic, ${sNon} not; ${sAutos} automorphisms stored), ${sBad} disagreements [${lap()}]`);

  /* 1c. cost on the symmetric meaning graphs that froze the earlier
     search: k identical participants of one event, k identical two-node
     arms, a junction of k identical conjuncts, k identical entities in a
     same-entity cycle or in mutual pairs, and k identical entities with 4
     identical attributes each, for every k from 4 up to 40 nodes. Each
     canonicalisation must take under 200 ms of CPU time (CPU, not wall,
     so a busy shared machine cannot pass or fail it) and visit at most
     n^2 leaves; node permutations must give the certificate of the
     original, and re-hanging one sibling from another (same labels, same
     edge keys, a different graph) must change it. */
  const anchor = { mode: 'decl', temp: 'before', evid: 'visual' };
  const ent = () => ({ k: 'entity', c: ['PERSON'], f: { person: '3', num: 'sg', quant: 'def' } });
  const att = () => ({ k: 'event', c: ['THING'], f: { aspect: 'state', strength: 'AFF' } });
  const goal = { inv: 'direct' };
  const family = (kind, k) => {
    const nodes = { o: { k: 'origo', f: { speaker: 'visitor' } }, e: { k: 'event', c: ['SEE'], f: { aspect: 'state', strength: 'AFF' } } };
    const edges = [['o', 'anchor', 'e', anchor]];
    const leaf = (i) => { nodes['m' + i] = ent(); edges.push(['e', 'goal', 'm' + i, goal]); };
    if (kind === 'junction') {
      nodes.j = { k: 'junction', f: { op: 'and' } };
      edges.push(['e', 'actor', 'j', goal]);
      for (let i = 0; i < k; i++) { nodes['m' + i] = ent(); edges.push(['j', 'op', 'm' + i, {}]); }
    } else for (let i = 0; i < k; i++) leaf(i);
    if (kind === 'arms') for (let i = 0; i < k; i++) { nodes['a' + i] = att(); edges.push(['m' + i, 'attribution', 'a' + i, { type: 'mod' }]); }
    if (kind === 'nested') for (let i = 0; i < k; i++) for (let t = 0; t < 4; t++) { nodes[`a${i}_${t}`] = att(); edges.push(['m' + i, 'attribution', `a${i}_${t}`, { type: 'mod' }]); }
    if (kind === 'cycle') for (let i = 0; i < k; i++) edges.push(['m' + i, 'same-entity', 'm' + ((i + 1) % k), {}]);
    if (kind === 'mutual') for (let i = 0; i + 1 < k; i += 2) { edges.push(['m' + i, 'same-entity', 'm' + (i + 1), {}]); edges.push(['m' + (i + 1), 'same-entity', 'm' + i, {}]); }
    return { v: 'hmr-0.1', nodes, edges };
  };
  const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
  let cases = 0, slow = 0, leafy = 0, permBad = 0, ctlBad = 0, worstMs = 0, worstCase = '', worstLeaves = 0;
  for (const kind of ['star', 'arms', 'junction', 'cycle', 'mutual', 'nested']) {
    for (let k = 4; ; k++) {
      const g = family(kind, k);
      const n = Object.keys(g.nodes).length;
      if (n > 40) break;
      const v = validateHMR(g);
      if (!v.ok) { fail(`canonical labelling cost: ${kind} k=${k} is not a valid graph: ${v.errors[0]}`); break; }
      cases++;
      const st = {};
      const c0 = cpuMs();
      const cert = canonicalGraph(g, st).cert;
      const ms = cpuMs() - c0;
      if (ms > worstMs) { worstMs = ms; worstCase = `${kind} k=${k} (${n} nodes)`; }
      worstLeaves = Math.max(worstLeaves, st.leaves);
      if (ms >= 200) { slow++; fail(`canonical labelling cost: ${kind} k=${k} (${n} nodes) took ${ms.toFixed(0)} ms of CPU`); }
      if (st.leaves > n * n) { leafy++; fail(`canonical labelling cost: ${kind} k=${k} (${n} nodes) visited ${st.leaves} leaves`); }
      for (let t = 0; t < 2; t++) if (canonicalGraph(permuteGraph(g, rnd)).cert !== cert) { permBad++; fail(`canonical labelling cost: ${kind} k=${k}: a node permutation changed the certificate`); }
      // control: re-hang one sibling from another; the labels and edge keys keep their multisets, the graph changes
      const i = randInt(rnd, 0, k - 1), j = (i + randInt(rnd, 1, k - 1)) % k;
      const h = { v: g.v, nodes: g.nodes, edges: g.edges.map((e) => (e[2] === 'm' + i && !e[0].startsWith('m') ? ['m' + j, e[1], e[2], e[3]] : e)) };
      if (canonicalGraph(permuteGraph(h, rnd)).cert === cert) { ctlBad++; fail(`canonical labelling cost: ${kind} k=${k}: a re-hung sibling kept the certificate`); }
    }
  }
  line(`   symmetric meaning graphs (6 families, k identical siblings, k from 4 up to 40 nodes): ${cases} graphs; worst ${worstMs.toFixed(0)} ms CPU (${worstCase}), most leaves ${worstLeaves}; ${slow} over 200 ms, ${leafy} over n^2 leaves; ${cases * 2 - permBad}/${cases * 2} permutations keep the certificate, ${cases - ctlBad}/${cases} re-hung siblings change it [${lap()}]`);
  Object.assign(SUM, { canonPairs: SIZE.canonPairs, symPairs: SIZE.symPairs, symFamilies: cases, symWorstMs: Math.round(worstMs), symSlow: slow });
}

/* ---------------- 2. research check 4, ported ---------------- */
{
  const rnd = mulberry32(SEED ^ 0x4444);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const lattice = (N, allNecks) => {
    const sites = new Map([['0,0', [0, 0]]]);
    while (sites.size < N) {
      const keys = [...sites.keys()].sort();
      const a = sites.get(keys[Math.floor(rnd() * keys.length)]);
      const d = NB[Math.floor(rnd() * 6)];
      const s = [a[0] + d[0], a[1] + d[1]];
      sites.set(s.join(','), s);
    }
    const S = [...sites.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const pos = S.map((s) => [2 * (s[0] + 0.5 * s[1]), 2 * (Math.sqrt(3) / 2) * s[1]]);
    const idx = new Map(S.map((s, i) => [s.join(','), i]));
    const contacts = [];
    S.forEach((a, i) => { for (const d of NB) { const j = idx.get([a[0] + d[0], a[1] + d[1]].join(',')); if (j !== undefined && i < j) contacts.push([i, j]); } });
    shuffle(contacts, rnd);
    const uf = S.map((_, i) => i);
    const f = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    const tree = [];
    for (const [a, b] of contacts) if (f(a) !== f(b)) { uf[f(a)] = f(b); tree.push([a, b]); }
    const eps = 0.08, neckHalf = 0.35;
    const disks = pos.map(([x, y]) => ({ x, y, r: 1 - eps }));
    const caps = (allNecks ? contacts : tree).map(([a, b]) => {
      const [ax, ay] = pos[a], [bx, by] = pos[b];
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
      return { ax: ax + (L / 2 - 0.4 + neckHalf) * ux, ay: ay + (L / 2 - 0.4 + neckHalf) * uy, bx: ax + (L / 2 + 0.4 - neckHalf) * ux, by: ay + (L / 2 + 0.4 - neckHalf) * uy, hw: neckHalf };
    });
    const G = sdfGrid(disks, caps, 1 / 24);
    const topo = rasterTopology(G);
    const ms = marchLoops(G);
    return { ...topo, loops: ms.loops.length, positive: ms.loops.length === 1 && signedArea(ms.loops[0]) > 0 };
  };
  let ok = 0;
  for (let t = 0; t < 40; t++) {
    const r = lattice(randInt(rnd, 8, 44), false);
    if (r.inside === 1 && r.outside === 1 && r.loops === 1 && r.positive) ok++;
    else fail(`check 4: a tree-necked lattice layout gave inside ${r.inside}, outside ${r.outside}, loops ${r.loops}`);
  }
  const holes = [];
  for (let t = 0; t < 10; t++) { const r = lattice(randInt(rnd, 8, 44), true); holes.push(r.outside - 1); if (r.outside - 1 !== r.loops - 1) fail('check 4 control: raster and contour disagree on holes'); }
  if (holes.some((h) => h < 1)) fail('check 4 control: necks on every contact gave a layout with no hole');
  line(`2. research check 4 ported: tree necks only, ${ok}/40 lattice layouts are one region with no holes (one closed curve by raster and by marching squares); control, necks on every contact: holes per layout = ${holes.join(', ')} [${lap()}]`);
}

/* ---------------- 3. research check 3, rerun from geometry only ---------------- */
function planeCode(rho) {
  const n = rho.length;
  if (n < 2) return '';
  let best = null;
  for (let u = 0; u < n; u++) {
    for (const v of rho[u]) {
      const seen = new Uint8Array(n);
      seen[u] = 1;
      let a = u, b = v, w = '';
      for (let s = 0; s < 2 * (n - 1); s++) {
        w += seen[b] ? '0' : '1';
        seen[b] = 1;
        const nb = rho[b];
        const c = nb[(nb.indexOf(a) + 1) % nb.length];
        a = b; b = c;
      }
      if (best === null || w < best) best = w;
    }
  }
  return best;
}
{
  const node = { k: 'entity', c: ['THING'], f: { num: 'sg', person: '3', quant: 'def' } };
  let readings = 0, wrong = 0, unstable = 0, mirrors = 0, lobesTotal = 0, treesRun = 0;
  for (let t = 0; t < SIZE.trees; t++) {
    if (!mine(t)) continue;
    treesRun++;
    const rnd = mulberry32(seedOf(0x3333, t));
    const n = randInt(rnd, 2, 39);
    const parent = [-1];
    for (let i = 1; i < n; i++) parent.push(randInt(rnd, 0, i - 1));
    const adj = Array.from({ length: n }, () => []);
    for (let c = 1; c < n; c++) { adj[parent[c]].push(c); adj[c].push(parent[c]); }
    for (const a of adj) shuffle(a, rnd);
    const edges = [];
    const parentEdge = new Int32Array(n).fill(-1);
    for (let c = 1; c < n; c++) { parentEdge[c] = edges.length; edges.push({ h: parent[c], d: c, label: 'actor', f: { inv: 'direct' }, key: edgeKey('actor', { inv: 'direct' }) }); }
    const cg = { n, nodes: Array.from({ length: n }, () => node), edges, cert: '', labels: Array(n).fill(nodeKey(node)) };
    const children = adj.map((a, v) => {
      const k = v === 0 ? 0 : (a.indexOf(parent[v]) + 1) % a.length;
      const out = [];
      for (let s = 0; s < a.length; s++) { const w = a[(k + s) % a.length]; if (w !== parent[v]) out.push({ child: w, edge: parentEdge[w] }); }
      return out;
    });
    const tree = { root: 0, parent: Int32Array.from(parent), parentEdge, children, treeEdges: edges.map((_, i) => i), nonTree: [] };
    const dw = drawTree(cg, tree, null, { keepOrder: true });
    if (!dw.ok || !dw.contour || dw.topo.loops !== 1 || dw.topo.inside !== 1 || dw.topo.outside !== 1) { fail(`check 3 rerun: tree ${t} (${n} lobes) did not draw as one closed curve: ${dw.reason || JSON.stringify(dw.topo)}`); continue; }
    lobesTotal += n;
    const truth = planeCode(adj);
    const m = dw.contour.pts.length / 2;
    const starts = SIZE.treeStarts === 'all' ? 4 * (n - 1) : SIZE.treeStarts;
    let first = null;
    for (let s = 0; s < starts; s++) {
      for (const rev of [false, true]) {
        const shift = Math.floor(((s + rnd()) * m) / starts) % m;
        const tr = transformContour(dw.contour, rnd, { shift, rev });
        const leak = leakCheck(tr.input);
        if (leak) { fail('check 3 rerun: ' + leak); continue; }
        if (tr.mir) mirrors++;
        readings++;
        const res = decodeContour(tr.input);
        if (!res.ok) { wrong++; fail(`check 3 rerun: tree ${t} (${n} lobes) refused: ${res.errors.slice(0, 2).join('; ')}`); continue; }
        const code = planeCode(res.rotation);
        if (code !== truth) { wrong++; fail(`check 3 rerun: tree ${t} (${n} lobes) read as a different plane tree`); continue; }
        const out = code + '|' + canonicalGraph(res.graph).cert;
        if (first === null) first = out;
        else if (out !== first) { unstable++; fail(`check 3 rerun: tree ${t} gave different outputs from different starts`); }
      }
    }
  }
  SUM.trees = treesRun; SUM.readings = readings; SUM.treeWrong = wrong + unstable;
  line(`3. research check 3 rerun, geometry only: ${treesRun} random plane trees, 2-39 lobes (${lobesTotal} lobes), every lobe the same label; ${readings} readings (start shift x both directions x random rotation, scale 0.5-2, ${mirrors} mirrored); ${wrong} wrong plane trees, ${unstable} readings that differ from the tree's first [${lap()}]`);
}

/* ---------------- 4 and 5. the pass test and the crops ---------------- */
const MU = 2.0; // crop ambiguity band, in l
function cropTruth(dw, O, R) {
  const L = dw.lobes;
  const inside = L.map((b) => Math.hypot(b.x - O.x, b.y - O.y) + b.r <= R);
  const pointIn = (x, y) => Math.hypot(x - O.x, y - O.y) < R;
  const keyOf = (ei) => edgeKey(dw.cg.edges[ei].label, dw.cg.edges[ei].f);
  const nodes = [], map = new Map();
  L.forEach((b, i) => { if (inside[i]) { map.set(i, nodes.length); nodes.push(dw.lobeGraph.labels[i]); } });
  const edges = dw.lobeGraph.edges.filter((e) => inside[e.h] && inside[e.d]).map((e) => ({ h: map.get(e.h), d: map.get(e.d), key: e.key }));
  const open = [];
  for (const k of dw.necks) {
    if (inside[k.a] === inside[k.b]) continue;
    const x = inside[k.a] ? k.a : k.b;
    open.push({ lobe: map.get(x), kind: 'neck', dep: k.dep === x, key: k.dep === x ? keyOf(k.edge) : '?' });
  }
  for (const k of dw.kisses) {
    if (inside[k.head] === inside[k.dep]) continue;
    const x = inside[k.head] ? k.head : k.dep, y = x === k.head ? k.dep : k.head;
    if (k.dep === x) { open.push({ lobe: map.get(x), kind: 'kiss', dep: true, key: keyOf(k.edge) }); continue; }
    const B = L[y], A = L[x];
    const ux = (A.x - B.x), uy = (A.y - B.y), ul = Math.hypot(ux, uy);
    if (pointIn(B.x + (B.r * ux) / ul, B.y + (B.r * uy) / ul)) open.push({ lobe: map.get(x), kind: 'kiss', dep: false, key: '?' });
  }
  return { nodes, edges, open };
}
function withOpen(G) {
  const labels = G.labels.slice();
  const edges = G.edges.slice();
  for (const o of G.open) {
    const p = labels.length;
    labels.push('open:' + o.kind + ':' + (o.dep ? 'dep' : 'head'));
    edges.push(o.dep ? { h: p, d: o.lobe, key: o.kind + '|' + o.key } : { h: o.lobe, d: p, key: o.kind + '|?' });
  }
  return { n: labels.length, labels, edges };
}
function cropClean(dw, O, R) {
  const hw = TOPO.wn / 2;
  const near = (d) => Math.abs(d - R) < MU;
  for (const b of dw.lobes) {
    const c = Math.hypot(b.x - O.x, b.y - O.y);
    if (near(c + b.r) || near(c - b.r)) return false;
  }
  for (const k of dw.necks) {
    const A = dw.lobes[k.a], B = dw.lobes[k.b];
    const L = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
    for (const [P, sgn] of [[A, 1], [B, -1]]) {
      const along = Math.sqrt(Math.max(0, P.r * P.r - hw * hw));
      for (const side of [-1, 1]) {
        const x = P.x + sgn * along * ux - side * hw * uy, y = P.y + sgn * along * uy + side * hw * ux;
        if (near(Math.hypot(x - O.x, y - O.y))) return false;
      }
    }
  }
  for (const k of dw.kisses) {
    for (const [i, j] of [[k.head, k.dep], [k.dep, k.head]]) {
      const A = dw.lobes[i], B = dw.lobes[j];
      const base = Math.atan2(B.y - A.y, B.x - A.x);
      let mn = Infinity, mx = -Infinity;
      for (let a = -0.6; a <= 0.6; a += 0.02) {
        const x = A.x + A.r * Math.cos(base + a), y = A.y + A.r * Math.sin(base + a);
        if (Math.hypot(x - B.x, y - B.y) - B.r > TOPO.tau + MU) continue;
        const d = Math.hypot(x - O.x, y - O.y);
        mn = Math.min(mn, d); mx = Math.max(mx, d);
      }
      if (mn <= mx && R > mn - MU && R < mx + MU) return false;
    }
  }
  return true;
}
function runCrop(dw, rnd, stats, sliver = false) {
  let O = null, R = 0, tries = 0;
  // half the crops are centred on a lobe; the other half at a random offset of up to 2 of its radii
  // a sliver: a small disk centred 0.5 to 2.5 l outside a lobe's rim, reaching 2 to 5 l inside it
  const offset = !sliver && rnd() < 0.5;
  for (let a = 0; a < 60 && !O; a++) {
    const c = dw.lobes[Math.floor(rnd() * dw.lobes.length)];
    const C = { x: c.x, y: c.y };
    let rLo = c.r + MU + 0.01, rSpan = 0;
    if (sliver) {
      const phi = 2 * Math.PI * rnd(), d = 0.5 + 2 * rnd();
      C.x += (c.r + d) * Math.cos(phi); C.y += (c.r + d) * Math.sin(phi);
      rLo = d + MU + 0.01; rSpan = 3;
    } else {
      if (offset) { const rho = 2 * c.r * Math.sqrt(rnd()), phi = 2 * Math.PI * rnd(); C.x += rho * Math.cos(phi); C.y += rho * Math.sin(phi); }
      const ext = Math.max(...dw.lobes.map((b) => Math.hypot(b.x - C.x, b.y - C.y) + b.r));
      rSpan = Math.max(0, ext - c.r - MU);
    }
    for (let t = 0; t < 40; t++) {
      tries++;
      const r = rLo + rnd() * rSpan;
      if (cropClean(dw, C, r)) { O = C; R = r; break; }
    }
  }
  stats.tries += tries;
  if (!O) { stats.skipped++; return; }
  if (offset) stats.offset++;
  const cut = cropContour(dw.contour, O.x, O.y, R);
  const th = rnd() * 2 * Math.PI, s = 0.5 + 1.5 * rnd(), tx = (rnd() - 0.5) * 2000, ty = (rnd() - 0.5) * 2000;
  const rev = rnd() < 0.5;
  const tf = (x, y) => [s * ((x - O.x) * Math.cos(th) - (y - O.y) * Math.sin(th)) + tx, s * ((x - O.x) * Math.sin(th) + (y - O.y) * Math.cos(th)) + ty];
  let pieces;
  if (cut.closed) {
    // the whole figure is inside: one closed piece, read as a contour
    stats.whole++;
    const tr = transformContour(dw.contour, rnd);
    const res = decodeContour(tr.input);
    const truth = { labels: dw.lobeGraph.labels, edges: dw.lobeGraph.edges, open: [] };
    if (!res.ok || certOf(res.lobeGraph) !== certOf(withOpen({ ...truth, n: truth.labels.length }))) { stats.bad++; fail('crop: a crop holding the whole figure did not read'); }
    stats.n++;
    return;
  }
  pieces = cut.pieces.map((p) => {
    const m = p.pts.length / 2;
    const pts = new Float64Array(2 * m);
    for (let k = 0; k < m; k++) { const [x, y] = tf(p.pts[2 * k], p.pts[2 * k + 1]); pts[2 * k] = x; pts[2 * k + 1] = y; }
    const out = { pts, sym: p.sym.slice(), cell: Int8Array.from(p.cell) };
    if (rev) {
      const q = new Float64Array(2 * m);
      for (let k = 0; k < m; k++) { q[2 * k] = pts[2 * (m - 1 - k)]; q[2 * k + 1] = pts[2 * (m - 1 - k) + 1]; }
      out.pts = q; out.sym.reverse(); out.cell.reverse();
    }
    return out;
  });
  shuffle(pieces, rnd);
  const [cx, cy] = tf(O.x, O.y);
  for (const p of pieces) { const lk = leakCheck(p); if (lk) { fail('crop: ' + lk); return; } }
  const res = decodeCrop({ pieces, circle: { x: cx, y: cy, r: R * s } });
  const truth = cropTruth(dw, O, R);
  stats.n++;
  stats.inside += truth.nodes.length;
  stats.openNecks += truth.open.filter((o) => o.kind === 'neck').length;
  stats.openKisses += truth.open.filter((o) => o.kind === 'kiss').length;
  stats.internalKisses += truth.edges.filter((e) => e.key.startsWith('kiss')).length;
  if (!truth.nodes.length) stats.emptyTruth++;
  if (res.info && res.info.nothingReadable) stats.nothingReadable++;
  const what = sliver ? 'crop (sliver)' : 'crop';
  if (!res.ok) { stats.bad++; fail(`${what}: refused (${res.errors.slice(0, 2).join('; ')}); truth ${truth.nodes.length} whole lobes, ${truth.open.length} open contacts, ${pieces.length} pieces`); return; }
  const want = certOf(withOpen({ labels: truth.nodes, edges: truth.edges, open: truth.open }));
  const got = certOf(withOpen({ labels: res.lobeGraph.labels, edges: res.lobeGraph.edges, open: res.open }));
  if (want !== got) { stats.bad++; fail(`${what}: read ${res.lobeGraph.n} whole lobes and ${res.open.length} open contacts, expected ${truth.nodes.length} and ${truth.open.length}`); }
  else if (!truth.nodes.length) stats.emptyOk++;
}

{
  const st = { graphs: 0, drawings: 0, topoBad: 0, decodeBad: 0, lobeBad: 0, permBad: 0, kisses: 0, echoes: 0, nonTree: 0, lobes: 0, collisionGraphs: 0, collisionLobes: 0,
    mirrors: 0, reversed: 0, distinctMasters: 0, necksLong: 0, necks: 0, rasterChecked: 0, maxLobes: 0, sizes: [0, 0, 0] };
  const cs = { n: 0, bad: 0, skipped: 0, tries: 0, whole: 0, inside: 0, openNecks: 0, openKisses: 0, internalKisses: 0, offset: 0, emptyTruth: 0, emptyOk: 0, nothingReadable: 0, cpu: 0 };
  const ss = { n: 0, bad: 0, skipped: 0, tries: 0, whole: 0, inside: 0, openNecks: 0, openKisses: 0, internalKisses: 0, offset: 0, emptyTruth: 0, emptyOk: 0, nothingReadable: 0 };
  const cropEvery = Math.max(1, Math.floor(SIZE.graphs / SIZE.crops));
  // which graphs get a crop does not depend on the shard count: blocks of 4 consecutive graphs, every cropEvery-th block
  const cropHere = (gi) => Math.floor(gi / 4) % cropEvery === 0;
  for (let gi = 0; gi < SIZE.graphs; gi++) {
    if (!mine(gi)) continue;
    const rnd = mulberry32(seedOf(0x7777, gi));
    const g = randomHMR(rnd);
    const v = validateHMR(g);
    if (!v.ok) { fail('generator: invalid graph: ' + v.errors[0]); continue; }
    st.graphs++;
    const nn = Object.keys(g.nodes).length;
    st.sizes[nn <= 10 ? 0 : nn <= 20 ? 1 : 2]++;
    const gCert = canonicalGraph(g).cert;
    const gTriples = triples(g);
    const drawings = [];
    for (let s = 0; s <= 5; s++) {
      const dw = encode(g, s === 0 ? { raster: true } : { rnd, raster: false });
      st.drawings++;
      if (!dw.ok || !dw.contour) { st.topoBad++; fail(`graph ${gi} drawing ${s}: not drawn: ${dw.reason || JSON.stringify(dw.topo)}`); continue; }
      const t = dw.topo;
      const oneCurve = t.loops === 1 && t.positive && !t.broken && (s > 0 || (t.inside === 1 && t.outside === 1));
      if (s === 0) st.rasterChecked++;
      if (!oneCurve) { st.topoBad++; fail(`graph ${gi} drawing ${s}: topology ${JSON.stringify(t)}`); continue; }
      st.kisses += dw.kisses.length; st.echoes += dw.stats.echoes; st.nonTree += dw.stats.nonTree;
      st.lobes += dw.lobes.length; st.maxLobes = Math.max(st.maxLobes, dw.lobes.length);
      for (const k of dw.necks) { st.necks++; if (k.len > 4 * TOPO.s0) st.necksLong++; }
      if (s === 0) {
        const cnt = new Map();
        for (const lab of dw.lobeGraph.labels) cnt.set(lab, (cnt.get(lab) || 0) + 1);
        let coll = 0;
        for (const c of cnt.values()) if (c > 1) coll += c;
        if (coll) { st.collisionGraphs++; st.collisionLobes += coll; }
      }
      const tr = transformContour(dw.contour, rnd);
      const leak = leakCheck(tr.input);
      if (leak) { fail(`graph ${gi}: ${leak}`); continue; }
      if (tr.mir) st.mirrors++;
      if (tr.rev) st.reversed++;
      const res = decodeContour(tr.input);
      if (!res.ok) { st.decodeBad++; fail(`graph ${gi} drawing ${s} (${nn} nodes): refused: ${res.errors.slice(0, 2).join('; ')}`); continue; }
      if (canonicalGraph(res.graph).cert !== gCert || triples(res.graph) !== gTriples) { st.decodeBad++; fail(`graph ${gi} drawing ${s}: read a different graph`); continue; }
      if (certOf(res.lobeGraph) !== certOf(dw.lobeGraph)) { st.lobeBad++; fail(`graph ${gi} drawing ${s}: lobe graph differs from the writer's`); }
      drawings.push(dw);
    }
    if (drawings.length) {
      const m0 = masterBytes(drawings[0]);
      const distinct = new Set(drawings.map((d) => createHash('sha256').update(masterBytes(d)).digest('hex')));
      st.distinctMasters += distinct.size;
      const gp = permuteGraph(g, rnd);
      const dp = encode(gp, { raster: false });
      if (!dp.ok || !dp.contour || !Buffer.from(masterBytes(dp)).equals(Buffer.from(m0))) { st.permBad++; fail(`graph ${gi}: a node-id permutation changed the master`); }
      if (cropHere(gi)) { const c0 = process.cpuUsage(); runCrop(drawings[Math.floor(rnd() * drawings.length)], rnd, cs); const c1 = process.cpuUsage(c0); cs.cpu += (c1.user + c1.system) / 1e6; }
      // one sliver crop per block of 4 crop graphs, on top of the crops above
      if (cropHere(gi) && gi % 4 === 0) runCrop(drawings[Math.floor(rnd() * drawings.length)], rnd, ss, true);
    }
    if (FULL && st.graphs % 500 === 0) line(`   ... ${gi + 1} graphs, ${failures} failures, ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  }
  const ok = st.drawings - st.topoBad - st.decodeBad;
  line(`4. pass test: ${st.graphs} random HMR graphs (${st.sizes[0]} of 2-10 nodes, ${st.sizes[1]} of 11-20, ${st.sizes[2]} of 21-40), each drawn as its canonical master and 5 form synonyms = ${st.drawings} drawings, ${st.lobes} lobes (largest ${st.maxLobes})`);
  line(`   one closed curve, 0 holes: ${st.drawings - st.topoBad}/${st.drawings} (marching squares on every drawing; raster inside/outside components on all ${st.rasterChecked} masters)`);
  line(`   decoded to g from the transformed contour alone: ${ok}/${st.drawings} (graph certificate and triple multiset), writer's lobe graph recovered: ${ok - st.lobeBad}/${ok}`);
  line(`   transforms: random start shift, ${st.reversed} reversed, ${st.mirrors} mirrored, rotation, scale 0.5-2; distinct masters per graph: ${(st.distinctMasters / Math.max(1, st.graphs)).toFixed(2)} of 6`);
  line(`   label collisions: ${st.collisionGraphs}/${st.graphs} masters have lobes sharing one label (${st.collisionLobes} such lobes), so identity cannot come from labels`);
  line(`   non-tree edges ${st.nonTree}: ${st.kisses} drawn as kisses (${(100 * st.kisses / Math.max(1, st.nonTree)).toFixed(1)}%), ${st.echoes} as echo lobes; necks ${st.necks}, of which ${st.necksLong} stretched beyond ${4 * TOPO.s0} l`);
  line(`   node-id permutations: ${st.graphs - st.permBad}/${st.graphs} byte-identical masters`);
  line(`5. crops: ${cs.n} crops decoded (${cs.n - cs.offset} centred on a lobe, ${cs.offset} offset up to 2 lobe radii; ${cs.whole} held the whole figure), ${cs.n - cs.bad}/${cs.n} read as the induced subgraph of the whole lobes with cut necks open; ${cs.inside} whole lobes, ${cs.openNecks} open necks, ${cs.openKisses} open kisses, ${cs.internalKisses} kisses inside; ${cs.skipped} skipped (no unambiguous radius), ${cs.tries} radius draws for an ambiguity band of ${MU} l [sections 4 and 5: ${lap()}, of which crops ${cs.cpu.toFixed(1)} s CPU]`);
  line(`   crops holding no whole lobe: ${cs.emptyTruth}, read as the empty graph: ${cs.emptyOk}/${cs.emptyTruth} (${cs.nothingReadable} of all crops had no complete motif to read)`);
  line(`   slivers (extra crops: a disk centred 0.5-2.5 l outside a lobe rim, reaching 2-5 l in): ${ss.n - ss.bad}/${ss.n} read right; ${ss.nothingReadable} had no complete motif, ${ss.emptyTruth} held no whole lobe, ${ss.emptyOk} read as the empty graph; ${ss.skipped} skipped`);
  let cropsWanted = 0;
  for (let gi = 0; gi < SIZE.graphs; gi++) if (mine(gi) && cropHere(gi)) cropsWanted++;
  if (cs.n < cropsWanted * 0.9) fail(`crops: only ${cs.n} of about ${cropsWanted} ran`);
  Object.assign(SUM, { graphs: st.graphs, drawings: st.drawings, oneCurve: st.drawings - st.topoBad, decoded: ok, lobeGraphs: ok - st.lobeBad, permOk: st.graphs - st.permBad,
    masters: st.rasterChecked, kisses: st.kisses, echoes: st.echoes, nonTree: st.nonTree, lobes: st.lobes, crops: cs.n, cropsOk: cs.n - cs.bad, cropSkipped: cs.skipped,
    openNecks: cs.openNecks, openKisses: cs.openKisses, cropLobes: cs.inside, cropsOffset: cs.offset, cropsEmptyTruth: cs.emptyTruth, cropsEmptyOk: cs.emptyOk, cropsNothingReadable: cs.nothingReadable,
    slivers: ss.n, sliversOk: ss.n - ss.bad, sliversNothingReadable: ss.nothingReadable, sliversEmptyOk: ss.emptyOk,
    collisionGraphs: st.collisionGraphs, mirrors: st.mirrors, reversed: st.reversed });
}

for (const list of failLog.values()) for (const f of list) line('FAIL ' + f);
SUM.failures = failures;
line('E1-SUMMARY ' + JSON.stringify(SUM));
const secs = ((Date.now() - T0) / 1000).toFixed(1);
const cpu = process.cpuUsage();
const cpuSecs = ((cpu.user + cpu.system) / 1e6).toFixed(1);
line(failures ? `E1: ${failures} FAILURES (${secs} s wall, ${cpuSecs} s CPU)` : `E1: 0 failures (${secs} s wall, ${cpuSecs} s CPU)`);
process.exit(failures ? 1 : 0);
