/* =========================================================================
   spa-projects.js — /projects: the triad of build-toward-income demos (each
   driving one number to zero) + a draggable, parallaxed carousel of the proofs
   and the production engineering. Forks labelled as forks; clients never named;
   triad meters are illustrative / synthetic only.

   Router calls window.LB_PROJ.init(scope) after /projects mounts.
   ========================================================================= */
(function(){
  "use strict";
  const reduced = ()=> window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('reduced-motion')
    || (window.LB && window.LB.reducedPreview);

  function fmt(v, dec, prefix, suffix){
    const n = dec>0 ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');
    return prefix + n + suffix;
  }

  // ── triad: animate each metric down toward zero when it scrolls into view ──
  function wireTriad(scope){
    const cards = [...scope.querySelectorAll('.tri-card')];
    if(!cards.length) return;
    const run = (card)=>{
      if(card._ran) return; card._ran = true;
      const from = parseFloat(card.dataset.from), to = parseFloat(card.dataset.to||'0');
      const dec = parseInt(card.dataset.dec||'0',10), pre = card.dataset.prefix||'', suf = card.dataset.suffix||'';
      const valEl = card.querySelector('.tm-val'), bar = card.querySelector('.tm-bar i');
      const RESID = 0.06;   // a sliver remains — honest "toward zero", never a perfect 0 bar
      if(reduced()){ if(valEl) valEl.textContent = fmt(to,dec,pre,suf); if(bar) bar.style.width = (RESID*100)+'%'; return; }
      const dur = 1700; let t0 = null;
      if(bar){ bar.style.width = '100%'; }
      const ease = x => 1 - Math.pow(1-x, 3);
      function step(ts){
        if(t0===null) t0 = ts;
        const k = Math.min(1, (ts - t0)/dur), e = ease(k);
        const v = from + (to - from)*e;
        if(valEl) valEl.textContent = fmt(v,dec,pre,suf);
        if(bar) bar.style.width = (100 - (100-RESID*100)*e) + '%';
        if(k<1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    };
    if(!('IntersectionObserver' in window)){ cards.forEach(run); return; }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(en=>{ if(en.isIntersecting){ run(en.target); io.unobserve(en.target); } });
    }, { threshold:0.4 });
    cards.forEach(c=> io.observe(c));
  }

  // ── carousel: drag-scrub + arrows + dots + parallax background numerals ──
  function wireCarousel(scope){
    const car = scope.querySelector('#projCarousel');
    const track = scope.querySelector('#pcTrack');
    if(!car || !track) return;
    const cards = [...track.children];
    const dotsWrap = scope.querySelector('#pcDots');

    // dots
    if(dotsWrap){ dotsWrap.innerHTML = cards.map((_,i)=>'<button class="pc-dot" data-i="'+i+'" aria-label="card '+(i+1)+'"></button>').join(''); }
    const dots = dotsWrap ? [...dotsWrap.children] : [];

    const cardW = ()=> cards[0] ? cards[0].getBoundingClientRect().width + 18 : 320;
    const idx = ()=> Math.round(car.scrollLeft / cardW());
    function syncDots(){ const i = idx(); dots.forEach((d,k)=> d.classList.toggle('on', k===i)); }

    // parallax: shift each card's background numeral against its distance from centre
    function parallax(){
      const cc = car.getBoundingClientRect().left + car.clientWidth/2;
      cards.forEach(c=>{
        const r = c.getBoundingClientRect(); const center = r.left + r.width/2;
        const d = (center - cc);
        const bg = c.querySelector('.pc-bg'); if(bg) bg.style.transform = 'translateX('+(-d*0.07).toFixed(1)+'px)';
        c.classList.toggle('focus', Math.abs(d) < r.width*0.55);
      });
    }
    let ticking = false;
    car.addEventListener('scroll', ()=>{ if(!ticking){ ticking = true; requestAnimationFrame(()=>{ parallax(); syncDots(); ticking=false; }); } });

    // drag-to-scrub
    let down=false, sx=0, sl=0, moved=0;
    car.addEventListener('pointerdown', e=>{ down=true; moved=0; sx=e.clientX; sl=car.scrollLeft; car.classList.add('dragging'); car.setPointerCapture(e.pointerId); });
    car.addEventListener('pointermove', e=>{ if(!down) return; const dx=e.clientX-sx; moved+=Math.abs(dx); car.scrollLeft = sl - dx; });
    const end = ()=>{ down=false; car.classList.remove('dragging'); };
    car.addEventListener('pointerup', end); car.addEventListener('pointercancel', end);
    car.addEventListener('click', e=>{ if(moved>6){ e.preventDefault(); e.stopPropagation(); } }, true);
    car.addEventListener('wheel', e=>{ const d = Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY; if(d){ car.scrollLeft += d; e.preventDefault(); } }, {passive:false});

    // arrows + dots
    scope.querySelectorAll('.pc-arrow').forEach(b=> b.addEventListener('click', ()=>{
      const dir = parseInt(b.dataset.dir,10);
      car.scrollTo({ left: car.scrollLeft + dir*cardW(), behavior: reduced()?'auto':'smooth' });
    }));
    dots.forEach(d=> d.addEventListener('click', ()=>{
      car.scrollTo({ left: parseInt(d.dataset.i,10)*cardW(), behavior: reduced()?'auto':'smooth' });
    }));

    requestAnimationFrame(()=>{ parallax(); syncDots(); });
    window.addEventListener('resize', ()=>{ parallax(); syncDots(); });
  }

  function init(scope){
    scope = scope || document.querySelector('.plate-sec[data-sec="projects"]') || document;
    wireTriad(scope);
    wireCarousel(scope);
  }

  window.LB_PROJ = { init, redraw(){}, teardown(){} };
})();
