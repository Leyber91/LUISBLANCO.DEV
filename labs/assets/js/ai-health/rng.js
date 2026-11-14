/* ============================================================
   ai-health/rng.js — seeded randomness. Same seed, same cohort,
   on every machine: the lab's numbers are reproducible.
   mulberry32 for the stream, Box-Muller for normals, both from
   the labs' kit (kit/rng.js); the facade below is this lab's.
   ============================================================ */

import { mulberry32, streamSeed, normalFrom } from '../kit/rng.js';
export { mulberry32 };

/* Derive an independent stream from a seed and a label, so the
   training cohort, the test cohort and each ward bed never share
   draws (changing one never shifts another). */
export function streamFor(seed, label) {
  return makeRng(streamSeed(seed, label));
}

export function makeRng(seed) {
  const u = mulberry32(seed);
  const rng = {
    u,
    uniform: (a = 0, b = 1) => a + (b - a) * u(),
    normal: normalFrom(u),
    bern: (p) => (u() < p ? 1 : 0),
    exp: (mean) => -Math.log(1 - u()) * mean,
    pick(weights) {          // weights: { key: w } -> key
      const keys = Object.keys(weights);
      let t = u() * keys.reduce((s, k) => s + weights[k], 0);
      for (const k of keys) { t -= weights[k]; if (t <= 0) return k; }
      return keys[keys.length - 1];
    },
  };
  return rng;
}

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const logit = (p) => Math.log(p / (1 - p));
