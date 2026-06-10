/* =========================================================================
   spa-projects.js — builds the /projects woven field:
   • isometric module diagrams injected into each .pcard .iso[data-mod]
   • a computed connective mesh: cluster-top weave, a shared baseline, and a
     dropped line from every visible module down into that baseline
   • rail links from the mechanics/ops aside into the visualization cluster
   Router calls window.LB_PROJ.init() after /projects mounts; teardown() detaches.
   ========================================================================= */
(function(){
  /* ---- isometric primitive: one cube, three shaded visible faces -------- */
  const C=12, S=6.6, H=13.5;
  function cube(ox,oy,w,d,h){
    const p=(ix,iy,iz)=>`${((ix-iy)*C+ox).toFixed(1)},${((ix+iy)*S-iz*H+oy).toFixed(1)}`;
    const top=`${p(0,0,h)} ${p(w,0,h)} ${p(w,d,h)} ${p(0,d,h)}`;
    const left=`${p(0,d,h)} ${p(w,d,h)} ${p(w,d,0)} ${p(0,d,0)}`;
    const right=`${p(w,0,h)} ${p(w,d,h)} ${p(w,d,0)} ${p(w,0,0)}`;
    return `<polygon class="face-top ed" points="${top}"/>`
         + `<polygon class="face ed" points="${left}"/>`
         + `<polygon class="face-2 ed" points="${right}"/>`;
  }
  // top-centre of a cube in screen space (for linking)
  function cubeTop(ox,oy,w,d,h){ const ix=w/2, iy=d/2; return [ (ix-iy)*C+ox, (ix+iy)*S-h*H+oy ]; }
  function nd(x,y,gold){ return `<circle class="${gold?'gn':'nd'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${gold?2.6:2}"/>`; }
  function link(a,b,dash){ return `<line class="${dash?'link-d':'link'}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/>`; }
  // an iso rhombus plane (flat tile) at height z
  function plane(ox,oy,w,d,z){
    const p=(ix,iy)=>`${((ix-iy)*C+ox).toFixed(1)},${((ix+iy)*S-z*H+oy).toFixed(1)}`;
    return `<polygon class="face ed" points="${p(0,0)} ${p(w,0)} ${p(w,d)} ${p(0,d)}"/>`;
  }
  function svg(inner){ return `<svg viewBox="0 0 132 92" preserveAspectRatio="xMidYMid meet">${inner}</svg>`; }

  const MOD = {
    // multi-agent orchestration: three modules at different heights, wired
    agents(){
      const a=cube(30,52,2.4,2.4,2.4), b=cube(64,40,2.4,2.4,3.2), c=cube(92,58,2.2,2.2,2.2);
      const ta=cubeTop(30,52,2.4,2.4,2.4), tb=cubeTop(64,40,2.4,2.4,3.2), tc=cubeTop(92,58,2.2,2.2,2.2);
      return svg(link(ta,tb)+link(tb,tc)+link(ta,tc,true)+a+b+c+nd(tb[0],tb[1],true)+nd(ta[0],ta[1])+nd(tc[0],tc[1]));
    },
    // MCP server + self-refine loop
    loop(){
      const stack=cube(40,44,2.2,2.2,4.2);
      const t=cubeTop(40,44,2.2,2.2,4.2);
      const loop=`<path class="link" d="M${t[0]+4},${t[1]+2} C${t[0]+34},${t[1]-6} ${t[0]+40},${t[1]+30} ${t[0]+10},${t[1]+30}" marker-end=""/>`;
      const arrow=`<path class="ed" d="M${t[0]+14},${t[1]+26} L${t[0]+8},${t[1]+30} L${t[0]+16},${t[1]+33}"/>`;
      return svg(loop+arrow+stack+nd(t[0],t[1],true)+nd(t[0]+40,t[1]+14));
    },
    // hybrid search: two stacked retrieval planes merging into a result node
    layers(){
      const p1=plane(34,58,3.4,3.0,0), p2=plane(34,58,3.4,3.0,2.2);
      const tp=cubeTop(34,58,3.4,3.0,2.2);
      return svg(p1+`<line class="link-d" x1="${tp[0]-18}" y1="${tp[1]+13}" x2="${tp[0]-18}" y2="${tp[1]+1}"/>`+p2
        + nd(tp[0]+22,tp[1]-6,true)+link([tp[0]+4,tp[1]-2],[tp[0]+22,tp[1]-6]));
    },
    // resilient ingestion pipeline: three stages in a row + retry arc
    pipeline(){
      const a=cube(20,54,1.8,1.8,1.8), b=cube(52,54,1.8,1.8,1.8), c=cube(84,54,1.8,1.8,1.8);
      const ta=cubeTop(20,54,1.8,1.8,1.8), tb=cubeTop(52,54,1.8,1.8,1.8), tc=cubeTop(84,54,1.8,1.8,1.8);
      const retry=`<path class="link-d" d="M${tc[0]},${tc[1]-3} C${tc[0]-6},${tc[1]-24} ${tb[0]+6},${tb[1]-24} ${tb[0]},${tb[1]-3}"/>`;
      return svg(link(ta,tb)+link(tb,tc)+retry+a+b+c+nd(ta[0],ta[1])+nd(tb[0],tb[1])+nd(tc[0],tc[1],true));
    },
    // real-time dashboard: a flat iso panel carrying riser bars
    panel(){
      const base=plane(30,60,4.6,3.2,0.2);
      const risers = [[46,42,1.4],[60,46,2.4],[74,40,1.7],[88,44,2.9]]
        .map(([x,y,h])=>cube(x,y,0.6,0.6,h)).join('');
      const tp=cubeTop(88,44,0.6,0.6,2.9);
      return svg(base+risers+nd(tp[0],tp[1],true));
    },
    // framework (placeholder): central module, dashed links to satellites
    cluster(){
      const core=cube(54,48,2.4,2.4,2.6); const t=cubeTop(54,48,2.4,2.4,2.6);
      const sats=[[24,40],[96,38],[28,70],[100,68]];
      let l=''; sats.forEach(s=>{ l+=link(t,s,true)+nd(s[0],s[1]); });
      return svg(l+core+nd(t[0],t[1],true));
    },
    // WirthForge: nested cube (self-model made visible) — gold inner
    nest(){
      const outer=cube(38,40,3.6,3.6,3.6);
      const inner=cube(56,52,1.5,1.5,1.5);
      const ti=cubeTop(56,52,1.5,1.5,1.5);
      return svg(outer+`<g class="gcube">${inner}</g>`+nd(ti[0],ti[1],true));
    },
    // Prime Radiant: iso concentric rings + central radiant + orbiters
    radial(){
      const cx=66, cy=50;
      let r='';
      [ [40,16],[26,10],[13,5] ].forEach(([rx,ry])=>{ r+=`<ellipse class="ed-soft" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none"/>`; });
      const orb=[[cx-40,cy],[cx+26,cy-9],[cx+13,cy+6],[cx-20,cy+9]].map(o=>nd(o[0],o[1])).join('');
      return svg(r+orb+`<circle class="gn" cx="${cx}" cy="${cy}" r="3"/>`);
    }
  };

  function buildIso(scope){
    scope.querySelectorAll('.iso[data-mod]').forEach(el=>{
      const m=el.getAttribute('data-mod'); if(MOD[m]) el.innerHTML=MOD[m]();
    });
  }

  /* ---- connective mesh + shared baseline -------------------------------- */
  function svgEl(tag,attrs){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

  let resizeHandler=null;
  function rectIn(el, base){ const r=el.getBoundingClientRect(), b=base.getBoundingClientRect();
    return { x:r.left-b.left, y:r.top-b.top, w:r.width, h:r.height, cx:r.left-b.left+r.width/2, cy:r.top-b.top+r.height/2,
      bot:r.top-b.top+r.height, top:r.top-b.top }; }

  function drawWeave(){
    const field=document.getElementById('projField');
    const svgn=document.getElementById('projWeave');
    const base=document.getElementById('projBaseline');
    if(!field||!svgn||!base) return;
    if(window.innerWidth<=1180){ svgn.innerHTML=''; return; }
    const W=field.clientWidth, Hh=field.clientHeight;
    svgn.setAttribute('viewBox',`0 0 ${W} ${Hh}`);
    svgn.innerHTML='';
    const frag=document.createDocumentFragment();
    const baseY = rectIn(base, field).cy;

    // baseline spanning the field
    frag.appendChild(svgEl('path',{class:'base-line draw-line', d:`M8,${baseY} L${W-8},${baseY}`}));

    // every visible module drops a thin line into the baseline
    const cards=[...field.querySelectorAll('.pcard')].filter(c=>!c.classList.contains('hidden'));
    cards.forEach(card=>{
      const r=rectIn(card, field);
      const x=r.cx, y=r.bot;
      const d=`M${x.toFixed(1)},${y.toFixed(1)} C${x.toFixed(1)},${(y+40).toFixed(1)} ${x.toFixed(1)},${(baseY-40).toFixed(1)} ${x.toFixed(1)},${baseY.toFixed(1)}`;
      frag.appendChild(svgEl('path',{class:'drop', 'data-card':'1', d}));
      frag.appendChild(svgEl('circle',{class:'base-node', cx:x, cy:baseY, r:3}));
    });
    // two gold anchor nodes on the baseline (the ends of the structural span)
    [0.13,0.87].forEach(fr=>{ frag.appendChild(svgEl('circle',{class:'base-node gold', cx:(W*fr), cy:baseY, r:3.4})); });

    // weave the cluster tops together with faint arcs
    const clusters=[...field.querySelectorAll('.cluster')];
    const tops=clusters.map(cl=>{ const r=rectIn(cl, field); return { x:r.cx, y:r.top }; });
    for(let i=0;i<tops.length-1;i++){
      const a=tops[i], b=tops[i+1];
      const my=Math.min(a.y,b.y)-26;
      frag.appendChild(svgEl('path',{class:'weave', d:`M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`}));
    }

    // rail links: connect each rail item to the nearest visualization card edge
    const viz=field.querySelector('.cluster[data-cluster="VISUALIZATION"]');
    const rail=document.getElementById('projRail');
    if(viz&&rail){
      const vr=rectIn(viz, field);
      rail.querySelectorAll('.rail-item').forEach(it=>{
        const ir=rectIn(it, field);
        const sx=ir.x, sy=ir.cy, ex=vr.x+vr.w, ey=Math.max(vr.top+14, Math.min(sy, vr.bot-14));
        frag.appendChild(svgEl('path',{class:'rail-link', d:`M${sx.toFixed(1)},${sy.toFixed(1)} C${(sx-18).toFixed(1)},${sy.toFixed(1)} ${(ex+18).toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`}));
      });
    }

    svgn.appendChild(frag);
    requestAnimationFrame(()=>{
      svgn.querySelectorAll('.draw-line').forEach(p=>{
        try{ p.style.setProperty('--len', Math.ceil(p.getTotalLength())); }catch(e){}
        requestAnimationFrame(()=>p.classList.add('drawn'));
      });
    });
  }

  function init(){
    const scope=document.getElementById('page');
    if(!scope) return;
    buildIso(scope);
    drawWeave();
    requestAnimationFrame(drawWeave);
    setTimeout(drawWeave, 360);
    if(resizeHandler) window.removeEventListener('resize', resizeHandler);
    let rt; resizeHandler=()=>{ clearTimeout(rt); rt=setTimeout(drawWeave,160); };
    window.addEventListener('resize', resizeHandler);
  }
  function teardown(){ if(resizeHandler){ window.removeEventListener('resize', resizeHandler); resizeHandler=null; } }

  window.LB_PROJ = { init, teardown, redraw:drawWeave };
})();
