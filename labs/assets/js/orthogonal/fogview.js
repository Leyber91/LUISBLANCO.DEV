/* ============================================================
   orthogonal/fogview.js: the fog behind the lineage, on a canvas.

   The density in each cell comes from engine.js fogDensity (the
   rule lives there, and tests.mjs reads it); this file only paints
   it. A seeded fog texture (kit/fog.js, tiled, drawn FOG.scale px a
   cell so its wisps are large) in --horizon at FOG.alpha is cut by
   the density, which is written at a quarter of the drawing's size
   and scaled up smoothed, so the fog's edges are soft.

   The canvas sits under the lineage's SVG at device pixel ratio 1
   (the fog has no edge a finer bitmap would show), positioned
   absolutely inside the box CSS sizes. The effects budget (world
   brief): during the ignition one density pass and two full-canvas
   draws a frame; at rest the density is cached and only the
   texture's offset moves. Between the reading and an order of the
   exercise the density blends to the other mode's (engine.js
   drillFog) over FOG.fadeMs, one mask a frame; under reduced
   motion it changes at once.
   ============================================================ */
import { fogNoise } from '../kit/fog.js';
import { FOG } from './config.js';
import { fogDensity } from './engine.js';

const HORIZON = [159, 179, 214];   // --horizon (tokens.css), the cold ink the fog is drawn in

function texture() {
  const n = FOG.tile, v = fogNoise(FOG.seed, n);
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    img.data[4 * i] = HORIZON[0]; img.data[4 * i + 1] = HORIZON[1]; img.data[4 * i + 2] = HORIZON[2];
    // never empty, so a dense cell is always seen as fog; mottled, so it reads as fog and not as a tint
    img.data[4 * i + 3] = Math.round(255 * FOG.alpha * (0.2 + 0.8 * (v[i] / 255)));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class FogPainter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tex = texture();
    this.pattern = this.ctx.createPattern(this.tex, 'repeat');
    this.mask = document.createElement('canvas');
    this.mctx = this.mask.getContext('2d');
    this.field = null;
    this.density = null;
    this.img = null;
  }

  /* A new layout: the canvas takes the drawing's size and the mask the field's. */
  setField(field, width, height) {
    this.field = field;
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
    this.mask.width = field.cols;
    this.mask.height = field.rows;
    this.density = new Float32Array(field.cols * field.rows);
    this.img = this.mctx.createImageData(field.cols, field.rows);
    this.size = [width, height];
    this.blend = null;
  }

  /* The density for the strand's progress, written into the mask's alpha. */
  setProgress(progress) {
    if (!this.field) return;
    this.blend = null;
    fogDensity(this.field, progress, this.density);
    this.writeMask();
  }

  /* The density at the strand's progress, as a new array, for a change to blend to. */
  densityFor(progress) {
    return this.field ? fogDensity(this.field, progress) : null;
  }

  /* Move to another density (engine.js fogDensity or drillFog, on this field) over `ms`, or at once with 0. */
  blendTo(target, ms, now) {
    if (!this.field || !target || target.length !== this.density.length) return;
    if (!(ms > 0)) { this.blend = null; this.density.set(target); this.writeMask(); return; }
    this.blend = { from: this.density.slice(), to: target, t0: now, ms };
  }

  get blending() { return !!this.blend; }

  /* One step of a blend at `now`, eased; true while it runs. */
  advance(now) {
    const b = this.blend;
    if (!b) return false;
    const x = Math.min(1, Math.max(0, (now - b.t0) / b.ms)), e = x * x * (3 - 2 * x);
    for (let i = 0; i < this.density.length; i++) this.density[i] = b.from[i] + (b.to[i] - b.from[i]) * e;
    this.writeMask();
    if (x >= 1) this.blend = null;
    return true;
  }

  writeMask() {
    const d = this.img.data;
    for (let i = 0; i < this.density.length; i++) { d[4 * i] = 255; d[4 * i + 1] = 255; d[4 * i + 2] = 255; d[4 * i + 3] = Math.round(255 * this.density[i]); }
    this.mctx.putImageData(this.img, 0, 0);
  }

  /* The fog, its texture moved by (ox, oy) px. */
  paint(ox = 0, oy = 0) {
    if (!this.field) return;
    const { ctx } = this;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const s = FOG.scale;
    if (this.pattern && this.pattern.setTransform && typeof DOMMatrix === 'function') {
      this.pattern.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, W, H);
    } else {
      const P = FOG.tile * s;
      const x0 = (((ox % P) + P) % P) - P, y0 = (((oy % P) + P) % P) - P;
      for (let y = y0; y < H; y += P) for (let x = x0; x < W; x += P) ctx.drawImage(this.tex, x, y, P, P);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mask, 0, 0, this.field.cols * this.field.cell, this.field.rows * this.field.cell);
    ctx.globalCompositeOperation = 'source-over';
  }
}
