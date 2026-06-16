/* ============================================================
   components/Rail.js — the slide-in category rail (mobile menu).
   Built from CATEGORIES; open/close are explicit methods.
   ============================================================ */

import { SEL } from '../constants.js';
import { $, el } from '../dom.js';
import { CATEGORIES, STATUS } from '../../config/site.config.js';

export class Rail {
  mount() {
    this.rail = $(SEL.rail);
    this.scrim = $(SEL.scrim);
    const toggle = $(SEL.railToggle);
    if (!this.rail) return;

    this._build();
    toggle?.addEventListener('click', () => this.open());
    this.scrim?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  }

  _build() {
    CATEGORIES.forEach((c) => {
      this.rail.appendChild(el('h4', null, c.label));
      const ul = el('ul');
      c.projects.forEach((p) => {
        const st = STATUS[p.status] || STATUS.planned;
        const li = el('li');
        const a = el('a', null, `<span>${p.title}</span><span class="mini-pill ${p.status}">${st.label}</span>`);
        a.href = p.href || '#projects';
        a.addEventListener('click', () => this.close());
        li.appendChild(a);
        ul.appendChild(li);
      });
      this.rail.appendChild(ul);
    });
  }

  open()  { this.rail.classList.add('open'); this.scrim?.classList.add('show'); }
  close() { this.rail.classList.remove('open'); this.scrim?.classList.remove('show'); }
}
