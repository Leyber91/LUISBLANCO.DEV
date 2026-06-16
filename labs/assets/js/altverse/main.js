/* ============================================================
   altverse/main.js — Phase 1 entry.
   compose (pick a divergence) -> THE LOOM (staged generation
   theatre, echo-driven, same stages the live DAG will run) ->
   EXPLORE (map + chronology + dossier) -> save to localStorage.

   ?still / ?demo=<id> fast-path straight to a rendered world
   (screenshot + reduced-motion). Phase 2 swaps the hardcoded
   linear runner for the data-driven pipeline + live Nemotron.
   ============================================================ */

import { PRESETS, PRESETS_BY_ID } from './divergence-presets.js';
import { generateEcho } from './echo-world.js';
import { runWorld } from './pipeline.js';
import { openCardModal } from './render/card.js';
import { renderWorld } from './render/world-view.js';
import { saveWorld, listWorlds, loadWorld, decodeShareHash } from './store.js';
import { hashStr } from './rng.js';

const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const DEMO = params.get('demo');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || STILL;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

const app = document.getElementById('av-app');
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

const STAGES = [
  { id: 'premise', label: 'Premise & axioms' },
  { id: 'firstOrder', label: 'First-order cascade' },
  { id: 'geography', label: 'Geography' },
  { id: 'chronology', label: 'Chronology' },
  { id: 'civilizations', label: 'Civilizations' },
  { id: 'contrast', label: 'Contrast' },
  { id: 'entry', label: 'Arrival' },
];

function buildDivergence(preset) {
  return {
    id: preset.id, domain: preset.domain, statement: preset.statement,
    baseline: preset.baseline, entryNode: preset.entryNode,
    escalation_ceiling: preset.ceiling, seed: hashStr(preset.id + '|' + preset.statement),
  };
}

/* ---------------- COMPOSE ---------------- */
function screenCompose() {
  app.innerHTML = '';
  const root = el('div', 'av-compose');

  const hero = el('header', 'av-compose-hero');
  hero.appendChild(el('div', 'av-eyebrow', 'TRYVERSE · ALTERNATE REALITY SCENARIOS'));
  hero.appendChild(el('h1', 'av-title', 'Change one thing.<br>Watch a world diverge.'));
  hero.appendChild(el('p', 'av-sub', 'Flip a single constant of reality. A deterministic engine propagates the consequences into a complete, internally-consistent world — premise, chronology, map and the causal record of how it all differs from ours.'));
  root.appendChild(hero);

  root.appendChild(el('div', 'av-pick-label', 'Choose a divergence'));
  const grid = el('div', 'av-presets');
  PRESETS.forEach((p) => {
    const card = el('button', 'av-preset');
    card.innerHTML =
      `<span class="av-preset-domain">${p.domain}</span>` +
      `<span class="av-preset-statement">${p.statement}</span>` +
      `<span class="av-preset-hint">${p.hint}</span>` +
      `<span class="av-preset-go">Diverge →</span>`;
    card.addEventListener('click', () => screenLoom(p));
    grid.appendChild(card);
  });
  root.appendChild(grid);

  // saved worlds
  const saved = listWorlds();
  if (saved.length) {
    root.appendChild(el('div', 'av-pick-label', 'Saved worlds'));
    const shelf = el('div', 'av-shelf');
    saved.slice(0, 12).forEach((s) => {
      const b = el('button', 'av-saved');
      b.innerHTML = `<span class="nm">${s.title}</span><span class="dv">${s.divergenceSummary}</span>`;
      b.addEventListener('click', () => { const w = loadWorld(s.id); if (w) screenExplore(w, false); });
      shelf.appendChild(b);
    });
    root.appendChild(shelf);
  }

  app.appendChild(root);
}

