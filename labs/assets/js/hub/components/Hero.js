/* ============================================================
   components/Hero.js — the black-hole hero canvas + the three
   project-count stats above the fold. The canvas runs through the
   Labs OS scene lifecycle, so it pauses when scrolled off screen
   or when the tab is hidden.
   ============================================================ */

import { SEL } from '../constants.js';
import { $, setText, reduced } from '../dom.js';
import { BlackHoleHero } from '../hero-blackhole.js';
import { COUNTS } from '../../config/site.config.js';
import { mountScene } from '../../os/scene.js';

export class Hero {
  mount() {
    const canvas = $(SEL.heroCanvas);
    if (canvas) {
      this.scene = mountScene(canvas, () => {
        const h = new BlackHoleHero(canvas);
        h.start();
        return { destroy: () => h.destroy(), pause: () => h.stop(), resume: () => h.start() };
      }, { reducedMotion: reduced() });
    }

    setText(SEL.statBuilt, COUNTS.built);
    setText(SEL.statPlanned, COUNTS.beta + COUNTS.planned);
    setText(SEL.statCats, COUNTS.categories);
  }

  destroy() { this.scene?.destroy(); }
}
