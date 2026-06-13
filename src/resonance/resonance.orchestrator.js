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

  let engine = null, renderer = null, canvas = null, ctx = null;
  let raf = 0, last = 0, running = false, started = false;
  let activeProfile = CFG ? CFG.DEFAULT_PROFILE : 'council';

  function sizeCanvas(){
    if(!canvas) return;
    const wrap = canvas.parentElement;
    if(!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(200, Math.floor(rect.height));
    if(canvas.width !== W || canvas.height !== H){
      canvas.width = W; canvas.height = H;
      if(renderer) renderer.resize(W, H);
    }
  }

  function bootFrame(){
    if(!ctx || !canvas) return;
    sizeCanvas();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,10,18,0.25)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(212,162,76,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    ctx.fillStyle = '#D4A24C';
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RESONANCE · ' + activeProfile, W / 2, H / 2);
    ctx.fillStyle = 'rgba(212,162,76,0.06)';
    for(let gy = 20; gy < H; gy += 20){
      for(let gx = 20; gx < W; gx += 20){ ctx.fillRect(gx, gy, 1, 1); }
    }
  }

  // ── rAF loop ─────────────────────────────────────────────────────────────
  function frame(ts){
    if(!running) return;
    try {
      if(!last) last = ts;
      const dt = Math.min(ts - last, 100);
      last = ts;
      if(engine) engine.tick(dt);
      if(renderer && engine) renderer.render(engine.getSignature());
      raf = requestAnimationFrame(frame);
    } catch(err) {
      console.error('[RESONANCE] frame error:', err);
      running = false;
    }
  }

  function pause(){ running = false; if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function resume(){ if(!started || running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }

  function applyLumenDelta(profileKey){
    const base = (window.LUMEN && window.LUMEN.CONFIG && window.LUMEN.CONFIG.PRESETS && window.LUMEN.CONFIG.PRESETS['resonance']);
    const delta = CFG && CFG.LUMEN_DELTA && CFG.LUMEN_DELTA[profileKey];
    if(!base || !delta) return;
    Object.assign(base, delta);
    if(window.LB_LUMEN) window.LB_LUMEN.setPreset('resonance');
  }

  function setProfile(key){
    if(!CFG || !CFG.PROFILES || !CFG.PROFILES[key]) return;
    activeProfile = key;
    if(engine) engine.setProfile(key);
    applyLumenDelta(key);
    const btns = document.querySelectorAll('.rs-profile-btn');
    btns.forEach(b => b.classList.toggle('active', b.dataset.profile === key));
  }

  function init(sectionEl){
    if(started){ console.info('[RESONANCE] already started'); return; }
    if(!sectionEl){ console.warn('[RESONANCE] no sectionEl'); return; }
    const wrap = sectionEl.querySelector('.rs-canvas-wrap');
    if(!wrap){ console.warn('[RESONANCE] no wrap'); return; }

    canvas = wrap.querySelector('canvas.rs-canvas');
    if(!canvas){ console.warn('[RESONANCE] no canvas in wrap'); return; }
    ctx = canvas.getContext('2d');
    if(!ctx){ console.warn('[RESONANCE] Canvas2D unavailable'); return; }

    try {
      engine = RESONANCE.Engine.create(activeProfile);
      renderer = RESONANCE.Renderer.create(canvas);
    } catch(err) {
      console.error('[RESONANCE] engine/renderer error:', err);
      bootFrame(); return;
    }

    const btns = sectionEl.querySelectorAll('.rs-profile-btn');
    btns.forEach(b => {
      b.addEventListener('click', () => setProfile(b.dataset.profile));
      b.classList.toggle('active', b.dataset.profile === activeProfile);
    });

    window.addEventListener('resize', sizeCanvas);

    started = true;
    sizeCanvas();
    bootFrame();
    wrap.classList.add('active');
    setTimeout(() => { applyLumenDelta(activeProfile); resume(); }, 120);

    console.info('[RESONANCE] online · profile:', activeProfile);
  }

  window.LB_RESONANCE = { init, setProfile, pause, resume };
})();
