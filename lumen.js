/* =========================================================================
   lumen.js — LUMEN, the GPU particle substrate (T-1.1 · GPGPU engine core).
   WebGL2 GPGPU: two RGBA-float textures (position.xyz+age, velocity.xyz+seed)
   in ping-pong FBOs. Sim = fullscreen-quad fragment pass writing next state;
   render = point sprites reading the position texture by gl_VertexID lookup.
   Fixed 16.6ms timestep with accumulator; DPR capped at 1.5.

   Self-contained IIFE, zero dependencies. Mounts ONE canvas into .substrate,
   between the dot-grid (.sub-dots) and the stars (.sub-stars). If WebGL2 or
   float-render support is missing, it aborts cleanly and the existing
   2D-canvas starfield substrate remains (zero risk).

   Public API — window.LB_LUMEN:
     init()        probe + mount + seed + start          → true | false
     setPreset(id) field character per plate (T-1.2 fills this in)
     setForm(id)   morph attractor target (T-1.4 fills this in)
     pause()       stop the rAF loop
     resume()      restart the rAF loop
     destroy()     full teardown, removes the canvas
     tier          current tier string ('T1' …)

   Honors window.LB: motionOn (master) · reducedPreview (master) and
   prefers-reduced-motion → settle to a single static frame, no sim.

   v0.1 (T-1.1): simple hash-flow drift + ink-dust dots. The real curl-noise
   field (T-1.2), the speed→bronze→gold palette + depth bands (T-1.3), morph
   attractors (T-1.4), the perf governor/tier ladder (T-1.5), and plate
   integration (T-1.6) land in their own tickets. The seams are left open here.
   ========================================================================= */
