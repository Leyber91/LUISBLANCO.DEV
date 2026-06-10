/* =========================================================================
   spa-substrate.js — the PERSISTENT celestial substrate for the consolidated
   single-page build. Mounts ONCE and runs continuously across every route —
   it is never re-seeded or re-mounted on navigation (only its amplitude /
   arc-count change, live, when the route changes).
   Layer 1a: celestial grid + scattered stars + faint orbital arcs (slow drift)
   Layer 1b: engineering dot-grid (parallax against 1a)
   Reads window.LB: motionScale (tweak) · density (tweak) · amp (per-route) ·
   arcs (per-route) · motionOn (master) · reducedPreview (master).
   ========================================================================= */
(function(){
  const LB = (window.LB = window.LB || {});
  LB.motionScale = LB.motionScale ?? 3.8;
  LB.density     = LB.density ?? 55;
  LB.amp         = LB.amp ?? 1.0;
  LB.arcs        = LB.arcs ?? 4;
  if(LB.motionOn === undefined) LB.motionOn = true;
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sysReduced) document.documentElement.classList.add('reduced-motion');

  const STAR = { px:54000, py:71000, phx:0.0,  phy:1.3, rotP:96000, swayBase:0.5 };
  const DOT  = { px:38000, py:50000, phx:2.1,  phy:0.4, rotP:74000, swayBase:0.0 };

  let host, starCv, dotCv, sctx, dctx, W, H, OW, OH, cx, cy;
  let stars = [], arcs = [];
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function rng(seed){ let s = seed>>>0; return ()=> (s = (s*1664525+1013904223)>>>0)/4294967296; }
  const rand = rng(20260601);

  function build(){
    host = document.querySelector('.substrate');
    if(!host){ host = document.createElement('div'); host.className='substrate'; host.setAttribute('aria-hidden','true'); document.body.prepend(host); }
    host.innerHTML='';
    starCv = document.createElement('canvas'); starCv.className='sub-stars';
    dotCv  = document.createElement('canvas'); dotCv.className='sub-dots';
    host.append(dotCv, starCv);
    sctx = starCv.getContext('2d'); dctx = dotCv.getContext('2d');
    resize();
  }
  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    OW = Math.ceil(W*1.4); OH = Math.ceil(H*1.4);
    cx = OW/2; cy = OH/2;
    for(const cv of [starCv,dotCv]){
      cv.width = OW*dpr; cv.height = OH*dpr;
      cv.style.width = OW+'px'; cv.style.height = OH+'px';
      cv.style.left = -(OW-W)/2+'px'; cv.style.top = -(OH-H)/2+'px';
    }
    seed(); draw();
  }
  function seed(){
    const area = OW*OH;
    const nStars = Math.round(area/5200);
    stars = [];
    for(let i=0;i<nStars;i++){
      const bright = rand();
      stars.push({
        x: rand()*OW, y: rand()*OH,
        r: bright>0.97 ? 1.5+rand()*1.1 : 0.5+rand()*0.8,
        a: bright>0.97 ? 0.55+rand()*0.35 : 0.12+rand()*0.4,
        gold: bright>0.985,
        cross: bright>0.952 && bright<=0.972   // rare "+" sparkles (plate registration feel)
      });
    }
    const nArcs = (LB.arcs ?? 4);
    arcs = [];
    for(let i=0;i<nArcs;i++){
      arcs.push({
        cx: cx + (rand()-0.5)*OW*0.7,
        cy: cy + (rand()-0.5)*OH*0.9,
        r: OW*(0.45+rand()*0.7),
        a0: rand()*Math.PI*2, sweep: 0.5+rand()*1.4
      });
    }
  }
  function draw(){ drawStars(); drawDots(); }
  function drawStars(){
    sctx.setTransform(dpr,0,0,dpr,0,0);
    sctx.clearRect(0,0,OW,OH);
    const d = LB.density/55;
    const gridA = 0.03 * d, starMul = Math.min(1.6, 0.5+ d);
    sctx.strokeStyle = `rgba(159,179,214,${gridA})`;
    sctx.lineWidth = 1;
    const stepY = OH/9, stepX = OW/13;
    for(let y=stepY; y<OH; y+=stepY){ sctx.beginPath(); sctx.moveTo(0,y); sctx.lineTo(OW,y); sctx.stroke(); }
    for(let x=stepX; x<OW; x+=stepX){ sctx.beginPath(); sctx.moveTo(x,0); sctx.lineTo(x,OH); sctx.stroke(); }
    sctx.strokeStyle = `rgba(159,179,214,${gridA*1.5})`;
    for(const a of arcs){ sctx.beginPath(); sctx.arc(a.cx, a.cy, a.r, a.a0, a.a0+a.sweep); sctx.stroke(); }
    for(const s of stars){
      sctx.globalAlpha = Math.min(1, s.a*starMul);
      if(s.cross){
        sctx.strokeStyle = '#cdd9f0'; sctx.lineWidth = 0.8;
        const L = 2.2 + s.r*1.6;
        sctx.beginPath();
        sctx.moveTo(s.x-L, s.y); sctx.lineTo(s.x+L, s.y);
        sctx.moveTo(s.x, s.y-L); sctx.lineTo(s.x, s.y+L);
        sctx.stroke();
        continue;
      }
      sctx.beginPath();
      sctx.fillStyle = s.gold ? '#D4A24C' : '#cdd9f0';
      sctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      sctx.fill();
      if(s.gold){
        sctx.globalAlpha = Math.min(1, s.a*starMul)*0.5;
        sctx.beginPath(); sctx.arc(s.x,s.y,s.r*2.6,0,Math.PI*2); sctx.fill();
      }
    }
    sctx.globalAlpha = 1;
  }
  function drawDots(){
    dctx.setTransform(dpr,0,0,dpr,0,0);
    dctx.clearRect(0,0,OW,OH);
    const d = LB.density/55;
    dctx.fillStyle = `rgba(159,179,214,${0.05*d})`;
    const gap = 30;
    for(let y=0; y<OH; y+=gap){ for(let x=0; x<OW; x+=gap){ dctx.beginPath(); dctx.arc(x,y,0.9,0,Math.PI*2); dctx.fill(); } }
  }

  // ── levitation loop — persists for the life of the page ──────────────
  let t0 = performance.now();
  let held = false;
  function frame(now){
    const reduced = sysReduced || LB.reducedPreview;
    if(!LB.motionOn || reduced){
      if(!held){ // settle to a gentle static frame once
        starCv.style.transform = 'translate3d(2px,3px,0)';
        dotCv.style.transform  = 'translate3d(3px,4px,0)';
        starCv.style.opacity = '0.92';
        held = true;
      }
      requestAnimationFrame(frame); return;
    }
    held = false;
    const t = now - t0;
    const k = LB.motionScale * LB.amp;
    const ampStar = 10 + k*5.2;
    const ampDot  = 14 + k*7.4;
    const swayK   = 0.45 + k*0.22;
    const sx = Math.sin(t/STAR.px + STAR.phx)*ampStar;
    const sy = Math.sin(t/STAR.py + STAR.phy)*ampStar*0.72;
    const sr = Math.sin(t/STAR.rotP)*swayK + STAR.swayBase*Math.sin(t/220000);
    starCv.style.transform = `translate3d(${sx.toFixed(2)}px,${sy.toFixed(2)}px,0) rotate(${sr.toFixed(3)}deg)`;
    starCv.style.opacity = (0.86 + 0.14*Math.sin(t/9000)).toFixed(3);
    const dx = Math.sin(t/DOT.px + DOT.phx)*ampDot;
    const dy = Math.sin(t/DOT.py + DOT.phy)*ampDot*0.8;
    const dr = Math.sin(t/DOT.rotP + 1.0)*swayK*0.6;
    dotCv.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0) rotate(${dr.toFixed(3)}deg)`;
    requestAnimationFrame(frame);
  }

  LB.redrawSubstrate = draw;                       // density change (no reseed)
  LB.reseedSubstrate = ()=>{ seed(); draw(); };     // arc-count change (route)

  function init(){
    build();
    let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(resize,150); });
    requestAnimationFrame(frame);
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
