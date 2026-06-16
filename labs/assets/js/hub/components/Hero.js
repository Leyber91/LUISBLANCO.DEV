/* ============================================================
   components/Hero.js — the black-hole hero canvas + the three
   project-count stats above the fold.
   ============================================================ */

import { SEL } from '../constants.js';
import { $, setText } from '../dom.js';
import { BlackHoleHero } from '../hero-blackhole.js';
import { COUNTS } from '../../config/site.config.js';

export class Hero {
  mount() {
    const canvas = $(SEL.heroCanvas);
    if (canvas) { this.hero = new BlackHoleHero(canvas); this.hero.start(); }

    setText(SEL.statBuilt, COUNTS.built);
    setText(SEL.statPlanned, COUNTS.beta + COUNTS.planned);
    setText(SEL.statCats, COUNTS.categories);
  }

  destroy() { this.hero?.destroy(); }
}
