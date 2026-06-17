/* ============================================================
   ui.js — the cockpit HUD. Three instrument clusters drawn over
   the viewport: a navigation catalogue (target select), a target
   reticle label, and a telemetry readout fed by real data. Plus
   a compact viewport-control instrument. Token-styled; no deps.
   ============================================================ */

import { classify, derived, category } from './data.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const fmt = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '—' : (+v).toFixed(d);
// escape archive strings before they go into innerHTML (defense-in-depth: the
// catalogue is trusted today, but the refresh/cloud-sync direction may not be)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// type -> dot/chip accent + short tag
const TYPE_META = {
  0: { tag: 'TER', accent: 'var(--horizon)' },
  1: { tag: 'GAS', accent: 'var(--accretion-soft)' },
  2: { tag: 'ICE', accent: 'var(--horizon-soft)' },
  3: { tag: 'LAVA', accent: 'var(--danger)' },
};
const accentFor = (p) => { const c = classify(p); return c.habitable ? 'var(--ok)' : TYPE_META[c.type].accent; };

/* ---- saved worlds: local bookmarks (free); cloud sync is the future premium ---- */
const SAVE_KEY = 'exo:saved';
const loadSaved = () => { try { return new Set(JSON.parse(localStorage.getItem(SAVE_KEY) || '[]')); } catch (e) { return new Set(); } };
const persistSaved = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify([...s])); } catch (e) {} };

