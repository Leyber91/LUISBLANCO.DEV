/* =========================================================================
   hero-figure.js — the hero's living figure: the AEA as a slowly-turning
   pentagonal frame with a central axis (the "pentagon with the axis" form),
   five level-columns, and a gold constellation of the proven rungs. Read-only,
   self-contained (its own WebGL ctx) so it never collides with the interactive
   aea3d on the architecture route. Honors reduced motion (one settled frame).

   window.LB_HEROFIG.init(mountEl). Builds <canvas> + faint axis labels inside.
   ========================================================================= */
(function(){
  'use strict';
  const LB = (window.LB = window.LB || {});
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const AXC=['P','M','A','R','S'];
  const N=5, R=2.25, Y0=-2.4, Y1=2.4, LEVELS=5, LIT=[3,1,4,2,3];
  const ang=i=>-Math.PI/2 + i*2*Math.PI/5;
  const XZ=[]; for(let i=0;i<N;i++) XZ.push([R*Math.cos(ang(i)), R*Math.sin(ang(i))]);
  const yOf=k=>Y0 + (k/(LEVELS-1))*(Y1-Y0);
  const INK=[.80,.88,1.0], DIM=[.62,.74,.95], GOLD=[.831,.635,.298], GHI=[.941,.776,.455];
  const col=(c,a)=>[c[0],c[1],c[2],a];

  // geometry buffers (interleaved: x,y,z, r,g,b,a, size)
  const LINE=[], PT=[];
  const pushL=(p,c)=>LINE.push(p[0],p[1],p[2],c[0],c[1],c[2],c[3],1);
  const seg=(a,b,c)=>{pushL(a,c);pushL(b,c);};
  const pushP=(p,c,s)=>PT.push(p[0],p[1],p[2],c[0],c[1],c[2],c[3],s);
  const litPos=[];
  for(let i=0;i<N;i++){
    const [x,z]=XZ[i];
    seg([x,Y0,z],[x,Y1,z], col(INK,.72));                // axis column
    seg([x,Y0,z],[XZ[(i+1)%N][0],Y0,XZ[(i+1)%N][1]], col(INK,.62)); // base ring
    seg([x,Y1,z],[XZ[(i+1)%N][0],Y1,XZ[(i+1)%N][1]], col(INK,.5));  // top ring
    seg([0,0,0],[x,Y0,z], col(INK,.28));                 // spoke from centre axis
    for(let k=0;k<LEVELS;k++){
      const p=[x,yOf(k),z];
      if(k===LIT[i]){ pushP(p,col(GOLD,.22),42); pushP(p,col(GHI,1),17); litPos.push(p); }
      else pushP(p,col(DIM,.9),7);
    }
  }
  seg([0,Y0,0],[0,Y1,0], col(INK,.4));                   // the central axis
  pushP([0,Y1,0],col(GHI,.95),11); pushP([0,Y0,0],col(GHI,.7),8);
  // gold constellation: chain the proven rungs
  for(let i=0;i<litPos.length;i++) seg(litPos[i], litPos[(i+1)%litPos.length], col(GHI,.46));

  const Mx={mul:(a,b)=>{const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
    persp:(f,as,n,fa)=>{const t=1/Math.tan(f/2);return[t/as,0,0,0,0,t,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0];},
    look:(e,c,u)=>{const z=nm(sb(e,c)),x=nm(cr(u,z)),y=cr(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dt(x,e),-dt(y,e),-dt(z,e),1];}};
  const sb=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dt=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],nm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};

  function init(mount){
    if(!mount) return;
    mount.innerHTML='<canvas class="hf-canvas"></canvas><div class="hf-labels"></div>';
    const cv=mount.querySelector('.hf-canvas');
    cv.style.cssText='display:block;width:100%;height:100%;';
    const gl=cv.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false})
          || cv.getContext('experimental-webgl',{antialias:true,alpha:true,premultipliedAlpha:false});
    if(!gl) return;
    const VS='attribute vec3 a_pos;attribute vec4 a_col;attribute float a_size;uniform mat4 u_mvp;varying vec4 v;void main(){gl_Position=u_mvp*vec4(a_pos,1.);gl_PointSize=a_size;v=a_col;}';
    const FS='precision mediump float;varying vec4 v;uniform float u_round;void main(){if(u_round>.5){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;gl_FragColor=vec4(v.rgb,v.a*smoothstep(.25,.06,r));}else gl_FragColor=v;}';
    const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;};
    const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
    const Ap=gl.getAttribLocation(pr,'a_pos'),Ac=gl.getAttribLocation(pr,'a_col'),As=gl.getAttribLocation(pr,'a_size'),Um=gl.getUniformLocation(pr,'u_mvp'),Ur=gl.getUniformLocation(pr,'u_round');
    const mk=a=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(a),gl.STATIC_DRAW);return b;};
    const bl=mk(LINE), nl=LINE.length/8, bp=mk(PT), np=PT.length/8, ST=32;
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    function drawArr(buf,n,mode,round){if(!n)return;gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.vertexAttribPointer(Ap,3,gl.FLOAT,false,ST,0);gl.enableVertexAttribArray(Ap);gl.vertexAttribPointer(Ac,4,gl.FLOAT,false,ST,12);gl.enableVertexAttribArray(Ac);gl.vertexAttribPointer(As,1,gl.FLOAT,false,ST,28);gl.enableVertexAttribArray(As);gl.uniform1f(Ur,round);gl.drawArrays(mode,0,n);}

    // faint axis letters at the tops
    const LR=mount.querySelector('.hf-labels'); const labs=[];
    AXC.forEach((c,i)=>{const el=document.createElement('div');el.className='hf-lab';el.textContent=c;LR.appendChild(el);labs.push({el,p:[XZ[i][0],Y1+0.35,XZ[i][1]]});});

    let W,H; function rsz(){const d=Math.min(2,devicePixelRatio||1);W=cv.clientWidth;H=cv.clientHeight;cv.width=Math.max(1,W*d);cv.height=Math.max(1,H*d);gl.viewport(0,0,cv.width,cv.height);}
    addEventListener('resize',rsz); rsz();
    function proj(m,p){const x=p[0],y=p[1],z=p[2],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],cw=m[3]*x+m[7]*y+m[11]*z+m[15];if(cw<=.001)return null;return[(cx/cw*.5+.5)*W,(1-(cy/cw*.5+.5))*H];}
    const reduced=()=>sysReduced||LB.reducedPreview||LB.motionOn===false;
    let yaw=0.6, pitch=0.22;
    function frame(){
      if(!reduced()) yaw+=0.0026;
      const dist=7.4, eye=[Math.cos(pitch)*Math.cos(yaw)*dist,Math.sin(pitch)*dist,Math.cos(pitch)*Math.sin(yaw)*dist];
      const mvp=Mx.mul(Mx.persp(.8,W/H||1,.1,100),Mx.look(eye,[0,0,0],[0,1,0]));
      gl.clear(gl.COLOR_BUFFER_BIT); gl.uniformMatrix4fv(Um,false,new Float32Array(mvp));
      drawArr(bl,nl,gl.LINES,0); drawArr(bp,np,gl.POINTS,1);
      for(const o of labs){ const s=proj(mvp,o.p); if(s){o.el.style.left=s[0]+'px';o.el.style.top=s[1]+'px';o.el.style.opacity='1';}else o.el.style.opacity='0'; }
      if(reduced()) return;   // one settled frame
      requestAnimationFrame(frame);
    }
    frame();
  }
  window.LB_HEROFIG = { init };
})();
