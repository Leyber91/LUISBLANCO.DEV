/* =========================================================================
   lumen.orchestrator.js — LUMEN lifecycle + integration (load this LAST).
   Mounts the canvas into .substrate (between dot-grid and stars), probes
   WebGL2 + float-render support, builds the engine, runs the fixed-timestep
   loop, drives the route→preset spy, and exposes the public API. If anything
   is unsupported it aborts cleanly and the 2D-canvas starfield remains.

   Public API — window.LB_LUMEN:
     init() · setPreset(id) · setForm(id) · pause() · resume() · destroy() · tier
   Honors window.LB.motionOn / .reducedPreview / prefers-reduced-motion.
   ========================================================================= */
(function(){
  "use strict";
  const LUMEN  = (window.LUMEN = window.LUMEN || {});
  const CONFIG = LUMEN.CONFIG;
  const LB = (window.LB = window.LB || {});
  if(LB.motionOn === undefined) LB.motionOn = true;
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP = CONFIG.STEP_MS;

  let engine = null, canvas = null, host = null;
  let dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_CAP);
  let raf = 0, last = 0, acc = 0, settled = false, running = false, started = false, rt = 0;

  // ── mount ────────────────────────────────────────────────────────────────
  function mountCanvas(){
    host = document.querySelector('.substrate');
    if(!host){ host = document.createElement('div'); host.className='substrate'; host.setAttribute('aria-hidden','true'); document.body.prepend(host); }
    canvas = document.createElement('canvas');
    canvas.className = 'sub-lumen';
    const stars = host.querySelector('.sub-stars');   // sit BETWEEN dots and stars
    if(stars) host.insertBefore(canvas, stars); else host.appendChild(canvas);
    sizeCanvas();
  }
  function sizeCanvas(){
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    canvas.style.left = '0px'; canvas.style.top = '0px';
  }
  function cleanupCanvas(){ if(canvas && canvas.parentNode){ canvas.parentNode.removeChild(canvas); } canvas = null; }

  // ── init: probe + build + start ──────────────────────────────────────────
  function init(){
    if(started) return true;
    mountCanvas();
    const gl = canvas.getContext('webgl2', {
      alpha:true, premultipliedAlpha:true, antialias:false, depth:false,
      stencil:false, preserveDrawingBuffer:false, powerPreference:'high-performance'
    });
    if(!gl){ console.info('[LUMEN] no WebGL2 — starfield substrate retained.'); cleanupCanvas(); return false; }
    if(!gl.getExtension('EXT_color_buffer_float')){
      console.info('[LUMEN] EXT_color_buffer_float unavailable — starfield substrate retained.'); cleanupCanvas(); return false;
    }
    engine = LUMEN.Engine.create({ gl, canvas, dpr, tierKey: CONFIG.DEFAULT_TIER });
    if(!engine.build()){ engine = null; cleanupCanvas(); return false; }
    engine.seed();

    canvas.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', onVisibility, false);
    window.addEventListener('resize', onResize, false);

    started = true;
    LB_LUMEN.tier = engine.tier;
    last = 0; acc = 0; settled = false;
    resume();
    setTimeout(wireSpy, 500);   // let the router populate #page first
    console.info('[LUMEN] online · tier '+engine.tier+' · '+engine.count.toLocaleString()+' particles');
    return true;
  }

  // ── loop (fixed timestep + accumulator) ──────────────────────────────────
  function frame(ts){
    if(!running) return;
    const reduced = sysReduced || LB.reducedPreview;
    if(!LB.motionOn || reduced){               // settle to one static frame, no sim
      if(!settled){ engine.render(); settled = true; }
      raf = requestAnimationFrame(frame); return;
    }
    settled = false;
    if(!last) last = ts;
    acc += Math.min(ts - last, 100); last = ts;   // clamp long stalls
    let steps = 0;
    while(acc >= STEP && steps < 6){ engine.lerp(STEP); engine.step(STEP/1000); acc -= STEP; steps++; }
    engine.render();
    raf = requestAnimationFrame(frame);
  }
  function pause(){ running = false; if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function resume(){ if(!started || running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }

  // ── events ───────────────────────────────────────────────────────────────
  function onResize(){
    clearTimeout(rt);
    rt = setTimeout(()=>{
      dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_CAP);
      if(canvas) sizeCanvas();
      if(engine){ engine.resize(dpr); settled = false; }
    }, 150);
  }
  function onVisibility(){ if(document.hidden) pause(); else resume(); }
  function onContextLost(e){ e.preventDefault(); pause(); console.warn('[LUMEN] context lost.'); }

  function destroy(){
    pause();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if(engine) engine.destroy();
    engine = null;
    cleanupCanvas();
    started = false; settled = false;
  }

  // ── route-driven preset spy ──────────────────────────────────────────────
  function setPreset(name){
    const p = CONFIG.PRESETS[name]; if(!p) return;
    LB_LUMEN.preset = name;
    if(engine) engine.setPresetTarget(p);
  }
  function detectPreset(){
    const page = document.getElementById('page'); if(!page) return;
    for(const [cls,preset] of CONFIG.SECTION_PRESET){ if(page.querySelector(cls)){ setPreset(preset); return; } }
  }
  function wireSpy(){
    const page = document.getElementById('page'); if(!page) return;
    detectPreset();
    try { new MutationObserver(detectPreset).observe(page, { childList:true }); } catch(_){}
    window.addEventListener('hashchange', ()=> setTimeout(detectPreset, 60));
  }

  function setForm(id){ LB_LUMEN.form = id;   /* T-1.4: morph attractor target */ }

  const LB_LUMEN = window.LB_LUMEN = {
    init, setPreset, setForm, pause, resume, destroy, tier: CONFIG.DEFAULT_TIER, preset:null, form:null
  };

  function boot(){ try { init(); } catch(err){ console.warn('[LUMEN] init error — starfield retained.', err); try{ destroy(); }catch(_){} } }
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
