/* ============================================================
   altverse/rng.js — deterministic randomness.
   Everything reproducible in Altverse (ECHO picks, map, identity)
   draws from a seed = hash(normalized divergence). Same seed ->
   byte-identical world.
   ============================================================ */

// The generator and the hash are the labs' shared ones (kit/rng.js). The copy that lived here let its
// state grow past 32 bits and left the sequence after 4,917,759 draws for seed 1; the first draws are
// unchanged, so every world replays as before.
import { mulberry32, fnv1a } from '../kit/rng.js';
export { mulberry32 };

// FNV-1a 32-bit string hash -> uint32 seed
export const hashStr = (str) => fnv1a(str);

// a small ergonomic RNG facade
export function makeRng(seed) {
  const r = mulberry32(seed >>> 0);
  return {
    next: r,
    float: (a = 0, b = 1) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    sample: (arr, n) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a.slice(0, n);
    },
  };
}
