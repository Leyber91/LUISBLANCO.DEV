/* ============================================================
   heptapod/topo/canon.js — canonical labelling of a labelled,
   directed multigraph: 1-dimensional Weisfeiler-Leman colour
   refinement, then individualisation-refinement until every node has
   its own colour, keeping the leaf with the least certificate. This is
   the search nauty made standard (McKay 1981; McKay and Piperno 2014;
   cited from memory), with automorphism pruning of the branches.

   Why it is needed: a key built from concept ids and features is not
   isomorphism-invariant ("the man saw a man" gives two nodes one key),
   and a tie broken by node id leaks the input's word order into the
   drawing. With this labelling, every downstream step sees only the
   canonical graph, so renaming the input's nodes changes nothing.

   Input: { n, labels: string[n], edges: [{ h, d, key }] }.
   Output: { pos: Int32Array (node -> canonical position), cert: string }.
   Two graphs are isomorphic as labelled digraphs iff their certs match.
   ============================================================ */

function cmpArr(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/* Rank nodes by signature: equal signatures share a colour, colours
   numbered by sorted signature, so numbering depends on structure only. */
function rankBy(n, sig) {
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => cmpArr(sig[a], sig[b]));
  const col = new Int32Array(n);
  let c = 0;
  for (let t = 0; t < n; t++) {
    if (t > 0 && cmpArr(sig[idx[t - 1]], sig[idx[t]]) !== 0) c++;
    col[idx[t]] = c;
  }
  return { col, k: n ? c + 1 : 0 };
}

export function prepare(G) {
  const { n, labels, edges } = G;
  const labelList = [...new Set(labels)].sort();
  const keyList = [...new Set(edges.map((e) => e.key))].sort();
  const lab = labels.map((s) => labelList.indexOf(s));
  const ek = edges.map((e) => keyList.indexOf(e.key));
  const out = Array.from({ length: n }, () => []);
  const inn = Array.from({ length: n }, () => []);
  edges.forEach((e, i) => { out[e.h].push(i); inn[e.d].push(i); });
  return { n, labels, edges, lab, ek, out, inn, E: keyList.length };
}

function refine(P, col0) {
  const { n, edges, ek, out, inn, E } = P;
  let col = col0;
  let k = 0;
  for (let i = 0; i < n; i++) if (col[i] + 1 > k) k = col[i] + 1;
  for (;;) {
    const sig = new Array(n);
    for (let v = 0; v < n; v++) {
      const items = [];
      for (const e of out[v]) items.push((ek[e] * n + col[edges[e].d]) * 2);
      for (const e of inn[v]) items.push((ek[e] * n + col[edges[e].h]) * 2 + 1);
      items.sort((a, b) => a - b);
      sig[v] = [col[v], ...items];
    }
    const r = rankBy(n, sig);
    if (r.k === k) return { col, k };
    col = r.col; k = r.k;
    void E;
  }
}

function individualise(P, col, v) {
  const sig = new Array(P.n);
  for (let x = 0; x < P.n; x++) sig[x] = [col[x] * 2 + (x === v ? 0 : 1)];
  return rankBy(P.n, sig).col;
}

/* The certificate of a discrete colouring: the graph written in
   canonical positions, with labels as strings so certs compare across graphs. */
function certificate(P, pos) {
  const { n, labels, edges } = P;
  const inv = new Array(n);
  for (let v = 0; v < n; v++) inv[pos[v]] = v;
  const nodePart = inv.map((v) => labels[v]).join('\u0001');
  const es = edges.map((e) => [pos[e.h], pos[e.d], e.key]);
  es.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  return n + '\u0002' + nodePart + '\u0002' + es.map((e) => e[0] + ',' + e[1] + ',' + e[2]).join('\u0001');
}

/* The search tree: a node is a sequence of individualised vertices (its
   path) and the equitable colouring refinement gives it; a leaf is a
   node whose colouring is discrete, read as a labelling. The canonical
   labelling is the leaf with the least certificate. Three facts keep the
   search polynomial on the symmetric graphs language makes (an event
   with many identical participants, a junction of identical conjuncts):

   1. A leaf whose certificate equals that of the first leaf (or of the
      best so far) gives an automorphism gamma = ref^-1 * leaf. Gamma fixes
      every vertex on the common prefix of the two paths, because the
      colouring is ordered: a singleton cell keeps its position in every
      leaf below it.
   2. Jump-back (McKay 1981): the subtree below the common node that holds
      this leaf is gamma's image of the subtree that holds ref, which was
      already searched, so the search returns straight to the common node.
   3. Orbit pruning: at a node with path p, a candidate in the same orbit
      as one already tried, under the automorphisms found so far that fix
      p pointwise, roots an isomorphic subtree and is skipped. An
      automorphism is stored only if it joins two such orbits for the
      prefix it fixes, so the store stays near n generators instead of
      growing with the leaves (an earlier cap of 64 stored ones made a star
      of 14 identical leaves take 28 s; see tests/e1.test.mjs section 1).

   None of this changes the answer: every pruned leaf carries a
   certificate already seen or one no smaller than the best, so the least
   certificate, and with it the canonical graph, is the one the full
   search would find. */
