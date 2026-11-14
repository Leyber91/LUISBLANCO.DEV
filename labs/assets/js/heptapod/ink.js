/* ============================================================
   heptapod/ink.js — putting a semagram on the page, with noise.

   The page is rasterised here, not by the browser's canvas, so the
   codec is identical everywhere and testable outside a browser.
   ============================================================ */

import { CODEC, NOISE } from './config.js';
import { specStrokes } from './geometry.js';
import { Raster, mulberry32 } from './raster.js';

export const frameXf = (type) => ({ s: type === 'rel' ? CODEC.RC : CODEC.R1, ox: CODEC.W / 2, oy: CODEC.H / 2 });

export function drawInk(raster, ink, xf) {
  const { s, ox, oy } = xf;
  for (const st of ink.strokes) {
    if ((st.alpha ?? 1) < 0.5) continue;
    const p = st.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const ax = ox + s * p[i][0], ay = oy + s * p[i][1], bx = ox + s * p[i + 1][0], by = oy + s * p[i + 1][1];
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(L / 0.6));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const w = p[i][2] + (p[i + 1][2] - p[i][2]) * t;
        raster.disc(ax + (bx - ax) * t, ay + (by - ay) * t, Math.max(1.2, (w * s) / 2)); // a line under 2.4 px would not survive the reader's squint
      }
    }
  }
  for (const d of ink.dots) if ((d.alpha ?? 1) >= 0.5) raster.disc(ox + s * d.x, oy + s * d.y, Math.max(0.6, d.rad * s));
}

/* ---------------- the noise model ---------------- */
export function makeJitter(amp, rnd) {
  if (!(amp > 0)) return null;
  const waves = Array.from({ length: 6 }, () => {
    const a = rnd() * Math.PI * 2, k = (2 * Math.PI / NOISE.tremorWave) * (0.6 + 0.8 * rnd());
    return { kx: k * Math.cos(a), ky: k * Math.sin(a), px: rnd() * 6.283, py: rnd() * 6.283 };
  });
  return (x, y) => {
    let dx = 0, dy = 0;
    for (const w of waves) { const ph = w.kx * x + w.ky * y; dx += Math.sin(ph + w.px); dy += Math.sin(ph + w.py); }
    return [amp * dx / 2.45, amp * dy / 2.45];
  };
}

/**
 * The noise, in its units. Either the mixed knob { sigma } or one type:
 *   { jitter }   smooth tremor of every stroke, peak displacement as a fraction of the ring radius
 *   { dropout }  fraction of the total stroke length erased, in gaps of 0.05 ring radius
 *   { blots }    number of ink splats, radius 0.02 to 0.05 ring radius
 */
export function noiseParams(n = {}) {
  if (typeof n === 'number') n = { sigma: n };
  if (n.sigma != null) {
    const s = n.sigma;
    return { jitter: NOISE.tremor * s, dropout: 0, blots: Math.round(NOISE.blots * s), blotScale: 0.5 + s, erosion: Math.round(NOISE.erosion * s), salt: NOISE.salt * s, pepper: NOISE.pepper * s, key: 's' + s };
  }
  return { jitter: n.jitter || 0, dropout: n.dropout || 0, blots: Math.round(n.blots || 0), blotScale: 1.2, erosion: 0, salt: 0, pepper: 0, key: JSON.stringify(n) };
}

/* Erase a fraction of the stroke length in short gaps placed uniformly along all strokes. */
function dropStrokes(ink, frac, rnd) {
  if (!(frac > 0)) return ink;
  let total = 0;
  const lens = ink.strokes.map((st) => {
    const L = [];
    for (let i = 0; i + 1 < st.pts.length; i++) { const a = st.pts[i], b = st.pts[i + 1]; L.push(Math.hypot(b[0] - a[0], b[1] - a[1])); total += L[L.length - 1]; }
    return L;
  });
  const gap = 0.05;
  const cuts = Array.from({ length: Math.round((frac * total) / gap) }, () => rnd() * total).sort((x, y) => x - y);
  const strokes = [];
  let at = 0, k = 0;
  ink.strokes.forEach((st, si) => {
    let run = [st.pts[0]];
    lens[si].forEach((L, i) => {
      while (k < cuts.length && cuts[k] + gap < at) k++;
      const hit = k < cuts.length && cuts[k] <= at + L;
      at += L;
      if (hit) { if (run.length > 1) strokes.push({ ...st, pts: run }); run = [st.pts[i + 1]]; }
      else run.push(st.pts[i + 1]);
    });
    if (run.length > 1) strokes.push({ ...st, pts: run });
  });
  const dots = ink.dots.filter(() => rnd() > frac);
  return { strokes, dots };
}

/** Render a spec to the codec raster with ink noise (see noiseParams). Returns the raster. */
export function inkPage(spec, noise = 0, seed = 1, raster = new Raster()) {
  const np = noiseParams(noise);
  let h = 0;
  for (const ch of np.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = mulberry32(seed * 7919 + h);
  const xf = frameXf(spec.type);
  let ink = specStrokes(spec, { jitter: makeJitter(np.jitter, rnd) });
  ink = dropStrokes(ink, np.dropout, rnd);
  raster.clear();
  drawInk(raster, ink, xf);
  const pts = [];
  for (const st of ink.strokes) for (const q of st.pts) pts.push(q);
  const pick = () => pts[Math.floor(rnd() * pts.length)];
  const lerp = (r, t) => r[0] + (r[1] - r[0]) * t;
  for (let i = 0; i < np.blots; i++) {
    let x, y;
    if (rnd() < 0.55 && pts.length) { const q = pick(); x = q[0] + (rnd() - 0.5) * 0.16; y = q[1] + (rnd() - 0.5) * 0.16; }
    else { x = (rnd() - 0.5) * (spec.type === 'rel' ? 6 : 3); y = (rnd() - 0.5) * 3; }
    raster.disc(xf.ox + xf.s * x, xf.oy + xf.s * y, xf.s * lerp(NOISE.blotR, rnd()) * np.blotScale);
  }
  for (let i = 0; i < np.erosion && pts.length; i++) {
    const q = pick();
    raster.disc(xf.ox + xf.s * (q[0] + (rnd() - 0.5) * 0.03), xf.oy + xf.s * (q[1] + (rnd() - 0.5) * 0.03), xf.s * lerp(NOISE.erosionR, rnd()), true);
  }
  if (np.salt > 0 || np.pepper > 0) {
    const d = raster.d;
    for (let i = 0; i < d.length; i++) {
      const u = rnd();
      if (d[i] > 127) { if (u < np.pepper) d[i] = 0; }
      else if (u < np.salt) d[i] = 255;
    }
  }
  return raster;
}
