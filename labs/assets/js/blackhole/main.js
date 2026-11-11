/* ============================================================
   blackhole/main.js — entry for bh_animation_page.html.
   Wires the store, the renderer, the panels, the tour and the
   question box, and runs the frame loop with performance tiers.
   ============================================================ */

import { Store } from './state.js';
import { Renderer } from './renderer.js';
import { TIERS } from './config.js';
import { derive } from './physics.js';
import { buildUI } from './ui.js';

const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

let app_perfTier = 'mid';
function boot() {
  const canvas = document.getElementById('bh-canvas');
  const store = new Store();
  store.reduced = reduceMQ.matches || STILL;

  // URL state first, then the defaults of the object it names
  const fromUrl = store.fromQuery(location.search);
  const hasState = Object.keys(fromUrl).length > 0;
  store.set(store.objectPatch(fromUrl.obj || 'm87'), { instant: true, src: 'boot' });
  store.set(fromUrl, { instant: true, src: 'boot' });
  if (store.reduced) store.set({ anim: false }, { instant: true, src: 'boot' });

  const renderer = new Renderer(canvas);
  if (!renderer.ok()) {
    const m = document.getElementById('bh-nogl');
    if (m) { m.hidden = false; m.querySelector('[data-why]').textContent = renderer.error || 'WebGL2 unavailable.'; }
    console.warn(renderer.error);
  }

  // tier: manual from the state, or auto starting from the device class
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  // a still capture traces once at the mid tier whatever the GPU
  let autoTier = STILL ? 'mid' : renderer.software ? 'min' : coarse ? 'low' : 'mid';
  const tierName = () => (store.get('tier') === 'auto' ? autoTier : store.get('tier'));
  renderer.tier = TIERS[tierName()];
  app_perfTier = tierName();
  renderer.resize(true);

  const app = {
    store, renderer, still: STILL, hasState,
    model: derive(store.all()),
    time: 0, ignite: store.reduced || STILL || hasState ? 1 : 0, ignitedAt: performance.now(),
    hover: { r: 0 }, hot: { phi: 0 },
    perf: { fps: 0, ms: 0, tier: app_perfTier, samples: [] },
    interacting: false, lastInput: performance.now(),
    request: () => { app.needs = true; },
  };
  app.frameUniforms = frameUniforms;
  window.__bh = app;     // for the console and the verification harness

  let geoKey = '';
  const geometryKey = () => {
    const v = store.shown;
    return [v.a.toFixed(5), v.q.toFixed(5), v.incl.toFixed(4), v.rcam.toFixed(4), v.fov.toFixed(4), v.tilt.toFixed(3), v.rout,
      store.get('observer'), store.get('emit')].join('|');
  };
  const pushGeometry = () => {
    const v = store.shown;
    const view = { a: v.a, q: v.q, incl: v.incl, rcam: v.rcam, fov: v.fov, tilt: v.tilt, rout: v.rout, observer: store.get('observer'), emit: store.get('emit') };
    const model = derive({ ...store.all(), a: v.a, q: v.q, rout: v.rout });
    renderer.setGeometry(renderer.buildGeometry(view), model.profile);
    app.geoView = view;
  };

  store.on((changed) => {
    if (changed.includes('tier')) { renderer.setTier(TIERS[tierName()]); geoKey = ''; }
    app.model = derive(store.all());
    app.needs = true;
    app.urlDirty = true;
  });

  const ui = buildUI(app);
  app.ui = ui;

  // keep the URL in step with the state (replaceState, throttled)
  setInterval(() => {
    if (!app.urlDirty) return;
    app.urlDirty = false;
    const q = store.toQuery();
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, 400);

  window.addEventListener('resize', () => { renderer.resize(); geoKey = ''; app.needs = true; ui.layout?.(); }, { passive: true });
  reduceMQ.addEventListener?.('change', (e) => { store.reduced = e.matches; if (e.matches) store.set({ anim: false }); });

  // pause rendering when the tab is hidden or the canvas is scrolled off-screen
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) requestAnimationFrame(loop); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { const v = es[0].isIntersecting; if (v && !visible) { visible = true; requestAnimationFrame(loop); } visible = v && !document.hidden; }).observe(canvas);
  }

  let last = performance.now(), frames = 0, acc = 0, tierChecks = 0, lastDraw = 0, drew = false, costAcc = 0, costN = 0, winStart = performance.now();
  const t0 = performance.now();
  const ORDER = ['min', 'low', 'mid', 'high'];
  function loop(now) {
    if (!visible) return;
    const dt = Math.min(250, now - last);
    last = now;
    // the interval after a frame that drew is that frame's cost (GPU-bound), the frame-time readout
    if (drew) {
      costAcc += dt; costN++; drew = false;
      // median over the last 60 drawn frames, for the on-page readout
      app.perf.samples.push(dt); if (app.perf.samples.length > 60) app.perf.samples.shift();
      const sorted = app.perf.samples.slice().sort((x, y) => x - y);
      app.perf.median = sorted[Math.floor(sorted.length / 2)];
    }
    const transitioning = store.tick(now);
    ui.tick?.(now, dt);
    const anim = store.get('anim') && !STILL;
    if (anim) app.time += dt / 1000 * 7.5;            // M of coordinate time per second of display
    if (app.ignite < 1) app.ignite = Math.min(1, (now - app.ignitedAt) / 2600);
    const k = geometryKey();
    if (k !== geoKey) { geoKey = k; pushGeometry(); }
    const moving = transitioning || app.interacting;
    const busy = anim || moving || app.ignite < 1 || app.needs || (renderer.ok() && !renderer.mainDone);
    // on a slow GPU the disk animation alone redraws at a reduced rate; input and transitions do not wait
    const slow = app.perf.ms > 50 ? (app.perf.ms > 150 ? 250 : 100) : 0;
    const animOnly = !moving && !app.needs && app.ignite >= 1 && renderer.mainDone;
    if (busy && renderer.ok() && !(animOnly && slow && now - lastDraw < slow)) {
      app.needs = false;
      lastDraw = now; drew = true;
      const res = renderer.render(frameUniforms(app), { interacting: moving, full: STILL });
      // frame time and the tier choice in the first two seconds
      frames++;
      if (now - winStart > 500 && costN) {
        app.perf.fps = frames * 1000 / (now - winStart); app.perf.ms = costAcc / costN;
        frames = 0; costAcc = 0; costN = 0; winStart = now;
        ui.perf?.(app.perf, res);
      }
      void acc;
      renderer.adaptBands(dt);
      // the tier is chosen from frame times measured in the first two seconds
      if (!STILL && tierChecks < 2 && now - t0 > (tierChecks ? 2200 : 1000) && store.get('tier') === 'auto' && app.perf.ms) {
        tierChecks++;
        const ms = app.perf.ms;
        let i = ORDER.indexOf(autoTier);
        if (ms > 40) i = Math.max(0, i - (ms > 110 ? 2 : 1));
        else if (ms < 14) i = Math.min(ORDER.length - 1, i + 1);
        const next = ORDER[i];
        if (next !== autoTier) { autoTier = next; renderer.setTier(TIERS[autoTier]); geoKey = ''; }
        app.perf.tier = autoTier;
        ui.perf?.(app.perf, res);
      }
      if (res && res.refined && !app.refinedOnce) { app.refinedOnce = true; ui.onRefined?.(); }
    }
    requestAnimationFrame(loop);
  }

  if (renderer.ok()) {
    pushGeometry();
    geoKey = geometryKey();
  }
  requestAnimationFrame(loop);
  ui.start?.();
}

