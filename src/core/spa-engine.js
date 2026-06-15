/* =========================================================================
   spa-engine.js — the persistent shell + mid-layer motion for the single-page
   build. Everything here is mounted ONCE and survives every navigation:
     • coordinate frame · top nav · sheet tag · drawing index · AEA glyph
     • the mid-layer drift loop (.drift-mid / .traj-flex / glyph gimbal)
     • line-draw reveal + scroll-draw, re-armed per route by the router
   Exposes window.LB_ENGINE for the router to drive (setActiveRoute / refresh /
   glyph docking + concept caption). Reads window.LB for motion config.
   ========================================================================= */
(function(){
  // ── motion config (shared across the whole site via localStorage) ──────
  let tw = { driftHome:40, driftInterior:20, transition:1.0, motionOn:true, reducedPreview:false, glyphMode:'auto' };
  try{ Object.assign(tw, JSON.parse(localStorage.getItem('lb_tweaks_master')||'{}')); }catch(e){}
  const LB = (window.LB = window.LB || {});
  LB.driftHome = tw.driftHome; LB.driftInterior = tw.driftInterior;
  LB.transition = tw.transition; LB.motionOn = tw.motionOn;
  LB.reducedPreview = tw.reducedPreview; LB.glyphMode = tw.glyphMode;
  LB.density = 55;
  LB.motionScale = 1 + (tw.driftHome/100)*7;  // recomputed per-route by router
  LB.amp = 1.0; LB.arcs = 4;
  LB.currentConcept = 'RAG';

  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ROUTES = ['home','architecture','projects','writing','about','work','contact'];
  const HREF = r => '#/'+(r==='home'?'':r);
  const NAVLBL = { work:'work with me' };
  const DI = [
    { n:'01', label:'hero',         route:'home' },
    { n:'02', label:'mission',      route:'home', hash:'#/', anchor:'#inside' },
    { n:'03', label:'architecture', route:'architecture' },
    { n:'04', label:'projects',     route:'projects' },
    { n:'05', label:"what's new",   route:'writing' },
    { n:'06', label:'personal',     route:'about' },
    { n:'07', label:'work with me', route:'work' },
    { n:'08', label:'contact',      route:'contact' },
  ];
  const DI_CUR = { home:'01', architecture:'03', projects:'04', writing:'05', about:'06', work:'07', contact:'08' };
  const SHEET = { home:'1 / 7', architecture:'2 / 7', projects:'3 / 7', writing:'4 / 7', about:'5 / 7', work:'6 / 7', contact:'7 / 7' };

  // ── isometric nested cube glyph ─────────────────────────────────────
  function cube(size){
    const c=Math.cos(Math.PI/6), s=Math.sin(Math.PI/6);
    const pr=(x,y,z)=>[ (x-z)*c, (x+z)*s - y ];
    const V=[]; for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) V.push([x*size,y*size,z*size]);
    const E=[]; for(let i=0;i<8;i++) for(let j=i+1;j<8;j++){
      const a=V[i],b=V[j], diff=(a[0]!==b[0])+(a[1]!==b[1])+(a[2]!==b[2]); if(diff===1) E.push([i,j]);
    }
    return { V:V.map(p=>pr(...p)), E, raw:V };
  }
  function glyphSVG(){
    const S=46, CX=75, CY=75;
    const o=cube(1), m=cube(0.62), inr=cube(0.34);
    const map=p=>[CX+p[0]*S, CY+p[1]*S];
    const lines=(cb,cls)=> cb.E.map(([i,j])=>{ const a=map(cb.V[i]),b=map(cb.V[j]);
      return `<line class="${cls}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`; }).join('');
    const diag = o.V.map((p,i)=>{ const a=map(p), b=map(inr.V[i]);
      return `<line class="nest" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`; }).join('');
    const verts = o.V.map(p=>{ const a=map(p); return `<circle class="cube-vert" cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="1.4"/>`; }).join('');
    const core = map([0,0]);
    return `<svg viewBox="0 0 150 150" aria-hidden="true">
      <g class="cube-leaders" aria-hidden="true">
        <line class="cube-leader" x1="-4.7" y1="29" x2="-218" y2="64"/>
        <line class="cube-leader" x1="-4.7" y1="121" x2="-186" y2="186"/>
        <line class="cube-leader" x1="75" y1="167" x2="-36" y2="248"/>
      </g>
      <g class="cube-outer">${lines(o,'')}</g>
      <g class="cube-nest">${diag}</g>
      <g class="cube-mid">${lines(m,'')}</g>
      ${verts}
      <g class="cube-inner">${lines(inr,'')}</g>
      <circle class="cube-node" cx="${core[0].toFixed(1)}" cy="${core[1].toFixed(1)}" r="2.4"/>
    </svg>`;
  }

  // ── builders ────────────────────────────────────────────────────────
  function coordFrame(){
    const el=document.createElement('div'); el.className='coord-frame'; el.setAttribute('aria-hidden','true');
    const decs=['+60°','+30°','0°','−30°','−60°'];
    const ras=['0h','6h','12h','18h','24h'];
    let h='<span class="axis-tag axis-dec">DEC</span><span class="axis-tag axis-ra">RA</span>';
    decs.forEach((d,i)=> h+=`<span class="dec" style="top:${12+i*19}%">${d}</span>`);
    ras.forEach((r,i)=> h+=`<span class="ra" style="left:${4+i*23}%">${r}</span>`);
    el.innerHTML=h; return el;
  }
  let navEl, diEl, sheetEl, glyphEl, captionEl;
  function topnav(){
    navEl=document.createElement('nav'); navEl.className='topnav'; navEl.setAttribute('aria-label','site');
    let h='';
    ROUTES.forEach((r,i)=>{ h+=`<a href="${HREF(r)}" data-route="${r}">${NAVLBL[r]||r}</a>`; if(i<ROUTES.length-1) h+='<span class="sep">·</span>'; });
    h+='<span class="arrow">→</span>';
    navEl.innerHTML=h; return navEl;
  }
  function sheetTag(){ sheetEl=document.createElement('div'); sheetEl.className='sheet'; sheetEl.textContent='SHEET 1 / 6'; return sheetEl; }
  function drawingIndex(){
    diEl=document.createElement('aside'); diEl.className='dwgindex'; diEl.setAttribute('aria-label','drawing index');
    let h='<div class="di-title"><span>DRAWING INDEX</span><span class="di-sheet">SHEET 1 / 6</span></div><ul>';
    DI.forEach(d=>{ h+=`<li data-route="${d.route}" data-n="${d.n}"${d.anchor?` data-anchor="${d.anchor}"`:''}><span class="bullet">·</span><span class="num">${d.n}</span><a href="${d.hash||HREF(d.route)}">${d.label}</a></li>`; });
    h+='</ul>';
    diEl.innerHTML=h;
    // sub-anchor entries (e.g. 02 mission → #inside) scroll within the home plate
    diEl.querySelector('ul').addEventListener('click',(e)=>{
      const a=e.target.closest('a'); if(!a) return;
      const anch=a.closest('li')?.getAttribute('data-anchor'); if(!anch) return;
      const t=document.querySelector(anch); if(!t) return;
      e.preventDefault();
      const top=t.getBoundingClientRect().top+(window.scrollY||document.documentElement.scrollTop)-70;
      const red=window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('reduced-motion');
      try{ window.scrollTo({ top, behavior:red?'auto':'smooth' }); }catch(_){ window.scrollTo(0,top); }
    });
    diEl.querySelector('.di-title').addEventListener('click',()=>diEl.classList.toggle('collapsed'));
    if(window.innerWidth<=760) diEl.classList.add('collapsed');
    return diEl;
  }
  function glyph(){
    glyphEl=document.createElement('a'); glyphEl.href='#/'; glyphEl.className='glyph'; glyphEl.setAttribute('aria-label','AEA · home');
    glyphEl.innerHTML = `<div class="glyph-halo" aria-hidden="true"></div>${glyphSVG()}`;
    captionEl=document.createElement('span'); captionEl.className='glyph-caption';
    captionEl.innerHTML = `<span class="gc-lead">▸ locate</span> <b class="gc-term">RAG</b>`;
    glyphEl.appendChild(captionEl);
    glyphEl.addEventListener('click', (e)=>{
      e.preventDefault();
      const route = document.body.getAttribute('data-route');
      if(route==='home' && window.LB_NAV){ window.LB_NAV('architecture', { locate: LB.currentConcept }); }
      else if(window.LB_NAV){ window.LB_NAV('home'); }
    });
    return glyphEl;
  }

  // ── route state ─────────────────────────────────────────────────────
  // applyDI is the SOLE writer of the drawing-index `current` highlight, so the
  // route spy and the home inner-section spy never fight. diOverride lets the
  // home plate light 02 (mission) while its inner section holds the viewport.
  let diOverride=null, curRoute='home';
  function applyDI(n){
    if(!diEl) return;
    diEl.querySelectorAll('li').forEach(li=>{ const on=li.getAttribute('data-n')===n;
      li.classList.toggle('current',on); li.querySelector('.bullet').textContent = on?'/':'·'; });
  }
  function setActiveRoute(route){
    curRoute=route; if(route!=='home') diOverride=null;
    if(navEl) navEl.querySelectorAll('a[data-route]').forEach(a=> a.classList.toggle('current', a.getAttribute('data-route')===route));
    applyDI(diOverride || DI_CUR[route]);
    const sh = 'SHEET '+(SHEET[route]||'1 / 6');
    if(sheetEl) sheetEl.textContent = sh;
    const ds = diEl && diEl.querySelector('.di-sheet'); if(ds) ds.textContent = sh;
  }
  // called by the home inner-section observer (spa-home.js): '02' while the
  // mission section dominates, '01' for the hero. Ignored off the home route.
  function setDIOverride(n){ diOverride=(curRoute==='home')?n:null; applyDI(diOverride || DI_CUR[curRoute]); }

  // ── concept caption cycle (home only) ───────────────────────────────
  const CYCLE = ['RAG','MCP','multi-agent','self-refine','ReAct','tool generation'];
  let cyc=0, cycTimer=null;
  function startConceptCycle(){
    stopConceptCycle();
    setConcept(CYCLE[cyc%CYCLE.length]);
    cycTimer = setInterval(()=>{ cyc++; setConcept(CYCLE[cyc%CYCLE.length]); }, 3200);
  }
  function stopConceptCycle(){ if(cycTimer){ clearInterval(cycTimer); cycTimer=null; } }
  function setConcept(name){
    LB.currentConcept = name;
    if(captionEl){ const t=captionEl.querySelector('.gc-term'); if(t){ t.style.opacity=0; setTimeout(()=>{ t.textContent=name; t.style.opacity=1; }, 180); } }
  }
  function setGlyphMode(route){
    const forced = LB.glyphMode; // 'auto' | 'focal' | 'docked'
    let focal = route==='home';
    if(forced==='focal') focal=true; else if(forced==='docked') focal=false;
    document.body.classList.toggle('glyph-focal', focal);
    document.body.classList.toggle('glyph-docked', !focal);
    // keep the inner cube breathing even when docked (interior routes) — gated by
    // motionOn / reduced-motion in the drift loop; home hides the glyph so its spin is moot.
    if(glyphEl){ glyphEl.setAttribute('data-gimbal',''); }
    if(focal) startConceptCycle(); else stopConceptCycle();
  }

  // ── line-draw reveal + scroll-draw (re-armed per route) ─────────────
  let scrollPaths=[], scrollReveals=[];
  function refreshReveal(){
    const reduced = sysReduced || LB.reducedPreview;
    const scope = document.getElementById('page') || document;
    const lines = scope.querySelectorAll('.draw-line:not(.scroll-draw)');
    lines.forEach(el=>{ try{ const len=el.getTotalLength?el.getTotalLength():1200; el.style.setProperty('--len',Math.ceil(len)); }catch(e){ el.style.setProperty('--len',1200); }
      el.classList.remove('drawn'); });
    if(reduced){ lines.forEach(el=>el.classList.add('drawn')); }
    else { requestAnimationFrame(()=> requestAnimationFrame(()=> lines.forEach(el=>el.classList.add('drawn')) )); }

    scrollPaths   = [...scope.querySelectorAll('.scroll-draw')];
    scrollReveals = [...scope.querySelectorAll('[data-scroll-reveal]')];
    scrollPaths.forEach(p=>{ let len=1200; try{ len=p.getTotalLength(); }catch(e){}
      p.dataset.len=len; p.style.strokeDasharray=len; p.style.strokeDashoffset = reduced?0:len; p.style.transition='stroke-dashoffset .18s linear'; });
    scrollReveals.forEach(el=>{ el.style.transition='opacity .5s ease'; if(reduced) el.style.opacity=1; });
    updateScroll();
  }
  function scrollProgress(){
    const se=document.scrollingElement||document.documentElement;
    const y=se.scrollTop||window.scrollY||0;
    const max=Math.max(1, se.scrollHeight-window.innerHeight);
    return Math.min(1,Math.max(0,y/max));
  }
  function updateScroll(){
    if((sysReduced||LB.reducedPreview) || (!scrollPaths.length && !scrollReveals.length)) return;
    const p=scrollProgress();
    scrollPaths.forEach(el=>{ const s=parseFloat(el.dataset.s||'0'),e=parseFloat(el.dataset.e||'1');
      const lp=Math.min(1,Math.max(0,(p-s)/(e-s))); el.style.strokeDashoffset=(el.dataset.len*(1-lp)).toFixed(1); });
    scrollReveals.forEach(el=>{ const t=parseFloat(el.getAttribute('data-scroll-reveal')); el.style.opacity = p>=t?1:0; });
  }

  // ── mid-layer drift loop (persists) ─────────────────────────────────
  const MID = { px:43000, py:58000, phx:1.7, phy:0.2 };
  const FLEX_AMP = 2.6, FLEX_PERIOD = 30000;
  const mids   = ()=> document.querySelectorAll('.drift-mid');
  const flexes = ()=> document.querySelectorAll('.traj-flex');
  const gimbals= ()=> document.querySelectorAll('.glyph[data-gimbal] .cube-inner');
  let t0=performance.now(), held=false;
  function frame(now){
    const reduced = sysReduced || LB.reducedPreview;
    if(!LB.motionOn || reduced){
      if(!held){ const k=LB.motionScale*LB.amp;
        mids().forEach(el=> el.style.transform=`translate(${(3+k).toFixed(1)}px,${(4+k).toFixed(1)}px)`);
        gimbals().forEach(el=> el.style.transform='rotate(0deg)');
        held=true; }
      requestAnimationFrame(frame); return;
    }
    held=false;
    const t=now-t0;
    const k=LB.motionScale*LB.amp;
    const ampX=7+k*3.4, ampY=9+k*4.2;
    const x=Math.sin(t/MID.px+MID.phx)*ampX, y=Math.sin(t/MID.py+MID.phy)*ampY;
    mids().forEach(el=>{ el.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`; });
    const tt=now%FLEX_PERIOD;
    flexes().forEach((el,i)=>{ const ph=parseFloat(el.getAttribute('data-phase')||i*0.7);
      const dy=Math.sin((tt/FLEX_PERIOD)*Math.PI*2+ph)*FLEX_AMP; el.style.transform=`translateY(${dy.toFixed(2)}px)`; });
    const g=3*Math.sin(now/8000*Math.PI*2);
    gimbals().forEach(el=>{ el.style.transform=`rotate(${g.toFixed(2)}deg)`; });
    updateScroll();
    requestAnimationFrame(frame);
  }

  // ── mount persistent chrome ─────────────────────────────────────────
  function mount(){
    document.body.prepend(coordFrame());
    const fg = document.querySelector('.foreground') || document.body;
    fg.prepend(glyph()); fg.prepend(drawingIndex()); fg.prepend(topnav());
    requestAnimationFrame(frame);
  }

  window.LB_ENGINE = { mount, setActiveRoute, setDIOverride, setGlyphMode, refreshReveal, updateScroll,
    setConcept, startConceptCycle, stopConceptCycle, glyphEl:()=>glyphEl };

  if(document.readyState!=='loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
