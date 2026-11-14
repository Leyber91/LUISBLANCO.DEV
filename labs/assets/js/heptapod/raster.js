/* ============================================================
   heptapod/raster.js — the page format the writer inks and the
   reader reads: a grey raster, one byte per pixel; and the seeded
   random numbers the noise uses.
   ============================================================ */

import { CODEC } from './config.js';

/* ---------------- deterministic randomness ---------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- the raster ---------------- */
export class Raster {
  constructor(W = CODEC.W, H = CODEC.H) { this.W = W; this.H = H; this.d = new Uint8ClampedArray(W * H); }
  clear() { this.d.fill(0); }
  disc(x, y, rad, erase = false) {
    const { W, H, d } = this;
    const R = rad + 0.5;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
    for (let yy = y0; yy <= y1; yy++) {
      const dy = yy + 0.5 - y;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx + 0.5 - x;
        const c = R - Math.sqrt(dx * dx + dy * dy);
        if (c <= 0) continue;
        const i = yy * W + xx;
        if (erase) { const v = 255 * (1 - Math.min(1, c)); if (v < d[i]) d[i] = v; }
        else { const v = 255 * Math.min(1, c); if (v > d[i]) d[i] = v; }
      }
    }
  }
  at(x, y) {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return 0;
    return this.d[yi * this.W + xi] / 255;
  }
}

