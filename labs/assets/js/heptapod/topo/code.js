/* ============================================================
   heptapod/topo/code.js — the motif code (film track F3, experiment
   E2; PLAN P11, P12, P16, P19, P21, P22).

   A motif is K cells of Q values (Q = 3: the line's normal offset is
   -a, 0 or +a; K = 9). A word is held as its base-Q number, first cell
   most significant, so every test below is integer arithmetic and the
   code is the same on every engine (BAR_F G5).

   The code satisfies, over every pair of its words:
     - comma-free: no word appears inside two others written side by
       side, at any shift, so a reader starting anywhere finds the
       frame (Golomb, Gordon and Welch 1958; Crick, Griffith and Orgel
       1957);
     - no word's reversal, at any rotation, is in the code, and no word
       is its own reversal up to rotation, so a mirror is detectable;
     - closed under the sign flip (-a and +a swap, 0 stays), so every
       concept can be denied by turning its cells inward (P16), and the
       flips are inside the comma-free test;
     - no run of more than RUN equal cells, within a word or across any
       boundary between two words (P11);
     - any two words differ in at least DIST cells, so one misread cell
       is not a word (P12).
   It is built by a seeded greedy search over flip pairs, then cut into
   the partitions of PLAN 3.2 in the order the pairs were found. Whether
   the stack fits at K = 9 is what E2 measures (PLAN risk 3): the result
   says which partitions were filled and by how much.
   ============================================================ */

import { mulberry32, shuffle } from './rng.js';
import { TOPO } from './config.js';

export const Q = 3, K = TOPO.K, RUN = 3, DIST = 2;
const P = Array.from({ length: K + 1 }, (_, i) => Q ** i);
export const N = P[K];

/* the partitions of PLAN 3.2 and 3.6: radicals come as flip pairs (affirmed and denied); the rest are single words */
export const PARTITIONS = Object.freeze([
  ['radical', 96, 'pair', 'a part of a concept; a concept is 1 to 3 of them, so related words share parts; the flip denies it (P13, P16)'],
  ['marker', 48, 'word', 'who did what to whom, written where two shapes meet, once on each side (P14)'],
  ['inflection', 40, 'word', 'aspect, number, quantity, mode (a question is a mode), time and evidence (P14)'],
  ['letter', 27, 'word', 'the letters of a name, the one place read in order (P7)'],
  ['numeral', 36, 'word', 'digits 1 to 9 at 1, 10, 100 and 1000; a number is their sum, in no order (P20)'],
  ['default', 6, 'word', 'a default said out loud, so lost ink is never read as a default (P21)'],
  ['filler', 4, 'word', 'nothing: fills a rim made longer than its words need (P22)'],
  ['checksum', TOPO.checksumP, 'word', 'the sum of the words of the shape, so a misread shape refuses instead of lying (P19)'],
]);

export const digits = (w) => { const d = new Int8Array(K); for (let i = K - 1; i >= 0; i--) { d[i] = w % Q; w = (w - d[i]) / Q; } return d; };
export const fromDigits = (d) => { let w = 0; for (let i = 0; i < K; i++) w = w * Q + d[i]; return w; };
export const rot = (w, i) => (w % P[K - i]) * P[i] + Math.floor(w / P[K - i]); // the word read from cell i on
export const rev = (w) => fromDigits(digits(w).reverse());
export const flip = (w) => fromDigits(digits(w).map((x) => Q - 1 - x));
export const canon = (w) => { let m = w; for (let i = 1; i < K; i++) m = Math.min(m, rot(w, i)); return m; };
export const aperiodic = (w) => { for (let i = 1; i < K; i++) if (K % i === 0 && rot(w, i) === w) return false; return true; };
/* the K - i last cells of a followed by the i first cells of b */
export const overlap = (a, b, i) => (a % P[K - i]) * P[i] + Math.floor(b / P[K - i]);
export const hamming = (a, b) => { const x = digits(a), y = digits(b); let n = 0; for (let i = 0; i < K; i++) if (x[i] !== y[i]) n++; return n; };
export const first = (w) => Math.floor(w / P[K - 1]);
export const last = (w) => w % Q;
export const lead = (w) => { const d = digits(w); let n = 1; while (n < K && d[n] === d[0]) n++; return n; };
export const trail = (w) => { const d = digits(w); let n = 1; while (n < K && d[K - 1 - n] === d[K - 1]) n++; return n; };
export const maxRun = (w) => { const d = digits(w); let best = 1, n = 1; for (let i = 1; i < K; i++) { n = d[i] === d[i - 1] ? n + 1 : 1; best = Math.max(best, n); } return best; };
/* may b follow a without a run longer than RUN across the boundary */
export const joins = (a, b) => last(a) !== first(b) || trail(a) + lead(b) <= RUN;

