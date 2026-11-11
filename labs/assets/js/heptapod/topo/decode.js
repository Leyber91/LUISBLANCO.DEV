/* ============================================================
   heptapod/topo/decode.js — the vector reader of E1: one closed
   contour (or a disk crop of one) back to the meaning graph, from
   geometry and the rim code alone (plan 3.7, steps 3 to 7).

   Input: points along the line, and at each point the motif symbol and
   cell position the rim carries there (or nothing: neck sides, contact
   zones). The reader is never told which points belong to which lobe,
   which contact points pair up, where the curve starts, which way it
   runs, its scale, or whether the image is mirrored. It infers all of
   these:
   - orientation from the signed area, mirror from the motif direction
     (a mirrored rim reads its cells backwards), scale from the median
     motif length;
   - contacts as self-approaches narrower than tau that are pinches,
     i.e. isolated basins of the distance between two stretches of line,
     never attached to the curve's own diagonal (a notch beside a neck
     is attached and is not a contact);
   - a contact whose chord midpoint lies inside the region is a neck,
     outside a kiss;
   - lobes as the faces of the neck chords (the research check 3's face
     tracing, now with the pairing measured from geometry);
   - each lobe's code from the motifs on its own rim, the dependent of a
     contact as the lobe wearing its collar, and the per-lobe order-free
     checksum, which refuses a wrong grouping instead of guessing.
   ============================================================ */

import { TOPO } from './config.js';
import { motifIndex, lobeKey } from './rim.js';
import { NODE_CLASSES, validateHMR, HMR_VERSION } from './hmr.js';

const K = TOPO.K;

/* ---------------- loops ---------------- */
function makeLoop(xs, ys, sym, cell, crop) {
  const n = xs.length;
  const S = new Float64Array(n);
  for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  const L = S[n - 1] + Math.hypot(xs[0] - xs[n - 1], ys[0] - ys[n - 1]);
  return { n, x: xs, y: ys, sym, cell, crop, S, L };
}

function signedArea(xs, ys) {
  let s = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += xs[i] * ys[j] - xs[j] * ys[i]; }
  return s / 2;
}

/* +1 if the cells mostly run forward along the given order, -1 backward. */
function motifDirection(seqs) {
  let fwd = 0, bwd = 0;
  for (const { sym, cell } of seqs) {
    for (let i = 1; i < sym.length; i++) {
      if (sym[i] === null || sym[i] !== sym[i - 1]) continue;
      if (cell[i] === cell[i - 1] + 1) fwd++;
      else if (cell[i] === cell[i - 1] - 1) bwd++;
    }
  }
  return fwd >= bwd ? 1 : -1;
}

/* Cell length: median motif span plus one sampling step, over 9. */
function estimateCell(seqs) {
  const spans = [], steps = [];
  for (const { x, y, sym, cell } of seqs) {
    let a = -1, len = 0, ok = false;
    for (let i = 0; i < sym.length; i++) {
      if (i > 0) steps.push(Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]));
      const cont = i > 0 && sym[i] !== null && sym[i] === sym[i - 1] && cell[i] >= cell[i - 1];
      if (!cont) {
        if (a >= 0 && ok) spans.push(len);
        a = sym[i] !== null && cell[i] === 0 ? i : -1; len = 0; ok = false;
      } else if (a >= 0) {
        len += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
        if (cell[i] === K - 1) ok = true;
      }
    }
  }
  if (!spans.length) return null;
  spans.sort((p, q) => p - q); steps.sort((p, q) => p - q);
  return (spans[spans.length >> 1] + steps[steps.length >> 1]) / K;
}

/* ---------------- point in region (even-odd over every loop) ---------------- */
function inside(loops, px, py) {
  let c = false;
  for (const lp of loops) {
    const { x, y, n } = lp;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if ((y[i] > py) !== (y[j] > py) && px < ((x[j] - x[i]) * (py - y[i])) / (y[j] - y[i]) + x[i]) c = !c;
    }
  }
  return c;
}

