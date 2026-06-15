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

  // ── canonical AEA data (ported from f3d-data.js, plain-language labels) ──
  const AX=[
   {key:'path',c:'P',name:'PATH',sub:'who decides',levels:[{n:1,label:'one-shot'},{n:2,label:'multi-step',ex:'ingestion pipeline'},{n:3,label:'branching',ex:'ops dashboard',lit:1},{n:4,label:'entity-defines',ex:'1500-tick'},{n:5,label:'anticipates'}]},
   {key:'multiplicity',c:'M',name:'MULTIPLICITY',sub:'how many',levels:[{n:1,label:'single',ex:'DATASPACE'},{n:2,label:'N-uncoord'},{n:3,label:'role-diff',ex:'HADES MoA'},{n:4,label:'coordinated',ex:'recursive MoA',lit:1},{n:5,label:'emergent'}]},
   {key:'abstraction',c:'A',name:'ABSTRACTION',sub:'composes with',levels:[{n:0,label:'raw',ex:'GPT-2'},{n:1,label:'+memory',ex:'RAG',lit:1},{n:2,label:'+tools',ex:'MCP'},{n:3,label:'+tool-gen',ex:'skills · Voyager'},{n:4,label:'+integration'},{n:5,label:'self-extend'}]},
   {key:'prompting',c:'R',name:'pROMPTING',sub:'input built',levels:[{n:1,label:'none'},{n:2,label:'preprompt'},{n:3,label:'context-dep',ex:'essence passing'},{n:4,label:'param+tools',ex:'Document DNA'},{n:5,label:'self-refine',ex:'Self-Propelling',lit:1},{n:6,label:'co-evolve'},{n:7,label:'absorption'}]},
   {key:'async',c:'S',name:'aSYNC',sub:'time',levels:[{n:1,label:'sync'},{n:2,label:'pipeline',ex:'Ouroboros'},{n:3,label:'event-driven'},{n:4,label:'independent',ex:'1500-tick',lit:1},{n:5,label:'multi-version',ex:'backwards channel'}]},
  ];
  const SEEDS=[
   {num:1,name:'RUNS ON',pd:'Something to run on — the hardware and the model itself.',enables:[]},
   {num:2,name:'THE GOAL',pd:'A clear goal it can measure its own work against.',enables:[]},
   {num:3,name:'FREEZE TO CODE',pd:'Turns work it keeps repeating into plain code that runs for free.',enables:[]},
   {num:4,name:'FALL BACK',pd:'When something new shows up, it drops back to the model instead of breaking.',enables:[]},
   {num:5,name:'SELF-UPGRADE',pd:'Builds its own next version, safely, without losing the old one.',enables:[]},
   {num:6,name:'SELF-KNOWLEDGE',pd:'A working picture of what it is made of and what each part is for.',enables:[['prompting',5],['path',4],['multiplicity',5]]},
   {num:7,name:'KNOWS IT IS STUCK',pd:'Senses when the current approach has stopped working.',enables:[]},
   {num:8,name:'THE LINES',pd:'Rules it must never cross — even with its own self-changes.',enables:[['async',4]]},
   {num:9,name:'ROLLBACK LINE',pd:'A way back to the previous version that never closes.',enables:[['prompting',7]]},
   {num:10,name:'PROGRESS CHECK',pd:'Notices when it must change shape, not just try harder.',enables:[['abstraction',5]]}];
  const MECH=[
   {name:'FREEZE TO CODE',seeds:[3],on:[['abstraction',2],['path',2]],detail:'Work it repeats becomes plain code that runs for almost nothing.'},
   {name:'FALL BACK',seeds:[4],on:[['abstraction',2],['path',4]],detail:'Hits something new? It returns to the model instead of failing.'},
   {name:'SELF-UPGRADE',seeds:[5,9],on:[['async',5],['abstraction',5],['multiplicity',5]],detail:'Builds its successor while the old version stays restorable.'},
   {name:'WHEN STUCK',seeds:[6,7],on:[],detail:'Decides what to do when it hits a wall.'}];
  const OPS=['DESIGN','TIME','SHIP','LEARN'];
  const PREREQ=[['multiplicity',5,'async',2,'locked'],['async',5,'multiplicity',2,'locked'],['path',5,'abstraction',1,'firm'],['abstraction',3,'path',2,'firm'],['abstraction',4,'prompting',4,'firm'],['abstraction',5,'prompting',5,'firm'],['prompting',6,'abstraction',3,'firm'],['path',3,'multiplicity',3,'soft'],['multiplicity',4,'prompting',3,'soft'],['prompting',4,'path',3,'soft'],['async',3,'abstraction',2,'soft']];

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

    const cv=mountEl.querySelector('.aea-canvas');
    const gl=cv.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false})
          || cv.getContext('experimental-webgl',{antialias:true,alpha:true,premultipliedAlpha:false});
    if(!gl){ mountEl.classList.add('aea-nogl'); mountEl.querySelector('.aea-credo').textContent='structure needs WebGL — see the text at left'; started=true; return; }

    // depth-as-tone: pass clip w (≈ view distance) so near reads bright/large, far recedes dim/small
    const VS='attribute vec3 a_pos;attribute vec4 a_col;attribute float a_size;uniform mat4 u_mvp;varying vec4 v;varying float v_w;void main(){gl_Position=u_mvp*vec4(a_pos,1.);v_w=gl_Position.w;gl_PointSize=a_size*clamp(12.0/gl_Position.w,0.45,1.7);v=a_col;}';
    const FS='precision mediump float;varying vec4 v;varying float v_w;uniform float u_round;void main(){float fog=clamp(1.0-(v_w-9.0)/12.0*0.7,0.34,1.0);if(u_round>.5){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;gl_FragColor=vec4(v.rgb,v.a*smoothstep(.25,.04,r)*fog);}else gl_FragColor=vec4(v.rgb,v.a*fog);}';
    function mksh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(o));return o;}
    const pr=gl.createProgram();gl.attachShader(pr,mksh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,mksh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
    const Ap=gl.getAttribLocation(pr,'a_pos'),Ac=gl.getAttribLocation(pr,'a_col'),As=gl.getAttribLocation(pr,'a_size'),Um=gl.getUniformLocation(pr,'u_mvp'),Ur=gl.getUniformLocation(pr,'u_round');
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

    let yaw=0.5,pitch=0.3,dist=14,drag=false,px=0,py=0,mx=-1,my=-1;   // elevated 3/4 view — see the crown, the columns, and the ground plane
    const reduced=()=>sysReduced||LB.reducedPreview||LB.motionOn===false;
    let auto=!reduced();
    cv.addEventListener('pointerdown',e=>{drag=true;auto=false;px=e.clientX;py=e.clientY;cv.setPointerCapture(e.pointerId);});
    cv.addEventListener('pointerup',()=>drag=false);
    cv.addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;if(!drag)return;yaw+=(e.clientX-px)*.008;pitch+=(e.clientY-py)*.006;pitch=Math.max(-.7,Math.min(1.2,pitch));px=e.clientX;py=e.clientY;});
    cv.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(8,Math.min(22,dist+e.deltaY*.01));},{passive:false});

    const LRoot=mountEl.querySelector('.aea-labels'),labs=[];
    function mkLab(cls,txt,p,layer,axis){const el=document.createElement('div');el.className='aea-lab '+cls;el.textContent=txt;LRoot.appendChild(el);const o={el,p,layer:layer||'base',axis:axis||null};labs.push(o);return o;}
    AX.forEach((a,i)=>{const[x,z]=colXZ[i];mkLab('axis',a.c+'·'+a.name,[x*1.3,CROWN+0.5,z*1.3],'base');mkLab('axsub',a.sub,[x*1.3,CROWN+0.22,z*1.3],'base');
     a.levels.forEach(Lv=>{ mkLab(Lv.lit?'levlit':'lev',Lv.label,[x,Yof(Lv.n),z],'axisL',a.key); if(Lv.ex)mkLab('ex',Lv.ex,[x,Yof(Lv.n)-.12,z],'placements',a.key); });});
    SEEDS.forEach((s,j)=>{mkLab('seednum',String(s.num),[seedPos[j][0],seedPos[j][1]+.32,seedPos[j][2]],'seeds');mkLab('seed',s.name,[seedPos[j][0],seedPos[j][1]-.34,seedPos[j][2]],'seeds');});
    MECH.forEach((m,k)=>mkLab('mech',m.name,[mechPos[k][0],mechPos[k][1]+.32,mechPos[k][2]],'mechanics'));
    OPS.forEach((nm2,k)=>mkLab('op',nm2,[opPos[k][0],opPos[k][1]+.32,opPos[k][2]],'ops'));
    function labVisible(o){ if(o.layer==='base')return true; if(o.layer==='axisL')return hoverAxis===o.axis; if(o.layer==='placements')return state.placements||hoverAxis===o.axis; return state[o.layer]; }
    function updateLabels(){ for(const o of labs) o._want=labVisible(o); }
    updateLabels();

    const card=mountEl.querySelector('.aea-card'),PN=card.querySelector('.aea-pn'),PL=card.querySelector('.aea-pl'),PD=card.querySelector('.aea-pd'),PX=card.querySelector('.aea-px');
    let W,H;function rsz(){const d=Math.min(2,devicePixelRatio||1);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.max(1,W*d);cv.height=Math.max(1,H*d);gl.viewport(0,0,cv.width,cv.height);}
    window.addEventListener('resize',rsz);rsz();
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
      if(!c){ placement=null; pinned=[]; placeChords=[]; return; }
      const nodes=c.off_map?[]:conceptNodes(c);
      pinned=nodes; placement=c; placeChords=[];
      for(let i=0;i<nodes.length-1;i++)placeChords.push([nodes[i].pos,nodes[i+1].pos]);
      showPlacement();
      if(!running){ running=true; if(!raf)raf=requestAnimationFrame(frame); }
    }
    const sysWrap=mountEl.querySelector('.aea-sys-wrap');
    CHIPS.forEach(t=>{ const b=document.createElement('button'); b.className='aea-chip'; b.textContent=t; b.dataset.term=t;
      b.addEventListener('click',()=>{ const turnOn=activeChip!==b; sysWrap.querySelectorAll('.aea-chip').forEach(x=>x.classList.remove('on'));
        if(turnOn){ b.classList.add('on'); activeChip=b; focusSystem(t); } else { activeChip=null; focusSystem(null); } });
      sysWrap.appendChild(b); });

    function frame(){
      if(!running){ raf=0; return; }
      if(auto && !reduced())yaw+=.0022;
      const eye=[Math.cos(pitch)*Math.cos(yaw)*dist,Math.sin(pitch)*dist,Math.cos(pitch)*Math.sin(yaw)*dist];
      const mvp=Mx.mul(Mx.persp(.82,W/H||1,.1,100),Mx.look(eye,[0,-.6,0],[0,1,0]));
      gl.clear(gl.COLOR_BUFFER_BIT);gl.uniformMatrix4fv(Um,false,new Float32Array(mvp));
      const order=['links','base','seeds','mechanics','ops'];
      for(const k of order){ if(k!=='base'&&!state[k])continue; drawArr(BUF[k].line,BUF[k].lineN,gl.LINES,0); drawArr(BUF[k].point,BUF[k].pointN,gl.POINTS,1); }
      let best=null,bd=20*20;for(const nd of NODES){if(nd.layer&&nd.layer!=='base'&&!state[nd.layer])continue;const s=proj(mvp,nd.pos);if(!s)continue;const dx=s[0]-mx,dy=s[1]-my,d=dx*dx+dy*dy;if(d<bd){bd=d;best=nd;}}
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
      const ha=best&&best.kind==='level'?best.axis:null; if(ha!==hoverAxis){hoverAxis=ha;updateLabels();}
      if(best)showPanel(best);else if(placement)showPlacement();else card.style.opacity='0';
      for(const o of labs){ if(!o._want){o.el.style.opacity='0';continue;} const s=proj(mvp,o.p);
        if(s&&s[0]>-70&&s[0]<W+70&&s[1]>-30&&s[1]<H+30){ const dd=Math.hypot(o.p[0]-eye[0],o.p[1]-eye[1],o.p[2]-eye[2]);
          const lf=Math.max(0.18,Math.min(1,1-(dd-(dist-4.5))/9*0.85));   // far labels recede → declutter
          o.el.style.left=s[0]+'px';o.el.style.top=s[1]+'px';o.el.style.opacity=lf.toFixed(2);
        } else o.el.style.opacity='0'; }
      // reduced motion: one settled frame, then idle (resumes on interaction)
      if(reduced() && !drag){ raf=0; running=false; return; }
      raf=requestAnimationFrame(frame);
    }
    // resume the loop on interaction even under reduced motion
    ['pointerdown','wheel'].forEach(ev=>cv.addEventListener(ev,()=>{ if(!running){ running=true; if(!raf)raf=requestAnimationFrame(frame); } }));

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
