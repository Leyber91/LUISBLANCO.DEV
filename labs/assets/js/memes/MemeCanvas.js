/* ============================================================
   memes/MemeCanvas.js — the same-origin event-horizon painter.
   Composites a deterministic black-hole backdrop (or a cover-fit
   uploaded / pollinations image) under a fitted meme caption, then
   exports PNG. Motifs are a STRATEGY MAP keyed by name, so a new
   scene is a table entry, not another branch in a draw routine.
   ============================================================ */

import { CANVAS, CANVAS_FONTS, FONT_FAMILY, CREDIT_TEXT, DEFAULT_SCENE } from './constants.js';
import { readPalette, hexA, mix } from './Palette.js';
import { mulberry32, hashMotif } from './random.js';

export class MemeCanvas {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this._fontsP = null;
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
  setSize(w, h) { this.canvas.width = w; this.canvas.height = h; }

  /* pre-warm the caption + credit fonts before the first paint */
  fontsReady() {
    if (this._fontsP) return this._fontsP;
    this._fontsP = (document.fonts && document.fonts.ready)
      ? document.fonts.load(CANVAS_FONTS[0])
          .then(() => document.fonts.load(CANVAS_FONTS[1]))
          .then(() => document.fonts.ready)
          .catch(() => {})
      : Promise.resolve();
    return this._fontsP;
  }

  /* ============================================================
     compose one frame: backdrop (image or generated) + caption + credit
     ============================================================ */
  async compose({ scene, seed, bgImage, top, bottom }) {
    await this.fontsReady();
    const ctx = this.ctx, w = this.width, h = this.height;
    const P = readPalette();

    if (bgImage) {
      this._drawCover(bgImage, w, h);
    } else {
      this._drawBackdrop({ ...(scene || DEFAULT_SCENE), seed }, w, h, P);
    }
    this._drawCaption(top, bottom, w, h, P);
    this._drawCredit(w, h, P);

    // keep the canvas's text alternative in sync with the rendered caption
    const t = (top || '').trim(), b = (bottom || '').trim();
    this.canvas.setAttribute('aria-label', (t || b)
      ? `Meme: top text "${top}", bottom text "${bottom}"`
      : 'Generated meme');
  }

  /** ImageData read at (0,0) — throws on a tainted (cross-origin) canvas */
  probe() {
    const { x, y, w, h } = CANVAS.taintProbe || { x: 0, y: 0, w: 1, h: 1 };
    this.ctx.getImageData(x, y, w, h);
  }

  /* ---- export ---- */
  toBlob(cb, type = 'image/png') { this.canvas.toBlob(cb, type); }

