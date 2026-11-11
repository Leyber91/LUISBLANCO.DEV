/* ============================================================
   heptapod/topo/encode.js — the writer of E1: meaning graph to one
   closed contour carrying the rim code (plan 3.1 layers 1 to 4, with
   the E1 layout standing in for E3's solve).

     encode(g)                 the canonical master
     encode(g, { rnd })        a form synonym: random spanning tree,
                               random cyclic child order, random
                               subtree reflections

   The result keeps the writer's own records (lobes, necks, kisses) for
   tests and the inspector; the decoder is given only `contour`.
   ============================================================ */

import { TOPO, neckZoneHalf } from './config.js';
import { nodeTokens, collarTokens, edgeKey } from './hmr.js';
import { canonicalGraph, canonicalTree, randomTree, layoutTree as buildLayoutTree } from './tree.js';
import { estimateRadius, allocateRim, lobeKey } from './rim.js';
import { layoutTree, verifyMargins, echoesToKisses, contactsOf, anchorOf } from './layout.js';
import { sdfGrid, marchLoops, rasterTopology, resampleLoop, attributeRim, signedArea } from './contour.js';

export function encode(g, opts = {}) {
  const cstats = {};
  const cg = canonicalGraph(g, cstats);
  const rnd = opts.rnd || null;
  const tree = rnd ? randomTree(cg, rnd) : canonicalTree(cg);
  const dw = drawTree(cg, tree, rnd, opts);
  if (dw.stats) dw.stats.leaves = cstats.leaves || 0;
  return dw;
}

/* Draw a given spanning tree of a canonical graph. `opts.keepOrder`
   keeps the tree's cyclic child order exactly (a given plane tree). */
