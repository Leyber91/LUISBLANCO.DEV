/* ============================================================
   heptapod/topo/rng.js — seeded randomness and string hashing for
   the topology kernel. No DOM; runs in Node and in the page.
   ============================================================ */

/* mulberry32: the same generator G1 uses (raster.js), kept here so
   the kernel does not import G1's config. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* FNV-1a, 32 bit: motif indices for the order-free checksum. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
