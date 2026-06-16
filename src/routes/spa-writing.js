/* =========================================================================
   spa-writing.js — the writing series as a HORIZONTAL, scrubbable timeline.
   Only a portion is in frame; the ends diffuminate as they leave (CSS mask).
   Drag or wheel to travel it. Filter by axis dims off-axis posts. Posts are
   real (titles + hooks extracted from the series); dates/URLs stay honest —
   shipped posts link to the LinkedIn profile, upcoming ones don't.

   Built from data (codebase idiom). window.LB_WRITING.init(scope).
   ========================================================================= */
(function(){
  "use strict";
  const LI = 'https://www.linkedin.com/in/luisblancorodriguez/';
  // content lives in src/data/writing-posts.js (window.LB_WRITING_DATA)
  const DATA = window.LB_WRITING_DATA || { shipped: 0, posts: [] };
  const SHIPPED = DATA.shipped;
  const POSTS = DATA.posts;

  function init(scope){
    if(!scope) return;
    // mobile: the horizontal scrub timeline (drag + hover) becomes a vertical, tappable
    // list with the hook inline — natural page scroll, no hover dependency. Desktop unchanged.
    const MOB = window.matchMedia('(max-width:760px),(pointer:coarse)').matches;
    const track = scope.querySelector('#wrTrack');
    const tl    = scope.querySelector('#wrTimeline');
    const readout = scope.querySelector('#wrReadout');
    if(!track || !tl) return;
    track.innerHTML = '';
    if(MOB) tl.classList.add('wr-mob');

    POSTS.forEach((p,i)=>{
      const shipped = p.n <= SHIPPED;
      const drafting = p.n === SHIPPED + 1;
      const dir = (i % 2 === 0) ? 'up' : 'down';
      const cell = document.createElement(shipped ? 'a' : 'div');
      cell.className = 'wr-post ' + dir + ' ' + (shipped ? 'shipped' : 'queued') + (drafting ? ' drafting' : '');
      cell.dataset.ax = p.ax;
      cell.dataset.n = p.n;
      if(shipped){ cell.href = LI; cell.target = '_blank'; cell.rel = 'noopener'; }
      cell.innerHTML =
        '<div class="wr-card surface-line">'+
          '<div class="wr-card-top"><span class="wr-num">P'+p.n+'</span>'+
            (shipped ? '<span class="wr-state">shipped ↗</span>' : (drafting ? '<span class="wr-state draft">drafting</span>' : '<span class="wr-state">queued</span>'))+
          '</div>'+
          '<div class="wr-title">'+p.t+'</div>'+
          '<div class="wr-ax">'+p.axn+'</div>'+
          '<div class="wr-hook">'+p.hook+'</div>'+
        '</div>'+
        (MOB ? '' : '<span class="wr-stem"></span><span class="wr-node"></span>');
      if(!MOB){   // desktop: hook surfaces in the readout on hover/focus
        const show = ()=>{ if(readout) readout.innerHTML = '<b>P'+p.n+'</b> · '+p.axn+' &nbsp;—&nbsp; '+p.hook; cell.classList.add('hot'); };
        const hide = ()=>{ cell.classList.remove('hot'); };
        cell.addEventListener('mouseenter', show);
        cell.addEventListener('mouseleave', hide);
        cell.addEventListener('focus', show);
      }
      track.appendChild(cell);
    });

    // ── drag-to-scrub + wheel → horizontal (desktop only; mobile uses native vertical scroll) ──
    if(!MOB){
      let down=false, sx=0, sl=0, moved=0;
      tl.addEventListener('pointerdown', e=>{ down=true; moved=0; sx=e.clientX; sl=tl.scrollLeft; tl.classList.add('dragging'); tl.setPointerCapture(e.pointerId); });
      tl.addEventListener('pointermove', e=>{ if(!down) return; const dx=e.clientX-sx; moved+=Math.abs(dx); tl.scrollLeft = sl - dx; });
      const end = ()=>{ down=false; tl.classList.remove('dragging'); };
      tl.addEventListener('pointerup', end);
      tl.addEventListener('pointercancel', end);
      // a real drag suppresses the click-through to LinkedIn
      tl.addEventListener('click', e=>{ if(moved>6){ e.preventDefault(); e.stopPropagation(); } }, true);
      tl.addEventListener('wheel', e=>{ const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if(d){ tl.scrollLeft += d; e.preventDefault(); } }, {passive:false});
    }

    // ── axis filter ──
    const chips = [...scope.querySelectorAll('#wrFilters .fchip')];
    chips.forEach(ch=> ch.addEventListener('click', ()=>{
      chips.forEach(c=>c.classList.remove('active')); ch.classList.add('active');
      const f = ch.dataset.filter;
      [...track.children].forEach(cell=>{
        const on = (f==='all') || (cell.dataset.ax||'').includes(f);
        cell.classList.toggle('dim', !on);
      });
    }));

    // start the view a touch in, so the left edge clearly diffuminates
    requestAnimationFrame(()=>{ tl.scrollLeft = 0; });
  }

  window.LB_WRITING = { init };
})();
