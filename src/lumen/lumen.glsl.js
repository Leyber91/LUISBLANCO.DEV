/* =========================================================================
   lumen.glsl.js — LUMEN shader sources (GLSL ES 3.00, WebGL2).
   Pure strings. Augments window.LUMEN.GLSL. The algorithms here are documented
   in _reference/ALGORITHM_REFERENCE.md (curl noise, PCG seed, fBm cloud gate).
   ========================================================================= */
(function(){
  "use strict";
  const LUMEN = (window.LUMEN = window.LUMEN || {});

  // fullscreen-triangle vertex stage, shared by the seed + sim passes
  const VERT_QUAD = `#version 300 es
  in vec2 aPos;
  void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // SEED — deterministic, format-agnostic. The codebase LCG is serially
  // correlated (consecutive draws into (x,y) land on Marsaglia hyperplanes →
  // a visible diagonal lattice); a PCG-style integer hash per channel removes
  // it. Seed 20260601 preserved so the field is reproducible.
  const FRAG_SEED = `#version 300 es
  precision highp float;
  uniform int uTexSize;
  layout(location=0) out vec4 outPos;   // xyz position, w age
  layout(location=1) out vec4 outVel;   // xyz velocity, w per-particle seed
  uint hash(uint x){
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

  // SIM — curl-noise flow. Velocity follows the analytic curl of three offset
  // simplex fields (divergence-free → looks like fluid without solving fluids),
  // one octave of domain warp, high viscosity, glacial time base. Per-preset
  // uniforms shape the character (laminar / cellular / funnel / radial).
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

  // RENDER (vertex) — point sprites. A slowly drifting domain-warped fBm CLOUD
  // field, multiplied by a large-scale envelope, gates each particle so the
  // substrate reads as luminous flowing clouds/jets over DOMINANT VOID. Depth
  // band (pos.z) sets sprite size for fake DoF.
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
    vec2 dr = vec2(uTime*0.010, -uTime*0.007);
    float env = smoothstep(0.32, 0.74, fbm(P.xy*0.55 + 11.0 + dr*0.4));
    float cloud = fbm(P.xy*0.95 + dr + 0.75*fbm(P.xy*0.6 + dr*0.5));
    vCloud = smoothstep(0.50, 0.74, cloud) * env;             // tighter band = defined jets
    vCloud = pow(vCloud, 1.35);                               // concentrate the cores
    float z = P.z, size;
    if(z < 0.55){ vBand = 0.0; size = 1.0; }                  // far 55% — fine sharp sand
    else if(z < 0.93){ vBand = 1.0; size = 1.7; }             // focus 38%
    else { vBand = 2.0; size = 3.0 + vSeed*3.0; }             // near 7% — small bokeh
    size *= (0.4 + vCloud*1.5);                               // grow in jet cores
    if(vSeed > 0.985) size += 1.4;                            // rare gold stars
    gl_Position = vec4(P.xy, 0.0, 1.0);
    gl_PointSize = max(size, 0.0) * uDpr;
  }`;

  // RENDER (fragment) — oxidized-metal ramp by speed (ink→bronze→gold→amber);
  // velocity drives the gold jets; cloud gates visibility; tight bright cores.
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
    if(vBand > 1.5){                                    // near: small crisp bokeh
      float disc = smoothstep(0.5, 0.24, rr);
      a = disc * 0.07;
    } else {                                            // far/focus: tight bright sand
      float fall = exp(-dot(d,d) * 10.0);
      float base = mix(0.04, 0.26, warm);
      if(vBand < 0.5) base *= 0.5;                      // far band dimmer (depth)
      a = fall * base;
    }
    a *= emis * vCloud;                                 // cloud gates visibility
    frag = vec4(col * a, a);                            // premultiplied additive
  }`;

  LUMEN.GLSL = { VERT_QUAD, FRAG_SEED, FRAG_SIM, VERT_RENDER, FRAG_RENDER };
})();
