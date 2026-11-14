/* ============================================================
   heptapod/topo/layout.js — a constructive layout for the topology
   kernel (E1). It places the layout tree's lobes (circles of the
   radius their code needs) so that every tree edge is a neck, every
   other pair of primitives keeps the clearance dMin, and then turns
   each echo lobe into a kiss wherever a rigid rotation of one subtree
   about its parent can realise the kiss with every margin met.

   This is scaffolding for E1, not the plan's layout: E3 replaces it
   with the global solve of 3.4.3 (role angles, round hull, appendage
   clearance). It is deterministic, and it is correct by construction
   plus an exact check: sibling subtrees occupy disjoint angular wedges
   seen from their parent (each primitive inflated by dMin/2), and every
   composition is verified pair by pair, pushing a crowded child
   outward along its ray until all clearances hold.
   ============================================================ */

import { TOPO, neckZoneHalf } from './config.js';
import { allocateRim } from './rim.js';

const TAU = 2 * Math.PI;
const normAng = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

function segPointDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  let t = L2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + t * vx - px, dy = ay + t * vy - py;
  return Math.sqrt(dx * dx + dy * dy);
}

function segSegDist(a, b) {
  // a, b: [ax, ay, bx, by]; returns 0 if they cross
  const [p1x, p1y, p2x, p2y] = a, [q1x, q1y, q2x, q2y] = b;
  const d1x = p2x - p1x, d1y = p2y - p1y, d2x = q2x - q1x, d2y = q2y - q1y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) > 1e-12) {
    const s = ((q1x - p1x) * d2y - (q1y - p1y) * d2x) / den;
    const t = ((q1x - p1x) * d1y - (q1y - p1y) * d1x) / den;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return 0;
  }
  return Math.min(
    segPointDist(p1x, p1y, p2x, p2y, q1x, q1y), segPointDist(p1x, p1y, p2x, p2y, q2x, q2y),
    segPointDist(q1x, q1y, q2x, q2y, p1x, p1y), segPointDist(q1x, q1y, q2x, q2y, p2x, p2y));
}

/* The part of a neck outside both lobes: rim to rim along the centre line. */
function capsuleSeg(xa, ya, ra, xb, yb, rb) {
  const dx = xb - xa, dy = yb - ya;
  const L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
  const ux = dx / L, uy = dy / L;
  return [xa + ra * ux, ya + ra * uy, xb - rb * ux, yb - rb * uy];
}

/* ---------------- contacts and rim checks ---------------- */
/* Every contact of every live lobe: necks to parent and children, kisses. */
export function contactsOf(geo, v) {
  const { lt, x, y, r, dead, kisses, collarOf, own } = geo;
  const out = [];
  const zn = neckZoneHalf();
  const p = lt.parent[v];
  if (p >= 0) out.push({ ang: Math.atan2(y[p] - y[v], x[p] - x[v]), zh: zn, collar: lt.wearsParentCollar[v] ? collarOf(lt.edge[v]) : null, id: p, kind: 'neck', edge: lt.edge[v] });
  for (const c of lt.children[v]) {
    if (dead[c]) continue;
    out.push({ ang: Math.atan2(y[c] - y[v], x[c] - x[v]), zh: zn, collar: lt.wearsParentCollar[c] ? null : collarOf(lt.edge[c]), id: c, kind: 'neck', edge: lt.edge[c] });
  }
  for (const k of kisses) {
    if (k.h !== v && k.d !== v) continue;
    const w = k.h === v ? k.d : k.h;
    out.push({ ang: Math.atan2(y[w] - y[v], x[w] - x[v]), zh: TOPO.zKiss, collar: k.d === v ? collarOf(k.edge) : null, id: w, kind: 'kiss', edge: k.edge });
  }
  void own;
  return out;
}

export function anchorOf(geo, v) {
  const p = geo.lt.parent[v];
  if (p >= 0) return p;
  const c = geo.lt.children[v].find((w) => !geo.dead[w]);
  return c == null ? null : c;
}

function rimOk(geo, v) {
  return allocateRim(geo.r[v], geo.own(v), contactsOf(geo, v), anchorOf(geo, v)).ok;
}

