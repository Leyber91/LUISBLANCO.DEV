/* =========================================================================
   spa-home.js — home-route wiring. The home plate carries TWO labelled inner
   sections (01 hero · 02 mission); the global scroll spy only tracks one
   .plate-sec per route, so it can't tell them apart. This observer watches the
   inner sections so the drawing index reflects "02 mission" on scroll and the
   AEA glyph recedes while the mission console holds the viewport.
   Single source of truth: it writes only LB_ENGINE.setDIOverride + a body class,
   never the drawing-index DOM directly. Re-armed by spa-router on every / visit.
   ========================================================================= */
(function(){
  let obs=null;
  function init(){
    if(obs){ obs.disconnect(); obs=null; }
    const scope=document.getElementById('page')||document;
    const inside=scope.querySelector('.inside[data-screen-label]');
    const hero=scope.querySelector('.hero[data-screen-label]');
    if(!inside || !('IntersectionObserver' in window)) return;   // route default (01) + focal glyph
    const ratios=new Map();
    obs=new IntersectionObserver(entries=>{
      entries.forEach(e=> ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
      const ri=ratios.get(inside)||0, rh=ratios.get(hero)||0;
      const mission = ri>0.35 && ri>=rh;                          // section 02 holds the viewport
      document.body.classList.toggle('sec-mission', mission);     // CSS fades/recedes the glyph
      if(window.LB_ENGINE && window.LB_ENGINE.setDIOverride)
        window.LB_ENGINE.setDIOverride(mission ? '02' : '01');    // light the right drawing-index entry
    },{ threshold:[0,.2,.35,.5,.75] });
    if(hero) obs.observe(hero);
    obs.observe(inside);
  }
  function teardown(){ if(obs){ obs.disconnect(); obs=null; } document.body.classList.remove('sec-mission'); }
  window.LB_HOME = { init, teardown };
})();