/* ---------------- the core reader over oriented, normalised loops ---------------- */
function readLoops(loops, mode) {
  const errors = [];
  const tau = TOPO.tau, aMin = TOPO.aMin;
  // global vertex numbering
  const off = [];
  let NV = 0;
  for (const lp of loops) { off.push(NV); NV += lp.n; }
  const loopOf = new Int32Array(NV), loc = new Int32Array(NV);
  const gx = new Float64Array(NV), gy = new Float64Array(NV), gs = new Float64Array(NV), gc = new Uint8Array(NV);
  const gnext = new Int32Array(NV), gprev = new Int32Array(NV);
  loops.forEach((lp, li) => {
    for (let i = 0; i < lp.n; i++) {
      const g = off[li] + i;
      loopOf[g] = li; loc[g] = i;
      gx[g] = lp.x[i]; gy[g] = lp.y[i]; gs[g] = lp.S[i]; gc[g] = lp.crop[i];
      gnext[g] = off[li] + ((i + 1) % lp.n); gprev[g] = off[li] + ((i - 1 + lp.n) % lp.n);
    }
  });
  const loopL = loops.map((lp) => lp.L);
  const X = (g) => gx[g];
  const Y = (g) => gy[g];
  const isCrop = (g) => gc[g] === 1;
  const step = (g, d) => {
    if (d === 1) return gnext[g];
    if (d === -1) return gprev[g];
    if (d === 0) return g;
    const lp = loops[loopOf[g]];
    return off[loopOf[g]] + ((loc[g] + d) % lp.n + lp.n) % lp.n;
  };
  const sep = (a, b) => {
    if (loopOf[a] !== loopOf[b]) return Infinity;
    const d = Math.abs(gs[a] - gs[b]);
    const L = loopL[loopOf[a]];
    return d < L - d ? d : L - d;
  };
  const dist = (a, b) => { const dx = gx[a] - gx[b], dy = gy[a] - gy[b]; return Math.sqrt(dx * dx + dy * dy); };
  /* Separation along the line itself: a path through a crop's closing arc
     is not line, so it never makes two points "near along the line". */
  const cropPre = new Int32Array(NV);
  const cropTot = loops.map(() => 0);
  for (let g = 0; g < NV; g++) {
    const li = loopOf[g];
    cropPre[g] = (loc[g] > 0 ? cropPre[g - 1] : 0) + gc[g];
    if (loc[g] === loops[li].n - 1) cropTot[li] = cropPre[g];
  }
  const sepInk = (a, b) => {
    const li = loopOf[a];
    if (li !== loopOf[b]) return Infinity;
    if (!cropTot[li]) return sep(a, b);
    let i = a, j = b;
    if (loc[i] > loc[j]) { i = b; j = a; }
    const within = cropPre[j] - (loc[i] > 0 ? cropPre[i - 1] : 0);
    const innerF = within - gc[i] - gc[j];
    const innerB = cropTot[li] - within;
    const d = gs[j] - gs[i], L = loopL[li];
    const f = innerF === 0 ? d : Infinity, bk = innerB === 0 ? L - d : Infinity;
    return f < bk ? f : bk;
  };

  /* 1. close pairs of ink points that are far apart along the line */
  const grid = new Map();
  const gk = (cx, cy) => cx * 100003 + cy;
  const cellX = new Int32Array(NV), cellY = new Int32Array(NV);
  for (let g = 0; g < NV; g++) {
    if (gc[g]) continue;
    cellX[g] = Math.floor(gx[g] / tau); cellY[g] = Math.floor(gy[g] / tau);
    const k = gk(cellX[g], cellY[g]);
    let b = grid.get(k);
    if (!b) { b = []; grid.set(k, b); }
    b.push(g);
  }
  const pi = [], pj = [], pd = [];
  const pairAt = new Map();
  const pkey = (a, b) => (a < b ? a * NV + b : b * NV + a);
  const tau2 = tau * tau;
  for (let g = 0; g < NV; g++) {
    if (gc[g]) continue;
    const cx = cellX[g], cy = cellY[g];
    const lg = loopOf[g], sg = gs[g], Lg = loopL[lg];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const b = grid.get(gk(cx + dx, cy + dy));
      if (!b) continue;
      for (let t = 0; t < b.length; t++) {
        const h = b[t];
        if (h <= g) continue;
        const ex = gx[g] - gx[h], ey = gy[g] - gy[h];
        const d2 = ex * ex + ey * ey;
        if (d2 >= tau2) continue;
        if (loopOf[h] === lg) { const ds = Math.abs(sg - gs[h]); if ((ds < aMin || Lg - ds < aMin) && sepInk(g, h) < aMin) continue; }
        pairAt.set(g * NV + h, pi.length);
        pi.push(g); pj.push(h); pd.push(Math.sqrt(d2));
      }
    }
  }
  const P = pi.length;
  /* 2. clusters of adjacent pairs; a cluster that touches the diagonal
        (a neighbouring close pair is near along the line) is a notch */
  const par = Int32Array.from({ length: P }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const touches = new Uint8Array(P);
  for (let p = 0; p < P; p++) {
    const ia = pi[p], ja = pj[p];
    const As = [gprev[ia], ia, gnext[ia]], Bs = [gprev[ja], ja, gnext[ja]];
    for (let u = 0; u < 3; u++) for (let w = 0; w < 3; w++) {
      if (u === 1 && w === 1) continue;
      const a = As[u], b = Bs[w];
      if (a === b) continue;
      const q = pairAt.get(pkey(a, b));
      if (q !== undefined) { const ra = find(p), rb = find(q); if (ra !== rb) par[ra] = rb; continue; }
      if (touches[p] || gc[a] || gc[b]) continue;
      if (dist(a, b) < tau && sepInk(a, b) < aMin) touches[p] = 1;
    }
  }
  const clusters = new Map();
  for (let p = 0; p < P; p++) {
    const r = find(p);
    if (!clusters.has(r)) clusters.set(r, { pairs: [], touch: false });
    const c = clusters.get(r);
    c.pairs.push(p);
    if (touches[p]) c.touch = true;
  }

  /* 3. contacts */
  const contacts = [];
  const cropNear = (g, reach) => {
    const lp = loops[loopOf[g]];
    if (!lp.crop.some((v) => v)) return false;
    for (let s = -1; s <= 1; s += 2) {
      let h = g;
      for (let t = 0; t < lp.n; t++) {
        h = step(h, s);
        if (sep(g, h) > reach) break;
        if (isCrop(h)) return true;
      }
    }
    return false;
  };
  for (const c of clusters.values()) {
    if (c.touch) continue;
    let best = c.pairs[0];
    for (const p of c.pairs) if (pd[p] < pd[best]) best = p;
    const a = pi[best], b = pj[best];
    const neck = inside(loops, (X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2);
    if (!neck && mode === 'crop' && (cropNear(a, 1.0) || cropNear(b, 1.0))) continue; // a kiss cut by the crop
    const w = pd[best];
    if (neck && w > TOPO.wn + TOPO.widthTol) errors.push(`a neck is ${w.toFixed(2)} wide`);
    if (!neck && (w < TOPO.gMin - TOPO.widthTol || w > TOPO.gMax + TOPO.widthTol)) errors.push(`a kiss gap is ${w.toFixed(2)}`);
    if (neck && loopOf[a] !== loopOf[b]) { errors.push('a neck joins two loops'); continue; }
    contacts.push({ kind: neck ? 'neck' : 'kiss', a, b, w, pairs: c.pairs });
  }

  /* 4. zones on each loop: neck zones from the cluster's extent on each
        side, kiss zones zKiss either side of the kiss point, crop runs */
  const zoneOf = new Int32Array(NV).fill(-1); // -1 free, -2 crop, >= 0 zone id
  for (let g = 0; g < NV; g++) if (isCrop(g)) zoneOf[g] = -2;
  const zones = [];
  const offIn = (g, ref) => { // signed index offset of g from ref along ref's loop
    const n = loops[loopOf[ref]].n;
    let d = loc[g] - loc[ref];
    if (d > n / 2) d -= n; else if (d <= -n / 2) d += n;
    return d;
  };
  for (let ci = 0; ci < contacts.length; ci++) {
    const c = contacts[ci];
    const ends = [c.a, c.b];
    const span = ends.map(() => [0, 0]);
    if (c.kind === 'neck') {
      for (const p of c.pairs) for (const g of [pi[p], pj[p]]) {
        const da = sepInk(g, c.a), db = sepInk(g, c.b);
        const s = da <= db ? 0 : 1;
        const o = offIn(g, ends[s]);
        if (o < span[s][0]) span[s][0] = o;
        if (o > span[s][1]) span[s][1] = o;
      }
    } else {
      for (let s = 0; s < 2; s++) {
        const lp = loops[loopOf[ends[s]]];
        let lo = 0, hi = 0;
        while (-lo < lp.n && sep(ends[s], step(ends[s], lo - 1)) <= TOPO.zKiss) lo--;
        while (hi < lp.n && sep(ends[s], step(ends[s], hi + 1)) <= TOPO.zKiss) hi++;
        span[s] = [lo, hi];
      }
    }
    c.zones = [];
    for (let s = 0; s < 2; s++) {
      const id = zones.length;
      const z = { id, contact: ci, side: s, loop: loopOf[ends[s]], start: step(ends[s], span[s][0]), end: step(ends[s], span[s][1]) };
      zones.push(z);
      c.zones.push(id);
      for (let o = span[s][0]; o <= span[s][1]; o++) {
        const g = step(ends[s], o);
        if (zoneOf[g] >= 0) { errors.push('two contact zones overlap'); }
        else zoneOf[g] = id;
      }
    }
  }

  /* 5. faces: the neck chords cut each loop into arcs; arcs on either side
        of a chord's two ends belong to one face (research check 3) */
  const faceOfArc = [];
  const ends = loops.map(() => []);
  for (const c of contacts) if (c.kind === 'neck') { ends[loopOf[c.a]].push(loc[c.a]); ends[loopOf[c.a]].push(loc[c.b]); }
  let nFaces = 0;
  const arcFace = loops.map((lp, li) => {
    const e = ends[li].slice().sort((p, q) => p - q);
    const m = e.length;
    if (!m) return { e, face: [nFaces++] };
    const upar = Int32Array.from({ length: m }, (_, i) => i);
    const f2 = (q) => { while (upar[q] !== q) { upar[q] = upar[upar[q]]; q = upar[q]; } return q; };
    const idx = new Map(e.map((v, i) => [v, i]));
    for (const c of contacts) {
      if (c.kind !== 'neck' || loopOf[c.a] !== li) continue;
      const ia = idx.get(loc[c.a]), ib = idx.get(loc[c.b]);
      const u = (p, q) => { const r1 = f2(p), r2 = f2(q); if (r1 !== r2) upar[r1] = r2; };
      u((ia - 1 + m) % m, ib);
      u((ib - 1 + m) % m, ia);
    }
    const roots = new Map();
    const face = new Array(m);
    for (let t = 0; t < m; t++) { const r = f2(t); if (!roots.has(r)) roots.set(r, nFaces++); face[t] = roots.get(r); }
    return { e, face };
  });
  /* the cyclic order of necks around each face, in walking order (interior
     on the left, so counter-clockwise about the lobe): the plane embedding */
  const rotationOf = new Array(nFaces).fill(null);
  for (let li = 0; li < loops.length; li++) {
    const { e, face } = arcFace[li];
    const m = e.length;
    if (!m) { rotationOf[face[0]] = []; continue; }
    const idx = new Map(e.map((v, i) => [v, i]));
    const partner = new Int32Array(m).fill(-1);
    for (const c of contacts) {
      if (c.kind !== 'neck' || loopOf[c.a] !== li) continue;
      const ia = idx.get(loc[c.a]), ib = idx.get(loc[c.b]);
      partner[ia] = ib; partner[ib] = ia;
    }
    for (let t0 = 0; t0 < m; t0++) {
      const f = face[t0];
      if (rotationOf[f]) continue;
      const nbr = [];
      let t = t0;
      for (let guard = 0; guard <= m; guard++) {
        const end = (t + 1) % m;
        nbr.push(face[end]);
        t = partner[end];
        if (t === t0 || t < 0) break;
      }
      rotationOf[f] = nbr;
    }
  }
  // non-crossing chords
  for (let li = 0; li < loops.length; li++) {
    const ch = contacts.filter((c) => c.kind === 'neck' && loopOf[c.a] === li).map((c) => [Math.min(loc[c.a], loc[c.b]), Math.max(loc[c.a], loc[c.b])]);
    for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) {
      const [a1, b1] = ch[i], [a2, b2] = ch[j];
      if ((a1 < a2 && a2 < b1 && b1 < b2) || (a2 < a1 && a1 < b2 && b2 < b1)) errors.push('two neck chords cross');
    }
  }
  const faceAt = (g) => {
    const af = arcFace[loopOf[g]];
    const e = af.e, m = e.length;
    if (!m) return af.face[0];
    const v = loc[g];
    // arc t runs from e[t] to e[t+1]; the last arc wraps
    let lo = 0, hi = m - 1, t = m - 1;
    if (v > e[0]) {
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (e[mid] < v) { t = mid; lo = mid + 1; } else hi = mid - 1; }
    }
    return af.face[t];
  };
  const faceOpen = new Uint8Array(nFaces);
  for (let g = 0; g < NV; g++) if (isCrop(g)) faceOpen[faceAt(g)] = 1;

  /* 6. segments: maximal runs of free points; their motifs */
  const segments = [];
  const segBefore = new Map(), segAfter = new Map(); // zone id -> segment
  for (let li = 0; li < loops.length; li++) {
    const lp = loops[li];
    const base = off[li];
    let start = -1;
    for (let i = 0; i < lp.n; i++) if (zoneOf[base + i] !== -1) { start = i; break; }
    if (start < 0) {
      // a loop with no contact and no crop: one lobe; read from a motif boundary
      let s0 = 0;
      for (let i = 0; i < lp.n; i++) {
        const j = (i - 1 + lp.n) % lp.n;
        if (lp.sym[i] === null || lp.sym[i] !== lp.sym[j] || lp.cell[i] < lp.cell[j]) { s0 = i; break; }
      }
      segments.push({ loop: li, from: base + s0, len: lp.n, prev: null, next: null });
      continue;
    }
    let i = start;
    for (let t = 0; t < lp.n; t++) {
      const g = base + i, gp = base + ((i - 1 + lp.n) % lp.n);
      if (zoneOf[g] === -1 && zoneOf[gp] !== -1) {
        let len = 0;
        while (len < lp.n && zoneOf[base + ((i + len) % lp.n)] === -1) len++;
        const after = zoneOf[base + ((i + len) % lp.n)];
        const sg = { loop: li, from: g, len, prev: zoneOf[gp], next: after };
        segments.push(sg);
        if (sg.prev >= 0) segAfter.set(sg.prev, sg);
        if (sg.next >= 0) segBefore.set(sg.next, sg);
      }
      i = (i + 1) % lp.n;
    }
  }
  for (const sg of segments) {
    const lp = loops[sg.loop];
    sg.face = faceAt(sg.from);
    sg.motifs = [];
    let cur = null;
    const close = () => {
      if (!cur) return;
      cur.complete = cur.mask === (1 << K) - 1 && cur.mono;
      sg.motifs.push(cur);
      cur = null;
    };
    for (let t = 0; t < sg.len; t++) {
      const g = step(sg.from, t);
      const s = lp.sym[loc[g]], c = lp.cell[loc[g]];
      if (s === null || c < 0) { close(); continue; }
      if (cur && s === cur.sym && c >= cur.last && c <= cur.last + 1) {
        cur.mask |= 1 << c; cur.last = c; cur.to = g;
      } else {
        close();
        cur = { sym: s, mask: 1 << c, last: c, mono: c === 0, from: g, to: g };
      }
    }
    close();
    sg.s0 = lp.S[loc[sg.from]];
    sg.sFrom = (m) => { const d = lp.S[loc[m.from]] - sg.s0; return d < 0 ? d + lp.L : d; };
    sg.sTo = (m) => { const d = lp.S[loc[m.to]] - sg.s0; return d < 0 ? d + lp.L : d; };
    sg.length = (() => { const lastG = step(sg.from, sg.len - 1); const d = lp.S[loc[lastG]] - sg.s0; return d < 0 ? d + lp.L : d; })();
    if (!faceOpen[sg.face]) for (const m of sg.motifs) if (!m.complete) errors.push(`a broken motif ${m.sym} on a whole lobe`);
  }

  /* 7. collars: a marker right after a zone opens the after-copy (marker
        plus inflections), a marker right before a zone is the before-copy */
  const used = new Set();
  const afterCopy = (zid) => {
    const sg = segAfter.get(zid);
    if (!sg || !sg.motifs.length) return null;
    const m0 = sg.motifs[0];
    if (!m0.complete || m0.sym[0] !== 'M' || sg.sFrom(m0) > TOPO.tAdj) return null;
    const out = [m0];
    for (let t = 1; t < sg.motifs.length && sg.motifs[t].sym[0] === 'I'; t++) out.push(sg.motifs[t]);
    return { seg: sg, motifs: out };
  };
  const beforeCopy = (zid) => {
    const sg = segBefore.get(zid);
    if (!sg || !sg.motifs.length) return null;
    const m = sg.motifs[sg.motifs.length - 1];
    if (!m.complete || m.sym[0] !== 'M' || sg.length - sg.sTo(m) > TOPO.tAdj) return null;
    return { seg: sg, motifs: [m] };
  };
  const take = (cp) => { for (const m of cp.motifs) { if (used.has(m)) errors.push('a collar motif read twice'); used.add(m); } };
  const keyOf = (cp) => {
    const label = cp.motifs[0].sym.slice(2);
    const f = cp.motifs.slice(1).map((m) => m.sym.slice(2)).sort();
    return label + '(' + f.join(',') + ')';
  };
  const lobeEdges = [];
  const openContacts = [];
  for (const c of contacts) {
    const [zp, zq] = c.zones;
    let sides;
    if (c.kind === 'neck') {
      const segA1 = segBefore.get(zp), segA2 = segAfter.get(zq), segB1 = segAfter.get(zp), segB2 = segBefore.get(zq);
      const fA = segA1 ? segA1.face : segA2 ? segA2.face : faceAt(step(zones[zp].start, -1));
      const fB = segB1 ? segB1.face : segB2 ? segB2.face : faceAt(step(zones[zp].end, 1));
      if ((segA1 && segA2 && segA1.face !== segA2.face) || (segB1 && segB2 && segB1.face !== segB2.face)) errors.push('a neck borders inconsistent faces');
      sides = [{ face: fA, before: beforeCopy(zp), after: afterCopy(zq) }, { face: fB, before: beforeCopy(zq), after: afterCopy(zp) }];
    } else {
      const f1 = segBefore.get(zp) ? segBefore.get(zp).face : faceAt(c.a);
      const f2 = segBefore.get(zq) ? segBefore.get(zq).face : faceAt(c.b);
      sides = [{ face: f1, before: beforeCopy(zp), after: afterCopy(zp) }, { face: f2, before: beforeCopy(zq), after: afterCopy(zq) }];
    }
    if (sides[0].face === sides[1].face) { errors.push(`a ${c.kind} joins a lobe to itself`); continue; }
    const wear = sides.map((s) => {
      if (faceOpen[s.face]) return null;
      if (s.before && s.after) {
        if (s.before.motifs[0].sym !== s.after.motifs[0].sym) return 'mismatch';
        return 'dep';
      }
      if (s.before || s.after) return 'half';
      return 'head';
    });
    if (wear.includes('mismatch') || wear.includes('half')) { errors.push(`a collar at a ${c.kind} is incomplete or its copies disagree`); continue; }
    const open = sides.map((s) => faceOpen[s.face] === 1);
    if (open[0] && open[1]) continue;
    if (open[0] || open[1]) {
      const k = open[0] ? 1 : 0;
      const s = sides[k];
      if (wear[k] === 'dep') { take(s.before); take(s.after); }
      openContacts.push({ face: s.face, kind: c.kind, dep: wear[k] === 'dep', key: wear[k] === 'dep' ? keyOf(s.after) : '?' });
      continue;
    }
    if ((wear[0] === 'dep') === (wear[1] === 'dep')) { errors.push(`a ${c.kind} has ${wear[0] === 'dep' ? 'two' : 'no'} collar wearers`); continue; }
    const d = wear[0] === 'dep' ? 0 : 1;
    take(sides[d].before); take(sides[d].after);
    lobeEdges.push({ h: sides[1 - d].face, d: sides[d].face, kind: c.kind, key: keyOf(sides[d].after) });
  }

  /* 8. each whole lobe: its own motifs, checksum, letters; orphan collars */
  const faces = Array.from({ length: nFaces }, () => ({ motifs: [], segs: 0, letterSegs: 0 }));
  for (const sg of segments) {
    const F = faces[sg.face];
    F.segs++;
    let hasL = false;
    for (const m of sg.motifs) { F.motifs.push(m); if (m.sym[0] === 'L') hasL = true; }
    if (hasL) F.letterSegs++;
  }
  const lobes = [];
  const faceLobe = new Int32Array(nFaces).fill(-1);
  for (let f = 0; f < nFaces; f++) {
    if (faceOpen[f]) continue;
    const F = faces[f];
    const own = [];
    let sv = null, sum = 0, orphans = [];
    for (const m of F.motifs) {
      if (!m.complete) continue;
      if (m.sym[0] === 'S') { if (sv !== null) errors.push('a lobe carries two checksums'); sv = +m.sym.slice(2); continue; }
      sum += motifIndex(m.sym);
      if (m.sym[0] === 'M' || m.sym[0] === 'I') { if (!used.has(m)) orphans.push(m); continue; }
      if (m.sym[0] !== 'Z') own.push(m.sym);
    }
    if (sv === null) errors.push('a lobe has no checksum');
    else if (sum % TOPO.checksumP !== sv) errors.push('a lobe checksum fails');
    if (F.letterSegs > 1) errors.push('a spelled lobe is read in more than one stretch');
    if (orphans.length) {
      if (mode !== 'crop') errors.push('a collar belongs to no contact');
      else {
        // a kiss whose partner lies outside the crop: before-copy, blank zone, after-copy
        for (let t = 0; t < orphans.length; t++) {
          const m = orphans[t];
          if (m.sym[0] !== 'M') continue;
          const nx = orphans[t + 1];
          if (nx && nx.sym === m.sym) {
            const cp = { motifs: [nx] };
            for (let u = t + 2; u < orphans.length && orphans[u].sym[0] === 'I'; u++) cp.motifs.push(orphans[u]);
            openContacts.push({ face: f, kind: 'kiss', dep: true, key: keyOf(cp) });
            t += cp.motifs.length;
          } else errors.push('an orphan collar in a crop');
        }
      }
    }
    faceLobe[f] = lobes.length;
    lobes.push({ face: f, own, key: lobeKey(own) });
  }

  const lobeGraph = {
    n: lobes.length,
    labels: lobes.map((L) => L.key),
    edges: lobeEdges.filter((e) => faceLobe[e.h] >= 0 && faceLobe[e.d] >= 0).map((e) => ({ h: faceLobe[e.h], d: faceLobe[e.d], key: e.kind + '|' + e.key })),
  };
  const open = openContacts.map((o) => ({ lobe: faceLobe[o.face], kind: o.kind, dep: o.dep, key: o.key }));
  const rotation = lobes.map((L) => (rotationOf[L.face] || []).map((f) => faceLobe[f]));
  return { errors, lobes, lobeGraph, open, rotation, info: { contacts: contacts.length, necks: contacts.filter((c) => c.kind === 'neck').length, kisses: contacts.filter((c) => c.kind === 'kiss').length, faces: nFaces, pairs: P } };
}

