/* ============================================================
   heptapod/topo/tree.js — from the canonical graph to the plan's
   tree of necks plus non-tree edges (3.4.1):

   - canonicalGraph(g): canonical labels, then the graph rewritten in
     canonical positions. Everything downstream reads only this.
   - canonicalTree(cg): breadth-first search over edges in priority
     order (edge class, role rank, canonical label). The search root
     exists only inside the computation.
   - randomTree(cg, rnd): a form synonym: any spanning tree, any root
     that is not a name (P7), any cyclic child order.
   - layoutTree(cg, tree, rnd): the tree plus one echo lobe (P8) per
     non-tree edge, hung from the edge's head and standing for its
     dependent. The layout later turns echoes into kisses wherever it
     can realise them (P10); the rest stay echoes.
   ============================================================ */

import { indexed, nodeKey, edgeClassRank, edgeRoleRank } from './hmr.js';
import { canonicalLabelling } from './canon.js';
import { shuffle } from './rng.js';

export function canonicalGraph(g, stats) {
  const I = indexed(g);
  const labels = I.nodes.map(nodeKey);
  const { pos, cert } = canonicalLabelling({ n: I.n, labels, edges: I.edges }, stats);
  const nodes = new Array(I.n);
  for (let v = 0; v < I.n; v++) nodes[pos[v]] = I.nodes[v];
  const edges = I.edges.map((e) => ({ h: pos[e.h], d: pos[e.d], label: e.label, f: e.f, key: e.key }));
  edges.sort((a, b) => a.h - b.h || a.d - b.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { n: I.n, nodes, edges, cert, labels: nodes.map(nodeKey) };
}

const other = (e, u) => (e.h === u ? e.d : e.h);
const prio = (e, u) => [edgeClassRank(e.label), edgeRoleRank(e.label), other(e, u)];
const cmpPrio = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

function incidence(cg) {
  const inc = Array.from({ length: cg.n }, () => []);
  cg.edges.forEach((e, i) => { inc[e.h].push(i); inc[e.d].push(i); });
  return inc;
}

function defaultRoot(cg) {
  for (let v = 0; v < cg.n; v++) if (cg.nodes[v].k === 'origo') return v;
  for (let v = 0; v < cg.n; v++) if (cg.nodes[v].k !== 'name') return v;
  return 0;
}

/* Orient a set of tree edges from a root: parent, parent edge, children. */
function orient(cg, treeEdges, root) {
  const n = cg.n;
  const adj = Array.from({ length: n }, () => []);
  for (const ei of treeEdges) { const e = cg.edges[ei]; adj[e.h].push(ei); adj[e.d].push(ei); }
  const parent = new Int32Array(n).fill(-1);
  const parentEdge = new Int32Array(n).fill(-1);
  const children = Array.from({ length: n }, () => []);
  const seen = new Uint8Array(n);
  seen[root] = 1;
  const q = [root];
  while (q.length) {
    const u = q.shift();
    for (const ei of adj[u]) {
      const w = other(cg.edges[ei], u);
      if (seen[w]) continue;
      seen[w] = 1; parent[w] = u; parentEdge[w] = ei;
      children[u].push({ child: w, edge: ei });
      q.push(w);
    }
  }
  return { root, parent, parentEdge, children };
}

export function canonicalTree(cg) {
  const n = cg.n;
  const inc = incidence(cg);
  const root = defaultRoot(cg);
  const seen = new Uint8Array(n);
  seen[root] = 1;
  const q = [root];
  const tree = [];
  while (q.length) {
    const u = q.shift();
    const es = inc[u].slice().sort((a, b) => cmpPrio(prio(cg.edges[a], u), prio(cg.edges[b], u)) || a - b);
    for (const ei of es) {
      const w = other(cg.edges[ei], u);
      if (seen[w]) continue;
      seen[w] = 1; tree.push(ei); q.push(w);
    }
  }
  const inTree = new Uint8Array(cg.edges.length);
  for (const ei of tree) inTree[ei] = 1;
  const nonTree = cg.edges.map((_, i) => i).filter((i) => !inTree[i]);
  return { ...orient(cg, tree, root), treeEdges: tree, nonTree, random: false };
}

export function randomTree(cg, rnd) {
  const n = cg.n;
  const order = shuffle(cg.edges.map((_, i) => i), rnd);
  const par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const tree = [];
  for (const ei of order) {
    const e = cg.edges[ei];
    const a = find(e.h), b = find(e.d);
    if (a !== b) { par[a] = b; tree.push(ei); }
  }
  const roots = [];
  for (let v = 0; v < n; v++) if (cg.nodes[v].k !== 'name') roots.push(v);
  const root = roots.length ? roots[Math.floor(rnd() * roots.length)] : 0;
  const inTree = new Uint8Array(cg.edges.length);
  for (const ei of tree) inTree[ei] = 1;
  const nonTree = cg.edges.map((_, i) => i).filter((i) => !inTree[i]);
  return { ...orient(cg, tree, root), treeEdges: tree, nonTree, random: true };
}

/* The layout tree: real lobes 0..n-1, echo lobes n..n+m-1.
   Each lobe records the graph edge of its neck to its layout parent and
   whether it wears that edge's collar (the dependent wears it, P14). */
export function layoutTree(cg, tree, rnd, keepOrder = false) {
  const n = cg.n;
  const N = n + tree.nonTree.length;
  const parent = new Int32Array(N).fill(-1);
  const edge = new Int32Array(N).fill(-1);
  const wearsParentCollar = new Uint8Array(N);
  const echoTarget = new Int32Array(N).fill(-1);
  const children = Array.from({ length: N }, () => []);
  for (let v = 0; v < n; v++) {
    if (v === tree.root) continue;
    parent[v] = tree.parent[v];
    edge[v] = tree.parentEdge[v];
    wearsParentCollar[v] = cg.edges[edge[v]].d === v ? 1 : 0;
  }
  tree.nonTree.forEach((ei, j) => {
    const e = cg.edges[ei];
    const x = n + j;
    parent[x] = e.h; edge[x] = ei; echoTarget[x] = e.d; wearsParentCollar[x] = 1;
  });
  if (keepOrder) {
    // a given plane tree: keep its rotation system (research check 3 rerun)
    for (let v = 0; v < n; v++) for (const c of tree.children[v]) children[v].push(c.child);
    for (let x = n; x < N; x++) children[parent[x]].push(x);
    return { n, N, root: tree.root, parent, edge, wearsParentCollar, echoTarget, children };
  }
  for (let v = 0; v < N; v++) if (parent[v] >= 0) children[parent[v]].push(v);
  const key = (x) => {
    const e = cg.edges[edge[x]];
    return [edgeClassRank(e.label), edgeRoleRank(e.label), x >= n ? 1 : 0, x >= n ? echoTarget[x] : x, edge[x]];
  };
  for (let u = 0; u < N; u++) {
    if (rnd) shuffle(children[u], rnd);
    else children[u].sort((a, b) => cmpPrio(key(a), key(b)));
  }
  return { n, N, root: tree.root, parent, edge, wearsParentCollar, echoTarget, children };
}
