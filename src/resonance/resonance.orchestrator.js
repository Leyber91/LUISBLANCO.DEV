/* =========================================================================
   resonance.orchestrator.js — RESONANCE lifecycle + integration (load last).
   Owns the rAF loop, mounts the canvas into the section when it enters the
   viewport, bridges profile changes to LB_LUMEN.setPreset, and exposes
   the public API.  Aborts cleanly if Canvas2D is unavailable.

   Public API — window.LB_RESONANCE:
     init(sectionEl)   — called by spa-router.js initSections()
     setProfile(key)   — hot-swap model profile + drives LUMEN delta
     pause() / resume()
   ========================================================================= */
(function(){
  "use strict";
  const RESONANCE = (window.RESONANCE = window.RESONANCE || {});
  const CFG = RESONANCE.CONFIG;

  let engine = null, renderer = null, canvas = null;
  let raf = 0, last = 0, running = false, started = false;
  let activeProfile = CFG.DEFAULT_PROFILE;
  let io = null;   // IntersectionObserver

  // ── canvas mount ─────────────────────────────────────────────────────────
  function mountCanvas(container){
    canvas = document.createElement('canvas');
    canvas.className = 'rs-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    sizeCanvas(container);
  }

  function sizeCanvas(container){
    if(!canvas) return;
    const W = container.clientWidth  || 640;
    const H = container.clientHeight || 340;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width  = W;
    canvas.height = H;
    if(renderer) renderer.resize(W, H);
  }

  // ── rAF loop ─────────────────────────────────────────────────────────────
  function frame(ts){
    if(!running) return;
    if(!last) last = ts;
    const dt = Math.min(ts - last, 100);
    last = ts;
    if(engine)   engine.tick(dt);
    if(renderer) renderer.render(engine.getSignature());
    raf = requestAnimationFrame(frame);
  }

  function pause(){
    running = false;
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
  }

  function resume(){
    if(!started || running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  // ── LUMEN bridge ─────────────────────────────────────────────────────────
  // Applies the profile-specific delta on top of the base 'resonance' preset.
  function applyLumenDelta(profileKey){
    const base  = (window.LUMEN && window.LUMEN.CONFIG.PRESETS['resonance']);
    const delta = CFG.LUMEN_DELTA[profileKey];
    if(!base || !delta) return;
    // Merge delta into the preset so next setPreset picks it up.
    Object.assign(base, delta);
    if(window.LB_LUMEN) window.LB_LUMEN.setPreset('resonance');
  }

  // ── profile switch ───────────────────────────────────────────────────────
  function setProfile(key){
    if(!CFG.PROFILES[key]) return;
    activeProfile = key;
    if(engine) engine.setProfile(key);
    applyLumenDelta(key);
    // update button states
    const btns = document.querySelectorAll('.rs-profile-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.profile === key));
  }

  // ── init (called once by spa-router.js after the plate is mounted) ───────
  function init(sectionEl){
    if(started) return;
    if(!sectionEl) return;

    const container = sectionEl.querySelector('.rs-canvas-wrap');
    if(!container) return;

    // Build engine + renderer
    engine   = RESONANCE.Engine.create(activeProfile);
    mountCanvas(container);
    renderer = RESONANCE.Renderer.create(canvas);
    if(!renderer){ console.info('[RESONANCE] Canvas2D unavailable — panel inactive.'); return; }

    // Wire profile buttons
    const btns = sectionEl.querySelectorAll('.rs-profile-btn');
    btns.forEach(b => {
      b.addEventListener('click', () => setProfile(b.dataset.profile));
      b.classList.toggle('active', b.dataset.profile === activeProfile);
    });

    // Wire resize
    window.addEventListener('resize', () => sizeCanvas(container));

    started = true;

    // Use IntersectionObserver to start/stop the loop as the section
    // scrolls in/out of view (saves CPU when not visible).
    if('IntersectionObserver' in window){
      io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if(e.isIntersecting){ applyLumenDelta(activeProfile); resume(); }
          else pause();
        });
      }, { threshold: 0.05 });
      io.observe(sectionEl);
    } else {
      // Fallback: always run
      applyLumenDelta(activeProfile);
      resume();
    }

    console.info('[RESONANCE] online · profile: ' + activeProfile);
  }

  window.LB_RESONANCE = { init, setProfile, pause, resume };
})();