/* ---------------- exact margin check of a whole layout ---------------- */
export function verifyMargins(geo, opts = {}) {
  const { lt, x, y, r, dead, kisses } = geo;
  const N = lt.N;
  const live = [];
  for (let v = 0; v < N; v++) if (!dead[v]) live.push(v);
  const kissPair = new Set(kisses.map((k) => Math.min(k.h, k.d) + ',' + Math.max(k.h, k.d)));
  const neckPair = (a, b) => lt.parent[a] === b || lt.parent[b] === a;
  const bad = [];
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const gap = Math.hypot(x[a] - x[b], y[a] - y[b]) - r[a] - r[b];
      if (neckPair(a, b)) { if (gap < TOPO.s0 - 1e-6) bad.push(['neck-gap', a, b, gap]); }
      else if (kissPair.has(Math.min(a, b) + ',' + Math.max(a, b))) { if (gap < TOPO.gMin - 1e-6 || gap > TOPO.gMax + 1e-6) bad.push(['kiss-gap', a, b, gap]); }
      else if (gap < TOPO.dMin - 1e-6) bad.push(['clearance', a, b, gap]);
    }
  }
  const caps = [];
  for (const v of live) {
    const p = lt.parent[v];
    if (p < 0) continue;
    caps.push({ a: p, b: v, s: capsuleSeg(x[p], y[p], r[p], x[v], y[v], r[v]) });
  }
  const hw = TOPO.wn / 2;
  for (const c of caps) {
    for (const k of live) {
      if (k === c.a || k === c.b) continue;
      const d = segPointDist(c.s[0], c.s[1], c.s[2], c.s[3], x[k], y[k]) - r[k] - hw;
      if (d < TOPO.dMin - 1e-6) bad.push(['capsule-lobe', c.a, c.b, k, d]);
    }
  }
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const P = caps[i], Q = caps[j];
      if (P.a === Q.a || P.a === Q.b || P.b === Q.a || P.b === Q.b) continue;
      const d = segSegDist(P.s, Q.s) - 2 * hw;
      if (d < TOPO.dMin - 1e-6) bad.push(['capsule-capsule', P.a, P.b, Q.a, Q.b, d]);
    }
  }
  if (!opts.skipRims) for (const v of live) if (!rimOk(geo, v)) bad.push(['rim', v]);
  return { ok: bad.length === 0, bad };
}

/* ---------------- bottom-up wedge composition ---------------- */
/* ---------------- bottom-up wedge composition ---------------- */
/* Children of v in their cyclic order, with every imposed sibling kiss
   made adjacent (the pair is moved together, the rest keep their order). */
function orderedKids(geo, v) {
  const { lt, dead, kisses } = geo;
  let ord = lt.children[v].filter((c) => !dead[c]);
  const isRoot = lt.parent[v] < 0;
  const pairs = kisses.filter((k) => k.sib === v);
  const adj = (o, a, b) => {
    const i = o.indexOf(a), j = o.indexOf(b);
    if (Math.abs(i - j) === 1) return true;
    return isRoot && o.length > 2 && Math.abs(i - j) === o.length - 1;
  };
  /* p.side: 'after' puts the dependent right after the head (counter-
     clockwise), 'before' right before it. */
  const placed = (o, p) => {
    const i = o.indexOf(p.h), j = o.indexOf(p.d), L = o.length;
    const after = j === (i + 1) % L && (isRoot || j === i + 1);
    const before = i === (j + 1) % L && (isRoot || i === j + 1);
    return p.side === 'before' ? before : after;
  };
  const done = [];
  for (const p of pairs) {
    if (!placed(ord, p)) {
      let ok = false;
      for (const moveDep of [true, false]) {
        const move = moveDep ? p.d : p.h, stay = moveDep ? p.h : p.d;
        const after = moveDep ? p.side !== 'before' : p.side === 'before';
        const o = ord.filter((c) => c !== move);
        o.splice(o.indexOf(stay) + (after ? 1 : 0), 0, move);
        if (placed(o, p) && done.every((q) => adj(o, q.h, q.d))) { ord = o; ok = true; break; }
      }
      if (!ok) return null;
    }
    done.push(p);
  }
  return ord;
}

