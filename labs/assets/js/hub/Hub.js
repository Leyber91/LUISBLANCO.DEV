/* ============================================================
   hub/Hub.js — the top-level controller. Composes the hub from a
   COMPONENT REGISTRY: each component exposes mount() and is owned
   here. Adding a feature = add a class to the list (no new branch,
   no edits to the boot sequence). Handles the ?still freeze flag,
   the --measure token, and the shared RevealObserver.
   ============================================================ */

import { STILL, MOTION } from './constants.js';
import { RevealObserver } from './components/RevealObserver.js';
import { Chrome } from './components/Chrome.js';
import { Background } from './components/Background.js';
import { Hero } from './components/Hero.js';
import { ProjectGrid } from './components/ProjectGrid.js';
import { Rail } from './components/Rail.js';
import { AIStatus } from './components/AIStatus.js';

export class Hub {
  constructor() {
    // ?still freezes all canvas animation to one composed frame
    // (screenshot/debug aid; also the path reduced-motion users get).
    window[STILL.flagKey] = new URLSearchParams(location.search).has(STILL.param);
    if (window[STILL.flagKey]) document.documentElement.classList.add(STILL.htmlClass);

    this.reveal = new RevealObserver();
    this.components = [
      new Chrome(),
      new Background(),
      new Hero(),
      new ProjectGrid(this.reveal),
      new Rail(),
      new AIStatus(),
    ];
  }

  mount() {
    document.documentElement.style.setProperty('--measure', MOTION.measure);
    this.components.forEach((c) => c.mount());
    this.reveal.observe();
  }

  destroy() { this.components.forEach((c) => c.destroy?.()); this.reveal.destroy(); }

  static boot() {
    const hub = new Hub();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => hub.mount(), { once: true });
    } else {
      hub.mount();
    }
    return hub;
  }
}
