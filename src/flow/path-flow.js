/* =========================================================================
   path-flow.js — the lines become CURRENTS of free dust. Each structural SVG
   path (traversal spine, plate spine) is dissolved into a dense torrent of
   gold particles that flow along it, and the original stroke is hidden.

   Freedom, not a grid: particle start positions are HASH-irregular (clumpy,
   not evenly spaced), and every particle wanders with its OWN frequency, phase
   and speed in both the along-path and perpendicular directions — so the band
   breathes like the substrate field instead of a lattice changing in unison.
   Perpendicular spread is in screen space (consistent width across any viewBox)
   and centre-biased, so the current has a dense core that fades to a free edge
   — no hard line. Transformed by each path's live screen-CTM every frame, so
   the plate-spine current flows DOWN the page as you scroll.

   Self-contained IIFE → window.LB_PATHFLOW. Honors LB.motionOn / reduced-motion.
   ========================================================================= */
(function(){
  "use strict";
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // selector · density (particles/screen-px) · band half-width px · warmth · wander · minLen(screen px)
  // dust belongs on CURVES that flow (spine, traversal, orbits) — not on rigid
  // straight dimension lines, which read mechanical as dust. .dim is left as its
  // original faint drafting SVG (subtle), not dusted.
  // cloud:1 → the flowing currents become a turbulent CLOUD of dust forming a
  // flow (coherent meandering lobes + width that fattens/pinches + wispy tails),
  // not a thin tube along the line. cloud:0 → tight defined dust (the orbits,
  // which already landed — leave them).
  const TARGETS = [
    { sel:'.traversal .spine',       dens:3.2, band:34, warm:0.55, wander:0.95, minLen:80, cloud:1 }, // cloud current
    { sel:'#plateSpine .spine-path', dens:3.4, band:38, warm:0.70, wander:0.95, minLen:80, cloud:1 }, // the spine that extends down the page
    { sel:'.traj-flex path',         dens:3.0, band:32, warm:0.55, wander:0.95, minLen:120, cloud:1 }, // the trajectory currents
    { sel:'.orbit',                  dens:1.4, band:5,  warm:0.62, wander:0.30, minLen:60, cloud:0 },  // solar system — defined dust rings
  ];
  const HIDE_TOO = ['.traversal .pulse-path'];   // strokes to silence (no stray line)
  const GOLD=[214,164,80], AMBER=[246,208,132];

  let canvas, ctx, W, H, dpr, SP_GOLD, SP_AMBER;
  let tracks=[], raf=0, running=false, settled=false, lastScan=0;

  const frac=(x)=>x-Math.floor(x);
  const h=(n)=>frac(Math.sin(n*12.9898)*43758.5453);   // irregular hash in [0,1)
  // smooth 1D value noise in [0,1) — neighbours share it, so particles at a
  // similar point on the path swing TOGETHER → coherent billowing lobes, not a
  // straight tube. This is what turns the band into a cloud that forms a flow.
  const vnoise=(x)=>{ const i=Math.floor(x), f=x-i, u=f*f*(3-2*f);
    const a=h(i*1.17+3.1), b=h((i+1)*1.17+3.1); return a+(b-a)*u; };

  // soft round additive sprite (transparent corners → no squares)
  function sprite(col){
    const S=64, c=document.createElement('canvas'); c.width=c.height=S;
    const g=c.getContext('2d'), rg=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    rg.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},1)`);
    rg.addColorStop(0.22,`rgba(${col[0]},${col[1]},${col[2]},0.5)`);
    rg.addColorStop(0.55,`rgba(${col[0]},${col[1]},${col[2]},0.12)`);
    rg.addColorStop(1,`rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle=rg; g.fillRect(0,0,S,S); return c;
  }

  function samplePath(el){
    let len=0; try{ len=el.getTotalLength(); }catch(e){ return null; }
    if(!len||!isFinite(len)) return null;
    const M=Math.max(24,Math.min(700,Math.round(len))), pts=new Array(M+1);
    for(let i=0;i<=M;i++){ const p=el.getPointAtLength(len*i/M); pts[i]={x:p.x,y:p.y}; }
    return pts;
  }
  function screenLen(pts,m){ if(!m) return 0; let s=0,px=null,py=null;
    for(const p of pts){ const x=m.a*p.x+m.c*p.y+m.e, y=m.b*p.x+m.d*p.y+m.f;
      if(px!==null) s+=Math.hypot(x-px,y-py); px=x; py=y; } return s; }

  function makeParts(n, band, warm, wander){
    const a=[];
    for(let i=0;i<n;i++){
      const r1=h(i), r2=h(i+11.3), r3=h(i+27.7), r4=h(i+53.1), r5=h(i+71.9);
      const offBase=(r3-r2)*band;                 // centre-biased perpendicular seat
      a.push({
        t:r1,                                     // irregular start along the path
        spd:0.004+r2*0.05,                        // varied flow speed (free, not uniform)
        // perpendicular wander — individual amp / freq / phase (scaled by target wander)
        // r4*r4 bias → most wander a little, a few fling far out = wispy tendrils
        offBase, wAmp:(2+r4*r4*30)*wander, wFreq:0.0003+r1*0.0016, wPhase:r2*6.283,
        // along-path micro-wander — individual amp / freq / phase
        aAmp:0.003+r3*0.012, aFreq:0.0005+r4*0.0017, aPhase:r5*6.283,
        sz:0.8+r1*1.6, amber:r4 < (warm-0.4)*0.8,
      });
    }
    return a;
  }
  function scan(){
    tracks=[];
    HIDE_TOO.forEach(sel=> document.querySelectorAll(sel).forEach(el=> el.style.strokeOpacity='0'));
    let seedN=0;
    TARGETS.forEach(t=>{
      document.querySelectorAll(t.sel).forEach(el=>{
        const pts=samplePath(el); if(!pts) return;
        let m=null; try{ m=el.getScreenCTM(); }catch(e){}
        const slen=screenLen(pts,m)||600;
        if(slen < (t.minLen||0)) return;               // skip ticks / tiny lines
        el.style.strokeOpacity='0';
        const n=Math.max(120,Math.min(5200,Math.round(slen*t.dens)));
        // scroll-draw band: the dust reveals along the same s..e the stroke used,
        // so the current EXTENDS down the page as you scroll (not all at once).
        const hasBand = el.dataset.s !== undefined;
        tracks.push({ el, pts, band:t.band, cloud:t.cloud?1:0, seed:(seedN++)*4.7+1.3,
          parts:makeParts(n,t.band,t.warm,t.wander||1),
          hasBand, ds: hasBand ? (parseFloat(el.dataset.s)||0) : 0,
                   de: hasBand ? (parseFloat(el.dataset.e)||1) : 1 });
      });
    });
  }

  function ptAt(pts,t){
    const f=Math.max(0,Math.min(0.99999,t))*(pts.length-1), i=f|0, fr=f-i;
    const a=pts[i], b=pts[i+1]||a;
    return { x:a.x+(b.x-a.x)*fr, y:a.y+(b.y-a.y)*fr, dx:(b.x-a.x), dy:(b.y-a.y) };
  }
  function render(now){
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';
    const maxsc=Math.max(1,(document.documentElement.scrollHeight||0)-innerHeight);
    const sf=(window.scrollY||document.documentElement.scrollTop||0)/maxsc;   // scroll progress 0..1
    for(const tr of tracks){
      let m; try{ m=tr.el.getScreenCTM(); }catch(e){ m=null; } if(!m) continue;
      const reveal=tr.hasBand ? Math.max(0,Math.min(1,(sf-tr.ds)/Math.max(0.0001,tr.de-tr.ds))) : 1;
      const cloud=tr.cloud;
      const bAmp=tr.band*2.2, bScale=7.0, wScale=4.3;   // lobe reach · lobes-along-path · width-variation freq
      for(const p of tr.parts){
        if(p.t > reveal) continue;                               // extend down the page as you scroll
        const ef=Math.min(1,(reveal-p.t)/0.08);                  // soft, feathered leading edge
        const tt=p.t + Math.sin(p.aPhase+now*p.aFreq)*p.aAmp;     // free along-path wander
        const u=ptAt(tr.pts,tt);
        const cxp=(m.a*u.x+m.c*u.y+m.e)*dpr, cyp=(m.b*u.x+m.d*u.y+m.f)*dpr;
        let tx=m.a*u.dx+m.c*u.dy, ty=m.b*u.dx+m.d*u.dy; const tl=Math.hypot(tx,ty)||1; tx/=tl; ty/=tl;
        const nx=-ty, ny=tx;
        let localOff, perpCss;
        if(cloud){
          // coherent lobe — whole clusters swing off the path together, so the
          // current reads as a meandering CLOUD that forms a flow, not a tube.
          const billow=(vnoise(tt*bScale + tr.seed + now*0.00007)-0.5)*bAmp;
          const widthMod=0.4+1.25*vnoise(tt*wScale + tr.seed + 11.0 + now*0.00003); // body fattens / pinches
          localOff=p.offBase*widthMod + Math.sin(p.wPhase+now*p.wFreq)*p.wAmp;       // seat in the lobe + wisp
          perpCss=billow + localOff;
        } else {
          localOff=p.offBase + Math.sin(p.wPhase+now*p.wFreq)*p.wAmp;  // tight defined dust (orbits)
          perpCss=localOff;
        }
        const perp=perpCss*dpr;
        const x=cxp+nx*perp, y=cyp+ny*perp;
        if(x<-60||y<-60||x>W+60||y>H+60) continue;
        const r=(p.sz*1.3+0.8)*dpr;
        const edge=1-Math.min(1,Math.abs(localOff)/(tr.band+8));   // each lobe: dense core → wispy edge
        ctx.globalAlpha=(0.05+0.16*edge*edge)*ef;
        ctx.drawImage(p.amber?SP_AMBER:SP_GOLD, x-r, y-r, r*2, r*2);
      }
    }
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  }

  function frame(now){
    if(!running) return;
    const reduced=sysReduced||LB.reducedPreview;
    if(!LB.motionOn||reduced){ if(!settled){ render(now); settled=true; } raf=requestAnimationFrame(frame); return; }
    settled=false;
    for(const tr of tracks) for(const p of tr.parts){ p.t+=p.spd*0.016; if(p.t>1) p.t-=1; else if(p.t<0) p.t+=1; }
    if(now-lastScan>1500){ lastScan=now; if(tracks.length===0) scan(); }
    render(now);
    raf=requestAnimationFrame(frame);
  }
  function size(){ dpr=Math.min(window.devicePixelRatio||1,2); W=Math.round(innerWidth*dpr); H=Math.round(innerHeight*dpr);
    canvas.width=W; canvas.height=H; canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; }
  function pause(){ running=false; if(raf){ cancelAnimationFrame(raf); raf=0; } }
  function resume(){ if(running) return; running=true; raf=requestAnimationFrame(frame); }

  function boot(){
    SP_GOLD=sprite(GOLD); SP_AMBER=sprite(AMBER);
    canvas=document.createElement('canvas'); canvas.className='pathflow-canvas';
    canvas.style.cssText='position:fixed;inset:0;z-index:3;pointer-events:none;';
    document.body.appendChild(canvas); ctx=canvas.getContext('2d'); size();
    window.addEventListener('resize', ()=>{ size(); scan(); }, false);
    document.addEventListener('visibilitychange', ()=>{ document.hidden?pause():resume(); }, false);
    window.addEventListener('hashchange', ()=> setTimeout(scan,120), false);
    [300,900,1800,3000].forEach(d=> setTimeout(scan,d));
    resume();
  }
  window.LB_PATHFLOW={ boot, scan, pause, resume };
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