const kissKey = (a, b) => (a < b ? a + ',' + b : b + ',' + a);

export function layoutTree(geo, reflect) {
  const { lt, r, dead } = geo;
  const N = lt.N;
  const order = [];
  const st = [lt.root];
  while (st.length) { const v = st.pop(); if (dead[v]) continue; order.push(v); for (const c of lt.children[v]) st.push(c); }
  const sub = new Array(N);
  const zn = neckZoneHalf();
  const half = TOPO.dMin / 2;
  const hw = TOPO.wn / 2;
  const M = TOPO.K * TOPO.cellLen;
  const sibKiss = new Set(geo.kisses.filter((k) => k.sib >= 0).map((k) => kissKey(k.h, k.d)));
  let pushes = 0;
  const kidsOf = new Array(N);
  for (const v of order) {
    kidsOf[v] = orderedKids(geo, v);
    if (!kidsOf[v]) return { ok: false, reason: 'imposed kisses cannot all be adjacent', pushes };
  }
  /* A lobe that will kiss its sibling keeps a cone toward that sibling free
     of its own subtree: the partner sits at angle theta from the parent
     direction (the triangle parent, lobe, partner at nominal necks). */
  const cones = new Map();
  const dFloor = new Float64Array(N);
  const apex = (Dc, Dp, K) => Math.acos(Math.max(-1, Math.min(1, (Dc * Dc + K * K - Dp * Dp) / (2 * Dc * K))));
  for (const ks of geo.kisses) {
    if (ks.sib < 0) continue;
    const v = ks.sib, kk = kidsOf[v];
    const ih = kk.indexOf(ks.h), id = kk.indexOf(ks.d);
    const K = r[ks.h] + r[ks.d] + TOPO.g;
    /* The rim of each partner between its parent neck and the kiss must hold
       the collar copies that fall there; longer necks open that angle (up
       to 90 degrees), so solve the neck length first. */
    // reflections of v or an ancestor mirror the arrangement and swap which
    // collar copies fall on the short arc
    let parity = false;
    if (reflect) for (let a = v; a >= 0; a = lt.parent[a]) if (reflect[a]) parity = !parity;
    const sides = [[ks.h, ks.d, ih, id], [ks.d, ks.h, id, ih]].map(([c, p, ic, ip]) => {
      const follows = ip === (ic + 1) % kk.length; // the partner comes next, counter-clockwise about v
      const seen = follows !== parity;
      const depKiss = c === ks.d, wearsUp = !!lt.wearsParentCollar[c];
      const Lk = geo.collarOf(ks.edge).length, Lp = wearsUp ? geo.collarOf(lt.edge[c]).length : 0;
      const motifs = seen ? (depKiss ? Lk : 0) + (wearsUp ? 1 : 0) : (wearsUp ? Lp : 0) + (depKiss ? 1 : 0);
      const both = depKiss && wearsUp;
      const need = (TOPO.zKiss + zn + M * motifs + (both ? M : 0) + 0.5) / r[c];
      return { c, p, follows, need };
    });
    let Dh = Math.max(r[v] + r[ks.h] + TOPO.s0, dFloor[ks.h]), Dd = Math.max(r[v] + r[ks.d] + TOPO.s0, dFloor[ks.d]);
    // equal steps keep the difference of the two necks, so the apex angles
    // rise toward 90 degrees and the triangle stays closed
    let met = false;
    for (let t = 0; t < 80; t++) {
      if (apex(Dh, Dd, K) >= sides[0].need && apex(Dd, Dh, K) >= sides[1].need) { met = true; break; }
      Dh += 0.1 * K; Dd += 0.1 * K;
    }
    if (!met) return { ok: false, reason: 'no neck length gives the kiss its rim', pushes };
    dFloor[ks.h] = Dh; dFloor[ks.d] = Dd;
    for (const sd of sides) {
      const Dc = sd.c === ks.h ? Dh : Dd, Dp = sd.c === ks.h ? Dd : Dh;
      let a = sd.follows ? -apex(Dc, Dp, K) : apex(Dc, Dp, K);
      if (reflect && reflect[sd.c]) a = -a;
      const w = Math.asin(Math.min(1, (r[sd.p] + half) / K));
      if (!cones.has(sd.c)) cones.set(sd.c, []);
      cones.get(sd.c).push({ a, w });
    }
  }

  for (let oi = order.length - 1; oi >= 0; oi--) {
    const v = order[oi];
    const kids = kidsOf[v];
    if (!kids.length) { sub[v] = { ids: [v], x: [0], y: [0] }; continue; }
    const k = kids.length;
    const isRoot = lt.parent[v] < 0;
    const D = kids.map((c) => Math.max(r[v] + r[c] + TOPO.s0, dFloor[c]));
    const wearsAt = kids.map((c) => !lt.wearsParentCollar[c]); // v is the dependent at this child neck
    const collarLen = kids.map((c) => geo.collarOf(lt.edge[c]).length);
    const parentCollar = !isRoot && lt.wearsParentCollar[v] ? geo.collarOf(lt.edge[v]).length : 0;
    // the arc from contact A to the next contact B (counter-clockwise) holds A's
    // after-copy (marker and inflections) and B's before-copy (the marker).
    // A reflection of v or of an ancestor mirrors this arrangement in the
    // final figure, where the copies are written in walking direction, so
    // under an odd count the same arc holds B's after-copy and A's before-copy.
    let mirrored = false;
    if (reflect) for (let a = v; a >= 0; a = lt.parent[a]) if (reflect[a]) mirrored = !mirrored;
    // A lone collar copy also needs a clear gap on its far side (rim.js), and
    // two copies need a separator between them.
    const rimNeed = (wa, la, wb, lb) => 2 * zn + (mirrored
      ? M * ((wb ? lb : 0) + (wa ? 1 : 0))
      : M * ((wa ? la : 0) + (wb ? 1 : 0))) + (wa && wb ? M : 0) + (wa !== wb ? TOPO.tAdj + 1.5 : 0) + 0.5;
    /* The cone kept free toward the parent holds the parent's neck: its
       inflated capsule subtends at most asin((wn/2 + dMin/2) / r) from v. */
    const psiP = Math.max(TOPO.psi, Math.asin(Math.min(1, (hw + half) / r[v])));
    const kissNext = kids.map((c, j) => {
      const nx = j + 1 < k ? kids[j + 1] : isRoot && k > 2 ? kids[0] : -1;
      return nx >= 0 && sibKiss.has(kissKey(c, nx));
    });
    const kissPairs = new Set();
    for (let j = 0; j < k; j++) if (kissNext[j]) kissPairs.add(kissKey(j, (j + 1) % k));
    /* Push a child outward; a chain of kissing siblings moves as one, so
       the kiss angle stays solvable. */
    const bump = (j, moved = new Set()) => {
      const st2 = [j];
      while (st2.length) {
        const q = st2.pop();
        if (moved.has(q)) continue;
        moved.add(q);
        D[q] *= TOPO.grow;
        const nx = (q + 1) % k, pv = (q - 1 + k) % k;
        if (kissPairs.has(kissKey(q, nx))) st2.push(nx);
        if (kissPairs.has(kissKey(pv, q))) st2.push(pv);
      }
    };
    let phi = null;
    let done = false;
    for (let iter = 0; iter < TOPO.maxPush && !done; iter++) {
      // angular extents of each child subtree at its current distance
      const lo = new Array(k), hi = new Array(k);
      let feasible = true;
      for (let j = 0; j < k; j++) {
        const s = sub[kids[j]];
        let mn = Infinity, mx = -Infinity, ok = true;
        const consider = (px, py, rad) => {
          const rho = Math.hypot(px, py);
          if (rho <= rad + 1e-9) { ok = false; return; }
          const a = Math.atan2(py, px), h = Math.asin(Math.min(1, rad / rho));
          if (Math.abs(a) + h > Math.PI - 0.05) { ok = false; return; }
          if (a - h < mn) mn = a - h;
          if (a + h > mx) mx = a + h;
        };
        const idx = new Map(s.ids.map((id, t) => [id, t]));
        for (let t = 0; t < s.ids.length && ok; t++) {
          const id = s.ids[t];
          consider(s.x[t] + D[j], s.y[t], r[id] + half);
          const p = lt.parent[id];
          if (t > 0 && idx.has(p)) {
            const q = idx.get(p);
            const seg = capsuleSeg(s.x[q] + D[j], s.y[q], r[p], s.x[t] + D[j], s.y[t], r[id]);
            const L = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
            const steps = Math.max(1, Math.ceil(L / 1.5));
            for (let u = 0; u <= steps && ok; u++) consider(seg[0] + (seg[2] - seg[0]) * u / steps, seg[1] + (seg[3] - seg[1]) * u / steps, hw + half);
          }
        }
        if (!ok) { bump(j); feasible = false; pushes++; continue; }
        lo[j] = mn; hi[j] = mx;
      }
      if (!feasible) continue;
      // required separations between consecutive items around v (counter-clockwise)
      const items = [];
      if (!isRoot) {
        let plo = -psiP, phi2 = psiP;
        for (const cn of cones.get(v) || []) { plo = Math.min(plo, cn.a - cn.w); phi2 = Math.max(phi2, cn.a + cn.w); }
        items.push({ lo: plo, hi: phi2, wears: parentCollar > 0, len: parentCollar, child: -1 });
      }
      for (let j = 0; j < k; j++) items.push({ lo: lo[j], hi: hi[j], wears: wearsAt[j], len: collarLen[j], child: j });
      const m = items.length;
      const sep = new Array(m);
      const fixed = new Uint8Array(m);
      let total = 0, loose = 0;
      for (let i = 0; i < m; i++) {
        const A = items[i], B = items[(i + 1) % m];
        let s = 0;
        const need = (m > 1 ? rimNeed(A.wears, A.len, B.wears, B.len) : rimNeed(A.wears, A.len, A.wears, A.len)) / r[v];
        if (A.child >= 0 && B.child >= 0 && m > 1 && kissNext[A.child] && (A.child + 1) % k === B.child) {
          // a sibling kiss: the angle that puts the two rims exactly g apart
          const Da = D[A.child], Db = D[B.child];
          const K = r[kids[A.child]] + r[kids[B.child]] + TOPO.g;
          const cb = (Da * Da + Db * Db - K * K) / (2 * Da * Db);
          if (cb < -1 || cb > 1) return { ok: false, reason: 'sibling kiss out of reach', pushes };
          s = Math.acos(cb);
          if (s < need) return { ok: false, reason: 'sibling kiss crowds the parent rim', pushes };
          fixed[i] = 1;
        } else if (m > 1) s = Math.max(A.hi - B.lo + TOPO.angMargin, need);
        else s = Math.max(A.hi - A.lo + TOPO.angMargin, need);
        sep[i] = s; total += s;
        if (!fixed[i]) loose++;
      }
      if (!loose) return { ok: false, reason: 'no free gap around a lobe', pushes };
      if (total > TAU) {
        let jw = 0, w = -1;
        for (let j = 0; j < k; j++) if (hi[j] - lo[j] > w) { w = hi[j] - lo[j]; jw = j; }
        bump(jw); pushes++;
        continue;
      }
      const slack = (TAU - total) / loose;
      const ang = new Array(m);
      ang[0] = isRoot ? 0 : Math.PI;
      for (let i = 1; i < m; i++) ang[i] = ang[i - 1] + sep[i - 1] + (fixed[i - 1] ? 0 : slack);
      phi = new Array(k);
      for (let i = 0; i < m; i++) if (items[i].child >= 0) phi[items[i].child] = ang[i];
      // exact check of the composed subtree
      const viol = composeCheck(geo, v, kids, sub, D, phi, kissPairs);
      if (viol === null) return { ok: false, reason: 'a sibling kiss collides', pushes };
      if (viol.size) { { const moved = new Set(); for (const j of viol) bump(j, moved); } pushes++; continue; }
      done = true;
    }
    if (!done) return { ok: false, reason: 'composition did not converge', pushes };
    const out = { ids: [v], x: [0], y: [0] };
    for (let j = 0; j < k; j++) {
      const s = sub[kids[j]];
      const c = Math.cos(phi[j]), sn = Math.sin(phi[j]);
      for (let t = 0; t < s.ids.length; t++) {
        out.ids.push(s.ids[t]);
        out.x.push(D[j] * c + s.x[t] * c - s.y[t] * sn);
        out.y.push(D[j] * sn + s.x[t] * sn + s.y[t] * c);
      }
      sub[kids[j]] = null;
    }
    if (reflect && reflect[v]) for (let t = 0; t < out.y.length; t++) out.y[t] = -out.y[t];
    sub[v] = out;
  }
  const s = sub[lt.root];
  for (let t = 0; t < s.ids.length; t++) { geo.x[s.ids[t]] = s.x[t]; geo.y[s.ids[t]] = s.y[t]; }
  return { ok: true, pushes };
}

