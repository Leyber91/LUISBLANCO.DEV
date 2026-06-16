/* ============================================================
   memes/BackgroundSource.js — owns the meme's image backdrop:
   which source is active (event-horizon art | upload | pollinations),
   the loaded HTMLImageElement, and the canvas-taint / export-enable
   state. Source switching is a STRATEGY MAP keyed by source name,
   so a new backdrop kind is a table entry, not another if/else.
   ============================================================ */

import { SOURCE_NOTE, MSG, POLLINATIONS } from './constants.js';
import { $all } from './dom.js';

export class BackgroundSource {
  constructor({ toggle, uploadEl, srcNote, downloadBtn, copyBtn, exportNote }, hooks = {}) {
    this.toggle = toggle;
    this.uploadEl = uploadEl;
    this.srcNote = srcNote;
    this.downloadBtn = downloadBtn;
    this.copyBtn = copyBtn;
    this.exportNote = exportNote;
    this.hooks = hooks;        // { recompose(), getSeed(), getSize(), getScene(), getCaption() }

    this.mode = 'canvas';
    this.bgImage = null;
    this.tainted = false;
  }

  /* an image is only used for the upload / pollinations modes */
  get image() { return (this.mode === 'upload' || this.mode === 'pollinations') ? this.bgImage : null; }

  wire() {
    this.toggle?.addEventListener('click', (e) => {
      const b = e.target.closest('.src'); if (!b) return;
      this.set(b.dataset.src);
    });
    this.uploadEl?.addEventListener('change', (e) => this._onUpload(e));
  }

  /* dispatch through the source strategy map; default mirrors the original 'else' (canvas) */
  set(src) {
    this.mode = src;
    $all('.src', this.toggle).forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.src === src)));
    (BackgroundSource.SOURCES[src] || BackgroundSource.SOURCES.canvas).call(this);
  }

  reEnableExport() {
    this.tainted = false;
    this.exportNote.hidden = true;
    this.downloadBtn.disabled = false;
    this.copyBtn.disabled = false;
  }

  /* called by the painter probe: a remote backdrop with CORS headers stays exportable */
  markClean() { this.reEnableExport(); }

  taintFallback() {
    this.tainted = true;
    this._note(MSG.taint);
  }

  _note(msg) { this.exportNote.textContent = msg; this.exportNote.hidden = false; }

  _onUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const img = new Image();
    img.onload = () => { this.bgImage = img; this.reEnableExport(); this.hooks.recompose?.(); };
    img.src = URL.createObjectURL(file);
  }

  _loadPollinations() {
    const cap = this.hooks.getCaption?.() || { top: '', bottom: '' };
    const motif = this.hooks.getScene?.()?.motif || POLLINATIONS.defaultMotif;
    const size = this.hooks.getSize?.() || { w: 1080, h: 1080 };
    const prompt = `${motif}, dark cinematic, ${cap.top} ${cap.bottom}`;
    // crossOrigin before src + a per-request cache-buster so a previously-cached
    // non-CORS copy can't silently taint the canvas (the classic taint trap).
    const url = `${POLLINATIONS.base}${encodeURIComponent(prompt)}`
      + `?width=${size.w}&height=${size.h}&nologo=true&seed=${this.hooks.getSeed?.() ?? 0}&_cb=${Date.now()}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this.bgImage = img; this.hooks.recompose?.(); };
    img.onerror = () => {
      this.srcNote.textContent = MSG.pollinationsFail;
      this.set('canvas');
    };
    // composite instantly over canvas backdrop so the box is never blank
    this.bgImage = null; this.hooks.recompose?.();
    img.src = url;
  }
}

/* ============================================================
   source strategy map. `this` is the BackgroundSource instance.
   Each entry performs the side effects the original setSource did.
   ============================================================ */
BackgroundSource.SOURCES = {
  upload() {
    this.uploadEl.click();
    this.srcNote.hidden = true;
    this.reEnableExport();
  },

  pollinations() {
    this.srcNote.hidden = false;
    this.srcNote.textContent = SOURCE_NOTE.pollinations;
    this.bgImage = null;
    if (this.hooks.hasMeme?.()) this._loadPollinations();
  },

  canvas() {
    this.srcNote.hidden = true;
    this.bgImage = null;
    this.reEnableExport();
    if (this.hooks.hasMeme?.()) this.hooks.recompose?.();
  },
};
