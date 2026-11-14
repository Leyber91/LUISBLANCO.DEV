/* ============================================================
   kit/rng.js — seeded randomness, once, for every lab.

   Why it exists: on 2026-11-14 the same generator was defined in
   nine files of the labs, and one copy had drifted (its state was
   not kept to 32 bits, so it left the sequence after about five
   million draws). A lab that needs a random number imports it
   from here. Each function below was lifted from the best copy
   then in the repository; the source is named beside it.

   Same seed, same numbers, on every machine: no function here
   reads a clock or Math.random.
   ============================================================ */

/* mulberry32: a 32-bit generator with a 32-bit state. Returns a function that yields numbers in [0, 1).
   (ai-health/rng.js; identical to heptapod/raster.js and seven other copies over 200,000 draws.) */
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

/* FNV-1a, 32 bit: a string to an unsigned integer. basis lets a caller fold a number into the start,
   which is how one seed yields independent streams by label. (heptapod/topo/rng.js, altverse/rng.js.) */
export function fnv1a(str, basis = 0x811c9dc5) {
  let h = basis >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* A seed from a label of several parts: seedOf('species', 0.75, 3). Parts are joined with "|", so
   ('a', 'b|c') and ('a|b', 'c') collide; keep "|" out of parts. (heptapod/pod/species.js.) */
export const seedOf = (...parts) => fnv1a(parts.join('|'));

/* A generator of its own for one label under one seed, so changing how many numbers one part of a lab
   draws never shifts another part. (ai-health/rng.js streamFor, without its facade.) */
export const streamSeed = (seed, label) => fnv1a(String(label), (0x811c9dc5 ^ (seed >>> 0)) >>> 0);

/* An integer in lo..hi, both included. */
export const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/* One item of a list. The list comes first, as in Array methods. */
export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* A shuffled copy; the list given is left as it was. (heptapod/pod/species.js.) */
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* One item drawn with the given weights. A weight of zero is never drawn: the comparison is strict,
   where two older copies returned a zero-weight first item on a draw of exactly 0. (heptapod/pod/proxy.js.) */
export function weightedPick(items, weights, rng) {
  let tot = 0;
  for (const w of weights) tot += w;
  let x = rng() * tot;
  for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
  return items[items.length - 1];
}

/* Normal deviates by the polar Box-Muller method, keeping the second value of each pair for the next
   call. Returns a function (mean, sd) -> number bound to one generator. (ai-health/rng.js.) */
export function normalFrom(rng) {
  let spare = null;
  return function normal(mu = 0, sd = 1) {
    if (spare !== null) { const z = spare; spare = null; return mu + sd * z; }
    let x, y, r;
    do { x = 2 * rng() - 1; y = 2 * rng() - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
    const f = Math.sqrt(-2 * Math.log(r) / r);
    spare = y * f;
    return mu + sd * x * f;
  };
}
