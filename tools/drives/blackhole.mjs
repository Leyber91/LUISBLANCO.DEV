// The Black Hole instrument (labs/bh_animation_page.html), driven as a visitor meets it.
// Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/blackhole.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 300
//   (and again with --width 390 --height 844)
//
// Version 1 (road ticket 1.08, its load step; the probe of level 1): the page loads, the renderer comes up on
// WebGL2, the first full trace finishes, and the frame it leaves is a picture. Later versions add the steps of
// 1.08 (an object, a drag, a ray probed, a measurement, a fall to its stop, a link reopened, the plate).
//
// The frame rule. The test browser draws WebGL on the processor, and a capture of a WebGL page has come back
// black, or with fully transparent pixels where the compositor left a hole (pull request 46). So every shot is
// read here: no pixel with alpha 0 anywhere, and inside the canvas at least LIT_SHARE of the pixels brighter
// than LIT_LUMA. A black hole picture is mostly dark (the shadow, the sky), so the bound is low on purpose: the
// default view's disk lights far more than 1% of the canvas, a black or near-black frame lights none.
// When pull request 47 (p.frames(), the shared rule) merges, the transparent half moves to it.
//
// No model is called and nothing leaves the page's own origin: every such request is refused before any page
// script runs (p.before).

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { standard } from './invariants.mjs';

const LIT_LUMA = 40;        // of 255: brighter than the sky's faintest stars drawn at this size
const LIT_SHARE = 0.01;     // of the canvas's pixels
const READY_MS = 60000;     // the first full trace under software GL took 2.8 s at tier min on 2026-11-16 (both widths)

/* A screenshot as pixels: 8-bit RGB or RGBA, not interlaced, which is what Chrome writes. */
function pixels(file) {
  const b = readFileSync(file);
  let o = 8, w = 0, h = 0, kind = 0;
  const parts = [];
  while (o < b.length) {
    const n = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + n);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); kind = d[9]; if (d[8] !== 8 || d[12] !== 0 || (kind !== 2 && kind !== 6)) throw new Error('a screenshot this reader does not take'); }
    else if (type === 'IDAT') parts.push(d);
    o += 12 + n;
  }
  const bpp = kind === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(parts)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], at = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, u = y ? px[(y - 1) * stride + x] : 0, c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      let v = raw[at + x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

/* The frame rule over one shot: transparent pixels in the whole frame; lit share and brightest luma inside rect. */
export function readFrame(file, rect, dpr = 1) {
  const { w, h, bpp, px } = pixels(file);
  let clear = 0;
  if (bpp === 4) for (let i = 3; i < px.length; i += 4) if (px[i] === 0) clear++;
  const x0 = Math.max(0, Math.floor(rect.left * dpr)), y0 = Math.max(0, Math.floor(rect.top * dpr));
  const x1 = Math.min(w, Math.ceil(rect.right * dpr)), y1 = Math.min(h, Math.ceil(rect.bottom * dpr));
  let lit = 0, n = 0, top = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * bpp, l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    n++; if (l > LIT_LUMA) lit++; if (l > top) top = l;
  }
  return { clear, lit: n ? lit / n : 0, top, n };
}

/* ---- run inside the page ---- */

function guard() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
  return true;
}

const READY = '(() => { const a = window.__bh; if (!a || !a.renderer) return false; return a.renderer.ok() ? !!a.renderer.mainDone : true; })()';
const RECT = '(() => { const r = document.getElementById("bh-canvas").getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, dpr: devicePixelRatio }; })()';

/* ---- the scenario ---- */

export default async function blackhole(p, { base, width }) {
  for (const [n, e] of standard()) p.invariant(n, e);
  await p.before(`(${guard})()`);

  const frame = async (name) => {
    const file = await p.shot(name);
    const r = await p.ev(RECT);
    const f = readFrame(file, r, r.dpr);
    p.check(`${name}: no fully transparent pixel in the frame`, f.clear === 0, `${f.clear} transparent pixels`);
    p.check(`${name}: the canvas is a picture, not a black frame`, f.lit >= LIT_SHARE && f.top > 150,
      `${(f.lit * 100).toFixed(2)}% of ${f.n} canvas pixels above luma ${LIT_LUMA}, brightest ${f.top.toFixed(0)}`);
    return f;
  };

  const t0 = Date.now();
  await p.go(`${base}/labs/bh_animation_page.html`);
  const up = await p.until(READY, READY_MS);
  const ms = Date.now() - t0;
  const gl = await p.ev('!!(window.__bh && window.__bh.renderer && window.__bh.renderer.ok())');
  p.check('the renderer comes up on WebGL2', gl, gl ? '' : await p.ev('(window.__bh && window.__bh.renderer && window.__bh.renderer.error) || "no renderer"'));
  p.check('the no-WebGL notice stays hidden while WebGL2 runs', !gl || await p.ev('document.getElementById("bh-nogl").hidden'));
  p.check(`the first full trace finishes inside ${READY_MS / 1000} s`, up, `${(ms / 1000).toFixed(1)} s, software ${await p.ev('!!(window.__bh && window.__bh.renderer && window.__bh.renderer.software)')}, tier ${await p.ev('window.__bh && window.__bh.perf && window.__bh.perf.tier')}`);
  await p.sleep(3000);   // the ignition runs 2.6 s after load (main.js); the frame is read after it
  await p.step('loaded and ignited');
  await frame(`load-${width}`);
}
