/* ============================================================
   memes/random.js — deterministic seeded randomness. Shared by the
   comedy engine (candidate pick) and the canvas painter (backdrop),
   so the same seed always yields the same meme + the same art.
   ============================================================ */

/** mulberry32: floats in [0,1), the labs' shared generator (kit/rng.js) */
export { mulberry32 } from '../kit/rng.js';

/** stable small-integer hash of a motif name, to perturb the seed per scene */
export function hashMotif(m) {
  let h = 0;
  for (const ch of (m || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 9973;
}