(function(){
  "use strict";
  const LB = (window.LB = window.LB || {});
  if(LB.motionOn === undefined) LB.motionOn = true;
  const sysReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── tier table (T-1.5 will bench + select; v0.1 defaults to T1) ──────────
  // texSize²  = particle count.  512² = 262 144 ≈ "250k".
  const TIERS = {
    T0: { texSize: 776 },   // ~602k  desktop dGPU
    T1: { texSize: 512 },   // ~262k  default laptop
    T2: { texSize: 316 },   // ~100k  weak iGPU
  };
  let tierKey = 'T1';

  const STEP = 16.6;        // fixed timestep (ms)
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  let gl, canvas, host;
  let texSize = TIERS[tierKey].texSize;
  let count = texSize * texSize;
  let texPos = [], texVel = [], fbo = [];   // ping-pong pair (MRT: pos@0, vel@1)
  let read = 0, write = 1;
  let quadVAO, emptyVAO, quadBuf;
  let seedProg, simProg, renderProg;
  let raf = 0, last = 0, acc = 0, t0 = 0, settled = false, running = false;
  let started = false;

  // ── field presets (T-1.2) — one field character per plate section.
  // scale=frequency · speed=flow mag (units/s) · drift=field evolution ·
  // damp=viscosity · mode 0 hero/1 laminar/2 cellular/3 funnel/4 radial.
  const PRESETS = {
    hero:         { scale:1.4, speed:0.060, drift:0.05, damp:0.95, mode:0, cx:0.00, cy:0.0 },
    architecture: { scale:1.1, speed:0.050, drift:0.04, damp:0.96, mode:1, cx:0.00, cy:0.0 },
    projects:     { scale:2.8, speed:0.060, drift:0.06, damp:0.94, mode:2, cx:0.00, cy:0.0 },
    work:         { scale:1.6, speed:0.075, drift:0.05, damp:0.95, mode:3, cx:0.55, cy:0.0 },
    contact:      { scale:1.2, speed:0.045, drift:0.03, damp:0.96, mode:4, cx:0.00, cy:0.0 },
  };
  let curP = Object.assign({}, PRESETS.hero);   // live (lerped) field params
  let tgtP = Object.assign({}, PRESETS.hero);   // target set by the route spy
  function lerpPreset(dtMs){
    const k = Math.min(1, dtMs/2000);            // ~2s ease toward the target
    curP.scale += (tgtP.scale-curP.scale)*k;
    curP.speed += (tgtP.speed-curP.speed)*k;
    curP.drift += (tgtP.drift-curP.drift)*k;
    curP.damp  += (tgtP.damp -curP.damp )*k;
    curP.cx    += (tgtP.cx   -curP.cx   )*k;
    curP.cy    += (tgtP.cy   -curP.cy   )*k;
    curP.mode   = tgtP.mode;                      // mode snaps; params ease
  }

  // ── shader sources ───────────────────────────────────────────────────────
  const VERT_QUAD = `#version 300 es
  in vec2 aPos;
  void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // Seed pass — deterministic, format-agnostic (works for 32F and 16F alike).
  // NOTE: the codebase's plain LCG (s*1664525+1013904223) gives serially
  // correlated outputs; feeding consecutive LCG draws into a point's (x,y)
  // lands them on parallel hyperplanes (the Marsaglia lattice) — it rendered
  // as a visible diagonal weave. A PCG-style integer hash per channel removes
  // it. The codebase seed (20260601) is preserved so the field is reproducible.
  const FRAG_SEED = `#version 300 es
  precision highp float;
  uniform int uTexSize;
  layout(location=0) out vec4 outPos;   // xyz position, w age
  layout(location=1) out vec4 outVel;   // xyz velocity, w per-particle seed
  uint hash(uint x){                    // PCG-style integer hash
    x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x;
  }
  float r(uint n){ return float(hash(n) >> 8) / 16777216.0; }   // [0,1)
  void main(){
    ivec2 t = ivec2(gl_FragCoord.xy);
    uint id = uint(t.y) * uint(uTexSize) + uint(t.x);
    uint b  = (id + 20260601u) * 6u;    // 6 independent channels per particle
    vec3 pos = vec3(r(b)*2.0-1.0, r(b+1u)*2.0-1.0, r(b+2u));   // xy in [-1,1], z depth band
    vec3 vel = vec3(r(b+3u)*2.0-1.0, r(b+4u)*2.0-1.0, 0.0) * 0.02;
    outPos = vec4(pos, r(b+5u));        // age staggered
    outVel = vec4(vel, r(b+2u));
  }`;

  // Sim pass (T-1.2) — curl-noise flow field. Velocity follows the analytic
  // curl of three offset simplex fields (divergence-free → looks like fluid
  // without solving fluids), with one octave of domain warping. High viscosity,
  // no gravity. Field character comes from the per-preset uniforms, lerped by
  // the scroll spy. Time base is glacial (the image-8 stillness, with life).
  const FRAG_SIM = `#version 300 es
  precision highp float;
  uniform sampler2D uPos;
  uniform sampler2D uVel;
  uniform float uDt;       // seconds
  uniform float uTime;     // seconds
  uniform float uScale;    // field frequency
  uniform float uSpeed;    // flow magnitude (units/sec)
  uniform float uDrift;    // field evolution rate
  uniform float uDamp;     // viscosity (0.92-0.97)
  uniform int   uMode;     // 0 hero · 1 laminar · 2 cellular · 3 funnel · 4 radial
  uniform vec2  uCenter;   // funnel column / radial origin
  layout(location=0) out vec4 outPos;
  layout(location=1) out vec4 outVel;

  // Ashima / Gustavson simplex 3D noise (public domain).
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0,0.5,1.0,2.0);
    vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
              i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
              i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0); m=m*m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  vec3 snoiseVec3(vec3 x){
    return vec3(snoise(x),
                snoise(vec3(x.y-19.1, x.z+33.4, x.x+47.2)),
                snoise(vec3(x.z+74.2, x.x-124.5, x.y+99.4)));
  }
  vec3 curl(vec3 p){                 // analytic curl of three offset fields
    const float e = 0.1;
    vec3 dx=vec3(e,0,0), dy=vec3(0,e,0), dz=vec3(0,0,e);
    vec3 px0=snoiseVec3(p-dx), px1=snoiseVec3(p+dx);
    vec3 py0=snoiseVec3(p-dy), py1=snoiseVec3(p+dy);
    vec3 pz0=snoiseVec3(p-dz), pz1=snoiseVec3(p+dz);
    float x=(py1.z-py0.z)-(pz1.y-pz0.y);
    float y=(pz1.x-pz0.x)-(px1.z-px0.z);
    float z=(px1.y-px0.y)-(py1.x-py0.x);
    return vec3(x,y,z)/(2.0*e);
  }
  vec3 shape(vec3 c, vec3 pos){       // per-preset character on the base flow
    if(uMode==1){ return vec3(0.62 + c.x*0.30, c.y*0.22, 0.0); }            // laminar lanes
    if(uMode==2){ return c; }                                              // cellular (freq does it)
    if(uMode==3){ vec2 d = uCenter - pos.xy; return c*0.5 + vec3(d,0.0)*0.9; } // funnel
    if(uMode==4){ vec2 r = pos.xy - uCenter; return c*0.35 + vec3(normalize(r+1e-4),0.0)*sin(uTime*0.3)*0.7; } // radial breath
    return c;                                                              // hero swirl
  }
  void main(){
    ivec2 t = ivec2(gl_FragCoord.xy);
    vec4 P = texelFetch(uPos, t, 0);
    vec4 V = texelFetch(uVel, t, 0);
    vec3 pos = P.xyz;
    vec3 vel = V.xyz;
    vec3 q = vec3(pos.xy, pos.z*0.6);
    vec3 warp = snoiseVec3(q * uScale * 0.5) * 0.4;          // one octave domain warp
    vec3 c = curl(q * uScale + warp + vec3(0.0,0.0,uTime*uDrift));
    vec3 target = shape(c, pos) * uSpeed;
    vel = vel*uDamp + target*(1.0 - uDamp);                  // viscous approach
    pos.xy += vel.xy * uDt;
    pos.xy = mod(pos.xy + 1.0, 2.0) - 1.0;                   // wrap, density uniform
    outPos = vec4(pos, P.w + uDt);
    outVel = vec4(vel, V.w);
  }`;

  // Render pass (T-1.3 + the void rework) — particles are gated by a slowly
  // drifting fBm CLOUD field so the substrate reads as luminous flowing clouds
  // over DOMINANT VOID ("ink in dense liquid"), not a uniform grain. As the
  // curl flow carries a particle into a cloud it lights up; as it leaves, it
  // fades to void — the forming/dissolving protagonist (D-2). Depth band + speed
  // + cloud density drive size, the ink->bronze->gold ramp, and emission.
  const VERT_RENDER = `#version 300 es
  precision highp float;
  uniform sampler2D uPos;
  uniform sampler2D uVel;
  uniform int uTexSize;
  uniform float uDpr;
  uniform float uTime;
  out float vSpeed;
  out float vSeed;
  out float vBand;     // 0 far · 1 focus · 2 near
  out float vCloud;    // 0 void · 1 cloud peak
  float hash(vec2 p){ p = fract(p*vec2(127.13,311.71)); p += dot(p, p+34.53); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){                       // 5 octaves, normalized to [0,1]
    float s=0.0,a=0.5,n=0.0;
    for(int i=0;i<5;i++){ s+=a*vnoise(p); n+=a; p=p*2.07+vec2(1.3,7.1); a*=0.5; }
    return s/n;
  }
  void main(){
    int id = gl_VertexID;
    ivec2 t = ivec2(id % uTexSize, id / uTexSize);
    vec4 P = texelFetch(uPos, t, 0);
    vec4 V = texelFetch(uVel, t, 0);
    vSpeed = length(V.xy);
    vSeed  = V.w;
    // large-scale envelope (some whole regions stay void) breaks the repetition,
    // then domain-warped fBm carves the flowing filament/jet ridges inside it.
    vec2 dr = vec2(uTime*0.010, -uTime*0.007);
    float env = smoothstep(0.32, 0.74, fbm(P.xy*0.55 + 11.0 + dr*0.4));
    float cloud = fbm(P.xy*0.95 + dr + 0.75*fbm(P.xy*0.6 + dr*0.5));
    vCloud = smoothstep(0.50, 0.74, cloud) * env;              // tighter band = defined jets
    vCloud = pow(vCloud, 1.35);                                // concentrate the cores (sharper)
    float z = P.z, size;
    if(z < 0.55){ vBand = 0.0; size = 1.0; }                   // far 55% — fine sharp sand
    else if(z < 0.93){ vBand = 1.0; size = 1.7; }              // focus 38%
    else { vBand = 2.0; size = 3.0 + vSeed*3.0; }              // near 7% — small bokeh (was big/blurry)
    size *= (0.4 + vCloud*1.5);                                // grow in jet cores
    if(vSeed > 0.985) size += 1.4;                             // rare gold stars
    gl_Position = vec4(P.xy, 0.0, 1.0);
    gl_PointSize = max(size, 0.0) * uDpr;
  }`;

  const FRAG_RENDER = `#version 300 es
  precision highp float;
  in float vSpeed;
  in float vSeed;
  in float vBand;
  in float vCloud;
  out vec4 frag;
  void main(){
    if(vCloud <= 0.002) discard;                       // void dominates
    vec2 d = gl_PointCoord - 0.5;
    float rr = sqrt(dot(d,d));
    float s = clamp(vSpeed / 0.085, 0.0, 1.0);
    float warm = clamp(s*0.72 + vCloud*0.45, 0.0, 1.0); // speed drives the gold jets
    vec3 ink    = vec3(0.40,0.50,0.70);   // cool dim dust
    vec3 bronze = vec3(0.56,0.41,0.22);   // #8a6a3a
    vec3 gold   = vec3(0.85,0.65,0.31);   // #D4A24C
    vec3 amber  = vec3(0.98,0.82,0.49);   // #F0C674
    vec3 col = mix(ink, bronze, smoothstep(0.26,0.55,warm));
    col = mix(col, gold,  smoothstep(0.55,0.80,warm));
    col = mix(col, amber, smoothstep(0.80,1.00,warm));
    float emis = 1.0 + smoothstep(0.55,1.0,warm)*2.6;   // strong glow in the jets
    if(vSeed > 0.985){ col = amber; emis *= 1.8; }      // rare gold stars
    float a;
    if(vBand > 1.5){                                    // near: SMALL crisp bokeh (was blurry)
      float disc = smoothstep(0.5, 0.24, rr);
      a = disc * 0.07;
    } else {                                            // far/focus: tight bright sand
      float fall = exp(-dot(d,d) * 10.0);               // sharper core
      float base = mix(0.04, 0.26, warm);               // bright jet cores, dim dust elsewhere
      if(vBand < 0.5) base *= 0.5;                      // far band dimmer (depth)
      a = fall * base;
    }
    a *= emis * vCloud;                                 // cloud gates visibility
    frag = vec4(col * a, a);                            // premultiplied additive
  }`;

  // ── gl helpers ─────────────────────────────────────────────────────────
  function compile(type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src.replace(/\n  /g, '\n')); gl.compileShader(sh);
    if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      console.warn('[LUMEN] shader compile failed:', gl.getShaderInfoLog(sh)); return null;
    }
    return sh;
  }
  function link(vsSrc, fsSrc){
    const vs = compile(gl.VERTEX_SHADER, vsSrc), fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.warn('[LUMEN] program link failed:', gl.getProgramInfoLog(p)); return null;
    }
    return p;
  }
  function makeStateTex(){
    const tx = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texSize, texSize, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tx;
  }
  function buildStateTargets(){
    texPos = []; texVel = []; fbo = [];
    for(let i=0;i<2;i++){
      texPos[i] = makeStateTex();
      texVel[i] = makeStateTex();
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texPos[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texVel[i], 0);
      fbo[i] = f;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ── passes ───────────────────────────────────────────────────────────────
  function runQuad(prog){              // seed + sim share the fullscreen quad
    gl.useProgram(prog);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function seedField(){
    gl.viewport(0,0,texSize,texSize);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[read]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.useProgram(seedProg);
    gl.uniform1i(gl.getUniformLocation(seedProg, 'uTexSize'), texSize);
    runQuad(seedProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function simStep(dtSec){
    gl.viewport(0,0,texSize,texSize);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[write]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.useProgram(simProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPos[read]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texVel[read]);
    const u = n => gl.getUniformLocation(simProg, n);
    gl.uniform1i(u('uPos'), 0);
    gl.uniform1i(u('uVel'), 1);
    gl.uniform1f(u('uDt'), dtSec);
    gl.uniform1f(u('uTime'), (performance.now()-t0)/1000);
    gl.uniform1f(u('uScale'), curP.scale);
    gl.uniform1f(u('uSpeed'), curP.speed);
    gl.uniform1f(u('uDrift'), curP.drift);
    gl.uniform1f(u('uDamp'),  curP.damp);
    gl.uniform1i(u('uMode'),  curP.mode|0);
    gl.uniform2f(u('uCenter'), curP.cx, curP.cy);
    runQuad(simProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    read ^= 1; write ^= 1;
  }
  function renderField(){
    gl.viewport(0,0,canvas.width, canvas.height);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);   // premultiplied additive glow
    gl.useProgram(renderProg);
    const u = n => gl.getUniformLocation(renderProg, n);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPos[read]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texVel[read]);
    gl.uniform1i(u('uPos'), 0);
    gl.uniform1i(u('uVel'), 1);
    gl.uniform1i(u('uTexSize'), texSize);
    gl.uniform1f(u('uDpr'), dpr);
    gl.uniform1f(u('uTime'), (performance.now()-t0)/1000);
    gl.bindVertexArray(emptyVAO);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  // ── loop (fixed timestep + accumulator) ──────────────────────────────────
  function frame(now){
    if(!running) return;
    const reduced = sysReduced || LB.reducedPreview;
    if(!LB.motionOn || reduced){               // settle to one static frame, no sim
      if(!settled){ renderField(); settled = true; }
      raf = requestAnimationFrame(frame); return;
    }
    settled = false;
    if(!last) last = now;
    acc += Math.min(now - last, 100); last = now;   // clamp long stalls
    let steps = 0;
    while(acc >= STEP && steps < 6){ lerpPreset(STEP); simStep(STEP/1000); acc -= STEP; steps++; }
    renderField();
    raf = requestAnimationFrame(frame);
  }

  // ── mount / lifecycle ────────────────────────────────────────────────────
  function mountCanvas(){
    host = document.querySelector('.substrate');
    if(!host){ host = document.createElement('div'); host.className='substrate'; host.setAttribute('aria-hidden','true'); document.body.prepend(host); }
    canvas = document.createElement('canvas');
    canvas.className = 'sub-lumen';
    const stars = host.querySelector('.sub-stars');   // sit BETWEEN dots and stars
    if(stars) host.insertBefore(canvas, stars); else host.appendChild(canvas);
    sizeCanvas();
  }
  function sizeCanvas(){
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    canvas.style.left = '0px'; canvas.style.top = '0px';
  }

  function init(){
    if(started) return true;
    mountCanvas();
    gl = canvas.getContext('webgl2', {
      alpha:true, premultipliedAlpha:true, antialias:false, depth:false,
      stencil:false, preserveDrawingBuffer:false, powerPreference:'high-performance'
    });
    if(!gl){ console.info('[LUMEN] no WebGL2 — starfield substrate retained.'); cleanupCanvas(); return false; }
    if(!gl.getExtension('EXT_color_buffer_float')){
      // half-float fallback path is a T-1.5 concern; for now require full float.
      console.info('[LUMEN] EXT_color_buffer_float unavailable — starfield substrate retained.'); cleanupCanvas(); return false;
    }

    seedProg   = link(VERT_QUAD,   FRAG_SEED);
    simProg    = link(VERT_QUAD,   FRAG_SIM);
    renderProg = link(VERT_RENDER, FRAG_RENDER);
    if(!seedProg || !simProg || !renderProg){ cleanupCanvas(); return false; }

    // fullscreen triangle (covers clip space) for the quad passes
    quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aSeed = gl.getAttribLocation(seedProg, 'aPos');
    gl.enableVertexAttribArray(aSeed); gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);
    emptyVAO = gl.createVertexArray();   // attribute-less draw for the point pass
    gl.bindVertexArray(null);

    buildStateTargets();
    seedField();

    canvas.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', onVisibility, false);
    window.addEventListener('resize', onResize, false);

    started = true;
    LB_LUMEN.tier = tierKey;
    t0 = performance.now(); last = 0; acc = 0; settled = false;
    resume();
    setTimeout(wireSpy, 500);   // let the router populate #page first
    console.info('[LUMEN] online · tier '+tierKey+' · '+count.toLocaleString()+' particles');
    return true;
  }

  // ── resize (debounced; re-seed preserving tier) ──────────────────────────
  let rt = 0;
  function onResize(){
    clearTimeout(rt);
    rt = setTimeout(()=>{
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if(canvas) sizeCanvas();
      if(gl){ seedField(); settled = false; }   // positions are normalized; reseed per spec
    }, 150);
  }
  function onVisibility(){ if(document.hidden) pause(); else resume(); }
  function onContextLost(e){ e.preventDefault(); pause(); console.warn('[LUMEN] context lost.'); }

  function pause(){ running = false; if(raf){ cancelAnimationFrame(raf); raf = 0; } }
  function resume(){ if(!started || running) return; running = true; last = 0; raf = requestAnimationFrame(frame); }

  function cleanupCanvas(){ if(canvas && canvas.parentNode){ canvas.parentNode.removeChild(canvas); } canvas = null; gl = null; }
  function destroy(){
    pause();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if(gl){
      [seedProg,simProg,renderProg].forEach(p=>p&&gl.deleteProgram(p));
      texPos.concat(texVel).forEach(t=>t&&gl.deleteTexture(t));
      fbo.forEach(f=>f&&gl.deleteFramebuffer(f));
      if(quadBuf) gl.deleteBuffer(quadBuf);
      if(quadVAO) gl.deleteVertexArray(quadVAO);
      if(emptyVAO) gl.deleteVertexArray(emptyVAO);
    }
    cleanupCanvas();
    started = false; settled = false;
  }

  // ── preset spy (T-1.2) — route-driven: each <template> swaps one section
  // into #page; we read its class and ease the field toward that character.
  function setPreset(id){
    const p = PRESETS[id]; if(!p) return;
    LB_LUMEN.preset = id;
    tgtP.scale=p.scale; tgtP.speed=p.speed; tgtP.drift=p.drift;
    tgtP.damp=p.damp; tgtP.mode=p.mode; tgtP.cx=p.cx; tgtP.cy=p.cy;
  }
  const SECTION_PRESET = [   // first match wins; distinctive classes first
    ['.arch-main','architecture'], ['.proj-main','projects'], ['.wr-main','projects'],
    ['.wk-main','work'], ['.ct-main','contact'], ['.ab-main','contact'],
    ['.inside','hero'], ['.hero','hero']
  ];
  function detectPreset(){
    const page = document.getElementById('page'); if(!page) return;
    for(const [cls,preset] of SECTION_PRESET){ if(page.querySelector(cls)){ setPreset(preset); return; } }
  }
  function wireSpy(){
    const page = document.getElementById('page'); if(!page) return;
    detectPreset();
    try { new MutationObserver(detectPreset).observe(page, { childList:true }); } catch(_){}
    window.addEventListener('hashchange', ()=> setTimeout(detectPreset, 60));
  }

  function setForm(id){ LB_LUMEN.form = id;     /* T-1.4: morph attractor target */ }

  const LB_LUMEN = window.LB_LUMEN = {
    init, setPreset, setForm, pause, resume, destroy, tier: tierKey, preset:null, form:null
  };

  // auto-init after the substrate has mounted (script is included after
  // spa-substrate.js). Reduced-motion / motion-off still mount + seed + draw
  // one static frame; the loop simply settles.
  function boot(){ try { init(); } catch(err){ console.warn('[LUMEN] init error — starfield retained.', err); try{ destroy(); }catch(_){} } }
  if(document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
