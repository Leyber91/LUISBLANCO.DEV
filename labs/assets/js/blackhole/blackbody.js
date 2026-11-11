/* ============================================================
   blackhole/blackbody.js — the colour of a blackbody, computed.

   Planck's law integrated against the CIE 1931 2-degree colour-
   matching functions, using the multi-lobe Gaussian fit of
   Wyman, Sloan & Shirley (2013), "Simple Analytic Approximations
   to the CIE XYZ Color Matching Functions", JCGT 2(2), 1-11.
   XYZ -> linear sRGB with the IEC 61966-2-1 (D65) matrix.

   buildLUT() returns a Float32Array of N x 4 texels over
   log10(T / K) in [LOG_T0, LOG_T1]:
     rgb = linear sRGB chromaticity, scaled so luminance Y = 1
     a   = log10( Y(T) / (sigma T^4 / pi) ), the visible fraction
           of the radiated power (relative units)
   The shader multiplies chromaticity by 10^a * T^4 to get what an
   eye sees, or by T^4 alone for bolometric brightness.
   ============================================================ */

export const LOG_T0 = 2.8;   // 630 K
export const LOG_T1 = 8.6;   // 4e8 K
export const LUT_N = 256;

const H = 6.62607015e-34, C = 299792458, KB = 1.380649e-23;

function lobe(x, mu, s1, s2) { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); }
export function cmf(nm) {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}

/** Spectral radiance B_lambda(T) in W sr^-1 m^-3. */
function planck(lambdaM, T) {
  const x = H * C / (lambdaM * KB * T);
  if (x > 700) return 0;
  return (2 * H * C * C) / (lambdaM ** 5) / Math.expm1(x);
}

/** CIE XYZ of a blackbody at T (absolute, W sr^-1 m^-2 weighted). */
export function blackbodyXYZ(T) {
  let X = 0, Y = 0, Z = 0;
  for (let nm = 360; nm <= 830; nm += 2) {
    const b = planck(nm * 1e-9, T) * 2e-9;
    const [x, y, z] = cmf(nm);
    X += b * x; Y += b * y; Z += b * z;
  }
  return [X, Y, Z];
}

export function xyzToLinearSRGB([X, Y, Z]) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.2040 * Y + 1.0570 * Z,
  ];
}

export function buildLUT(n = LUT_N) {
  const out = new Float32Array(n * 4);
  const sigma = 5.670374419e-8;
  for (let i = 0; i < n; i++) {
    const lt = LOG_T0 + (LOG_T1 - LOG_T0) * i / (n - 1);
    const T = Math.pow(10, lt);
    const xyz = blackbodyXYZ(T);
    const Y = Math.max(xyz[1], 1e-300);
    let rgb = xyzToLinearSRGB(xyz.map((v) => v / Y));
    rgb = rgb.map((v) => Math.max(0, v));
    const vis = Math.log10(Y / (sigma * T ** 4 / Math.PI));
    out.set([rgb[0], rgb[1], rgb[2], vis], i * 4);
  }
  return out;
}

/** CSS colour of a blackbody, for the legend and the plate (display sRGB, max channel 1). */
export function cssColor(T) {
  const xyz = blackbodyXYZ(T);
  let rgb = xyzToLinearSRGB(xyz.map((v) => v / xyz[1])).map((v) => Math.max(0, v));
  const m = Math.max(...rgb);
  rgb = rgb.map((v) => v / m).map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  return `rgb(${rgb.map((v) => Math.round(255 * v)).join(',')})`;
}
