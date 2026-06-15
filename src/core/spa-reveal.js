/* =========================================================================
   spa-reveal.js — revealOnEnter: the shared one-shot entrance atom.
   Any element marked [data-reveal] assembles (fade + small rise) the first
   time it scrolls into view, then is left alone. This is the site-wide
   reveal grammar for CONTENT (the engine's .scroll-draw / [data-scroll-reveal]
   stays for SVG draw-on driven by whole-page scroll progress).

   Honors prefers-reduced-motion / html.reduced-motion / LB.reducedPreview /
   LB.motionOn — in any of those it settles to the final frame instantly.
   Optional per-element cascade via inline style="--rd:.08s".

   window.LB_REVEAL.arm(scope) — scan a scope and observe its [data-reveal].
   Consumed by: work (now); projects / writing / about / contact / chrome next.
   ========================================================================= */
(function(){
  "use strict";
  const reduced = ()=> window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('reduced-motion')
    || (window.LB && (window.LB.reducedPreview || window.LB.motionOn===false));

  function arm(scope){
    scope = scope || document;
    const els = [...scope.querySelectorAll('[data-reveal]')].filter(el=>!el._revArmed);
    if(!els.length) return;
    els.forEach(el=>{ el._revArmed = true; });

    if(reduced() || !('IntersectionObserver' in window)){
      els.forEach(el=> el.classList.add('rev-in'));
      return;
    }
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if(!en.isIntersecting) return;
        en.target.classList.add('rev-in');
        io.unobserve(en.target);
      });
    }, { threshold:0.16, rootMargin:'0px 0px -7% 0px' });
    els.forEach(el=> io.observe(el));
  }

  window.LB_REVEAL = { arm };
})();
