/* ============================================================
   components/Background.js — the living cosmic substrate behind
   the whole hub (starfield + nebula + shooting stars), mounted
   through the Labs OS scene lifecycle: paused while the tab is
   hidden, destroyed before any replacement starts.
   ============================================================ */

import { SEL } from '../constants.js';
import { $, reduced } from '../dom.js';
import { CosmicSubstrate } from '../cosmic-substrate.js';
import { mountScene } from '../../os/scene.js';

export class Background {
  mount() {
    const canvas = $(SEL.substrate);
    if (!canvas) return;
    this.scene = mountScene(canvas, () => {
      const s = new CosmicSubstrate(canvas);
      s.start();
      return { destroy: () => s.destroy(), pause: () => s.stop(), resume: () => s.start() };
    }, { reducedMotion: reduced() });
  }

  destroy() { this.scene?.destroy(); }
}
