/* ============================================================
   altverse/render/world-view.js — the EXPLORE shell.
   A persistent header (world name + motto + the divergence) and
   three coordinated surfaces: MAPAMUNDI, CHRONOLOGY, DOSSIERS.
   Phase 1 coordination: the region legend hover-highlights the map.
   ============================================================ */

import { AltMap } from './map-canvas.js';
import { renderChronology } from './chronology.js';
import { renderDossier } from './dossier.js';
import { applyIdentity } from '../identity.js';
import { openCardModal } from './card.js';
import { shareURL } from '../store.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

// the live map, tracked across renders so it is torn down on EVERY exit
// (tab switch, back button, or a fresh renderWorld) — not just tab switches.
let activeMap = null;
function killMap() { if (activeMap) { activeMap.destroy(); activeMap = null; } }

export function renderWorld(world, mount, { onBack, tab } = {}) {
  killMap();
  mount.innerHTML = '';
  const root = el('div', 'av-world');
  root.dataset.world = world.id;
  const identity = applyIdentity(world, root);

  // header
  const head = el('header', 'av-world-head');
  const left = el('div', 'av-world-id');
  left.appendChild(el('div', 'av-world-name', world.name || 'UNNAMED WORLD'));
  left.appendChild(el('div', 'av-world-motto', world.motto || ''));
  head.appendChild(left);
  const mid = el('div', 'av-world-div');
  mid.appendChild(el('div', 'av-world-div-label', 'DIVERGENCE'));
  mid.appendChild(el('div', 'av-world-div-text', world.divergence.statement));
  head.appendChild(mid);
  const right = el('div', 'av-world-meta');
  right.appendChild(el('span', `av-tier ${world.tier}`, world.tier === 'echo' ? 'OFFLINE SAMPLE' : world.tier.toUpperCase()));
  const actions = el('div', 'av-world-actions');
  const cardBtn = el('button', 'av-chip-btn', 'World Card');
  cardBtn.addEventListener('click', () => openCardModal(world));
  const shareBtn = el('button', 'av-chip-btn', 'Share');
  shareBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareURL(world)); shareBtn.textContent = 'Link copied'; }
    catch { shareBtn.textContent = 'Copy failed'; }
    setTimeout(() => (shareBtn.textContent = 'Share'), 1600);
  });
  actions.append(cardBtn, shareBtn);
  right.appendChild(actions);
  const back = el('button', 'av-back', '← new divergence');
  back.addEventListener('click', () => { killMap(); onBack && onBack(); });
  right.appendChild(back);
  head.appendChild(right);
  root.appendChild(head);

  // arrival (S9 entry): the immersive landing, threads jump into the map
  if (world.entry && world.entry.vignette) {
    const arr = el('section', 'av-arrival');
    arr.appendChild(el('div', 'av-arrival-label', 'ARRIVAL'));
    arr.appendChild(el('p', 'av-arrival-text', world.entry.vignette));
    if ((world.entry.threads || []).length) {
      const chips = el('div', 'av-threads');
      world.entry.threads.forEach((t) => {
        const chip = el('button', 'av-thread', t.title);
        chip.addEventListener('click', () => { show('map'); if (map) map.setHover(t.regionId); });
        chips.appendChild(chip);
      });
      arr.appendChild(chips);
    }
    root.appendChild(arr);
  }

  // tabs
  const tabsBar = el('nav', 'av-tabs');
  const panel = el('div', 'av-panel');
  const TABS = [
    { id: 'map', label: 'Mapamundi', render: renderMap },
    { id: 'chrono', label: 'Chronology', render: (w, m) => renderChronology(w, m) },
    { id: 'dossier', label: 'Dossiers', render: (w, m) => renderDossier(w, m) },
  ];
  let map = null;
  function show(id) {
    [...tabsBar.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    panel.innerHTML = '';
    killMap(); map = null;
    TABS.find((t) => t.id === id).render(world, panel);
  }
  TABS.forEach((t) => {
    const b = el('button', 'av-tab', t.label);
    b.dataset.tab = t.id;
    b.addEventListener('click', () => show(t.id));
    tabsBar.appendChild(b);
  });
  root.appendChild(tabsBar);
  root.appendChild(panel);
  mount.appendChild(root);

  function renderMap(w, m) {
    const grid = el('div', 'av-map-grid');
    const canvasWrap = el('div', 'av-map-canvas');
    const canvas = document.createElement('canvas');
    canvasWrap.appendChild(canvas);
    grid.appendChild(canvasWrap);

    const legend = el('aside', 'av-map-legend');
    legend.appendChild(el('div', 'av-legend-head', 'Regions'));
    w.map.regions.forEach((r) => {
      const item = el('button', 'av-legend-item');
      item.innerHTML = `<span class="nm">${r.name}</span><span class="bi">${r.dominantBiome}</span>`;
      item.addEventListener('mouseenter', () => map && map.setHover(r.id));
      item.addEventListener('mouseleave', () => map && map.setHover(null));
      legend.appendChild(item);
    });
    if (w.map.notes) legend.appendChild(el('p', 'av-legend-note', w.map.notes));
    grid.appendChild(legend);
    m.appendChild(grid);

    map = new AltMap(canvas);
    activeMap = map;
    map.setWorld(w);
    map.setStyle({ accent: identity.palette.accent, gridStep: identity.mapStyle.gridStep, plateRadius: identity.mapStyle.plateRadius });
    requestAnimationFrame(() => { if (map) { map.setWorld(w); map.setStyle({ accent: identity.palette.accent, gridStep: identity.mapStyle.gridStep, plateRadius: identity.mapStyle.plateRadius }); } });   // size after layout
  }

  show(TABS.some((t) => t.id === tab) ? tab : 'map');
}
