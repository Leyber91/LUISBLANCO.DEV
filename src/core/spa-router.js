/* =========================================================================
   spa-router.js — THE POSTER (P1). One continuous plate: every section is
   mounted ONCE, in order, into #page. The hash router survives for deep links
   (#/architecture?locate=RAG) but navigation now SCROLLS instead of swapping.
   A scroll spy keeps body[data-route], nav, drawing index, sheet tag, glyph
   docking and substrate amplitude in sync with the section under the viewport.
   Per-section modules (architecture locator, projects weave, writing, home
   triptych, about field) initialize once after mount. spa-spine.js draws the
   connective traversal down the whole plate after layout.
   ========================================================================= */
(function(){
  const LB = window.LB;
  const ORDER  = ['home','architecture','projects','resonance','writing','about','work','contact'];
  const ROUTES = ORDER;
  const AMP  = { home:1.0, about:0.7, architecture:0.55, projects:0.55, resonance:0.80, writing:0.55, work:0.55, contact:0.55 };
  const ARCS = { home:4, about:6, architecture:2, projects:2, resonance:3, writing:2, work:2, contact:2 };
  const TOPPAD = 70;   // clearance under the fixed nav when scrolling to a section

  // visit bookkeeping — capture prior visit BEFORE we stamp this one
  let prevVisit = 0;
  try{ prevVisit = parseInt(localStorage.getItem('lbr_last_visit')||'',10) || 0; }catch(e){}
  try{ localStorage.setItem('lbr_last_visit', String(Date.now())); }catch(e){}

  // ── hash parsing ────────────────────────────────────────────────────
  function parseHash(){
    let h = location.hash.replace(/^#\/?/,'');
    const [path, query] = h.split('?');
    const route = ROUTES.includes(path) ? path : 'home';
    const params = {};
    if(query) query.split('&').forEach(kv=>{ const [k,v]=kv.split('='); if(k) params[k]=decodeURIComponent(v||''); });
    return { route, params };
  }
  function buildHash(route, params){
    let h = '#/'+(route==='home'?'':route);
    if(params && Object.keys(params).length){
      h += '?'+Object.entries(params).filter(([,v])=>v!=null && v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
    }
    return h;
  }

  // ── motion per active section ───────────────────────────────────────
  function applyMotion(route){
    const drift = (route==='home') ? LB.driftHome : LB.driftInterior;
    LB.motionScale = 1 + (drift/100)*7;
    LB.amp  = AMP[route] ?? 0.55;
    LB.arcs = ARCS[route] ?? 2;
    if(LB.reseedSubstrate) LB.reseedSubstrate();
  }

  // ── mount the plate (once) ──────────────────────────────────────────
  const page = ()=>document.getElementById('page');
  function mountPlate(){
    const p = page();
    p.innerHTML = '';
    ORDER.forEach(r=>{
      const tpl = document.getElementById('tpl-'+r);
      if(!tpl) return;
      const sec = document.createElement('section');
      sec.className = 'plate-sec';
      sec.dataset.sec = r;
      sec.id = 'plate-'+r;
      sec.appendChild(tpl.content.cloneNode(true));
      p.appendChild(sec);
    });
    // one plate, one colophon
    const ft = document.getElementById('siteFooter');
    if(ft){ ft.hidden = false;
      ft.innerHTML = `<div class="stamp">luisblanco.dev · one plate · v0.3</div>`
        + `<div class="annot">a reference, openly shared — stress it, extend it.</div>`; }
  }

  // ── per-section wiring (runs once) ──────────────────────────────────
  function wireProjects(scope){
    const chips=[...scope.querySelectorAll('.fchip')], cards=[...scope.querySelectorAll('.pcard')];
    chips.forEach(ch=>ch.addEventListener('click',()=>{
      chips.forEach(c=>c.classList.remove('active')); ch.classList.add('active');
      const f=ch.getAttribute('data-filter');
      cards.forEach(card=>{ const show = f==='all' || card.getAttribute('data-cluster')===f
        || (card.getAttribute('data-axis')||'').split(' ').includes(f);
        card.classList.toggle('hidden', !show); });
      if(window.LB_PROJ) window.LB_PROJ.redraw();
    }));
    if(window.LB_PROJ) window.LB_PROJ.init();
  }
  function wireWriting(scope){
    const chips=[...scope.querySelectorAll('.fchip')], posts=[...scope.querySelectorAll('.post')];
    chips.forEach(ch=>ch.addEventListener('click',()=>{
      chips.forEach(c=>c.classList.remove('active')); ch.classList.add('active');
      const f=ch.getAttribute('data-filter');
      posts.forEach(p=> p.classList.toggle('hidden', !(f==='all'||p.getAttribute('data-axis')===f)));
    }));
    const sm=scope.querySelector('#showMore'), am=scope.querySelector('#archiveMore');
    if(sm&&am) sm.addEventListener('click',()=>{ am.classList.toggle('open'); sm.textContent = am.classList.contains('open')?'show less ←':'show more →'; });
    const DAY=86400000, now=Date.now();
    let last = prevVisit || (now - 14*DAY);
    posts.forEach(p=>{ const ago=parseInt(p.getAttribute('data-ago')||'0',10);
      if(now - ago*DAY > last) p.classList.add('is-new'); });
  }
  function initSections(){
    const sec = r => document.querySelector(`.plate-sec[data-sec="${r}"]`);
    if(window.LB_ARCH)  window.LB_ARCH.init({ locate:null });
    if(sec('projects')) wireProjects(sec('projects'));
    if(sec('writing'))  wireWriting(sec('writing'));
    if(window.LB_HOME)  window.LB_HOME.init();
    if(window.LB_ABOUT) window.LB_ABOUT.init();
    if(window.LB_RESONANCE) window.LB_RESONANCE.init(sec('resonance'));
  }

  // ── scroll spy — the section under the viewport drives the chrome ───
  let activeRoute = null;
  function setActive(route){
    if(route===activeRoute) return;
    activeRoute = route;
    document.body.setAttribute('data-route', route);
    window.LB_ENGINE.setActiveRoute(route);
    window.LB_ENGINE.setGlyphMode(route);
    applyMotion(route);
  }
  function startSpy(){
    const secs = [...document.querySelectorAll('.plate-sec')];
    if(!('IntersectionObserver' in window) || !secs.length) return;
    const ratios = new Map();
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=> ratios.set(e.target.dataset.sec, e.isIntersecting ? e.intersectionRatio : 0));
      let best=null, bestR=0;
      ratios.forEach((r,k)=>{ if(r>bestR){ bestR=r; best=k; } });
      if(best) setActive(best);
    },{ threshold:[0, .12, .25, .5, .75] });
    secs.forEach(s=>io.observe(s));
  }

  // ── navigation = scroll ─────────────────────────────────────────────
  function reduced(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('reduced-motion') || LB.reducedPreview; }
  function scrollToSection(route, instant){
    const el = document.querySelector(`.plate-sec[data-sec="${route}"]`);
    if(!el) return;
    const top = (route===ORDER[0]) ? 0
      : el.getBoundingClientRect().top + (window.scrollY||document.documentElement.scrollTop) - TOPPAD;
    try{ window.scrollTo({ top, behavior:(instant||reduced())?'auto':'smooth' }); }
    catch(e){ window.scrollTo(0, top); }
  }
  function traversalPulse(){
    if(!LB.motionOn || LB.reducedPreview || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sv=document.querySelector('.traversal'); if(!sv) return;
    sv.classList.remove('pulse'); void sv.offsetWidth; sv.classList.add('pulse');
    setTimeout(()=>sv.classList.remove('pulse'), 720);
  }
  function handleRoute(route, params, opts){
    opts=opts||{};
    if(params && params.locate && window.LB_ARCH){
      const list = params.locate.split(',').map(s=>s.trim()).filter(Boolean);
      try{ window.LB_ARCH.teardown(); }catch(e){}
      window.LB_ARCH.init({ locate:list });
    }
    scrollToSection(route, opts.instant);
    if(!opts.instant) traversalPulse();
  }
  function navigate(route, params){
    const hash=buildHash(route, params||{});
    if(location.hash===hash){ const {route:r,params:pr}=parseHash(); handleRoute(r,pr); return; }
    location.hash = hash;
  }
  function onHash(){ const { route, params } = parseHash(); handleRoute(route, params); }
  window.addEventListener('hashchange', onHash);
  window.LB_NAV = navigate;
  window.LB_ROUTER = { navigate, parseHash, scrollToSection, get prevVisit(){ return prevVisit; } };

  // ── boot ────────────────────────────────────────────────────────────
  function boot(){
    const { route, params } = parseHash();
    mountPlate();
    setActive(route);
    // layout settles → wire modules, arm reveals, build the spine
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      initSections();
      if(params.locate && window.LB_ARCH){
        const list = params.locate.split(',').map(s=>s.trim()).filter(Boolean);
        try{ window.LB_ARCH.teardown(); }catch(e){}
        window.LB_ARCH.init({ locate:list });
      }
      if(window.LB_SPINE) window.LB_SPINE.build();   // also calls refreshReveal
      else window.LB_ENGINE.refreshReveal();
      startSpy();
      scrollToSection(route, true);
    }));

    const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seen=false; try{ seen = localStorage.getItem('lbr_seen_intro')==='1'; }catch(e){}
    if(route==='home' && !seen && !sysReduced && window.LB_INTRO){
      try{ localStorage.setItem('lbr_seen_intro','1'); }catch(e){}
      document.body.classList.add('intro-playing');
      window.LB_INTRO.play(()=>{
        document.body.classList.remove('intro-playing');
        document.body.classList.add('intro-done');
        window.LB_ENGINE.refreshReveal();
      });
    } else {
      try{ localStorage.setItem('lbr_seen_intro','1'); }catch(e){}
      document.body.classList.add('intro-done');
    }
  }
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
