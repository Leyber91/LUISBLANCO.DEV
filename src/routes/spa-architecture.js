/* =========================================================================
   spa-architecture.js — callable build of the five-axis schematic + Concept
   Locator for the single-page site. Does NOT auto-run: the router calls
   window.LB_ARCH.init() after the /architecture content mounts, and
   window.LB_ARCH.locate([...]) to pre-select concepts (home → architecture
   continuity). window.LB_ARCH.teardown() detaches the resize handler.
   ---- original architecture.js: builds the five-axis schematic + Concept Locator
   • axis columns (HTML, in drift-mid) with addressable level dots
   • SVG overlay (computed): axis rails, inter-axis weave, seed links, arrows
   • Concept Locator: type-to-search OR chips → light real axis nodes,
     queue multiple terms (numbered gold badges), floating explanations
   ========================================================================= */
(function(){
  const AXES = [
    { code:"P", name:"path", def:"who decides the next step", levels:[
      "single fixed","sequence with predetermined branches","branched with explicit forks","entity-defined","entity-anticipated"] },
    { code:"M", name:"multiplicity", def:"how many models share the work", levels:[
      "single","N uncoordinated","N role-differentiated","N coordinated","emergent"] },
    { code:"A", name:"abstraction", def:"what the model composes with", levels:[
      "raw","+ memory","+ tools","+ tool generation","self-extending"] },
    { code:"R", name:"prompting", def:"how the input is built", levels:[
      "none","preprompt","context-dependent","parameterized + tools","self-refining"] },
    { code:"S", name:"async", def:"lockstep vs flow", levels:[
      "synchronous","pipeline","event-driven","independent","concurrent multi-version"] },
  ];
  const SEEDS = [
    { n:"substrate", touch:[["A",1],["R",1]] },
    { n:"sharp objective", touch:[["P",3],["R",2]] },
    { n:"crystallization capability", touch:[["A",4],["S",2]] },
    { n:"flexibilization capability", touch:[["A",3],["P",3]] },
    { n:"self-versioning capability", touch:[["A",5],["S",5]] },
    { n:"self-model", touch:[["M",3],["A",4]] },
    { n:"ceiling detection", touch:[["P",4],["S",3]] },
    { n:"transcendence toolset", touch:[["A",4],["A",5]] },
    { n:"boundary preservation", touch:[["P",5],["R",4]] },
    { n:"persistent backwards channel", touch:[["S",5],["M",4]] },
  ];
  const MECHS = [
    { tag:"mechanic", name:"crystallize", desc:"freeze repeated model behavior into deterministic code." },
    { tag:"mechanic", name:"flexibilize", desc:"fall back to the model when code meets novelty." },
    { tag:"mechanic", name:"self-version", desc:"the entity builds its own successor with a backwards channel that never closes." },
    { tag:"meta-mechanic", name:"ceiling-detect", desc:"reads failure signals, picks which mechanic fires.", meta:true },
  ];
  const STANDING = [
    { term:"RAG", map:"→ Abstraction L2 + Prompting L3", target:["A",2], x:0.27, y:0.80 },
    { term:"MCP", map:"→ Abstraction L2–3 — a tool-use protocol, not an architecture", target:["A",3], x:0.27, y:0.92 },
    { term:"fine-tuning", map:"→ off the map; tunes the node, not the system", target:null, x:0.72, y:0.84 },
    { term:"an 'agent'", map:"→ typically Path L1–2 dressed as L3", target:["P",2], x:0.01, y:0.82 },
  ];

  function el(tag, cls, html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }

  // ── build axis columns ─────────────────────────────────────────────
  function buildAxes(){
    const grid = document.getElementById('axisGrid');
    const stack = document.getElementById('axisStack');
    grid.innerHTML=''; stack.innerHTML='';        // idempotent — no duplicate on re-init
    AXES.forEach(ax=>{
      const col = el('div','axis-col');
      col.innerHTML = `
        <div class="ax-head"><span class="compcode">${ax.code}</span>
          <span class="name"><b>·</b>${ax.name}</span></div>
        <div class="ax-def">${ax.def}</div>
        <div class="pill"><span class="v">v0.2</span> · locked at 5</div>
        <div class="ax-levels"></div>`;
      const lv = col.querySelector('.ax-levels');
      ax.levels.forEach((t,i)=>{
        const lvl = el('div','ax-lvl'); lvl.setAttribute('data-axis',ax.code); lvl.setAttribute('data-level',i+1);
        lvl.innerHTML = `<span class="lvl-label">L${i+1}</span>
          <span class="lvl-dot" data-axis="${ax.code}" data-level="${i+1}"></span>
          <span class="lvl-text">${t}</span>`;
        lv.appendChild(lvl);
      });
      grid.appendChild(col);

      // mobile stacked card (clone, simpler)
      const card = el('div','axis-col');
      card.style.cssText='border:1px solid var(--line-soft);border-radius:9px;padding:15px;background:rgba(10,14,22,0.3)';
      card.innerHTML = col.innerHTML;
      stack.appendChild(card);
    });
  }

  // ── build seeds ─────────────────────────────────────────────────────
  function buildSeeds(){
    const row = document.getElementById('seedRow');
    row.innerHTML='';
    SEEDS.forEach((s,i)=>{
      const seed = el('div','seed'); seed.setAttribute('data-seed',i);
      seed.innerHTML = `<span class="snode" data-seed="${i}">${i+1}</span><span class="sname">${s.n}</span>`;
      row.appendChild(seed);
    });
  }

  // ── build mechanics ─────────────────────────────────────────────────
  // small isometric glyph per mechanic (depth, not flat icons)
  function isoCube(ox,oy,w,d,h,gold){
    const C=8,S=4.4,H=9;
    const p=(ix,iy,iz)=>`${((ix-iy)*C+ox).toFixed(1)},${((ix+iy)*S-iz*H+oy).toFixed(1)}`;
    const cls=gold?'gface':'mface';
    return `<polygon class="${cls} top" points="${p(0,0,h)} ${p(w,0,h)} ${p(w,d,h)} ${p(0,d,h)}"/>`
         + `<polygon class="${cls}" points="${p(0,d,h)} ${p(w,d,h)} ${p(w,d,0)} ${p(0,d,0)}"/>`
         + `<polygon class="${cls} r" points="${p(w,0,h)} ${p(w,d,h)} ${p(w,d,0)} ${p(w,0,0)}"/>`;
  }
  const MISO = {
    crystallize: ()=>isoCube(26,30,2.2,2.2,2.2),
    flexibilize: ()=>isoCube(20,30,2,2,2)+isoCube(40,38,1.4,1.4,1.4,true),
    'self-version': ()=>isoCube(16,32,1.8,1.8,1.8)+isoCube(42,28,1.8,1.8,2.4,true)
        +`<path class="mlink" d="M30,22 C46,12 56,18 54,28"/>`,
    'ceiling-detect': ()=>isoCube(24,34,2.2,2.2,1.6)+`<path class="mlink" d="M44,28 L44,12 M40,18 L44,12 L48,18"/>`,
  };
  function buildMechs(){
    const row = document.getElementById('mechRow');
    row.innerHTML='';
    MECHS.forEach(m=>{
      const c = el('div','mech'+(m.meta?' meta':''));
      const glyph = MISO[m.name] ? MISO[m.name]() : '';
      c.innerHTML = `<div class="mtag">${m.tag}</div>
        <svg class="miso" viewBox="0 0 64 52" aria-hidden="true">${glyph}</svg>
        <div class="mname"><span class="dotg"></span>${m.name}</div>
        <div class="mdesc">${m.desc}</div>`;
      row.appendChild(c);
    });
  }

  // ── build standing annotations ──────────────────────────────────────
  function buildStanding(){
    const layer = document.getElementById('standingLayer');
    layer.innerHTML='';
    STANDING.forEach((s,i)=>{
      const a = el('div','standing'); a.setAttribute('data-st',i);
      a.style.left = (s.x*100)+'%'; a.style.top = (s.y*100)+'%';
      a.innerHTML = `<span class="st-tick"></span><div class="st-term">${s.term}</div><div class="st-map">${s.map}</div>`;
      layer.appendChild(a);
    });
  }

  // ── geometry / SVG overlay ──────────────────────────────────────────
  const dot = (ax,lv)=> document.querySelector(`.lvl-dot[data-axis="${ax}"][data-level="${lv}"]`);
  function center(node, base){
    const r=node.getBoundingClientRect(), b=base.getBoundingClientRect();
    return { x:r.left-b.left+r.width/2, y:r.top-b.top+r.height/2 };
  }
  function curve(a,b){
    const mx=(a.x+b.x)/2; return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  function svgEl(tag,attrs){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const k in attrs) e.setAttribute(k,attrs[k]); return e; }

  function drawOverlay(){
    const inner = document.querySelector('.diagram');   // base wraps axes + seeds
    const svg = document.getElementById('diagramSvg');
    if(!inner||!svg){ console.log('[arch] no inner/svg', !!inner, !!svg); return; }
    if(window.innerWidth<=760){ svg.innerHTML=''; return; }
    const W=inner.clientWidth, H=inner.clientHeight;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.innerHTML='';
    const frag=document.createDocumentFragment();
    try{

    // geometry per axis: rail x, top y, bottom anchor y
    const rail = AXES.map(ax=>{
      const t=center(dot(ax.code,1),inner), b=center(dot(ax.code,5),inner);
      return { x:t.x, top:t.y-16, bot:b.y+26 };
    });
    // top header rail connecting the five axes
    const yTop = Math.min(...rail.map(r=>r.top));
    frag.appendChild(svgEl('path',{class:'rail-soft draw-line', d:`M${rail[0].x},${yTop} L${rail[rail.length-1].x},${yTop}`}));
    // per-axis vertical rails (dot column), extended to bottom anchor
    rail.forEach(r=>{
      frag.appendChild(svgEl('path',{class:'rail draw-line', d:`M${r.x},${yTop} L${r.x},${r.bot}`}));
      // small node where rail meets top header
      frag.appendChild(svgEl('circle',{class:'rail', cx:r.x, cy:yTop, r:2, fill:'var(--bg)'}));
    });
    // ── inter-axis weave: faint reticulated lattice crossing the dot band ──
    // every level dot threads to its neighbours one column over (offsets -1,0,+1),
    // bowing in opposite directions so the band reads as one woven structure.
    for(let i=0;i<AXES.length-1;i++){
      const Ac=AXES[i].code, Bc=AXES[i+1].code;
      for(let L=1;L<=5;L++){
        const a=center(dot(Ac,L),inner);
        [-1,0,1].forEach(off=>{
          const M=L+off; if(M<1||M>5) return;
          const b=center(dot(Bc,M),inner);
          const mx=(a.x+b.x)/2, bow=off*10;
          frag.appendChild(svgEl('path',{class:'weave',
            d:`M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${(a.y+bow).toFixed(1)} ${mx.toFixed(1)},${(b.y-bow).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`}));
        });
      }
    }
    // seed links: seed → bottom anchor of each touched axis rail (curves stay
    // in the lower band; the rail carries the connection up to the level dot)
    const seedPts=[];
    SEEDS.forEach((s,si)=>{
      const sn=document.querySelector(`.snode[data-seed="${si}"]`); if(!sn)return;
      const sp=center(sn,inner); seedPts.push(sp);
      const seen={};
      s.touch.forEach(([ax,lv])=>{
        if(seen[ax])return; seen[ax]=1;
        const r=rail[AXES.findIndex(a=>a.code===ax)]; if(!r)return;
        frag.appendChild(svgEl('path',{class:'seed-link', 'data-seed':si, 'data-axis':ax,
          d:`M${sp.x.toFixed(1)},${sp.y.toFixed(1)} C${sp.x.toFixed(1)},${(sp.y-30).toFixed(1)} ${r.x.toFixed(1)},${(r.bot+30).toFixed(1)} ${r.x.toFixed(1)},${r.bot.toFixed(1)}`}));
      });
    });
    // seed baseline: one continuous structural line threading all ten seeds,
    // with shallow cross-curves between neighbours (the reticulated underlayer).
    if(seedPts.length){
      const by=Math.max(...seedPts.map(p=>p.y))+18;
      const x0=seedPts[0].x-10, x1=seedPts[seedPts.length-1].x+10;
      frag.appendChild(svgEl('path',{class:'seed-base draw-line', d:`M${x0.toFixed(1)},${by.toFixed(1)} L${x1.toFixed(1)},${by.toFixed(1)}`}));
      seedPts.forEach(p=>{
        frag.appendChild(svgEl('path',{class:'seed-stem', d:`M${p.x.toFixed(1)},${p.y.toFixed(1)} L${p.x.toFixed(1)},${by.toFixed(1)}`}));
        frag.appendChild(svgEl('circle',{class:'seed-base-node', cx:p.x, cy:by, r:1.8}));
      });
      for(let k=0;k<seedPts.length-1;k++){
        const a=seedPts[k], b=seedPts[k+1], mx=(a.x+b.x)/2;
        frag.appendChild(svgEl('path',{class:'weave', d:`M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${(a.y+22).toFixed(1)} ${mx.toFixed(1)},${(b.y+22).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`}));
      }
    }
    // standing-annotation arrows
    if(window.innerWidth>1080){
      STANDING.forEach((s,i)=>{
        if(!s.target) return;
        const a=document.querySelector(`.standing[data-st="${i}"]`); if(!a)return;
        const ar=a.getBoundingClientRect(), br=inner.getBoundingClientRect();
        const from={ x:ar.left-br.left+ar.width/2, y:ar.top-br.top-4 };  // arrow rises from annotation top
        const tgt=center(dot(s.target[0],s.target[1]),inner);
        frag.appendChild(svgEl('path',{class:'annot-arrow', d:curve(from,tgt)}));
        frag.appendChild(svgEl('circle',{class:'annot-arrow', cx:tgt.x, cy:tgt.y, r:3, fill:'none'}));
      });
    }
    svg.appendChild(frag);
    }catch(err){ console.log('[arch] drawOverlay error:', err && err.message); }
    // line-draw reveal for rails
    requestAnimationFrame(()=>{
      svg.querySelectorAll('.draw-line').forEach(p=>{
        try{ p.style.setProperty('--len', Math.ceil(p.getTotalLength())); }catch(e){}
        requestAnimationFrame(()=>p.classList.add('drawn'));
      });
    });
  }

  // ── concept locator ─────────────────────────────────────────────────
  const CONCEPTS = window.LB_CONCEPTS||[];
  const byTerm = {}; CONCEPTS.forEach(c=>byTerm[c.term.toLowerCase()]=c);
  let queue = []; // term names in order
  // resolve a loose concept token (case-insensitive, also matches chip labels)
  function resolveTerm(tok){
    if(!tok) return null;
    const t=String(tok).trim().toLowerCase();
    if(byTerm[t]) return byTerm[t].term;
    const hit = CONCEPTS.find(c=> c.term.toLowerCase()===t || c.term.toLowerCase().replace(/[^a-z]/g,'')===t.replace(/[^a-z]/g,''));
    return hit? hit.term : null;
  }

  function clearLit(){
    document.querySelectorAll('.lvl-dot.lit').forEach(d=>{ d.classList.remove('lit'); const b=d.querySelector('.nbadge'); if(b)b.remove(); });
    document.querySelectorAll('.ax-lvl.lit').forEach(r=>r.classList.remove('lit'));
    document.querySelectorAll('.seed.lit').forEach(s=>s.classList.remove('lit'));
    document.querySelectorAll('.seed-link.lit').forEach(s=>s.classList.remove('lit'));
    document.getElementById('axisGrid').classList.remove('dim-others');
  }
  function apply(){
    clearLit();
    const map = new Map(); // dotEl -> [idx]
    queue.forEach((term,qi)=>{
      const c = byTerm[term.toLowerCase()]; if(!c||c.off_map) return;
      c.axes.forEach(({axis,level})=>{
        const d=dot(axis,level); if(!d) return;
        if(!map.has(d)) map.set(d,[]);
        map.get(d).push(qi+1);
      });
    });
    const litPairs = new Set();
    map.forEach((idxs,d)=>{
      d.classList.add('lit');
      d.closest('.ax-lvl').classList.add('lit');
      litPairs.add(d.getAttribute('data-axis')+d.getAttribute('data-level'));
      const b=el('span','nbadge', idxs.join('·')); d.appendChild(b);
    });
    // light seeds (and their links) that touch a lit axis-level
    SEEDS.forEach((s,si)=>{
      const hit = s.touch.some(([ax,lv])=> litPairs.has(ax+lv));
      if(hit){
        const sd=document.querySelector(`.seed[data-seed="${si}"]`); if(sd) sd.classList.add('lit');
        document.querySelectorAll(`.seed-link[data-seed="${si}"]`).forEach(l=>l.classList.add('lit'));
      }
    });
    if(queue.some(t=>{const c=byTerm[t.toLowerCase()];return c&&!c.off_map;}))
      document.getElementById('axisGrid').classList.add('dim-others');
    renderExplanations(); renderChips();
  }
  function renderExplanations(){
    const box=document.getElementById('locExplain'); box.innerHTML='';
    queue.forEach((term,qi)=>{
      const c=byTerm[term.toLowerCase()]; if(!c) return;
      const e=el('div','loc-exp');
      e.innerHTML=`<div class="x-term"><span class="num">${qi+1}</span>${c.term}${c.off_map?' · <span style="color:var(--faint)">off the map</span>':''}</div>
        <div class="x-body">${c.explanation}</div>`;
      box.appendChild(e);
    });
  }
  function renderChips(){
    document.querySelectorAll('.loc-chip').forEach(ch=>{
      const t=ch.getAttribute('data-term'); const qi=queue.indexOf(t);
      ch.classList.toggle('active', qi>=0);
      const old=ch.querySelector('.badge'); if(old)old.remove();
      if(qi>=0){ const b=el('span','badge',(qi+1)); ch.prepend(b); }
    });
  }
  function toggle(term){
    const i=queue.indexOf(term);
    if(i>=0) queue.splice(i,1); else queue.push(term);
    apply();
  }
  function buildChips(){
    const wrap=document.getElementById('locSuggest');
    (window.LB_CHIPS||[]).forEach(t=>{
      const ch=el('button','loc-chip', t); ch.setAttribute('data-term',t);
      ch.addEventListener('click',()=>toggle(t)); wrap.appendChild(ch);
    });
  }
  function wireInput(){
    const input=document.getElementById('locInput');
    const menu=document.getElementById('locMenu');
    let hi=-1, items=[];
    function close(){ menu.classList.remove('open'); hi=-1; }
    function open(q){
      const ql=q.trim().toLowerCase();
      items = CONCEPTS.filter(c=> !ql || c.term.toLowerCase().includes(ql));
      menu.innerHTML='';
      items.slice(0,8).forEach((c,k)=>{
        const d=el('div',null, c.term + (c.off_map?'<span class="off">off-map</span>':`<span class="off">${c.axes.map(a=>a.axis+a.level).join(' ')}</span>`));
        d.addEventListener('mousedown',ev=>{ ev.preventDefault(); toggle(c.term); input.value=''; close(); });
        menu.appendChild(d);
      });
      if(items.length) menu.classList.add('open'); else close();
    }
    input.addEventListener('focus',()=>open(input.value));
    input.addEventListener('input',()=>open(input.value));
    input.addEventListener('blur',()=>setTimeout(close,150));
    input.addEventListener('keydown',e=>{
      const opts=menu.querySelectorAll('div');
      if(e.key==='ArrowDown'){ hi=Math.min(hi+1,opts.length-1); }
      else if(e.key==='ArrowUp'){ hi=Math.max(hi-1,0); }
      else if(e.key==='Enter'){ e.preventDefault();
        if(hi>=0&&opts[hi]) opts[hi].dispatchEvent(new Event('mousedown'));
        else { const m=items[0]; if(m){ toggle(m.term); input.value=''; close(); } } return; }
      else if(e.key==='Escape'){ close(); return; }
      opts.forEach((o,k)=>o.classList.toggle('hi',k===hi));
    });
    document.getElementById('locClear').addEventListener('click',()=>{ queue=[]; apply(); input.value=''; close(); });
  }

  let resizeHandler=null;
  function init(opts){
    queue = [];
    buildAxes(); buildSeeds(); buildMechs(); buildStanding();
    buildChips(); wireInput();
    drawOverlay();
    requestAnimationFrame(()=>{ drawOverlay(); });
    setTimeout(drawOverlay, 400);
    if(resizeHandler) window.removeEventListener('resize', resizeHandler);
    let rt; resizeHandler=()=>{ clearTimeout(rt); rt=setTimeout(()=>{ drawOverlay(); apply(); },180); };
    window.addEventListener('resize', resizeHandler);
    // continuity: pre-select concepts handed in from another route
    const want = (opts && opts.locate) ? [].concat(opts.locate) : [];
    const terms = want.map(resolveTerm).filter(Boolean);
    if(terms.length){ queue = terms; setTimeout(()=>apply(), 60); }
  }
  function locate(list){ const terms=[].concat(list||[]).map(resolveTerm).filter(Boolean); queue=terms; apply(); }
  function teardown(){ if(resizeHandler){ window.removeEventListener('resize', resizeHandler); resizeHandler=null; } queue=[]; }

  window.LB_ARCH = { init, locate, teardown, redraw:drawOverlay };
})();
