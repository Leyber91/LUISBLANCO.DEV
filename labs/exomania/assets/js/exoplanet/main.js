/* ============================================================
   exoplanet/main.js — entry for exomania.html.
   Loads the catalogue, boots the WebGL planet, wires the HUD.
   ============================================================ */

import { Exoplanet } from './exoplanet.js';
import { loadCatalogue, toParams, classify } from './data.js';
import { buildRegistry, buildReticle, buildTelemetry, buildControls } from './ui.js';
import { buildNarrator } from './narrative.js';

window.__EXO_STILL__ = new URLSearchParams(location.search).has('still');

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('exo-canvas');
  const engine = new Exoplanet(canvas);
  if (!engine.ok()) { hideVeil(); return; }

  let catalogue = [];
  try {
    catalogue = await loadCatalogue();
  } catch (e) {
    console.error('catalogue load failed', e);
    document.getElementById('exo-loading').textContent = 'catalogue failed to load';
    return;
  }

  const reticle = buildReticle(document.getElementById('exo-stage'));
  const telemetry = buildTelemetry(document.getElementById('hud-right'));
  const registry = buildRegistry(document.getElementById('hud-left'), catalogue, (p) => select(p));
  const controls = buildControls(document.getElementById('hud-right'), engine, {
    onRandom: () => select(catalogue[Math.floor(Math.random() * catalogue.length)]),
  });
  const narrator = buildNarrator(document.getElementById('hud-bottom'));

  function select(p) {
    if (!p) return;
    engine.load(toParams(p));
    reticle.update(p);
    telemetry.update(p);
    registry.setActive(p.pl_name);
    controls.sync();
    narrator.describe(p);
  }

  // deep-link ?p=Planet+Name, else a small temperate landmark, else any small HZ world, else first
  const params = new URLSearchParams(location.search);
  const want = params.get('p') && catalogue.find((p) => p.pl_name === params.get('p'));
  const landmark = catalogue.find((p) => /Kepler-62 e|Kepler-442 b|Kepler-186 f/.test(p.pl_name));
  const habitable = catalogue.find((p) => classify(p).habitable && p.pl_rade && p.pl_rade < 1.8);
  select(want || landmark || habitable || catalogue[0]);

  if (params.get('view') === 'surface') engine.surface(true);

  engine.start();
  hideVeil();
});

function hideVeil() {
  const veil = document.getElementById('exo-loading');
  if (veil) requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('hidden')));
}
