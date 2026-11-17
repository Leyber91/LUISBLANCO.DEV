/* ============================================================
   heptapod/topo/trig.js — a sine and cosine built only from operations
   IEEE 754 rounds exactly (+ - * /, Math.round), so every engine
   computes the same bits (BAR_F G5; ROAD 4a: "a sine and cosine of
   the kit's own built from them"). Math.sin and Math.cos are left to
   each engine's implementation and differ in the last bits.

   Range reduction to [-pi/4, pi/4] by the nearest multiple of pi/2,
   with pi/2 split in two doubles (Cody and Waite 1980, from memory);
   then Taylor polynomials to degree 17 and 16, whose truncation error
   at pi/4 is below 5e-17. Good to about 1e-15 for |x| below 1e5,
   which is all a figure needs. Candidate for the shared kit
   (labs/assets/js/kit) when a second lab needs it.
   ============================================================ */

export const PI = 3.141592653589793;
const HALF_PI_HI = 1.5707963267948966;      // pi/2 rounded to a double
const HALF_PI_LO = 6.123233995736766e-17;   // pi/2 minus HALF_PI_HI

function sinPoly(r) {
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800
    + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000 + r2 * (1 / 355687428096000)))))))));
}
function cosPoly(r) {
  const r2 = r * r;
  return 1 + r2 * (-1 / 2 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800
    + r2 * (1 / 479001600 + r2 * (-1 / 87178291200 + r2 * (1 / 20922789888000))))))));
}
function reduce(x) {
  const k = Math.round(x / HALF_PI_HI);
  return [(x - k * HALF_PI_HI) - k * HALF_PI_LO, ((k % 4) + 4) % 4];
}

export function sinK(x) {
  const [r, q] = reduce(x);
  return q === 0 ? sinPoly(r) : q === 1 ? cosPoly(r) : q === 2 ? -sinPoly(r) : -cosPoly(r);
}
export function cosK(x) {
  const [r, q] = reduce(x);
  return q === 0 ? cosPoly(r) : q === 1 ? -sinPoly(r) : q === 2 ? -cosPoly(r) : sinPoly(r);
}
