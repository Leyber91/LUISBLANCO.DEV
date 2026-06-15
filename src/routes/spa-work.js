/* =========================================================================
   spa-work.js — /work: the operational AI diagnostic (conversion route).
   ONE living element only (conversion > spectacle): the "leak -> 0" meter,
   the offer's thesis made visible — a gold filament that drains toward zero
   when it scrolls into view, mirroring the Leak Map demo so the visual ties
   the offer to the proof. Single-shot, never a perpetual loop on the page
   that earns. Reuses the triad count-down idiom (spa-projects.js).

   Router calls window.LB_WORK.init(scope) after /work mounts.
   ========================================================================= */
(function(){
  "use strict";
  const reduced = ()=> window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('reduced-motion')
    || (window.LB && (window.LB.reducedPreview || window.LB.motionOn===false));

  const fmt = v => '€ ' + Math.round(v).toLocaleString('en-US');

  function wireLeak(scope){
    const fig = scope.querySelector('.wk-leak');
    if(!fig) return;
    const valEl = fig.querySelector('.wk-leak-val');
    const fill  = fig.querySelector('.wk-leak-fill');
    const from  = parseFloat((valEl && valEl.dataset.from) || '12480');
    const to    = parseFloat((valEl && valEl.dataset.to)   || '0');
    const RESID = 0.05;   // a sliver remains — honest "toward zero", never a perfect 0
    let ran = false;

    const settle = ()=>{ if(valEl) valEl.textContent = fmt(to); if(fill) fill.style.width = (RESID*100)+'%'; };
    const run = ()=>{
      if(ran) return; ran = true;
      if(reduced()){ settle(); return; }
      const dur = 1900; let t0 = null;
      if(fill) fill.style.width = '100%';
      const ease = x => 1 - Math.pow(1-x, 3);
      (function step(ts){
        if(t0===null) t0 = ts;
        const k = Math.min(1, (ts - t0)/dur), e = ease(k);
        if(valEl) valEl.textContent = fmt(from + (to-from)*e);
        if(fill)  fill.style.width  = (100 - (100 - RESID*100)*e) + '%';
        if(k<1) requestAnimationFrame(step);
      })(performance.now());
    };

    if(!('IntersectionObserver' in window)){ run(); return; }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(en=>{ if(en.isIntersecting){ run(); io.unobserve(en.target); } });
    }, { threshold:0.5 });
    io.observe(fig);
  }

  function init(scope){
    scope = scope || document.querySelector('.plate-sec[data-sec="work"]') || document;
    wireLeak(scope);
  }

  window.LB_WORK = { init, teardown(){} };
})();
