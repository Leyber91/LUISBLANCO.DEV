/* ============================================================
   ai-health/rng.js — seeded randomness. Same seed, same cohort,
   on every machine: the lab's numbers are reproducible.
   mulberry32 for the stream, Box-Muller for normals.
   ============================================================ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Derive an independent stream from a seed and a label, so the
   training cohort, the test cohort and each ward bed never share
   draws (changing one never shifts another). */
export function streamFor(seed, label) {
  let h = 2166136261 ^ (seed >>> 0);
  const s = String(label);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return makeRng(h >>> 0);
}

export function makeRng(seed) {
  const u = mulberry32(seed);
  let spare = null;
  const rng = {
    u,
    uniform: (a = 0, b = 1) => a + (b - a) * u(),
    normal(mu = 0, sd = 1) {
      if (spare !== null) { const z = spare; spare = null; return mu + sd * z; }
      let x, y, r;
      do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
      const f = Math.sqrt(-2 * Math.log(r) / r);
      spare = y * f;
      return mu + sd * x * f;
    },
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
