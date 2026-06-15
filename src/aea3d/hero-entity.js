/* =========================================================================
   hero-entity.js — the hero as SMOKE-INK IN WATER. A body of soft dye flows in
   a layered curl field (the swirl that makes real ink bloom), motion-stretched
   into wisps, trailing like pigment. On load it IGNITES: a drop at "the model"
   blooms outward into the full field, the gold filaments drawing out to the
   system (goal · memory · tools · loop · recovery · self-model). The cursor
   parts and stirs the ink. Depth shading + a warm gold core give dimension.

   Post-materialist: the intelligence is the immaterial, ever-dissolving pattern,
   not any node. Canvas2D, file://-safe. Honors LB.motionOn / reduced.
   window.LB_HEROENT.init(canvasEl).
   ========================================================================= */
(function(){
  'use strict';
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ORGANS=['GOAL','MEMORY','TOOLS','LOOP','RECOVERY','SELF-MODEL'];
  const eOut=x=>1-Math.pow(1-x,3);

  function init(cv){
    if(!cv) return;
    const ctx=cv.getContext('2d'); if(!ctx) return;
    const reduced=()=> sysReduced || LB.reducedPreview || LB.motionOn===false;

    // pre-rendered soft ink sprites — feathered, so particles read as fluid, not dots
    function sprite(r,g,b){ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d');
      const grd=x.createRadialGradient(64,64,0,64,64,64);
      grd.addColorStop(0,'rgba('+r+','+g+','+b+',0.82)');
      grd.addColorStop(0.22,'rgba('+r+','+g+','+b+',0.30)');
      grd.addColorStop(0.55,'rgba('+r+','+g+','+b+',0.06)');
      grd.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
      x.fillStyle=grd; x.fillRect(0,0,128,128); return c; }
    const INKB=sprite(150,184,242), INKG=sprite(233,184,96);

    let W,H,DPR, mx=-999,my=-999,mAct=0,mvT=0, dye=[], organs=[], born=0, t0=performance.now(), CX=0,CY=0,RR0=200;
    // ink motion: a divergence-free CURL field (what makes ink bloom + swirl in water)
    const sn=(x,y,t)=> Math.sin(x*1.3+t)+Math.cos(y*1.7-t*0.8)+Math.sin((x+y)*0.9+t*0.6);
    const curl=(x,y,t)=>{ const e=0.15; return [ sn(x,y+e,t)-sn(x,y-e,t), -(sn(x+e,y,t)-sn(x-e,y,t)) ]; };

    function build(){
      const r=cv.getBoundingClientRect(); W=Math.max(360,r.width); H=Math.max(360,r.height);
      DPR=Math.min(2,devicePixelRatio||1); cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
      const cx=W*0.66, cy=H*0.5, RAD=Math.min(W,H)*0.27; CX=cx; CY=cy; RR0=RAD;
      // the ink — soft dye particles, denser toward the heart; gold biased inward (warm core)
      const N=reduced()?150:320; dye=[];
      for(let i=0;i<N;i++){ const gold=Math.random()<0.15;
        const a=Math.random()*6.283, rr=Math.pow(Math.random(),0.7)*RAD*1.12;   // gold scattered, not pooled
        const hx=cx+Math.cos(a)*rr, hy=cy+Math.sin(a)*rr*0.95;
        dye.push({ hx,hy, x:hx,y:hy, vx:0,vy:0, sz:12+Math.random()*42, gold,
          a:0.5+Math.random()*0.5, z:0.35+Math.random()*0.65, ph:Math.random()*6.283 }); }
      // the named system — humble gold landmarks within the ink (the structure)
      organs=[{ hx:cx, hy:cy, label:'the model' }];
      ORGANS.forEach((l,i)=>{ const a=-Math.PI/2+i*(Math.PI*2/6); organs.push({ hx:cx+Math.cos(a)*RAD*0.8, hy:cy+Math.sin(a)*RAD*0.8, label:l }); });
      organs.forEach(o=>{ o.x=o.hx; o.y=o.hy; o.vx=0; o.vy=0; });
      if(!born) born=performance.now();
    }
    build();
    addEventListener('resize', build);
    addEventListener('pointermove', e=>{ const r=cv.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){ mAct=0; return; }
      mx=e.clientX-r.left; my=e.clientY-r.top; mAct=1; mvT=performance.now(); });
    addEventListener('pointerleave',()=>mAct=0);

    function frame(now){
      const t=now-t0; if(now-mvT>160) mAct*=0.95;
      const appear=Math.min(1,(now-born)/1600);
      const ig=Math.min(1,(now-born)/2400), ie=eOut(ig);   // IGNITION 0..1 — the ink blooms into being
      const bloom=0.5+0.5*Math.sin(t*0.00032);
      const spring=0.012*(1-bloom*0.55), FLOW=0.6;

      // INK TRAILS — translucent wash instead of a hard clear, so motion smears like dye
      ctx.globalCompositeOperation='source-over';
      ctx.fillStyle = reduced() ? '#05070E' : 'rgba(5,7,14,0.085)';
      ctx.fillRect(0,0,W,H);
      ctx.globalCompositeOperation='lighter';

      // ignition flash — a bright drop at the model, blooming open
      if(ig<1 && !reduced()){
        const fr=eOut(Math.min(1,ig/0.6)), fa=(1-ig)*(1-ig);
        const frad=RR0*(0.15+fr*1.3), g=ctx.createRadialGradient(CX,CY,0,CX,CY,frad);
        g.addColorStop(0,'rgba(250,222,150,'+(0.32*fa)+')'); g.addColorStop(0.4,'rgba(233,184,96,'+(0.1*fa)+')'); g.addColorStop(1,'rgba(233,184,96,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(CX,CY,frad,0,6.283); ctx.fill();
      }

      // flow + paint the dye (the body of smoke-ink) — unfurls from the drop on ignite
      for(const p of dye){
        const c1=curl(p.x*0.0030, p.y*0.0030, t*0.00016);
        const c2=curl(p.x*0.0072+4.0, p.y*0.0072-3.0, t*0.00030);  // finer turbulent octave → wisps curl
        p.vx += (c1[0]+c2[0]*0.45)*FLOW + (p.hx-p.x)*spring;
        p.vy += (c1[1]+c2[1]*0.45)*FLOW + (p.hy-p.y)*spring;
        if(mAct>0.02){ const dx=p.x-mx, dy=p.y-my, dd=Math.hypot(dx,dy)||1, R=RR0*1.05;
          if(dd<R){ const f=mAct*(1-dd/R);
            p.vx += dx/dd*f*2.4 - dy/dd*f*1.5;   // part the ink + swirl in the wake
            p.vy += dy/dd*f*2.4 + dx/dd*f*1.5; } }
        p.vx*=0.91; p.vy*=0.91; p.x+=p.vx; p.y+=p.vy;
        // depth shading + motion-stretch into the flow → soft wisps with dimension
        const spd=Math.hypot(p.vx,p.vy), ang=Math.atan2(p.vy,p.vx);
        const dep=0.7+0.4*p.z, sz=p.sz*(0.7+bloom*0.4)*dep, st=1+Math.min(4.6, spd*0.72);
        ctx.globalAlpha=p.a*(0.12+0.05*bloom)*dep*appear;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(ang);
        ctx.drawImage(p.gold?INKG:INKB, -sz*st, -sz, sz*2*st, sz*2); ctx.restore();
      }
      ctx.globalAlpha=1;

      // the system's structure — soft gold ink-filaments from the model out to each organ.
      // source-over (not additive) so they don't pile brightness where they converge at the model.
      ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.shadowBlur=6; ctx.shadowColor='rgba(233,184,96,0.45)';
      ctx.strokeStyle='rgba(233,184,96,'+(0.16*ie*appear)+')'; ctx.lineWidth=1.1;
      for(let i=1;i<organs.length;i++){ ctx.beginPath(); ctx.moveTo(organs[0].x,organs[0].y); ctx.lineTo(organs[i].x,organs[i].y); ctx.stroke(); }
      ctx.restore();

      // the named landmarks drift in the same field; unfurl from the model on ignite
      for(const o of organs){
        const c=curl(o.x*0.0032, o.y*0.0032, t*0.00016);
        o.vx += c[0]*FLOW*0.6 + (o.hx-o.x)*spring*1.5; o.vy += c[1]*FLOW*0.6 + (o.hy-o.y)*spring*1.5;
        o.vx*=0.9; o.vy*=0.9; o.x+=o.vx; o.y+=o.vy;
        const sz=16+bloom*6; ctx.globalAlpha=0.3*appear; ctx.drawImage(INKG, o.x-sz, o.y-sz, sz*2, sz*2); ctx.globalAlpha=1;
        ctx.beginPath(); ctx.fillStyle='rgba(250,222,150,'+(0.9*appear)+')'; ctx.arc(o.x,o.y,2,0,6.283); ctx.fill();
      }

      // labels stay crisp + legible (fade in after the bloom)
      ctx.globalCompositeOperation='source-over';
      ctx.font='8.5px "IBM Plex Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='top';
      const la=0.55*Math.max(0,(ie-0.5)/0.5);
      for(const o of organs){ ctx.fillStyle='rgba(178,198,232,'+la+')'; ctx.fillText(o.label.toLowerCase(), o.x, o.y+8); }

      if(!reduced()) requestAnimationFrame(frame);
    }
    // re-measure once the hero has real height (mount timing can give 0 at init)
    [120,450,1100,2200].forEach(d=>setTimeout(()=>{ const r=cv.getBoundingClientRect();
      if(Math.abs(r.width-W)>4||Math.abs(r.height-H)>4) build(); },d));
    if(reduced()){ frame(performance.now()); } else requestAnimationFrame(frame);
  }
  window.LB_HEROENT = { init };
})();
