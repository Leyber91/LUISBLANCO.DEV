/* ============================================================
   heptapod/reader.js — the reader.

   The decoder never sees the graph or the geometry. It reads a
   1400 x 840 grey raster (the "page"), the way a reader would:

     1. which frame is this: one ring, or two rings and a bridge
     2. along 360 rays, where is the ring and how thick is it
     3. is a nested ring at 0.40 of the radius (an embedded clause)
     4. which roles are present: all 8 layouts are tried and the
        one whose sectors read as valid codes wins (maximum
        likelihood over the layouts, soft decoding over the
        codebook of radicals)
     5. features from ink in bands beside the ring: the tendril's
        lean, branches in or out, the cut, the stroke weight
     6. for a composite, the bridge read in three vertical columns

   It imports the script's spec (layout, cells, nib, codebook) and
   the page format, and nothing from the writer: it can only read
   what is drawn.
   ============================================================ */

import { GEOM, CODEC, COMPOSE } from './config.js';
import { slotValueFromBands, layoutFor, cellCenters, mod, nib, CODEBOOK, FIXED_NUMBER, REF_ROLE, SLOT_KEYS } from './script.js';
import { Raster } from './raster.js';

const D2R = Math.PI / 180;

/* ---------------- the reader ---------------- */

/* The reader squints first: a 3 x 3 majority vote over the binarised page removes
   isolated specks and fills pinholes, as an eye does. Separable box sums. */
export function squint(src, dst = new Raster(src.W, src.H)) {
  const { W, H } = src;
  const b = new Uint8Array(W * H), h = new Uint8Array(W * H);
  for (let i = 0; i < b.length; i++) b[i] = src.d[i] > 127 ? 1 : 0;
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) h[r + x] = b[r + x] + (x > 0 ? b[r + x - 1] : 0) + (x < W - 1 ? b[r + x + 1] : 0);
  }
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; x++) {
      const n = h[r + x] + (y > 0 ? h[r - W + x] : 0) + (y < H - 1 ? h[r + W + x] : 0);
      dst.d[r + x] = n >= 5 ? 255 : 0;
    }
  }
  return dst;
}

const A = GEOM.A;

function ringScore(rs, cx, cy, R, lo = 0.88, hi = 1.12) {
  let hit = 0, n = 0;
  for (let deg = 0; deg < 360; deg += 2) {
    const s = Math.sin(deg * D2R), c = -Math.cos(deg * D2R);
    let best = 0;
    for (let r = lo * R; r <= hi * R; r += 1) best = Math.max(best, rs.at(cx + s * r, cy + c * r));
    n++; if (best > CODEC.INK) hit++;
  }
  return hit / n;
}

/* Along 360 rays: the ring's radius (ring units) and thickness (px). */
function readRing(rs, cx, cy, R, wPx) {
  const rr = new Float64Array(360).fill(NaN), tt = new Float64Array(360);
  const step = 0.75;
  // a crossing longer than this is a mark running along the ray, not the ring
  const maxLen = 2.6 * GEOM.NIB.max * wPx + 2;
  for (let i = 0; i < 360; i++) {
    const s = Math.sin(i * D2R), c = -Math.cos(i * D2R);
    let best = null, runStart = -1;
    const r0 = 0.84 * R, r1 = 1.16 * R;
    for (let r = r0; r <= r1 + step; r += step) {
      const ink = r <= r1 && rs.at(cx + s * r, cy + c * r) > CODEC.INK;
      if (ink && runStart < 0) runStart = r;
      if (!ink && runStart >= 0) {
        const len = r - runStart, mid = (runStart + r - step) / 2;
        // the plausible crossing nearest the unit circle
        if (len >= 1.5 && len <= maxLen && (!best || Math.abs(mid - R) < Math.abs(best.mid - R))) best = { len, mid };
        runStart = -1;
      }
    }
    if (best) { rr[i] = best.mid / R; tt[i] = best.len; }
  }
  return { rr, tt };
}

