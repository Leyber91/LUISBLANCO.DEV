/* ============================================================
   hub/Hub.js — the top-level controller. Composes the hub from a
   COMPONENT REGISTRY: each component exposes mount() and is owned
   here. Adding a feature = add a class to the list (no new branch,
   no edits to the boot sequence). Handles the ?still freeze flag,
   the --measure token, and the shared RevealObserver.

   Labs OS starts first: the hub records its own visit, and the
   components that read the visitor's record (the welcome plate,
   "Your data", the handoff log) share the one init promise. If
   Labs OS fails to start, those components render nothing and
   the rest of the hub is unaffected.
   ============================================================ */

import { STILL, MOTION, OS_HUB } from './constants.js';
import { RevealObserver } from './components/RevealObserver.js';
import { Chrome } from './components/Chrome.js';
import { Background } from './components/Background.js';
import { Hero } from './components/Hero.js';
import { ProjectGrid } from './components/ProjectGrid.js';
import { Rail } from './components/Rail.js';
import { AIStatus } from './components/AIStatus.js';
import { Welcome } from './os/Welcome.js';
import { YourData } from './os/YourData.js';
import { Handoffs } from './os/Handoffs.js';
import { LabsOS } from '../os/index.js';

export class Hub {
  constructor() {
    // ?still freezes all canvas animation to one composed frame
    // (screenshot/debug aid; also the path reduced-motion users get).
    window[STILL.flagKey] = new URLSearchParams(location.search).has(STILL.param);
    if (window[STILL.flagKey]) document.documentElement.classList.add(STILL.htmlClass);

    this.os = LabsOS.init({ lab: OS_HUB.lab }).catch(() => null);
    this.reveal = new RevealObserver();
    this.components = [
      new Chrome(),
      new Background(),
      new Hero(),
      new ProjectGrid(this.reveal),
      new Rail(),
      new AIStatus(),
      new Welcome(this.os),
      new YourData(this.os),
      new Handoffs(this.os),
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