/* ---------------- lobe graph to meaning graph ---------------- */
function parseLobe(own) {
  const node = { k: null, c: [], f: {}, spell: '' };
  let echo = false, cls = [], x = null;
  for (const s of own) {
    const t = s[0], v = s.slice(2);
    if (t === 'D') { if (v === 'echo') echo = true; else cls.push(v); }
    else if (t === 'R') node.c.push(v);
    else if (t === 'F') { const i = v.indexOf('='); node.f[v.slice(0, i)] = v.slice(i + 1); }
    else if (t === 'L') node.spell += v;
    else if (t === 'X') x = v;
  }
  return { node, echo, cls, x };
}

function resolve(res) {
  const errors = [];
  const P = res.lobes.map((L) => parseLobe(L.own));
  const target = new Int32Array(P.length).fill(-1);
  const byIndex = new Map();
  P.forEach((p, i) => {
    if (p.cls.length !== 1) errors.push(`a lobe has ${p.cls.length} class determinants`);
    if (!p.echo && p.x !== null) { if (byIndex.has(p.x)) errors.push('two lobes carry one echo index'); byIndex.set(p.x, i); }
  });
  const echoesOf = new Map();
  P.forEach((p, i) => {
    if (!p.echo) return;
    if (p.x === null || !byIndex.has(p.x)) { errors.push('an echo with no target'); return; }
    const t = byIndex.get(p.x);
    const tp = P[t];
    if (tp.cls[0] !== p.cls[0] || [...tp.node.c].sort().join() !== [...p.node.c].sort().join()) errors.push('an echo disagrees with its target');
    target[i] = t;
    echoesOf.set(t, (echoesOf.get(t) || 0) + 1);
  });
  for (const [x, t] of byIndex) if (!echoesOf.has(t)) errors.push(`echo index ${x} has no echo`);
  const ids = new Map();
  const g = { v: HMR_VERSION, nodes: {}, edges: [] };
  P.forEach((p, i) => {
    if (p.echo) return;
    const id = 'd' + ids.size;
    ids.set(i, id);
    const nd = { k: p.cls[0] || null };
    const spec = NODE_CLASSES[nd.k];
    if (spec && spec.concept) nd.c = p.node.c.slice().sort();
    else if (p.node.c.length) nd.c = p.node.c.slice().sort();
    nd.f = p.node.f;
    if (p.node.spell) nd.spell = p.node.spell;
    g.nodes[id] = nd;
  });
  const real = (i) => (target[i] >= 0 ? target[i] : i);
  for (const e of res.lobeGraph.edges) {
    const key = e.key.slice(e.key.indexOf('|') + 1);
    const label = key.slice(0, key.indexOf('('));
    const inner = key.slice(key.indexOf('(') + 1, -1);
    const f = {};
    if (inner) for (const kv of inner.split(',')) { const i = kv.indexOf('='); f[kv.slice(0, i)] = kv.slice(i + 1); }
    const h = ids.get(real(e.h)), d = ids.get(real(e.d));
    if (h === undefined || d === undefined) { errors.push('an edge to a missing lobe'); continue; }
    g.edges.push([h, label, d, f]);
  }
  for (let i = 0; i < P.length; i++) if (P[i].echo) {
    const deg = res.lobeGraph.edges.filter((e) => e.h === i || e.d === i).length;
    if (deg !== 1) errors.push('an echo lobe has ' + deg + ' contacts');
  }
  const v = validateHMR(g);
  if (!v.ok) errors.push(...v.errors.map((s) => 'schema: ' + s));
  return { graph: g, errors };
}

