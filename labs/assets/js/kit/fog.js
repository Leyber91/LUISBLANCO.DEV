/* ============================================================
   kit/fog.js: seeded smooth noise and a tileable fog texture, for
   every lab of the Contact world (ink in fog).

   Lifted on 2026-11-21 from heptapod/pod/medium.js, unchanged, with
   its second caller, the Orthogonal plate (Alternate Reality), whose
   lineage stands in a fog field. medium.js imports these from here
   and re-exports them, so Heptapod's own tests still check them
   (tests/medium.test.mjs, section 7); kit/tests/fog.test.mjs checks
   that the lift changed no value.

   Pure computation: no DOM, no clock, no Math.random. Same seed,
   same fog, on every machine.
   ============================================================ */

function hash3(seed, x, y, z) {
  let h = (seed ^ Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);

/** Value noise in [-1, 1] at (x, y, z), on an integer lattice. */
export function noise3(seed, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    v += w * hash3(seed, xi + dx, yi + dy, zi + dz);
  }
  return 2 * v - 1;
}

/**
 * A tileable grey fog texture, n x n, values 0..255: fractal value noise whose lattice wraps at the edges, so
 * a pattern of it repeats without a seam. Seeded, so one being's fog is always the same fog.
 */
export function fogNoise(seed, n = 256, cells = 4, octaves = 5) {
  const out = new Uint8ClampedArray(n * n);
  const val = (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
    const w = (a) => ((a % period) + period) % period;
    const h = (a, b) => hash3(seed + period, w(a), w(b), 0);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0, amp = 1, norm = 0, p = cells;
    for (let o = 0; o < octaves; o++) { v += amp * val((i / n) * p, (j / n) * p, p); norm += amp; amp *= 0.55; p *= 2; }
    out[j * n + i] = Math.round(255 * Math.min(1, Math.max(0, (v / norm - 0.5) * 1.9 + 0.5)));
  }
  return out;
}
