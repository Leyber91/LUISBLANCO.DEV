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
  const SHIPPED = 12;   // confirmed live as of the last review ("we are on post 12")

  // n · short title · axis letter(s) for filter · axis label · the post's hook
  const POSTS = [
    {n:1,  t:"intelligence isn't the model", ax:"P",  axn:"path",                  hook:"The hard part was never the model. It's the system you wire around it — that's where intelligence actually lives."},
    {n:2,  t:"the framework runs",           ax:"A",  axn:"abstraction",           hook:"Two weeks after saying the work is the program around the model, the program runs. 60 ticks, spec unchanged."},
    {n:3,  t:"the model isn't the variable", ax:"P",  axn:"path",                  hook:"Everyone argues which model is strongest. The bill at month-end watches a different number — the shape around it."},
    {n:4,  t:"multiplicity",                 ax:"M",  axn:"multiplicity",          hook:"More AI isn't better AI. Two models that agree teach nothing — divergence is the value."},
    {n:5,  t:"abstraction",                  ax:"A",  axn:"abstraction",           hook:"A chatbot composes with nothing. The systems that matter compose with what they built themselves."},
    {n:6,  t:"prompting",                    ax:"R",  axn:"prompting",             hook:"Everyone optimizes the prompt. Almost nobody asks what builds the prompt."},
    {n:7,  t:"async",                        ax:"S",  axn:"async",                 hook:"Most async systems are lockstep with a shorter wait. The axis isn't speed — it's what coherence costs."},
    {n:8,  t:"the full map",                 ax:"PMARS", axn:"all five axes",      hook:"“Agentic” is a yes/no question. The map turns it into a coordinate."},
    {n:9,  t:"what an agent actually is",    ax:"P",  axn:"path",                  hook:"The word “agent” does two different jobs. The gap between them is where the disappointment lives."},
    {n:10, t:"Cursor vs Claude Code",        ax:"RA", axn:"prompting · abstraction", hook:"Same loop at the start. Then they spend their effort in different places — on different axes."},
    {n:11, t:"MCP, located",                 ax:"A",  axn:"abstraction",           hook:"MCP is USB for tools — a calibration on the abstraction axis, not new physics."},
    {n:12, t:"crystallization",              ax:"A",  axn:"abstraction",           hook:"A skill is a function with a label the system can call again. The interesting question is who writes it."},
    {n:13, t:"automation vs autonomy",       ax:"P",  axn:"path",                  hook:"A scheduled script runs without you — that's automation. Autonomy is a loop that watches itself."},
    {n:14, t:"RAG, located",                 ax:"RA", axn:"prompting + abstraction", hook:"RAG is two moves on two axes at once — which is exactly why it breaks in two different ways."},
    {n:15, t:"fine-tuning is off-map",       ax:"-",  axn:"off the map",           hook:"Fine-tuning isn't on my map. That's not a gap in the map — that's the point of it."},
    {n:16, t:"the ten seeds",                ax:"PMARS", axn:"all",                hook:"The smallest set of parts a system needs before it can run itself — indefinitely, with no one watching."},
    {n:17, t:"three mechanics + a meta",     ax:"PMARS", axn:"all",                hook:"Crystallize, flexibilize, self-version — and one that watches and decides which fires."},
    {n:18, t:"four operations",              ax:"PMARS", axn:"all",                hook:"Mechanics are how the system moves. Operations are how it becomes something it wasn't."},
    {n:19, t:"the innovation layer",         ax:"PMARS", axn:"all",                hook:"The deepest part isn't the part that acts — it's the part that notices the current shape is wrong."},
    {n:20, t:"three load-bearing principles",ax:"PMARS", axn:"all",                hook:"Emergence over imposition · restorable coherence · operator-observable time."},
    {n:21, t:"proposing isn't acting",       ax:"A",  axn:"abstraction",           hook:"The hardest gap is between proposing a change and making it. Most systems stop at the first half."},
    {n:22, t:"it picks its own model",       ax:"R",  axn:"prompting",             hook:"It benchmarks every local model, persists a capability matrix, and scores by role — not by hardcoding."},
    {n:23, t:"it runs its own infra",        ax:"PS", axn:"path · async",     hook:"A daemon probes, purges, and restarts the server. 20.91 hours unattended, zero operator interventions."},
    {n:24, t:"what broke",                   ax:"PMARS", axn:"all",                hook:"Twenty-three posts on a framework that works. This one is about the five times it didn't."},
    {n:25, t:"39 versions, one spec",        ax:"PMARS", axn:"all",                hook:"Thirty-nine versions. One specification. The implementation caught up; the spec never moved."},
    {n:26, t:"the primordial seed",          ax:"PMARS", axn:"all",                hook:"None of it came from nowhere. Every piece has an older name in an older field."},
  ];

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
