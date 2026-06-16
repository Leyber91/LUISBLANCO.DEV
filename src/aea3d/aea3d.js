/* =========================================================================
   aea3d.js — the AEA as a native-WebGL structure. CLEAN BY DEFAULT: five axis
   columns + level dots + the one lit (proven) rung in gold. Turn on a layer
   (placements / seeds / mechanics / ops / links) to go deeper on demand, or
   hover an axis to reveal that axis's levels and real-world placements.

   No frameworks, no Three.js — custom shaders, gl.LINES + gl.POINTS, HTML
   labels projected from 3D via the MVP. Builds its own DOM inside the mount.
   Fails soft to a static notice if WebGL is unavailable.

   window.LB_AEA3D = { init(mountEl), pause, resume }. Honors LB.motionOn /
   prefers-reduced-motion (no auto-rotate; one settled frame).
   ========================================================================= */
(function(){
  'use strict';
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── canonical AEA framework data — content lives in src/data/aea-framework.js ──
  const _D = window.LB_AEA || {AX:[],SEEDS:[],MECH:[],OPS:[],PREREQ:[]};
  const AX=_D.AX, SEEDS=_D.SEEDS, MECH=_D.MECH, OPS=_D.OPS, PREREQ=_D.PREREQ;

  const INK=[.918,.941,.984],DIM=[.624,.702,.839],FAINT=[.337,.365,.447],GOLD=[.831,.635,.298],GHI=[.941,.776,.455];
  const col=(c,a)=>[c[0],c[1],c[2],a];
  const RP=2.05,RS=3.45,RM=2.9,ROP=4.2,Y0=-3.0,DY=0.92;   // longer columns: taller per-level spacing, recentred
  const axAng=AX.map((_,i)=>-Math.PI/2+i*2*Math.PI/5),colXZ=axAng.map(t=>[RP*Math.cos(t),RP*Math.sin(t)]);
  const Yof=n=>Y0+n*DY,axById={};AX.forEach((a,i)=>axById[a.key]=i);
  const CROWN=Yof(7)+0.35, GROUND=Y0-1.7;   // the axes hang from a crown ring; a ground plane sits below
  const nodePos=(k,n)=>{const i=axById[k],[x,z]=colXZ[i];return[x,Yof(n),z];};
  const seedXZ=SEEDS.map((_,j)=>{const t=-Math.PI/2+j*2*Math.PI/10;return[RS*Math.cos(t),RS*Math.sin(t)];});
  const seedPos=SEEDS.map((_,j)=>[seedXZ[j][0],Y0-0.85,seedXZ[j][1]]);
  const mechAng=[0.4,2.0,3.7,5.2],mechY=[Yof(2),Yof(2),Yof(4.4),Yof(5.6)];
  const mechPos=MECH.map((_,k)=>[RM*Math.cos(mechAng[k]),mechY[k],RM*Math.sin(mechAng[k])]);
  const opPos=OPS.map((_,k)=>{const t=k*2*Math.PI/4+Math.PI/4;return[ROP*Math.cos(t),Yof(7)+0.3,ROP*Math.sin(t)];});

  // ── geometry, split into layers ──
  function L(){return {line:[],point:[]};}
  const G={base:L(),seeds:L(),mechanics:L(),ops:L(),links:L()};
  const push=(g,k,p,c,s)=>{ if(k==='line')g.line.push(p[0],p[1],p[2],c[0],c[1],c[2],c[3],1); else g.point.push(p[0],p[1],p[2],c[0],c[1],c[2],c[3],s); };
  const seg=(g,a,b,c)=>{push(g,'line',a,c,1);push(g,'line',b,c,1);};
  function curve(g,a,b,lift,c,dash){const ct=[(a[0]+b[0])/2,(a[1]+b[1])/2+lift,(a[2]+b[2])/2],N=16;let pv=a;for(let k=1;k<=N;k++){const t=k/N,u=1-t,p=[u*u*a[0]+2*u*t*ct[0]+t*t*b[0],u*u*a[1]+2*u*t*ct[1]+t*t*b[1],u*u*a[2]+2*u*t*ct[2]+t*t*b[2]];if(!dash||k%2===0)seg(g,pv,p,c);pv=p;}}
  // ── connection model: every edge is registered once (drawn into its layer
  //    AND kept in EDGES for hover/locate highlight). PALETTE LOCKED — white(ink)
  //    = structural prerequisite, gold = active flow (mechanism / enable);
  //    solid = hard, dashed = soft. Type is read off the legend, never by hue. ──
  const EDGES=[];
  const addEdge=(g,a,b,lift,c,dash,kind)=>{ curve(g,a,b,lift,c,dash); EDGES.push({a,b,lift,kind}); };
  const NODES=[];
  AX.forEach((a,i)=>{const[x,z]=colXZ[i],lo=Yof(a.levels[0].n),hi=Yof(a.levels[a.levels.length-1].n);seg(G.base,[x,lo,z],[x,hi,z],col(INK,.34));seg(G.base,[x,hi,z],[x,CROWN,z],col(INK,.08));
   a.levels.forEach(Lv=>{const p=[x,Yof(Lv.n),z];if(Lv.lit){push(G.base,'point',p,col(GOLD,.2),50);push(G.base,'point',p,col(GOLD,.42),26);push(G.base,'point',p,col(GHI,1),15);}else push(G.base,'point',p,col(DIM,.85),8);NODES.push({pos:p,kind:'level',axis:a.key,data:{axis:a.name,n:Lv.n,label:Lv.label,ex:Lv.ex}});});});
  // faint level rings — MARK the vertical distribution: each ring threads the same level across the axes,
  // so the volume reads as measured strata (you can see how tall, and which axes reached which level)
  for(let n=1;n<=5;n++){ const pts=AX.map((a,i)=> a.levels.some(L=>L.n===n)?[colXZ[i][0],Yof(n),colXZ[i][1]]:null).filter(Boolean);
    for(let k=0;k<pts.length;k++) seg(G.base, pts[k], pts[(k+1)%pts.length], col(INK,.18)); }
  // crown ring — the five axes meet at a ring up top; read the structure top → down
  for(let i=0;i<5;i++) seg(G.base,[colXZ[i][0],CROWN,colXZ[i][1]],[colXZ[(i+1)%5][0],CROWN,colXZ[(i+1)%5][1]],col(INK,.42));
  // ground plane — a faint grid floor that anchors the volume and marks the base height
  for(let i=0,GR=5.0,GN=10;i<=GN;i++){ const t=-GR+2*GR*i/GN;
    seg(G.base,[t,GROUND,-GR],[t,GROUND,GR],col(INK,.14)); seg(G.base,[-GR,GROUND,t],[GR,GROUND,t],col(INK,.14)); }
  for(let j=0;j<10;j++)seg(G.seeds,[seedXZ[j][0],Y0-.85,seedXZ[j][1]],[seedXZ[(j+1)%10][0],Y0-.85,seedXZ[(j+1)%10][1]],col(INK,.22));
  SEEDS.forEach((s,j)=>{const p=seedPos[j];push(G.seeds,'point',p,col(GOLD,.12),18);push(G.seeds,'point',p,col(GOLD,.95),8);NODES.push({pos:p,kind:'seed',layer:'seeds',data:s});s.enables.forEach(([ax,n])=>addEdge(G.seeds,p,nodePos(ax,n),1.2,col(GHI,.7),true,'enable'));});
  MECH.forEach((m,k)=>{const p=mechPos[k];push(G.mechanics,'point',p,col(GOLD,.13),22);push(G.mechanics,'point',p,col(GHI,1),11);NODES.push({pos:p,kind:'mech',layer:'mechanics',data:m});m.on.forEach(([ax,n])=>addEdge(G.mechanics,p,nodePos(ax,n),.5,col(GOLD,.66),false,'mech'));});
  for(let k=0;k<4;k++)curve(G.ops,opPos[k],opPos[(k+1)%4],.6,col(INK,.2),false);
  OPS.forEach((nm,k)=>{const p=opPos[k];push(G.ops,'point',p,col(GOLD,.1),15);push(G.ops,'point',p,col(GHI,.85),7);NODES.push({pos:p,kind:'op',layer:'ops',data:{name:nm}});});
  PREREQ.forEach(([fa,fn,ta,tn,st])=>{const a=nodePos(fa,fn),b=nodePos(ta,tn),al=st==='locked'?.34:st==='firm'?.24:.15;addEdge(G.links,a,b,-.5,col(INK,al),st==='soft','prereq-'+(st==='soft'?'soft':'hard'));});
  // node lookup + edge re-tessellation for the gold hover/locate highlight
  const keyOf=p=>p[0].toFixed(2)+','+p[1].toFixed(2)+','+p[2].toFixed(2);
  function edgeVerts(out,e,c){const a=e.a,b=e.b,ct=[(a[0]+b[0])/2,(a[1]+b[1])/2+e.lift,(a[2]+b[2])/2],N=16;let pv=a;for(let k=1;k<=N;k++){const t=k/N,u=1-t,p=[u*u*a[0]+2*u*t*ct[0]+t*t*b[0],u*u*a[1]+2*u*t*ct[1]+t*t*b[1],u*u*a[2]+2*u*t*ct[2]+t*t*b[2]];out.push(pv[0],pv[1],pv[2],c[0],c[1],c[2],c[3],1,p[0],p[1],p[2],c[0],c[1],c[2],c[3],1);pv=p;}}

  // ── matrix helpers ──
  const Mx={mul:(a,b)=>{const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},persp:(f,as,n,fa)=>{const t=1/Math.tan(f/2);return[t/as,0,0,0,0,t,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0];},look:(e,c,u)=>{const z=nm(sb(e,c)),x=nm(cr(u,z)),y=cr(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dt(x,e),-dt(y,e),-dt(z,e),1];}};
  const sb=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dt=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],nm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};

  let started=false, raf=0, running=false;

  function init(mountEl){
    if(started || !mountEl) return;
    // mobile gate — drives the touch-first redesign; desktop path is untouched when MOB===false
    const MOBQ='(max-width:760px),(pointer:coarse)';
    let MOB=window.matchMedia(MOBQ).matches;
    const FOV=0.82;
    function wake(){ if(!running){ running=true; if(!raf)raf=requestAnimationFrame(frame); } }
    const panelName=nd=> nd.kind==='level' ? (nd.data.axis+' · L'+nd.data.n) : (nd.data.name||'');
    mountEl.innerHTML =
      '<div class="aea-toolbar"><span class="aea-tt">layers</span>'+
        '<button class="aea-tog" data-l="placements">placements</button>'+
        '<button class="aea-tog" data-l="seeds">seeds</button>'+
        '<button class="aea-tog" data-l="mechanics">mechanics</button>'+
        '<button class="aea-tog" data-l="ops">ops</button>'+
        '<button class="aea-tog" data-l="links">links</button>'+
      '</div>'+
      '<div class="aea-systems"><span class="aea-tt">place a system</span><span class="aea-sys-wrap"></span></div>'+
      '<canvas class="aea-canvas"></canvas>'+
      '<div class="aea-labels"></div>'+
      '<div class="aea-card"><div class="aea-pn"></div><div class="aea-pl"></div><div class="aea-pd"></div><div class="aea-px"></div></div>'+
      '<div class="aea-legend">'+
        '<div class="lg-ttl">connections</div>'+
        '<div class="lg-row"><i class="lg-l lgh"></i>prerequisite — required</div>'+
        '<div class="lg-row"><i class="lg-l lgs"></i>prerequisite — soft</div>'+
        '<div class="lg-row"><i class="lg-l lgm"></i>mechanism acts on</div>'+
        '<div class="lg-row"><i class="lg-l lge"></i>part enables</div>'+
        '<div class="lg-row"><i class="lg-d"></i>proven level (gold rung)</div>'+
      '</div>'+
      '<div class="aea-hint">drag · scroll · hover to trace links</div>'+
      '<div class="aea-credo">five axes — turn on a layer to go deeper</div>';

    // mobile: one bottom dock + pull-up sheet + scrim (desktop chrome above stays, hidden by CSS)
    if(MOB){ mountEl.classList.add('is-mobile'); mountEl.insertAdjacentHTML('beforeend',
      '<div class="aea-dock"><button class="aea-dk-layers">layers</button>'+
        '<span class="aea-dk-sel">tap a node</span><button class="aea-dk-i">idea</button></div>'+
      '<div class="aea-scrim"></div>'+
      '<div class="aea-sheet"><div class="aea-sheet-grip"></div>'+
        '<div class="aea-sh-grp">layers</div><div class="aea-sh-layers"></div>'+
        '<div class="aea-sh-grp">place a system</div><div class="aea-sh-sys"></div>'+
        '<div class="aea-sh-key">white = required prerequisite · gold = active flow · solid = hard · dashed = soft</div>'+
        '<button class="aea-dk-walk">walk the five axes &rarr;</button>'+
      '</div>'); }
    const dkSel = MOB ? mountEl.querySelector('.aea-dk-sel') : null;

    const cv=mountEl.querySelector('.aea-canvas');
    const gl=cv.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false})
          || cv.getContext('experimental-webgl',{antialias:true,alpha:true,premultipliedAlpha:false});
    if(!gl){ mountEl.classList.add('aea-nogl'); mountEl.querySelector('.aea-credo').textContent='structure needs WebGL — see the text at left'; started=true; return; }

    // depth-as-tone: pass clip w (≈ view distance) so near reads bright/large, far recedes dim/small
    const VS='attribute vec3 a_pos;attribute vec4 a_col;attribute float a_size;uniform mat4 u_mvp;uniform float u_psz;varying vec4 v;varying float v_w;void main(){gl_Position=u_mvp*vec4(a_pos,1.);v_w=gl_Position.w;gl_PointSize=a_size*clamp(12.0/gl_Position.w,0.45,1.7)*u_psz;v=a_col;}';
    const FS='precision mediump float;varying vec4 v;varying float v_w;uniform float u_round;uniform float u_boost;void main(){float fog=clamp(1.0-(v_w-9.0)/12.0*0.7,0.34,1.0);if(u_round>.5){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;gl_FragColor=vec4(v.rgb,clamp(v.a*smoothstep(.25,.04,r)*fog*u_boost,0.0,1.0));}else gl_FragColor=vec4(v.rgb,clamp(v.a*fog*u_boost,0.0,1.0));}';
    function mksh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(o));return o;}
    const pr=gl.createProgram();gl.attachShader(pr,mksh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,mksh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
    const Ap=gl.getAttribLocation(pr,'a_pos'),Ac=gl.getAttribLocation(pr,'a_col'),As=gl.getAttribLocation(pr,'a_size'),Um=gl.getUniformLocation(pr,'u_mvp'),Ur=gl.getUniformLocation(pr,'u_round');
    // mobile reads on a small canvas with less GPU punch: lift the faint structure's alpha + node sizes
    // so the pentagon is the hero (gold rungs stay clamped at 1, so they don't blow out). Desktop = 1.0.
    gl.uniform1f(gl.getUniformLocation(pr,'u_boost'), MOB?1.55:1.0);
    gl.uniform1f(gl.getUniformLocation(pr,'u_psz'), MOB?1.4:1.0);
    function mkbuf(a){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(a),gl.STATIC_DRAW);return b;}
    const BUF={};for(const k in G)BUF[k]={line:mkbuf(G[k].line),lineN:G[k].line.length/8,point:mkbuf(G[k].point),pointN:G[k].point.length/8};
    const hlBuf=gl.createBuffer();   // dynamic: incident edges of the hovered/pinned node, in gold
    const ST=32;
    function drawArr(buf,n,mode,round){if(!n)return;gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.vertexAttribPointer(Ap,3,gl.FLOAT,false,ST,0);gl.enableVertexAttribArray(Ap);gl.vertexAttribPointer(Ac,4,gl.FLOAT,false,ST,12);gl.enableVertexAttribArray(Ac);gl.vertexAttribPointer(As,1,gl.FLOAT,false,ST,28);gl.enableVertexAttribArray(As);gl.uniform1f(Ur,round);gl.drawArrays(mode,0,n);}
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

    // links (the prerequisite lattice) ON by default — the relational web IS the
    // architecture; reversing the file's old clean-by-default per Luis feedback.
    const state={placements:false,seeds:false,mechanics:false,ops:false,links:true};
    let hoverAxis=null, pinned=[];
    mountEl.querySelectorAll('.aea-tog').forEach(b=>{ if(state[b.dataset.l])b.classList.add('on');
      b.addEventListener('click',()=>{const l=b.dataset.l;state[l]=!state[l];b.classList.toggle('on',state[l]);updateLabels();}); });

    let yaw=0.5,pitch=MOB?0.34:0.3,dist=14,drag=false,px=0,py=0,mx=-1,my=-1;   // 3/4 view; mobile lifts pitch + fits by distance (rsz)
    const reduced=()=>sysReduced||LB.reducedPreview||LB.motionOn===false;
    let auto=!reduced();
    let fitInit=false, mobFit=14, lastMvp=null;
    // mobile guided-framing lerp (walk the axes / soft locate re-frame) — additive; desktop never engages it
    let lerpOn=false, walkActive=false, walkIdx=-1, yawT=yaw, pitchT=pitch, distT=dist;
    const lookCur=MOB?[0,-.3,0]:[0,-.6,0], lookGoal=lookCur.slice();   // mobile target centres the full structure in the square stage
    // touch model: a pointer Map drives pinch-zoom (replaces dead wheel) + tap-to-pin (replaces hover)
    const ptrs=new Map(); let downX=0,downY=0,moved=false,pinchGap0=0,pinchDist0=0;
    const clampDist=d=>Math.max(MOB?9:8,Math.min(MOB?26:22,d));
    function pickAt(sx,sy){ if(!lastMvp)return null; let best=null,bd=(MOB?30:20)*(MOB?30:20);
      for(const nd of NODES){ if(nd.layer&&nd.layer!=='base'&&!state[nd.layer])continue; const s=proj(lastMvp,nd.pos); if(!s)continue; const dx=s[0]-sx,dy=s[1]-sy,d=dx*dx+dy*dy; if(d<bd){bd=d;best=nd;} } return best; }
    function selectNode(best){ if(best){ pinned=[best]; hoverAxis=(best.kind==='level'?best.axis:null); updateLabels(); showPanel(best); if(dkSel)dkSel.textContent=panelName(best); }
      else { pinned=[]; hoverAxis=null; updateLabels(); card.style.opacity='0'; if(dkSel)dkSel.textContent='tap a node'; } }
    cv.addEventListener('pointerdown',e=>{ ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{cv.setPointerCapture(e.pointerId);}catch(_){}
      auto=false; walkActive=false; lerpOn=false; wake();
      if(ptrs.size===1){ drag=true; px=e.clientX; py=e.clientY; downX=e.clientX; downY=e.clientY; moved=false; }
      else if(ptrs.size===2){ drag=false; const a=[...ptrs.values()]; pinchGap0=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1; pinchDist0=dist; } });
    cv.addEventListener('pointermove',e=>{ const r=cv.getBoundingClientRect(); if(!MOB){ mx=e.clientX-r.left; my=e.clientY-r.top; }
      if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size>=2){ const a=[...ptrs.values()],g=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1; dist=clampDist(pinchDist0*pinchGap0/g); moved=true; e.preventDefault(); return; }
      if(!drag)return; if(Math.hypot(e.clientX-downX,e.clientY-downY)>8){ moved=true; if(MOB)e.preventDefault(); }
      yaw+=(e.clientX-px)*.008; pitch+=(e.clientY-py)*.006; pitch=MOB?Math.max(-.15,Math.min(.55,pitch)):Math.max(-.7,Math.min(1.2,pitch)); px=e.clientX; py=e.clientY; });
    function endPtr(e){ const was=ptrs.size; ptrs.delete(e.pointerId);
      if(was===1 && !moved && (e.pointerType==='touch'||MOB)){ const r=cv.getBoundingClientRect(); selectNode(pickAt(e.clientX-r.left,e.clientY-r.top)); wake(); }
      drag=ptrs.size===1; }
    cv.addEventListener('pointerup',endPtr);
    cv.addEventListener('pointercancel',e=>{ ptrs.delete(e.pointerId); drag=ptrs.size===1; });
    cv.addEventListener('wheel',e=>{ e.preventDefault(); dist=clampDist(dist+e.deltaY*.01); wake(); },{passive:false});

    const LRoot=mountEl.querySelector('.aea-labels'),labs=[];
    function mkLab(cls,txt,p,layer,axis){const el=document.createElement('div');el.className='aea-lab '+cls;el.textContent=txt;LRoot.appendChild(el);const o={el,p,cls,layer:layer||'base',axis:axis||null};labs.push(o);return o;}
    AX.forEach((a,i)=>{const[x,z]=colXZ[i];mkLab('axis',MOB?a.c:a.c+'·'+a.name,[x*1.3,CROWN+0.5,z*1.3],'base');mkLab('axsub',a.sub,[x*1.3,CROWN+0.22,z*1.3],'base');
     a.levels.forEach(Lv=>{ mkLab(Lv.lit?'levlit':'lev',Lv.label,[x,Yof(Lv.n),z],'axisL',a.key); if(Lv.ex)mkLab('ex',Lv.ex,[x,Yof(Lv.n)-.12,z],'placements',a.key); });});
    SEEDS.forEach((s,j)=>{mkLab('seednum',String(s.num),[seedPos[j][0],seedPos[j][1]+.32,seedPos[j][2]],'seeds');mkLab('seed',s.name,[seedPos[j][0],seedPos[j][1]-.34,seedPos[j][2]],'seeds');});
    MECH.forEach((m,k)=>mkLab('mech',m.name,[mechPos[k][0],mechPos[k][1]+.32,mechPos[k][2]],'mechanics'));
    OPS.forEach((nm2,k)=>mkLab('op',nm2,[opPos[k][0],opPos[k][1]+.32,opPos[k][2]],'ops'));
    function labVisible(o){
      if(MOB){ // curated default: 5 axis names + the lit/proven gold rungs; a tap reveals that one axis's ladder
        if(o.cls==='axsub')return false;
        if(o.layer==='base')return true;
        if(o.layer==='axisL')return o.cls==='levlit' || hoverAxis===o.axis;
        if(o.layer==='placements')return state.placements||hoverAxis===o.axis;
        return state[o.layer]; }
      if(o.layer==='base')return true; if(o.layer==='axisL')return hoverAxis===o.axis; if(o.layer==='placements')return state.placements||hoverAxis===o.axis; return state[o.layer]; }
    function updateLabels(){ for(const o of labs) o._want=labVisible(o); }
    updateLabels();

    const card=mountEl.querySelector('.aea-card'),PN=card.querySelector('.aea-pn'),PL=card.querySelector('.aea-pl'),PD=card.querySelector('.aea-pd'),PX=card.querySelector('.aea-px');
    let W,H;function rsz(){const d=Math.min(2,devicePixelRatio||1);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.max(1,W*d);cv.height=Math.max(1,H*d);gl.viewport(0,0,cv.width,cv.height);
      MOB=window.matchMedia(MOBQ).matches;
      // portrait fit by DISTANCE (FOV stays .82 so the pentagon never distorts): back off until the
      // STRUCTURE half-extents clear the frame (columns+labels, not the faint ground grid — let it bleed).
      if(MOB){ const t=Math.tan(FOV/2),aspect=(W/H)||1,vf=4.15/t,hf=3.80/(t*Math.max(aspect,0.01)),fit=Math.max(vf,hf)*1.04; mobFit=fit; if(!fitInit){dist=clampDist(fit);fitInit=true;} } }
    window.addEventListener('resize',rsz);window.addEventListener('orientationchange',rsz);rsz();
    function proj(m,p){const x=p[0],y=p[1],z=p[2],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15];if(cw<=.001)return null;return[(cx/cw*.5+.5)*W,(1-(cy/cw*.5+.5))*H];}
    function showPanel(nd){card.style.opacity='1';if(nd.kind==='level'){PN.textContent=nd.data.axis+' · L'+nd.data.n;PL.textContent=nd.data.label;PD.textContent='';PX.textContent=nd.data.ex?('example: '+nd.data.ex):'';}else if(nd.kind==='seed'){PN.textContent='part '+nd.data.num+' of 10';PL.textContent=nd.data.name;PD.textContent=nd.data.pd;PX.textContent=nd.data.enables.length?'':'take it away and the whole thing falls apart.';}else if(nd.kind==='op'){PN.textContent=nd.data.name;PL.textContent='operator op';PD.textContent='design → time → ship → learn';PX.textContent='';}else{PN.textContent=nd.data.name;PL.textContent='mechanic';PD.textContent=nd.data.detail;PX.textContent=nd.data.on.length?('acts on: '+nd.data.on.map(e=>e[0]+' L'+e[1]).join(' · ')):'meta';}}

    // ── system locator: click a chip → see where a named system (RAG, MCP, …)
    //    sits across the five axes, its placement chord, and its prerequisites.
    //    Placements come from window.LB_CONCEPTS (canonical), never invented. ──
    const CONC=(window.LB_CONCEPTS||[]), byTerm={}; CONC.forEach(c=>byTerm[c.term.toLowerCase()]=c);
    const CHIPS=(window.LB_CHIPS&&window.LB_CHIPS.length)?window.LB_CHIPS:CONC.map(c=>c.term);
    const byCode={}; AX.forEach(a=>byCode[a.c]=a.key);
    const nodeByKey={}; NODES.forEach(n=>{ nodeByKey[keyOf(n.pos)]=n; });
    const nFor=(code,level)=> code==='A'? level-1 : level;   // abstraction has an extra n0 'raw' rung
    let placement=null, placeChords=[], activeChip=null;
    function conceptNodes(c){ const out=[]; (c.axes||[]).forEach(({axis,level})=>{ const k=byCode[axis]; if(!k)return; const nd=nodeByKey[keyOf(nodePos(k,nFor(axis,level)))]; if(nd&&out.indexOf(nd)<0)out.push(nd); }); return out; }
    function showPlacement(){ if(!placement)return; const c=placement; card.style.opacity='1';
      PN.textContent=c.term; PL.textContent=c.off_map?'off the map':'placement'; PD.textContent=c.explanation||'';
      PX.textContent=c.off_map?'none of the five axes move':('sits on:  '+c.axes.map(a=>a.axis+'·L'+a.level).join('   ')); }
    function focusSystem(term){
      const c=term?byTerm[String(term).toLowerCase()]:null;
      if(!c){ placement=null; pinned=[]; placeChords=[]; if(MOB&&dkSel)dkSel.textContent='tap a node'; return; }
      const nodes=c.off_map?[]:conceptNodes(c);
      pinned=nodes; placement=c; placeChords=[];
      for(let i=0;i<nodes.length-1;i++)placeChords.push([nodes[i].pos,nodes[i+1].pos]);
      showPlacement();
      // mobile: a soft camera re-frame so the located system lands on the small canvas (no sandbox-lock)
      if(MOB && nodes.length){ let cx=0,cz=0; for(const n of nodes){cx+=n.pos[0];cz+=n.pos[2];} cx/=nodes.length; cz/=nodes.length;
        yawT=Math.atan2(cz,cx)+Math.PI; pitchT=pitch; distT=dist; lookGoal[0]=cx*0.4; lookGoal[1]=lookCur[1]; lookGoal[2]=cz*0.4; lerpOn=true; }
      if(MOB&&dkSel)dkSel.textContent=c.term;
      if(!running){ running=true; if(!raf)raf=requestAnimationFrame(frame); }
    }
    const sysWrap=mountEl.querySelector('.aea-sys-wrap');
    CHIPS.forEach(t=>{ const b=document.createElement('button'); b.className='aea-chip'; b.textContent=t; b.dataset.term=t;
      b.addEventListener('click',()=>{ const turnOn=activeChip!==b; sysWrap.querySelectorAll('.aea-chip').forEach(x=>x.classList.remove('on'));
        if(turnOn){ b.classList.add('on'); activeChip=b; focusSystem(t); } else { activeChip=null; focusSystem(null); } });
      sysWrap.appendChild(b); });

    // mobile: relocate the REAL controls into the dock sheet (same buttons + handlers → one logic path)
    if(MOB){ const shL=mountEl.querySelector('.aea-sh-layers'), shS=mountEl.querySelector('.aea-sh-sys');
      mountEl.querySelectorAll('.aea-toolbar .aea-tog').forEach(b=>shL.appendChild(b));
      if(shS&&sysWrap)shS.appendChild(sysWrap);
      const dkL=mountEl.querySelector('.aea-dk-layers'), dkI=mountEl.querySelector('.aea-dk-i'),
            dkW=mountEl.querySelector('.aea-dk-walk'), scrim=mountEl.querySelector('.aea-scrim'),
            grip=mountEl.querySelector('.aea-sheet-grip');
      const panel=mountEl.closest('.aea-panel')||mountEl.parentElement;   // .aea-text is a SIBLING of the stage, so text-open lives on the panel
      const closeSheet=()=>mountEl.classList.remove('sheet-open');
      dkL.addEventListener('click',()=>mountEl.classList.toggle('sheet-open'));
      grip.addEventListener('click',closeSheet);
      scrim.addEventListener('click',()=>{ closeSheet(); if(panel)panel.classList.remove('text-open'); });
      dkI.addEventListener('click',()=>{ if(panel)panel.classList.toggle('text-open'); });
      dkW.addEventListener('click',()=>{ closeSheet(); walkStep(); }); }
    // walk-the-axes: opt-in guided framing, one column centred per tap; any drag/pinch clears it (no rubber-band)
    function walkStep(){ walkIdx=(walkIdx+1)%6; if(walkIdx===5){ walkActive=false; walkIdx=-1; lerpOn=false; return; }
      const i=walkIdx; walkActive=true; lerpOn=true; auto=false; wake();
      yawT=axAng[i]+Math.PI; pitchT=0.2; distT=Math.max(mobFit*0.62,11);
      lookGoal[0]=colXZ[i][0]*0.5; lookGoal[1]=0.45; lookGoal[2]=colXZ[i][1]*0.5; }

    function frame(){
      if(!running){ raf=0; return; }
      if(auto && !reduced() && !walkActive)yaw+=.0022;
      if(lerpOn){ let dy=yawT-yaw; while(dy>Math.PI)dy-=2*Math.PI; while(dy<-Math.PI)dy+=2*Math.PI;
        yaw+=dy*0.08; pitch+=(pitchT-pitch)*0.08; dist+=(distT-dist)*0.08;
        for(let i=0;i<3;i++)lookCur[i]+=(lookGoal[i]-lookCur[i])*0.08;
        if(!walkActive && Math.abs(dy)<0.003 && Math.abs(distT-dist)<0.02)lerpOn=false; }
      const eye=[Math.cos(pitch)*Math.cos(yaw)*dist,Math.sin(pitch)*dist,Math.cos(pitch)*Math.sin(yaw)*dist];
      const mvp=Mx.mul(Mx.persp(FOV,W/H||1,.1,100),Mx.look(eye,lookCur,[0,1,0]));
      lastMvp=mvp;
      gl.clear(gl.COLOR_BUFFER_BIT);gl.uniformMatrix4fv(Um,false,new Float32Array(mvp));
      const order=['links','base','seeds','mechanics','ops'];
      for(const k of order){ if(k!=='base'&&!state[k])continue; drawArr(BUF[k].line,BUF[k].lineN,gl.LINES,0); drawArr(BUF[k].point,BUF[k].pointN,gl.POINTS,1); }
      let best=null; if(!MOB){ let bd=20*20;for(const nd of NODES){if(nd.layer&&nd.layer!=='base'&&!state[nd.layer])continue;const s=proj(mvp,nd.pos);if(!s)continue;const dx=s[0]-mx,dy=s[1]-my,d=dx*dx+dy*dy;if(d<bd){bd=d;best=nd;}} }
      // trace the focused node's links in gold (hover + locate-pinned), even when
      // the owning layer is off — hovering reveals the relations on demand.
      const focus=new Set(); if(best)focus.add(keyOf(best.pos)); for(const n of pinned)focus.add(keyOf(n.pos));
      const hl=[];
      if(focus.size){ for(const e of EDGES){ if(focus.has(keyOf(e.a))||focus.has(keyOf(e.b))) edgeVerts(hl,e,col(GHI,.95)); } }
      for(const ch of placeChords) edgeVerts(hl,{a:ch[0],b:ch[1],lift:.9},col(GHI,.92));   // the system's footprint across the axes
      if(hl.length){ gl.bindBuffer(gl.ARRAY_BUFFER,hlBuf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(hl),gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(Ap,3,gl.FLOAT,false,ST,0);gl.enableVertexAttribArray(Ap);gl.vertexAttribPointer(Ac,4,gl.FLOAT,false,ST,12);gl.enableVertexAttribArray(Ac);gl.vertexAttribPointer(As,1,gl.FLOAT,false,ST,28);gl.enableVertexAttribArray(As);gl.uniform1f(Ur,0);gl.drawArrays(gl.LINES,0,hl.length/8); }
      if(pinned.length){ const pts=[]; for(const n of pinned){const p=n.pos;pts.push(p[0],p[1],p[2],GHI[0],GHI[1],GHI[2],.22,34, p[0],p[1],p[2],GHI[0],GHI[1],GHI[2],1,15);}
        gl.bindBuffer(gl.ARRAY_BUFFER,hlBuf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pts),gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(Ap,3,gl.FLOAT,false,ST,0);gl.enableVertexAttribArray(Ap);gl.vertexAttribPointer(Ac,4,gl.FLOAT,false,ST,12);gl.enableVertexAttribArray(Ac);gl.vertexAttribPointer(As,1,gl.FLOAT,false,ST,28);gl.enableVertexAttribArray(As);gl.uniform1f(Ur,1);gl.drawArrays(gl.POINTS,0,pts.length/8); }
      if(!MOB){ const ha=best&&best.kind==='level'?best.axis:null; if(ha!==hoverAxis){hoverAxis=ha;updateLabels();}
        if(best)showPanel(best);else if(placement)showPlacement();else card.style.opacity='0'; }
      else { if(placement)showPlacement(); else if(pinned.length)showPanel(pinned[0]); else card.style.opacity='0'; }
      const vis=[];
      for(const o of labs){ if(!o._want){o.el.style.opacity='0';continue;} const s=proj(mvp,o.p);
        if(s&&s[0]>-70&&s[0]<W+70&&s[1]>-30&&s[1]<H+30){ const dd=Math.hypot(o.p[0]-eye[0],o.p[1]-eye[1],o.p[2]-eye[2]);
          let lf=Math.max(MOB?0:0.18,Math.min(1,1-(dd-(dist-4.5))/9*0.85));   // far labels recede → declutter
          if(MOB&&lf<0.5)lf=0;   // hard-cull faint far ghosts on the small canvas
          o._s=s; o._dd=dd; o._lf=lf;
          if(MOB){ if(lf>0)vis.push(o); else o.el.style.opacity='0'; }
          else { o.el.style.left=s[0]+'px';o.el.style.top=s[1]+'px';o.el.style.opacity=lf.toFixed(2); }
        } else o.el.style.opacity='0'; }
      if(MOB){ const PRI={axis:5,levlit:4,seednum:4,lev:3,ex:2,seed:2,mech:2,op:2,axsub:1};
        vis.sort((a,b)=>(PRI[b.cls]||0)-(PRI[a.cls]||0)||a._dd-b._dd); const kept=[];
        for(const o of vis){ let hide=false; for(const k of kept){ if(Math.abs(o._s[0]-k._s[0])<22&&Math.abs(o._s[1]-k._s[1])<22){hide=true;break;} }
          if(hide)o.el.style.opacity='0'; else { kept.push(o); o.el.style.left=o._s[0]+'px';o.el.style.top=o._s[1]+'px';o.el.style.opacity=o._lf.toFixed(2); } } }
      // reduced motion: one settled frame, then idle (resumes on interaction)
      if(reduced() && !drag){ raf=0; running=false; return; }
      raf=requestAnimationFrame(frame);
    }
    // resume the loop on interaction even under reduced motion (touch tap/pinch included)
    ['pointerdown','pointerup','wheel','touchstart'].forEach(ev=>cv.addEventListener(ev,wake));

    started=true; running=true; raf=requestAnimationFrame(frame);
    api.pause=()=>{ running=false; if(raf){cancelAnimationFrame(raf);raf=0;} };
    api.resume=()=>{ if(running)return; running=true; raf=requestAnimationFrame(frame); };
    // locate(['RAG']) — drive the same locator the chips do (home → architecture
    // deep-link, e.g. #/architecture?locate=RAG places RAG across the axes + lights it).
    api.locate=(list)=>{ const t=[].concat(list||[]).map(s=>String(s).trim()).filter(Boolean)[0];
      if(t && byTerm[t.toLowerCase()]){ focusSystem(t);
        const b=mountEl.querySelector('.aea-chip[data-term="'+t+'"]');
        if(b){ mountEl.querySelectorAll('.aea-chip').forEach(x=>x.classList.remove('on')); b.classList.add('on'); activeChip=b; } }
      else { const terms=[].concat(list||[]).map(s=>String(s).trim().toLowerCase()).filter(Boolean);
        placement=null; placeChords=[];
        pinned = terms.length ? NODES.filter(n=>{ const ex=((n.data||{}).ex||'').toLowerCase(); return terms.some(x=> ex===x || (ex&&ex.includes(x))); }) : []; }
      if(!running){ running=true; if(!raf)raf=requestAnimationFrame(frame); } };
  }

  const api={ init, pause(){}, resume(){}, locate(){} };
  window.LB_AEA3D = api;
})();