/* ---------------- entry points ---------------- */
export function decodeContour(input) {
  const n = input.pts.length / 2;
  let xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = input.pts[2 * i]; ys[i] = input.pts[2 * i + 1]; }
  let sym = input.sym.slice(), cell = Int8Array.from(input.cell);
  const rev = () => { xs.reverse(); ys.reverse(); sym.reverse(); cell.reverse(); };
  let reversed = false, mirrored = false;
  if (signedArea(xs, ys) < 0) { rev(); reversed = true; }
  if (motifDirection([{ sym, cell }]) < 0) {
    // the rim reads backwards: a mirror image. Reflect, then restore the walk.
    for (let i = 0; i < n; i++) xs[i] = -xs[i];
    rev();
    mirrored = true;
  }
  const l = estimateCell([{ x: xs, y: ys, sym, cell }]);
  if (!l) return { ok: false, errors: ['no motif can be read'], graph: null };
  for (let i = 0; i < n; i++) { xs[i] /= l; ys[i] /= l; }
  const loop = makeLoop(xs, ys, sym, cell, new Uint8Array(n));
  const res = readLoops([loop], 'full');
  const out = { ok: false, errors: res.errors, graph: null, lobeGraph: res.lobeGraph, rotation: res.rotation, info: { ...res.info, reversed, mirrored, cell: l } };
  if (res.errors.length) return out;
  const r = resolve(res);
  out.errors = r.errors;
  out.graph = r.errors.length ? null : r.graph;
  out.ok = r.errors.length === 0;
  return out;
}