/** Auto exposure for the physical colour modes: the brightest disk pixel scales as g_max^4
 *  (bolometric beaming), so exposure follows 1 / g_max^(4 stretch), normalised to the
 *  default cinematic view (g_max about 1.5). Smoothed so a change of view eases. */
function autoExposure(app, s) {
  if (s.color !== 'thermal' && s.color !== 'true') return 1;
  const g = app.ui?.anchors?.()?.gmax;
  const target = g ? Math.min(1.6, Math.max(0.06, Math.pow(1.53 / Math.max(g, 1), 4 * s.stretch))) : 1;
  app.expoAuto = app.expoAuto == null ? target : app.expoAuto + (target - app.expoAuto) * 0.08;
  if (app.still) app.expoAuto = target;
  return app.expoAuto;
}

export function frameUniforms(app) {
  const s = app.store.all();
  const m = app.model;
  const hotR = s.hotspot > 0 ? Math.max(s.hotspot, m.ri) : 0;
  let hotPhi = 0;
  if (hotR) {
    const Om = 1 / (Math.pow(hotR, 1.5) + s.a);
    hotPhi = Om * app.time;
  }
  return {
    time: app.time,
    az: s.az * Math.PI / 180,
    tdisp: s.tdisp,
    tpeakK: Math.max(m.Tpeak, 1000),
    fcol: s.fcol,
    stretch: s.stretch,
    ignite: app.ignite,
    hot: [hotR, hotPhi, hotR ? 1 : 0],
    modeName: s.color,
    notes: s.notes ? 1 : 0,
    hl: app.hover.r || 0,
    expo: Math.pow(2, s.ev) * ({ true: 0.5, thermal: 0.62, redshift: 0.8, order: 0.9, steps: 0.9 }[s.color] ?? 0.8) * autoExposure(app, s),
    skyGain: 1,
    bloom: 0.5,
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
