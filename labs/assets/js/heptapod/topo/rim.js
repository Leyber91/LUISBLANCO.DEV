/* ============================================================
   heptapod/topo/rim.js — what each lobe's rim carries, and where
   (plan 3.4.2 and 3.4.4 step 3).

   A rim is read with the lobe's interior on the left (counter-
   clockwise). Contacts (neck mouths, kiss points) cut it into free
   arcs. At every contact where the lobe is the dependent it wears a
   collar: two translated copies of the marker motif, one on each side
   of the contact, with the inflections following the second copy in
   walking direction (P14; 3.4.2 counts "2 collars (4 motifs)"). So the
   arc before a contact ends with [marker] and the arc after it starts
   with [marker, inflections...]. Its own
   motifs (determinant, radicals, features, echo index, checksum, and
   for a name its letters in order) fill the remaining arcs in whole
   motifs; a motif never straddles a contact.

   The rim code here is abstract: each motif is a symbol with 9 cells
   of nominal length l. E2 replaces the symbols by curvature cells; the
   allocation and the decoder's framing contract stay.
   ============================================================ */

import { TOPO } from './config.js';
import { fnv1a } from './rng.js';

const MOTIF = TOPO.K * TOPO.cellLen;
const TAU = 2 * Math.PI;

export const isCollar = (sym) => sym.charCodeAt(0) === 77 /* M */ || sym.charCodeAt(0) === 73 /* I */;
export const motifIndex = (sym) => fnv1a(sym) % TOPO.checksumP;

/* A lobe as a reader identifies it: its own motifs (no collars, checksum
   or fillers), letters in reading order, everything else as a multiset. */
export function lobeKey(syms) {
  const letters = [], rest = [];
  for (const s of syms) {
    const c = s[0];
    if (c === 'M' || c === 'I' || c === 'S' || c === 'Z') continue;
    if (c === 'L') letters.push(s.slice(2)); else rest.push(s);
  }
  rest.sort();
  return rest.join(' ') + '|' + letters.join('');
}

/* Radius a lobe needs for its code (3.4.2): every motif, every contact
   zone, two collar copies per dependent contact, one separator and one
   motif of fragmentation slack per free arc. Relaxed upward only. */
export function estimateRadius(ownCount, contacts) {
  let C = MOTIF * (ownCount + 1);
  for (const c of contacts) C += 2 * c.zh + (c.collar ? (c.collar.length + 1) * MOTIF : 0);
  const arcs = Math.max(1, contacts.length);
  C += 2 * arcs * MOTIF + 2;
  return Math.max(TOPO.rMin, C / TAU);
}

const normAng = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

/* contacts: [{ ang, zh, collar: string[] | null, id }]; own: the lobe's
   own motifs (letters last, in reading order); anchorId: the contact
   the lobe's frame starts from (its neck to its layout parent).
   Returns { ok, placements: [{ sym, t0, t1 }], reason }. Arc length t
   runs counter-clockwise from angle 0 and may pass 2*pi*r on the
   last arc. */
export function allocateRim(r, own, contacts, anchorId) {
  const C = TAU * r;
  const eps = 1e-9;
  const cs = contacts.map((c) => ({ ...c, ang: normAng(c.ang) })).sort((a, b) => a.ang - b.ang || a.id - b.id);
  const m = cs.length;
  const arcs = [];
  if (!m) arcs.push({ t0: 0, t1: C, start: null, end: null });
  else {
    for (let i = 0; i < m; i++) {
      const c = cs[i], nx = cs[(i + 1) % m];
      const t0 = c.ang * r + c.zh;
      const t1 = nx.ang * r - nx.zh + (i === m - 1 ? C : 0);
      if (t1 - t0 < -eps) return { ok: false, reason: 'contact zones overlap on the rim' };
      arcs.push({ t0, t1, start: c, end: nx });
    }
  }
  let first = 0;
  if (anchorId != null) { const k = arcs.findIndex((a) => a.start && a.start.id === anchorId); if (k >= 0) first = k; }

  const letters = own.filter((s) => s.startsWith('L:'));
  const rest = own.filter((s) => !s.startsWith('L:')).sort();
  const queue = [...rest, 'S:?', ...letters];
  let qi = 0;
  const placements = [];
  const put = (sym, t0) => { placements.push({ sym, t0, t1: t0 + MOTIF }); return t0 + MOTIF; };

  for (let s = 0; s < arcs.length; s++) {
    const a = arcs[(first + s) % arcs.length];
    const A = a.start && a.start.collar ? a.start.collar : null;          // after-copy: marker + inflections
    const B = a.end && a.end.collar ? [a.end.collar[0]] : null;           // before-copy: the marker
    const len = a.t1 - a.t0;
    const base = MOTIF * ((A ? A.length : 0) + (B ? B.length : 0));
    const room = len - base;
    if (room < -eps) return { ok: false, reason: 'a free arc is shorter than its collars' };
    const cap = Math.floor((room + eps) / MOTIF);
    let take = Math.min(cap, queue.length - qi);
    if (take < queue.length - qi && queue.slice(qi).some((x) => x.startsWith('L:')) && s < arcs.length - 1) {
      // letters stay contiguous: never split a name across arcs
      const firstLetter = queue.indexOf(queue.find((x, i) => i >= qi && x.startsWith('L:')));
      if (qi + take > firstLetter) take = Math.max(0, firstLetter - qi);
    }
    let filler = false;
    if (take === 0 && A && B) filler = true;
    else if (take === 0 && (A || B) && room < TOPO.tAdj + 1.5) filler = true;
    if (filler && cap < 1) return { ok: false, reason: 'no room for the filler that keeps a collar unambiguous' };
    let t = a.t0;
    if (A) for (const sym of A) t = put(sym, t);
    for (let k = 0; k < take; k++) t = put(queue[qi++], t);
    if (filler) t = put('Z', t);
    if (B) { let tb = a.t1 - MOTIF * B.length; for (const sym of B) tb = put(sym, tb); }
  }
  if (qi < queue.length) return { ok: false, reason: 'the rim cannot hold the lobe code' };
  let sum = 0;
  for (const p of placements) if (p.sym !== 'S:?') sum += motifIndex(p.sym);
  const sv = 'S:' + (sum % TOPO.checksumP);
  for (const p of placements) if (p.sym === 'S:?') p.sym = sv;
  placements.sort((x, y) => x.t0 - y.t0);
  return { ok: true, placements, C };
}

/* Read the motif under arc position t of a rim (with wrap). */
export function motifAt(placements, C, t) {
  let lo = 0, hi = placements.length - 1;
  // placements are sorted by t0; the last may wrap past C
  for (const tt of [t, t + C]) {
    lo = 0; hi = placements.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = placements[mid];
      if (tt < p.t0) hi = mid - 1;
      else if (tt >= p.t1) lo = mid + 1;
      else return { sym: p.sym, cell: Math.min(TOPO.K - 1, Math.floor(TOPO.K * (tt - p.t0) / (p.t1 - p.t0))) };
    }
  }
  return null;
}