/* ---- navigation catalogue (left), grouped by category ---- */
export function buildRegistry(host, catalogue, onSelect, opts = {}) {
  // bucket every world into its category once
  const cats = new Map();
  catalogue.forEach((p) => {
    const m = category(p);
    if (!cats.has(m.key)) cats.set(m.key, { meta: m, items: [] });
    cats.get(m.key).items.push(p);
  });
  const groups = [...cats.values()].sort((a, b) => a.meta.order - b.meta.order);
  const byName = new Map(catalogue.map((p) => [p.pl_name, p]));
  // prune saved names that no longer exist in the (possibly refreshed) catalogue,
  // so the stored set can't accumulate dead names or resurrect a re-added world
  let saved = loadSaved();
  const prePrune = saved.size;
  saved = new Set([...saved].filter((n) => byName.has(n)));
  if (saved.size !== prePrune) persistSaved(saved);

  const total = catalogue.length.toLocaleString();
  const panel = el('div', 'hud-panel nav-panel');
  const headEl = el('div', 'hud-head', `<span>Nav · Catalogue</span>`);
  const tools = el('span', 'hud-head-tools');
  tools.appendChild(el('span', 'hud-count', total));
  const shuffleBtn = el('button', 'nav-refresh', '<i class="fa-solid fa-shuffle"></i>');
  shuffleBtn.title = 'Shuffle — surface a different set of worlds';
  shuffleBtn.setAttribute('aria-label', 'Shuffle catalogue');
  shuffleBtn.addEventListener('click', () => { groups.forEach((g) => shuffleArr(g.items)); render(); });
  tools.appendChild(shuffleBtn);
  const refreshBtn = el('button', 'nav-refresh', '<i class="fa-solid fa-arrows-rotate"></i>');
  refreshBtn.title = 'Refresh the catalogue from the Kepler archive';
  refreshBtn.setAttribute('aria-label', 'Refresh catalogue');
  refreshBtn.addEventListener('click', () => opts.onRefresh && opts.onRefresh());
  tools.appendChild(refreshBtn);
  headEl.appendChild(tools);
  panel.appendChild(headEl);
  const search = el('input', 'nav-search');
  Object.assign(search, { type: 'search', placeholder: `search ${total} worlds…`, spellcheck: false });
  search.setAttribute('aria-label', 'Search worlds');
  panel.appendChild(search);
  const listWrap = el('div', 'nav-list');
  panel.appendChild(listWrap);
  host.appendChild(panel);

  let active = null;
  const expanded = new Set(['hz', 'saved']);   // habitable zone + saved open by default
  const PER = 26;
  // Fisher-Yates re-roll for a category's worlds, so a capped group isn't always the
  // same alphabetical first-N (the gas-giant / large groups otherwise look identical
  // every visit). Re-orders the per-group array in place; search + saved are unaffected.
  function shuffleArr(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } }

  function toggleSave(name) {
    saved.has(name) ? saved.delete(name) : saved.add(name);
    persistSaved(saved);
    render();
  }

  const rowEl = (p, accent) => {
    const row = el('button', 'nav-row');
    row.dataset.name = p.pl_name;
    const on = saved.has(p.pl_name);
    row.innerHTML = `<span class="nav-dot" style="background:${accent}"></span>
      <span class="nav-name">${esc(p.pl_name)}</span><span class="nav-host">${esc(p.hostname)}</span>
      <i class="nav-star fa-star ${on ? 'fa-solid on' : 'fa-regular'}" title="${on ? 'Remove from saved' : 'Save this world'}"></i>`;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.nav-star')) { e.stopPropagation(); toggleSave(p.pl_name); return; }
      onSelect(p);
    });
    return row;
  };

  function render() {
    const q = search.value.trim().toLowerCase();
    listWrap.innerHTML = '';
    const frag = document.createDocumentFragment();

    // saved worlds pinned at the top
    const savedItems = [...saved].map((n) => byName.get(n)).filter(Boolean)
      .filter((p) => !q || p.pl_name.toLowerCase().includes(q) || p.hostname.toLowerCase().includes(q));
    // during search, don't also list saved worlds under their category (avoids
    // duplicate rows + double-active highlight); when browsing, pinning is by design
    const shownSaved = q ? new Set(savedItems.map((p) => p.pl_name)) : new Set();
    if (savedItems.length) {
      const open = q ? true : expanded.has('saved');
      const sec = el('div', 'nav-sec nav-sec-saved');
      const head = el('button', 'nav-sec-head' + (open ? ' open' : ''));
      head.innerHTML = `<span class="nav-sec-dot" style="background:var(--accretion)"></span>
        <span class="nav-sec-label">Saved worlds</span><span class="nav-sec-count">${savedItems.length}</span>
        <span class="nav-sec-chev">${open ? '−' : '+'}</span>`;
      head.addEventListener('click', () => { expanded.has('saved') ? expanded.delete('saved') : expanded.add('saved'); render(); });
      sec.appendChild(head);
      if (open) {
        const body = el('div', 'nav-sec-body');
        savedItems.forEach((p) => body.appendChild(rowEl(p, 'var(--accretion)')));
        body.appendChild(el('div', 'nav-premium', 'Cloud sync across devices — premium, coming soon'));
        sec.appendChild(body);
      }
      frag.appendChild(sec);
    }

    groups.forEach((g) => {
      const items = q
        ? g.items.filter((p) => !shownSaved.has(p.pl_name) && (p.pl_name.toLowerCase().includes(q) || p.hostname.toLowerCase().includes(q)))
        : g.items;
      if (!items.length) return;
      const open = q ? true : expanded.has(g.meta.key);
      const sec = el('div', 'nav-sec');
      const head = el('button', 'nav-sec-head' + (open ? ' open' : ''));
      head.innerHTML = `<span class="nav-sec-dot" style="background:${g.meta.accent}"></span>
        <span class="nav-sec-label">${g.meta.label}</span><span class="nav-sec-count">${items.length}</span>
        <span class="nav-sec-chev">${open ? '−' : '+'}</span>`;
      head.addEventListener('click', () => { expanded.has(g.meta.key) ? expanded.delete(g.meta.key) : expanded.add(g.meta.key); render(); });
      sec.appendChild(head);
      if (open) {
        const body = el('div', 'nav-sec-body');
        const cap = q ? 80 : PER;
        items.slice(0, cap).forEach((p) => body.appendChild(rowEl(p, g.meta.accent)));
        if (items.length > cap) {
          if (q) {
            body.appendChild(el('div', 'nav-more', `+ ${items.length - cap} more — refine search`));
          } else {
            // not searching -> let the user re-roll THIS category to see different worlds
            const more = el('button', 'nav-more nav-more-btn', `+ ${items.length - cap} more — shuffle this list`);
            more.title = 'Shuffle — show a different set from this category';
            more.addEventListener('click', () => { shuffleArr(g.items); render(); });
            body.appendChild(more);
          }
        }
        sec.appendChild(body);
      }
      frag.appendChild(sec);
    });
    listWrap.appendChild(frag);
    markActive();
  }

  function markActive() {
    listWrap.querySelectorAll('.nav-row').forEach((r) => r.classList.toggle('active', r.dataset.name === active));
  }

  search.addEventListener('input', render);
  render();
  return {
    setActive(name) {
      active = name;
      const g = groups.find((gr) => gr.items.some((p) => p.pl_name === name));
      if (g && !expanded.has(g.meta.key) && !search.value) { expanded.add(g.meta.key); render(); }
      else markActive();
    },
  };
}

