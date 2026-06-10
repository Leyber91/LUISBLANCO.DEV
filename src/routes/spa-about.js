/* =========================================================================
   spa-about.js — the /about celestial field, image-8 fidelity + reactive.
   The template carries the bones (rings, sun, markers); this module seeds the
   dust belt and the planets, then runs them: planets advance along their
   ellipses, and the whole inner group leans toward the cursor (parallax)
   independently of the outer .drift-mid levitation (engine owns that).
   Reduced motion / motion-off → a single static, fully-dressed frame.
   Re-armed by spa-router on every visit to /about.
   ========================================================================= */
(function(){
  const CX=380, CY=260;
  const ORBITS=[
    {rx:70, ry:26}, {rx:130, ry:50}, {rx:195, ry:76},
    {rx:262, ry:103}, {rx:330, ry:131}, {rx:392, ry:158}
  ];
  // planets: orbit index · angular speed (rad/ms) · phase · radius
  const PLANETS=[
    {o:0, sp:0.00022,  ph:1.2, r:1.8},
    {o:1, sp:0.00014,  ph:4.4, r:2.2, bright:true},
    {o:2, sp:0.00010,  ph:2.6, r:2.4},
    {o:2, sp:0.00010,  ph:5.5, r:1.6},
    {o:3, sp:0.00007,  ph:0.6, r:2.6, bright:true},
    {o:4, sp:0.000052, ph:3.3, r:2.2},
    {o:5, sp:0.00004,  ph:5.9, r:2.9, ringed:true}
  ];
  let raf=null, secEl=null, onMove=null;
  let px=0, py=0, tx=0, ty=0;

  function rng(seed){ let s=seed>>>0; return ()=> (s=(s*1664525+1013904223)>>>0)/4294967296; }
  function still(){
    const LB=window.LB||{};
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('reduced-motion')
      || !!LB.reducedPreview || LB.motionOn===false;
  }
  function pos(p,a){ return [ CX+ORBITS[p.o].rx*Math.cos(a), CY+ORBITS[p.o].ry*Math.sin(a) ]; }

  function init(){
    const svg=document.getElementById('abField'); if(!svg) return;
    const dustG=svg.querySelector('#orbDust'), plG=svg.querySelector('#orbPlanets'),
          inner=svg.querySelector('#orbInner');
    const rand=rng(20260610);

    // dust belt — specks scattered in jittered bands around each ring
    let dust='';
    for(let i=0;i<120;i++){
      const band=ORBITS[Math.floor(rand()*ORBITS.length)];
      const a=rand()*Math.PI*2, k=0.8+rand()*0.4;
      const x=CX+band.rx*k*Math.cos(a), y=CY+band.ry*k*Math.sin(a);
      const gold=rand()>0.97;
      dust+=`<circle class="dust${gold?' gold':''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}"`
          + ` r="${(0.4+rand()*0.9).toFixed(2)}" style="opacity:${(0.1+rand()*0.42).toFixed(2)}"/>`;
    }
    dustG.innerHTML=dust;

    plG.innerHTML=PLANETS.map((p,i)=>{
      const body=`<circle class="oplanet${p.bright?' bright':''}" r="${p.r}"/>`;
      const ring=p.ringed?`<ellipse class="oring" rx="${(p.r+3.8).toFixed(1)}" ry="${((p.r+3.8)*0.42).toFixed(1)}"/>`:'';
      return `<g data-i="${i}">${body}${ring}</g>`;
    }).join('');
    const nodes=[...plG.querySelectorAll('g[data-i]')];
    const place=(g,idx,a)=>{ const [x,y]=pos(PLANETS[idx],a);
      g.setAttribute('transform',`translate(${x.toFixed(2)},${y.toFixed(2)})`); };

    if(still()){ nodes.forEach((g,i)=>place(g,i,PLANETS[i].ph)); return; }

    secEl=document.querySelector('.ab-main');
    onMove=e=>{ const b=secEl.getBoundingClientRect();
      px=(e.clientX-b.left)/b.width-0.5; py=(e.clientY-b.top)/b.height-0.5; };
    if(secEl) secEl.addEventListener('pointermove', onMove);

    const t0=performance.now();
    function frame(now){
      const t=now-t0;
      nodes.forEach((g,i)=>place(g,i,PLANETS[i].ph+t*PLANETS[i].sp));
      tx+=(px*16-tx)*0.045; ty+=(py*11-ty)*0.045;   // lean toward the cursor, eased
      inner.setAttribute('transform',`translate(${tx.toFixed(2)},${ty.toFixed(2)})`);
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
  }
  function teardown(){
    if(raf) cancelAnimationFrame(raf); raf=null;
    if(secEl&&onMove) secEl.removeEventListener('pointermove',onMove);
    secEl=null; onMove=null; px=py=tx=ty=0;
  }
  window.LB_ABOUT={ init, teardown };
})();
