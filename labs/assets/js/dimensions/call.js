/* ============================================================
   dimensions/call.js: the call, the scored act of Folded Space (level 1, ticket 1.08; BAR_L1 parts 07 and 08).

   Pure: no page, no storage, no clock. The visitor is shown three corners of the cube of size eps around a drawing
   and calls which one changes the network's answer. Each corner moves every pixel by eps, up or down, and is kept
   inside the pixel range.
   - 'template': the sign of the cell's template for the rival against the answer, which is the sharpest corner
     (the gradient of z_rival - z_answer inside the cell; Goodfellow, Shlens and Szegedy 2015 take the same sign);
   - 'random': a corner drawn from a generator seeded by the drawing;
   - 'ink': the drawing's own ink pushed darker where it is ink and brighter where it is not.
   The order of the three is shuffled by the same seed, so the right answer has no fixed place.
   A call is right when the corner it picks changes the answer. When no corner changes it, the call is not counted.
   ============================================================ */

import { forward, template, argmax } from './mlp.js';
import { mulberry32, fnv1a } from '../kit/rng.js';

export const KINDS = ['template', 'random', 'ink'];
export const LABELS = {
  template: 'The cell’s template, signed',
  random: 'A random corner',
  ink: 'The drawing’s own ink, darker and brighter',
};

/** The network from its file: float32 arrays in base64. */
export function netFromFile(o) {
  const dec = (s) => { const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); return Float64Array.from(new Float32Array(b.buffer)); };
  return { sizes: o.sizes.slice(), W: o.W.map(dec), b: o.b.map(dec) };
}

/** A digit from its file: uint8 in base64, as floats in [0, 1]. */
export function digitFrom(item) {
  return Float64Array.from(atob(item.pixels), (c) => c.charCodeAt(0) / 255);
}

/** The answer and its rival: the class with the largest score, and the one with the next largest. */
export function answerAndRival(net, x) {
  const z = Array.from(forward(net, x));
  const a = argmax(z);
  let r = a === 0 ? 1 : 0;
  for (let k = 0; k < z.length; k++) if (k !== a && z[k] > z[r]) r = k;
  return { answer: a, rival: r, z };
}

export function softmax(z) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function signsFor(kind, net, x, rival, answer, seed) {
  if (kind === 'template') return Array.from(template(net, x, rival, answer), (v) => (v >= 0 ? 1 : -1));
  if (kind === 'ink') return Array.from(x, (v) => (v > 0.5 ? 1 : -1));
  const rng = mulberry32(seed >>> 0);
  return Array.from(x, () => (rng() < 0.5 ? -1 : 1));
}

export function stepTo(x, signs, eps) {
  return Float64Array.from(x, (v, p) => { const u = v + eps * signs[p]; return u < 0 ? 0 : u > 1 ? 1 : u; });
}

/** The three candidates for a drawing, in a seeded order. `key` names the drawing (its index) for the seed. */
export function candidates(net, x, eps, key) {
  const { answer, rival, z } = answerAndRival(net, x);
  const lead0 = z[rival] - z[answer];
  const t = template(net, x, rival, answer);
  const seed = fnv1a('folded|call|' + key);
  const list = KINDS.map((kind, i) => {
    const signs = signsFor(kind, net, x, rival, answer, (seed + i * 2654435761) >>> 0);
    const xc = stepTo(x, signs, eps);
    const zc = Array.from(forward(net, xc));
    const read = argmax(zc);
    // Why a corner wins or loses (atlas tutoring.2.2): how far it moved the rival's score against the answer's,
    // measured by the network (lift), and what the drawing's cell's map predicts for the same step (predicted).
    let predicted = 0;
    for (let p = 0; p < t.length; p++) predicted += t[p] * (xc[p] - x[p]);
    return { kind, label: LABELS[kind], signs, xc, read, changes: read !== answer, lift: zc[rival] - zc[answer] - lead0, predicted };
  });
  const rng = mulberry32(seed);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return { answer, rival, list };
}

/** The verdict of a call: which candidates change the answer, whether the pick is one of them, and whether it counts. */
export function verdict(cands, picked) {
  const changed = cands.list.map((c, i) => (c.changes ? i : -1)).filter((i) => i >= 0);
  const counted = changed.length > 0;
  return { picked, changed, counted, right: counted && cands.list[picked].changes };
}

/** The flip ledger's entry (BAR_L1 part 11): the smallest size of the template's corner that moves the answer off
 *  its class, by bisection on [0, hi] to hi / 2^iters (the kill test's ledger). null when hi does not move it. The
 *  corner's signs are taken once, at the drawing, from the network given: a hardened network has its own. */
export function smallestFlip(net, x, hi = 0.5, iters = 12) {
  const { answer, rival } = answerAndRival(net, x);
  const signs = signsFor('template', net, x, rival, answer, 0);
  const off = (e) => argmax(forward(net, stepTo(x, signs, e))) !== answer;
  if (!off(hi)) return null;
  let lo = 0, top = hi;
  for (let r = 0; r < iters; r++) { const mid = (lo + top) / 2; if (off(mid)) top = mid; else lo = mid; }
  return top;
}

/** The verdict's reason, from computed values only: the picked corner's lift of the rival's score over the answer's,
 *  against the largest of the three. `fmt` writes a number. */
export function reasonOf(cands, picked, fmt = (v) => v.toFixed(1)) {
  const c = cands.list[picked];
  const best = cands.list.reduce((a, b) => (b.lift > a.lift ? b : a));
  const lift = (q) => `${fmt(q.lift)} (the cell’s map predicted ${fmt(q.predicted)})`;
  if (c === best) return `It raised ${cands.rival}'s score over ${cands.answer}'s by ${lift(c)}, the most of the three.`;
  return `It raised ${cands.rival}'s score over ${cands.answer}'s by ${lift(c)}; the ${best.kind === 'template' ? 'template’s corner' : best.label.toLowerCase()} raised it by ${fmt(best.lift)}.`;
}

/** The tally after one more verdict. A call that is not counted leaves it as it was. */
export function tally(t, v) {
  if (!v.counted) return { made: t.made, right: t.right };
  return { made: t.made + 1, right: t.right + (v.right ? 1 : 0) };
}
