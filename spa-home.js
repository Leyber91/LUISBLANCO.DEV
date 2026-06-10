/* =========================================================================
   spa-home.js — home-route wiring: the was/wasn't/can-be triptych.
   Panels ignite (.lit) when scrolled into view: fig I timeline nodes fade in,
   fig II myth chips take the gold strike, fig III lattice draws its edges.
   Reduced motion (system, preview, or html.reduced-motion) → final frame
   immediately. Re-armed by spa-router on every visit to /.
   ========================================================================= */
(function(){
  let obs=null;
  function reduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('reduced-motion')
      || !!(window.LB && window.LB.reducedPreview);
  }
  function init(){
    const scope=document.getElementById('page')||document;
    const panels=[...scope.querySelectorAll('.trip-panel')];
    if(!panels.length) return;
    if(reduced() || !('IntersectionObserver' in window)){
      panels.forEach(p=>p.classList.add('lit')); return;
    }
    obs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('lit'); obs.unobserve(e.target); } });
    },{ threshold:0.3 });
    panels.forEach(p=>obs.observe(p));
  }
  function teardown(){ if(obs){ obs.disconnect(); obs=null; } }
  window.LB_HOME = { init, teardown };
})();
