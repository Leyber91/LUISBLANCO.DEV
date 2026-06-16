/* ============================================================
   altverse/rng.js — deterministic randomness.
   Everything reproducible in Altverse (ECHO picks, map, identity)
   draws from a seed = hash(normalized divergence). Same seed ->
   byte-identical world.
   ============================================================ */

// FNV-1a 32-bit string hash -> uint32 seed
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG: tiny, fast, good enough for content selection
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