/* ---------------- THE LOOM ---------------- */
async function screenLoom(preset) {
  const divergence = buildDivergence(preset);
  let world = null, liveWorld = null;

  app.innerHTML = '';
  const root = el('div', 'av-loom');
  root.appendChild(el('div', 'av-eyebrow', 'THE LOOM'));
  root.appendChild(el('h2', 'av-loom-title', `Weaving — ${preset.statement}`));

  // skip-to-world + ETA/progress gauge
  const bar = el('div', 'av-loom-bar');
  const eta = el('div', 'av-eta', `stage 0/${STAGES.length}`);
  const gauge = el('div', 'av-gauge', '<i></i>');
  const gaugeFill = gauge.firstChild;
  const skip = el('button', 'av-skip', 'Skip to world');
  skip.addEventListener('click', () => { const w = liveWorld || world; if (w) screenExplore(w, true); });
  bar.append(eta, gauge, skip);
  root.appendChild(bar);

  const grid = el('div', 'av-loom-grid');
  const spine = el('div', 'av-spine');
  const nodes = {};
  STAGES.forEach((s) => {
    const n = el('div', 'av-node', `<span class="dot"></span><span class="lb">${s.label}</span>`);
    nodes[s.id] = n; spine.appendChild(n);
  });
  grid.appendChild(spine);

  const cog = el('div', 'av-cog');
  cog.appendChild(el('div', 'av-cog-head', 'COGITATION'));
  const cogStream = el('div', 'av-cog-stream');
  cog.appendChild(cogStream);
  grid.appendChild(cog);

  const ledger = el('div', 'av-world-ledger');
  ledger.appendChild(el('div', 'av-ledger-head2', 'WORLD LEDGER'));
  const ledgerBody = el('div', 'av-ledger-body');
  ledger.appendChild(ledgerBody);
  grid.appendChild(ledger);

  root.appendChild(grid);
  const enter = el('button', 'av-enter', 'Enter the world');
  enter.disabled = true;
  enter.addEventListener('click', () => world && screenExplore(world, true));
  root.appendChild(enter);
  app.appendChild(root);

  // drive the Loom from the unified runner (ECHO now; live Nemotron on deploy)
  const labelOf = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
  const total = STAGES.length;
  let done = 0;
  const t0 = Date.now();
  const tick = reduced ? null : setInterval(() => {
    eta.innerHTML = `stage <b>${done}/${total}</b> &middot; ${Math.round((Date.now() - t0) / 1000)}s`;
  }, 250);

  world = await runWorld(divergence, {
    reduced,
    onWorld: (w) => { liveWorld = w; skip.classList.add('ready'); },
    onStage: (id, state) => {
      const n = nodes[id]; if (!n) return;
      n.classList.remove('active', 'done', 'degraded');
      if (state === 'active') {
        n.classList.add('active');
        cogStream.appendChild(document.createTextNode(`\n› ${labelOf[id] || id}\n`));
      } else {
        n.classList.add(state === 'degraded' ? 'degraded' : 'done');
        done++; gaugeFill.style.width = Math.round((done / total) * 100) + '%';
      }
    },
    onReasoning: (id, text) => { cogStream.appendChild(document.createTextNode(text)); cogStream.scrollTop = cogStream.scrollHeight; },
    onLedger: (id, text) => { ledgerBody.appendChild(el('div', 'av-ledger-card', `<span class="st">${labelOf[id] || id}</span>${text}`)); },
  });

  if (tick) clearInterval(tick);
  gaugeFill.style.width = '100%';
  eta.innerHTML = `complete &middot; ${Math.round((Date.now() - t0) / 1000)}s`;
  enter.disabled = false;
  enter.classList.add('ready');
  if (reduced) screenExplore(world, true);   // still/reduced -> straight in
}

/* ---------------- EXPLORE ---------------- */
function screenExplore(world, save) {
  if (save) { try { saveWorld(world); } catch (_) {} }
  renderWorld(world, app, { onBack: screenCompose, tab: params.get('tab') });
}

/* ---------------- boot ---------------- */
function boot() {
  // shared permalink: replay the exact world, no regeneration
  const shared = decodeShareHash(location.hash);
  if (shared && shared.divergence) { screenExplore(shared, false); return; }

  if (STILL || DEMO) {
    const preset = PRESETS_BY_ID[DEMO] || PRESETS[0];
    const { world } = generateEcho(buildDivergence(preset));
    world.createdAt = Date.now();
    screenExplore(world, false);
    if (params.has('card')) openCardModal(world);
    return;
  }
  if (params.has('loom')) { screenLoom(PRESETS_BY_ID[params.get('loom')] || PRESETS[0]); return; }
  screenCompose();
}
boot();
