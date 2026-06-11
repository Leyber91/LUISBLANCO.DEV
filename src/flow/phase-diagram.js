/* =========================================================================
   phase-diagram.js — section 02 "the record" as ONE dust phase-diagram of a
   single node passing through three states, read left → right:
     · was   — CONVERGE : history streams in along a timeline, compressing
                into the node (learned, not written; knowable machinery).
     · wasn't — DISSOLVE : the dust tries to condense into the myths and fails,
                a knot that keeps unravelling (the stories that didn't hold).
     · can be — EMANATE : the node radiates into a constellation; where the
                currents arrive, satellites ignite (none of the parts alone).
   One fixed full-viewport canvas (border-swarm pattern), anchored to
   #phaseStrip's rect each frame so it tracks scroll. Reveal ramps as the strip
   enters the viewport. Self-contained IIFE → window.LB_PHASE. Honors
   LB.motionOn / reduced-motion.
   ========================================================================= */
(function(){
  "use strict";
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ANCHOR = '#phaseStrip';
  const GOLD=[214,164,80], AMBER=[246,208,132], INK=[150,166,196];
  const STATIONS = [['1956','symbols'],['1986','backprop'],['2012','depth'],['2017','attention'],['now','scale']];
  const MYTHS = ['magic','a mind in a box','just autocomplete','an agent alone','the end of work'];
  // satellites for the emanate node — dir vectors (y-down), 60deg apart
  const SAT = [
    {name:'memory',  dx:-0.87, dy:-0.5},
    {name:'observe', dx: 0.0,  dy:-1.0},
    {name:'time',    dx: 0.87, dy:-0.5},
    {name:'feedback',dx: 0.87, dy: 0.5},
    {name:'recover', dx: 0.0,  dy: 1.0},
    {name:'tools',   dx:-0.87, dy: 0.5},
  ];

  let canvas, ctx, W, H, D, SP_GOLD, SP_AMBER, SP_INK;
  let A=[], B=[], C=[], LINK=[], raf=0, running=false, settled=false, t0=0;
  const frac=x=>x-Math.floor(x);
  const hsh=n=>frac(Math.sin(n*12.9898)*43758.5453);
  const cl01=x=>x<0?0:x>1?1:x;
  const sm=x=>{ x=cl01(x); return x*x*(3-2*x); };

  function sprite(col,soft){
    const S=48,c=document.createElement('canvas');c.width=c.height=S;
    const g=c.getContext('2d'),rg=g.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    rg.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},1)`);
    rg.addColorStop(soft?0.34:0.26,`rgba(${col[0]},${col[1]},${col[2]},${soft?0.4:0.5})`);
    rg.addColorStop(1,`rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle=rg;g.fillRect(0,0,S,S);return c;
  }

  function build(){
    A=[]; for(let i=0;i<430;i++){ const r=hsh(i),r2=hsh(i+9.1),r3=hsh(i+27.3);
      A.push({ t:r, seat:(r2-0.5)*2, sp:0.10+r3*0.16, sz:0.7+r2*1.2,
        wf:0.0009+r*0.0022, wp:r3*6.283, amber:r2<0.18 }); }
    B=[]; for(let i=0;i<320;i++){ const r=hsh(i+3.7),r2=hsh(i+15.4),r3=hsh(i+44.8);
      B.push({ ang:r*6.283, base:0.16+r2*0.84, ph:r3*6.283, bf:0.0007+r*0.0016,
        sz:0.6+r2*1.1, amber:r3<0.16 }); }
    C=[]; for(let i=0;i<432;i++){ const r=hsh(i+5.2),r2=hsh(i+22.1),r3=hsh(i+61.7);
      C.push({ s:i%SAT.length, u:r, sp:0.07+r2*0.12, off:(r3-0.5)*1.7, sz:0.6+r*1.1,
        wf:0.0011+r2*0.002, wp:r3*6.283, amber:r<0.2 }); }
    LINK=[]; for(let i=0;i<190;i++){ const r=hsh(i+8.8),r2=hsh(i+33.2);
      LINK.push({ x:r, y:(r2-0.5)*1.4, sp:0.02+r2*0.05, sz:0.5+r*0.9 }); }
  }

  function dot(sp,x,y,r,a){ if(a<=0.003) return; if(x<-40||y<-40||x>W+40||y>H+40) return;
    ctx.globalAlpha=a; ctx.drawImage(sp, x-r, y-r, r*2, r*2); }
  function label(txt,x,y,col,a,sz,align){
    ctx.globalAlpha=a; ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.textAlign=align||'center'; ctx.textBaseline='middle';
    ctx.font=`${(sz||9)*D}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.fillText(txt, x, y);
  }

  function render(now){
    ctx.clearRect(0,0,W,H);
    const host=document.querySelector(ANCHOR);
    if(!host) return;
    const R=host.getBoundingClientRect();
    if(R.width<60||R.bottom<-60||R.top>innerHeight+60) return;

    const reveal = (sysReduced||LB.reducedPreview||!LB.motionOn)
      ? 1 : sm((innerHeight*0.94 - R.top) / (innerHeight*0.55));
    const tt = now - t0;
    const zw = R.width/3, cy=(R.y + R.height*0.46)*D;
    const padL = R.width*0.045;

    ctx.globalCompositeOperation='lighter';

    // ── the spine current — one luminous thread through all three nodes ──
    for(const p of LINK){
      const x=(R.x + padL + frac(p.x + tt*p.sp*0.00010*reveal)*(R.width-2*padL))*D;
      const y=cy + p.y*R.height*0.05*D + Math.sin(tt*0.0005+p.x*11)*5*D;
      dot(SP_GOLD, x, y, (p.sz+0.4)*D, 0.085*reveal);
    }

    // ════ ZONE A — CONVERGE ════════════════════════════════════════════
    const axN=(R.x + zw*0.92)*D, ax0=(R.x + padL)*D, bandH=R.height*0.24*D;
    // timeline stations + node "now"
    for(let i=0;i<5;i++){
      const sx=ax0 + (axN-ax0)*(i/4), gold=i>=3;
      const pul=0.6+0.4*Math.sin(tt*0.002+i);
      dot(gold?SP_GOLD:SP_INK, sx, cy, (gold?3.0:2.0)*D, (gold?0.5:0.3)*reveal*pul);
      label(STATIONS[i][0], sx, cy-bandH-9*D, gold?GOLD:INK, (0.55+0.35*gold)*reveal, 8.5, 'center');
      label(STATIONS[i][1], sx, cy+bandH+10*D, INK, 0.34*reveal, 7.5, 'center');
    }
    for(const p of A){
      const t=frac(p.t + tt*p.sp*0.00018*reveal);
      const x=ax0 + (axN-ax0)*t;
      const spread=(1-sm(t));                              // wide at the past, tight at "now"
      const y=cy + p.seat*bandH*spread + Math.sin(p.wp+tt*p.wf)*6*D*spread;
      const a=(0.14+0.55*sm(t))*reveal;                    // brightens as it lands in the node
      dot(p.amber?SP_AMBER:SP_GOLD, x, y, (p.sz+0.5)*D, a);
    }
    dot(SP_GOLD, axN, cy, 5.0*D, 0.85*reveal);             // the node — "now"

    // ════ ZONE B — DISSOLVE ════════════════════════════════════════════
    const bx=(R.x + R.width*0.5)*D, knotR=Math.min(zw*0.42, R.height*0.34)*D;
    for(const p of B){
      const breathe=Math.abs(Math.sin(p.ph + tt*p.bf));    // 0 = condensed, 1 = flung out
      const rr=knotR*(0.18 + 0.95*breathe)*p.base;
      const x=bx + Math.cos(p.ang + tt*0.0002)*rr;
      const y=cy + Math.sin(p.ang + tt*0.0002)*rr*0.82;
      const a=(0.13 + 0.52*(1-breathe))*reveal;            // bright when it tries to form, fades as it fails
      dot(p.amber?SP_AMBER:SP_GOLD, x, y, (p.sz+0.4)*D, a);
    }
    dot(SP_INK, bx, cy, 3.0*D, (0.22+0.12*Math.sin(tt*0.003))*reveal);  // the bare, flickering node
    // one myth at a time rises and is struck through
    const mi=Math.floor(tt/2100)%MYTHS.length, mp=frac(tt/2100);
    const ma=Math.sin(mp*Math.PI)*reveal;                  // fade in, fade out
    if(ma>0.02){
      const my=cy - knotR - 12*D;
      label(MYTHS[mi], bx, my, INK, ma*0.7, 9, 'center');
      ctx.globalAlpha=ma*0.6; ctx.strokeStyle=`rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},1)`;
      ctx.lineWidth=1*D; const wpx=ctx.measureText(MYTHS[mi]).width;
      const strike=sm((mp-0.35)/0.5)*wpx;                  // strike grows after it appears
      ctx.beginPath(); ctx.moveTo(bx-wpx/2,my); ctx.lineTo(bx-wpx/2+strike,my); ctx.stroke();
    }

    // ════ ZONE C — EMANATE ═════════════════════════════════════════════
    const cxN=(R.x + R.width*0.74)*D, spoke=Math.min(zw*0.46, R.height*0.46)*D;
    for(const p of C){
      const s=SAT[p.s], u=frac(p.u + tt*p.sp*0.00016*reveal);
      const px=-s.dy, py=s.dx;                              // perpendicular for a little spread
      const x=cxN + s.dx*spoke*u + px*p.off*8*D*(1-u) + Math.sin(p.wp+tt*p.wf)*3*D;
      const y=cy  + s.dy*spoke*u + py*p.off*8*D*(1-u);
      const a=(0.14+0.52*(1-Math.abs(u-0.5)*1.4))*reveal;   // brightest mid-spoke
      dot(p.amber?SP_AMBER:SP_GOLD, x, y, (p.sz+0.5)*D, a);
    }
    for(const s of SAT){
      const sx=cxN + s.dx*spoke, sy=cy + s.dy*spoke;
      const ign=0.45+0.55*Math.abs(Math.sin(tt*0.0016 + s.dx*3 + s.dy*2));
      dot(SP_GOLD, sx, sy, 3.0*D, 0.55*reveal*ign);
      const lx=sx + s.dx*14*D, ly=sy + s.dy*13*D;
      label(s.name, lx, ly, GOLD, 0.6*reveal, 8, s.dx<-0.3?'right':s.dx>0.3?'left':'center');
    }
    dot(SP_GOLD, cxN, cy, 5.4*D, 0.9*reveal);              // the wired node — radiant

    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  }

  function frame(now){
    if(!running) return;
    if(!t0) t0=now;
    const reduced=sysReduced||LB.reducedPreview;
    if(!LB.motionOn||reduced){ if(!settled){ render(now); settled=true; } raf=requestAnimationFrame(frame); return; }
    settled=false; render(now); raf=requestAnimationFrame(frame);
  }
  function size(){ D=Math.min(window.devicePixelRatio||1,2); W=Math.round(innerWidth*D); H=Math.round(innerHeight*D);
    canvas.width=W; canvas.height=H; canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; }
  function pause(){ running=false; if(raf){ cancelAnimationFrame(raf); raf=0; } }
  function resume(){ if(running) return; running=true; raf=requestAnimationFrame(frame); }

  function boot(){
    SP_GOLD=sprite(GOLD,false); SP_AMBER=sprite(AMBER,true); SP_INK=sprite(INK,true);
    build();
    canvas=document.createElement('canvas'); canvas.className='phase-canvas';
    canvas.style.cssText='position:fixed;inset:0;z-index:5;pointer-events:none;';
    document.body.appendChild(canvas); ctx=canvas.getContext('2d'); size();
    window.addEventListener('resize', size, false);
    document.addEventListener('visibilitychange', ()=>{ document.hidden?pause():resume(); }, false);
    resume();
  }
  window.LB_PHASE={ boot, pause, resume };
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