function medianOf(arr) {
  const a = arr.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function smoothRing(rr, half = 2) {
  const out = new Float64Array(360);
  for (let i = 0; i < 360; i++) {
    const w = [];
    for (let k = -half; k <= half; k++) w.push(rr[mod(i + k, 360)]);
    out[i] = medianOf(w);
  }
  return out;
}

function lowpass(rf, half = 12) {
  const out = new Float64Array(360);
  for (let i = 0; i < 360; i++) {
    let s = 0, n = 0;
    for (let k = -half; k <= half; k++) { const v = rf[mod(i + k, 360)]; if (Number.isFinite(v)) { s += v; n++; } }
    out[i] = n ? s / n : 1;
  }
  return out;
}

const sampleAt = (rf, deg, half = 1) => {
  const w = [];
  for (let k = -half; k <= half; k++) w.push(rf[mod(Math.round(deg) + k, 360)]);
  const m = medianOf(w);
  return Number.isFinite(m) ? m : 1;
};

/* Soft decoding of one sector against a codebook. */
function readSector(rf, sec, book) {
  const m = cellCenters(sec).map((c) => Math.max(-1.7, Math.min(1.7, (sampleAt(rf, c) - 1) / A)));
  let best = null, second = null;
  for (const e of book) {
    let d = 0;
    for (let j = 0; j < m.length; j++) d += (m[j] - e.code[j]) ** 2;
    if (!best || d < best.d) { second = best; best = { id: e.id, d }; }
    else if (!second || d < second.d) second = { id: e.id, d };
  }
  const flat = m.reduce((a, v) => a + v * v, 0);
  return { m, id: best.id, d: best.d, d2: second.d, flat, thetas: cellCenters(sec) };
}

/* Ink mass in a polar box beside the ring (ring units squared), background removed. */
function bandMass(rs, cx, cy, R, theta, half, rIn, rOut, bg) {
  let mass = 0, area = 0;
  const dth = 0.5, dr = 1 / R;
  for (let a = theta - half; a <= theta + half; a += dth) {
    const s = Math.sin(a * D2R), c = -Math.cos(a * D2R);
    for (let r = rIn; r <= rOut; r += dr) {
      const el = r * dth * D2R * dr;
      mass += rs.at(cx + s * r * R, cy + c * r * R) * el;
      area += el;
    }
  }
  return mass - bg * area;
}

function background(rs, cx, cy, R, lo = 1.56, hi = 1.66) {
  const bins = [];
  for (let b = 0; b < 36; b++) {
    let s = 0, n = 0;
    for (let a = b * 10; a < b * 10 + 10; a += 1) {
      const sn = Math.sin(a * D2R), c = -Math.cos(a * D2R);
      for (let r = lo; r <= hi; r += 2 / R) { s += rs.at(cx + sn * r * R, cy + c * r * R); n++; }
    }
    bins.push(s / n);
  }
  return medianOf(bins);
}

/* Weakest mark mass in each band is about 0.003 ring units squared; a third of that counts. */
const MARK_T = 0.0011;

/* How much of the band's radial extent carries ink: marks run across the band, blots do not. */
function radialCover(rs, cx, cy, R, theta, half, rIn, rOut) {
  let hit = 0, n = 0;
  for (let r = rIn; r <= rOut; r += 1 / R) {
    let best = 0;
    for (let a = theta - half; a <= theta + half; a += 0.5) {
      const v = rs.at(cx + Math.sin(a * D2R) * r * R, cy - Math.cos(a * D2R) * r * R);
      if (v > best) best = v;
    }
    n++; if (best > CODEC.INK) hit++;
  }
  return n ? hit / n : 0;
}

const COVER_T = 0.45;

function readTime(rs, cx, cy, R) {
  // per radius, the centre of the ink across the window; the lean is the median of those
  const per = [];
  let mass = 0;
  for (let r = 1.28; r <= 1.5; r += 1 / R) {
    let m = 0, ma = 0;
    for (let a = -34; a <= 34; a += 0.5) {
      const v = rs.at(cx + Math.sin(a * D2R) * r * R, cy - Math.cos(a * D2R) * r * R);
      m += v; ma += v * a;
    }
    if (m > 0) per.push(ma / m);
    mass += m;
  }
  const lean = per.length ? medianOf(per) : 0;
  return { lean, mass, value: lean < -8 ? 'past' : lean > 8 ? 'future' : 'present' };
}

function readGap(rr, theta) {
  let miss = 0;
  for (let k = -4; k <= 4; k++) if (!Number.isFinite(rr[mod(Math.round(theta) + k, 360)])) miss++;
  return { miss, neg: miss >= 6 };
}

function readWeight(tt, sec, wPx) {
  const w = [];
  for (const c of cellCenters(sec)) for (let k = -1; k <= 1; k++) { const a = mod(Math.round(c) + k, 360); const v = tt[a]; if (v > 0) w.push(v / nib(a)); }
  const ratio = medianOf(w) / wPx;
  return { ratio, pl: ratio > 1.45 };
}

/** Read one proposition at frame (cx, cy, R px). */
/* Ink beside the ring, per half-degree, in the outer and inner bands: mass and radial
   coverage. Computed once, then summed over any slot window a layout proposes. */
function markProfile(rs, cx, cy, R, rf, bg) {
  const K = Math.max(8, Math.round(0.23 * R));
  const out = { K, oM: new Float64Array(720), iM: new Float64Array(720), oC: new Uint8Array(720 * K), iC: new Uint8Array(720 * K), area: 0 };
  const dth = 0.5 * D2R, dr = 0.23 / K;
  for (let b = 0; b < 720; b++) {
    const a = b * 0.5;
    const r0 = sampleAt(rf, a, 6);
    const s = Math.sin(a * D2R), c = -Math.cos(a * D2R);
    for (let k = 0; k < K; k++) {
      const ro = r0 + 0.13 + (k + 0.5) * dr, ri = r0 - 0.36 + (k + 0.5) * dr;
      const vo = rs.at(cx + s * ro * R, cy + c * ro * R), vi = rs.at(cx + s * ri * R, cy + c * ri * R);
      out.oM[b] += (vo - bg) * ro * dth * dr; out.iM[b] += (vi - bg) * ri * dth * dr;
      if (vo > CODEC.INK) out.oC[b * K + k] = 1;
      if (vi > CODEC.INK) out.iC[b * K + k] = 1;
    }
  }
  return out;
}

function slotFromProfile(pr, theta) {
  const { K } = pr;
  const b0 = Math.round((theta - 10) * 2), b1 = Math.round((theta + 10) * 2);
  let om = 0, im = 0;
  const oc = new Uint8Array(K), ic = new Uint8Array(K);
  for (let b = b0; b <= b1; b++) {
    const i = mod(b, 720);
    om += pr.oM[i]; im += pr.iM[i];
    for (let k = 0; k < K; k++) { oc[k] |= pr.oC[i * K + k]; ic[k] |= pr.iC[i * K + k]; }
  }
  const coverOut = oc.reduce((x, y) => x + y, 0) / K, coverIn = ic.reduce((x, y) => x + y, 0) / K;
  const hasOut = om > MARK_T && coverOut > COVER_T, hasIn = im > MARK_T && coverIn > COVER_T;
  return { out: om, inn: im, coverOut, coverIn, hasOut, hasIn };
}

const SLOTS = ['neg', ...SLOT_KEYS];

/** Read one proposition at frame (cx, cy, R px). */
export function readProp(rs, cx, cy, R, depth = 0) {
  // the expected base stroke in px: a nested ring is drawn heavier than its size alone
  const wPx = GEOM.W0 * R * (depth ? Math.pow(GEOM.SUB_RHO, GEOM.SUB_WEIGHT - 1) : 1);
  const { rr, tt } = readRing(rs, cx, cy, R, wPx);
  const rf = smoothRing(rr);
  const bg = background(rs, cx, cy, R, depth ? 0.6 : 1.56, depth ? 0.64 : 1.66);
  const subScore = depth === 0 ? ringScore(rs, cx, cy, R * GEOM.SUB_RHO, 0.82, 1.18) : 0;
  const hasSub = subScore > 0.55;
  const prof = markProfile(rs, cx, cy, R, rf, bg);

  // every layout the script allows: 8 role sets x 16 slot occupancies
  const sectorCache = new Map();
  const sector = (sec, book, tag) => {
    const k = tag + ':' + sec.start.toFixed(2) + ':' + sec.width.toFixed(2);
    if (!sectorCache.has(k)) sectorCache.set(k, readSector(rf, sec, book));
    return sectorCache.get(k);
  };
  const hyps = [];
  for (let h = 0; h < 8; h++) {
    const present = { agent: !!(h & 1), patient: !!(h & 2), recipient: !!(h & 4) };
    if (hasSub && !present.patient) continue;
    for (let o = 0; o < 1 << SLOTS.length; o++) {
      const occ = Object.fromEntries(SLOTS.map((k, i) => [k, !!(o & (1 << i))]));
      const lay = layoutFor(present, occ);
      let score = 0;
      const reads = { pred: sector(lay.items.pred, CODEBOOK.verbs, 'v') };
      score -= reads.pred.d;
      for (const role of ['agent', 'patient', 'recipient']) {
        if (!present[role]) continue;
        const rd = sector(lay.items[role], CODEBOOK.nouns, 'n');
        reads[role] = rd;
        score -= role === 'patient' && hasSub ? rd.flat : rd.d;
      }
      const slots = {};
      for (const k of SLOTS) {
        const s = lay.items[k];
        // a slot reads flat and light away from its mark: sampled every half cell, scored on the
        // cells' scale; a heavy stroke there is a plural sector the layout failed to explain
        const n = Math.max(1, Math.floor((s.width - 8) / 4.5));
        for (let j = 0; j < n; j++) {
          const a = s.start + 4 + (j + 0.5) * (s.width - 8) / n;
          if (occ[k] && angDistDeg(a, s.center) < 8) continue;
          score -= 0.5 * Math.min(2.9, ((sampleAt(rf, a) - 1) / A) ** 2);
          const th = tt[mod(Math.round(a), 360)] / (wPx * nib(a));
          if (th > 1.5) score -= 0.5;
        }
        const seen = k === 'neg' ? readGap(rr, s.center).neg : (() => { const r = slotFromProfile(prof, s.center); slots[k] = r; return r.hasIn || r.hasOut; })();
        if (seen !== occ[k]) score -= 4;
      }
      hyps.push({ present, occ, lay, score, reads, slots });
    }
  }
  hyps.sort((a, b) => b.score - a.score);
  const H = hyps[0];
  const lay = H.lay;
  const ent = (role) => {
    const rd = H.reads[role];
    const wt = readWeight(tt, lay.items[role], wPx);
    return { c: rd.id, num: FIXED_NUMBER[rd.id] || (wt.pl ? 'pl' : 'sg') };
  };
  const time = readTime(rs, cx, cy, R);
    const gap = readGap(rr, lay.items.neg.center);
  const prop = {
    type: 'prop',
    pred: H.reads.pred.id,
    agent: H.present.agent ? ent('agent') : null,
    patient: null,
    recipient: H.present.recipient ? ent('recipient') : null,
    time: time.value,
    neg: gap.neg,
    ...Object.fromEntries(SLOT_KEYS.map((k) => [k, slotValueFromBands(k, H.slots[k].hasIn, H.slots[k].hasOut, H.slots[k].inn, H.slots[k].out)])),
  };
  let sub = null;
  if (H.present.patient) {
    if (hasSub) { sub = readProp(rs, cx, cy, R * GEOM.SUB_RHO, depth + 1); prop.patient = sub.prop; }
    else prop.patient = ent('patient');
  }
  const conf = {
    pred: H.reads.pred.d2 - H.reads.pred.d,
    layout: hyps.length > 1 ? H.score - hyps[1].score : 9,
    time: Math.abs(Math.abs(time.lean) - 8),
  };
  return {
    prop, conf,
    debug: {
      rr, rf, tt, lay, reads: H.reads, hypCount: hyps.length,
      hyps: hyps.slice(0, 3).map((h) => ({ present: h.present, occ: h.occ, score: h.score })),
      time, slots: H.slots, gap, hasSub, subScore, bg, frame: { cx, cy, R },
    },
    sub,
  };
}

const angDistDeg = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function readBridge(rs) {
  const s = CODEC.RC, ox = CODEC.W / 2, oy = CODEC.H / 2;
  const minRun = 0.35 * GEOM.W0 * s;
  const col = (x) => {
    const runs = [];
    let st = null;
    for (let y = -0.62; y <= 0.63; y += 1 / s) {
      const ink = y <= 0.62 && rs.at(ox + x * s, oy + y * s) > CODEC.INK;
      if (ink && st === null) st = y;
      if (!ink && st !== null) { if ((y - st) * s >= minRun) runs.push((st + y) / 2); st = null; }
    }
    return runs;
  };
  const mid = col(0), left = col(-COMPOSE.col), right = col(COMPOSE.col);
  let rel = 'because';
  const c = mid.length ? mid.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a), mid[0]) : 0;
  if (mid.length && mid.every((y) => y < -0.2)) rel = 'after';
  else if (mid.length && mid.every((y) => y > 0.2)) rel = 'before';
  else if (left.length >= 2 && right.length >= 2) rel = 'despite';
  return { rel, mid, left, right, c };
}

