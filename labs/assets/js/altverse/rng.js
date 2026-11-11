/* ============================================================
   altverse/rng.js — deterministic randomness and noise.
   Everything reproducible in Altverse draws from a seed: the same
   seed, divergence and fork path give the same world, byte for
   byte, which is what makes a world shareable by URL.
   ============================================================ */

/* FNV-1a 32-bit string hash -> uint32 */
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* mulberry32: small, fast, good enough for content and terrain */
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

export function makeRng(seed) {
  const r = mulberry32(seed >>> 0);
  return {
    next: r,
    float: (a = 0, b = 1) => a + r() * (b - a),
    int: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/* ---- 3D gradient noise (improved Perlin), seeded permutation ----
   Sampled on the unit sphere so the map wraps at the antimeridian. */
const GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export function makeNoise(seed) {
  const r = mulberry32(seed ^ 0x51ed270b);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function dot(h, x, y, z) { const g = GRAD[h & 15]; return g[0] * x + g[1] * y + g[2] * z; }

  function noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(dot(perm[AA], x, y, z), dot(perm[BA], x - 1, y, z), u),
        lerp(dot(perm[AB], x, y - 1, z), dot(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(dot(perm[AA + 1], x, y, z - 1), dot(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(dot(perm[AB + 1], x, y - 1, z - 1), dot(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }

  /* fractal sum, roughly in [-1, 1] */
  function fbm(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }

  /* ridged fractal in [0, 1], for mountain belts */
  function ridged(x, y, z, oct = 4) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise3(x * f, y * f, z * f) * 1.6); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  }

  return { noise3, fbm, ridged };
}

/* lon/lat in degrees -> unit-sphere xyz */
export function sph(lon, lat) {
  const l = lon * Math.PI / 180, p = lat * Math.PI / 180;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}
