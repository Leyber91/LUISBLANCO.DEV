/* ============================================================
   memes/random.js — deterministic seeded randomness. Shared by the
   comedy engine (candidate pick) and the canvas painter (backdrop),
   so the same seed always yields the same meme + the same art.
   ============================================================ */

/** mulberry32 PRNG — returns a function emitting floats in [0,1) */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** stable small-integer hash of a motif name, to perturb the seed per scene */
export function hashMotif(m) {
  let h = 0;
  for (const ch of (m || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 9973;
}