/* ---- target reticle label (top-centre, over the planet) ---- */
export function buildReticle(host) {
  const wrap = el('div', 'reticle');
  wrap.innerHTML = `
    <div class="reticle-brackets"><i></i><i></i><i></i><i></i></div>
    <div class="reticle-name" id="ret-name">—</div>
    <div class="reticle-class" id="ret-class">acquiring target…</div>`;
  host.appendChild(wrap);
  const nameEl = wrap.querySelector('#ret-name');
  const classEl = wrap.querySelector('#ret-class');
  return {
    update(p) {
      const c = classify(p);
      nameEl.textContent = p.pl_name;
      classEl.innerHTML = `<span class="ret-tag" style="color:${c.habitable ? 'var(--ok)' : TYPE_META[c.type].accent}">${TYPE_META[c.type].tag}</span> ${c.label}`;
    },
  };
}

/* ---- telemetry readout (right) ---- */
export function buildTelemetry(host) {
  const panel = el('div', 'hud-panel tel-panel');
  panel.appendChild(el('div', 'hud-head', `<span>Telemetry</span><span class="hud-live">● live</span>`));
  const body = el('div', 'tel-body');
  panel.appendChild(body);
  host.appendChild(panel);

  const ROWS = [
    ['host', 'Host star'],
    ['dist', 'Distance'],
    ['teff', 'Star temp'],
    ['radius', 'Radius'],
    ['mass', 'Mass'],
    ['gravity', 'Gravity'],
    ['eqt', 'Equil. temp'],
    ['period', 'Orbital period'],
    ['axis', 'Semi-major axis'],
  ];
  const cells = {};
  ROWS.forEach(([k, label]) => {
    const row = el('div', 'tel-row');
    row.appendChild(el('span', 'tel-label', label));
    const v = el('span', 'tel-val');
    cells[k] = v;
    row.appendChild(v);
    body.appendChild(row);
  });

  return {
    update(p) {
      const d = derived(p);
      cells.host.textContent = p.hostname;
      cells.dist.innerHTML = p.sy_dist ? `${fmt(d.lightyears, 0)} <i>ly</i>` : '—';
      cells.teff.innerHTML = p.st_teff ? `${fmt(p.st_teff, 0)} <i>K</i>` : '—';
      cells.radius.innerHTML = p.pl_rade ? `${fmt(p.pl_rade)} <i>R⊕</i>` : '—';
      cells.mass.innerHTML = p.pl_masse ? `${fmt(p.pl_masse)} <i>M⊕</i>` : '—';
      cells.gravity.innerHTML = d.gravity ? `${fmt(d.gravity)} <i>g</i>` : '—';
      cells.eqt.innerHTML = p.pl_eqt ? `${fmt(p.pl_eqt, 0)} <i>K</i>` : '—';
      cells.period.innerHTML = p.pl_orbper ? `${fmt(p.pl_orbper)} <i>d</i>` : '—';
      cells.axis.innerHTML = p.pl_orbsmax ? `${fmt(p.pl_orbsmax, 3)} <i>AU</i>` : '—';
      // colour the equilibrium temp by regime
      const t = p.pl_eqt;
      cells.eqt.style.color = !t ? '' : t > 1000 ? 'var(--danger)' : t < 200 ? 'var(--horizon-soft)'
        : (t >= 230 && t <= 330) ? 'var(--ok)' : 'var(--accretion-soft)';
    },
  };
}

