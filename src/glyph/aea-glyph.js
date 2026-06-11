/* =========================================================================
   aea-glyph.js — the AEA figure as a 3D dust-pentagon.
   Replaces the static nested-cube SVG inside .glyph with a canvas: five axes
   (P·M·A·R·S) as a pentagon, five concentric level-rings (L1→L5), and a few
   relationship chords — every EDGE drawn as a flowing stream of sharp gold
   dust, the whole lattice tilted and slowly turning in 3D. Keeps the glyph's
   halo, caption and click behavior intact. Honors LB.motionOn / reduced-motion.
   Self-contained IIFE → window.LB_GLYPH.
   ========================================================================= */
(function(){
  "use strict";
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CFG = {
    AXES: 5, LEVELS: 5,
    R: 0.92,                 // outer radius as fraction of the half-box
    tilt: 0.80,              // X-tilt (radians) — pentagon reads frontally, still 3D
    spin: 0.00024,           // turntable speed (radians / ms)
    perEdge: { spoke: 32, ring: 58, chord: 36 },   // denser = more defined
    GOLD: [212,162,76], AMBER:[245,205,128], INK:[150,170,205],
    INTERNAL: 260,           // canvas internal resolution (CSS scales to box)
  };

  let canvas, ctx, host, W, H, cx, cy, scale, dpr;
  let nodes = [], edges = [], parts = [];
  let raf = 0, t0 = 0, running = false, mounted = false, settled = false;

  // ── geometry — a flat pentagon lattice in the XY plane (z=0) ──────────────
  function axisAngle(a){ return -Math.PI/2 + a * (2*Math.PI/CFG.AXES); }
  function levelR(l){ return CFG.R * (l / CFG.LEVELS); }          // L1 inner … L5 outer
  function node(a,l){ const t=axisAngle(a), r=levelR(l); return [Math.cos(t)*r, Math.sin(t)*r, 0]; }

  function buildGeometry(){
    nodes = []; edges = [];
    const N = (a,l)=> node(((a%CFG.AXES)+CFG.AXES)%CFG.AXES, l);
    const center = [0,0,0];
    // spokes: center → L1 → … → L5, per axis (the level ladder)
    for(let a=0;a<CFG.AXES;a++){
      let prev = center;
      for(let l=1;l<=CFG.LEVELS;l++){ const cur=N(a,l); edges.push({a:prev,b:cur,kind:'spoke'}); prev=cur; }
    }
    // rings: connect the five axes at each level (concentric pentagons)
    for(let l=1;l<=CFG.LEVELS;l++)
      for(let a=0;a<CFG.AXES;a++) edges.push({a:N(a,l), b:N(a+1,l), kind:'ring'});
    // relationships: outer pentagram (every 2nd vertex) + a few inner cross-links
    for(let a=0;a<CFG.AXES;a++) edges.push({a:N(a,5), b:N(a+2,5), kind:'chord'});
    for(let a=0;a<CFG.AXES;a++) edges.push({a:N(a,3), b:N(a+1,5), kind:'chord'});
    // node markers (axis × level) for the brighter glow points
    for(let a=0;a<CFG.AXES;a++) for(let l=1;l<=CFG.LEVELS;l++) nodes.push(N(a,l));
    nodes.push(center);
  }

  function buildParticles(){
    parts = [];
    for(const e of edges){
      const dx=e.b[0]-e.a[0], dy=e.b[1]-e.a[1], dz=e.b[2]-e.a[2];
      const len = Math.hypot(dx,dy,dz) || 0.001;
      const k = Math.max(6, Math.round(CFG.perEdge[e.kind] * (0.4 + len)));
      for(let i=0;i<k;i++){
        // deterministic-ish spread without Math.random at module load
        const seed = (i*0.6180339887 + edges.indexOf(e)*0.13) % 1;
        parts.push({
          e, t: seed,
          spd: 0.10 + seed*0.16,                 // flow speed along the edge
          ja: seed*Math.PI*2, js: 0.6 + seed*1.4, // jitter phase / speed
          amp: 0.0035 + seed*0.008,               // tighter jitter — defined but still dusty
          warm: e.kind==='chord' ? 1.0 : (e.kind==='ring' ? 0.7 : 0.5),
          sz: 0.7 + seed*0.9,
        });
      }
    }
  }

  // ── 3D rotate (tilt about X, turntable about Y) + orthographic project ────
  function rot(p, spin){
    // tilt about X
    let y = p[1]*Math.cos(CFG.tilt) - p[2]*Math.sin(CFG.tilt);
    let z = p[1]*Math.sin(CFG.tilt) + p[2]*Math.cos(CFG.tilt);
    let x = p[0];
    // turntable about Y
    const x2 = x*Math.cos(spin) + z*Math.sin(spin);
    const z2 = -x*Math.sin(spin) + z*Math.cos(spin);
    return [x2, y, z2];
  }
  function project(p, spin){
    const r = rot(p, spin);
    const persp = 1 + r[2]*0.18;                 // mild depth scale
    return { x: cx + r[0]*scale*persp, y: cy + r[1]*scale*persp, depth: r[2] };
  }

  // ── draw ──────────────────────────────────────────────────────────────────
  function dot(x,y,rad,col,alpha){
    const g = ctx.createRadialGradient(x,y,0,x,y,rad);
    g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
    g.addColorStop(0.28, `rgba(${col[0]},${col[1]},${col[2]},${alpha*0.30})`);  // tight core (sharper)
    g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
  }
  function lerp3(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

  function render(now){
    const spin = now * CFG.spin;
    ctx.clearRect(0,0,W,H);
    ctx.globalCompositeOperation = 'lighter';     // additive glow

    // flowing dust along every edge
    for(const p of parts){
      const e=p.e;
      const base = lerp3(e.a, e.b, p.t);
      // perpendicular-ish jitter (cheap: offset in XY by a rotating vector)
      const j = Math.sin(p.ja + now*0.001*p.js) * p.amp;
      const pos = [ base[0]+j*0.7, base[1]-j*0.7, base[2] ];
      const s = project(pos, spin);
      const df = 0.6 + (s.depth+0.9)*0.5;          // nearer = brighter/bigger
      const col = e.kind==='chord' ? CFG.AMBER : CFG.GOLD;   // chords amber accent, rest gold
      const szk = e.kind==='ring' ? 1.05 : 0.85;             // rings bolder → the pentagons read
      dot(s.x, s.y, (p.sz*df*2.0*szk+0.5), col, 0.24*df);
    }

    // node glow points (axis × level)
    const pulse = 0.7 + 0.3*Math.sin(now*0.002);
    for(const n of nodes){
      const s = project(n, spin);
      const df = 0.6 + (s.depth+0.9)*0.5;
      dot(s.x, s.y, 2.6*df, CFG.AMBER, 0.85*pulse*df);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── loop ───────────────────────────────────────────────────────────────────
  function step(now){
    if(!running) return;
    const reduced = sysReduced || LB.reducedPreview;
    if(!LB.motionOn || reduced){ if(!settled){ render(t0); settled=true; } raf=requestAnimationFrame(step); return; }
    settled = false;
    const dt = Math.min((now - (step._l||now)), 50); step._l = now;
    for(const p of parts){ p.t += p.spd * dt/1000; if(p.t>1) p.t -= 1; }
    render(now - t0);
    raf = requestAnimationFrame(step);
  }

  // ── mount: swap the cube SVG for our canvas, keep halo + caption ──────────
  function sizeCanvas(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = CFG.INTERNAL*dpr; H = CFG.INTERNAL*dpr;
    canvas.width = W; canvas.height = H;
    cx = W/2; cy = H/2; scale = (W/2)*0.82;
  }
  function attach(){
    host = document.querySelector('.glyph'); if(!host) return false;
    const svg = host.querySelector('svg'); if(svg) svg.remove();     // retire the cube
    canvas = document.createElement('canvas'); canvas.className = 'glyph-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;';
    const cap = host.querySelector('.glyph-caption');
    host.insertBefore(canvas, cap || null);
    ctx = canvas.getContext('2d');
    sizeCanvas();
    buildGeometry(); buildParticles();
    window.addEventListener('resize', ()=>{ if(canvas) sizeCanvas(); }, false);
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) pause(); else resume(); }, false);
    mounted = true; t0 = performance.now(); resume();
    return true;
  }
  function pause(){ running=false; if(raf){ cancelAnimationFrame(raf); raf=0; } }
  function resume(){ if(!mounted || running) return; running=true; step._l=0; raf=requestAnimationFrame(step); }

  function boot(){
    // the glyph is injected by the engine on mount — poll briefly for it.
    let tries = 0;
    const iv = setInterval(()=>{
      if(attach() || ++tries > 60){ clearInterval(iv); }
    }, 120);
  }
  window.LB_GLYPH = { boot, pause, resume };
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