/* A crop: open pieces of the line inside a disk, each from where it
   enters the disk to where it leaves. The disk is the image boundary; the
   reader closes each piece's region along it (counter-clockwise from an
   exit to the next entry), marks those closing arcs as not ink, and
   reports lobes cut by the boundary as open. */
export function decodeCrop(input) {
  const { circle } = input;
  let pieces = input.pieces.map((p) => {
    const n = p.pts.length / 2;
    const x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = p.pts[2 * i]; y[i] = p.pts[2 * i + 1]; }
    return { x, y, sym: p.sym.slice(), cell: Int8Array.from(p.cell) };
  });
  if (!pieces.length) return { ok: true, errors: [], lobeGraph: { n: 0, labels: [], edges: [] }, open: [] };
  if (motifDirection(pieces) < 0) for (const p of pieces) { p.x.reverse(); p.y.reverse(); p.sym.reverse(); p.cell.reverse(); }
  const l = estimateCell(pieces);
  if (!l) return { ok: false, errors: ['no motif can be read'], lobeGraph: null, open: [] };
  const cx = circle.x / l, cy = circle.y / l, R = circle.r / l;
  for (const p of pieces) for (let i = 0; i < p.x.length; i++) { p.x[i] /= l; p.y[i] /= l; }
  const ang = (x, y) => { let a = Math.atan2(y - cy, x - cx); return a < 0 ? a + 2 * Math.PI : a; };
  const ent = pieces.map((p) => ang(p.x[0], p.y[0]));
  const ext = pieces.map((p) => ang(p.x[p.x.length - 1], p.y[p.y.length - 1]));
  const nextOf = pieces.map((_, i) => {
    let best = -1, bd = Infinity;
    for (let j = 0; j < pieces.length; j++) {
      let d = ent[j] - ext[i];
      if (d < 0) d += 2 * Math.PI;
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  });
  const seen = new Uint8Array(pieces.length);
  const loops = [];
  for (let s = 0; s < pieces.length; s++) {
    if (seen[s]) continue;
    const X = [], Y = [], S = [], C = [], CR = [];
    let i = s;
    while (!seen[i]) {
      seen[i] = 1;
      const p = pieces[i];
      for (let t = 0; t < p.x.length; t++) { X.push(p.x[t]); Y.push(p.y[t]); S.push(p.sym[t]); C.push(p.cell[t]); CR.push(0); }
      const j = nextOf[i];
      let a0 = ext[i], a1 = ent[j];
      if (a1 <= a0) a1 += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(((a1 - a0) * R) / TOPO.ds));
      for (let u = 1; u < steps; u++) {
        const a = a0 + ((a1 - a0) * u) / steps;
        X.push(cx + R * Math.cos(a)); Y.push(cy + R * Math.sin(a)); S.push(null); C.push(-1); CR.push(1);
      }
      i = j;
    }
    loops.push(makeLoop(Float64Array.from(X), Float64Array.from(Y), S, Int8Array.from(C), Uint8Array.from(CR)));
  }
  const res = readLoops(loops, 'crop');
  return { ok: res.errors.length === 0, errors: res.errors, lobeGraph: res.lobeGraph, open: res.open, lobes: res.lobes, info: { ...res.info, cell: l } };
}
