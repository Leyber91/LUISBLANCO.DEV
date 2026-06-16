/* ============================================================
   memes/Exporter.js — PNG download + clipboard copy for the
   composited meme. Untainted for the event-horizon canvas and for
   uploads; a remote (non-CORS) backdrop taints the canvas, which it
   surfaces as a friendly note instead of a silent failure.
   ============================================================ */

import { DEFAULTS, MSG } from './constants.js';

export class Exporter {
  /**
   * @param canvas  the MemeCanvas instance (toBlob + the export buttons live here)
   * @param deps    { exportNote, copyBtn, getSeed(), onTaint() }
   */
  constructor(canvas, deps) {
    this.canvas = canvas;
    this.exportNote = deps.exportNote;
    this.copyBtn = deps.copyBtn;
    this.getSeed = deps.getSeed;
    this.onTaint = deps.onTaint;
  }

  download() {
    try {
      this.canvas.toBlob((blob) => {
        if (!blob) return this.onTaint();
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u; a.download = `l212-meme-${this.getSeed()}.png`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), DEFAULTS.revokeMs);
      }, 'image/png');
    } catch (e) { this.onTaint(); }
  }

  async copy() {
    if (!window.ClipboardItem || !navigator.clipboard?.write) {
      this._note(MSG.copyNeedsHttps);
      return;
    }
    try {
      this.canvas.toBlob(async (blob) => {
        if (!blob) return this.onTaint();
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          this._flash(this.copyBtn, MSG.copied);
        } catch { this._note(MSG.copyBlocked); }
      }, 'image/png');
    } catch (e) { this.onTaint(); }
  }

  _note(msg) { this.exportNote.textContent = msg; this.exportNote.hidden = false; }

  _flash(btn, label) {
    const html = btn.innerHTML; btn.textContent = label;
    setTimeout(() => { btn.innerHTML = html; }, DEFAULTS.flashMs);
  }
}
