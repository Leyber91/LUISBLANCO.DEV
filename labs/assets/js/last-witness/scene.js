/* ============================================================
   last-witness/scene.js — the picture. One WebGL canvas, three
   fragment programs:

     hole    light bent by a Schwarzschild hole, traced per pixel:
             the null-geodesic orbit equation written as
             x'' = -(3/2) rs h^2 x / r^5 (h = |x cross x'|), which
             reproduces the photon paths of the Schwarzschild metric
             exactly in the equatorial plane of each ray. A thin disk
             with Doppler and gravitational shift. The spin of the hole
             is not drawn (frame dragging is omitted) [ILLUSTRATIVE].
     flight  the sky seen from a ship at speed beta: relativistic
             aberration cos t = (cos t' - b) / (1 - b cos t') and the
             Doppler factor D = gamma (1 + b cos t') [ESTABLISHED].
     world   the planet you return to: seeded continents, ice, the
             listening line, and lights that depend on what happened.

   Performance: three render tiers (resolution scale and ray steps),
   picked from measured frame time; ?still freezes time for a frame.
   ============================================================ */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

const COMMON = `
precision highp float;
uniform vec2 u_res; uniform float u_time; uniform float u_ignite;
float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float n=i.x+i.y*57.0+i.z*113.0;
  #define H(o) fract(sin(n+o)*43758.5453)
  return mix(mix(mix(H(0.0),H(1.0),f.x),mix(H(57.0),H(58.0),f.x),f.y),mix(mix(H(113.0),H(114.0),f.x),mix(H(170.0),H(171.0),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
/* stars on a cube map: crisp, stable, no pole pinch */
float starLayer(vec3 d,float n,float thr){
  vec3 a=abs(d);vec2 uv;float face;
  if(a.x>a.y&&a.x>a.z){uv=d.yz/a.x;face=d.x>0.0?0.0:1.0;}
  else if(a.y>a.z){uv=d.xz/a.y;face=d.y>0.0?2.0:3.0;}
  else{uv=d.xy/a.z;face=d.z>0.0?4.0:5.0;}
  vec2 g=uv*n; vec2 c=floor(g); vec2 f=fract(g);
  float h=h12(c+face*71.3);
  if(h<thr) return 0.0;
  vec2 o=h22(c+face*13.7)*0.8+0.1;
  float r=length(f-o);
  float size=0.035+0.05*fract(h*91.7);
  return smoothstep(size,0.0,r)*(0.35+0.65*fract(h*17.3));
}
vec3 sky(vec3 d,float blue){
  float s=starLayer(d,90.0,0.965)*1.2+starLayer(d,240.0,0.982)*0.8+starLayer(d,36.0,0.985)*2.2;
  vec3 bn=normalize(vec3(0.25,1.0,0.35));
  float band=exp(-pow(dot(d,bn)/0.22,2.0));
  float dust=fbm(d*3.1)*band;
  vec3 ink=vec3(0.62,0.70,0.84);
  vec3 col=ink*s*(1.0+1.5*blue)+vec3(0.08,0.10,0.15)*dust*(0.8+blue);
  col+=vec3(0.010,0.013,0.020);
  return col;
}
vec3 tonemap(vec3 c){c=c/(1.0+c);return pow(c,vec3(0.9));}
`;

