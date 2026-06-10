/* =========================================================================
   spa-tweaks.js — the ONE master Tweaks panel that governs the whole site.
   Controls: substrate drift (home / interior multipliers) · page transition
   speed · glyph behavior (focal / docked / auto) · motion master · reduced-
   motion preview · RESET TO SPEC. Persists to localStorage('lb_tweaks_master')
   and applies live. Hidden until toggled from the host toolbar.
   ========================================================================= */
(function(){
  const LB = window.LB;
  const SPEC = { driftHome:40, driftInterior:20, transition:1.0, glyphMode:'auto', motionOn:true, reducedPreview:false };
  let tw = Object.assign({}, SPEC);
  try{ Object.assign(tw, JSON.parse(localStorage.getItem('lb_tweaks_master')||'{}')); }catch(e){}

  function curRoute(){ return document.body.getAttribute('data-route')||'home'; }
  function persist(){ try{ localStorage.setItem('lb_tweaks_master', JSON.stringify(tw)); }catch(e){}
    try{ window.parent.postMessage({ type:'__edit_mode_set_keys', edits:tw }, '*'); }catch(e){} }

  function applyAll(){
    LB.driftHome=tw.driftHome; LB.driftInterior=tw.driftInterior;
    LB.transition=tw.transition; LB.glyphMode=tw.glyphMode;
    LB.motionOn=tw.motionOn; LB.reducedPreview=tw.reducedPreview;
    const route=curRoute();
    LB.motionScale = 1 + ((route==='home'?tw.driftHome:tw.driftInterior)/100)*7;
    document.documentElement.classList.toggle('reduced-motion', tw.reducedPreview);
    if(window.LB_ENGINE){ window.LB_ENGINE.setGlyphMode(route); window.LB_ENGINE.refreshReveal(); }
    if(LB.redrawSubstrate) LB.redrawSubstrate();
  }

  const panel=document.createElement('div'); panel.className='lb-tweaks'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Tweaks');
  panel.innerHTML = `
    <div class="hd"><b>Tweaks</b><span class="x" title="close">✕</span></div>
    <div class="bd">
      <div class="grp">substrate drift</div>
      <div class="row"><label>home intensity <span class="v" id="tHomeV"></span></label>
        <input type="range" id="tHome" min="0" max="100" step="5"></div>
      <div class="row"><label>interior intensity <span class="v" id="tIntV"></span></label>
        <input type="range" id="tInt" min="0" max="100" step="5">
        <div class="hint">the field persists across routes — these set how far it drifts on the home view vs interior pages.</div></div>

      <div class="grp">navigation</div>
      <div class="row"><label>page transition speed <span class="v" id="tTrV"></span></label>
        <input type="range" id="tTr" min="0.5" max="2.5" step="0.1"></div>

      <div class="grp">glyph</div>
      <div class="row"><div class="seg" id="tGlyph" role="radiogroup" aria-label="glyph behavior">
        <button data-v="auto">auto</button><button data-v="focal">focal</button><button data-v="docked">docked</button></div>
        <div class="hint">auto = focal on home, docked on interior. force one to preview the docking.</div></div>

      <div class="grp">motion</div>
      <div class="row toggle"><label for="tMotion">motion master</label><div class="sw" id="tMotion" role="switch" tabindex="0"><i></i></div></div>
      <div class="row toggle"><label for="tReduced">reduced-motion preview</label><div class="sw" id="tReduced" role="switch" tabindex="0"><i></i></div></div>

      <button class="pbtn reset" id="tReset" type="button">reset to spec</button>
    </div>`;

  function add(){ document.body.appendChild(panel); render(); bind(); applyAll(); }
  if(document.readyState!=='loading') add(); else document.addEventListener('DOMContentLoaded', add);

  function render(){
    panel.querySelector('#tHome').value=tw.driftHome; panel.querySelector('#tHomeV').textContent=tw.driftHome;
    panel.querySelector('#tInt').value=tw.driftInterior; panel.querySelector('#tIntV').textContent=tw.driftInterior;
    panel.querySelector('#tTr').value=tw.transition; panel.querySelector('#tTrV').textContent=tw.transition.toFixed(1)+'×';
    panel.querySelectorAll('#tGlyph button').forEach(b=> b.classList.toggle('on', b.getAttribute('data-v')===tw.glyphMode));
    panel.querySelector('#tMotion').classList.toggle('on', tw.motionOn);
    panel.querySelector('#tReduced').classList.toggle('on', tw.reducedPreview);
  }
  function bind(){
    const home=panel.querySelector('#tHome'), int=panel.querySelector('#tInt'), tr=panel.querySelector('#tTr');
    home.addEventListener('input',()=>{ tw.driftHome=+home.value; panel.querySelector('#tHomeV').textContent=tw.driftHome; applyAll(); persist(); });
    int.addEventListener('input',()=>{ tw.driftInterior=+int.value; panel.querySelector('#tIntV').textContent=tw.driftInterior; applyAll(); persist(); });
    tr.addEventListener('input',()=>{ tw.transition=+tr.value; panel.querySelector('#tTrV').textContent=tw.transition.toFixed(1)+'×'; applyAll(); persist(); });
    panel.querySelectorAll('#tGlyph button').forEach(b=> b.addEventListener('click',()=>{ tw.glyphMode=b.getAttribute('data-v'); render(); applyAll(); persist(); }));
    const flip=(key,sw)=>{ tw[key]=!tw[key]; sw.classList.toggle('on',tw[key]); applyAll(); persist(); };
    const mo=panel.querySelector('#tMotion'), rd=panel.querySelector('#tReduced');
    mo.addEventListener('click',()=>flip('motionOn',mo));
    mo.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flip('motionOn',mo); } });
    rd.addEventListener('click',()=>flip('reducedPreview',rd));
    rd.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flip('reducedPreview',rd); } });
    panel.querySelector('#tReset').addEventListener('click',()=>{ tw=Object.assign({},SPEC); render(); applyAll(); persist(); });
    panel.querySelector('.x').addEventListener('click',()=>{ panel.classList.remove('open');
      try{ window.parent.postMessage({ type:'__edit_mode_dismissed' }, '*'); }catch(e){} });
    // drag
    const hd=panel.querySelector('.hd'); let sx,sy,ox,oy,drag=false;
    hd.addEventListener('mousedown',e=>{ if(e.target.classList.contains('x'))return; drag=true; sx=e.clientX; sy=e.clientY;
      const r=panel.getBoundingClientRect(); ox=r.left; oy=r.top; e.preventDefault(); });
    window.addEventListener('mousemove',e=>{ if(!drag)return; panel.style.left=(ox+e.clientX-sx)+'px'; panel.style.top=(oy+e.clientY-sy)+'px'; panel.style.right='auto'; });
    window.addEventListener('mouseup',()=>drag=false);
  }

  window.addEventListener('message',e=>{ const t=e&&e.data&&e.data.type;
    if(t==='__activate_edit_mode') panel.classList.add('open');
    else if(t==='__deactivate_edit_mode') panel.classList.remove('open'); });
  try{ window.parent.postMessage({ type:'__edit_mode_available' }, '*'); }catch(e){}
})();