/* ---- viewport controls (bottom-right) ---- */
export function buildControls(host, engine, { onRandom } = {}) {
  const panel = el('div', 'hud-panel ctl-panel');
  const head = el('div', 'hud-head', `<span>Viewport</span>`);
  const collapse = el('button', 'ctl-collapse', '–');
  head.appendChild(collapse);
  panel.appendChild(head);
  const body = el('div', 'ctl-body');
  panel.appendChild(body);

  // view presets
  const PRESETS = {
    Approach: { camDist: 4.7, pitch: 0.30, yaw: 0.7 },
    Terminator: { camDist: 4.2, pitch: 0.12, yaw: 2.5 },
    Polar: { camDist: 5.0, pitch: 1.15, yaw: 0.7 },
    Far: { camDist: 7.5, pitch: 0.25, yaw: 0.7 },
  };
  let noSurface = false;
  const restLabel = () => noSurface ? 'Descend into the clouds' : 'Stand on the surface';
  const resetModeBtns = () => {
    surfBtn.classList.remove('on'); surfBtn.textContent = restLabel();
    closeBtn.classList.remove('on'); closeBtn.textContent = 'Drop to close orbit';
  };

  const presetRow = el('div', 'ctl-presets');
  Object.entries(PRESETS).forEach(([name, p]) => {
    const b = el('button', 'ctl-preset', name);
    b.addEventListener('click', () => { engine.cfg.camMode = 'orbit'; Object.assign(engine.cfg, p); resetModeBtns(); if (!engine.running) engine._draw(); });
    presetRow.appendChild(b);
  });
  body.appendChild(presetRow);

  // close orbit — a low pass: planet limb + atmosphere across the horizon
  const closeBtn = el('button', 'ctl-surface', 'Drop to close orbit');
  closeBtn.addEventListener('click', () => {
    const on = engine.cfg.camMode !== 'closeorbit';
    engine.cfg.camMode = on ? 'closeorbit' : 'orbit';
    resetModeBtns();
    closeBtn.classList.toggle('on', on);
    closeBtn.textContent = on ? 'Return to orbit' : 'Drop to close orbit';
    if (!engine.running) engine._draw();
  });
  body.appendChild(closeBtn);

  // stand on the surface / descend into the clouds and look at the star
  const surfBtn = el('button', 'ctl-surface', restLabel());
  surfBtn.addEventListener('click', () => {
    const on = engine.cfg.camMode !== 'surface';
    engine.surface(on);
    resetModeBtns();
    surfBtn.classList.toggle('on', on);
    surfBtn.textContent = on ? 'Return to orbit' : restLabel();
  });
  body.appendChild(surfBtn);

  const SLIDERS = [
    { key: 'exposure', label: 'Exposure', min: 0.5, max: 2.2, step: 0.01 },
    { key: 'cloud', label: 'Cloud cover', min: 0, max: 1, step: 0.01 },
    { key: 'spin', label: 'Rotation', min: 0, max: 0.4, step: 0.005 },
    { key: 'atm', label: 'Atmosphere', min: 0, max: 2, step: 0.01 },
  ];
  SLIDERS.forEach((s) => {
    const row = el('label', 'ctl-row');
    row.appendChild(el('span', 'ctl-label', s.label));
    const val = el('span', 'ctl-val');
    const input = el('input', 'ctl-slider');
    Object.assign(input, { type: 'range', min: s.min, max: s.max, step: s.step, value: engine.cfg[s.key] });
    val.textContent = (+engine.cfg[s.key]).toFixed(2);
    input.addEventListener('input', () => { const v = parseFloat(input.value); engine.set(s.key, v); val.textContent = v.toFixed(2); });
    row.append(input, val);
    body.appendChild(row);
    s._input = input; s._val = val;
  });

  const rnd = el('button', 'ctl-random', 'Jump to random world');
  rnd.addEventListener('click', () => onRandom && onRandom());
  body.appendChild(rnd);

  collapse.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    collapse.textContent = hidden ? '–' : '+';
  });

  host.appendChild(panel);
  return {
    sync() { SLIDERS.forEach((s) => { s._input.value = engine.cfg[s.key]; s._val.textContent = (+engine.cfg[s.key]).toFixed(2); }); },
    setNoSurface(v) { noSurface = v; if (engine.cfg.camMode !== 'surface') surfBtn.textContent = restLabel(); },
    setMode(mode) {                                 // reflect a programmatic camMode (deep-link) in the buttons
      resetModeBtns();
      if (mode === 'surface') { surfBtn.classList.add('on'); surfBtn.textContent = 'Return to orbit'; }
      else if (mode === 'closeorbit') { closeBtn.classList.add('on'); closeBtn.textContent = 'Return to orbit'; }
    },
  };
}