const HOLE = COMMON + `
uniform vec3 u_cam; uniform vec3 u_right; uniform vec3 u_up; uniform vec3 u_fwd;
uniform float u_fov; uniform float u_disk; uniform float u_blue; uniform float u_flash; uniform float u_steps; uniform float u_shift; uniform float u_home;
const float RIN=3.0; const float ROUT=7.6;
vec3 gold(float x){
  vec3 a=vec3(0.16,0.09,0.03), b=vec3(0.59,0.41,0.12), c=vec3(0.83,0.64,0.30), d=vec3(0.94,0.78,0.45), e=vec3(1.0,0.96,0.88);
  x=clamp(x,0.0,1.6);
  if(x<0.35) return mix(a,b,x/0.35);
  if(x<0.7) return mix(b,c,(x-0.35)/0.35);
  if(x<1.05) return mix(c,d,(x-0.7)/0.35);
  return mix(d,e,(x-1.05)/0.55);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/u_res.y-vec2(0.0,u_shift);
  vec3 dir=normalize(u_fwd+uv.x*u_fov*u_right+uv.y*u_fov*u_up);
  vec3 p=u_cam, v=dir;
  vec3 hv=cross(p,v); float h2=dot(hv,hv);
  vec3 acc=vec3(0.0); float alpha=0.0; bool cap=false;
  for(int i=0;i<240;i++){
    if(float(i)>=u_steps) break;
    float r=length(p);
    float dt=clamp(0.09*(r-0.85),0.012,1.6);
    vec3 a=-1.5*h2*p/pow(r,5.0);
    vec3 vn2=v+a*dt; vec3 pn=p+vn2*dt;
    if(p.y*pn.y<0.0&&u_disk>0.0){
      float t=p.y/(p.y-pn.y); vec3 hit=mix(p,pn,t); float rh=length(hit.xz);
      if(rh>RIN&&rh<ROUT){
        float ang=atan(hit.z,hit.x);
        float beta=sqrt(0.5/(rh-1.0)); float gam=1.0/sqrt(1.0-beta*beta);
        vec3 ph=normalize(vec3(-hit.z,0.0,hit.x));
        float g=sqrt(1.0-1.0/rh)/(gam*(1.0-beta*dot(ph,-normalize(vn2))));
        float temp=pow(RIN/rh,0.75)*pow(max(0.0,1.0-sqrt(RIN/rh)),0.25)*1.7;
        float swirl=fbm(vec3(rh*5.2,ang*2.0-u_time*1.8/pow(rh,1.5),rh*0.3));
        float lanes=0.35+0.65*smoothstep(0.35,0.75,fbm(vec3(rh*11.0,ang*0.7-u_time*0.9/pow(rh,1.5),2.0)));
        float I=temp*pow(g,3.0)*(0.35+0.9*swirl)*lanes;
        float edge=smoothstep(RIN,RIN+0.35,rh)*smoothstep(ROUT,ROUT-3.0,rh);
        float op=clamp(I*edge*0.5,0.0,0.85)*u_disk;
        acc+=(1.0-alpha)*gold(I*0.95)*I*edge*u_disk*0.85;
        alpha+=(1.0-alpha)*op;
      }
    }
    v=vn2; p=pn;
    if(length(p)<1.0){cap=true;break;}
    if(length(p)>70.0&&dot(p,v)>0.0) break;
  }
  vec3 col=acc;
  if(!cap){
    vec3 dv=normalize(v);
    col+=(1.0-alpha)*sky(dv,u_blue);
    // home: one star, lensed like the rest, flashing once per home century
    float hd=1.0-dot(dv,normalize(vec3(-0.55,0.22,0.8)));
    col+=(1.0-alpha)*vec3(1.0,0.88,0.62)*(0.25+2.5*u_home)*exp(-hd*9000.0);
    col+=(1.0-alpha)*vec3(0.83,0.64,0.30)*u_home*0.35*exp(-hd*300.0);
  }
  // the photon ring lives in the lensed disk; a faint flash marks the anomaly
  col+=vec3(0.95,0.78,0.45)*u_flash*0.35*exp(-dot(uv,uv)*3.0);
  float vig=smoothstep(1.35,0.25,length(uv));
  col*=mix(0.55,1.0,vig);
  col=tonemap(col*1.15)*u_ignite;
  col+=(h12(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}`;

const FLIGHT = COMMON + `
uniform vec3 u_right; uniform vec3 u_up; uniform vec3 u_fwd;
uniform float u_fov; uniform float u_beta; uniform float u_flash; uniform float u_shift;
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/u_res.y-vec2(0.0,u_shift);
  vec3 dp=normalize(vec3(uv*u_fov,1.0));          // ship frame, +z is the direction of motion
  float b=clamp(u_beta,-0.999999999,0.999999999);
  float ct=dp.z;
  float c0=(ct-b)/(1.0-b*ct);                       // aberration back to the rest frame
  float s0=sqrt(max(0.0,1.0-c0*c0));
  vec2 az=normalize(dp.xy+1e-9);
  vec3 d0=vec3(az*s0,c0);
  vec3 world=normalize(d0.x*u_right+d0.y*u_up+d0.z*u_fwd);
  float gam=1.0/sqrt(1.0-b*b);
  float D=gam*(1.0+b*ct);                           // Doppler factor
  vec3 base=sky(world,0.0);
  float bright=clamp(D*D,0.0,24.0);
  vec3 tint=mix(vec3(0.55,0.50,0.46),vec3(0.80,0.86,0.96),smoothstep(0.6,2.5,D));
  vec3 col=base*mix(1.0,bright,0.75)*tint*0.8;
  // where everything that was beside you now appears: rest-frame 90 degrees
  float t90=acos(clamp(b,-1.0,1.0));
  float th=acos(clamp(ct,-1.0,1.0));
  float ring=exp(-pow((th-t90)*u_res.y/(u_fov*1.2),2.0)*0.6);
  col+=vec3(0.55,0.62,0.74)*ring*0.10*step(0.02,abs(b));
  col+=vec3(0.95,0.78,0.45)*u_flash*0.3*exp(-dot(uv,uv)*4.0);
  col*=mix(0.6,1.0,smoothstep(1.3,0.2,length(uv)));
  col=tonemap(col)*u_ignite;
  col+=(h12(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}`;