/** Read a whole page. Returns { graph, parts, frame }. */
let squinted = null;
export function readPage(page) {
  squinted = squint(page, squinted && squinted.W === page.W ? squinted : undefined);
  const rs = squinted;
  const W = CODEC.W, H = CODEC.H;
  const one = ringScore(rs, W / 2, H / 2, CODEC.R1);
  const two = (ringScore(rs, W / 2 - COMPOSE.d * CODEC.RC, H / 2, CODEC.RC) + ringScore(rs, W / 2 + COMPOSE.d * CODEC.RC, H / 2, CODEC.RC)) / 2;
  if (two > one) {
    const a = readProp(rs, W / 2 - COMPOSE.d * CODEC.RC, H / 2, CODEC.RC);
    const b = readProp(rs, W / 2 + COMPOSE.d * CODEC.RC, H / 2, CODEC.RC);
    const br = readBridge(rs);
    // a reference code in the second ring takes the participant it names from the first
    const resolve = (p, first) => {
      for (const r of ['agent', 'patient', 'recipient']) {
        const e = p[r];
        if (e && REF_ROLE[e.c]) { const src = first[REF_ROLE[e.c]]; p[r] = src && src.type !== 'prop' ? { ...src } : { c: 'something', num: 'sg' }; }
      }
      return p;
    };
    const firstRefs = (p) => { for (const r of ['agent', 'patient', 'recipient']) if (p[r] && REF_ROLE[p[r].c]) p[r] = { c: 'something', num: 'sg' }; return p; };
    return { graph: { type: 'rel', rel: br.rel, a: firstRefs(a.prop), b: resolve(b.prop, a.prop) }, parts: { a, b, bridge: br }, frame: 'rel', score: { one, two } };
  }
  const p = readProp(rs, W / 2, H / 2, CODEC.R1);
  return { graph: p.prop, parts: { p }, frame: 'prop', score: { one, two } };
}
