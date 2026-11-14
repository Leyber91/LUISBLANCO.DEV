/* ============================================================
   dataspace/boot.js — the first numbers, before anything heavy.
   Loads only config, the pre-tokenizer and the bit code, fills the
   source box and prints its bits, so a slow connection shows a
   working instrument before the shader, the BPE merges or the
   model route arrive. main.js takes over when it has loaded.
   ============================================================ */

import { PRESETS, DEFAULT_PRESET } from './config.js';
import { pretokenize } from './bpe.js';
import { twoPartBits } from './measures.js';

const q = new URLSearchParams(location.hash.slice(1));
const box = document.getElementById('src');
if (!q.get('t') && box && !box.value) {
  const p = PRESETS.find((x) => x.id === q.get('p')) || PRESETS.find((x) => x.id === DEFAULT_PRESET);
  box.value = p.text;
  const toks = pretokenize(p.text);
  const bits = twoPartBits(toks);
  const m = document.getElementById('srcMeter');
  if (m && m.textContent === 'measuring') {
    m.innerHTML = `${p.text.length.toLocaleString('en-US')} chars · <b>${toks.length}</b> pre-tokens (BPE loading) · <b>${Math.round(bits.total).toLocaleString('en-US')}</b> bits`;
  }
  performance.mark('ds:bits');
}