  /* ============================================================
     backdrop
     ============================================================ */
  _drawCover(img, w, h) {
    const ctx = this.ctx;
    const ir = img.width / img.height, cr = w / h;
    let dw, dh;
    if (ir > cr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  _drawBackdrop(scene, w, h, P) {
    const ctx = this.ctx;
    const rnd = mulberry32((scene.seed | 0) + hashMotif(scene.motif));
    const cx = w * (CANVAS.focalX[scene.focal] ?? CANVAS.focalX.center);
    const cy = h * CANVAS.focalY;
    const warm = Math.max(0, Math.min(1, scene.warmCold ?? DEFAULT_SCENE.warmCold));

    // void base
    ctx.fillStyle = P.void; ctx.fillRect(0, 0, w, h);

    // deep glow — warm accretion biased by warmCold
    const R = Math.max(w, h) * CANVAS.glowReach;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R);
    glow.addColorStop(0, mix(P.accSoft, P.horizon, 1 - warm));
    glow.addColorStop(0.18, hexA(P.accretion, 0.55));
    glow.addColorStop(0.5, hexA(P.accDim, 0.16));
    glow.addColorStop(1, hexA(P.void, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

    // starfield
    const stars = Math.round((w * h) / CANVAS.starDivisor);
    for (let i = 0; i < stars; i++) {
      const x = rnd() * w, y = rnd() * h, s = rnd() * 1.6 + 0.2;
      ctx.globalAlpha = 0.15 + rnd() * 0.6;
      ctx.fillStyle = rnd() > CANVAS.warmStarChance ? P.horSoft : P.bright;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;

    this._drawMotif(scene.motif, cx, cy, Math.min(w, h), P, rnd, warm);
  }

  /* motif dispatch — strategy map keyed by name; eventHorizon is the default */
  _drawMotif(motif, cx, cy, D, P, rnd, warm) {
    const ctx = this.ctx;
    ctx.save();
    (MemeCanvas.MOTIFS[motif] || MemeCanvas.MOTIFS.default).call(this, ctx, cx, cy, D, P, rnd, warm);
    ctx.restore();
  }

  _eventHorizon(ctx, cx, cy, r, P) {
    // bright accretion rim around a black core
    const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.25);
    rim.addColorStop(0, hexA(P.void, 0));
    rim.addColorStop(0.6, hexA(P.accretion, 0.9));
    rim.addColorStop(0.78, hexA(P.accSoft, 0.7));
    rim.addColorStop(1, hexA(P.void, 0));
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.void;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(P.horSoft, 0.5); ctx.lineWidth = r * 0.012;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke();
  }

  /* ============================================================
     caption
     ============================================================ */
  _drawCaption(top, bottom, w, h, P) {
    const ctx = this.ctx;
    const family = FONT_FAMILY.display;
    const margin = w * CANVAS.captionMargin;
    const maxW = w - margin * 2;
    const base = Math.round(h * CANVAS.captionBase);

    // legibility scrims
    this._scrim(0, 0, w, h * CANVAS.scrimFrac, P.void, true);
    this._scrim(0, h * (1 - CANVAS.scrimFrac), w, h * CANVAS.scrimFrac, P.void, false);

    ctx.textAlign = 'center';
    const inset = h * CANVAS.bandInset;
    if (top) this._drawBand(top, w / 2, inset, maxW, base, family, 'top', P);
    if (bottom) this._drawBand(bottom, w / 2, h - inset, maxW, base, family, 'bottom', P);
  }

  _drawBand(text, x, y, maxW, base, family, anchor, P) {
    const ctx = this.ctx;
    const { lines, font } = this._fitLines(text, maxW, base, family);
    ctx.font = `700 ${font}px ${family}`;
    ctx.textBaseline = anchor === 'top' ? 'top' : 'bottom';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.void;
    ctx.lineWidth = font * 0.16;
    ctx.fillStyle = P.bright;
    const lh = font * 1.04;
    const arr = anchor === 'top' ? lines : [...lines].reverse();
    arr.forEach((ln, idx) => {
      const yy = anchor === 'top' ? y + idx * lh : y - idx * lh;
      ctx.strokeText(ln, x, yy);
      ctx.fillText(ln, x, yy);
    });
  }

  _fitLines(raw, maxW, base, family) {
    const ctx = this.ctx;
    const text = (raw || '').toUpperCase().trim();
    if (!text) return { lines: [], font: base };
    for (let font = base; font > base * CANVAS.fitFloor; font -= CANVAS.fitStep) {
      ctx.font = `700 ${font}px ${family}`;
      if (ctx.measureText(text).width <= maxW) return { lines: [text], font };
      const words = text.split(/\s+/);
      if (words.length > 1) {
        let best = null;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
          const wid = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
          if (!best || wid < best.wid) best = { a, b, wid };
        }
        if (best && best.wid <= maxW) return { lines: [best.a, best.b], font };
      }
    }
    // still too wide at the floor font: greedy-wrap into as many lines as needed,
    // truncating any single word that can't fit (never overflow the frame)
    const font = Math.round(base * CANVAS.fitFloor);
    ctx.font = `700 ${font}px ${family}`;
    return { lines: this._greedyWrap(text, maxW), font };
  }

  _greedyWrap(text, maxW) {
    const ctx = this.ctx;
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const w = this._truncWord(word, maxW);
      const trial = line ? line + ' ' + w : w;
      if (line && ctx.measureText(trial).width > maxW) { lines.push(line); line = w; }
      else line = trial;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [text];
  }

  _truncWord(word, maxW) {
    const ctx = this.ctx;
    if (ctx.measureText(word).width <= maxW) return word;
    let w = word;
    while (w.length > 1 && ctx.measureText(w + '…').width > maxW) w = w.slice(0, -1);
    return w + '…';
  }

  _drawCredit(w, h, P) {
    const ctx = this.ctx;
    ctx.font = `500 ${Math.round(h * CANVAS.creditFont)}px ${FONT_FAMILY.mono}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = hexA(P.dim, 0.95);
    ctx.fillText(CREDIT_TEXT, w - w * 0.02, h - h * 0.012);
  }

  _scrim(x, y, w, h, color, fromTop) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, fromTop ? y : y + h, 0, fromTop ? y + h : y);
    g.addColorStop(0, hexA(color, 0.78));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
}

/* ============================================================
   the motif strategy map. Keyed by scene.motif; `default` is the
   event-horizon fallback the original if/else fell through to.
   Each entry is invoked with `this` bound to the MemeCanvas.
   ============================================================ */
MemeCanvas.MOTIFS = {
  'accretion-disk'(ctx, cx, cy, D, P, rnd) {
    const r = D * 0.22;
    ctx.translate(cx, cy); ctx.rotate(-0.32);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.strokeStyle = hexA(i % 2 ? P.accretion : P.horizon, 0.5 - i * 0.07);
      ctx.lineWidth = D * 0.012;
      ctx.ellipse(0, 0, r * (1 + i * 0.34), r * (0.34 + i * 0.10), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  'lone-observer'(ctx, cx, cy, D, P) {
    const r = D * 0.22;
    this._eventHorizon(ctx, cx, cy - D * 0.04, r * 0.9, P);
    ctx.fillStyle = P.void;
    const ox = cx, oy = cy + D * 0.34, hr = D * 0.03;
    ctx.beginPath(); ctx.arc(ox, oy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(ox - hr * 0.8, oy + hr, hr * 1.6, D * 0.12);
    ctx.strokeStyle = hexA(P.horizon, 0.7); ctx.lineWidth = D * 0.006;
    ctx.beginPath(); ctx.arc(ox, oy, hr, 0, Math.PI * 2); ctx.stroke();
  },

  'collapsing-stack'(ctx, cx, cy, D, P, rnd) {
    const r = D * 0.22;
    ctx.translate(cx, cy);
    for (let i = 0; i < 7; i++) {
      const bw = r * (2.0 - i * 0.22), bh = D * 0.028;
      ctx.fillStyle = hexA(i < 3 ? P.accretion : P.horizon, 0.6 - i * 0.05);
      ctx.fillRect(-bw / 2 + (rnd() - 0.5) * D * 0.05 * i, -D * 0.18 + i * bh * 1.7, bw, bh);
    }
  },

  'signal-in-noise'(ctx, cx, cy, D, P, rnd) {
    ctx.strokeStyle = hexA(P.horSoft, 0.85); ctx.lineWidth = D * 0.008;
    ctx.beginPath();
    for (let x = 0; x <= D * 2; x += 4) {
      const px = cx - D + x;
      const py = cy + Math.sin(x * 0.03) * D * 0.06 + (rnd() - 0.5) * D * 0.012;
      x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  },

  default(ctx, cx, cy, D, P) {
    this._eventHorizon(ctx, cx, cy, D * 0.22, P);
  },
};