/* Pairwise clearance inside one composition. Returns the set of child
   indices that must move outward, or null when two kissing siblings'
   subtrees collide elsewhere (pushing them out cannot help). */
function composeCheck(geo, v, kids, sub, D, phi, kissPairs) {
  const { lt, r } = geo;
  const hw = TOPO.wn / 2;
  const lobes = [{ id: v, x: 0, y: 0, g: -1 }];
  const caps = [];
  for (let j = 0; j < kids.length; j++) {
    const s = sub[kids[j]];
    const c = Math.cos(phi[j]), sn = Math.sin(phi[j]);
    const idx = new Map();
    for (let t = 0; t < s.ids.length; t++) {
      const X = D[j] * c + s.x[t] * c - s.y[t] * sn, Y = D[j] * sn + s.x[t] * sn + s.y[t] * c;
      idx.set(s.ids[t], lobes.length);
      lobes.push({ id: s.ids[t], x: X, y: Y, g: j });
    }
    for (let t = 0; t < s.ids.length; t++) {
      const id = s.ids[t];
      const p = t === 0 ? v : lt.parent[id];
      const A = t === 0 ? lobes[0] : lobes[idx.get(p)];
      const B = lobes[idx.get(id)];
      caps.push({ a: A.id, b: B.id, g: j, touchesV: t === 0, s: capsuleSeg(A.x, A.y, r[A.id], B.x, B.y, r[B.id]) });
    }
  }
  const viol = new Set();
  let stuck = false;
  const flag = (g1, g2) => {
    if (g1 >= 0 && g2 >= 0 && kissPairs.has(kissKey(g1, g2))) stuck = true;
    if (g1 >= 0) viol.add(g1);
    if (g2 >= 0) viol.add(g2);
  };
  for (let i = 0; i < lobes.length; i++) {
    const A = lobes[i];
    for (let j = i + 1; j < lobes.length; j++) {
      const B = lobes[j];
      if (A.g === B.g) continue;
      if (A.g === -1 && lt.parent[B.id] === v && kids[B.g] === B.id) continue; // the neck to a child
      if (A.g >= 0 && kids[A.g] === A.id && kids[B.g] === B.id && kissPairs.has(kissKey(A.g, B.g))) continue; // the kiss itself
      const gap = Math.hypot(A.x - B.x, A.y - B.y) - r[A.id] - r[B.id];
      if (gap < TOPO.dMin) flag(A.g, B.g);
    }
  }
  for (const c of caps) {
    for (const L of lobes) {
      if (L.id === c.a || L.id === c.b) continue;
      if (L.g === c.g) continue;
      const d = segPointDist(c.s[0], c.s[1], c.s[2], c.s[3], L.x, L.y) - r[L.id] - hw;
      if (d < TOPO.dMin) flag(c.g, L.g);
    }
  }
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const P = caps[i], Q = caps[j];
      if (P.g === Q.g) continue;
      if (P.touchesV && Q.touchesV) continue;
      const d = segSegDist(P.s, Q.s) - 2 * hw;
      if (d < TOPO.dMin) flag(P.g, Q.g);
    }
  }
  return stuck ? null : viol;
}

