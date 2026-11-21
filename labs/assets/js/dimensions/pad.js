/* ============================================================
   dimensions/pad.js: a drawing reduced to 28 by 28 the way MNIST's digits were (ticket 1.05). Pure.

   MNIST's own page (archived 2019-12-30, read for the road's ledger): the digits were "size normalized to fit in a
   20x20 pixel box while preserving their aspect ratio", with grey levels from anti-aliasing, then "centered in a
   28x28 image by computing the center of mass of the pixels, and translating the image so as to position this point
   at the center of the 28x28 field". So:
   1. crop to the ink (pixels above INK);
   2. resample so the longer side is 20 pixels, by averaging SS x SS samples per target pixel (the anti-aliasing);
   3. translate by whole pixels so the centre of mass sits at the field's centre, (14, 14) in pixel-edge coordinates.
   The input is the pad's grey levels in [0, 1], row-major, ink bright.
   ============================================================ */

export const INK = 0.05, BOX = 20, FIELD = 28, SS = 4;

function sample(gray, W, H, x, y) { // bilinear, pixel centres at i + 0.5
  const fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : gray[j * W + i]);
  return (1 - ty) * ((1 - tx) * at(x0, y0) + tx * at(x0 + 1, y0)) + ty * ((1 - tx) * at(x0, y0 + 1) + tx * at(x0 + 1, y0 + 1));
}

/** The bounding box of the ink, or null when there is none. */
export function inkBox(gray, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (gray[j * W + i] > INK) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The pad's grey levels as a 28 by 28 digit, MNIST's way. An empty pad gives zeros. */
export function reduce(gray, W, H) {
  const out = new Float64Array(FIELD * FIELD);
  const b = inkBox(gray, W, H);
  if (!b) return out;
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  const s = BOX / Math.max(bw, bh);
  const nw = Math.max(1, Math.round(bw * s)), nh = Math.max(1, Math.round(bh * s));
  const small = new Float64Array(nw * nh);
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    let acc = 0;
    for (let v = 0; v < SS; v++) for (let u = 0; u < SS; u++) {
      acc += sample(gray, W, H, b.x0 + (i + (u + 0.5) / SS) / s, b.y0 + (j + (v + 0.5) / SS) / s);
    }
    small[j * nw + i] = Math.min(1, acc / (SS * SS));
  }
  let m = 0, mx = 0, my = 0;
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) { const w = small[j * nw + i]; m += w; mx += w * (i + 0.5); my += w * (j + 0.5); }
  const ox = Math.round(FIELD / 2 - mx / m), oy = Math.round(FIELD / 2 - my / m);
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const X = i + ox, Y = j + oy;
    if (X >= 0 && Y >= 0 && X < FIELD && Y < FIELD) out[Y * FIELD + X] = small[j * nw + i];
  }
  return out;
}

/** The centre of mass of a 28 by 28 digit, in pixel-edge coordinates. */
export function centreOfMass(x) {
  let m = 0, mx = 0, my = 0;
  for (let p = 0; p < x.length; p++) { const w = x[p]; m += w; mx += w * ((p % FIELD) + 0.5); my += w * (Math.floor(p / FIELD) + 0.5); }
  return m > 0 ? [mx / m, my / m] : null;
}