export function canonicalLabelling(G, stats) {
  const P = prepare(G);
  const { n } = P;
  if (n === 0) return { pos: new Int32Array(0), cert: '0' };
  let best = null;   // { cert, pos, path }
  let first = null;
  const autos = [];
  let leaves = 0, nodes = 0, jumps = 0, offered = 0;

  // orbits of the group generated by the stored automorphisms fixing every vertex of path
  const orbitsFixing = (path, len = path.length) => {
    const par = Int32Array.from({ length: n }, (_, i) => i);
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (const g of autos) {
      let fixes = true;
      for (let i = 0; i < len; i++) if (g[path[i]] !== path[i]) { fixes = false; break; }
      if (!fixes) continue;
      for (let x = 0; x < n; x++) { const a = find(x), b = find(g[x]); if (a !== b) par[a] = b; }
    }
    return find;
  };

  const commonPrefix = (a, b) => {
    let j = 0;
    while (j < a.length && j < b.length && a[j] === b[j]) j++;
    return j;
  };

  /* Returns -1 when the subtree was searched to its end, or a depth d when
     the search must return to the node whose path has length d. */
  const search = (col0, path) => {
    nodes++;
    const { col, k } = refine(P, col0);
    if (k === n) {
      leaves++;
      const cert = certificate(P, col);
      if (!first) { first = best = { cert, pos: col, path }; return -1; }
      if (cert < best.cert) { best = { cert, pos: col, path }; return -1; }
      const ref = cert === first.cert ? first : cert === best.cert ? best : null;
      if (!ref) return -1;
      // gamma maps v to the node holding v's position in ref
      const inv = new Int32Array(n);
      for (let v = 0; v < n; v++) inv[ref.pos[v]] = v;
      const g = new Int32Array(n);
      for (let v = 0; v < n; v++) g[v] = inv[col[v]];
      const j = commonPrefix(path, ref.path);
      offered++;
      const find = orbitsFixing(ref.path, j);
      for (let x = 0; x < n; x++) if (find(x) !== find(g[x])) { autos.push(g); break; }
      jumps++;
      return j;
    }
    // target cell: the lowest colour with more than one node
    const size = new Int32Array(k);
    for (let v = 0; v < n; v++) size[col[v]]++;
    let c = 0;
    while (size[c] < 2) c++;
    const cell = [];
    for (let v = 0; v < n; v++) if (col[v] === c) cell.push(v);
    const tried = [];
    let find = null, known = -1;
    for (const w of cell) {
      if (tried.length) {
        if (known !== autos.length) { find = orbitsFixing(path); known = autos.length; }
        const fw = find(w);
        if (tried.some((t) => find(t) === fw)) continue;
      }
      tried.push(w);
      const r = search(individualise(P, col, w), path.concat(w));
      if (r >= 0 && r < path.length) return r;
    }
    return -1;
  };

  const init = rankBy(n, P.lab.map((x) => [x])).col;
  search(init, []);
  if (stats) {
    for (const [key, v] of [['leaves', leaves], ['nodes', nodes], ['autos', autos.length], ['offered', offered], ['jumps', jumps]]) stats[key] = (stats[key] || 0) + v;
  }
  return { pos: best.pos, cert: best.cert };
}

/* Brute-force isomorphism of small labelled digraphs, for testing the
   labelling against an independent method. */
export function isoBruteForce(A, B) {
  if (A.n !== B.n || A.edges.length !== B.edges.length) return false;
  const n = A.n;
  const ekey = (e, m) => m[e.h] + ',' + m[e.d] + ',' + e.key;
  const bset = new Map();
  for (const e of B.edges) { const k = e.h + ',' + e.d + ',' + e.key; bset.set(k, (bset.get(k) || 0) + 1); }
  const m = new Int32Array(n).fill(-1);
  const used = new Uint8Array(n);
  const rec = (v) => {
    if (v === n) {
      const cnt = new Map();
      for (const e of A.edges) { const k = ekey(e, m); cnt.set(k, (cnt.get(k) || 0) + 1); }
      if (cnt.size !== bset.size) return false;
      for (const [k, c] of cnt) if (bset.get(k) !== c) return false;
      return true;
    }
    for (let w = 0; w < n; w++) {
      if (used[w] || A.labels[v] !== B.labels[w]) continue;
      used[w] = 1; m[v] = w;
      if (rec(v + 1)) return true;
      used[w] = 0; m[v] = -1;
    }
    return false;
  };
  return rec(0);
}
