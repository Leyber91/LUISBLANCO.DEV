/* =========================================================================
   border-swarm.js — card borders become a linear SWARM of dust. For each
   target card, the rounded-rect perimeter is traced and the CSS border is
   replaced by a dense band of gold particles that hug the edge and swarm
   (irregular seats + per-particle wander), inward-biased so the body stays
   clean. Recomputes each card's rect every frame, so it tracks scroll/layout.
   Self-contained IIFE → window.LB_SWARM. Honors LB.motionOn / reduced-motion.
   ========================================================================= */
(function(){
  "use strict";
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TARGETS = '.trip-panel, .ptile';   // cards whose border becomes a swarm
  const RAD = 13;          // corner radius (match the card border-radius)
  const BAND = 9;          // swarm reach inward from the edge (px)
  const DENS = 0.85;       // particles per perimeter pixel
  const GOLD=[214,164,80], AMBER=[246,208,132];

  let canvas, ctx, W, H, dpr, SP_GOLD, SP_AMBER;
  let cards=[], raf=0, running=false, settled=false, lastScan=0;
  const frac=x=>x-Math.floor(x);
  const h=n=>frac(Math.sin(n*12.9898)*43758.5453);

  function sprite(col){
    const S=48,c=document.createElement('canvas');c.width=c.height=S;
    const g=c.getContext('2d'),rg=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    rg.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},1)`);
    rg.addColorStop(0.28,`rgba(${col[0]},${col[1]},${col[2]},0.45)`);
    rg.addColorStop(1,`rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle=rg;g.fillRect(0,0,S,S);return c;
  }

  // rounded-rect perimeter point (CSS px) + inward normal, at s in [0,1)
  function rrPoint(R, rad, s){
    const w=R.w, hh=R.h, sw=Math.max(0,w-2*rad), sh=Math.max(0,hh-2*rad), arc=Math.PI*0.5*rad;
    const segs=[sw,arc,sh,arc,sw,arc,sh,arc];
    let total=0; for(const v of segs) total+=v;
    let d=frac(s)*total, k=0; while(k<7 && d>segs[k]){ d-=segs[k]; k++; }
    const f=segs[k]>0 ? d/segs[k] : 0, x0=R.x, y0=R.y; let x,y,nx,ny,a,cx,cy;
    if(k===0){ x=x0+rad+sw*f; y=y0; nx=0; ny=1; }
    else if(k===1){ a=-Math.PI/2+f*Math.PI/2; cx=x0+w-rad; cy=y0+rad; x=cx+Math.cos(a)*rad; y=cy+Math.sin(a)*rad; nx=-Math.cos(a); ny=-Math.sin(a); }
    else if(k===2){ x=x0+w; y=y0+rad+sh*f; nx=-1; ny=0; }
    else if(k===3){ a=f*Math.PI/2; cx=x0+w-rad; cy=y0+hh-rad; x=cx+Math.cos(a)*rad; y=cy+Math.sin(a)*rad; nx=-Math.cos(a); ny=-Math.sin(a); }
    else if(k===4){ x=x0+w-rad-sw*f; y=y0+hh; nx=0; ny=-1; }
    else if(k===5){ a=Math.PI/2+f*Math.PI/2; cx=x0+rad; cy=y0+hh-rad; x=cx+Math.cos(a)*rad; y=cy+Math.sin(a)*rad; nx=-Math.cos(a); ny=-Math.sin(a); }
    else if(k===6){ x=x0; y=y0+hh-rad-sh*f; nx=1; ny=0; }
    else { a=Math.PI+f*Math.PI/2; cx=x0+rad; cy=y0+rad; x=cx+Math.cos(a)*rad; y=cy+Math.sin(a)*rad; nx=-Math.cos(a); ny=-Math.sin(a); }
    return {x,y,nx,ny,total};
  }

  function makeParts(n){
    const a=[];
    for(let i=0;i<n;i++){
      const r1=h(i), r2=h(i+13.7), r3=h(i+41.2), r4=h(i+67.9);
      a.push({ s:r1,                                  // irregular seat around the perimeter
        inB:(r2*r2)*BAND,                             // inward bias (most hug the edge, few drift in)
        out:(r3-0.5)*4.0,                             // a little outward spill
        wAmp:0.4+r3*1.8, wFreq:0.0006+r2*0.0022, wPhase:r4*6.283,  // perpendicular swarm jitter
        sDrift:(r4-0.5)*0.00003,                      // tiny drift along the edge
        sAmp:0.0008+r1*0.0018, sFreq:0.0005+r3*0.0017, sPhase:r2*6.283,
        sz:0.7+r1*1.1, amber:r3<0.18 });
    }
    return a;
  }
  function scan(){
    cards=[];
    document.querySelectorAll(TARGETS).forEach(el=>{
      const R=el.getBoundingClientRect(); if(R.width<40||R.height<40) return;
      el.style.borderColor='transparent';            // the line becomes a swarm
      const per=2*(R.width-2*RAD)+2*(R.height-2*RAD)+2*Math.PI*RAD;
      cards.push({ el, parts:makeParts(Math.max(120, Math.round(per*DENS))) });
    });
  }

  function render(now){
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation='lighter';
    for(const card of cards){
      const b=card.el.getBoundingClientRect();
      if(b.bottom<-40||b.top>innerHeight+40){ continue; }   // offscreen: skip
      const R={x:b.left,y:b.top,w:b.width,h:b.height};
      for(const p of card.parts){
        const s=p.s + p.sDrift*now + Math.sin(p.sPhase+now*p.sFreq)*p.sAmp;
        const q=rrPoint(R, RAD, s);
        const off=(-p.inB + p.out + Math.sin(p.wPhase+now*p.wFreq)*p.wAmp);  // inward(+jitter)
        const x=(q.x + q.nx*off)*dpr, y=(q.y + q.ny*off)*dpr;
        if(x<-30||y<-30||x>W+30||y>H+30) continue;
        const r=(p.sz*1.15+0.5)*dpr;
        const edge=1-Math.min(1, p.inB/(BAND+3));    // dense on the line → wispy inward
        ctx.globalAlpha=0.06+0.18*edge*edge;
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
    if(now-lastScan>1500){ lastScan=now; if(cards.length===0) scan(); }
    render(now);
    raf=requestAnimationFrame(frame);
  }
  function size(){ dpr=Math.min(window.devicePixelRatio||1,2); W=Math.round(innerWidth*dpr); H=Math.round(innerHeight*dpr);
    canvas.width=W; canvas.height=H; canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; }
  function pause(){ running=false; if(raf){ cancelAnimationFrame(raf); raf=0; } }
  function resume(){ if(running) return; running=true; raf=requestAnimationFrame(frame); }

  function boot(){
    SP_GOLD=sprite(GOLD); SP_AMBER=sprite(AMBER);
    canvas=document.createElement('canvas'); canvas.className='swarm-canvas';
    canvas.style.cssText='position:fixed;inset:0;z-index:6;pointer-events:none;';
    document.body.appendChild(canvas); ctx=canvas.getContext('2d'); size();
    window.addEventListener('resize', ()=>{ size(); scan(); }, false);
    document.addEventListener('visibilitychange', ()=>{ document.hidden?pause():resume(); }, false);
    window.addEventListener('hashchange', ()=> setTimeout(scan,120), false);
    [400,1000,2000,3200].forEach(d=> setTimeout(scan,d));
    resume();
  }
  window.LB_SWARM={ boot, scan, pause, resume };
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