export function drawTree(cg, tree, rnd, opts = {}) {
  const t0 = Date.now();
  const lt = buildLayoutTree(cg, tree, rnd, !!opts.keepOrder);
  const { n, N } = lt;
  const reflect = new Uint8Array(N);
  if (rnd) for (let v = 0; v < N; v++) if (rnd() < (opts.reflectP ?? 0.3)) reflect[v] = 1;

  const collarCache = new Map();
  const collarOf = (ei) => {
    if (!collarCache.has(ei)) collarCache.set(ei, collarTokens(cg.edges[ei].label, cg.edges[ei].f));
    return collarCache.get(ei);
  };
  const base = new Array(N);
  const isTarget = new Uint8Array(n);
  for (let v = 0; v < n; v++) base[v] = nodeTokens(cg.nodes[v]);
  for (let x = n; x < N; x++) {
    const t = cg.nodes[lt.echoTarget[x]];
    base[x] = ['D:echo', 'D:' + t.k, ...(t.c ? [...t.c].sort().map((rr) => 'R:' + rr) : [])];
    isTarget[lt.echoTarget[x]] = 1;
  }
  let xTok = null; // final echo indices, set after kisses are decided
  const own = (v) => {
    if (xTok) return xTok[v] ? [...base[v], xTok[v]] : base[v];
    return v >= n || isTarget[v] ? [...base[v], 'X:?'] : base[v];
  };

  /* radii from the code each lobe must carry, with every potential kiss */
  const r = new Float64Array(N);
  const zn = neckZoneHalf();
  for (let v = 0; v < N; v++) {
    const cs = [];
    if (lt.parent[v] >= 0) cs.push({ zh: zn, collar: lt.wearsParentCollar[v] ? collarOf(lt.edge[v]) : null });
    for (const c of lt.children[v]) cs.push({ zh: zn, collar: lt.wearsParentCollar[c] ? null : collarOf(lt.edge[c]) });
    if (v < n) for (let x = n; x < N; x++) if (lt.echoTarget[x] === v) cs.push({ zh: TOPO.zKiss, collar: collarOf(lt.edge[x]) });
    r[v] = estimateRadius(own(v).length, cs);
  }

  const geo = { lt, x: new Float64Array(N), y: new Float64Array(N), r, dead: new Uint8Array(N), kisses: [], collarOf, own };
  let relaxations = 0;
  let lay = null;
  for (;;) {
    lay = layoutTree(geo, reflect);
    if (!lay.ok) return { ok: false, reason: 'layout: ' + lay.reason, cg };
    const vm = verifyMargins(geo);
    if (vm.ok) break;
    const rims = vm.bad.filter((b) => b[0] === 'rim').map((b) => b[1]);
    if (rims.length < vm.bad.length || relaxations >= TOPO.maxRelax) return { ok: false, reason: 'layout margins: ' + JSON.stringify(vm.bad.slice(0, 3)), cg };
    for (const v of rims) r[v] *= TOPO.relaxRadius;
    relaxations++;
  }
  const kiss = echoesToKisses(geo, reflect);

  /* echo indices: one per target that still has an echo, numbered in echo order */
  xTok = new Array(N).fill(null);
  const idx = new Map();
  for (let x = n; x < N; x++) {
    if (geo.dead[x]) continue;
    const t = lt.echoTarget[x];
    if (!idx.has(t)) idx.set(t, idx.size);
    xTok[x] = 'X:' + idx.get(t);
    xTok[t] = 'X:' + idx.get(t);
  }

  /* final rim allocation */
  const lobes = [];
  const lobeOf = new Int32Array(N).fill(-1);
  for (let v = 0; v < N; v++) {
    if (geo.dead[v]) continue;
    const al = allocateRim(r[v], own(v), contactsOf(geo, v), anchorOf(geo, v));
    if (!al.ok) return { ok: false, reason: `rim of lobe ${v}: ${al.reason}`, cg };
    lobeOf[v] = lobes.length;
    lobes.push({ v, node: v < n ? v : -1, echoOf: v >= n ? lt.echoTarget[v] : -1, x: geo.x[v], y: geo.y[v], r: r[v], placements: al.placements, C: al.C, tokens: own(v) });
  }

  /* the region and its boundary */
  const disks = lobes.map((L) => ({ x: L.x, y: L.y, r: L.r }));
  const caps = [];
  const necks = [];
  for (let v = 0; v < N; v++) {
    if (geo.dead[v] || lt.parent[v] < 0) continue;
    const p = lt.parent[v];
    const dx = geo.x[v] - geo.x[p], dy = geo.y[v] - geo.y[p];
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    caps.push({ ax: geo.x[p] + (r[p] - TOPO.wn) * ux, ay: geo.y[p] + (r[p] - TOPO.wn) * uy, bx: geo.x[v] - (r[v] - TOPO.wn) * ux, by: geo.y[v] - (r[v] - TOPO.wn) * uy, hw: TOPO.wn / 2 });
    const dep = lt.wearsParentCollar[v] ? v : p;
    necks.push({ a: lobeOf[p], b: lobeOf[v], dep: lobeOf[dep], head: lobeOf[dep === v ? p : v], edge: lt.edge[v], len: L - r[p] - r[v] });
  }
  const kisses = geo.kisses.map((k) => ({ head: lobeOf[k.h], dep: lobeOf[k.d], edge: k.edge, gap: Math.hypot(geo.x[k.h] - geo.x[k.d], geo.y[k.h] - geo.y[k.d]) - r[k.h] - r[k.d] }));
  const grid = sdfGrid(disks, caps, TOPO.grid);
  const ms = marchLoops(grid);
  const topo = { loops: ms.loops.length, broken: ms.broken, positive: ms.loops.length === 1 && signedArea(ms.loops[0]) > 0, grid: [grid.W, grid.H] };
  if (opts.raster !== false) Object.assign(topo, rasterTopology(grid));
  let contour = null;
  if (ms.loops.length === 1) {
    const pts = resampleLoop(ms.loops[0], TOPO.ds);
    const at = attributeRim(pts, lobes);
    contour = { pts, sym: at.sym, cell: at.cell };
  }

  /* the writer's lobe graph: what a reader of this drawing must recover */
  const lobeGraph = {
    n: lobes.length,
    labels: lobes.map((L) => lobeKey(L.tokens)),
    edges: [
      ...necks.map((k) => ({ h: k.head, d: k.dep, key: 'neck|' + edgeKey(cg.edges[k.edge].label, cg.edges[k.edge].f) })),
      ...kisses.map((k) => ({ h: k.head, d: k.dep, key: 'kiss|' + edgeKey(cg.edges[k.edge].label, cg.edges[k.edge].f) })),
    ],
  };

  return {
    ok: true, cg, lt, lobes, necks, kisses, caps, contour, topo, lobeGraph,
    stats: { relaxations, pushes: lay.pushes, kissesMade: kiss.made, kissSibling: kiss.sibling, kissRotated: kiss.rotated, echoes: kiss.kept, nonTree: N - n, leaves: 0, ms: Date.now() - t0 },
  };
}

/* The master as bytes: contour coordinates (float64), then per point the
   symbol id and cell, then the symbol table. Equal bytes, equal master. */
export function masterBytes(dw) {
  const { pts, sym, cell } = dw.contour;
  const table = [...new Set(sym.filter((s) => s !== null))].sort();
  const id = new Map(table.map((s, i) => [s, i]));
  const m = pts.length / 2;
  const head = new Float64Array(pts);
  const sid = new Int32Array(m);
  for (let k = 0; k < m; k++) sid[k] = sym[k] === null ? -1 : id.get(sym[k]);
  const text = new TextEncoder().encode(table.join('\n'));
  const out = new Uint8Array(head.byteLength + sid.byteLength + cell.byteLength + text.byteLength);
  let o = 0;
  out.set(new Uint8Array(head.buffer), o); o += head.byteLength;
  out.set(new Uint8Array(sid.buffer), o); o += sid.byteLength;
  out.set(new Uint8Array(cell.buffer, cell.byteOffset, cell.byteLength), o); o += cell.byteLength;
  out.set(text, o);
  return out;
}
