/* ============================================================
   components/AIStatus.js — lights the header AI dot from the
   tiered provider's detected mode (ollama | worker | echo).
   ============================================================ */

import { SEL, AI_LABELS, AI_LABEL_FALLBACK } from '../constants.js';
import { $ } from '../dom.js';
import { AIProvider } from '../../ai/provider.js';

export class AIStatus {
  async mount() {
    const node = $(SEL.aiStatus);
    if (!node) return;
    const label = $(SEL.aiStatusLabel);

    let mode = 'echo';
    try { mode = await new AIProvider().detect(); }
    catch { mode = 'echo'; }

    node.dataset.mode = mode;
    if (label) label.textContent = AI_LABELS[mode] || AI_LABEL_FALLBACK;
  }
}
