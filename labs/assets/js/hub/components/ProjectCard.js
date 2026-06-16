/* ============================================================
   components/ProjectCard.js — one project card. The built-vs-
   pending presentation is chosen from the CARD_CTA strategy map
   keyed by a derived mode, so a new status is a data change in
   site.config.js + constants.js, never a new if/else here.
   ============================================================ */

import { CARD_CTA } from '../constants.js';
import { el } from '../dom.js';
import { STATUS } from '../../config/site.config.js';

export class ProjectCard {
  constructor(project) { this.p = project; }

  get status() { return STATUS[this.p.status] || STATUS.planned; }
  /** interactive only when the status allows it AND a page exists */
  get mode() { return this.status.interactive && this.p.href ? 'interactive' : 'pending'; }

  render() {
    const { p } = this;
    const st = this.status;
    const mode = this.mode;
    const cta = CARD_CTA[mode];

    const card = el('article', `card is-${mode === 'interactive' ? 'built' : 'planned'}`);
    card.dataset.category = p.category;

    card.appendChild(el('div', 'card-top',
      `<span class="card-cat">${p.categoryLabel}</span>` +
      `<span class="pill ${st.kind}">${st.label}</span>`));
    card.appendChild(el('h3', null, p.title));
    card.appendChild(el('p', null, p.blurb));
    card.appendChild(el('span', `card-cta${cta.muted ? ' muted' : ''}`,
      cta.icon ? `${cta.label} <i class="${cta.icon}"></i>` : cta.label));

    if (cta.link && p.href) {
      const link = el('a', 'card-link');
      link.href = p.href;
      link.setAttribute('aria-label', `Open ${p.title}`);
      card.appendChild(link);
    }
    return card;
  }
}