/* ---------------- echoes into kisses ---------------- */
function subtreeSet(lt, dead, x) {
  const s = new Set();
  const st = [x];
  while (st.length) { const v = st.pop(); if (dead[v]) continue; s.add(v); for (const c of lt.children[v]) st.push(c); }
  return s;
}

/* Rotate the subtree of `mover` about its parent so that its centre
   lands at distance K from the fixed lobe `fixed`. */
function kissRotations(geo, mover, fixed, K) {
  const { lt, x, y } = geo;
  const p = lt.parent[mover];
  if (p < 0) return [];
  const rho = Math.hypot(x[mover] - x[p], y[mover] - y[p]);
  const dpf = Math.hypot(x[fixed] - x[p], y[fixed] - y[p]);
  if (dpf < 1e-9) return [];
  const cb = (rho * rho + dpf * dpf - K * K) / (2 * rho * dpf);
  if (cb < -1 || cb > 1) return [];
  const beta = Math.acos(cb);
  const base = Math.atan2(y[fixed] - y[p], x[fixed] - x[p]);
  const cur = Math.atan2(y[mover] - y[p], x[mover] - x[p]);
  const out = [];
  for (const tgt of [base + beta, base - beta]) {
    let a = normAng(tgt - cur);
    if (a > Math.PI) a -= TAU;
    out.push(a);
  }
  out.sort((a, b) => Math.abs(a) - Math.abs(b));
  return out.map((alpha) => ({ mover, pivot: p, alpha }));
}

