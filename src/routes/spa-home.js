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
    changelog(scope);
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
  /* what changed: the last five "## YYYY-MM-DD, item" headings of EVOLUTION.md.
     Fetched once per page load; the strip stays hidden if the fetch fails. */
  let log=null;
  function changelog(scope){
    const box=scope.querySelector('.changelog'); if(!box || !window.fetch) return;
    log=log||fetch('EVOLUTION.md',{cache:'no-cache'}).then(r=> r.ok ? r.text() : '').catch(()=> '');
    log.then(text=>{
      const rows=[], re=/^## (\d{4}-\d{2}-\d{2}), (.+)$/gm; let m;
      while((m=re.exec(text)) && rows.length<5) rows.push([m[1], m[2].trim()]);
      if(!rows.length || !box.isConnected) return;
      const ol=box.querySelector('.cl-list'); ol.textContent='';
      rows.forEach(([d,t])=>{
        const li=document.createElement('li'), tm=document.createElement('time'), sp=document.createElement('span');
        tm.className='cl-date'; tm.dateTime=d; tm.textContent=d;
        sp.className='cl-item'; sp.textContent=t;
        li.append(tm, sp); ol.append(li);
      });
      box.hidden=false;
    });
  }
  function teardown(){ if(obs){ obs.disconnect(); obs=null; } document.body.classList.remove('sec-mission'); }
  window.LB_HOME = { init, teardown };
})();
