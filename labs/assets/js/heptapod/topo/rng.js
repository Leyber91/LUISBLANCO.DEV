/* ============================================================
   heptapod/topo/rng.js — seeded randomness and string hashing for
   the topology kernel. No DOM; runs in Node and in the page.
   ============================================================ */


/* mulberry32 and FNV-1a (motif indices for the order-free checksum) are the labs' shared ones. The three
   helpers below keep this kernel's conventions: the generator comes first, and shuffle works in place. */
import { mulberry32, fnv1a } from '../../kit/rng.js';
export { mulberry32, fnv1a };

export const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