const WORLD = COMMON + `
uniform vec2 u_center; uniform float u_radius; uniform float u_rot; uniform float u_tilt; uniform vec3 u_sun;
uniform vec2 u_seed; uniform float u_ocean; uniform float u_ice; uniform float u_lights; uniform float u_lineOn;
uniform vec4 u_line; uniform vec2 u_station; uniform vec2 u_mark; uniform float u_markOn; uniform float u_reveal;
uniform float u_pulse; uniform float u_glow;
vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
vec3 rotX(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}
vec3 ll(vec2 l){return vec3(cos(l.x)*cos(l.y),sin(l.x),cos(l.x)*sin(l.y));}
void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 q=(px-u_center)/u_radius; float rr=dot(q,q);
  vec2 uv=(px-0.5*u_res)/u_res.y;
  vec3 col=sky(normalize(vec3(uv*0.9,1.0)),0.0)*0.8;
  vec3 sunV=normalize(u_sun);
  if(rr<1.0){
    vec3 n=vec3(q,sqrt(1.0-rr));
    vec3 pl=rotY(rotX(n,-u_tilt),-u_rot);
    float lat=asin(clamp(pl.y,-1.0,1.0));
    vec3 sp=pl*2.1+vec3(u_seed,0.0)*0.37;
    float hgt=fbm(sp)+0.32*fbm(pl*7.0+vec3(u_seed.yx,3.0));
    float thr=mix(0.62,0.78,u_ocean);
    float land=smoothstep(thr-0.01,thr+0.01,hgt);
    float iceN=fbm(pl*5.0+7.0)*0.18;
    float ice=smoothstep(u_ice-0.04,u_ice+0.02,abs(lat)+iceN-0.05);
    float day=dot(n,sunV);
    float lit=smoothstep(-0.08,0.35,day);
    vec3 ocean=vec3(0.012,0.018,0.030);
    vec3 ground=mix(vec3(0.050,0.056,0.064),vec3(0.085,0.090,0.098),fbm(pl*16.0));
    vec3 alb=mix(ocean,ground,land);
    alb=mix(alb,vec3(0.50,0.55,0.62),ice);
    float spec=pow(max(0.0,dot(reflect(-sunV,n),vec3(0,0,1))),40.0)*(1.0-land)*(1.0-ice)*0.6;
    vec3 c=alb*(lit*1.25+0.06)+vec3(0.6,0.68,0.8)*spec*lit+vec3(0.010,0.013,0.020)*(1.0-lit);
    // lights on the night side; their pattern depends on what happened
    float night=1.0-smoothstep(-0.1,0.12,day);
    vec2 cell=floor(vec2(atan(pl.z,pl.x)*60.0,lat*60.0));
    float city=step(0.93,h12(cell+u_seed))*land*(1.0-ice)*smoothstep(0.55,0.75,fbm(pl*3.0+11.0));
    float breathe=0.55+0.45*sin(u_time*0.21+h12(cell)*6.28);
    c+=vec3(0.83,0.64,0.30)*city*night*u_lights*breathe*0.9;
    // the listening line: a great-circle segment
    vec3 A=ll(u_line.xy);
    vec3 east=normalize(cross(vec3(0.0,1.0,0.0),A));
    vec3 north=cross(A,east);
    vec3 dirA=cos(u_line.z)*north+sin(u_line.z)*east;
    vec3 N=normalize(cross(A,dirA));
    float dist=abs(asin(clamp(dot(pl,N),-1.0,1.0)));
    float along=atan(dot(pl,dirA),dot(pl,A));
    float seg=smoothstep(-0.004,0.004,along)*smoothstep(u_line.w+0.004,u_line.w-0.004,along);
    float w=1.4/u_radius;
    float line=exp(-pow(dist/w,2.0))*seg;
    float travel=0.6+0.4*smoothstep(0.0,0.08,abs(fract(along/max(u_line.w,0.01)-u_time*0.05)-0.5));
    c+=vec3(0.94,0.78,0.45)*line*u_lineOn*(0.7+0.6*night)*travel;
    c+=vec3(0.83,0.64,0.30)*exp(-pow(dist/(w*7.0),2.0))*seg*u_lineOn*0.10;
    // the station: one warm point at the line's root
    float sd=acos(clamp(dot(pl,ll(u_station)),-1.0,1.0));
    c+=vec3(1.0,0.86,0.55)*exp(-pow(sd*u_radius/3.2,2.0))*(1.0+0.8*u_pulse);
    c+=vec3(0.83,0.64,0.30)*exp(-pow(sd*u_radius/18.0,2.0))*0.22*(0.5+0.5*u_pulse);
    // the fate's own mark (shafts, a launch rail)
    float md=acos(clamp(dot(pl,ll(u_mark)),-1.0,1.0));
    float ringM=exp(-pow((md*u_radius-9.0)/1.1,2.0))+exp(-pow(md*u_radius/1.6,2.0))*0.5;
    c+=vec3(0.62,0.70,0.84)*ringM*u_markOn*0.55;
    // limb and atmosphere
    float rim=pow(1.0-n.z,2.6);
    c+=vec3(0.36,0.44,0.62)*rim*(0.12+0.9*smoothstep(-0.3,0.6,day));
    c*=u_glow;
    col=mix(col,c,smoothstep(1.0,0.995,rr));
  }
  float halo=exp(-(sqrt(rr)-1.0)*14.0)*step(1.0,rr);
  float hs=smoothstep(-0.6,0.8,dot(normalize(vec3(q,0.0)+1e-5),vec3(sunV.xy,0.0)));
  col+=vec3(0.30,0.38,0.56)*halo*(0.15+0.6*hs)*u_glow;
  col*=mix(0.55,1.0,smoothstep(1.45,0.3,length(uv)));
  col=tonemap(col*1.2)*u_reveal;
  col+=(h12(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}`;

