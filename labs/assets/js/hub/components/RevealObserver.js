/* ============================================================
   components/RevealObserver.js — one IntersectionObserver shared
   across the hub. Reveals [data-reveal] elements as they scroll in;
   a no-op under reduced motion (the CSS shows them immediately).
   ============================================================ */

import { SEL, MOTION } from '../constants.js';
import { $all, reduced } from '../dom.js';

export class RevealObserver {
  constructor() { this.io = null; }

  observe(root = document) {
    if (reduced()) return;
    this.io ||= new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('in'); this.io.unobserve(e.target); }
      }
    }, { rootMargin: MOTION.revealRootMargin });
    $all(`${SEL.reveal}:not(.in)`, root).forEach((n) => this.io.observe(n));
  }

  destroy() { this.io?.disconnect(); this.io = null; }
}