/* Two passes, in echo order. 1: an echo between siblings becomes a kiss
   imposed in the composition (the pair made adjacent, the angle solved),
   accepted only if the whole re-laid figure meets every margin. 2: any
   other echo becomes a kiss if rotating one endpoint's subtree about its
   parent realises it with every margin met. The rest stay echoes. */
export function echoesToKisses(geo, reflect) {
  const { lt, x, y, r, dead } = geo;
  let made = 0, sibling = 0, rotated = 0, tried = 0;
  const N = lt.N;
  for (let e = lt.n; e < N; e++) {
    const h = lt.parent[e], d = lt.echoTarget[e];
    if (lt.parent[d] < 0 || lt.parent[d] !== lt.parent[h] || h === d) continue;
    if (geo.kisses.some((k) => kissKey(k.h, k.d) === kissKey(h, d))) continue;
    const sx = Float64Array.from(x), sy = Float64Array.from(y);
    let ok = false;
    dead[e] = 1;
    for (const side of ['after', 'before']) {
      tried++;
      geo.kisses.push({ h, d, edge: lt.edge[e], sib: lt.parent[h], side });
      const lay = layoutTree(geo, reflect);
      if (lay.ok && verifyMargins(geo).ok) { ok = true; break; }
      geo.kisses.pop();
    }
    if (ok) { made++; sibling++; continue; }
    dead[e] = 0;
    x.set(sx); y.set(sy);
  }
  for (let e = lt.n; e < N; e++) {
    if (dead[e]) continue;
    const h = lt.parent[e], d = lt.echoTarget[e];
    const adjacent = lt.parent[d] === h || lt.parent[h] === d || h === d ||
      geo.kisses.some((k) => kissKey(k.h, k.d) === kissKey(h, d));
    if (adjacent) continue;
    dead[e] = 1;
    const K = r[h] + r[d] + TOPO.g;
    const opts = [];
    const sd = subtreeSet(lt, dead, d);
    if (!sd.has(h)) opts.push(...kissRotations(geo, d, h, K));
    const sh = subtreeSet(lt, dead, h);
    if (!sh.has(d)) opts.push(...kissRotations(geo, h, d, K));
    let ok = false;
    for (const o of opts) {
      tried++;
      const S = o.mover === d ? sd : sh;
      const save = [];
      const c = Math.cos(o.alpha), s = Math.sin(o.alpha);
      for (const v of S) {
        save.push(v, x[v], y[v]);
        const dx = x[v] - x[o.pivot], dy = y[v] - y[o.pivot];
        x[v] = x[o.pivot] + dx * c - dy * s;
        y[v] = y[o.pivot] + dx * s + dy * c;
      }
      geo.kisses.push({ h, d, edge: lt.edge[e], sib: -1 });
      if (verifyMargins(geo).ok) { ok = true; break; }
      geo.kisses.pop();
      for (let t = 0; t < save.length; t += 3) { x[save[t]] = save[t + 1]; y[save[t]] = save[t + 2]; }
    }
    if (ok) { made++; rotated++; } else dead[e] = 0;
  }
  let kept = 0;
  for (let e = lt.n; e < N; e++) if (!dead[e]) kept++;
  return { made, sibling, rotated, kept, tried };
}