const TIERS = [
  { scale: 0.5, steps: 80 },
  { scale: 0.75, steps: 140 },
  { scale: 1.0, steps: 200 },
];

export class Scene {
  constructor(canvas, { still = false } = {}) {
    this.canvas = canvas;
    this.still = still;
    const opts = { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    this.gl = gl;
    this.ok = !!gl;
    this.mode = 'hole';
    this.u = {};                       // current uniform values, set by the view
    this.tier = 1;
    this.frames = [];
    this.t0 = performance.now();
    this.fps = 0;
    if (!gl) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.progs = { hole: this._prog(HOLE), flight: this._prog(FLIGHT), world: this._prog(WORLD) };
    this.ok = Object.values(this.progs).every(Boolean);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  _prog(src) {
    const gl = this.gl;
    const mk = (type, s) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn('[last-witness] shader:', gl.getShaderInfoLog(sh)); return null; }
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, src);
    if (!vs || !fs) return null;
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[last-witness] link:', gl.getProgramInfoLog(p)); return null; }
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); loc[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, loc, attr: gl.getAttribLocation(p, 'p') };
  }

  dpr() { return Math.min(window.devicePixelRatio || 1, 1.5) * TIERS[this.tier].scale; }

  resize() {
    if (!this.gl) return;
    const d = this.dpr();
    const w = Math.max(2, Math.floor(innerWidth * d)), h = Math.max(2, Math.floor(innerHeight * d));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }

  setTier(t) { const n = Math.max(0, Math.min(2, t)); if (n !== this.tier) { this.tier = n; this.resize(); } }

  /* Frame-time governor: after a warm-up, step the tier down when frames
     run long and up when there is room. */
  _govern(dt) {
    if (this.still) return;
    this.frames.push(dt);
    if (this.frames.length < 40) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.medianMs = this.frames.slice().sort((a, b) => a - b)[this.frames.length >> 1];
    this.fps = Math.round(1000 / avg);
    this.frames.length = 0;
    if (this.lockTier) { this.frames.length = 0; return; }
    if (avg > 26 && this.tier > 0) this.setTier(this.tier - 1);
    else if (avg < 12 && this.tier < 2) this.setTier(this.tier + 1);
  }

  render(timeS, dt = 16) {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    this._govern(dt);
    const prog = this.progs[this.mode];
    gl.useProgram(prog.p);
    gl.enableVertexAttribArray(prog.attr);
    gl.vertexAttribPointer(prog.attr, 2, gl.FLOAT, false, 0, 0);
    const L = prog.loc, u = this.u;
    const f1 = (k, v) => { if (L[k] != null) gl.uniform1f(L[k], v); };
    const f2 = (k, a, b) => { if (L[k] != null) gl.uniform2f(L[k], a, b); };
    const f3 = (k, v) => { if (L[k] != null && v) gl.uniform3f(L[k], v[0], v[1], v[2]); };
    const f4 = (k, v) => { if (L[k] != null && v) gl.uniform4f(L[k], v[0], v[1], v[2], v[3]); };
    f2('u_res', this.canvas.width, this.canvas.height);
    f1('u_time', timeS);
    f1('u_ignite', u.ignite ?? 1);
    f1('u_steps', TIERS[this.tier].steps);
    f1('u_fov', u.fov ?? 0.9);
    f1('u_flash', u.flash ?? 0);
    f1('u_shift', u.shift ?? 0);
    if (this.mode === 'hole') {
      f3('u_cam', u.cam); f3('u_right', u.right); f3('u_up', u.up); f3('u_fwd', u.fwd);
      f1('u_disk', u.disk ?? 1); f1('u_blue', u.blue ?? 0); f1('u_home', u.home ?? 0);
    } else if (this.mode === 'flight') {
      f3('u_right', u.right); f3('u_up', u.up); f3('u_fwd', u.fwd);
      f1('u_beta', u.beta ?? 0);
    } else {
      const d = this.canvas.width / innerWidth;
      f2('u_center', (u.cx ?? innerWidth / 2) * d, (innerHeight - (u.cy ?? innerHeight / 2)) * d);
      f1('u_radius', (u.radius ?? 200) * d);
      f1('u_rot', u.rot ?? 0); f1('u_tilt', u.tilt ?? 0.3);
      f3('u_sun', u.sun || [0.8, 0.3, -0.5]);
      f2('u_seed', u.seedX ?? 0, u.seedY ?? 0);
      f1('u_ocean', u.ocean ?? 0.6); f1('u_ice', u.ice ?? 1.0);
      f1('u_lights', u.lights ?? 0); f1('u_lineOn', u.lineOn ?? 1);
      f4('u_line', u.line || [0, 0, 1, 0.3]);
      f2('u_station', ...(u.station || [0, 0])); f2('u_mark', ...(u.mark || [0, 0]));
      f1('u_markOn', u.markOn ?? 0); f1('u_reveal', u.reveal ?? 1);
      f1('u_pulse', u.pulse ?? 0); f1('u_glow', u.glow ?? 1);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* Camera basis looking from position `cam` at the origin. */
export function lookAt(cam, upHint = [0, 1, 0]) {
  const n = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = n(cam.map((x) => -x));
  const right = n(cross(fwd, upHint));
  const up = cross(right, fwd);
  return { fwd, right, up };
}

/* Camera basis looking along a direction. */
export function lookAlong(fwdIn, upHint = [0, 1, 0]) {
  const n = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = n(fwdIn);
  const right = n(cross(fwd, upHint));
  const up = cross(right, fwd);
  return { fwd, right, up };
}

/* The same rotation the world shader uses, for placing labels. */
export function projectLatLon(latDeg, lonDeg, { rot, tilt, cx, cy, radius }) {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  let v = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
  const c1 = Math.cos(rot), s1 = Math.sin(rot);
  v = [c1 * v[0] + s1 * v[2], v[1], -s1 * v[0] + c1 * v[2]];
  const c2 = Math.cos(tilt), s2 = Math.sin(tilt);
  v = [v[0], c2 * v[1] - s2 * v[2], s2 * v[1] + c2 * v[2]];
  return { x: cx + radius * v[0], y: cy - radius * v[1], visible: v[2] > 0.08, z: v[2] };
}
