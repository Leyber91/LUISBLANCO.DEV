/* ============================================================
   exoplanet/main.js — entry for exomania.html.
   Loads the catalogue (streamed, with a themed progress veil),
   boots the WebGL planet, wires the HUD, supports live refresh.
   ============================================================ */

import { Exoplanet } from './exoplanet.js';
import { loadCatalogue, toParams, classify } from './data.js';
import { buildRegistry, buildReticle, buildTelemetry, buildControls } from './ui.js';
import { buildNarrator } from './narrative.js';

window.__EXO_STILL__ = new URLSearchParams(location.search).has('still');

// ---- loading veil controller: "contacting the Kepler probe archive" ----
function buildLoader() {
  const veil = document.getElementById('exo-loading');
  const statusEl = document.getElementById('load-status');
  const detailEl = document.getElementById('load-detail');
  const pctEl = document.getElementById('load-pct');
  const fill = document.getElementById('load-fill');
  const track = veil && veil.querySelector('.load-track');
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  return {
    show() { if (veil) veil.classList.remove('hidden'); },
    setStatus,
    update(p) {
      if (!veil) return;
      if (p.phase === 'download') {
        setStatus('Receiving telemetry from Kepler archive');
        if (p.total) {
          const pct = Math.min(100, Math.round((p.received / p.total) * 100));
          track.classList.remove('indet'); fill.style.width = pct + '%';
          detailEl.textContent = mb(p.received) + ' / ' + mb(p.total);
          pctEl.textContent = pct + '%';
        } else {
          track.classList.add('indet');
          detailEl.textContent = mb(p.received) + ' received';
          pctEl.textContent = '';
        }
      } else if (p.phase === 'parse') {
        track.classList.remove('indet'); fill.style.width = '100%'; pctEl.textContent = '100%';
        setStatus('Decoding deep-field datastream');
      } else if (p.phase === 'process') {
        setStatus('Charting worlds');
      } else if (p.phase === 'done') {
        setStatus('Charted ' + p.count.toLocaleString() + ' worlds');
        detailEl.textContent = 'uplink complete';
      }
    },
    hide() { if (veil) requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('hidden'))); },
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('exo-canvas');
  const engine = new Exoplanet(canvas);
  const loader = buildLoader();
  if (!engine.ok()) { loader.hide(); return; }

  // HUD pieces that persist across refreshes
  const reticle = buildReticle(document.getElementById('exo-stage'));
  const telemetry = buildTelemetry(document.getElementById('hud-right'));
  const narrator = buildNarrator(document.getElementById('hud-bottom'));
  let catalogue = [];
  let registry = null;
  let current = null;
  let started = false;

  function select(p) {
    if (!p) return;
    current = p;
    engine.load(toParams(p));
    reticle.update(p);
    telemetry.update(p);
    registry && registry.setActive(p.pl_name);
    controls.sync();
    controls.setNoSurface(classify(p).klass >= 2);
    narrator.describe(p);
  }

  const controls = buildControls(document.getElementById('hud-right'), engine, {
    onRandom: () => select(catalogue[Math.floor(Math.random() * catalogue.length)]),
  });

  function pickInitial() {
    const params = new URLSearchParams(location.search);
    const want = params.get('p') && catalogue.find((p) => p.pl_name === params.get('p'));
    const landmark = catalogue.find((p) => /Kepler-62 e|Kepler-442 b|Kepler-186 f/.test(p.pl_name));
    const habitable = catalogue.find((p) => classify(p).habitable && p.pl_rade && p.pl_rade < 1.8);
    return want || landmark || habitable || catalogue[0];
  }

  // load (or reload) the catalogue and (re)build the navigation registry
  let loading = false;
  async function loadAndBuild(force) {
    if (loading) return;                            // ignore re-entrant refresh clicks
    loading = true;
    const hadCatalogue = catalogue.length > 0;
    loader.show();
    loader.setStatus(force ? 'Re-contacting Kepler probe archive' : 'Contacting Kepler probe archive');
    try {
      const next = await loadCatalogue((p) => loader.update(p), !!force);
      if (!next.length) throw new Error('empty catalogue');   // HTTP 200 but no usable rows
      catalogue = next;
    } catch (e) {
      console.error('catalogue load failed', e);
      loader.setStatus('Uplink failed — check connection and retry');
      if (hadCatalogue) loader.hide();              // refresh failed: keep the working session, don't strand the veil
      loading = false;
      return;
    }

    document.getElementById('hud-left').innerHTML = '';
    registry = buildRegistry(document.getElementById('hud-left'), catalogue, (p) => select(p), {
      onRefresh: () => loadAndBuild(true),
    });

    // keep the current target if it still exists, else pick a fresh landmark
    const keep = current && catalogue.find((p) => p.pl_name === current.pl_name);
    select(keep || pickInitial());

    const view = new URLSearchParams(location.search).get('view');
    if (!started && (view === 'surface' || view === 'closeorbit')) {
      engine.cfg.camMode = view;
      controls.setMode(view);                       // keep the HUD mode buttons in sync with the deep-linked camera
    }

    if (!started) { engine.start(); started = true; }
    loader.hide();
    loading = false;
  }

  await loadAndBuild(false);
});