/* The code: a seeded greedy search over flip pairs. Returns the pairs in the order found. */
export function buildCode({ seed = 20261116, want = Infinity } = {}) {
  const rnd = mulberry32(seed);
  const inCode = new Uint8Array(N), overCount = new Uint16Array(N), banned = new Uint8Array(N); // by class representative
  const words = [], pairs = [];
  const reps = [];
  for (let w = 0; w < N; w++) if (aperiodic(w) && canon(w) === w) reps.push(w);
  shuffle(reps, rnd);
  const ok1 = (w) => aperiodic(w) && maxRun(w) <= RUN && canon(rev(w)) !== canon(w) && !banned[canon(w)];
  for (const rep of reps) {
    if (pairs.length >= want) break;
    if (banned[rep]) continue;
    const order = shuffle(Array.from({ length: K }, (_, i) => i), rnd);
    for (const r of order) {
      const w = rot(rep, r), f = flip(w);
      if (!ok1(w) || !ok1(f) || canon(f) === canon(w)) continue;
      if (canon(rev(w)) === canon(f)) continue; // a word and its flip would be a reversal pair
      const add = [w, f];
      if (add.some((x) => overCount[x])) continue; // a new word inside two old ones
      if (hamming(w, f) < DIST || words.some((x) => hamming(x, w) < DIST || hamming(x, f) < DIST)) continue;
      const all = words.concat(add);
      let bad = false;
      for (const x of all) {
        for (const y of add) if (!joins(x, y) || !joins(y, x)) { bad = true; break; }
        if (bad) break;
      }
      if (bad) continue;
      const fresh = [];
      for (const x of all) {
        for (const y of all) {
          if (!add.includes(x) && !add.includes(y)) continue;
          for (let i = 1; i < K; i++) {
            const o = overlap(x, y, i);
            if (inCode[o] || o === w || o === f) { bad = true; break; }
            fresh.push(o);
          }
          if (bad) break;
        }
        if (bad) break;
      }
      if (bad) continue;
      for (const x of add) { inCode[x] = 1; words.push(x); banned[canon(x)] = 1; banned[canon(rev(x))] = 1; }
      for (const o of fresh) overCount[o]++;
      pairs.push([w, f]);
      break;
    }
  }
  return { seed, pairs, words };
}

/* the partitions, cut from the pairs in the order found: radicals take whole pairs, the rest take single words */
export function partition(code) {
  const out = {}, short = {};
  let p = 0;
  const loose = [];
  for (const [name, n, kind] of PARTITIONS) {
    out[name] = [];
    if (kind === 'pair') { while (out[name].length < n && p < code.pairs.length) out[name].push(code.pairs[p++]); }
    else {
      while (out[name].length < n) {
        if (!loose.length) { if (p >= code.pairs.length) break; loose.push(...code.pairs[p++]); }
        out[name].push(loose.shift());
      }
    }
    if (out[name].length < n) short[name] = n - out[name].length;
  }
  return { parts: out, short, unused: code.pairs.length - p, looseLeft: loose.length };
}

/* The seed of the lab's code, chosen by a rule and not by hand: of the seeds 1 to SEED_SEARCH, the one whose code
   has the most flip pairs (the most room left after the partitions are filled), the lowest on a tie. Measured
   2026-11-16: 151 to 227 pairs, median 201; 21 of 30 seeds fill every partition; seed 6 gives 227.
   tests/code.test.mjs derives it again on every run. */
export const SEED_SEARCH = 30, CODE_SEED = 6;
export const theCode = () => buildCode({ seed: CODE_SEED });

export const show = (w) => Array.from(digits(w), (x) => '-0+'[x]).join('');
