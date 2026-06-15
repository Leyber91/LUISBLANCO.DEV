/* =========================================================================
   spa-spine.js — the composed traversal spine of the poster (P1).
   After the plate mounts and lays out, this module:
     1. finds one anchor point per section (the callnum / title),
     2. builds a single curved path through all of them — the connective
        tissue of the plate — that DRAWS as you scroll (scroll-draw),
     3. drops a gold junction node at each section anchor that ignites as
        you pass it (data-scroll-reveal),
     4. remaps every pre-existing per-section .scroll-draw / scroll-reveal
        from its template-era page fractions into that section's actual
        scroll band on the plate (data-os/data-oe keep the originals so
        resize re-maps idempotently).
   Rebuilds on resize and after fonts load. Engine machinery does the
   actual drawing — this module only computes geometry and re-arms it.
   ========================================================================= */
(function(){
  const ANCHORS = {
    home:        '.hero .callnum',
    architecture:'.arch-head .ttl',
    projects:    '.proj-head .ttl',
    writing:     '.wr-head .ttl',
    about:       '.ab-head .callnum',
    work:        '.wk-head .ttl',
    contact:     '.ct-title'
  };
  let svg=null, built=false;

  function pageEl(){ return document.getElementById('page'); }
  function docY(el){ const r=el.getBoundingClientRect(); return r.top + (window.scrollY||document.documentElement.scrollTop); }
  function docX(el){ const r=el.getBoundingClientRect(); return r.left + (window.scrollX||0) + r.width/2; }

  function collectAnchors(){
    const pts=[];
    document.querySelectorAll('.plate-sec').forEach(sec=>{
      const selector = ANCHORS[sec.dataset.sec];
      const el = selector ? sec.querySelector(selector) : null;
      const target = el || sec;
      pts.push({ sec:sec.dataset.sec, x:docX(target), y:docY(target) + (el?el.getBoundingClientRect().height/2:80) });
    });
    return pts;
  }

  // remap a template-era fraction into the section's band of the plate
  function remapSectionScrollHooks(H, vh){
    const max = Math.max(1, H - vh);
    document.querySelectorAll('.plate-sec').forEach(sec=>{
      const top = docY(sec), bot = top + sec.offsetHeight;
      const s0 = Math.min(1, Math.max(0, (top - vh*0.7)/max));
      const s1 = Math.min(1, Math.max(0, (bot - vh*0.35)/max));
      sec.querySelectorAll('.scroll-draw').forEach(p=>{
        if(p.closest('#plateSpine')) return;
        if(!p.dataset.os){ p.dataset.os = p.dataset.s ?? '0'; p.dataset.oe = p.dataset.e ?? '1'; }
        const os=parseFloat(p.dataset.os), oe=parseFloat(p.dataset.oe);
        p.dataset.s = (s0 + os*(s1-s0)).toFixed(4);
        p.dataset.e = (s0 + oe*(s1-s0)).toFixed(4);
      });
      sec.querySelectorAll('[data-scroll-reveal]').forEach(el=>{
        if(el.closest('#plateSpine')) return;
        if(!el.dataset.or){ el.dataset.or = el.getAttribute('data-scroll-reveal') || '0.5'; }
        const o=parseFloat(el.dataset.or);
        el.setAttribute('data-scroll-reveal', (s0 + o*(s1-s0)).toFixed(4));
      });
    });
  }

  function build(){
    const p = pageEl(); if(!p) return;
    const old = document.getElementById('plateSpine'); if(old) old.remove();
    const W = p.offsetWidth || window.innerWidth;
    const H = p.scrollHeight || p.offsetHeight;
    const vh = window.innerHeight;
    if(H < vh){ window.LB_ENGINE.refreshReveal(); return; }

    const pts = collectAnchors();
    if(pts.length < 2){ window.LB_ENGINE.refreshReveal(); return; }

    // the composed sweep: a single curve threading every section anchor,
    // bowing toward alternating margins between sections (image-8 grammar)
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i];
      const bow = (i%2 ? 0.78 : 0.22) * W;            // alternate the sweep side
      const c1y = a.y + (b.y-a.y)*0.38, c2y = a.y + (b.y-a.y)*0.72;
      d += ` C${((a.x+bow)/2).toFixed(1)},${c1y.toFixed(1)} ${((b.x+bow)/2).toFixed(1)},${c2y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }

    const max = Math.max(1, H - vh);
    const NS='http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS,'svg');
    svg.id='plateSpine'; svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio','none'); svg.setAttribute('aria-hidden','true');
    svg.style.height = H+'px';

    const path = document.createElementNS(NS,'path');
    path.setAttribute('class','spine-path scroll-draw');
    path.setAttribute('d', d);
    path.dataset.s='0.0'; path.dataset.e='0.96';
    svg.appendChild(path);

    pts.forEach((pt,i)=>{
      if(i===0) return; // the hero ignites on its own
      const g = document.createElementNS(NS,'g');
      const reveal = Math.min(1, Math.max(0, (pt.y - vh*0.62)/max));
      g.setAttribute('data-scroll-reveal', reveal.toFixed(4));
      g.style.opacity='0';
      const core = document.createElementNS(NS,'circle');
      core.setAttribute('class','gold-node');
      core.setAttribute('cx',pt.x); core.setAttribute('cy',pt.y); core.setAttribute('r','3.4');
      const ring = document.createElementNS(NS,'circle');
      ring.setAttribute('cx',pt.x); ring.setAttribute('cy',pt.y); ring.setAttribute('r','8.5');
      ring.setAttribute('fill','none'); ring.setAttribute('stroke','var(--gold-dim)'); ring.setAttribute('stroke-width','1');
      g.appendChild(core); g.appendChild(ring);
      svg.appendChild(g);
    });

    p.prepend(svg);
    remapSectionScrollHooks(H, vh);
    window.LB_ENGINE.refreshReveal();
    built=true;
  }

  let rt=null;
  window.addEventListener('resize', ()=>{ if(!built) return; clearTimeout(rt); rt=setTimeout(build, 220); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if(built) build(); });

  window.LB_SPINE = { build };
})();
