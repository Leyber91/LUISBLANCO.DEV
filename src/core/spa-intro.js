/* =========================================================================
   spa-intro.js — first-visit assembly director. Plays ONCE over the persistent
   substrate (it does NOT build its own starfield — spa-substrate.js is already
   running underneath). Constructs the AEA mark (5 axes · level dots · seeds),
   ignites it gold ("seeding entity"), settles, then fades and hands off to the
   home hero via the completion callback. Skippable; gated by the router.
   ========================================================================= */
(function(){
  const SVGNS='http://www.w3.org/2000/svg';
  function el(tag, attrs, parent){ const e=document.createElementNS(SVGNS,tag);
    for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; }

  const AXES=[{code:'P',name:'path'},{code:'M',name:'multiplicity'},{code:'A',name:'abstraction'},{code:'R',name:'prompting'},{code:'S',name:'async'}];
  const COLX=[44,108,172,236,300], CIRCLE_CY=42, CIRCLE_R=14, NAME_Y=64;
  const STRUT_TOP=80, STRUT_BOT=206, DOT_Y=[90,117,144,171,198], SEED_Y=220;
  let dotsByLevel=[], built=false;

  function buildMark(){
    const mark=document.getElementById('introMark'); if(!mark) return;
    while(mark.firstChild) mark.removeChild(mark.firstChild);
    dotsByLevel=[];
    const seedG=el('g',{'class':'seeds'},mark);
    for(let lvl=0; lvl<DOT_Y.length; lvl++){
      const y=DOT_Y[lvl];
      for(let i=0;i<COLX.length-1;i++){
        const x1=COLX[i]+4, x2=COLX[i+1]-4, mx=(x1+x2)/2, bow=(lvl%2===0?-5:5);
        el('path',{'class':'seed-conn', d:'M '+x1+' '+y+' Q '+mx+' '+(y+bow)+' '+x2+' '+y}, seedG);
      }
    }
    for(let L=0;L<DOT_Y.length;L++) dotsByLevel[L]=[];
    AXES.forEach((ax,i)=>{
      const x=COLX[i];
      const g=el('g',{'class':'axis','data-axis':ax.code},mark);
      const strut=el('line',{'class':'strut',x1:x,y1:STRUT_TOP,x2:x,y2:STRUT_BOT},g);
      strut.style.setProperty('--l',(STRUT_BOT-STRUT_TOP));
      for(let d=0; d<DOT_Y.length; d++){
        el('text',{'class':'level-label',x:(x-9),y:(DOT_Y[d]+3)},g).textContent='L'+(d+1);
        dotsByLevel[d].push(el('circle',{'class':'dot',cx:x,cy:DOT_Y[d],r:3},g));
      }
      el('circle',{'class':'code-circle',cx:x,cy:CIRCLE_CY,r:CIRCLE_R},g);
      el('text',{'class':'code-letter',x:x,y:(CIRCLE_CY+5)},g).textContent=ax.code;
      el('text',{'class':'axis-name',x:x,y:NAME_Y},g).textContent=ax.name;
    });
    const sg=el('g',{},mark);
    el('line',{'class':'seed-line',x1:COLX[0],y1:SEED_Y,x2:COLX[COLX.length-1],y2:SEED_Y},sg);
    COLX.forEach(x=> el('circle',{'class':'seed-marker',cx:x,cy:SEED_Y,r:2},sg));
    el('text',{'class':'annot',x:172,y:240},mark).textContent='5 axes · 10 seeds · 3 mechanics';
    el('text',{'class':'annot-c',x:316,y:222},mark).textContent='AEA';

    // orbit rings near the focal point
    const orb=document.getElementById('introOrbits');
    if(orb){ while(orb.firstChild) orb.removeChild(orb.firstChild);
      let s=7; const rand=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
      [150,205,255].forEach(r=>{ el('circle',{'class':'ring',cx:280,cy:280,r:r},orb);
        const n=r>200?3:2; for(let i=0;i<n;i++){ const a=rand()*Math.PI*2, gold=rand()>0.78;
          el('circle',{'class':'starlet'+(gold?' gold':''),cx:(280+Math.cos(a)*r).toFixed(1),cy:(280+Math.sin(a)*r).toFixed(1),r:gold?1.8:1.3},orb); } });
    }
    built=true;
  }

  function play(done){
    const intro=document.getElementById('intro');
    if(!intro){ done&&done(); return; }
    if(!built) buildMark();
    const statusText=document.getElementById('introStatusText');
    const status=document.getElementById('introStatus');
    const skip=document.getElementById('introSkip');
    const STAGES=['grid-drawn','glyph-in','glyph-built','glyph-gold','orbit-in','settle','ready-in'];
    STAGES.forEach(c=>intro.classList.remove(c));
    let timers=[], finished=false;
    function setStatus(t, ready){ if(statusText) statusText.textContent=t; if(status){ status.classList.toggle('ready',!!ready); status.classList.add('on'); } }
    function at(sec, fn){ timers.push(setTimeout(fn, sec*1000)); }
    function clearAll(){ timers.forEach(clearTimeout); timers=[]; }

    intro.classList.add('on');
    if(skip) skip.classList.add('on');
    setStatus('initializing substrate');

    at(0.5, ()=>{ intro.classList.add('glyph-in'); setStatus('establishing orbits'); });
    at(1.1, ()=>{ intro.classList.add('orbit-in'); });
    at(1.4, ()=>{ intro.classList.add('glyph-built');
      dotsByLevel.forEach((row,L)=> timers.push(setTimeout(()=> row.forEach(d=>d.classList.add('in')), 180+120*L))); });
    at(2.5, ()=>{ intro.classList.add('glyph-gold'); setStatus('seeding entity'); });
    at(3.4, ()=>{ intro.classList.remove('glyph-gold'); intro.classList.add('settle'); });
    at(4.1, ()=>{ setStatus('ready.', true); intro.classList.add('ready-in'); if(skip) skip.classList.remove('on'); });
    at(4.9, ()=> finish());

    function finish(){
      if(finished) return; finished=true;
      clearAll();
      try{ localStorage.setItem('lbr_seen_intro','1'); }catch(e){}
      intro.classList.add('fade');
      setTimeout(()=>{ intro.classList.remove('on','fade'); intro.setAttribute('aria-hidden','true'); done&&done(); }, 620);
    }
    function doSkip(){ setStatus('ready.', true); finish(); }
    if(skip) skip.addEventListener('click', doSkip, { once:true });
    const onAny=()=>doSkip();
    window.addEventListener('wheel', onAny, { once:true, passive:true });
    window.addEventListener('touchstart', onAny, { once:true, passive:true });
    window.addEventListener('keydown', e=>{ if(e.key==='Tab') return; doSkip(); }, { once:true });
  }

  window.LB_INTRO = { play };
})();
