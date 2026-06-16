/* ============================================================
   hub/main.js — the hub's only entry point.
   Renders the page from site.config.js (no hard-coded cards),
   starts the black-hole hero, wires the slide-in rail + filters
   + scroll reveal, and lights the AI-status dot from the tiered
   provider. Replaces the previous 18-import scripts.js.
   ============================================================ */

import { SITE, NAV, SOCIALS, CATEGORIES, ALL_PROJECTS, COUNTS, STATUS } from '../config/site.config.js';
import { BlackHoleHero } from './hero-blackhole.js';
import { CosmicSubstrate } from './cosmic-substrate.js';
import { AIProvider } from '../ai/provider.js';

// ?still freezes all canvas animation to a single composed frame
// (screenshot/debug aid; also the path reduced-motion users get).
window.__L212_STILL__ = new URLSearchParams(location.search).has('still');
if (window.__L212_STILL__) document.documentElement.classList.add('still');

const $  = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ---------- living background ---------- */
function mountSubstrate() {
  const canvas = $('#cosmos-substrate');
  if (!canvas) return;
  new CosmicSubstrate(canvas).start();
}

/* ---------- hero ---------- */
function mountHero() {
  const canvas = $('#hero-canvas');
  if (!canvas) return;
  const hero = new BlackHoleHero(canvas);
  hero.start();

  $('#stat-built').textContent   = COUNTS.built;
  $('#stat-planned').textContent = COUNTS.beta + COUNTS.planned;
  $('#stat-cats').textContent    = COUNTS.categories;
}

/* ---------- project grid ---------- */
function projectCard(p) {
  const st = STATUS[p.status] || STATUS.planned;
  const built = p.status === 'built' || p.status === 'beta';
  const card = el('article', `card is-${built ? 'built' : 'planned'}`);
  card.dataset.category = p.category;

  card.appendChild(el('div', 'card-top',
    `<span class="card-cat">${p.categoryLabel}</span>` +
    `<span class="pill ${st.kind}">${st.label}</span>`));
  card.appendChild(el('h3', null, p.title));
  card.appendChild(el('p', null, p.blurb));

  if (built && p.href) {
    card.appendChild(el('span', 'card-cta', `Explore <i class="fa-solid fa-arrow-right"></i>`));
    const link = el('a', 'card-link');
    link.href = p.href;
    link.setAttribute('aria-label', `Open ${p.title}`);
    card.appendChild(link);
  } else {
    card.appendChild(el('span', 'card-cta muted', `In the pipeline`));
  }
  return card;
}

function mountGrid() {
  const grid = $('#project-grid');
  if (!grid) return;
  const render = (filter) => {
    grid.innerHTML = '';
    ALL_PROJECTS
      .filter((p) => filter === 'all' || p.category === filter)
      .forEach((p) => grid.appendChild(projectCard(p)));
    observeReveal(grid);
  };

  // filter chips
  const filters = $('#filters');
  const chip = (id, label, icon, active) => {
    const b = el('button', 'filter', `${icon ? `<i class="${icon}"></i>` : ''}${label}`);
    b.setAttribute('aria-pressed', String(!!active));
    b.dataset.filter = id;
    b.addEventListener('click', () => {
      [...filters.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      render(id);
    });
    return b;
  };
  filters.appendChild(chip('all', `All`, 'fa-solid fa-asterisk', true));
  CATEGORIES.forEach((c) => filters.appendChild(chip(c.id, c.label, c.icon, false)));

  render('all');
}

/* ---------- slide-in category rail ---------- */
function mountRail() {
  const rail = $('#rail'), scrim = $('#scrim'), toggle = $('#rail-toggle');
  if (!rail) return;

  CATEGORIES.forEach((c) => {
    rail.appendChild(el('h4', null, `${c.label}`));
    const ul = el('ul');
    c.projects.forEach((p) => {
      const li = el('li');
      const a = el('a', null,
        `<span>${p.title}</span><span class="mini-pill ${p.status}">${(STATUS[p.status] || STATUS.planned).label}</span>`);
      a.href = p.href || '#projects';
      a.addEventListener('click', closeRail);
      li.appendChild(a); ul.appendChild(li);
    });
    rail.appendChild(ul);
  });

  function openRail()  { rail.classList.add('open'); scrim.classList.add('show'); }
  function closeRail() { rail.classList.remove('open'); scrim.classList.remove('show'); }
  toggle?.addEventListener('click', openRail);
  scrim?.addEventListener('click', closeRail);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRail(); });
  mountRail.close = closeRail;
}
function closeRail() { mountRail.close && mountRail.close(); }

/* ---------- nav, socials, counts ---------- */
function mountChrome() {
  const nav = $('#site-nav');
  NAV.forEach((n) => { const a = el('a', null, n.label); a.href = n.href; nav.appendChild(a); });

  const renderSocials = (host) => SOCIALS.forEach((s) => {
    const a = el('a', null, `<i class="${s.icon}"></i>`);
    a.href = s.href; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', s.label);
    host.appendChild(a);
  });
  renderSocials($('#socials'));

  $('#ledger-built').textContent   = COUNTS.built;
  $('#ledger-beta').textContent    = COUNTS.beta;
  $('#ledger-planned').textContent = COUNTS.planned;
  $('#ledger-cats').textContent    = COUNTS.categories;
  $('#year').textContent = new Date().getFullYear();
}

/* ---------- AI status dot (proves the tiered provider) ---------- */
async function mountAIStatus() {
  const node = $('#ai-status');
  if (!node) return;
  const label = $('#ai-status-label');
  try {
    const ai = new AIProvider();
    const mode = await ai.detect();
    node.dataset.mode = mode;
    label.textContent = { ollama: 'AI · Local', worker: 'AI · Hosted', echo: 'AI · Offline' }[mode] || 'AI';
  } catch {
    node.dataset.mode = 'echo';
    label.textContent = 'AI · Offline';
  }
}

/* ---------- scroll reveal ---------- */
let revealObserver;
function observeReveal(root = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealObserver ||= new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  root.querySelectorAll('[data-reveal]:not(.in)').forEach((n) => revealObserver.observe(n));
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.setProperty('--measure', '64ch'); // ensure token present
  mountChrome();
  mountSubstrate();
  mountHero();
  mountGrid();
  mountRail();
  mountAIStatus();
  observeReveal();
});
