/* ============================================================
   components/Chrome.js — the persistent chrome: primary nav,
   social links, the about-ledger counts and the footer year.
   All rendered from site.config.js data.
   ============================================================ */

import { SEL } from '../constants.js';
import { $, el, setText } from '../dom.js';
import { NAV, SOCIALS, COUNTS } from '../../config/site.config.js';

export class Chrome {
  mount() {
    const nav = $(SEL.siteNav);
    if (nav) NAV.forEach((n) => {
      const a = el('a', null, n.label);
      a.href = n.href;
      nav.appendChild(a);
    });

    const socials = $(SEL.socials);
    if (socials) SOCIALS.forEach((s) => {
      const a = el('a', null, `<i class="${s.icon}"></i>`);
      a.href = s.href; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', s.label);
      socials.appendChild(a);
    });

    setText(SEL.ledgerBuilt, COUNTS.built);
    setText(SEL.ledgerBeta, COUNTS.beta);
    setText(SEL.ledgerPlanned, COUNTS.planned);
    setText(SEL.ledgerCats, COUNTS.categories);
    setText(SEL.year, new Date().getFullYear());
  }
}
