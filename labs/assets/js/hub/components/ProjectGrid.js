/* ============================================================
   components/ProjectGrid.js — the filterable project grid.
   Filters are built from CATEGORIES (+ the "All" pseudo-filter),
   cards from ProjectCard. Re-runs the shared RevealObserver on
   each render so freshly-inserted cards animate in.
   ============================================================ */

import { SEL, FILTER_ALL } from '../constants.js';
import { $, el } from '../dom.js';
import { CATEGORIES, ALL_PROJECTS } from '../../config/site.config.js';
import { ProjectCard } from './ProjectCard.js';

export class ProjectGrid {
  constructor(reveal) { this.reveal = reveal; }

  mount() {
    this.grid = $(SEL.grid);
    this.filters = $(SEL.filters);
    if (!this.grid) return;
    this._buildFilters();
    this.render('all');
  }

  _buildFilters() {
    if (!this.filters) return;
    const chips = [FILTER_ALL, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))];
    chips.forEach((f, i) => this.filters.appendChild(this._chip(f, i === 0)));
  }

  _chip(f, active) {
    const b = el('button', 'filter', `${f.icon ? `<i class="${f.icon}"></i>` : ''}${f.label}`);
    b.setAttribute('aria-pressed', String(active));
    b.dataset.filter = f.id;
    b.addEventListener('click', () => {
      [...this.filters.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      this.render(f.id);
    });
    return b;
  }

  render(filter) {
    this.grid.innerHTML = '';
    ALL_PROJECTS
      .filter((p) => filter === 'all' || p.category === filter)
      .forEach((p) => this.grid.appendChild(new ProjectCard(p).render()));
    this.reveal?.observe(this.grid);
  }
}
