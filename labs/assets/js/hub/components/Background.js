/* ============================================================
   components/Background.js — the living cosmic substrate behind
   the whole hub (starfield + nebula + shooting stars).
   ============================================================ */

import { SEL } from '../constants.js';
import { $ } from '../dom.js';
import { CosmicSubstrate } from '../cosmic-substrate.js';

export class Background {
  mount() {
    const canvas = $(SEL.substrate);
    if (!canvas) return;
    this.substrate = new CosmicSubstrate(canvas);
    this.substrate.start();
  }

  destroy() { this.substrate?.destroy(); }
}
